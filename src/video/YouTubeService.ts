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

export interface ReplenishmentStatusResponse {
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

export interface StorageStatusResponse {
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
  replenishment?: ReplenishmentStatusResponse;
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
  storage?: StorageStatusResponse;
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

  async fetchStorageStatus(): Promise<StorageStatusResponse | null> {
    try {
      const res = await fetch('/api/storage');
      if (!res.ok) return null;
      const data = await res.json();
      return data?.storage || null;
    } catch {
      return null;
    }
  }

  async cleanTempFiles(): Promise<{ ok: boolean; cleanedFiles: string[]; reclaimedBytes: number; reclaimedFormatted: string } | null> {
    try {
      const res = await fetch('/api/storage/clean-temp', { method: 'POST' });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async pruneStorage(options?: {
    targetMaxMb?: number;
    maxVideos?: number;
    force?: boolean;
  }): Promise<{ ok: boolean; prunedVideos: any[]; reclaimedBytes: number; reclaimedFormatted: string } | null> {
    try {
      const res = await fetch('/api/storage/prune', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options || {}),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async triggerReplenish(force = false): Promise<{
    ok: boolean;
    triggered: boolean;
    reason: string;
    message: string;
    details?: { queued: number; alreadyCached: number; totalFound: number };
    storage?: StorageStatusResponse;
  } | null> {
    try {
      const res = await fetch('/api/storage/replenish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
}
