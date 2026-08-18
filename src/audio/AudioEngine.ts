import { CRT_FLYBACK_HZ } from '../core/constants';
import { useAppStore } from '../core/StateManager';

/**
 * White/pink noise + 15.734 kHz CRT flyback hum modulated by interference state.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private noiseGain: GainNode | null = null;
  private humGain: GainNode | null = null;
  private started = false;
  private unsub: (() => void) | null = null;

  async unlock(): Promise<void> {
    if (this.started) {
      await this.ctx?.resume();
      return;
    }

    const ctx = new AudioContext();
    this.ctx = ctx;

    const master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);

    // White noise buffer (2s loop)
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1800;
    noiseFilter.Q.value = 0.7;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.4;
    noise.connect(noiseFilter);
    noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(master);
    noise.start();

    // Flyback transformer whistle ~15.734 kHz
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = CRT_FLYBACK_HZ;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0.02;
    hum.connect(this.humGain);
    this.humGain.connect(master);
    hum.start();

    // Low secondary hum ~60 Hz for warmth
    const mains = ctx.createOscillator();
    mains.type = 'sine';
    mains.frequency.value = 60;
    const mainsGain = ctx.createGain();
    mainsGain.gain.value = 0.015;
    mains.connect(mainsGain);
    mainsGain.connect(master);
    mains.start();

    this.started = true;
    useAppStore.getState().setAudioUnlocked(true);

    this.unsub = useAppStore.subscribe((state) => {
      this.sync(state.shaders.noiseGain, state.shaders.signalLock, state.shaders.rgbSplit);
    });
  }

  sync(noise: number, lock: number, rgb: number): void {
    if (!this.ctx || !this.noiseGain || !this.humGain) return;
    const t = this.ctx.currentTime;
    this.noiseGain.gain.setTargetAtTime(
      0.05 + noise * 0.55,
      t,
      0.05,
    );
    this.humGain.gain.setTargetAtTime(
      0.008 + lock * 0.035 + rgb * 0.01,
      t,
      0.08,
    );
  }

  dispose(): void {
    this.unsub?.();
    void this.ctx?.close();
    this.ctx = null;
    this.started = false;
  }
}
