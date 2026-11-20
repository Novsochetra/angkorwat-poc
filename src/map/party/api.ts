/**
 * The live service (the arcade repo's `apps/live`, Railway service
 * `@arcade/live`): parties of up to 8 with a 6-letter code, and tickets for
 * the party's voice room on our LiveKit server (docs/discussion/new-year-voice.md).
 *
 * A player is a random id made on this device (no account, nothing personal);
 * make and join answer a `key` that proves the player is in that party. The
 * party's code and key are kept in this browser, so a reload goes back in.
 *
 * `VITE_LIVE_URL` points at another live service (a local one:
 * `http://localhost:8766`); without it, the real one.
 */

import { PARTY_KEY } from './gate';

const LIVE_URL: string = import.meta.env.VITE_LIVE_URL || 'https://arcadelive-production.up.railway.app';
const GAME = 'morodok-angkor';
const ID_KEY = 'angkor-player-id';

export interface Member {
  id: string;
  name: string;
}

export interface Party {
  code: string;
  maker: string;
  members: Member[];
  max: number;
}

export interface Ticket {
  url: string;
  room: string;
  token: string;
}

/** What the live service said no with: a word the game turns into its own text (lang.ts `party_<reason>`). */
export class PartyFail extends Error {
  constructor(readonly reason: string) {
    super(reason);
  }
}

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function store(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // (a private window keeps nothing: the party lasts as long as the page)
  }
}

let memoryId: string | null = null;

/** This device's player id: random, made once, kept. */
export function playerId(): string {
  const kept = stored(ID_KEY) ?? memoryId;
  if (kept) return kept;
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const id = 'p' + Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  memoryId = id;
  store(ID_KEY, id);
  return id;
}

/** The party this browser is in (its code and key), if any. */
export function keptParty(): { code: string; key: string } | null {
  try {
    const kept = JSON.parse(stored(PARTY_KEY) ?? 'null');
    return kept && typeof kept.code === 'string' && typeof kept.key === 'string' ? kept : null;
  } catch {
    return null;
  }
}

function keep(entry: { code: string; key: string } | null): void {
  store(PARTY_KEY, entry ? JSON.stringify(entry) : null);
}

async function call<T>(path: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${LIVE_URL}/api/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: GAME, playerId: playerId(), ...body }),
    });
  } catch {
    throw new PartyFail('offline');
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new PartyFail(typeof json.error === 'string' ? json.error : 'server');
  return json as T;
}

function asKept(): { code: string; key: string } {
  const kept = keptParty();
  if (!kept) throw new PartyFail('not-member');
  return kept;
}

export async function makeParty(name: string): Promise<Party> {
  const made = await call<Party & { key: string }>('party/make', { name });
  keep({ code: made.code, key: made.key });
  return made;
}

export async function joinParty(code: string, name: string): Promise<Party> {
  const joined = await call<Party & { key: string }>('party/join', { code, name });
  keep({ code: joined.code, key: joined.key });
  return joined;
}

/** The party as it is now; a party that is gone, or that took him out, forgets itself here too. */
export async function partyState(): Promise<Party> {
  try {
    return await call<Party>('party/state', asKept());
  } catch (e) {
    if (e instanceof PartyFail && (e.reason === 'not-member' || e.reason === 'no-party')) keep(null);
    throw e;
  }
}

export async function leaveParty(): Promise<void> {
  const kept = keptParty();
  keep(null);
  if (kept) await call('party/leave', kept).catch(() => undefined);
}

/** The party's maker takes a member out (they can't come back into it). */
export async function removeMember(target: string): Promise<Party> {
  return call<Party>('party/remove', { ...asKept(), target });
}

export async function voiceTicket(): Promise<Ticket> {
  return call<Ticket>('voice/ticket', asKept());
}
