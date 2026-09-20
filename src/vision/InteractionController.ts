import { useAppStore } from '../core/StateManager';
import {
  SCREEN_POSE_MAP,
  synthesizeBroadcastQuery,
  type AudienceDensity,
  type InteractionFeatureState,
  type SemanticPose,
  type SynthesizedQuery,
} from './BroadcastQuerySynthesizer';
import { FeatureExtractor } from './FeatureExtractor';
import type { TrackerFrame } from './MediaPipeTracker';

export type QuerySynthesizedCallback = (query: SynthesizedQuery) => void;
export type PoseZapCallback = (
  direction: 'prev' | 'next' | 'random',
  pose: SemanticPose,
  screenIndex: number,
) => void;

export class InteractionController {
  private extractor = new FeatureExtractor();
  private candidateKey: string | null = null;
  private holdTimeMs = 0;
  private lastTriggeredKey: string | null = null;
  private cooldownRemainingMs = 0;
  private stillnessDurationMs = 0;
  private lastUpdateTs = 0;
  private lastDensityState: AudienceDensity = 'EMPTY';
  private poseReleaseTimeMs = 0;
  private onQueryCallback: QuerySynthesizedCallback | null = null;
  private onPoseZapCallback: PoseZapCallback | null = null;

  onQuerySynthesized(callback: QuerySynthesizedCallback): void {
    this.onQueryCallback = callback;
  }

  onPoseZap(callback: PoseZapCallback): void {
    this.onPoseZapCallback = callback;
  }

  private getScreenIndexForPose(pose: SemanticPose): number {
    if (pose === 'NONE') return -1;
    for (const [screenStr, p] of Object.entries(SCREEN_POSE_MAP)) {
      if (p === pose) {
        return Number(screenStr);
      }
    }
    return -1;
  }

  /**
   * Main per-frame interaction tick.
   * Evaluates feature extraction, priority ladder, hold debounce, cooldown, and shader modulation.
   */
  update(
    frame: TrackerFrame,
    video: HTMLVideoElement | HTMLCanvasElement | null,
  ): InteractionFeatureState {
    const now = frame.timestampMs;
    const dt = this.lastUpdateTs > 0 ? Math.max(1, now - this.lastUpdateTs) : 16;
    this.lastUpdateTs = now;

    const store = useAppStore.getState();
    const interactionSettings = store.interaction;
    const calibratedDistance = store.tracking.distance || 2.0;

    // 1. Extract physical and semantic features from camera and pose landmarks
    const features = this.extractor.extract(frame, video, calibratedDistance);

    // Track prolonged stillness
    if (features.kinetics === 'STILLNESS' || !frame.present) {
      this.stillnessDurationMs += dt;
    } else {
      this.stillnessDurationMs = 0;
    }

    // Decrement active cooldown timer
    if (this.cooldownRemainingMs > 0) {
      this.cooldownRemainingMs = Math.max(0, this.cooldownRemainingMs - dt);
    }

    // Track pose release duration to clear lastTriggeredKey when spectator relaxes arms
    if (features.pose === 'NONE') {
      if (this.lastTriggeredKey?.startsWith('POSE:')) {
        this.poseReleaseTimeMs += dt;
        if (this.poseReleaseTimeMs >= 350) {
          this.lastTriggeredKey = null;
          this.poseReleaseTimeMs = 0;
        }
      }
    } else {
      this.poseReleaseTimeMs = 0;
    }

    // 2. Evaluate Conflict Resolution & Priority Ladder
    // Priority 1: Semantic Key Poses (Antenna, Surprise, Wingsuit)
    // Priority 2: Audience Density Shifts (Solo, Duo, Group)
    // Priority 3: Kinetic Dynamics (High Motion, Rhythm, Stillness)
    let currentPriorityKey: string | null = null;
    let priorityReason: string | null = null;

    if (features.pose !== 'NONE') {
      currentPriorityKey = `POSE:${features.pose}`;
      priorityReason = `Pose: ${features.pose.replace('POSE_', '')}`;
    } else if (features.density !== 'EMPTY' && features.density !== this.lastDensityState) {
      currentPriorityKey = `DENSITY:${features.density}`;
      priorityReason = `Density: ${features.density}`;
    } else if (features.kinetics !== 'STEADY') {
      currentPriorityKey = `KINETIC:${features.kinetics}`;
      priorityReason = `Kinetics: ${features.kinetics}`;
    }

    if (features.density === 'EMPTY') {
      this.lastDensityState = 'EMPTY';
    }

    // Determine tailored hold & cooldown durations for snappy channel zapping vs ambient queries
    const isPoseCandidate = currentPriorityKey?.startsWith('POSE:') ?? false;
    const zapEnabled = interactionSettings.zapEnabled !== false;
    const holdDurationMs = isPoseCandidate && zapEnabled
      ? (interactionSettings.zapHoldDurationMs || 1200)
      : (interactionSettings.holdDurationMs || 1800);
    const cooldownDurationMs = isPoseCandidate && zapEnabled
      ? ((interactionSettings.zapCooldownSec ?? 2) * 1000)
      : ((interactionSettings.cooldownDurationSec || 10) * 1000);

    // 3. Debouncing & Hold Timer
    let holdProgress = 0;
    let isHolding = false;

    if (currentPriorityKey && currentPriorityKey !== this.lastTriggeredKey) {
      if (currentPriorityKey === this.candidateKey) {
        this.holdTimeMs += dt;
      } else {
        this.candidateKey = currentPriorityKey;
        this.holdTimeMs = 0;
      }

      holdProgress = Math.min(1.0, this.holdTimeMs / holdDurationMs);
      isHolding = this.holdTimeMs > 200;

      // Confirmed Trigger Event when hold duration completes and cooldown is ready
      if (
        this.holdTimeMs >= holdDurationMs &&
        this.cooldownRemainingMs <= 0 &&
        interactionSettings.enabled
      ) {
        this.lastTriggeredKey = currentPriorityKey;
        this.cooldownRemainingMs = cooldownDurationMs;
        this.holdTimeMs = 0;
        holdProgress = 0;
        isHolding = false;

        const screenIndex = this.getScreenIndexForPose(features.pose);

        // Check if this is a CRT pose zap action
        if (zapEnabled && screenIndex !== -1) {
          const navMode = interactionSettings.zapNavMode ?? 'sequential';
          let direction: 'prev' | 'next' | 'random' = 'next';
          if (navMode === 'directional') {
            direction = screenIndex % 2 === 0 ? 'prev' : 'next';
          } else if (navMode === 'random') {
            direction = 'random';
          } else {
            // 'sequential' (default) -> moves videos one after another
            direction = 'next';
          }

          const crtNum = screenIndex + 1;
          const poseName = features.pose.replace('POSE_', '');
          const triggerReason = `⚡ ZAP ${direction.toUpperCase()} [CRT 0${crtNum} - ${poseName}]`;

          console.log(
            `[v-feed] ⚡ Pose Matched [CRT 0${crtNum} ${poseName}] → ${direction.toUpperCase()} VIDEO (Zapping Body Effect)`,
          );

          store.patchInteraction({
            lastTriggerReason: triggerReason,
          });

          this.onPoseZapCallback?.(direction, features.pose, screenIndex);
        } else {
          // Record current density to only re-trigger on true shifts
          if (features.density !== 'EMPTY') {
            this.lastDensityState = features.density;
          }

          // Fallback / standard broadcast query synthesis for density or kinetics
          const synthesized = synthesizeBroadcastQuery(features);
          synthesized.sourceTrigger = priorityReason || synthesized.sourceTrigger;

          console.log(
            `[v-feed] ⚡ Interaction Triggered [${synthesized.sourceTrigger}] → Query: "${synthesized.rawQuery}"`,
          );

          // Update store with query dispatch history
          store.patchInteraction({
            lastQuery: synthesized.rawQuery,
            lastCategory: synthesized.category,
            lastTriggerReason: synthesized.sourceTrigger,
          });

          // Fire registered callback for video queue ingestion/playback
          this.onQueryCallback?.(synthesized);
        }
      }
    } else {
      // If current key matches what already triggered or is null, reset hold timer
      this.candidateKey = null;
      this.holdTimeMs = 0;
      holdProgress = 0;
      isHolding = false;
    }

    // 4. Update Interaction State in Store
    store.patchInteraction({
      activePose: features.pose,
      densityState: features.density,
      kineticState: features.kinetics,
      proximityState: features.proximity,
      chromaState: features.chroma,
      kineticEnergy: features.kineticEnergy,
      candidateState: currentPriorityKey,
      holdProgress,
      isHolding,
      cooldownRemainingSec: Math.ceil(this.cooldownRemainingMs / 1000),
      stillnessDurationSec: Number((this.stillnessDurationMs / 1000).toFixed(1)),
    });

    return features;
  }

  /**
   * Resets interaction states and cooldown lock.
   */
  reset(): void {
    this.candidateKey = null;
    this.holdTimeMs = 0;
    this.lastTriggeredKey = null;
    this.cooldownRemainingMs = 0;
    this.stillnessDurationMs = 0;
    this.lastDensityState = 'EMPTY';
    this.poseReleaseTimeMs = 0;
  }
}
