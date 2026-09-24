import { BlockSet, masonry } from '../../BlockSet';
import type { SandstoneFinish } from '../../palette';
import { PieceBuilder } from '../../PieceBuilder';
import { TEXEL } from '../../shapes';
import { STONE_FINISH } from '../../surface';
import { defineKitAsset, type KitAsset, type KitPiece } from '../../types';
import { TEMPLE_BLOCK_M } from '../../../world/scale';

/**
 * §19.1 sample pieces for one sandstone finish, as on the sheet: a 3×3×3 cube
 * of 0.5 m blocks, a 2×2×2 cube, a paving slab, a pillar with base and capital, and a
 * top-view tile of mixed paving stones.
 */
const B = TEMPLE_BLOCK_M;

export const SAMPLE_VARIANTS = [
  { id: 'cube', name: '3×3×3 blocks' },
  { id: 'small', name: '2×2×2 blocks' },
  { id: 'slab', name: 'Paving slab' },
  { id: 'pillar', name: 'Pillar' },
  { id: 'tile', name: 'Tile (top view)' },
];

export function buildSample(finish: SandstoneFinish, variant: string, seed: number): KitPiece {
  const f = STONE_FINISH[finish];
  // The pillar's tiers step out by one texel, so it carves on the 1/16 m texel
  // grid: 1/8 m cells would round its 0.625 and 0.875 m tiers off-axis. The
  // finer cells also keep wear chips in scale with its smaller stones.
  const set = new BlockSet(variant === 'pillar' ? TEXEL : B / 4);
  const style = { surf: f.surf };
  const pick = (i: number) => f.palette[(i * 7 + seed * 3) % f.palette.length];
  let n = 0;
  const cube = (size: number, block = B) => {
    const h = (size * block) / 2;
    for (let i = 0; i < size; i++)
      for (let j = 0; j < size; j++)
        for (let k = 0; k < size; k++) set.add(-h + i * block, j * block, -h + k * block, -h + (i + 1) * block, (j + 1) * block, -h + (k + 1) * block, pick(n++), style);
  };
  if (variant === 'cube') cube(3);
  else if (variant === 'small') cube(2);
  else if (variant === 'slab') {
    // Two by two paving stones, half a block thick.
    for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) set.add(-B + i * B, 0, -B + k * B, i * B, B / 2, k * B, pick(n++), style);
  } else if (variant === 'pillar') {
    // As on the sheet: a stepped base, a shaft of two tall courses and a capital
    // that mirrors the base, a collar under a wide cap block. Each tier steps out
    // one texel a side and is 2 × 2 stones centred on the axis (metres).
    const tiers: [width: number, height: number][] = [
      [0.875, 0.25], // plinth
      [0.75, 0.125], // step
      [0.625, 0.625], // shaft
      [0.625, 0.625],
      [0.75, 0.125], // collar
      [0.875, 0.625], // cap
    ];
    let y = 0;
    for (const [w, h] of tiers) {
      for (let i = 0; i < 2; i++) for (let k = 0; k < 2; k++) set.add(((i - 1) * w) / 2, y, ((k - 1) * w) / 2, (i * w) / 2, y + h, (k * w) / 2, pick(n++), style);
      y += h;
    }
  } else {
    // Top-view tile: mixed paving stones in staggered rows, 1.5 m × 1.25 m.
    const rows = 3;
    for (let r = 0; r < rows; r++) {
      const z0 = -0.625 + (1.25 * r) / rows;
      masonry(set, -0.75, 0, z0, 0.75, B / 2, z0 + 1.25 / rows, { length: [0.375, 0.75], course: B / 2, axis: 'x', palette: f.palette, style, seed: seed + r * 7 });
    }
  }
  if (f.wear > 0) set.erode(f.wear, seed + 11);
  const p = new PieceBuilder();
  set.emit(p.voxels, { seed });
  p.boundsCollider();
  return p.done();
}

export function sandstoneAsset(finish: SandstoneFinish, order: number, name: string, caption: string, box: [number, number, number, number]): KitAsset {
  return defineKitAsset({
    section: '19.1',
    order,
    name,
    caption,
    size: {
      real: '0.5 m blocks (1.5 m sample cube, 2.4 m pillar)',
      sheet: 'not given',
      note: 'Angkor Wat’s sandstone blocks run 0.4–0.6 m high and 0.5–1.2 m long; the kit lays 0.5 m blocks (TEMPLE_BLOCK_M). The pillar keeps the sheet’s proportions: a 0.625 m shaft between a stepped base and a capital that widen a texel a side per tier to 0.875 m, 2.375 m tall.',
    },
    variants: SAMPLE_VARIANTS,
    shots: [
      { view: 'iso', variant: 'small', label: '2×2×2' },
      { view: 'iso', variant: 'slab', label: 'Slab' },
      { view: 'iso', variant: 'pillar', label: 'Pillar' },
      { view: 'top', variant: 'tile', label: 'Tile (top view)' },
    ],
    ref: { sheet: 'section 19/85D8F367-EBB2-45B5-94C0-E9ED5A7CE350.PNG', box },
    build: ({ variant, seed }) => buildSample(finish, variant, seed),
  });
}
