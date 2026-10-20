import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'apex-ports-provider',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/.apex/ports.json') {
            const candidates = [
              path.resolve(__dirname, '../../.apex/ports.json'),
              path.resolve(__dirname, '../.apex/ports.json'),
              path.resolve(__dirname, '.apex/ports.json'),
            ];
            for (const p of candidates) {
              if (fs.existsSync(p)) {
                res.setHeader('Content-Type', 'application/json');
                res.end(fs.readFileSync(p, 'utf-8'));
                return;
              }
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ core: 9000, gateway: 8080 }));
            return;
          }
          next();
        });
      },
    },
  ],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
  },
});
