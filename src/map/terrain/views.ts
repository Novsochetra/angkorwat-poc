import { OVERVIEW, PLACES } from '../layout';

/**
 * The cameras the map is ever seen from: the overview and the close-up of
 * every place (camera.ts flies between them). All of them stand south of what
 * they look at, so the land only needs what these cameras can see: its tops,
 * its south faces, and east / west faces on the side of a camera.
 */
export interface MapView {
  pos: readonly [number, number, number];
  /** Unit forward, right and up vectors. */
  fwd: [number, number, number];
  right: [number, number, number];
  up: [number, number, number];
  /** Half the view size at 1 m (vertical, horizontal for the widest window we plan for). */
  tanV: number;
  tanH: number;
  /** Farthest distance (m) that still gets 2 m and 4 m blocks from this camera. */
  fine: number;
  mid: number;
}

/** Widest window planned for (21:9 and a margin for the camera's lean and sway). */
const MAX_ASPECT = 2.3;

function makeView(pos: readonly [number, number, number], target: readonly [number, number, number], fine: number, mid: number): MapView {
  const f = [target[0] - pos[0], target[1] - pos[1], target[2] - pos[2]];
  const fl = Math.hypot(f[0], f[1], f[2]);
  const fwd: [number, number, number] = [f[0] / fl, f[1] / fl, f[2] / fl];
  // right = fwd × up(0,1,0); up = right × fwd
  const r = [-fwd[2], 0, fwd[0]];
  const rl = Math.hypot(r[0], r[2]);
  const right: [number, number, number] = [r[0] / rl, 0, r[2] / rl];
  const up: [number, number, number] = [
    right[1] * fwd[2] - right[2] * fwd[1],
    right[2] * fwd[0] - right[0] * fwd[2],
    right[0] * fwd[1] - right[1] * fwd[0],
  ];
  const tanV = Math.tan(((OVERVIEW.fov / 2) * Math.PI) / 180) * 1.12;
  return { pos, fwd, right, up, tanV, tanH: tanV * MAX_ASPECT, fine, mid };
}

/**
 * The overview keeps 2 m blocks out to 470 m (the whole summit, the terraces,
 * the western cliffs); close-ups a little less far, as they are seen for a
 * moment. Past `mid`, 8 m blocks.
 */
export const MAP_VIEWS: MapView[] = [
  makeView(OVERVIEW.pos, OVERVIEW.target, 470, 820),
  ...PLACES.map((p) => makeView(p.focus.pos, p.focus.target, 300, 560)),
];

/** Distance from a view to a point if the point is inside its frame (with a margin), else −1. */
export function viewDistance(v: MapView, x: number, y: number, z: number): number {
  const dx = x - v.pos[0];
  const dy = y - v.pos[1];
  const dz = z - v.pos[2];
  const zc = dx * v.fwd[0] + dy * v.fwd[1] + dz * v.fwd[2];
  if (zc < 2) return -1;
  const xc = dx * v.right[0] + dz * v.right[2];
  const yc = dx * v.up[0] + dy * v.up[1] + dz * v.up[2];
  if (Math.abs(xc) > zc * v.tanH || Math.abs(yc) > zc * v.tanV) return -1;
  return Math.hypot(dx, dy, dz);
}

const camXs = MAP_VIEWS.map((v) => v.pos[0]);
/**
 * East faces (normal +x) east of this line never face a camera, nor do west
 * faces west of `FACE_X_MIN`; north faces (−z) and bottoms never do.
 * (10 m margin for the camera's lean.)
 */
export const FACE_X_MAX = Math.max(...camXs) + 10;
export const FACE_X_MIN = Math.min(...camXs) - 10;
