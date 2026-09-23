// Shared dev server for parallel agents (node docs/kit-work/devserver.mjs): no HMR (one agent's edits never reload
// another agent's headless page mid-screenshot), but new / deleted kit modules
// still refresh the registries' import.meta.glob lists on the next page load.
import { resolve } from 'node:path';
import { createServer } from 'vite';

const root = resolve(import.meta.dirname, '..', '..');
const globOwners = ['src/kit/registry.ts', 'src/kit/scene.ts'].map((f) => resolve(root, f));
const server = await createServer({
  root,
  logLevel: 'warn',
  server: { port: 5173, strictPort: true, hmr: false },
  plugins: [
    {
      name: 'kit-glob-refresh',
      configureServer(s) {
        const refresh = (file) => {
          if (!/src\/kit\/(assets|scenes)\//.test(file)) return;
          for (const f of globOwners) for (const m of s.moduleGraph.getModulesByFile(f) ?? []) s.moduleGraph.invalidateModule(m);
          console.log('kit globs refreshed after', file.replace(root + '/', ''));
        };
        s.watcher.on('add', refresh);
        s.watcher.on('unlink', refresh);
      },
    },
  ],
});
await server.listen();
console.log('dev server (no HMR, kit glob refresh) on 5173');
