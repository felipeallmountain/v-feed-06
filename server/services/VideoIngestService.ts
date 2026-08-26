import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { YouTubeDataService, type YouTubeVideoMeta } from './YouTubeDataService.js';

export interface IngestedVideo {
  id: string;
  title: string;
  description?: string;
  channelTitle: string;
  durationSec: number;
  durationFormatted: string;
  thumbnail: string;
  filename: string;
  filePath: string;
  fileSize: number;
  downloadedAt: string;
  source: 'youtube' | 'local';
}

export interface IngestManifest {
  version: string;
  lastUpdated: string;
  videos: IngestedVideo[];
}

export interface ActiveDownloadStatus {
  id: string;
  title: string;
  progressPercent: number;
  speed: string;
  eta: string;
}

export interface IngestStatus {
  isIngesting: boolean;
  activeDownload: ActiveDownloadStatus | null;
  queueLength: number;
  completedInBatch: number;
  totalInBatch: number;
  readyCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export class VideoIngestService {
  private fallbackDir: string;
  private manifestPath: string;
  private youtube: YouTubeDataService;
  private isProcessingQueue = false;
  private queue: YouTubeVideoMeta[] = [];
  private activeDownload: ActiveDownloadStatus | null = null;
  private completedInBatch = 0;
  private totalInBatch = 0;
  private lastSyncedAt: string | null = null;
  private lastError: string | null = null;

  constructor(fallbackDir: string, youtubeService?: YouTubeDataService) {
    this.fallbackDir = fallbackDir;
    this.manifestPath = path.join(fallbackDir, 'manifest.json');
    this.youtube = youtubeService || new YouTubeDataService();
    fs.mkdirSync(this.fallbackDir, { recursive: true });
    this.cleanAndRebuildManifest();
  }

  /**
   * Get current live status of the ingestion pipeline.
   */
  getStatus(): IngestStatus {
    const readyVideos = this.getReadyVideos();
    return {
      isIngesting: this.isProcessingQueue,
      activeDownload: this.activeDownload,
      queueLength: this.queue.length,
      completedInBatch: this.completedInBatch,
      totalInBatch: this.totalInBatch,
      readyCount: readyVideos.length,
      lastSyncedAt: this.lastSyncedAt,
      lastError: this.lastError,
    };
  }

  /**
   * Reads manifest from disk, filtering out files that no longer exist.
   */
  private loadManifest(): IngestManifest {
    try {
      if (fs.existsSync(this.manifestPath)) {
        const raw = fs.readFileSync(this.manifestPath, 'utf8');
        const parsed = JSON.parse(raw) as IngestManifest;
        if (Array.isArray(parsed.videos)) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn('[v-feed] Failed to parse manifest.json, rebuilding:', err);
    }
    return {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      videos: [],
    };
  }

  /**
   * Saves manifest to disk.
   */
  private saveManifest(manifest: IngestManifest): void {
    try {
      manifest.lastUpdated = new Date().toISOString();
      fs.writeFileSync(this.manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    } catch (err) {
      console.error('[v-feed] Failed to write manifest.json:', err);
    }
  }

  /**
   * Synchronizes files on disk with the manifest.
   */
  cleanAndRebuildManifest(): void {
    const manifest = this.loadManifest();
    const manifestMap = new Map<string, IngestedVideo>(
      manifest.videos.map((v) => [v.filename, v]),
    );

    const files = fs.readdirSync(this.fallbackDir);
    const validExtensions = new Set(['.mp4', '.webm', '.mov', '.mkv']);
    const updatedVideos: IngestedVideo[] = [];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!validExtensions.has(ext)) continue;
      const fullPath = path.join(this.fallbackDir, file);
      const stat = fs.statSync(fullPath);

      let existing = manifestMap.get(file);
      if (!existing) {
        // Create entry for local video or unindexed video
        const isYt = file.startsWith('yt_');
        const id = isYt ? file.replace(/^yt_/, '').replace(/\.[^.]+$/, '') : file;
        existing = {
          id,
          title: path.parse(file).name.replace(/^yt_/, ''),
          channelTitle: isYt ? 'YouTube' : 'Local Archive',
          durationSec: 0,
          durationFormatted: '0:00',
          thumbnail: isYt ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '',
          filename: file,
          filePath: fullPath,
          fileSize: stat.size,
          downloadedAt: new Date(stat.mtime).toISOString(),
          source: isYt ? 'youtube' : 'local',
        };
      } else {
        existing.filePath = fullPath;
        existing.fileSize = stat.size;
      }
      updatedVideos.push(existing);
    }

    manifest.videos = updatedVideos;
    this.saveManifest(manifest);
  }

  /**
   * List all ready and cached videos (with disk verification).
   */
  getReadyVideos(): IngestedVideo[] {
    const manifest = this.loadManifest();
    return manifest.videos.filter((v) => {
      const p = path.join(this.fallbackDir, v.filename);
      return fs.existsSync(p) && fs.statSync(p).size > 1024;
    });
  }

  /**
   * Check if a specific YouTube video ID is already downloaded and present on disk.
   */
  hasVideo(videoId: string): boolean {
    const manifest = this.loadManifest();
    const found = manifest.videos.find((v) => v.id === videoId);
    if (!found) return false;
    const p = path.join(this.fallbackDir, found.filename);
    return fs.existsSync(p) && fs.statSync(p).size > 1024;
  }

  /**
   * Triggers a sync by fetching candidates from YouTube and downloading missing ones.
   */
  async sync(options?: {
    playlistId?: string;
    searchTopic?: string;
    maxVideos?: number;
  }): Promise<{ queued: number; alreadyCached: number; totalFound: number }> {
    if (!this.youtube.isConfigured) {
      throw new Error('YouTube API is not configured. Set YOUTUBE_API_KEY in .env');
    }

    const playlistId = options?.playlistId || process.env.YOUTUBE_PLAYLIST_ID;
    const searchTopic =
      options?.searchTopic ||
      process.env.YOUTUBE_SEARCH_QUERY ||
      'vertical synthwave retro shorts #shorts';
    const maxVideos = options?.maxVideos || Number(process.env.YOUTUBE_MAX_VIDEOS || 10);

    let candidates: YouTubeVideoMeta[] = [];

    if (playlistId && playlistId.trim().length > 0) {
      console.log(`[v-feed] Fetching YouTube playlist: ${playlistId}`);
      candidates = await this.youtube.fetchPlaylistItems(playlistId, maxVideos);
    } else {
      console.log(`[v-feed] Searching YouTube shorts for query: "${searchTopic}"`);
      candidates = await this.youtube.searchShorts(searchTopic, maxVideos);
    }

    let alreadyCached = 0;
    const toQueue: YouTubeVideoMeta[] = [];

    for (const video of candidates) {
      if (this.hasVideo(video.id)) {
        alreadyCached++;
      } else {
        // Avoid duplicate entries in current queue
        if (!this.queue.some((q) => q.id === video.id)) {
          toQueue.push(video);
        }
      }
    }

    if (toQueue.length > 0) {
      this.queue.push(...toQueue);
      this.totalInBatch += toQueue.length;
      void this.processQueue();
    }

    this.lastSyncedAt = new Date().toISOString();
    return {
      queued: toQueue.length,
      alreadyCached,
      totalFound: candidates.length,
    };
  }

  /**
   * Ingests a single video by URL or ID.
   */
  async ingestSingleVideo(videoIdOrUrl: string): Promise<IngestedVideo> {
    const videoId = extractYouTubeVideoId(videoIdOrUrl);
    if (!videoId) {
      throw new Error(`Invalid YouTube video ID or URL: ${videoIdOrUrl}`);
    }

    if (this.hasVideo(videoId)) {
      const existing = this.getReadyVideos().find((v) => v.id === videoId);
      if (existing) return existing;
    }

    let meta: YouTubeVideoMeta | null = null;
    if (this.youtube.isConfigured) {
      const details = await this.youtube.getVideoDetails([videoId]);
      const item = details.get(videoId);
      if (item) {
        meta = {
          id: videoId,
          title: item.title,
          description: item.description,
          channelTitle: item.channelTitle,
          durationSec: item.durationSec,
          durationFormatted: item.durationFormatted,
          thumbnail: item.thumbnail,
          publishedAt: item.publishedAt,
          url: `https://www.youtube.com/watch?v=${videoId}`,
        };
      }
    }

    if (!meta) {
      meta = {
        id: videoId,
        title: `YouTube Video (${videoId})`,
        description: '',
        channelTitle: 'YouTube',
        durationSec: 0,
        durationFormatted: '0:00',
        thumbnail: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        publishedAt: new Date().toISOString(),
        url: `https://www.youtube.com/watch?v=${videoId}`,
      };
    }

    // High-priority single video: push to front of queue or download directly
    return await this.downloadVideoItem(meta);
  }

  /**
   * Deletes a cached video file and its manifest entry.
   */
  deleteVideo(id: string): boolean {
    const manifest = this.loadManifest();
    const index = manifest.videos.findIndex((v) => v.id === id || v.filename === id);
    if (index === -1) return false;

    const video = manifest.videos[index];
    const fullPath = path.join(this.fallbackDir, video.filename);
    if (fs.existsSync(fullPath)) {
      try {
        fs.unlinkSync(fullPath);
      } catch (err) {
        console.warn(`[v-feed] Failed to unlink ${fullPath}:`, err);
      }
    }

    manifest.videos.splice(index, 1);
    this.saveManifest(manifest);
    return true;
  }

  /**
   * Queue processor executing sequential downloads via yt-dlp.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      if (this.hasVideo(item.id)) {
        this.completedInBatch++;
        continue;
      }

      try {
        await this.downloadVideoItem(item);
        this.completedInBatch++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.lastError = `Failed to download ${item.id} (${item.title}): ${msg}`;
        console.error(`[v-feed] Download error for ${item.id}:`, err);
      }
    }

    this.isProcessingQueue = false;
    this.activeDownload = null;
    if (this.queue.length === 0) {
      this.totalInBatch = 0;
      this.completedInBatch = 0;
    }
  }

  /**
   * Executes yt-dlp to download and transcode video into MP4 format.
   */
  private async downloadVideoItem(meta: YouTubeVideoMeta): Promise<IngestedVideo> {
    const filename = `yt_${meta.id}.mp4`;
    const targetPath = path.join(this.fallbackDir, filename);
    const tempTarget = path.join(this.fallbackDir, `temp_${meta.id}.%(ext)s`);

    this.activeDownload = {
      id: meta.id,
      title: meta.title,
      progressPercent: 0,
      speed: 'Starting...',
      eta: '--:--',
    };

    console.log(`[v-feed] Ingesting YouTube video: ${meta.title} (${meta.id})`);

    await new Promise<void>((resolve, reject) => {
      // yt-dlp options: format selection prioritizing MP4 up to 1080x1920 vertical format
      const args = [
        '-f',
        'bv*[ext=mp4][height<=1920]+ba[ext=m4a]/b[ext=mp4][height<=1920]/best[height<=1920]/best',
        '--merge-output-format',
        'mp4',
        '--no-playlist',
        '--newline',
        '--no-mtime',
        '--extractor-args',
        'youtube:player_client=mweb,android,web',
        '-o',
        tempTarget,
        `https://www.youtube.com/watch?v=${meta.id}`,
      ];

      const child = spawn('yt-dlp', args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        // Parse progress e.g. "[download]  45.2% of   12.34MiB at    3.45MiB/s ETA 00:02"
        const progressMatch = text.match(/\[download\]\s+([\d.]+)%\s+of\s+([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/);
        if (progressMatch && this.activeDownload) {
          this.activeDownload.progressPercent = parseFloat(progressMatch[1]);
          this.activeDownload.speed = progressMatch[3];
          this.activeDownload.eta = progressMatch[4];
        }
      });

      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        if (text.includes('ERROR:')) {
          console.warn(`[v-feed yt-dlp] ${text.trim()}`);
        }
      });

      child.on('close', (code) => {
        if (code === 0) {
          // Resolve temp file name
          const finalTempMp4 = path.join(this.fallbackDir, `temp_${meta.id}.mp4`);
          if (fs.existsSync(finalTempMp4)) {
            if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
            fs.renameSync(finalTempMp4, targetPath);
            resolve();
          } else {
            // Check if any matching temp file was produced
            const files = fs.readdirSync(this.fallbackDir);
            const matching = files.find((f) => f.startsWith(`temp_${meta.id}.`));
            if (matching) {
              const src = path.join(this.fallbackDir, matching);
              if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
              fs.renameSync(src, targetPath);
              resolve();
            } else {
              reject(new Error(`Output file for ${meta.id} not found after download`));
            }
          }
        } else {
          reject(new Error(`yt-dlp exited with code ${code}`));
        }
      });

      child.on('error', (err) => {
        reject(err);
      });
    });

    const stat = fs.statSync(targetPath);
    const ingested: IngestedVideo = {
      id: meta.id,
      title: meta.title,
      description: meta.description,
      channelTitle: meta.channelTitle,
      durationSec: meta.durationSec,
      durationFormatted: meta.durationFormatted,
      thumbnail: meta.thumbnail,
      filename,
      filePath: targetPath,
      fileSize: stat.size,
      downloadedAt: new Date().toISOString(),
      source: 'youtube',
    };

    const manifest = this.loadManifest();
    manifest.videos = manifest.videos.filter((v) => v.id !== meta.id && v.filename !== filename);
    manifest.videos.unshift(ingested);
    this.saveManifest(manifest);

    this.activeDownload = null;
    return ingested;
  }
}

/**
 * Extracts a 11-character YouTube video ID from various URL formats or raw string.
 */
export function extractYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  const urlMatch = trimmed.match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|shorts\/|watch\?.+&v=))([\w-]{11})/,
  );
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  return null;
}
