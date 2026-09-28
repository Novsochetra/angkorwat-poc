import { CELL, type HeightField, type Waterfall } from '../heightfield';
import { buildWaterGrid, NONE } from '../water/grid';

/**
 * The rivers as the boat sees them, built once from the height field and
 * kept per field (`riverField`):
 *  - the water level as drawn (water/grid.ts: no water floating over a cliff);
 *  - the current (m/s): along the river, faster in narrow reaches and towards
 *    a fall's lip, slow near the banks and in wide pools, smoothed, on a grid
 *    of 2 m cells read bilinearly;
 *  - the distance to the bank on a 1 m grid (+ on open water, − on land), for
 *    the boat to slide along the banks.
 *
 * Only the water level is made at once. The current and the bank distances
 * wait: the bank distances are made a tile at a time (64 m) where they are
 * first asked for (the landing by the River Gate, as the map is built:
 * boat.ts), the current all at once at its first question; `step` makes
 * the rest in slices (roam/world.ts: in idle time, before he roams). The
 * values are the same either way.
 */
export interface RiverField {
  /** Water surface as drawn at (x, z), or null where there is none. */
  levelAt(x: number, z: number): number | null;
  /** Current at (x, z) (m/s, map x and z), written to `out`; zero on land and still water. */
  flowAt(x: number, z: number, out: { x: number; z: number }): { x: number; z: number };
  /**
   * Distance from (x, z) to the bank for a boat floating at `level` (m): + on
   * open water, − on land; water higher than `level` (up a fall or a step)
   * counts as bank, lower water (down one) as open. Within ±5 m.
   */
  bankAt(x: number, z: number, level: number): number;
  /** The fall whose lip is nearest to (x, z), within `reach` m. */
  fallNear(x: number, z: number, reach: number): Waterfall | null;
  /** The current and every bank tile are made. */
  readonly ready: boolean;
  /** Make more of them, for about `ms` milliseconds; true once all are. */
  step(ms: number): boolean;
  /** Tiles of bank distances made so far (with water near), of all; time spent on the current and the tiles (ms). */
  readonly stats: { tiles: number; wetTiles: number; of: number; ms: number };
}

/** Current of a calm reach about 9 m wide (m/s). */
const CALM = 1.15;
/** Bank distance map: texel size and the farthest distance kept (m; the hull needs about 1). */
const TEXEL = 1;
const BANK_MAX = 5;
/** Bank distance tiles: texels a side. */
const TILE = 64;
/** Rows of the current made between two looks at the clock (`step`). */
const STEP_ROWS = 8;

const fields = new WeakMap<HeightField, RiverField>();

/** The river field of a height field (built on the first call). */
export function riverField(field: HeightField): RiverField {
  let r = fields.get(field);
  if (!r) fields.set(field, (r = buildRiverField(field)));
  return r;
}

/** River current on the map (for world.ts): m/s along x and z, zero on still water or land. */
export function buildFlow(field: HeightField): (x: number, z: number, out: { x: number; z: number }) => { x: number; z: number } {
  const r = riverField(field);
  return (x, z, out) => r.flowAt(x, z, out);
}

/** One tile of bank distances (see `buildRiverField`). */
interface BankTile {
  dist: Float32Array;
  dry: Float32Array;
  level: Float32Array;
}

function buildRiverField(field: HeightField): RiverField {
  const g = buildWaterGrid(field);
  const { nx, nz } = field;
  const n = nx * nz;
  const L = g.level;
  const wet = (c: number) => c >= 0 && L[c] > NONE;
  const sameLevel = (c: number, lv: number) => c >= 0 && L[c] > NONE && Math.abs(L[c] - lv) < 0.5;
  let work = 0;

  // ── Current per cell ───────────────────────────────────────────────────
  // Direction and the lip / fall-foot speed-up come from the water grid (so
  // the boat drifts the way the ripples run); the width across the flow
  // sets the rest: narrow runs fast, a pool is nearly still, and the water
  // slows towards either bank. Made row by row (`current`): the raw current,
  // then two passes smoothing it.
  let fx = new Float32Array(n);
  let fz = new Float32Array(n);
  /** Where the current's making is: the pass (0 raw, 1‥2 smoothing, 3 done) and its next row. */
  const cur = { pass: 0, k: 0, ox: fx, oz: fz };
  const rawRow = (k: number) => {
    for (let i = 0; i < nx; i++) {
      const c = i + k * nx;
      const lv = L[c];
      if (lv <= NONE) continue;
      const sp = Math.hypot(g.flowX[c], g.flowZ[c]);
      if (sp < 1e-3) continue;
      const ux = g.flowX[c] / sp;
      const uz = g.flowZ[c] / sp;
      const [cx, cz] = field.cellCenter(i, k);
      let wl = 0;
      let wr = 0;
      for (let s = 1; s <= 24 && sameLevel(field.index(cx + uz * s, cz - ux * s), lv); s++) wl = s;
      for (let s = 1; s <= 24 && sameLevel(field.index(cx - uz * s, cz + ux * s), lv); s++) wr = s;
      const width = wl + wr + 1;
      const narrow = Math.min(1.5, Math.max(0.3, Math.pow(9 / Math.max(width, 4), 0.7)));
      const bank = 0.35 + 0.65 * Math.sqrt(Math.min(1, (Math.min(wl, wr) + 0.5) / (width / 2)));
      const v = sp * CALM * narrow * bank;
      fx[c] = ux * v;
      fz[c] = uz * v;
    }
  };
  // Smooth it (only over water of the same level), so it never jerks.
  const smoothRow = (k: number, ox: Float32Array, oz: Float32Array) => {
    for (let i = 1; i < nx - 1; i++) {
      const c = i + k * nx;
      if (L[c] <= NONE) continue;
      let sx = 0;
      let sz = 0;
      let w = 0;
      for (let dk = -1; dk <= 1; dk++)
        for (let di = -1; di <= 1; di++) {
          const m = c + di + dk * nx;
          if (!sameLevel(m, L[c])) continue;
          const wt = di === 0 && dk === 0 ? 2 : 1;
          sx += fx[m] * wt;
          sz += fz[m] * wt;
          w += wt;
        }
      ox[c] = sx / w;
      oz[c] = sz / w;
    }
  };
  /** Make more of the current, until `until` (ms); true once it is made. */
  function current(until: number): boolean {
    while (cur.pass < 3) {
      if (cur.pass === 0) {
        const end = Math.min(nz, cur.k + STEP_ROWS);
        for (; cur.k < end; cur.k++) rawRow(cur.k);
        if (cur.k >= nz) {
          cur.pass = 1;
          cur.k = 1;
          cur.ox = new Float32Array(n);
          cur.oz = new Float32Array(n);
        }
      } else {
        const end = Math.min(nz - 1, cur.k + STEP_ROWS);
        for (; cur.k < end; cur.k++) smoothRow(cur.k, cur.ox, cur.oz);
        if (cur.k >= nz - 1) {
          fx = cur.ox;
          fz = cur.oz;
          cur.pass++;
          cur.k = 1;
          if (cur.pass < 3) {
            cur.ox = new Float32Array(n);
            cur.oz = new Float32Array(n);
          }
        }
      }
      if (performance.now() >= until) break;
    }
    return cur.pass >= 3;
  }

  // ── Distance to the bank (1 m texels over the wet part of the map) ────
  let xa = Infinity;
  let xb = -Infinity;
  let za = Infinity;
  let zb = -Infinity;
  for (let k = 0; k < nz; k++)
    for (let i = 0; i < nx; i++) {
      if (!wet(i + k * nx)) continue;
      const [x, z] = field.cellCenter(i, k);
      xa = Math.min(xa, x);
      xb = Math.max(xb, x);
      za = Math.min(za, z);
      zb = Math.max(zb, z);
    }
  const X0 = Math.floor(xa - BANK_MAX - CELL);
  const Z0 = Math.floor(za - BANK_MAX - CELL);
  const W = Math.ceil((xb + BANK_MAX + CELL - X0) / TEXEL);
  const D = Math.ceil((zb + BANK_MAX + CELL - Z0) / TEXEL);
  // Per texel: distance to the bank for its own level (dry land or higher
  // water), and to dry land only (for a boat above it, about to drop in).
  // Made a tile at a time (`tile`); a tile with no water near shares one of
  // the far values.
  const R = Math.ceil(BANK_MAX / CELL) + 1;
  // Cells within R of water (only those get a distance; the rest keep −BANK_MAX):
  // wet cells counted along each row, then down each column, with running sums.
  const rows = new Uint8Array(n);
  const close = new Uint8Array(n);
  const sum = new Int32Array(Math.max(nx, nz) + 1);
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) sum[i + 1] = sum[i] + (wet(i + k * nx) ? 1 : 0);
    for (let i = 0; i < nx; i++) rows[i + k * nx] = sum[Math.min(nx, i + R + 1)] - sum[Math.max(0, i - R)] > 0 ? 1 : 0;
  }
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) sum[k + 1] = sum[k] + rows[i + k * nx];
    for (let k = 0; k < nz; k++) close[i + k * nx] = sum[Math.min(nz, k + R + 1)] - sum[Math.max(0, k - R)] > 0 ? 1 : 0;
  }
  const openFor = (c: number, lv: number) => c >= 0 && c < n && L[c] > NONE && L[c] <= lv + 0.5;
  const dryAt = (c: number) => c >= 0 && c < n && L[c] <= NONE;
  const near: number[] = [];
  const per = CELL / TEXEL;
  const tilesX = Math.max(0, Math.ceil(W / TILE));
  const tilesZ = Math.max(0, Math.ceil(D / TILE));
  const tiles: (BankTile | undefined)[] = new Array(tilesX * tilesZ);
  const newTile = (): BankTile => ({ dist: new Float32Array(TILE * TILE).fill(-BANK_MAX), dry: new Float32Array(TILE * TILE).fill(-BANK_MAX), level: new Float32Array(TILE * TILE).fill(NONE) });
  /** The far values (no water near). */
  const FAR = newTile();
  let made = 0;
  let wetTiles = 0;
  /** The texels of tile (a, b): each from its cell, as the whole map's would be. */
  function tile(a: number, b: number): BankTile {
    const tx0 = a * TILE;
    const tz0 = b * TILE;
    const tx1 = Math.min(W, tx0 + TILE);
    const tz1 = Math.min(D, tz0 + TILE);
    let out: BankTile | null = null;
    // (the cells whose texels can fall in it, a cell more each way)
    const i0 = Math.max(0, Math.floor((X0 + tx0 * TEXEL - field.x0) / CELL) - 1);
    const i1 = Math.min(nx - 1, Math.floor((X0 + tx1 * TEXEL - field.x0) / CELL) + 1);
    const k0 = Math.max(0, Math.floor((Z0 + tz0 * TEXEL - field.z0) / CELL) - 1);
    const k1 = Math.min(nz - 1, Math.floor((Z0 + tz1 * TEXEL - field.z0) / CELL) + 1);
    for (let k = k0; k <= k1; k++)
      for (let i = i0; i <= i1; i++) {
        const c = i + k * nx;
        if (!close[c]) continue;
        const ctx0 = Math.round((field.x0 + i * CELL - X0) / TEXEL);
        const ctz0 = Math.round((field.z0 + k * CELL - Z0) / TEXEL);
        if (ctx0 + per <= tx0 || ctx0 >= tx1 || ctz0 + per <= tz0 || ctz0 >= tz1) continue;
        const lv = L[c];
        const isWet = lv > NONE;
        near.length = 0;
        for (let dk = -R; dk <= R; dk++)
          for (let di = -R; di <= R; di++) {
            const ii = i + di;
            const kk = k + dk;
            if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) continue;
            const m = ii + kk * nx;
            // Water cells measure to the nearest bank (dry: 0, higher water: 1);
            // land cells to the nearest water of any level. (Only cells on the
            // edge between the two can be the nearest: the list stays short.)
            if (isWet) {
              const kind = L[m] <= NONE ? 0 : L[m] > lv + 0.5 ? 1 : -1;
              if (kind < 0 || !(openFor(m - 1, lv) || openFor(m + 1, lv) || openFor(m - nx, lv) || openFor(m + nx, lv))) continue;
              near.push(field.x0 + (ii + 0.5) * CELL, field.z0 + (kk + 0.5) * CELL, kind);
            } else if (L[m] > NONE && (dryAt(m - 1) || dryAt(m + 1) || dryAt(m - nx) || dryAt(m + nx)))
              near.push(field.x0 + (ii + 0.5) * CELL, field.z0 + (kk + 0.5) * CELL, 0);
          }
        if (!isWet && near.length === 0) continue;
        for (let q2 = 0; q2 < per; q2++)
          for (let q1 = 0; q1 < per; q1++) {
            const tx = ctx0 + q1;
            const tz = ctz0 + q2;
            if (tx < tx0 || tz < tz0 || tx >= tx1 || tz >= tz1) continue;
            const x = X0 + (tx + 0.5) * TEXEL;
            const z = Z0 + (tz + 0.5) * TEXEL;
            let bestDry = BANK_MAX * BANK_MAX;
            let bestHigh = BANK_MAX * BANK_MAX;
            for (let q = 0; q < near.length; q += 3) {
              const ex = Math.max(0, Math.abs(x - near[q]) - CELL / 2);
              const ez = Math.max(0, Math.abs(z - near[q + 1]) - CELL / 2);
              if (near[q + 2]) bestHigh = Math.min(bestHigh, ex * ex + ez * ez);
              else bestDry = Math.min(bestDry, ex * ex + ez * ez);
            }
            out ??= newTile();
            const t = tx - tx0 + (tz - tz0) * TILE;
            out.dry[t] = isWet ? Math.sqrt(bestDry) : -Math.sqrt(bestDry);
            out.dist[t] = isWet ? Math.sqrt(Math.min(bestDry, bestHigh)) : out.dry[t];
            out.level[t] = lv;
          }
      }
    made++;
    if (out) wetTiles++;
    return out ?? FAR;
  }
  /** The tile of texel (tx, tz) (inside the map), made if it is not yet. */
  const tileOf = (tx: number, tz: number): BankTile => {
    const a = Math.floor(tx / TILE);
    const b = Math.floor(tz / TILE);
    const id = a + b * tilesX;
    return tiles[id] ?? (tiles[id] = timed(() => tile(a, b)));
  };
  /** (the time spent, for the log) */
  function timed<T>(fn: () => T): T {
    const t0 = performance.now();
    const v = fn();
    work += performance.now() - t0;
    return v;
  }
  let nextTile = 0;

  const tex = (tx: number, tz: number, level: number): number => {
    if (tx < 0 || tz < 0 || tx >= W || tz >= D) return -BANK_MAX;
    const T = tileOf(tx, tz);
    const t = tx - Math.floor(tx / TILE) * TILE + (tz - Math.floor(tz / TILE) * TILE) * TILE;
    const lv = T.level[t];
    // Water up a step is a wall for this boat; water down one is open but for its dry banks.
    if (lv > level + 0.5) return Math.min(T.dist[t], -1);
    return lv > NONE && lv < level - 0.5 ? T.dry[t] : T.dist[t];
  };

  const api: RiverField = {
    levelAt: (x, z) => g.levelAt(x, z),
    flowAt(x, z, out) {
      // (not made yet: all of it now)
      if (cur.pass < 3) timed(() => current(Infinity));
      const gx = (x - field.x0) / CELL - 0.5;
      const gz = (z - field.z0) / CELL - 0.5;
      const i = Math.max(0, Math.min(nx - 2, Math.floor(gx)));
      const k = Math.max(0, Math.min(nz - 2, Math.floor(gz)));
      const tx = Math.max(0, Math.min(1, gx - i));
      const tz = Math.max(0, Math.min(1, gz - k));
      const c = i + k * nx;
      const a = (1 - tx) * (1 - tz);
      const b = tx * (1 - tz);
      const d = (1 - tx) * tz;
      const e = tx * tz;
      out.x = fx[c] * a + fx[c + 1] * b + fx[c + nx] * d + fx[c + nx + 1] * e;
      out.z = fz[c] * a + fz[c + 1] * b + fz[c + nx] * d + fz[c + nx + 1] * e;
      return out;
    },
    bankAt(x, z, level) {
      const gx = (x - X0) / TEXEL - 0.5;
      const gz = (z - Z0) / TEXEL - 0.5;
      const i = Math.floor(gx);
      const k = Math.floor(gz);
      const tx = gx - i;
      const tz = gz - k;
      return (
        (tex(i, k, level) * (1 - tx) + tex(i + 1, k, level) * tx) * (1 - tz) +
        (tex(i, k + 1, level) * (1 - tx) + tex(i + 1, k + 1, level) * tx) * tz
      );
    },
    fallNear(x, z, reach) {
      let best: Waterfall | null = null;
      let bd = reach;
      for (const f of field.falls) {
        const d = Math.hypot(f.x - x, f.z - z);
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      return best;
    },
    get ready() {
      return cur.pass >= 3 && made >= tiles.length;
    },
    step(ms) {
      const t0 = performance.now();
      const until = t0 + ms;
      if (current(until)) {
        for (; nextTile < tiles.length && performance.now() < until; nextTile++) if (!tiles[nextTile]) tiles[nextTile] = tile(nextTile % tilesX, Math.floor(nextTile / tilesX));
      }
      work += performance.now() - t0;
      return this.ready;
    },
    get stats() {
      return { tiles: made, wetTiles, of: tiles.length, ms: Math.round(work) };
    },
  };
  return api;
}
