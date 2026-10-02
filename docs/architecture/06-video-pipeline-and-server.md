# 06 — Video Ingestion Pipeline & Server Architecture

This document details the Express backend, automated YouTube Shorts discovery, daily API quota protection (`QuotaGuard`), `yt-dlp`/`ffmpeg` ingestion pipeline, local storage management, and client-side playback queue architecture of **V-FEED [06]**.

---

## 1. Backend Server Architecture (`server/index.ts`)

The backend is a Node.js Express server located in [`server/index.ts`](../../server/index.ts). It serves four critical roles:
1. **REST API**: Supplies playlist queues, calibration data, and diagnostic metrics to the client.
2. **Automated Content Ingestion**: Searches, downloads, and transcodes vertical videos using `yt-dlp` and `ffmpeg`.
3. **API Quota Management**: Strictly protects against Google Cloud API quota overruns via [`QuotaGuard`](../../server/services/QuotaGuard.ts#L22).
4. **Static Asset Host**: Serves the faststart MP4 cache, pre-baked textures, and production client build.

```
                              ┌───────────────────────────┐
                              │     server/index.ts       │
                              │   (Node.js Express 4.21)  │
                              └─────────────┬─────────────┘
                                            │
         ┌──────────────────┬───────────────┴───────────────┬──────────────────┐
         ▼                  ▼                               ▼                  ▼
┌──────────────────┐ ┌──────────────────┐          ┌──────────────────┐ ┌──────────────────┐
│ createPlaylist   │ │ createCalibration│          │   createPerf     │ │  createAdmin     │
│ Router           │ │ Router           │          │   Router         │ │  Router          │
│ (/api/playlist)  │ │ (/api/calibration│          │   (/api/perf)    │ │  (/admin)        │
└────────┬─────────┘ └────────┬─────────┘          └────────┬─────────┘ └────────┬─────────┘
         │                    │                             │                    │
         ▼                    ▼                             ▼                    ▼
┌──────────────────┐ ┌──────────────────┐          ┌──────────────────┐ ┌──────────────────┐
│ VideoIngest      │ │ config/          │          │ Performance      │ │ Installation     │
│ Service          │ │ calibration.json │          │ Tracker          │ │ Control Deck     │
└────────┬─────────┘ └──────────────────┘          └──────────────────┘ └──────────────────┘
         │
         ├─────────────────────────────────────────┐
         ▼                                         ▼
┌──────────────────┐                      ┌──────────────────┐
│ YouTubeData      │                      │   QuotaGuard     │
│ Service          │                      │   (9,000 Budget) │
└────────┬─────────┘                      └──────────────────┘
         │
         ▼
┌──────────────────┐
│ yt-dlp + ffmpeg  │ ──► Writes faststart MP4s to: public/fallback-videos/
└──────────────────┘
```

---

## 2. YouTube Data API & Quota Guard (`QuotaGuard.ts`)

Google Cloud limits free YouTube Data API v3 accounts to a strict quota of **10,000 units per day**. In an art installation running 10+ hours a day with active spectators, unconstrained API calls will deplete the quota within minutes:
- `search.list` costs **100 units** per call.
- `videos.list` costs **1 unit** per call.
- `playlistItems.list` costs **1 unit** per call.

### The Quota Guard Solution
Located in [`server/services/QuotaGuard.ts`](../../server/services/QuotaGuard.ts), the [`QuotaGuard`](../../server/services/QuotaGuard.ts#L22) enforces strict quota protection:
- **Daily Budget**: Defaults to **9,000 units** (configurable via `YOUTUBE_DAILY_QUOTA_LIMIT`), leaving a 1,000-unit safety cushion.
- **Persistence**: Tracks current usage in [`config/quota-tracker.json`](../../config/quota-tracker.json).
- **Automatic UTC Midnight Rollover**: Google resets API quotas at midnight Pacific / UTC. [`checkMidnightReset()`](../../server/services/QuotaGuard.ts#L88) monitors date transitions and resets counters automatically.
- **Protected Mode**: When the 9,000-unit threshold is reached, `QuotaGuard` locks the API. Any subsequent YouTube search requests are intercepted, and the server gracefully returns cached query results or local fallback catalog items instead of failing.

```
Incoming YouTube Search Request
               │
               ▼
   QuotaGuard.canMakeSearchCall()?
               │
       ┌───────┴───────┐
   YES │               │ NO (Quota >= 9,000)
       ▼               ▼
Execute YouTube   Enter Protected Mode:
API call (100u)   Return local cache or manifest
Record usage      Zero API units spent
```

---

## 3. Automated Ingestion & Storage Engine (`VideoIngestService.ts`)

Located in [`server/services/VideoIngestService.ts`](../../server/services/VideoIngestService.ts), the [`VideoIngestService`](../../server/services/VideoIngestService.ts#L108) automates video downloading, transcoding, disk storage, and catalog pruning.

### 3.1 Transcoding Pipeline (`yt-dlp` + `ffmpeg`)
When a YouTube Short is scheduled for ingestion:
1. `yt-dlp` fetches the best vertical format stream (max 1080p).
2. `ffmpeg` transcodes the video to an exhibition-optimized MP4 container:
   - **Video Codec**: H.264 (High Profile, Level 4.1) for hardware decoder compatibility.
   - **Audio Codec**: AAC stereo (160 kbps, 48 kHz).
   - **Faststart Flag (`-movflags +faststart`)**: Moves the MP4 `moov` atom to the beginning of the file, allowing instant streaming in HTML5 `<video>` without downloading the entire file first.
   - **Max Duration**: Capped at 65 seconds (Shorts format).

```bash
# Equivalent underlying transcoding command
yt-dlp -f "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]" \
       --recode-video mp4 \
       --postprocessor-args "ffmpeg:-movflags +faststart -c:v libx264 -preset fast -c:a aac" \
       -o "public/fallback-videos/%(id)s.mp4" <VIDEO_URL>
```

### 3.2 Persistent Catalog Manifest
All local files are cataloged in [`public/fallback-videos/manifest.json`](../../public/fallback-videos/manifest.json):
- Video ID, Title, Channel, Duration.
- Local filename, file size, download timestamp.
- Associated search query trigger.

### 3.3 Storage Quotas & Auto-Pruning
Installations cannot be allowed to exhaust the host computer's hard drive:
- **Maximum Storage Cap**: Configurable (default: 2,000 MB).
- **Maximum Video Cap**: Configurable (default: 50 videos).
- **Least Recently Used (LRU) Pruning**: When disk storage or video count exceeds thresholds, [`pruneStorage()`](../../server/services/VideoIngestService.ts#L278) automatically removes the oldest unflagged MP4 files.
- **Orphan Cleanup**: Deletes incomplete `.part` or `.ytdl` temporary download files upon server restart.
- **Low-Watermark Replenishment**: If the catalog falls below 10 videos, a background sync is automatically scheduled.

---

## 4. Client-Side Video Controller (`VideoQueue.ts`)

Located in [`src/video/VideoQueue.ts`](../../src/video/VideoQueue.ts), this class controls video sequencing on the frontend:

### Modes of Operation
- **`live`**: Streams from the ingested YouTube Shorts catalog. If network connection fails, transparently fails over to local cache.
- **`cache`**: Plays exclusively from local faststart MP4 files stored in `public/fallback-videos/`. Completely offline; zero internet requirement.
- **`grid`**: Disables video playback and displays the full-resolution 6-screen alignment and focus calibration pattern.

### Background Polling
Every 20 seconds, [`VideoQueue`](../../src/video/VideoQueue.ts#L63) polls `/api/playlist` to incorporate newly downloaded videos into the live rotation without interrupting currently playing media.

---

## 5. REST API Specifications

### `GET /api/playlist`
Returns the current active playlist catalog and playback modes.
- **Response**:
```json
{
  "mode": "live",
  "total": 12,
  "live": [
    {
      "id": "7Cwh_PBB5OU",
      "title": "Retro TV Sign Off 1980s",
      "url": "/fallback-videos/7Cwh_PBB5OU.mp4",
      "duration": 45,
      "source": "youtube"
    }
  ],
  "cache": [ ... ],
  "storage": {
    "totalFormatted": "142.5 MB",
    "videoCount": 12
  }
}
```

### `GET /api/calibration`
Retrieves the saved hardware calibration profile from `config/calibration.json`.

### `POST /api/calibration`
Saves current keystone corner pinning, bezels, and shader uniforms directly to disk.
- **Request Body**: `SavedCalibration` JSON object.

### `GET /api/quota`
Returns real-time daily YouTube API usage and limit status.
- **Response**:
```json
{
  "date": "2026-09-18",
  "unitsUsed": 1201,
  "dailyBudget": 9000,
  "percentage": 13.3,
  "isProtectedMode": false
}
```

### `POST /api/ingest/sync`
Manually triggers a background YouTube search, download, and playlist synchronization pass.

### `POST /api/ingest/video`
Manually downloads and ingests a specific video by YouTube URL or video ID into local storage.

### `DELETE /api/videos/:id`
Deletes a specific video file and associated metadata from the local library.

### `GET /api/storage`
Returns comprehensive disk storage usage stats, file lists, and protected video flags.

### `POST /api/storage/prune`
Manually triggers disk cache pruning to free storage according to limits (`maxVideos`, `keepProtected`).

### `POST /api/storage/clean-temp`
Cleans up temporary `.part` and intermediate files left from incomplete downloads.

### `POST /api/storage/replenish`
Ensures the minimum required video inventory is met by downloading replacements if below quota.

### `POST /api/quota/toggle-protection`
Toggles protected status on a video to prevent automated pruning.

### `POST /api/quota/clear-cache`
Clears API cache entries to force fresh catalog queries.

---

*Next Step: Explore [07. Calibration System & Installation Control Deck](./07-calibration-and-control-deck.md) to learn how curators tune and calibrate the totem.*
