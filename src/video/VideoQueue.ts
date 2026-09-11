import { useAppStore, type VideoMode } from '../core/StateManager';
import type { SceneManager } from '../rendering/SceneManager';
import type { VideoTexturePass } from '../rendering/VideoTexturePass';
import { YouTubeService, type IngestStatusResponse, type PlaylistItem } from './YouTubeService';

export const KNOWN_VIDEO_QUERIES: Record<string, string> = {
  'k9DO26O6dIg': 'classic cinema 80s 90s movie scene tv',
  'I9fSWSpsmYE': 'classic cinema 80s 90s movie scene tv',
  '7Cwh_PBB5OU': 'classic cinema 80s 90s movie scene tv',
  'PXYQBT_DsdI': 'classic cinema 80s 90s movie scene tv',
  'dUfREXKyt5U': 'classic cinema 80s 90s movie scene tv',
  'FiDjYBe__AE': 'classic cinema 80s 90s movie scene tv',
  'PT88_yjPXu8': 'classic cinema 80s 90s movie scene tv',
  'gHkEAHarmss': 'classic cinema 80s 90s movie scene tv',
  '_-bad9XoD3g': 'classic cinema 80s 90s movie scene tv',
  'LC7gjwFtts0': 'classic cinema 80s 90s movie scene tv',
  'UTSIgVmjojg': '#shorts retro public access tv host vintage 1950s black and white tv close up',
  'jvAbkawUEtk': '#shorts vintage late night intro monologue 1950s black and white tv close up',
  'laoK8wkG3KQ': '#shorts vintage late night intro monologue 1950s black and white tv close up',
  'Vf8cFe0sCMA': '#shorts vintage late night intro monologue 1950s black and white tv',
  'Qxohw-X4wDM': '#shorts vintage late night intro monologue 1950s black and white tv',
  'jnPE8u5ONls': '#shorts vintage late night intro monologue 1950s black and white tv close up',
  'uhYLfK8GSr0': '#shorts vintage late night intro monologue 1950s black and white tv close up',
  'EqnUiEVgmAg': '#shorts retro broadcast test pattern signal 1950s black and white tv',
  'BQXR7AQ9XnM': '#shorts retro broadcast test pattern signal 1950s black and white tv',
  'N4qzfS_Y2q4': '#shorts retro broadcast test pattern signal 1950s black and white tv',
  'K85z3h2oMV4': '#shorts retro broadcast test pattern signal 1950s black and white tv',
  'fY4oF6NPnXw': '#shorts retro broadcast test pattern signal 1950s black and white tv',
  'JlXNGprnjYs': '#shorts retro public access tv host vintage',
  'H9CvNZD9q60': '#shorts retro public access tv host vintage',
  'dv2XbOj51Mo': '#shorts retro public access tv host vintage',
  'J8zg8ABTimU': '#shorts retro public access tv host vintage',
  '2-4hUsJBNK0': '#shorts retro public access tv host vintage',
  'Cnchea6LHN0': '#shorts 1980s television sign off static',
  '_Zr11L4nNA0': '#shorts 1980s television sign off static',
  '-3o6o8oLzHU': '#shorts 1980s television sign off static',
  'KmyE1AkkBUQ': '#shorts 1980s television sign off static',
  'HKJ4LyqeyWU': '#shorts 1980s television sign off static',
  '_jQ5JjvDtKA': '#shorts 1970s television sign off monologue 1950s black and white tv',
  'Tv5K1GaDMtM': '#shorts retro news anchor monologue',
  'vyLMx65svR8': '#shorts retro news anchor monologue',
  'a-ADfh0RmhE': '#shorts retro news anchor monologue',
  'Dmwk1O9U0gA': '#shorts retro news anchor monologue',
  'r3m9OUutEXo': '#shorts vintage sitcom behind the scenes gags 1950s black and white tv wide shot',
  'qyx1kGlcnCA': '#shorts retro public access tv host vintage 1950s black and white tv close up',
  '_v1e8AC5SfE': '#shorts vintage sitcom behind the scenes gags 1950s black and white tv wide shot',
  'KXK1at-udX8': '#shorts vintage sitcom behind the scenes gags 1950s black and white tv wide shot',
  'GIpRtAHrSec': '#shorts vintage sitcom behind the scenes gags 1950s black and white tv wide shot',
  'GSrJAgQ1Az0': '#shorts 1970s television sign off monologue 1950s black and white tv',
  'AauSFpPuCX4': '#shorts 1970s television sign off monologue 1950s black and white tv',
  'W33gHkvK6nc': '#shorts 1970s television sign off monologue 1950s black and white tv',
  '_DBfxUBQ9ao': '#shorts 1970s television sign off monologue 1950s black and white tv',
  'h346zEfeV6E': '#shorts retro public access tv host vintage 1950s black and white tv close up',
  'NkCoS0HnxTc': '#shorts retro public access tv host vintage 1950s black and white tv close up',
  'fOOmJWqEQ0Y': '#shorts retro public access tv host vintage 1950s black and white tv close up',
  'L2iwMZjMYV0': '#shorts peaky blinders outfits public reaction',
};

/**
 * Playlist controller with seamless YouTube ingestion playback,
 * background playlist polling, and transparent offline fallback.
 */
export class VideoQueue {
  private items: PlaylistItem[] = [];
  private liveItems: PlaylistItem[] = [];
  private cacheItems: PlaylistItem[] = [];
  private index = 0;
  private usingFallback = false;
  private readonly youtube = new YouTubeService();
  private videoPass: VideoTexturePass | null = null;
  private scene: SceneManager | null = null;
  private mode: VideoMode = 'live';
  private storageListener: ((e: StorageEvent) => void) | null = null;
  private pollTimer: number | null = null;
  private initialized = false;
  private isLoadingVideo = false;
  private lastInteractionQuery: string | null = null;

  attach(videoPass: VideoTexturePass, scene: SceneManager): void {
    this.videoPass = videoPass;
    this.scene = scene;
    videoPass.onEnded(() => {
      void this.next();
    });
  }

  async init(): Promise<void> {
    if (this.initialized) {
      await this.playCurrent();
      return;
    }
    this.initialized = true;

    // Read stored mode or default to live
    const storedMode = (localStorage.getItem('vfeed-video-mode') as VideoMode) || 'live';
    this.mode = storedMode;
    useAppStore.getState().setVideoMode(storedMode);

    await this.refreshPlaylist();

    this.bindStorageEvents();
    this.startBackgroundPolling();

    await this.playCurrent();
  }

  /**
   * Refreshes the playlist from backend without interrupting current playback.
   */
  async refreshPlaylist(): Promise<void> {
    try {
      const playlist = await this.youtube.fetchPlaylist();
      this.liveItems = playlist.live || [];
      this.cacheItems = playlist.cache || [];

      this.updateActiveQueue();

      // Poll live quota status and update global store
      const quota = await this.youtube.fetchQuotaStatus();
      if (quota) {
        useAppStore.getState().setQuotaState(quota);
      }

      if (this.items.length === 0) {
        console.warn(
          '[v-feed] No video content available yet — procedural feed active. Use Admin to sync YouTube or add MP4s.',
        );
      }
    } catch (err) {
      console.warn('[v-feed] Playlist fetch failed, maintaining existing queue:', err);
    }
  }

  private updateActiveQueue(): void {
    if (this.mode === 'live') {
      this.items =
        this.liveItems.length > 0
          ? this.liveItems
          : this.cacheItems.length > 0
            ? this.cacheItems
            : [];
      this.usingFallback = this.liveItems.length === 0 && this.cacheItems.length > 0;
    } else if (this.mode === 'cache') {
      this.items =
        this.cacheItems.length > 0
          ? this.cacheItems
          : this.liveItems.length > 0
            ? this.liveItems
            : [];
      this.usingFallback = true;
    } else {
      this.items = [];
    }
  }

  private bindStorageEvents(): void {
    this.storageListener = (e: StorageEvent) => {
      if (e.key === 'vfeed-video-mode' && e.newValue) {
        this.setMode(e.newValue as VideoMode);
      } else if (e.key === 'vfeed-remote-action' && e.newValue) {
        if (e.newValue === 'next') void this.next();
        if (e.newValue === 'prev') void this.prev();
      } else if (e.key === 'vfeed-play-url' && e.newValue) {
        void this.playSpecificUrl(e.newValue);
      }
    };
    window.addEventListener('storage', this.storageListener);
  }

  private startBackgroundPolling(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    // Periodically poll playlist every 20 seconds to incorporate newly ingested YouTube videos and update quota status
    this.pollTimer = window.setInterval(() => {
      void this.refreshPlaylist();
    }, 20000);
  }

  setMode(mode: VideoMode): void {
    this.mode = mode;
    useAppStore.getState().setVideoMode(mode);
    this.updateActiveQueue();

    if (mode === 'grid') {
      this.scene?.setProcedural(false);
      useAppStore.getState().setCurrentVideoUrl(null);
      useAppStore.getState().setCurrentVideoQuery(null);
      return;
    }

    void this.playCurrent();
  }

  async playCurrent(): Promise<void> {
    if (!this.videoPass || this.isLoadingVideo) return;
    this.isLoadingVideo = true;

    try {
      if (this.mode === 'grid') {
        this.scene?.setProcedural(false);
        useAppStore.getState().setCurrentVideoUrl(null);
        useAppStore.getState().setCurrentVideoQuery(null);
        return;
      }

      if (this.items.length === 0) {
        this.scene?.setProcedural(true);
        useAppStore.getState().setCurrentVideoUrl('procedural://feed');
        useAppStore.getState().setCurrentVideoQuery(null);
        return;
      }

      const item = this.items[this.index % this.items.length];
      const videoUrl = item.streamUrl || item.url;
      const resolvedQuery = this.resolveVideoQuery(item);

      try {
        this.scene?.setProcedural(false);
        await this.videoPass.loadUrl(videoUrl);
        useAppStore.getState().setCurrentVideoUrl(item.url);
        useAppStore.getState().setCurrentVideoQuery(resolvedQuery);
      } catch (err) {
        console.warn(`[v-feed] Failed to load video ${videoUrl}, advancing to next:`, err);
        this.index = (this.index + 1) % Math.max(1, this.items.length);
        if (this.items.length > 1) {
          const nextItem = this.items[this.index];
          await this.videoPass.loadUrl(nextItem.streamUrl || nextItem.url).catch(() => {
            this.scene?.setProcedural(true);
          });
          useAppStore.getState().setCurrentVideoUrl(nextItem.url);
          useAppStore.getState().setCurrentVideoQuery(this.resolveVideoQuery(nextItem));
        } else {
          this.scene?.setProcedural(true);
          useAppStore.getState().setCurrentVideoQuery(null);
        }
      }
    } finally {
      this.isLoadingVideo = false;
    }
  }

  async playSpecificUrl(url: string): Promise<void> {
    if (!this.videoPass) return;
    const foundIdx = this.items.findIndex((item) => item.url === url || item.streamUrl === url);
    if (foundIdx !== -1) {
      this.index = foundIdx;
    }
    this.scene?.setProcedural(false);
    await this.videoPass.loadUrl(url).catch((err) => {
      console.warn('[v-feed] Failed to play specific URL:', err);
    });
    useAppStore.getState().setCurrentVideoUrl(url);
    useAppStore.getState().setCurrentVideoQuery(this.resolveVideoQuery(this.currentItem));
  }

  async next(): Promise<void> {
    if (this.items.length === 0) return;
    this.index = (this.index + 1) % this.items.length;
    await this.playCurrent();
  }

  async prev(): Promise<void> {
    if (this.items.length === 0) return;
    this.index = (this.index - 1 + this.items.length) % this.items.length;
    await this.playCurrent();
  }

  getCurrentItem(): PlaylistItem | null {
    if (this.items.length === 0) return null;
    return this.items[this.index % this.items.length] || null;
  }

  getLiveItems(): PlaylistItem[] {
    return this.liveItems;
  }

  getCacheItems(): PlaylistItem[] {
    return this.cacheItems;
  }

  async triggerInteractionQuery(query: string, reason?: string): Promise<void> {
    console.log(`[v-feed] Triggering interaction query: "${query}" (${reason || 'Spectator Gesture'})`);
    this.lastInteractionQuery = query;
    useAppStore.getState().setCurrentVideoQuery(query);
    try {
      // 1. Trigger YouTube search & ingestion in background (or local matching if in quota protection mode)
      await this.youtube.triggerSync({
        searchTopic: query,
        maxVideos: 5,
      });

      // 2. Refresh playlist manifest and quota status
      await this.refreshPlaylist();

      // 3. If matching local videos or new queue items exist, advance immediately
      if (this.items.length > 0) {
        this.index = 0;
        await this.playCurrent();
      }
    } catch (err) {
      console.warn('[v-feed] Interaction query sync warning:', err);
      if (this.items.length > 0) {
        void this.next();
      }
    }
  }

  resolveVideoQuery(item: PlaylistItem | null): string | null {
    if (!item) return null;
    if (item.query && item.query.trim().length > 0) {
      return item.query.trim();
    }
    if (KNOWN_VIDEO_QUERIES[item.id]) {
      return KNOWN_VIDEO_QUERIES[item.id];
    }
    if (this.lastInteractionQuery) {
      return this.lastInteractionQuery;
    }
    const tags = (item.title || '').match(/#[\w-]+/g);
    if (tags && tags.length > 0) {
      return tags.join(' ');
    }
    return item.title || 'vintage television stream';
  }

  get currentQuery(): string | null {
    if (this.mode === 'grid') return null;
    return this.resolveVideoQuery(this.currentItem);
  }

  async toggleQuotaProtection(enabled: boolean): Promise<void> {
    const res = await this.youtube.toggleQuotaProtection(enabled);
    if (res) {
      useAppStore.getState().setQuotaState(res);
    }
  }

  async clearQuotaCache(): Promise<void> {
    await this.youtube.clearCache();
    await this.refreshPlaylist();
  }

  async syncYouTube(options?: {
    playlistId?: string;
    searchTopic?: string;
    maxVideos?: number;
  }): Promise<{ ok: boolean; queued: number; alreadyCached: number; totalFound: number }> {
    const res = await this.youtube.triggerSync(options);
    void this.refreshPlaylist();
    return res;
  }

  async getIngestionStatus(): Promise<IngestStatusResponse> {
    return await this.youtube.getIngestionStatus();
  }

  get isUsingFallback(): boolean {
    return this.usingFallback;
  }

  get currentItem(): PlaylistItem | null {
    if (this.items.length === 0) return null;
    return this.items[this.index % this.items.length] ?? null;
  }

  get currentTitle(): string {
    const item = this.currentItem;
    return item ? item.title : this.mode === 'grid' ? 'Calibration Grid' : 'Procedural Feed';
  }

  dispose(): void {
    if (this.storageListener) {
      window.removeEventListener('storage', this.storageListener);
    }
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }
  }
}
