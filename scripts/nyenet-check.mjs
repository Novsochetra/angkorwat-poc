// New Year's Eve online, phase 2: the game's connection to the live rooms (src/net/client.ts `NET`), checked
// headless with two pages and a local server (AWP-35; docs/discussion/new-year-online.md "Testing").
//
//   npm run nyetest                 # light pages (only the net code and the clock: seconds)
//   npm run nyetest -- page=map     # the whole map page (index.html: minutes on a CPU)
//   npm run nyetest -- mock=1       # against the small mock server below, not server/app.ts
//
// The server: server/app.ts `startServer` on a free port with a random test code (the code is never in the game),
// or, with no server/ yet, a small mock here (with `ws` from server/node_modules), or the check is skipped.
// Each page opens `?nyeserver=ws://localhost:<port>&nye=+3m&event=<code>`, joins the test room through
// `window.NET` (exposed in dev), walks, and the checks are:
//   - both online in the test room (nye/clock.ts `inTestRoom`), the welcome within 3 s;
//   - each sees the other in `NET.peers` within 2 s;
//   - their `nyeNow()` agree within 0.2 s (the test room's midnight and the server's clock);
//   - the other player moves smoothly (no step back along his walk) and at the right place (within 1.5 m);
//   - a party made on one page is joined by the other (real server only);
//   - the arcade party (phase 3): both pages told the same code (`NET.setParty`) are in it and marked to each other;
//   - leave() puts the page back alone (state off, no test midnight, no peers).
// Exit code 1 when a check fails.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { chromiumPath } from './chromium.mjs';

const root = resolve(import.meta.dirname, '..');
const args = Object.fromEntries(process.argv.slice(2).map((a) => [a.split('=')[0], a.split('=').slice(1).join('=') || '1']));
const fullMap = args.page === 'map';
const code = randomBytes(4).toString('hex').toUpperCase();

// ── The live server (the real one, else a mock) ──────────────────────────────────────────────────────────────────

let live = null;
let mock = false;
if (!args.mock && existsSync(resolve(root, 'server/app.ts'))) {
  try {
    const { startServer } = await import(resolve(root, 'server/app.ts'));
    live = await startServer({ port: 0, host: '127.0.0.1', eventCode: code, logEveryMs: 0, log: () => undefined });
  } catch (e) {
    console.log(`(server/app.ts did not start: ${e.message}; trying the mock)`);
  }
}
if (!live) {
  const wsPath = resolve(root, 'server/node_modules/ws');
  if (!existsSync(wsPath)) {
    console.log('SKIP: no server/ and no ws package for a mock (npm install in server/)');
    process.exit(0);
  }
  live = await startMock(createRequire(import.meta.url)(wsPath));
  mock = true;
}
const port = live.port;
console.log(`server: ${mock ? 'mock' : 'server/app.ts'} on ws://localhost:${port}`);

// ── The pages ───────────────────────────────────────────────────────────────────────────────────────────────────

/** A page with only the net code and the clock (the map's index.html takes minutes to build on a CPU). */
const lightPage = {
  name: 'nyenet-page',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (!req.url?.startsWith('/__nyenet.html')) return next();
      res.setHeader('content-type', 'text/html');
      res.end(`<!doctype html><meta charset="utf-8"><title>nyenet</title><script type="module">
        import { NET } from '/src/net/client.ts';
        import * as clock from '/src/map/nye/clock.ts';
        window.NET = NET; window.__clock = clock; window.__ready = true;
      </script>`);
    });
  },
};

const server = await createServer({ root, logLevel: 'error', plugins: [lightPage], server: { port: 5198, strictPort: false, hmr: false } });
await server.listen();
const base = server.resolvedUrls?.local?.[0]?.replace(/\/$/, '') ?? 'http://localhost:5198';
const query = `nyeserver=ws://localhost:${port}&nye=%2B3m&event=${code}`;
const url = fullMap ? `${base}/index.html?${query}&shot=0` : `${base}/__nyenet.html?${query}`;

const browser = await chromium.launch({ executablePath: chromiumPath(), args: fullMap ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] : [] });
const failures = [];
const check = (ok, what) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) failures.push(what);
};

async function open(name) {
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', (e) => console.error(`[${name} pageerror]`, e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' || /^\[net\]/.test(m.text())) console.log(`[${name} ${m.type()}]`, m.text());
  });
  await page.goto(url, { waitUntil: 'load', timeout: 300_000 });
  await page.waitForFunction(() => window.__ready === true && window.NET, null, { timeout: 300_000 });
  if (fullMap) await page.evaluate(async () => (window.__clock = await import('/src/map/nye/clock.ts')));
  return page;
}

try {
  const [a, b] = await Promise.all([open('A'), open('B')]);

  // Join both, and drive `NET.update` from a timer (60 a second) with each one walking: A east, B north.
  const join = (page, name, start, dir) =>
    page.evaluate(
      ({ name, code, start, dir }) => {
        const NET = window.NET;
        if (NET.pendingCode !== code) throw new Error(`pendingCode ${NET.pendingCode}`);
        NET.join({ name, look: NET.look, room: 'test', code: NET.pendingCode });
        const me = { x: start[0], y: start[1], z: start[2], yaw: Math.atan2(dir[0], dir[1]), ride: 0 };
        window.__me = me;
        window.__walk = true;
        let last = performance.now();
        window.__track = [];
        setInterval(() => {
          const now = performance.now();
          const dt = (now - last) / 1000;
          last = now;
          if (window.__walk) {
            me.x += dir[0] * 1.5 * dt;
            me.z += dir[1] * 1.5 * dt;
          }
          NET.update(dt, me);
          for (const p of NET.peers.values()) window.__track.push([now, p.x, p.z, p.sid]);
        }, 16);
      },
      { name, code, start, dir },
    );
  const t0 = Date.now();
  await Promise.all([join(a, 'Alpha', [384, 11, -248], [1, 0]), join(b, 'Bopha', [390, 11, -252], [0, -1])]);
  const online = (page) => page.waitForFunction(() => window.NET.state === 'online', null, { timeout: 3000 }).then(() => true, () => false);
  const [aOn, bOn] = await Promise.all([online(a), online(b)]);
  const state = (page) => page.evaluate(() => ({ state: window.NET.state, refusal: window.NET.refusal, room: window.NET.room, me: window.NET.me, test: window.__clock.inTestRoom() }));
  const sa = await state(a);
  const sb = await state(b);
  check(aOn && bOn, `both online within 3 s (A ${sa.state}${sa.refusal ? ` ${sa.refusal}` : ''}, B ${sb.state}${sb.refusal ? ` ${sb.refusal}` : ''}; ${Date.now() - t0} ms)`);
  check(sa.room === 'test' && sb.room === 'test' && sa.test && sb.test, `both in the test room, its midnight set (A ${sa.room}/${sa.test}, B ${sb.room}/${sb.test})`);

  // Each sees the other within 2 s.
  const sees = (page, sid) => page.waitForFunction((sid) => window.NET.peers.has(sid), sid, { timeout: 2000 }).then(() => true, () => false);
  const t1 = Date.now();
  const [aSees, bSees] = await Promise.all([sees(a, sb.me?.sid), sees(b, sa.me?.sid)]);
  check(aSees && bSees, `each sees the other in peers within 2 s (A ${aSees}, B ${bSees}; ${Date.now() - t1} ms)`);

  // The clocks: let the ping burst finish, then nyeNow() − Date.now() on both (one machine, one Date).
  await new Promise((r) => setTimeout(r, 1500));
  const skew = (page) => page.evaluate(() => window.__clock.nyeNow() - Date.now());
  const [ka, kb] = await Promise.all([skew(a), skew(b)]);
  const secs = await a.evaluate(() => window.__clock.nyeSeconds());
  check(Math.abs(ka - kb) < 200, `nyeNow() agree within 0.2 s (${Math.abs(ka - kb).toFixed(1)} ms; midnight in ${(-secs).toFixed(0)} s)`);

  // Smooth: B's view of A walking east: x never steps back by more than a centimetre, and ends near A's true spot.
  await b.evaluate(() => (window.__track = []));
  await new Promise((r) => setTimeout(r, 2000));
  const track = await b.evaluate((sid) => window.__track.filter((t) => t[3] === sid), sa.me?.sid);
  let back = 0;
  for (let i = 1; i < track.length; i++) back = Math.max(back, track[i - 1][1] - track[i][1]);
  const aNow = await a.evaluate(() => ({ ...window.__me }));
  const seen = track.at(-1);
  // (A shown ≈ 120 ms + the trip behind: 1.5 m/s makes that a few dozen cm)
  const off = seen ? Math.hypot(seen[1] - aNow.x, seen[2] - aNow.z) : Infinity;
  check(track.length > 60 && back < 0.01, `A glides smoothly on B's screen (${track.length} frames, biggest step back ${(back * 100).toFixed(2)} cm)`);
  check(off < 1.5, `A is where A is (${off.toFixed(2)} m behind on B's screen)`);

  // Standing still: states drop to one a second (the peer stays, not stale past 1.5 s).
  await a.evaluate(() => (window.__walk = false));
  await new Promise((r) => setTimeout(r, 2500));
  const still = await b.evaluate((sid) => {
    const p = window.NET.peers.get(sid);
    return p ? { stale: p.stale, x: p.x, z: p.z } : { stale: -1, x: NaN, z: NaN };
  }, sa.me?.sid);
  const aStill = await a.evaluate(() => ({ ...window.__me }));
  const settle = Math.hypot(still.x - aStill.x, still.z - aStill.z);
  check(still.stale >= 0 && still.stale < 1.5, `A standing still stays on B's screen (stale ${still.stale.toFixed(2)} s)`);
  check(settle < 0.05, `A standing still is drawn on his spot (${(settle * 100).toFixed(1)} cm off)`);

  // A party (the real server only: the mock has none).
  if (!mock) {
    await a.evaluate(() => window.NET.makeParty());
    const partyA = await a.waitForFunction(() => window.NET.party.code, null, { timeout: 2000 }).then((h) => h.jsonValue(), () => null);
    let partyB = null;
    if (partyA) {
      await b.evaluate(
        ({ code, party }) => {
          window.NET.join({ name: 'Bopha', look: window.NET.look, room: 'test', code, party });
        },
        { code, party: partyA },
      );
      partyB = await b.waitForFunction(() => window.NET.state === 'online' && window.NET.party.code, null, { timeout: 3000 }).then((h) => h.jsonValue(), () => null);
    }
    check(!!partyA && partyA === partyB, `a party made on A is joined by B (A ${partyA}, B ${partyB})`);

    // The arcade party (phase 3: map/party/ tells NET the arcade service's code): a code the server never made.
    const arcade = 'H4RT7Q';
    await a.evaluate((c) => window.NET.setParty(c), arcade);
    await b.evaluate((c) => window.NET.setParty(c), arcade);
    const sidA = await a.evaluate(() => window.NET.me?.sid);
    const both = await b
      .waitForFunction(
        ({ c, sid }) => window.NET.party.code === c && window.NET.party.members === 2 && window.NET.peers.get(sid)?.party === true,
        { c: arcade, sid: sidA },
        { timeout: 4000 },
      )
      .then(() => true, () => false);
    const aParty = await a.evaluate(() => ({ ...window.NET.party }));
    check(both && aParty.code === arcade, `the arcade party's code groups A and B and marks A for B (A ${JSON.stringify(aParty)}, B ok ${both})`);
  }

  // Leave: alone again.
  const left = await a.evaluate(() => {
    window.NET.leave();
    return { state: window.NET.state, test: window.__clock.inTestRoom(), peers: window.NET.peers.size };
  });
  check(left.state === 'off' && !left.test && left.peers === 0, `leave() plays alone again (${JSON.stringify(left)})`);

  // A wrong code is refused (not retried).
  const wrong = await a.evaluate(async () => {
    window.NET.join({ name: 'Alpha', look: window.NET.look, room: 'test', code: 'NOPE99' });
    for (let i = 0; i < 60 && window.NET.state !== 'refused'; i++) await new Promise((r) => setTimeout(r, 50));
    return { state: window.NET.state, refusal: window.NET.refusal };
  });
  check(mock || (wrong.state === 'refused' && wrong.refusal === 'code'), `a wrong test code is refused (${JSON.stringify(wrong)})`);

  // The server goes away and comes back (real server only): B retries, the test night kept, and is back online.
  if (!mock) {
    await live.close();
    const dropped = await b
      .waitForFunction(() => window.NET.state === 'retrying', null, { timeout: 3000 })
      .then(() => b.evaluate(() => window.__clock.inTestRoom()), () => null);
    check(dropped === true, `the server gone, B retries with the test night kept (${dropped})`);
    const { startServer } = await import(resolve(root, 'server/app.ts'));
    live = await startServer({ port, host: '127.0.0.1', eventCode: code, logEveryMs: 0, log: () => undefined });
    const back = await b.waitForFunction(() => window.NET.state === 'online', null, { timeout: 8000 }).then(() => true, () => false);
    check(back, `the server back, B is online again (${await b.evaluate(() => window.NET.state)})`);
  }
} catch (e) {
  check(false, `the check ran (${e.message})`);
} finally {
  await browser.close();
  await server.close();
  await live.close();
}
console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nall checks passed');
process.exit(failures.length ? 1 : 0);

// ── The mock server (no server/ yet): welcome, pong, peers at 5 a second, count; the test room only ────────────────

async function startMock(WS) {
  const wss = new WS.WebSocketServer({ port: 0, host: '127.0.0.1' });
  await new Promise((r) => wss.once('listening', r));
  const players = new Map();
  let sid = 1;
  const midnight = (() => {
    const q = 15 * 60_000;
    let m = Math.ceil(Date.now() / q) * q;
    if (m - Date.now() < 120_000) m += q;
    return m;
  })();
  wss.on('connection', (ws) => {
    let me = null;
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw));
      if (m.t === 'hello') {
        if (m.room === 'test' && m.code !== code) return ws.send(JSON.stringify({ t: 'error', code: 'code' }));
        me = { sid: sid++, name: m.name, look: m.look, x: 0, y: 0, z: 0, yaw: 0, ride: 0, emote: 0, emoteAt: 0 };
        players.set(ws, me);
        ws.send(JSON.stringify({ t: 'welcome', sid: me.sid, room: 'test', crowd: 1, now: Date.now(), midnight, name: m.name }));
      } else if (m.t === 'ping') ws.send(JSON.stringify({ t: 'pong', at: m.at, now: Date.now() }));
      else if (m.t === 'state' && me) Object.assign(me, { x: m.x, y: m.y, z: m.z, yaw: m.yaw, ride: m.ride });
    });
    ws.on('close', () => players.delete(ws));
  });
  const timer = setInterval(() => {
    const peers = [...players.values()];
    for (const ws of players.keys()) {
      ws.send(JSON.stringify({ t: 'peers', now: Date.now(), peers }));
      ws.send(JSON.stringify({ t: 'count', square: peers.length, lake: 0, online: peers.length }));
    }
  }, 200);
  return {
    port: wss.address().port,
    close: () => {
      clearInterval(timer);
      return new Promise((r) => wss.close(r));
    },
  };
}
