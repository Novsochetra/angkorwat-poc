import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { inPlan, type Mason, type Tone } from './_sanctuaryMason';

/**
 * Building pieces of Angkor Wat (real size, 1 m
 * blocks): lotus-bud towers, galleries, gate pavilions (gopuras), terraces,
 * stairs and trees. Each piece fills its blocks solid; the mason keeps only
 * the shells.
 */

export type Side = 'n' | 's' | 'e' | 'w';
const SIDES: Side[] = ['n', 's', 'e', 'w'];
/** Outward direction of a side on the map (x, z). */
const OUT: Record<Side, [number, number]> = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };

/** A point `out` blocks out from a centre on a side and `along` blocks across it. */
function onSide(side: Side, cx: number, cz: number, out: number, along: number): [number, number] {
  const [ox, oz] = OUT[side];
  return [cx + ox * out + -oz * along, cz + oz * out + ox * along];
}

/** Corner steps that suit a plan of half size h. */
const notch = (h: number) => (h >= 7 ? 3 : h >= 3 ? 2 : h >= 1 ? 1 : 0);

// ── Lotus-bud tower ──────────────────────────────────────────────────────────

export interface TowerSpec {
  /** Centre block (m). */
  x: number;
  z: number;
  /** First row (m). */
  y: number;
  /** Half size of the body (blocks each side of the centre). */
  half: number;
  /** Top of the bud (m). */
  top: number;
  /** Rows of the body (the sanctum), between its base and its cornice. */
  body: number;
  /** Porch on each side: half width and depth (blocks). */
  porch?: { half: number; depth: number };
  /** Open doorways (dark); other sides get false doors. */
  doors?: Side[];
  /** Doorways with a warm light inside. */
  glow?: Side[];
  /** False doors that light up at night (a lamp behind a screen). */
  lamps?: Side[];
}

/**
 * A Khmer tower: a moulded base, the square body with a porch and pediment on
 * each side, then tiers that step in and get shorter (the corners of every
 * tier carry small antefixes, the middle of each face a pediment), ending in
 * a lotus bud. The shrinking tiers make the curved, bullet-like outline.
 */
export function tower(m: Mason, s: TowerSpec): void {
  m.src = traceSource();
  const { x, z, half } = s;
  let y = s.y;
  // Base: a wide course, then a recessed one.
  m.layer(x, y++, z, half + 1, notch(half + 1), 'ledge');
  m.layer(x, y++, z, half + 1, notch(half + 1), 'face');
  const bodyY = y;
  for (let r = 0; r < s.body; r++) m.layer(x, y++, z, half, notch(half), r === s.body - 2 ? 'ledge' : 'face');
  m.layer(x, y++, z, half + 1, notch(half + 1), 'ledge');

  if (s.porch) porches(m, s, bodyY);

  // The roof: a stack of tiers, each one block narrower than the one below
  // and a little shorter, so the outline is a pointed lotus bud. Pinnacles
  // stand on the corners of every step and a small pediment in the middle of
  // each face; a dark niche marks every tier's face. Then the tip.
  const point = half >= 4 ? 2 : 1;
  const span = s.top - y - point;
  const count = Math.max(1, half - 1);
  const weights = Array.from({ length: count }, (_, i) => 1.35 - (0.8 * i) / Math.max(1, count - 1));
  const wsum = weights.reduce((a, b) => a + b, 0);
  let cum = 0;
  for (let i = 0; i < count; i++) {
    const w = half - 1 - i;
    const from = Math.round(cum);
    cum += (span * weights[i]) / wsum;
    const rows = Math.round(cum) - from;
    if (rows <= 0) continue;
    const below = w + (i === 0 ? 2 : 1);
    const k = Math.ceil(notch(below) / 2);
    for (let r = 0; r < rows; r++) {
      m.layer(x, y, z, w, notch(w), r === 0 ? 'ledge' : w <= 1 ? 'bud' : 'face');
      if (w >= 3 && rows >= 3 && r === Math.floor(rows / 2))
        for (const side of SIDES) {
          const [px, pz] = onSide(side, x, z, w, 0);
          m.put(px, y, pz, 'shadow');
        }
      // Pinnacles on the corners of the step below, a pediment mid-face.
      if (r <= (rows >= 3 ? 1 : 0) && below >= 2) {
        const a = below - k;
        for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) m.put(x + sx * a, y, z + sz * a, r === 0 ? 'ledge' : 'bud');
        if (w >= 2)
          for (const side of SIDES)
            for (let o = -(1 - r); o <= 1 - r; o++) {
              const [px, pz] = onSide(side, x, z, w + 1, o);
              m.put(px, y, pz, 'ledge');
            }
      }
      y++;
    }
  }
  // The tip.
  while (y < s.top) m.put(x, y++, z, 'bud');
}

/** Porches on the four sides of a tower body, with stepped pediments; doorways open or false. */
function porches(m: Mason, s: TowerSpec, bodyY: number): void {
  const { x, z, half } = s;
  const p = s.porch!;
  const rows = s.body;
  const doorHalf = p.half >= 2 ? 1 : 0;
  const doorRows = Math.min(rows - 1, Math.max(3, p.half * 2 + 1));
  for (const side of SIDES) {
    // Porch body and its base.
    for (let out = half + 1; out <= half + p.depth; out++) {
      for (let o = -p.half - 1; o <= p.half + 1; o++) {
        const [px, pz] = onSide(side, x, z, out, o);
        m.put(px, bodyY - 2, pz, 'ledge');
        m.put(px, bodyY - 1, pz, 'face');
      }
      for (let r = 0; r < rows; r++)
        for (let o = -p.half; o <= p.half; o++) {
          const [px, pz] = onSide(side, x, z, out, o);
          m.put(px, bodyY + r, pz, r === rows - 1 ? 'ledge' : 'face');
        }
      // Pediment: steps in by one each row.
      for (let q = 0; q <= p.half + 1; q++)
        for (let o = -(p.half + 1 - q); o <= p.half + 1 - q; o++) {
          const [px, pz] = onSide(side, x, z, out, o);
          m.put(px, bodyY + rows + q, pz, q === 0 ? 'ledge' : 'face');
        }
    }
    // Doorway: a passage into the body, dark at the back (or lit).
    const open = s.doors?.includes(side) || s.glow?.includes(side);
    for (let o = -doorHalf; o <= doorHalf; o++)
      for (let r = 0; r < doorRows; r++) {
        if (open) {
          for (let out = half; out <= half + p.depth; out++) {
            const [px, pz] = onSide(side, x, z, out, o);
            m.clear(px, bodyY + r, pz);
          }
          const [bx, bz] = onSide(side, x, z, half - 1, o);
          m.put(bx, bodyY + r, bz, 'void');
        } else {
          const [px, pz] = onSide(side, x, z, half + p.depth, o);
          m.put(px, bodyY + r, pz, 'shadow');
        }
      }
    if (!open && s.lamps?.includes(side)) {
      const [ox, oz] = OUT[side];
      const [gx, gz] = onSide(side, x, z, half + p.depth + 0.5, 0);
      const w = doorHalf * 2 + 0.6;
      m.glow({ x: gx, y: bodyY + doorRows / 2, z: gz, sx: ox ? 0.12 : w, sy: doorRows - 0.4, sz: oz ? 0.12 : w, color: 0xffa048, kind: 'window' });
    }
    if (s.glow?.includes(side)) {
      const [ox, oz] = OUT[side];
      const [gx, gz] = onSide(side, x, z, half - 0.3, 0);
      const w = doorHalf * 2 + 1;
      m.glow({ x: gx, y: bodyY + doorRows / 2, z: gz, sx: ox ? 0.4 : w, sy: doorRows, sz: oz ? 0.4 : w, color: 0xffb257, kind: 'door' });
    }
  }
}

// ── Galleries ────────────────────────────────────────────────────────────────

export interface GalleryStyle {
  /** Width of the gallery (blocks, outer face to inner face). */
  depth: number;
  /** Rows of the plinth, the columns and the roof. */
  plinth: number;
  cols: number;
  roof: number;
  /** A column every `rhythm` blocks. */
  rhythm: number;
  /** Share of the bays with a lamp inside (lit at night). */
  lamps?: number;
}

/**
 * A rectangular gallery ring (x0‥x1, z0‥z1 are its outer faces, inclusive):
 * a plinth, the outer colonnade with dark bays, the inner wall with windows
 * on the court, a lintel band and a stepped roof with a ridge.
 */
export function galleryRing(m: Mason, x0: number, z0: number, x1: number, z1: number, y: number, st: GalleryStyle): void {
  m.src = traceSource();
  const D = st.depth;
  const colTop = y + st.plinth + st.cols;
  // Base course, one block out.
  for (let x = x0 - 1; x <= x1 + 1; x++)
    for (let z = z0 - 1; z <= z1 + 1; z++) {
      const out = x === x0 - 1 || x === x1 + 1 || z === z0 - 1 || z === z1 + 1;
      if (out && !m.wet(x, z)) m.put(x, y, z, 'ledge');
    }
  for (let x = x0; x <= x1; x++)
    for (let z = z0; z <= z1; z++) {
      const dx = Math.min(x - x0, x1 - x);
      const dz = Math.min(z - z0, z1 - z);
      const c = Math.min(dx, dz);
      if (c >= D) continue;
      const corner = dx < D && dz < D;
      const s = dz <= dx ? x : z;
      const bay = ((s % st.rhythm) + st.rhythm) % st.rhythm;
      const wet = m.wet(x, z);
      for (let r = 0; r < st.plinth; r++) if (!(wet && r === 0 && bay !== 0)) m.put(x, y + r, z, r === st.plinth - 1 && c === 0 ? 'ledge' : 'face');
      for (let yy = y + st.plinth; yy < colTop; yy++) {
        const r = yy - y - st.plinth;
        if (corner) m.put(x, yy, z, 'face');
        else if (c === 0) {
          if (bay === 0) m.put(x, yy, z, 'face');
        } else if (c === D - 1) {
          const window = bay === Math.floor(st.rhythm / 2) && r >= 1 && r < st.cols;
          m.put(x, yy, z, window ? 'void' : 'inner');
        }
      }
      m.put(x, colTop, z, c === 0 || c === D - 1 ? 'ledge' : 'inner');
      for (let t = 0; t < st.roof; t++) {
        if (Math.min(c, D - 1 - c) < t) continue;
        m.put(x, colTop + 1 + t, z, t === st.roof - 1 ? 'ridge' : 'roof');
      }
      // Lamps hung inside some bays.
      if (st.lamps && !corner && c === 1 && bay === Math.floor(st.rhythm / 2) && hash3(x, y, z, 91) < st.lamps) {
        m.glow({ x, y: colTop - 0.6, z, sx: 0.5, sy: 0.6, sz: 0.5, color: 0xffa24a, kind: 'window' });
      }
    }
}

// ── Gate pavilion (gopura) and corner pavilions ─────────────────────────────

export interface GopuraSpec {
  x: number;
  z: number;
  y: number;
  /** Half sizes of the pavilion (x, z). */
  hx: number;
  hz: number;
  /** Rows: plinth, walls. */
  plinth: number;
  walls: number;
  /** Passage through the middle (a gate), its door facing `front`. */
  passage?: boolean;
  front?: Side;
  /** Warm light in the front doorway. */
  glow?: boolean;
  /** Tower on the roof. */
  tower?: { half: number; top: number; body?: number };
  /** Porch (half width, depth) on the front, and on the back unless `backPorch` is false. */
  porch?: { half: number; depth: number };
  backPorch?: boolean;
}

/**
 * A gate pavilion: plinth, walls, a stepped roof (or a lotus tower), and
 * porches whose doorways carry the double stepped pediment of Khmer gates.
 * Gates have a passage through (3 blocks wide), dark inside, or lit.
 */
export function gopura(m: Mason, s: GopuraSpec): void {
  m.src = traceSource();
  const { x, z, hx, hz } = s;
  let y = s.y;
  const n = 2;
  for (let r = 0; r < s.plinth; r++) m.rect(x, y++, z, hx + 1, hz + 1, n, r === 0 ? 'ledge' : 'face');
  const wallY = y;
  for (let r = 0; r < s.walls; r++) m.rect(x, y++, z, hx, hz, n, r === s.walls - 2 ? 'ledge' : 'face');
  m.rect(x, y++, z, hx + 1, hz + 1, n, 'ledge');
  const roofY = y;
  if (!s.tower) {
    // Stepped roof: shrinking tiers.
    let [rx, rz] = [hx - 1, hz - 1];
    for (let t = 0; t < 3 && rx >= 1 && rz >= 1; t++) {
      m.rect(x, y++, z, rx, rz, n, 'roof');
      m.rect(x, y++, z, rx, rz, n, t === 2 || rz <= 2 ? 'ridge' : 'roof');
      rx -= 2;
      rz -= 2;
    }
  }
  const front = s.front ?? 's';
  const back: Side = front === 's' ? 'n' : front === 'n' ? 's' : front === 'e' ? 'w' : 'e';
  const faces: Side[] = s.backPorch === false ? [front] : [front, back];
  const along = front === 's' || front === 'n' ? hz : hx;
  const p = s.porch;
  if (p) {
    for (const side of faces) {
      for (let out = along + 1; out <= along + p.depth; out++) {
        for (let o = -p.half - 1; o <= p.half + 1; o++) {
          const [px, pz] = onSide(side, x, z, out, o);
          for (let r = 0; r < s.plinth; r++) m.put(px, s.y + r, pz, r === 0 ? 'ledge' : 'face');
        }
        for (let r = 0; r < s.walls; r++)
          for (let o = -p.half; o <= p.half; o++) {
            const [px, pz] = onSide(side, x, z, out, o);
            m.put(px, wallY + r, pz, 'face');
          }
        for (let o = -p.half - 1; o <= p.half + 1; o++) {
          const [px, pz] = onSide(side, x, z, out, o);
          m.put(px, wallY + s.walls, pz, 'ledge');
        }
      }
      // Two stacked stepped pediments: the lower one at the porch front, the
      // upper one a block back and higher.
      const ped = (out0: number, out1: number, y0: number, w: number) => {
        for (let q = 0; q <= w; q++)
          for (let o = -(w - q); o <= w - q; o++)
            for (let out = out0; out <= out1; out++) {
              const [px, pz] = onSide(side, x, z, out, o);
              m.put(px, y0 + q, pz, q === 0 || o === -(w - q) || o === w - q ? 'ledge' : 'face');
            }
      };
      ped(along, along + p.depth, wallY + s.walls + 1, p.half + 1);
      ped(along - 1, along + p.depth - 1, wallY + s.walls + 3, p.half);
    }
  }
  if (s.passage) {
    const depth = along + (p?.depth ?? 0);
    const rows = Math.min(s.walls - 1, 5);
    const lo = s.backPorch === false ? -along : -depth;
    for (let o = -1; o <= 1; o++)
      for (let out = lo; out <= depth; out++)
        for (let r = 0; r < rows; r++) {
          const [px, pz] = onSide(front, x, z, out, o);
          m.clear(px, wallY + r, pz);
        }
    // Dark lining just inside, so the doorway reads as deep.
    for (let out = lo + 1; out <= depth - 1; out++) {
      for (const o of [-2, 2])
        for (let r = 0; r < rows; r++) {
          const [px, pz] = onSide(front, x, z, out, o);
          m.put(px, wallY + r, pz, 'void');
        }
      for (let o = -1; o <= 1; o++) {
        const [px, pz] = onSide(front, x, z, out, o);
        m.put(px, wallY + rows, pz, 'void');
      }
    }
    if (s.glow) {
      // The lit inner door, two blocks in from the porch front.
      const [ox, oz] = OUT[front];
      const [gx, gz] = onSide(front, x, z, depth - 2, 0);
      m.glow({ x: gx, y: wallY + rows / 2, z: gz, sx: ox ? 0.4 : 3, sy: rows, sz: oz ? 0.4 : 3, color: 0xffb65c, kind: 'door' });
      for (let o = -1; o <= 1; o++)
        for (let r = 0; r < rows; r++) {
          const [px, pz] = onSide(front, x, z, depth - 3, o);
          m.put(px, wallY + r, pz, 'void');
        }
    }
    // Steps up to the plinth, in front of the doors.
    for (const side of faces)
      for (let q = 1; q < s.plinth; q++)
        for (let o = -2; o <= 2; o++) {
          const [px, pz] = onSide(side, x, z, (side === front || s.backPorch !== false ? depth : along) + q, o);
          for (let r = 0; r < s.plinth - q; r++) m.put(px, s.y + r, pz, 'ledge');
        }
  }
  if (s.tower) tower(m, { x, z, y: roofY, half: s.tower.half, top: s.tower.top, body: s.tower.body ?? 2 });
}

// ── Terraces and stairs ──────────────────────────────────────────────────────

/**
 * A solid terrace (x0‥x1, z0‥z1 its main faces) from `y` up to `top` (its
 * floor), with a base course and a cornice one block out, and a recessed band.
 * Columns over a stream are left out.
 */
export function terrace(m: Mason, x0: number, z0: number, x1: number, z1: number, y: number, top: number): void {
  m.src = traceSource();
  const rows = top - y;
  for (let r = 0; r < rows; r++) {
    const out = r === 0 || r === rows - 1 ? 1 : 0;
    const tone: Tone = r === rows - 1 || r === 0 ? 'ledge' : 'face';
    for (let x = x0 - out; x <= x1 + out; x++)
      for (let z = z0 - out; z <= z1 + out; z++) {
        if (!inPlan(x - (x0 + x1) / 2, z - (z0 + z1) / 2, (x1 - x0) / 2 + out, (z1 - z0) / 2 + out, 1)) continue;
        if (m.wet(x, z)) continue;
        m.put(x, y + r, z, tone);
      }
  }
}

/**
 * A stepped base: per row (from the bottom) how far it stands out of the
 * rectangle hx × hz — for the tall base of the top level (the Bakan), with its
 * mouldings. Rows that stand out further than the one above are cornices.
 */
export function steppedBase(m: Mason, cx: number, cz: number, y: number, hx: number, hz: number, out: number[]): void {
  m.src = traceSource();
  out.forEach((o, r) => {
    const tone: Tone = (r > 0 && out[r - 1] < o) || (r < out.length - 1 && out[r + 1] < o) ? 'ledge' : 'face';
    m.rect(cx, y + r, cz, hx + o, hz + o, 2, tone);
  });
}

/**
 * A flight of stairs leaving a centre (cx, cz) towards `side`: its top at
 * `outHigh` blocks out (row `yHigh` is the landing), its foot at `outLow`
 * (standing on `yLow`); `half` blocks each side of the axis, with low walls.
 */
export function flight(m: Mason, cx: number, cz: number, side: Side, outHigh: number, outLow: number, half: number, yLow: number, yHigh: number, walls = true): void {
  m.src = traceSource();
  const n = outLow - outHigh + 1;
  const rise = yHigh - yLow;
  for (let k = 0; k < n; k++) {
    const out = outLow - k;
    const h = yLow + Math.ceil(((k + 1) * rise) / n);
    for (let o = -half; o <= half; o++) {
      const [x, z] = onSide(side, cx, cz, out, o);
      for (let y = yLow; y < h; y++) m.put(x, y, z, y === h - 1 ? 'ledge' : 'face');
    }
    if (walls)
      for (const o of [-half - 1, half + 1]) {
        const [x, z] = onSide(side, cx, cz, out, o);
        const top = Math.min(yHigh, h);
        for (let y = yLow; y <= top; y++) m.put(x, y, z, y === top ? 'ledge' : 'face');
      }
  }
}

// ── Trees and vines ──────────────────────────────────────────────────────────

/** A courtyard tree: a trunk and a lumpy crown of 1 m leaf blocks. */
export function tree(m: Mason, x: number, z: number, y: number, trunk: number, r: number, seed: number): void {
  m.src = traceSource();
  for (let yy = y; yy < y + trunk; yy++) m.put(x, yy, z, 'bark');
  const cy = y + trunk + r * 0.35;
  const R = Math.ceil(r);
  for (let dy = -R; dy <= R; dy++)
    for (let dz = -R; dz <= R; dz++)
      for (let dx = -R; dx <= R; dx++) {
        const lump = (hash3((x + dx) >> 1, (y + dy) >> 1, (z + dz) >> 1, seed) - 0.5) * 0.9;
        const d = Math.hypot(dx, (dy + 0.5) * 1.45, dz);
        if (d > r + lump) continue;
        m.put(x + dx, Math.round(cy + dy), z + dz, 'leaf');
      }
}

/** Vines hanging down a wall face from `y` (a strip of leaf blocks of random length). */
export function vine(m: Mason, x: number, z: number, y: number, len: number): void {
  m.src = traceSource();
  for (let r = 0; r < len; r++) m.put(x, y - r, z, 'leaf');
}
