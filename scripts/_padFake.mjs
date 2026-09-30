// A fake game pad for Playwright checks of the map's pad support (src/map/pad/pad.ts).
//
//   import { installFakePad, connectPad, tap, hold, release, stick, rumbles } from './_padFake.mjs';
//   await installFakePad(page);              // before page.goto: navigator.getGamepads() lists it (a DualSense)
//   await installFakePad(page, 'xbox');      // an Xbox pad instead
//   await page.goto(url);
//   await connectPad(page);                  // "plugged in" (gamepadconnected), and a first press so it counts
//   await tap(page, 'south');                // ✕ pressed and let go (waits until the page has seen the press)
//   await hold(page, 'r2', 0.6);             // R2 fully down (value 0.6: half way) until release()
//   await release(page, 'r2');
//   await stick(page, 'left', 0, -1);        // left stick pushed forward (browser axes: y −1 is up)
//   await stick(page, 'left', 0, 0);         // let go
//   await rumbles(page);                     // the shakes asked for: [{ type, duration, weakMagnitude, strongMagnitude, at }]
//
// Buttons by where they sit (pad.ts `PAD_BUTTONS`): south ✕, east ○, west □, north △, l1, r1, l2, r2,
// select (Create), start (Options), l3, r3, up, down, left, right, home, touchpad.
// The pad only reads in animation frames: in headless swiftshader they come every few seconds, so
// `tap` waits for the page to count the press (window.__pad.state.presses) before letting go.
// Use GPU Chromium (scripts/video.mjs `gpuChromium`) for anything that needs real frame rates.

export const PAD_BUTTONS = ['south', 'east', 'west', 'north', 'l1', 'r1', 'l2', 'r2', 'select', 'start', 'l3', 'r3', 'up', 'down', 'left', 'right', 'home', 'touchpad'];

const IDS = {
  ps: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
  xbox: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
  other: '8BitDo Pro 2 (STANDARD GAMEPAD Vendor: 2dc8 Product: 6006)',
};

/** Before `page.goto`: the page's `navigator.getGamepads()` lists a fake pad (not connected until `connectPad`). */
export async function installFakePad(page, kind = 'ps') {
  await page.addInitScript((id) => {
    const buttons = Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 }));
    const log = [];
    const pad = {
      id,
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: performance.now(),
      axes: [0, 0, 0, 0],
      buttons,
      vibrationActuator: {
        type: 'dual-rumble',
        effects: ['dual-rumble'],
        playEffect(type, p) {
          log.push({ type, ...p, at: Math.round(performance.now()) });
          return Promise.resolve('complete');
        },
        reset() {
          return Promise.resolve('complete');
        },
      },
    };
    let on = false;
    Object.defineProperty(navigator, 'getGamepads', { value: () => [on ? pad : null, null, null, null], configurable: true });
    const touch = () => (pad.timestamp = performance.now());
    window.__fakePad = {
      pad,
      log,
      connect() {
        on = true;
        touch();
        const e = new Event('gamepadconnected');
        e.gamepad = pad;
        dispatchEvent(e);
      },
      disconnect() {
        on = false;
        const e = new Event('gamepaddisconnected');
        e.gamepad = pad;
        dispatchEvent(e);
      },
      set(i, down, value) {
        buttons[i] = { pressed: down, touched: down, value: down ? (value ?? 1) : 0 };
        touch();
      },
      axes(i, x, y) {
        pad.axes[i] = x;
        pad.axes[i + 1] = y;
        touch();
      },
    };
  }, IDS[kind] ?? kind);
}

const index = (name) => {
  const i = PAD_BUTTONS.indexOf(name);
  if (i < 0) throw new Error(`no pad button "${name}" (${PAD_BUTTONS.join(', ')})`);
  return i;
};

/** "Plugged in", then a press of nothing much (Chrome lists a pad only after one): the page starts reading it. */
export async function connectPad(page) {
  await page.evaluate(() => window.__fakePad.connect());
  await page.waitForFunction(() => window.__pad?.state?.connected === true, null, { timeout: 30_000 });
}

/** A button pressed (and held until `release`); resolves once the page has counted the press. */
export async function hold(page, name, value = 1) {
  const i = index(name);
  const before = await page.evaluate((n) => window.__pad.state.presses[n], name);
  await page.evaluate(([i, v]) => window.__fakePad.set(i, true, v), [i, value]);
  await page.waitForFunction(([n, b]) => window.__pad.state.presses[n] > b, [name, before], { timeout: 30_000 });
}

/** A held button let go (waits two animation frames, so the page sees it up). */
export async function release(page, name) {
  const i = index(name);
  await page.evaluate((i) => window.__fakePad.set(i, false), i);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** A press and let go. */
export async function tap(page, name) {
  await hold(page, name);
  await release(page, name);
}

/** A stick at (x, y), as the browser gives it: x right, y down (−1 pushed away from you). */
export async function stick(page, which, x, y) {
  await page.evaluate(([i, x, y]) => window.__fakePad.axes(i, x, y), [which === 'right' ? 2 : 0, x, y]);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** The shakes the page asked the pad for so far. */
export async function rumbles(page) {
  return page.evaluate(() => window.__fakePad.log.slice());
}
