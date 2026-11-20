/**
 * The device's own id for the live rooms (src/net/client.ts): random, made once, kept in localStorage
 * `angkor-nye-id`. Sent only to our server in `hello` (never shown to other players, never in their `peers`).
 * The look seed (`PeerState.look`: the clothes the crowd model dresses other screens' copy of him in) comes from it,
 * so a player looks the same each night on every screen.
 */

const KEY = 'angkor-nye-id';

function make(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

let id: string | null = null;

/** This device's id (made and kept the first time; a fresh one each page when storage is blocked). */
export function deviceId(): string {
  if (id) return id;
  try {
    const kept = localStorage.getItem(KEY);
    if (kept && /^[0-9a-f]{16,64}$/.test(kept)) return (id = kept);
  } catch {
    /* storage blocked: a page-long id */
  }
  id = make();
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* (not kept) */
  }
  return id;
}

/** The look seed from the device id: a 31-bit number (FNV-1a), the same on every screen. */
export function deviceLook(): number {
  const s = deviceId();
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) & 0x7fffffff;
}
