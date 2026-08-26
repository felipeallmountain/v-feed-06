import 'dotenv/config';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlaylistRouter } from './routes/playlist.js';
import { createAdminRouter } from './routes/admin.js';
import { createCalibrationRouter } from './routes/calibration.js';
import { VideoIngestService } from './services/VideoIngestService.js';
import { YouTubeDataService } from './services/YouTubeDataService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Explicitly load .env from root to ensure process.env is always populated
dotenv.config({ path: path.join(root, '.env') });

const isProd = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? 3000);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const fallbackDir = path.join(root, 'public', 'fallback-videos');
const texturesDir = path.join(root, 'public', 'textures');
const configDir = path.join(root, 'config');
fs.mkdirSync(fallbackDir, { recursive: true });
fs.mkdirSync(texturesDir, { recursive: true });
fs.mkdirSync(configDir, { recursive: true });

// Initialize YouTube and Ingest services
const youtubeService = new YouTubeDataService();
const ingestService = new VideoIngestService(fallbackDir, youtubeService);

app.use('/fallback-videos', express.static(fallbackDir));
app.use('/textures', express.static(texturesDir));
app.use('/api', createPlaylistRouter(fallbackDir, ingestService));
app.use('/api', createCalibrationRouter(configDir, path.join(root, 'public')));
app.use('/admin', createAdminRouter());

if (isProd) {
  const dist = path.join(root, 'dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(dist, 'index.html'));
  });
}

app.listen(port, () => {
  console.log(`[v-feed] server listening on http://localhost:${port}`);
  console.log(`[v-feed] Control deck available at http://localhost:${port}/admin`);
  if (!isProd) {
    console.log('[v-feed] Vite client expected on http://localhost:5173');
  }

  // Automatic YouTube Ingestion Sync on startup
  const autoSync = process.env.YOUTUBE_AUTO_SYNC !== 'false';
  if (autoSync && youtubeService.isConfigured) {
    console.log('[v-feed] Starting background YouTube video ingestion sync...');
    ingestService.sync().catch((err) => {
      console.warn('[v-feed] Background YouTube sync error:', err);
    });
  }
});
