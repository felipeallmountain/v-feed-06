import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const fallbackDir = path.join(root, 'public', 'fallback-videos');
const configDir = path.join(root, 'config');
const manifestPath = path.join(fallbackDir, 'manifest.json');
const apiCachePath = path.join(configDir, 'youtube-api-cache.json');
const quotaTrackerPath = path.join(configDir, 'quota-tracker.json');

export interface ClearCacheResult {
  deletedVideos: string[];
  reclaimedBytes: number;
  reclaimedFormatted: string;
  clearedApiCache: boolean;
  resetQuotaTracker: boolean;
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function clearVideoAndApiCache(): ClearCacheResult {
  const deletedVideos: string[] = [];
  let reclaimedBytes = 0;

  // 1. Clean video files in public/fallback-videos/
  if (fs.existsSync(fallbackDir)) {
    const files = fs.readdirSync(fallbackDir);
    const videoExtensions = new Set(['.mp4', '.webm', '.mov', '.mkv']);

    for (const file of files) {
      if (file === '.gitkeep' || file === 'manifest.json') continue;

      const ext = path.extname(file).toLowerCase();
      const isVideo = videoExtensions.has(ext);
      const isTemp = file.startsWith('temp_') || file.endsWith('.part') || file.endsWith('.ytdl') || file.endsWith('.tmp');

      if (isVideo || isTemp) {
        const fullPath = path.join(fallbackDir, file);
        try {
          const stat = fs.statSync(fullPath);
          fs.unlinkSync(fullPath);
          deletedVideos.push(file);
          reclaimedBytes += stat.size;
        } catch (err) {
          console.warn(`[clear-cache] Warning: could not delete ${file}:`, err);
        }
      }
    }
  }

  // 2. Reset manifest.json
  try {
    fs.mkdirSync(fallbackDir, { recursive: true });
    const emptyManifest = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      videos: [],
    };
    fs.writeFileSync(manifestPath, JSON.stringify(emptyManifest, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[clear-cache] Failed to reset manifest.json:', err);
  }

  // 3. Clear YouTube API disk cache
  let clearedApiCache = false;
  try {
    if (fs.existsSync(apiCachePath)) {
      fs.writeFileSync(apiCachePath, JSON.stringify({}, null, 2), 'utf-8');
      clearedApiCache = true;
    }
  } catch (err) {
    console.warn('[clear-cache] Failed to clear youtube-api-cache.json:', err);
  }

  // 4. Reset quota tracker to baseline
  let resetQuotaTracker = false;
  try {
    if (fs.existsSync(quotaTrackerPath)) {
      const today = new Date().toISOString().slice(0, 10);
      const resetQuota = {
        date: today,
        unitsUsed: 0,
        searchCalls: 0,
        videoDetailsCalls: 0,
        playlistCalls: 0,
        cacheHits: 0,
        manualOverride: false,
        lastResetUtc: new Date().toISOString(),
      };
      fs.writeFileSync(quotaTrackerPath, JSON.stringify(resetQuota, null, 2), 'utf-8');
      resetQuotaTracker = true;
    }
  } catch (err) {
    console.warn('[clear-cache] Failed to reset quota-tracker.json:', err);
  }

  return {
    deletedVideos,
    reclaimedBytes,
    reclaimedFormatted: formatBytes(reclaimedBytes),
    clearedApiCache,
    resetQuotaTracker,
  };
}

// Execute directly if run via CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log('====================================================');
  console.log('  V-FEED [06] — Local Cache & Video Purge');
  console.log('====================================================\n');

  const result = clearVideoAndApiCache();

  console.log(`✓ Deleted ${result.deletedVideos.length} cached video/temp file(s)`);
  console.log(`✓ Reclaimed disk space: ${result.reclaimedFormatted}`);
  console.log(`✓ Manifest reset: ${manifestPath}`);
  console.log(`✓ YouTube API disk cache cleared: ${result.clearedApiCache ? 'Yes' : 'Not found'}`);
  console.log(`✓ Quota tracker reset: ${result.resetQuotaTracker ? 'Yes' : 'Not found'}`);
  console.log('\n[Done] System is ready for a clean performance test run.\n');
}
