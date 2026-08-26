export interface PlaylistItem {
  id: string;
  title: string;
  channelTitle?: string;
  durationSec?: number;
  durationFormatted?: string;
  thumbnail?: string;
  filename?: string;
  fileSize?: number;
  downloadedAt?: string;
  source: 'youtube' | 'local';
  url: string;
  streamUrl?: string;
}

export interface IngestStatusResponse {
  isIngesting: boolean;
  activeDownload: {
    id: string;
    title: string;
    progressPercent: number;
    speed: string;
    eta: string;
  } | null;
  queueLength: number;
  completedInBatch: number;
  totalInBatch: number;
  readyCount: number;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface PlaylistResponse {
  mode: 'live' | 'cache' | 'grid';
  live: PlaylistItem[];
  cache: PlaylistItem[];
  fallbackReady: boolean;
  ingestion: IngestStatusResponse;
}

export interface QuotaStatusResponse {
  date: string;
  unitsUsed: number;
  dailyBudget: number;
  percentage: number;
  searchCalls: number;
  videoDetailsCalls: number;
  playlistCalls: number;
  cacheHits: number;
  isProtectedMode: boolean;
  manualOverride: boolean;
  lastResetUtc: string;
}

export class YouTubeService {
  async fetchPlaylist(): Promise<PlaylistResponse> {
    const res = await fetch('/api/playlist');
    if (!res.ok) {
      throw new Error(`Playlist request failed: ${res.status}`);
    }
    return (await res.json()) as PlaylistResponse;
  }

  async fetchQuotaStatus(): Promise<QuotaStatusResponse | null> {
    try {
      const res = await fetch('/api/quota');
      if (!res.ok) return null;
      const data = await res.json();
      return data?.quota || null;
    } catch {
      return null;
    }
  }

  async toggleQuotaProtection(enabled: boolean): Promise<QuotaStatusResponse | null> {
    try {
      const res = await fetch('/api/quota/toggle-protection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.quota || null;
    } catch {
      return null;
    }
  }

  async clearCache(): Promise<boolean> {
    try {
      const res = await fetch('/api/quota/clear-cache', { method: 'POST' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async triggerSync(options?: {
    playlistId?: string;
    searchTopic?: string;
    maxVideos?: number;
  }): Promise<{ ok: boolean; queued: number; alreadyCached: number; totalFound: number }> {
    const res = await fetch('/api/ingest/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    });
    if (!res.ok) {
      throw new Error(`Sync request failed: ${res.status}`);
    }
    return await res.json();
  }

  async ingestVideo(urlOrId: string): Promise<{ ok: boolean; video?: PlaylistItem }> {
    const res = await fetch('/api/ingest/video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urlOrId }),
    });
    if (!res.ok) {
      throw new Error(`Ingest video request failed: ${res.status}`);
    }
    return await res.json();
  }

  async getIngestionStatus(): Promise<IngestStatusResponse> {
    const res = await fetch('/api/ingest/status');
    if (!res.ok) {
      throw new Error(`Status request failed: ${res.status}`);
    }
    return (await res.json()) as IngestStatusResponse;
  }

  async deleteVideo(id: string): Promise<{ ok: boolean }> {
    const res = await fetch(`/api/videos/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error(`Delete video failed: ${res.status}`);
    }
    return await res.json();
  }
}
