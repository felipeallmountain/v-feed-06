import { Router } from 'express';

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>V-FEED [06] — Video Ingestion & Installation Control</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #090a0d;
      --surface: #12141a;
      --surface-border: #222633;
      --primary: #3ddc97;
      --accent: #ff0055;
      --cyan: #00e5ff;
      --text: #e8ecf2;
      --text-muted: #8a92a6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      background: var(--bg);
      color: var(--text);
      padding: 1.5rem 2rem;
      line-height: 1.5;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 1.25rem;
      border-bottom: 1px solid var(--surface-border);
      margin-bottom: 1.5rem;
    }
    h1 {
      font-size: 1.3rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--primary);
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    .badge {
      font-size: 0.7rem;
      padding: 0.2rem 0.5rem;
      border-radius: 3px;
      background: #1c2b23;
      color: var(--primary);
      border: 1px solid rgba(61, 220, 151, 0.3);
    }
    .badge.yt {
      background: #33111b;
      color: #ff5577;
      border-color: rgba(255, 85, 119, 0.3);
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
      margin-bottom: 1.5rem;
    }
    @media (max-width: 1024px) {
      .grid { grid-template-columns: 1fr; }
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--surface-border);
      border-radius: 6px;
      padding: 1.25rem;
    }
    .card h2 {
      font-size: 0.95rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--cyan);
      margin-bottom: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .btn-group {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    button, input[type="submit"] {
      background: #181c26;
      color: var(--text);
      border: 1px solid var(--surface-border);
      padding: 0.55rem 0.9rem;
      font-family: inherit;
      font-size: 0.85rem;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.15s ease;
    }
    button:hover {
      border-color: var(--primary);
      color: #fff;
      background: #202736;
    }
    button.active {
      background: #193326;
      border-color: var(--primary);
      color: var(--primary);
      font-weight: bold;
    }
    button.danger:hover {
      border-color: var(--accent);
      color: var(--accent);
    }
    .form-row {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
    }
    input[type="text"], input[type="number"] {
      flex: 1;
      background: #0d0f14;
      border: 1px solid var(--surface-border);
      color: var(--text);
      padding: 0.55rem 0.75rem;
      font-family: inherit;
      font-size: 0.85rem;
      border-radius: 4px;
    }
    input[type="text"]:focus, input[type="number"]:focus {
      outline: none;
      border-color: var(--cyan);
    }
    .progress-bar-wrap {
      background: #0d0f14;
      border: 1px solid var(--surface-border);
      border-radius: 4px;
      height: 12px;
      overflow: hidden;
      margin: 0.5rem 0;
    }
    .progress-bar-fill {
      background: linear-gradient(90deg, var(--cyan), var(--primary));
      height: 100%;
      width: 0%;
      transition: width 0.3s ease;
    }
    .status-box {
      background: #0d0f14;
      border: 1px solid var(--surface-border);
      padding: 0.75rem;
      border-radius: 4px;
      font-size: 0.8rem;
      color: var(--text-muted);
      margin-top: 0.5rem;
      min-height: 48px;
    }
    .video-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 0.75rem;
      font-size: 0.85rem;
    }
    .video-table th, .video-table td {
      padding: 0.6rem 0.75rem;
      text-align: left;
      border-bottom: 1px solid var(--surface-border);
    }
    .video-table th {
      color: var(--text-muted);
      font-size: 0.75rem;
      text-transform: uppercase;
    }
    .video-table tr:hover {
      background: rgba(255, 255, 255, 0.02);
    }
    .thumb {
      width: 48px;
      height: 48px;
      object-fit: cover;
      border-radius: 3px;
      border: 1px solid var(--surface-border);
    }
    .links-bar {
      margin-top: 1.5rem;
      font-size: 0.85rem;
      color: var(--text-muted);
      display: flex;
      gap: 1.5rem;
    }
    a { color: var(--primary); text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <header>
    <h1>V-FEED [06] <span>/ Control Deck</span></h1>
    <div>
      <span id="server-status" class="badge">Checking server...</span>
    </div>
  </header>

  <div class="grid">
    <!-- Remote Mode & Playback -->
    <div class="card">
      <h2>Remote Mode & Playback</h2>
      <div class="btn-group">
        <button id="btn-mode-live" data-mode="live">● Live (YouTube Ingested)</button>
        <button id="btn-mode-cache" data-mode="cache">Offline Cache (MP4)</button>
        <button id="btn-mode-grid" data-mode="grid">Test Grid (Calibration)</button>
      </div>
      <div class="btn-group" style="margin-top: 0.75rem;">
        <button id="btn-prev">⏮ Previous Video</button>
        <button id="btn-next">⏭ Next Video</button>
      </div>
      <div class="status-box" id="playback-status">Current Mode: live</div>
    </div>

    <!-- Live Ingestion Status -->
    <div class="card">
      <h2>
        <span>YouTube Ingestion Status</span>
        <span id="ingest-badge" class="badge">Idle</span>
      </h2>
      <div id="active-download-info" style="font-size: 0.85rem; margin-bottom: 0.35rem;">No active downloads.</div>
      <div class="progress-bar-wrap">
        <div id="download-progress" class="progress-bar-fill"></div>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted);" id="download-stats">
        <span>Ready: 0 videos</span>
        <span>Queue: 0</span>
      </div>
      <div class="status-box" id="ingest-log">Ready for ingestion.</div>
    </div>
  </div>

  <div class="grid">
    <!-- Automated Sync -->
    <div class="card">
      <h2>Automated Sync (Search or Playlist)</h2>
      <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.75rem;">
        Queries YouTube Data API v3 and downloads vertical shorts automatically using <code>yt-dlp</code>.
      </p>
      <form id="sync-form">
        <div class="form-row">
          <input type="text" id="search-topic" placeholder="Search query (e.g. vertical synthwave retro #shorts)" />
          <input type="number" id="max-videos" value="5" min="1" max="25" style="max-width: 80px;" title="Max videos" />
          <button type="submit" id="btn-sync-search">Sync Query</button>
        </div>
      </form>
      <form id="playlist-form">
        <div class="form-row">
          <input type="text" id="playlist-id" placeholder="Optional YouTube Playlist ID (e.g. PL...)" />
          <button type="submit" id="btn-sync-playlist">Sync Playlist</button>
        </div>
      </form>
    </div>

    <!-- Manual Single Ingest -->
    <div class="card">
      <h2>Ingest Single YouTube Video / Short</h2>
      <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.75rem;">
        Paste any direct YouTube URL, Shorts URL, or 11-char Video ID to ingest immediately.
      </p>
      <form id="single-form">
        <div class="form-row">
          <input type="text" id="single-url" placeholder="https://www.youtube.com/shorts/... or video ID" required />
          <button type="submit" id="btn-ingest-single">Ingest Video</button>
        </div>
      </form>
      <div id="single-status" style="font-size: 0.8rem; color: var(--text-muted);"></div>
    </div>
  </div>

  <!-- Ingested Library -->
  <div class="card">
    <h2>
      <span>Video Library (<span id="video-count">0</span>)</span>
      <button id="btn-refresh-lib" style="padding: 0.25rem 0.5rem; font-size: 0.75rem;">↻ Refresh</button>
    </h2>
    <div style="overflow-x: auto;">
      <table class="video-table">
        <thead>
          <tr>
            <th>Thumb</th>
            <th>Title & Channel</th>
            <th>Duration</th>
            <th>Source</th>
            <th>Size</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="video-list">
          <tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Loading video library...</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="links-bar">
    <a href="/" target="_blank">📺 Open Installation Window</a>
    <a href="/api/playlist" target="_blank">📄 /api/playlist</a>
    <a href="/api/ingest/status" target="_blank">⚡ /api/ingest/status</a>
  </div>

  <script>
    const serverStatus = document.getElementById('server-status');
    const ingestBadge = document.getElementById('ingest-badge');
    const activeDlInfo = document.getElementById('active-download-info');
    const dlProgress = document.getElementById('download-progress');
    const dlStats = document.getElementById('download-stats');
    const ingestLog = document.getElementById('ingest-log');
    const playbackStatus = document.getElementById('playback-status');
    const videoList = document.getElementById('video-list');
    const videoCount = document.getElementById('video-count');

    // Video Mode Overrides
    document.querySelectorAll('button[data-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-mode');
        localStorage.setItem('vfeed-video-mode', mode);
        localStorage.setItem('vfeed-video-mode-ts', String(Date.now()));
        updateActiveModeButtons(mode);
        playbackStatus.textContent = 'Set video mode → ' + mode;
      });
    });

    document.getElementById('btn-next').addEventListener('click', () => {
      localStorage.setItem('vfeed-remote-action', 'next');
      localStorage.setItem('vfeed-remote-action-ts', String(Date.now()));
      playbackStatus.textContent = 'Triggered next video';
    });

    document.getElementById('btn-prev').addEventListener('click', () => {
      localStorage.setItem('vfeed-remote-action', 'prev');
      localStorage.setItem('vfeed-remote-action-ts', String(Date.now()));
      playbackStatus.textContent = 'Triggered prev video';
    });

    function updateActiveModeButtons(mode) {
      document.querySelectorAll('button[data-mode]').forEach(btn => {
        if (btn.getAttribute('data-mode') === mode) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    const currentMode = localStorage.getItem('vfeed-video-mode') || 'live';
    updateActiveModeButtons(currentMode);

    // Sync Form
    document.getElementById('sync-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const topic = document.getElementById('search-topic').value.trim();
      const max = document.getElementById('max-videos').value;
      ingestLog.textContent = 'Starting YouTube search sync...';
      try {
        const res = await fetch('/api/ingest/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ searchTopic: topic || undefined, maxVideos: max ? Number(max) : undefined })
        });
        const data = await res.json();
        if (data.ok) {
          ingestLog.textContent = 'Sync queued: ' + data.queued + ' new videos (already cached: ' + data.alreadyCached + ')';
        } else {
          ingestLog.textContent = 'Sync error: ' + (data.error || 'Failed');
        }
      } catch (err) {
        ingestLog.textContent = 'Sync request failed: ' + err.message;
      }
    });

    // Playlist Form
    document.getElementById('playlist-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pl = document.getElementById('playlist-id').value.trim();
      if (!pl) return;
      ingestLog.textContent = 'Starting YouTube playlist sync...';
      try {
        const res = await fetch('/api/ingest/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playlistId: pl })
        });
        const data = await res.json();
        if (data.ok) {
          ingestLog.textContent = 'Playlist sync queued: ' + data.queued + ' new videos';
        } else {
          ingestLog.textContent = 'Sync error: ' + (data.error || 'Failed');
        }
      } catch (err) {
        ingestLog.textContent = 'Playlist request failed: ' + err.message;
      }
    });

    // Single Ingest Form
    document.getElementById('single-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const urlOrId = document.getElementById('single-url').value.trim();
      const statusEl = document.getElementById('single-status');
      if (!urlOrId) return;
      statusEl.textContent = 'Ingesting video...';
      try {
        const res = await fetch('/api/ingest/video', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urlOrId })
        });
        const data = await res.json();
        if (data.ok) {
          statusEl.textContent = '✓ Successfully ingested: ' + (data.video?.title || urlOrId);
          document.getElementById('single-url').value = '';
          fetchLibrary();
        } else {
          statusEl.textContent = '✗ Error: ' + (data.error || 'Failed');
        }
      } catch (err) {
        statusEl.textContent = '✗ Request error: ' + err.message;
      }
    });

    // Refresh Library
    document.getElementById('btn-refresh-lib').addEventListener('click', fetchLibrary);

    async function fetchLibrary() {
      try {
        const res = await fetch('/api/playlist');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        const all = [...(data.live || []), ...(data.cache || [])];
        const unique = Array.from(new Map(all.map(v => [v.id, v])).values());

        videoCount.textContent = String(unique.length);
        if (unique.length === 0) {
          videoList.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">No videos ingested yet. Use the sync buttons above.</td></tr>';
          return;
        }

        videoList.innerHTML = unique.map(v => {
          const isYt = v.source === 'youtube';
          const sizeMb = v.fileSize ? (v.fileSize / (1024 * 1024)).toFixed(1) + ' MB' : '--';
          const thumb = v.thumbnail || '/textures/noise.png';
          return '<tr>' +
            '<td><img class="thumb" src="' + thumb + '" alt="" onerror="this.src=\\'/textures/noise.png\\'" /></td>' +
            '<td><strong>' + escapeHtml(v.title) + '</strong><br><small style="color:var(--text-muted);">' + escapeHtml(v.channelTitle || '') + '</small></td>' +
            '<td>' + (v.durationFormatted || '--') + '</td>' +
            '<td><span class="badge ' + (isYt ? 'yt' : '') + '">' + (isYt ? 'YouTube' : 'Local') + '</span></td>' +
            '<td>' + sizeMb + '</td>' +
            '<td>' +
              '<button onclick="playVideo(\\'' + encodeURIComponent(v.url) + '\\')">▶ Play</button> ' +
              '<button class="danger" onclick="deleteVideo(\\'' + encodeURIComponent(v.id) + '\\')">✕</button>' +
            '</td>' +
          '</tr>';
        }).join('');
      } catch (err) {
        videoList.innerHTML = '<tr><td colspan="6" style="color:var(--accent);">Failed to load library: ' + err.message + '</td></tr>';
      }
    }

    window.playVideo = function(url) {
      localStorage.setItem('vfeed-play-url', decodeURIComponent(url));
      localStorage.setItem('vfeed-play-url-ts', String(Date.now()));
      playbackStatus.textContent = 'Sent play signal for: ' + decodeURIComponent(url);
    };

    window.deleteVideo = async function(id) {
      if (!confirm('Delete this cached video?')) return;
      try {
        const res = await fetch('/api/videos/' + id, { method: 'DELETE' });
        const d = await res.json();
        if (d.ok) {
          fetchLibrary();
        }
      } catch (err) {
        alert('Delete failed: ' + err.message);
      }
    };

    function escapeHtml(str) {
      return String(str || '').replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      })[m]);
    }

    // Live Ingest Poller
    async function pollIngestStatus() {
      try {
        const res = await fetch('/api/ingest/status');
        if (!res.ok) return;
        const s = await res.json();

        if (s.isIngesting) {
          ingestBadge.textContent = 'Ingesting';
          ingestBadge.style.background = '#331900';
          ingestBadge.style.color = '#ffaa00';
          ingestBadge.style.borderColor = 'rgba(255,170,0,0.4)';
        } else {
          ingestBadge.textContent = 'Idle';
          ingestBadge.style.background = '#1c2b23';
          ingestBadge.style.color = '#3ddc97';
          ingestBadge.style.borderColor = 'rgba(61,220,151,0.3)';
        }

        if (s.activeDownload) {
          const ad = s.activeDownload;
          activeDlInfo.textContent = '↓ ' + ad.title + ' (' + ad.progressPercent.toFixed(1) + '% · ' + ad.speed + ' · ETA ' + ad.eta + ')';
          dlProgress.style.width = ad.progressPercent + '%';
        } else {
          activeDlInfo.textContent = s.isIngesting ? 'Preparing download...' : 'No active download.';
          dlProgress.style.width = '0%';
        }

        dlStats.innerHTML = '<span>Ready: ' + s.readyCount + ' videos</span><span>Queue: ' + s.queueLength + ' remaining</span>';

        if (s.lastError) {
          ingestLog.textContent = '⚠ ' + s.lastError;
          ingestLog.style.color = 'var(--accent)';
        } else if (s.lastSyncedAt) {
          ingestLog.textContent = 'Last synced: ' + new Date(s.lastSyncedAt).toLocaleTimeString();
          ingestLog.style.color = 'var(--text-muted)';
        }
      } catch (err) {
        /* ignore */
      }
    }

    // Health check
    fetch('/api/health')
      .then(r => r.json())
      .then(j => {
        serverStatus.textContent = 'Online · ' + j.service;
      })
      .catch(() => {
        serverStatus.textContent = 'Server Offline';
        serverStatus.style.color = 'var(--accent)';
      });

    fetchLibrary();
    setInterval(pollIngestStatus, 1500);
    setInterval(fetchLibrary, 10000);
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
