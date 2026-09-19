export type CameraStartResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' | 'insecure' | 'denied' | 'notfound' | 'failed'; message: string };

export class CameraManager {
  readonly video: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private mirror = true;
  private rotation = 0;
  private frameCanvas: HTMLCanvasElement;
  private frameCtx: CanvasRenderingContext2D | null = null;

  constructor(video: HTMLVideoElement) {
    this.video = video;
    this.video.playsInline = true;
    this.video.muted = true;
    this.video.setAttribute('playsinline', '');
    this.video.setAttribute('webkit-playsinline', '');

    this.frameCanvas = document.createElement('canvas');
    this.frameCtx = this.frameCanvas.getContext('2d', { willReadFrequently: true });
  }

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  static isSecure(): boolean {
    return typeof window !== 'undefined' && window.isSecureContext;
  }

  async start(mirror = true, rotation = 0): Promise<CameraStartResult> {
    this.mirror = mirror;
    this.rotation = ((rotation % 360) + 360) % 360;

    if (!CameraManager.isSecure()) {
      return {
        ok: false,
        reason: 'insecure',
        message:
          'Camera needs a secure context. Open via http://localhost:5173 (not a file:// or LAN IP without HTTPS).',
      };
    }

    if (!CameraManager.isSupported()) {
      return {
        ok: false,
        reason: 'unsupported',
        message: 'This browser does not expose getUserMedia. Use Chrome or Edge.',
      };
    }

    if (this.stream) return { ok: true };

    try {
      this.stream = await this.requestStream();
      this.video.srcObject = this.stream;
      // Ensure the element has layout for MediaPipe / some browsers
      this.video.width = 640;
      this.video.height = 480;
      await this.video.play();
      this.applyMirror();
      return { ok: true };
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      const message = err instanceof Error ? err.message : String(err);

      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        return {
          ok: false,
          reason: 'denied',
          message:
            'Camera permission blocked. Click the lock/camera icon in the address bar → Allow, then retry.',
        };
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        return {
          ok: false,
          reason: 'notfound',
          message: 'No camera detected. Plug in a webcam and retry.',
        };
      }
      return {
        ok: false,
        reason: 'failed',
        message: `Camera failed: ${name || message}`,
      };
    }
  }

  /** Progressive constraints — hard frameRate mins often fail on laptop cams. */
  private async requestStream(): Promise<MediaStream> {
    const attempts: MediaStreamConstraints[] = [
      {
        audio: false,
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
      },
      {
        audio: false,
        video: { facingMode: 'user' },
      },
      {
        audio: false,
        video: true,
      },
    ];

    let lastError: unknown;
    for (const constraints of attempts) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('getUserMedia failed');
  }

  setMirror(mirror: boolean): void {
    this.mirror = mirror;
    this.applyMirror();
  }

  private applyMirror(): void {
    this.video.style.transform = this.mirror ? 'scaleX(-1)' : 'none';
  }

  setRotation(rotation: number): void {
    this.rotation = ((rotation % 360) + 360) % 360;
  }

  getRotation(): number {
    return this.rotation;
  }

  getFrameSource(): HTMLCanvasElement | HTMLVideoElement {
    return this.updateFrame();
  }

  /**
   * Updates and returns the oriented camera frame.
   * If rotation is 0, returns the native video element directly (zero overhead).
   * If rotation is 90, 180, or 270, renders the rotated frame onto the internal canvas.
   */
  updateFrame(rotation?: number): HTMLCanvasElement | HTMLVideoElement {
    if (rotation !== undefined) {
      this.rotation = ((rotation % 360) + 360) % 360;
    }

    if (this.video.readyState < 2 || this.rotation === 0) {
      return this.video;
    }

    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (vw <= 0 || vh <= 0) return this.video;

    const isSwap = this.rotation === 90 || this.rotation === 270;
    const targetW = isSwap ? vh : vw;
    const targetH = isSwap ? vw : vh;

    if (this.frameCanvas.width !== targetW || this.frameCanvas.height !== targetH) {
      this.frameCanvas.width = targetW;
      this.frameCanvas.height = targetH;
    }

    if (!this.frameCtx) {
      this.frameCtx = this.frameCanvas.getContext('2d', { willReadFrequently: true });
    }
    const ctx = this.frameCtx;
    if (!ctx) return this.video;

    ctx.save();
    if (this.rotation === 90) {
      ctx.translate(targetW, 0);
      ctx.rotate((90 * Math.PI) / 180);
    } else if (this.rotation === 180) {
      ctx.translate(targetW, targetH);
      ctx.rotate(Math.PI);
    } else if (this.rotation === 270) {
      ctx.translate(0, targetH);
      ctx.rotate((270 * Math.PI) / 180);
    }
    ctx.drawImage(this.video, 0, 0, vw, vh);
    ctx.restore();

    return this.frameCanvas;
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
  }
}
