import { CRT_FLYBACK_HZ } from '../core/constants';
import { useAppStore } from '../core/StateManager';

/**
 * Web Audio Engine for V-FEED [06].
 * Routes and modulates video audio, analog RF static noise, and CRT transformer hum
 * based on real-time Human Antenna proximity and vision tracking behavior.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private videoSourceNode: MediaElementAudioSourceNode | null = null;
  private videoFilter: BiquadFilterNode | null = null;
  private videoGain: GainNode | null = null;
  private noiseGain: GainNode | null = null;
  private humGain: GainNode | null = null;
  private attachedVideo: HTMLVideoElement | null = null;
  private started = false;
  private unsub: (() => void) | null = null;

  /**
   * Unlocks Web Audio and routes the video element's audio through the DSP graph.
   */
  async unlock(video?: HTMLVideoElement): Promise<void> {
    if (video) {
      this.attachedVideo = video;
    }

    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume();
    }

    if (!this.started) {
      this.setupGraph();
      this.started = true;
    }

    if (this.attachedVideo && !this.videoSourceNode && this.ctx) {
      try {
        this.videoSourceNode = this.ctx.createMediaElementSource(this.attachedVideo);
        if (this.videoFilter) {
          this.videoSourceNode.connect(this.videoFilter);
        }
        // Unmute HTML video element so audio flows directly into Web Audio
        this.attachedVideo.muted = false;
        this.attachedVideo.volume = 1.0;
      } catch (err) {
        console.warn('[v-feed] MediaElementSource connect warning (may already be attached):', err);
      }
    }

    useAppStore.getState().setAudioUnlocked(true);
    this.sync();
  }

  private setupGraph(): void {
    if (!this.ctx) return;
    const ctx = this.ctx;

    // 1. Master Output Gain
    const master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    this.masterGain = master;

    // 2. Video Audio DSP Pipeline (Filter -> Gain -> Master)
    const vFilter = ctx.createBiquadFilter();
    vFilter.type = 'lowpass';
    vFilter.frequency.value = 18000;
    vFilter.Q.value = 0.7;
    this.videoFilter = vFilter;

    const vGain = ctx.createGain();
    vGain.gain.value = 0.85;
    vFilter.connect(vGain);
    vGain.connect(master);
    this.videoGain = vGain;

    // 3. RF TV Static Noise Generator (Noise Buffer -> Bandpass Filter -> Noise Gain -> Master)
    const bufferSize = ctx.sampleRate * 2;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      // White noise with subtle pink roll-off
      data[i] = Math.random() * 2 - 1;
    }
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const nFilter = ctx.createBiquadFilter();
    nFilter.type = 'bandpass';
    nFilter.frequency.value = 2200;
    nFilter.Q.value = 0.8;

    const nGain = ctx.createGain();
    nGain.gain.value = 0.25;
    noiseSource.connect(nFilter);
    nFilter.connect(nGain);
    nGain.connect(master);
    this.noiseGain = nGain;
    noiseSource.start();

    // 4. CRT Flyback Transformer Whistle (15.734 kHz)
    const hum = ctx.createOscillator();
    hum.type = 'sine';
    hum.frequency.value = CRT_FLYBACK_HZ;
    const hGain = ctx.createGain();
    hGain.gain.value = 0.02;
    hum.connect(hGain);
    hGain.connect(master);
    this.humGain = hGain;
    hum.start();

    // 5. Secondary Mains Power Hum (60 Hz)
    const mains = ctx.createOscillator();
    mains.type = 'sine';
    mains.frequency.value = 60;
    const mGain = ctx.createGain();
    mGain.gain.value = 0.015;
    mains.connect(mGain);
    mGain.connect(master);
    mains.start();

    // Subscribe to state changes for real-time antenna sound modulation
    this.unsub = useAppStore.subscribe(() => {
      this.sync();
    });
  }

  /**
   * Synchronizes sound parameters according to Human Antenna tracking and shader states.
   */
  sync(): void {
    if (!this.ctx || !this.started) return;
    const store = useAppStore.getState();
    const sh = store.shaders;
    const audioState = store.audio;
    const t = this.ctx.currentTime;

    const signalLock = Math.max(0, Math.min(1, sh.signalLock));
    const noiseGain = Math.max(0, Math.min(1, sh.noiseGain));
    const rgbSplit = Math.max(0, sh.rgbSplit);

    // 1. Master Volume
    if (this.masterGain) {
      const targetMaster = audioState.muted ? 0 : audioState.masterVolume;
      this.masterGain.gain.setTargetAtTime(targetMaster, t, 0.05);
    }

    if (audioState.antennaModulation) {
      // --- HUMAN ANTENNA MODE ---
      // A. Video Audio Gain: Swells up smoothly as antenna proximity locks in
      // When far/untuned, video is quiet/faded; when near/locked, video is crisp & full
      const targetVideoGain = audioState.videoVolume * Math.pow(signalLock, 1.2);
      if (this.videoGain) {
        this.videoGain.gain.setTargetAtTime(targetVideoGain, t, 0.06);
      }

      // B. Video Filter: RF Radio Bandpass Tuning
      // When far: muffled AM radio sound (450 Hz)
      // When tuned: crystal clear full-range broadcast sound (19.5 kHz)
      if (this.videoFilter) {
        const jitterFlutter = rgbSplit > 0.3 ? (Math.random() - 0.5) * 800 * rgbSplit : 0;
        const targetFreq = Math.max(
          350,
          Math.min(20000, 450 + Math.pow(signalLock, 1.6) * 19550 + jitterFlutter),
        );
        const targetQ = 2.2 - signalLock * 1.5;
        this.videoFilter.frequency.setTargetAtTime(targetFreq, t, 0.05);
        this.videoFilter.Q.setTargetAtTime(targetQ, t, 0.08);
      }

      // C. RF Static Noise: Fills untuned gap and fades out completely when tuned
      if (this.noiseGain) {
        const targetNoiseGain =
          audioState.noiseVolume * (0.01 + Math.pow(noiseGain, 1.3) * 0.99);
        this.noiseGain.gain.setTargetAtTime(targetNoiseGain, t, 0.05);
      }

      // D. CRT Flyback & Mains Hum
      if (this.humGain) {
        const targetHum = audioState.humVolume * (0.6 + signalLock * 0.4 + rgbSplit * 0.2);
        this.humGain.gain.setTargetAtTime(targetHum, t, 0.08);
      }
    } else {
      // --- DIRECT PLAYBACK MODE (No antenna modulation) ---
      if (this.videoGain) {
        this.videoGain.gain.setTargetAtTime(audioState.videoVolume, t, 0.05);
      }
      if (this.videoFilter) {
        this.videoFilter.frequency.setTargetAtTime(20000, t, 0.05);
        this.videoFilter.Q.setTargetAtTime(0.7, t, 0.05);
      }
      if (this.noiseGain) {
        this.noiseGain.gain.setTargetAtTime(audioState.noiseVolume * 0.05, t, 0.05);
      }
      if (this.humGain) {
        this.humGain.gain.setTargetAtTime(audioState.humVolume, t, 0.05);
      }
    }
  }

  dispose(): void {
    this.unsub?.();
    void this.ctx?.close();
    this.ctx = null;
    this.videoSourceNode = null;
    this.started = false;
  }
}
