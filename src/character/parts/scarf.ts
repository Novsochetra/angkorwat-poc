import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { hash3 } from '../../voxel/random';
import { PALETTE } from '../palette';
import { JOINTS } from '../skeleton';

/**
 * The red krama (Cambodian checked scarf, sheet 3.3.3): a chunky collar — one
 * wrap hugging the neck and a wider two-row drape that dips lower at the front —
 * and one long tail hanging down the front-left, ending in a fringe.
 *
 * The check is built from the blocks themselves, like the sheet's "Pattern"
 * swatch: wide red bands, narrow maroon bands and thin salmon threads, crossed
 * in both directions. Gold threads along the block edges come from the
 * material's edge tint.
 */
const K = PALETTE.krama;

/** R = red band, D = narrow maroon band, L = salmon thread. */
type Band = 'R' | 'D' | 'L';

/** Colour where a warp band (along the cloth) crosses a weft band (across it). */
export function plaid(warp: Band, weft: Band, n = 0.5): number {
  if (warp === 'D' && weft === 'D') return K.darkest;
  if (warp === 'D' || weft === 'D') return warp === 'L' || weft === 'L' ? K.lightDark : K.dark;
  if (warp === 'L' || weft === 'L') return K.light;
  return n < 0.3 ? K.red2 : n > 0.78 ? K.redLight : K.red;
}

/** Relative width of each band type. */
const WIDTH: Record<Band, number> = { R: 1, L: 1, D: 0.55 };

/** Splits `len` into cells following the band sequence (narrow bands stay narrow). */
function bands(len: number, seq: readonly Band[]): { at: number; w: number; band: Band }[] {
  const total = seq.reduce((s, b) => s + WIDTH[b], 0);
  let at = 0;
  return seq.map((band) => {
    const w = (WIDTH[band] / total) * len;
    const cell = { at: at + w / 2, w, band };
    at += w;
    return cell;
  });
}

interface Wrap {
  /** bottom of the row at the back of the neck */
  y: number;
  h: number;
  /** outer half-width and front/back extent */
  hx: number;
  z0: number;
  z1: number;
  /** block thickness */
  d: number;
  /** how much lower the front is than the back */
  drop: number;
  /** extra dip at the front centre */
  sag: number;
  weft: Band;
  /** warp bands across the front, right to left as seen from the front (-x → +x) */
  front: readonly Band[];
  /** skip side cells nearer the back than this (0 = back, 1 = front) */
  minT?: number;
  seed: number;
}

/** One wrap of the collar: front row, both sides and the back row. */
function wrapCells(b: VoxelBuilder, w: Wrap): void {
  const { hx, z0, z1, d } = w;
  let n = 0;
  const put = (x: number, z: number, sx: number, sz: number, band: Band, frontRow: boolean) => {
    const t = (z - z0) / (z1 - z0);
    if (t < (w.minT ?? 0)) return;
    const dip = w.drop * t + (frontRow ? w.sag * (1 - Math.abs(x) / hx) : 0);
    const r = hash3(n, w.y * 10, 3, w.seed);
    const wob = (hash3(n, 1, 1, w.seed) - 0.5) * 0.12;
    const tilt = (hash3(n, 2, 2, w.seed) - 0.5) * 0.1;
    b.box(x, w.y + w.h / 2 - dip, z, sx * 1.01, w.h, sz * 1.01, plaid(band, w.weft, r), 'krama', {
      rz: frontRow ? wob : 0,
      rx: frontRow ? tilt : 0,
      ry: frontRow ? 0 : wob * 0.6,
      shade: 1 - (1 - t) * 0.04,
    });
    n++;
  };
  // Front row across the chest.
  for (const c of bands(hx * 2, w.front)) put(-hx + c.at, z1 - d / 2, c.w, d, c.band, true);
  // Sides from front to back, then the back row.
  const sideLen = z1 - z0 - 2 * d;
  const sideN = Math.max(1, Math.round(sideLen / 1.05));
  const sideSeq: Band[] = Array.from({ length: sideN }, (_, i) => (i % 3 === 1 ? 'D' : 'R'));
  for (const s of [-1, 1])
    for (const c of bands(sideLen, sideSeq)) put(s * (hx - d / 2), z1 - d - c.at, d, c.w, c.band, false);
  const backN = Math.max(2, Math.round((hx * 2) / 1.05));
  const backSeq: Band[] = Array.from({ length: backN }, (_, i) => (i % 4 === 2 ? 'D' : i % 4 === 0 && i ? 'L' : 'R'));
  for (const c of bands(hx * 2, backSeq)) put(-hx + c.at, z0 + d / 2, c.w, d, c.band, false);
}

/** Collar wrapped around the neck. Chest joint. */
export function buildScarfCollar(): VoxelBuilder {
  const b = new VoxelBuilder();
  // Upper wrap hugs the neck under the chin (mostly shaded by the head).
  wrapCells(b, {
    y: 19.5, h: 1.0, hx: 3.45, z0: -3.0, z1: 3.2, d: 1.0, drop: 0.1, sag: 0,
    weft: 'R', front: ['R', 'D', 'R', 'R', 'L', 'R', 'D', 'R'], seed: 71,
  });
  // Lower drape: wider over the shoulders, two rows deep across the front.
  const front: Band[] = ['R', 'R', 'D', 'R', 'L', 'R', 'R', 'D', 'R', 'R'];
  wrapCells(b, {
    y: 18.55, h: 1.0, hx: 4.3, z0: -3.5, z1: 3.85, d: 1.0, drop: 0.15, sag: 0.12,
    weft: 'R', front, seed: 72,
  });
  wrapCells(b, {
    y: 17.55, h: 1.0, hx: 4.2, z0: -3.4, z1: 3.8, d: 1.0, drop: 0.15, sag: 0.16,
    weft: 'R', front: front.map((c, i) => (i === 5 ? 'L' : c)), minT: 0.3, seed: 73,
  });
  return b;
}

/**
 * Tail bands, left to right as seen from the front: a wide red band, a narrow
 * thread (salmon near the top, maroon lower down) and two red bands.
 */
const TAIL_COLUMNS: { w: number; band: Band | 'N' }[] = [
  { w: 0.62, band: 'R' },
  { w: 0.3, band: 'N' },
  { w: 0.5, band: 'R' },
  { w: 0.58, band: 'R' },
];
const TAIL_WIDTH = TAIL_COLUMNS.reduce((s, c) => s + c.w, 0);

/** Weft rows of the whole tail, top to bottom, split across the three segments. */
const TAIL_ROWS: { h: number; band: Band; seg: 1 | 2 | 3 }[] = [
  { h: 0.75, band: 'R', seg: 1 },
  { h: 0.7, band: 'R', seg: 1 },
  { h: 0.2, band: 'L', seg: 1 },
  { h: 0.7, band: 'R', seg: 1 },
  { h: 0.7, band: 'R', seg: 2 },
  { h: 0.2, band: 'L', seg: 2 },
  { h: 0.55, band: 'D', seg: 2 },
  { h: 0.7, band: 'R', seg: 2 },
  { h: 0.2, band: 'L', seg: 3 },
  { h: 0.7, band: 'R', seg: 3 },
  { h: 0.75, band: 'R', seg: 3 },
];

/** Tail segments, top to bottom. Each lives on its own swinging joint. */
export function buildScarfTail(segment: 1 | 2 | 3): VoxelBuilder {
  const b = new VoxelBuilder();
  const [cx, top, z] = JOINTS.scarf1.pivot;
  let y = top;
  let lowest = top;
  TAIL_ROWS.forEach((row, v) => {
    const y1 = y;
    y -= row.h;
    if (row.seg !== segment) return;
    lowest = y;
    let x = cx - TAIL_WIDTH / 2;
    TAIL_COLUMNS.forEach((col, u) => {
      const thread = col.band === 'N';
      const warp: Band = col.band === 'N' ? (v < 3 ? 'L' : 'D') : col.band;
      const r = hash3(u, v, 4, 74);
      // Salmon threads stand slightly proud, the narrow maroon band sits back.
      const depth = row.band === 'L' ? 0.58 : thread ? 0.46 : 0.52;
      const wob = (hash3(u, v, 5, 74) - 0.5) * 0.06;
      b.box(x + col.w / 2, (y + y1) / 2, z, col.w * 1.01, row.h * 1.01, depth, plaid(warp, row.band, r), 'krama', { rz: wob });
      x += col.w;
    });
  });
  if (segment === 3) {
    // Fringe: five loose tassels of alternating length.
    for (let t = 0; t < 5; t++) {
      const len = (t % 2 ? 0.78 : 1.0) + hash3(t, 9, 9, 75) * 0.18;
      const tx = cx - TAIL_WIDTH / 2 + 0.2 + t * ((TAIL_WIDTH - 0.4) / 4);
      b.box(tx, lowest - len / 2 + 0.05, z, 0.26, len, 0.3, t % 2 ? K.fringe : K.fringeDark, 'krama', {
        rz: (hash3(t, 1, 1, 75) - 0.5) * 0.14,
      });
    }
  }
  return b;
}
