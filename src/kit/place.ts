import { Euler, Quaternion, type Object3D } from 'three';
import type { VoxelBox, VoxelBuilder } from '../voxel/VoxelBuilder';
import type { KitCollider, KitPiece } from './types';

/**
 * Put kit pieces into a bigger build (a diorama, the walkable kit level):
 * moved, and turned about +Y in quarter turns so every block and collider stays
 * axis-aligned. turn = 1 turns the piece's front (+Z) to face +X.
 */
export interface Placement {
  x: number;
  y: number;
  z: number;
  /** Quarter turns about +Y (0–3). */
  turn?: number;
}

export interface PlaceTarget {
  voxels: VoxelBuilder;
  /** Receives the placed colliders (world / diorama space). */
  collider?: (c: KitCollider) => void;
  /** Receives the placed extras (lights…), already positioned. */
  extra?: (o: Object3D) => void;
}

/** Face bits of `open` / `merge`: +x, −x, +y, −y, +z, −z. */
const FACES: [number, number, number][] = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];

/** Rotate (x, z) by quarter turns: turn 1 maps +Z to +X. */
function turnXZ(x: number, z: number, turn: number): [number, number] {
  switch (turn & 3) {
    case 1:
      return [z, -x];
    case 2:
      return [-x, -z];
    case 3:
      return [-z, x];
    default:
      return [x, z];
  }
}

function turnMask(mask: number | undefined, turn: number): number | undefined {
  if (mask === undefined || (turn & 3) === 0) return mask;
  let out = 0;
  for (let b = 0; b < 6; b++) {
    if (!(mask & (1 << b))) continue;
    const [nx, ny, nz] = FACES[b];
    const [rx, rz] = turnXZ(nx, nz, turn);
    out |= 1 << FACES.findIndex(([x, y, z]) => x === rx && y === ny && z === rz);
  }
  return out;
}

const _q = new Quaternion();
const _qt = new Quaternion();
const _e = new Euler();

/** Copy a piece into a target, moved and turned. */
export function placePiece(target: PlaceTarget, piece: KitPiece, at: Placement): void {
  const turn = ((at.turn ?? 0) % 4 + 4) % 4;
  const odd = turn % 2 === 1;
  _qt.setFromEuler(_e.set(0, (turn * Math.PI) / 2, 0));
  for (const b of piece.voxels.boxes) {
    const [x, z] = turnXZ(b.x, b.z, turn);
    const nb: VoxelBox = { ...b, x: x + at.x, y: b.y + at.y, z: z + at.z };
    if (b.rx || b.ry || b.rz) {
      // Tilted blocks keep their own frame: compose the turn with their rotation.
      _q.setFromEuler(_e.set(b.rx ?? 0, b.ry ?? 0, b.rz ?? 0)).premultiply(_qt);
      _e.setFromQuaternion(_q, 'XYZ');
      nb.rx = _e.x;
      nb.ry = _e.y;
      nb.rz = _e.z;
    } else {
      if (odd) {
        nb.sx = b.sz;
        nb.sz = b.sx;
      }
      nb.open = turnMask(b.open, turn);
      nb.merge = turnMask(b.merge, turn);
    }
    target.voxels.boxes.push(nb);
  }
  if (target.collider)
    for (const c of piece.colliders) {
      const [ax, az] = turnXZ(c.min[0], c.min[2], turn);
      const [bx, bz] = turnXZ(c.max[0], c.max[2], turn);
      target.collider({
        min: [Math.min(ax, bx) + at.x, c.min[1] + at.y, Math.min(az, bz) + at.z],
        max: [Math.max(ax, bx) + at.x, c.max[1] + at.y, Math.max(az, bz) + at.z],
        ...(c.noStand ? { noStand: true } : {}),
      });
    }
  if (target.extra)
    for (const e of piece.extras ?? []) {
      const o = e.clone();
      const [x, z] = turnXZ(o.position.x, o.position.z, turn);
      o.position.set(x + at.x, o.position.y + at.y, z + at.z);
      o.rotation.y += (turn * Math.PI) / 2;
      target.extra(o);
    }
}

/** Footprint (metres) of a piece after turning: [minX, minZ, maxX, maxZ] relative to its origin. */
export function footprint(piece: KitPiece, turn = 0): [number, number, number, number] {
  const { min, max } = piece.voxels.bounds();
  const [ax, az] = turnXZ(min[0], min[2], turn);
  const [bx, bz] = turnXZ(max[0], max[2], turn);
  return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
}
