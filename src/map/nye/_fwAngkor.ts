/**
 * The signature firework's picture (AWP-35, show.ts kind `angkor`): Angkor Wat as the flag of Cambodia draws it (three
 * towers, never five): a wide stepped terrace, the gallery with its colonnade, and three tiered lotus-bud towers on it,
 * the middle one tallest, with the stairs' lines down the middle and under the side towers. The whole is wider than
 * tall (≈ 1.6 : 1), as on the flag. Drawn in gold sparks: made once from outlines in code into a short list of 2D
 * points (`ANGKOR_POINTS`, ≤ 256) in the order they are drawn: the fireworks' vertex shader (`_fwShaders.ts`) sends
 * spark j of n to point ⌊j·N/n⌋ and streaks it to the next one when both lie on the same outline, so fewer sparks (a
 * lower graphics level) draw the same picture with fewer, longer strokes. No three.js.
 *
 * Units: x −1‥1 across (right as the square sees it), y `ANGKOR_FOOT`‥≈ 0.63 up; the burst's radius scales it (m).
 * The outlines are measured on the flag (in its pixels, 544 wide: `FLAG`), then scaled.
 */
/** Points in the picture. */
export const ANGKOR_POINTS = 240;

/** The picture's foot (its lowest point: the terrace's bottom step), in radii under the burst. */
export const ANGKOR_FOOT = -0.62;

/** A point, and how densely sparks crowd onto the stretch that ends at it (1: plain; the towers more, so their tiers read). */
type Pt = [number, number] | [number, number, number];
/** How much more densely the towers' outlines are drawn than the terrace's long lines. */
const TOWER_DENSITY = 2.2;

/** The flag's drawing (its pixels): the temple's middle, the bottom step's line, its width. */
const FLAG = { cx: 655, bottom: 590, width: 544 } as const;
const K = 2 / FLAG.width;
/** A flag pixel → the picture's units. */
const P = (px: number, py: number, dense = 1): Pt => [(px - FLAG.cx) * K, ANGKOR_FOOT + (FLAG.bottom - py) * K, dense];

/**
 * A Khmer prasat's left side (flag pixels), from its foot up to its tip: a straight body, then the lotus bud rising in
 * `tiers` tiers, each a band whose corner (an antefix) points out and up, the bud swelling a little then closing in to
 * a short neck and the lotus finial.
 */
function prasatLeft(cx: number, base: number, bodyTop: number, budTop: number, tip: number, half: number, tiers: number): Pt[] {
  const w = (v: number): number => half * 1.08 * Math.pow(1 - v, 0.72) * (1 + 0.38 * v * (1 - v));
  const pts: Pt[] = [[cx - half, base], [cx - half, bodyTop]];
  const h = bodyTop - budTop;
  for (let k = 0; k < tiers; k++) {
    const v0 = k / tiers;
    const v1 = (k + 1) / tiers;
    const y0 = bodyTop - h * v0;
    const y1 = bodyTop - h * v1;
    const nub = half * 0.24 * (1 - 0.45 * v0);
    pts.push([cx - w(v0), y0], [cx - w(v0) - nub, y0 - (y0 - y1) * 0.4], [cx - w(v1) * 0.9, y1]);
  }
  pts.push([cx - half * 0.12, budTop], [cx - half * 0.18, (budTop + tip) / 2], [cx, tip]);
  return pts;
}

/**
 * The towers (flag pixels): each a slender tiered spire (`half` its foot, `tiers` tiers) on a porch whose pointed
 * pediment (`porch` its half width, its eaves at `eave`) rises from the gallery's roof to the spire's foot (`base`).
 */
const MIDDLE = { dx: 0, porch: 60, eave: 395, base: 363, bodyTop: 355, budTop: 262, tip: 253, half: 34, tiers: 7 };
const SIDE = { dx: 158, porch: 44, eave: 400, base: 384, bodyTop: 377, budTop: 305, tip: 299, half: 26, tiers: 6 };
/** The terrace's steps from the bottom (flag pixels: top line, half width), the gallery's wall, eaves and roof. */
const STEPS = [
  { top: 573, half: 272 },
  { top: 556, half: 255 },
  { top: 539, half: 238 },
  { top: 521, half: 221 },
];
const GALLERY = { half: 210, eave: 440, eaveHalf: 214, roof: 410, roofHalf: 205 };

type Px = [number, number, number];

/**
 * One tower's left half in the outline (flag pixels, with densities): the slender spire straight up from the gallery's
 * roof to its tip (its porch is an inner line, `porchLine`: drawn in one outline with the spire they would read as one
 * wide hump, not a spire over its porch as on the flag).
 */
function towerLeft(t: typeof MIDDLE, cx: number): Px[] {
  const out: Px[] = [];
  for (const [px, py] of prasatLeft(cx, GALLERY.roof, t.bodyTop, t.budTop, t.tip, t.half, t.tiers)) out.push([px, py, TOWER_DENSITY]);
  return out;
}

/** A tower's porch: its eaves either side of the spire and the pointed pediment between them, round the spire's foot. */
function porchLine(t: typeof MIDDLE, cx: number): Pt[] {
  return [
    P(cx - t.porch, GALLERY.roof - 2),
    P(cx - t.porch, t.eave),
    P(cx - t.half - 2, t.base - 4),
    P(cx - t.half - 2, t.eave + 2),
  ].concat([P(cx + t.half + 2, t.eave + 2), P(cx + t.half + 2, t.base - 4), P(cx + t.porch, t.eave), P(cx + t.porch, GALLERY.roof - 2)]);
}

/** The temple's outline, closed: up the left steps, the gallery, over the three towers, down the right, along the foot. */
function silhouette(): Pt[] {
  const left: Px[] = [[FLAG.cx - STEPS[0].half, FLAG.bottom, 1]];
  STEPS.forEach((s, i) => {
    left.push([FLAG.cx - s.half, s.top, 1]);
    left.push([FLAG.cx - (STEPS[i + 1]?.half ?? GALLERY.half), s.top, 1]);
  });
  left.push([FLAG.cx - GALLERY.half, GALLERY.eave, 1], [FLAG.cx - GALLERY.eaveHalf, GALLERY.eave, 1], [FLAG.cx - GALLERY.roofHalf, GALLERY.roof, 1]);
  // (the left side tower, then down its right, mirrored about its own axis, to the roof; then the middle tower)
  const sx = FLAG.cx - SIDE.dx;
  const side = towerLeft(SIDE, sx);
  left.push(...side);
  for (let i = side.length - 2; i >= 0; i--) left.push([2 * sx - side[i][0], side[i][1], side[i + 1][2]]);
  left.push(...towerLeft(MIDDLE, FLAG.cx));
  // (the right half: the left mirrored about the middle, back down, each stretch keeping its density; then the foot)
  const right: Px[] = [];
  for (let i = left.length - 2; i >= 0; i--) right.push([2 * FLAG.cx - left[i][0], left[i][1], left[i + 1][2]]);
  return [...left, ...right, [left[0][0], left[0][1], 1] as Px].map(([px, py, d]) => P(px, py, d));
}

/** The lines inside: the steps' edges, the colonnade's pillars, and the stairs down the middle and under the side towers. */
function inner(): { pts: Pt[]; tower: boolean }[] {
  const lines: { pts: Pt[]; tower: boolean }[] = [];
  for (const s of STEPS.slice(0, 3)) lines.push({ pts: [P(FLAG.cx - s.half + 8, s.top), P(FLAG.cx + s.half - 8, s.top)], tower: false });
  for (const dx of [-192, -124, -96, -36, 36, 96, 124, 192]) lines.push({ pts: [P(FLAG.cx + dx, STEPS[3].top - 4), P(FLAG.cx + dx, GALLERY.eave + 6)], tower: false });
  for (const [dx, t] of [[-SIDE.dx, SIDE], [0, MIDDLE], [SIDE.dx, SIDE]] as const) {
    lines.push({ pts: porchLine(t, FLAG.cx + dx), tower: false });
    lines.push({ pts: [P(FLAG.cx + dx, FLAG.bottom), P(FLAG.cx + dx, t.eave + 4)], tower: true });
  }
  return lines;
}

/** The outlines: the temple's silhouette first (the rounding's leftover points go to it), then the lines inside. */
function outlines(): { pts: Pt[]; tower: boolean }[] {
  return [{ pts: silhouette(), tower: true }, ...inner()];
}

/** A stretch's length as the sparks see it: its metres times the density of the point it ends at. */
const stretch = (a: Pt, b: Pt): number => Math.hypot(b[0] - a[0], b[1] - a[1]) * (b[2] ?? 1);
const lengthOf = (pts: Pt[]): number => pts.reduce((s, p, i) => (i ? s + stretch(pts[i - 1], p) : 0), 0);

/** `k` points evenly along an outline (by its length, each stretch counted by its density), both ends kept. */
function resample(pts: Pt[], k: number): Pt[] {
  const total = lengthOf(pts);
  const out: Pt[] = [];
  let seg = 1;
  let acc = 0;
  for (let i = 0; i < k; i++) {
    const want = (total * i) / (k - 1);
    while (seg < pts.length - 1 && acc + stretch(pts[seg - 1], pts[seg]) < want) {
      acc += stretch(pts[seg - 1], pts[seg]);
      seg++;
    }
    const a = pts[seg - 1];
    const b = pts[seg];
    const l = stretch(a, b) || 1;
    const t = Math.min(1, Math.max(0, (want - acc) / l));
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}

/**
 * The picture as RGBA floats, a point each (`ANGKOR_POINTS`): x, y, its outline's number (strokes join only within
 * one), 1 on the silhouette and the stairs / 0 on the steps' edges and the colonnade (the burst's two colours).
 */
export function angkorShape(): Float32Array {
  const lines = outlines();
  const lens = lines.map((l) => lengthOf(l.pts));
  const total = lens.reduce((a, b) => a + b, 0);
  // (points by length; the rounding's leftover to the silhouette)
  const counts = lens.map((l) => Math.max(4, Math.floor((ANGKOR_POINTS * l) / total)));
  counts[0] += ANGKOR_POINTS - counts.reduce((a, b) => a + b, 0);
  const out = new Float32Array(ANGKOR_POINTS * 4);
  let o = 0;
  lines.forEach((line, id) => {
    for (const [x, y] of resample(line.pts, counts[id])) {
      out[o++] = x;
      out[o++] = y;
      out[o++] = id;
      out[o++] = line.tower ? 1 : 0;
    }
  });
  return out;
}
