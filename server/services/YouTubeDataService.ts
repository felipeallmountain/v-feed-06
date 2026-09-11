import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QuotaGuard, type QuotaStatus } from './QuotaGuard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(__dirname, '..', '..');
const envPath = path.resolve(defaultRoot, '.env');

/**
 * YouTube Data API v3 Service
 * Fetches playlist items, searches vertical shorts, and retrieves video metadata.
 * Equipped with persistent multi-tier disk caching and QuotaGuard unit tracking.
 */

export interface YouTubeVideoMeta {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  durationSec: number;
  durationFormatted: string;
  thumbnail: string;
  publishedAt: string;
  url: string;
  query?: string;
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class YouTubeDataService {
  private apiKey: string;
  private cache = new Map<string, CacheEntry<unknown>>();
  private cacheFilePath: string;
  private quotaGuard: QuotaGuard;

  constructor(apiKey?: string, quotaGuard?: QuotaGuard, configDir?: string) {
    this.apiKey = (apiKey || '').trim();
    const cfg = configDir || path.join(defaultRoot, 'config');
    this.cacheFilePath = path.join(cfg, 'youtube-api-cache.json');
    this.quotaGuard = quotaGuard || new QuotaGuard(cfg);

    this.loadDiskCache();
  }

  private get cacheTtlMs(): number {
    const minutes = Number(process.env.YOUTUBE_CACHE_TTL_MINUTES || 360); // 6 hours default
    return Math.max(5, minutes) * 60 * 1000;
  }

  getApiKey(): string {
    if (this.apiKey && this.apiKey.trim().length > 0) {
      return this.apiKey.trim();
    }
    let key = (process.env.YOUTUBE_API_KEY || '').trim();
    if (!key) {
      try {
        dotenv.config({ path: envPath, override: true });
        key = (process.env.YOUTUBE_API_KEY || '').trim();
      } catch {
        /* ignore */
      }
    }
    return key;
  }

  setApiKey(key: string): void {
    this.apiKey = key.trim();
  }

  get isConfigured(): boolean {
    return this.getApiKey().length > 0;
  }

  getQuotaStatus(): QuotaStatus {
    return this.quotaGuard.getStatus();
  }

  getQuotaGuard(): QuotaGuard {
    return this.quotaGuard;
  }

  private loadDiskCache(): void {
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        const raw = fs.readFileSync(this.cacheFilePath, 'utf-8');
        const parsed = JSON.parse(raw) as Record<string, CacheEntry<unknown>>;
        const now = Date.now();
        let loadedCount = 0;
        for (const [k, v] of Object.entries(parsed)) {
          if (v && v.expiresAt > now) {
            this.cache.set(k, v);
            loadedCount++;
          }
        }
        if (loadedCount > 0) {
          console.log(`[v-feed cache] Restored ${loadedCount} YouTube API queries from disk (${this.cacheFilePath})`);
        }
      }
    } catch (err) {
      console.warn('[v-feed cache] Failed to read disk cache:', err);
    }
  }

  private saveDiskCache(): void {
    try {
      const dir = path.dirname(this.cacheFilePath);
      fs.mkdirSync(dir, { recursive: true });
      const obj: Record<string, CacheEntry<unknown>> = {};
      const now = Date.now();
      for (const [k, v] of this.cache.entries()) {
        if (v.expiresAt > now) {
          obj[k] = v;
        }
      }
      fs.writeFileSync(this.cacheFilePath, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[v-feed cache] Failed to write disk cache:', err);
    }
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    this.quotaGuard.recordCacheHit();
    return entry.data as T;
  }

  private setCached<T>(key: string, data: T, ttlMs = this.cacheTtlMs): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
    this.saveDiskCache();
  }

  clearCache(): void {
    this.cache.clear();
    try {
      if (fs.existsSync(this.cacheFilePath)) {
        fs.unlinkSync(this.cacheFilePath);
      }
      console.log('[v-feed cache] YouTube API disk & memory cache cleared');
    } catch (err) {
      console.warn('[v-feed cache] Failed to clear disk cache:', err);
    }
  }

  /**
   * Search for vertical YouTube Shorts.
   * Tracks 100 quota units for search.list and checks QuotaGuard budget.
   */
  async searchShorts(query: string, maxResults = 10): Promise<YouTubeVideoMeta[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('YouTube API key is not configured');
    }

    const cacheKey = `search:${query.toLowerCase().trim()}:${maxResults}`;
    const cached = this.getCached<YouTubeVideoMeta[]>(cacheKey);
    if (cached) {
      console.log(`[v-feed cache] ✓ Served query "${query}" from cache (0 quota units)`);
      return cached;
    }

    if (!this.quotaGuard.canAfford(101)) {
      throw new Error('QUOTA_PROTECTED: Daily YouTube API quota threshold reached. Switching to local archive matching.');
    }

    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('q', query);
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoDuration', 'short');
    url.searchParams.set('maxResults', String(Math.min(50, Math.max(1, maxResults))));
    url.searchParams.set('key', apiKey);

    const response = await fetch(url);
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`YouTube search API error ${response.status}: ${errorBody}`);
    }

    // Track search call cost
    this.quotaGuard.recordCost('search', 100);

    const data = (await response.json()) as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: {
          title?: string;
          description?: string;
          channelTitle?: string;
          publishedAt?: string;
          thumbnails?: {
            high?: { url?: string };
            medium?: { url?: string };
            default?: { url?: string };
          };
        };
      }>;
    };

    const videoIds = (data.items ?? [])
      .map((item) => item.id?.videoId)
      .filter((id): id is string => Boolean(id));

    if (videoIds.length === 0) {
      this.setCached(cacheKey, []);
      return [];
    }

    const detailsMap = await this.getVideoDetails(videoIds);

    const results: YouTubeVideoMeta[] = [];
    for (const item of data.items ?? []) {
      const id = item.id?.videoId;
      if (!id) continue;
      const detail = detailsMap.get(id);
      const snippet = item.snippet;

      const thumbnail =
        detail?.thumbnail ||
        snippet?.thumbnails?.high?.url ||
        snippet?.thumbnails?.medium?.url ||
        snippet?.thumbnails?.default?.url ||
        `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

      results.push({
        id,
        title: detail?.title || snippet?.title || id,
        description: detail?.description || snippet?.description || '',
        channelTitle: detail?.channelTitle || snippet?.channelTitle || 'YouTube',
        durationSec: detail?.durationSec ?? 0,
        durationFormatted: detail?.durationFormatted ?? '0:00',
        thumbnail,
        publishedAt: detail?.publishedAt || snippet?.publishedAt || new Date().toISOString(),
        url: `https://www.youtube.com/watch?v=${id}`,
      });
    }

    this.setCached(cacheKey, results);
    return results;
  }

  /**
   * Fetch items from a YouTube playlist.
   * Tracks 1 quota unit for playlistItems.list.
   */
  async fetchPlaylistItems(playlistId: string, maxResults = 25): Promise<YouTubeVideoMeta[]> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('YouTube API key is not configured');
    }

    const cacheKey = `playlist:${playlistId.trim()}:${maxResults}`;
    const cached = this.getCached<YouTubeVideoMeta[]>(cacheKey);
    if (cached) {
      console.log(`[v-feed cache] ✓ Served playlist "${playlistId}" from cache (0 quota units)`);
      return cached;
    }

    if (!this.quotaGuard.canAfford(2)) {
      throw new Error('QUOTA_PROTECTED: Daily YouTube API quota threshold reached.');
    }

    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('part', 'snippet,contentDetails');
    url.searchParams.set('maxResults', String(Math.min(50, Math.max(1, maxResults))));
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('key', apiKey);

    const response = await fetch(url);
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`YouTube playlist API error ${response.status}: ${errorBody}`);
    }

    // Track playlist items list cost
    this.quotaGuard.recordCost('playlist', 1);

    const data = (await response.json()) as {
      items?: Array<{
        contentDetails?: { videoId?: string };
        snippet?: {
          title?: string;
          description?: string;
          channelTitle?: string;
          publishedAt?: string;
          thumbnails?: {
            high?: { url?: string };
            medium?: { url?: string };
            default?: { url?: string };
          };
        };
      }>;
    };

    const videoIds = (data.items ?? [])
      .map((item) => item.contentDetails?.videoId)
      .filter((id): id is string => Boolean(id));

    if (videoIds.length === 0) {
      this.setCached(cacheKey, []);
      return [];
    }

    const detailsMap = await this.getVideoDetails(videoIds);

    const results: YouTubeVideoMeta[] = [];
    for (const item of data.items ?? []) {
      const id = item.contentDetails?.videoId;
      if (!id) continue;
      const detail = detailsMap.get(id);
      const snippet = item.snippet;

      const thumbnail =
        detail?.thumbnail ||
        snippet?.thumbnails?.high?.url ||
        snippet?.thumbnails?.medium?.url ||
        snippet?.thumbnails?.default?.url ||
        `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

      results.push({
        id,
        title: detail?.title || snippet?.title || id,
        description: detail?.description || snippet?.description || '',
        channelTitle: detail?.channelTitle || snippet?.channelTitle || 'YouTube',
        durationSec: detail?.durationSec ?? 0,
        durationFormatted: detail?.durationFormatted ?? '0:00',
        thumbnail,
        publishedAt: detail?.publishedAt || snippet?.publishedAt || new Date().toISOString(),
        url: `https://www.youtube.com/watch?v=${id}`,
      });
    }

    this.setCached(cacheKey, results);
    return results;
  }

  /**
   * Fetch detailed metadata (contentDetails, duration, thumbnails) for a list of video IDs.
   * Tracks 1 quota unit per 50 video IDs.
   */
  async getVideoDetails(videoIds: string[]): Promise<
    Map<
      string,
      {
        title: string;
        description: string;
        durationSec: number;
        durationFormatted: string;
        thumbnail: string;
        channelTitle: string;
        publishedAt: string;
      }
    >
  > {
    const map = new Map();
    const apiKey = this.getApiKey();
    if (!apiKey || videoIds.length === 0) return map;

    const uniqueIds = Array.from(new Set(videoIds));
    const chunkSize = 50;

    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      const url = new URL('https://www.googleapis.com/youtube/v3/videos');
      url.searchParams.set('part', 'snippet,contentDetails');
      url.searchParams.set('id', chunk.join(','));
      url.searchParams.set('key', apiKey);

      try {
        const res = await fetch(url);
        if (!res.ok) continue;

        // Record 1 unit per chunk
        this.quotaGuard.recordCost('videoDetails', 1);

        const data = (await res.json()) as {
          items?: Array<{
            id: string;
            snippet?: {
              title?: string;
              description?: string;
              channelTitle?: string;
              publishedAt?: string;
              thumbnails?: {
                maxres?: { url?: string };
                high?: { url?: string };
                medium?: { url?: string };
                default?: { url?: string };
              };
            };
            contentDetails?: {
              duration?: string;
            };
          }>;
        };

        for (const item of data.items ?? []) {
          const durationSec = parseIsoDuration(item.contentDetails?.duration ?? '');
          const durationFormatted = formatSeconds(durationSec);
          const snippet = item.snippet;
          const thumbnail =
            snippet?.thumbnails?.maxres?.url ||
            snippet?.thumbnails?.high?.url ||
            snippet?.thumbnails?.medium?.url ||
            snippet?.thumbnails?.default?.url ||
            `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`;

          map.set(item.id, {
            title: snippet?.title || item.id,
            description: snippet?.description || '',
            durationSec,
            durationFormatted,
            thumbnail,
            channelTitle: snippet?.channelTitle || 'YouTube',
            publishedAt: snippet?.publishedAt || new Date().toISOString(),
          });
        }
      } catch (err) {
        console.warn('[v-feed] Failed to fetch video details chunk:', err);
      }
    }

    return map;
  }
}

/**
 * Parses ISO 8601 duration format (e.g. PT1M15S, PT45S, PT1H2M10S) to seconds.
 */
export function parseIsoDuration(isoDuration: string): number {
  if (!isoDuration) return 0;
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * Formats seconds into MM:SS or HH:MM:SS.
 */
export function formatSeconds(totalSeconds: number): string {
  if (!totalSeconds || isNaN(totalSeconds)) return '0:00';
  const hours = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const paddedSecs = secs.toString().padStart(2, '0');
  if (hours > 0) {
    const paddedMins = mins.toString().padStart(2, '0');
    return `${hours}:${paddedMins}:${paddedSecs}`;
  }
  return `${mins}:${paddedSecs}`;
}
