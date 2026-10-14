import { Vector3, type Object3D } from 'three';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { gatherLeft, registerGatherSource, type GatherSpot } from '../build/gather';
import type { HeightField } from '../heightfield';
import { beamWorld } from '../jungle/_campKit';
import { GatherLayer } from './_gatherLayer';
import { GatherParts } from './_gatherSides';

/**
 * **Palm leaves for thatch at the sugar-palm village** (ticket AWP-12; the gathering
 * core AWP-9): young sugar palms (ត្នោតខ្ចី: no trunk yet, a crown of big stiff fan
 * leaves on long stalks straight from the ground, as they stand for years round
 * Khmer villages, often under the old palm that dropped them) grow in two stands
 * in the fields at the village's edge (hamlet/_eastVillage.ts: by the tall sugar
 * palm north-east of the street and by the one at its west end). He cuts a fan off
 * at its stalk with the phkak knife (the `chop` swing), `HITS` blows a fan: a fan is
 * a bundle of palm-leaf thatch in his bag (folded and tied as the village roofs'
 * panels are made: roam/_gatherLoad.ts draws them on his back). `PIECES` fans a
 * palm, the one before him first (roam/_gatherSides.ts); a cut fan leaves its stalk's
 * stub, pale where it was cut, and a new leaf pushes up from the heart, a folded
 * spear that opens into a fan again `REGROW_DAYS` game days after.
 *
 * The young palms are this source's own blocks (roam/_gatherLayer.ts), made again
 * when a fan goes, grows (a few times a game day) or comes back. Saved: which fans
 * are cut (`gather.thatchFans`), with the core's `gather.spots`.
 */
const HITS = 3;
const PIECES = 3;
const REGROW_DAYS = 2;
/** Fans a young palm has. */
const FANS = 8;
/** His knife meets the stalk this high (m), this far out from the heart (the spot's foot). */
const HIT_Y = 0.62;
const FOOT = 0.75;
/** The spear leaf drawn again when it has grown this much more (of the way), at most this often (s). */
const GROW_STEP = 1 / 20;
const GROW_EVERY = 0.5;

/**
 * Where the young palms stand (m): by the tall sugar palm north-east of the street (`[433, −29]`, hamlet/_evYard.ts)
 * and by the one at the street's west end (`[365, −29.5]`), on open grass of the fields (checked free of houses, yards,
 * trails and trees: `HeightField.isFree` all round, 2.2 m out), each with its size (1 the usual).
 */
const PALMS: readonly (readonly [number, number, number])[] = [
  [438.5, -26.7, 1.05],
  [434.6, -23.2, 0.9],
  [430.7, -24.6, 1],
  [365, -23.5, 1],
  [360.8, -25.3, 0.92],
];

const FAN = [0x6b8a52, 0x77955a, 0x5f7d48, 0x86a065, 0x708f50];
const FAN_OLD = [0x9a9a5a, 0x8d9152];
const STALK = [0x7d8c50, 0x8a9858, 0x74844a];
const BOOT = [0x6a5a44, 0x5a4c3a, 0x76654c];
const SPEAR = [0xa8c070, 0xb4c87c];
const CUT_END = 0xd8d0a0;

interface Palm {
  spot: GatherSpot;
  y: number;
  size: number;
  /** Each fan's way out (rad, `atan2(dz, dx)`), its rise (rad), its stalk's length (m). */
  a: number[];
  e: number[];
  l: number[];
}

let palms: Palm[] = [];
let spots: GatherSpot[] = [];
let layer: GatherLayer | null = null;
let fans: GatherParts | null = null;
let field: HeightField | null = null;
/** The growth drawn (per palm, its cut fans' quantized), the time since a look. */
let drawn = '';
let since = 0;

const _a = new Vector3();
const _b = new Vector3();
const tone = (list: readonly number[], i: number, j: number, k: number) => list[Math.floor(hash3(i, j, k, 6301) * list.length) % list.length];

/** One young palm, the fans in `cut` gone (their stubs, and the new spears grown `grow` of the way). */
function palm(v: VoxelBuilder, p: Palm, cut: readonly number[], grow: readonly number[]): void {
  const { x, z } = p.spot;
  const y = p.y;
  const k = p.size;
  // The heart: old leaf bases, split and grey-brown, a little over the ground.
  for (let i = 0; i < 4; i++) v.box(x, y + 0.22 + i * 0.05, z, (0.78 - i * 0.12) * k, 0.3, (0.78 - i * 0.12) * k, tone(BOOT, i, 1, 1), 'mapBark', { ry: i * 0.4 + p.a[0] });
  for (let f = 0; f < FANS; f++) {
    const a = p.a[f];
    const e = p.e[f];
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const base = _a.set(x + ca * 0.18 * k, y + 0.45, z + sa * 0.18 * k);
    const i = cut.indexOf(f);
    if (i >= 0) {
      // Cut: its stalk's stub, pale where the knife went through; the new leaf, a folded spear, pushing up from the heart.
      const s = 0.38 * k;
      const end = _b.set(base.x + Math.cos(e) * ca * s, base.y + Math.sin(e) * s, base.z + Math.cos(e) * sa * s);
      beamWorld(v, base, end, 0.1, 0.1, tone(STALK, f, 2, 2), 'mapBark');
      v.box(end.x, end.y + 0.02, end.z, 0.12, 0.05, 0.12, CUT_END, 'mapBark');
      const g = grow[i] ?? 0;
      const tall = (0.4 + 2.1 * g) * k;
      const lean = 0.12 + 0.25 * g;
      const s0 = _a.set(x, y + 0.4, z);
      const s1 = _b.set(x + ca * lean, y + 0.4 + tall, z + sa * lean);
      beamWorld(v, s0, s1, 0.16 - 0.04 * g, 0.12, tone(SPEAR, f, 3, 3), 'mapBark');
      v.box(s1.x, s1.y + 0.06, s1.z, 0.07, 0.14, 0.07, 0xc8d890, 'mapBark');
      continue;
    }
    // The stalk, stiff and straight from the heart; its fan at the end: stiff pleated leaflets spread round the way it
    // points, the outer ones drooping a little.
    const l = p.l[f] * k;
    const tip = _b.set(base.x + Math.cos(e) * ca * l, base.y + Math.sin(e) * l, base.z + Math.cos(e) * sa * l);
    beamWorld(v, base, tip, 0.09, 0.09, tone(STALK, f, 4, 4), 'mapBark');
    const tx = tip.x;
    const ty = tip.y;
    const tz = tip.z;
    // (the fan's plane: along the stalk, and level across it)
    const dx = Math.cos(e) * ca;
    const dy = Math.sin(e);
    const dz = Math.cos(e) * sa;
    const px = -sa;
    const pz = ca;
    const old = f % 4 === 3;
    // (13 leaflets over 160°: they overlap at the foot into a round fan, the hastula filled in, their tips split apart)
    for (let j = 0; j < 13; j++) {
      const phi = ((j - 6) / 6) * 1.4;
      const len = (1.55 + 0.2 * hash3(f, j, 5, 6302) - Math.abs(phi) * 0.22) * k;
      const droop = 0.1 * Math.abs(phi) + 0.04;
      let ux = dx * Math.cos(phi) + px * Math.sin(phi);
      let uy = dy * Math.cos(phi) - droop;
      let uz = dz * Math.cos(phi) + pz * Math.sin(phi);
      const n = Math.hypot(ux, uy, uz);
      ux /= n;
      uy /= n;
      uz /= n;
      _a.set(tx, ty, tz);
      const end = new Vector3(tx + ux * len, ty + uy * len, tz + uz * len);
      beamWorld(v, _a, end, 0.26 * k, 0.05, old ? tone(FAN_OLD, f, j, 6) : tone(FAN, f, j, 7), 'mapLeaf', 0, 0.92 + 0.14 * hash3(f, j, 8, 6303));
      // (the split tips of the leaflets, hanging a little)
      if (j % 2 === 0) beamWorld(v, end, _a.set(end.x + ux * 0.3 * k, end.y + (uy - 0.3) * 0.3 * k, end.z + uz * 0.3 * k), 0.1, 0.04, old ? FAN_OLD[0] : FAN[1], 'mapLeaf');
    }
    // (the fan's middle, where the leaflets meet the stalk: filled)
    _a.set(tx + dx * 0.32 * k, ty + dy * 0.32 * k - 0.03, tz + dz * 0.32 * k);
    v.box(_a.x, _a.y, _a.z, 0.5 * k, 0.07, 0.5 * k, old ? FAN_OLD[1] : FAN[2], 'mapLeaf', { ry: -a });
  }
}

function draw(): void {
  if (!layer || !fans) return;
  const v = new VoxelBuilder();
  const key: string[] = [];
  for (const p of palms) {
    const cut = fans.of(p.spot);
    const grow = fans.grow(p.spot, cut.length);
    key.push(cut.length ? `${cut.join('.')}:${grow.map((g) => Math.round(g / GROW_STEP)).join('.')}` : '');
    palm(v, p, cut, grow);
  }
  drawn = key.join('|');
  layer.set(v);
}

/** Each frame (the gathering add-on's): the new leaves grown (looked at every `GROW_EVERY` s, every frame in a shot). */
export function thatchTick(dt: number): void {
  if (!fans || !palms.length) return;
  since += dt;
  if (dt > 0 && since < GROW_EVERY) return;
  since = 0;
  let key = '';
  for (const p of palms) {
    const cut = fans.saved(p.spot.id);
    if (!cut.length) {
      key += '|';
      continue;
    }
    const n = Math.min(cut.length, p.spot.pieces - gatherLeft(p.spot));
    key += `${cut.slice(cut.length - n).join('.')}:${fans.grow(p.spot, n).map((g) => Math.round(g / GROW_STEP)).join('.')}|`;
  }
  if (key.slice(0, -1) !== drawn) draw();
}

/** Register the young palms (roam/_gather.ts `init`): their spots and their blocks in the roaming group. Returns how many. */
export function registerThatch(f: HeightField, parent: Object3D): number {
  field = f;
  layer ??= new GatherLayer(parent, 'gather:young-palms');
  palms = PALMS.map(([x, z, size], i) => {
    const a0 = hash3(i, 1, 1, 6304) * Math.PI * 2;
    const a: number[] = [];
    const e: number[] = [];
    const l: number[] = [];
    for (let n = 0; n < FANS; n++) {
      a.push(a0 + (n / FANS) * Math.PI * 2 + (hash3(i, n, 2, 6305) - 0.5) * 0.35);
      // (the inner, younger fans stand up; the outer lean out)
      e.push(n % 2 ? 1.2 + 0.15 * hash3(i, n, 3, 6306) : 0.85 + 0.2 * hash3(i, n, 4, 6307));
      l.push(1.55 + 0.6 * hash3(i, n, 5, 6308));
    }
    return {
      spot: { id: `thatch:${Math.round(x)},${Math.round(z)}`, material: 'thatch', x, z, r: FOOT, hits: HITS, pieces: PIECES, regrowDays: REGROW_DAYS, hitY: HIT_Y },
      y: f.heightAt(x, z),
      size,
      a,
      e,
      l,
    } satisfies Palm;
  });
  spots = palms.map((p) => p.spot);
  const byId = new Map(palms.map((p) => [p.spot.id, p]));
  const parts = (fans = new GatherParts('gather.thatchFans', FANS, (s, n) => byId.get(s.id)?.a[n] ?? 0));
  registerGatherSource({
    id: 'thatch',
    spots: () => spots,
    onTake: () => draw(),
    onLeft: () => draw(),
    onWork: (spot, x, z) => parts.from(spot, x, z),
  });
  draw();
  return palms.length;
}

/** Checks: the blocks drawn, the field the palms stand on. */
export const thatchDrawn = (): { blocks: number; field: boolean } => ({ blocks: layer?.blocks ?? 0, field: !!field });
