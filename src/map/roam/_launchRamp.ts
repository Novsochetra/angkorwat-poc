import { Color, Euler, Group, Matrix4, Vector3, type InstancedMesh } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';

/**
 * A hang-glider take-off ramp at a cliff edge, as voxels at real size
 * (metres): a plank deck sloping gently down to the lip, a checked krama
 * runner down its middle, low rails along the back half, posts reaching
 * 3–4 m down (the ground under it is uneven and may fall away near the
 * lip) with a few braces. Behind the back corner a pole carries a striped
 * windsock, a string of prayer flags and a lantern that glows at night.
 *
 * Ramp space: origin at the middle of the back end at ground level, +z
 * towards the lip (the take-off), +y up, +x the ramp's left.
 */

export const RAMP = {
  length: 9,
  width: 4,
  /** Deck top at the back (z = 0) and at the lip (z = length). */
  backY: 0.35,
  lipY: 0.1,
  /** The windsock pole's foot and height: behind the back-left corner, clear of a parked glider's wing. */
  pole: { x: 2.6, z: -1.5, height: 4.3 },
};

/** Deck top at z along the ramp (0‥length) in ramp space: where the explorer runs. */
export function rampDeckY(z: number): number {
  const t = Math.min(1, Math.max(0, z / RAMP.length));
  return RAMP.backY + (RAMP.lipY - RAMP.backY) * t;
}

// Warm weathered planks, darker posts and joists, the lip lacquered red (sRGB).
const PLANK = [0xa87a45, 0x9c703d, 0xb3864f, 0x926838, 0xa38a68];
const JOIST = [0x6b4a2c, 0x5e4127, 0x765334, 0x584030];
const LACQUER = 0xa8352a;
const STONE = [0x8f877a, 0x9b9283, 0x857d70];
// Khmer silk: the runner's checks and borders, the windsock's stripes.
const SAFFRON = [0xe98d1c, 0xf29a28];
const RED = [0x9c2420, 0xa82b24];
const GOLD = [0xe9b84b, 0xf3c75c];
const CREAM = 0xf3e2bd;
const BRASS = 0xc59a4a;
const ROPE = 0x4a3526;
/** Prayer flags: blue, yellow, red, white, orange (the Buddhist flag). */
const FLAGS = [0x2f5fa8, 0xf2c230, 0xb8322a, 0xf1ead8, 0xe98d1c];
/** The lantern's flame colour (linear), scaled above 1 at night. */
const LAMP = new Color(1, 0.62, 0.28);

/** Posts under the deck (z), a quarter of the way in from each side. */
const POSTS = [0.35, 3.1, 5.9, 8.65];
const POST_X = 1.8;
/** How far the posts reach down (y) at the back and at the lip. */
const POST_BACK = -2.6;
const POST_LIP = -3.8;
/** Deck slope (rad): planks and joists tilt with it. */
const SLOPE = Math.atan((RAMP.backY - RAMP.lipY) / RAMP.length);
/** Plank pitch along the deck, thickness, and the runner's half width and thickness. */
const PITCH = 0.25;
const PLANK_T = 0.06;
const RUN_HALF = 0.6;
const RUN_T = 0.02;
/** The rails run along the back half. */
const RAIL_TO = 4.5;
const RAIL_X = RAMP.width / 2 - 0.06;
const RAIL_H = 0.8;

export function buildLaunchRamp(seed: number): { group: Group; blocks: number; lamp: Vector3; update(night: number, t: number): void } {
  const b = new VoxelBuilder();
  const src = traceSource();
  const tone = (list: readonly number[], i: number, j: number, k: number) => list[Math.floor(hash3(i, j, k, seed * 131 + 7) * list.length)];
  const L = RAMP.length;
  const W = RAMP.width / 2;
  const deck = rampDeckY;

  // Deck: planks across, each in three pieces (the middle one sits lower, under the runner).
  const n = Math.round(L / PITCH);
  for (let i = 0; i < n; i++) {
    const z = (i + 0.5) * PITCH;
    const y = deck(z) - PLANK_T / 2;
    const w = PITCH - 0.02 - 0.012 * hash3(i, 1, 0, seed);
    for (const [x0, x1, low] of [
      [-W, -RUN_HALF, 0],
      [-RUN_HALF, RUN_HALF, 1],
      [RUN_HALF, W, 0],
    ] as const) {
      const shade = 0.94 + 0.12 * hash3(i, x0 * 10, 2, seed);
      b.box((x0 + x1) / 2, y - low * RUN_T, z, x1 - x0 - 0.01, PLANK_T, w, tone(PLANK, i, x0 * 10, 3), 'wood', { src, shade, rx: SLOPE });
    }
  }
  // Runner: a checked krama mat down the middle (red and cream checks, gold borders).
  const rows = Math.round((L - 0.3) / 0.3);
  const rz0 = 0.15;
  for (let i = 0; i < rows; i++) {
    const z = rz0 + (i + 0.5) * 0.3;
    const y = deck(z) - RUN_T / 2;
    for (let c = 0; c < 3; c++) {
      const x = (c - 1) * 0.32;
      const color = (i + c) % 2 === 0 ? tone(RED, i, c, 5) : CREAM;
      b.box(x, y, z, 0.32, RUN_T, 0.3, color, 'krama', { src, shade: 0.96 + 0.08 * hash3(i, c, 6, seed), rx: SLOPE });
    }
  }
  const borders = Math.round(rows / 2);
  const bl = (rows * 0.3) / borders;
  for (let i = 0; i < borders; i++) {
    const z = rz0 + (i + 0.5) * bl;
    for (const s of [1, -1]) b.box(s * (RUN_HALF - 0.06), deck(z) - RUN_T / 2, z, 0.12, RUN_T, bl, tone(GOLD, i, s, 8), 'krama', { src, rx: SLOPE });
  }

  // Joists under the planks, bearers across at the posts, the lip lacquered red, a board across the back.
  for (const x of [-POST_X, -0.65, 0.65, POST_X])
    for (let s = 0; s < 3; s++) {
      const z = (s + 0.5) * (L / 3);
      b.box(x, deck(z) - PLANK_T - 0.09, z, 0.1, 0.18, L / 3 - 0.01, tone(JOIST, x * 10, s, 9), 'mapBark', { src, rx: SLOPE });
    }
  for (const z of POSTS) b.box(0, deck(z) - PLANK_T - 0.26, z, 2 * W - 0.1, 0.16, 0.16, tone(JOIST, z * 10, 0, 10), 'mapBark', { src });
  b.box(0, RAMP.lipY - 0.09, L + 0.07, 2 * W + 0.04, 0.2, 0.14, LACQUER, 'wood', { src });
  b.box(0, RAMP.backY - 0.14, 0.04, 2 * W, 0.2, 0.08, tone(JOIST, 1, 1, 11), 'mapBark', { src });

  // Posts, from under the deck down 3–4 m, in lengths of timber; stone footings at the back.
  for (const z of POSTS) {
    const top = deck(z) - PLANK_T - 0.18;
    const bottom = POST_BACK + (POST_LIP - POST_BACK) * (z / L);
    const len = top - bottom;
    const parts = Math.ceil(len / 1.4);
    for (const s of [1, -1])
      for (let p = 0; p < parts; p++) {
        const y1 = top - (p * len) / parts;
        const y0 = top - ((p + 1) * len) / parts;
        b.box(s * POST_X, (y0 + y1) / 2, z, 0.18, y1 - y0 - 0.01, 0.18, tone(JOIST, s, p, 12 + z), 'mapBark', { src });
      }
  }
  for (const s of [1, -1]) b.box(s * POST_X, 0.01, POSTS[0], 0.38, 0.22, 0.38, tone(STONE, s, 0, 13), 'mapStone', { src });
  // Braces: diagonals down each side between the posts, and a pair crossed under the lip.
  // (a timber from one point to the other, its flat side facing `face`)
  const bz = new Vector3();
  const bx = new Vector3();
  const by = new Vector3();
  const bm = new Matrix4();
  const be = new Euler();
  const brace = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, face: Vector3, i: number) => {
    bz.set(x1 - x0, y1 - y0, z1 - z0);
    const len = bz.length();
    bz.divideScalar(len);
    bx.copy(face).addScaledVector(bz, -face.dot(bz)).normalize();
    by.crossVectors(bz, bx);
    be.setFromRotationMatrix(bm.makeBasis(bx, by, bz), 'XYZ');
    b.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, 0.07, 0.15, len, tone(JOIST, i, 3, 14), 'mapBark', { src, rx: be.x, ry: be.y, rz: be.z });
  };
  const X = new Vector3(1, 0, 0);
  const Z = new Vector3(0, 0, 1);
  for (const s of [1, -1]) {
    const x = s * (POST_X + 0.13);
    brace(x, deck(POSTS[1]) - 0.45, POSTS[1], x, -1.9, POSTS[2], X, s);
    brace(x, deck(POSTS[2]) - 0.45, POSTS[2], x, -2.6, POSTS[3], X, s + 4);
  }
  const lz = POSTS[3] - 0.13;
  brace(-POST_X, -0.45, lz, POST_X, -2.9, lz, Z, 7);
  brace(POST_X, -0.45, lz - 0.08, -POST_X, -2.9, lz - 0.08, Z, 8);

  // Low rails along the back half: posts with brass knobs, a top rail and a middle rail.
  const railPosts = [0.12, 1.58, 3.04, RAIL_TO];
  for (const s of [1, -1]) {
    for (const [i, z] of railPosts.entries()) {
      b.box(s * RAIL_X, deck(z) + RAIL_H / 2 - 0.04, z, 0.1, RAIL_H + 0.08, 0.1, tone(PLANK, s, i, 15), 'wood', { src });
      b.box(s * RAIL_X, deck(z) + RAIL_H + 0.06, z, 0.09, 0.07, 0.09, BRASS, 'brass', { src });
    }
    const zm = (railPosts[0] + RAIL_TO) / 2;
    for (const [h, t] of [
      [RAIL_H - 0.03, 0.08],
      [RAIL_H * 0.5, 0.06],
    ])
      b.box(s * RAIL_X, deck(zm) + h, zm, 0.08, t, RAIL_TO - railPosts[0] + 0.1, tone(PLANK, s, h * 10, 16), 'wood', { src, rx: SLOPE });
  }

  // The pole behind the back-left corner, on a stone, a brass lotus bud on top.
  const P = RAMP.pole;
  b.box(P.x, 0.05, P.z, 0.4, 0.26, 0.4, tone(STONE, 2, 0, 17), 'mapStone', { src });
  for (let p = 0; p < 3; p++) b.box(P.x, (p + 0.5) * (P.height / 3), P.z, 0.13 - p * 0.015, P.height / 3 - 0.01, 0.13 - p * 0.015, tone(JOIST, p, 5, 18), 'wood', { src });
  b.box(P.x, P.height + 0.06, P.z, 0.1, 0.12, 0.1, BRASS, 'brass', { src });
  b.box(P.x, P.height + 0.15, P.z, 0.05, 0.07, 0.05, GOLD[1], 'brass', { src });
  // Lantern on an arm towards the ramp: a brass cage round the glass.
  const armY = 2.25;
  b.box(P.x - 0.24, armY, P.z, 0.48, 0.06, 0.06, tone(JOIST, 9, 9, 19), 'wood', { src });
  const lamp = new Vector3(P.x - 0.42, armY - 0.33, P.z);
  b.box(lamp.x, armY - 0.1, lamp.z, 0.02, 0.14, 0.02, BRASS, 'brass', { src });
  b.box(lamp.x, lamp.y + 0.12, lamp.z, 0.18, 0.035, 0.18, BRASS, 'brass', { src });
  b.box(lamp.x, lamp.y + 0.16, lamp.z, 0.08, 0.04, 0.08, BRASS, 'brass', { src });
  b.box(lamp.x, lamp.y - 0.11, lamp.z, 0.16, 0.03, 0.16, BRASS, 'brass', { src });
  for (const [sx, sz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ])
    b.box(lamp.x + sx * 0.07, lamp.y, lamp.z + sz * 0.07, 0.025, 0.22, 0.025, BRASS, 'brass', { src });
  b.box(lamp.x, lamp.y, lamp.z, 0.12, 0.18, 0.12, 0xffffff, 'glow', { src });
  // Prayer flags on a rope from the pole down to the back rail's corner post.
  const ra = new Vector3(P.x - 0.05, 3.3, P.z);
  const rb = new Vector3(RAIL_X, deck(railPosts[0]) + RAIL_H + 0.05, railPosts[0]);
  const ropeLen = ra.distanceTo(rb);
  const knots = Math.ceil(ropeLen / 0.12);
  const sag = 0.3;
  const at = (t: number, out: Vector3) => out.lerpVectors(ra, rb, t).setY(ra.y + (rb.y - ra.y) * t - sag * 4 * t * (1 - t));
  const v = new Vector3();
  for (let i = 0; i <= knots; i++) {
    at(i / knots, v);
    b.box(v.x, v.y, v.z, 0.035, 0.035, 0.035, ROPE, 'leather', { src });
  }
  const flagYaw = Math.atan2(rb.x - ra.x, rb.z - ra.z);
  for (let i = 1; i <= 7; i++) {
    at(i / 8, v);
    b.box(v.x, v.y - 0.13, v.z, 0.02, 0.22, 0.17, FLAGS[(i - 1) % FLAGS.length], 'krama', { src, ry: flagYaw, rz: (hash3(i, 2, 0, seed) - 0.5) * 0.3 });
  }

  const blocksMain = b.boxes.length;
  const group = buildVoxelMesh(b, { quality: 'medium', name: 'launchRamp' });
  group.name = 'launchRamp';
  const glass = group.children.find((c) => c.name === 'launchRamp:glow') as InstancedMesh;
  glass.castShadow = false;

  // Windsock: its own little group on the pole top, turned by the wind in `update`.
  // It points downwind: the breeze comes up the cliff, into the pilot's face, so it trails back over the ramp's back.
  const ws = new VoxelBuilder();
  ws.box(0, 0, 0.1, 0.04, 0.04, 0.2, 0x8e9398, 'metal', { src });
  const hoop = 0.36;
  for (const [x, y, sx, sy] of [
    [0, hoop / 2, hoop + 0.03, 0.03],
    [0, -hoop / 2, hoop + 0.03, 0.03],
    [hoop / 2, 0, 0.03, hoop],
    [-hoop / 2, 0, 0.03, hoop],
  ])
    ws.box(x, y, 0.22, sx, sy, 0.03, 0x8e9398, 'metal', { src });
  let sz = 0.24;
  for (let i = 0; i < 6; i++) {
    const w = hoop - 0.03 - i * 0.034;
    ws.box(0, -i * 0.012, sz + 0.13, w, w, 0.26, i % 2 === 0 ? SAFFRON[i % 4 === 0 ? 0 : 1] : RED[i % 4 === 1 ? 0 : 1], 'krama', { src });
    sz += 0.26;
  }
  const sock = buildVoxelMesh(ws, { quality: 'medium', name: 'launchRamp:windsock' });
  const pivot = new Group();
  pivot.name = 'launchRamp:windsock';
  pivot.position.set(P.x, P.height - 0.12, P.z);
  pivot.add(sock);
  group.add(pivot);
  // (each ramp's wind gusts at its own pace)
  const phase = hash3(seed, 3, 1, 61) * 20;
  const c = new Color();

  return {
    group,
    blocks: blocksMain + ws.boxes.length,
    lamp,
    update(night: number, t: number) {
      const tt = t + phase;
      // The sock trails back (−z), swings a little across and lifts and droops with the gusts.
      const gust = 0.5 + 0.5 * Math.sin(tt * 0.37) * Math.sin(tt * 0.23 + 1);
      pivot.rotation.set(0.12 + 0.35 * (1 - gust) + 0.04 * Math.sin(tt * 2.3), Math.PI + 0.22 * Math.sin(tt * 0.6) + 0.07 * Math.sin(tt * 1.9), 0, 'YXZ');
      // The lantern: soft by day, a warm flicker bright enough to bloom at night.
      const k = Math.max(0, Math.min(1, night));
      const flicker = 1 + k * (0.05 * Math.sin(tt * 11.3) + 0.04 * Math.sin(tt * 17.9));
      glass.setColorAt(0, c.copy(LAMP).multiplyScalar((0.45 + k * 4.5) * flicker));
      if (glass.instanceColor) glass.instanceColor.needsUpdate = true;
    },
  };
}
