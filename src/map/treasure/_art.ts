import { B, D, G, K, P, sketchOf, type GoldModel } from './_models';

/**
 * Each golden figure as a small pixel picture for its list of clues
 * (_list.ts), made from its own voxel sketch (_models.ts): every cell
 * seen from the front (or from the side, for the animals that read best
 * in profile), one pixel each.
 *
 * - Found: in its golds, each pixel the tone of the cell nearest the eye,
 *   a little lighter higher up (as the figure is lit from above).
 * - Not found yet: its dark silhouette only (the list's CSS gives it a
 *   faint gold rim): its shape is the clue to what to look for.
 *
 * One SVG `<path>` a colour, the pixels of a row joined in runs; made once
 * per figure and state.
 */

/** Seen from the side (facing right): those that read best in profile. */
const SIDE: ReadonlySet<GoldModel> = new Set<GoldModel>(['singha', 'nandi', 'turtle', 'makara', 'rabbit', 'elephant', 'hamsa']);

/** The tones (sRGB), as index.ts `TONES`: gold, bright, deep, dark, pale. */
const TONE_RGB: Record<number, [number, number, number]> = {
  [G]: [0xe2, 0xa9, 0x3b],
  [B]: [0xf6, 0xcf, 0x63],
  [D]: [0xa8, 0x74, 0x1e],
  [K]: [0x5c, 0x3a, 0x10],
  [P]: [0xff, 0xef, 0xb8],
};

const cache = new Map<string, string>();

/** The picture as an `<svg>` (class `cls`), found (gold) or not (a silhouette). */
export function goldArt(id: GoldModel, found: boolean, cls = 'tgl-svg'): string {
  const key = `${id}:${found ? 1 : 0}:${cls}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const s = sketchOf(id);
  const side = SIDE.has(id);
  // The cells on the picture's grid: across (u) and up (v), and how near the eye (d: larger nearer).
  let u0 = Infinity;
  let u1 = -Infinity;
  let v1 = -Infinity;
  const px = new Map<string, { d: number; tone: number }>();
  for (const [k, tone] of s.cells) {
    const [x, y, z] = k.split(',').map(Number);
    // (front: as seen from in front of it, its left (+x) on the right; side: from its right (−x), facing right)
    const u = side ? z : x;
    const d = side ? -x : z;
    const at = `${u},${y}`;
    const was = px.get(at);
    if (!was || d > was.d) px.set(at, { d, tone });
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
    v1 = Math.max(v1, y);
  }
  const w = u1 - u0 + 1;
  const h = v1 + 1;
  // Runs of one colour along each row, a path per colour.
  const paths = new Map<string, string[]>();
  for (let y = v1; y >= 0; y--) {
    let run: { c: string; from: number } | null = null;
    const row = v1 - y;
    for (let u = u0; u <= u1 + 1; u++) {
      const p = u <= u1 ? px.get(`${u},${y}`) : undefined;
      const c = p ? (found ? colour(p.tone, y / Math.max(1, v1)) : 'S') : null;
      if (run && c !== run.c) {
        (paths.get(run.c) ?? paths.set(run.c, []).get(run.c)!).push(`M${run.from - u0} ${row}h${u - run.from}v1h-${u - run.from}z`);
        run = null;
      }
      if (c && !run) run = { c, from: u };
    }
  }
  const body = [...paths]
    .map(([c, d]) => (c === 'S' ? `<path class="tgl-sil" d="${d.join('')}"/>` : `<path fill="${c}" d="${d.join('')}"/>`))
    .join('');
  const svg = `<svg class="${cls}" viewBox="0 0 ${w} ${h}" style="--aw:${w};--ah:${h}" aria-hidden="true" shape-rendering="crispEdges">${body}</svg>`;
  cache.set(key, svg);
  return svg;
}

/** A tone's colour, a little lighter higher up (`up` 0 at the plinth ‥ 1 at the top; in four steps: fewer paths). */
function colour(tone: number, up: number): string {
  const [r, g, b] = TONE_RGB[tone] ?? TONE_RGB[G];
  const k = 0.9 + 0.16 * (Math.round(up * 3) / 3);
  const c = (v: number) =>
    Math.min(255, Math.round(v * k))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
