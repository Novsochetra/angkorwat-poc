import { Group } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import type { HamletPiece } from '../hamlet';
import type { MapContext } from '../types';
import { beam, leaf, long, round, sag, spiral, teardrop, vine, type P3 } from './plantKit';

/**
 * Checking the plant kit (veg/plantKit.ts): `index.html?shot=1&plantkit=lineup`
 * lays every shape at its real size on a stone table in the meadow behind Angkor
 * Wat, a pale board behind it, the hanging fruit on a bamboo rail. Left to
 * right: leaves (1 piece no rib, 2 pieces, 3 pieces, a broad gourd leaf, a
 * folded banana leaf), teardrops (mango, mango `low`, papaya), rounds (pumpkin,
 * pumpkin `low`, a gourd hanging), longs (banana finger, long eggplant), a vine
 * winding up a post and draped to the next. The console lists each shape's
 * blocks and the cameras (`cam=`) that frame the table. Shots and the dev
 * server only (a hamlet piece: hamlet/index.ts).
 */

/** The table's front left corner on the map (x, z), its length and depth (m), its top over the highest ground under it. */
const X0 = 146;
const Z0 = -293;
const LEN = 7.6;
const DEPTH = 1.8;
const TOP = 0.8;

const STONE = 0xcfc4ae;
const BOARD = 0xe8e0cc;
const BAMBOO = 0xc4ac6a;
const LEAF = 0x3e7a2c;
const LEAF_BROAD = 0x4f8a34;
const LEAF_BANANA = 0x6aa83a;

export function buildPlantKitLineup(ctx: MapContext): HamletPiece {
  const src = traceSource();
  const f = ctx.field;
  const b = new VoxelBuilder();
  let ground = -Infinity;
  for (let x = X0; x <= X0 + LEN; x += 0.5) for (let z = Z0 - DEPTH; z <= Z0; z += 0.5) ground = Math.max(ground, f.heightAt(x, z));
  f.occupy(X0 - 1, Z0 - DEPTH - 1, X0 + LEN + 1, Z0 + 1);
  const T = ground + TOP;
  const zc = Z0 - DEPTH / 2;
  // The table: a slab on four legs, the board behind it, the rail over its front.
  b.span(X0, T - 0.08, Z0 - DEPTH, X0 + LEN, T, Z0, STONE, 'mapStone', { src });
  for (const x of [X0 + 0.15, X0 + LEN - 0.15]) for (const z of [Z0 - 0.15, Z0 - DEPTH + 0.15]) b.box(x, (ground - 0.3 + T - 0.08) / 2, z, 0.2, T - 0.08 - ground + 0.3, 0.2, STONE, 'mapStone', { src, shade: 0.9 });
  b.span(X0, ground - 0.3, Z0 - DEPTH - 0.06, X0 + LEN, T + 2.2, Z0 - DEPTH, BOARD, 'mapStone', { src });
  const railY = T + 0.95;
  const rz = Z0 - 0.55;
  const rail0 = X0 + 3.1;
  const rail1 = X0 + 6.3;
  for (const x of [rail0, rail1]) b.box(x, (T + railY) / 2, rz, 0.05, railY - T, 0.05, BAMBOO, 'mapBark', { src });
  b.span(rail0, railY - 0.025, rz - 0.025, rail1, railY + 0.025, rz + 0.025, BAMBOO, 'mapBark', { src });

  const counts: string[] = [];
  const count = (name: string, draw: () => void) => {
    const n0 = b.boxes.length;
    draw();
    counts.push(`${name} ${b.boxes.length - n0}`);
  };
  const stand = (x: number, z: number, h: number): P3 => {
    b.box(x, T + h / 2, z, 0.025, h, 0.025, 0x5a6a2a, 'mapLeaf', { src, shade: 0.9 });
    return [x, T + h, z];
  };
  // ── Leaves: pointing away from the front, rising, bending down ──
  const lz = Z0 - 0.45;
  count('leaf 1 piece, no rib', () => leaf(b, stand(X0 + 0.35, lz, 0.12), { len: 0.3, wid: 0.1, az: Math.PI, el: 0.5, segs: 1, rib: false, color: LEAF }));
  count('leaf 2 pieces', () => leaf(b, stand(X0 + 0.75, lz, 0.12), { len: 0.3, wid: 0.1, az: Math.PI, el: 0.5, color: LEAF }));
  count('leaf 3 pieces', () => leaf(b, stand(X0 + 1.15, lz, 0.12), { len: 0.3, wid: 0.1, az: Math.PI, el: 0.5, segs: 3, color: LEAF }));
  count('leaf broad (gourd)', () => leaf(b, stand(X0 + 1.6, lz, 0.12), { len: 0.26, wid: 0.26, az: Math.PI, el: 0.45, bend: 0.3, shape: 'broad', color: LEAF_BROAD }));
  count('leaf folded (banana)', () => leaf(b, stand(X0 + 2.45, Z0 - 0.3, 0.5), { len: 1.3, wid: 0.42, az: Math.PI, el: 0.45, bend: 0.9, segs: 3, fold: 0.35, stalk: 0.25, shape: 'oblong', color: LEAF_BANANA }));
  // ── Fruit hanging from the rail, and lying on the table ──
  const hang = (x: number, len: number): P3 => [x, railY - 0.02 - len, rz];
  count('teardrop mango', () => teardrop(b, hang(X0 + 3.35, 0.06), { len: 0.12, wid: 0.09, depth: 0.85, color: 0xf0b030, blush: 0xe8823a, stalk: 0.06, roll: 0.6 }));
  count('teardrop mango low', () => teardrop(b, hang(X0 + 3.65, 0.06), { len: 0.12, wid: 0.09, depth: 0.85, color: 0x9ab848, stalk: 0.06, low: true }));
  count('teardrop papaya', () => teardrop(b, hang(X0 + 4.0, 0.05), { len: 0.25, wid: 0.14, taper: 0.65, color: 0xe8a030, neck: 0x9aa83a, stalk: 0.05 }));
  count('round gourd hanging', () => round(b, [X0 + 4.45, railY - 0.02, rz], { wid: 0.2, hgt: 0.22, hang: 0.14, color: 0x7aa850, rib: 0x5e8a3c, stalk: 0x5a7a2e }));
  count('long eggplant', () => long(b, [X0 + 4.9, railY - 0.06, rz], { len: 0.25, thick: 0.055, az: 0.3, el: -1.35, curve: 0.35, neck: 0.75, taper: 0.85, color: 0x5a2e5e, cap: 0x4e7a2e, capWid: 1.4 }));
  count('long banana finger', () => long(b, [X0 + 5.3, railY - 0.06, rz], { len: 0.16, thick: 0.035, az: 0, el: -1.1, curve: 0.9, neck: 0.55, sides: 4, color: 0xe8d040, tip: 0x3a2a1a }));
  count('long banana finger, round', () => long(b, [X0 + 5.6, railY - 0.06, rz], { len: 0.16, thick: 0.035, az: 0, el: -1.1, curve: 0.9, neck: 0.55, color: 0xe8d040, tip: 0x3a2a1a }));
  for (const x of [X0 + 3.35, X0 + 3.65, X0 + 4.0, X0 + 4.9, X0 + 5.3, X0 + 5.6]) beam(b, [x, railY, rz], [x, railY - 0.07, rz], 0.012, 0.012, 0x5a6a2a, 'mapLeaf', 0, 1, src);
  count('round pumpkin', () => round(b, [X0 + 3.6, T, Z0 - 1.2], { wid: 0.45, hgt: 0.3, color: 0xd88a2a, rib: 0xb86a1e, cap: 0xc87a24, stalk: 0x8a6a3a, ry: 0.3 }));
  count('round pumpkin low', () => round(b, [X0 + 4.3, T, Z0 - 1.2], { wid: 0.45, hgt: 0.3, color: 0xd88a2a, stalk: 0x8a6a3a, ry: 0.3, low: true }));
  count('teardrop papaya lying', () => teardrop(b, [X0 + 4.85, T + 0.07, Z0 - 1.25], { len: 0.25, wid: 0.14, dir: [0.96, -0.05, 0.27], taper: 0.65, color: 0x8aa83e, neck: 0x6a8a2a }));
  count('long eggplant lying', () => long(b, [X0 + 5.3, T + 0.03, Z0 - 1.1], { len: 0.25, thick: 0.055, az: 1.9, el: 0, curve: 0.2, neck: 0.75, taper: 0.85, color: 0x5a2e5e, cap: 0x4e7a2e, capWid: 1.4 }));
  // ── A vine: up a post, then draped to the next ──
  const p0: P3 = [X0 + 6.7, T, Z0 - 0.5];
  const p1: P3 = [X0 + 7.4, T, Z0 - 0.5];
  for (const p of [p0, p1]) b.box(p[0], T + 0.6, p[2], 0.05, 1.2, 0.05, BAMBOO, 'mapBark', { src });
  count('vine (9 spans, 4 leaves, 5 tendrils)', () => {
    const up = spiral([p0[0], T, p0[2] + 0.04], 1.1, 0.045, 1.5, 5);
    const over = sag(up[up.length - 1], [p1[0], T + 1.15, p1[2] + 0.04], 4, 0.18).slice(1);
    vine(b, [...up, ...over], { thick: 0.018, color: 0x4e7a2e, tendril: 0x8ab04a, seed: 3, leaf: { len: 0.2, wid: 0.2, every: 2, bend: 0.3, shape: 'broad', color: LEAF_BROAD } });
  });

  const object = new Group();
  object.name = 'hamlet:plant-kit';
  object.add(buildVoxelMesh(b, { quality: ctx.quality === 'low' ? 'low' : 'medium', name: 'hamlet:plant-kit' }));
  const cam = (x: number, y: number, z: number, tx: number, ty: number, tz: number, fov: number) => [x, y, z, tx, ty, tz, fov].map((v) => +v.toFixed(2)).join(',');
  console.info(`[map] plant kit lineup (blocks): ${counts.join(' · ')}`);
  console.info(
    `[map] plant kit lineup cameras: all cam=${cam(X0 + LEN / 2, T + 2.2, Z0 + 6.4, X0 + LEN / 2, T + 0.45, zc, 34)}` +
      ` · leaves cam=${cam(X0 + 1.3, T + 2.0, Z0 + 1.6, X0 + 1.3, T + 0.2, zc, 38)}` +
      ` · fruit cam=${cam(X0 + 4.5, T + 1.0, Z0 + 2.4, X0 + 4.5, T + 0.5, zc, 38)}` +
      ` · vine cam=${cam(X0 + 7.0, T + 1.0, Z0 + 1.8, X0 + 7.0, T + 0.7, zc, 38)}`,
  );
  return { object, blocks: b.boxes.length };
}
