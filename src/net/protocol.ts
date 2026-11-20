/**
 * New Year's Eve online, phase 2 (AWP-35, docs/discussion/new-year-online.md "Phase 2: live player rooms"): the
 * messages between a player's page and the live server, and the limits both keep. Shared by the game (src/net/) and
 * the server (server/), so it is plain TypeScript with no imports: Node runs it as it is (type stripping), Vite
 * bundles it. JSON over one WebSocket.
 *
 * Safety (the plan's "Safety"): no typed chat ever; greetings, emotes and ready-made lines are numbers. A player is a
 * random id made on the device (`ClientHello.id`), no email, phone or age. Names are checked on the device and again
 * on the server (src/net/names.ts). Nothing here is saved by the server after the night.
 */

/** The protocol's version: a server refuses a page that speaks another (`ServerError` 'version'). */
export const PROTOCOL = 1;

/** Limits both sides keep (the server enforces them; the page stays under them). */
export const LIMITS = {
  /** States a second a page sends while it moves (fewer while still). */
  stateHz: 5,
  /** Messages a second a page may send in all (more and the server drops them, then closes). */
  msgPerSec: 12,
  /** Joins a minute from one connection's address. */
  joinsPerMin: 6,
  /** Players a page is told about at once: the nearest. */
  near: 50,
  /** Players in one crowd (a room's copy); past it a new crowd opens ("Crowd 2"); a party stays together. */
  crowd: 120,
  /** Fastest a player may move between two states (m/s: the glider and the balloon's easy flying with Shift). */
  maxSpeed: 60,
  /** Reports from different players that hide a name for everyone ("Player") until it is looked at. */
  reportsToHide: 3,
  /** Name length (letters). */
  nameMin: 2,
  nameMax: 16,
  /** A party's code: letters with no look-alikes (no 0/O, 1/I/L), this long; up to `partyMax` players. */
  partyLen: 6,
  partyMax: 8,
} as const;

/** The party code's letters (no look-alikes). */
export const PARTY_LETTERS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Which room: everyone (`public`), or the hidden test room (`test`: its own midnight every 15 minutes, never meets the public). */
export type RoomKind = 'public' | 'test';

/** How a player moves (shown as the crowd model's ride). */
export const RIDES = ['walk', 'bike', 'glide', 'boat', 'balloon', 'parachute', 'sit', 'lie'] as const;
export type Ride = (typeof RIDES)[number];

/** Emotes and ready-made greetings (numbers on the wire; words in the game's lang.ts). */
export const EMOTES = ['none', 'wave', 'sampeah', 'cheer', 'clap', 'dance', 'photo', 'sparkler', 'happyNewYear', 'thanks', 'follow'] as const;
export type Emote = (typeof EMOTES)[number];

/** A player as the others see them. */
export interface PeerState {
  /** The server's short id for this player in this crowd (not the device id). */
  sid: number;
  /** Their checked name (Latin or Khmer), or "Player" when hidden after reports. */
  name: string;
  /** Map metres (+x east, −z north, +y up) and facing (radians toward (sin, cos) in x, z). */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Index into `RIDES` / `EMOTES`; `emote` with the server time it began (ms) so it plays once. */
  ride: number;
  emote: number;
  emoteAt: number;
  /** Clothes and look: a seed the crowd model dresses from (the same on every screen). */
  look: number;
  /** In your party (voice later, phase 3). */
  party?: boolean;
}

// ── Page → server ─────────────────────────────────────────────────────────────────────────────────────────────

export interface ClientHello {
  t: 'hello';
  v: number;
  /** The device's random id (kept in localStorage), never shown to others. */
  id: string;
  name: string;
  look: number;
  room: RoomKind;
  /** The test room's code (the hidden link `/?event=<code>` or typed in "Have a code?"); checked by the server only. */
  code?: string;
  /** A party code to join (phase 3 uses it for voice; phase 2 keeps a party in one crowd). */
  party?: string;
}
export interface ClientState {
  t: 'state';
  x: number;
  y: number;
  z: number;
  yaw: number;
  ride: number;
}
export interface ClientEmote {
  t: 'emote';
  emote: number;
}
export interface ClientReport {
  t: 'report';
  sid: number;
  /** 'name' (a rude name) or 'behaviour'. */
  reason: 'name' | 'behaviour';
}
/** The clock: the server answers with its time (`ServerPong`), the page works out the offset (NTP-like, best of several). */
export interface ClientPing {
  t: 'ping';
  /** The page's `performance.now()` when sent (ms), echoed back. */
  at: number;
}
/** Make a party (the server answers with its code) or leave it. */
export interface ClientParty {
  t: 'party';
  make?: boolean;
  leave?: boolean;
}
export type ClientMsg = ClientHello | ClientState | ClientEmote | ClientReport | ClientPing | ClientParty;

// ── Server → page ─────────────────────────────────────────────────────────────────────────────────────────────

export interface ServerWelcome {
  t: 'welcome';
  sid: number;
  room: RoomKind;
  /** Which crowd of the room (1, 2…: "Crowd 2"). */
  crowd: number;
  /** The server's clock now (ms since 1970). */
  now: number;
  /** In the test room: this room's midnight (ms since 1970: the next quarter hour); absent in public (the real one). */
  midnight?: number;
  /** The name as the server accepted it (trimmed). */
  name: string;
  /** The party's code, if in one. */
  party?: string;
}
export interface ServerPong {
  t: 'pong';
  at: number;
  now: number;
}
/** The players near you now (at most `LIMITS.near`), about `stateHz` times a second; anyone missing has gone out of reach. */
export interface ServerPeers {
  t: 'peers';
  /** Server time of this snapshot (ms). */
  now: number;
  peers: PeerState[];
}
/** How many players stand on each stage's ground now (the boards show it: nye/board.ts `setBoardPlayers`). */
export interface ServerCount {
  t: 'count';
  square: number;
  lake: number;
  /** Everyone in your room. */
  online: number;
}
export interface ServerParty {
  t: 'party';
  code: string | null;
  members: number;
}
export interface ServerError {
  t: 'error';
  /** 'version' | 'name' (refused: `reason` from names.ts) | 'code' (a wrong test code) | 'full' | 'rate' | 'moved' (too fast) | 'party'. */
  code: 'version' | 'name' | 'code' | 'full' | 'rate' | 'moved' | 'party';
  reason?: string;
}
export type ServerMsg = ServerWelcome | ServerPong | ServerPeers | ServerCount | ServerParty | ServerError;

/** The test room's midnight at or after `now` (ms): every quarter hour (:00, :15, :30, :45 UTC minutes), at least 2 minutes ahead. */
export function testMidnight(now: number): number {
  const q = 15 * 60 * 1000;
  let m = Math.ceil(now / q) * q;
  if (m - now < 2 * 60 * 1000) m += q;
  return m;
}
