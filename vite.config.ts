import { resolve } from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import { feedbackPlugin } from './src/feedback/vitePlugin.ts';
import { seoPlugin } from './src/seo/vitePlugin.ts';

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [
    // In-game bug reports (B) are saved to feedback/ through the dev server.
    feedbackPlugin(),
    // Search and share tags for the world map (SITE_URL in .env: the site's address).
    seoPlugin(loadEnv(mode, import.meta.dirname, '').SITE_URL),
  ],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      input: {
        // (the world map is the entry page, at /)
        map: resolve(import.meta.dirname, 'index.html'),
        game: resolve(import.meta.dirname, 'game.html'),
        viewer: resolve(import.meta.dirname, 'viewer.html'),
        studio: resolve(import.meta.dirname, 'studio.html'),
      },
    },
  },
  server: { host: true },
}));
