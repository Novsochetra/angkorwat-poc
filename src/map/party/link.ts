import type { NetPeer } from '../../net/types';

/**
 * The party's voice and the live rooms as one system (AWP-35 phases 2 and 3; docs/discussion/new-year-voice.md
 * "Proximity volume"). Small and with no imports of its own, so the players scene (people/_scenePlayers.ts) reads it
 * without loading the party module, and the party module (index.ts, lazy) without loading the scene.
 *
 * - **One party:** the arcade party (api.ts) is the party. index.ts tells `NET.setParty(code)`, the live server
 *   keeps its players in one crowd and marks them to each other (`NetPeer.party`: the gold diamond and gold name).
 * - **Who is who:** a voice participant is an arcade player id (`Member.id`); a map player is a server id (`sid`).
 *   The page never learns another's device id (net/client.ts), so `matchFriends` pairs a member with a peer marked
 *   `party` by the name they show (the same name, Latin or Khmer, any case); one member and one party peer left
 *   over (a name that differs, or the server's hidden "Player") are paired too. Anyone not found is heard at full
 *   volume, as before Phase 2.
 * - **The fade** (`voiceFade`): full to `VOICE_NEAR` m (≈ 20), quieter, silent from `VOICE_FAR` m (≈ 100); tuned
 *   by ear with `voicenear=` / `voicefar=` in the address.
 * - **The speaking mark:** index.ts puts the server ids of the friends talking now in `partyLink.talking` (5 times a
 *   second); the scene shows a small mark over their heads (their name tag's sound bars, and the party diamond
 *   bobbing).
 */

/** The map's other players as the scene reads them, and who of them is talking now. */
export const partyLink = {
  /**
   * A shot's ghost players (people/_scenePlayers.ts with `ghosts=`), so `partydemo=` matches its friends to them;
   * null: the live connection's (`NET.peers`).
   */
  ghosts: null as ReadonlyMap<number, NetPeer> | null,
  /** Server ids (`NetPeer.sid`) of the party's friends talking now (not muted or blocked). */
  talking: new Set<number>(),
};

const params = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
const num = (k: string, d: number): number => {
  const v = Number(params.get(k));
  return params.has(k) && Number.isFinite(v) && v >= 0 ? v : d;
};

/** Full volume to this distance (m: about half the festival square). */
export const VOICE_NEAR = num('voicenear', 20);
/** Silent from this distance (m: about two squares away). */
export const VOICE_FAR = Math.max(VOICE_NEAR + 1, num('voicefar', 100));

/** A friend's voice volume (0‥1) at `d` m: full near, falling as the square of the way left (an even fade by ear), 0 far. */
export function voiceFade(d: number): number {
  if (d <= VOICE_NEAR) return 1;
  if (d >= VOICE_FAR) return 0;
  const k = (VOICE_FAR - d) / (VOICE_FAR - VOICE_NEAR);
  return k * k;
}

/** The name the server shows for a hidden one (net/_blocked.ts `HIDDEN_NAME`): never matched by name. */
const HIDDEN = 'player';
const norm = (s: string): string => s.normalize('NFC').trim().replace(/\s+/gu, ' ').toLowerCase();

/**
 * Each friend of the party (not `me`) found among the map's players: by the party mark and the same name, then one
 * left on each side paired (never one of `byNameOnly`: a blocked friend, who is hidden from the map once found).
 * Friends not found are not in the map.
 */
export function matchFriends(members: readonly { id: string; name: string }[], me: string, peers: Iterable<NetPeer>, byNameOnly?: ReadonlySet<string>): Map<string, NetPeer> {
  const out = new Map<string, NetPeer>();
  const left: NetPeer[] = [];
  for (const p of peers) if (p.party) left.push(p);
  if (!left.length) return out;
  const unmatched: { id: string; name: string }[] = [];
  for (const m of members) {
    if (m.id === me) continue;
    const n = norm(m.name);
    const i = n && n !== HIDDEN ? left.findIndex((p) => norm(p.name) === n) : -1;
    if (i >= 0) out.set(m.id, left.splice(i, 1)[0]);
    else unmatched.push(m);
  }
  if (unmatched.length === 1 && left.length === 1 && !byNameOnly?.has(unmatched[0].id)) out.set(unmatched[0].id, left[0]);
  return out;
}
