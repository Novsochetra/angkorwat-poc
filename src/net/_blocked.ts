/**
 * Who this device has blocked (src/net/client.ts `block`; the plan's "Safety": "Block hides them for you for good").
 * Kept only on this device, in localStorage `angkor-nye-blocked`. Other players' device ids are never sent to a page,
 * so a block is keyed two ways:
 *
 * - by **server id** for this connection (`sid`: exact, at once, whatever their name; a new connection's welcome
 *   clears these, as the server gives the ids out again);
 * - by **name** for good (their checked name, lower-cased): the same name is hidden in later connections and nights.
 *   The server's hidden name ("Player", after reports) is never blocked by name, or everyone hidden would go too.
 *
 * Reporting someone hides them from the reporter at once too (by server id, for the connection).
 */

const KEY = 'angkor-nye-blocked';
/** The name the server shows for a hidden name (protocol.ts `PeerState.name`). */
export const HIDDEN_NAME = 'Player';

interface Kept {
  name: string;
  /** When blocked (ms since 1970). */
  at: number;
}

const names = new Set<string>();
const sids = new Set<number>();
const norm = (n: string) => n.trim().toLowerCase();

try {
  const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
  const list = raw ? (JSON.parse(raw) as Kept[]) : [];
  if (Array.isArray(list)) for (const k of list) if (k && typeof k.name === 'string') names.add(norm(k.name));
} catch {
  /* (nothing kept, or unreadable: none blocked) */
}

function save(): void {
  try {
    const at = Date.now();
    localStorage.setItem(KEY, JSON.stringify([...names].map((name) => ({ name, at }))));
  } catch {
    /* storage blocked: blocked for this page only */
  }
}

/** Block: hidden now (`sid`) and from now on (`name`, unless the hidden placeholder). */
export function blockPeer(sid: number, name: string): void {
  sids.add(sid);
  const n = norm(name);
  if (n && n !== norm(HIDDEN_NAME) && !names.has(n)) {
    names.add(n);
    save();
  }
}

/** Hide one server id for this connection only (a report). */
export function hideSid(sid: number): void {
  sids.add(sid);
}

/** A new connection: the server ids are given out again. */
export function newConnection(): void {
  sids.clear();
}

export function isBlocked(sid: number, name: string): boolean {
  return sids.has(sid) || (names.size > 0 && names.has(norm(name)));
}
