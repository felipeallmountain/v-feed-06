import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import fs from 'node:fs';

function calibrationVitePlugin(): Plugin {
  return {
    name: 'calibration-vite-plugin',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/api/calibration' || req.url === '/api/calibration/') {
          const configPath = path.resolve(__dirname, 'config', 'calibration.json');
          const publicPath = path.resolve(__dirname, 'public', 'calibration.json');

          if (req.method === 'GET') {
            const target = fs.existsSync(configPath)
              ? configPath
              : fs.existsSync(publicPath)
                ? publicPath
                : null;
            if (!target) {
              res.statusCode = 404;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: 'No saved calibration on disk' }));
              return;
            }
            try {
              const raw = fs.readFileSync(target, 'utf-8');
              const parsed = JSON.parse(raw);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: true, calibration: parsed }));
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ ok: false, error: String(err) }));
            }
            return;
          }

          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += chunk;
            });
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                fs.mkdirSync(path.resolve(__dirname, 'config'), { recursive: true });
                fs.mkdirSync(path.resolve(__dirname, 'public'), { recursive: true });
                fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8');
                fs.writeFileSync(publicPath, JSON.stringify(data, null, 2), 'utf-8');
                console.log('[v-feed vite] Calibration persisted to config/calibration.json & public/calibration.json');
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: true, message: 'Saved to disk', path: configPath }));
              } catch (err) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ ok: false, error: String(err) }));
              }
            });
            return;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [calibrationVitePlugin()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 5173,
    headers: {
      // Ensure camera is allowed for this origin (Chrome Permissions-Policy).
      'Permissions-Policy': 'camera=(self), microphone=()',
    },
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/admin': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/fallback-videos': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        calibration: path.resolve(__dirname, 'calibration.html'),
      },
    },
  },
});
