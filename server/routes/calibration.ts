import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';

export function createCalibrationRouter(configDir: string, publicDir?: string): Router {
  const router = Router();
  const filePath = path.join(configDir, 'calibration.json');
  const publicFilePath = publicDir ? path.join(publicDir, 'calibration.json') : null;

  /**
   * Fetch persistent calibration saved on disk.
   */
  router.get('/calibration', (_req, res) => {
    try {
      const target = fs.existsSync(filePath)
        ? filePath
        : publicFilePath && fs.existsSync(publicFilePath)
          ? publicFilePath
          : null;
      if (!target) {
        res.status(404).json({ ok: false, error: 'No saved calibration found on disk' });
        return;
      }
      const raw = fs.readFileSync(target, 'utf-8');
      const data = JSON.parse(raw);
      res.json({ ok: true, calibration: data });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  /**
   * Save persistent calibration to disk (config/calibration.json and public/calibration.json).
   */
  router.post('/calibration', (req, res) => {
    try {
      const data = req.body;
      if (!data || typeof data !== 'object') {
        res.status(400).json({ ok: false, error: 'Invalid calibration payload' });
        return;
      }
      fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
      if (publicFilePath) {
        fs.mkdirSync(path.dirname(publicFilePath), { recursive: true });
        fs.writeFileSync(publicFilePath, JSON.stringify(data, null, 2), 'utf-8');
      }
      console.log('[v-feed] Persisted TV calibration to', filePath);
      res.json({ ok: true, message: 'Calibration successfully written to disk', path: filePath });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  /**
   * Delete persistent calibration from disk.
   */
  router.delete('/calibration', (_req, res) => {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      if (publicFilePath && fs.existsSync(publicFilePath)) {
        fs.unlinkSync(publicFilePath);
      }
      console.log('[v-feed] Deleted TV calibration from disk');
      res.json({ ok: true, message: 'Calibration reset on disk' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      res.status(500).json({ ok: false, error: msg });
    }
  });

  return router;
}
