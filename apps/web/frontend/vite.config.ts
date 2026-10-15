import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * The browser only ever talks to its own origin. `/api` is proxied by the dev
 * server (and by the production reverse proxy) to the LunaAI Web backend, so the
 * client never needs to know a backend hostname and never calls localhost.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT || 5173),
    strictPort: false,
    // The preview is served from a proxied host (e.g. *.e2b.app), so the dev
    // server must accept any Host header rather than only localhost.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: process.env.LUNAAI_API_URL || 'http://127.0.0.1:3001',
        changeOrigin: false,
      },
    },
  },
  preview: { host: '0.0.0.0', port: Number(process.env.PORT || 5173), allowedHosts: true },
  build: { outDir: 'dist', sourcemap: false },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
