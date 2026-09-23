import { BlockSet } from '../../BlockSet';
import { PieceBuilder } from '../../PieceBuilder';
import { stoneSurf } from '../../surface';
import { defineKitAsset, type KitPiece } from '../../types';
import { B, crumble, envelopeWear, JOINT, layWall, noise, ramp, sheetTones, T, tileStones, type WallLayout } from './_damage-b';

/**
 * §19.2 ⑥ Dark weathering: sandstone blocks after centuries of monsoon —
 * black-brown run-off streaks and grime over the tan stone, patches of moss
 * and lichen, moss lining the joints on top, a few corners chipped. The sheet
 * shows a 3 × 2 × 2 block, a tall 2 × 2 stack, a 2 × 2 × 2 cube, a pillar
 * on its base and a top-view tile of stained, mossy paving.
 */

/** The stone under the grime (the sheet's light patches, #caa372 top / #90755b front): greyer than fresh sandstone. */
const STONE = sheetTones(0x806c57, 0x75624f, 0x8b7661, 0x6b5a48);

/**
 * Each block its own weathering: mostly dark with stains, some a little
 * lighter, moss in patches (more low down and on the shaded side).
 */
const weathered = (seed: number) => (x: number, y: number, z: number) => {
  const n = noise(x, y, z, 0.55, seed + 4);
  return { surf: stoneSurf({ stain: 0.42 + 0.2 * noise(x, y, z, 0.4, seed + 8), moss: 0.2 + 0.36 * ramp(0.35, 0.75, n) + (y < B ? 0.08 : 0), lichen: 0.42 + 0.25 * noise(x, y, z, 0.5, seed + 6) }) };
};

/** Joints filled a texel back — moss grows in them on top. */
const MORTAR = { color: JOINT, surf: stoneSurf({ moss: 0.5, stain: 0.5 }) };

/** Lay a wall layout, chipping the envelope's edges where `W` (metres) says. */
function lay(set: BlockSet, w: WallLayout, W: (x: number, y: number, z: number) => number): void {
  const keep = envelopeWear(w.min, w.max, W, { up: 1 });
  crumble(set, w.stones, keep, { cell: 0.125 });
  crumble(set, w.joints, (x, y, z) => keep(x, y, z) && keep(x + T, y, z) && keep(x - T, y, z) && keep(x, y + T, z) && keep(x, y, z + T) && keep(x, y, z - T));
}

/** A few chips off the top edges and one corner worn back in small cubes (`corner` = where). */
function chips(seed: number, corner: [number, number, number]) {
  return (x: number, y: number, z: number) =>
    0.3 * ramp(0.45, 0, Math.hypot(x - corner[0], y - corner[1], z - corner[2])) * (0.7 + 0.6 * noise(x, y, z, 0.2, seed + 5)) + 0.7 * (noise(x, y, z, 0.3, seed + 13) - 0.72);
}

function block(set: BlockSet, seed: number, w: number, courses: number, d: number, corner: [number, number, number]): void {
  const wall = layWall({ x0: -w / 2, x1: w / 2, z0: -d / 2, z1: d / 2, courses: Array(courses).fill(B), length: [0.5, 0.5], palette: STONE, style: weathered(seed), seed: seed * 5 + 2, mortar: MORTAR });
  lay(set, wall, chips(seed, corner));
}

/** A pillar: a two-stone base, a shaft of half blocks in two courses, a capital. */
function pillar(set: BlockSet, seed: number): void {
  const style = weathered(seed);
  const part = (hw: number, y0: number, courses: number[], length: number) =>
    layWall({ x0: -hw, x1: hw, z0: -hw, z1: hw, y0, courses, skins: 1, length: [length, length], palette: STONE, style, seed: seed * 3 + y0 * 16, mortar: MORTAR });
  const cap = 0.25 + 2 * B;
  for (const p of [part(0.375, 0, [0.25], 0.375), part(0.25, 0.25, [B, B], 0.25), part(0.3125, cap, [0.25], 0.3125)])
    lay(set, p, chips(seed, [0.3125, cap + 0.25, 0.3125]));
}

function build(variant: string, seed: number): KitPiece {
  const set = new BlockSet(T);
  const p = new PieceBuilder();
  if (variant === 'tile') {
    // Stained paving, 1.5 × 1 m: three stones by two, one of them split, moss in the joints and patches.
    const look = weathered(seed);
    const rects: [number, number, number, number][] = [
      [0, 0, 7, 7],
      [8, 0, 15, 7],
      [16, 0, 24, 7],
      [0, 8, 4, 16],
      [5, 8, 15, 16],
      [16, 8, 24, 16],
    ];
    const stones = rects.map((rect, i) => ({ rect, color: STONE[i % STONE.length], style: look((rect[0] + rect[2]) * T * 0.5, 0.3 * i, (rect[1] + rect[3]) * T * 0.5) }));
    for (const s of tileStones(p, 24, 16, 0.25, stones, { color: JOINT, surf: stoneSurf({ moss: 0.6 }) })) set.add(...s.min, ...s.max, s.color, s.style);
  } else if (variant === 'stack') block(set, seed, 1, 3, 1, [0.5, 1.5, 0.5]);
  else if (variant === 'cube') block(set, seed, 1, 2, 1, [0.5, 1, 0.5]);
  else if (variant === 'pillar') pillar(set, seed);
  else block(set, seed, 1.5, 2, 1, [0.75, 1, 0.5]);
  set.emit(p.voxels, { seed, jitter: 0.1 });
  p.boundsCollider();
  return p.done();
}

export default defineKitAsset({
  section: '19.2',
  order: 6,
  name: 'Dark weathering',
  caption: 'Dark stains, moss and long-term weathering.',
  size: {
    real: '0.5 m blocks; block 1.5 × 1 m, 1 m high; pillar 1.75 m',
    sheet: 'not given',
    note: 'Built from the kit’s 0.5 m sandstone blocks (Angkor’s run 0.4–0.6 m high); the pillar is a half-block shaft on a base, like the sheet’s.',
  },
  variants: [
    { id: 'wall', name: 'Dark weathered block' },
    { id: 'stack', name: 'Dark tall stack' },
    { id: 'cube', name: 'Dark cube' },
    { id: 'pillar', name: 'Dark pillar' },
    { id: 'tile', name: 'Tile (top view)' },
  ],
  shots: [
    { view: 'iso', variant: 'stack', label: 'Tall stack' },
    { view: 'iso', variant: 'cube', label: 'Cube' },
    { view: 'iso', variant: 'pillar', label: 'Pillar' },
    { view: 'top', variant: 'tile', label: 'Tile (top view)' },
  ],
  ref: { sheet: 'section 19/DC8CFA59-53FC-45C2-9C62-F650EC8907C8.PNG', box: [1277, 131, 1518, 642] },
  build: ({ variant, seed }) => build(variant, seed),
});
