import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(__dirname, '..', '..');

export interface QuotaStatus {
  date: string;
  unitsUsed: number;
  dailyBudget: number;
  percentage: number;
  searchCalls: number;
  videoDetailsCalls: number;
  playlistCalls: number;
  cacheHits: number;
  isProtectedMode: boolean;
  manualOverride: boolean;
  lastResetUtc: string;
}

export class QuotaGuard {
  private configDir: string;
  private filePath: string;
  private dailyBudget: number;
  private data: {
    date: string;
    unitsUsed: number;
    searchCalls: number;
    videoDetailsCalls: number;
    playlistCalls: number;
    cacheHits: number;
    manualOverride: boolean;
    lastResetUtc: string;
  };

  constructor(configDir?: string) {
    this.configDir = configDir || path.join(defaultRoot, 'config');
    this.filePath = path.join(this.configDir, 'quota-tracker.json');
    this.dailyBudget = Number(process.env.YOUTUBE_DAILY_QUOTA_LIMIT || 9000);

    const todayUtc = this.getTodayUtcString();
    this.data = {
      date: todayUtc,
      unitsUsed: 0,
      searchCalls: 0,
      videoDetailsCalls: 0,
      playlistCalls: 0,
      cacheHits: 0,
      manualOverride: false,
      lastResetUtc: new Date().toISOString(),
    };

    this.load();
    this.checkMidnightReset();
  }

  private getTodayUtcString(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private load(): void {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.unitsUsed === 'number') {
          this.data = { ...this.data, ...parsed };
        }
      }
    } catch (err) {
      console.warn('[v-feed quota] Failed to load quota-tracker.json:', err);
    }
  }

  private save(): void {
    try {
      fs.mkdirSync(this.configDir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[v-feed quota] Failed to save quota-tracker.json:', err);
    }
  }

  /**
   * Checks if UTC midnight has passed and resets daily counters.
   */
  checkMidnightReset(): void {
    const today = this.getTodayUtcString();
    if (this.data.date !== today) {
      console.log(`[v-feed quota] UTC Midnight rollover: resetting daily quota counters for ${today}`);
      this.data.date = today;
      this.data.unitsUsed = 0;
      this.data.searchCalls = 0;
      this.data.videoDetailsCalls = 0;
      this.data.playlistCalls = 0;
      this.data.lastResetUtc = new Date().toISOString();
      this.save();
    }
  }

  /**
   * Records an API call cost in quota units.
   * Costs: search = 100, videoDetails = 1, playlist = 1.
   */
  recordCost(type: 'search' | 'videoDetails' | 'playlist', units?: number): void {
    this.checkMidnightReset();
    let cost = units ?? 1;
    if (type === 'search') {
      cost = units ?? 100;
      this.data.searchCalls++;
    } else if (type === 'videoDetails') {
      cost = units ?? 1;
      this.data.videoDetailsCalls++;
    } else if (type === 'playlist') {
      cost = units ?? 1;
      this.data.playlistCalls++;
    }

    this.data.unitsUsed += cost;
    this.save();

    console.log(
      `[v-feed quota] Tracked ${cost} units (${type}) → Total today: ${this.data.unitsUsed} / ${this.dailyBudget} units (${Math.round((this.data.unitsUsed / this.dailyBudget) * 100)}%)`,
    );
  }

  /**
   * Records a free cache hit.
   */
  recordCacheHit(): void {
    this.checkMidnightReset();
    this.data.cacheHits++;
    this.save();
  }

  /**
   * Checks whether the current daily budget allows an operation of the given cost.
   */
  canAfford(cost = 100): boolean {
    this.checkMidnightReset();
    if (this.data.manualOverride) return false;
    return this.data.unitsUsed + cost <= this.dailyBudget;
  }

  /**
   * Returns whether Quota Protection Mode is active.
   */
  get isProtectedMode(): boolean {
    this.checkMidnightReset();
    if (this.data.manualOverride) return true;
    return this.data.unitsUsed >= this.dailyBudget;
  }

  /**
   * Toggles manual quota protection override.
   */
  setManualProtection(enabled: boolean): void {
    this.data.manualOverride = enabled;
    this.save();
  }

  /**
   * Returns current live quota status.
   */
  getStatus(): QuotaStatus {
    this.checkMidnightReset();
    this.dailyBudget = Number(process.env.YOUTUBE_DAILY_QUOTA_LIMIT || 9000);
    const percentage = Math.min(100, Math.round((this.data.unitsUsed / Math.max(1, this.dailyBudget)) * 100));

    return {
      date: this.data.date,
      unitsUsed: this.data.unitsUsed,
      dailyBudget: this.dailyBudget,
      percentage,
      searchCalls: this.data.searchCalls,
      videoDetailsCalls: this.data.videoDetailsCalls,
      playlistCalls: this.data.playlistCalls,
      cacheHits: this.data.cacheHits,
      isProtectedMode: this.isProtectedMode,
      manualOverride: this.data.manualOverride,
      lastResetUtc: this.data.lastResetUtc,
    };
  }
}
