import { useAppStore, type VideoMode } from '../core/StateManager';
import type { SceneManager } from '../rendering/SceneManager';
import type { VideoTexturePass } from '../rendering/VideoTexturePass';
import { YouTubeService, type PlaylistItem } from './YouTubeService';

/**
 * Playlist controller with transparent offline cache fallback (FR-01.3 / NFR-06).
 */
export class VideoQueue {
  private items: PlaylistItem[] = [];
  private cacheItems: PlaylistItem[] = [];
  private index = 0;
  private usingFallback = false;
  private readonly youtube = new YouTubeService();
  private videoPass: VideoTexturePass | null = null;
  private scene: SceneManager | null = null;
  private mode: VideoMode = 'cache';
  private storageListener: ((e: StorageEvent) => void) | null = null;
  private initialized = false;

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

    try {
      const playlist = await this.youtube.fetchPlaylist();
      this.cacheItems = playlist.cache;
      this.items =
        this.cacheItems.length > 0
          ? this.cacheItems
          : playlist.live.length > 0
            ? playlist.live
            : [];
      this.mode = useAppStore.getState().videoMode;
      if (this.items.length === 0) {
        console.warn(
          '[v-feed] No cached videos — using procedural feed. Add MP4s to public/fallback-videos/',
        );
      }
    } catch (err) {
      console.warn('[v-feed] Playlist fetch failed, using procedural feed', err);
      this.items = [];
    }

    this.storageListener = (e: StorageEvent) => {
      if (e.key === 'vfeed-video-mode' && e.newValue) {
        this.setMode(e.newValue as VideoMode);
      }
    };
    window.addEventListener('storage', this.storageListener);

    const remoteMode = localStorage.getItem('vfeed-video-mode') as VideoMode | null;
    if (remoteMode) this.setMode(remoteMode);

    await this.playCurrent();
  }

  setMode(mode: VideoMode): void {
    this.mode = mode;
    useAppStore.getState().setVideoMode(mode);
    if (mode === 'grid') {
      this.scene?.setProcedural(false);
      return;
    }
    if (mode === 'cache') {
      this.items = this.cacheItems.length ? this.cacheItems : this.items;
      this.usingFallback = true;
    }
    void this.playCurrent();
  }

  async playCurrent(): Promise<void> {
    if (!this.videoPass) return;
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
    if (item.url.includes('youtube.com') || item.url.includes('youtu.be')) {
      console.warn('[v-feed] Skipping remote YouTube URL (use local cache MP4s)');
      if (this.cacheItems.length > 0) {
        this.items = this.cacheItems;
        await this.playCurrent();
        return;
      }
      this.scene?.setProcedural(true);
      useAppStore.getState().setCurrentVideoUrl('procedural://feed');
      return;
    }

    try {
      this.scene?.setProcedural(false);
      await this.videoPass.loadUrl(item.url);
      useAppStore.getState().setCurrentVideoUrl(item.url);
      this.usingFallback = item.url.includes('/fallback-videos/');
    } catch (err) {
      console.warn('[v-feed] Video load failed, forcing cache/procedural fallback', err);
      await this.forceFallback();
    }
  }

  async next(): Promise<void> {
    if (this.items.length === 0) return;
    this.index = (this.index + 1) % this.items.length;
    await this.playCurrent();
  }

  private async forceFallback(): Promise<void> {
    if (this.cacheItems.length === 0) {
      try {
        const playlist = await this.youtube.fetchPlaylist();
        this.cacheItems = playlist.cache;
      } catch {
        /* ignore */
      }
    }
    if (this.cacheItems.length === 0) {
      this.items = [];
      this.scene?.setProcedural(true);
      useAppStore.getState().setVideoMode('cache');
      useAppStore.getState().setCurrentVideoUrl('procedural://feed');
      return;
    }
    this.items = this.cacheItems;
    this.index = 0;
    this.usingFallback = true;
    useAppStore.getState().setVideoMode('cache');
    await this.playCurrent();
  }

  get isUsingFallback(): boolean {
    return this.usingFallback;
  }

  dispose(): void {
    if (this.storageListener) {
      window.removeEventListener('storage', this.storageListener);
    }
  }
}
