/**
 * New Year's Eve online (AWP-35, docs/discussion/new-year-online.md "Names"): a player's name, checked the same way
 * on the device (the join card, ui/_join.ts, as it is typed) and again on the server (server/). Plain TypeScript with
 * no imports (no game, no DOM, no enums): Node runs it as it is (type stripping), Vite bundles it.
 *
 * A name is Latin or Khmer letters (and spaces, - '), 2–16 letters (`LIMITS.nameMin` / `nameMax` in protocol.ts;
 * Khmer's vowel signs and subscripts are marks, not letters). Refused, with a reason the card says in words:
 *
 * - `rude`: a rude word in English or Khmer, also spelled with look-alikes (4 → a, 3 → e, 0 → o, 1 → i or l,
 *   5 → s, @ → a, $ → s…), letters repeated (fuuuck), or spaces, dots and dashes between the letters (f.u.c.k);
 *   tried first, so `@sshole` is rude, not a handle;
 * - `link`: a web address or a handle (http, www, .com and the like, @name);
 * - `digits`: a run of 4 or more digits, spaces and dashes between them or not (a phone number), Khmer digits too;
 * - `staff`: a name that passes for the game's team (admin, moderator, staff, official, Angkor Heritage…);
 * - `letters`: anything but Latin or Khmer letters, spaces, hyphens and apostrophes (emoji, digits, other scripts);
 * - `short` / `long`: fewer than 2 or more than 16 letters.
 *
 * The word lists are below, a little scrambled (each entry reversed) so the file does not read as a list of
 * swear words. `node scripts/names-check.mjs` checks good and bad examples.
 */

export type NameReason = 'short' | 'long' | 'letters' | 'rude' | 'link' | 'digits' | 'staff';
export type NameCheck = { ok: true; name: string } | { ok: false; reason: NameReason };

/** Letters a name has at least and at most (protocol.ts `LIMITS.nameMin` / `nameMax`: kept the same). */
export const NAME_MIN = 2;
export const NAME_MAX = 16;
/** Characters a typed name may have at most before it is looked at (marks and spaces included). */
const RAW_MAX = 64;

// ── The lists (each word reversed) ─────────────────────────────────────────────────────────────────────────────

const rev = (s: string): string => [...s].reverse().join('');
const words = (s: string): string[] => s.split(' ').filter(Boolean).map(rev);

/**
 * English, matched anywhere in the name (also inside a longer word, letters run together): words that are in no
 * one's real name.
 */
const EN_ANY = words(
  'kcuf kcuhp kcvf tnuc hctib hctaib erohw tuls dratsab elohssa elohesra reggin aggin toggaf drater sinep anigav yssup odlid knaw tawt zzij ynroh ynnart ' +
    'reltih yttihs tihsllub bojwolb bojdnah rekcuskcoc tabrutsam elihpodep elihpodeap flim tsecni',
);
/**
 * English, matched only as a whole word of the name (or the whole name run together), with or without a plural s:
 * short words that hide inside real names (Cassandra, Hancock, Dickens, Yoshitaka, Analise, Nazira, Pornchai,
 * Therapist, Grape, Spicer, Essex).
 */
const EN_WORD = words('ssa esra kcid kcoc tihs muc tit stit kcirp nooc cips gaf ikap koog ekik knihc epar tsipar lana suna izan nrop xes syk regin ssip kuf kcf boob sboob eoh odep stnuc');
/**
 * Khmer (Khmer letters), matched anywhere: ចុយ and the vulgar word for a mother in curses, insults that call a person
 * a dog (a mad dog), a pig, a beast, an animal, stupid, mad, cursed, worthless, and a vulgar word for the body.
 */
const KM_ANY = words('យុច យារ្ម ែក្ឆាអ តួក្ឆែក្ឆ កូរ្ជាអ នាឆ្ចរិត វ្តសាអ ់ងង្ល តួក្ឆាអ ៃរ្ងច យូដ្ក យូត្ក ់សាច្ញកាអ');
/** The Khmer curses written in Latin letters (romanised): anywhere when long, else as a whole word. */
const KM_LATIN_ANY = words('iarmyohc eamyohc iamyohc eakhca eakhhca iargnohca kuorja yuodk');
const KM_LATIN_WORD = words('eakhc eakhhc iargnohc kurja gnognl yudk iarm');
/** Names that pass for the game's team, matched anywhere (letters run together)… */
const STAFF_ANY = words('nimda rotartsinimda rotaredom laiciffo egatirehrokgna repoleved retsamemag');
/** …and as a whole word only (Staffan, Modesto, Devi stay fine). */
const STAFF_WORD = words('ffats dom sdom ved mg renwo metsys troppus maet');
/** Khmer names that pass for the team: the game's name (មរតកអង្គរ), "the administrator", "the team". */
const STAFF_KM = words('រគ្ងអកតរម ងរ្គ់បរ្គកន្អ រាងរាកមុរ្ក');

// ── Folding a name for the lists ───────────────────────────────────────────────────────────────────────────────

/** Look-alikes for letters (two readings where it can be either: 1 → i or l). */
const LEET: Record<string, string> = { '4': 'a', '@': 'a', '3': 'e', '0': 'o', '5': 's', $: 's', '7': 't', '8': 'b', '9': 'g', '6': 'g', '2': 'z', '!': 'i', '+': 't', '€': 'e', '£': 'l', '¡': 'i' };
const ONE_AS = ['i', 'l'];

/** Latin letters without their accents (é → e, ñ → n), lower case. */
const plain = (s: string): string => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Each letter once where it is repeated (fuuuck → fuck), or twice at most (asssshole → asshole). */
const once = (s: string): string => s.replace(/(.)\1+/gu, '$1');
const twice = (s: string): string => s.replace(/(.)\1{2,}/gu, '$1$1');
/** A word with a letter twice in a row (asshole, boob): never matched against the each-letter-once form (ashole, Bob). */
const doubled = (w: string): boolean => /(.)\1/u.test(w);

/** A name in the forms the lists are matched against: as typed, letters twice at most, each letter once (`once`: only for words with no doubled letter). */
interface Forms {
  typed: string[];
  once: string[];
}

/**
 * The name as the Latin lists read it: lower case, accents off, look-alikes read as letters (1 and | both ways);
 * `tokens` its words (only their letters), `joined` all of it run together (f u c k, f.u.c.k: one word).
 */
function latinForms(raw: string): { tokens: Forms; joined: Forms } {
  const base = plain(raw);
  const tokens: Forms = { typed: [], once: [] };
  const joined: Forms = { typed: [], once: [] };
  const add = (to: Forms, w: string) => {
    if (!w) return;
    to.typed.push(w, twice(w));
    to.once.push(once(w));
  };
  for (const one of ONE_AS) {
    const read = [...base].map((c) => (c === '1' || c === '|' ? one : (LEET[c] ?? c))).join('');
    for (const w of read.split(/[\s_]+/)) add(tokens, w.replace(/[^a-z]/g, ''));
    add(joined, read.replace(/[^a-z]/g, ''));
  }
  return { tokens, joined };
}

/** A word of `list` is in the name somewhere. */
const inside = (f: Forms, list: readonly string[]): boolean => list.some((w) => f.typed.some((x) => x.includes(w)) || (!doubled(w) && f.once.some((x) => x.includes(w))));
/** A word of `list` (or it with an s) is a whole word of the name, or the whole name run together. */
const isWord = (t: Forms, j: Forms, list: readonly string[]): boolean =>
  list.some((w) => [...t.typed, ...j.typed].some((x) => x === w || x === `${w}s`) || (!doubled(w) && [...t.once, ...j.once].some((x) => x === w || x === `${w}s`)));

/** Khmer letters only (spaces, zero-width spaces, dots and dashes out). */
const khmerRun = (s: string): string => s.normalize('NFC').replace(/[^\u1780-\u17dd]/g, '');

// ── The check ──────────────────────────────────────────────────────────────────────────────────────────────────

/** Characters a name may have: Latin letters (and their accents), Khmer letters, vowels and signs (not its punctuation or digits), space, - and '. */
const ALLOWED = /^(?:\p{Script=Latin}|\p{M}|[\u1780-\u17d3\u17d7\u17dc\u17dd]|[ '\-])+$/u;
const LINK = /(?:https?|ftp)[:/]|www\.|:\/\/|\.(?:com|net|org|io|gg|me|kh|co|ly|xyz|tv|app|link|info|biz|site|online|shop|live|tk|ru|cn|us|uk)(?:\b|$)|(?:^|\s)@\S|discord|t\.me|wa\.me|youtube|tiktok|facebook|instagram|telegram/iu;
/** A run of 4 or more digits (Latin or Khmer), with spaces, dots, dashes or brackets between them or not. */
const DIGITS = /(?:[0-9\u17e0-\u17e9][\s.\-()+]*){4,}/u;

/** Spaces trimmed and one between words, zero-width spaces out, the curly apostrophe made straight, composed (NFC). */
export function tidy(raw: string): string {
  return String(raw ?? '')
    .normalize('NFC')
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '')
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Letters in a name (Khmer vowel signs and subscripts are marks: not counted). */
export const letterCount = (name: string): number => (name.match(/\p{L}/gu) ?? []).length;

/** A typed name checked: ok with the name as it will be shown (tidied), or why not. */
export function checkName(raw: string): NameCheck {
  const name = tidy(raw);
  if (!name) return { ok: false, reason: 'short' };
  if (name.length > RAW_MAX) return { ok: false, reason: 'long' };
  const { tokens, joined } = latinForms(name);
  const km = khmerRun(name);
  if (inside(joined, EN_ANY) || isWord(tokens, joined, EN_WORD) || inside(joined, KM_LATIN_ANY) || isWord(tokens, joined, KM_LATIN_WORD)) return { ok: false, reason: 'rude' };
  if (km && KM_ANY.some((w) => km.includes(w))) return { ok: false, reason: 'rude' };
  if (LINK.test(name)) return { ok: false, reason: 'link' };
  if (DIGITS.test(name)) return { ok: false, reason: 'digits' };
  if (inside(joined, STAFF_ANY) || isWord(tokens, joined, STAFF_WORD) || (km && STAFF_KM.some((w) => km.includes(w)))) return { ok: false, reason: 'staff' };
  // (and no pile of marks on one letter: a Khmer cluster has three at most, Latin one or two)
  if (!ALLOWED.test(name) || /\p{M}{4,}/u.test(name)) return { ok: false, reason: 'letters' };
  const n = letterCount(name);
  if (n < NAME_MIN) return { ok: false, reason: 'short' };
  if (n > NAME_MAX) return { ok: false, reason: 'long' };
  return { ok: true, name };
}

/** The reasons, in the order the check tries them (the card's words: lang.ts `nj<Reason>`). */
export const NAME_REASONS: readonly NameReason[] = ['rude', 'link', 'digits', 'staff', 'letters', 'short', 'long'];
