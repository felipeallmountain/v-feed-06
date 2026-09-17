import readline from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PerformanceStatus } from '../server/services/PerformanceTracker.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const PORT = process.env.PORT || 3000;
const SERVER_URL = `http://localhost:${PORT}`;

async function isServerReachable(): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/api/health`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function startPerfSession(clearCache = false): Promise<boolean> {
  try {
    const res = await fetch(`${SERVER_URL}/api/perf/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clearCache,
        note: `Interactive CLI test session on ${new Date().toLocaleString()}`,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function stopPerfSession(): Promise<{ ok: boolean; reportPath?: string; summary?: PerformanceStatus }> {
  try {
    const res = await fetch(`${SERVER_URL}/api/perf/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch (err) {
    return { ok: false };
  }
}

async function fetchPerfStatus(): Promise<PerformanceStatus | null> {
  try {
    const res = await fetch(`${SERVER_URL}/api/perf/status`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.status || null;
  } catch {
    return null;
  }
}

function renderDashboard(status: PerformanceStatus) {
  // Clear screen and move cursor to top-left
  process.stdout.write('\x1b[2J\x1b[0;0H');

  const line = '═'.repeat(74);
  const thinLine = '─'.repeat(74);

  const statusBadge = status.isRunning ? '\x1b[42m\x1b[30m RUNNING \x1b[0m' : '\x1b[43m\x1b[30m STOPPED \x1b[0m';
  const quotaColor = status.quotaUnitsPerHour > 1200 ? '\x1b[33m' : '\x1b[32m';

  console.log(`\x1b[1m${line}\x1b[0m`);
  console.log(`\x1b[1m  V-FEED [06] — Performance & Longevity Test Monitor  ${statusBadge}\x1b[0m`);
  console.log(`\x1b[1m${line}\x1b[0m`);
  console.log(`  ⏱️  Elapsed Time       : \x1b[1m\x1b[36m${status.elapsedFormatted}\x1b[0m (Started: ${status.startTime ? new Date(status.startTime).toLocaleTimeString() : '--'})`);
  console.log(`  💻 Host Memory        : RSS \x1b[1m${status.memoryRssMb} MB\x1b[0m | Heap \x1b[1m${status.memoryHeapMb} MB\x1b[0m`);
  console.log(`${thinLine}`);
  console.log(`  \x1b[1m📡 YouTube Data API v3 Traffic\x1b[0m`);
  console.log(`     Total HTTP Requests : \x1b[1m${status.totalRequests}\x1b[0m (Rate: \x1b[1m${status.requestsPerHour} req/hr\x1b[0m)`);
  console.log(`     • Search Calls      : ${status.searchCalls} (100 units each)`);
  console.log(`     • Video Details     : ${status.videoDetailsCalls} (1 unit/chunk)`);
  console.log(`     • Playlist Calls    : ${status.playlistCalls} (1 unit/page)`);
  console.log(`     • Disk Cache Hits   : \x1b[1m\x1b[32m${status.cacheHits} hits\x1b[0m (\x1b[32m${(status.cacheHits * 100).toLocaleString()} units saved!\x1b[0m)`);
  console.log(`     • API Failures      : ${status.apiErrors > 0 ? `\x1b[31m${status.apiErrors}\x1b[0m` : '0'}`);
  console.log(`     Quota Burn Rate     : ${quotaColor}${status.quotaUnitsPerHour} units/hr\x1b[0m (Total: \x1b[1m${status.totalQuotaUnits}\x1b[0m units burned)`);
  console.log(`     Projected Quota Cap : \x1b[1m~${status.projectedHoursUntilQuotaCap} hours\x1b[0m until daily limit`);
  console.log(`${thinLine}`);
  console.log(`  \x1b[1m📹 Video Ingestion & Storage\x1b[0m`);
  console.log(`     Videos Saved        : \x1b[1m\x1b[32m+${status.videosDownloadedCount} new videos\x1b[0m during test (Total on disk: \x1b[1m${status.currentVideoCount}\x1b[0m)`);
  console.log(`     Ingestion Rate      : \x1b[1m${status.videosPerHour} videos/hr\x1b[0m`);
  console.log(`     Disk Storage Used   : \x1b[1m${status.currentStorageFormatted}\x1b[0m / ${status.maxStorageMb} MB (\x1b[1m${status.storageUsagePercent}%\x1b[0m)`);
  console.log(`     Storage Added       : \x1b[1m+${status.addedStorageFormatted}\x1b[0m (Rate: \x1b[1m${status.storageMbPerHour} MB/hr\x1b[0m)`);
  console.log(`     Projected Cap Time  : \x1b[1m~${status.projectedHoursUntilStorageCap} hours\x1b[0m until auto-prune limit`);
  console.log(`${thinLine}`);

  if (status.recentVideos && status.recentVideos.length > 0) {
    console.log(`  \x1b[1mRecent Video Ingests:\x1b[0m`);
    status.recentVideos.slice(0, 3).forEach((v) => {
      console.log(`    ✓ \x1b[33m[${v.fileSizeFormatted}]\x1b[0m ${v.title.slice(0, 42)} (${v.downloadDurationSec}s download)`);
    });
  } else {
    console.log(`  \x1b[90m(Awaiting video downloads or playing from cache...)\x1b[0m`);
  }

  console.log(`\x1b[1m${line}\x1b[0m`);
  console.log(`  \x1b[1m\x1b[41m\x1b[37m  PRESS [q] TO STOP TEST & GENERATE REPORT DOCUMENT  \x1b[0m`);
  console.log(`\x1b[1m${line}\x1b[0m`);
}

async function main() {
  const args = process.argv.slice(2);
  const clearCacheFlag = args.includes('--clear') || args.includes('-c');

  console.log('\nStarting V-FEED [06] Performance & Longevity Suite...');
  console.log(`Checking backend server on ${SERVER_URL}...`);

  let reachable = await isServerReachable();
  if (!reachable) {
    console.log(`\x1b[33m[!] Server not detected on ${SERVER_URL}.\x1b[0m`);
    console.log('Please make sure the server is running in another window:');
    console.log('  \x1b[36mnpm run dev\x1b[0m  or  \x1b[36mnpm run dev:server\x1b[0m\n');
    console.log('Waiting for server connection...');

    let attempts = 0;
    while (!reachable && attempts < 30) {
      await new Promise((r) => setTimeout(r, 1000));
      reachable = await isServerReachable();
      attempts++;
    }

    if (!reachable) {
      console.error('\x1b[31m[Error] Timed out waiting for server. Exiting.\x1b[0m');
      process.exit(1);
    }
  }

  console.log('\x1b[32m✓ Connected to V-FEED backend!\x1b[0m');

  // Start the performance tracking session
  const started = await startPerfSession(clearCacheFlag);
  if (!started) {
    console.error('\x1b[31m[Error] Failed to initialize performance test session on server.\x1b[0m');
    process.exit(1);
  }

  console.log('\x1b[32m✓ Performance test session active. Launching live dashboard...\x1b[0m\n');
  await new Promise((r) => setTimeout(r, 800));

  // Configure raw keyboard input for interactive 'q' key
  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.resume();
  }

  let stopping = false;

  const handleStop = async () => {
    if (stopping) return;
    stopping = true;

    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    console.log('\n\n\x1b[1m\x1b[33m[Stopping] Finalizing performance test session and writing report document...\x1b[0m');

    const result = await stopPerfSession();

    process.stdout.write('\x1b[2J\x1b[0;0H');
    console.log('════════════════════════════════════════════════════════════════════════════');
    console.log('  \x1b[1m\x1b[32m✓ V-FEED [06] PERFORMANCE & LONGEVITY TEST COMPLETED\x1b[0m');
    console.log('════════════════════════════════════════════════════════════════════════════\n');

    if (result.ok && result.summary) {
      const s = result.summary;
      console.log(`  ⏱️  Total Duration      : \x1b[1m${s.elapsedFormatted}\x1b[0m (${s.elapsedSec}s)`);
      console.log(`  📡 YouTube API Calls   : \x1b[1m${s.totalRequests}\x1b[0m (${s.requestsPerHour} req/hr)`);
      console.log(`  ⚡ Quota Units Burned  : \x1b[1m${s.totalQuotaUnits}\x1b[0m units (${s.quotaUnitsPerHour} units/hr)`);
      console.log(`  🎯 Local Cache Hits    : \x1b[1m${s.cacheHits}\x1b[0m hits (0 quota consumed)`);
      console.log(`  📹 Videos Saved        : \x1b[1m${s.videosDownloadedCount}\x1b[0m video(s) downloaded`);
      console.log(`  💾 Storage Growth      : \x1b[1m+${s.addedStorageFormatted}\x1b[0m (Current total: ${s.currentStorageFormatted})`);
      console.log(`  🚀 Quota Runway (8h)   : \x1b[1m~${s.projectedHoursUntilQuotaCap} hours\x1b[0m estimated daily runway\n`);
    }

    if (result.reportPath) {
      console.log(`  📄 \x1b[1mReport Document Saved Successfully:\x1b[0m`);
      console.log(`     \x1b[36m${result.reportPath}\x1b[0m`);
      console.log(`     \x1b[36m${path.join(root, 'reports', 'perf-report-latest.md')}\x1b[0m\n`);
    }

    console.log('════════════════════════════════════════════════════════════════════════════\n');
    process.exit(0);
  };

  process.stdin.on('keypress', (_str, key) => {
    if (key.ctrl && key.name === 'c') {
      void handleStop();
    } else if (key.name === 'q' || key.name === 'Q') {
      void handleStop();
    }
  });

  // Polling loop
  const interval = setInterval(async () => {
    if (stopping) return;
    const status = await fetchPerfStatus();
    if (status) {
      if (!status.isRunning) {
        clearInterval(interval);
        void handleStop();
        return;
      }
      renderDashboard(status);
    }
  }, 2000);

  // Initial render
  const initialStatus = await fetchPerfStatus();
  if (initialStatus) {
    renderDashboard(initialStatus);
  }
}

main().catch((err) => {
  console.error('\nFatal error in perf-test:', err);
  process.exit(1);
});
