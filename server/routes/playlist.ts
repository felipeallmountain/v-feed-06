import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';

const VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.mkv']);

export function createPlaylistRouter(fallbackDir: string): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'v-feed-06' });
  });

  router.get('/playlist', async (_req, res) => {
    const cached = listCachedVideos(fallbackDir);
    let live: Array<{ id: string; title: string; url: string }> = [];

    const apiKey = process.env.YOUTUBE_API_KEY;
    const playlistId = process.env.YOUTUBE_PLAYLIST_ID;

    if (apiKey && playlistId) {
      try {
        live = await fetchYouTubePlaylist(apiKey, playlistId);
      } catch (err) {
        console.warn('[v-feed] YouTube playlist fetch failed:', err);
      }
    }

    res.json({
      mode: live.length > 0 ? 'live' : 'cache',
      live,
      cache: cached,
      fallbackReady: cached.length > 0,
    });
  });

  router.get('/cache', (_req, res) => {
    res.json({ videos: listCachedVideos(fallbackDir) });
  });

  return router;
}

function listCachedVideos(dir: string): Array<{ id: string; title: string; url: string }> {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()))
    .sort()
    .map((file) => ({
      id: file,
      title: path.parse(file).name,
      url: `/fallback-videos/${encodeURIComponent(file)}`,
    }));
}

async function fetchYouTubePlaylist(
  apiKey: string,
  playlistId: string,
): Promise<Array<{ id: string; title: string; url: string }>> {
  const url = new URL('https://www.googleapis.com/youtube/v3/playlistItems');
  url.searchParams.set('part', 'snippet,contentDetails');
  url.searchParams.set('maxResults', '25');
  url.searchParams.set('playlistId', playlistId);
  url.searchParams.set('key', apiKey);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`YouTube API ${response.status}`);
  }

  const data = (await response.json()) as {
    items?: Array<{
      contentDetails?: { videoId?: string };
      snippet?: { title?: string };
    }>;
  };

  return (data.items ?? [])
    .map((item) => {
      const id = item.contentDetails?.videoId;
      if (!id) return null;
      return {
        id,
        title: item.snippet?.title ?? id,
        url: `https://www.youtube.com/watch?v=${id}`,
      };
    })
    .filter((v): v is { id: string; title: string; url: string } => v !== null);
}
