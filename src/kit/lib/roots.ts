import type { VoxelMaterialKey } from '../../voxel/materials';
import { hash3, valueNoise3 } from '../../voxel/random';
import type { Surf, VoxelBox, VoxelBuilder, VoxelGrid } from '../../voxel/VoxelBuilder';
import { rng, tone } from '../shapes';
import { barkSurf, leafSurf } from '../surface';

/**
 * Tree roots of the world kit (plan §18.2 ⑦ Roots, §20 ⑩ Roots, and the root
 * flare of the §18.1 trees): gnarled roots that snake over the ground, fork and
 * taper, dip in and out of the soil, grip over stones and steps and hang down
 * the sides of a tile; stumps with a broken top showing the growth rings; root
 * clusters and bowed roots without a stump.
 *
 * Two ways to lay roots: grown ones ({@link rootNetwork}, {@link stump},
 * {@link rootCluster}, {@link rootArch}) fork and dip at random; composed ones
 * ({@link trail}, {@link cutStump}, {@link hollowStump}, {@link rootLimb}) are
 * continuous and fork only where told, for a designed, legible silhouette.
 *
 * Everything is drawn into a {@link VoxelGrid} the caller owns, in metres of
 * piece space; its cell size sets the resolution (the kit's 1/16 m texel suits
 * roots of any size, a coarser grid gives chunkier ones). Ghost the ground under
 * the roots first (as `topGrid` does) so they get the dark contact shadow, and
 * finish with {@link commitRoots} instead of the grid's own `commit()`.
 */

/** Colours of a root system (albedo). */
export interface RootLook {
  /** Bark tones, one per knuckle along a root (and per stave of a stump): the sheets' blocky segments. */
  bark: readonly number[];
  /** The dark rim along the underside of a root lying on the ground. */
  under: readonly number[];
  /** Cut wood of a stump top: the pith, then the growth rings outwards. */
  rings: readonly number[];
  /** Bark-pattern moss on the upper faces (0‥1). */
  moss: number;
  /** Lighter tones along the back of thick roots and on a trunk's ridges (default: none). */
  ridge?: readonly number[];
  /** Shaded lower layer of roots lying on the ground two or more cells high, under a lit ridge (default: none). */
  flank?: readonly number[];
  /** Bark of a stump's trunk, when it differs from its roots' (default: `bark`). */
  trunk?: readonly number[];
}

/**
 * Looks sampled from the sheets and calibrated in the studio: albedos fitted
 * until the render matches the sheet — the pale roots' tops against the §18.2
 * top view; the brown bark halfway between the §20 stump's lit front face and
 * its roots' lit tops (the studio lights tops more, sides less than the sheet).
 */
export const ROOT_LOOK = {
  /** §18.2: pale, sun-bleached tan roots over dark humus. */
  pale: {
    bark: [0xa98660, 0xb69165, 0xc29c6b, 0xc3a070],
    under: [0x6d5949, 0x62504b],
    rings: [0x4d403a, 0xbe9d76, 0x9d8262, 0xd1c1ab, 0x69574b],
    moss: 0.3,
  },
  /** §20: warm brown bark of a big stump and its buttress roots. */
  brown: {
    bark: [0x806452, 0xa37c62, 0xbd8f6c, 0xcb9b72],
    under: [0x6f5b51, 0x62524f],
    rings: [0x433736, 0xc6a071, 0xa27f5b, 0xcaa97c, 0x584540],
    moss: 0.45,
  },
  /**
   * §18.2 main tile: clean pale roots — close tones, so the knuckles read as
   * soft segments rather than a patchwork — a lit back over shaded flanks,
   * from a darker grey-brown stump with a pale cut face split by dark cracks.
   */
  clean: {
    bark: [0xb69065, 0xbb9569, 0xc09a6c],
    under: [0x6d5949, 0x62504b],
    flank: [0x9a7a5c, 0x937458],
    rings: [0x7f6149, 0xd9b584, 0xa9855f, 0xe4c293],
    moss: 0.1,
    trunk: [0x7e6450, 0x8c7058, 0x735b49],
  },
  /**
   * §20 sheet: dark-brown bark with lighter ridge highlights (the stump's lit
   * front face and its roots' lit tops), dark furrows and a black-brown rotten
   * hollow inside a paler rim.
   */
  gnarled: {
    bark: [0xb88765, 0xc09070, 0xad7f60],
    under: [0x6a4e3c, 0x5c4434],
    rings: [0x2f2622, 0xd9aa72, 0xc09060, 0x6e5241],
    moss: 0.25,
    ridge: [0xdca072, 0xe4ab7e],
    trunk: [0xbf8866, 0xa87b62, 0xc89270, 0x8a644c],
  },
} as const satisfies Record<string, RootLook>;

/** Yellow-olive moss of the sheets, dark → bright (calibrated tops). */
export const ROOT_MOSS = [0x464836, 0x535533, 0x66683c, 0x7f7936, 0xa1993c];

/** What the roots crawl over (metres, piece space). */
export interface RootGround {
  /** Surface height at (x, z); -Infinity past the edge of a tile, where roots hang down its side. */
  height(x: number, z: number): number;
  /** Is the surface soil (roots dip into it) rather than stone (they only grip over it)? Default: soil. */
  soft?(x: number, z: number): boolean;
}

export const FLAT_GROUND: RootGround = { height: () => 0 };

/** A point on a root's axis (metres) and its radius there. */
export interface RootPoint {
  x: number;
  y: number;
  z: number;
  r: number;
}

/** One root, before its forks. */
export interface RootSpec {
  /** Start: x and z (metres), y = height above the ground (0 = on it, more = leaving a trunk's flank). */
  from: [number, number, number];
  /** Direction on the ground, radians from +x towards +z. */
  heading: number;
  /** Length along its path (metres). */
  length: number;
  /** Radius at the start (metres); it tapers to about half a cell at the tip. */
  radius: number;
  /** Distance over which a lifted root comes down to the ground (default 2.5 × its start height). */
  drop?: number;
  /** Come down level first, then steeply (a bowed root), instead of steeply first (a buttress). */
  bow?: boolean;
  /** Fill down to the ground under the lifted start: a buttress fin. */
  fin?: boolean;
}

/** How roots grow (all optional but the look and seed). */
export interface RootStyle {
  look: RootLook;
  seed: number;
  ground?: RootGround;
  /** Forks per metre (default 1.4). */
  forks?: number;
  /** How hard the path snakes: radians of turn per metre (default 1.8). */
  wiggle?: number;
  /** How much of the length dips into soft ground (0‥1, default 0.3). Tips always dive in. */
  sink?: number;
  /** Longest run hanging down the side of a tile (metres, default 0.4). */
  hang?: number;
  /** Squash of the cross-section on the ground (height / width, default 0.8). */
  flat?: number;
  /** How long a root stays thick: 1 tapers evenly, 2 keeps its girth longer (default 1.3). */
  taper?: number;
  /** Stretch of a root where it forks, as shares of its length (default [0.12, 0.8]). */
  forkAt?: readonly [number, number];
  /** Length of a knuckle, one bark tone each (metres; default 3.5 cells). */
  knuckle?: number;
}

type Style = Required<RootStyle>;

const styleOf = (s: RootStyle): Style => ({ ground: FLAT_GROUND, forks: 1.4, wiggle: 1.8, sink: 0.3, hang: 0.4, flat: 0.8, taper: 1.3, forkAt: [0.12, 0.8], knuckle: 0, ...s });

interface Knot extends RootPoint {
  /** Arc length (metres), for the knuckle tones. */
  s: number;
  /** Lying (not climbing / hanging): gets the dark underside. */
  lying: boolean;
}

const BIAS = 1024;
const SPAN = 2048;
const cellKey = (i: number, j: number, k: number) => ((i + BIAS) * SPAN + (j + BIAS)) * SPAN + (k + BIAS);

/** Cells of each grid painted as a root's underside: a crossing root never darkens another's top. */
const UNDER = new WeakMap<VoxelGrid, Set<number>>();

/** Bark pattern amounts by moss amount, shared by all the cells painted with them. */
const BARK_SURF = new Map<number, Surf>();
const barkOf = (moss: number) => BARK_SURF.get(moss) ?? BARK_SURF.set(moss, barkSurf({ moss })).get(moss)!;

function paint(g: VoxelGrid, i: number, j: number, k: number, color: number, under: boolean, moss: number): void {
  let set = UNDER.get(g);
  if (!set) UNDER.set(g, (set = new Set()));
  const kk = cellKey(i, j, k);
  const cur = g.get(i, j, k);
  if (cur?.ghost) return; // solid ground drawn by someone else
  if (cur && under && !set.has(kk)) return;
  if (under) set.add(kk);
  else set.delete(kk);
  g.set(i, j, k, color, 'trunk', 1, barkOf(under ? 0 : moss));
}

/** Highest ground within `r` of (x, z): the root's belly clears steps and stone edges. */
function groundUnder(gr: RootGround, x: number, z: number, r: number): number {
  let h = gr.height(x, z);
  for (let a = 0; a < 8; a++) h = Math.max(h, gr.height(x + Math.cos((a * Math.PI) / 4) * r, z + Math.sin((a * Math.PI) / 4) * r));
  return h;
}

/** Fill the cells of a tapered capsule between two knots (cells under the ground are skipped). */
function capsule(g: VoxelGrid, a: Knot, b: Knot, st: Style, id: number): void {
  const [cx, cy, cz] = g.cell;
  const [ox, oy, oz] = g.origin;
  const minR = Math.min(cx, cy, cz) * 0.62;
  // Every cell whose centre can be within reach of the axis (the test below is exact).
  const reach = Math.max(a.r, b.r, minR);
  const i0 = Math.floor((Math.min(a.x, b.x) - reach - ox) / cx);
  const i1 = Math.floor((Math.max(a.x, b.x) + reach - ox) / cx);
  const j0 = Math.floor((Math.min(a.y, b.y) - reach - oy) / cy);
  const j1 = Math.floor((Math.max(a.y, b.y) + reach - oy) / cy);
  const k0 = Math.floor((Math.min(a.z, b.z) - reach - oz) / cz);
  const k1 = Math.floor((Math.max(a.z, b.z) + reach - oz) / cz);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  const knuckle = st.knuckle || Math.min(cx, cz) * 3.5;
  const lying = a.lying && b.lying;
  // Thick roots show a lighter ridge along their back, where the look has one, and roots
  // lying two cells high or more a shaded lower layer.
  const ridge = st.look.ridge?.length && Math.max(a.r, b.r) > Math.min(cx, cy, cz) * 1.2 ? st.look.ridge : null;
  const flank = lying && st.look.flank?.length ? st.look.flank : null;
  for (let i = i0; i <= i1; i++)
    for (let k = k0; k <= k1; k++) {
      const px = ox + (i + 0.5) * cx;
      const pz = oz + (k + 0.5) * cz;
      const floor = st.ground.height(px, pz);
      for (let j = j0; j <= j1; j++) {
        const py = oy + (j + 0.5) * cy;
        if (py < floor) continue;
        const t = len2 > 0 ? Math.min(1, Math.max(0, ((px - a.x) * dx + (py - a.y) * dy + (pz - a.z) * dz) / len2)) : 0;
        const r = Math.max(minR, a.r + t * (b.r - a.r));
        const vy = (py - a.y - t * dy) / (lying ? st.flat : 1);
        if ((px - a.x - t * dx) ** 2 + vy * vy + (pz - a.z - t * dz) ** 2 > r * r) continue;
        const s = a.s + t * (b.s - a.s);
        const under = lying && vy < -0.45 * r;
        const kn = Math.floor(s / knuckle);
        const low = flank && py - floor < cy && a.y + t * dy + r * st.flat > floor + cy * 1.3;
        const color = under
          ? tone(st.look.under, i, j, k, st.seed)
          : low
            ? flank[Math.floor(hash3(id, kn, 4, st.seed) * flank.length)]
            : ridge && vy > 0.5 * r && hash3(id, kn, 9, st.seed) < 0.7
              ? ridge[Math.floor(hash3(id, kn, 5, st.seed) * ridge.length)]
              : st.look.bark[Math.floor(hash3(id, kn, 3, st.seed) * st.look.bark.length)];
        paint(g, i, j, k, color, under, st.look.moss);
      }
    }
}

/**
 * Grow one root and its forks: it snakes along its heading, follows the ground
 * (climbing onto stones, dropping down steps, hanging over a tile edge), dips
 * into soft soil now and then and dives in at the tip. Returns the points of
 * its axis along the ground (for moss and plants along it).
 */
export function root(g: VoxelGrid, spec: RootSpec, style: RootStyle): RootPoint[] {
  const out: RootPoint[] = [];
  grow(g, spec, styleOf(style), 0, 1, out);
  return out;
}

function grow(g: VoxelGrid, spec: RootSpec, st: Style, depth: number, id: number, out: RootPoint[]): void {
  const cell = Math.min(g.cell[0], g.cell[2]);
  const ds = cell * 0.5;
  const R = rng(st.seed * 97 + id * 13);
  const ns = st.seed * 131 + id * 17;
  const lift0 = spec.from[1];
  const drop = spec.drop ?? Math.max(cell * 2, lift0 * 2.5);
  const tipR = cell * 0.4;
  let L = spec.length;
  let x = spec.from[0];
  let z = spec.from[2];
  let h = spec.heading;
  let s = 0;
  let thin = 1;
  // Taper from (s0, r0) to the tip; restarted where a root goes over an edge and its length is cut short.
  let s0 = 0;
  let r0 = spec.radius;
  const radius = () => {
    const t = Math.min(1, (s - s0) / Math.max(1e-6, L - s0));
    const knobs = 1 + 0.12 * (valueNoise3(s * 4.2, 0.5, 0.5, ns) - 0.5) * 2;
    return Math.max(tipR, (r0 + (tipR - r0) * t ** st.taper) * thin * knobs);
  };
  const lift = (sAt: number) => {
    const u = Math.min(1, sAt / drop);
    return lift0 * (spec.bow ? 1 - u ** 2.2 : (1 - u) ** 2);
  };
  // Half sinks into the soil where the noise is high, and the last stretch dives in.
  const dip = (sAt: number) => {
    if (st.sink <= 0 || sAt < cell * 3) return 0;
    const n = valueNoise3(sAt * 2.3, 1.5, 0.5, ns + 9);
    const tail = Math.max(0, (sAt / L - 0.8) / 0.2);
    return Math.min(1.25, Math.max(0, (n - (1 - st.sink * 0.9)) / (st.sink * 0.9)) * 1.8) + tail * tail * 1.6;
  };
  const target = (px: number, pz: number, sAt: number, r: number) => {
    const gy = groundUnder(st.ground, px, pz, r * 0.8);
    if (gy === -Infinity) return gy;
    const soft = st.ground.soft ? st.ground.soft(px, pz) : true;
    return gy + lift(sAt) + r * (0.62 - (soft ? dip(sAt) : 0));
  };
  let r = radius();
  let y = target(x, z, 0, r);
  if (y === -Infinity) return;
  let prev: Knot = { x, y, z, r, s, lying: true };
  const put = (lying: boolean) => {
    const k: Knot = { x, y, z, r, s, lying };
    capsule(g, prev, k, st, id);
    if (spec.fin && s < drop * 0.8) {
      // Buttress fin: fill down to the ground under the lifted start.
      const gy = st.ground.height(x, z);
      if (gy > -Infinity) capsule(g, { ...k, r: r * 0.45, lying: false }, { ...k, y: gy, r: r * 0.65, lying: false }, st, id);
    }
    prev = k;
    if (lying) out.push({ x, y, z, r });
  };
  // Height with -Infinity (off a tile) as a deep drop, to find which way a face looks.
  const hAt = (px: number, pz: number) => Math.max(-1e3, st.ground.height(px, pz));
  const forks: RootSpec[] = [];
  while (s < L) {
    // Steer: a slow meander plus small kinks.
    h += ((valueNoise3(s * 1.6, 3.5, 0.5, ns + 5) - 0.5) * 2 + (valueNoise3(s * 7, 8.5, 0.5, ns + 7) - 0.5)) * st.wiggle * ds;
    const nx = x + Math.cos(h) * ds;
    const nz = z + Math.sin(h) * ds;
    r = radius();
    const ny = target(nx, nz, s + ds, r);
    const step = Math.max(r, cell) * 1.5;
    if (ny > y + step) {
      // Climb the face in front (a stone, a step) before going on.
      while (y < ny - ds && s < L) {
        y += ds;
        s += ds;
        r = radius();
        put(false);
      }
    }
    x = nx;
    z = nz;
    s += ds;
    if (ny === -Infinity || ny < y - step) {
      // Over an edge: hang down its face to the ground below, or until the length runs out —
      // from the top of the edge, even where the root was dipping into the soil there.
      const floor = ny;
      y = Math.max(y, groundUnder(st.ground, x - Math.cos(h) * ds, z - Math.sin(h) * ds, r * 0.8) + r * 0.62);
      if (floor === -Infinity && L > s + st.hang) {
        s0 = s;
        r0 = r;
        L = s + st.hang;
      }
      // Meander sideways along the face (across its steeper axis) on the way down.
      const p = r + cell;
      const alongZ = Math.abs(hAt(x + p, z) - hAt(x - p, z)) >= Math.abs(hAt(x, z + p) - hAt(x, z - p));
      while (s < L && (floor === -Infinity || y > floor + ds)) {
        const drift = (valueNoise3(s * 3.2, 5.5, 0.5, ns + 3) - 0.5) * 2.4 * ds;
        y -= ds;
        s += ds;
        if (alongZ) z += drift;
        else x += drift;
        r = radius();
        put(false);
      }
      if (floor === -Infinity) break;
      y = floor;
      put(true);
      continue;
    }
    y = ny;
    put(true);
    if (depth < 3 && s > L * st.forkAt[0] && s < L * st.forkAt[1] && r > cell * 0.9 && R() < st.forks * ds) {
      const gy = groundUnder(st.ground, x, z, r * 0.8);
      const up = Math.max(0, y - gy - r * 0.62);
      forks.push({
        from: [x, up, z],
        heading: h + (R() < 0.5 ? -1 : 1) * R.range(0.45, 1.05),
        length: (L - s) * R.range(0.4, 0.75) + cell * 2,
        radius: r * R.range(0.55, 0.78),
        drop: up > 0 ? Math.max(cell * 2, up * 1.6) : undefined,
      });
      thin *= 0.88;
    }
  }
  forks.forEach((f, n) => grow(g, f, st, depth + 1, id * 8 + n + 1, out));
}

/** Roots radiating from one point. */
export interface NetworkOptions extends RootStyle {
  /** Centre (x, z) the roots leave from, and their height above the ground there. */
  from: [number, number, number];
  count: number;
  /** Length of each root (metres), or a range. */
  length: number | [number, number];
  /** Radius of each root at the start (metres). */
  thickness: number;
  /** Fan around this heading (radians from +x towards +z)… */
  dir?: number;
  /** …this wide (radians, default all around). */
  spread?: number;
  /** Distance from the centre where the roots begin (a trunk's radius). */
  start?: number;
  /** Distance over which lifted roots come down (default 2.5 × the lift). */
  drop?: number;
  fin?: boolean;
}

/**
 * Gnarled roots snaking out from a point over the ground (and over stones and
 * steps given a `ground`), forking and tapering, partly sunk into the soil.
 */
export function rootNetwork(g: VoxelGrid, o: NetworkOptions): RootPoint[] {
  const R = rng(o.seed * 7 + 3);
  const st = styleOf(o);
  const spread = o.spread ?? Math.PI * 2;
  const full = spread >= Math.PI * 2 - 1e-6;
  const out: RootPoint[] = [];
  const a0 = (o.dir ?? R.range(0, Math.PI * 2)) - (full ? 0 : spread / 2);
  for (let n = 0; n < o.count; n++) {
    const u = full ? (n + R.range(-0.3, 0.3)) / o.count : o.count > 1 ? n / (o.count - 1) : 0.5;
    const a = a0 + u * spread + (full ? 0 : R.range(-0.12, 0.12));
    const start = o.start ?? 0;
    const len = typeof o.length === 'number' ? o.length * R.range(0.85, 1.1) : R.range(o.length[0], o.length[1]);
    grow(
      g,
      {
        from: [o.from[0] + Math.cos(a) * start, o.from[1] * R.range(0.8, 1.1), o.from[2] + Math.sin(a) * start],
        heading: a + R.range(-0.2, 0.2),
        length: len,
        radius: o.thickness * R.range(0.85, 1.12),
        drop: o.drop,
        fin: o.fin,
      },
      st,
      0,
      n + 2,
      out,
    );
  }
  return out;
}

export interface StumpOptions extends RootStyle {
  /** Centre of the trunk on the ground (x, z), default the origin. */
  at?: [number, number];
  radius: number;
  /** Height of the broken top (metres). */
  height: number;
  /** Buttress roots flaring out (default 7). */
  roots?: number;
  /** How far the roots reach from the axis (default 2.6 × the radius). */
  reach?: number;
  /** Root radius where it leaves the trunk (default 0.32 × the radius). */
  thickness?: number;
  /** Roots only in a fan around this heading (radians from +x towards +z)… */
  dir?: number;
  /** …this wide (default all around). */
  spread?: number;
  /** Height where the roots leave the trunk, as a share of its height (default 0.3). */
  lift?: number;
  /** Widening of the trunk towards the ground (default 0.3). */
  flare?: number;
  /** Rotten hollow in the broken top: 0 = a flat face of rings, 1 = a deep bowl. */
  hollow?: number;
  /** How far the broken bark rim stands above the face of rings (default 0.14 × the height). */
  jag?: number;
}

/**
 * A stump: a bark trunk of vertical staves, tapering a little upwards and
 * flaring at the base, a broken top —
 * a jagged bark rim with splinters around a face of growth rings split by dark
 * cracks (or a rotten hollow) — and buttress roots flaring out over the ground.
 * Returns the points of the roots along the ground.
 */
export function stump(g: VoxelGrid, o: StumpOptions): RootPoint[] {
  const st = styleOf(o);
  const [cx, cy, cz] = g.cell;
  const [ox, oy, oz] = g.origin;
  const cell = Math.min(cx, cz);
  const [x0, z0] = o.at ?? [0, 0];
  const base = st.ground.height(x0, z0);
  const R = o.radius;
  const H = o.height;
  const flare = o.flare ?? 0.3;
  const hf = H * 0.5;
  const rim = Math.min(cell * 1.25, R * 0.3);
  const staves = Math.max(8, Math.round((Math.PI * 2 * R) / (cell * 1.5)));
  const r = rng(o.seed * 5 + 1);
  const splinters = [0, 1].map(() => ({ a: r.range(-Math.PI, Math.PI), w: r.range(0.2, 0.45), h: H * r.range(0.05, 0.12) }));
  const cracks = [0, 1, 2].map(() => r.range(-Math.PI, Math.PI));
  const angDist = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  const jag = o.jag ?? H * 0.14;
  const face = H - jag;
  const hollow = o.hollow ?? 0;
  // Height of the top at a point: a jagged rim with splinters, the ring face (or hollow) inside.
  const topAt = (rho: number, a: number) => {
    if (rho > R - rim) {
      let t = H - jag * 0.85 * valueNoise3(Math.cos(a) * 2.2 + 5, Math.sin(a) * 2.2, 0.5, o.seed);
      for (const sp of splinters) if (angDist(a, sp.a) < sp.w) t += sp.h * (1 - angDist(a, sp.a) / sp.w);
      return t;
    }
    return face - hollow * H * 0.3 * Math.max(0, 1 - rho / (R - rim)) ** 0.6;
  };
  const Rmax = R * (1 + flare) + cell;
  for (let i = Math.floor((x0 - Rmax - ox) / cx); i <= Math.floor((x0 + Rmax - ox) / cx); i++)
    for (let k = Math.floor((z0 - Rmax - oz) / cz); k <= Math.floor((z0 + Rmax - oz) / cz); k++) {
      const px = ox + (i + 0.5) * cx - x0;
      const pz = oz + (k + 0.5) * cz - z0;
      const rho = Math.hypot(px, pz);
      const a = Math.atan2(pz, px);
      const stave = Math.floor(((a + Math.PI) / (Math.PI * 2)) * staves) % staves;
      // Staves stand out or sink in a little: the boards of the sheet's bark.
      const sv = hash3(stave, 5, 5, o.seed);
      const bump = (sv < 0.33 ? -0.6 : sv > 0.75 ? 0.8 : 0) * Math.min(cell, R * 0.1);
      const top = topAt(rho, a);
      const jTop = Math.floor((base + top - oy) / cy - 0.5);
      for (let j = Math.floor((base - oy) / cy); j <= jTop; j++) {
        const hy = oy + (j + 0.5) * cy - base;
        if (rho > R * (1 - 0.08 * (hy / H) + flare * Math.max(0, 1 - hy / hf) ** 2) + bump) break;
        if (j === jTop && rho <= R - rim) {
          // The broken face: growth rings around a dark pith, split by cracks; a hollow is rotten dark.
          const ring = Math.floor(rho / (cell * 0.9) + 0.35);
          const crack = rho > cell && cracks.some((c) => angDist(a, c) * rho < cell * 0.5);
          const rot = rho < (R - rim) * hollow;
          const n = o.look.rings.length;
          const color = rot || crack || ring === 0 ? o.look.rings[0] : o.look.rings[1 + ((ring - 1) % (n - 1))];
          g.set(i, j, k, color, 'wood', rot ? 0.7 : 1);
          continue;
        }
        // Vertical bark staves in runs of tones, the sunken ones dark furrows.
        const plank = Math.floor(hy / (cell * 3) + hash3(stave, 3, 1, o.seed));
        const color = o.look.bark[Math.floor(hash3(stave, plank, 7, o.seed) * o.look.bark.length)];
        g.set(i, j, k, color, 'trunk', sv < 0.33 ? 0.78 : 1, barkSurf({ moss: o.look.moss * 0.6 }));
      }
    }
  // Buttress roots leave the flank high up and come down to the ground.
  const n = o.roots ?? 7;
  const reach = o.reach ?? R * 2.6;
  const out: RootPoint[] = [];
  const spread = o.spread ?? Math.PI * 2;
  const full = spread >= Math.PI * 2 - 1e-6;
  const a0 = o.dir === undefined ? r.range(0, Math.PI * 2) : o.dir - (full ? 0 : spread / 2);
  for (let q = 0; q < n; q++) {
    const u = full ? (q + r.range(-0.25, 0.25)) / n : n > 1 ? (q + r.range(-0.2, 0.2)) / (n - 1) : 0.5;
    const a = a0 + u * spread;
    const lift = H * (o.lift ?? 0.3) * r.range(0.75, 1.3);
    grow(
      g,
      {
        from: [x0 + Math.cos(a) * R * 0.7, lift, z0 + Math.sin(a) * R * 0.7],
        heading: a + r.range(-0.25, 0.25),
        length: (reach - R * 0.7) * r.range(0.7, 1.05),
        radius: (o.thickness ?? R * 0.32) * r.range(0.8, 1.15),
        drop: reach * r.range(0.3, 0.45),
        fin: true,
      },
      st,
      0,
      q + 2,
      out,
    );
  }
  return out;
}

export interface ClusterOptions extends RootStyle {
  /** Centre (x, z) of the knot, default the origin. */
  at?: [number, number];
  /** Main roots leaving the knot. */
  count: number;
  /** How far they reach from the knot (metres). */
  reach: number;
  /** Root radius at the knot (metres). */
  thickness: number;
  /** Height of the knot above the ground: roots arch down from it (0 = a flat root plate). */
  lift?: number;
  /** Fan around this heading (radians)… */
  dir?: number;
  /** …this wide (default all around). */
  spread?: number;
}

/**
 * A root cluster without a stump: a gnarled knot (where a trunk rotted away)
 * with roots arching down from it and spreading over the ground.
 */
export function rootCluster(g: VoxelGrid, o: ClusterOptions): RootPoint[] {
  const st = styleOf(o);
  const [x0, z0] = o.at ?? [0, 0];
  const lift = o.lift ?? 0;
  const base = st.ground.height(x0, z0);
  // The knot: a lumpy ball of bark the roots grow out of, on a flared foot.
  const kr = o.thickness * 1.25;
  const [cx, cy, cz] = g.cell;
  const [ox, oy, oz] = g.origin;
  const ky = base + Math.max(lift, kr * 0.5);
  for (let i = Math.floor((x0 - kr * 1.5 - ox) / cx); i <= Math.floor((x0 + kr * 1.5 - ox) / cx); i++)
    for (let j = Math.floor((base - oy) / cy); j <= Math.floor((ky + kr * 1.3 - oy) / cy); j++)
      for (let k = Math.floor((z0 - kr * 1.5 - oz) / cz); k <= Math.floor((z0 + kr * 1.5 - oz) / cz); k++) {
        const px = ox + (i + 0.5) * cx;
        const py = oy + (j + 0.5) * cy;
        const pz = oz + (k + 0.5) * cz;
        const bumpy = kr * (1 + (valueNoise3(px * 9, py * 9, pz * 9, o.seed) - 0.5) * 0.5);
        const foot = py < ky ? 1 + (ky - py) / Math.max(1e-6, ky - base + kr) : 1;
        if (Math.hypot((px - x0) / foot, (py - ky) * 1.1, (pz - z0) / foot) > bumpy) continue;
        paint(g, i, j, k, tone(o.look.bark, i, j, k, o.seed), false, o.look.moss);
      }
  return rootNetwork(g, { ...o, from: [x0, lift, z0], length: [o.reach * 0.75, o.reach * 1.05], start: kr * 0.5, drop: Math.max(o.reach * 0.35, lift * 2.2), fin: lift > 0 });
}

export interface ArchOptions extends RootStyle {
  /** Middle of the bow on the ground (x, z), default the origin. */
  at?: [number, number];
  /** Direction of the bow (radians from +x towards +z). */
  heading: number;
  /** Length end to end (metres). */
  length: number;
  /** Height of the bow's axis above the ground (metres). */
  height: number;
  /** Radius of its body (metres). */
  thickness: number;
  /** Legs gripping down on either side (default 5). */
  legs?: number;
}

/**
 * A thick root bowed over the ground — or lying over a stone, given a `ground`
 * — with legs gripping down on both sides: the gnarled clusters of the §20
 * sheet, roots that grew over ruins.
 */
export function rootArch(g: VoxelGrid, o: ArchOptions): RootPoint[] {
  const st = styleOf(o);
  const [x0, z0] = o.at ?? [0, 0];
  const R = rng(o.seed * 3 + 11);
  // The body: two bowed halves from the middle out, level on top, diving in at the ends.
  const halves: RootPoint[][] = [[], []];
  halves.forEach((half, n) =>
    grow(g, { from: [x0, o.height, z0], heading: o.heading + n * Math.PI, length: o.length / 2, radius: o.thickness, drop: o.length * 0.45, bow: true }, { ...st, forks: 0 }, 0, n + 2, half),
  );
  const out = [...halves[0], ...halves[1]];
  const legs = o.legs ?? 5;
  const perHalf = Math.ceil(legs / 2);
  for (let q = 0; q < legs; q++) {
    // Along each half (away from its end), alternating sides, splaying outwards near the ends.
    const half = halves[q % 2];
    const frac = 0.12 + (0.6 * (Math.floor(q / 2) + 0.5)) / perHalf;
    const k = half[Math.floor(frac * half.length)];
    if (!k) continue;
    const gy = groundUnder(st.ground, k.x, k.z, k.r * 0.8);
    const up = Math.max(0, k.y - gy - k.r * 0.62);
    const side = (q + Math.floor(q / 2)) % 2 ? 1 : -1;
    grow(
      g,
      {
        from: [k.x, up, k.z],
        heading: o.heading + (q % 2) * Math.PI + side * (Math.PI / 2 - frac * 0.7) + R.range(-0.35, 0.35),
        length: R.range(0.3, 0.55) * o.length,
        radius: k.r * R.range(0.55, 0.75),
        drop: Math.max(g.cell[0] * 2, up * R.range(1.1, 1.6)),
      },
      st,
      1,
      q + 10,
      out,
    );
  }
  return out;
}

/**
 * Commit a grid of roots: like `g.commit()`, but bark cells merge into
 * neighbours of the same knuckle (no bevel between them), so a root reads as
 * gnarled segments with a blocky outline — the sheets' look — rather than a
 * pile of little cubes. With `columns`, vertical runs of equal bark cells
 * (same tone, same sides showing) become one block each: a trunk's boards
 * and a buttress's walls for a fraction of the blocks.
 */
export function commitRoots(g: VoxelGrid, b: VoxelBuilder, o: { columns?: boolean } = {}): void {
  const n0 = b.boxes.length;
  g.commit();
  const [cx, cy, cz] = g.cell;
  const [ox, oy, oz] = g.origin;
  const cellOf = (box: VoxelBox) => [Math.floor((box.x - ox) / cx), Math.floor((box.y - oy) / cy), Math.floor((box.z - oz) / cz)] as const;
  for (let n = n0; n < b.boxes.length; n++) {
    const box = b.boxes[n];
    if (box.mat !== 'trunk') continue;
    const [i, j, k] = cellOf(box);
    const self = g.get(i, j, k);
    const same = (di: number, dj: number, dk: number) => {
      const c = g.get(i + di, j + dj, k + dk);
      return !!c && !c.ghost && c.mat === 'trunk' && c.color === self?.color;
    };
    box.merge = (same(1, 0, 0) ? 1 : 0) | (same(-1, 0, 0) ? 2 : 0) | (same(0, 1, 0) ? 4 : 0) | (same(0, -1, 0) ? 8 : 0) | (same(0, 0, 1) ? 16 : 0) | (same(0, 0, -1) ? 32 : 0);
  }
  if (!o.columns) return;
  const SIDES = 1 | 2 | 16 | 32;
  const at = new Map<number, number>();
  for (let n = n0; n < b.boxes.length; n++) if (b.boxes[n].mat === 'trunk') at.set(cellKey(...cellOf(b.boxes[n])), n);
  const alike = (a: VoxelBox, c: VoxelBox) =>
    a.color === c.color && ((a.open ?? 63) & SIDES) === ((c.open ?? 63) & SIDES) && (a.surf === c.surf || (!!a.surf && !!c.surf && a.surf.every((v, q) => v === c.surf?.[q])));
  const gone = new Set<number>();
  for (let n = n0; n < b.boxes.length; n++) {
    const box = b.boxes[n];
    if (box.mat !== 'trunk' || gone.has(n)) continue;
    const [i, j, k] = cellOf(box);
    const below = at.get(cellKey(i, j - 1, k));
    if (below !== undefined && alike(b.boxes[below], box)) continue; // not the foot of its run
    let top = box;
    let count = 1;
    let shade = box.shade;
    let merge = (box.merge ?? 0) & SIDES;
    for (;;) {
      const m = at.get(cellKey(i, j + count, k));
      if (m === undefined || !alike(b.boxes[m], box)) break;
      gone.add(m);
      top = b.boxes[m];
      shade += top.shade;
      merge &= top.merge ?? 0;
      count++;
    }
    if (count === 1) continue;
    box.y += ((count - 1) * cy) / 2;
    box.sy = count * cy;
    box.shade = shade / count;
    box.open = ((box.open ?? 63) & ~4) | ((top.open ?? 63) & 4);
    box.merge = merge | ((box.merge ?? 0) & 8) | ((top.merge ?? 0) & 4);
  }
  let w = n0;
  for (let n = n0; n < b.boxes.length; n++) if (!gone.has(n)) b.boxes[w++] = b.boxes[n];
  b.boxes.length = w;
}

/**
 * Moss on the roots: tufts of leafy moss on the upper faces of the bark cells
 * of a grid, in patches (`amount` 0‥1); `on` picks the families to cover
 * (default bark; add 'wood' for a stump's broken top). Call after drawing.
 */
export function mossOver(g: VoxelGrid, o: { amount: number; seed: number; palette?: readonly number[]; on?: readonly VoxelMaterialKey[] }): void {
  const on = o.on ?? ['trunk'];
  const pal = o.palette ?? ROOT_MOSS;
  const [cx, cy, cz] = g.cell;
  const [ox, oy, oz] = g.origin;
  const tops: [number, number, number][] = [];
  g.forEach((i, j, k, c) => {
    if (c.ghost || !on.includes(c.mat) || g.has(i, j + 1, k)) return;
    const x = ox + (i + 0.5) * cx;
    const y = oy + (j + 1) * cy;
    const z = oz + (k + 0.5) * cz;
    if (valueNoise3(x * 3.2, y * 3.2, z * 3.2, o.seed) * 0.85 + hash3(i, j, k, o.seed + 1) * 0.15 > 1 - o.amount * 0.8) tops.push([i, j + 1, k]);
  });
  for (const [i, j, k] of tops) g.set(i, j, k, tone(pal, i, j, k, o.seed), 'leaves', 1, leafSurf());
}

// ── Composed roots ───────────────────────────────────────────────────────────

/** A hump where a root arches off the ground: where it peaks (share of the length), its height and its length (metres). */
export type RootKnee = readonly [at: number, height: number, length: number];

/** A branch of a {@link TrailSpec}, placed exactly (the options mean what they do there). */
export interface TrailFork {
  /** Where it leaves its parent (share of the parent's length). */
  at: number;
  /** Turn off the parent's heading there (radians, towards +z from +x). */
  turn: number;
  length: number;
  /** Radius where it leaves, as a share of the parent's there (default 0.75)… */
  share?: number;
  /** …and at the end of its length, as a share of that (default 0.6). */
  end?: number;
  bend?: number;
  bow?: boolean;
  curve?: number;
  knees?: readonly RootKnee[];
  dive?: number;
  hang?: number;
  split?: number;
  forks?: readonly TrailFork[];
}

/** A continuous root of a composed layout. */
export interface TrailSpec {
  /** Start: x and z, and the height of its axis above the ground there (0 = lying on it). */
  from: readonly [number, number, number];
  /** Direction on the ground, radians from +x towards +z. */
  heading: number;
  /** Length along the ground (metres); a run down a tile side comes on top of it. */
  length: number;
  /** Radius at the start, or at the start and at the end of `length` (metres; default end: half the start). */
  radius: number | readonly [number, number];
  /** Radius at the very tip of a run down a tile side (default 0.45 cell). */
  tip?: number;
  /** Steady turn, radians per metre (towards +z from +x). */
  bend?: number;
  /** Distance over which a lifted start comes down to the ground (default 2.5 × the lift). */
  drop?: number;
  /** Come down level first, then steeply (an arm reaching down), instead of steeply first (a buttress). */
  bow?: boolean;
  /** How the lifted start comes down: the power of its curve (default 2; towards 1 a steady slope, like a flared skirt). */
  curve?: number;
  /** Humps where the root arches off the ground and grips it again. */
  knees?: readonly RootKnee[];
  /** Fill down to the ground under the lifted start: a rounded buttress (default no). */
  fin?: boolean;
  /** Share of the length at the end over which it dives into the soil (default 0: it just ends, tapered). */
  dive?: number;
  /** End square-cut, showing the pale wood (a broken-off stub), instead of rounded off. */
  cut?: boolean;
  /** Run down the side of a tile it reaches (metres; default the style's `hang`, at most what is left of `length`). */
  hang?: number;
  /** Down a tile side, split into two strands this far down the run (share of it). */
  split?: number;
  forks?: readonly TrailFork[];
}

/**
 * A continuous root along a planned course: it bends steadily (plus the
 * style's gentle wiggle), comes down from a lifted start (a buttress, or an
 * arm reaching out and down), arches over its knees, forks exactly where
 * told, climbs over stones and down steps, runs down the side of a tile it
 * reaches (split into two strands if asked) and tapers or dives in at the
 * end — the clean, legible roots of the sheets. Returns its axis points
 * (forks included).
 */
export function trail(g: VoxelGrid, spec: TrailSpec, style: RootStyle, id = 1): RootPoint[] {
  const out: RootPoint[] = [];
  walk(g, spec, styleOf(style), id, out);
  return out;
}

function walk(g: VoxelGrid, spec: TrailSpec, st: Style, id: number, out: RootPoint[]): void {
  const [cx, , cz] = g.cell;
  const [ox, , oz] = g.origin;
  const cell = Math.min(cx, cz);
  const ds = cell * 0.5;
  const ns = st.seed * 131 + id * 17;
  const L = spec.length;
  const [r0, r1] = typeof spec.radius === 'number' ? [spec.radius, spec.radius * 0.5] : spec.radius;
  const tip = Math.min(r1, spec.tip ?? cell * 0.45);
  const lift0 = spec.from[1];
  const drop = spec.drop ?? Math.max(cell * 2, lift0 * 2.5);
  const dive = spec.dive ?? 0;
  let thin = 1;
  const radius = (s: number) => (r0 + (r1 - r0) * Math.min(1, s / L) ** st.taper) * thin * (1 + 0.1 * (valueNoise3(s * 4.2, 0.5, 0.5, ns) - 0.5) * 2);
  // Height of the axis over its seat on the ground: the lifted start, the knees, the dive at the end.
  const rise = (s: number, r: number) => {
    const u = Math.min(1, s / drop);
    let y = lift0 * (spec.bow ? 1 - u ** (spec.curve ?? 2.2) : (1 - u) ** (spec.curve ?? 2));
    for (const [at, hk, len] of spec.knees ?? []) {
      const d = (s - at * L) / len;
      if (Math.abs(d) < 0.5) y += hk * Math.cos(Math.PI * d) ** 2;
    }
    const t = dive > 0 ? (s / L - (1 - dive)) / dive : 0;
    return t > 0 ? y - t * t * (r * 1.7 + cell * 0.3) : y;
  };
  const seat = (r: number) => r * 0.62;
  let x = spec.from[0];
  let z = spec.from[2];
  let h = spec.heading;
  let s = 0;
  let r = radius(0);
  const g0 = groundUnder(st.ground, x, z, r * 0.8);
  if (g0 === -Infinity) return;
  let y = g0 + seat(r) + rise(0, r);
  let prev: Knot = { x, y, z, r, s, lying: rise(0, r) < r * 0.5 };
  let before = prev;
  // The last knot painted up to: a thick root is painted in strides of half its radius
  // (its capsules would overlap many times over), a thinner one knot by knot.
  let done = prev;
  const paintTo = (k: Knot) => {
    if (k !== done) capsule(g, done, k, st, id);
    done = k;
  };
  const put = (lying: boolean) => {
    const k: Knot = { x, y, z, r, s, lying };
    if (r <= cell * 2 || lying !== done.lying || Math.hypot(x - done.x, y - done.y, z - done.z) >= r * 0.5) paintTo(k);
    if (spec.fin && !lying && Math.floor(s / cell) !== Math.floor(prev.s / cell)) {
      // A buttress: solid down to the ground under the lifted root, a little wider at the foot
      // (once a cell of its length: they overlap well).
      const gy = st.ground.height(x, z);
      if (gy > -Infinity && y - gy > r) capsule(g, { ...k, r: r * 0.85, lying: false }, { ...k, y: gy, r: r * 0.95, lying: false }, st, id);
    }
    before = prev;
    prev = k;
    out.push({ x, y, z, r });
  };
  const forks = [...(spec.forks ?? [])].sort((a, b) => a.at - b.at);
  let next = 0;
  while (s < L) {
    h += ((valueNoise3(s * 1.6, 3.5, 0.5, ns + 5) - 0.5) * 2 + (valueNoise3(s * 7, 8.5, 0.5, ns + 7) - 0.5) * 0.5) * st.wiggle * ds + (spec.bend ?? 0) * ds;
    const nx = x + Math.cos(h) * ds;
    const nz = z + Math.sin(h) * ds;
    s += ds;
    r = radius(s);
    const gy = groundUnder(st.ground, nx, nz, r * 0.8);
    if (st.ground.height(nx, nz) === -Infinity) {
      // Off the edge of a tile: over the rim and down its side. The side is the far face of
      // the last cell on the ground; the root runs just outside it.
      const offX = st.ground.height(x + Math.sign(Math.cos(h)) * ds * 1.5, z) === -Infinity;
      const offZ = st.ground.height(x, z + Math.sign(Math.sin(h)) * ds * 1.5) === -Infinity;
      const acrossX = offX && (!offZ || Math.abs(Math.cos(h)) >= Math.abs(Math.sin(h)));
      const [nX, nZ] = acrossX ? [Math.sign(Math.cos(h)), 0] : [0, Math.sign(Math.sin(h))];
      if (acrossX) x = ox + (Math.floor((x - ox) / cx) + (nX > 0 ? 1 : 0)) * cx + nX * cx * 0.35;
      else z = oz + (Math.floor((z - oz) / cz) + (nZ > 0 ? 1 : 0)) * cz + nZ * cz * 0.35;
      put(false);
      paintTo(prev);
      const len = spec.hang ?? Math.min(st.hang, Math.max(cell * 3, L - s));
      hang(g, st, prev, [nX, nZ], (Math.cos(h) * -nZ + Math.sin(h) * nX) * 0.8, len, tip, spec.split, id, ns, out);
      return;
    }
    const ty = gy + seat(r) + rise(s, r);
    const step = Math.max(r, cell) * 1.5;
    if (ty > y + step) {
      // Climb the face in front (a stone, a step) first.
      while (y < ty - ds) {
        y += ds;
        put(false);
      }
    } else if (ty < y - step) {
      // Over an edge onto lower ground: out over it, then down its face.
      x = nx;
      z = nz;
      put(false);
      while (y > ty + ds) {
        y -= ds;
        put(false);
      }
    }
    x = nx;
    z = nz;
    y = ty;
    put(rise(s, r) < r * 0.5);
    while (next < forks.length && forks[next].at * L <= s) {
      const f = forks[next++];
      const rc = r * (f.share ?? 0.75);
      const up = Math.max(0, y - gy - seat(rc));
      const fork: TrailSpec = {
        ...f,
        from: [x, up, z],
        heading: h + f.turn,
        radius: [rc, rc * (f.end ?? 0.6)],
        tip: spec.tip,
        drop: up > cell * 0.5 ? Math.max(cell * 2, up * 1.6) : undefined,
      };
      walk(g, fork, st, id * 8 + next, out);
      thin *= 0.9;
    }
  }
  paintTo(prev);
  if (spec.cut) cutEnd(g, before, prev, st.look.rings[1]);
}

/**
 * Square off the end of a root at knot `b` (coming from `a`): cells past the
 * plane through `b` go, the slice just inside shows the cut wood.
 */
function cutEnd(g: VoxelGrid, a: RootPoint, b: RootPoint, wood: number): void {
  const [cx, cy, cz] = g.cell;
  const [ox, oy, oz] = g.origin;
  const d = [b.x - a.x, b.y - a.y, b.z - a.z];
  const n = Math.hypot(d[0], d[1], d[2]) || 1;
  const [ux, uy, uz] = d.map((v) => v / n);
  const R = b.r + Math.max(cx, cy, cz) * 2;
  for (let i = Math.floor((b.x - R - ox) / cx); i <= Math.floor((b.x + R - ox) / cx); i++)
    for (let j = Math.floor((b.y - R - oy) / cy); j <= Math.floor((b.y + R - oy) / cy); j++)
      for (let k = Math.floor((b.z - R - oz) / cz); k <= Math.floor((b.z + R - oz) / cz); k++) {
        const c = g.get(i, j, k);
        if (!c || c.ghost || c.mat !== 'trunk') continue;
        const [px, py, pz] = [ox + (i + 0.5) * cx - b.x, oy + (j + 0.5) * cy - b.y, oz + (k + 0.5) * cz - b.z];
        const along = px * ux + py * uy + pz * uz;
        if (Math.hypot(px - along * ux, py - along * uy, pz - along * uz) > b.r + Math.max(cx, cz)) continue;
        if (along > 0) g.delete(i, j, k);
        else if (along > -Math.min(cx, cy, cz)) g.set(i, j, k, wood, 'trunk', 1, barkSurf());
      }
}

/**
 * The run of a root down the side of a tile (outward normal `n` on x or z),
 * from the knot on the rim: it slides on the way it came, easing off, with a
 * gentle meander, stays on the side and tapers to `tip`; `split` makes a
 * second strand peel off partway down. It takes the look's `flank` tones
 * where it has them: down the side it is in the shade, as on the sheet.
 */
function hang(g: VoxelGrid, st: Style, from: Knot, n: readonly [number, number], slide: number, len: number, tip: number, split: number | undefined, id: number, ns: number, out: RootPoint[]): void {
  const [cx, , cz] = g.cell;
  const ds = Math.min(cx, cz) * 0.5;
  const [tx, tz] = [-n[1], n[0]];
  const side = st.look.flank?.length ? { ...st, look: { ...st.look, bark: st.look.flank } } : st;
  let p = from;
  let sl = slide;
  let thin = 1;
  for (let hs = ds; hs <= len; hs += ds) {
    sl = sl * 0.85 + (valueNoise3(hs * 3.2, 5.5, id, ns + 3) - 0.5) * st.wiggle * 0.25;
    let [x, z] = [p.x + tx * sl * ds, p.z + tz * sl * ds];
    // Stay on the side: soil must still be behind the root.
    if (st.ground.height(x - n[0] * cx, z - n[1] * cz) === -Infinity) [x, z] = [p.x, p.z];
    const r = Math.max(tip, (from.r + (tip - from.r) * (hs / len) ** 1.6) * thin);
    const k: Knot = { x, y: p.y - ds, z, r, s: p.s + ds, lying: false };
    capsule(g, p, k, side, id);
    out.push({ x: k.x, y: k.y, z: k.z, r });
    p = k;
    if (split !== undefined && hs >= split * len) {
      // Two strands from here on, drifting apart.
      hang(g, st, p, n, sl - 0.5, (len - hs) * 0.8, tip, undefined, id * 8 + 7, ns + 11, out);
      sl += 0.5;
      thin = 0.85;
      split = undefined;
    }
  }
}

/** A small stump cut off clean (see {@link cutStump}). */
export interface CutStumpOptions {
  look: RootLook;
  seed: number;
  ground?: RootGround;
  /** Centre of the trunk on the ground (x, z), default the origin. */
  at?: [number, number];
  radius: number;
  /** Height of the cut face (metres). */
  height: number;
}

/**
 * A small stump cut off clean — the §18.2 tile's: a round trunk of vertical
 * bark staves (the look's `trunk` tones, some sunk darker) and a flat top of
 * pale cut wood (`rings[1]`) with a cross of dark cracks through the pith
 * (`rings[0]`). Staves and the face are single-tone runs, so after
 * {@link commitRoots} each stave reads as one board and the face as one clean
 * disc. Grow its roots from its foot with {@link trail} first: the stump is
 * drawn over their starts.
 */
export function cutStump(g: VoxelGrid, o: CutStumpOptions): void {
  const [cx, cy, cz] = g.cell;
  const [ox, oy, oz] = g.origin;
  const [x0, z0] = o.at ?? [0, 0];
  const base = (o.ground ?? FLAT_GROUND).height(x0, z0);
  const j0 = Math.round((base - oy) / cy);
  const j1 = j0 + Math.max(1, Math.round(o.height / cy)) - 1;
  const bark = o.look.trunk ?? o.look.bark;
  const [crack, sap] = o.look.rings;
  const R = o.radius / Math.min(cx, cz);
  const face = barkSurf();
  const side = barkSurf({ moss: o.look.moss * 0.5 });
  for (let i = Math.floor((x0 - o.radius - ox) / cx); i <= Math.floor((x0 + o.radius - ox) / cx); i++)
    for (let k = Math.floor((z0 - o.radius - oz) / cz); k <= Math.floor((z0 + o.radius - oz) / cz); k++) {
      const u = (ox + (i + 0.5) * cx - x0) / cx;
      const v = (oz + (k + 0.5) * cz - z0) / cz;
      const d = Math.hypot(u, v);
      if (d > R) continue;
      const top = Math.min(Math.abs(u), Math.abs(v)) < 0.5 && d < R - 0.9 ? crack : sap;
      // One bark tone per stave (column), a few sunk into dark furrows.
      const sv = hash3(i, 2, k, o.seed);
      for (let j = j0; j <= j1; j++) {
        if (j === j1) g.set(i, j, k, top, 'trunk', 1, face);
        else g.set(i, j, k, bark[Math.floor(sv * bark.length)], 'trunk', sv < 0.25 ? 0.82 : 1, side);
      }
    }
}

/** The §20 sheet's big hollow stump (see {@link hollowStump}). */
export interface HollowStumpOptions extends RootStyle {
  /** Centre of the trunk on the ground (x, z), default the origin. */
  at?: [number, number];
  radius: number;
  /** Height of the broken rim (metres). */
  height: number;
  /** Roots around the foot (default 9). */
  roots?: number;
  /** How far they reach from the axis (default 3.2 × the radius). */
  reach?: number;
  /** Root radius where it leaves the trunk (default 0.4 × the radius). */
  thickness?: number;
  /** Height where the roots leave the trunk, as a share of its height (default 0.42). */
  lift?: number;
  /** Depth of the open hollow (metres, default 0.35 × the height). */
  hollow?: number;
  /** Heading of the first root (default random). */
  dir?: number;
}

/**
 * The §20 sheet's big stump: a tall trunk of vertical bark staves (lighter
 * ridges, sunken dark furrows) broken off in a ragged rim around an open,
 * rotten hollow, and thick roots that swell out of its foot as ridges, flare
 * down to the ground (a buttress, or an arm reaching out and down), snake off
 * over it — arching over a knee here and there — and grip it with forked
 * toes. Uses the look's `rings` as [hollow floor, rim, rim shade, inner wall].
 * Returns the roots' axis points.
 */
export function hollowStump(g: VoxelGrid, o: HollowStumpOptions): RootPoint[] {
  const st = styleOf(o);
  const [cx, cy, cz] = g.cell;
  const [ox, oy, oz] = g.origin;
  const cell = Math.min(cx, cz);
  const [x0, z0] = o.at ?? [0, 0];
  const base = st.ground.height(x0, z0);
  const R = o.radius;
  const H = o.height;
  const deep = o.hollow ?? H * 0.35;
  const inner = R - Math.max(cell * 1.9, R * 0.36);
  const bark = o.look.trunk ?? o.look.bark;
  const ridge = o.look.ridge ?? bark;
  const [floor, rim, rimShade, wall] = o.look.rings;
  const staves = Math.max(12, Math.round((Math.PI * 2 * R) / cell));
  const r = rng(o.seed * 5 + 1);
  // The roots first (the trunk is drawn over their starts): out of the foot, down in a
  // flare, off over the ground, toes gripping it.
  const n = o.roots ?? 9;
  const reach = o.reach ?? R * 3.2;
  const thick = o.thickness ?? R * 0.4;
  const a0 = o.dir ?? r.range(0, Math.PI * 2);
  const out: RootPoint[] = [];
  for (let q = 0; q < n; q++) {
    const a = a0 + ((q + r.range(-0.2, 0.2)) / n) * Math.PI * 2;
    const L = (reach - R * 0.5) * r.range(0.78, 1.05);
    const rr = thick * r.range(0.85, 1.15);
    // Most flare down steeply from the trunk and run off along the ground; some reach out level, then down.
    const bow = r.chance(0.3);
    const side = r.chance(0.5) ? 1 : -1;
    const forks: TrailFork[] = [{ at: r.range(0.72, 0.82), turn: side * r.range(0.45, 0.8), length: L * r.range(0.2, 0.3), share: 0.7, dive: 0.5 }];
    if (r.chance(0.55)) forks.push({ at: r.range(0.45, 0.6), turn: -side * r.range(0.5, 0.9), length: L * r.range(0.3, 0.42), share: 0.62, dive: 0.4 });
    const knees: RootKnee[] = r.chance(0.5) ? [[r.range(0.8, 0.88), rr * r.range(0.4, 0.7), L * r.range(0.16, 0.22)]] : [];
    walk(
      g,
      {
        // (a low stump's roots leave it under its rim)
        from: [x0 + Math.cos(a) * R * 0.5, Math.min(H * (o.lift ?? 0.42) * r.range(0.85, 1.15), Math.max(0, H - rr * 1.8)), z0 + Math.sin(a) * R * 0.5],
        heading: a + r.range(-0.2, 0.2),
        length: L,
        radius: [rr, rr * 0.45],
        tip: cell * 0.5,
        drop: L * (bow ? r.range(0.55, 0.7) : r.range(0.5, 0.65)),
        bow,
        curve: bow ? 2.2 : r.range(1.5, 1.9),
        fin: !bow,
        knees,
        dive: 0.14,
        forks,
      },
      st,
      q + 2,
      out,
    );
  }
  // The trunk.
  const angDist = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  // A splinter standing up from the rim of a tall stump.
  const splinters = H > R * 1.5 ? [{ a: r.range(-Math.PI, Math.PI), w: r.range(0.1, 0.2), h: cy }] : [];
  const surf = barkSurf({ moss: o.look.moss * 0.5 });
  const Rmax = R * 1.1 + cell;
  for (let i = Math.floor((x0 - Rmax - ox) / cx); i <= Math.floor((x0 + Rmax - ox) / cx); i++)
    for (let k = Math.floor((z0 - Rmax - oz) / cz); k <= Math.floor((z0 + Rmax - oz) / cz); k++) {
      const px = ox + (i + 0.5) * cx - x0;
      const pz = oz + (k + 0.5) * cz - z0;
      const rho = Math.hypot(px, pz);
      const a = Math.atan2(pz, px);
      const sn = Math.floor(((a + Math.PI) / (Math.PI * 2)) * staves) % staves;
      // Staves: lighter ridges, darker boards now and then, plain bark between; the seams
      // between staves of different tones draw the thin dark lines of the sheet's bark.
      const sv = hash3(sn, 5, 5, o.seed);
      const dark = sv < 0.2;
      const raised = sv > 0.7;
      // The rim: stretches broken off a block lower or standing a block higher.
      const hv = valueNoise3(Math.cos(a) * 2.2 + 3, Math.sin(a) * 2.2, 0.5, o.seed + 7);
      let top = H + (hv < 0.3 ? -cy : hv > 0.68 ? cy : 0);
      for (const sp of splinters) if (angDist(a, sp.a) < sp.w) top += sp.h;
      for (let j = Math.floor((base - oy) / cy); ; j++) {
        const hy = oy + (j + 0.5) * cy - base;
        if (hy > top) break;
        // The foot swells out into the flare the roots grow from.
        if (rho > R * (1 + 0.3 * Math.max(0, 1 - hy / (H * 0.45)) ** 2)) break;
        const open = rho < inner;
        // The inner face of the wall, looking into the hollow.
        const faces = [px + cx, px - cx].some((q) => Math.hypot(q, pz) < inner) || [pz + cz, pz - cz].some((q) => Math.hypot(px, q) < inner);
        if (open && hy > H - deep) {
          g.delete(i, j, k);
          continue;
        }
        let color: number;
        let mat: VoxelMaterialKey = 'trunk';
        let shade = 1;
        if (open) {
          // The floor of the hollow: dark, crumbly rotten wood.
          color = floor;
          mat = 'wood';
          shade = 0.8;
        } else if (hy + cy > top) color = hash3(sn, 9, 1, o.seed) < 0.6 ? rim : rimShade;
        else if (hy > H - deep && faces) color = wall;
        else if (dark) color = bark[bark.length - 1];
        else {
          // Boards of a few cells, each its own tone; the raised staves lighter.
          const plank = Math.floor(hy / (cy * 3) + hash3(sn, 3, 1, o.seed) * 3);
          const pal = raised ? ridge : bark.slice(0, -1);
          color = pal[Math.floor(hash3(sn, plank, 7, o.seed) * pal.length)];
        }
        g.set(i, j, k, color, mat, shade, mat === 'trunk' ? surf : undefined);
      }
    }
  return out;
}

/** A gnarled root mass without a trunk (see {@link rootLimb}). */
export interface LimbOptions extends RootStyle {
  /** Middle of the limb on the ground (x, z), default the origin. */
  at?: [number, number];
  /** Direction of the limb (radians from +x towards +z). */
  heading: number;
  /** Length end to end (metres). */
  length: number;
  /** Height of its axis in the middle (metres). */
  height: number;
  /** Its radius in the middle (metres). */
  thickness: number;
  /** Legs reaching down on either side (default 6). */
  legs?: number;
  /** Raise the end it heads for into a square-cut stub, broken off, instead of diving in there too. */
  stub?: boolean;
}

/**
 * The §20 sheet's root clusters: a thick, knotty limb raised over the ground —
 * a root that outlived its tree, or grew over a ruin (give it a `ground`) —
 * diving in at its ends (or broken off in a raised, square-cut stub), with
 * knots swelling along it and short thick legs that arch out and down on
 * both sides and grip the ground with forked toes. Returns the axis points of
 * the limb and its legs.
 */
export function rootLimb(g: VoxelGrid, o: LimbOptions): RootPoint[] {
  const st = styleOf(o);
  const [x0, z0] = o.at ?? [0, 0];
  const cell = Math.min(g.cell[0], g.cell[2]);
  const R = rng(o.seed * 3 + 17);
  const r = o.thickness;
  const body = { ...st, wiggle: st.wiggle * 0.6 };
  // The body, from the middle out: level, then diving in at the far ends — or rising into the stub.
  const la = o.length * (o.stub ? 0.62 : 0.5);
  const lb = o.length - la;
  const back: RootPoint[] = [];
  const front: RootPoint[] = [];
  walk(g, { from: [x0, o.height, z0], heading: o.heading + Math.PI, length: la, radius: [r, r * 0.55], drop: la, bow: true, dive: 0.22 }, body, 2, back);
  walk(
    g,
    o.stub
      ? { from: [x0, o.height, z0], heading: o.heading, length: lb, radius: [r, r * 0.95], drop: o.length * 20, knees: [[1, o.height * 0.8, lb * 1.2]], cut: true }
      : { from: [x0, o.height, z0], heading: o.heading, length: lb, radius: [r, r * 0.55], drop: lb, bow: true, dive: 0.22 },
    body,
    3,
    front,
  );
  const spine = [...back.reverse(), ...front];
  // Knots: swellings along the limb.
  for (const at of [R.range(0.2, 0.32), R.range(0.45, 0.58), R.range(0.66, 0.78)]) {
    const k = spine[Math.floor(at * spine.length)];
    if (k) capsule(g, { ...k, r: k.r * 1.22, s: 0, lying: false }, { ...k, x: k.x + R.range(-1, 1) * cell, z: k.z + R.range(-1, 1) * cell, r: k.r * 1.1, s: 0, lying: false }, st, 99);
  }
  const out = [...spine];
  // Legs: evenly along the limb, alternating sides, splayed towards the nearer end, arching down.
  const legs = o.legs ?? 6;
  for (let q = 0; q < legs; q++) {
    const f = 0.14 + (0.72 * (q + R.range(0.3, 0.7))) / legs;
    const k = spine[Math.floor(f * spine.length)];
    if (!k) continue;
    const gy = groundUnder(st.ground, k.x, k.z, k.r * 0.8);
    const side = q % 2 ? 1 : -1;
    const splay = (f < 0.5 ? -1 : 1) * R.range(0.1, 0.45);
    const L = r * R.range(2.8, 3.8);
    const rl = k.r * R.range(0.62, 0.78);
    const up = Math.max(0, k.y - gy - rl * 0.62);
    walk(
      g,
      {
        from: [k.x, up, k.z],
        heading: o.heading + side * (Math.PI / 2 - splay),
        length: L,
        radius: [rl, rl * 0.5],
        drop: Math.max(cell * 2, L * R.range(0.55, 0.75)),
        bow: true,
        dive: 0.18,
        forks: [{ at: R.range(0.6, 0.75), turn: (R.chance(0.5) ? 1 : -1) * R.range(0.45, 0.85), length: L * R.range(0.3, 0.45), share: 0.7, dive: 0.5 }],
      },
      st,
      q + 10,
      out,
    );
  }
  return out;
}
