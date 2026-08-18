export interface PlaylistItem {
  id: string;
  title: string;
  url: string;
}

export interface PlaylistResponse {
  mode: 'live' | 'cache';
  live: PlaylistItem[];
  cache: PlaylistItem[];
  fallbackReady: boolean;
}

export class YouTubeService {
  async fetchPlaylist(): Promise<PlaylistResponse> {
    const res = await fetch('/api/playlist');
    if (!res.ok) {
      throw new Error(`Playlist request failed: ${res.status}`);
    }
    return (await res.json()) as PlaylistResponse;
  }
}
