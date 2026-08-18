import * as THREE from 'three';

export class VideoTexturePass {
  readonly video: HTMLVideoElement;
  readonly texture: THREE.VideoTexture;
  private gridTexture: THREE.Texture | null = null;
  private usingGrid = false;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.loop = false;
    this.video.crossOrigin = 'anonymous';

    this.texture = new THREE.VideoTexture(this.video);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
  }

  async loadUrl(url: string): Promise<void> {
    this.usingGrid = false;
    if (this.video.src === url && !this.video.error) {
      await this.video.play().catch(() => undefined);
      return;
    }
    this.video.src = url;
    this.video.load();
    await new Promise<void>((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error(`Failed to load video: ${url}`));
      };
      const cleanup = () => {
        this.video.removeEventListener('canplay', onReady);
        this.video.removeEventListener('error', onError);
      };
      this.video.addEventListener('canplay', onReady, { once: true });
      this.video.addEventListener('error', onError, { once: true });
    });
    await this.video.play().catch(() => undefined);
  }

  setGridTexture(texture: THREE.Texture): void {
    this.gridTexture = texture;
  }

  enableGrid(enabled: boolean): THREE.Texture {
    this.usingGrid = enabled;
    if (enabled && this.gridTexture) {
      this.video.pause();
      return this.gridTexture;
    }
    return this.texture;
  }

  get activeTexture(): THREE.Texture {
    if (this.usingGrid && this.gridTexture) return this.gridTexture;
    return this.texture;
  }

  onEnded(handler: () => void): void {
    this.video.addEventListener('ended', handler);
  }

  dispose(): void {
    this.texture.dispose();
    this.gridTexture?.dispose();
  }
}
