import type { VoxelMaterialKey } from '../../voxel/materials';
import { hash3 } from '../../voxel/random';
import type { VoxelGrid } from '../../voxel/VoxelBuilder';

/**
 * Face towers for the world map's Bayon: stacked stone towers with a huge
 * serene face on every side and a lotus bud on top, carved on a 1 m grid.
 *
 * The map sees them from 200–560 m (2–4 px per metre), so a face is drawn
 * with depth and tone, not detail: a light brow ridge over a dark band of
 * closed eyes, a bright nose that sticks out 2–3 m, a dark mouth line with
 * turned-up corners between light lips, a diadem on top and long ears.
 */

/** A side of a square tower: its outward normal on the map. */
export type Side = 'S' | 'E' | 'N' | 'W';

/** Outward normal (n) and the axis along the side (u), in cell steps. */
export const SIDE_AXES: Record<Side, { nx: number; nz: number; ux: number; uz: number }> = {
  S: { nx: 0, nz: 1, ux: 1, uz: 0 },
  N: { nx: 0, nz: -1, ux: -1, uz: 0 },
  E: { nx: 1, nz: 0, ux: 0, uz: -1 },
  W: { nx: -1, nz: 0, ux: 0, uz: 1 },
};

/** Stone tones of a building (sRGB), 3–4 close values each. */
export interface StoneTones {
  /** Plain walls. */
  wall: readonly number[];
  /** The face's skin (a little lighter than the wall so the face reads as one shape). */
  mid: readonly number[];
  /** Cheeks, lower lids, chin. */
  light: readonly number[];
  /** Nose, brows, lips, diadem: what sticks out furthest. */
  bright: readonly number[];
  /** Upper lids, under the nose and lip, the face's outline. */
  dark: readonly number[];
  /** Eye slits, mouth line, doorways, niches. */
  deep: readonly number[];
  /** Wall in the shadow of the face (under the chin, round the ears). */
  shadow: readonly number[];
  /** Cornices and tier lips. */
  ledge: readonly number[];
  /** Moss on ledges (mapGrass). */
  moss: readonly number[];
}

/** Bayon's dark grey weathered sandstone (warm in the low sun). */
export const BAYON_STONE: StoneTones = {
  wall: [0x6f6a63, 0x68635c, 0x77726a, 0x635e58],
  mid: [0x7e786e, 0x767067, 0x868076],
  light: [0x989185, 0x90897d, 0xa0998c],
  bright: [0xb5ad9f, 0xada597, 0xbdb5a6],
  dark: [0x4c4843, 0x46423d, 0x534e48],
  deep: [0x1e1c1a, 0x24221f, 0x1a1817],
  shadow: [0x403d38, 0x3b3834, 0x46423d],
  ledge: [0x898276, 0x817a6f, 0x918a7e],
  moss: [0x566f2f, 0x637f39, 0x4b6229, 0x6e893e],
};

export const tone = (list: readonly number[], i: number, j: number, k: number, seed: number): number => list[Math.floor(hash3(i, j, k, seed) * list.length)];

/** Tone of a wall block laid in running bond: blocks two cells long, joints shifted every course. */
export const bondTone = (list: readonly number[], i: number, j: number, k: number, seed: number): number =>
  tone(list, Math.floor((i + (j & 1)) / 2), j, Math.floor((k + (j & 1)) / 2), seed);

/** Every other course a touch darker: the stacked-stone look at a distance. */
export const courseShade = (j: number): number => (j & 1 ? 0.95 : 1.02);

/**
 * A carved face, top row first. Each character is one cell:
 *   ' ' nothing · 'w' wall recoloured to shadow · 'x' wall recoloured deep (a slit into the face)
 *   'a' / 'l' / 'd' skin 1 m out: mid / light / dark
 *   'A' / 'L' / 'D' 2 m out: mid / bright / dark
 *   'N' 3 m out, bright (the tip of the nose)
 */
export interface FaceTemplate {
  rows: string[];
  width: number;
  height: number;
}

/** A template from the left half of each row (the last character is the centre column). */
function mirrored(half: string[]): FaceTemplate {
  const n = half[0].length;
  const rows = half.map((r) => {
    if (r.length !== n) throw new Error(`face row "${r}" is not ${n} long`);
    return r + r.slice(0, n - 1).split('').reverse().join('');
  });
  return { rows, width: 2 * n - 1, height: rows.length };
}

/** 17 × 21 m: the main tower. Ears at the edges, the nose down the middle. */
export const FACE_LARGE = mirrored([
  '   LALALA', // diadem jewels
  '  AAAAAAA', // diadem band
  '  aaaaaaa', // forehead
  ' aaaaaaaa',
  ' aLLLLLaA', // brows, root of the nose
  'ladddddaA', // upper lids in the brow's shadow
  'addxxxxaL', // closed eyes
  'ddalllllL', // lower lids
  'ddaalllAL', // cheeks, the nose widens
  'ddaaallAN', // tip of the nose
  'adaaaalLN',
  'adaaadLLL', // nostrils
  'adaaadddd', // under the nose
  'adaxLLLLL', // upper lip, corners turned up (the smile)
  'aaaaxxxxx', // mouth line
  'daaaaLLLL', // lower lip
  'waaaaaddd', // under the lip, ear lobes
  '  aaaalll', // chin
  '   aaaaaa', // jaw
  '    aaaaa',
  '     wwww', // shadow under the chin
]);

/** 11 × 15 m: the smaller towers. */
export const FACE_SMALL = mirrored([
  '  LALA', // diadem
  ' AAAAA',
  ' aaaaa', // forehead
  ' LLLaA', // brows
  'adxxaL', // closed eyes
  'dallAL', // lower lids, nose
  'daaalN', // tip of the nose
  'aaadLL', // nostrils
  'aaaddd', // under the nose
  'aaxLLL', // upper lip, smiling corners
  'daaxxx', // mouth line
  'waaaLL', // lower lip
  ' aaaad',
  '  aaal', // chin
  '   www', // shadow under the chin
]);

/** 9 × 12 m: the smallest towers. */
export const FACE_TINY = mirrored([
  '  LAL', // diadem
  ' AAAA',
  ' aaaa', // forehead
  ' LLaA', // brows
  'adxxL', // closed eyes
  'dallN', // lower lids, tip of the nose
  'aaadL', // nostrils
  'aaxLL', // upper lip, smiling corners
  'daxxx', // mouth line
  'waaLL', // lower lip
  ' aaal', // chin
  '  www', // shadow under the chin
]);

const CELL_OF: Record<string, { depth: number; tone: keyof StoneTones }> = {
  w: { depth: 0, tone: 'shadow' },
  x: { depth: 0, tone: 'deep' },
  a: { depth: 1, tone: 'mid' },
  l: { depth: 1, tone: 'light' },
  d: { depth: 1, tone: 'dark' },
  A: { depth: 2, tone: 'mid' },
  L: { depth: 2, tone: 'bright' },
  D: { depth: 2, tone: 'dark' },
  N: { depth: 3, tone: 'bright' },
};

/** Map cell of a side: `a` along the side, `d` out from the wall plane (0 = the wall's outer cell). */
export function sideCell(side: Side, ci: number, ck: number, half: number, a: number, d: number): [number, number] {
  const s = SIDE_AXES[side];
  return [ci + s.ux * a + s.nx * (half + d), ck + s.uz * a + s.nz * (half + d)];
}

/**
 * Carve a face on one side of a solid tower section whose wall plane is `half`
 * cells from the centre column (ci, ck). `j0` is the row of the template's
 * bottom line. Cells the face covers are added to `keep` (moss and vines stay off).
 */
export function carveFace(
  g: VoxelGrid,
  o: { ci: number; ck: number; half: number; j0: number; side: Side; face: FaceTemplate; tones: StoneTones; seed: number; keep?: Set<string> },
): void {
  const { face, tones, seed } = o;
  const mid = (face.width - 1) / 2;
  for (let r = 0; r < face.height; r++) {
    const row = face.rows[r];
    const j = o.j0 + face.height - 1 - r;
    for (let c = 0; c < face.width; c++) {
      const spec = CELL_OF[row[c]];
      if (!spec) continue;
      const a = c - mid;
      const list = tones[spec.tone];
      if (spec.depth === 0) {
        const [i, k] = sideCell(o.side, o.ci, o.ck, o.half, a, 0);
        if (g.has(i, j, k)) g.put(i, j, k, { color: tone(list, i, j, k, seed), mat: 'mapStone', shade: row[c] === 'x' ? 0.8 : 0.92 });
        o.keep?.add(`${i},${j},${k}`);
        continue;
      }
      for (let d = 1; d <= spec.depth; d++) {
        const [i, k] = sideCell(o.side, o.ci, o.ck, o.half, a, d);
        // Inner cells show on the sides of the nose and brow: same tone, a little darker.
        g.put(i, j, k, { color: tone(list, i, j, k, seed), mat: 'mapStone', shade: d === spec.depth ? 1 : 0.93 });
        o.keep?.add(`${i},${j},${k}`);
      }
      o.keep?.add(`${sideCell(o.side, o.ci, o.ck, o.half, a, 0).join(`,${j},`)}`);
    }
  }
}

/** Fill a box of cells (inclusive ranges) with a colour picker; `null` skips a cell. */
export function fillBox(
  g: VoxelGrid,
  i0: number,
  i1: number,
  j0: number,
  j1: number,
  k0: number,
  k1: number,
  color: (i: number, j: number, k: number) => number | null,
  mat: VoxelMaterialKey = 'mapStone',
  shade: (i: number, j: number, k: number) => number = () => 1,
): void {
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++)
      for (let k = k0; k <= k1; k++) {
        const c = color(i, j, k);
        if (c !== null) g.put(i, j, k, { color: c, mat, shade: shade(i, j, k) });
      }
}

export interface FaceTower {
  /** Centre column and base row (cells). */
  ci: number;
  ck: number;
  j0: number;
  /** Half size of the face section's wall (its width is 2·half + 1). */
  half: number;
  face: FaceTemplate;
  /** Sides that get a face (the others get plain tiers and a false door). */
  faces: Side[];
  /** Rows of the stepped plinth, and how far its first step reaches out past the faces (default 3). */
  plinth: number;
  plinthOut?: number;
  /** Rows of the lower body (the sanctuary under the faces). */
  body: number;
  /** Crown tiers above the faces (each one block narrower), and rows per tier (the last row is its lip). */
  tiers: number;
  tierH: number;
  /** Side with a porch and an open doorway. */
  porch?: Side;
  seed: number;
  tones: StoneTones;
}

export interface TowerResult {
  /** Highest row with stone. */
  top: number;
  /** Cells of the doorway's back wall (for a candle), if there is a porch: [i, j, k] of the floor cell. */
  door?: [number, number, number];
  /** Corners of each tier lip, top row (where a small tree can take root). */
  lips: [number, number, number][];
}

/**
 * One Bayon face tower: stepped plinth, a lower body with a porch or false
 * doors, a cornice, the face section (a face on each side in `faces`), a
 * cornice, stacked tiers with corner pinnacles, and a lotus-bud finial.
 */
export function buildFaceTower(g: VoxelGrid, t: FaceTower, keep: Set<string>): TowerResult {
  const { ci, ck, half, tones, seed } = t;
  const wall = (i: number, j: number, k: number) => bondTone(tones.wall, i, j, k, seed);
  const ledge = (i: number, j: number, k: number) => tone(tones.ledge, i, j, k, seed + 1);
  const shade = (_i: number, j: number) => courseShade(j);
  /** A square section, corners notched (redented) when `notch`. */
  const square = (h: number, j0: number, j1: number, color: (i: number, j: number, k: number) => number | null, notch = true, sh = shade) =>
    fillBox(g, ci - h, ci + h, j0, j1, ck - h, ck + h, (i, j, k) => (notch && Math.abs(i - ci) === h && Math.abs(k - ck) === h ? null : color(i, j, k)), 'mapStone', sh);

  let j = t.j0;
  // Plinth: a wide first step, then one step in.
  const out = t.plinthOut ?? 3;
  for (let p = 0; p < t.plinth; p++) square(half + Math.max(2, out - p), j + p, j + p, p === t.plinth - 1 ? ledge : wall, false);
  j += t.plinth;

  // Lower body: wider than the faces, so the tower stands as one mass of stone.
  const hb = half + 1;
  const jb = j;
  square(hb, jb, jb + t.body - 1, wall);
  let door: [number, number, number] | undefined;
  for (const side of ['S', 'E', 'N', 'W'] as Side[]) {
    const at = (a: number, d: number, jj: number) => {
      const [i, k] = sideCell(side, ci, ck, hb, a, d);
      return [i, jj, k] as const;
    };
    const put = (a: number, d: number, jj: number, color: number, sh = 1) => {
      const [i, , k] = at(a, d, jj);
      g.put(i, jj, k, { color, mat: 'mapStone', shade: sh });
    };
    const del = (a: number, d: number, jj: number) => {
      const [i, , k] = at(a, d, jj);
      g.delete(i, jj, k);
    };
    const doorH = Math.min(4, t.body - 3);
    if (side === t.porch) {
      // Porch: a vestibule 7 wide, 3 deep, from the ground up, with a stepped
      // pediment (under the cornice, clear of the face) and an open doorway.
      const pj = jb + t.body - 2;
      for (let jj = t.j0; jj < pj; jj++)
        for (let a = -3; a <= 3; a++) for (let d = 1; d <= 3; d++) put(a, d, jj, Math.abs(a) === 3 ? tone(tones.ledge, a, jj, d, seed) : wall(a + ci, jj, d + ck), courseShade(jj));
      for (let s = 0; s < 3; s++) for (let a = -3 + s; a <= 3 - s; a++) for (let d = 1; d <= 3; d++) put(a, d, pj + s, s === 0 ? tone(tones.ledge, a, s, d, seed) : wall(a, pj + s, d));
      // Doorway: open through the porch into the wall, dark inside.
      for (let jj = jb; jj < jb + doorH; jj++)
        for (let a = -1; a <= 1; a++) {
          for (let d = 0; d <= 3; d++) del(a, d, jj);
          put(a, -1, jj, tone(tones.deep, a, jj, 0, seed), 0.7);
        }
      // Threshold, and a step down in front.
      for (let a = -1; a <= 1; a++) {
        for (let d = 0; d <= 3; d++) put(a, d, jb - 1, tone(tones.ledge, a, jb, d, seed));
        for (let jj = t.j0; jj < jb - 1; jj++) put(a, 4, jj, tone(tones.ledge, a, jj, 4, seed));
      }
      const [i, , k] = at(0, 0, jb);
      door = [i, jb, k];
    } else {
      // False door: a dark panel in a light frame with a small pediment.
      for (let jj = jb; jj < jb + doorH; jj++) for (let a = -1; a <= 1; a++) put(a, 0, jj, tone(tones.deep, a, jj, 1, seed), 0.85);
      for (let jj = jb; jj <= jb + doorH; jj++) for (const a of [-2, 2]) put(a, 1, jj, tone(tones.light, a, jj, 2, seed));
      for (let a = -2; a <= 2; a++) put(a, 1, jb + doorH, tone(tones.light, a, jb + doorH, 3, seed));
      for (let a = -1; a <= 1; a++) put(a, 1, jb + doorH + 1, tone(tones.ledge, a, jb + doorH + 1, 3, seed));
    }
  }
  j = jb + t.body;

  // Cornice under the faces.
  square(hb + 1, j, j, ledge, false);
  j += 1;

  // Face section: one row above the template for the crown's base.
  const jf = j;
  square(half, jf, jf + t.face.height, wall);
  for (const side of t.faces) carveFace(g, { ci, ck, half, j0: jf, side, face: t.face, tones, seed: seed + 7, keep });
  j = jf + t.face.height + 1;

  // A band over the faces (flush, lighter).
  square(half, j, j, ledge, false);
  j += 1;

  // Tiers: each one block in from the last, a light lip on top, pinnacles
  // on its corners and mid-sides, and a dark niche per side: the tapering,
  // jagged stack of the reference towers.
  const lips: [number, number, number][] = [];
  for (let n = 0; n < t.tiers; n++) {
    const h = half - 1 - n;
    if (h < 2) break;
    square(h, j, j + t.tierH - 2, wall);
    square(h, j + t.tierH - 1, j + t.tierH - 1, ledge, false);
    for (const side of ['S', 'E', 'N', 'W'] as Side[]) {
      const [i, k] = sideCell(side, ci, ck, h, 0, 0);
      g.put(i, j, k, { color: tone(tones.deep, i, j, k, seed), mat: 'mapStone', shade: 0.85 });
    }
    const lipJ = j + t.tierH - 1;
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const [pi, pk] = [ci + sx * h, ck + sz * h];
      g.put(pi, lipJ + 1, pk, { color: tone(tones.light, pi, lipJ + 1, pk, seed), mat: 'mapStone' });
      lips.push([pi, lipJ, pk]);
    }
    if (h >= 3)
      for (const [sx, sz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const [pi, pk] = [ci + sx * h, ck + sz * h];
        g.put(pi, lipJ + 1, pk, { color: tone(tones.ledge, pi, lipJ + 1, pk, seed + 2), mat: 'mapStone' });
      }
    j += t.tierH;
  }

  // Lotus bud: a collar, the swelling bud, its tip.
  fillBox(g, ci - 1, ci + 1, j, j, ck - 1, ck + 1, (i, jj, k) => tone(tones.ledge, i, jj, k, seed));
  fillBox(g, ci - 1, ci + 1, j + 1, j + 2, ck - 1, ck + 1, (i, jj, k) => (Math.abs(i - ci) + Math.abs(k - ck) === 2 && jj === j + 2 ? null : tone(tones.light, i, jj, k, seed)));
  g.put(ci, j + 3, ck, { color: tone(tones.bright, ci, j + 3, ck, seed), mat: 'mapStone' });
  g.put(ci, j + 4, ck, { color: tone(tones.bright, ci, j + 4, ck, seed + 1), mat: 'mapStone', shade: 1.05 });
  j += 1;
  return { top: j + 3, door, lips };
}
