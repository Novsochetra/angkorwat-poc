import type { Frame, Motif, StampDef } from './_bookData';

/**
 * The temple passport's ink stamps (roam/_bookUi.ts shows them): each an
 * SVG in one ink — an outline (round, octagon, cut corners, rounded, a
 * temple-door arch, an oval or a lotus-petal edge), the temple's silhouette
 * or the site's motif, its name and the date — worn like a real rubber
 * stamp (`inkFilters`: rough edges, specks, a lighter patch), turned a
 * little on the page. The lotus seal goes over a stamp when he prayed there.
 *
 * Motifs are drawn in a 100 × 100 box (`currentColor`), placed in the
 * stamp's 120 × 120 box above the name.
 */

/** A bud-topped Khmer tower, in stacked tiers (gaps between them), base centre (cx, yb), height h, width w. */
function tower(cx: number, yb: number, h: number, w: number): string {
  const g = Math.max(1, h * 0.035);
  const tiers: [number, number, number][] = [
    // bottom width, top width, height (share of h)
    [1, 1, 0.3],
    [0.86, 0.78, 0.2],
    [0.7, 0.6, 0.16],
  ];
  let y = yb;
  let d = '';
  for (const [a, b, k] of tiers) {
    const t = y - h * k;
    d += `M${cx - (w * a) / 2} ${y}L${cx - (w * b) / 2} ${t}L${cx + (w * b) / 2} ${t}L${cx + (w * a) / 2} ${y}Z`;
    y = t - g;
  }
  // The bud: its sides swell, then close to a point.
  const bw = w * 0.52;
  const top = yb - h;
  const bh = y - top;
  d += `M${cx - bw / 2} ${y}C${cx - bw * 0.62} ${y - bh * 0.45} ${cx - bw * 0.3} ${y - bh * 0.8} ${cx} ${top}C${cx + bw * 0.3} ${y - bh * 0.8} ${cx + bw * 0.62} ${y - bh * 0.45} ${cx + bw / 2} ${y}Z`;
  return d;
}

/** Wavy water lines (strokes). */
function waves(y0: number, rows: number, x0 = 10, x1 = 90, gap = 8, amp = 3): string {
  let s = '';
  for (let r = 0; r < rows; r++) {
    const y = y0 + r * gap;
    const inset = r * 4;
    let d = `M${x0 + inset} ${y}`;
    for (let x = x0 + inset; x < x1 - inset - 0.1; x += 10) d += `q5 ${-amp} 10 0`;
    s += `<path d="${d}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`;
  }
  return s;
}

const fill = (d: string, rule = false) => `<path d="${d}"${rule ? ' fill-rule="evenodd"' : ''}/>`;
const line = (d: string, w: number) => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
/** A circle as path data (for `fill`). */
const circle = (x: number, y: number, r: number) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

/** A serene stone face (the Bayon's): the head's outline with the eyes, nose and smile cut out. */
const FACE =
  'M28 88L28 52C28 34 38 24 50 10C62 24 72 34 72 52L72 88Z' +
  // crown band, eyes, nose, lips (holes)
  'M33 41L67 41L67 44L33 44Z' +
  'M38 55Q43.5 51 49 55Q43.5 57.5 38 55Z' +
  'M51 55Q56.5 51 62 55Q56.5 57.5 51 55Z' +
  'M48 58L52 58L54 68L46 68Z' +
  'M40 74Q50 80 60 74Q50 77 40 74Z';

/** The lotus flower (the prayer's seal, and the Buddha's pedestal). */
const LOTUS =
  'M50 22C58 34 58 50 50 62C42 50 42 34 50 22Z' +
  'M50 62C40 57 30 45 29 31C38 35 46 45 50 62Z' +
  'M50 62C60 57 70 45 71 31C62 35 54 45 50 62Z' +
  'M50 64C36 65 22 58 14 46C27 47 40 54 50 64Z' +
  'M50 64C64 65 78 58 86 46C73 47 60 54 50 64Z';

/** Each motif's drawing (100 × 100, currentColor). */
const MOTIF: Record<Motif, () => string> = {
  // Angkor Wat: five lotus-bud towers over the stepped galleries.
  sanctuary: () =>
    fill(tower(50, 70, 58, 20) + tower(31, 70, 42, 15) + tower(69, 70, 42, 15) + tower(15, 70, 30, 11) + tower(85, 70, 30, 11)) +
    fill('M6 72H94V78H6ZM11 80H89V85H11ZM16 87H84V92H16Z'),
  // Bayon: a face tower on its terrace.
  overlook: () => fill(FACE, true) + fill('M18 90H82V95H18Z') + fill(tower(12, 88, 34, 12) + tower(88, 88, 34, 12)),
  // Preah Khan: its doorways one behind the other, a fallen block before them.
  shrine: () =>
    fill(
      'M14 90L14 44L24 34L34 34L34 26L66 26L66 34L76 34L86 44L86 90Z' +
        'M33 90L33 54L41 46L59 46L67 54L67 90Z' +
        'M37.5 90L37.5 57L44 51L56 51L62.5 57L62.5 90Z' +
        'M41 90L41 60L46 56L54 56L59 60L59 90Z' +
        'M44 90L44 63L47.5 60L52.5 60L56 63L56 90Z' +
        'M47 90L47 65L53 65L53 90Z',
      true,
    ) +
    fill('M2 94L5 84L13 83L12 94ZM2 95H98V99H2Z'),
  // Ta Prohm: the fig's roots over the tower.
  terrace: () =>
    line('M33 90V60L39 54V46H61V54L67 60V90M45 90V72L50 66L55 72V90', 3) +
    fill(circle(30, 28, 13) + circle(50, 18, 15) + circle(70, 28, 13) + circle(40, 38, 10) + circle(61, 38, 10)) +
    line('M47 40C45 50 36 54 29 60C23 66 22 78 20 92', 4) +
    line('M53 40C55 50 64 54 71 60C77 66 78 78 80 92', 4) +
    line('M50 42C50 52 49 58 50 66M42 48C38 58 40 72 39 90M58 48C62 58 60 72 61 90', 2.2),
  // Phnom Kulen: the mountain, its waterfall, the temple on top.
  kulen: () =>
    fill('M4 88L30 46L40 54L56 28L66 38L72 34L96 88ZM49 58L55 58L57 88L47 88Z', true) +
    fill('M51.5 31L51.5 22C51.5 17 55 13 56 6C57 13 60.5 17 60.5 22L60.5 31Z') +
    waves(94, 1, 8, 92, 8, 2.5),
  // The River Gate: the gate over the water.
  rivergate: () =>
    fill(
      'M20 64L20 48L30 48L30 40L38 40L38 34C42 26 46 22 50 10C54 22 58 26 62 34L62 40L70 40L70 48L80 48L80 64Z' + 'M41 64L41 52C41 47 45 44 50 43C55 44 59 47 59 52L59 64Z',
      true,
    ) +
    fill('M14 64H86V68H14Z') +
    waves(76, 3),
  // A giant stone face lying in the ferns.
  fallenHead: () =>
    `<g transform="rotate(-80 50 60) translate(8 4) scale(0.84)">${fill(FACE, true)}</g>` +
    fill('M4 86H96V90H4Z') +
    line('M10 86L6 76M12 86L14 74M16 86L21 78M80 86L76 74M84 86L86 72M88 86L94 76', 2),
  // A wooden foot bridge over a stream.
  bridge: () => {
    let posts = '';
    for (const x of [18, 32, 46, 60, 74, 86]) {
      const t = (x - 8) / 84;
      const deck = (1 - t) ** 2 * 62 + 2 * t * (1 - t) * 46 + t * t * 62;
      const rail = (1 - t) ** 2 * 50 + 2 * t * (1 - t) * 34 + t * t * 50;
      posts += `M${x} ${rail}L${x} ${deck}`;
    }
    return line('M8 62Q50 46 92 62', 5) + line('M10 50Q50 34 90 50', 2.4) + line(posts, 2.2) + waves(76, 2);
  },
  // A rope swing from a big branch, the lake below.
  swing: () =>
    fill('M2 22C30 12 62 12 98 22L98 28C62 19 30 19 2 28Z') +
    fill(circle(12, 14, 10) + circle(28, 9, 9) + circle(86, 13, 10) + circle(72, 9, 7)) +
    line('M42 21L40 64M60 20L62 64', 1.8) +
    fill('M35 63H67V68H35Z') +
    waves(82, 2, 8, 92),
  // A small waterfall into its pool, lotus in the still water.
  pool: () =>
    fill('M4 36L32 36L36 50L36 70L4 70ZM68 36L96 36L96 70L64 70L64 50Z') +
    line('M41 38V72M47 38V76M53 38V76M59 38V72', 2.4) +
    `<g fill="none" stroke="currentColor" stroke-width="2.2"><ellipse cx="50" cy="82" rx="36" ry="7"/><ellipse cx="50" cy="82" rx="20" ry="3.5"/></g>` +
    fill('M14 88C14 85 22 85 22 88ZM78 88C78 85 86 85 86 88Z'),
  // A small stupa with incense burning before it.
  stupa: () =>
    fill('M28 84H72V90H28ZM33 78H67V84H33ZM36 78C36 62 43 56 50 56C57 56 64 62 64 78ZM45 49H55V56H45ZM46.5 49L50 22L53.5 49Z') +
    line('M18 84L16 64M21 84L21 62M24 84L26 64', 1.6) +
    line('M16 60C13 54 19 50 16 44M21 58C24 52 18 48 21 42M26 60C29 54 23 50 26 44', 1.1) +
    fill('M13 84H29L27 90H15Z'),
  // A spirit house on its post (with a curved Khmer roof).
  spiritHouse: () =>
    fill('M47 58H53V88H47ZM38 92L62 92L57 86L43 86ZM30 54H70V59H30Z') +
    fill('M36 36H64V54H36ZM46 42H54V54H46Z', true) +
    fill('M26 38C33 37 40 31 44 23L50 11L56 23C60 31 67 37 74 38C71 35 68 34 64 34L36 34C32 34 29 35 26 38Z') +
    line('M26 38C23 36 22 33 23 30M74 38C77 36 78 33 77 30M50 11L50 5', 2),
  // A fallen wall's carved lintel on its broken posts.
  ruinWall: () =>
    fill(
      'M8 34H92L88 42L92 52H8Z' + 'M22 43m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0' + 'M50 43m-6 0a6 6 0 1 0 12 0a6 6 0 1 0 -12 0' + 'M76 43m-5 0a5 5 0 1 0 10 0a5 5 0 1 0 -10 0' + 'M33 41L37 38L41 41L37 44ZM59 41L63 38L67 41L63 44Z',
      true,
    ) +
    fill('M14 55H28V90H14ZM72 55H86L84 62L86 70L86 90H72Z') +
    fill('M36 84H48V90H36ZM50 86L58 82L62 90L50 90Z'),
  // The forest Buddha, seated in meditation on a lotus pedestal.
  buddha: () =>
    `<circle cx="50" cy="30" r="17" fill="none" stroke="currentColor" stroke-width="2"/>` +
    fill(circle(50, 31, 8) + circle(50, 21.5, 3.5)) +
    fill('M36 74C36 58 41 44 50 42C59 44 64 58 64 74Z') +
    fill('M22 86C22 77 35 72 50 72C65 72 78 77 78 86Z') +
    fill('M18 88H82L77 95H23Z'),
  // A monk's hut on stilts, its ladder.
  monkHut: () =>
    fill('M14 46L50 18L86 46Z') +
    fill('M24 48H76V66H24ZM44 52H56V66H44ZM30 53H38V59H30ZM62 53H70V59H62Z', true) +
    fill('M27 66H31V90H27ZM48 66H52V90H48ZM69 66H73V90H69Z') +
    line('M44 66L38 90M50 66L44 90M42.5 72L48.5 72M41 78L47 78M39.5 84L45.5 84', 1.6) +
    fill('M4 90H96V94H4Z'),
  // A small gate swallowed by the fig's roots.
  rootGate: () =>
    fill('M24 90L24 50L32 42L32 34L68 34L68 42L76 50L76 90ZM40 90L40 58C40 52 45 49 50 48C55 49 60 52 60 58L60 90Z', true) +
    fill(circle(34, 20, 12) + circle(52, 14, 13) + circle(70, 22, 11)) +
    line('M40 28C34 40 24 44 20 56C16 68 16 80 14 92M62 28C68 40 78 44 82 56C86 68 86 80 88 92', 3.2) +
    line('M48 30C46 42 44 50 46 60C47 70 44 80 45 90M54 30C56 44 55 56 54 66C53 76 56 84 55 90', 2),
  // The woodcutters: logs stacked by the axe.
  woodcutter: () =>
    fill(circle(28, 80, 9) + 'M28 80m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0' + circle(47, 80, 9) + 'M47 80m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0' + circle(37.5, 64, 9) + 'M37.5 64m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0', true) +
    line('M64 90L82 44', 3.4) +
    fill('M76 44L92 36L95 52L81 55Z') +
    fill('M4 90H96V94H4Z'),
  // The village pagoda (a Khmer wat's vihara, from the front): its stacked gables, the
  // chovea finial curling up at the peak and hooked eaves, the pediment's wheel, the door, the plinth and stair.
  pagoda: () =>
    fill('M6 68L28 54H72L94 68Z' + 'M32 42L50 12L68 42Z') +
    fill('M22 62L50 24L78 62Z' + 'M33 58L50 34L67 58Z' + circle(50, 50, 4), true) +
    fill('M24 64H76V86H24Z' + 'M44 86V77C44 74 47 72 50 71C53 72 56 74 56 77V86Z', true) +
    fill('M16 86H84V91H16ZM41 91H59V96H41Z') +
    line('M50 12Q51 6 56 4M22 62Q18 61 18 56M78 62Q82 61 82 56M6 68Q2 67 2 62M94 68Q98 67 98 62', 2),
};

/** Each outline (and a thin line inside it), in the 120 × 120 box. */
function frame(f: Frame): string {
  const o = 'fill="none" stroke="currentColor"';
  const poly = (r: number, n: number, a0: number) =>
    Array.from({ length: n }, (_, k) => {
      const a = a0 + (k * Math.PI * 2) / n;
      return `${(60 + r * Math.cos(a)).toFixed(2)},${(60 + r * Math.sin(a)).toFixed(2)}`;
    }).join(' ');
  switch (f) {
    case 'round':
      return `<circle cx="60" cy="60" r="55" ${o} stroke-width="3.4"/><circle cx="60" cy="60" r="49.5" ${o} stroke-width="1.2"/>`;
    case 'octagon':
      return `<polygon points="${poly(58, 8, Math.PI / 8)}" ${o} stroke-width="3.4"/><polygon points="${poly(52.5, 8, Math.PI / 8)}" ${o} stroke-width="1.2"/>`;
    case 'cut':
      return `<polygon points="24,6 96,6 114,24 114,96 96,114 24,114 6,96 6,24" ${o} stroke-width="3.4"/><polygon points="26.5,12 93.5,12 108,26.5 108,93.5 93.5,108 26.5,108 12,93.5 12,26.5" ${o} stroke-width="1.2"/>`;
    case 'rounded':
      return `<rect x="6" y="6" width="108" height="108" rx="18" ${o} stroke-width="3.4"/><rect x="12" y="12" width="96" height="96" rx="13" ${o} stroke-width="1.2"/>`;
    case 'arch':
      return (
        `<path d="M8 114L8 54C8 30 32 11 60 5C88 11 112 30 112 54L112 114Z" ${o} stroke-width="3.4"/>` +
        `<path d="M14 108L14 55C14 34 35 18 60 11.5C85 18 106 34 106 55L106 108Z" ${o} stroke-width="1.2"/>`
      );
    case 'oval':
      return `<ellipse cx="60" cy="60" rx="57" ry="50" ${o} stroke-width="3.4"/><ellipse cx="60" cy="60" rx="51.5" ry="44.5" ${o} stroke-width="1.2"/>`;
    case 'lotus': {
      // Eighteen petal tips round the edge.
      const n = 18;
      const pt = (k: number, r: number) => {
        const a = -Math.PI / 2 + (k * Math.PI * 2) / n;
        return `${(60 + r * Math.cos(a)).toFixed(2)} ${(60 + r * Math.sin(a)).toFixed(2)}`;
      };
      let d = `M${pt(0, 50)}`;
      for (let k = 0; k < n; k++) d += `Q${pt(k + 0.5, 60.5)} ${pt(k + 1, 50)}`;
      return `<path d="${d}Z" ${o} stroke-width="3"/><circle cx="60" cy="60" r="45" ${o} stroke-width="1.2"/>`;
    }
  }
}

/** A seeded 0‥1 from a string (the stamp's turn and wear). */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

/** How many worn-ink filters `inkFilters` makes (a stamp picks one by its id). */
const FILTERS = 4;

/**
 * The worn-ink looks, once in the page: rough edges (a fine displacement),
 * tiny specks where the ink did not take, a lighter patch where the stamp
 * was pressed less.
 */
export function inkFilters(): string {
  let s = '<svg class="bk-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>';
  for (let i = 0; i < FILTERS; i++)
    s += `<filter id="bk-ink${i}" x="-4%" y="-4%" width="108%" height="108%" color-interpolation-filters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.75" numOctaves="2" seed="${3 + i * 7}" result="grain"/>
      <feDisplacementMap in="SourceGraphic" in2="grain" scale="1.7" xChannelSelector="R" yChannelSelector="G" result="rough"/>
      <feTurbulence type="fractalNoise" baseFrequency="${(0.035 + i * 0.006).toFixed(3)} ${(0.05 + i * 0.004).toFixed(3)}" numOctaves="3" seed="${11 + i * 5}" result="blot"/>
      <feColorMatrix in="blot" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -3.4 2.95" result="wear"/>
      <feColorMatrix in="grain" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -6 4.9" result="speck"/>
      <feComposite in="rough" in2="wear" operator="in" result="worn"/>
      <feComposite in="worn" in2="speck" operator="in"/>
    </filter>`;
  return s + '</defs></svg>';
}

export interface StampText {
  /** The name, one or two lines. */
  lines: string[];
  date: string;
  /** Khmer letters (Koulen / Kantumruy Pro) or Latin (small caps). */
  km: boolean;
}

/** Text in the stamp: the name's lines over the date, under a short rule. */
function words(t: StampText): string {
  const two = t.lines.length > 1;
  const nameY = two ? [86, 95.5] : [90];
  const dateY = two ? 104 : 101.5;
  const cls = t.km ? 'bk-st-km' : 'bk-st-en';
  const size = t.km ? (two ? 9.5 : 11.5) : two ? 8.8 : 10.2;
  const dateSize = t.km ? 7.6 : 7;
  const name = t.lines
    .map((l, i) => `<text x="60" y="${nameY[i]}" class="bk-st-name ${cls}" font-size="${size}"${fitAttr(l, t.km, size, 80)}>${esc(t.km ? l : l.toUpperCase())}</text>`)
    .join('');
  return `<path d="M42 78H78" stroke="currentColor" stroke-width="1" fill="none"/>${name}<text x="60" y="${dateY}" class="bk-st-date ${cls}" font-size="${dateSize}"${fitAttr(t.date, t.km, dateSize, two ? 46 : 58)}>${esc(t.date)}</text>`;
}

let measure: CanvasRenderingContext2D | null = null;
/** Squeeze a line into `max` units when it is wider (measured in the stamp's own fonts). */
function fitAttr(s: string, km: boolean, size: number, max: number): string {
  try {
    measure ??= document.createElement('canvas').getContext('2d');
    if (!measure) return '';
    measure.font = km ? `${size}px Koulen, 'Kantumruy Pro', sans-serif` : `700 ${size}px Georgia, serif`;
    // (small caps with letter spacing: a little wider than measured)
    const w = measure.measureText(km ? s : s.toUpperCase()).width * (km ? 1 : 1.12);
    return w > max ? ` textLength="${max}" lengthAdjust="spacingAndGlyphs"` : '';
  } catch {
    return '';
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** A stamp as SVG (its ink, turn and wear from its id). */
export function stampSvg(def: StampDef, text: StampText): string {
  const s = seedOf(def.id);
  const turn = ((s - 0.5) * 18).toFixed(1);
  return `<svg class="bk-stamp" viewBox="0 0 120 120" role="img" style="color:${def.ink};--bk-turn:${turn}deg">
    <g filter="url(#bk-ink${Math.floor(s * FILTERS)})">${frame(def.frame)}
      <g fill="currentColor" transform="translate(26 8) scale(0.68)">${MOTIF[def.motif]()}</g>${words(text)}</g></svg>`;
}

/** The lotus seal (he prayed there): a small round stamp in saffron ink over the corner of the place's stamp (its date: in the stamp's title). */
export function lotusSvg(id: string, label: string, km: boolean): string {
  const s = seedOf(`${id}:lotus`);
  const cls = km ? 'bk-st-km' : 'bk-st-en';
  return `<svg class="bk-lotus" viewBox="0 0 120 120" role="img" style="--bk-turn:${((s - 0.5) * 30).toFixed(1)}deg">
    <g filter="url(#bk-ink${Math.floor(s * FILTERS)})">${frame('lotus')}
      <g fill="currentColor" transform="translate(22 8) scale(0.76)">${fill(LOTUS)}${waves(72, 1, 22, 78, 8, 2.5)}</g>
      <text x="60" y="${km ? 93 : 91}" class="bk-st-name ${cls}" font-size="${km ? 17 : 14}"${fitAttr(label, km, km ? 17 : 14, 70)}>${esc(km ? label : label.toUpperCase())}</text></g></svg>`;
}
