import type { CameraStartResult } from './CameraManager';
import { CameraManager } from './CameraManager';

export interface CameraEnvironmentReport {
  href: string;
  host: string;
  secure: boolean;
  mediaDevices: boolean;
  permission: PermissionState | 'unknown' | 'unsupported';
  embedded: boolean;
  likelyPreviewBrowser: boolean;
  lines: string[];
}

/** Diagnose why Chrome may hide the camera address-bar control. */
export async function probeCameraEnvironment(): Promise<CameraEnvironmentReport> {
  const secure = CameraManager.isSecure();
  const mediaDevices = CameraManager.isSupported();
  const embedded = window.self !== window.top;
  const ua = navigator.userAgent;
  const brands =
    'userAgentData' in navigator &&
    navigator.userAgentData &&
    Array.isArray(
      (navigator.userAgentData as { brands?: Array<{ brand: string }> }).brands,
    )
      ? (navigator.userAgentData as { brands: Array<{ brand: string }> }).brands
          .map((b) => b.brand)
          .join(', ')
      : ua.slice(0, 64);

  // Cursor Simple Browser / embedded webviews often lack a real permission UI
  const likelyPreviewBrowser =
    embedded ||
    /Cursor/i.test(ua) ||
    /Electron/i.test(ua);

  let permission: CameraEnvironmentReport['permission'] = 'unknown';
  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({
        name: 'camera' as PermissionName,
      });
      permission = status.state;
    } else {
      permission = 'unsupported';
    }
  } catch {
    permission = 'unsupported';
  }

  const lines = [
    `URL: ${location.href}`,
    `Secure context: ${secure ? 'yes' : 'NO — camera blocked'}`,
    `mediaDevices: ${mediaDevices ? 'yes' : 'NO'}`,
    `Permission API: ${permission}`,
    `Embedded iframe: ${embedded ? 'YES' : 'no'}`,
    likelyPreviewBrowser
      ? 'Browser: preview/webview suspected — open in Chrome'
      : `Browser: ${brands}`,
  ];

  if (!secure) {
    lines.push('Fix: open http://localhost:5173 in Chrome (not file:// or raw LAN IP).');
  }
  if (permission === 'denied') {
    lines.push(
      'Fix: chrome://settings/content/camera → allow localhost',
      'Also: macOS System Settings → Privacy & Security → Camera → enable Google Chrome',
    );
  }
  if (likelyPreviewBrowser || embedded) {
    lines.push('Fix: copy URL into Google Chrome / Edge (system browser).');
  }

  return {
    href: location.href,
    host: location.host,
    secure,
    mediaDevices,
    permission,
    embedded,
    likelyPreviewBrowser,
    lines,
  };
}

export function formatCameraError(result: Extract<CameraStartResult, { ok: false }>): string {
  const extra =
    result.reason === 'denied'
      ? `\n\nChrome: chrome://settings/content/camera\nmacOS: System Settings → Privacy & Security → Camera → Google Chrome`
      : '';
  return `${result.message}${extra}`;
}
