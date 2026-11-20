// Parties: a 6-letter code shared among friends, up to 8 members (AWP-35 Phase 3,
// docs/discussion/new-year-voice.md). Kept in memory only: nothing is written to
// disk, and a party is forgotten after hours without use.

import { randomBytes, timingSafeEqual } from 'node:crypto';

/** No look-alikes: no 0 / O, 1 / I / L. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;
export const MAX_MEMBERS = 8;
const IDLE_MS = 6 * 60 * 60 * 1000;

export class PartyError extends Error {
  /** @param {number} status HTTP status @param {string} code a word the game turns into its own text */
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/** A player id is made on the device: random, no personal data. */
export function checkPlayerId(id) {
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(id)) throw new PartyError(400, 'bad-id');
  return id;
}

/**
 * The name typed before joining, checked again here (the game checks it first).
 * The rude-word list comes with Phase 2's names; this keeps out links, phone
 * numbers and staff-looking names.
 */
export function checkName(name) {
  if (typeof name !== 'string') throw new PartyError(400, 'bad-name');
  const n = name.normalize('NFC').trim().replace(/\s+/g, ' ');
  const letters = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(n)].length;
  if (letters < 2 || letters > 16) throw new PartyError(400, 'bad-name');
  if (!/^[\p{L}\p{M}\p{N} '.-]+$/u.test(n)) throw new PartyError(400, 'bad-name');
  if (/\d{4,}/.test(n.replace(/[\s.-]/g, ''))) throw new PartyError(400, 'bad-name');
  if (/(www|http|\.com|\.kh|\.net)/i.test(n)) throw new PartyError(400, 'bad-name');
  if (/(admin|moderator|mod\b|staff|official)/i.test(n)) throw new PartyError(400, 'bad-name');
  return n;
}

export function normalizeCode(code) {
  if (typeof code !== 'string') throw new PartyError(400, 'bad-code');
  const c = code.toUpperCase().replace(/[\s-]/g, '');
  if (c.length !== CODE_LENGTH || [...c].some((ch) => !CODE_ALPHABET.includes(ch))) {
    throw new PartyError(400, 'bad-code');
  }
  return c;
}

function sameKey(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export class Parties {
  /** @param {{ now?: () => number, rand?: (n: number) => Buffer }} [opts] */
  constructor(opts = {}) {
    this.now = opts.now ?? Date.now;
    this.rand = opts.rand ?? randomBytes;
    /** @type {Map<string, { maker: string, members: Map<string, { name: string, key: string, joined: number }>, removed: Set<string>, used: number }>} */
    this.parties = new Map();
  }

  #newCode() {
    for (let tries = 0; tries < 50; tries++) {
      const bytes = this.rand(CODE_LENGTH);
      let code = '';
      for (const b of bytes) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
      if (!this.parties.has(code)) return code;
    }
    throw new PartyError(503, 'busy');
  }

  #newKey() {
    return this.rand(24).toString('base64url');
  }

  #party(code) {
    const party = this.parties.get(normalizeCode(code));
    if (!party) throw new PartyError(404, 'no-party');
    return party;
  }

  /** The member behind a key: what every later call starts from. */
  member(code, playerId, key) {
    const party = this.#party(code);
    const m = party.members.get(checkPlayerId(playerId));
    if (!m || !sameKey(m.key, key)) throw new PartyError(403, 'not-member');
    party.used = this.now();
    return { code: normalizeCode(code), party, member: m };
  }

  make(playerId, name) {
    checkPlayerId(playerId);
    const n = checkName(name);
    const code = this.#newCode();
    const key = this.#newKey();
    const now = this.now();
    this.parties.set(code, {
      maker: playerId,
      members: new Map([[playerId, { name: n, key, joined: now }]]),
      removed: new Set(),
      used: now,
    });
    return { code, key };
  }

  join(code, playerId, name) {
    const c = normalizeCode(code);
    const party = this.#party(c);
    checkPlayerId(playerId);
    const n = checkName(name);
    if (party.removed.has(playerId)) throw new PartyError(403, 'removed');
    const again = party.members.get(playerId);
    if (!again && party.members.size >= MAX_MEMBERS) throw new PartyError(409, 'full');
    // The same player again (a reload, a second tab): a new key, the old one ends.
    const key = this.#newKey();
    party.members.set(playerId, { name: n, key, joined: again?.joined ?? this.now() });
    party.used = this.now();
    return { code: c, key };
  }

  /** @returns {boolean} whether the party is now empty (and forgotten) */
  leave(code, playerId, key) {
    const { code: c, party } = this.member(code, playerId, key);
    party.members.delete(playerId);
    if (party.members.size === 0) {
      this.parties.delete(c);
      return true;
    }
    if (party.maker === playerId) {
      // The longest-standing member becomes the maker.
      let next = null;
      for (const [id, m] of party.members) if (!next || m.joined < next[1].joined) next = [id, m];
      party.maker = next[0];
    }
    return false;
  }

  /** The maker takes a member out; they can't join this party again. */
  remove(code, playerId, key, targetId) {
    const { party } = this.member(code, playerId, key);
    if (party.maker !== playerId) throw new PartyError(403, 'not-maker');
    checkPlayerId(targetId);
    if (targetId === playerId) throw new PartyError(400, 'bad-id');
    party.members.delete(targetId);
    party.removed.add(targetId);
  }

  state(code, playerId, key) {
    const { code: c, party } = this.member(code, playerId, key);
    return {
      code: c,
      maker: party.maker,
      members: [...party.members].map(([id, m]) => ({ id, name: m.name })),
      max: MAX_MEMBERS,
    };
  }

  /** Forget parties nobody has used for hours. */
  sweep() {
    const old = this.now() - IDLE_MS;
    for (const [code, party] of this.parties) if (party.used < old) this.parties.delete(code);
  }
}
