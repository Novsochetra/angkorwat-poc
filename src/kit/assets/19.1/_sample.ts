import { BlockSet, masonry } from '../../BlockSet';
import type { SandstoneFinish } from '../../palette';
import { PieceBuilder } from '../../PieceBuilder';
import { STONE_FINISH } from '../../surface';
import { defineKitAsset, type KitAsset, type KitPiece } from '../../types';
import { TEMPLE_BLOCK_M } from '../../../world/scale';

/**
 * §19.1 sample pieces for one sandstone finish, as on the sheet: a 3×3×3 cube
 * of 0.5 m blocks, a 2×2×2 cube, a paving slab, a pillar on its plinth and a
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
  const set = new BlockSet(B / 4);
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
    // Plinth, a shaft of half-width blocks in 0.375 m courses, a capital.
    const q = B / 4;
    set.add(-B * 0.75, 0, -B * 0.75, B * 0.75, q, B * 0.75, pick(n++), style);
    set.add(-B * 0.625, q, -B * 0.625, B * 0.625, 2 * q, B * 0.625, pick(n++), style);
    const courses = 4;
    const ch = (3 * B) / courses;
    for (let c = 0; c < courses; c++)
      for (let i = 0; i < 2; i++)
        for (let k = 0; k < 2; k++) set.add(-B / 2 + i * (B / 2), 2 * q + c * ch, -B / 2 + k * (B / 2), i * (B / 2), 2 * q + (c + 1) * ch, k * (B / 2), pick(n++), style);
    const top = 2 * q + 3 * B;
    set.add(-B * 0.625, top, -B * 0.625, B * 0.625, top + q, B * 0.625, pick(n++), style);
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
    size: { real: '0.5 m blocks (1.5 m sample cube)', sheet: 'not given', note: 'Angkor Wat’s sandstone blocks run 0.4–0.6 m high and 0.5–1.2 m long; the kit lays 0.5 m blocks (TEMPLE_BLOCK_M).' },
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
