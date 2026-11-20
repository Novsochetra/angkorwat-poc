/**
 * New Year's Eve online, phase 2 (AWP-35, ticket 5): the live player rooms. docs/discussion/new-year-online.md
 * "Phase 2: live player rooms", "Names", "Safety" and "Testing: a hidden link…"; the messages are
 * src/net/protocol.ts, spoken exactly.
 *
 * - Rooms: `public` (everyone) and `test` (the hidden link's room: its own midnight every quarter hour; only with the
 *   EVENT_CODE the server is given, never one written in the game). A room is split into crowds of at most
 *   `LIMITS.crowd`; a party (a code from `PARTY_LETTERS`) always stays in one crowd.
 * - Each page sends its state about `LIMITS.stateHz` times a second; the server checks it (finite, on the map, no
 *   faster than `LIMITS.maxSpeed` with slack for lag) and sends each page the nearest `LIMITS.near` players of its
 *   crowd as often (a grid over the map finds them), and once a second how many stand on the two stages' grounds.
 * - Limits: joins a minute per address, messages a second per page, emotes, reports; idle pages are closed.
 * - Nothing is written to disk and nothing personal is kept: a player is a salted hash of the page's random id, in
 *   memory, gone when the server stops.
 *
 * `startServer` is used by main.ts (the service) and test.ts (the checks).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket, type RawData } from 'ws';
import { EMOTES, LIMITS, PARTY_LETTERS, PROTOCOL, RIDES, testMidnight } from '../src/net/protocol.ts';
import type { ClientHello, ClientMsg, ClientState, RoomKind, ServerError, ServerMsg } from '../src/net/protocol.ts';
import { LAKE_SHORE, SQUARE } from '../src/map/nye/plan.ts';
import type { TrackerConfig } from '../src/feedback/tracker.ts';
import { checkName, NAMES_SOURCE } from './names.ts';
import { Reports } from './reports.ts';

// ── Tunables (the protocol's LIMITS are the contract; these are how the server keeps them) ──────────────────────

/** The map (src/map/layout.ts `MAP_BOUNDS`): states outside are ignored. */
const MAP = { x0: -600, x1: 760, z0: -800, z1: 120, y0: -100, y1: 3000 } as const;
/** The fireworks show's length (s): src/map/nye/clock.ts `NYE_TIMES.show` (copied: clock.ts reads the page's URL). */
const SHOW_S = 480;
/** Speed check: distance budget refills at maxSpeed × this (lag, rounding) and holds at most `SPEED_HOLD_S` of it, plus slack metres. */
const SPEED_SLACK = 1.25;
const SPEED_HOLD_S = 2;
const SPEED_SLACK_M = 4;
/** Too-fast states before the page is closed ('moved'); an accepted state takes back a quarter of one. */
const STRIKES_TO_CLOSE = 10;
/**
 * A jump (the map's own: Jump in, a glider ramp, the balloon field) shows as states far from the last one but
 * steady among themselves: after this many in a row the server takes the new spot; at most `JUMPS_PER_MIN` a minute.
 */
const JUMP_STEADY = 3;
const JUMPS_PER_MIN = 6;
/** Message rate: a bucket of `msgPerSec × 2`, refilled at msgPerSec; dropped messages in 10 s past this closes ('rate'). */
const MSG_BURST = 2;
const DROPS_TO_CLOSE = LIMITS.msgPerSec * 5;
/** Emotes: a burst of 3, one more a second. */
const EMOTE_BURST = 3;
const EMOTE_PER_S = 1;
/** No message for this long closes the page (it pings, so a live page always has one). */
const IDLE_MS = 30_000;
/** No hello this long after connecting closes it. */
const HELLO_MS = 10_000;
/** A party with nobody in it is kept this long (a page coming back finds it). */
const PARTY_KEEP_MS = 10 * 60_000;
/** The grid's cell (m) for finding the nearest players. */
const CELL = 40;
/** A page whose socket holds more than this unsent skips a snapshot; past `SLOW_CLOSE` it is closed. */
const SLOW_SKIP = 256 * 1024;
const SLOW_CLOSE = 4 * 1024 * 1024;
/** The biggest message a page may send (bytes). */
const MAX_PAYLOAD = 4 * 1024;

const GRID_W = Math.ceil((MAP.x1 - MAP.x0) / CELL);
const GRID_H = Math.ceil((MAP.z1 - MAP.z0) / CELL);

export interface ServerOptions {
  port?: number;
  host?: string;
  /** The test room's code (EVENT_CODE); none: the test room is closed. */
  eventCode?: string;
  /** Addresses the joins-a-minute limit skips (JOIN_LIMIT_EXEMPT: the load bots' machine). */
  joinExempt?: string[];
  /** Behind Railway's proxy: the player's address is X-Real-IP / the last X-Forwarded-For (TRUST_PROXY, on by itself on Railway). */
  trustProxy?: boolean;
  /** Pages from other sites are refused (ALLOWED_ORIGINS, comma-separated; empty: any). */
  allowedOrigins?: string[];
  /** Players on this server at most (MAX_PLAYERS); more get 'full'. */
  maxPlayers?: number;
  tracker?: TrackerConfig | null;
  /** The minute's log line (and report lines); default console.log. */
  log?: (line: string) => void;
  /** How often the counts line is logged (ms; default a minute, 0: never). */
  logEveryMs?: number;
}

interface Crowd {
  n: number;
  members: Set<Client>;
}
interface Party {
  code: string;
  room: Room;
  crowd: number;
  members: Set<Client>;
  emptySince: number | null;
}
interface Room {
  kind: RoomKind;
  crowds: Map<number, Crowd>;
  parties: Map<string, Party>;
  /** The test room's midnight (ms), moved on after each show + 1 min, as the page does (clock.ts `nyeNow`). */
  midnight: number | null;
  players: number;
}
interface Client {
  ws: WebSocket;
  ip: string;
  opened: number;
  sid: number;
  /** A salted hash of the page's random id (memory only). */
  device: string;
  name: string;
  look: number;
  room: Room | null;
  crowd: Crowd | null;
  party: Party | null;
  has: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  ride: number;
  emote: number;
  emoteAt: number;
  lastMsg: number;
  tokens: number;
  tokensAt: number;
  dropped: number;
  droppedFrom: number;
  emoteTokens: number;
  emoteTokensAt: number;
  budget: number;
  moveAt: number;
  strikes: number;
  pending: { x: number; z: number; at: number; n: number } | null;
  jumps: number[];
  /** This snapshot's piece of JSON (without the closing brace), '' when not shown. */
  frag: string;
  closing: boolean;
}

export interface Stats {
  msgsIn: number;
  msgsOut: number;
  bytesOut: number;
  peerMsgs: number;
  dropped: number;
  joins: number;
  refused: number;
}

export interface Health {
  ok: true;
  rooms: number;
  crowds: number;
  players: number;
  uptime: number;
  names: 'shared' | 'stub';
  testRoom: boolean;
  byRoom: Record<string, { players: number; crowds: number[]; parties: number; midnight?: string }>;
  /** Per second over the last full minute. */
  rates: { msgsIn: number; msgsOut: number; peersOut: number; kBOut: number };
  memoryMB: number;
  /** The server's CPU over the last 10 s (% of one core). */
  cpuPct: number;
  hiddenNames: number;
}

export interface RunningServer {
  port: number;
  url: string;
  health(): Health;
  close(): Promise<void>;
  /** For test.ts: the rooms as they stand. */
  rooms: Map<RoomKind, Room>;
  stats: Stats;
}

const salt = randomBytes(16);
const hashId = (id: string): string => createHash('sha256').update(salt).update(id).digest('base64url').slice(0, 22);
const digest = (s: string): Buffer => createHash('sha256').update(s).digest();
const normCode = (s: string): string => s.toUpperCase().replace(/[\s-]+/gu, '');
const r2 = (v: number): number => Math.round(v * 100) / 100;
const r3 = (v: number): number => Math.round(v * 1000) / 1000;
const inEllipse = (x: number, z: number, e: { x: number; z: number; rx: number; rz: number }): boolean => {
  const dx = (x - e.x) / e.rx;
  const dz = (z - e.z) / e.rz;
  return dx * dx + dz * dz <= 1;
};

export async function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const log = opts.log ?? ((line: string) => console.log(line));
  const eventCode = opts.eventCode?.trim() ? digest(normCode(opts.eventCode.trim())) : null;
  const exempt = new Set(opts.joinExempt ?? []);
  const origins = new Set((opts.allowedOrigins ?? []).filter(Boolean));
  const maxPlayers = opts.maxPlayers ?? 5000;
  const started = Date.now();
  const reports = new Reports(opts.tracker ?? null, log);

  const rooms = new Map<RoomKind, Room>();
  const clients = new Set<Client>();
  const byDevice = new Map<string, Client>();
  const joinsByIp = new Map<string, number[]>();
  let nextSid = 1;
  let players = 0;

  const total: Stats = { msgsIn: 0, msgsOut: 0, bytesOut: 0, peerMsgs: 0, dropped: 0, joins: 0, refused: 0 };
  let minuteFrom = { ...total };
  let lastMinute = { msgsIn: 0, msgsOut: 0, peersOut: 0, kBOut: 0 };

  const roomOf = (kind: RoomKind): Room => {
    let r = rooms.get(kind);
    if (!r) {
      r = { kind, crowds: new Map(), parties: new Map(), midnight: kind === 'test' ? testMidnight(Date.now()) : null, players: 0 };
      rooms.set(kind, r);
    }
    return r;
  };
  const crowdOf = (room: Room, n: number): Crowd => {
    let c = room.crowds.get(n);
    if (!c) {
      c = { n, members: new Set() };
      room.crowds.set(n, c);
    }
    return c;
  };
  /** The first crowd with room (crowd 1, 2…; a number left empty is used again first). */
  const openCrowd = (room: Room): Crowd => {
    for (let n = 1; ; n++) {
      const c = room.crowds.get(n);
      if (!c || c.members.size < LIMITS.crowd) return crowdOf(room, n);
    }
  };

  // ── Sending ────────────────────────────────────────────────────────────────────────────────────────────────────

  const sendRaw = (c: Client, text: string): void => {
    if (c.closing || c.ws.readyState !== c.ws.OPEN) return;
    c.ws.send(text);
    total.msgsOut++;
    total.bytesOut += text.length;
  };
  const send = (c: Client, msg: ServerMsg): void => sendRaw(c, JSON.stringify(msg));
  /** Says why and closes (1008: policy). */
  const refuse = (c: Client, code: ServerError['code'], reason?: string): void => {
    if (c.closing) return;
    send(c, reason ? { t: 'error', code, reason } : { t: 'error', code });
    c.closing = true;
    total.refused++;
    c.ws.close(1008, code);
  };
  const partyNews = (p: Party): void => {
    for (const m of p.members) send(m, { t: 'party', code: p.code, members: p.members.size });
  };

  // ── Joining and leaving ────────────────────────────────────────────────────────────────────────────────────────

  const leave = (c: Client): void => {
    clients.delete(c);
    if (byDevice.get(c.device) === c) byDevice.delete(c.device);
    if (c.party) {
      const p = c.party;
      p.members.delete(c);
      c.party = null;
      if (p.members.size === 0) p.emptySince = Date.now();
      else partyNews(p);
    }
    if (c.crowd && c.room) {
      c.crowd.members.delete(c);
      if (c.crowd.members.size === 0 && ![...c.room.parties.values()].some((p) => p.crowd === c.crowd!.n && p.members.size > 0)) c.room.crowds.delete(c.crowd.n);
      c.room.players--;
      players--;
    }
    c.crowd = null;
    c.room = null;
  };

  const joinsOk = (ip: string, now: number): boolean => {
    if (exempt.has(ip)) return true;
    const list = (joinsByIp.get(ip) ?? []).filter((t) => now - t < 60_000);
    list.push(now);
    joinsByIp.set(ip, list);
    return list.length <= LIMITS.joinsPerMin;
  };

  const codeOk = (code: unknown): boolean => {
    if (!eventCode || typeof code !== 'string' || code.length > 64) return false;
    return timingSafeEqual(digest(normCode(code)), eventCode);
  };

  const onHello = (c: Client, m: ClientHello): void => {
    if (c.room) return; // one hello a connection
    const now = Date.now();
    if (!joinsOk(c.ip, now)) return refuse(c, 'rate', 'joins');
    if (m.v !== PROTOCOL) return refuse(c, 'version', `server speaks ${PROTOCOL}`);
    const kind: RoomKind = m.room === 'test' ? 'test' : 'public';
    if (kind === 'test' && !eventCode) return refuse(c, 'code', 'closed');
    if (kind === 'test' && !codeOk(m.code)) return refuse(c, 'code');
    const named = checkName(m.name);
    if (!named.ok) return refuse(c, 'name', named.reason);
    if (players >= maxPlayers) return refuse(c, 'full');

    const room = roomOf(kind);
    if (room.midnight !== null && now - room.midnight > (SHOW_S + 60) * 1000) room.midnight = testMidnight(now);

    // The same page (its id) joining again: the older connection goes.
    c.device = typeof m.id === 'string' && m.id.length > 0 && m.id.length <= 128 ? hashId(m.id) : hashId(randomBytes(16).toString('hex'));
    const before = byDevice.get(c.device);
    if (before && before !== c) {
      leave(before);
      before.closing = true;
      before.ws.close(4002, 'replaced');
    }
    byDevice.set(c.device, c);

    // A party keeps its crowd; a code that is wrong, gone or full joins alone (and says so, without closing).
    let party: Party | null = null;
    let partyErr: string | null = null;
    if (typeof m.party === 'string' && m.party.trim()) {
      const code = normCode(m.party);
      const p = code.length === LIMITS.partyLen && [...code].every((ch) => PARTY_LETTERS.includes(ch)) ? room.parties.get(code) : undefined;
      if (!p) partyErr = 'unknown';
      else if (p.members.size >= LIMITS.partyMax) partyErr = 'full';
      else party = p;
    }

    const crowd = party ? crowdOf(room, party.crowd) : openCrowd(room);
    c.sid = nextSid++;
    c.name = named.name;
    c.look = Number.isFinite(m.look) ? m.look >>> 0 : 0;
    c.room = room;
    c.crowd = crowd;
    crowd.members.add(c);
    room.players++;
    players++;
    total.joins++;
    send(c, {
      t: 'welcome',
      sid: c.sid,
      room: kind,
      crowd: crowd.n,
      now,
      ...(room.midnight !== null ? { midnight: room.midnight } : {}),
      name: c.name,
      ...(party ? { party: party.code } : {}),
    });
    if (party) {
      party.members.add(c);
      party.emptySince = null;
      c.party = party;
      partyNews(party);
    } else if (partyErr) {
      send(c, { t: 'error', code: 'party', reason: partyErr });
    }
  };

  const onParty = (c: Client, make: boolean, leaveIt: boolean): void => {
    const room = c.room!;
    if (leaveIt) {
      if (c.party) {
        const p = c.party;
        p.members.delete(c);
        c.party = null;
        if (p.members.size === 0) p.emptySince = Date.now();
        else partyNews(p);
      }
      send(c, { t: 'party', code: null, members: 0 });
      return;
    }
    if (!make) return;
    if (c.party) return partyNews(c.party);
    let code = '';
    do {
      code = '';
      for (let i = 0; i < LIMITS.partyLen; i++) code += PARTY_LETTERS[randomInt(PARTY_LETTERS.length)];
    } while (room.parties.has(code));
    const p: Party = { code, room, crowd: c.crowd!.n, members: new Set([c]), emptySince: null };
    room.parties.set(code, p);
    c.party = p;
    partyNews(p);
  };

  // ── States, emotes, reports ────────────────────────────────────────────────────────────────────────────────────

  const onState = (c: Client, m: ClientState): void => {
    const { x, y, z, yaw, ride } = m;
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z) || !Number.isFinite(yaw)) return;
    if (!Number.isInteger(ride) || ride < 0 || ride >= RIDES.length) return;
    if (x < MAP.x0 || x > MAP.x1 || z < MAP.z0 || z > MAP.z1 || y < MAP.y0 || y > MAP.y1) return;
    const now = Date.now();
    const take = (): void => {
      c.x = x;
      c.y = y;
      c.z = z;
      c.yaw = yaw;
      c.ride = ride;
    };
    if (!c.has) {
      take();
      c.has = true;
      c.budget = 0;
      c.moveAt = now;
      return;
    }
    const rate = LIMITS.maxSpeed * SPEED_SLACK;
    c.budget = Math.min(rate * SPEED_HOLD_S, c.budget + (rate * (now - c.moveAt)) / 1000);
    c.moveAt = now;
    const d = Math.hypot(x - c.x, z - c.z);
    if (d <= c.budget + SPEED_SLACK_M) {
      c.budget = Math.max(0, c.budget - d);
      c.strikes = Math.max(0, c.strikes - 0.25);
      c.pending = null;
      take();
      return;
    }
    // Too fast from the last spot: ignored, unless it is a jump (several steady states at the new spot).
    c.strikes++;
    const p = c.pending;
    if (p && Math.hypot(x - p.x, z - p.z) <= (rate * (now - p.at)) / 1000 + SPEED_SLACK_M) {
      c.pending = { x, z, at: now, n: p.n + 1 };
      if (c.pending.n >= JUMP_STEADY) {
        c.jumps = c.jumps.filter((t) => now - t < 60_000);
        c.jumps.push(now);
        if (c.jumps.length > JUMPS_PER_MIN) return refuse(c, 'moved', 'jumps');
        c.pending = null;
        c.strikes = 0;
        c.budget = 0;
        take();
        return;
      }
    } else c.pending = { x, z, at: now, n: 1 };
    if (c.strikes >= STRIKES_TO_CLOSE) refuse(c, 'moved');
  };

  const onEmote = (c: Client, emote: unknown): void => {
    if (!Number.isInteger(emote) || (emote as number) < 0 || (emote as number) >= EMOTES.length) return;
    const now = Date.now();
    c.emoteTokens = Math.min(EMOTE_BURST, c.emoteTokens + ((now - c.emoteTokensAt) / 1000) * EMOTE_PER_S);
    c.emoteTokensAt = now;
    if (c.emoteTokens < 1) return;
    c.emoteTokens--;
    c.emote = emote as number;
    c.emoteAt = now;
  };

  const onReport = (c: Client, sid: unknown, reason: unknown): void => {
    if (!Number.isInteger(sid) || (reason !== 'name' && reason !== 'behaviour')) return;
    const room = c.room!;
    let target: Client | undefined;
    for (const crowd of room.crowds.values()) {
      for (const m of crowd.members) if (m.sid === sid) target = m;
      if (target) break;
    }
    if (!target || target === c) return;
    reports.report(c.device, { device: target.device, name: target.name, room: room.kind, crowd: target.crowd?.n ?? 0 }, reason);
  };

  // ── Messages in ────────────────────────────────────────────────────────────────────────────────────────────────

  const onMessage = (c: Client, data: RawData, isBinary: boolean): void => {
    const now = Date.now();
    c.lastMsg = now;
    total.msgsIn++;
    // The rate: a bucket refilled at msgPerSec; over it the message is dropped, and many dropped closes.
    c.tokens = Math.min(LIMITS.msgPerSec * MSG_BURST, c.tokens + ((now - c.tokensAt) / 1000) * LIMITS.msgPerSec);
    c.tokensAt = now;
    if (c.tokens < 1) {
      if (now - c.droppedFrom > 10_000) {
        c.dropped = 0;
        c.droppedFrom = now;
      }
      c.dropped++;
      total.dropped++;
      if (c.dropped > DROPS_TO_CLOSE) refuse(c, 'rate');
      return;
    }
    c.tokens--;
    if (isBinary) return;
    let m: ClientMsg;
    try {
      m = JSON.parse(data.toString()) as ClientMsg;
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'ping') {
      if (Number.isFinite(m.at)) send(c, { t: 'pong', at: m.at, now: Date.now() });
      return;
    }
    if (m.t === 'hello') return onHello(c, m);
    if (!c.room) return; // nothing else before the welcome
    switch (m.t) {
      case 'state':
        return onState(c, m);
      case 'emote':
        return onEmote(c, m.emote);
      case 'report':
        return onReport(c, m.sid, m.reason);
      case 'party':
        return onParty(c, m.make === true, m.leave === true);
    }
  };

  // ── The snapshots: the nearest of the crowd, stateHz times a second ────────────────────────────────────────────

  const cellOf = (x: number, z: number): [number, number] => [
    Math.min(GRID_W - 1, Math.max(0, Math.floor((x - MAP.x0) / CELL))),
    Math.min(GRID_H - 1, Math.max(0, Math.floor((z - MAP.z0) / CELL))),
  ];
  const grid: Client[][] = Array.from({ length: GRID_W * GRID_H }, () => []);
  const used: number[] = [];
  const cand: Client[] = [];
  const dist: number[] = [];
  const order: number[] = [];

  /** Players of the cells in ring `r` round (cx, cz) into `cand`. */
  const ring = (cx: number, cz: number, r: number): void => {
    for (let gz = cz - r; gz <= cz + r; gz++) {
      if (gz < 0 || gz >= GRID_H) continue;
      const edge = gz === cz - r || gz === cz + r;
      for (let gx = cx - r; gx <= cx + r; gx += edge ? 1 : 2 * r || 1) {
        if (gx < 0 || gx >= GRID_W) continue;
        for (const m of grid[gz * GRID_W + gx]) cand.push(m);
      }
    }
  };

  const snapshot = (crowd: Crowd, head: string): void => {
    const shown: Client[] = [];
    for (const m of crowd.members) {
      if (!m.has || m.closing) continue;
      const name = reports.isHidden(m.device, m.name) ? 'Player' : m.name;
      m.frag = `{"sid":${m.sid},"name":${JSON.stringify(name)},"x":${r2(m.x)},"y":${r2(m.y)},"z":${r2(m.z)},"yaw":${r3(m.yaw)},"ride":${m.ride},"emote":${m.emote},"emoteAt":${m.emoteAt},"look":${m.look}`;
      shown.push(m);
    }
    const all = shown.length <= LIMITS.near + 1;
    if (!all) {
      for (const m of shown) {
        const [gx, gz] = cellOf(m.x, m.z);
        const i = gz * GRID_W + gx;
        if (grid[i].length === 0) used.push(i);
        grid[i].push(m);
      }
    }
    const maxRing = Math.max(GRID_W, GRID_H);
    for (const c of crowd.members) {
      if (c.closing) continue;
      if (c.ws.bufferedAmount > SLOW_SKIP) {
        if (c.ws.bufferedAmount > SLOW_CLOSE) {
          c.closing = true;
          c.ws.terminate();
        }
        continue;
      }
      let near: Client[];
      if (all || !c.has) {
        near = all ? shown : [];
        if (!all && !c.has) near = shown.slice(0, LIMITS.near); // not placed yet: anyone, until its first state
      } else {
        cand.length = 0;
        const [cx, cz] = cellOf(c.x, c.z);
        let r = 0;
        while (cand.length <= LIMITS.near && r <= maxRing) ring(cx, cz, r++);
        // Everything within (r − 1) cells is in; the k-th nearest may lie a little farther: take the rings it needs.
        dist.length = 0;
        for (const m of cand) dist.push((m.x - c.x) ** 2 + (m.z - c.z) ** 2);
        if (cand.length > LIMITS.near) {
          const kth = Math.sqrt([...dist].sort((a, b) => a - b)[LIMITS.near]);
          const need = Math.ceil(kth / CELL) + 1;
          while (r <= need && r <= maxRing) {
            const from = cand.length;
            ring(cx, cz, r++);
            for (let i = from; i < cand.length; i++) dist.push((cand[i].x - c.x) ** 2 + (cand[i].z - c.z) ** 2);
          }
        }
        order.length = 0;
        for (let i = 0; i < cand.length; i++) if (cand[i] !== c) order.push(i);
        if (order.length > LIMITS.near) {
          order.sort((a, b) => dist[a] - dist[b]);
          order.length = LIMITS.near;
        }
        near = order.map((i) => cand[i]);
      }
      let body = head;
      let first = true;
      for (const m of near) {
        if (m === c) continue;
        body += (first ? '' : ',') + m.frag + (c.party && m.party === c.party ? ',"party":true}' : '}');
        first = false;
      }
      sendRaw(c, body + ']}');
      total.peerMsgs++;
    }
    for (const i of used) grid[i].length = 0;
    used.length = 0;
  };

  const peersTick = (): void => {
    const now = Date.now();
    const head = `{"t":"peers","now":${now},"peers":[`;
    for (const room of rooms.values()) for (const crowd of room.crowds.values()) snapshot(crowd, head);
  };

  const cpuRing: { at: number; us: number }[] = [];
  let cpuPct = 0;
  const secondTick = (): void => {
    const now = Date.now();
    const u = process.cpuUsage();
    cpuRing.push({ at: now, us: u.user + u.system });
    if (cpuRing.length > 11) cpuRing.shift();
    if (cpuRing.length > 1) cpuPct = Math.round(((cpuRing[cpuRing.length - 1].us - cpuRing[0].us) / 1000 / (now - cpuRing[0].at)) * 1000) / 10;
    for (const room of rooms.values()) {
      if (room.midnight !== null && now - room.midnight > (SHOW_S + 60) * 1000) room.midnight = testMidnight(now);
      let square = 0;
      let lake = 0;
      for (const crowd of room.crowds.values())
        for (const m of crowd.members) {
          if (!m.has) continue;
          if (inEllipse(m.x, m.z, SQUARE)) square++;
          else if (inEllipse(m.x, m.z, LAKE_SHORE)) lake++;
        }
      const text = JSON.stringify({ t: 'count', square, lake, online: room.players } satisfies ServerMsg);
      for (const crowd of room.crowds.values()) for (const m of crowd.members) sendRaw(m, text);
      for (const [code, p] of room.parties) if (p.emptySince !== null && now - p.emptySince > PARTY_KEEP_MS) room.parties.delete(code);
    }
    for (const c of clients) {
      if (c.closing) continue;
      if (now - c.lastMsg > IDLE_MS || (!c.room && now - c.opened > HELLO_MS)) {
        c.closing = true;
        c.ws.close(4000, 'idle');
      }
    }
  };

  const minuteTick = (): void => {
    const now = Date.now();
    const d = (k: keyof Stats): number => (total[k] - minuteFrom[k]) / 60;
    lastMinute = { msgsIn: Math.round(d('msgsIn')), msgsOut: Math.round(d('msgsOut')), peersOut: Math.round(d('peerMsgs')), kBOut: Math.round(d('bytesOut') / 1024) };
    minuteFrom = { ...total };
    for (const [ip, list] of joinsByIp) {
      const keep = list.filter((t) => now - t < 60_000);
      if (keep.length) joinsByIp.set(ip, keep);
      else joinsByIp.delete(ip);
    }
    reports.prune(now);
  };

  // ── HTTP: /health, and the WebSocket upgrade ────────────────────────────────────────────────────────────────────

  const health = (): Health => {
    const byRoom: Health['byRoom'] = {};
    let crowds = 0;
    for (const r of rooms.values()) {
      crowds += r.crowds.size;
      byRoom[r.kind] = {
        players: r.players,
        crowds: [...r.crowds.values()].sort((a, b) => a.n - b.n).map((c) => c.members.size),
        parties: [...r.parties.values()].filter((p) => p.members.size > 0).length,
        ...(r.midnight !== null ? { midnight: new Date(r.midnight).toISOString() } : {}),
      };
    }
    return {
      ok: true,
      rooms: [...rooms.values()].filter((r) => r.players > 0).length,
      crowds,
      players,
      uptime: Math.round((Date.now() - started) / 1000),
      names: NAMES_SOURCE,
      testRoom: eventCode !== null,
      byRoom,
      rates: lastMinute,
      memoryMB: Math.round(process.memoryUsage().rss / 1048576),
      cpuPct,
      hiddenNames: reports.hiddenCount,
    };
  };

  const http = createServer((req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? '/').split('?')[0];
    if (req.method === 'GET' && (path === '/health' || path === '/')) {
      const body = JSON.stringify(health());
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
      res.end(body);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('not here\n');
  });

  const addressOf = (req: IncomingMessage): string => {
    if (opts.trustProxy) {
      const real = req.headers['x-real-ip'];
      if (typeof real === 'string' && real) return real.trim();
      const fwd = req.headers['x-forwarded-for'];
      const list = (Array.isArray(fwd) ? fwd.join(',') : (fwd ?? '')).split(',').map((s) => s.trim()).filter(Boolean);
      if (list.length) return list[list.length - 1];
    }
    return (req.socket.remoteAddress ?? '?').replace(/^::ffff:/, '');
  };

  const wss = new WebSocketServer({
    server: http,
    maxPayload: MAX_PAYLOAD,
    perMessageDeflate: false,
    clientTracking: false,
    verifyClient: (info: { origin: string; req: IncomingMessage }) => origins.size === 0 || !info.origin || origins.has(info.origin),
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const now = Date.now();
    const c: Client = {
      ws,
      ip: addressOf(req),
      opened: now,
      sid: 0,
      device: '',
      name: '',
      look: 0,
      room: null,
      crowd: null,
      party: null,
      has: false,
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      ride: 0,
      emote: 0,
      emoteAt: 0,
      lastMsg: now,
      tokens: LIMITS.msgPerSec * MSG_BURST,
      tokensAt: now,
      dropped: 0,
      droppedFrom: now,
      emoteTokens: EMOTE_BURST,
      emoteTokensAt: now,
      budget: 0,
      moveAt: now,
      strikes: 0,
      pending: null,
      jumps: [],
      frag: '',
      closing: false,
    };
    clients.add(c);
    ws.on('message', (data: RawData, isBinary: boolean) => {
      try {
        onMessage(c, data, isBinary);
      } catch (err) {
        log(`[nye] message failed: ${(err as Error).message}`);
      }
    });
    ws.on('close', () => leave(c));
    ws.on('error', () => {
      // (the close follows)
    });
  });

  const timers = [
    setInterval(peersTick, Math.round(1000 / LIMITS.stateHz)),
    setInterval(secondTick, 1000),
    setInterval(minuteTick, 60_000),
  ];
  const logEvery = opts.logEveryMs ?? 60_000;
  if (logEvery > 0)
    timers.push(
      setInterval(() => {
        const h = health();
        const rs = Object.entries(h.byRoom)
          .map(([k, r]) => `${k} ${r.players} [${r.crowds.join(' ')}]`)
          .join(', ');
        log(
          `[nye] players ${h.players} (${rs || 'no rooms'}) · in ${h.rates.msgsIn}/s out ${h.rates.msgsOut}/s peers ${h.rates.peersOut}/s ${h.rates.kBOut} kB/s · cpu ${h.cpuPct}% rss ${h.memoryMB} MB · up ${Math.round(h.uptime / 60)} min`,
        );
      }, logEvery),
    );

  await new Promise<void>((resolve, reject) => {
    http.once('error', reject);
    http.listen(opts.port ?? 8787, opts.host, () => resolve());
  });
  const port = (http.address() as AddressInfo).port;

  return {
    port,
    url: `ws://localhost:${port}`,
    health,
    rooms,
    stats: total,
    close: async () => {
      for (const t of timers) clearInterval(t);
      for (const c of clients) c.ws.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve) => http.close(() => resolve()));
    },
  };
}
