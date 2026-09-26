# 05 — Audio Synthesis Engine & Acoustic Design

This document details the Web Audio API architecture, digital signal processing (DSP) graph, procedural noise synthesis, CRT flyback resonance whistle, and antenna-driven audio modulation of **V-FEED [06]**.

---

## 1. Acoustic Concept & Sound Design

The acoustic identity of **V-FEED [06]** is built on the auditory experience of vintage broadcast television. Before modern digital tuners, analog television audio was inextricably linked to physical RF reception quality and cathode-ray tube electronics:

1. **RF Television Static**: When an analog TV is off-channel, it produces continuous white noise with subtle pink-noise low-frequency roll-off through its speaker.
2. **15.734 kHz NTSC Flyback Whistle**: Standard definition NTSC televisions drew 525 scanlines at 29.97 frames per second, requiring a horizontal deflection frequency of exactly **15,734.26 Hz**. The flyback transformer coils vibrated mechanically at this exact frequency, creating a subtle, ubiquitous high-frequency whistle characteristic of all vintage CRT spaces.
3. **Bandwidth Attenuation (Tuning)**: As an antenna is tuned into frequency, the audio moves from muffled, noisy AM bandpass distortion into full-fidelity stereo sound.

---

## 2. Web Audio DSP Architecture (`AudioEngine.ts`)

The audio engine is implemented as a pure Web Audio API DSP graph in [`src/audio/AudioEngine.ts`](../../src/audio/AudioEngine.ts).

### DSP Graph Diagram

```
 ┌───────────────────────────┐
 │   HTMLVideoElement        │
 │  (<video id="feed-video">)│
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐
 │MediaElementAudioSourceNode│
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐
 │   videoFilter (Biquad)    │
 │  - type: 'lowpass'        │
 │  - cutoff: 1.2kHz → 18kHz │
 │  - Q: 0.7                 │
 └─────────────┬─────────────┘
               │
               ▼
 ┌───────────────────────────┐
 │     videoGain (Gain)      │
 │  - gain: 0.0 → 0.85       │
 └─────────────┬─────────────┘
               │
               ▼
               │
 ┌───────────────────────────┐         ┌───────────────────────────┐
 │  noiseSource (BufferNode) │         │   humOsc (OscillatorNode) │
 │  - 2-sec white/pink buffer│         │  - type: 'sine'           │
 └─────────────┬─────────────┘         │  - freq: 15,734.26 Hz     │
               │                       └─────────────┬─────────────┘
               ▼                                     │
 ┌───────────────────────────┐                       │
 │   noiseFilter (Biquad)    │                       │
 │  - type: 'bandpass'       │                       │
 │  - freq: 2,200 Hz         │                       │
 │  - Q: 0.8                 │                       │
 └─────────────┬─────────────┘                       │
               │                                     │
               ▼                                     ▼
 ┌───────────────────────────┐         ┌───────────────────────────┐
 │     noiseGain (Gain)      │         │      humGain (Gain)       │
 │  - gain: 0.0 → 0.35       │         │  - gain: 0.002 → 0.015    │
 └─────────────┬─────────────┘         └─────────────┬─────────────┘
               │                                     │
               └───────────────────────┬─────────────┘
                                       │
                                       ▼
                         ┌───────────────────────────┐
                         │      masterGain (Gain)    │
                         │  - gain: 0.0 → 1.0        │
                         └─────────────┬─────────────┘
                                       │
                                       ▼
                         ┌───────────────────────────┐
                         │   AudioDestinationNode    │
                         │   (Physical Speakers/DAC) │
                         └───────────────────────────┘
```

---

## 3. Browser Autoplay Policies & User-Gesture Unlocking

Modern web browsers (including Google Chrome, Edge, and Safari) block audio output until an explicit user interaction (click, tap, or keydown) occurs on the document.

### Unlocking Workflow
1. At startup, [`AudioEngine`](../../src/audio/AudioEngine.ts#L9) initializes the `AudioContext` in a `suspended` state.
2. An overlay banner (`#boot-hint`) displays: `CLICK ANYWHERE TO UNLOCK AUDIO & CAMERA`.
3. When clicked, [`unlock()`](../../src/audio/AudioEngine.ts#L24) executes:
   - Calls `audioContext.resume()`.
   - Attaches `createMediaElementSource(feedVideo)` to the `<video>` element.
   - Unmutes the video element (`feedVideo.muted = false`).
   - Starts the continuous noise source and 15.734 kHz oscillator.
   - Sets `useAppStore.getState().setAudioUnlocked(true)`.

### Production Kiosk Bypass
For unassisted exhibition deployment where no mouse or keyboard is available, the launcher script ([`scripts/kiosk.sh`](../../scripts/kiosk.sh)) boots Chromium with the flag:
```bash
--autoplay-policy=no-user-gesture-required
```
This allows `AudioContext` to initialize and output sound immediately on system boot without user interaction.

---

## 4. Component Details & Mathematical Synthesis

### 4.1 Video Audio DSP Pipeline
Soundtrack audio from playing YouTube Shorts or local fallback MP4 files flows into a dynamic low-pass biquad filter before reaching the speakers:
- When **Signal Lock = 0.0** (No spectator present): Filter cutoff drops to **1,200 Hz**, and video gain is heavily attenuated. Audio sounds muffled and buried under static.
- When **Signal Lock = 1.0** (Spectator locked): Filter cutoff opens fully to **18,000 Hz**, and video gain rises to 85%. Clear, wide-spectrum stereo audio is restored.

### 4.2 Procedural RF Television Static Generator
Rather than playing an MP3 loop of static (which loops noticeably and wastes RAM), [`AudioEngine`](../../src/audio/AudioEngine.ts#L9) procedurally constructs a 2-second looped `AudioBuffer`:

```typescript
const bufferSize = ctx.sampleRate * 2;
const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
const data = noiseBuffer.getChannelData(0);

for (let i = 0; i < bufferSize; i++) {
  // White noise sample in [-1.0, 1.0]
  data[i] = Math.random() * 2 - 1;
}

const noiseSource = ctx.createBufferSource();
noiseSource.buffer = noiseBuffer;
noiseSource.loop = true;
```

This raw noise is routed through a bandpass filter centered at **2,200 Hz with a Q of 0.8**, recreating the characteristic acoustic response of small CRT internal speaker cones.

### 4.3 15.734 kHz NTSC Flyback Hum
The flyback whistle is generated by a continuous sine wave oscillator:
- **Frequency**: Configured via [`CRT_FLYBACK_HZ = 15734`](../../src/core/constants.ts#L3).
- **Gain**: Deliberately kept low (`0.002` to `0.015`) so it sits as a subliminal physical presence in the gallery rather than causing listener ear fatigue.
- When signal lock is achieved, the hum is slightly attenuated to let the video dialogue take prominence.

---

## 5. Reactive Modulation via the "Human Antenna"

Every frame, the audio parameters reactively synchronize with the vision telemetry stored in [`useAppStore`](../../src/core/StateManager.ts#L487):

$$\text{signalLock} \in [0.0, 1.0]$$
$$\text{noiseGain} = (1.0 - \text{signalLock}) \times \text{staticVolume}$$
$$\text{cutoffFreq} = 1200 + 16800 \times (\text{signalLock})^{1.5}$$
$$\text{videoGain} = 0.85 \times \sqrt{\text{signalLock}}$$

### Cross-fading Behavior

| Gallery State | Spectator Distance | Signal Lock | RF Static Level | Video Filter Cutoff | Video Gain |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Empty Room** | $> 3.5\text{ m}$ (None) | `0.0` | **High (35%)** | 1,200 Hz (Muffled) | 0.0 (Silent) |
| **Approaching** | $2.0\text{ m}$ | `0.5` | Medium (17%) | 7,100 Hz | 0.60 |
| **Locked** | $1.0\text{ m}$ | `1.0` | **Zero (0%)** | 18,000 Hz (Open) | 0.85 (Full) |
| **Hand Jitter** | $1.0\text{ m}$ + Motion | Drops to `0.7` | Quick burst (10%) | Slight dip | Slight dip |

---

*Next Step: Explore [06. Video Pipeline & Server Architecture](./06-video-pipeline-and-server.md) to understand how video content is ingested, cached, and served.*
