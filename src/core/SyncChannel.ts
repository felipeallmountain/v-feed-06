/**
 * Cross-Window Synchronization Bridge for V-FEED [06].
 * Enables zero-latency, bidirectional real-time communication between the main
 * installation display and the parallel operator calibration console across windows/monitors.
 */

import type {
  AudioState,
  FrameState,
  InteractionState,
  QuotaState,
  ShaderUniformsState,
  SkeletonStyle,
  TrackingState,
  VideoMode,
} from './StateManager';

export interface StatePatchPayload {
  shaders?: Partial<ShaderUniformsState>;
  frames?: Partial<FrameState>;
  audio?: Partial<AudioState>;
  tracking?: Partial<TrackingState>;
  interaction?: Partial<InteractionState>;
  videoMode?: VideoMode;
  skeletonOverlay?: boolean;
  skeletonStyle?: SkeletonStyle;
  skeletonLineThickness?: number;
  skeletonLineOpacity?: number;
  skeletonDotSize?: number;
  skeletonDotOpacity?: number;
  skeletonShowLines?: boolean;
  skeletonShowDots?: boolean;
  skeletonJitter?: number;
  debugOverlay?: boolean;
  debugViewMode?: 'video' | 'camera' | 'split';
}

export interface VideoTelemetry {
  title: string;
  channelTitle?: string;
  currentTime: number;
  duration: number;
  paused: boolean;
  videoMode: VideoMode;
  url?: string;
}

export interface TelemetryTickPayload {
  fps: number;
  tracking: {
    present: boolean;
    distance: number;
    personCount: number;
    screenPresences: number[];
    antennaLocks: number[];
    antennaNoises: number[];
  };
  interaction: {
    activePose: string;
    densityState: string;
    kineticState: string;
    chromaState: string;
    kineticEnergy: number;
    holdProgress: number;
    isHolding: boolean;
    cooldownRemainingSec: number;
    lastQuery: string | null;
    lastTriggerReason: string | null;
  };
  quota?: QuotaState;
  video?: VideoTelemetry;
}

export type RemoteCommandAction =
  | 'play'
  | 'pause'
  | 'toggle_play'
  | 'next'
  | 'prev'
  | 'seek'
  | 'sync_youtube'
  | 'test_query'
  | 'reset_defaults'
  | 'save_disk'
  | 'set_video_mode'
  | 'toggle_quota_protection'
  | 'apply_preset';

export interface RemoteCommandPayload {
  action: RemoteCommandAction;
  value?: any;
}

export type OutgoingSyncMessage =
  | { type: 'STATE_PATCH'; payload: StatePatchPayload }
  | { type: 'TELEMETRY_TICK'; payload: TelemetryTickPayload }
  | { type: 'REMOTE_COMMAND'; payload: RemoteCommandPayload }
  | { type: 'REQUEST_INITIAL_STATE' }
  | { type: 'SEND_INITIAL_STATE'; payload: any }
  | { type: 'HEARTBEAT'; role: 'main' | 'operator' };

export type SyncMessage = OutgoingSyncMessage & { sourceId: string; timestamp: number };

const CHANNEL_NAME = 'vfeed_sync_channel';
const STORAGE_EVENT_KEY = 'vfeed_sync_event';

export class SyncChannel {
  private channel: BroadcastChannel | null = null;
  private sourceId = `w_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;
  private listeners: Array<(msg: SyncMessage) => void> = [];
  private storageHandler: ((e: StorageEvent) => void) | null = null;
  private heartbeatInterval = 0;
  private lastPeerSeen = 0;

  constructor() {
    this.init();
  }

  private init(): void {
    if (typeof window === 'undefined') return;

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(CHANNEL_NAME);
        this.channel.onmessage = (event) => {
          this.handleIncoming(event.data);
        };
      } catch (err) {
        console.warn('[SyncChannel] BroadcastChannel init error, falling back to storage events', err);
      }
    }

    this.storageHandler = (e: StorageEvent) => {
      if (e.key === STORAGE_EVENT_KEY && e.newValue) {
        try {
          const msg = JSON.parse(e.newValue) as SyncMessage;
          this.handleIncoming(msg);
        } catch {
          /* ignore parse errors */
        }
      }
    };
    window.addEventListener('storage', this.storageHandler);
  }

  private handleIncoming(msg: SyncMessage): void {
    if (!msg || typeof msg !== 'object') return;
    if (msg.sourceId === this.sourceId) return; // Ignore own messages

    this.lastPeerSeen = Date.now();
    for (const listener of this.listeners) {
      try {
        listener(msg);
      } catch (err) {
        console.error('[SyncChannel] Listener dispatch error:', err);
      }
    }
  }

  send(msg: OutgoingSyncMessage): void {
    const fullMsg: SyncMessage = {
      ...msg,
      sourceId: this.sourceId,
      timestamp: Date.now(),
    };

    if (this.channel) {
      try {
        this.channel.postMessage(fullMsg);
      } catch (err) {
        console.warn('[SyncChannel] postMessage failed:', err);
      }
    }

    // Fallback to localStorage event for cross-origin or fallback tabs
    try {
      localStorage.setItem(STORAGE_EVENT_KEY, JSON.stringify(fullMsg));
    } catch {
      /* ignore quota errors */
    }
  }

  sendStatePatch(patch: StatePatchPayload): void {
    this.send({ type: 'STATE_PATCH', payload: patch });
  }

  sendTelemetry(telemetry: TelemetryTickPayload): void {
    this.send({ type: 'TELEMETRY_TICK', payload: telemetry });
  }

  sendCommand(action: RemoteCommandAction, value?: any): void {
    this.send({ type: 'REMOTE_COMMAND', payload: { action, value } });
  }

  requestInitialState(): void {
    this.send({ type: 'REQUEST_INITIAL_STATE' });
  }

  sendInitialState(state: any): void {
    this.send({ type: 'SEND_INITIAL_STATE', payload: state });
  }

  startHeartbeat(role: 'main' | 'operator'): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = window.setInterval(() => {
      this.send({ type: 'HEARTBEAT', role });
    }, 1500);
  }

  isPeerConnected(thresholdMs = 4000): boolean {
    return Date.now() - this.lastPeerSeen < thresholdMs;
  }

  onMessage(callback: (msg: SyncMessage) => void): () => void {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== callback);
    };
  }

  dispose(): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.listeners = [];
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    if (this.storageHandler) {
      window.removeEventListener('storage', this.storageHandler);
      this.storageHandler = null;
    }
  }
}

export const syncChannel = new SyncChannel();
