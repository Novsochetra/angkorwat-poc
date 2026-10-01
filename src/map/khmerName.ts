import { progress } from './progress';

/**
 * His name in Khmer letters (the name card: roam/_nameCard.ts): a name typed
 * in Latin letters written the way a Khmer speaker writes a name, plus a list
 * of common Khmer names, and the player's own name (kept between visits).
 * Pure: no three.js, no page (the URL is read once, if there is one).
 *
 * **Writing a name** (`khmerSpellings`): each word is looked up first (Khmer
 * names keep their Pali and Sanskrit spellings, which no rule can guess:
 * "Vanna" → វណ្ណា, "Rithy" → រិទ្ធី; and a few foreign names Khmer writers
 * always spell one way: "Peter" → ពីទ័រ). Otherwise it is read sound by
 * sound (`g2p`) into syllables, and each syllable is written with:
 *
 * - **the consonant of the series the vowel needs**: Khmer vowels sound one
 *   way after a first-series consonant and another after a second-series one
 *   (ា is /aː/ after ដ, /iə/ after ល), so "a" takes a first-series letter
 *   (ដា, ណា, ឡា) or a second-series one turned with ៉ (ម៉ា, រ៉ា, យ៉ា, វ៉ា),
 *   and "i" / "u" a second-series one or one turned with ៊ (លី, គី, ស៊ី, ប៊ូ);
 * - **the dependent vowel** for the sound (ូ ី េ ែ ៃ ៅ ៀ ើ ួ…), the
 *   inherent vowel in a closed syllable where Khmer writes none (John → ចន),
 *   ់ to shorten (Amanda → អាម៉ាន់ដា), ័រ for an English "-or" (Taylor → តេល័រ);
 * - **clusters with the coeng** (្): ក្រ, ស្ត, ដ្រ, ព្យ (Christopher →
 *   គ្រីស្តូហ្វើ, Pierre → ព្យែរ), and foreign sounds as Khmer writes them:
 *   f ហ្វ, g ហ្គ, z ហ្ស (Sophia → សូហ្វៀ, Hugo → ហ៊ូហ្គោ);
 * - **finals**: ៍ over a second final consonant (James → ជេមស៍), ក្ស for x.
 *
 * Readings: Khmer romanisation ("Sokha", "Sophea": o is ុ, ea is ា after a
 * second-series letter, ph ផ / ភ), Chinese pinyin (x ស៊, q ឈ, zh ច, iao ាវ,
 * ou ូវ: Xiao → ស៊ាវ, Zhou → ចូវ), Spanish (José → ហូសេ), and English
 * (a silent final e, -er ើ, magic e: Kate → ខេត). When a word could be read
 * more than one way the other readings are offered too (up to three spellings).
 *
 * **The player's name** (`playerName`, `onName`): `{ km, latin }`, kept in
 * map/progress.ts (`name.km`, `name.latin`); `name=<latin>` in the URL sets it
 * for that page without saving (shots).
 */

// ── Letters ────────────────────────────────────────────────────────────────

/** A consonant sound: its letter in the first series and in the second (a register sign where Khmer has no letter). */
const LETTERS = {
  k: ['ក', 'គ'],
  kh: ['ខ', 'ឃ'],
  g: ['ហ្គ', 'ហ្គ'],
  ng: ['ង៉', 'ង'],
  // (unaspirated: English j, pinyin zh / j, Khmer romanised ch)
  c: ['ច', 'ជ'],
  // (aspirated: English and pinyin ch, Khmer romanised chh, pinyin q)
  ch: ['ឆ', 'ឈ'],
  ny: ['ញ៉', 'ញ'],
  d: ['ដ', 'ឌ'],
  t: ['ត', 'ទ'],
  th: ['ថ', 'ធ'],
  n: ['ណ', 'ន'],
  b: ['ប', 'ប៊'],
  p: ['ប៉', 'ព'],
  ph: ['ផ', 'ភ'],
  f: ['ហ្វ', 'ហ្វ'],
  m: ['ម៉', 'ម'],
  y: ['យ៉', 'យ'],
  r: ['រ៉', 'រ'],
  l: ['ឡ', 'ល'],
  w: ['វ៉', 'វ'],
  s: ['ស', 'ស៊'],
  h: ['ហ', 'ហ៊'],
  z: ['ហ្ស', 'ហ្ស៊'],
  // (no consonant: a vowel's own onset)
  q: ['អ', 'អ៊'],
} as const;
type Cons = keyof typeof LETTERS;

/** In a cluster (under the coeng, or carrying one), the plain letter of each series. */
const PLAIN: Record<Cons, readonly [string, string]> = {
  k: ['ក', 'គ'],
  kh: ['ខ', 'ឃ'],
  g: ['ហ្គ', 'ហ្គ'],
  ng: ['ង', 'ង'],
  c: ['ច', 'ជ'],
  ch: ['ឆ', 'ឈ'],
  ny: ['ញ', 'ញ'],
  d: ['ដ', 'ឌ'],
  t: ['ត', 'ទ'],
  th: ['ថ', 'ធ'],
  n: ['ណ', 'ន'],
  b: ['ប', 'ប'],
  p: ['ប', 'ព'],
  ph: ['ផ', 'ភ'],
  f: ['ហ្វ', 'ហ្វ'],
  m: ['ម', 'ម'],
  y: ['យ', 'យ'],
  r: ['រ', 'រ'],
  l: ['ល', 'ល'],
  w: ['វ', 'វ'],
  s: ['ស', 'ស'],
  h: ['ហ', 'ហ'],
  z: ['ហ្ស', 'ហ្ស'],
  q: ['អ', 'អ'],
};

/** The series a consonant takes before a vowel that sounds the same after either (េ ែ ៀ ួ): the usual letter for the sound. */
const NATURAL: Record<Cons, 0 | 1> = {
  k: 0, kh: 0, g: 1, ng: 1, c: 1, ch: 0, ny: 1, d: 0, t: 0, th: 0, n: 0, b: 0, p: 1, ph: 0, f: 0, m: 1, y: 1, r: 1, l: 1, w: 1, s: 0, h: 0, z: 0, q: 0,
};

/** Under the coeng these keep the head's series (sonorants); the others give theirs. */
const SONORANT: ReadonlySet<Cons> = new Set<Cons>(['r', 'l', 'y', 'w', 'm', 'n', 'ng', 'ny']);

/** A final consonant (no vowel after it). */
const FINAL: Record<Cons, string> = {
  k: 'ក', kh: 'ក', g: 'គ', ng: 'ង', c: 'ច', ch: 'ច', ny: 'ញ', d: 'ដ', t: 'ត', th: 'ត', n: 'ន', b: 'ប', p: 'ព', ph: 'ហ្វ', f: 'ហ្វ', m: 'ម', y: 'យ', r: 'រ', l: 'ល', w: 'វ', s: 'ស', h: '', z: 'ស', q: '',
};

/**
 * A vowel sound: its sign (empty: the inherent vowel) and the series it
 * needs (0 first, 1 second, -1 either). `ea` is the Khmer romanisation's ea
 * (ា after a second-series letter: ភា, ធា); `oI` the inherent vowel in a
 * closed syllable (John → ចន); `eS` `iS` `oS` `uS` short (ិ ិ ុ ុ).
 */
const VOWELS = {
  a: ['ា', 0],
  ea: ['ា', 1],
  e: ['េ', -1],
  eS: ['ិ', 0],
  ɛ: ['ែ', -1],
  i: ['ី', 1],
  iS: ['ិ', 1],
  ey: ['ី', 0],
  o: ['ូ', 0],
  oS: ['ុ', 0],
  oI: ['', 0],
  u: ['ូ', 1],
  uS: ['ុ', 1],
  ə: ['ើ', 1],
  ɨ: ['ឺ', 1],
  ai: ['ៃ', 0],
  au: ['ៅ', 0],
  ia: ['ៀ', -1],
  ua: ['ួ', -1],
  ɨə: ['ឿ', -1],
  ou: ['ូវ', 0],
  iu: ['ីវ', 1],
  ui: ['ួយ', -1],
  iao: ['ាវ', 1],
  or: ['័រ', 1],
  oi: ['យ', 0],
} as const;
type Vow = keyof typeof VOWELS;

type Tok = { c: Cons; v?: undefined } | { v: Vow; c?: undefined };
interface Syl {
  on: Cons[];
  v: Vow;
  co: Cons[];
  /** Its onset is a glide between two vowels (y after i: Daniel យ៉ែល), not a consonant of the name. */
  glide?: boolean;
}

// ── Readings ───────────────────────────────────────────────────────────────

/** How a word is read (the guess; the other ways give the other spellings). */
interface Reading {
  /** Khmer romanisation (Sokha, Sophea, Pisey). */
  khmer: boolean;
  pinyin: boolean;
  spanish: boolean;
  /** A final e after one consonant is silent (English, French): Kate, Nicole. */
  silentE: boolean;
  /** The other usual choices: -er as ័រ, -an as ាន់, ia as ីយ៉ា, au as ៅ, initial t as ថ. */
  alt: boolean;
}

const KHMER = /[ក-៿᧠-᧿]/;
/** Some Khmer letters in it. */
export const isKhmer = (s: string): boolean => KHMER.test(s);

/** One word in lower case, accents folded (é stays: it is said; è ê ë: ɛ; ñ stays). */
function fold(w: string): string {
  return w
    .toLowerCase()
    .replace(/[àáâãäåā]/g, 'a')
    .replace(/[èêëē]/g, 'è')
    .replace(/[ìíîïī]/g, 'i')
    .replace(/[òóôõöøō]/g, 'o')
    .replace(/[ùúûüū]/g, 'u')
    .replace(/[ýÿ]/g, 'y')
    .replace(/ç/g, 's')
    .replace(/ß/g, 'ss')
    .replace(/[œæ]/g, 'e')
    .replace(/[^a-zéèñ]/g, '');
}

/** Pinyin syllables (an initial, a final). */
const PINYIN = /^(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?(?:iang|iong|uang|ang|eng|ing|ong|ian|iao|uai|uan|ai|ei|ao|ou|an|en|in|un|ia|ie|iu|ua|uo|ui|er|a|o|e|i|u|v)/;
/** What only pinyin has (else a name that happens to split into pinyin syllables, Anna or Maria, is read as it is). */
const PINYIN_ONLY = /^(?:[xq]|zh)|ng$|ao|ou|ui|iu|uo|ian|iao|ie$/;

/**
 * A syllable pinyin has: j q x only before i or ü; g k h f w never before i,
 * zh ch sh z c s r only before a bare i; o alone only after b p m f (Diego,
 * Marie are no pinyin).
 */
function pinyinOk(s: string): boolean {
  const m = /^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?(.*)$/.exec(s)!;
  const ini = m[1] ?? '';
  const fin = m[2];
  if (/^[jqx]$/.test(ini) && !/^[iu]/.test(fin)) return false;
  if (/^[gkhfw]$/.test(ini) && fin.startsWith('i')) return false;
  if (/^(zh|ch|sh|[zcsr])$/.test(ini) && fin.startsWith('i') && fin !== 'i') return false;
  if (fin === 'o' && ini && !/^[bpmfwy]$/.test(ini)) return false;
  return true;
}

/** The word splits into pinyin syllables, at least one only pinyin has (x, q, zh, -ng, ao, ou…). */
function isPinyin(w: string): boolean {
  // (every way to split it: a longest-first split can cut a final short, "xian" → "xi" + "an")
  const memo = new Map<number, boolean>();
  const go = (i: number, clue: boolean): boolean => {
    if (i === w.length) return clue;
    const key = i * 2 + (clue ? 1 : 0);
    const seen = memo.get(key);
    if (seen !== undefined) return seen;
    let ok = false;
    for (let j = Math.min(w.length, i + 6); j > i && !ok; j--) {
      const s = w.slice(i, j);
      const m = PINYIN.exec(s);
      if (!m || m[0] !== s) continue;
      if (!pinyinOk(s)) continue;
      ok = go(j, clue || PINYIN_ONLY.test(s));
    }
    memo.set(key, ok);
    return ok;
  };
  return w.length > 1 && w.length <= 12 && go(0, false);
}

/** Khmer romanisation: kh, chh, oeu, ea before a consonant or at the end, sr-, So + a consonant + a/ea/u/e/o (Sokha, Sophea, not Sophia). */
function isKhmerRoman(w: string): boolean {
  return /kh|chh|oeu|ea(?![aeiou])|^sr[eo]|^so(?:kh|ph|th|ch|v|k|t|p|c)(?:ea|a|u|e|o)|^(?:rith|vann|pis|chan[dt]h|sreyn|sovan)/.test(w) && !/^(?:sean|dean|jean|leah|andrea|thea)$/.test(w);
}

// ── Sounds ─────────────────────────────────────────────────────────────────

const VOWEL_LETTER = /[aeiouéèy]/;

/**
 * The sounds of one word (folded), in order: consonants and vowels. The
 * longest spelling first (ichael, ierre, iao, ng…), with the reading's rules.
 */
function g2p(w: string, r: Reading, mono: boolean): Tok[] {
  const out: Tok[] = [];
  const n = w.length;
  const C = (...cs: Cons[]) => {
    for (const c of cs) out.push({ c });
  };
  const V = (v: Vow) => out.push({ v });
  const isV = (i: number) => i >= 0 && i < n && /[aeiouéè]/.test(w[i]);
  const isVy = (i: number) => i >= 0 && i < n && VOWEL_LETTER.test(w[i]);
  // A silent final e (and -es): after one consonant (or a doubled one), with a vowel before it.
  const tail = /([aeiouy])([bcdfgklmnprstvz]|ll|rr|nn|tt|ss|ck|r[lnmdtk])(e)(s?)$/.exec(w);
  const silentAt = r.silentE && tail && !r.spanish && n >= 3 ? n - 1 - tail[4].length : -1;
  // (and the vowel before it, long: a_e ei, i_e i (ike, ive, y_e: ai), o_e o, u_e u, e_e i)
  const magicAt = silentAt >= 0 && tail && tail[2].length === 1 && !isV(silentAt - 3) ? silentAt - 2 : -1;
  let i = 0;
  while (i < n) {
    const ch = w[i];
    const rest = w.slice(i);
    const next = w[i + 1] ?? '';
    const atEnd = (k: number) => i + k >= n;
    if (i === silentAt) {
      i++;
      continue;
    }
    // ── Vowels ──
    if (/[aeiouéèy]/.test(ch) && !(ch === 'y' && (i === 0 || isV(i - 1)) && isV(i + 1))) {
      if (i === magicAt) {
        const after = w[i + 1];
        if (ch === 'a') V(w[i - 1] === 'i' ? 'a' : 'e');
        else if (ch === 'i') V(after === 'k' || after === 'v' ? 'ai' : 'i');
        else if (ch === 'y') V('ai');
        else if (ch === 'o') V('o');
        else if (ch === 'u') V('u');
        else if (ch === 'e') V('i');
        else V('e');
        i++;
        continue;
      }
      // (Michael: "ichael" is /aɪkəl/)
      if (rest.startsWith('ichael')) {
        V('ai');
        C('kh');
        V('ə');
        C('l');
        i += 6;
        continue;
      }
      // (Pierre: the i is a y gliding into the è)
      if (/^ie(?:rre?|re)$/.test(rest) && i > 0) {
        C('y');
        V('ɛ');
        C('r');
        i = n;
        continue;
      }
      if (r.khmer) {
        if (rest.startsWith('oeu')) {
          V('ɨə');
          i += 3;
          continue;
        }
        if (rest.startsWith('ea')) {
          V('ea');
          i += 2;
          continue;
        }
        if (rest.startsWith('ey') && !isV(i + 2)) {
          V('ey');
          i += 2;
          continue;
        }
        if (rest.startsWith('ou') || rest.startsWith('oo')) {
          V('u');
          i += 2;
          continue;
        }
        if (rest.startsWith('aa')) {
          V('a');
          i += 2;
          continue;
        }
        if (ch === 'o') {
          V(atEnd(1) ? 'o' : 'oS');
          i++;
          continue;
        }
        if (ch === 'i' || (ch === 'y' && !atEnd(1))) {
          // (short in a closed syllable or before another: Pisey ពិ, Visal វិ, Narin រិន; long at the end: Rithy ធី)
          V(atEnd(1) ? 'i' : 'iS');
          i++;
          continue;
        }
        if (ch === 'e') {
          // (Chenda ចិន្តា: a closed e is short; open, េ)
          V(!isVy(i + 1) && i + 1 < n && !isVy(i + 2) ? 'eS' : 'e');
          i++;
          continue;
        }
        if (ch === 'u') {
          V(isVy(i + 1) || atEnd(1) ? 'u' : 'uS');
          i++;
          continue;
        }
      }
      if (r.pinyin) {
        const m = /^(iang|iao|ian|uang|uan|ong|iu|ui|uo|ie|ou|ao|ai|ei|ia|ua)/.exec(rest);
        if (m) {
          const s = m[1];
          if (s === 'iang') (V('ea'), C('ng'));
          else if (s === 'iao') V('iao');
          else if (s === 'ian') (V('ea'), C('n'));
          else if (s === 'uang') (V('ua'), C('ng'));
          else if (s === 'uan') (V('ua'), C('n'));
          else if (s === 'ong') (V('oS'), C('ng'));
          else if (s === 'iu') V('iu');
          else if (s === 'ui') V('ui');
          else if (s === 'uo') V('ua');
          else if (s === 'ie') V('ia');
          else if (s === 'ou') V('ou');
          else if (s === 'ao') V('au');
          else if (s === 'ai') V('ai');
          else if (s === 'ei') V('e');
          else if (s === 'ia') V('ea');
          else V('ua');
          i += s.length;
          continue;
        }
        if (rest.startsWith('eng')) {
          V('e');
          C('ng');
          i += 3;
          continue;
        }
        if (rest.startsWith('un')) {
          V('uS');
          i++;
          continue;
        }
      }
      // ── English, French, Spanish, Japanese, Korean… ──
      // (Korean: eo before a final consonant ោ-less inherent, Seo-yeon យ៉ន, Jeong; eu ឺ, Ha-eun អ៊ឺន)
      if (/^eo(?:ng|n|k|m|l|p)$/.test(rest) && i > 0 && /[yjshgbc]/.test(w[i - 1])) {
        // (Jeong ជុង)
        V(rest === 'eong' ? 'uS' : 'oI');
        i += 2;
        continue;
      }
      if (/^eu(?:n|m|l)$/.test(rest)) {
        V('ɨ');
        i += 2;
        continue;
      }
      if (rest.startsWith('eau')) {
        V('o');
        i += 3;
        continue;
      }
      if (/^(ou|oo)/.test(rest)) {
        V('u');
        i += 2;
        continue;
      }
      if (rest.startsWith('ee')) {
        V('i');
        i += 2;
        continue;
      }
      if (rest.startsWith('ea')) {
        // (Dean ឌីន; at the end two sounds: Andrea ដ្រេអា)
        if (atEnd(2) || (i + 2 < n && w[i + 2] === 'h' && atEnd(3))) {
          V('e');
          V('a');
        } else V('i');
        i += 2;
        continue;
      }
      if (/^a[iy](?![aeiou])/.test(rest)) {
        // (Claire ក្លែរ, Taylor តេ, Aiden អេ, Kai កៃ)
        if (w[i + 2] === 'r') V('ɛ');
        else if (ch === 'a' && next === 'i' && i > 0 && /^ai[lns]$/.test(rest)) V('e');
        else if (ch === 'a' && next === 'y') V('e');
        else if (/^ai[dn]/.test(rest) && i === 0) V('e');
        else V('ai');
        i += 2;
        continue;
      }
      if (/^e[iy](?![aeiou])/.test(rest)) {
        // (Mickey ឃី at the end; Neymar ណេ inside)
        V(atEnd(2) && next === 'y' ? 'i' : 'e');
        i += 2;
        continue;
      }
      if (/^o[iy]/.test(rest) && !isV(i + 2)) {
        // (French oi before a consonant: Antoine ត្វាន; else Choi ឆយ, Troy ត្រយ)
        if (next === 'i' && i + 2 < n && i > 0) {
          C('w');
          V('a');
        } else V('oi');
        i += 2;
        continue;
      }
      if (/^a[uw]/.test(rest)) {
        // (Paul ប៉ូល, Laura ឡូរ៉ា, Shawn សន; the other way: ៅ)
        V(r.alt && w[i + 2] !== 'l' ? 'au' : 'o');
        i += 2;
        continue;
      }
      if (rest.startsWith('ow')) {
        V(atEnd(2) ? 'o' : 'au');
        // (Howard: the w starts the next syllable)
        i += isV(i + 2) ? 1 : 2;
        if (isV(i + 1) && w[i] === 'w') {
          C('w');
          i++;
        }
        continue;
      }
      if (rest.startsWith('ew')) {
        V('u');
        i += 2;
        continue;
      }
      if (rest.startsWith('igh')) {
        V('ai');
        i += 3;
        continue;
      }
      if (/^ie$/.test(rest) && i > 0) {
        // (Julie ជូលី, Sophie សូហ្វី, Marie ម៉ារី)
        V('i');
        i = n;
        continue;
      }
      if (/^oe$/.test(rest)) {
        // (Joe ចូ; Chloe ក្លូអ៊ី, Zoe ហ្សូអ៊ី)
        V('o');
        if (!mono) V('i');
        i = n;
        continue;
      }
      if (/^ae$/.test(rest)) {
        V('e');
        i = n;
        continue;
      }
      if (/^ia/.test(rest) && !r.alt && !(i > 0 && w[i - 1] === 'r' && atEnd(2))) {
        // (Sophia សូហ្វៀ, William វីលៀម, Mia មៀ; Maria ម៉ារីយ៉ា: -ria at the end, and the other way, ីយ៉ា)
        V('ia');
        i += 2;
        continue;
      }
      if (rest.startsWith('aa')) {
        V('a');
        i += 2;
        continue;
      }
      if (/^ue$/.test(rest) && i > 0) {
        V('u');
        i = n;
        continue;
      }
      // (Edward, Howard: an English -ward is វើដ)
      if (/^ar(?:d|ds)?$/.test(rest) && i > 0 && w[i - 1] === 'w' && !mono) {
        V('ə');
        i += 2;
        continue;
      }
      // R after a vowel: -er, -ir, -ur ើ (Oliver អូលីវើ, Arthur អាធើ), -or ័រ, -ar ា before a consonant (Carlos កាឡូស).
      if (/^[aeiou]r(?![aeiouyr])/.test(rest) && (i > 0 || ch === 'a')) {
        // (Spanish vowels stay as they are and the r is said: Javier ហាវីយ៉ែរ, Fernando ហ្វែរ)
        if (r.spanish) {
          V(ch === 'e' ? 'ɛ' : ch === 'o' ? 'o' : ch === 'u' ? 'u' : ch === 'i' ? 'i' : 'a');
          C('r');
          i += 2;
          continue;
        }
        if (ch === 'e' || ch === 'i' || ch === 'u') V(ch === 'e' && r.alt && atEnd(2) ? 'or' : 'ə');
        else if (ch === 'o') V('or');
        else if (atEnd(2)) {
          V('a');
          C('r');
        } else V('a');
        i += 2;
        continue;
      }
      if (ch === 'a') {
        // (Jack ជែក)
        V(rest.startsWith('ack') ? 'ɛ' : 'a');
        i++;
        continue;
      }
      if (ch === 'é') {
        V('e');
        i++;
        continue;
      }
      if (ch === 'è') {
        V('ɛ');
        i++;
        continue;
      }
      if (ch === 'e') {
        // (Emma អិមម៉ា: a short e before a doubled m or n at the start)
        if (i === 0 && /^e(mm|nn)/.test(rest)) V('eS');
        // (Daniel យ៉ែល, Isabel បែល, Manuel អែល: a final el)
        else if (rest === 'el') V('ɛ');
        // (Alex ឡិក្ស, Rebecca: e before x or a doubled consonant that closes it)
        else if (next === 'x') V('iS');
        else V('e');
        i++;
        continue;
      }
      if (ch === 'i' || ch === 'y') {
        // (Mickey មិក, Victor វិក; Kyle, Tyler ៃ; Ryan រ៉ាយ៉ាន)
        if (ch === 'y' && isV(i + 1)) {
          // (Ryan, Bryan រ៉ាយ៉ាន; Kyoto, Hyun: a cluster ក្យូ, ហ្យុ)
          if (next === 'a' && w[i - 1] === 'r') {
            V('a');
            C('y');
          } else C('y');
        } else if (/^[iy](ck|ct|cc|tt|pp|x)/.test(rest)) V('iS');
        else if (ch === 'y' && /^yl/.test(rest) && !atEnd(2)) V('ai');
        else V('i');
        i++;
        continue;
      }
      if (ch === 'o') {
        // (John ចន, Tom ថម, Bob បប, Josh ចស: one syllable, one consonant after it (not s or l: Carlos, Paul))
        if (mono && /^oh?(?:[bcdgkmnpt]|bb|dd|mm|nn|pp|tt|sh|ch|th)$/.test(rest)) V('oI');
        // (Jason សុន, Simon ម៉ុន: a last syllable "on" after another)
        else if (!mono && /^on$/.test(rest)) V('oS');
        else if (/^o(ck|ng)/.test(rest)) V('oS');
        else V('o');
        i++;
        continue;
      }
      if (ch === 'u') {
        // (Justin ចា, Hunter ហាន់: the English u before two consonants; Jun ជុន, Jung ជុង)
        if (!r.spanish && /^u(st|nt|ck|nk|mp|ff|tt|dd|gg|mm|pp)/.test(rest) && i > 0) V('a');
        else if (/^u(n|m|ng)$/.test(rest)) V('uS');
        else V('u');
        i++;
        continue;
      }
      i++;
      continue;
    }
    // ── Consonants ──
    if (ch === 'y') {
      C('y');
      i++;
      continue;
    }
    if (ch === 'h') {
      // (after a vowel, before a consonant or at the end: silent — Sarah, John)
      if (i > 0 && isVy(i - 1) && !isVy(i + 1)) {
        i++;
        continue;
      }
      C('h');
      i++;
      continue;
    }
    if (ch === 'c') {
      if (rest.startsWith('chh')) {
        C('ch');
        i += 3;
        continue;
      }
      if (rest.startsWith('ch')) {
        if (/^ch[rl]/.test(rest)) C('k');
        else if (/^chel/.test(rest) && i > 0) C('s');
        else if (r.khmer) C('c');
        else C('ch');
        i += 2;
        continue;
      }
      if (rest.startsWith('ck')) {
        // (Mickey មិកឃី: closes the short vowel and starts the next)
        if (isVy(i + 2)) C('k', 'kh');
        else C('k');
        i += 2;
        continue;
      }
      if (/^cc[eiy]/.test(rest)) {
        C('k', 's');
        i += 2;
        continue;
      }
      if (rest.startsWith('cc')) {
        C('k');
        i += 2;
        continue;
      }
      if (r.pinyin) {
        C('ch');
        i++;
        continue;
      }
      C(/^c[eiyé]/.test(rest) ? 's' : 'k');
      i++;
      continue;
    }
    if (ch === 'k') {
      if (rest.startsWith('kh')) {
        C('kh');
        i += 2;
        continue;
      }
      if (/^kn/.test(rest) && i === 0) {
        i++;
        continue;
      }
      C(r.pinyin ? 'kh' : 'k');
      i += rest.startsWith('kk') ? 2 : 1;
      continue;
    }
    if (ch === 'p') {
      if (rest.startsWith('ph')) {
        C(r.khmer ? 'ph' : 'f');
        i += 2;
        continue;
      }
      C(r.pinyin ? 'ph' : 'p');
      i += rest.startsWith('pp') ? 2 : 1;
      continue;
    }
    if (ch === 't') {
      if (rest.startsWith('th')) {
        C('th');
        i += 2;
        continue;
      }
      if (rest.startsWith('tch')) {
        C('c');
        i += 3;
        continue;
      }
      if (/^ts[uü]/.test(rest)) {
        // (Japanese tsu: Mitsubishi, Tsubasa ស៊ូ)
        C('s');
        i += 2;
        continue;
      }
      // (English one-syllable names start with an aspirated t: Tom ថម, Tim ធីម)
      C(r.pinyin || (i === 0 && mono && isVy(i + 1) && !r.khmer && !r.spanish) ? 'th' : 't');
      i += rest.startsWith('tt') ? 2 : 1;
      continue;
    }
    if (ch === 'd') {
      if (rest.startsWith('dh')) {
        C('th');
        i += 2;
        continue;
      }
      if (/^dge/.test(rest)) {
        C('c');
        i += 2;
        continue;
      }
      C('d');
      i += rest.startsWith('dd') ? 2 : 1;
      continue;
    }
    if (ch === 'b') {
      C(rest.startsWith('bh') ? 'ph' : 'b');
      i += rest.startsWith('bh') || rest.startsWith('bb') ? 2 : 1;
      continue;
    }
    if (ch === 'g') {
      if (rest.startsWith('gh')) {
        C('g');
        i += 2;
        continue;
      }
      if (/^gn/.test(rest) && i === 0) {
        i++;
        continue;
      }
      if (/^gu[eiéè]/.test(rest)) {
        // (Miguel ហ្គែល: the u is silent)
        C('g');
        i += 2;
        continue;
      }
      if (r.pinyin) {
        C('k');
        i++;
        continue;
      }
      // (a soft g before e, i, y: George, Gina, Angela; Spanish: Jorge's h)
      if (/^g[eiyé]/.test(rest) && !/^ge[tr]/.test(rest)) C(r.spanish ? 'h' : 'c');
      else C('g');
      i += rest.startsWith('gg') ? 2 : 1;
      continue;
    }
    if (ch === 'j') {
      C(r.spanish ? 'h' : 'c');
      i++;
      continue;
    }
    if (ch === 'q') {
      if (r.pinyin) {
        C('ch');
        i++;
        continue;
      }
      if (rest.startsWith('qu')) {
        // (que, qui: k; qua, quo, Quinn: kw)
        C('k');
        if (!/^qu[eiéè]/.test(rest) || /^quinn?/.test(rest)) C('w');
        i += 2;
        continue;
      }
      C('k');
      i++;
      continue;
    }
    if (ch === 'x') {
      if (i === 0 || r.pinyin) C('s');
      else C('k', 's');
      i++;
      continue;
    }
    if (ch === 'z') {
      if (rest.startsWith('zh')) {
        C('c');
        i += 2;
        continue;
      }
      // (Lopez ស at the end; pinyin z ច; else ហ្ស)
      if (atEnd(1) && i > 0) C('s');
      else if (r.pinyin) C('c');
      else C('z');
      i += rest.startsWith('zz') ? 2 : 1;
      continue;
    }
    if (ch === 's') {
      if (rest.startsWith('sch')) {
        C('s');
        i += 3;
        continue;
      }
      if (rest.startsWith('sh')) {
        C('s');
        i += 2;
        continue;
      }
      if (/^sc[eiy]/.test(rest)) {
        C('s');
        i += 2;
        continue;
      }
      C('s');
      i += rest.startsWith('ss') ? 2 : 1;
      continue;
    }
    if (ch === 'n') {
      if (rest.startsWith('ng') && !/^ng[eiy]/.test(rest)) {
        C('ng');
        i += 2;
        continue;
      }
      if (rest.startsWith('nh') || (rest.startsWith('ny') && (i === 0 || r.khmer || r.spanish) && isV(i + 2))) {
        C('ny');
        i += 2;
        continue;
      }
      if (rest.startsWith('nn')) {
        // (Anna អាណា after a; Jennifer ជេននី, Kenny: closed and opened after the others)
        if (i > 0 && w[i - 1] !== 'a' && isVy(i + 2)) C('n', 'n');
        else C('n');
        i += 2;
        continue;
      }
      C('n');
      i++;
      continue;
    }
    if (ch === 'ñ') {
      C('ny');
      i++;
      continue;
    }
    if (ch === 'm') {
      if (rest.startsWith('mm')) {
        if (i > 0 && isVy(i + 2)) C('m', 'm');
        else C('m');
        i += 2;
        continue;
      }
      C('m');
      i++;
      continue;
    }
    if (ch === 'l') {
      if (rest.startsWith('ll') && r.spanish && isV(i + 2)) {
        C('y');
        i += 2;
        continue;
      }
      C('l');
      i += rest.startsWith('ll') ? 2 : 1;
      continue;
    }
    if (ch === 'r') {
      C('r');
      i += rest.startsWith('rr') || rest.startsWith('rh') ? 2 : 1;
      continue;
    }
    if (ch === 'w') {
      C(rest.startsWith('wh') ? 'w' : 'w');
      i += rest.startsWith('wh') ? 2 : 1;
      continue;
    }
    if (ch === 'v') {
      C('w');
      i++;
      continue;
    }
    if (ch === 'f') {
      C('f');
      i += rest.startsWith('ff') ? 2 : 1;
      continue;
    }
    i++;
  }
  return out;
}

// ── Syllables ──────────────────────────────────────────────────────────────

/** Onsets Khmer writes as one cluster (the second under the coeng). */
function onsetOk(cs: readonly Cons[], start: boolean): boolean {
  if (cs.length <= 1) return true;
  if (cs.length > 3) return false;
  const [a, b, c] = cs;
  const liquid = (x: Cons) => x === 'r' || x === 'l';
  const stop = (x: Cons) => ['k', 'kh', 'g', 'p', 'b', 't', 'd', 'th', 'ph', 'f', 'c', 'ch'].includes(x);
  if (cs.length === 3) return a === 's' && (b === 't' || b === 'k' || b === 'p') && liquid(c);
  if (stop(a) && liquid(b) && !((a === 't' || a === 'd') && b === 'l')) return true;
  if (a === 's' && ['k', 't', 'p', 'm', 'n', 'l', 'w', 'th'].includes(b)) return true;
  // (ky, py: Kyoto ក្យូ, Pierre ព្យែរ; kw, sw, tw only at the start: Quinn, not Edward)
  if (b === 'y' && (stop(a) || (start && ['h', 'm', 'n', 'r', 'l'].includes(a)))) return true;
  if (b === 'w' && (a === 'k' || a === 's' || a === 't' || a === 'g')) return true;
  return false;
}

/** Group the sounds into syllables; two vowels side by side get an onset (y after i: Maria រីយ៉ា; else អ: Noah ណូអា). */
function syllables(toks: readonly Tok[]): Syl[] {
  const out: Syl[] = [];
  let cons: Cons[] = [];
  for (const t of toks) {
    if (t.c) {
      cons.push(t.c);
      continue;
    }
    const v = t.v!;
    const prev = out[out.length - 1];
    let on: Cons[];
    if (!prev) on = cons;
    else if (!cons.length) on = [prev.v === 'i' || prev.v === 'iS' ? (v === 'a' || v === 'o' || v === 'u' || v === 'ɛ' || v === 'ia' ? 'y' : 'q') : 'q'];
    else {
      // The longest onset that is a cluster; the rest closes the syllable before.
      let k = Math.min(3, cons.length);
      while (k > 1 && !onsetOk(cons.slice(cons.length - k), false)) k--;
      prev.co.push(...cons.slice(0, cons.length - k));
      on = cons.slice(cons.length - k);
    }
    // (the first: two consonants are written as a cluster whatever they are (Dmitri ឌ្មី); more keep the last cluster)
    if (!prev && on.length > 2 && !onsetOk(on, true)) on = on.slice(-2);
    out.push({ on: on.length ? on : ['q'], v, co: [], glide: !!prev && !cons.length });
    cons = [];
  }
  if (out.length && cons.length) out[out.length - 1].co.push(...cons);
  return out;
}

// ── Writing ────────────────────────────────────────────────────────────────

/** One syllable in Khmer letters. */
function write(s: Syl, last: boolean, r: Reading): string {
  let v: Vow = s.v;
  let [sign, need] = VOWELS[v] as readonly [string, number];
  const head = s.on[0];
  // Which series: the vowel's, else the consonant's own.
  // (the glide between i and e is យ៉: Daniel ដានីយ៉ែល; a Spanish p is ប៉: López ឡូប៉េស)
  let series: 0 | 1 = need === -1 ? (s.glide || (head === 'p' && r.spanish) ? 0 : NATURAL[head]) : (need as 0 | 1);
  // (ហ្គ is second series: its o is ោ)
  if (head === 'g' && s.on.length === 1 && (v === 'o' || v === 'oS')) sign = 'ោ';
  let on: string;
  if (s.on.length === 1) on = LETTERS[head][series];
  else {
    // A cluster: the series comes from the head when the one under it is a sonorant (ក្រ, ព្យ), else from that one (ស្ក, ស្ទ).
    const subs = s.on.slice(1);
    const fromSub = !SONORANT.has(subs[0]);
    const hs = fromSub ? NATURAL[head] : series;
    on = PLAIN[head][hs] + subs.map((c, k) => '្' + PLAIN[c][k === 0 && fromSub ? series : NATURAL[c]]).join('');
  }
  // The finals.
  const co = s.co.filter((c) => FINAL[c] !== '');
  let fin = '';
  if (co.length === 1) fin = FINAL[co[0]];
  else if (co.length >= 2) {
    const [a, b] = co;
    if (a === 'k' && b === 's') fin = 'ក្ស';
    else if (a === 's' && (b === 't' || b === 'd')) fin = 'ស្ទ';
    else if (a === 'n' && b === 'g') fin = 'ង';
    else fin = FINAL[a] + FINAL[b] + '៍';
  }
  // Short and closed: ា + a nasal or l + ់ inside a name (Amanda ម៉ាន់, Alvin អាល់), -al at its end (Pascal កាល់), -an the other way (Jordan ដាន់).
  if (v === 'a' && co.length === 1) {
    const c = co[0];
    if (c === 'm' && !last) return on + 'ាំ';
    if ((c === 'n' || c === 'l') && (!last || c === 'l' || r.alt)) fin += '់';
  }
  if (v === 'ai' && co.length) fin += fin.endsWith('៍') ? '' : '៍';
  if (v === 'oi') return on + 'យ' + fin;
  if (v === 'or') return on + '័រ' + (co.length && co[0] !== 'r' ? fin + (fin.endsWith('៍') ? '' : '៍') : '');
  return on + sign + fin;
}

/** One word's spelling by the rules (a reading). */
function spellWord(w: string, r: Reading): string {
  const toks = g2p(w, r, isMono(w));
  const syl = syllables(toks);
  if (!syl.length) return toks.map((t) => (t.c ? FINAL[t.c] : '')).join('');
  return syl.map((s, k) => write(s, k === syl.length - 1, r)).join('');
}

/** One vowel group (one syllable to the ear): John, Kim, Tom, Grace, James. */
function isMono(w: string): boolean {
  const groups = w.replace(/e$|es$/, '').match(/[aeiouéèy]+/g) ?? [];
  return groups.length === 1;
}

// ── Names Khmer writers spell their own way ─────────────────────────────────

/**
 * Khmer names (their Pali and Sanskrit spellings: no rule writes "Vanna" as
 * វណ្ណា) and foreign names with a spelling every Khmer writer uses. Each
 * romanisation (lower case, no spaces) → its spellings, the usual first.
 */
const KNOWN: Record<string, readonly string[]> = {
  sokha: ['សុខា'],
  dara: ['ដារ៉ា', 'ដារា'],
  sophea: ['សោភា', 'សុភា'],
  bopha: ['បុប្ផា'],
  vanna: ['វណ្ណា'],
  chantha: ['ចន្ថា'],
  sreymom: ['ស្រីមុំ'],
  pisey: ['ពិសី'],
  rithy: ['រិទ្ធី', 'ឫទ្ធី'],
  kosal: ['កុសល'],
  visal: ['វិសាល'],
  chenda: ['ចិន្តា'],
  vibol: ['វិបុល'],
  sambath: ['សម្បត្តិ'],
  piseth: ['ពិសិដ្ឋ'],
  panha: ['បញ្ញា'],
  thida: ['ធីតា', 'ធីដា'],
  nary: ['ណារី', 'នារី'],
  malis: ['ម្លិះ'],
  raksmey: ['រស្មី'],
  reaksmey: ['រស្មី'],
  sreypov: ['ស្រីពៅ'],
  leakhena: ['លក្ខិណា'],
  channary: ['ចាន់ណារី'],
  sokunthea: ['សុគន្ធា'],
  seyha: ['សីហា'],
  veasna: ['វាសនា'],
  ratana: ['រតនា'],
  rathana: ['រតនា'],
  sothea: ['សុធា'],
  sopheap: ['សុភាព'],
  rachana: ['រចនា'],
  sovann: ['សុវណ្ណ'],
  mony: ['មុន្នី'],
  bunthoeun: ['ប៊ុនធឿន'],
  chan: ['ចាន់', 'ច័ន្ទ'],
  kimheng: ['គីមហេង'],
  sochetra: ['សុចិត្រា'],
  davy: ['ដាវី'],
  narin: ['ណារិន', 'នរិន្ទ'],
  ponlok: ['ពន្លក'],
  tara: ['តារា', 'តារ៉ា'],
  chariya: ['ចរិយា'],
  kanha: ['កញ្ញា'],
  sophal: ['សុផល'],
  phalla: ['ផល្លា'],
  phirun: ['ភិរុណ'],
  vuthy: ['វុទ្ធី'],
  sokhom: ['សុខុម'],
  bora: ['បូរ៉ា'],
  theara: ['ធារ៉ា'],
  lida: ['លីដា'],
  srey: ['ស្រី'],
  sreynich: ['ស្រីនិច'],
  sreyneang: ['ស្រីនាង'],
  sreyleak: ['ស្រីល័ក្ខ'],
  sreyoun: ['ស្រីអូន'],
  socheata: ['សុជាតា'],
  socheat: ['សុជាតិ'],
  kunthea: ['គន្ធា'],
  vannak: ['វណ្ណៈ'],
  sothy: ['សុធី'],
  rotha: ['រដ្ឋា'],
  mealea: ['មាលា'],
  mealy: ['មាលី'],
  heng: ['ហេង'],
  ly: ['លី'],
  chea: ['ជា'],
  hun: ['ហ៊ុន'],
  sok: ['សុខ'],
  keo: ['កែវ'],
  nov: ['នៅ'],
  chhay: ['ឆាយ'],
  lim: ['លឹម'],
  tep: ['ទេព'],
  meas: ['មាស'],
  mao: ['ម៉ៅ'],
  pich: ['ពេជ្រ'],
  chanthou: ['ចន្ធូ'],
  seng: ['សេង'],
  vichea: ['វិជ្ជា'],
  monyroth: ['មុន្នីរ័ត្ន'],
  chandara: ['ចន្ទដារ៉ា'],
  kalyan: ['កល្យាណ'],
  makara: ['មករា'],
  chamroeun: ['ចំរើន', 'ចម្រើន'],
  samnang: ['សំណាង'],
  sitha: ['ស៊ីថា', 'សីថា'],
  narong: ['ណារ៉ុង'],
  sovannara: ['សុវណ្ណារ៉ា'],
  virak: ['វីរៈ'],
  vichet: ['វិចិត្រ'],
  pheakdey: ['ភក្ដី'],
  // Foreign names with a spelling of their own in Khmer.
  jason: ['ជេសុន'],
  mason: ['ម៉េសុន'],
  brian: ['ប្រាយអិន'],
  raul: ['រ៉ាអ៊ូល'],
  peter: ['ពីទ័រ', 'ពេត្រុស'],
  george: ['ចច', 'ហ្សក'],
  sean: ['សន', 'ស៊ន'],
  joe: ['ចូ'],
  nguyen: ['ង្វៀន'],
  jean: ['ហ្សង់'],
  jacques: ['ហ្សាក'],
  juan: ['ហ្វាន', 'ហ៊ាន'],
  jose: ['ហូសេ', 'ចូស'],
  rachel: ['រ៉ាជែល'],
  michelle: ['មីសែល'],
  michel: ['មីសែល'],
  mohammed: ['ម៉ូហាម៉ាត់'],
  muhammad: ['ម៉ូហាម៉ាត់'],
  mohamed: ['ម៉ូហាម៉ាត់'],
  matthew: ['ម៉ាថាយ', 'ម៉ាធ្យូ'],
  stephen: ['ស្ទីវិន'],
  steven: ['ស្ទីវិន'],
  joseph: ['យ៉ូសែប', 'ចូសិប'],
  elizabeth: ['អេលីសាបិត'],
  messi: ['មែស្ស៊ី'],
  louis: ['លូអ៊ី', 'លូអ៊ីស'],
  // (never "យួន")
  yuan: ['យាន់'],
};

// ── Names to pick ──────────────────────────────────────────────────────────

/** Common Khmer names, with the usual Latin spelling (the name card's picks: boys', girls', both). */
export const COMMON_NAMES: readonly { readonly km: string; readonly latin: string }[] = [
  { km: 'ដារ៉ា', latin: 'Dara' },
  { km: 'សុខា', latin: 'Sokha' },
  { km: 'វិសាល', latin: 'Visal' },
  { km: 'រិទ្ធី', latin: 'Rithy' },
  { km: 'កុសល', latin: 'Kosal' },
  { km: 'ពិសិដ្ឋ', latin: 'Piseth' },
  { km: 'សោភា', latin: 'Sophea' },
  { km: 'បុប្ផា', latin: 'Bopha' },
  { km: 'ចន្ថា', latin: 'Chantha' },
  { km: 'ស្រីមុំ', latin: 'Sreymom' },
  { km: 'ពិសី', latin: 'Pisey' },
  { km: 'ធីតា', latin: 'Thida' },
];

// ── The spelling of a name ─────────────────────────────────────────────────

/** Most letters a name keeps (Latin; Khmer a little more, its marks). */
export const NAME_MAX = 24;

/** A typed name made tidy: letters (any script), spaces, hyphens, apostrophes and dots; one space between words; a capital at each word if typed all in lower case. */
export function tidyName(s: string): string {
  let t = s
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\s'’.\-​]/gu, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s'’.\-]+/, '');
  if (t === t.toLowerCase()) t = t.replace(/(^|[\s-])(\p{Ll})/gu, (_, a: string, b: string) => a + b.toUpperCase());
  return t.slice(0, isKhmer(t) ? NAME_MAX + 8 : NAME_MAX);
}

/** How one word is read first (the guess). */
function guess(w: string, raw: string): Reading {
  const spanish = /[áíóúñ]/i.test(raw) || /(?:ez|jandro)$/.test(w) || /^(?:jos[ée]|jav)/.test(w);
  const khmer = !spanish && isKhmerRoman(w);
  const pinyin = !khmer && !spanish && isPinyin(w);
  return { khmer, pinyin, spanish, silentE: true, alt: false };
}

/** One word (a run of Latin letters; Khmer kept as it is): its spellings, the usual first. */
function wordSpellings(raw: string): string[] {
  if (isKhmer(raw)) return [raw];
  // (Min-jun, Jean-Pierre: one name, written as one word)
  const parts = raw.split(/[-'’.]+/).filter(Boolean);
  if (parts.length > 1) {
    const each = parts.map((p) => wordSpellings(p));
    const first = each.map((e) => e[0]).join('');
    const out = [first];
    each.forEach((e, k) => {
      for (const alt of e.slice(1)) out.push(each.map((x, j) => (j === k ? alt : x[0])).join(''));
    });
    return uniq(out).slice(0, 3);
  }
  const w = fold(raw);
  if (!w) return [];
  // (a Khmer name, or a foreign one Khmer writers spell one way: theirs only)
  const known = KNOWN[w.replace(/[éè]/g, 'e').replace(/ñ/g, 'n')];
  if (known) return known.slice(0, 3);
  const r = guess(w, raw);
  const out = [spellWord(w, r), spellWord(w, { ...r, alt: true })];
  // (read the Khmer way, or not: Sokun សុគុន or សូគុន)
  if (r.khmer) out.push(spellWord(w, { ...r, khmer: false }));
  else if (!r.pinyin && !r.spanish && MAYBE_KHMER.test(w)) out.push(spellWord(w, { ...r, khmer: true }));
  return uniq(out.filter(Boolean)).slice(0, 3);
}

/** It could be Khmer romanisation (then that reading is offered too). */
const MAYBE_KHMER = /ea|oeu|kh|chh|^sr|thy?$|^(?:bun|sok|samb|samn|mony|vann|chan[dt])/;

const uniq = (xs: readonly string[]): string[] => [...new Set(xs)];

/**
 * A name in Khmer letters: up to three spellings, the usual first (one when
 * it can only be written one way). Khmer letters typed in are kept as they
 * are; each Latin word is written by `KNOWN` or the rules.
 */
export function khmerSpellings(text: string): string[] {
  const words = tidyName(text).trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const each = words.map((w) => wordSpellings(w)).filter((e) => e.length);
  if (!each.length) return [];
  const out = [each.map((e) => e[0]).join(' ')];
  each.forEach((e, k) => {
    for (const alt of e.slice(1)) out.push(each.map((x, j) => (j === k ? alt : x[0])).join(' '));
  });
  return uniq(out).slice(0, 3);
}

/** The usual spelling of a name in Khmer letters ('' for none). */
export const toKhmer = (text: string): string => khmerSpellings(text)[0] ?? '';

/** The Latin part of a typed name ('' when it is all Khmer). */
export const latinPart = (text: string): string =>
  tidyName(text)
    .split(' ')
    .filter((w) => w && !isKhmer(w))
    .join(' ');

// ── The player's name ──────────────────────────────────────────────────────

export interface PlayerName {
  /** In Khmer letters. */
  readonly km: string;
  /** As typed in Latin letters ('' when typed in Khmer, or picked without one). */
  readonly latin: string;
}

const isString = (v: unknown): v is string => typeof v === 'string';

/** `name=<latin>` (or Khmer letters) in the URL: this page's name, not saved (shots). */
function fromUrl(): PlayerName | null {
  if (typeof location === 'undefined') return null;
  const v = new URLSearchParams(location.search).get('name');
  if (v === null) return null;
  const t = tidyName(v).trim();
  if (!t) return null;
  return { km: isKhmer(t) ? t : toKhmer(t), latin: latinPart(t) };
}

function saved(): PlayerName | null {
  const km = progress.get('name.km', '', isString).trim();
  if (!km) return null;
  return { km, latin: progress.get('name.latin', '', isString).trim() };
}

let current: PlayerName | null = fromUrl() ?? saved();
const listeners = new Set<(n: PlayerName | null) => void>();

/** His name (`{ km, latin }`), or null before the player gives one. */
export function playerName(): PlayerName | null {
  return current;
}

/** Call `fn` whenever the name is set or cleared (returns: stop listening). */
export function onName(fn: (n: PlayerName | null) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Give him a name (kept between visits; Khmer letters needed), or null to forget it. */
export function setPlayerName(n: PlayerName | null): void {
  const km = n ? tidyName(n.km).trim() : '';
  const next: PlayerName | null = km && isKhmer(km) ? { km, latin: n ? latinPart(n.latin).trim() : '' } : null;
  if (next?.km === current?.km && next?.latin === current?.latin) return;
  current = next;
  progress.set('name.km', next ? next.km : null);
  progress.set('name.latin', next?.latin ? next.latin : null);
  for (const fn of listeners)
    try {
      fn(next);
    } catch (e) {
      console.error('[map] name listener failed:', e);
    }
}

/** His name to show in a language: Khmer letters in Khmer; in English the Latin spelling if he has one. */
export function nameIn(lang: 'km' | 'en', n: PlayerName | null = current): string {
  if (!n) return '';
  return lang === 'en' && n.latin ? n.latin : n.km;
}
