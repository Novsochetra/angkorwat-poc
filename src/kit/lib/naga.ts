import { hash3, valueNoise3 } from '../../voxel/random';
import type { Surf, VoxelBuilder } from '../../voxel/VoxelBuilder';
import { Carver, part, STATUE_MOSS, stoneOf, tagOf, type CellInfo, type CellLook, type Part } from '../assets/20/_statue';
import { BlockSet } from '../BlockSet';
import { fromSheet, SANDSTONE } from '../palette';
import { PieceBuilder } from '../PieceBuilder';
import { rng, TEXEL } from '../shapes';
import { stoneSurf, type StoneFinish } from '../surface';
import type { KitPiece } from '../types';

/**
 * The naga balustrade of Angkor Wat (§21.2 #10): the serpent's round, scaled
 * body carried on short open posts along the causeways, the avenue and the
 * terrace edges, rearing up at the ends into the seven-headed cobra fan — the
 * hoods spread like fingers, the centre head highest, a flame-edged halo
 * behind them, on a moulded post over a step block — or curling up into its
 * tail. Built to the real monument (docs/kit-work/SIZES-ARCH.md §1.10), in the
 * sheets' warm voxel stone.
 *
 * Placement contract (metres; +Y up, 1/16 m texel grid):
 *  - Everything runs **along X**. The body's axis lies at z = `z` (default 0),
 *    the walkway the balustrade stands on at y = `y` (default 0).
 *  - {@link nagaRun}: `length` is whole 2 m post bays; the run fills
 *    x = `x` ± length/2 exactly (posts at the bay centres, 1 m in from each
 *    end), so runs tile end to end — place the next one at x + length — and
 *    the body carries on across the joint. Kerb 0.1875 m, posts to 0.625 m,
 *    body ⌀ 0.375 m on top of them, **top of the body 1.0 m** above the walkway;
 *    0.5 m wide (the kerb), z ± 0.25.
 *  - {@link nagaHead} / {@link nagaTail}: an end fills **one bay** (2 m) beyond
 *    the end of a run: `x` is the run's end and `facing` which way the end
 *    points (+1: it fills x … x + 2 and the heads look towards +X; −1: x − 2 … x,
 *    looking towards −X). A run of n bays with a head and a tail is n + 2 bays.
 *    Head: step block 1.125 m square (z ± 0.5625) × 0.3125 m, moulded post to
 *    0.9375 m, neck and fan to **2.875 m**, the fan 1.375 m wide (z ± 0.69).
 *    Tail: the body rises from its last post into a curl ≈ 2.2 m high.
 *  - Colliders: the run is one box to 1.0 m (the explorer, who climbs 0.42 m,
 *    can neither step onto the body nor pass under it); the head a box each
 *    for its step block (walkable at 0.3125), its post and neck, and its fan.
 *  - Turn a balustrade to run along Z by building it into its own
 *    PieceBuilder and placing that with `placePiece(…, { turn })` (place.ts).
 *
 * Usage (a 4-bay causeway balustrade, heads at the west end, on a deck 1 m up):
 *
 *   const p = new PieceBuilder();
 *   nagaRun(p, { length: 8, x: 0, y: 1, z: 5.75, seed: 3 });
 *   nagaHead(p, { x: -4, facing: -1, y: 1, z: 5.75, seed: 3 });
 *   // or as a piece of its own, centred on its footprint:
 *   const piece = nagaBalustrade({ bays: 2, left: 'tail', right: 'head', seed: 1, moss: 0.4 });
 */

/** Kit sizes of the naga balustrade (metres). */
export const NAGA = {
  /** Post spacing and run module. */
  bay: 2,
  /** Length of a head or tail end: one bay. */
  end: 2,
  /** Width of the kerb, the balustrade's footprint across. */
  width: 0.5,
  kerb: 0.1875,
  /** Top of the post capitals = underside of the body. */
  postTop: 0.625,
  /** Body diameter. */
  body: 0.375,
  /** Top of the body above the walkway. */
  top: 1.0,
  /** Top of the fan's halo. */
  headTop: 2.875,
  /** Width of the fan (the halo) across. */
  fanWidth: 1.375,
  /** Width (and length) of the head's step block. */
  stepWidth: 1.125,
  /** Top of the tail's curl. */
  tailTop: 2.25,
} as const;

/** How the stone looks and how worn it is (every part takes these). */
export interface NagaLook {
  seed: number;
  /** Stone tones and pattern (default {@link NAGA_FINISH}, the sheet's warm stone). */
  finish?: StoneFinish;
  /** Moss on the tops, 0‥1 (default 0.25: a little in the hollows, as on the sheet). */
  moss?: number;
  /**
   * Damage, 0‥1 (default 0): chipped edges, hoods broken off the fan (one per
   * ≈ 0.2), bites out of the halo and the body, posts gone from the run, the
   * tail's tip snapped.
   */
  broken?: number;
}

export interface NagaRunOptions extends NagaLook {
  /** Length in metres, rounded to whole 2 m bays (at least one). */
  length: number;
  /** Centre along X (default 0). */
  x?: number;
  /** Walkway level (default 0). */
  y?: number;
  /** Body axis across (default 0). */
  z?: number;
  /** Scales on the body, a small stone each (default true); false = plain 1 m stones, a third of the blocks. */
  scales?: boolean;
}

export interface NagaEndOptions extends NagaLook {
  /** The end of the run this end attaches to (its joint plane). */
  x: number;
  /** +1: the end fills x … x + 2 and points towards +X; −1: x − 2 … x, towards −X. */
  facing: 1 | -1;
  y?: number;
  z?: number;
}

/**
 * The sheet's naga: golden-tan sandstone sampled off the lit tops of its body
 * and plinth (through fromSheet, like the other §21.2 pieces), two greyer
 * weathered tones for the odd patch, a little lichen and grime.
 */
export const NAGA_FINISH: StoneFinish = {
  palette: [0xcf9e66, 0xc8965f, 0xd6a870, 0xc3915c, 0xd2a36c, 0xb48f65, 0xa88c6c].map(fromSheet),
  surf: stoneSurf({ moss: 0.1, lichen: 0.1, stain: 0.22 }),
  wear: 0.04,
};

const T = TEXEL;
const H = T / 2;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

// ── Stone look ────────────────────────────────────────────────────────────────

/**
 * Stone look shared by every part: tones picked in soft blotches (a carved
 * stone reads as one stone with weathered patches, not as noise), the
 * finish's pattern, moss on what faces up, grime lower down.
 */
class Look {
  readonly f: StoneFinish;
  readonly moss: number;
  readonly broken: number;
  readonly seed: number;

  constructor(o: NagaLook) {
    this.f = o.finish ?? NAGA_FINISH;
    this.moss = o.moss ?? 0.25;
    this.broken = o.broken ?? 0;
    this.seed = o.seed;
  }

  /**
   * A stone's tone at a point: the finish's first five (main) tones in soft
   * blotches, its extra, darker tones only in the odd weathered patch.
   */
  tone(x: number, y: number, z: number): number {
    const p = this.f.palette;
    const main = Math.min(5, p.length);
    const patch = valueNoise3(x * 1.4 + 11, y * 1.4, z * 1.4, this.seed + 2);
    if (p.length > main && patch > 0.75) return p[main + Math.floor(hash3(Math.floor(x * 4), Math.floor(y * 4), Math.floor(z * 4), this.seed + 5) * (p.length - main))];
    const n = valueNoise3(x * 2.2, y * 2.2, z * 2.2, this.seed + 3) * 0.85 + hash3(Math.floor(x * 8), Math.floor(y * 8), Math.floor(z * 8), this.seed + 4) * 0.15;
    return p[Math.min(main - 1, Math.floor(n * main))];
  }

  /** A carved stone's tone: one main tone per stone, a tone over in patches (so each hood reads as one stone). */
  carved(stone: number, x: number, y: number, z: number): number {
    const p = this.f.palette;
    const main = Math.min(5, p.length);
    const base = Math.floor(hash3(stone, 7, 1, this.seed) * main);
    const k = valueNoise3(x * 3, y * 3, z * 3, this.seed + 6) > 0.6 ? 1 : 0;
    return p[(base + k) % main];
  }

  /** Pattern amounts at a point; `up` = how much the face looks at the sky (0‥1). */
  surf(x: number, y: number, z: number, up: number): Surf {
    const [moss, lichen, crack, stain] = this.f.surf;
    const n = valueNoise3(x * 1.3, y * 1.3, z * 1.3, this.seed + 7);
    return [
      clamp01(moss * (0.4 + n) + this.moss * up * (0.2 + 1.1 * n)),
      clamp01(lichen * (0.5 + n)),
      clamp01(crack * (0.6 + this.broken)),
      clamp01(stain * (0.5 + 0.8 * valueNoise3(x * 0.9 + 5, y * 2, z * 0.9, this.seed + 9)) + this.broken * 0.25),
    ];
  }
}

// ── The run ───────────────────────────────────────────────────────────────────

/**
 * The body's cross-section, bottom up: one texel per row, with its half width
 * and the length of its scales. A flat belly band on the post capitals, three
 * rows of scales 0.375 m across, the shoulders and the spine on top: a round
 * 6-texel profile (4, 6, 6, 6, 4, 2 texels wide), ⌀ 0.375 m, from 0.625 to
 * 1.0 m. Scales are a quarter metre, staggered row to row like the sheet's
 * body blocks.
 */
const BODY_ROWS: readonly { y: number; hw: number; seg: number; stagger: number }[] = [
  { y: 0.625, hw: 0.125, seg: 0.5, stagger: 0 },
  { y: 0.6875, hw: 0.1875, seg: 0.25, stagger: 0 },
  { y: 0.75, hw: 0.1875, seg: 0.25, stagger: 0.125 },
  { y: 0.8125, hw: 0.1875, seg: 0.25, stagger: 0 },
  { y: 0.875, hw: 0.125, seg: 0.25, stagger: 0.125 },
  { y: 0.9375, hw: 0.0625, seg: 0.5, stagger: 0.25 },
];

/** Half width of the body's section at `dv` above its axis (0 outside): the run's rows, for the carved ends. */
function bodyHalfWidth(dv: number): number {
  const row = Math.floor((dv + NAGA.body / 2) / T);
  return row < 0 || row >= BODY_ROWS.length ? 0 : BODY_ROWS[row].hw;
}

/** Post tiers above the kerb: [bottom, top, width] (m): base, shaft, capital. */
const POST: readonly [number, number, number][] = [
  [NAGA.kerb, 0.3125, 0.375],
  [0.3125, 0.5, 0.25],
  [0.5, NAGA.postTop, 0.375],
];

/**
 * A straight run of balustrade along X: `length` in whole bays, centred on `x`,
 * filling x ± length/2 (see the placement contract at the top of the file).
 */
export function nagaRun(p: PieceBuilder, o: NagaRunOptions): void {
  const look = new Look(o);
  const n = Math.max(1, Math.round(o.length / NAGA.bay));
  const len = n * NAGA.bay;
  const x0 = (o.x ?? 0) - len / 2;
  const x1 = x0 + len;
  const y = o.y ?? 0;
  const z = o.z ?? 0;
  const r = rng(o.seed * 31 + 7);
  const set = new BlockSet(T);
  const style = (x: number, yy: number, zz: number, up: number, shade = 1) => ({ surf: look.surf(x, yy, zz, up), shade, broken: null });
  // Kerb: 1 m stones.
  for (let s = 0; s < n * 2; s++) {
    const a = x0 + s;
    set.add(a, y, z - NAGA.width / 2, a + 1, y + NAGA.kerb, z + NAGA.width / 2, look.tone(a + 0.5, y, z), style(a + 0.5, y, z, 0.5));
  }
  // Posts at the bay centres; a worn balustrade has lost some.
  for (let b = 0; b < n; b++) {
    const px = x0 + NAGA.bay / 2 + b * NAGA.bay;
    if (look.broken > 0.3 && n > 1 && r.chance(look.broken * 0.3)) continue;
    for (const [t0, t1, w] of POST) set.add(px - w / 2, y + t0, z - w / 2, px + w / 2, y + t1, z + w / 2, look.tone(px, y + t0, z), style(px, y + t0, z, 0.3));
  }
  bodyRows(set, look, x0, x1, y, z, o.scales ?? true);
  if (look.broken > 0) {
    // Bites out of the body's spine and flanks, chipped kerb and posts.
    for (let b = 0; b < Math.round(look.broken * n * 1.5); b++) set.carveSphere(r.range(x0 + 0.3, x1 - 0.3), y + r.range(0.85, 1.0), z + r.pick([-0.19, 0.19]), r.range(0.06, 0.12), o.seed + b, 0.4);
    set.erode(look.broken * 0.5, o.seed + 5, { where: (_x, yy) => yy < y + NAGA.postTop });
  }
  set.emit(p.voxels, { seed: o.seed, jitter: 0.03 });
  p.collider(x0, y, z - NAGA.width / 2, x1, y + NAGA.top, z + NAGA.width / 2);
}

/**
 * The body from x0 to x1 as rows of small stones — scales staggered row to
 * row, so the body reads scaled from any side, and continues seamlessly from
 * one run to the next (the stagger keys off the texel grid).
 */
function bodyRows(set: BlockSet, look: Look, x0: number, x1: number, y: number, z: number, scales: boolean): void {
  for (const [ri, row] of BODY_ROWS.entries()) {
    const seg = scales ? row.seg : 1;
    const stagger = scales ? row.stagger : 0;
    const up = ri >= 4 ? 1 : ri === 3 ? 0.4 : 0.1;
    // Joints on a grid of `seg` shifted by `stagger`, clipped to the run.
    let a = x0;
    while (a < x1 - 1e-6) {
      const next = Math.min(x1, Math.floor((a - stagger + 1e-6) / seg + 1) * seg + stagger);
      const cx = (a + next) / 2;
      const yy = y + row.y;
      // Alternate scales a shade apart, like the sheet's chequered body blocks.
      const k = Math.floor((a + 1e-6) / seg);
      const shade = scales && ri > 0 && ri < 5 ? ((k + ri) % 2 ? 0.93 : 1.05) : 1;
      set.add(a, yy, z - row.hw, next, yy + T, z + row.hw, look.tone(cx, yy, z), { surf: look.surf(cx, yy, z, up), shade, broken: null });
      a = next;
    }
  }
}

// ── Ends: shared frame ────────────────────────────────────────────────────────

/**
 * Local frame of an end: u = distance out from the joint (along `facing`),
 * v = height above the walkway, w = across (z − z0). The ends are symmetric
 * in w, so flipping u alone mirrors them cleanly.
 */
class EndFrame {
  constructor(
    readonly x0: number,
    readonly y0: number,
    readonly z0: number,
    readonly f: 1 | -1,
  ) {}

  /** Piece-space box [x0, y0, z0, x1, y1, z1] of a local box. */
  box(u0: number, v0: number, w0: number, u1: number, v1: number, w1: number): [number, number, number, number, number, number] {
    const a = this.x0 + this.f * u0;
    const b = this.x0 + this.f * u1;
    return [Math.min(a, b), this.y0 + v0, this.z0 + w0, Math.max(a, b), this.y0 + v1, this.z0 + w1];
  }

  /** A carve grid covering local u ∈ [u0, u1] (its origin on the cell grid at the joint). */
  carver(cell: number): Carver {
    return new Carver(cell, [this.x0, this.y0, this.z0], 1);
  }

  /** Sample `fn(u, v, w)` over a local box into a carver. */
  add(c: Carver, u0: number, v0: number, w0: number, u1: number, v1: number, w1: number, fn: (u: number, v: number, w: number) => Part): void {
    const [x0, y0, z0, x1, y1, z1] = this.box(u0, v0, w0, u1, v1, w1);
    c.add([x0, y0, z0], [x1, y1, z1], (x, y, z) => fn(this.f * (x - this.x0), y - this.y0, z - this.z0));
  }

  local(x: number, y: number, z: number): [number, number, number] {
    return [this.f * (x - this.x0), y - this.y0, z - this.z0];
  }
}

// Carve tags (low 4 bits of a cell's part) and what they look like.
const TAG = {
  stone: 1,
  /** Ventral scale bands: a shade darker. */
  band: 2,
  mouth: 3,
  teeth: 4,
  eye: 5,
  /** Medallions on the hoods and the neck: the raised rings. */
  medal: 6,
  /** Their grooves. */
  groove: 7,
  /** The halo's flame scrolls, standing proud. */
  flame: 8,
  /** The body's scales, alternate shade. */
  scale: 9,
  /** The dorsal ridge. */
  spine: 10,
} as const;

// Stones (the high bits): cells of one stone merge, stones meet in a seam.
const STONE = { halo: 1, trunk: 2, body: 3, tail: 4, hood: 5 } as const;

/** Shared carve look: tone, shade by tag, moss cushions on open tops, broken faces. */
function carveLook(look: Look, frame: EndFrame, seed: number): (c: CellInfo) => CellLook {
  const moss = STATUE_MOSS;
  return (c) => {
    const tag = tagOf(c.part);
    const v = frame.local(c.x, c.y, c.z)[1];
    // The halo sits back in the hoods' shade; the hoods catch the light.
    const st = stoneOf(c.part);
    let color = st === STONE.body || st === STONE.tail ? look.tone(c.x, c.y, c.z) : look.carved(st, c.x, c.y, c.z);
    let shade = st === STONE.halo ? 0.8 : st >= STONE.hood ? 1.04 : 1;
    let cavity = 1;
    switch (tag) {
      case TAG.band:
        shade *= 0.88;
        break;
      case TAG.mouth:
        color = SANDSTONE.cavity[0];
        cavity = 0.3;
        break;
      case TAG.teeth:
        color = SANDSTONE.clean[3];
        cavity = 0.2;
        break;
      case TAG.eye:
        color = SANDSTONE.cavity[1];
        cavity = 0.2;
        break;
      case TAG.medal:
        shade *= 1.06;
        cavity = 0.4;
        break;
      case TAG.groove:
        shade *= 0.8;
        cavity = 0.4;
        break;
      case TAG.flame:
        shade *= st === STONE.halo ? 1.25 : 1.08;
        cavity = 0.6;
        break;
      case TAG.scale:
        shade *= 0.95;
        break;
      case TAG.spine:
        shade *= 1.03;
        break;
    }
    if (c.scar) color = SANDSTONE.broken[Math.floor(hash3(Math.round(c.x * 32), Math.round(c.y * 32), Math.round(c.z * 32), seed) * SANDSTONE.broken.length)];
    const up = c.top ? c.sky : 0;
    const surf = look.surf(c.x, c.y, c.z, up);
    // Moss settles on open tops, most on broad ones and low down.
    let cushion: number | undefined;
    const m = look.moss * (0.35 + valueNoise3(c.x * 3, c.y * 3, c.z * 3, seed + 11)) * (1.2 - v / 4);
    if (c.top && c.sky > 0.55 && tag !== TAG.teeth && tag !== TAG.eye && hash3(Math.round(c.x * 32), Math.round(c.y * 32), Math.round(c.z * 32), seed + 2) < m * 0.9)
      cushion = moss[Math.floor(hash3(Math.round(c.x * 16), 0, Math.round(c.z * 16), seed + 3) * moss.length)];
    return { color, shade, cavity, surf, cushion };
  };
}

// ── The head end ──────────────────────────────────────────────────────────────

/** The head's layout in its end frame (metres): u out from the joint, v up. */
const HEAD = {
  /** Centre of the moulded post under the neck. */
  post: 1.25,
  /** Top of the post (its lotus cushion). */
  postTop: 0.9375,
  /** Where the hoods' axes meet (the focus of the fan). */
  focus: 1.3125,
  /** The hoods' back plane and the fan's middle plane. */
  fan: 1.3125,
  haloBack: 1.125,
  haloFront: 1.25,
  haloBottom: 1.4375,
  haloTop: NAGA.headTop,
  haloW: NAGA.fanWidth / 2,
} as const;

/**
 * The seven hoods, centre first: tilt from the vertical (degrees), distance
 * from the focus to the crown, half width of the head, and how far the hood's
 * front stands out of the fan (the outer ones lie further back, tucked behind
 * their neighbours). Measured on a front photo of the causeway naga: the
 * crowns fall on a steep arc (centre 0.31 m under the halo's tip, the outer
 * ones 1.05 m), 0.2–0.3 m wide, all but touching.
 */
const HOODS: readonly { tilt: number; len: number; hw: number; front: number }[] = [
  { tilt: 0, len: 1.25, hw: 0.15, front: 0.15 },
  { tilt: 15, len: 1.03, hw: 0.12, front: 0.13 },
  { tilt: 30, len: 0.84, hw: 0.115, front: 0.115 },
  { tilt: 45, len: 0.72, hw: 0.11, front: 0.1 },
];

/** The halo's outline (right half), sampled: [w, v] from the bottom corner over the top to the tip. */
const HALO_EDGE: readonly [number, number][] = (() => {
  const pts: [number, number][] = [];
  for (let n = 0; n <= 64; n++) {
    const v = HEAD.haloBottom + ((HEAD.haloTop - HEAD.haloBottom) * n) / 64;
    pts.push([haloHalfWidth(v), v]);
  }
  return pts;
})();

/** Half width of the halo at height v (0 outside): an ogive, widest a third of the way up, pointed at the top. */
function haloHalfWidth(v: number): number {
  const t = (v - HEAD.haloBottom) / (HEAD.haloTop - HEAD.haloBottom);
  if (t < 0 || t > 1) return 0;
  const tm = 0.32;
  if (t < tm) return 0.42 + (HEAD.haloW - 0.42) * Math.sin(((t / tm) * Math.PI) / 2);
  return HEAD.haloW * Math.pow(Math.cos((((t - tm) / (1 - tm)) * Math.PI) / 2), 0.72);
}

/** Distance inside the halo's plain outline (< 0 outside), measured square to the rim. */
function haloDepth(v: number, w: number): number {
  const hw = haloHalfWidth(v);
  if (hw <= 0 || Math.abs(w) >= hw) return -1;
  let d = v - HEAD.haloBottom;
  for (let n = 1; n < HALO_EDGE.length; n++) {
    const [w0, v0] = HALO_EDGE[n - 1];
    const [w1, v1] = HALO_EDGE[n];
    const ew = w1 - w0;
    const ev = v1 - v0;
    const t = clamp01(((Math.abs(w) - w0) * ew + (v - v0) * ev) / (ew * ew + ev * ev));
    d = Math.min(d, Math.hypot(Math.abs(w) - (w0 + ew * t), v - (v0 + ev * t)));
  }
  return d;
}

/** Inside the flame-scalloped halo: a flame tongue every ≈ 0.11 m round the rim. */
function haloInside(v: number, w: number): number {
  const d = haloDepth(v, w);
  if (d < 0) return d;
  const ang = Math.atan2(Math.abs(w), v - (HEAD.haloBottom + 0.5));
  return d - 0.05 * (0.5 + 0.5 * Math.cos(ang * 44));
}

/** A hood's frame: along its axis from the focus (a), across it (b). */
function hoodAxes(v: number, w: number, tilt: number): [number, number] {
  const s = Math.sin(tilt);
  const c = Math.cos(tilt);
  const dv = v - HEAD.focus;
  return [w * s + dv * c, w * c - dv * s];
}

/** How far down from the crown the head reaches (the rest of the hood is the finger). */
const HEAD_LEN = 0.28;

/**
 * A hood's finger, sampled at (a along its axis, b across, c = u − fan plane,
 * forward): a long rounded finger narrower than the head, so the halo shows
 * between the fingers, flaring a little towards the head, with the belly's
 * scale bands and a little medallion on its front. The part, or 0.
 */
function fingerPart(a: number, b: number, c: number, h: (typeof HOODS)[number], stone: number): Part {
  const { len, hw } = h;
  if (a < 0.1 || a > len - HEAD_LEN || c < -0.0625) return 0;
  const ab = Math.abs(b);
  const d = len - a;
  const hwn = hw * (0.58 + 0.17 * Math.min(1, a / len));
  if (ab > hwn) return 0;
  const front = h.front - 0.1 + 0.1 * Math.sqrt(Math.max(0, 1 - (ab / hwn) ** 2));
  // The medallion stands a half texel proud.
  const mr = Math.hypot(d - 0.42, b);
  if (mr < 0.05 && c > front - 1e-6 && c < front + H) return mr < 0.02 ? 0 : part(TAG.medal, stone);
  if (c > front) return 0;
  if (mr < 0.05 && c > front - H) return part(mr < 0.02 ? TAG.groove : TAG.medal, stone);
  const skin = c > front - 0.035;
  return part(skin && Math.floor(a / T) % 2 ? TAG.band : TAG.stone, stone);
}

/**
 * A cobra head at the end of its finger, sampled at (d down from its crown
 * along its own axis, b across, c forward). It stands straighter than its
 * finger, so the outer faces still look out of the fan, and juts well out of
 * it: a rounded crown like an arch, the snout over an open mouth set with
 * fangs, the eyes dark hollows at the corners of the brow.
 */
function headPart(d: number, b: number, c: number, h: (typeof HOODS)[number], stone: number): Part {
  const { hw } = h;
  if (d < 0 || d > HEAD_LEN || c < -0.0625) return 0;
  const ab = Math.abs(b);
  const crown = d < 0.1 ? Math.sqrt(Math.max(0, 1 - ((0.1 - d) / 0.1) ** 2)) : 1;
  const hwh = hw * (0.25 + 0.75 * crown) * (d > 0.22 ? 0.88 : 1);
  if (ab > hwh) return 0;
  // The front: the snout juts out over the mouth, the chin tucks back into the hood.
  const top = h.front + 0.13;
  const snout = d < 0.05 ? top - 0.1 + (0.1 * d) / 0.05 : d < 0.14 ? top : top - ((d - 0.14) / 0.14) * 0.13;
  const front = snout - 0.08 * (ab / Math.max(hwh, 1e-3)) ** 2;
  if (c > front) return 0;
  if (d > 0.05 && d < 0.1 && ab > hwh * 0.45 && ab < hwh * 0.8 && c > front - H) return part(TAG.eye, stone);
  if (d > 0.14 && d < 0.23 && ab < hw * 0.5) {
    if (c > top - 0.13) {
      const fang = d < 0.165 && Math.floor((b + 1) / H) % 2 === 0;
      return fang ? part(TAG.teeth, stone) : 0;
    }
    if (c > top - 0.16) return part(TAG.mouth, stone);
  }
  return part(TAG.stone, stone);
}

const TILTS = HOODS.map((hd) => (hd.tilt * Math.PI) / 180);
/** Stone id of hood k (0 = centre) on side s. */
const hoodStone = (k: number, s: number) => STONE.hood + k * 2 + (s < 0 ? 1 : 0);

/** The fan's hoods at a point of the head's frame (0 outside them). */
function hoodAt(u: number, v: number, w: number): Part {
  const c = u - HEAD.fan;
  // The centre hood first: it laps over its neighbours where they meet.
  for (let k = 0; k <= 3; k++)
    for (const s of k ? [-1, 1] : [1]) {
      const h = HOODS[k];
      const tilt = s * TILTS[k];
      const stone = hoodStone(k, s);
      const [a, b] = hoodAxes(v, w, tilt);
      const fp = fingerPart(a, b, c, h, stone);
      if (fp) return fp;
      // The head turns only part of the way with its finger, about its neck.
      const nv = HEAD.focus + (h.len - HEAD_LEN) * Math.cos(tilt);
      const nw = (h.len - HEAD_LEN) * Math.sin(tilt);
      const ht = tilt * 0.55;
      const dv = v - nv;
      const dw = w - nw;
      const ha = dw * Math.sin(ht) + dv * Math.cos(ht);
      const hb = dw * Math.cos(ht) - dv * Math.sin(ht);
      const hp = headPart(HEAD_LEN - ha, hb, c, h, stone);
      if (hp) return hp;
    }
  return 0;
}

/**
 * The seven-headed head end, one bay beyond the run's end at `x` (see the
 * contract at the top): kerb, a two-tier step block, the moulded post with
 * its lotus cushion, the body rising from the run into the neck, and the fan.
 */
export function nagaHead(p: PieceBuilder, o: NagaEndOptions): void {
  const look = new Look(o);
  const fr = new EndFrame(o.x, o.y ?? 0, o.z ?? 0, o.facing);
  const r = rng(o.seed * 17 + 3);
  // ── Masonry: kerb, step block, post ──
  const set = new BlockSet(T);
  const add = (u0: number, v0: number, w0: number, u1: number, v1: number, w1: number, up = 0.5, shade = 1) => {
    const bx = fr.box(u0, v0, w0, u1, v1, w1);
    const [cx, cy, cz] = [(bx[0] + bx[3]) / 2, bx[1], (bx[2] + bx[5]) / 2];
    return set.add(...bx, look.tone(cx, cy, cz), { surf: look.surf(cx, cy, cz, up), shade, broken: null });
  };
  const kw = NAGA.width / 2;
  const sw = NAGA.stepWidth / 2;
  const s0 = HEAD.post - sw;
  const s1 = HEAD.post + sw;
  add(0, 0, -kw, s0, NAGA.kerb, kw);
  // The step block: two tiers, the lower of two stones, the upper split down the middle.
  add(s0, 0, -sw, HEAD.post, 0.1875, sw);
  add(HEAD.post, 0, -sw, s1, 0.1875, sw);
  add(s0 + T, 0.1875, -sw + T, s1 - T, 0.3125, 0, 0.8);
  add(s0 + T, 0.1875, 0, s1 - T, 0.3125, sw - T, 0.8);
  // The post, as slim as the neck it carries (≈ 0.45 m on photos): plinth,
  // base, a shaft with a carved band, collar and lotus cushion.
  const pc = HEAD.post;
  const tier = (v0: number, v1: number, half: number, up = 0.3, shade = 1) => add(pc - half, v0, -half, pc + half, v1, half, up, shade);
  tier(0.3125, 0.375, 0.3125, 0.6);
  tier(0.375, 0.4375, 0.25, 0.6);
  tier(0.4375, 0.5625, 0.1875);
  tier(0.5625, 0.625, 0.1875, 0.3, 0.84);
  tier(0.625, 0.75, 0.1875);
  tier(0.75, 0.8125, 0.25, 0.6);
  tier(0.8125, HEAD.postTop, 0.25, 0.7);
  if (look.broken > 0) set.erode(look.broken * 0.45, o.seed + 13);
  set.emit(p.voxels, { seed: o.seed, jitter: 0.03 });
  lotusPetals(p.voxels, fr, look, pc, 0.8125, 0.25);

  // ── Carving: the body rising into the neck, the neck, the halo (texel cells) ──
  const coarse = fr.carver(T);
  fr.add(coarse, 0, 0.55, -0.5, 1.72, HEAD.haloTop + 0.1, 0.5, (u, v, w) => neckPart(u, v, w));
  fr.add(coarse, 1.0, HEAD.haloBottom - 0.1, -HEAD.haloW - 0.1, 1.4, HEAD.haloTop + 0.1, HEAD.haloW + 0.1, (u, v, w) => (u >= HEAD.haloFront && hoodAt(u, v, w) ? 0 : haloPart(u, v, w)) || neckPart(u, v, w));
  // The post's cushion under the neck, and the run's body at the joint: solid, drawn elsewhere.
  ghostLocal(coarse, fr, pc - 0.25, 0.8125, -0.25, pc + 0.25, HEAD.postTop, 0.25);
  ghostLocal(coarse, fr, -T, NAGA.postTop, -0.1875, 0, NAGA.top, 0.1875);

  // ── Carving: the seven hoods and heads (half-texel cells) ──
  const fine = fr.carver(H);
  fr.add(fine, HEAD.fan - 0.07, HEAD.focus, -HEAD.haloW, HEAD.fan + 0.32, HEAD.haloTop, HEAD.haloW, (u, v, w) => {
    // (below the neck's top the neck's own texel cells carry the hoods' roots)
    if (neckInside(u, v, w)) return 0;
    return hoodAt(u, v, w);
  });
  // The halo behind the hoods and the neck under them are solid for the hoods' shading.
  ghostWhere(fine, fr, HEAD.haloFront - H, HEAD.focus, -HEAD.haloW, HEAD.fan + 0.32, HEAD.haloTop, HEAD.haloW, (u, v, w) => neckInside(u, v, w) || (u < HEAD.haloFront && haloInside(v, w) > 0));

  // ── Damage ──
  if (look.broken > 0) {
    // Hoods snapped off at the neck or through the head, a broken face left behind.
    const hoods = [...Array(7).keys()].sort(() => r() - 0.5).slice(0, Math.round(look.broken * 4.5));
    for (const hi of hoods) {
      const k = Math.abs(hi - 3);
      const s = hi < 3 ? -1 : 1;
      const stone = hoodStone(k, s);
      const cutAt = HOODS[k].len - r.range(0.08, 0.5);
      fine.cut((x, y, z, pt) => {
        if (stoneOf(pt) !== stone) return false;
        const [, v, w] = fr.local(x, y, z);
        const [a, b] = hoodAxes(v, w, s * TILTS[k]);
        return a > cutAt + b * 0.4 + (valueNoise3(x * 20, y * 20, z * 20, o.seed + hi) - 0.5) * 0.06;
      });
    }
    fine.chip(look.broken * 0.5, o.seed + 21, (x, y, z) => fr.local(x, y, z)[1] > HEAD.haloBottom + 0.3);
    coarse.chip(look.broken * 0.6, o.seed + 22, (x, y, z) => fr.local(x, y, z)[1] > HEAD.haloBottom);
    // A bite out of the halo's rim.
    const side = r.pick([-1, 1]);
    const bv = r.range(1.9, 2.5);
    const bite = fr.box(HEAD.haloBack, bv, side * (haloHalfWidth(bv) - 0.05), HEAD.haloBack, bv, side * (haloHalfWidth(bv) - 0.05));
    coarse.bite([bite[0], bite[1], bite[2]], 0.12 + look.broken * 0.12, o.seed + 23);
    coarse.prune(6);
    fine.prune(6);
  }
  const lookFn = carveLook(look, fr, o.seed);
  coarse.emit(p.voxels, lookFn, { seed: o.seed, ao: 0.35, cavity: 0.8 });
  fine.emit(p.voxels, lookFn, { seed: o.seed + 1, ao: 0.35, cavity: 0.7 });

  // ── Colliders: the kerb and the rising body, the step block, post and neck, the fan ──
  p.collider(...fr.box(0, 0, -kw, s0, NAGA.top, kw));
  p.collider(...fr.box(s0, 0, -sw, s1, 0.3125, sw));
  p.collider(...fr.box(pc - 0.3125, 0.3125, -0.5, pc + 0.3125, HEAD.haloBottom, 0.5));
  p.collider(...fr.box(HEAD.haloBack - T, HEAD.haloBottom, -HEAD.haloW, HEAD.fan + 0.3, HEAD.haloTop, HEAD.haloW));
}

/** Mark local-box cells of a carver as solid but drawn elsewhere. */
function ghostLocal(c: Carver, fr: EndFrame, u0: number, v0: number, w0: number, u1: number, v1: number, w1: number): void {
  const [x0, y0, z0, x1, y1, z1] = fr.box(u0, v0, w0, u1, v1, w1);
  const e = c.cell / 2;
  c.ghost([x0 + e, y0 + e, z0 + e], [x1 - e, y1 - e, z1 - e]);
}

/** Mark the cells of a local box whose centres pass `pred` as solid but drawn elsewhere. */
function ghostWhere(c: Carver, fr: EndFrame, u0: number, v0: number, w0: number, u1: number, v1: number, w1: number, pred: (u: number, v: number, w: number) => boolean): void {
  const [x0, y0, z0, x1, y1, z1] = fr.box(u0, v0, w0, u1, v1, w1);
  const s = c.cell;
  const lo = (a: number, o: number) => Math.ceil((a - o) / s - 0.5);
  const hi = (a: number, o: number) => Math.floor((a - o) / s - 0.5);
  const [ox, oy, oz] = c.origin;
  for (let i = lo(x0, ox); i <= hi(x1, ox); i++)
    for (let j = lo(y0, oy); j <= hi(y1, oy); j++)
      for (let k = lo(z0, oz); k <= hi(z1, oz); k++) {
        const x = ox + (i + 0.5) * s;
        const y = oy + (j + 0.5) * s;
        const z = oz + (k + 0.5) * s;
        const [u, v, w] = fr.local(x, y, z);
        if (pred(u, v, w)) c.ghost([x, y, z], [x, y, z]);
      }
}

/** Rounded rectangle distance in 2D (< 0 inside). */
function roundRect(px: number, py: number, hx: number, hy: number, rad: number): number {
  const qx = Math.abs(px) - hx + rad;
  const qy = Math.abs(py) - hy + rad;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - rad;
}

/** Where the rising body ends, inside the neck. */
const BODY_END = HEAD.post - 0.05;

/** Centre height of the body as it rises from the run (u = 0) into the neck. */
const bodyRise = (u: number) => 0.8125 + 0.3 * smoothstep(0.3, 1.15, u);

/** The neck: a column flaring from the post's cushion up to the hoods, a little forward as it rises. */
function neckFrame(v: number): { hw: number; hu: number; uc: number } {
  const s = smoothstep(1.0, 1.62, v);
  return { hw: 0.2 + 0.27 * s, hu: 0.19 - 0.02 * s, uc: HEAD.post + 0.05 * s };
}

function neckInside(u: number, v: number, w: number): boolean {
  if (v < HEAD.postTop || v > 1.62) return false;
  const n = neckFrame(v);
  return roundRect(w, u - n.uc, n.hw, n.hu, 0.09) < 0;
}

/**
 * The neck and the body rising into it (texel cells): the neck's front is the
 * serpent's belly, banded, with the great medallion; the body keeps the run's
 * chequer of scales and its spine.
 */
function neckPart(u: number, v: number, w: number): Part {
  if (v >= HEAD.postTop && v <= 1.62) {
    const n = neckFrame(v);
    const front = n.uc + n.hu;
    // The medallion: a disc carved in the belly, a lighter boss ringed by a groove.
    const mr = Math.hypot(v - 1.25, w);
    if (mr < 0.1875 && u >= front - T && u < front && Math.abs(w) < n.hw - 0.05) return part(Math.floor(mr / T) === 1 ? TAG.groove : TAG.medal, STONE.trunk);
    if (roundRect(w, u - n.uc, n.hw, n.hu, 0.09) < 0) return part(u > front - 0.08 && Math.floor(v / T) % 2 ? TAG.band : TAG.stone, STONE.trunk);
  }
  if (u >= 0 && u <= BODY_END) {
    const dv = v - bodyRise(u);
    if (Math.abs(w) < bodyHalfWidth(dv)) {
      const row = Math.floor((dv + NAGA.body / 2) / T);
      if (row >= 4) return part(TAG.spine, STONE.body);
      return part((Math.floor((u + (row % 2) * 0.125) / 0.25) + row) % 2 ? TAG.scale : TAG.stone, STONE.body);
    }
  }
  return 0;
}

/**
 * The halo behind the hoods (texel cells): an ogive slab two texels thick
 * with a flame-tongued rim, a raised band following the rim on both faces.
 * (The real one is carved all over with small flame scrolls, far below a
 * texel; its field is left plain so the hoods read against it.)
 */
function haloPart(u: number, v: number, w: number): Part {
  if (u < HEAD.haloBack - T || u >= HEAD.haloFront + T) return 0;
  const e = haloInside(v, w);
  if (e <= 0) return 0;
  if (u >= HEAD.haloBack && u < HEAD.haloFront) return part(TAG.stone, STONE.halo);
  const d = haloDepth(v, w);
  return d > 0.04 && d < 0.04 + T * 1.5 ? part(TAG.flame, STONE.halo) : 0;
}

/**
 * A ring of lotus petals round the post's cushion (centre `pc`, half size
 * `half`, bottom `v0`), each a half texel proud: small boxes, like the carved
 * cushion under the real neck.
 */
function lotusPetals(b: VoxelBuilder, fr: EndFrame, look: Look, pc: number, v0: number, half: number): void {
  const n = Math.round((half * 2) / 0.1875);
  const pw = T * 1.5;
  for (let q = 0; q < n; q++) {
    const t = -half + (q + 0.5) * ((half * 2) / n);
    const boxes: [number, number, number, number][] = [
      [pc + half, pc + half + H, t - pw / 2, t + pw / 2],
      [pc - half - H, pc - half, t - pw / 2, t + pw / 2],
      [pc + t - pw / 2, pc + t + pw / 2, half, half + H],
      [pc + t - pw / 2, pc + t + pw / 2, -half - H, -half],
    ];
    for (const [u0, u1, w0, w1] of boxes) {
      const bx = fr.box(u0, v0 + H, w0, u1, v0 + T * 2, w1);
      b.span(...bx, look.tone(bx[0], bx[1], bx[2]), 'sandstone', { surf: look.surf(bx[0], bx[1], bx[2], 0.3), shade: 1.04 });
    }
  }
}

// ── The tail end ──────────────────────────────────────────────────────────────

/** The tail's axis (u, v) and radius along it: level over its last post, then up in a quarter circle and over into a curl. */
const TAIL_PATH: readonly [number, number, number][] = (() => {
  const pts: [number, number, number][] = [];
  const r0 = 0.1875;
  // Level from the joint to the last post.
  for (let u = 0; u <= 0.95; u += 0.05) pts.push([u, 0.8125, r0]);
  // Up in a quarter circle (centre (0.95, 1.3125), radius 0.5).
  for (let a = 1; a <= 12; a++) {
    const t = (a / 12) * (Math.PI / 2);
    pts.push([0.95 + 0.5 * Math.sin(t), 1.3125 - 0.5 * Math.cos(t), r0]);
  }
  // Straight up, then over backwards in a tightening curl.
  for (let v = 1.36; v <= 1.8; v += 0.05) pts.push([1.45, v, r0]);
  for (let a = 1; a <= 20; a++) {
    const t = (a / 20) * Math.PI * 1.15;
    const rad = 0.26 - 0.05 * (a / 20);
    pts.push([1.45 - rad + rad * Math.cos(t), 1.8 + rad * Math.sin(t), 0]);
  }
  // Radius: full to the top of the rise, then tapering to the tip.
  const k0 = pts.findIndex((q) => q[2] === 0);
  for (let i = k0; i < pts.length; i++) pts[i][2] = r0 - (r0 - 0.045) * ((i - k0 + 1) / (pts.length - k0));
  return pts;
})();

/** Index of the tail path's first point off the level (where the rise begins). */
const TAIL_RISE = TAIL_PATH.findIndex((q) => q[1] > 0.8125 + 1e-6);

/**
 * The tail's axis point nearest to (u, v): its index along the path
 * (fractional), the offset from it in the u–v plane, how far that offset
 * points out of the curve's back (the spine side: "up" on the level part) and
 * the tube's radius there.
 */
function tailNearest(u: number, v: number): { i: number; du: number; dv: number; back: number; rad: number } {
  let best = { i: 0, du: 0, dv: 0, back: 0, rad: 0 };
  let bd = Infinity;
  for (let i = 0; i < TAIL_PATH.length - 1; i++) {
    const [ua, va, ra] = TAIL_PATH[i];
    const [ub, vb, rb] = TAIL_PATH[i + 1];
    const eu = ub - ua;
    const ev = vb - va;
    const l2 = eu * eu + ev * ev;
    const t = l2 > 0 ? clamp01(((u - ua) * eu + (v - va) * ev) / l2) : 0;
    const du = u - (ua + eu * t);
    const dv = v - (va + ev * t);
    const dd = du * du + dv * dv;
    if (dd < bd) {
      bd = dd;
      best = { i: i + t, du, dv, back: (dv * eu - du * ev) / Math.sqrt(l2), rad: ra + (rb - ra) * t };
    }
  }
  return best;
}

/** Is (u, v, w) inside the tail tube? Its section is the run's, shrunk with the taper. */
function tailInside(t: ReturnType<typeof tailNearest>, w: number): boolean {
  const k = t.rad / (NAGA.body / 2);
  return Math.abs(w) < k * bodyHalfWidth(t.back / k);
}

/**
 * The tail end, one bay beyond the run's end at `x`: the body runs on over one
 * more post, then rises in a quarter circle and curls over backwards,
 * tapering to a point, with a flame-edged fin along its back.
 */
export function nagaTail(p: PieceBuilder, o: NagaEndOptions): void {
  const look = new Look(o);
  const fr = new EndFrame(o.x, o.y ?? 0, o.z ?? 0, o.facing);
  const set = new BlockSet(T);
  const kw = NAGA.width / 2;
  const add = (u0: number, v0: number, w0: number, u1: number, v1: number, w1: number, up = 0.5) => {
    const bx = fr.box(u0, v0, w0, u1, v1, w1);
    const [cx, cy, cz] = [(bx[0] + bx[3]) / 2, bx[1], (bx[2] + bx[5]) / 2];
    return set.add(...bx, look.tone(cx, cy, cz), { surf: look.surf(cx, cy, cz, up), broken: null });
  };
  add(0, 0, -kw, 1, NAGA.kerb, kw);
  add(1, 0, -kw, 1.75, NAGA.kerb, kw);
  // The last post, a size up: it carries the rising tail.
  const pc = 1.0;
  for (const [t0, t1, wd] of POST) add(pc - wd / 2 - T, t0, -wd / 2 - T, pc + wd / 2 + T, t1, wd / 2 + T, 0.3);
  if (look.broken > 0) set.erode(look.broken * 0.45, o.seed + 13);
  set.emit(p.voxels, { seed: o.seed, jitter: 0.03 });

  const c = fr.carver(T);
  const last = TAIL_PATH.length - 1;
  fr.add(c, 0, 0.55, -0.35, 1.8, NAGA.tailTop + 0.1, 0.35, (u, v, w) => {
    const t = tailNearest(u, v);
    if (tailInside(t, w)) {
      // The spine along the back, bands on the belly, scales on the flanks.
      const row = Math.floor(((t.back * NAGA.body) / 2 / t.rad + NAGA.body / 2) / T);
      if (row >= 4) return part(TAG.spine, STONE.tail);
      if (row === 0) return part(Math.floor(t.i * 0.8) % 2 ? TAG.band : TAG.stone, STONE.tail);
      return part((Math.floor(t.i * 0.2 + (row % 2) * 0.5) + row) % 2 ? TAG.scale : TAG.stone, STONE.tail);
    }
    // A flame-edged fin along the back, from the rise to the tip, two texels thick.
    if (Math.abs(w) < T && t.back > 0 && t.i > TAIL_RISE) {
      const along = (t.i - TAIL_RISE) / (last - TAIL_RISE);
      const fin = t.rad + 0.11 * Math.sin(along * Math.PI) * (0.55 + 0.45 * Math.cos(t.i * 2.4));
      if (t.back < fin) return part(TAG.flame, STONE.tail);
    }
    return 0;
  });
  ghostLocal(c, fr, -T, NAGA.postTop, -0.1875, 0, NAGA.top, 0.1875);
  ghostLocal(c, fr, pc - 0.25, 0.5, -0.25, pc + 0.25, NAGA.postTop, 0.25);
  if (look.broken > 0) {
    // The tip snapped off, the rest chipped.
    if (look.broken > 0.3) c.cut((x, y, z) => {
      const [u, v] = fr.local(x, y, z);
      return tailNearest(u, v).i > last - 8;
    });
    c.chip(look.broken * 0.5, o.seed + 22, (x, y, z) => fr.local(x, y, z)[1] > 1.1);
    c.prune(6);
  }
  c.emit(p.voxels, carveLook(look, fr, o.seed), { seed: o.seed, ao: 0.35, cavity: 0.8 });
  p.collider(...fr.box(0, 0, -kw, 1.75, NAGA.top, kw));
  p.collider(...fr.box(0.75, NAGA.top, -0.25, 1.75, NAGA.tailTop, 0.25));
}

// ── A whole balustrade as a piece ─────────────────────────────────────────────

export type NagaEnd = 'head' | 'tail' | 'none';

export interface NagaBalustradeOptions extends NagaLook {
  /** Bays of plain run between the ends (0 = the ends alone). */
  bays: number;
  /** The −X end and the +X end. */
  left?: NagaEnd;
  right?: NagaEnd;
  scales?: boolean;
}

/**
 * A run of `bays` with its ends, as a piece centred on its footprint along X
 * (the body's axis on z = 0, the walkway at y = 0): e.g. the causeway's
 * balustrade with its heads, or a terrace edge ending in a tail.
 */
export function nagaBalustrade(o: NagaBalustradeOptions): KitPiece {
  const p = new PieceBuilder();
  const left = o.left ?? 'none';
  const right = o.right ?? 'none';
  const run = o.bays * NAGA.bay;
  const l = left === 'none' ? 0 : NAGA.end;
  const r = right === 'none' ? 0 : NAGA.end;
  const x0 = -(l + run + r) / 2 + l;
  if (run > 0) nagaRun(p, { ...o, length: run, x: x0 + run / 2 });
  const end = (kind: NagaEnd, x: number, facing: 1 | -1) => {
    if (kind === 'head') nagaHead(p, { ...o, x, facing });
    else if (kind === 'tail') nagaTail(p, { ...o, x, facing });
  };
  end(left, x0, -1);
  end(right, x0 + run, 1);
  return p.done();
}
