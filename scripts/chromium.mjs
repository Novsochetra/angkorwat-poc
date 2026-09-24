// Which Chromium the headless scripts launch: $CHROMIUM, else the sandbox's,
// else the newest headless shell Playwright has downloaded (its version may be
// older than the one this Playwright expects).
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function chromiumPath() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const sandbox = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (existsSync(sandbox)) return sandbox;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
  if (!existsSync(cache)) return undefined;
  for (const dir of readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse())
    for (const sub of readdirSync(join(cache, dir))) {
      const exe = join(cache, dir, sub, 'chrome-headless-shell');
      if (existsSync(exe)) return exe;
    }
  return undefined;
}
