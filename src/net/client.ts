import { setServerOffset, setTestMidnight } from '../map/nye/clock';
import { blockPeer, hideSid, isBlocked, newConnection } from './_blocked';
import { ServerClock } from './_clock';
import { deviceId, deviceLook } from './_device';
import { DELAY, DROP, easePeer, newPeer, pushSnapshot, type PeerRec } from './_peers';
import { LIMITS, PROTOCOL, testMidnight, type ClientMsg, type ClientState, type PeerState, type RoomKind, type ServerMsg } from './protocol';
import type { JoinOptions, NetClient, NetState } from './types';

/**
 * The game's connection to the live rooms (AWP-35 phase 2, tickets 5–6; docs/discussion/new-year-online.md):
 * `NET`, the one `NetClient` (types.ts). Nothing connects, and `update` does nothing, until the player joins.
 *
 * - **The server:** `VITE_NYE_SERVER` (.env, e.g. `wss://nye.example.app`), or `?nyeserver=ws://localhost:8787` in
 *   the address for checks. None: `available` is false and joining refuses with 'offline' (playing alone as before).
 * - **Joining:** `hello` with the device's random id (localStorage `angkor-nye-id`, _device.ts; never shown to
 *   others), the name, the look, the room (and the test code). The welcome makes it 'online'; a server error
 *   'version' / 'name' / 'code' / 'full' makes it 'refused' (`refusal`); a dropped connection 'retrying' with a
 *   backoff (1 s … 30 s) and the same name, room and party, the show playing on from the clock all the while.
 * - **The clock:** a burst of pings at the welcome, then one each 30 s; the best of the last few (_clock.ts) goes to
 *   nye/clock.ts `setServerOffset`. In the test room the welcome's midnight (and each quarter hour's after it,
 *   protocol.ts `testMidnight`) goes to `setTestMidnight`, and the boards wear "TEST" (`setBoardTest`).
 * - **My state:** at most `LIMITS.stateHz` a second while he moves, once a second while still, nothing while the tab
 *   is hidden or in the overview (`update`'s `me` null: main.ts reads him with _me.ts).
 * - **The others:** `peers` by server id, eased `DELAY` ms behind the server (_peers.ts), dropped `DROP` s after
 *   they were last in a snapshot; blocked or reported ones never appear (_blocked.ts).
 * - **The boards:** the server's count of players on the Kulen square and at the lake (`setBoardPlayers`) while
 *   online; no line otherwise.
 * - **The hidden test link** `/?event=<code>`: `pendingCode` (the join card asks for a name first if there is none,
 *   then joins `room: 'test'` with it). The code itself is checked by the server only, never written here.
 */

/**
 * The boards' hooks (nye/board.ts `setBoardPlayers` per ground, `setBoardTest`): the board module is part of the
 * square's lazy chunk, so it is loaded here only once something is to be shown on it; what is wanted is kept and
 * set when it comes (the board reads its module's values whenever it is built).
 */
const boardWant = { square: null as number | null, lake: null as number | null, test: false };
let boardMod: typeof import('../map/nye/board') | null = null;
let boardLoading = false;
function boards(square: number | null, lake: number | null, test: boolean): void {
  boardWant.square = square;
  boardWant.lake = lake;
  boardWant.test = test;
  if (boardMod) {
    boardMod.setBoardPlayers(square, 'square');
    boardMod.setBoardPlayers(lake, 'lake');
    boardMod.setBoardTest(test);
  } else if (!boardLoading && (square !== null || lake !== null || test)) {
    boardLoading = true;
    void import('../map/nye/board')
      .then((m) => {
        boardMod = m;
        boards(boardWant.square, boardWant.lake, boardWant.test);
      })
      .catch(() => (boardLoading = false));
  }
}

const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);

/** The live server's address, or null. */
function serverAddress(): string | null {
  const q = params.get('nyeserver');
  const env = (import.meta.env.VITE_NYE_SERVER as string | undefined) ?? '';
  const url = (q ?? env).trim();
  return /^wss?:\/\//.test(url) ? url : null;
}

/** The test link's code (`?event=`): letters and digits only, as typed (the server checks it). */
function eventCode(): string | null {
  const c = params.get('event')?.trim().toUpperCase() ?? '';
  return /^[A-Z0-9]{3,32}$/.test(c) ? c : null;
}

/** Pings: this many at the welcome, this far apart (ms), then one each `PING_EVERY` ms. */
const BURST = 5;
const BURST_GAP = 250;
const PING_EVERY = 30_000;
/** Reconnect backoff (ms): from `RETRY_MIN`, doubling, at most `RETRY_MAX` (± a quarter, so a crowd does not come back at once). */
const RETRY_MIN = 1000;
const RETRY_MAX = 30_000;
/** Messages a second this page allows itself (under the server's `LIMITS.msgPerSec`). */
const MY_RATE = LIMITS.msgPerSec - 2;
/** He counts as moving when he went this far (m) or turned this much (rad) since the last state sent. */
const MOVED = 0.05;
const TURNED = 0.02;
/** Server errors that end the joining (no retry). */
const FATAL = new Set(['version', 'name', 'code', 'full']);

class Client implements NetClient {
  state: NetState = 'off';
  refusal: string | null = null;
  room: RoomKind | null = null;
  crowd = 0;
  me: { sid: number; name: string } | null = null;
  party = { code: null as string | null, members: 0 };
  count = { square: 0, lake: 0, online: 0 };
  readonly peers = new Map<number, PeerRec>();
  readonly available = serverAddress() !== null;
  readonly pendingCode = eventCode();
  lastError: string | null = null;

  private readonly url = serverAddress();
  private opts: JoinOptions | null = null;
  private ws: WebSocket | null = null;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private burstTimers: ReturnType<typeof setTimeout>[] = [];
  private readonly clock = new ServerClock();
  private readonly muted = new Set<number>();
  private readonly listeners = new Set<() => void>();
  /** The state message, reused; what was sent last and when (performance.now ms). */
  private readonly out: ClientState = { t: 'state', x: 0, y: 0, z: 0, yaw: 0, ride: 0 };
  private sentAt = -Infinity;
  private sentAny = false;
  /** The send budget (a token bucket of `MY_RATE` a second). */
  private tokens = MY_RATE;
  private tokensAt = 0;

  get look(): number {
    return deviceLook();
  }

  // ── Joining ──────────────────────────────────────────────────────────────────────────────────────────────────

  join(o: JoinOptions): void {
    this.leaveQuietly();
    this.opts = { ...o };
    this.refusal = null;
    this.lastError = null;
    if (!this.url) {
      this.state = 'refused';
      this.refusal = 'offline';
      this.opts = null;
      this.emit();
      return;
    }
    this.retries = 0;
    this.connect();
  }

  leave(): void {
    this.leaveQuietly();
    this.state = 'off';
    this.refusal = null;
    this.emit();
  }

  /** Disconnect and forget the room (the boards and the clock back to playing alone), without telling the listeners. */
  private leaveQuietly(): void {
    this.opts = null;
    this.drop();
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.room = null;
    this.crowd = 0;
    this.me = null;
    this.party = { code: null, members: 0 };
    this.count = { square: 0, lake: 0, online: 0 };
    this.peers.clear();
    setTestMidnight(null);
    boards(null, null, false);
  }

  /** Close the socket and stop the pings (the room's things stay: a retry may follow). */
  private drop(): void {
    this.stopPings();
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
      try {
        ws.close();
      } catch {
        /* (already closed) */
      }
    }
  }

  private connect(): void {
    if (!this.opts || !this.url) return;
    this.state = this.retries > 0 ? 'retrying' : 'connecting';
    this.emit();
    let ws: WebSocket;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this.retry();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      const o = this.opts;
      if (!o || ws !== this.ws) return;
      // (back after a drop: into the same party, so the crowd keeps us together)
      const party = this.party.code ?? o.party;
      this.send({ t: 'hello', v: PROTOCOL, id: deviceId(), name: o.name, look: o.look, room: o.room, ...(o.code ? { code: o.code } : {}), ...(party ? { party } : {}) }, true);
    };
    ws.onmessage = (ev) => {
      if (ws !== this.ws) return;
      let m: ServerMsg;
      try {
        m = JSON.parse(String(ev.data)) as ServerMsg;
      } catch {
        return;
      }
      this.receive(m);
    };
    ws.onclose = () => {
      if (ws !== this.ws) return;
      this.ws = null;
      this.stopPings();
      if (this.opts && this.state !== 'refused') this.retry();
    };
    ws.onerror = () => undefined;
  }

  private retry(): void {
    this.drop();
    if (!this.opts) return;
    this.state = 'retrying';
    // (the boards show no count while not in the room; the show plays on from the clock, the test midnight kept)
    boards(null, null, boardWant.test);
    this.emit();
    const wait = Math.min(RETRY_MAX, RETRY_MIN * 2 ** this.retries) * (0.75 + Math.random() * 0.5);
    this.retries++;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, wait);
  }

  // ── From the server ──────────────────────────────────────────────────────────────────────────────────────────

  private receive(m: ServerMsg): void {
    switch (m.t) {
      case 'welcome': {
        this.state = 'online';
        this.retries = 0;
        this.refusal = null;
        this.room = m.room;
        this.crowd = m.crowd;
        this.me = { sid: m.sid, name: m.name };
        this.party = { code: m.party ?? null, members: this.party.members };
        newConnection();
        this.peers.clear();
        this.clock.rough(m.now);
        if (Number.isFinite(this.clock.offset)) setServerOffset(this.clock.offset);
        if (m.room === 'test' && typeof m.midnight === 'number') {
          setTestMidnight(m.midnight, testMidnight);
          boards(boardWant.square, boardWant.lake, true);
        } else {
          setTestMidnight(null);
          boards(boardWant.square, boardWant.lake, false);
        }
        this.sentAny = false;
        this.startPings();
        this.emit();
        break;
      }
      case 'pong':
        this.clock.sample(m.at, m.now);
        if (Number.isFinite(this.clock.offset)) setServerOffset(this.clock.offset);
        break;
      case 'peers':
        this.takePeers(m.now, m.peers);
        break;
      case 'count':
        this.count = { square: m.square, lake: m.lake, online: m.online };
        boards(m.square, m.lake, boardWant.test);
        this.emit();
        break;
      case 'party':
        this.party = { code: m.code, members: m.members };
        this.emit();
        break;
      case 'error':
        if (FATAL.has(m.code)) {
          this.state = 'refused';
          this.refusal = m.code === 'name' ? (m.reason ?? 'name') : m.code;
          // (nothing reconnects: the card says why and the player tries again)
          this.leaveQuietly();
          this.emit();
        } else {
          this.lastError = m.code;
          this.emit();
        }
        break;
    }
  }

  private takePeers(at: number, list: readonly PeerState[]): void {
    const now = this.serverNow();
    const renderAt = now - DELAY;
    const mine = this.me?.sid ?? -1;
    let changed = false;
    for (const s of list) {
      if (s.sid === mine || isBlocked(s.sid, s.name)) continue;
      let p = this.peers.get(s.sid);
      if (!p) {
        p = newPeer(s, at, this.pageTime(s.emoteAt, now));
        this.peers.set(s.sid, p);
        changed = true;
      } else {
        if (p.name !== s.name || p.party !== !!s.party) changed = true;
        pushSnapshot(p, s, at, renderAt);
      }
      if (s.emoteAt !== p.emoteSrv) {
        p.emoteSrv = s.emoteAt;
        p.emote = s.emote;
        p.emoteAt = this.pageTime(s.emoteAt, now);
      } else p.emote = s.emote;
    }
    if (changed) this.emit();
  }

  /** A server time (ms since 1970) on this page's `performance.now()` clock. */
  private pageTime(serverMs: number, serverNow: number): number {
    return performance.now() - (serverNow - serverMs);
  }

  /** The server's time now (ms), as well as this page knows it. */
  private serverNow(): number {
    return Date.now() + (Number.isFinite(this.clock.offset) ? this.clock.offset : 0);
  }

  // ── The clock's pings ─────────────────────────────────────────────────────────────────────────────────────────

  private startPings(): void {
    this.stopPings();
    for (let i = 0; i < BURST; i++) this.burstTimers.push(setTimeout(() => this.ping(), i * BURST_GAP));
    this.pingTimer = setInterval(() => this.ping(), PING_EVERY);
  }

  private stopPings(): void {
    for (const t of this.burstTimers) clearTimeout(t);
    this.burstTimers.length = 0;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private ping(): void {
    if (this.state === 'online') this.send({ t: 'ping', at: performance.now() });
  }

  // ── To the server ────────────────────────────────────────────────────────────────────────────────────────────

  /** Send, within this page's budget (`force`: the hello, always). False when not sent. */
  private send(m: ClientMsg, force = false): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return false;
    const now = performance.now();
    this.tokens = Math.min(MY_RATE, this.tokens + ((now - this.tokensAt) / 1000) * MY_RATE);
    this.tokensAt = now;
    if (!force && this.tokens < 1) return false;
    this.tokens -= 1;
    ws.send(JSON.stringify(m));
    return true;
  }

  update(dt: number, me: { x: number; y: number; z: number; yaw: number; ride: number } | null): void {
    if (this.state !== 'online' && this.state !== 'retrying') return;
    // The others: eased, and gone once missing too long.
    if (this.peers.size) {
      const now = this.serverNow();
      const renderAt = now - DELAY;
      let gone = false;
      for (const [sid, p] of this.peers) {
        easePeer(p, renderAt, now, dt);
        if (p.stale > DROP) {
          this.peers.delete(sid);
          gone = true;
        }
      }
      if (gone) this.emit();
    }
    // Me: while he moves at most `stateHz` a second, still once a second; nothing hidden or in the overview.
    if (this.state !== 'online' || !me || (typeof document !== 'undefined' && document.hidden)) return;
    const o = this.out;
    const t = performance.now();
    const dx = me.x - o.x;
    const dy = me.y - o.y;
    const dz = me.z - o.z;
    const turn = Math.abs(Math.atan2(Math.sin(me.yaw - o.yaw), Math.cos(me.yaw - o.yaw)));
    const moving = !this.sentAny || me.ride !== o.ride || dx * dx + dy * dy + dz * dz > MOVED * MOVED || turn > TURNED;
    if (t - this.sentAt < (moving ? 1000 / LIMITS.stateHz : 1000)) return;
    o.x = Math.round(me.x * 100) / 100;
    o.y = Math.round(me.y * 100) / 100;
    o.z = Math.round(me.z * 100) / 100;
    o.yaw = Math.round(me.yaw * 1000) / 1000;
    o.ride = me.ride;
    if (this.send(o)) {
      this.sentAt = t;
      this.sentAny = true;
    }
  }

  emote(e: number): void {
    if (this.state === 'online') this.send({ t: 'emote', emote: e });
  }

  mute(sid: number, on: boolean): void {
    if (on === this.muted.has(sid)) return;
    if (on) this.muted.add(sid);
    else this.muted.delete(sid);
    this.emit();
  }

  isMuted(sid: number): boolean {
    return this.muted.has(sid);
  }

  block(sid: number): void {
    blockPeer(sid, this.peers.get(sid)?.name ?? '');
    this.peers.delete(sid);
    this.emit();
  }

  report(sid: number, reason: 'name' | 'behaviour'): void {
    this.send({ t: 'report', sid, reason }, true);
    // (the reporter stops seeing them at once: the plan's "Names")
    hideSid(sid);
    this.peers.delete(sid);
    this.emit();
  }

  makeParty(): void {
    this.send({ t: 'party', make: true }, true);
  }

  leaveParty(): void {
    this.send({ t: 'party', leave: true }, true);
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(): void {
    for (const cb of this.listeners)
      try {
        cb();
      } catch (e) {
        console.error('[net] listener', e);
      }
  }
}

/** The live rooms' one connection (nothing runs until `join`). */
export const NET: NetClient = new Client();

// (dev: the headless check scripts/nyenet-check.mjs drives it from the page)
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { NET: NetClient }).NET = NET;
