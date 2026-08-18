import * as THREE from 'three';
import { DEFAULT_VIDEO_ASPECT } from '../core/constants';

export class VideoTexturePass {
  readonly video: HTMLVideoElement;
  readonly texture: THREE.VideoTexture;
  private gridTexture: THREE.Texture | null = null;
  private usingGrid = false;
  private onAspectChange: (aspect: number) => void;
  private metadataHandler: () => void;

  constructor(
    video: HTMLVideoElement,
    onAspectChange: (aspect: number) => void = () => undefined,
  ) {
    this.video = video;
    this.onAspectChange = onAspectChange;
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.loop = false;
    this.video.crossOrigin = 'anonymous';

    this.texture = new THREE.VideoTexture(this.video);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;

    this.metadataHandler = () => this.updateAspect();
    this.video.addEventListener('loadedmetadata', this.metadataHandler);
    this.updateAspect();
  }

  private updateAspect(): void {
    const { videoWidth, videoHeight } = this.video;
    const aspect =
      videoWidth > 0 && videoHeight > 0
        ? videoWidth / videoHeight
        : DEFAULT_VIDEO_ASPECT;
    this.onAspectChange(aspect);
  }

  async loadUrl(url: string): Promise<void> {
    this.usingGrid = false;
    if (this.video.src === url && !this.video.error) {
      await this.video.play().catch(() => undefined);
      this.updateAspect();
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
    this.updateAspect();
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
    this.video.removeEventListener('loadedmetadata', this.metadataHandler);
    this.texture.dispose();
    this.gridTexture?.dispose();
  }
}
