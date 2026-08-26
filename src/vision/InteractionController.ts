import { useAppStore } from '../core/StateManager';
import {
  synthesizeBroadcastQuery,
  type InteractionFeatureState,
  type SynthesizedQuery,
} from './BroadcastQuerySynthesizer';
import { FeatureExtractor } from './FeatureExtractor';
import type { TrackerFrame } from './MediaPipeTracker';

export type QuerySynthesizedCallback = (query: SynthesizedQuery) => void;

export class InteractionController {
  private extractor = new FeatureExtractor();
  private candidateKey: string | null = null;
  private holdTimeMs = 0;
  private lastTriggeredKey: string | null = null;
  private cooldownRemainingMs = 0;
  private stillnessDurationMs = 0;
  private lastUpdateTs = 0;
  private onQueryCallback: QuerySynthesizedCallback | null = null;

  onQuerySynthesized(callback: QuerySynthesizedCallback): void {
    this.onQueryCallback = callback;
  }

  /**
   * Main per-frame interaction tick.
   * Evaluates feature extraction, priority ladder, hold debounce, cooldown, and shader modulation.
   */
  update(frame: TrackerFrame, video: HTMLVideoElement | null): InteractionFeatureState {
    const now = frame.timestampMs;
    const dt = this.lastUpdateTs > 0 ? Math.max(1, now - this.lastUpdateTs) : 16;
    this.lastUpdateTs = now;

    const store = useAppStore.getState();
    const interactionSettings = store.interaction;
    const holdDurationMs = interactionSettings.holdDurationMs || 1800;
    const cooldownDurationMs = (interactionSettings.cooldownDurationSec || 10) * 1000;
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

    // 2. Evaluate Conflict Resolution & Priority Ladder
    // Priority 1: Semantic Key Poses (Antenna, Surprise, Wingsuit)
    // Priority 2: Audience Density Shifts (Solo, Duo, Group)
    // Priority 3: Kinetic Dynamics (High Motion, Rhythm, Stillness)
    let currentPriorityKey: string | null = null;
    let priorityReason: string | null = null;

    if (features.pose !== 'NONE') {
      currentPriorityKey = `POSE:${features.pose}`;
      priorityReason = `Pose: ${features.pose.replace('POSE_', '')}`;
    } else if (features.density !== 'EMPTY') {
      currentPriorityKey = `DENSITY:${features.density}`;
      priorityReason = `Density: ${features.density}`;
    } else if (features.kinetics !== 'STEADY') {
      currentPriorityKey = `KINETIC:${features.kinetics}`;
      priorityReason = `Kinetics: ${features.kinetics}`;
    }

    // 3. Debouncing & Hold Timer (1.5s - 2.0s)
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
  }
}
