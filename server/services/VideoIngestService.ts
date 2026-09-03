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

export interface ReplenishmentStatus {
  enabled: boolean;
  lowWatermarkVideos: number;
  currentVideos: number;
  isBelowWatermark: boolean;
  lastReplenishedAt: string | null;
  cooldownMinutes: number;
  cooldownRemainingSec: number;
  isEligible: boolean;
  trickleHours: number;
}

export interface StorageStatus {
  totalBytes: number;
  totalFormatted: string;
  maxBytes: number;
  maxMb: number;
  usagePercent: number;
  videoCount: number;
  maxVideos: number;
  orphanedFilesCount: number;
  orphanedBytes: number;
  orphanedFormatted: string;
  freeDiskBytes: number;
  freeDiskFormatted: string;
  isStorageLimited: boolean;
  replenishment?: ReplenishmentStatus;
}

export interface CleanTempResult {
  cleanedFiles: string[];
  reclaimedBytes: number;
  reclaimedFormatted: string;
}

export interface PrunedVideoItem {
  id: string;
  title: string;
  filename: string;
  size: number;
  sizeFormatted: string;
}

export interface PruneResult {
  prunedVideos: PrunedVideoItem[];
  reclaimedBytes: number;
  reclaimedFormatted: string;
  remainingBytes: number;
  remainingFormatted: string;
  tempCleaned: CleanTempResult;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
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
  storage?: StorageStatus;
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
  private lastReplenishedAt = 0;
  private trickleTimer: NodeJS.Timeout | null = null;

  constructor(fallbackDir: string, youtubeService?: YouTubeDataService) {
    this.fallbackDir = fallbackDir;
    this.manifestPath = path.join(fallbackDir, 'manifest.json');
    this.youtube = youtubeService || new YouTubeDataService();
    fs.mkdirSync(this.fallbackDir, { recursive: true });
    this.cleanTempFiles();
    this.cleanAndRebuildManifest();
    this.checkAndPruneIfNeeded(0);
    this.startTrickleScheduler();
  }

  getYouTubeService(): YouTubeDataService {
    return this.youtube;
  }

  /**
   * Get current live status of the ingestion pipeline and disk storage.
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
      storage: this.getStorageUsage(),
    };
  }

  /**
   * Calculates exact disk usage and host filesystem space for fallback videos.
   */
  getStorageUsage(): StorageStatus {
    let totalBytes = 0;
    let orphanedBytes = 0;
    let orphanedFilesCount = 0;

    try {
      const files = fs.readdirSync(this.fallbackDir);
      for (const file of files) {
        try {
          const fullPath = path.join(this.fallbackDir, file);
          const stat = fs.statSync(fullPath);
          if (stat.isFile()) {
            totalBytes += stat.size;
            // Check if file is temporary or orphaned partial download
            if (
              file.startsWith('temp_') ||
              file.endsWith('.part') ||
              file.endsWith('.ytdl') ||
              file.endsWith('.tmp')
            ) {
              orphanedBytes += stat.size;
              orphanedFilesCount++;
            }
          }
        } catch {
          /* ignore stat errors for single files */
        }
      }
    } catch {
      /* ignore readdir errors */
    }

    const readyVideos = this.getReadyVideos();
    const maxMb = Number(process.env.FALLBACK_MAX_STORAGE_MB || 500);
    const maxBytes = maxMb * 1024 * 1024;
    const maxVideos = Number(process.env.FALLBACK_MAX_VIDEOS || 60);
    const usagePercent = Math.min(100, Math.round((totalBytes / maxBytes) * 1000) / 10);

    let freeDiskBytes = 0;
    try {
      if (typeof (fs as unknown as { statfsSync?: (p: string) => { bfree: number; bsize: number } }).statfsSync === 'function') {
        const statfs = (fs as unknown as { statfsSync: (p: string) => { bfree: number; bsize: number } }).statfsSync(this.fallbackDir);
        freeDiskBytes = statfs.bfree * statfs.bsize;
      }
    } catch {
      /* statfs not supported on this platform */
    }

    return {
      totalBytes,
      totalFormatted: formatBytes(totalBytes),
      maxBytes,
      maxMb,
      usagePercent,
      videoCount: readyVideos.length,
      maxVideos,
      orphanedFilesCount,
      orphanedBytes,
      orphanedFormatted: formatBytes(orphanedBytes),
      freeDiskBytes,
      freeDiskFormatted: formatBytes(freeDiskBytes),
      isStorageLimited: totalBytes >= maxBytes || readyVideos.length >= maxVideos,
      replenishment: this.getReplenishmentStatus(),
    };
  }

  /**
   * Cleans up orphaned or incomplete downloads (*.part, temp_*).
   */
  cleanTempFiles(): CleanTempResult {
    const cleanedFiles: string[] = [];
    let reclaimedBytes = 0;

    try {
      const files = fs.readdirSync(this.fallbackDir);
      const activeId = this.activeDownload?.id;

      for (const file of files) {
        const isTemp =
          file.startsWith('temp_') ||
          file.endsWith('.part') ||
          file.endsWith('.ytdl') ||
          file.endsWith('.tmp');

        if (!isTemp) continue;

        // Skip files belonging to the actively running download
        if (activeId && file.includes(activeId)) continue;

        const fullPath = path.join(this.fallbackDir, file);
        try {
          const stat = fs.statSync(fullPath);
          fs.unlinkSync(fullPath);
          cleanedFiles.push(file);
          reclaimedBytes += stat.size;
        } catch (err) {
          console.warn(`[v-feed storage] Failed to unlink temp file ${file}:`, err);
        }
      }
    } catch (err) {
      console.warn('[v-feed storage] Failed to scan directory for temp files:', err);
    }

    if (cleanedFiles.length > 0) {
      console.log(
        `[v-feed storage] Cleaned ${cleanedFiles.length} temporary file(s), reclaimed ${formatBytes(reclaimedBytes)}`,
      );
    }

    return {
      cleanedFiles,
      reclaimedBytes,
      reclaimedFormatted: formatBytes(reclaimedBytes),
    };
  }

  /**
   * Prunes videos when exceeding disk storage or video count caps.
   * Evicts oldest downloaded YouTube videos first (FIFO/LRU) while preserving local videos.
   */
  pruneStorage(options?: {
    targetMaxBytes?: number;
    maxVideos?: number;
    force?: boolean;
  }): PruneResult {
    const tempCleaned = this.cleanTempFiles();

    const maxMb = Number(process.env.FALLBACK_MAX_STORAGE_MB || 500);
    const configuredMaxBytes = maxMb * 1024 * 1024;
    const maxBytes = options?.targetMaxBytes ?? configuredMaxBytes;
    const maxVideos = options?.maxVideos ?? Number(process.env.FALLBACK_MAX_VIDEOS || 60);

    const pruneThresholdRatio = Number(process.env.FALLBACK_PRUNE_THRESHOLD_RATIO || 0.80);
    const targetBytes = Math.floor(maxBytes * pruneThresholdRatio);
    const targetVideos = Math.floor(maxVideos * pruneThresholdRatio);
    const protectLocal = process.env.FALLBACK_PROTECT_LOCAL !== 'false';

    const manifest = this.loadManifest();
    const currentUsage = this.getStorageUsage();

    const needsPruning =
      options?.force ||
      currentUsage.totalBytes > maxBytes ||
      manifest.videos.length > maxVideos;

    const prunedVideos: PrunedVideoItem[] = [];
    let reclaimedBytes = tempCleaned.reclaimedBytes;

    if (needsPruning) {
      // Prioritize candidates: protect local archives, evict oldest downloaded YouTube videos
      const candidates = manifest.videos
        .filter((v) => !protectLocal || v.source === 'youtube')
        .sort((a, b) => {
          const timeA = a.downloadedAt ? new Date(a.downloadedAt).getTime() : 0;
          const timeB = b.downloadedAt ? new Date(b.downloadedAt).getTime() : 0;
          return timeA - timeB;
        });

      for (const video of candidates) {
        const remainingEstimatedBytes = currentUsage.totalBytes - (reclaimedBytes - tempCleaned.reclaimedBytes);
        const remainingEstimatedCount = manifest.videos.length - prunedVideos.length;

        if (remainingEstimatedBytes <= targetBytes && remainingEstimatedCount <= targetVideos) {
          break;
        }

        const fullPath = path.join(this.fallbackDir, video.filename);
        let fileSize = video.fileSize || 0;

        if (fs.existsSync(fullPath)) {
          try {
            const stat = fs.statSync(fullPath);
            fileSize = stat.size;
            fs.unlinkSync(fullPath);
          } catch (err) {
            console.warn(`[v-feed storage] Failed to unlink video file ${video.filename}:`, err);
          }
        }

        reclaimedBytes += fileSize;
        prunedVideos.push({
          id: video.id,
          title: video.title,
          filename: video.filename,
          size: fileSize,
          sizeFormatted: formatBytes(fileSize),
        });
      }

      if (prunedVideos.length > 0) {
        const prunedIds = new Set(prunedVideos.map((p) => p.id));
        manifest.videos = manifest.videos.filter((v) => !prunedIds.has(v.id));
        this.saveManifest(manifest);
        console.log(
          `[v-feed storage] Pruned ${prunedVideos.length} video(s), reclaimed ${formatBytes(reclaimedBytes)}`,
        );
      }
    }

    const remainingBytes = Math.max(0, currentUsage.totalBytes - reclaimedBytes);
    return {
      prunedVideos,
      reclaimedBytes,
      reclaimedFormatted: formatBytes(reclaimedBytes),
      remainingBytes,
      remainingFormatted: formatBytes(remainingBytes),
      tempCleaned,
    };
  }

  /**
   * Helper check to prune storage if adding estimated bytes would exceed limit.
   */
  checkAndPruneIfNeeded(estimatedIncomingBytes = 15 * 1024 * 1024): PruneResult | null {
    const storage = this.getStorageUsage();
    if (
      storage.totalBytes + estimatedIncomingBytes > storage.maxBytes ||
      storage.videoCount >= storage.maxVideos
    ) {
      console.log(
        `[v-feed storage] Storage threshold reached: ${storage.totalFormatted} / ${formatBytes(storage.maxBytes)} (${storage.videoCount}/${storage.maxVideos} videos). Pruning oldest videos...`,
      );
      return this.pruneStorage();
    }
    return null;
  }

  /**
   * Evaluates current buffer capacity against low watermark and rate limits.
   */
  getReplenishmentStatus(): ReplenishmentStatus {
    const readyVideos = this.getReadyVideos();
    const enabled = process.env.FALLBACK_AUTO_REPLENISH !== 'false';
    const lowWatermarkVideos = Number(process.env.FALLBACK_MIN_REPLENISH_VIDEOS || 20);
    const cooldownMinutes = Number(process.env.FALLBACK_REPLENISH_COOLDOWN_MINUTES || 30);
    const trickleHours = Number(process.env.FALLBACK_TRICKLE_HOURS || 3);

    const isBelowWatermark = readyVideos.length < lowWatermarkVideos;
    const elapsedSec = Math.floor((Date.now() - this.lastReplenishedAt) / 1000);
    const cooldownSec = cooldownMinutes * 60;
    const cooldownRemainingSec = this.lastReplenishedAt > 0 ? Math.max(0, cooldownSec - elapsedSec) : 0;

    const quotaStatus = this.youtube.getQuotaStatus();
    const quotaOk = !quotaStatus.isProtectedMode && quotaStatus.percentage < 85;
    const isEligible = enabled && !this.isProcessingQueue && quotaOk && cooldownRemainingSec === 0;

    return {
      enabled,
      lowWatermarkVideos,
      currentVideos: readyVideos.length,
      isBelowWatermark,
      lastReplenishedAt: this.lastReplenishedAt > 0 ? new Date(this.lastReplenishedAt).toISOString() : null,
      cooldownMinutes,
      cooldownRemainingSec,
      isEligible,
      trickleHours,
    };
  }

  /**
   * Safe replenishment handler with low-watermark triggers, quota protection, and cooldown circuit breakers.
   */
  async checkAndReplenishIfNeeded(
    reason: 'watermark' | 'manual_deletion' | 'trickle' | 'api' = 'watermark',
    force = false,
  ): Promise<{
    triggered: boolean;
    reason: string;
    details?: { queued: number; alreadyCached: number; totalFound: number };
    message: string;
  }> {
    const status = this.getReplenishmentStatus();

    if (!status.enabled && !force) {
      return { triggered: false, reason, message: 'Auto-replenishment is disabled in settings.' };
    }

    if (this.isProcessingQueue && !force) {
      return { triggered: false, reason, message: 'Ingestion pipeline is currently active.' };
    }

    const quotaStatus = this.youtube.getQuotaStatus();
    if (quotaStatus.isProtectedMode || quotaStatus.percentage >= 90) {
      return { triggered: false, reason, message: 'YouTube QuotaGuard is in protected mode. Replenishment blocked.' };
    }

    if (!force && status.cooldownRemainingSec > 0) {
      return {
        triggered: false,
        reason,
        message: `Cooldown active. ${Math.ceil(status.cooldownRemainingSec / 60)}m remaining until next replenishment.`,
      };
    }

    const readyVideos = this.getReadyVideos();
    const storage = this.getStorageUsage();

    if (reason === 'watermark' || reason === 'manual_deletion') {
      if (readyVideos.length >= status.lowWatermarkVideos && !force) {
        return {
          triggered: false,
          reason,
          message: `Pool is healthy (${readyVideos.length}/${status.lowWatermarkVideos} min videos). No replenishment needed.`,
        };
      }
    } else if (reason === 'trickle') {
      if (storage.usagePercent >= 85 || readyVideos.length >= storage.maxVideos) {
        return {
          triggered: false,
          reason,
          message: `Storage near capacity (${storage.totalFormatted} / ${storage.videoCount} videos). Trickle skipped.`,
        };
      }
    }

    this.lastReplenishedAt = Date.now();
    const countToFetch = reason === 'trickle' ? 2 : Math.min(5, Math.max(2, status.lowWatermarkVideos - readyVideos.length));

    console.log(
      `[v-feed replenish] Replenishment triggered (reason: ${reason}, current: ${readyVideos.length} videos, fetching: ${countToFetch} candidates)`,
    );

    try {
      const syncResult = await this.sync({ maxVideos: countToFetch });
      return {
        triggered: true,
        reason,
        details: syncResult,
        message: `Replenishment queued: ${syncResult.queued} new video(s) (found: ${syncResult.totalFound}).`,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[v-feed replenish] Replenishment sync failed:`, msg);
      return { triggered: false, reason, message: `Replenishment failed: ${msg}` };
    }
  }

  /**
   * Starts background trickle scheduler to slowly rotate content when system is idle.
   */
  startTrickleScheduler(): void {
    if (this.trickleTimer) {
      clearInterval(this.trickleTimer);
      this.trickleTimer = null;
    }

    const trickleHours = Number(process.env.FALLBACK_TRICKLE_HOURS || 3);
    if (trickleHours <= 0) return;

    const intervalMs = trickleHours * 60 * 60 * 1000;
    this.trickleTimer = setInterval(() => {
      void this.checkAndReplenishIfNeeded('trickle').catch((err) => {
        console.warn('[v-feed replenish] Trickle interval error:', err);
      });
    }, intervalMs);
    this.trickleTimer.unref();
  }

  stopTrickleScheduler(): void {
    if (this.trickleTimer) {
      clearInterval(this.trickleTimer);
      this.trickleTimer = null;
    }
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
   * Semantically matches local downloaded videos against a search query using tokenized keyword scoring.
   */
  findMatchingLocalVideos(searchQuery: string): IngestedVideo[] {
    const ready = this.getReadyVideos();
    if (ready.length === 0) return [];

    const clean = searchQuery
      .toLowerCase()
      .replace(/#shorts/gi, '')
      .replace(/[^\w\s]/g, ' ');
    const tokens = clean.split(/\s+/).filter((t) => t.length >= 3);

    if (tokens.length === 0) return ready;

    const scored = ready.map((v) => {
      const text = `${v.title} ${v.description || ''} ${v.channelTitle}`.toLowerCase();
      let score = 0;
      for (const token of tokens) {
        if (text.includes(token)) score += 10;
      }
      return { video: v, score };
    });

    const matches = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).map((s) => s.video);
    return matches.length > 0 ? matches : ready;
  }

  /**
   * Triggers a sync by fetching candidates from YouTube or falling back to smart local matching.
   */
  async sync(options?: {
    playlistId?: string;
    searchTopic?: string;
    maxVideos?: number;
  }): Promise<{
    queued: number;
    alreadyCached: number;
    totalFound: number;
    quotaProtected?: boolean;
    matchedLocalVideos?: IngestedVideo[];
  }> {
    const searchTopic =
      options?.searchTopic ||
      process.env.YOUTUBE_SEARCH_QUERY ||
      'vertical synthwave retro shorts #shorts';
    const playlistId = options?.playlistId || process.env.YOUTUBE_PLAYLIST_ID;
    const maxVideos = options?.maxVideos || Number(process.env.YOUTUBE_MAX_VIDEOS || 10);

    // If YouTube API is unconfigured or in Quota Protection Mode, use local semantic matching
    if (!this.youtube.isConfigured || this.youtube.getQuotaStatus().isProtectedMode) {
      console.log(`[v-feed quota] Quota protection / local matching active for topic: "${searchTopic}"`);
      const matches = this.findMatchingLocalVideos(searchTopic);
      return {
        queued: 0,
        alreadyCached: matches.length,
        totalFound: matches.length,
        quotaProtected: true,
        matchedLocalVideos: matches,
      };
    }

    let candidates: YouTubeVideoMeta[] = [];

    try {
      if (playlistId && playlistId.trim().length > 0) {
        console.log(`[v-feed] Fetching YouTube playlist: ${playlistId}`);
        candidates = await this.youtube.fetchPlaylistItems(playlistId, maxVideos);
      } else {
        console.log(`[v-feed] Searching YouTube shorts for query: "${searchTopic}"`);
        candidates = await this.youtube.searchShorts(searchTopic, maxVideos);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('QUOTA_PROTECTED')) {
        console.log(`[v-feed quota] Daily quota reached during search. Fallback to local semantic match.`);
        const matches = this.findMatchingLocalVideos(searchTopic);
        return {
          queued: 0,
          alreadyCached: matches.length,
          totalFound: matches.length,
          quotaProtected: true,
          matchedLocalVideos: matches,
        };
      }
      throw err;
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

    // Operator manual deletion: check if library fell below low watermark
    void this.checkAndReplenishIfNeeded('manual_deletion').catch((err) => {
      console.warn('[v-feed replenish] Auto-replenish after deletion error:', err);
    });

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
        this.cleanTempFiles();
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
    // Proactively verify and prune storage before initiating download
    this.checkAndPruneIfNeeded(15 * 1024 * 1024);

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
