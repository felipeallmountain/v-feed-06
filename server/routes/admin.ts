import { Router } from 'express';

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>V-FEED [06] Admin</title>
  <style>
    :root { color-scheme: dark; }
    body {
      margin: 0;
      font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      background: #0b0b0b;
      color: #e8e4d9;
      padding: 2rem;
      line-height: 1.5;
    }
    h1 { font-size: 1.25rem; letter-spacing: 0.08em; text-transform: uppercase; }
    a { color: #3ddc97; }
    code { background: #1a1a1a; padding: 0.1rem 0.35rem; }
    .card {
      border: 1px solid #2a2a2a;
      padding: 1.25rem;
      max-width: 42rem;
      margin-top: 1.5rem;
    }
    button {
      background: #1f1f1f;
      color: #e8e4d9;
      border: 1px solid #3a3a3a;
      padding: 0.55rem 0.9rem;
      cursor: pointer;
      margin-right: 0.5rem;
      margin-top: 0.5rem;
    }
    button:hover { border-color: #3ddc97; }
    #status { margin-top: 1rem; opacity: 0.8; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>V-FEED [06] / Admin</h1>
  <p>Calibration HUD lives in the installation window. Press <code>H</code> or <code>Ctrl+Shift+C</code> on the kiosk display.</p>
  <div class="card">
    <p>Remote video-mode overrides (broadcast to open kiosk tabs via <code>localStorage</code>):</p>
    <button data-mode="cache">Cache</button>
    <button data-mode="live">Live</button>
    <button data-mode="grid">Test Grid</button>
    <div id="status">Idle</div>
  </div>
  <p style="margin-top:1.5rem"><a href="/">Open installation</a> · <a href="/api/playlist">Playlist JSON</a> · <a href="/api/cache">Cache JSON</a></p>
  <script>
    const status = document.getElementById('status');
    document.querySelectorAll('button[data-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        localStorage.setItem('vfeed-video-mode', mode);
        localStorage.setItem('vfeed-video-mode-ts', String(Date.now()));
        status.textContent = 'Set video mode → ' + mode;
      });
    });
    fetch('/api/health').then(r => r.json()).then(j => {
      status.textContent = 'Server OK · ' + j.service;
    }).catch(() => { status.textContent = 'Server unreachable'; });
  </script>
</body>
</html>`;

export function createAdminRouter(): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.type('html').send(ADMIN_HTML);
  });
  return router;
}
