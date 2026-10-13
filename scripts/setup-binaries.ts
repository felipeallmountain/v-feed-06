import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const binDir = path.join(rootDir, 'bin');

export function getYtDlpAssetInfo(): { filename: string; assetName: string } {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'win32') {
    return { filename: 'yt-dlp.exe', assetName: 'yt-dlp.exe' };
  } else if (platform === 'darwin') {
    return { filename: 'yt-dlp', assetName: 'yt-dlp_macos' };
  } else if (platform === 'linux') {
    if (arch === 'arm64') {
      return { filename: 'yt-dlp', assetName: 'yt-dlp_linux_aarch64' };
    }
    return { filename: 'yt-dlp', assetName: 'yt-dlp_linux' };
  }
  return { filename: 'yt-dlp', assetName: 'yt-dlp' };
}

export function getLocalYtDlpPath(): string {
  const { filename } = getYtDlpAssetInfo();
  return path.join(binDir, filename);
}

export async function downloadYtDlp(force = false): Promise<string> {
  const { filename, assetName } = getYtDlpAssetInfo();
  const targetPath = path.join(binDir, filename);

  if (!force && fs.existsSync(targetPath)) {
    try {
      const { stdout } = await execFileAsync(targetPath, ['--version']);
      console.log(`[setup-binaries] Local yt-dlp already present (${stdout.trim()}) at ${targetPath}`);
      return targetPath;
    } catch {
      console.warn('[setup-binaries] Existing yt-dlp binary seems broken, re-downloading...');
    }
  }

  fs.mkdirSync(binDir, { recursive: true });
  const downloadUrl = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${assetName}`;
  console.log(`[setup-binaries] Downloading latest yt-dlp from: ${downloadUrl}`);

  const tempPath = `${targetPath}.tmp`;
  const response = await fetch(downloadUrl, {
    redirect: 'follow',
    headers: { 'User-Agent': 'v-feed-06-downloader' },
  });

  if (!response.ok || !response.body) {
    throw new Error(`Failed to download yt-dlp: HTTP ${response.status} ${response.statusText}`);
  }

  // Stream response body to disk
  // @ts-expect-error Node.js Readable from Web Stream
  const nodeReadable = Readable.fromWeb(response.body);
  const fileStream = fs.createWriteStream(tempPath);
  await pipeline(nodeReadable, fileStream);

  // Set executable permissions (0755) on macOS / Linux
  if (process.platform !== 'win32') {
    fs.chmodSync(tempPath, 0o755);
  }

  // Atomically rename
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }
  fs.renameSync(tempPath, targetPath);

  // Verify binary runs
  const { stdout } = await execFileAsync(targetPath, ['--version']);
  console.log(`[setup-binaries] Successfully installed local yt-dlp ${stdout.trim()} to ${targetPath}`);

  return targetPath;
}

// Auto-run if executed directly as a script
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const isForce = process.argv.includes('--force');
  downloadYtDlp(isForce)
    .then((installedPath) => {
      console.log(`[setup-binaries] yt-dlp ready: ${installedPath}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[setup-binaries] Failed to set up local yt-dlp binary:', err);
      // Exit cleanly on postinstall so npm install doesn't fail if offline, but notify operator
      if (process.env.npm_lifecycle_event === 'postinstall') {
        console.warn('[setup-binaries] Postinstall notice: yt-dlp will be downloaded on first launch or fallback to system binary.');
        process.exit(0);
      }
      process.exit(1);
    });
}
