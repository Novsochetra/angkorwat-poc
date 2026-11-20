/**
 * The live server's checks: `node server/test.ts` (or `npm run server:test`). Starts the server on a free port and
 * plays it with WebSocket clients (Node's own): joining and seeing each other, names and codes refused, the limits,
 * the speed check, reports hiding a name, the test room's midnight, parties keeping a crowd (the server's own and the
 * arcade service's codes), the nearest-50.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { LIMITS, PEER_E, PEER_N, PEER_S, POS_Q, PROTOCOL, YAW_Q, testMidnight } from '../src/net/protocol.ts';
import type { ClientMsg, PeerState, ServerMsg, ServerPeers, ServerWelcome } from '../src/net/protocol.ts';
import { startServer, type RunningServer } from './app.ts';

const CODE = 'K7QM2P';

class Bot {
  ws: WebSocket;
  msgs: ServerMsg[] = [];
  closed = false;
  closeCode = 0;
  private waiters: (() => void)[] = [];
  welcome: ServerWelcome | null = null;
  lastPeers: ServerPeers | null = null;

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.addEventListener('message', (ev) => {
      const m = JSON.parse(String(ev.data)) as ServerMsg;
      this.msgs.push(m);
      if (m.t === 'welcome') this.welcome = m;
      if (m.t === 'peers') this.lastPeers = m;
      if (m.t === 'pp') {
        this.ppBytes += String(ev.data).length;
        this.pp.push(m);
        this.applyV2(m);
      }
      this.poke();
    });
    this.ws.addEventListener('close', (ev) => {
      this.closed = true;
      this.closeCode = ev.code;
      this.poke();
    });
  }
  /** Version 2: the players near, as the page keeps them (the 'pp' messages applied). */
  known = new Map<number, PeerState>();
  pp: Extract<ServerMsg, { t: 'pp' }>[] = [];
  ppBytes = 0;
  private applyV2(m: Extract<ServerMsg, { t: 'pp' }>): void {
    for (const sid of m.g ?? []) this.known.delete(sid);
    const n = m.n ?? [];
    for (let i = 0; i < n.length; i += PEER_N) {
      const sid = n[i] as number;
      const p = this.known.get(sid) ?? { sid, name: '', x: 0, y: 0, z: 0, yaw: 0, ride: 0, emote: 0, emoteAt: 0, look: 0 };
      p.name = n[i + 1] as string;
      p.look = n[i + 2] as number;
      p.party = n[i + 3] === 1;
      this.known.set(sid, p);
    }
    const st = m.s ?? [];
    for (let i = 0; i < st.length; i += PEER_S) {
      const p = this.known.get(st[i]);
      assert.ok(p, 'a state only for an introduced player');
      p.x = st[i + 1] / POS_Q;
      p.y = st[i + 2] / POS_Q;
      p.z = st[i + 3] / POS_Q;
      p.yaw = (st[i + 4] / YAW_Q) * Math.PI * 2;
      p.ride = st[i + 5];
    }
    const e = m.e ?? [];
    for (let i = 0; i < e.length; i += PEER_E) {
      const p = this.known.get(e[i]);
      if (!p) continue;
      p.emote = e[i + 1];
      p.emoteAt = m.now - e[i + 2];
    }
    this.lastPeers = { t: 'peers', now: m.now, peers: [...this.known.values()] };
  }
  private poke(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const f of w) f();
  }
  open(): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.ws.addEventListener('open', () => resolve(), { once: true });
      this.ws.addEventListener('error', () => reject(new Error('could not connect')), { once: true });
    });
  }
  send(m: ClientMsg | Record<string, unknown>): void {
    if (this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
  /** Waits until `pred` holds (checked on every message), or fails after `ms`. */
  async until<T>(pred: () => T | undefined | null | false, ms = 3000, what = 'a message'): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = pred();
      if (v) return v;
      const left = end - Date.now();
      if (left <= 0) throw new Error(`timed out waiting for ${what}`);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }
  error(): Extract<ServerMsg, { t: 'error' }> | undefined {
    return this.msgs.find((m): m is Extract<ServerMsg, { t: 'error' }> => m.t === 'error');
  }
  peer(sid: number): PeerState | undefined {
    return this.lastPeers?.peers.find((p) => p.sid === sid);
  }
  close(): void {
    this.ws.close();
  }
}

let devices = 0;
async function join(srv: RunningServer, name: string, extra: Record<string, unknown> = {}): Promise<Bot> {
  const b = new Bot(srv.url);
  await b.open();
  b.send({ t: 'hello', v: (extra.v as number | undefined) ?? PROTOCOL, id: `test-device-${++devices}`, name, look: devices, room: 'public', ...extra });
  await b.until(() => b.welcome || b.error() || b.closed, 3000, `${name}'s welcome`);
  return b;
}
const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const results: { name: string; ok: boolean; why?: string }[] = [];
async function check(name: string, fn: () => Promise<void>): Promise<void> {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, ok: true });
    console.log(`  ok   ${name} (${Date.now() - t0} ms)`);
  } catch (err) {
    results.push({ name, ok: false, why: (err as Error).message });
    console.log(`  FAIL ${name}: ${(err as Error).stack}`);
  }
}

const srv = await startServer({ port: 0, eventCode: CODE, joinExempt: ['127.0.0.1', '::1'], log: () => {}, logEveryMs: 0 });
console.log(`server on ${srv.url}`);

await check('join, see each other in peers, health', async () => {
  const a = await join(srv, 'Sokha');
  const b = await join(srv, 'Dara');
  assert.equal(a.welcome?.room, 'public');
  assert.equal(a.welcome?.crowd, 1);
  assert.equal(a.welcome?.midnight, undefined);
  assert.ok(Math.abs(a.welcome!.now - Date.now()) < 1000);
  a.send({ t: 'state', x: 380, y: 8, z: -260, yaw: 1, ride: 0 });
  b.send({ t: 'state', x: 385, y: 8, z: -262, yaw: 2, ride: 1 });
  const pa = await a.until(() => a.peer(b.welcome!.sid), 2000, 'b in a’s peers');
  const pb = await b.until(() => b.peer(a.welcome!.sid), 2000, 'a in b’s peers');
  assert.equal(pa.name, 'Dara');
  assert.equal(pa.ride, 1);
  assert.equal(pb.x, 380);
  assert.ok(!a.lastPeers!.peers.some((p) => p.sid === a.welcome!.sid), 'no self in peers');
  const h = (await (await fetch(srv.url.replace('ws:', 'http:') + '/health')).json()) as { players: number; rooms: number; crowds: number; uptime: number };
  assert.ok(h.players >= 2 && h.rooms >= 1 && h.crowds >= 1 && typeof h.uptime === 'number');
  a.close();
  b.close();
});

await check('version 1 pages still get the old peers; version 2 sends only what changed', async () => {
  const old = await join(srv, 'Old Page', { v: 1 });
  const a = await join(srv, 'New Page');
  const b = await join(srv, 'Mover');
  old.send({ t: 'state', x: 50, y: 0, z: 50, yaw: 0, ride: 0 });
  a.send({ t: 'state', x: 51, y: 0, z: 50, yaw: 0, ride: 0 });
  b.send({ t: 'state', x: 52.03, y: 1.26, z: 50, yaw: 1, ride: 2 });
  const p1 = await old.until(() => old.lastPeers?.peers.find((p) => p.sid === b.welcome!.sid), 2000, 'old peers');
  assert.equal(p1.x, 52.03);
  assert.equal(old.pp.length, 0, 'no pp to a v1 page');
  const p2 = await a.until(() => a.peer(b.welcome!.sid), 2000, 'v2 peers');
  assert.ok(Math.abs(p2.x - 52.03) <= 0.5 / POS_Q && Math.abs(p2.y - 1.26) <= 0.5 / POS_Q, 'quantized to 1/20 m');
  assert.ok(Math.abs(p2.yaw - 1) <= Math.PI / YAW_Q, 'yaw to 1/256 turn');
  assert.equal(p2.ride, 2);
  assert.equal(p2.name, 'Mover');
  // Standing still: after the introduction only keep-alives (k), about every 2 s.
  await wait(600);
  const from = a.pp.length;
  await wait(2500);
  const later = a.pp.slice(from);
  assert.ok(later.every((m) => !m.s && !m.n), 'nothing resent while still');
  assert.ok(later.some((m) => m.k?.includes(b.welcome!.sid)), 'a keep-alive');
  // Leaving: 'g' at once.
  b.close();
  await a.until(() => a.pp.some((m) => m.g?.includes(b.welcome!.sid)), 2000, 'gone');
  assert.ok(!a.peer(b.welcome!.sid));
  old.close();
  a.close();
});

await check('ping → pong with server time', async () => {
  const a = await join(srv, 'Pong');
  a.send({ t: 'ping', at: 123.5 });
  const p = await a.until(() => a.msgs.find((m) => m.t === 'pong'));
  assert.equal(p.t === 'pong' && p.at, 123.5);
  assert.ok(p.t === 'pong' && Math.abs(p.now - Date.now()) < 1000);
  a.close();
});

await check('count: the square, the lake terrace, online', async () => {
  const a = await join(srv, 'Square');
  const b = await join(srv, 'Lakeside');
  a.send({ t: 'state', x: 383, y: 8, z: -262, yaw: 0, ride: 0 });
  b.send({ t: 'state', x: -342, y: 1, z: -64, yaw: 0, ride: 0 });
  const c = await a.until(() => {
    const m = [...a.msgs].reverse().find((m) => m.t === 'count');
    return m && m.t === 'count' && m.square >= 1 && m.lake >= 1 ? m : undefined;
  }, 3000, 'a count with both');
  assert.ok(c.online >= 2);
  a.close();
  b.close();
});

await check('names refused (rude, staff, phone number, too long), version refused', async () => {
  for (const name of ['fuck you', 'Admin', '012345678', 'a', 'Abcdefghijklmnopqrstu']) {
    const b = await join(srv, name);
    const e = b.error();
    assert.equal(e?.code, 'name', `"${name}" refused`);
    assert.ok(e?.reason, 'with a reason');
    await b.until(() => b.closed, 2000, 'close');
  }
  const v = new Bot(srv.url);
  await v.open();
  v.send({ t: 'hello', v: PROTOCOL + 1, id: 'x', name: 'Vibol', look: 0, room: 'public' });
  await v.until(() => v.closed);
  assert.equal(v.error()?.code, 'version');
});

await check('test room: wrong code refused, right code (any case) welcomed with its midnight', async () => {
  const bad = await join(srv, 'Tester', { room: 'test', code: 'K7QM2Q' });
  assert.equal(bad.error()?.code, 'code');
  const none = await join(srv, 'Tester', { room: 'test' });
  assert.equal(none.error()?.code, 'code');
  const good = await join(srv, 'Tester', { room: 'test', code: ' k7qm2p ' });
  const w = good.welcome!;
  assert.equal(w.room, 'test');
  assert.equal(w.midnight, testMidnight(w.now));
  assert.equal(w.midnight! % (15 * 60_000), 0);
  assert.ok(w.midnight! - w.now >= 2 * 60_000);
  // The public never meets the test room.
  const pub = await join(srv, 'Public');
  good.send({ t: 'state', x: 0, y: 0, z: 0, yaw: 0, ride: 0 });
  pub.send({ t: 'state', x: 1, y: 0, z: 0, yaw: 0, ride: 0 });
  await wait(500);
  assert.ok(!pub.peer(w.sid) && !good.peer(pub.welcome!.sid), 'rooms apart');
  good.close();
  pub.close();
});

await check('test room closed with no EVENT_CODE', async () => {
  const s2 = await startServer({ port: 0, log: () => {}, logEveryMs: 0 });
  try {
    const b = await join(s2, 'Tester', { room: 'test', code: CODE });
    assert.equal(b.error()?.code, 'code');
    assert.equal(b.error()?.reason, 'closed');
  } finally {
    await s2.close();
  }
});

await check('event room by code (ROOM_CODE): the code (any case, any room asked) joins the public room, none or a wrong one is refused', async () => {
  const s2 = await startServer({ port: 0, eventCode: CODE, roomCode: 'NYE2027', joinExempt: ['127.0.0.1', '::1'], log: () => {}, logEveryMs: 0 });
  try {
    const a = await join(s2, 'Event One', { room: 'test', code: ' nye-2027 ' });
    assert.equal(a.welcome?.room, 'public');
    assert.equal(a.welcome?.midnight, undefined, 'the real midnight: no test midnight');
    const b = await join(s2, 'Event Two', { code: 'NYE2027' });
    assert.equal(b.welcome?.room, 'public');
    assert.equal(b.welcome?.crowd, a.welcome?.crowd, 'one crowd');
    const none = await join(s2, 'No Code');
    assert.equal(none.error()?.code, 'code');
    assert.equal(none.error()?.reason, 'needed');
    const wrong = await join(s2, 'Wrong Code', { code: 'NYE2026' });
    assert.equal(wrong.error()?.code, 'code');
    const test = await join(s2, 'Tester Too', { room: 'test', code: CODE });
    assert.equal(test.welcome?.room, 'test', 'the test code still finds the test room');
    a.close();
    b.close();
    test.close();
  } finally {
    await s2.close();
  }
});

await check('test room: midnight moves on after the show + 1 min', async () => {
  const room = srv.rooms.get('test')!;
  const old = Date.now() - (480 + 61) * 1000;
  room.midnight = old;
  const b = await join(srv, 'Later', { room: 'test', code: CODE });
  assert.notEqual(b.welcome!.midnight, old);
  assert.equal(b.welcome!.midnight, testMidnight(b.welcome!.now));
  // During the show (midnight passed, not yet show + 1 min) a page joining late gets the same midnight.
  const during = Date.now() - 100 * 1000;
  room.midnight = during;
  const c = await join(srv, 'Late', { room: 'test', code: CODE });
  assert.equal(c.welcome!.midnight, during);
  b.close();
  c.close();
});

await check('joins a minute per address', async () => {
  const s2 = await startServer({ port: 0, log: () => {}, logEveryMs: 0 });
  try {
    const codes: (string | undefined)[] = [];
    for (let i = 0; i < LIMITS.joinsPerMin + 1; i++) {
      const b = await join(s2, `Rate ${'abcdefg'[i]}`);
      codes.push(b.welcome ? 'welcome' : b.error()?.code);
      b.close();
    }
    assert.deepEqual(codes.slice(0, LIMITS.joinsPerMin), Array(LIMITS.joinsPerMin).fill('welcome'));
    assert.equal(codes[LIMITS.joinsPerMin], 'rate');
  } finally {
    await s2.close();
  }
});

await check('message rate: a burst over the limit is dropped, a flood closes', async () => {
  const a = await join(srv, 'Burst');
  for (let i = 0; i < 30; i++) a.send({ t: 'ping', at: i });
  await wait(300);
  const pongs = a.msgs.filter((m) => m.t === 'pong').length;
  assert.ok(pongs >= LIMITS.msgPerSec && pongs < 30, `some dropped (${pongs} answered of 30)`);
  assert.ok(!a.closed, 'still open');
  for (let i = 0; i < 200; i++) a.send({ t: 'ping', at: i });
  await a.until(() => a.closed, 2000, 'close');
  assert.equal(a.error()?.code, 'rate');
});

await check('speed check: too fast ignored, a steady jump taken, jitter closed', async () => {
  const a = await join(srv, 'Runner');
  const o = await join(srv, 'Watcher');
  o.send({ t: 'state', x: 0, y: 0, z: 0, yaw: 0, ride: 0 });
  a.send({ t: 'state', x: 10, y: 0, z: 0, yaw: 0, ride: 0 });
  await wait(250);
  a.send({ t: 'state', x: 20, y: 0, z: 0, yaw: 0, ride: 0 }); // 10 m in 0.25 s: fine
  await o.until(() => o.peer(a.welcome!.sid)?.x === 20, 2000, 'a walk');
  a.send({ t: 'state', x: 600, y: 0, z: 0, yaw: 0, ride: 0 }); // 580 m at once: ignored
  await wait(450);
  assert.equal(o.peer(a.welcome!.sid)?.x, 20, 'the jump was ignored');
  // …but steady at the new spot (the map's Jump in): taken after a few states.
  await wait(200);
  a.send({ t: 'state', x: 601, y: 0, z: 0, yaw: 0, ride: 0 });
  await wait(200);
  a.send({ t: 'state', x: 602, y: 0, z: 0, yaw: 0, ride: 0 });
  await o.until(() => o.peer(a.welcome!.sid)?.x === 602, 2000, 'the jump taken');
  // Jitter (far each time, never steady) closes with 'moved'.
  for (let i = 0; i < 12; i++) {
    a.send({ t: 'state', x: i % 2 ? -500 : 700, y: 0, z: i % 2 ? -700 : 100, yaw: 0, ride: 0 });
    await wait(60);
  }
  await a.until(() => a.closed, 2000, 'close');
  assert.equal(a.error()?.code, 'moved');
  // Off the map or not numbers: ignored.
  o.send({ t: 'state', x: 9999, y: 0, z: 0, yaw: 0, ride: 0 });
  o.send({ t: 'state', x: 'NaN', y: 0, z: 0, yaw: 0, ride: 0 });
  o.send({ t: 'state', x: 1, y: 0, z: 0, yaw: 0, ride: 99 });
  assert.ok(!o.closed);
  o.close();
});

await check('emote relayed with its server time', async () => {
  const a = await join(srv, 'Waver');
  const o = await join(srv, 'Seer');
  a.send({ t: 'state', x: 100, y: 0, z: -100, yaw: 0, ride: 0 });
  o.send({ t: 'state', x: 102, y: 0, z: -100, yaw: 0, ride: 0 });
  const before = Date.now();
  a.send({ t: 'emote', emote: 2 });
  const p = await o.until(() => (o.peer(a.welcome!.sid)?.emote === 2 ? o.peer(a.welcome!.sid) : undefined), 2000, 'the emote');
  assert.ok(p.emoteAt >= before - 50 && p.emoteAt <= Date.now());
  a.close();
  o.close();
});

await check('reports: 3 different reporters hide the name for everyone', async () => {
  const t = await join(srv, 'Rude Guy');
  const watch = await join(srv, 'Bystander');
  const reps = [await join(srv, 'Rep One'), await join(srv, 'Rep Two'), await join(srv, 'Rep Three')];
  t.send({ t: 'state', x: 200, y: 0, z: -200, yaw: 0, ride: 0 });
  watch.send({ t: 'state', x: 201, y: 0, z: -200, yaw: 0, ride: 0 });
  const sid = t.welcome!.sid;
  await watch.until(() => watch.peer(sid)?.name === 'Rude Guy', 2000, 'the name');
  // The same reporter twice counts once.
  reps[0].send({ t: 'report', sid, reason: 'name' });
  reps[0].send({ t: 'report', sid, reason: 'name' });
  reps[1].send({ t: 'report', sid, reason: 'name' });
  await wait(500);
  assert.equal(watch.peer(sid)?.name, 'Rude Guy', 'two reporters: still shown');
  reps[2].send({ t: 'report', sid, reason: 'behaviour' });
  await watch.until(() => watch.peer(sid)?.name === 'Player', 2000, '"Player"');
  // Coming back (the same page) or another page with the same name: still hidden.
  const again = await join(srv, 'rude guy');
  again.send({ t: 'state', x: 202, y: 0, z: -200, yaw: 0, ride: 0 });
  await watch.until(() => watch.peer(again.welcome!.sid)?.name === 'Player', 2000, 'the same name hidden');
  assert.ok(srv.health().hiddenNames >= 1);
  for (const b of [t, watch, again, ...reps]) b.close();
});

await check('party: made with a code, a member joining a full crowd stays with it; nearest 50 only', async () => {
  await wait(300);
  const lead = await join(srv, 'Leader');
  lead.send({ t: 'party', make: true });
  const pm = await lead.until(() => lead.msgs.find((m) => m.t === 'party' && m.code));
  const code = pm.t === 'party' ? pm.code! : '';
  assert.equal(code.length, LIMITS.partyLen);
  assert.ok([...code].every((ch) => 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'.includes(ch)));
  lead.send({ t: 'state', x: 0, y: 0, z: 0, yaw: 0, ride: 0 });
  // Fill the leader's crowd: the others stand in a line going east, 1 m apart.
  const crowd = lead.welcome!.crowd;
  const fill: Bot[] = [];
  const pub = srv.rooms.get('public')!;
  for (let i = 0; pub.crowds.get(crowd)!.members.size < LIMITS.crowd; i++) {
    const b = await join(srv, `Filler ${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`);
    assert.equal(b.welcome?.crowd, crowd);
    b.send({ t: 'state', x: 1 + i, y: 0, z: 0, yaw: 0, ride: 0 });
    fill.push(b);
  }
  const loner = await join(srv, 'Loner');
  assert.notEqual(loner.welcome!.crowd, crowd, 'a full crowd opens the next one');
  const friend = await join(srv, 'Friend', { party: code.toLowerCase() });
  assert.equal(friend.welcome!.crowd, crowd, 'the party keeps its crowd');
  assert.equal(friend.welcome!.party, code);
  await lead.until(() => lead.msgs.some((m) => m.t === 'party' && m.members === 2), 2000, 'the party of 2');
  friend.send({ t: 'state', x: -300, y: 0, z: 0, yaw: 0, ride: 0 }); // far away, still marked as party
  await wait(600);
  const peers = lead.lastPeers!.peers;
  assert.equal(peers.length, LIMITS.near, 'the nearest 50');
  const xs = peers.map((p) => p.x).sort((a, b) => a - b);
  assert.deepEqual(xs, Array.from({ length: LIMITS.near }, (_, i) => i + 1), 'exactly the nearest');
  const far = fill[fill.length - 1];
  await far.until(() => far.lastPeers && far.lastPeers.peers.length === LIMITS.near, 2000, 'peers at the far end');
  assert.ok(far.lastPeers!.peers.every((p) => p.x >= LIMITS.crowd - 1 - LIMITS.near - 1), 'the far end sees its own neighbours');
  // Tiers: a near player moving is sent 5 times a second, a far one (rank ≥ 15) under 2.
  const nearOne = fill[4];
  const farOne = fill[40];
  const counts = (sid: number, list: typeof lead.pp): number => list.reduce((k, m) => k + ((m.s ?? []).filter((v, i) => i % PEER_S === 0 && v === sid).length), 0);
  const from = lead.pp.length;
  for (let step = 1; step <= 10; step++) {
    nearOne.send({ t: 'state', x: 5, y: 0, z: step * 0.5, yaw: 0, ride: 0 });
    farOne.send({ t: 'state', x: 41, y: 0, z: step * 0.5, yaw: 0, ride: 0 });
    await wait(200);
  }
  await wait(100);
  const got = lead.pp.slice(from);
  const nNear = counts(nearOne.welcome!.sid, got);
  const nFar = counts(farOne.welcome!.sid, got);
  assert.ok(nNear >= 8, `near: ${nNear} states in 2 s`);
  assert.ok(nFar >= 2 && nFar <= 5, `far: ${nFar} states in 2 s`);
  // A code of another form (0 and O are not party letters) joins alone and says so without closing.
  const lost = await join(srv, 'Lost', { party: 'ZZZZ0O' });
  assert.ok(lost.welcome);
  assert.equal(lost.error()?.code, 'party');
  assert.ok(!lost.closed);
  // In the friend's peers (far west, so the leader at the line's west end is the nearest) he is marked as party.
  await friend.until(() => friend.peer(lead.welcome!.sid)?.party === true, 3000, 'party flag');
  for (const b of [lead, loner, friend, lost, ...fill]) b.close();
});

await check('arcade party: a code the server never made groups its players in one crowd, even a full one; joining later moves him', async () => {
  await wait(300);
  const code = 'H4RT7Q';
  const a = await join(srv, 'Arc Aa', { party: code });
  assert.ok(a.welcome && !a.error(), 'an external code is taken');
  assert.equal(a.welcome!.party, code);
  a.send({ t: 'state', x: 380, y: 10, z: -250, yaw: 0, ride: 0 });
  const crowd = a.welcome!.crowd;
  const pub = srv.rooms.get('public')!;
  // Fill his crowd: a friend with the same code still comes into it.
  const fill: Bot[] = [];
  for (let i = 0; pub.crowds.get(crowd)!.members.size < LIMITS.crowd; i++) fill.push(await join(srv, `Arc Fill ${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`));
  const b = await join(srv, 'Arc Bb', { party: code.toLowerCase() });
  assert.equal(b.welcome!.crowd, crowd, 'a full crowd still takes a party member');
  assert.equal(b.welcome!.party, code);
  b.send({ t: 'state', x: 384, y: 10, z: -252, yaw: 0, ride: 0 });
  await a.until(() => a.msgs.some((m) => m.t === 'party' && m.members === 2), 2000, 'the party of 2');
  await a.until(() => a.peer(b.welcome!.sid)?.party === true, 3000, 'b marked as party for a');
  await b.until(() => b.peer(a.welcome!.sid)?.party === true, 3000, 'a marked as party for b');
  // A third joins with no party (the crowd is full: another crowd), then makes the party his with ClientParty.code.
  const c = await join(srv, 'Arc Cc');
  assert.notEqual(c.welcome!.crowd, crowd, 'without the code: the next crowd');
  c.send({ t: 'state', x: 386, y: 10, z: -250, yaw: 0, ride: 0 });
  c.send({ t: 'party', code });
  const moved = await c.until(() => c.msgs.find((m) => m.t === 'party' && m.code === code));
  assert.equal(moved.t === 'party' ? moved.crowd : 0, crowd, 'moved into the party\'s crowd');
  assert.ok([...pub.crowds.get(crowd)!.members].some((m) => m.sid === c.welcome!.sid), 'in the party\'s crowd on the server');
  await c.until(() => c.peer(a.welcome!.sid)?.party === true, 3000, 'c sees a as party');
  await a.until(() => a.peer(c.welcome!.sid)?.party === true, 3000, 'a sees c as party');
  // Leaving it (code null): no longer marked.
  c.send({ t: 'party', code: null });
  await c.until(() => c.msgs.some((m) => m.t === 'party' && m.code === null), 2000, 'out of the party');
  await a.until(() => a.peer(c.welcome!.sid)?.party === false, 3000, 'c no longer party for a');
  // A code of another form: an error, and he stays as he was.
  c.send({ t: 'party', code: 'NOT A CODE' });
  await c.until(() => c.error()?.code === 'party', 2000, 'the party error');
  assert.ok(!c.closed);
  for (const x of [a, b, c, ...fill]) x.close();
});

await check('reports file a tracker ticket, one per target an hour, with no personal data', async () => {
  const got: { auth?: string; body: { title: string; description: string; clientId: string } }[] = [];
  const fake = createServer((req, res) => {
    let text = '';
    req.on('data', (d) => (text += d));
    req.on('end', () => {
      got.push({ auth: req.headers.authorization, body: JSON.parse(text) });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ key: `AWP-${100 + got.length}`, createdAt: 1, updatedAt: 1 }));
    });
  });
  await new Promise<void>((r) => fake.listen(0, r));
  const url = `http://localhost:${(fake.address() as AddressInfo).port}`;
  const s2 = await startServer({ port: 0, joinExempt: ['127.0.0.1', '::1'], tracker: { url, token: 'tok', project: 'AWP' }, log: () => {}, logEveryMs: 0 });
  try {
    const t = await join(s2, 'Bad Name');
    const reps = [await join(s2, 'Rep Aa'), await join(s2, 'Rep Bb'), await join(s2, 'Rep Cc'), await join(s2, 'Rep Dd')];
    reps[0].send({ t: 'report', sid: t.welcome!.sid, reason: 'name' });
    await wait(300);
    reps[1].send({ t: 'report', sid: t.welcome!.sid, reason: 'name' });
    await wait(300);
    assert.equal(got.length, 1, 'one ticket for two reports');
    assert.equal(got[0].body.title, 'Name report: Bad Name');
    assert.equal(got[0].auth, 'Bearer tok');
    assert.ok(!/test-device|127\.0\.0\.1|::1/.test(JSON.stringify(got[0].body)), 'no device id or address');
    reps[2].send({ t: 'report', sid: t.welcome!.sid, reason: 'name' }); // hides it: one more ticket says so
    reps[3].send({ t: 'report', sid: t.welcome!.sid, reason: 'name' });
    await wait(300);
    assert.equal(got.length, 2, 'the hiding files one more, then no more this hour');
    assert.match(got[1].body.description, /Hidden for everyone \("Player"\): yes/);
    for (const b of [t, ...reps]) b.close();
  } finally {
    await s2.close();
    fake.close();
  }
});

await srv.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
