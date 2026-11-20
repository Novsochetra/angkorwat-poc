#!/usr/bin/env node
/**
 * Robot players for the live server (AWP-35 ticket 9; docs/discussion/new-year-online.md "Robot players"):
 *
 *   npm run nyeload -- bots=300 url=ws://localhost:8787 code=K7QM2P
 *
 * No drawing, only connections: each bot joins the test room with a name, walks to the festival square at
 * Phnom Kulen's foot (up the lantern walk) or to the lake terrace, greets now and then, cheers at midnight and stays
 * through it. Every 10 s it prints the server's /health (players, crowds, CPU, memory, message rates) and what the
 * bots get (peers messages a second per bot, players per message, kB a second).
 *
 * Options (key=value): bots (300), url (ws://localhost:8787), code (or EVENT_CODE in the shell), room (test|public),
 * rate (joins a second, 25), speed (m/s walking, 2.5), start (far: the village and the floating village | near: by
 * the square's gate and the terrace), secs (stop after this long; default: midnight + 60 s), lake (share of bots
 * going to the lake terrace, 0.3).
 *
 * The server limits joins to 6 a minute per address: start it with JOIN_LIMIT_EXEMPT=127.0.0.1,::1 (or the
 * load machine's address on a staging service).
 */
import { EMOTES, PROTOCOL } from '../src/net/protocol.ts';
import { LAKE_SHORE, LANTERN_WALK, SQUARE } from '../src/map/nye/plan.ts';

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.split('=')).map(([k, ...v]) => [k, v.join('=')]));
const BOTS = Number(args.bots ?? 300);
const URL_ = args.url ?? 'ws://localhost:8787';
const CODE = args.code ?? process.env.EVENT_CODE ?? '';
const ROOM = args.room ?? 'test';
const RATE = Number(args.rate ?? 25);
const SPEED = Number(args.speed ?? 2.5);
const START = args.start ?? 'far';
const SECS = args.secs ? Number(args.secs) : null;
const LAKE = Number(args.lake ?? 0.3);
const HEALTH = URL_.replace(/^ws/, 'http').replace(/\/+$/, '') + '/health';

if (ROOM === 'test' && !CODE) {
  console.error('nyeload: the test room needs its code: code=<EVENT_CODE> (or EVENT_CODE in the shell)');
  process.exit(2);
}

// Names that pass the name check (letters only: no digits).
const FIRST = ['Sokha', 'Dara', 'Vibol', 'Sophea', 'Chenda', 'Bopha', 'Rithy', 'Kosal', 'Nary', 'Piseth', 'Sreymom', 'Vanna', 'Rachana', 'Samnang', 'Thida', 'Kanha', 'Mony', 'Sovann', 'Leak', 'Chan'];
const LAST = ['Bot', 'Robot', 'Tester', 'Walker', 'Runner', 'Helper', 'Friend', 'Visitor'];

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const inEllipse = (e, f = 0.85) => {
  const a = Math.random() * Math.PI * 2;
  const r = Math.sqrt(Math.random()) * f;
  return [e.x + Math.cos(a) * e.rx * r, e.z + Math.sin(a) * e.rz * r];
};

/** A bot's way: points to walk through, the last one its spot on the square or the terrace. */
function pathFor(lake) {
  if (lake) {
    const end = inEllipse(LAKE_SHORE);
    // from the floating village's shore north-west up the lake trail to the terrace
    const from = START === 'near' ? [LAKE_SHORE.x + rnd(-30, 30), LAKE_SHORE.z + rnd(25, 40)] : [rnd(-300, -260), rnd(0, 30)];
    return [from, [(from[0] + end[0]) / 2 + rnd(-8, 8), (from[1] + end[1]) / 2 + rnd(-8, 8)], end];
  }
  const end = inEllipse(SQUARE);
  const walk = LANTERN_WALK.map(([x, z]) => [x + rnd(-2, 2), z + rnd(-2, 2)]);
  const way = START === 'near' ? walk.slice(-2) : walk;
  return [...way, end];
}

const stats = { joined: 0, refused: {}, closed: 0, peerMsgs: 0, peerCount: 0, bytes: 0, maxPeers: 0, midnights: new Set(), crowds: {}, counts: null };
const bots = [];
const t0 = Date.now();

class Bot {
  constructor(i) {
    this.i = i;
    this.lake = Math.random() < LAKE;
    this.path = pathFor(this.lake);
    this.leg = 0;
    [this.x, this.z] = this.path[0];
    this.yaw = 0;
    this.y = this.lake ? 1 : 8;
    this.welcome = null;
    this.lastSent = 0;
    this.nextGreet = Date.now() + rnd(10_000, 40_000);
    this.cheered = false;
    this.ws = new WebSocket(URL_);
    this.ws.addEventListener('open', () => {
      this.ws.send(
        JSON.stringify({
          t: 'hello',
          v: PROTOCOL,
          id: `nyeload-${process.pid}-${i}-${Math.random().toString(36).slice(2)}`,
          name: `${pick(FIRST)} ${pick(LAST)}`,
          look: Math.floor(Math.random() * 2 ** 31),
          room: ROOM,
          ...(ROOM === 'test' ? { code: CODE } : {}),
        }),
      );
    });
    this.ws.addEventListener('message', (ev) => {
      const text = String(ev.data);
      stats.bytes += text.length;
      const m = JSON.parse(text);
      if (m.t === 'peers') {
        stats.peerMsgs++;
        stats.peerCount += m.peers.length;
        if (m.peers.length > stats.maxPeers) stats.maxPeers = m.peers.length;
      } else if (m.t === 'welcome') {
        this.welcome = m;
        stats.joined++;
        stats.crowds[m.crowd] = (stats.crowds[m.crowd] ?? 0) + 1;
        if (m.midnight) stats.midnights.add(m.midnight);
      } else if (m.t === 'error') {
        stats.refused[m.code] = (stats.refused[m.code] ?? 0) + 1;
      } else if (m.t === 'count') {
        stats.counts = m;
      }
    });
    this.ws.addEventListener('close', () => {
      stats.closed++;
      this.dead = true;
    });
    this.ws.addEventListener('error', () => {});
  }

  tick(now, dt) {
    if (!this.welcome || this.dead || this.ws.readyState !== WebSocket.OPEN) return;
    // Walk the path; at its end stand (and turn to the stage now and then).
    let moving = false;
    const target = this.path[this.leg + 1];
    if (target) {
      const dx = target[0] - this.x;
      const dz = target[1] - this.z;
      const d = Math.hypot(dx, dz);
      const step = SPEED * dt;
      if (d <= step) {
        [this.x, this.z] = target;
        this.leg++;
      } else {
        this.x += (dx / d) * step;
        this.z += (dz / d) * step;
      }
      this.yaw = Math.atan2(dx, dz);
      moving = true;
    }
    // States: 5 a second moving, 1 a second still (as the page does).
    if (now - this.lastSent >= (moving ? 200 : 1000)) {
      this.lastSent = now;
      this.ws.send(JSON.stringify({ t: 'state', x: this.x, y: this.y, z: this.z, yaw: this.yaw, ride: 0 }));
    }
    // Greet now and then; cheer at midnight.
    const mid = this.welcome.midnight;
    const serverNow = now + (this.welcome.now - this.joinedAt);
    if (mid && !this.cheered && serverNow >= mid) {
      this.cheered = true;
      this.ws.send(JSON.stringify({ t: 'emote', emote: EMOTES.indexOf(Math.random() < 0.5 ? 'happyNewYear' : 'cheer') }));
    } else if (now >= this.nextGreet) {
      this.nextGreet = now + rnd(20_000, 40_000);
      this.ws.send(JSON.stringify({ t: 'emote', emote: EMOTES.indexOf(pick(['wave', 'sampeah', 'clap'])) }));
    }
    if (!this.lastPing || now - this.lastPing > 5000) {
      this.lastPing = now;
      this.ws.send(JSON.stringify({ t: 'ping', at: now }));
    }
  }
}

// Join at `rate` a second.
let made = 0;
const joining = setInterval(() => {
  for (let k = 0; k < Math.max(1, RATE / 10) && made < BOTS; k++) {
    const b = new Bot(made++);
    b.joinedAt = Date.now();
    bots.push(b);
  }
  if (made >= BOTS) clearInterval(joining);
}, 100);

let last = Date.now();
const walking = setInterval(() => {
  const now = Date.now();
  const dt = (now - last) / 1000;
  last = now;
  for (const b of bots) b.tick(now, dt);
}, 50);

let prev = { peerMsgs: 0, peerCount: 0, bytes: 0, at: Date.now() };
const fmt = (n) => (Math.round(n * 10) / 10).toString();
async function report(final = false) {
  const now = Date.now();
  const secs = (now - prev.at) / 1000;
  const alive = bots.filter((b) => b.welcome && !b.dead).length;
  const msgs = stats.peerMsgs - prev.peerMsgs;
  const perBot = alive ? msgs / secs / alive : 0;
  const avgPeers = msgs ? (stats.peerCount - prev.peerCount) / msgs : 0;
  const kB = (stats.bytes - prev.bytes) / 1024 / secs;
  prev = { peerMsgs: stats.peerMsgs, peerCount: stats.peerCount, bytes: stats.bytes, at: now };
  let h = null;
  try {
    h = await (await fetch(HEALTH, { signal: AbortSignal.timeout(3000) })).json();
  } catch (err) {
    h = { error: String(err.message ?? err) };
  }
  const mid = [...stats.midnights][0];
  const toMid = mid ? Math.round((mid - now) / 1000) : null;
  const room = h?.byRoom?.[ROOM];
  console.log(
    `[${fmt((now - t0) / 1000)} s] bots ${alive}/${made} (joined ${stats.joined}, closed ${stats.closed}${Object.keys(stats.refused).length ? `, errors ${JSON.stringify(stats.refused)}` : ''})` +
      ` · per bot ${fmt(perBot)} peers msgs/s, ${fmt(avgPeers)} players each (max ${stats.maxPeers}) · bots receive ${fmt(kB)} kB/s` +
      (stats.counts ? ` · square ${stats.counts.square} lake ${stats.counts.lake} online ${stats.counts.online}` : '') +
      (toMid !== null ? ` · midnight in ${toMid} s` : ''),
  );
  if (h && !h.error)
    console.log(
      `           server: players ${h.players}, crowds ${room ? `[${room.crowds.join(' ')}]` : h.crowds}, cpu ${h.cpuPct}%, rss ${h.memoryMB} MB, last minute in ${h.rates.msgsIn}/s out ${h.rates.msgsOut}/s peers ${h.rates.peersOut}/s ${h.rates.kBOut} kB/s`,
    );
  else console.log(`           server health: ${h?.error ?? 'none'}`);
  if (final) {
    console.log(`midnights the bots were given: ${stats.midnights.size} (${[...stats.midnights].map((m) => new Date(m).toISOString()).join(', ')}); crowds ${JSON.stringify(stats.crowds)}`);
    if (stats.refused.rate) console.log('(refused "rate": start the server with JOIN_LIMIT_EXEMPT=127.0.0.1,::1)');
  }
}
const reporting = setInterval(() => void report(), 10_000);

// Stop: after `secs`, or a minute after midnight.
const stopCheck = setInterval(() => {
  const now = Date.now();
  const mid = [...stats.midnights][0];
  const end = SECS !== null ? t0 + SECS * 1000 : mid ? mid + 60_000 : null;
  if (end !== null && now >= end) void stop();
}, 500);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  clearInterval(joining);
  clearInterval(walking);
  clearInterval(reporting);
  clearInterval(stopCheck);
  await report(true);
  for (const b of bots) b.ws.close();
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', () => void stop());
