import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { feedbackPlugin } from './src/feedback/vitePlugin.ts';

export default defineConfig({
  base: './',
  // In-game bug reports (B) are saved to feedback/ through the dev server.
  plugins: [feedbackPlugin()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        game: resolve(import.meta.dirname, 'index.html'),
        viewer: resolve(import.meta.dirname, 'viewer.html'),
        studio: resolve(import.meta.dirname, 'studio.html'),
        map: resolve(import.meta.dirname, 'map.html'),
      },
    },
  },
  server: { host: true },
});
