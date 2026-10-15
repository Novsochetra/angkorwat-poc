import type { Object3D } from 'three';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { gatherLeft, gatherTakenAt, GATHER, registerGatherSource, type GatherSpot } from '../build/gather';
import { CELL, SURFACE, type HeightField } from '../heightfield';
import { HAMLETS, JUNGLE_SITES, PLACES, VILLAGE } from '../layout';
import { roamInside } from '../terrain/views';
import { GatherLayer } from './_gatherLayer';

/**
 * **Clay from the lake and river shores** (ticket AWP-13; the gathering core AWP-9):
 * the banks of the great lake and the rivers where he roams have patches of grey-
 * brown clay (ដីឥដ្ឋ) laid bare at the water's edge; he digs it with the hoe (ចប,
 * the `dig` swing), `HITS` blows a lump, `PIECES` lumps a patch, each dug pit filled
 * again by the water `REGROW_DAYS` game days after ("the water brings more").
 *
 * Only real shore ground: a bank cell (sand or dirt, dry, 1 m or so over the water
 * beside it) next to a river's or a lake's water; never in the water, on rock, on
 * a road or a trail, in a paddy, by a temple's pad, in a village, a hamlet, a
 * jungle site (the pool, the bridges) or by the boats' landings; the land round it
 * level (no step over a metre). Found once as roaming is set up (the land's cells,
 * in order: the same patches every visit), `SPACING` m apart at least, at most `MOST`.
 *
 * The patches and their pits are this source's own blocks (roam/_gatherLayer.ts),
 * one small mesh a `CHUNK` m square of the map (out of view, not drawn), flat on
 * the ground (no shadow); a pit is dark and wet, the dug lumps heaped by it, and
 * fills as the game days pass. Saved: the core's `gather.spots` (the patch ids are
 * their place, `clay:<x>,<z>`).
 */
const HITS = 3;
const PIECES = 3;
const REGROW_DAYS = 2;
/** Patches at least this far apart (m), at most this many, this far inside the roaming area at least (m). */
const SPACING = 28;
const MOST = 64;
const INSIDE = 6;
/**
 * Kept off (m): a road, a paddy, a temple's pad, bare rock (a cliff), a jungle trail within this; the boats' landings and the jetty; a
 * waterfall (the cliff, the spray: its foot and its lip); the temples' grounds round their pads; the jungle sites.
 */
const CLEAR = { path: 5, paddy: 4, pad: 8, rock: 4, trail: 4, landing: 14, fall: 16, temple: 34, site: 14 };
const LANDINGS: readonly (readonly [number, number])[] = [
  [-38, 46],
  [-316, 47],
];
/** The patch's foot (he stands just outside it), its look's size (m). */
const FOOT = 0.45;
/** A mesh for the patches in each square this big (m). */
const CHUNK = 160;
/** A pit drawn again when it has filled this much more (of the way), looked at this often (s). */
const GROW_STEP = 1 / 8;
const GROW_EVERY = 0.75;

/** River clay: smooth, ochre to red-brown (as the material's chips and icon), paler than the earth round it; dark where wet. */
const CLAY = [0xb0805c, 0xa47654, 0xbc8c66, 0x9e7050];
const WET = [0x6a4a36, 0x5a3e2e];
const LUMP = [0x9a6a48, 0x8a5c40, 0xa87656];

interface Patch {
  spot: GatherSpot;
  /** The bank cell's middle and top, the water's level beside it (m). */
  cx: number;
  cz: number;
  y: number;
  level: number;
  /** The way to the water (unit, map). */
  wx: number;
  wz: number;
  chunk: string;
}

let patches: Patch[] = [];
let spots: GatherSpot[] = [];
const layers = new Map<string, GatherLayer>();
let parent: Object3D | null = null;
let since = 0;
const drawnKey = new Map<string, string>();

/** Is (x, z) a bank cell he may dig: dry sand or dirt beside a river's or a lake's water, level round it, nothing in the way. */
function bankAt(f: HeightField, x: number, z: number): { wx: number; wz: number; level: number } | null {
  const c = f.index(x, z);
  if (c < 0 || f.water[c] > -1000 || f.trail[c]) return null;
  const s = f.surface[c];
  if (s !== SURFACE.sand && s !== SURFACE.dirt) return null;
  const h = f.height[c];
  // (water beside it, the bank a metre or so over it; the land beside it level)
  let wet = 0;
  for (let dk = -1; dk <= 1; dk++)
    for (let di = -1; di <= 1; di++) {
      if (!di && !dk) continue;
      const n = f.index(x + di * CELL, z + dk * CELL);
      if (n < 0) return null;
      const lvl = f.water[n];
      if (lvl > -1000) {
        if (h - lvl < 0.4 || h - lvl > 2.1) return null;
        wet++;
      } else if (Math.abs(f.height[n] - h) > 1.01) return null;
    }
  if (!wet || wet > 4) return null;
  // (the water on a straight side of the cell, one side only: its face is the cell's edge there. Water only at a
  // corner, or on two sides, is no straight bank to dig into)
  let side: [number, number] | null = null;
  for (const [di, dk] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    if (f.water[f.index(x + di * CELL, z + dk * CELL)] <= -1000) continue;
    if (side) return null;
    side = [di, dk];
  }
  if (!side) return null;
  const [wx, wz] = side;
  const level = f.water[f.index(x + wx * CELL, z + wz * CELL)];
  // (nothing kept off near it: a road, a paddy, a temple's pad)
  const near = (kind: number, r: number) => {
    const k = Math.ceil(r / CELL);
    for (let dk = -k; dk <= k; dk++)
      for (let di = -k; di <= k; di++) {
        const n = f.index(x + di * CELL, z + dk * CELL);
        if (n >= 0 && f.surface[n] === kind) return true;
      }
    return false;
  };
  if (near(SURFACE.path, CLEAR.path) || near(SURFACE.paddy, CLEAR.paddy) || near(SURFACE.pad, CLEAR.pad) || near(SURFACE.rock, CLEAR.rock)) return null;
  // (a jungle trail beside it: he would dig in the walkers' way)
  const t = Math.ceil(CLEAR.trail / CELL);
  for (let dk = -t; dk <= t; dk++)
    for (let di = -t; di <= t; di++) {
      const n = f.index(x + di * CELL, z + dk * CELL);
      if (n >= 0 && f.trail[n]) return null;
    }
  return { wx, wz, level };
}

/** Kept off: the temples' grounds, the villages and hamlets, the jungle sites, the landings, the waterfalls. */
function keptOff(f: HeightField, x: number, z: number): boolean {
  for (const p of PLACES) if (Math.abs(x - p.x) < p.pad[0] + CLEAR.temple && Math.abs(z - p.z) < p.pad[1] + CLEAR.temple) return true;
  for (const h of HAMLETS) if (Math.hypot(x - h.x, z - h.z) < h.r + 8) return true;
  for (const s of JUNGLE_SITES) if (Math.hypot(x - s.x, z - s.z) < s.r + CLEAR.site) return true;
  for (const w of f.falls) if (Math.hypot(x - w.x, z - w.z) < CLEAR.fall + w.width / 2) return true;
  if (Math.hypot(x - VILLAGE.x, z - VILLAGE.z) < 75) return true;
  for (const [lx, lz] of LANDINGS) if (Math.hypot(x - lx, z - lz) < CLEAR.landing) return true;
  return false;
}

/** The patches: every bank cell in order, spaced. */
function findPatches(f: HeightField): Patch[] {
  const out: Patch[] = [];
  for (let k = 0; k < f.nz && out.length < MOST; k++)
    for (let i = 0; i < f.nx && out.length < MOST; i++) {
      // (most cells are no bank at all: what they are is read first)
      const c = i + k * f.nx;
      const s = f.surface[c];
      if ((s !== SURFACE.sand && s !== SURFACE.dirt) || f.water[c] > -1000) continue;
      const [x, z] = f.cellCenter(i, k);
      if (roamInside(x, z) < INSIDE) continue;
      if (out.some((p) => Math.abs(p.spot.x - x) < SPACING && Math.hypot(p.spot.x - x, p.spot.z - z) < SPACING)) continue;
      const bank = bankAt(f, x, z);
      if (!bank || keptOff(f, x, z)) continue;
      // (where he digs: on the bank's top toward its edge; he stands on the land side, never in the water)
      const px = x + bank.wx * 0.45;
      const pz = z + bank.wz * 0.45;
      out.push({
        spot: { id: `clay:${Math.round(px)},${Math.round(pz)}`, material: 'clay', x: px, z: pz, r: FOOT, hits: HITS, pieces: PIECES, regrowDays: REGROW_DAYS, stand: Math.atan2(-bank.wx, -bank.wz) },
        cx: x,
        cz: z,
        y: f.height[c],
        level: bank.level,
        wx: bank.wx,
        wz: bank.wz,
        chunk: `${Math.floor(px / CHUNK)},${Math.floor(pz / CHUNK)}`,
      });
    }
  return out;
}

/** How far each pit has filled again (0‥1), as many as are dug. */
function fills(p: Patch): number[] {
  const n = p.spot.pieces - gatherLeft(p.spot);
  const ts = gatherTakenAt(p.spot);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const at = ts[ts.length - n + i];
    out.push(at === undefined ? 0 : Math.max(0, Math.min(1, (GATHER.clock - at) / p.spot.regrowDays)));
  }
  return out;
}

/** One patch: the clay laid bare on the bank's top and down its face to the water; its pits (dark, wet, the dug lumps heaped by them), filling again. */
function patch(v: VoxelBuilder, p: Patch, fill: readonly number[]): void {
  const { x, z } = p.spot;
  const y = p.y;
  const ry = Math.atan2(p.wx, p.wz);
  const sx = Math.round(x * 3);
  const sz = Math.round(z * 3);
  // (across the bank: level, along its edge)
  const ax = p.wz;
  const az = -p.wx;
  // The top: smooth slabs of clay, pale grey-ochre, within the bank cell (none hangs over the water).
  for (let i = 0; i < 4; i++) {
    const along = (i - 1.5) * 0.42 + (hash3(sx, sz, i, 7101) - 0.5) * 0.2;
    const out = 0.25 + 0.4 * hash3(sx, sz, i, 7102);
    const w = 0.75 + 0.3 * hash3(sx, sz, i, 7103);
    const c = CLAY[Math.floor(hash3(sx, sz, i, 7104) * CLAY.length)];
    v.box(p.cx + p.wx * out + ax * along, y + 0.018 + i * 0.003, p.cz + p.wz * out + az * along, w, 0.035, w * 0.75, c, 'mapStone', { ry: ry + (hash3(sx, sz, i, 7105) - 0.5) * 0.5 });
  }
  // The face down to the water: layers of clay, the lowest wet and dark.
  const edge = CELL / 2 + 0.03;
  const fx = p.cx + p.wx * edge;
  const fz = p.cz + p.wz * edge;
  const drop = Math.max(0.3, y - p.level);
  const rows = 3;
  for (let r = 0; r < rows; r++) {
    const h = drop / rows;
    const c = r === 0 ? WET[0] : CLAY[(r + sx) % CLAY.length];
    v.box(fx, p.level + h * (r + 0.5), fz, 1.7 - r * 0.15, h + 0.01, 0.08, c, 'mapStone', { ry });
  }
  // A pit for each lump dug (the newest the deepest), its spoil heaped beside it, both going as it fills.
  fill.forEach((g, n) => {
    const k = 1 - g;
    if (k <= 0.02) return;
    const a = ry + Math.PI / 2 + (n - 1) * 1.1;
    const px = x + Math.sin(a) * 0.45 * (n ? 1 : 0.2);
    const pz = z + Math.cos(a) * 0.45 * (n ? 1 : 0.2);
    const w = 0.55 + 0.25 * k;
    v.box(px, y + 0.05, pz, w, 0.035, w, WET[1], 'mapStone', { ry: a });
    v.box(px, y + 0.06, pz, w * 0.6, 0.035, w * 0.6, 0x3a2c22, 'mapStone', { ry: a + 0.3 });
    // (water seeping into it as it fills)
    if (g > 0.3) v.box(px, y + 0.075, pz, w * 0.45 * g, 0.01, w * 0.45 * g, 0x6a7a74, 'mapStone', { ry: a });
    for (let j = 0; j < 3; j++) {
      const b = a + Math.PI + (j - 1) * 0.6;
      const r = w * 0.75;
      v.box(px + Math.sin(b) * r, y + 0.1 * k, pz + Math.cos(b) * r, 0.24 * k + 0.06, 0.16 * k + 0.04, 0.22 * k + 0.06, LUMP[(j + n) % LUMP.length], 'mapStone', { ry: b * 2 });
    }
  });
}

function drawChunk(key: string): void {
  if (!parent) return;
  const v = new VoxelBuilder();
  const keys: string[] = [];
  for (const p of patches) {
    if (p.chunk !== key) continue;
    const f = fills(p);
    keys.push(f.map((g) => Math.round(g / GROW_STEP)).join('.'));
    patch(v, p, f);
  }
  drawnKey.set(key, keys.join('|'));
  let layer = layers.get(key);
  if (!layer) layers.set(key, (layer = new GatherLayer(parent, `gather:clay:${key}`, false, 120)));
  layer.set(v);
}

/** Each frame (the gathering add-on's): the pits filling (looked at every `GROW_EVERY` s, every frame in a shot). */
export function clayTick(dt: number): void {
  if (!patches.length) return;
  since += dt;
  if (dt > 0 && since < GROW_EVERY) return;
  since = 0;
  for (const key of layers.keys()) {
    const keys: string[] = [];
    for (const p of patches) if (p.chunk === key) keys.push(fills(p).map((g) => Math.round(g / GROW_STEP)).join('.'));
    if (keys.join('|') !== drawnKey.get(key)) drawChunk(key);
  }
}

/** Register the clay banks (roam/_gather.ts `init`): their spots and blocks in the roaming group. Returns how many. */
export function registerClay(f: HeightField, group: Object3D): number {
  parent = group;
  const t0 = performance.now();
  patches = findPatches(f);
  spots = patches.map((p) => p.spot);
  const chunkOf = new Map(patches.map((p) => [p.spot.id, p.chunk]));
  registerGatherSource({
    id: 'clay',
    spots: () => spots,
    spent: { days: 'gatherClaySpent', soon: 'gatherClaySoon' },
    onTake: (s) => drawChunk(chunkOf.get(s.id) ?? ''),
    onLeft: (s) => drawChunk(chunkOf.get(s.id) ?? ''),
  });
  for (const key of new Set(chunkOf.values())) drawChunk(key);
  console.info(`[gather] clay: ${patches.length} patches on the banks in ${(performance.now() - t0).toFixed(1)} ms`);
  return patches.length;
}

/** Checks: the patches (where, which way the water is). */
export const clayPatches = (): readonly { id: string; x: number; z: number; y: number }[] => patches.map((p) => ({ id: p.spot.id, x: +p.spot.x.toFixed(1), z: +p.spot.z.toFixed(1), y: p.y }));
