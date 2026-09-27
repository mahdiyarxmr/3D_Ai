import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    include: ['tests/**/*.test.{ts,tsx}', 'packages/**/*.test.{ts,tsx}'],
    environment: 'node',
    // Only the component tests need a DOM; everything else stays on Node.
    environmentMatchGlobs: [['tests/ui.test.tsx', 'jsdom'],
      ['tests/boot.test.tsx', 'jsdom']],
  },
  resolve: {
    alias: {
      '@hermes/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
      '@hermes/agent-protocol': resolve(__dirname, 'packages/agent-protocol/src/index.ts'),
      '@hermes/vrm': resolve(__dirname, 'packages/vrm/src/index.ts'),
      '@hermes/ui': resolve(__dirname, 'packages/ui/src/index.ts'),
    },
  },
});
