import { MAP_BOUNDS, OVERVIEW, PLACES } from '../layout';

/**
 * The cameras the map is seen from: the overview and the close-up of every
 * place (camera.ts flies between them), all south of what they look at; and
 * the roaming explorer's follow camera, which goes anywhere in the roaming
 * area and looks every way. So the land is closed from every side there, and
 * only its far edges keep the savings of the fixed cameras (coarse blocks,
 * no faces turned away from every camera).
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

/** A box on the map (m). */
export interface MapBox {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * Where the explorer can roam: the map less its sinking side and back edges,
 * as boxes that overlap. The highlands of the six places, and the land round
 * Phnom Kulen and east of it, where the map grew: walkable all round the holy
 * mountain, over the Kulen stream and on to the hills east of it. Behind the
 * north hills the land sinks into the mist from the first box's back edge on,
 * as it always did. Past the roaming area the land sinks (heightfield.ts
 * `edgeFall`), and so the mist (sky/mist.ts) and the edge banks (clouds.ts)
 * follow its outline; roam/world.ts `inBounds` and `edgeDistance` read it.
 */
export const ROAM_BOXES: readonly MapBox[] = [
  { x0: MAP_BOUNDS.x0 + 150, x1: 450, z0: -510, z1: MAP_BOUNDS.z1 },
  { x0: 230, x1: MAP_BOUNDS.x1 - 160, z0: MAP_BOUNDS.z0 + 150, z1: MAP_BOUNDS.z1 },
];
/** The box round the whole roaming area (the big map shows it). */
export const ROAM_AREA: MapBox = {
  x0: Math.min(...ROAM_BOXES.map((b) => b.x0)),
  x1: Math.max(...ROAM_BOXES.map((b) => b.x1)),
  z0: Math.min(...ROAM_BOXES.map((b) => b.z0)),
  z1: Math.max(...ROAM_BOXES.map((b) => b.z1)),
};
/** How far the follow camera gets from the explorer (m; followCam.ts `maxDistance`). */
export const CAM_REACH = 40;

/**
 * How far (x, z) is inside the roaming area (m), or minus how far it is
 * outside. Outside, `square` takes the larger of the two distances across and
 * along (the land's sinking band has square corners, heightfield.ts
 * `edgeFall`), else the straight one. Without `front` the map's front edge
 * (under the overview camera, where the land does not sink) is no edge.
 */
export function roamInside(x: number, z: number, front = true, square = false): number {
  let inside = -Infinity;
  let out = Infinity;
  for (const b of ROAM_BOXES) {
    const z1 = front || b.z1 < MAP_BOUNDS.z1 ? b.z1 : Infinity;
    const dx = Math.max(b.x0 - x, x - b.x1);
    const dz = Math.max(b.z0 - z, z - z1);
    if (dx <= 0 && dz <= 0) inside = Math.max(inside, -Math.max(dx, dz));
    else out = Math.min(out, square ? Math.max(dx, dz) : Math.hypot(Math.max(0, dx), Math.max(0, dz)));
  }
  return inside > -Infinity ? inside : -out;
}

/**
 * Metres past the end of the land at (x, z): where it has sunk all the way
 * into the mist (the sinking band's outer edge, `EDGE_BAND` past the roaming
 * area; negative inside). The front edge does not count.
 */
export const pastLand = (x: number, z: number): number => -roamInside(x, z, false, true) - EDGE_BAND;
/** Width of the band past the roaming area where the land sinks into the mist (m; heightfield.ts `edgeFall`). */
export const EDGE_BAND = 150;

/** Is (x, z) in the roaming area? */
export const inRoam = (x: number, z: number): boolean => roamInside(x, z) > 0;

/** Distance (m) on the map from a point to the roaming area (0 inside). */
export function roamDistance(x: number, z: number): number {
  return Math.max(0, -roamInside(x, z));
}

/** How far inside the boxes' overlap the way back round the area's inner corner heads (m, at most a third of its size). */
const CORNER_IN = 60;

/**
 * Where to head for from (x, z), coming back into the roaming area on the
 * way home to (hx, hz) (the wind at its edge turns the fliers towards the
 * temples: roam/hangGlider.ts, parachute.ts, balloon.ts): home itself when
 * the straight way there stays in the area, else a point `CORNER_IN` m
 * inside the overlap of the box he is in (or nearest) and home's box — round
 * the area's inner corner, never across the gap outside it. Writes `out`.
 */
export function roamHeading(x: number, z: number, hx: number, hz: number, out: { x: number; z: number }): { x: number; z: number } {
  out.x = hx;
  out.z = hz;
  const n = Math.ceil(Math.hypot(hx - x, hz - z) / 10);
  let straight = true;
  for (let i = 1; i < n && straight; i++) straight = roamInside(x + ((hx - x) * i) / n, z + ((hz - z) * i) / n) > 0;
  if (straight) return out;
  // (his box: the one he is deepest in, or the nearest; home's box: the one it is deepest in)
  const depth = (b: MapBox, px: number, pz: number) => -Math.max(b.x0 - px, px - b.x1, b.z0 - pz, pz - b.z1);
  let mine = ROAM_BOXES[0];
  let home = ROAM_BOXES[0];
  for (const b of ROAM_BOXES) {
    if (depth(b, x, z) > depth(mine, x, z)) mine = b;
    if (depth(b, hx, hz) > depth(home, hx, hz)) home = b;
  }
  const x0 = Math.max(mine.x0, home.x0);
  const x1 = Math.min(mine.x1, home.x1);
  const z0 = Math.max(mine.z0, home.z0);
  const z1 = Math.min(mine.z1, home.z1);
  if (mine === home || x0 >= x1 || z0 >= z1) return out;
  const mx = Math.min(CORNER_IN, (x1 - x0) / 3);
  const mz = Math.min(CORNER_IN, (z1 - z0) / 3);
  out.x = Math.min(x1 - mx, Math.max(x0 + mx, x));
  out.z = Math.min(z1 - mz, Math.max(z0 + mz, z));
  return out;
}

const camXs = MAP_VIEWS.map((v) => v.pos[0]);
/**
 * East faces (normal +x) east of this line never face a camera, nor do west
 * faces west of `FACE_X_MIN`, nor north faces (−z) north of `FACE_Z_MIN`:
 * all of them lie in the sinking edges and face out of the map. Bottoms are
 * never seen. (10 m margin for the fixed cameras' lean.)
 */
export const FACE_X_MAX = Math.max(Math.max(...camXs) + 10, ROAM_AREA.x1 + CAM_REACH);
export const FACE_X_MIN = Math.min(Math.min(...camXs) - 10, ROAM_AREA.x0 - CAM_REACH);
export const FACE_Z_MIN = ROAM_AREA.z0 - CAM_REACH;
