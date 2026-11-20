/**
 * Party members this device blocked (the party list's Block, panel.ts; the plan's "Safety": "Block: mute for good").
 * Kept on this device only, in localStorage `angkor-party-blocked`, by their arcade player id (random, made on their
 * device: api.ts `playerId`): their voice is never played again here, in this party or any later one. Their name is
 * kept beside it only to say who it was. On the map, a blocked member is blocked as a player too (`NET.block`, by name
 * for good), once they are found there (index.ts).
 */

const KEY = 'angkor-party-blocked';

interface Kept {
  id: string;
  name: string;
  at: number;
}

const kept = new Map<string, Kept>();

try {
  const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
  const list = raw ? (JSON.parse(raw) as Kept[]) : [];
  if (Array.isArray(list)) for (const k of list) if (k && typeof k.id === 'string') kept.set(k.id, { id: k.id, name: String(k.name ?? ''), at: Number(k.at) || 0 });
} catch {
  /* (nothing kept, or unreadable: none blocked) */
}

export function partyBlocked(id: string): boolean {
  return kept.has(id);
}

export function blockMember(id: string, name: string): void {
  if (kept.has(id)) return;
  kept.set(id, { id, name, at: Date.now() });
  try {
    localStorage.setItem(KEY, JSON.stringify([...kept.values()]));
  } catch {
    /* storage blocked: blocked for this page only */
  }
}
