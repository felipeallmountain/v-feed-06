/**
 * YouTube Data API v3 Service
 * Fetches playlist items, searches vertical shorts, and retrieves video metadata.
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
}

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class YouTubeDataService {
  private apiKey: string;
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly defaultCacheTtlMs = 15 * 60 * 1000; // 15 minutes

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.YOUTUBE_API_KEY || '';
  }

  setApiKey(key: string): void {
    this.apiKey = key;
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  private getCached<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  private setCached<T>(key: string, data: T, ttlMs = this.defaultCacheTtlMs): void {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Search for vertical YouTube Shorts.
   */
  async searchShorts(query: string, maxResults = 10): Promise<YouTubeVideoMeta[]> {
    if (!this.isConfigured) {
      throw new Error('YouTube API key is not configured');
    }

    const cacheKey = `search:${query}:${maxResults}`;
    const cached = this.getCached<YouTubeVideoMeta[]>(cacheKey);
    if (cached) return cached;

    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('q', query);
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoDuration', 'short');
    url.searchParams.set('maxResults', String(Math.min(50, Math.max(1, maxResults))));
    url.searchParams.set('key', this.apiKey);

    const response = await fetch(url);
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`YouTube search API error ${response.status}: ${errorBody}`);
    }

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
   */
  async fetchPlaylistItems(playlistId: string, maxResults = 25): Promise<YouTubeVideoMeta[]> {
    if (!this.isConfigured) {
      throw new Error('YouTube API key is not configured');
    }

    const cacheKey = `playlist:${playlistId}:${maxResults}`;
    const cached = this.getCached<YouTubeVideoMeta[]>(cacheKey);
    if (cached) return cached;

    const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
    url.searchParams.set('part', 'snippet,contentDetails');
    url.searchParams.set('maxResults', String(Math.min(50, Math.max(1, maxResults))));
    url.searchParams.set('playlistId', playlistId);
    url.searchParams.set('key', this.apiKey);

    const response = await fetch(url);
    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`YouTube playlist API error ${response.status}: ${errorBody}`);
    }

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
    if (!this.isConfigured || videoIds.length === 0) return map;

    const uniqueIds = Array.from(new Set(videoIds));
    const chunkSize = 50;

    for (let i = 0; i < uniqueIds.length; i += chunkSize) {
      const chunk = uniqueIds.slice(i, i + chunkSize);
      const url = new URL('https://www.googleapis.com/youtube/v3/videos');
      url.searchParams.set('part', 'snippet,contentDetails');
      url.searchParams.set('id', chunk.join(','));
      url.searchParams.set('key', this.apiKey);

      try {
        const res = await fetch(url);
        if (!res.ok) continue;
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
