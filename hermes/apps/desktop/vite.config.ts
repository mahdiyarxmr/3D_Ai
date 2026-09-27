import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      '@hermes/shared': resolve(__dirname, '../../packages/shared/src/index.ts'),
      '@hermes/agent-protocol': resolve(__dirname, '../../packages/agent-protocol/src/index.ts'),
      '@hermes/vrm': resolve(__dirname, '../../packages/vrm/src/index.ts'),
      '@hermes/ui': resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@locales': resolve(__dirname, '../../locales'),
    },
  },
  server: {
    // 0.0.0.0 so the Tauri dev host and remote previews can both reach it.
    host: host || '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Vite 6 blocks unknown Host headers; allow proxied preview hosts.
    allowedHosts: true,
    hmr: host ? { protocol: 'ws', host, port: 5174 } : undefined,
    watch: { ignored: ['**/src-tauri/**', '**/storage/**'] },
  },
  // Tauri expects a fixed, relative-asset build.
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
