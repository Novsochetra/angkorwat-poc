// The live service's HTTP side: parties and voice tickets (AWP-35 Phase 3).
// Phase 2 (players' positions over a WebSocket) joins this same service later.
//
// The voice server (LiveKit, docs/discussion/new-year-voice.md) lets in only a
// player with a ticket signed by the secret this service holds; a ticket is
// written only for a party member, for that party's room, for a microphone only.

import http from 'node:http';
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { Parties, PartyError } from './parties.mjs';

const TICKET_TTL = '10m';
const BODY_LIMIT = 2048;

/**
 * @typedef {{
 *   livekitUrl: string, apiKey: string, apiSecret: string,
 *   origins: string[], roomPrefix: string,
 * }} Config
 * @typedef {{
 *   createRoom(o: { name: string, maxParticipants: number, emptyTimeout: number }): Promise<unknown>,
 *   removeParticipant(room: string, identity: string): Promise<unknown>,
 * }} Rooms  LiveKit's RoomServiceClient, or a stand-in in tests
 */

/** A few requests a second per address; making parties is slower still. */
class Limiter {
  constructor(max, windowMs, now = Date.now) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
    this.hits = new Map();
  }
  ok(who) {
    const t = this.now();
    const h = this.hits.get(who);
    if (!h || t - h.start > this.windowMs) {
      this.hits.set(who, { start: t, n: 1 });
      return true;
    }
    return ++h.n <= this.max;
  }
  sweep() {
    const t = this.now();
    for (const [k, h] of this.hits) if (t - h.start > this.windowMs) this.hits.delete(k);
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > BODY_LIMIT) {
        reject(new PartyError(413, 'too-big'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new PartyError(400, 'bad-json'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * @param {{ config: Config, rooms: Rooms, parties?: Parties, now?: () => number, log?: (...a: unknown[]) => void }} o
 */
export function createLiveServer({ config, rooms, parties = new Parties(), now = Date.now, log = console.log }) {
  const perAddress = new Limiter(40, 10_000, now);
  const making = new Limiter(6, 60_000, now);
  const made = new Set(); // rooms already made on the voice server

  const roomOf = (code) => config.roomPrefix + code;

  async function ensureRoom(name) {
    if (made.has(name)) return;
    await rooms.createRoom({ name, maxParticipants: 8, emptyTimeout: 10 * 60 });
    made.add(name);
  }

  async function dropFromVoice(code, identity) {
    try {
      await rooms.removeParticipant(roomOf(code), identity);
    } catch {
      // not connected to voice: nothing to do
    }
  }

  async function ticket(code, playerId, name) {
    const room = roomOf(code);
    await ensureRoom(room);
    const at = new AccessToken(config.apiKey, config.apiSecret, { identity: playerId, name, ttl: TICKET_TTL });
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: [TrackSource.MICROPHONE],
      canUpdateOwnMetadata: false,
    });
    return { url: config.livekitUrl, room, token: await at.toJwt() };
  }

  /** @type {Record<string, (b: any) => Promise<unknown>>} */
  const routes = {
    async '/party/make'(b) {
      const { code, key } = parties.make(b.playerId, b.name);
      return { code, key, ...parties.state(code, b.playerId, key) };
    },
    async '/party/join'(b) {
      const { code, key } = parties.join(b.code, b.playerId, b.name);
      return { code, key, ...parties.state(code, b.playerId, key) };
    },
    async '/party/state'(b) {
      return parties.state(b.code, b.playerId, b.key);
    },
    async '/party/leave'(b) {
      const { code } = parties.member(b.code, b.playerId, b.key);
      parties.leave(code, b.playerId, b.key);
      await dropFromVoice(code, b.playerId);
      return { ok: true };
    },
    async '/party/remove'(b) {
      const { code } = parties.member(b.code, b.playerId, b.key);
      parties.remove(code, b.playerId, b.key, b.target);
      await dropFromVoice(code, b.target);
      return parties.state(code, b.playerId, b.key);
    },
    async '/voice/ticket'(b) {
      const { code, member } = parties.member(b.code, b.playerId, b.key);
      return ticket(code, b.playerId, member.name);
    },
  };

  function cors(req, res) {
    const origin = req.headers.origin;
    if (origin && config.origins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      res.setHeader('Access-Control-Max-Age', '600');
    }
  }

  function send(res, status, body) {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  }

  const server = http.createServer(async (req, res) => {
    cors(req, res);
    const url = new URL(req.url ?? '/', 'http://x');
    if (req.method === 'OPTIONS') return void res.writeHead(204).end();
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return send(res, 200, { ok: true, parties: parties.parties.size });
    }
    const route = routes[url.pathname];
    if (req.method !== 'POST' || !route) return send(res, 404, { error: 'not-found' });
    // A page from another site may not use this service.
    if (req.headers.origin && !config.origins.includes(req.headers.origin)) {
      return send(res, 403, { error: 'origin' });
    }
    const who = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '?').split(',')[0].trim();
    if (!perAddress.ok(who) || (url.pathname === '/party/make' && !making.ok(who))) {
      return send(res, 429, { error: 'slow-down' });
    }
    try {
      const body = await readJson(req);
      send(res, 200, await route(body));
    } catch (e) {
      if (e instanceof PartyError) return send(res, e.status, { error: e.code });
      log('[live] error', url.pathname, e);
      send(res, 500, { error: 'server' });
    }
  });

  const sweeper = setInterval(() => {
    parties.sweep();
    perAddress.sweep();
    making.sweep();
  }, 60_000);
  sweeper.unref();
  server.on('close', () => clearInterval(sweeper));

  return { server, parties };
}
