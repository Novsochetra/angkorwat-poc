// A play test of the world map with a game pad (src/map/pad/pad.ts): a fake DualSense
// (scripts/_padFake.mjs) plays the page in GPU Chromium, headless, one step after the other,
// by the button map in pad.ts's top comment. Each step prints PASS or FAIL (and why), and
// the run exits 1 if any failed.
//
//   npm run padtest                        every step
//   npm run padtest -- only=pins,land      those steps (each first sets up what it needs: the
//                                          map, or roaming on foot at an open spot)
//   npm run padtest -- kind=xbox           an Xbox pad (its glyphs: body.pad-xbox)
//   npm run padtest -- headed=1            in a window, to watch
//   npm run padtest -- graphics=medium     the graphics level (low by default: lighter)
//
// The steps, and whose part each checks (pad.ts is the core):
//   load      the loading screen: ✕ presses Start                                  (main.ts)
//   glyphs    body.pad-on.pad-ps (or -xbox), a kbd.is-pad drawn                   (core, glyphs)
//   pins      the map: the d-pad and the stick move between the pins, ✕ picks,
//             ○ back                                                               (ui.ts)
//   settings  Options opens the settings, R1 / L1 switch tabs, ○ closes           (ui.ts, _tabs.ts)
//   jumpcard  △ opens the Jump in card, ✕ jumps (the parachute)                   (hud.ts)
//   glide     the stick steers the canopy (left, then right: turns both ways)     (input.ts)
//   land      stick forward dives to the ground: one `land` shake is asked        (parachute.ts)
//   walk      the stick walks him                                                  (input.ts)
//   jump      ✕ jumps (up over a metre), no shake for it                           (input.ts, walker.ts)
//   use       □ at a moored boat boards it (mode boat), one `bump` shake          (input.ts, boat.ts)
//   menu      △ opens the Explorer menu (a pad layer: __pad.pad.inMenu), ○ shuts  (_explorerMenu.ts)
//   camera    d-pad ← raises the camera, ○ puts it away; → the selfie, ○ away     (input.ts, tools.ts)
//   bigmap    Create opens the big map, ○ shuts it (and the touchpad, PS)         (minimap.ts)
//   leave     ○ on foot asks "Back to the map?", ✕ goes back to the map           (_leave.ts, ask.ts)
//   keys      a real key press turns the pad's glyphs off (body without pad-on)   (core)
//
// Waits read the page (window.roam, window.__pad, the DOM) with generous timeouts: the map
// builds for 30–60 s. One browser, on its own port (5245); the machine is shared.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { connectPad, installFakePad, rumbles, stick, tap } from './_padFake.mjs';

const root = resolve(import.meta.dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')).map(([k, ...v]) => [k, v.join('=') || '1']));
const KIND = args.kind === 'xbox' || args.kind === 'other' ? args.kind : 'ps';
const ONLY = args.only ? new Set(args.only.split(',')) : null;
const GRAPHICS = args.graphics ?? 'low';

/** The pad's shakes by their length (pad.ts `RUMBLES`: each kind has its own). */
const SHAKE_MS = { 40: 'tick', 90: 'bump', 140: 'land', 260: 'hard', 180: 'bite', 420: 'catch', 700: 'thunder', 120: 'burner' };
const shakeKind = (r) => SHAKE_MS[r.duration] ?? `?${r.duration}ms`;

/** GPU Chromium (as scripts/video.mjs): real frame rates, so the pad is read every frame. */
function gpuChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), process.platform === 'darwin' ? 'Library/Caches/ms-playwright' : '.cache/ms-playwright');
  const app = process.platform === 'darwin' ? 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' : 'chrome-linux/chrome';
  for (const dir of existsSync(cache) ? readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse() : []) {
    const exe = join(cache, dir, app);
    if (existsSync(exe)) return exe;
  }
  return undefined;
}

const server = await createServer({ root, logLevel: 'error', server: { port: 5245, strictPort: false, hmr: false } });
await server.listen();
const base = new URL(server.resolvedUrls.local[0]).origin;
const browser = await chromium.launch({ headless: args.headed !== '1', executablePath: gpuChromium(), args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// (the site's analytics stay out of a test run)
await page.route((u) => u.origin !== base && /posthog/i.test(u.href), (r) => r.abort());

// ── Helpers ───────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, arg) => page.evaluate(fn, arg);
/** Wait until `fn` (in the page) is true; throws "timed out: <what>". */
async function until(fn, arg, ms, what) {
  try {
    await page.waitForFunction(fn, arg, { timeout: ms, polling: 100 });
  } catch {
    throw new Error(`timed out (${(ms / 1000).toFixed(0)} s): ${what}`);
  }
}
const mode = () => ev(() => window.roam?.mode ?? null);
const shakes = async (from = 0) => (await rumbles(page)).slice(from).map(shakeKind);
const shakeCount = async () => (await rumbles(page)).length;
/** A push of the right stick: the pad is the input in use again (its glyphs, its shakes), nothing moves on the map. */
async function wake() {
  await stick(page, 'right', 0.7, 0);
  await sleep(80);
  await stick(page, 'right', 0, 0);
}
/** Hold the left stick at (x, y) (browser axes: y −1 forward) for `ms`, then let go. */
async function push(x, y, ms) {
  await stick(page, 'left', x, y);
  await sleep(ms);
  await stick(page, 'left', 0, 0);
}
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Back on the map screen (roaming ended, no panel or card open). */
async function ensureMap() {
  if ((await mode()) && (await mode()) !== 'overview') {
    await ev(() => window.roam.stop());
    await until(() => window.roam.mode === 'overview', null, 15_000, 'back in the overview');
    await sleep(600);
  }
  await ev(() => {
    const x = document.querySelector('#mu-settings.is-open .mu-close');
    if (x) x.click();
    const card = document.querySelector('.rh-jumps[aria-hidden="false"] .rh-jumps-x');
    if (card) card.click();
  });
  await wake();
}

/** An open, flat, dry spot on foot inside the roaming area (nothing to use near it), found once. */
let open = null;
async function openSpot() {
  open ??= await ev(async () => {
    const { placeById } = await import('/src/map/layout.ts');
    const w = window.roam.world;
    const home = placeById('sanctuary');
    const ok = (x, z) => {
      if (!w.inBounds(x, z) || (w.edgeDistance && w.edgeDistance(x, z) < 40)) return false;
      const g = w.groundAt(x, z);
      for (let r = 0; r <= 12; r += 3)
        for (let a = 0; a < 8; a++) {
          const px = x + Math.cos((a * Math.PI) / 4) * r;
          const pz = z + Math.sin((a * Math.PI) / 4) * r;
          const gp = w.groundAt(px, pz);
          const wa = w.waterAt(px, pz);
          if (!w.inBounds(px, pz) || (wa !== null && wa > gp - 0.3) || Math.abs(gp - g) > 0.6) return false;
          if (w.standAt) {
            const s = w.standAt(px, pz, g + 0.3, 1, 2.3);
            if (Number.isNaN(s) || Math.abs(s - gp) > 0.6) return false;
          }
          if ((w.ceilingAt?.(px, pz, g + 0.3) ?? Infinity) < g + 5) return false;
        }
      return !w.placeNear(x, z, g) && !w.launchNear?.(x, z, g) && !w.balloonNear?.(x, z, g);
    };
    for (let d = 30; d < 500; d += 8)
      for (let a = 0; a < 24; a++) {
        const x = home.x + Math.cos((a * Math.PI) / 12) * d;
        const z = home.z + Math.sin((a * Math.PI) / 12) * d;
        if (ok(x, z)) return { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, y: w.groundAt(x, z) };
      }
    return null;
  });
  if (!open) throw new Error('no open spot found in the roaming area');
  return open;
}

/** Roaming in `m` at `at` (x,z or x,y,z), put there at once (roam.placeFrom, as the free camera's "Go there"). */
async function placeAt(m, at) {
  const ok = await ev(([m, at]) => window.roam.placeFrom(new URLSearchParams(`roam=${m}&at=${at}`), window.__frame), [m, at]);
  if (!ok) throw new Error(`roam.placeFrom(roam=${m}&at=${at}) said no`);
  await until((m) => window.roam.mode === m, m, 5000, `mode ${m}`);
  await sleep(300);
}

/** On foot, no menu or card open (put at the open spot unless he walks already). */
async function ensureWalk() {
  if ((await mode()) !== 'walk') {
    const s = await openSpot();
    await placeAt('walk', `${s.x},${s.z}`);
  }
  for (let i = 0; i < 3 && (await ev(() => window.__pad.pad.inMenu || !!document.querySelector('.mu-ask.is-open'))); i++) {
    await tap(page, 'east');
    await sleep(500);
  }
  if (await ev(() => window.__pad.pad.inMenu)) throw new Error('a menu or card keeps the pad (○ did not shut it)');
  await wake();
}

/** The pin in focus (its place id), or null. */
const pinInFocus = () => ev(() => (document.activeElement?.classList.contains('mu-pin') ? document.activeElement.dataset.id : null));

// ── The steps ─────────────────────────────────────────────────────────────────

const steps = [
  {
    id: 'load',
    who: 'main.ts (Helper 3)',
    async run() {
      await page.goto(`${base}/index.html?story=0&weather=clear&graphics=${GRAPHICS}`, { timeout: 300_000 });
      await page.waitForSelector('#loading .ld-go', { state: 'visible', timeout: 300_000 });
      await until(() => document.activeElement?.classList.contains('ld-go'), null, 300_000, 'the Start button in focus');
      await connectPad(page);
      await tap(page, 'south');
      try {
        await until(() => !document.getElementById('loading') || document.getElementById('loading').classList.contains('done'), null, 10_000, 'the loading screen goes after ✕');
      } catch (e) {
        // (the rest still runs: Start pressed by hand)
        await ev(() => document.querySelector('#loading .ld-go')?.click());
        throw e;
      }
      await sleep(1500);
      return 'Start pressed with ✕';
    },
  },
  {
    id: 'glyphs',
    who: 'pad core, glyphs.ts',
    async run() {
      await wake();
      const s = await ev(() => ({ body: document.body.className, kbds: document.querySelectorAll('kbd.is-pad').length, shown: [...document.querySelectorAll('kbd.is-pad')].filter((k) => k.checkVisibility?.()).length }));
      if (!/\bpad-on\b/.test(s.body)) throw new Error(`body has no pad-on (${s.body})`);
      if (!new RegExp(`\\bpad-${KIND}\\b`).test(s.body)) throw new Error(`body has no pad-${KIND} (${s.body})`);
      if (!s.kbds) throw new Error('no kbd.is-pad in the page');
      return `body.pad-on.pad-${KIND}; ${s.kbds} kbd.is-pad (${s.shown} shown)`;
    },
  },
  {
    id: 'pins',
    who: 'ui.ts (Helper 3)',
    async run() {
      await ensureMap();
      await tap(page, 'right');
      await sleep(300);
      const a = await pinInFocus();
      if (!a) throw new Error(`d-pad →: no pin in focus (focus: ${await ev(() => document.activeElement?.className || document.activeElement?.tagName)})`);
      let b = null;
      for (const dir of ['right', 'left', 'down', 'up']) {
        await tap(page, dir);
        await sleep(300);
        b = await pinInFocus();
        if (b && b !== a) break;
      }
      if (!b || b === a) throw new Error(`the d-pad stays on "${a}"`);
      let c = null;
      for (const [x, y] of [[0.9, 0], [-0.9, 0], [0, 0.9], [0, -0.9]]) {
        await push(x, y, 160);
        await sleep(250);
        c = await pinInFocus();
        if (c && c !== b) break;
      }
      if (!c || c === b) throw new Error(`the stick stays on "${b}"`);
      await tap(page, 'south');
      await until(() => !!document.querySelector('.mu-pin.is-selected'), null, 3000, '✕ picks the pin (.mu-pin.is-selected)');
      const picked = await ev(() => document.querySelector('.mu-pin.is-selected')?.dataset.id);
      await tap(page, 'east');
      await until(() => !document.querySelector('.mu-pin.is-selected'), null, 3000, '○ goes back (no pin picked)');
      return `d-pad ${a} → ${b}, stick → ${c}, ✕ picked ${picked}, ○ back`;
    },
  },
  {
    id: 'settings',
    who: 'ui.ts, _tabs.ts (Helper 3)',
    async run() {
      await ensureMap();
      const tabNow = () => ev(() => document.querySelector('#mu-settings [role="tab"][aria-selected="true"]')?.id ?? null);
      await tap(page, 'start');
      await until(() => !!document.querySelector('#mu-settings.is-open'), null, 3000, 'Options opens the settings');
      await sleep(400);
      const t0 = await tabNow();
      await tap(page, 'r1');
      await until((t0) => document.querySelector('#mu-settings [role="tab"][aria-selected="true"]')?.id !== t0, t0, 3000, 'R1: the next tab');
      const t1 = await tabNow();
      await tap(page, 'l1');
      await until((t0) => document.querySelector('#mu-settings [role="tab"][aria-selected="true"]')?.id === t0, t0, 3000, 'L1: back to the first tab');
      await tap(page, 'east');
      await until(() => !document.querySelector('#mu-settings.is-open'), null, 3000, '○ closes the settings');
      return `tabs ${t0} → ${t1} → ${t0}, closed`;
    },
  },
  {
    id: 'jumpcard',
    who: 'hud.ts (Helper 2)',
    async run() {
      await ensureMap();
      try {
        await tap(page, 'north');
        await until(() => document.querySelector('.rh-jumps')?.getAttribute('aria-hidden') === 'false', null, 3000, '△ opens the Jump in card');
        await sleep(300);
        let kind = await ev(() => document.activeElement?.dataset?.kind ?? null);
        for (let i = 0; i < 2 && kind !== 'chute'; i++) {
          await tap(page, kind === 'glider' ? 'left' : 'right');
          await sleep(250);
          kind = await ev(() => document.activeElement?.dataset?.kind ?? null);
        }
        if (kind !== 'chute') throw new Error(`the parachute is not in focus on the card (${kind})`);
        await tap(page, 'south');
        await until(() => window.roam.mode !== 'overview', null, 5000, '✕ jumps');
        return `△ card, ✕ jumped (${await mode()})`;
      } catch (e) {
        // (the next steps still fly: the jump started by hand)
        if ((await mode()) === 'overview') {
          await ensureMap();
          await ev(() => window.roam.start('chute'));
        }
        throw e;
      }
    },
  },
  {
    id: 'glide',
    who: 'input.ts (Helper 1)',
    async run() {
      if (!['leap', 'glide'].includes(await mode())) {
        const s = await openSpot();
        await placeAt('glide', `${s.x},${s.y + 90},${s.z}`);
      }
      await until(() => window.roam.mode === 'glide', null, 15_000, 'under the canopy');
      // (over the land, heading in: out past the edge the wind turns him, whatever the stick says)
      await until(
        () => {
          const { pos, yaw } = window.roam.body;
          const w = window.roam.world;
          return w.inBounds(pos.x, pos.z) && w.inBounds(pos.x + Math.sin(yaw) * 60, pos.z + Math.cos(yaw) * 60);
        },
        null,
        60_000,
        'over the roaming area, heading in',
      );
      await sleep(1500);
      const yaw = () => ev(() => window.roam.body.yaw);
      const y0 = await yaw();
      await push(-1, 0, 1500);
      const y1 = await yaw();
      await push(1, 0, 1500);
      await sleep(400);
      const y2 = await yaw();
      const left = angleDiff(y1, y0);
      const right = angleDiff(y2, y1);
      if (Math.abs(left) < 0.15 || Math.abs(right) < 0.15 || Math.sign(left) === Math.sign(right)) throw new Error(`the stick does not steer both ways (left ${left.toFixed(2)} rad, right ${right.toFixed(2)} rad)`);
      return `stick ← turned ${left.toFixed(2)} rad, → ${right.toFixed(2)} rad`;
    },
  },
  {
    id: 'land',
    who: 'parachute.ts, boat.ts (Helper 5)',
    async run() {
      if ((await mode()) !== 'glide') {
        const s = await openSpot();
        await placeAt('glide', `${s.x},${s.y + 40},${s.z}`);
      }
      await wake();
      const n0 = await shakeCount();
      const t0 = Date.now();
      // (stick forward: the canopy dives, down sooner)
      await stick(page, 'left', 0, -1);
      try {
        await until(() => window.roam.mode !== 'glide', null, 240_000, 'down on the ground (or the water)');
      } finally {
        await stick(page, 'left', 0, 0);
      }
      await sleep(1200);
      const got = await shakes(n0);
      const m = await mode();
      const lands = got.filter((k) => k === 'land');
      if (lands.length !== 1 || got.length !== 1) throw new Error(`asked for [${got.join(', ')}], want one land`);
      const r = (await rumbles(page))[n0];
      return `down in ${((Date.now() - t0) / 1000).toFixed(0)} s (${m}): one land shake (weak ${r.weakMagnitude.toFixed(2)}, strong ${r.strongMagnitude.toFixed(2)})`;
    },
  },
  {
    id: 'walk',
    who: 'input.ts (Helper 1)',
    async run() {
      if ((await mode()) === 'walk') await until(() => window.roam.body.grounded, null, 5000, 'on his feet');
      await ensureWalk();
      const p = () => ev(() => ({ x: window.roam.body.pos.x, z: window.roam.body.pos.z }));
      const moved = async () => {
        const a = await p();
        await push(0, -1, 1200);
        const b = await p();
        return Math.hypot(b.x - a.x, b.z - a.z);
      };
      let d = await moved();
      let note = '';
      if (d < 1.5) {
        // (where he landed may be a corner: once more at the open spot)
        const s = await openSpot();
        await placeAt('walk', `${s.x},${s.z}`);
        await wake();
        d = await moved();
        note = ' (at the open spot)';
      }
      if (d < 1.5) throw new Error(`the stick moved him ${d.toFixed(2)} m`);
      return `stick forward 1.2 s: ${d.toFixed(1)} m${note}`;
    },
  },
  {
    id: 'jump',
    who: 'input.ts (Helper 1), walker.ts',
    async run() {
      await ensureWalk();
      await until(() => window.roam.body.grounded, null, 5000, 'on his feet');
      const n0 = await shakeCount();
      await ev(() => {
        const p = (window.__jumpProbe = { y0: window.roam.body.pos.y, max: -Infinity, on: true });
        const f = () => {
          if (!p.on) return;
          p.max = Math.max(p.max, window.roam.body.pos.y);
          requestAnimationFrame(f);
        };
        f();
      });
      await tap(page, 'south');
      await sleep(1500);
      const rise = await ev(() => {
        const p = window.__jumpProbe;
        p.on = false;
        return p.max - p.y0;
      });
      const got = await shakes(n0);
      if (rise < 1) throw new Error(`✕: he rose ${rise.toFixed(2)} m`);
      if (got.length) throw new Error(`a jump on the flat shook the pad: [${got.join(', ')}]`);
      return `✕: up ${rise.toFixed(2)} m, no shake`;
    },
  },
  {
    id: 'use',
    who: 'input.ts (Helper 1), boat.ts',
    async run() {
      await ensureWalk();
      // (a moored boat, and dry land within reach of it to stand on)
      const spot = await ev(async () => {
        const { mooredBoatNear } = await import('/src/map/roam/boat.ts');
        const w = window.roam.world;
        const { pos } = window.roam.body;
        const m = mooredBoatNear(pos.x, pos.z, 1e6);
        if (!m) return null;
        for (let r = 2; r <= 5.5; r += 0.5)
          for (let a = 0; a < 24; a++) {
            const x = m.x + Math.cos((a * Math.PI) / 12) * r;
            const z = m.z + Math.sin((a * Math.PI) / 12) * r;
            const g = w.groundAt(x, z);
            const wa = w.waterAt(x, z);
            if (!w.inBounds(x, z) || (wa !== null && wa > g - 0.2) || Math.abs(g - m.level) > 3) continue;
            if (w.standAt && Number.isNaN(w.standAt(x, z, g + 0.3, 1, 2.3))) continue;
            return { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100, boat: m };
          }
        return { boat: m };
      });
      if (!spot) throw new Error('no moored boat');
      if (spot.x === undefined) throw new Error(`no dry land by the boat at ${spot.boat.x.toFixed(0)},${spot.boat.z.toFixed(0)}`);
      await placeAt('walk', `${spot.x},${spot.z}`);
      await wake();
      await sleep(500);
      const n0 = await shakeCount();
      await tap(page, 'west');
      await until(() => window.roam.mode === 'boat', null, 4000, '□ boards the boat');
      await sleep(1500);
      const got = await shakes(n0);
      if (got.filter((k) => k === 'bump').length !== 1 || got.length !== 1) throw new Error(`boarded; asked for [${got.join(', ')}], want one bump`);
      return `□ by the boat at ${spot.boat.x.toFixed(0)},${spot.boat.z.toFixed(0)}: boarded, one bump shake`;
    },
  },
  {
    id: 'menu',
    who: '_explorerMenu.ts (Helper 4), input.ts',
    async run() {
      await ensureWalk();
      const cls = () => ev(() => document.querySelector('.rxm')?.className ?? '(no .rxm)');
      await tap(page, 'north');
      try {
        await until(() => window.__pad.pad.inMenu, null, 3000, '△ opens the Explorer menu (a pad layer)');
      } catch (e) {
        throw new Error(`${e.message}; the menu: ${await cls()}`);
      }
      await sleep(400);
      const open = await cls();
      await tap(page, 'east');
      await until(() => !window.__pad.pad.inMenu, null, 3000, '○ shuts it');
      return `△ opened it (${open}), ○ shut it`;
    },
  },
  {
    id: 'camera',
    who: 'input.ts, tools.ts (Helper 1)',
    async run() {
      await ensureWalk();
      const action = () => ev(() => window.roam.body.explorer.currentAction ?? null);
      for (const [dir, want] of [['left', 'photo'], ['right', 'selfie']]) {
        await tap(page, dir);
        try {
          await until((w) => window.roam.body.explorer.currentAction === w, want, 3000, `d-pad ${dir === 'left' ? '←' : '→'}: the ${want}`);
        } catch (e) {
          throw new Error(`${e.message} (action: ${await action()})`);
        }
        await sleep(800);
        await tap(page, 'east');
        await until((w) => window.roam.body.explorer.currentAction !== w, want, 3000, `○ puts the ${want} away`);
        await sleep(600);
      }
      if (await ev(() => !!document.querySelector('.mu-ask.is-open'))) throw new Error('○ asked "Back to the map?" too');
      return 'd-pad ← camera, ○ away; → selfie, ○ away';
    },
  },
  {
    id: 'bigmap',
    who: 'minimap.ts (Helper 4), input.ts',
    async run() {
      await ensureWalk();
      const done = [];
      for (const b of KIND === 'ps' ? ['select', 'touchpad'] : ['select']) {
        await tap(page, b);
        try {
          await until(() => !!document.querySelector('.mm-bigwrap.is-open'), null, 3000, `${b === 'select' ? 'Create' : 'the touchpad'} opens the big map`);
        } catch (e) {
          throw new Error(`${e.message}${done.length ? ` (${done.join(', ')} did)` : ''}; the big map: ${await ev(() => document.querySelector('.mm-bigwrap')?.className ?? '(no .mm-bigwrap)')}`);
        }
        await sleep(500);
        await tap(page, 'east');
        await until(() => !document.querySelector('.mm-bigwrap.is-open'), null, 3000, '○ shuts the big map');
        await sleep(400);
        done.push(b === 'select' ? 'Create' : 'touchpad');
      }
      return `${done.join(' and ')} ${done.length > 1 ? 'open' : 'opens'} it, ○ shuts it`;
    },
  },
  {
    id: 'leave',
    who: '_leave.ts, ask.ts (Helper 2), input.ts',
    async run() {
      await ensureWalk();
      await tap(page, 'east');
      await until(() => !!document.querySelector('.mu-ask.rl.is-open'), null, 3000, '○ asks "Back to the map?"');
      await sleep(500);
      await tap(page, 'south');
      await until(() => window.roam.mode === 'overview', null, 15_000, '✕ back to the map');
      return '○ asked, ✕ went back to the map';
    },
  },
  {
    id: 'keys',
    who: 'pad core',
    async run() {
      await ensureMap();
      await until(() => document.body.classList.contains('pad-on'), null, 3000, 'the pad in use (body.pad-on)');
      await page.keyboard.press('Shift');
      await until(() => !document.body.classList.contains('pad-on'), null, 3000, 'a key turns pad-on off');
      return 'Shift: pad-on off';
    },
  },
];

// ── Run ───────────────────────────────────────────────────────────────────────

await installFakePad(page, KIND);
const results = [];
for (const s of steps) {
  // (the page is always loaded: nothing runs without it)
  if (ONLY && !ONLY.has(s.id) && s.id !== 'load') continue;
  const t0 = Date.now();
  const e0 = errors.length;
  try {
    const note = await s.run();
    results.push({ id: s.id, ok: true });
    if (!ONLY || ONLY.has(s.id)) console.log(`PASS  ${s.id.padEnd(9)} ${note}  [${((Date.now() - t0) / 1000).toFixed(1)} s]`);
  } catch (e) {
    results.push({ id: s.id, ok: false });
    console.log(`FAIL  ${s.id.padEnd(9)} ${e.message.split('\n')[0]}  — checks ${s.who}`);
    if (s.id === 'load' && !(await ev(() => !!window.roam).catch(() => false))) break;
  }
  for (const m of errors.slice(e0)) console.log(`      [page error] ${m.slice(0, 200)}`);
}

const failed = results.filter((r) => !r.ok && (!ONLY || ONLY.has(r.id)));
const ran = results.filter((r) => !ONLY || ONLY.has(r.id));
console.log(`\n${ran.length - failed.length} / ${ran.length} passed${failed.length ? `; failed: ${failed.map((r) => r.id).join(', ')}` : ''}`);
await browser.close();
await server.close();
process.exit(failed.length ? 1 : 0);
