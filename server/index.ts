import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPlaylistRouter } from './routes/playlist.js';
import { createAdminRouter } from './routes/admin.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const isProd = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? 3000);

const app = express();
app.use(cors());
app.use(express.json());

const fallbackDir = path.join(root, 'public', 'fallback-videos');
const texturesDir = path.join(root, 'public', 'textures');
fs.mkdirSync(fallbackDir, { recursive: true });
fs.mkdirSync(texturesDir, { recursive: true });

app.use('/fallback-videos', express.static(fallbackDir));
app.use('/textures', express.static(texturesDir));
app.use('/api', createPlaylistRouter(fallbackDir));
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
  if (!isProd) {
    console.log('[v-feed] Vite client expected on http://localhost:5173');
  }
});
