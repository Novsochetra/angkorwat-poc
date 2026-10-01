import type { HeightField } from '../heightfield';
import type { Proto } from '../veg/proto';
import { emergent } from '../veg/species';
import type { RoamWorld } from './types';
import { DECK_R, DECK_T, RAIL_BAND, RAIL_WALL, SIDE, STAIR_W, stairPosts, stairTop, type ZipPlan, type ZipStair, type ZipStation } from './_zipPlan';

/**
 * The zip line's trees, platforms and stairs in the walk map (_zipPlan.ts):
 * the trunks and their root flares, the octagonal decks, their rails, the
 * stairs with their rails and the posts under them, worked out from the plan
 * (no blocks: the roaming world's walk map is made from the map's parts, and
 * the zip line's meshes are roaming's own). `install` lays them over the
 * world's `standAt`, `groundAt`, `ceilingAt` and `woodAt`, as roam.ts lays the
 * take-off ramps' decks (launchSpots.ts `deckAt`): where none of them is,
 * every answer is the world's own.
 *
 * The rails are walls: in the walk map they reach `RAIL_WALL` m over the deck
 * (no hop or jump tops them) and `RAIL_BAND` m out past the rail (so the
 * walker's probes, 0.42 m round him, cannot step between them). Where a line
 * leaves or arrives the deck has no rail: walking off there he falls, as off
 * any ledge (the parachute for a long fall).
 */

/** A tree of the zip line as planted (the jungle's emergent prototype): stamped with its trunk cell at (px, pz), standing on `y`. */
export interface ZipTree {
  proto: Proto;
  px: number;
  pz: number;
  y: number;
}

const trees = new Map<number, ZipTree>();

/** A station's tree (made the first time it is asked for: the walk map near it, or the meshes). */
export function zipTree(field: HeightField, s: ZipStation): ZipTree {
  let t = trees.get(s.index);
  if (t) return t;
  const proto = emergent({ s: 1, h: s.tree.h, r: s.tree.r, seed: s.tree.seed });
  // (as the jungle plants one: the trunk cell's middle, on the lowest corner of its footprint: vegetation.ts `plant`)
  const y = Math.min(field.heightAt(s.x, s.z), field.heightAt(s.x - 1, s.z - 1), field.heightAt(s.x + 1, s.z + 1), field.heightAt(s.x - 1, s.z + 1), field.heightAt(s.x + 1, s.z - 1));
  t = { proto, px: Math.floor(s.x) + 0.5, pz: Math.floor(s.z) + 0.5, y };
  trees.set(s.index, t);
  return t;
}

// ── Pieces ─────────────────────────────────────────────────────────────────

/** A box turned about y: its middle, its long axis (unit), half lengths along it and across, bottom and top; something to stand on or a wall; planks. */
interface BoxPiece {
  kind: 0;
  cx: number;
  cz: number;
  ux: number;
  uz: number;
  ha: number;
  hc: number;
  y0: number;
  y1: number;
  floor: boolean;
  wood: boolean;
}
/** The octagonal deck (round the trunk's middle, its first side facing `yaw`). */
interface DeckPiece {
  kind: 1;
  cx: number;
  cz: number;
  sin: number;
  cos: number;
  y0: number;
  y1: number;
}
/** A stair's treads (from the deck's side down along (ux, uz)), or a rail beside them (`c0`‥`c1` across, + its left). */
interface StairPiece {
  kind: 2;
  stair: ZipStair;
  ux: number;
  uz: number;
  c0: number;
  c1: number;
  rail: boolean;
}
type Piece = BoxPiece | DeckPiece | StairPiece;

interface Zone {
  cx: number;
  cz: number;
  r2: number;
  pieces: Piece[];
  /** The deck's top (for `onDeck`). */
  deck: number;
}

/** The tread's slab under its top (m): what stands over the room under a stair. */
const TREAD = 0.32;
/** A post under a stair, square (m, wider than drawn: the walker's probes stand 0.42 m round him). */
const POST = 0.5;

function box(cx: number, cz: number, ux: number, uz: number, ha: number, hc: number, y0: number, y1: number, floor: boolean, wood = false): BoxPiece {
  return { kind: 0, cx, cz, ux, uz, ha, hc, y0, y1, floor, wood };
}

/** Every piece of station `s` that stands in the walk map. */
function piecesOf(field: HeightField, s: ZipStation): Piece[] {
  const out: Piece[] = [];
  // The trunk and its root flares (the prototype's free boxes, square to the map).
  const t = zipTree(field, s);
  for (const b of t.proto.boxes) if (!b.leaf) out.push(box(t.px + b.x, t.pz + b.z, 1, 0, b.sx / 2, b.sz / 2, t.y + b.y - b.sy / 2, t.y + b.y + b.sy / 2, true));
  // The deck.
  out.push({ kind: 1, cx: s.x, cz: s.z, sin: Math.sin(s.yaw), cos: Math.cos(s.yaw), y0: s.deck - DECK_T, y1: s.deck });
  // The rails round it: a wall along each side with no line or stair at it (and beside the stair, from its rails to the corners).
  const cIn = 0.12;
  for (let k = 0; k < 8; k++) {
    const a = s.yaw + (k * Math.PI) / 4;
    const nx = Math.sin(a);
    const nz = Math.cos(a);
    // (its tangent: the side's long axis)
    const tx = nz;
    const tz = -nx;
    const d = DECK_R + (RAIL_BAND - cIn) / 2;
    const hc = (RAIL_BAND + cIn) / 2;
    const half = SIDE / 2 + 0.3;
    const stairHere = s.stair && Math.abs(Math.atan2(Math.sin(a - s.stair.yaw), Math.cos(a - s.stair.yaw))) < 0.01;
    if (stairHere) {
      const w = STAIR_W / 2;
      for (const sgn of [1, -1]) {
        const m = (w + half) / 2;
        out.push(box(s.x + nx * d + tx * m * sgn, s.z + nz * d + tz * m * sgn, tx, tz, (half - w) / 2, hc, s.deck - DECK_T, s.deck + RAIL_WALL, false));
      }
    } else if (!s.open.includes(k)) out.push(box(s.x + nx * d, s.z + nz * d, tx, tz, half, hc, s.deck - DECK_T, s.deck + RAIL_WALL, false));
  }
  // The stair: its treads and landings, its rails, the posts under it.
  const st = s.stair;
  if (st) {
    const ux = Math.sin(st.yaw);
    const uz = Math.cos(st.yaw);
    const w = STAIR_W / 2;
    out.push({ kind: 2, stair: st, ux, uz, c0: -w, c1: w, rail: false });
    out.push({ kind: 2, stair: st, ux, uz, c0: w - cIn, c1: w + RAIL_BAND, rail: true });
    out.push({ kind: 2, stair: st, ux, uz, c0: -w - RAIL_BAND, c1: -w + cIn, rail: true });
    for (const p of stairPosts(st)) {
      const x = st.x + ux * p.a + uz * p.c;
      const z = st.z + uz * p.a - ux * p.c;
      out.push(box(x, z, ux, uz, POST / 2, POST / 2, field.heightAt(x, z) - 0.3, p.y - TREAD, true));
    }
  }
  return out;
}

// ── The walk map's part ─────────────────────────────────────────────────────

/** Spans found at a point (bottom, top, standable, planks), merged and sorted. */
const LO = new Float64Array(48);
const HI = new Float64Array(48);
const FLOOR = new Uint8Array(48);
const WOOD = new Uint8Array(48);
/** Gaps thinner than this between two spans are closed (m). */
const SEAM = 0.05;

export interface ZipWalk {
  /** The station whose deck feet at (x, y, z) stand on (within `tol` m of its top), or −1. */
  onDeck(x: number, z: number, y: number, tol?: number): number;
  /** The highest of the zip line's own tops at (x, z) to stand on (−Infinity where it has none). */
  topAt(x: number, z: number): number;
  /** Lay it over the world's walk map (once). */
  install(world: RoamWorld): void;
}

export function createZipWalk(field: HeightField, plan: ZipPlan): ZipWalk {
  /** Each station's zone (its pieces made the first time something asks near it). */
  const zones: (Zone | null)[] = plan.stations.map(() => null);
  const reach = plan.stations.map((s) => DECK_R + RAIL_BAND + (s.stair ? s.stair.length + 1 : 0) + 1.5);
  const zoneOf = (i: number): Zone => {
    let z = zones[i];
    if (!z) {
      const s = plan.stations[i];
      z = zones[i] = { cx: s.x, cz: s.z, r2: reach[i] * reach[i], pieces: piecesOf(field, s), deck: s.deck };
      // (a stair reaches out from the deck: the zone's circle round both)
      if (s.stair) {
        const half = (DECK_R + s.stair.length) / 2;
        z.cx = s.x + Math.sin(s.stair.yaw) * (half - DECK_R / 2);
        z.cz = s.z + Math.cos(s.stair.yaw) * (half - DECK_R / 2);
        const r = Math.max(DECK_R + RAIL_BAND + 1.5 + (half - DECK_R / 2), half + DECK_R / 2 + 1.5);
        z.r2 = r * r;
      }
    }
    return z;
  };
  // (rough circles first: most questions are nowhere near)
  const rough = plan.stations.map((s, i) => ({ x: s.x, z: s.z, r2: (reach[i] + 1) * (reach[i] + 1) }));

  /** The spans at (x, z): into LO / HI / FLOOR / WOOD, sorted by bottom and merged; how many. */
  function gather(x: number, z: number): number {
    let n = 0;
    for (let i = 0; i < rough.length; i++) {
      const r = rough[i];
      const ddx = x - r.x;
      const ddz = z - r.z;
      if (ddx * ddx + ddz * ddz > r.r2) continue;
      const zone = zoneOf(i);
      for (const p of zone.pieces) {
        let lo = 0;
        let hi = 0;
        let floor = true;
        let wood = false;
        if (p.kind === 0) {
          const dx = x - p.cx;
          const dz = z - p.cz;
          const a = dx * p.ux + dz * p.uz;
          const c = dz * p.ux - dx * p.uz;
          if (a < -p.ha || a > p.ha || c < -p.hc || c > p.hc) continue;
          lo = p.y0;
          hi = p.y1;
          floor = p.floor;
          wood = p.wood;
        } else if (p.kind === 1) {
          const dx = x - p.cx;
          const dz = z - p.cz;
          const lz = dx * p.sin + dz * p.cos;
          const lx = dx * p.cos - dz * p.sin;
          const r = DECK_R;
          if (lx < -r || lx > r || lz < -r || lz > r || Math.abs(lx + lz) > r * Math.SQRT2 || Math.abs(lx - lz) > r * Math.SQRT2) continue;
          lo = p.y0;
          hi = p.y1;
          wood = true;
        } else {
          const st = p.stair;
          const dx = x - st.x;
          const dz = z - st.z;
          const a = dx * p.ux + dz * p.uz;
          // (+ across: the stair's left looking down it)
          const c = dx * p.uz - dz * p.ux;
          if (a < 0 || a > st.length || c < p.c0 || c > p.c1) continue;
          const top = stairTop(st, a);
          if (Number.isNaN(top)) continue;
          lo = top - TREAD;
          hi = p.rail ? top + RAIL_WALL : top;
          floor = !p.rail;
          wood = !p.rail;
        }
        if (n >= LO.length) break;
        // (insert, keeping them sorted by bottom)
        let j = n++;
        while (j > 0 && LO[j - 1] > lo) {
          LO[j] = LO[j - 1];
          HI[j] = HI[j - 1];
          FLOOR[j] = FLOOR[j - 1];
          WOOD[j] = WOOD[j - 1];
          j--;
        }
        LO[j] = lo;
        HI[j] = hi;
        FLOOR[j] = floor ? 1 : 0;
        WOOD[j] = wood ? 1 : 0;
      }
    }
    // Merge what overlaps or touches (the top is the higher one's; a wall in it makes it a wall).
    let m = 0;
    for (let i = 0; i < n; i++) {
      if (m > 0 && LO[i] <= HI[m - 1] + SEAM) {
        if (HI[i] >= HI[m - 1]) {
          HI[m - 1] = HI[i];
          FLOOR[m - 1] = FLOOR[i];
          WOOD[m - 1] = WOOD[i];
        }
        continue;
      }
      LO[m] = LO[i];
      HI[m] = HI[i];
      FLOOR[m] = FLOOR[i];
      WOOD[m] = WOOD[i];
      m++;
    }
    return m;
  }

  /** standAt with the zip line's spans over the world's answer `g` there. */
  function stand(x: number, z: number, y: number, up: number, h: number, g: number): number {
    const n = gather(x, z);
    if (!n) return g;
    const top = y + up;
    let k = -1;
    for (let i = 0; i < n; i++) if (LO[i] <= top) k = i;
    if (k >= 0) {
      // (a wall of the zip line's: a rail, a trunk, a stair's side)
      if (HI[k] > top) return NaN;
      const f = HI[k];
      if (Number.isNaN(g) || f >= g - 1e-6) {
        const next = k + 1 < n ? LO[k + 1] : Infinity;
        return next - f < h ? NaN : f;
      }
    }
    if (Number.isNaN(g)) return NaN;
    // On the world's floor: nothing of the zip line's in his room over it (a stair's low end, a deck over his head).
    for (let i = 0; i < n; i++) if (LO[i] < g + h && HI[i] > g + 1e-6) return NaN;
    return g;
  }

  /** Each tree's trunk as a box (x0, y0, z0, x1, y1, z1), from its prototype's bark blocks (not its root flares). */
  const trunks: (Float64Array | null)[] = plan.stations.map(() => null);
  function trunkBox(i: number): Float64Array {
    let b = trunks[i];
    if (b) return b;
    const s = plan.stations[i];
    const t = zipTree(field, s);
    b = new Float64Array([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]);
    for (const q of t.proto.boxes) {
      if (q.leaf || Math.abs(q.x + 0.5) > 0.6 || Math.abs(q.z + 0.5) > 0.6) continue;
      b[0] = Math.min(b[0], t.px + q.x - q.sx / 2);
      b[1] = Math.min(b[1], t.y + q.y - q.sy / 2);
      b[2] = Math.min(b[2], t.pz + q.z - q.sz / 2);
      b[3] = Math.max(b[3], t.px + q.x + q.sx / 2);
      b[4] = Math.max(b[4], t.y + q.y + q.sy / 2);
      b[5] = Math.max(b[5], t.pz + q.z + q.sz / 2);
    }
    return (trunks[i] = b);
  }

  const api: ZipWalk = {
    onDeck(x, z, y, tol = 0.35) {
      for (let i = 0; i < plan.stations.length; i++) {
        const s = plan.stations[i];
        const dx = x - s.x;
        const dz = z - s.z;
        if (dx * dx + dz * dz > (DECK_R * 1.09) ** 2 || Math.abs(y - s.deck) > tol) continue;
        const sn = Math.sin(s.yaw);
        const cs = Math.cos(s.yaw);
        const lz = dx * sn + dz * cs;
        const lx = dx * cs - dz * sn;
        if (Math.abs(lx) <= DECK_R && Math.abs(lz) <= DECK_R && Math.abs(lx + lz) <= DECK_R * Math.SQRT2 && Math.abs(lx - lz) <= DECK_R * Math.SQRT2) return i;
      }
      return -1;
    },
    topAt(x, z) {
      const n = gather(x, z);
      let top = -Infinity;
      for (let i = 0; i < n; i++) if (FLOOR[i]) top = Math.max(top, HI[i]);
      return top;
    },
    install(world) {
      const { groundAt, standAt, ceilingAt, woodAt, softClearance } = world;
      // The follow camera keeps out of the trunks as out of the jungle's (it comes in softly to this side of them; the
      // near fade sees through what is left): only rays near a tree ask, its trunk's box made the first time.
      if (softClearance)
        world.softClearance = (ax, ay, az, bx, by, bz, leave) => {
          let c = softClearance(ax, ay, az, bx, by, bz, leave);
          for (let i = 0; i < plan.stations.length; i++) {
            const s = plan.stations[i];
            const r = 40;
            if (Math.min(ax, bx) > s.x + r || Math.max(ax, bx) < s.x - r || Math.min(az, bz) > s.z + r || Math.max(az, bz) < s.z - r) continue;
            const t = trunkBox(i);
            c = Math.min(c, rayBox(ax, ay, az, bx, by, bz, t, !!leave));
          }
          return c;
        };
      world.groundAt = (x, z) => Math.max(groundAt(x, z), api.topAt(x, z));
      if (standAt) world.standAt = (x, z, y, up, h) => stand(x, z, y, up, h, standAt(x, z, y, up, h));
      world.ceilingAt = (x, z, y) => {
        const c = ceilingAt ? ceilingAt(x, z, y) : Infinity;
        const n = gather(x, z);
        for (let i = 0; i < n; i++) if (LO[i] > y) return Math.min(c, LO[i]);
        return c;
      };
      world.woodAt = (x, z, y) => {
        if (woodAt?.(x, z, y)) return true;
        const n = gather(x, z);
        for (let i = 0; i < n; i++) if (WOOD[i] && Math.abs(HI[i] - y) < 0.15) return true;
        return false;
      };
    },
  };
  return api;
}

/** The part of a segment inside a box so far (`rayBox`, reused). */
const SPAN = { t0: 0, t1: 1 };

/**
 * The free part (0‥1) of the segment a → b before it enters box `q` (x0, y0, z0, x1, y1, z1); 1 when it misses.
 * Starting inside it: 0, or with `leave` 1 (from where it comes out: nothing else of a box is in the way).
 */
function rayBox(ax: number, ay: number, az: number, bx: number, by: number, bz: number, q: Float64Array, leave: boolean): number {
  SPAN.t0 = 0;
  SPAN.t1 = 1;
  const span = SPAN;
  if (!slab(ax, bx - ax, q[0], q[3], span) || !slab(ay, by - ay, q[1], q[4], span) || !slab(az, bz - az, q[2], q[5], span)) return 1;
  // (a starts inside: t0 stayed 0)
  if (span.t0 <= 0) return leave ? 1 : 0;
  return span.t0;
}

/** Narrow `span` to where o + d·t is between lo and hi on one axis; false if it never is. */
function slab(o: number, d: number, lo: number, hi: number, span: { t0: number; t1: number }): boolean {
  if (Math.abs(d) < 1e-9) return o >= lo && o <= hi;
  let u0 = (lo - o) / d;
  let u1 = (hi - o) / d;
  if (u0 > u1) {
    const w = u0;
    u0 = u1;
    u1 = w;
  }
  if (u0 > span.t0) span.t0 = u0;
  if (u1 < span.t1) span.t1 = u1;
  return span.t0 <= span.t1;
}
