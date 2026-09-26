// Headless play test: drive the explorer with real key presses and check the
// controller walks through the gopura doorway, climbs stairs, collides and jumps,
// then file a bug report and check it points at the code that built the picks.
//   node scripts/playtest.mjs
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';

const root = resolve(import.meta.dirname, '..');
const server = await createServer({ root, logLevel: 'error', server: { port: 5198, strictPort: false } });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({
  executablePath: chromiumPath(),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

let failed = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed++;
};
const state = () =>
  page.evaluate(() => ({
    x: window.player.position.x,
    y: window.player.position.y,
    z: window.player.position.z,
    grounded: window.player.grounded,
    action: window.explorer.currentAction,
  }));
// Simulated time: step the game loop deterministically instead of waiting on rAF.
const hold = async (keys, seconds) => {
  for (const k of keys) await page.keyboard.down(k);
  await page.evaluate((s) => {
    const n = Math.round(s * 60);
    for (let i = 0; i < n; i++) window.__step(1 / 60);
  }, seconds);
  for (const k of keys) await page.keyboard.up(k);
};

await page.goto(`${url}game.html?test=1`, { waitUntil: 'load' });
await page.waitForFunction(() => !!window.__step, null, { timeout: 120_000 });

// 1. Walk east through the gopura doorway (spawn 1 faces the door).
await page.evaluate(() => window.__spawn(1));
let s0 = await state();
await hold(['KeyW'], 13);
let s1 = await state();
check('walks forward', s1.x - s0.x > 20, `moved ${(s1.x - s0.x).toFixed(2)} m in 13 s`);
check('passes through the 1.8 m doorway', s1.x > -504 && Math.abs(s1.z) < 1, `x ${s1.x.toFixed(1)}, z ${s1.z.toFixed(2)}`);
check('stays on the terrace floor', Math.abs(s1.y - 1.5) < 0.05, `y ${s1.y.toFixed(2)}`);

// 2. Running is faster than walking.
await page.evaluate(() => window.__spawn(0));
s0 = await state();
await hold(['KeyW'], 2);
const walked = (await state()).x - s0.x;
await page.evaluate(() => window.__spawn(0));
s0 = await state();
await hold(['KeyW', 'ShiftLeft'], 2);
const ran = (await state()).x - s0.x;
check('run faster than walk', ran > walked * 1.8, `walk ${walked.toFixed(2)} m, run ${ran.toFixed(2)} m in 2 s`);

// 3. Blocked by a wall: from the gopura terrace strafe into the gate hall wall.
await page.evaluate(() => window.__spawn(1));
s0 = await state();
await hold(['KeyA'], 4); // strafe left (north) along the facade
await hold(['KeyW'], 4); // push into the wall beside the door
s1 = await state();
check('wall stops the explorer', s1.x < -520.2, `x ${s1.x.toFixed(2)} (wall face at -520.3)`);

// 4. Climb the temple stairs (2.0 → 3.5 m).
await page.evaluate(() => window.__spawn(2));
s0 = await state();
await hold(['KeyW'], 8);
s1 = await state();
check('climbs the stairs onto the first terrace', s1.y > 3.4, `y ${s0.y.toFixed(2)} → ${s1.y.toFixed(2)}`);

// 5. Jump and land.
await page.evaluate(() => window.__spawn(0));
await page.keyboard.down('Space');
await page.evaluate(() => window.__step(1 / 60));
await page.keyboard.up('Space');
let peak = 0;
for (let i = 0; i < 30; i++) {
  await page.evaluate(() => window.__step(1 / 60));
  peak = Math.max(peak, (await state()).y - 1.0);
}
await hold([], 1);
s1 = await state();
check('jumps', peak > 0.4, `peak ${peak.toFixed(2)} m`);
check('lands', s1.grounded && Math.abs(s1.y - 1.0) < 0.02, `y ${s1.y.toFixed(2)}`);

// 6. E at the doorway opens the door.
await page.evaluate(() => window.__spawn(1));
await hold(['KeyW'], 1.6);
await page.keyboard.press('KeyE');
await page.evaluate(() => window.__step(1 / 60));
s1 = await state();
check('E near the doorway plays openDoor', s1.action === 'openDoor', `action ${s1.action}`);

// 7. I: a flashlight in the left fist, its beam straight ahead of the explorer.
await page.evaluate(() => window.__spawn(1));
await page.keyboard.press('KeyI');
await hold([], 0.5);
const beam = await page.evaluate(() => {
  const light = window.explorer.object.getObjectByName('flashlight');
  if (!light?.isSpotLight) return null;
  const from = light.getWorldPosition(light.position.clone());
  const dir = light.target.getWorldPosition(light.position.clone()).sub(from).normalize();
  const yaw = window.player.yaw;
  const deg = (r) => (r * 180) / Math.PI;
  return {
    held: window.explorer.currentOutfit.held,
    turn: deg(Math.atan2(dir.x, dir.z) - yaw),
    tilt: deg(Math.asin(dir.y)),
  };
});
check(
  'I holds a flashlight that shines ahead',
  beam?.held === 'flashlight' && Math.abs(beam.turn) < 3 && beam.tilt < 0 && beam.tilt > -12,
  beam ? `${beam.turn.toFixed(1)}° from where he faces, tipped ${beam.tilt.toFixed(1)}° onto the path` : 'no spot light',
);
await page.keyboard.press('KeyI');
await hold([], 0.1);

// 8. Z: the view moves into the explorer's camera at his eye; Z again puts it away.
await page.keyboard.press('KeyZ');
await hold([], 1);
const photo = await page.evaluate(() => ({ action: window.explorer.currentAction, view: window.player.photoView }));
check('Z raises the camera to the eye', photo.action === 'photo' && photo.view === 1, `action ${photo.action}, view ${photo.view.toFixed(2)}`);
await page.keyboard.press('KeyZ');
await hold([], 1);
const away = await page.evaluate(() => ({ action: window.explorer.currentAction, view: window.player.photoView }));
check('Z puts the camera away', away.action === null && away.view === 0, `action ${away.action}, view ${away.view.toFixed(2)}`);

// 9. Bug report: B, click the gate hall wall and the explorer, save. The report
// must name the exact lines that built them (source-mapped from the served JS).
const game = await browser.newPage({ viewport: { width: 800, height: 500 } }); // desktop layout: panel on the right
game.on('pageerror', (e) => errors.push(e.message));
await game.goto(`${url}game.html?at=-526,1.5,-5.5,90&cam=0,5,4`, { waitUntil: 'load' });
await game.waitForFunction(() => !!window.feedback, null, { timeout: 120_000 });
await game.keyboard.press('KeyB');
await game.mouse.click(400, 117); // the wall above the explorer's head
await game.mouse.click(400, 250); // the explorer: the camera looks at its head
await game.fill('.fb-panel textarea', 'playtest: report tool check');
await game.keyboard.press('Control+Enter'); // save (a click would wait for "stable" frames, slow in software GL)
await game.waitForFunction(() => document.querySelector('.fb-panel')?.dataset.mode === 'saved', null, { timeout: 60_000, polling: 100 });
const saved = resolve(root, (await game.textContent('.fb-status p')).replace(/^Saved to /, ''));
const report = existsSync(resolve(saved, 'report.md')) ? readFileSync(resolve(saved, 'report.md'), 'utf8') : '';
const wall = readFileSync(resolve(root, 'src/game/world/AngkorScaleWorld.ts'), 'utf8').split('\n').findIndex((l) => l.includes('w.block(chunk, x0, floor, zc - hw,')) + 1;
check('report names the line that built the wall', report.includes(`\`src/game/world/AngkorScaleWorld.ts:${wall}\` gateHall`), `expected AngkorScaleWorld.ts:${wall} gateHall`);
check('report names the explorer part', /### ② Explorer · hair[\s\S]*`src\/character\/parts\/hair\.ts:\d+` buildHair/.test(report), report.match(/### ② .*/)?.[0]);
check('report has a screenshot', existsSync(resolve(saved, 'screenshot.jpg')), saved);
rmSync(saved, { recursive: true, force: true });

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close();
await server.close();
process.exit(failed ? 1 : 0);
