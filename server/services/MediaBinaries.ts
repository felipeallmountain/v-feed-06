import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import ffmpegStatic from 'ffmpeg-static';
import { downloadYtDlp, getLocalYtDlpPath } from '../../scripts/setup-binaries.js';

const execFileAsync = promisify(execFile);

export interface MediaBinaries {
  ytDlpPath: string;
  ffmpegPath: string | null;
  spawnEnv: NodeJS.ProcessEnv;
}

let cachedBinaries: MediaBinaries | null = null;

/**
 * Checks if a command or binary is executable and returns its version or null if unavailable.
 */
async function testExecutable(binPath: string, testArg = '--version'): Promise<boolean> {
  try {
    await execFileAsync(binPath, [testArg]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolves local project or system ffmpeg and yt-dlp binaries.
 * Prioritizes local project dependencies:
 * - ffmpeg via `ffmpeg-static`
 * - yt-dlp via `./bin/yt-dlp` (auto-downloading if missing)
 */
export async function resolveMediaBinaries(forceRefresh = false): Promise<MediaBinaries> {
  if (cachedBinaries && !forceRefresh) {
    return cachedBinaries;
  }

  // 1. Resolve ffmpeg (prefer ffmpeg-static, fallback to system PATH)
  let resolvedFfmpeg: string | null = null;
  if (typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic)) {
    resolvedFfmpeg = ffmpegStatic;
  } else if (await testExecutable('ffmpeg', '-version')) {
    resolvedFfmpeg = 'ffmpeg';
  }

  // 2. Resolve yt-dlp (prefer ./bin/yt-dlp, then system PATH, then auto-download)
  const localYtDlp = getLocalYtDlpPath();
  let resolvedYtDlp: string | null = null;

  if (fs.existsSync(localYtDlp) && (await testExecutable(localYtDlp))) {
    resolvedYtDlp = localYtDlp;
  } else if (await testExecutable('yt-dlp')) {
    resolvedYtDlp = 'yt-dlp';
  } else {
    console.log('[v-feed] Local yt-dlp binary not found. Triggering automated download...');
    try {
      resolvedYtDlp = await downloadYtDlp();
    } catch (err) {
      console.error('[v-feed] Failed to auto-download yt-dlp:', err);
      // Fallback to command name in case PATH is updated later
      resolvedYtDlp = 'yt-dlp';
    }
  }

  // 3. Build merged PATH environment variable so yt-dlp sub-processes find ffmpeg
  const extraPaths: string[] = [];
  if (resolvedFfmpeg && path.isAbsolute(resolvedFfmpeg)) {
    extraPaths.push(path.dirname(resolvedFfmpeg));
  }
  if (resolvedYtDlp && path.isAbsolute(resolvedYtDlp)) {
    extraPaths.push(path.dirname(resolvedYtDlp));
  }

  const pathDelimiter = process.platform === 'win32' ? ';' : ':';
  const existingPath = process.env.PATH || '';
  const mergedPath = [...extraPaths, existingPath].filter(Boolean).join(pathDelimiter);

  const spawnEnv: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: mergedPath,
  };

  cachedBinaries = {
    ytDlpPath: resolvedYtDlp,
    ffmpegPath: resolvedFfmpeg,
    spawnEnv,
  };

  return cachedBinaries;
}
