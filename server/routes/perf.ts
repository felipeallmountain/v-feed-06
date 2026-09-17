import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { perfTracker } from '../services/PerformanceTracker.js';
import { clearVideoAndApiCache } from '../../scripts/clear-cache.js';
import type { VideoIngestService } from '../services/VideoIngestService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', '..');
const reportsDir = path.join(root, 'reports');

export function createPerfRouter(ingestService?: VideoIngestService): Router {
  const router = Router();

  /**
   * Get current live performance test status, request counts, video storage metrics.
   */
  router.get('/perf/status', (_req, res) => {
    try {
      if (ingestService) {
        const storage = ingestService.getStorageUsage();
        perfTracker.updateStorageState(storage.totalBytes, storage.videoCount);
      }
      const status = perfTracker.getStatus();
      res.json({ ok: true, status });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  /**
   * Start a performance test session.
   */
  router.post('/perf/start', (req, res) => {
    try {
      const { clearCache, note } = req.body || {};

      let cacheResult = null;
      if (clearCache) {
        cacheResult = clearVideoAndApiCache();
        if (ingestService) {
          ingestService.cleanAndRebuildManifest();
        }
      }

      let initialVideoCount = 0;
      let initialStorageBytes = 0;
      if (ingestService) {
        const storage = ingestService.getStorageUsage();
        initialVideoCount = storage.videoCount;
        initialStorageBytes = storage.totalBytes;
      }

      const session = perfTracker.startSession({
        initialVideoCount,
        initialStorageBytes,
        note,
      });

      res.json({
        ok: true,
        session,
        cacheCleared: Boolean(clearCache),
        cacheResult,
        status: perfTracker.getStatus(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  /**
   * Stop the active performance test session, compile the Markdown report, and write it to disk.
   */
  router.post('/perf/stop', (_req, res) => {
    try {
      if (ingestService) {
        const storage = ingestService.getStorageUsage();
        perfTracker.updateStorageState(storage.totalBytes, storage.videoCount);
      }

      const result = perfTracker.stopSession();
      res.json({
        ok: true,
        reportPath: result.reportPath,
        reportContent: result.reportContent,
        summary: result.summary,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  /**
   * Retrieve the latest generated performance report.
   */
  router.get('/perf/report', (_req, res) => {
    try {
      const latestPath = path.join(reportsDir, 'perf-report-latest.md');
      if (fs.existsSync(latestPath)) {
        const content = fs.readFileSync(latestPath, 'utf-8');
        const stat = fs.statSync(latestPath);
        res.json({
          ok: true,
          reportPath: latestPath,
          updatedAt: stat.mtime.toISOString(),
          content,
        });
      } else {
        res.status(404).json({ ok: false, error: 'No performance test report found yet' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  /**
   * Programmatic cache purge endpoint.
   */
  router.post('/perf/clear-videos', (_req, res) => {
    try {
      const result = clearVideoAndApiCache();
      if (ingestService) {
        ingestService.cleanAndRebuildManifest();
      }
      res.json({ ok: true, ...result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  return router;
}
