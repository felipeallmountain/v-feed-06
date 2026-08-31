import { useAppStore, type VideoMode } from '../core/StateManager';
import type { SceneManager } from '../rendering/SceneManager';
import type { VideoTexturePass } from '../rendering/VideoTexturePass';
import { YouTubeService, type IngestStatusResponse, type PlaylistItem } from './YouTubeService';

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
        return;
      }

      if (this.items.length === 0) {
        this.scene?.setProcedural(true);
        useAppStore.getState().setCurrentVideoUrl('procedural://feed');
        return;
      }

      const item = this.items[this.index % this.items.length];
      const videoUrl = item.streamUrl || item.url;

      try {
        this.scene?.setProcedural(false);
        await this.videoPass.loadUrl(videoUrl);
        useAppStore.getState().setCurrentVideoUrl(item.url);
      } catch (err) {
        console.warn(`[v-feed] Failed to load video ${videoUrl}, advancing to next:`, err);
        this.index = (this.index + 1) % Math.max(1, this.items.length);
        if (this.items.length > 1) {
          const nextItem = this.items[this.index];
          await this.videoPass.loadUrl(nextItem.streamUrl || nextItem.url).catch(() => {
            this.scene?.setProcedural(true);
          });
        } else {
          this.scene?.setProcedural(true);
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
