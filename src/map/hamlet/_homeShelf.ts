import { Group } from 'three';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh, disposeVoxelMesh } from '../../voxel/VoxelMesh';
import { onName, playerName } from '../khmerName';
import type { Frame } from '../landmarks/_prasatKit';
import { progress } from '../progress';
import { treasure } from '../treasure/hooks';
import { CELL, sketchOf, type GoldModel } from '../treasure/_models';
import { GOLD } from '../treasure/_spots';
import type { MapFrame } from '../types';
import { Local } from '../village/_kit';
import { HOME_IN, HOME_SIGN } from './_homePlan';

/**
 * What changes in his stilt house (hamlet/_home.ts): the shelf on the back
 * wall with what he has found, and the sign over the door with his name.
 *
 * - **The shelf**: every golden figure he has found (treasure/: its saved
 *   list, `treasure.found()`) as a small gold piece on its lotus plinth, the
 *   figure's own model (treasure/_models.ts) at a quarter of its size, its
 *   cells merged three by three by three (≈ 60‥120 blocks each), side by
 *   side from the left, the lower board first; and his kite (progress.ts
 *   `kite.have`, roam/_kiteFly.ts), a small khleng ek in his kite's red,
 *   cream, gold and blue, hung on the wall over the shelf. Rebuilt when
 *   either changes (looked at once a second while the house is near).
 * - **The sign**: his name in Khmer letters (khmerName.ts `playerName()`;
 *   again whenever it changes, `onName`), or "ផ្ទះខ្ញុំ" (my home) with
 *   none: the words drawn with the Koulen typeface at 26 px (pixels like the
 *   village signs', hamlet/_evSign.ts), each painted pixel a raised block in
 *   cream on the dark board, sized to fit it.
 *
 * Each is one small voxel build in the house's frame (two or three draws),
 * rebuilt only on a change.
 */

/** Gold tones of the figures (treasure/index.ts's): gold, bright, deep, dark, pale. */
const TONES = [0xe2a93b, 0xf6cf63, 0xa8741e, 0x5c3a10, 0xffefb8];
/** A figure on the shelf this tall (m), and its merged cell (cells of the model). */
const MINI = 0.3;
const MERGE = 3;
/** His kite's colours (roam/_kiteSky.ts): the red sail, the cream border, the gold and blue lozenges; bamboo. */
const KITE = { sail: 0xc8382a, edge: 0xf2ead4, motif: 0xe8b43a, motif2: 0x1f3f9a, bamboo: 0x8a6a3e, bow: 0xc49a58 };

/** A figure's merged cells (x, y, z in merged cells from its middle and foot; tone), worked out once. */
const minis = new Map<GoldModel, { cells: [number, number, number, number][]; top: number }>();
function miniOf(id: GoldModel): { cells: [number, number, number, number][]; top: number } {
  let m = minis.get(id);
  if (m) return m;
  const count = new Map<string, number[]>();
  let top = 0;
  for (const [k, tone] of sketchOf(id).cells) {
    const [x, y, z] = k.split(',').map(Number);
    top = Math.max(top, y + 1);
    const key = `${Math.floor(x / MERGE)},${Math.floor(y / MERGE)},${Math.floor(z / MERGE)}`;
    let c = count.get(key);
    if (!c) count.set(key, (c = [0, 0, 0, 0, 0, 0]));
    c[tone]++;
    c[5]++;
  }
  const kept = new Set<string>();
  for (const [k, c] of count) if (c[5] >= 5) kept.add(k);
  const cells: [number, number, number, number][] = [];
  for (const k of kept) {
    const [x, y, z] = k.split(',').map(Number);
    // (inside: all six sides covered — never seen)
    if (kept.has(`${x + 1},${y},${z}`) && kept.has(`${x - 1},${y},${z}`) && kept.has(`${x},${y + 1},${z}`) && kept.has(`${x},${y - 1},${z}`) && kept.has(`${x},${y},${z + 1}`) && kept.has(`${x},${y},${z - 1}`)) continue;
    const c = count.get(k)!;
    let best = 0;
    for (let t = 1; t < 5; t++) if (c[t] > c[best]) best = t;
    cells.push([x, y, z, best]);
  }
  m = { cells, top };
  minis.set(id, m);
  return m;
}

/** Has he a kite of his own (kept, or a shot's `kite=have|fly…` / `homekite=1`)? */
function hasKite(): boolean {
  if (progress.get('kite.have', false)) return true;
  const q = new URLSearchParams(location.search);
  const k = q.get('kite');
  return q.get('homekite') === '1' || (!!k && k !== '0' && !k.startsWith('gift') && k !== 'buy' && !k.startsWith('bought'));
}

/** The shelf of finds and the kite on the wall, rebuilt when what he has changes (`update`: while the house is near). */
export function homeShelf(fr: Frame, F: number): { object: Group; update(f: MapFrame): void } {
  const object = new Group();
  object.name = 'home:shelf';
  let built: Group | null = null;
  let key = '';
  let next = -1;
  const S = HOME_IN.shelf;
  function build(found: readonly GoldModel[], kite: boolean): void {
    const b = new VoxelBuilder();
    const L = new Local(b, undefined, 9, 0);
    // The figures, side by side from the left: the lower board first (eight), then the upper.
    const per = 8;
    const gap = (S.x1 - S.x0 - 0.3) / (per - 1);
    found.forEach((id, i) => {
      const row = i < per ? 0 : 1;
      const k = row ? i - per : i;
      const x = S.x0 + 0.15 + k * gap;
      const y = F + S.ys[row];
      const z = S.z + S.d / 2 + 0.04;
      const m = miniOf(id);
      const s = MINI / (m.top * CELL);
      const c = MERGE * CELL * s;
      for (const [cx, cy, cz, t] of m.cells) L.box(x + (cx + 0.5) * c, y + (cy + 0.5) * c, z + (cz + 0.5) * c, c, c, c, TONES[t], 'brass', t === 1 || t === 4 ? 1.08 : 1);
    });
    if (kite) kiteOnWall(L, F);
    const world = new VoxelBuilder();
    fr.place(b, world);
    if (built) {
      object.remove(built);
      disposeVoxelMesh(built);
      built = null;
    }
    if (!world.boxes.length) return;
    built = buildVoxelMesh(world, { quality: 'medium', name: 'home:shelf' });
    built.traverse((o) => {
      o.castShadow = false;
      o.userData.noWalk = true;
    });
    object.add(built);
  }
  return {
    object,
    update(f) {
      if (f.t < next) return;
      next = f.t + 1;
      const ids = new Set(treasure.found().map((g) => g.id));
      const found = GOLD.filter((g) => ids.has(g.id)).map((g) => g.id);
      const kite = hasKite();
      const k = `${found.join(',')}|${kite}`;
      if (k === key) return;
      key = k;
      build(found, kite);
    },
  };
}

/**
 * His kite hung on the back wall over the shelf (house frame, facing into the room): a small khleng ek — the
 * ek's bow on its beak with its rattan ribbon, the mother's wide wings, the waist, the child's wings, the duck's
 * foot and the stubs of its two palm-leaf tails — in a red sail with a cream border, a gold lozenge on the mother,
 * a blue one on the child, on a bamboo spine.
 */
function kiteOnWall(L: Local, F: number): void {
  const K = HOME_IN.kite;
  const x0 = K.x;
  const z = K.z + 0.06;
  // (rows of the sail, top down: y over the kite's middle, half width (m))
  const rows: [number, number][] = [
    [0.42, 0.12],
    [0.36, 0.3],
    [0.3, 0.46],
    [0.24, 0.55],
    [0.18, 0.52],
    [0.12, 0.38],
    [0.06, 0.22],
    [0.0, 0.12],
    [-0.06, 0.1],
    [-0.12, 0.24],
    [-0.18, 0.3],
    [-0.24, 0.26],
    [-0.3, 0.14],
    [-0.36, 0.08],
  ];
  const h = 0.062;
  const y = (v: number) => F + K.y + v;
  for (const [v, w] of rows) {
    L.box(x0, y(v), z, w * 2, h, 0.02, KITE.sail, 'petal');
    // (the cream border at the ends of each row)
    for (const s of [-1, 1]) L.box(x0 + s * (w - 0.03), y(v), z + 0.006, 0.06, h, 0.02, KITE.edge, 'petal');
  }
  // The mother's trailing edge swept up to the tips: the tips themselves.
  for (const s of [-1, 1]) {
    L.box(x0 + s * 0.6, y(0.27), z + 0.006, 0.08, 0.1, 0.02, KITE.edge, 'petal');
    L.box(x0 + s * 0.65, y(0.31), z + 0.006, 0.05, 0.06, 0.02, KITE.edge, 'petal');
  }
  // The lozenges: gold on the mother, blue on the child.
  for (const [v, w] of [
    [0.3, 0.04],
    [0.24, 0.1],
    [0.18, 0.04],
  ])
    L.box(x0, y(v), z + 0.012, w * 2, 0.06, 0.02, KITE.motif, 'petal');
  for (const [v, w] of [
    [-0.15, 0.03],
    [-0.2, 0.07],
    [-0.25, 0.03],
  ])
    L.box(x0, y(v), z + 0.012, w * 2, 0.05, 0.02, KITE.motif2, 'petal');
  // The spine, the mother's bamboo across, the duck's two toes, the stubs of the tails.
  L.box(x0, y(0.02), z + 0.02, 0.025, 0.88, 0.02, KITE.bamboo, 'mapBark');
  L.box(x0, y(0.25), z + 0.02, 1.2, 0.022, 0.02, KITE.bamboo, 'mapBark');
  for (const s of [-1, 1]) {
    L.box(x0 + s * 0.08, y(-0.43), z, 0.06, 0.08, 0.02, KITE.sail, 'petal');
    L.box(x0 + s * 0.13, y(-0.47), z, 0.06, 0.04, 0.02, KITE.edge, 'petal');
    L.box(x0 + s * 0.13, y(-0.56), z - 0.005, 0.03, 0.16, 0.015, 0xb8a46a, 'petal');
  }
  // The ek: its bow over the head, the rattan ribbon strung across it.
  const bow: [number, number][] = [
    [-0.46, 0.5],
    [-0.3, 0.55],
    [-0.12, 0.57],
    [0.06, 0.57],
    [0.24, 0.55],
    [0.4, 0.5],
  ];
  for (const [dx, v] of bow) L.box(x0 + dx + 0.03, y(v), z + 0.02, 0.2, 0.03, 0.02, KITE.bow, 'mapBark');
  L.box(x0, y(0.49), z + 0.025, 0.94, 0.012, 0.01, 0xe8d6a2, 'petal');
  L.box(x0, y(0.52), z + 0.02, 0.025, 0.08, 0.02, KITE.bamboo, 'mapBark');
}

// ── The sign ───────────────────────────────────────────────────────────────

/** With no name: "my home". */
const NO_NAME = 'ផ្ទះខ្ញុំ';
/**
 * The size of type (px): a little over the village signs' 20 (Khmer stacks its vowels and subscripts: a name on
 * this smaller board needs the detail), and the font (the sign painters' bold Khmer); the fallback while it loads.
 */
const PX = 26;
const FONT = `400 ${PX}px Koulen`;
const FALLBACK = `400 ${PX}px 'Kantumruy Pro', 'Khmer Sangam MN', 'Khmer MN', 'Noto Sans Khmer', sans-serif`;
/** Wait at most this long (s) for Koulen before drawing with the fallback. */
const FONT_WAIT = 4;

/** A word's painted pixels (rows of '#' and '.'), cropped to them, drawn in `font`. */
function rasterize(text: string, font: string): string[] {
  const c = document.createElement('canvas');
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.font = font;
  const w = Math.ceil(g.measureText(text).width) + 8;
  const h = PX * 3;
  c.width = w;
  c.height = h;
  g.font = font;
  g.fillStyle = '#fff';
  g.textBaseline = 'alphabetic';
  g.fillText(text, 4, PX * 1.9);
  const data = g.getImageData(0, 0, w, h).data;
  const on = (x: number, y: number) => data[(y * w + x) * 4 + 3] > 110;
  let x0 = w;
  let x1 = -1;
  let y0 = h;
  let y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (on(x, y)) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
  const rows: string[] = [];
  for (let y = y0; y <= y1; y++) {
    let r = '';
    for (let x = x0; x <= x1; x++) r += on(x, y) ? '#' : '.';
    rows.push(r);
  }
  return rows;
}

/** A word's painted pixels as rectangles (columns c0‥c1, rows r0‥r1): runs along a row, grown down while the rows below repeat them (as _evSign.ts). */
function rects(rows: readonly string[]): [number, number, number, number][] {
  const H = rows.length;
  const W = H ? rows[0].length : 0;
  const used = rows.map((r) => [...r].map(() => false));
  const paint = (r: number, c: number) => rows[r][c] === '#' && !used[r][c];
  const out: [number, number, number, number][] = [];
  for (let r = 0; r < H; r++)
    for (let c = 0; c < W; c++) {
      if (!paint(r, c)) continue;
      let c1 = c;
      while (c1 + 1 < W && paint(r, c1 + 1)) c1++;
      let r1 = r;
      const same = (row: number) => {
        for (let k = c; k <= c1; k++) if (!paint(row, k)) return false;
        return (c === 0 || !paint(row, c - 1)) && (c1 === W - 1 || !paint(row, c1 + 1));
      };
      while (r1 + 1 < H && same(r1 + 1)) r1++;
      for (let rr = r; rr <= r1; rr++) for (let k = c; k <= c1; k++) used[rr][k] = true;
      out.push([c, c1, r, r1]);
    }
  return out;
}

/** The text the sign shows now. */
export const signText = (): string => playerName()?.km || NO_NAME;

/** The letters on the sign over the door: rebuilt when his name changes (and once Koulen has loaded). */
export function homeSign(fr: Frame, F: number): { object: Group; update(): void; readonly text: string; readonly koulen: boolean } {
  const object = new Group();
  object.name = 'home:sign';
  let built: Group | null = null;
  let shown = '';
  let shownKoulen = false;
  let dirty = true;
  let waitFrom = -1;
  const has = () => typeof document !== 'undefined' && !!document.fonts;
  const load = (text: string) => {
    if (!has()) return;
    document.fonts
      .load(FONT, text)
      .then(() => {
        dirty = true;
      })
      .catch(() => undefined);
  };
  // (asked for now, during the map's build: the page waits for its fonts before the first picture)
  load(signText());
  onName(() => {
    dirty = true;
    load(signText());
  });
  function build(text: string, koulen: boolean): void {
    const rows = rasterize(text, koulen ? FONT : FALLBACK);
    if (built) {
      object.remove(built);
      disposeVoxelMesh(built);
      built = null;
    }
    shown = text;
    shownKoulen = koulen;
    if (!rows.length) return;
    const S = HOME_SIGN;
    const cols = rows[0].length;
    const px = Math.min((S.w - 0.24) / cols, (S.h - 0.12) / rows.length, 0.02);
    const b = new VoxelBuilder();
    const L = new Local(b, undefined, 5, 0);
    const w = cols * px;
    const h = rows.length * px;
    for (const [c0, c1, r0, r1] of rects(rows)) {
      const u = ((c0 + c1 + 1) / 2) * px - w / 2;
      const v = h / 2 - ((r0 + r1 + 1) / 2) * px;
      L.box(S.x + u, F + S.y + v, S.z + 0.018, (c1 - c0 + 1) * px, (r1 - r0 + 1) * px, 0.036, 0xf4dc94, 'mapStone', 1.08);
    }
    const world = new VoxelBuilder();
    fr.place(b, world);
    built = buildVoxelMesh(world, { quality: 'medium', name: 'home:sign' });
    built.traverse((o) => {
      o.castShadow = false;
      o.userData.noWalk = true;
    });
    object.add(built);
  }
  return {
    object,
    get text() {
      return shown;
    },
    get koulen() {
      return shownKoulen;
    },
    update() {
      const text = signText();
      if (!dirty && text === shown) return;
      const ready = has() && document.fonts.check(FONT, text);
      if (ready) {
        dirty = false;
        waitFrom = -1;
        if (text !== shown || !shownKoulen) build(text, true);
        return;
      }
      // (Koulen not loaded yet: ask for it; after a few seconds without it, the fallback, and Koulen when it comes)
      const now = performance.now() / 1000;
      if (waitFrom < 0) {
        waitFrom = now;
        load(text);
      }
      if (now - waitFrom > FONT_WAIT && text !== shown) build(text, false);
    },
  };
}
