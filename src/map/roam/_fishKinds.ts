/**
 * The fish the explorer catches from the boat (roam/_fishing.ts): five
 * Cambodian freshwater fish of the Tonle Sap and its rivers, with their
 * Khmer names, how big a rod-caught one is (true size), where each bites
 * more often, how hard it pulls, and its small voxel model (true colours and
 * shape, made from a few profile curves). No three.js here: the book's drawn
 * picture (_fishPlate.ts) reads the same model.
 *
 * - ត្រីរៀល trey riel (Henicorhynchus, a small silvery mud carp; Cambodia's
 *   money, the riel, carries its name),
 * - ត្រីរ៉ស់ trey ros (the striped snakehead, Channa striata),
 * - ត្រីប្រា trey pra (the striped catfish, Pangasianodon),
 * - ត្រីក្រាញ់ trey kranh (the climbing perch, Anabas),
 * - ត្រីក្រាយ trey kray (the clown featherback, Chitala ornata).
 */

/** The fish kinds (the nature book's subject kinds of the same names). */
export type FishKind = 'riel' | 'snakehead' | 'catfish' | 'perch' | 'featherback';
export const FISH_KINDS: readonly FishKind[] = ['riel', 'snakehead', 'catfish', 'perch', 'featherback'];

/** The water the float lies on: the great lake, a river, the Kulen stream, a pond or a moat. */
export type FishWater = 'lake' | 'river' | 'stream' | 'pond';

export interface FishSpecies {
  kind: FishKind;
  /** Khmer name, and the same as it is said (for the catch message: "ត្រីរៀល — Trey riel"). */
  km: string;
  say: string;
  /** Length of a rod-caught one (cm, true size): smaller ones more often. */
  cm: readonly [number, number];
  /** How often it takes the bait on each water (relative weights). */
  bites: Readonly<Record<FishWater, number>>;
  /** How hard it fights (0‥1): the struggle's length and the rod's bend. */
  fight: number;
  /** Its shape and colours (see `FishShape`). */
  shape: FishShape;
}

// ── Shape ────────────────────────────────────────────────────────────────────

/** A curve over the length: [u, value] keys (u 0 at the snout, 1 at the tail's tip), linear between them. */
type Curve = readonly (readonly [number, number])[];

/** A fin along the back or the belly: from u0 to u1, its height (share of the length) at the front and at the back. */
interface Fin {
  u0: number;
  u1: number;
  h0: number;
  h1: number;
  color: number;
  /** Spiny: every other cell stands a little higher (the climbing perch's spines). */
  spiny?: boolean;
}

export interface FishShape {
  /** Cells along the length. */
  n: number;
  /** Where the body ends and the tail fin begins (u). */
  tailAt: number;
  /** Height of the back and depth of the belly from the middle line, and the half width (shares of the length). */
  top: Curve;
  bottom: Curve;
  half: Curve;
  /** The tail fin: forked (a deep notch), round (a fan), or run into the anal fin (the featherback). */
  tail: { kind: 'forked' | 'round' | 'merged'; height: number; color: number; edge?: number };
  dorsal: readonly Fin[];
  anal: readonly Fin[];
  /** Pectoral fins: where along (u), how low on the side (share of the belly's depth), colour. */
  pectoral: { u: number; low: number; color: number };
  /** The eye: where (u; height as a share of the back's height), the ring's colour. */
  eye: { u: number; y: number; ring: number };
  /** Colour of a skin cell: `u` along, `v` up (−1 the belly's edge … 1 the back's edge), `outer` on the flank's surface. */
  skin(u: number, v: number): number;
  /** Barbels at the mouth (the catfish). */
  barbels?: number;
}

/** A cell of a fish's voxel model: along (i: 0 the snout), up (j: 0 the middle line), across (k: 0 the middle plane). */
export interface FishCell {
  i: number;
  j: number;
  k: number;
  color: number;
  /** 1 wet shiny skin, 0.5 a fin, 0 dull. */
  shine: number;
}

export interface FishModel {
  kind: FishKind;
  /** Cells along the length (a cell is 1 / n of the fish's length). */
  n: number;
  cells: FishCell[];
  /** Rows used, below and above the middle line; cells across each side of the middle plane. */
  jMin: number;
  jMax: number;
  kMax: number;
}

const at = (c: Curve, u: number): number => {
  if (u <= c[0][0]) return c[0][1];
  for (let i = 1; i < c.length; i++) {
    const [u1, v1] = c[i];
    if (u <= u1) {
      const [u0, v0] = c[i - 1];
      return v0 + ((v1 - v0) * (u - u0)) / Math.max(1e-6, u1 - u0);
    }
  }
  return c[c.length - 1][1];
};

/** Back to belly: a colour for each band of the flank (v from the belly's edge −1 to the back's 1). */
const bands = (back: number, upper: number, flank: number, belly: number, hi = 0.55, mid = 0.2) => (v: number) => (v > hi ? back : v > mid ? upper : v > -0.45 ? flank : belly);

// ── The five fish ────────────────────────────────────────────────────────────

const RIEL_BANDS = bands(0x66746d, 0xa5afac, 0xcfd6d7, 0xeef0ea, 0.72, 0.38);
const SNAKE_BANDS = bands(0x3b402f, 0x57563f, 0x77735a, 0xd8d2bb);
const PRA_BANDS = bands(0x434e58, 0x77838c, 0xa6b0b6, 0xe6eaea);
const KRANH_BANDS = bands(0x485233, 0x626b41, 0x858b58, 0xc2bd86);
const KRAY_BANDS = bands(0x656d72, 0x939b9f, 0xbcc3c5, 0xdde2e2);

export const FISH: Readonly<Record<FishKind, FishSpecies>> = {
  riel: {
    kind: 'riel',
    km: 'ត្រីរៀល',
    say: 'Trey riel',
    cm: [9, 20],
    bites: { lake: 3.2, river: 3, stream: 2.4, pond: 1.4 },
    fight: 0.25,
    shape: {
      n: 24,
      tailAt: 0.79,
      top: [
        [0, 0.03],
        [0.12, 0.09],
        [0.36, 0.135],
        [0.6, 0.1],
        [0.79, 0.05],
      ],
      bottom: [
        [0, 0.025],
        [0.14, 0.08],
        [0.42, 0.12],
        [0.62, 0.085],
        [0.79, 0.045],
      ],
      half: [
        [0, 0.025],
        [0.25, 0.065],
        [0.55, 0.05],
        [0.79, 0.022],
      ],
      tail: { kind: 'forked', height: 0.15, color: 0xb7a29a, edge: 0x7c6f6a },
      dorsal: [{ u0: 0.36, u1: 0.5, h0: 0.1, h1: 0.03, color: 0xa99a92 }],
      anal: [{ u0: 0.62, u1: 0.72, h0: 0.05, h1: 0.02, color: 0xc9a99a }],
      pectoral: { u: 0.24, low: 0.55, color: 0xd5b4a4 },
      eye: { u: 0.09, y: 0.3, ring: 0xd8c48a },
      // (silver; a dark blotch at the root of the tail)
      skin: (u, v) => (u > 0.72 && u < 0.8 && Math.abs(v) < 0.45 ? 0x3a4141 : RIEL_BANDS(v)),
    },
  },
  snakehead: {
    kind: 'snakehead',
    km: 'ត្រីរ៉ស់',
    say: 'Trey ros',
    cm: [25, 65],
    bites: { lake: 1.6, river: 0.6, stream: 0.4, pond: 2.6 },
    fight: 0.8,
    shape: {
      n: 28,
      tailAt: 0.88,
      top: [
        [0, 0.03],
        [0.1, 0.065],
        [0.3, 0.085],
        [0.62, 0.075],
        [0.88, 0.045],
      ],
      bottom: [
        [0, 0.03],
        [0.12, 0.06],
        [0.3, 0.075],
        [0.6, 0.07],
        [0.88, 0.045],
      ],
      half: [
        [0, 0.035],
        [0.18, 0.07],
        [0.5, 0.06],
        [0.88, 0.03],
      ],
      tail: { kind: 'round', height: 0.1, color: 0x45463a, edge: 0x303126 },
      dorsal: [{ u0: 0.32, u1: 0.87, h0: 0.045, h1: 0.05, color: 0x46473a }],
      anal: [{ u0: 0.52, u1: 0.87, h0: 0.04, h1: 0.045, color: 0x55553f }],
      pectoral: { u: 0.24, low: 0.5, color: 0x5d5a45 },
      eye: { u: 0.07, y: 0.55, ring: 0xc9a25a },
      // (dark chevron bands along the flank, pointing forward; the head plain)
      skin: (u, v) => {
        const base = SNAKE_BANDS(v);
        if (u < 0.22 || v < -0.45) return base;
        const w = (u + Math.abs(v) * 0.06) * 11;
        return w - Math.floor(w) < 0.34 ? 0x2d2e22 : base;
      },
    },
  },
  catfish: {
    kind: 'catfish',
    km: 'ត្រីប្រា',
    say: 'Trey pra',
    cm: [25, 60],
    bites: { lake: 2, river: 2.2, stream: 1.6, pond: 0.3 },
    fight: 0.9,
    shape: {
      n: 26,
      tailAt: 0.8,
      top: [
        [0, 0.03],
        [0.12, 0.07],
        [0.3, 0.1],
        [0.55, 0.08],
        [0.8, 0.04],
      ],
      bottom: [
        [0, 0.035],
        [0.15, 0.07],
        [0.4, 0.1],
        [0.62, 0.07],
        [0.8, 0.04],
      ],
      half: [
        [0, 0.035],
        [0.3, 0.065],
        [0.8, 0.02],
      ],
      tail: { kind: 'forked', height: 0.16, color: 0x3e454b, edge: 0x2d3338 },
      dorsal: [
        { u0: 0.28, u1: 0.36, h0: 0.13, h1: 0.03, color: 0x3c434a },
        { u0: 0.7, u1: 0.74, h0: 0.025, h1: 0.02, color: 0x4a535b },
      ],
      anal: [{ u0: 0.55, u1: 0.77, h0: 0.05, h1: 0.03, color: 0x6a737a }],
      pectoral: { u: 0.2, low: 0.7, color: 0x5a636a },
      eye: { u: 0.08, y: -0.05, ring: 0xb9c3c8 },
      // (a dark stripe along the middle of the flank, a fainter one under it)
      skin: (u, v) => {
        if (u > 0.18 && u < 0.8) {
          if (v > 0.05 && v < 0.3) return 0x3d4750;
          if (v > -0.3 && v < -0.12) return 0x7d878f;
        }
        return PRA_BANDS(v);
      },
      barbels: 0x6a6258,
    },
  },
  perch: {
    kind: 'perch',
    km: 'ត្រីក្រាញ់',
    say: 'Trey kranh',
    cm: [9, 21],
    bites: { lake: 2, river: 2.6, stream: 3, pond: 3 },
    fight: 0.45,
    shape: {
      n: 24,
      tailAt: 0.84,
      top: [
        [0, 0.04],
        [0.15, 0.1],
        [0.35, 0.14],
        [0.62, 0.12],
        [0.84, 0.06],
      ],
      bottom: [
        [0, 0.05],
        [0.18, 0.1],
        [0.42, 0.13],
        [0.66, 0.1],
        [0.84, 0.06],
      ],
      half: [
        [0, 0.035],
        [0.3, 0.065],
        [0.84, 0.028],
      ],
      tail: { kind: 'round', height: 0.13, color: 0x5d623f, edge: 0x44482e },
      dorsal: [
        { u0: 0.3, u1: 0.62, h0: 0.05, h1: 0.05, color: 0x4f5536, spiny: true },
        { u0: 0.62, u1: 0.83, h0: 0.075, h1: 0.05, color: 0x5d633f },
      ],
      anal: [{ u0: 0.55, u1: 0.83, h0: 0.06, h1: 0.05, color: 0x6b7048 }],
      pectoral: { u: 0.26, low: 0.4, color: 0x7a7d52 },
      eye: { u: 0.1, y: 0.3, ring: 0xc98a3a },
      // (a dark spot behind the gill cover and one at the root of the tail; the gill cover's edge)
      skin: (u, v) => {
        if (u > 0.2 && u < 0.3 && v > 0.05 && v < 0.5) return 0x2e331f;
        if (u > 0.79 && u < 0.86 && Math.abs(v) < 0.4) return 0x2b2f1c;
        if (u > 0.17 && u < 0.2 && v < 0.6) return 0x535a36;
        return KRANH_BANDS(v);
      },
    },
  },
  featherback: {
    kind: 'featherback',
    km: 'ត្រីក្រាយ',
    say: 'Trey kray',
    cm: [28, 70],
    bites: { lake: 1.6, river: 0.35, stream: 0.1, pond: 0.5 },
    fight: 0.7,
    shape: {
      n: 34,
      tailAt: 0.95,
      // (a small head, then the back humps up behind it; a deep belly in front; a long knife edge to the tail)
      top: [
        [0, 0.02],
        [0.1, 0.045],
        [0.3, 0.115],
        [0.5, 0.085],
        [0.75, 0.045],
        [0.95, 0.015],
      ],
      bottom: [
        [0, 0.03],
        [0.2, 0.09],
        [0.4, 0.12],
        [0.7, 0.07],
        [0.95, 0.02],
      ],
      half: [
        [0, 0.022],
        [0.3, 0.035],
        [0.95, 0.012],
      ],
      tail: { kind: 'merged', height: 0.06, color: 0x7f878b },
      dorsal: [{ u0: 0.44, u1: 0.5, h0: 0.035, h1: 0.02, color: 0x6d7478 }],
      anal: [{ u0: 0.33, u1: 0.97, h0: 0.05, h1: 0.06, color: 0x858c90 }],
      pectoral: { u: 0.17, low: 0.45, color: 0xa3aaad },
      eye: { u: 0.07, y: 0.35, ring: 0xc7ccce },
      // (fine dark bars over the back; a row of big black spots ringed white over the anal fin)
      skin: (u, v) => {
        for (const su of SPOTS) {
          const d = Math.hypot((u - su) * 26, (v + 0.42) * 3);
          if (d < 0.8) return 0x16191b;
          if (d < 1.45) return 0xeef0ee;
        }
        if (v > 0.5 && u > 0.18 && u < 0.62 && (u * 40) % 1 < 0.4) return 0x4c5357;
        return KRAY_BANDS(v);
      },
    },
  },
};

/** Where the clown featherback's spots lie along it (u). */
const SPOTS = [0.54, 0.645, 0.75, 0.855];

// ── Voxel models ─────────────────────────────────────────────────────────────

const models = new Map<FishKind, FishModel>();

/** A fish's voxel model at unit length (built once per kind): the skin cells that can be seen, and its fins (one cell thin). */
export function fishModel(kind: FishKind): FishModel {
  let m = models.get(kind);
  if (!m) models.set(kind, (m = buildModel(FISH[kind])));
  return m;
}

function buildModel(sp: FishSpecies): FishModel {
  const s = sp.shape;
  const n = s.n;
  const c = 1 / n;
  const J = Math.ceil(0.2 * n) + 2;
  const K = Math.ceil(0.08 * n) + 1;
  const key = (i: number, j: number, k: number) => `${i},${j},${k}`;
  // Body: an ellipse across at each cell's middle (at least the middle plane and middle line).
  const inside = (i: number, j: number, k: number): boolean => {
    if (i < 0 || i >= n) return false;
    const u = (i + 0.5) * c;
    if (u > s.tailAt) return false;
    const y = j * c;
    const h = (y >= 0 ? at(s.top, u) : at(s.bottom, u)) + 0.35 * c;
    const w = at(s.half, u) + 0.35 * c;
    const x = k * c;
    return (y / h) ** 2 + (x / w) ** 2 <= 1;
  };
  const cells: FishCell[] = [];
  const taken = new Set<string>();
  const put = (i: number, j: number, k: number, color: number, shine: number) => {
    const id = key(i, j, k);
    if (taken.has(id)) return;
    taken.add(id);
    cells.push({ i, j, k, color, shine });
  };
  // The skin: body cells with a side open to the outside.
  const eyeI = Math.round(s.eye.u * n - 0.5);
  const eyeJ = Math.round((s.eye.y >= 0 ? at(s.top, s.eye.u) : at(s.bottom, s.eye.u)) * s.eye.y * n);
  for (let i = 0; i < n; i++)
    for (let j = -J; j <= J; j++)
      for (let k = -K; k <= K; k++) {
        if (!inside(i, j, k)) continue;
        const open = !inside(i + 1, j, k) || !inside(i - 1, j, k) || !inside(i, j + 1, k) || !inside(i, j - 1, k) || !inside(i, j, k + 1) || !inside(i, j, k - 1);
        if (!open) continue;
        const u = (i + 0.5) * c;
        const hTop = at(s.top, u);
        const hBot = at(s.bottom, u);
        const v = j >= 0 ? (j * c) / Math.max(c, hTop) : (j * c) / Math.max(c, hBot);
        let color = s.skin(u, Math.max(-1, Math.min(1, v)));
        let shine = 1;
        // The eye on each flank's outer cell (a dark pupil in a gold or silver ring), the mouth a dark line.
        const outer = !inside(i, j, k + Math.sign(k || 1)) || !inside(i, j, k - Math.sign(k || 1));
        if (outer && k !== 0) {
          if (i === eyeI && j === eyeJ) [color, shine] = [0x101112, 0.9];
          else if (Math.abs(i - eyeI) + Math.abs(j - eyeJ) === 1) color = s.eye.ring;
        }
        if (i === 0 && j === 0) color = 0x2a2522;
        put(i, j, k, color, shine);
      }
  // Fins along the back and the belly (the middle plane, one cell thin).
  const fin = (f: Fin, up: 1 | -1) => {
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) * c;
      if (u < f.u0 || u > f.u1) continue;
      const t = (u - f.u0) / Math.max(1e-6, f.u1 - f.u0);
      let h = f.h0 + (f.h1 - f.h0) * t;
      if (f.spiny && i % 2 === 0) h += 0.5 * c;
      const edge = up > 0 ? at(s.top, u) : at(s.bottom, u);
      // (from the row over the body's edge: the body keeps cells to a third of a cell past its outline)
      const j0 = Math.floor(edge * n + 0.35) + 1;
      const j1 = Math.round((edge + h) * n);
      for (let j = j0; j <= Math.max(j0, j1); j++) put(i, up * j, 0, j === Math.max(j0, j1) ? shade(f.color, 0.85) : f.color, 0.5);
    }
  };
  for (const f of s.dorsal) fin(f, 1);
  for (const f of s.anal) fin(f, -1);
  // The tail fin.
  const t = s.tail;
  const iT = Math.floor(s.tailAt * n);
  for (let i = iT; i < n; i++) {
    const u = (i + 0.5) * c;
    const a = (u - s.tailAt) / Math.max(1e-6, 1 - s.tailAt);
    const root = Math.max(at(s.top, s.tailAt), at(s.bottom, s.tailAt));
    let h: number;
    let notch = 0;
    if (t.kind === 'forked') {
      h = root + (t.height - root) * Math.min(1, a * 1.3);
      notch = a > 0.35 ? (t.height * 0.9 * (a - 0.35)) / 0.65 : 0;
    } else if (t.kind === 'round') h = (root + (t.height - root) * Math.min(1, a * 2.2)) * (a > 0.55 ? Math.cos(((a - 0.55) / 0.45) * Math.PI * 0.4) : 1);
    else h = root * (1 - a) + t.height * Math.sin(a * Math.PI) * 0.6;
    const jh = Math.max(0, Math.round(h * n));
    const jn = Math.round(notch * n);
    for (let j = -jh; j <= jh; j++) {
      if (Math.abs(j) < jn) continue;
      const rim = Math.abs(j) === jh || i === n - 1;
      put(i, j, 0, rim && t.edge !== undefined ? t.edge : t.color, 0.5);
    }
  }
  // Pectoral fins: a small flap out from each flank behind the gill.
  const pi = Math.round(s.pectoral.u * n);
  const pj = -Math.max(1, Math.round(at(s.bottom, s.pectoral.u) * s.pectoral.low * n));
  const out = Math.max(1, Math.round(at(s.half, s.pectoral.u) * n + 0.35)) + 1;
  for (const side of [-1, 1]) for (let di = 0; di < 2; di++) put(pi + di, pj, side * out, s.pectoral.color, 0.5);
  // Barbels (the catfish): thin whiskers forward and down from the corners of the mouth.
  if (s.barbels !== undefined) for (const side of [-1, 1]) put(-1, -1, side, s.barbels, 0.3);
  let jMin = 0;
  let jMax = 0;
  let kMax = 0;
  for (const cl of cells) {
    jMin = Math.min(jMin, cl.j);
    jMax = Math.max(jMax, cl.j);
    kMax = Math.max(kMax, Math.abs(cl.k));
  }
  return { kind: sp.kind, n, cells, jMin, jMax, kMax };
}

/** A colour a little darker (k < 1) or lighter. */
export function shade(hex: number, k: number): number {
  const r = Math.min(255, Math.round(((hex >> 16) & 255) * k));
  const g = Math.min(255, Math.round(((hex >> 8) & 255) * k));
  const b = Math.min(255, Math.round((hex & 255) * k));
  return (r << 16) | (g << 8) | b;
}

/** A catch's length (cm) from a random 0‥1: smaller ones more often. */
export function catchLength(kind: FishKind, r: number): number {
  const [a, b] = FISH[kind].cm;
  return Math.round(a + (b - a) * Math.pow(r, 1.7));
}

/** Which fish takes the bait on this water, from a random 0‥1. */
export function pickFish(water: FishWater, r: number): FishKind {
  let sum = 0;
  for (const k of FISH_KINDS) sum += FISH[k].bites[water];
  let x = r * sum;
  for (const k of FISH_KINDS) {
    x -= FISH[k].bites[water];
    if (x <= 0) return k;
  }
  return 'riel';
}
