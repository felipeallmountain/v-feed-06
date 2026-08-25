import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { VideoIngestService, type IngestedVideo } from '../services/VideoIngestService.js';

export function createPlaylistRouter(
  fallbackDir: string,
  ingestService: VideoIngestService,
): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'v-feed-06' });
  });

  /**
   * Returns current live and cached playlists with rich metadata.
   */
  router.get('/playlist', (_req, res) => {
    const readyVideos = ingestService.getReadyVideos();
    const liveItems = readyVideos
      .filter((v) => v.source === 'youtube')
      .map(formatPlayableItem);

    const cacheItems = readyVideos
      .filter((v) => v.source === 'local')
      .map(formatPlayableItem);

    // If no local-only files exist, allow live items as cache fallback
    const effectiveCache = cacheItems.length > 0 ? cacheItems : liveItems;

    res.json({
      mode: liveItems.length > 0 ? 'live' : 'cache',
      live: liveItems,
      cache: effectiveCache,
      fallbackReady: readyVideos.length > 0,
      ingestion: ingestService.getStatus(),
    });
  });

  /**
   * Returns legacy list of cached videos.
   */
  router.get('/cache', (_req, res) => {
    const readyVideos = ingestService.getReadyVideos();
    res.json({ videos: readyVideos.map(formatPlayableItem) });
  });

  /**
   * Returns live ingestion status, active download progress, and queue length.
   */
  router.get('/ingest/status', (_req, res) => {
    res.json(ingestService.getStatus());
  });

  /**
   * Triggers YouTube playlist or search synchronization and begins background downloading.
   */
  router.post('/ingest/sync', async (req, res) => {
    try {
      const { playlistId, searchTopic, maxVideos } = req.body || {};
      const result = await ingestService.sync({
        playlistId: playlistId ? String(playlistId) : undefined,
        searchTopic: searchTopic ? String(searchTopic) : undefined,
        maxVideos: maxVideos ? Number(maxVideos) : undefined,
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[v-feed] Ingest sync failed:', msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  /**
   * Ingest a single video URL or video ID directly.
   */
  router.post('/ingest/video', async (req, res) => {
    const { urlOrId } = req.body || {};
    if (!urlOrId || typeof urlOrId !== 'string') {
      res.status(400).json({ ok: false, error: 'Missing urlOrId parameter' });
      return;
    }

    try {
      const video = await ingestService.ingestSingleVideo(urlOrId);
      res.json({ ok: true, video: formatPlayableItem(video) });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[v-feed] Single video ingest failed:', msg);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  /**
   * Delete a video from disk and manifest.
   */
  router.delete('/videos/:id', (req, res) => {
    const id = req.params.id;
    const deleted = ingestService.deleteVideo(id);
    res.json({ ok: deleted, id });
  });

  /**
   * Stream video with full HTTP 206 Range headers support.
   */
  router.get('/videos/:id/stream', (req, res) => {
    const id = req.params.id;
    const readyVideos = ingestService.getReadyVideos();
    const video = readyVideos.find(
      (v) => v.id === id || v.filename === id || v.filename === `yt_${id}.mp4`,
    );

    if (!video) {
      res.status(404).send('Video not found');
      return;
    }

    const filePath = video.filePath || path.join(fallbackDir, video.filename);
    if (!fs.existsSync(filePath)) {
      res.status(404).send('Video file not found on disk');
      return;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });

      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'video/mp4',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  });

  return router;
}

function formatPlayableItem(video: IngestedVideo) {
  return {
    id: video.id,
    title: video.title,
    channelTitle: video.channelTitle,
    durationSec: video.durationSec,
    durationFormatted: video.durationFormatted,
    thumbnail: video.thumbnail,
    filename: video.filename,
    fileSize: video.fileSize,
    downloadedAt: video.downloadedAt,
    source: video.source,
    url: `/fallback-videos/${encodeURIComponent(video.filename)}`,
    streamUrl: `/api/videos/${encodeURIComponent(video.id)}/stream`,
  };
}
