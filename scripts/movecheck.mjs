// Moving and joining what he built, played in a headless browser (`npm run movecheck [-- <shot dir>]`):
// - fence runs started apart close their gap (roam/_build.ts snapFence / closeFence / meetLine): a gap in line, a
//   corner, a lone run going on 3 m as before;
// - move mode (roam/_buildMove.ts): the card's row, aiming, E picks up, Esc puts back, E puts down (free), a half-built
//   piece refused, a carried fence snapping, the walk map following, the spirit house's prayer spot going with it.
// Draws on the CPU (SwiftShader): about 10 minutes; the game's time runs slow, so it checks a build rising, not done.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// (the dev server throws without PostHog's settings: stand-ins; its requests are stopped below)
process.env.VITE_POSTHOG_KEY ||= 'movecheck';
process.env.VITE_POSTHOG_HOST ||= 'https://posthog.invalid';
const server = await createServer({ root, logLevel: 'error', server: { port: 5246, strictPort: false, hmr: false } });
await server.listen();
const base = new URL(server.resolvedUrls.local[0]).origin;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (/\[build\]/.test(m.text())) console.log('  page:', m.text().slice(0, 200));
});
await page.route((u) => u.origin !== base && /posthog/i.test(u.href), (r) => r.abort());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ev = (fn, arg) => page.evaluate(fn, arg);
const out = process.argv[2] ?? join(root, 'screenshots');
mkdirSync(out, { recursive: true });

const t0 = Date.now();
await page.goto(`${base}/index.html?story=0&weather=clear&graphics=low&progress=0`, { timeout: 600_000 });
await page.waitForSelector('#loading .ld-go', { state: 'visible', timeout: 600_000 });
await ev(() => document.querySelector('#loading .ld-go')?.click());
console.log(`start pressed at ${((Date.now() - t0) / 1000).toFixed(0)} s`);
await sleep(1500);
for (let i = 0; i < 60; i++) {
  const r = await ev(() => ({ ok: window.roam?.placeFrom(new URLSearchParams('roam=walk&at=423,-156&home=1'), window.__frame), mode: window.roam?.mode, build: !!window.__build, frame: !!window.__frame }));
  console.log('  placeFrom', JSON.stringify(r));
  if (r.ok) break;
  await sleep(5000);
}
await page.waitForFunction(() => !!window.__build && window.roam?.mode === 'walk', null, { timeout: 300_000, polling: 500 });
await sleep(1000);
console.log(`loaded in ${((Date.now() - t0) / 1000).toFixed(0)} s`);

let fails = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) fails++;
};

async function stand(x, z, yawDeg) {
  await ev(([x, z]) => window.roam.placeFrom(new URLSearchParams(`roam=walk&at=${x},${z}`), window.__frame), [x, z]);
  await sleep(400);
  await ev((y) => (window.roam.body.yaw = (y * Math.PI) / 180), yawDeg);
}
/** Put him at (x, z) turned `yawDeg` without a mode change (placeFrom ends build and move mode, as any new mode does). */
async function walkTo(x, z, yawDeg) {
  await ev(([x, z, y]) => {
    const w = window.roam.world;
    window.roam.body.pos.set(x, w.groundAt(x, z), z);
    window.roam.body.yaw = (y * Math.PI) / 180;
  }, [x, z, yawDeg]);
  await sleep(500);
}
async function ghost() {
  await sleep(600);
  return ev(() => window.__build.state().placing);
}
const clear = () => ev(() => window.__build.state().pieces.forEach((p) => window.__build.remove(p.uid)));
const place = (id) => ev((id) => window.__build.place(id), id);

// ── 1. Two lines in line, 2.5 m apart ──
await clear();
const A = await ev(() => [window.__build.add('fence', 418.5, -160, 0), window.__build.add('fence', 415.5, -160, 0)]);
const B = await ev(() => window.__build.add('fence', 424, -160, 0));
console.log('built', A, B, await ev(() => window.__build.state().pieces));
await stand(421.25, -157, 180);
await place('fence');
let g = await ghost();
console.log('ghost', g);
check(g?.snapped && g.ok && Math.abs((g.len ?? 3) - 2.5) < 0.01, `in-line gap 2.5 m: ghost snapped ${g?.snapped}, ok ${g?.ok}, len ${g?.len} (${g?.reason ?? ''})`);
await page.screenshot({ path: `${out}/fence-gap-ghost.png` });
await page.keyboard.press('KeyE');
await sleep(1000);
let ps = await ev(() => window.__build.state().pieces);
const closing = ps.find((p) => p.len !== undefined);
check(!!closing && Math.abs(closing.x - 421.25) < 0.01 && Math.abs(closing.z + 160) < 0.01, `built a closing run: ${JSON.stringify(closing)}`);
await ev(() => window.__build.place(null));
// (he hammers it up: on a machine without a GPU the game's time runs ~10× slow, so: it rises)
for (let i = 0; i < 80 && !(await ev(() => window.__build.state().pieces.some((p) => p.len !== undefined && p.done > 0.2))); i++) await sleep(500);
check(await ev(() => window.__build.state().pieces.some((p) => p.len !== undefined && p.done > 0.2)), 'he builds the closing run (it rises)');
// (the walk map: no way through the gap any more)
const walk = await ev(() => {
  const w = window.roam.world;
  const g = w.field.heightAt(421.25, -160);
  return { stand: w.standAt?.(421.25, -160, g + 0.3, 0.3, 2.3), ground: g, top: w.groundAt(421.25, -160) };
});
check(walk.top - walk.ground > 1, `gap is solid in the walk map: ${JSON.stringify(walk)}`);

// ── 2. Lines meeting at a corner: A along x, C along z ending 2 m short of A's line, 2.5 m past A's end ──
await clear();
await ev(() => {
  window.__build.add('fence', 420, -160, 0);
  window.__build.add('fence', 424, -163.5, 90);
});
await stand(422.5, -157.5, 180);
await place('fence');
g = await ghost();
console.log('ghost', g);
check(g?.snapped && g.ok && Math.abs((g.len ?? 3) - 2.5) < 0.01, `corner: the run from A stops on C's line (len ${g?.len}, ok ${g?.ok} ${g?.reason ?? ''})`);
await page.keyboard.press('KeyE');
await sleep(800);
await ev(() => window.__build.place(null));
for (let i = 0; i < 40 && (await ev(() => !!window.__build.state().work)); i++) await sleep(500);
await stand(422, -162, 90);
await place('fence');
g = await ghost();
console.log('ghost', g);
check(g?.snapped && g.ok && Math.abs((g.len ?? 3) - 2) < 0.01 && Math.abs(g.x - 424) < 0.01 && Math.abs(g.z + 161) < 0.01, `corner: the closing run 2 m between them (x ${g?.x}, z ${g?.z}, len ${g?.len}, ok ${g?.ok})`);
await page.screenshot({ path: `${out}/fence-corner-ghost.png` });
await page.keyboard.press('KeyE');
await sleep(800);
await ev(() => window.__build.place(null));
for (let i = 0; i < 40 && (await ev(() => !!window.__build.state().work)); i++) await sleep(500);

// ── 3. Plain runs still as before: run on from a lone fence in line, 3 m ──
await clear();
await ev(() => window.__build.add('fence', 420, -160, 0));
await stand(423, -157, 180);
await place('fence');
g = await ghost();
check(g?.snapped && g.ok && g.len === null, `a lone fence still runs on 3 m (len ${g?.len}, x ${g?.x})`);
await ev(() => window.__build.place(null));

// ── 4. Move mode: the card's row, aim, pick up, put down; Esc puts back; pieces that may not move ──
await clear();
await ev(() => {
  window.__build.add('fence', 420, -160, 0);
  window.__build.add('jar', 426, -164, 0);
  window.__build.add('kre', 430, -158, 0, 0.5);
});
const riel0 = await ev(() => window.__build.state().riel);
// (the card's row opens it)
await ev(() => window.__build.card());
await sleep(500);
// (its first tab, Buildings: where the row is)
await ev(() => document.querySelector('.bd-tab[data-tab="foot"]')?.click());
await sleep(300);
await page.screenshot({ path: `${out}/move-card.png` });
const row = await ev(() => {
  const b = document.querySelector('.bd-row[data-id="move"], button[data-id="move"]');
  return b ? { text: b.textContent.trim().slice(0, 80), off: b.disabled } : null;
});
check(!!row && !row.off, `the card has a "Move your things" row: ${JSON.stringify(row)}`);
await ev(() => document.querySelector('button[data-id="move"]')?.click());
await sleep(600);
let st = await ev(() => window.__build.state());
check(!!st.moveMode && !st.card, `move mode on, card shut (${JSON.stringify(st.moveMode)})`);
// (facing the jar close by, no mouse over the view: it is aimed at)
await walkTo(426, -166, 0);
await page.mouse.move(2, 2);
await sleep(800);
st = await ev(() => window.__build.state());
check(st.moveMode?.aimed === 'jar-1' && !st.moveMode.why, `facing the jar aims at it (${JSON.stringify(st.moveMode)})`);
await page.screenshot({ path: `${out}/move-aim.png` });
// (E picks it up: build mode with it)
await page.keyboard.press('KeyE');
await sleep(800);
st = await ev(() => window.__build.state());
check(st.placing?.moving === 'jar-1' && /Put it here|ដាក់នៅទីនេះ/.test(st.placing.prompt ?? ''), `E picks it up (${st.placing?.moving}, "${st.placing?.prompt}")`);
// (Esc puts it back: still where it stood, move mode on)
await page.keyboard.press('Escape');
await sleep(600);
st = await ev(() => window.__build.state());
const jar0 = st.pieces.find((p) => p.uid === 'jar-1');
check(!st.placing && !!st.moveMode && jar0.x === 426 && jar0.z === -164, `Esc puts it back (${JSON.stringify(jar0)}), move mode stays`);
// (pick it up again, walk off, put it down)
await page.keyboard.press('KeyE');
await sleep(600);
// (a spot where the jar's ghost can stand: the land has trees)
for (const [x, z, y] of [[432, -166, 90], [428, -168, 180], [424, -168, 180], [430, -162, 90], [426, -158, 0], [422, -164, 270]]) {
  await walkTo(x, z, y);
  g = await ghost();
  if (g?.ok) break;
}
const want2 = { x: g?.x, z: g?.z };
check(g?.ok && g.moving === 'jar-1', `its ghost can stand by him (${g?.x}, ${g?.z}, ${g?.reason ?? ''})`);
await page.screenshot({ path: `${out}/move-carry.png` });
await page.keyboard.press('KeyE');
await sleep(800);
st = await ev(() => window.__build.state());
const jar1 = st.pieces.find((p) => p.uid === 'jar-1');
check(Math.abs(jar1.x - want2.x) < 0.02 && Math.abs(jar1.z - want2.z) < 0.02 && jar1.done >= 1 && st.pieces.length === 3, `put down where the ghost was (${JSON.stringify(jar1)})`);
check(st.riel === riel0, 'moving cost nothing');
check(!!st.moveMode && !st.placing, 'move mode goes on for the next');
// (the half-built bed cannot be picked up: why)
check((await ev(() => window.__build.move('kre-1'))) === 'moveUnfinished', 'a half-built bed says "finish it first"');
// (a fence picked up snaps onto the other fence's end as a new run would)
await ev(() => window.__build.add('fence', 430, -150, 0));
check((await ev(() => window.__build.move('fence-2'))) === null, 'the lone fence is picked up');
await walkTo(423, -157, 180);
g = await ghost();
check(g?.snapped && g.ok && Math.abs(g.x - 423) < 0.01 && Math.abs(g.z + 160) < 0.01, `the carried fence snaps onto the other's end (${g?.x}, ${g?.z})`);
await page.keyboard.press('KeyE');
await sleep(800);
// (the walk map: solid where it is now, open where it was)
const wm = await ev(() => {
  const w = window.roam.world;
  const at = (x, z) => +(w.groundAt(x, z) - w.field.heightAt(x, z)).toFixed(2);
  return { now: at(423, -160), was: at(430, -150) };
});
check(wm.now > 1 && wm.was < 0.3, `walk map follows it: solid where it is now, open where it was (${JSON.stringify(wm)})`);
// (Esc ends move mode)
await page.keyboard.press('Escape');
await sleep(500);
check(!(await ev(() => window.__build.state().moveMode)), 'Esc ends move mode');
// (the spirit house moved: its prayer spot goes with it)
await clear();
await ev(() => window.__build.add('spirit', 426, -164, 0));
const prayAt = () =>
  ev(async () => {
    const { WORSHIP } = await import('/src/map/roam/_worship.ts');
    const w = WORSHIP.find((q) => q.id.startsWith('build-spirit'));
    return w ? { x: +w.x.toFixed(2), z: +w.z.toFixed(2) } : null;
  });
const pray0 = await prayAt();
check((await ev(() => window.__build.move('spirit-1'))) === null, 'the spirit house is picked up');
for (const [x, z, y] of [[430, -160, 90], [428, -168, 180], [424, -168, 180], [432, -166, 90], [426, -158, 0], [422, -164, 270]]) {
  await walkTo(x, z, y);
  g = await ghost();
  if (g?.ok) break;
}
check(g?.ok, `its ghost can stand (${g?.x}, ${g?.z}, ${g?.reason ?? ''})`);
await page.keyboard.press('KeyE');
await sleep(1500);
const sp = await ev(() => window.__build.state().pieces.find((p) => p.uid === 'spirit-1'));
const pray1 = await prayAt();
// (the kneeling place is 1.25 m before it: within 1.3 m of its middle, and moved with it)
check(!!pray0 && !!pray1 && Math.hypot(pray1.x - sp.x, pray1.z - sp.z) < 1.3 && (pray1.x !== pray0.x || pray1.z !== pray0.z), `its prayer spot moved with it (${JSON.stringify(pray0)} → ${JSON.stringify(pray1)}, house at ${sp.x}, ${sp.z})`);
await page.keyboard.press('Escape');
await sleep(300);
// (a reload keeps where it was moved: the save)
const saved = await ev(() => JSON.stringify(window.__build.state().pieces.map((p) => [p.uid, p.x, p.z])));
console.log('  pieces now', saved);

check(errors.length === 0, `no page errors ${errors.join(' | ')}`);
console.log(fails ? `${fails} failed` : 'all passed');
await browser.close();
await server.close();
process.exit(fails ? 1 : 0);
