import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';

const buildSha = (() => {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();
  } catch {
    return 'unknown';
  }
})();

const buildDate = new Date().toISOString();

export default defineConfig({
  plugins: [react()],
  define: {
    __OFFICIUM_BUILD_SHA__: JSON.stringify(buildSha),
    __OFFICIUM_BUILD_DATE__: JSON.stringify(buildDate)
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: false
      }
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false
  }
});
