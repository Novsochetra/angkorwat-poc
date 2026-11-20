/**
 * The name check, on the server (docs/discussion/new-year-online.md "Names": checked on the device and again here).
 * The rules are the game's own, src/net/names.ts `checkName`, so both sides say the same. Until that module is there
 * (or if it cannot load in Node: it must import with `.ts` extensions and only plain TypeScript), a small stub below
 * stands in and the server says so in its log and in /health (`names: 'stub'`).
 */
import { LIMITS } from '../src/net/protocol.ts';

export type NameCheck = { ok: true; name: string } | { ok: false; reason: string };
type Check = (raw: string) => NameCheck;

/** Enough to keep the worst out while the shared list is missing: length, letters, no links or phone numbers, no staff names. */
const BLOCKED = ['admin', 'moderator', 'mod', 'staff', 'official', 'fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fag', 'rape', 'porn', 'sex', 'dick', 'pussy', 'whore', 'slut'];
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', $: 's', '!': 'i' };

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

export function stubCheckName(raw: string): NameCheck {
  if (typeof raw !== 'string') return { ok: false, reason: 'empty' };
  const name = raw.normalize('NFC').replace(/\s+/gu, ' ').trim();
  const letters = [...segmenter.segment(name)].length;
  if (letters < LIMITS.nameMin) return { ok: false, reason: 'short' };
  if (letters > LIMITS.nameMax) return { ok: false, reason: 'long' };
  if (!/^[\p{L}\p{M}\p{N} .'_-]+$/u.test(name)) return { ok: false, reason: 'letters' };
  if (/\d{4,}/u.test(name)) return { ok: false, reason: 'digits' };
  if (/(https?|www|\.com|\.net|\.org|\.kh)/iu.test(name)) return { ok: false, reason: 'link' };
  const flat = name
    .toLowerCase()
    .replace(/[0134578@$!]/gu, (ch) => LEET[ch] ?? ch)
    .replace(/[^\p{L}\p{M}]/gu, '');
  if (BLOCKED.some((w) => flat.includes(w))) return { ok: false, reason: 'rude' };
  return { ok: true, name };
}

let check: Check = stubCheckName;
let source: 'shared' | 'stub' = 'stub';
let why = '';
try {
  const mod = (await import('../src/net/names.ts')) as { checkName?: Check };
  if (typeof mod.checkName === 'function') {
    check = mod.checkName;
    source = 'shared';
  } else why = 'it has no checkName';
} catch (err) {
  why = String((err as Error).message).split('\n')[0];
}

/** Where the check comes from: the game's src/net/names.ts, or the stub. */
export const NAMES_SOURCE: 'shared' | 'stub' = source;
/** Why the stub is in use ('' when it is not). */
export const NAMES_STUB_WHY = why;

export function checkName(raw: unknown): NameCheck {
  if (typeof raw !== 'string' || raw.length > 200) return { ok: false, reason: 'empty' };
  try {
    return check(raw);
  } catch {
    return { ok: false, reason: 'error' };
  }
}
