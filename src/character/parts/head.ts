import { VoxelBuilder, type VoxelGrid } from '../../voxel/VoxelBuilder';
import { PALETTE } from '../palette';

/** Head block: 11 wide × 9 tall × 9 deep body units (the hair adds 3 on top). */
export const HEAD = {
  minX: -5.5,
  maxX: 5.5,
  minY: 20.4,
  maxY: 29.4,
  minZ: -4.1,
  maxZ: 4.9,
} as const;

/**
 * Skull occupancy for a cell centre (shared with the hair so they never overlap):
 * the chin row steps in two blocks each side, the crown row is bevelled all round.
 */
export function skullHas(x: number, y: number, z: number): boolean {
  if (x < HEAD.minX || x > HEAD.maxX || y < HEAD.minY || y > HEAD.maxY || z < HEAD.minZ || z > HEAD.maxZ) return false;
  const ax = Math.abs(x);
  if (y < HEAD.minY + 1 && ax > 3.6) return false;
  if (y > HEAD.maxY - 1 && (ax > 4.6 || z < HEAD.minZ + 1 || z > HEAD.maxZ - 1)) return false;
  return true;
}

/** Grid shared by the head and the swappable face so their blocks line up exactly. */
export const HEAD_GRID = { cell: 1, origin: [HEAD.minX, HEAD.minY, HEAD.minZ] as [number, number, number] };

/** Head-grid columns / rows the face part owns (front layer only). */
export const FACE_COLUMNS = [2, 3, 7, 8] as const; // x centres −3, −2, 2, 3
export const FACE_ROWS = [1, 2, 3, 4] as const; // y 21.4 → 25.4
export const FACE_LAYER = 8; // z 3.9 → 4.9

export function headGrid(b: VoxelBuilder, seed = 11): VoxelGrid {
  return b.grid({ ...HEAD_GRID, mat: 'face', jitter: 0.008, ao: 0.16, seed });
}

/**
 * @param underHair where the hair covers a cell next to the skull; skull blocks
 * whose every open side is under hair turn scalp-dark, so gaps between the hair
 * blocks read as shadow instead of skin.
 */
export function buildHead(underHair?: (x: number, y: number, z: number) => boolean): VoxelBuilder {
  const b = new VoxelBuilder();
  const g = headGrid(b);
  const P = PALETTE.skin;
  const SIDES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
  for (let i = 0; i <= 10; i++)
    for (let j = 0; j <= 8; j++)
      for (let k = 0; k <= 8; k++) {
        const [x, y, z] = g.center(i, j, k);
        if (!skullHas(x, y, z)) continue;
        const open = SIDES.filter(([dx, dy, dz]) => !skullHas(x + dx, y + dy, z + dz));
        const scalp = !!underHair && open.length > 0 && open.every(([dx, dy, dz]) => underHair(x + dx, y + dy, z + dz));
        g.set(i, j, k, scalp ? PALETTE.hair.darkest : P.base);
      }
  // The face part supplies these blocks (eyes, blush, eyelids).
  for (const i of FACE_COLUMNS) for (const j of FACE_ROWS) g.ghost(i, j, FACE_LAYER);

  // Slightly warmer cheeks and a cooler, shaded underside of the jaw.
  g.paint((i, j, k, cell) => {
    if (cell.color === PALETTE.hair.darkest) return;
    if (j === 0 && k < 8) return P.shade;
    if (j <= 1 && (i <= 1 || i >= 9) && k >= 6) return P.warm;
  });
  g.commit();

  // Ears: big blocks between the sideburn and the hair behind (side view of the
  // sheet), with a darker inner notch.
  for (const s of [-1, 1]) {
    b.span(s * 5.5, 21.5, -1.05, s * 6.2, 24.0, 0.85, P.base, 'skin', { shade: 0.97 });
    b.span(s * 5.95, 22.2, -0.5, s * 6.27, 23.3, 0.3, P.shade, 'skin', { shade: 0.9 });
  }

  return b;
}

/** Neck, mostly hidden by the krama. Lives on the neck joint so the head can nod over it. */
export function buildNeck(): VoxelBuilder {
  const b = new VoxelBuilder();
  const n = b.grid({ cell: 1, origin: [-2, 18.4, -1.8], mat: 'skin', jitter: 0.02, ao: 0.1, seed: 3 });
  n.fill(0, 3, 0, 1, 0, 3, PALETTE.skin.neck);
  n.commit();
  return b;
}
