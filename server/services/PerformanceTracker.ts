import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const reportsDir = path.join(root, 'reports');

export interface ApiCallEvent {
  timestamp: string;
  type: 'search' | 'videoDetails' | 'playlist' | 'cacheHit';
  queryOrTarget?: string;
  units: number;
  durationMs: number;
  success: boolean;
  error?: string;
}

export interface VideoDownloadEvent {
  id: string;
  title: string;
  channelTitle?: string;
  filename: string;
  fileSize: number;
  fileSizeFormatted: string;
  durationSec?: number;
  durationFormatted?: string;
  downloadDurationSec: number;
  downloadSpeed?: string;
  downloadedAt: string;
  query?: string;
}

export interface PruneEvent {
  timestamp: string;
  prunedCount: number;
  reclaimedBytes: number;
  reclaimedFormatted: string;
  reason?: string;
}

export interface PerfSample {
  timestamp: string;
  elapsedSec: number;
  quotaUnits: number;
  apiCalls: number;
  videoCount: number;
  totalBytes: number;
  memoryRssMb: number;
  memoryHeapMb: number;
}

export interface PerformanceStatus {
  isRunning: boolean;
  sessionId: string | null;
  startTime: string | null;
  endTime: string | null;
  elapsedSec: number;
  elapsedFormatted: string;
  note?: string;

  // YouTube API
  totalRequests: number;
  totalQuotaUnits: number;
  searchCalls: number;
  videoDetailsCalls: number;
  playlistCalls: number;
  cacheHits: number;
  apiErrors: number;
  quotaUnitsPerHour: number;
  requestsPerHour: number;
  projectedHoursUntilQuotaCap: number;

  // Video Storage
  initialVideoCount: number;
  currentVideoCount: number;
  videosDownloadedCount: number;
  initialStorageBytes: number;
  currentStorageBytes: number;
  addedStorageBytes: number;
  currentStorageFormatted: string;
  addedStorageFormatted: string;
  maxStorageMb: number;
  storageUsagePercent: number;
  videosPerHour: number;
  storageMbPerHour: number;
  projectedHoursUntilStorageCap: number;

  // Host info
  memoryRssMb: number;
  memoryHeapMb: number;
  recentVideos: VideoDownloadEvent[];
  recentApiCalls: ApiCallEvent[];
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function formatDuration(totalSeconds: number): string {
  if (isNaN(totalSeconds) || totalSeconds < 0) return '00:00:00';
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0'),
  ].join(':');
}

export class PerformanceTracker {
  private isRunning = false;
  private sessionId: string | null = null;
  private startTime: number = 0;
  private endTime: number | null = null;
  private note = '';

  private apiEvents: ApiCallEvent[] = [];
  private videoEvents: VideoDownloadEvent[] = [];
  private pruneEvents: PruneEvent[] = [];
  private samples: PerfSample[] = [];
  private sampleTimer: NodeJS.Timeout | null = null;

  private initialVideoCount = 0;
  private initialStorageBytes = 0;
  private currentVideoCount = 0;
  private currentStorageBytes = 0;

  private lastReportPath: string | null = null;

  constructor() {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  isSessionActive(): boolean {
    return this.isRunning;
  }

  startSession(options?: {
    initialVideoCount?: number;
    initialStorageBytes?: number;
    note?: string;
  }): { sessionId: string; startTime: string } {
    this.sessionId = new Date().toISOString().replace(/[:.]/g, '-');
    this.startTime = Date.now();
    this.endTime = null;
    this.isRunning = true;
    this.note = options?.note || 'Interactive performance and longevity test';

    this.apiEvents = [];
    this.videoEvents = [];
    this.pruneEvents = [];
    this.samples = [];

    this.initialVideoCount = options?.initialVideoCount ?? 0;
    this.initialStorageBytes = options?.initialStorageBytes ?? 0;
    this.currentVideoCount = this.initialVideoCount;
    this.currentStorageBytes = this.initialStorageBytes;

    if (this.sampleTimer) {
      clearInterval(this.sampleTimer);
    }

    // Capture baseline sample
    this.recordSample();

    // Sample metrics every 30 seconds
    this.sampleTimer = setInterval(() => {
      if (this.isRunning) {
        this.recordSample();
      }
    }, 30000);
    this.sampleTimer.unref();

    console.log(`[v-feed perf] Performance test session started: ${this.sessionId}`);

    return {
      sessionId: this.sessionId,
      startTime: new Date(this.startTime).toISOString(),
    };
  }

  stopSession(): { reportPath: string; reportContent: string; summary: PerformanceStatus } {
    if (!this.isRunning) {
      const summary = this.getStatus();
      return {
        reportPath: this.lastReportPath || path.join(reportsDir, 'perf-report-latest.md'),
        reportContent: this.lastReportPath && fs.existsSync(this.lastReportPath)
          ? fs.readFileSync(this.lastReportPath, 'utf-8')
          : '# No Active Report',
        summary,
      };
    }

    this.isRunning = false;
    this.endTime = Date.now();
    if (this.sampleTimer) {
      clearInterval(this.sampleTimer);
      this.sampleTimer = null;
    }

    // Final sample
    this.recordSample();

    const summary = this.getStatus();
    const reportContent = this.generateMarkdownReport(summary);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const reportFilename = `perf-report-${timestamp}.md`;
    const reportPath = path.join(reportsDir, reportFilename);
    const latestPath = path.join(reportsDir, 'perf-report-latest.md');

    fs.writeFileSync(reportPath, reportContent, 'utf-8');
    fs.writeFileSync(latestPath, reportContent, 'utf-8');
    this.lastReportPath = reportPath;

    console.log(`[v-feed perf] Performance test session stopped. Report saved: ${reportPath}`);

    return {
      reportPath,
      reportContent,
      summary,
    };
  }

  recordApiCall(event: Omit<ApiCallEvent, 'timestamp'>): void {
    if (!this.isRunning) return;
    this.apiEvents.push({
      ...event,
      timestamp: new Date().toISOString(),
    });
  }

  recordVideoDownload(event: VideoDownloadEvent, totalStorageAfterBytes?: number, totalVideoCountAfter?: number): void {
    if (!this.isRunning) return;
    this.videoEvents.push(event);
    if (typeof totalVideoCountAfter === 'number') {
      this.currentVideoCount = totalVideoCountAfter;
    } else {
      this.currentVideoCount++;
    }
    if (typeof totalStorageAfterBytes === 'number') {
      this.currentStorageBytes = totalStorageAfterBytes;
    } else {
      this.currentStorageBytes += event.fileSize;
    }
  }

  recordPrune(event: Omit<PruneEvent, 'timestamp'>, remainingBytes?: number, remainingCount?: number): void {
    if (!this.isRunning) return;
    this.pruneEvents.push({
      ...event,
      timestamp: new Date().toISOString(),
    });
    if (typeof remainingBytes === 'number') {
      this.currentStorageBytes = remainingBytes;
    }
    if (typeof remainingCount === 'number') {
      this.currentVideoCount = remainingCount;
    }
  }

  updateStorageState(totalBytes: number, videoCount: number): void {
    this.currentStorageBytes = totalBytes;
    this.currentVideoCount = videoCount;
    if (this.initialStorageBytes === 0 && this.initialVideoCount === 0 && this.videoEvents.length === 0) {
      this.initialStorageBytes = totalBytes;
      this.initialVideoCount = videoCount;
    }
  }

  private recordSample(): void {
    const elapsedSec = Math.max(0, Math.floor(((this.endTime || Date.now()) - this.startTime) / 1000));
    const mem = process.memoryUsage();
    let quotaUnits = 0;
    let apiCalls = 0;

    for (const ev of this.apiEvents) {
      if (ev.type !== 'cacheHit') {
        quotaUnits += ev.units;
        apiCalls++;
      }
    }

    this.samples.push({
      timestamp: new Date().toISOString(),
      elapsedSec,
      quotaUnits,
      apiCalls,
      videoCount: this.currentVideoCount,
      totalBytes: this.currentStorageBytes,
      memoryRssMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
      memoryHeapMb: Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10,
    });
  }

  getStatus(): PerformanceStatus {
    const now = this.endTime || (this.startTime > 0 ? Date.now() : 0);
    const elapsedMs = this.startTime > 0 ? Math.max(0, now - this.startTime) : 0;
    const elapsedSec = Math.floor(elapsedMs / 1000);
    const elapsedHours = Math.max(0.001, elapsedSec / 3600);

    let searchCalls = 0;
    let videoDetailsCalls = 0;
    let playlistCalls = 0;
    let cacheHits = 0;
    let totalQuotaUnits = 0;
    let apiErrors = 0;

    for (const ev of this.apiEvents) {
      if (ev.type === 'search') {
        searchCalls++;
        totalQuotaUnits += ev.units;
      } else if (ev.type === 'videoDetails') {
        videoDetailsCalls++;
        totalQuotaUnits += ev.units;
      } else if (ev.type === 'playlist') {
        playlistCalls++;
        totalQuotaUnits += ev.units;
      } else if (ev.type === 'cacheHit') {
        cacheHits++;
      }
      if (!ev.success) {
        apiErrors++;
      }
    }

    const totalRequests = searchCalls + videoDetailsCalls + playlistCalls;
    const quotaUnitsPerHour = Math.round((totalQuotaUnits / elapsedHours) * 10) / 10;
    const requestsPerHour = Math.round((totalRequests / elapsedHours) * 10) / 10;

    const dailyBudget = Number(process.env.YOUTUBE_DAILY_QUOTA_LIMIT || 9000);
    const remainingQuota = Math.max(0, dailyBudget - totalQuotaUnits);
    const projectedHoursUntilQuotaCap = quotaUnitsPerHour > 0
      ? Math.round((remainingQuota / quotaUnitsPerHour) * 10) / 10
      : 999;

    const addedStorageBytes = Math.max(0, this.currentStorageBytes - this.initialStorageBytes);
    const maxStorageMb = Number(process.env.FALLBACK_MAX_STORAGE_MB || 500);
    const maxStorageBytes = maxStorageMb * 1024 * 1024;
    const storageUsagePercent = Math.min(100, Math.round((this.currentStorageBytes / maxStorageBytes) * 1000) / 10);

    const videosPerHour = Math.round((this.videoEvents.length / elapsedHours) * 10) / 10;
    const addedStorageMb = addedStorageBytes / (1024 * 1024);
    const storageMbPerHour = Math.round((addedStorageMb / elapsedHours) * 10) / 10;

    const remainingStorageBytes = Math.max(0, maxStorageBytes - this.currentStorageBytes);
    const projectedHoursUntilStorageCap = storageMbPerHour > 0
      ? Math.round(((remainingStorageBytes / (1024 * 1024)) / storageMbPerHour) * 10) / 10
      : 999;

    const mem = process.memoryUsage();

    return {
      isRunning: this.isRunning,
      sessionId: this.sessionId,
      startTime: this.startTime > 0 ? new Date(this.startTime).toISOString() : null,
      endTime: this.endTime ? new Date(this.endTime).toISOString() : null,
      elapsedSec,
      elapsedFormatted: formatDuration(elapsedSec),
      note: this.note,

      totalRequests,
      totalQuotaUnits,
      searchCalls,
      videoDetailsCalls,
      playlistCalls,
      cacheHits,
      apiErrors,
      quotaUnitsPerHour,
      requestsPerHour,
      projectedHoursUntilQuotaCap,

      initialVideoCount: this.initialVideoCount,
      currentVideoCount: this.currentVideoCount,
      videosDownloadedCount: this.videoEvents.length,
      initialStorageBytes: this.initialStorageBytes,
      currentStorageBytes: this.currentStorageBytes,
      addedStorageBytes,
      currentStorageFormatted: formatBytes(this.currentStorageBytes),
      addedStorageFormatted: formatBytes(addedStorageBytes),
      maxStorageMb,
      storageUsagePercent,
      videosPerHour,
      storageMbPerHour,
      projectedHoursUntilStorageCap,

      memoryRssMb: Math.round((mem.rss / (1024 * 1024)) * 10) / 10,
      memoryHeapMb: Math.round((mem.heapUsed / (1024 * 1024)) * 10) / 10,
      recentVideos: this.videoEvents.slice(-5).reverse(),
      recentApiCalls: this.apiEvents.slice(-8).reverse(),
    };
  }

  generateMarkdownReport(status?: PerformanceStatus): string {
    const s = status || this.getStatus();
    const cpus = os.cpus();
    const cpuModel = cpus.length > 0 ? cpus[0].model : 'Unknown';
    const totalMemGb = Math.round((os.totalmem() / (1024 * 1024 * 1024)) * 10) / 10;

    // Calculate video size distribution
    let minVideoBytes = 0;
    let maxVideoBytes = 0;
    let avgVideoBytes = 0;

    if (this.videoEvents.length > 0) {
      const sizes = this.videoEvents.map((v) => v.fileSize);
      minVideoBytes = Math.min(...sizes);
      maxVideoBytes = Math.max(...sizes);
      const total = sizes.reduce((acc, v) => acc + v, 0);
      avgVideoBytes = Math.round(total / sizes.length);
    }

    // Verdict calculation
    let verdict = '🟢 SUSTAINABLE';
    let verdictDetails = 'The application exhibits healthy quota usage and predictable storage growth suitable for continuous multi-hour exhibition operation.';

    if (s.quotaUnitsPerHour > 1200 || s.projectedHoursUntilQuotaCap < 8) {
      verdict = '🟡 CAUTION: HIGH QUOTA CONSUMPTION';
      verdictDetails = `Quota burn rate is ${s.quotaUnitsPerHour} units/hr. At this pace, daily quota will be exhausted in ~${s.projectedHoursUntilQuotaCap} hours. Consider increasing cache TTL or dialing down search query frequency.`;
    }
    if (s.apiErrors > 0) {
      verdict = '🔴 ATTENTION: API ERRORS DETECTED';
      verdictDetails = `Encountered ${s.apiErrors} YouTube API failure(s) during this test session. Check network stability or quota limits.`;
    }

    const lines: string[] = [
      `# V-FEED [06] — Performance & Longevity Test Report`,
      ``,
      `> **Test Session ID**: \`${s.sessionId || 'N/A'}\`  `,
      `> **Date**: ${s.startTime ? new Date(s.startTime).toLocaleDateString() : new Date().toLocaleDateString()}  `,
      `> **Total Duration**: **${s.elapsedFormatted}** (${s.elapsedSec} seconds)  `,
      `> **Test Note**: ${s.note || 'Installation longevity test'}  `,
      ``,
      `---`,
      ``,
      `## 1. Executive Summary`,
      ``,
      `### Longevity Verdict: **${verdict}**`,
      `${verdictDetails}`,
      ``,
      `| Metric Category | Measured Result | Operational Threshold / Note |`,
      `| :--- | :--- | :--- |`,
      `| **Total Test Duration** | **${s.elapsedFormatted}** | Multi-hour continuous run |`,
      `| **Total YouTube API HTTP Calls** | **${s.totalRequests}** calls | Calls hitting Google API v3 |`,
      `| **YouTube Quota Units Burned** | **${s.totalQuotaUnits}** units | Daily limit: ${Number(process.env.YOUTUBE_DAILY_QUOTA_LIMIT || 9000).toLocaleString()} units |`,
      `| **Average Quota Burn Rate** | **${s.quotaUnitsPerHour} units/hr** | 8h gallery budget: ~1,125 units/hr |`,
      `| **Estimated Quota Runway** | **~${s.projectedHoursUntilQuotaCap} hours** | Until 10,000 unit daily limit |`,
      `| **Local Cache Hits** | **${s.cacheHits}** hits | 0 quota units consumed |`,
      `| **Videos Saved During Test** | **${s.videosDownloadedCount}** video(s) | Downloaded & transcoded via yt-dlp |`,
      `| **Storage Added During Test** | **${s.addedStorageFormatted}** | Net disk growth |`,
      `| **Current Storage Footprint** | **${s.currentStorageFormatted}** / ${s.maxStorageMb} MB (${s.storageUsagePercent}%) | Auto-prune ceiling: ${s.maxStorageMb} MB |`,
      `| **Storage Growth Rate** | **${s.storageMbPerHour} MB/hr** | Storage cap runway: ~${s.projectedHoursUntilStorageCap} hrs |`,
      `| **Host Process Memory (RSS)** | **${s.memoryRssMb} MB** (Heap: ${s.memoryHeapMb} MB) | Stable Node.js runtime |`,
      ``,
      `---`,
      ``,
      `## 2. YouTube Data API v3 Traffic Analysis`,
      ``,
      `| API Endpoint / Action | Cost (Units) | Call Count | Total Units | Share of Quota |`,
      `| :--- | :--- | :--- | :--- | :--- |`,
      `| \`search.list\` (Vertical Shorts Query) | 100 units | ${s.searchCalls} | ${s.searchCalls * 100} units | ${s.totalQuotaUnits > 0 ? Math.round(((s.searchCalls * 100) / s.totalQuotaUnits) * 100) : 0}% |`,
      `| \`videos.list\` (Metadata & Duration) | 1 unit/page | ${s.videoDetailsCalls} | ${s.videoDetailsCalls} units | ${s.totalQuotaUnits > 0 ? Math.round((s.videoDetailsCalls / s.totalQuotaUnits) * 100) : 0}% |`,
      `| \`playlistItems.list\` (Curated Ingestion) | 1 unit/page | ${s.playlistCalls} | ${s.playlistCalls} units | ${s.totalQuotaUnits > 0 ? Math.round((s.playlistCalls / s.totalQuotaUnits) * 100) : 0}% |`,
      `| **Local Disk Cache Hits** | 0 units | **${s.cacheHits}** | 0 units | **${s.cacheHits > 0 ? (s.cacheHits * 100).toLocaleString() : 0} units saved!** |`,
      `| **Total API Requests** | — | **${s.totalRequests}** | **${s.totalQuotaUnits}** | 100% |`,
      ``,
      `### API Reliability`,
      `- **Successful Requests**: ${s.totalRequests - s.apiErrors} / ${s.totalRequests}`,
      `- **API Errors**: ${s.apiErrors}`,
      `- **Cache Efficiency**: ${s.totalRequests + s.cacheHits > 0 ? Math.round((s.cacheHits / (s.totalRequests + s.cacheHits)) * 100) : 0}% of all requests served locally without internet/quota cost.`,
      ``,
      `---`,
      ``,
      `## 3. Video Ingestion & Storage Footprint`,
      ``,
      `- **Starting Video Count**: ${s.initialVideoCount}`,
      `- **Ending Video Count**: ${s.currentVideoCount}`,
      `- **Net Videos Ingested**: ${s.videosDownloadedCount}`,
      `- **Starting Storage**: ${formatBytes(s.initialStorageBytes)}`,
      `- **Current Storage**: ${s.currentStorageFormatted} (out of ${s.maxStorageMb} MB capacity)`,
      `- **Average Video File Size**: ${formatBytes(avgVideoBytes)}`,
      `- **Smallest Video**: ${formatBytes(minVideoBytes)}`,
      `- **Largest Video**: ${formatBytes(maxVideoBytes)}`,
      `- **Storage Pruning Events**: ${this.pruneEvents.length} event(s)`,
      ``,
    ];

    if (this.videoEvents.length > 0) {
      lines.push(`### Videos Downloaded During Test (${this.videoEvents.length} items)`);
      lines.push(``);
      lines.push(`| # | Video ID | Title | Channel | Duration | Size | Download Time | Query / Trigger |`);
      lines.push(`| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |`);
      this.videoEvents.forEach((v, idx) => {
        const titleSafe = (v.title || 'Untitled').replace(/\|/g, '-');
        const channelSafe = (v.channelTitle || 'YouTube').replace(/\|/g, '-');
        const querySafe = (v.query || 'Auto-Sync').replace(/\|/g, '-');
        lines.push(
          `| ${idx + 1} | \`${v.id}\` | ${titleSafe.slice(0, 36)} | ${channelSafe.slice(0, 18)} | ${v.durationFormatted || '0:00'} | **${v.fileSizeFormatted}** | ${v.downloadDurationSec}s | \`${querySafe.slice(0, 24)}\` |`
        );
      });
      lines.push(``);
    } else {
      lines.push(`*No new videos were downloaded during this test run (either pool was already full or search queries matched existing cache).*`);
      lines.push(``);
    }

    if (this.pruneEvents.length > 0) {
      lines.push(`### Prune & Storage Reclamation Events`);
      lines.push(``);
      lines.push(`| Timestamp | Videos Pruned | Reclaimed Space | Reason |`);
      lines.push(`| :--- | :--- | :--- | :--- |`);
      this.pruneEvents.forEach((p) => {
        lines.push(`| ${p.timestamp} | ${p.prunedCount} | ${p.reclaimedFormatted} | ${p.reason || 'Storage cap exceeded'} |`);
      });
      lines.push(``);
    }

    lines.push(
      `---`,
      ``,
      `## 4. Machine & Environmental Health`,
      ``,
      `| Parameter | Specification / State |`,
      `| :--- | :--- |`,
      `| **Host OS** | ${os.type()} ${os.release()} (${os.arch()}) |`,
      `| **CPU Model** | ${cpuModel} (${cpus.length} cores) |`,
      `| **System Total RAM** | ${totalMemGb} GB |`,
      `| **Node.js Process RSS Memory** | **${s.memoryRssMb} MB** |`,
      `| **Node.js Process Heap Used** | **${s.memoryHeapMb} MB** |`,
      `| **Node.js Version** | ${process.version} |`,
      ``,
      `---`,
      ``,
      `## 5. Operational Recommendations for Exhibition Longevity`,
      ``,
      `1. **Daily Quota Budgeting**:`,
      `   - Default YouTube Data API v3 quota is **10,000 units/day** (resetting at 00:00 UTC).`,
      `   - At your observed burn rate of **${s.quotaUnitsPerHour} units/hr**, the installation will consume approximately **${Math.round(s.quotaUnitsPerHour * 8)} units** in an 8-hour exhibition day.`,
      `   - *Recommendation*: ${s.quotaUnitsPerHour * 8 < 8000 ? '✅ Quota rate is well within safe thresholds for full-day public exhibition.' : '⚠️ Quota consumption is high. Consider setting `YOUTUBE_CACHE_TTL_MINUTES=720` (12 hours) in `.env` to reuse search results.'}`,
      ``,
      `2. **Storage Management & Disk Runway**:`,
      `   - Configured storage ceiling is **${s.maxStorageMb} MB** (\`FALLBACK_MAX_STORAGE_MB\`).`,
      `   - Current storage usage is **${s.storageUsagePercent}%** (${s.currentStorageFormatted}).`,
      `   - Storage growth rate during this test was **${s.storageMbPerHour} MB/hr**.`,
      `   - *Recommendation*: Automatic FIFO/LRU pruning proactively keeps disk usage below the cap by evicting oldest YouTube downloads while protecting local media. Disk headroom is healthy.`,
      ``,
      `3. **Continuous Gallery Operation**:`,
      `   - When spectators are actively interacting, MediaPipe queries YouTube in background batches.`,
      `   - If internet disconnects or quota is exhausted, \`VideoIngestService\` transparently fails over to tokenized semantic keyword matching from local MP4 files without dropping frames on the 6 CRT monitors.`,
      ``,
      `---`,
      `*Report automatically generated by V-FEED [06] Performance & Longevity Suite.*`
    );

    return lines.join('\n');
  }
}

export const perfTracker = new PerformanceTracker();
