import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { hash3 } from '../../voxel/random';
import { PALETTE } from '../palette';

/**
 * Hat (the Khmer palm-leaf hat), lantern and torch from the "Equipment /
 * Variations" row of the sheet.
 * Lantern and torch are authored in their own local frame (origin = grip point).
 */

/** Hair above this height is trimmed away under the hat crown. */
export const HAT_CLIP_Y = 29.6;

/**
 * The Khmer palm-leaf hat (មួកស្លឹកត្នោត, woven from sugar-palm leaves). Head joint.
 * A wide, flat, round brim that droops a little toward its edge, bound in red
 * cloth; a round, flat-topped crown about half a head tall with straight sides
 * tapering a little, a red band round its base, and a small woven star knot on
 * top. The leaf strips run out from the middle (lighter and darker radial
 * streaks), stitch rings go round the brim and the top. Never the pointed
 * conical hat: that one is Vietnamese.
 */
export function buildHat(): VoxelBuilder {
  const b = new VoxelBuilder();
  const H = PALETTE.hat;
  const zc = -0.9;
  /** The leaf strip a direction falls in, and its straw tone (the same strips run over brim, crown and top). */
  const STRIPS = 20;
  const strip = (x: number, z: number) => Math.floor(((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * STRIPS) % STRIPS;
  const leaf = (n: number) => (hash3(n, 0, 0, 151) < 0.2 ? H.shade : n % 2 ? H.light : H.base);
  const cloth = (i: number, j: number, k: number) => (hash3(i, j, k, 114) < 0.7 ? H.red : H.redDark);

  // Brim: a disc of cells in three rings, each a step lower toward the
  // edge (the droop); the outermost cells (any of the eight around them
  // outside: a ring closed all round) are the red cloth binding, a little
  // thicker as it wraps the edge. (None under the middle of the crown: nothing
  // sees it.) Cells a little under 1 BU: the brim still passes between the hang
  // glider's down tubes and stays (just) inside the map overview's frame.
  const R = 12;
  const cw = 0.95;
  const inBrim = (x: number, z: number) => x * x + z * z <= 11.8 * 11.8;
  const rim = (x: number, z: number) => !inBrim(x + 1, z) || !inBrim(x - 1, z) || !inBrim(x, z + 1) || !inBrim(x, z - 1) || !inBrim(x + 1, z + 1) || !inBrim(x - 1, z + 1) || !inBrim(x + 1, z - 1) || !inBrim(x - 1, z - 1);
  const brim = [
    { y: 29.0, h: 0.6 },
    { y: 28.86, h: 0.6 },
    { y: 28.64, h: 0.66 },
  ].map((zn, n) => b.grid({ cell: [cw, zn.h, cw], origin: [-(R + 0.5) * cw, zn.y, zc - (R + 0.5) * cw], mat: n === 2 ? 'krama' : 'hat', jitter: 0.05, ao: 0.2, seed: 111 + n }));
  for (let x = -R; x <= R; x++)
    for (let z = -R; z <= R; z++) {
      const r = Math.hypot(x, z);
      if (r <= 5 || !inBrim(x, z)) continue;
      const n = rim(x, z) ? 2 : r > 9.2 ? 1 : 0;
      // (a stitch ring where the brim starts to droop)
      const stitch = n === 1 && r <= 10.2;
      brim[n].set(x + R, 0, z + R, n === 2 ? cloth(x, 0, z) : stitch ? H.stitch : leaf(strip(x, z)));
    }
  for (const g of brim) g.commit();

  // Crown: a band of red cloth, then woven rows, each ring of cells a little
  // narrower (the sides taper), the last one the flat top. Only the outside
  // shows; the inside is ghosted so the shading sees a solid crown.
  const C = 6;
  const inCrown = (x: number, z: number) => x * x + z * z <= 6.75 * 6.75;
  const rows: { y: number; h: number; w: number; band?: boolean; top?: boolean }[] = [
    { y: 29.6, h: 1.0, w: 1.06, band: true },
    { y: 30.6, h: 0.95, w: 1.03 },
    { y: 31.55, h: 0.95, w: 1.0 },
    { y: 32.5, h: 0.95, w: 0.97 },
    { y: 33.45, h: 0.95, w: 0.94, top: true },
  ];
  rows.forEach((row, n) => {
    const o = (C + 0.5) * row.w;
    const g = b.grid({ cell: [row.w, row.h, row.w], origin: [-o, row.y, zc - o], mat: row.band ? 'krama' : 'hat', jitter: 0.05, ao: 0.25, seed: 116 + n });
    for (let x = -C; x <= C; x++)
      for (let z = -C; z <= C; z++) {
        if (!inCrown(x, z)) continue;
        const i = x + C;
        const k = z + C;
        // (the eight around: a staircase corner cell shows between its neighbours)
        let edge = false;
        for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) edge ||= !inCrown(x + dx, z + dz);
        if (!edge && !row.top) {
          g.ghost(i, 0, k);
          continue;
        }
        const r = Math.hypot(x, z);
        // Stitch rings on the flat top.
        const ring = row.top && !edge && (Math.abs(r - 2.2) < 0.5 || Math.abs(r - 4.4) < 0.5);
        g.set(i, 0, k, row.band ? cloth(i, n, k) : ring ? H.stitch : leaf(strip(x, z)));
      }
    g.commit();
  });

  // The woven knot on top: a six-pointed star of three crossed strips under a
  // small hexagon (three crossed boxes) with a dark eye.
  const top = 34.4;
  for (let n = 0; n < 3; n++) {
    const a = (n * Math.PI) / 3;
    b.box(0, top + 0.12, zc, 3.0, 0.24, 0.55, H.stitch, 'hat', { ry: a + Math.PI / 6 });
    b.box(0, top + 0.22, zc, 0.95, 0.44, 0.95 * Math.sqrt(3), H.light, 'hat', { ry: a });
  }
  b.box(0, top + 0.46, zc, 0.5, 0.1, 0.5, H.stitch, 'hat', { ry: Math.PI / 4 });
  return b;
}

/** Hand lantern. Origin at the bail bar held in the fist; hangs along −Y. */
export function buildLantern(): { frame: VoxelBuilder; glass: VoxelBuilder } {
  const frame = new VoxelBuilder();
  const glass = new VoxelBuilder();
  const M = 0x3b3a3a;
  const M2 = 0x55524e;
  frame.box(0, 0, 0, 1.5, 0.28, 0.28, M, 'metal');
  for (const s of [-1, 1]) frame.box(s * 0.72, -0.6, 0, 0.24, 1.3, 0.24, M, 'metal');
  frame.span(-1.0, -1.85, -1.0, 1.0, -1.25, 1.0, M, 'metal');
  frame.span(-0.55, -1.25, -0.55, 0.55, -1.0, 0.55, M2, 'metal');
  frame.span(-0.3, -1.0, -0.3, 0.3, -0.75, 0.3, PALETTE.brass, 'brass');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) frame.box(sx * 0.82, -3.05, sz * 0.82, 0.32, 2.5, 0.32, M, 'metal');
  frame.span(-1.1, -4.85, -1.1, 1.1, -4.3, 1.1, M, 'metal');
  frame.span(-0.8, -5.05, -0.8, 0.8, -4.85, 0.8, M2, 'metal');
  const T = PALETTE.torch;
  glass.box(0, -3.05, 0, 1.36, 2.4, 1.36, T.yellow, 'glow');
  glass.box(0, -3.25, 0, 0.62, 1.1, 0.62, T.core, 'glow');
  return { frame, glass };
}

/**
 * Wooden torch. Origin at the grip; the handle runs along +Z (the fist's grip
 * axis), so it points up when the forearm is raised as in the hero shot.
 */
export function buildTorchHandle(): VoxelBuilder {
  const b = new VoxelBuilder();
  const W = PALETTE.wood;
  const g = b.grid({ cell: [0.56, 0.56, 0.62], origin: [-0.28, -0.28, -1.5], mat: 'wood', jitter: 0.07, ao: 0, seed: 121 });
  g.fill(0, 0, 0, 0, 0, 10, (_i, _j, k) => (k % 3 === 0 ? W.dark : W.base));
  g.commit();
  // Wrapped, pitch-soaked head.
  b.span(-0.46, -0.46, 5.1, 0.46, 0.46, 6.4, 0x3a2418, 'wood', { shade: 0.9 });
  b.span(-0.52, -0.52, 5.4, 0.52, 0.52, 5.8, 0x5a3a24, 'wood');
  return b;
}

/** Flame blocks (drawn upright in their own frame, flickered at runtime). */
export function buildFlame(): VoxelBuilder {
  const b = new VoxelBuilder();
  const T = PALETTE.torch;
  b.box(0, 0.7, 0, 1.35, 1.4, 1.35, T.deep, 'glow');
  b.box(0, 1.15, 0, 1.1, 1.6, 1.1, T.orange, 'glow');
  b.box(0.08, 2.05, 0, 0.75, 1.3, 0.75, T.yellow, 'glow');
  b.box(-0.12, 1.55, 0.07, 0.5, 0.9, 0.5, T.core, 'glow');
  b.box(0.16, 2.95, -0.07, 0.4, 0.65, 0.4, T.yellow, 'glow');
  b.box(-0.2, 2.6, 0.12, 0.28, 0.4, 0.28, T.orange, 'glow');
  return b;
}

/**
 * Brass explorer's flashlight. Origin at the grip (the middle of the fist); the
 * barrel runs through the fist along +Z and the lens looks down +Z. `lens` is
 * the glowing glass, meshed apart so it casts no shadow.
 */
export function buildFlashlight(): { body: VoxelBuilder; lens: VoxelBuilder } {
  const body = new VoxelBuilder();
  const lens = new VoxelBuilder();
  const C = PALETTE.camera;
  // Tail cap sticking out behind the fist, then the brass barrel with dark grip rings.
  body.span(-0.5, -0.5, -2.1, 0.5, 0.5, -1.5, C.dark, 'metal');
  body.box(0, 0, -2.14, 0.56, 0.56, 0.1, C.mid, 'metal');
  const g = body.grid({ cell: [0.9, 0.9, 0.45], origin: [-0.45, -0.45, -1.5], mat: 'brass', jitter: 0.03, ao: 0, seed: 131 });
  g.fill(0, 0, 0, 0, 0, 7, (_i, _j, k) => (k % 3 === 1 ? PALETTE.brassDark : PALETTE.brass));
  g.commit();
  // Flared neck, the wide head and a bright bezel ring round the lens.
  body.span(-0.56, -0.56, 2.1, 0.56, 0.56, 2.5, PALETTE.brassDark, 'brass');
  body.span(-0.72, -0.72, 2.5, 0.72, 0.72, 2.9, PALETTE.brass, 'brass');
  body.span(-0.85, -0.85, 2.9, 0.85, 0.85, 3.9, PALETTE.brass, 'brass');
  for (const [x, y, w, h] of [
    [0, 0.84, 1.84, 0.2],
    [0, -0.84, 1.84, 0.2],
    [0.84, 0, 0.2, 1.84],
    [-0.84, 0, 0.2, 1.84],
  ])
    body.box(x, y, 3.98, w, h, 0.22, C.light, 'metal');
  // Rubber switch on top.
  body.span(-0.22, 0.44, 0.7, 0.22, 0.64, 1.35, PALETTE.red, 'metal', { shade: 0.9 });
  const T = PALETTE.torch;
  lens.box(0, 0, 3.96, 1.44, 1.44, 0.18, 0xfff6e0, 'glow');
  lens.box(0, 0, 4.02, 0.7, 0.7, 0.12, T.core, 'glow');
  return { body, lens };
}

/** The phone's front camera (selfie lens), in the phone's frame (BU). */
export const PHONE_LENS = [0, 3.42, 1.8] as const;

/**
 * Telescopic selfie stick, in three parts posed each frame
 * (AngkorExplorer): `grip`, a rubber handle round the right fist's grip
 * point, along +Y (0 = the fist); `shaft`, the pole, one BU long along +Y
 * (stretched to reach the phone), in three sections, thinner toward the
 * phone; `clamp`, the spring clamp behind the phone that holds it (in the
 * phone's frame: it grips the case from behind, the pole's joint below it).
 */
export function buildSelfieStick(): { grip: VoxelBuilder; shaft: VoxelBuilder; clamp: VoxelBuilder } {
  const C = PALETTE.camera;
  const grip = new VoxelBuilder();
  // Rubber handle: ribbed, a wrist loop hanging from its end, a gold shutter button.
  grip.box(0, -0.6, 0, 0.62, 3.6, 0.62, 0x26282b, 'metal');
  for (const y of [-1.9, -1.2, -0.5, 0.2]) grip.box(0, y, 0, 0.7, 0.18, 0.7, 0x1b1c1e, 'metal');
  grip.box(0, 1.35, 0, 0.5, 0.3, 0.5, C.mid, 'metal');
  grip.box(0, 0.9, 0.36, 0.2, 0.3, 0.12, 0xe0b04a, 'metal');
  grip.box(0, -2.75, -0.2, 0.14, 0.9, 0.14, PALETTE.krama.red, 'metal');
  const shaft = new VoxelBuilder();
  // Three sections (the pole slides out of the handle); each a third of the length, a little thinner.
  const W = [0.38, 0.32, 0.26];
  for (let i = 0; i < 3; i++) {
    shaft.box(0, (i + 0.5) / 3, 0, W[i], 1 / 3 + 0.004, W[i], i === 1 ? C.mid : C.body, 'metal', { shade: 1 - 0.06 * i });
    // (a collar at each joint)
    if (i > 0) shaft.box(0, i / 3, 0, W[i - 1] + 0.1, 0.02, W[i - 1] + 0.1, C.light, 'metal');
  }
  const clamp = new VoxelBuilder();
  // A spring clamp across the back of the case (y ≈ 1), and the ball joint the pole ends in.
  clamp.span(-1.75, 0.55, 0.62, 1.75, 1.45, 0.9, 0x2d2f33, 'metal');
  for (const sx of [-1, 1]) clamp.span(sx * 1.75 - 0.2, 0.55, 0.62, sx * 1.75 + 0.2, 1.45, 1.6, 0x2d2f33, 'metal');
  clamp.box(0, 1.0, 0.35, 0.8, 0.8, 0.5, C.mid, 'metal');
  clamp.box(0, 1.0, 0.0, 0.55, 0.55, 0.4, C.light, 'metal');
  return { grip, shaft, clamp };
}

/** Where the selfie stick's pole ends on the clamp (BU, the phone's frame). */
export const STICK_JOINT = [0, 1.0, -0.1] as const;

/**
 * Smartphone for selfies, in a krama-red case. Origin at the grip (the middle
 * of the right fist, which holds it from behind); it stands up along +Y with
 * the screen facing +Z, toward the explorer's face. The back has the camera
 * bump. `screen` is the glowing display (a camera preview: sky, temple, a
 * face and the shutter), meshed apart so it casts no shadow.
 */
export function buildPhone(): { body: VoxelBuilder; screen: VoxelBuilder } {
  const body = new VoxelBuilder();
  const screen = new VoxelBuilder();
  const K = PALETTE.krama;
  // Case: 6 × 12 blocks of 0.5 × 0.5, the corners rounded off, lighter along the rim.
  const g = body.grid({ cell: [0.5, 0.5, 0.56], origin: [-1.5, -1.9, 1.16], mat: 'metal', jitter: 0.02, ao: 0.12, seed: 141 });
  g.fill(0, 5, 0, 11, 0, 0, (i, j) => (i === 0 || i === 5 || j === 0 || j === 11 ? K.redLight : hash3(i, j, 0, 142) < 0.7 ? K.red : K.red2));
  for (const [i, j] of [[0, 0], [5, 0], [0, 11], [5, 11]]) g.delete(i, j, 0);
  g.commit();
  // Glass front with a dark bezel, and the front camera in the bezel above the screen.
  body.span(-1.32, -1.72, 1.72, 1.32, 3.92, 1.78, 0x16181b, 'lens');
  body.box(PHONE_LENS[0], PHONE_LENS[1], 1.79, 0.34, 0.34, 0.05, PALETTE.camera.glass, 'lens');
  body.box(PHONE_LENS[0] - 0.06, PHONE_LENS[1] + 0.06, 1.815, 0.08, 0.08, 0.02, 0xffffff, 'lens', { shade: 0.8 });
  // Camera bump on the back: two lenses and a flash.
  body.span(-1.25, 2.2, 0.96, -0.05, 3.7, 1.16, K.dark, 'metal');
  for (const y of [3.25, 2.63]) {
    body.box(-0.85, y, 0.9, 0.5, 0.5, 0.12, PALETTE.camera.body, 'metal');
    body.box(-0.85, y, 0.85, 0.3, 0.3, 0.06, PALETTE.camera.glass, 'lens');
  }
  body.box(-0.33, 3.3, 0.92, 0.2, 0.2, 0.06, 0xfff3d6, 'metal', { shade: 1.2 });
  // Side buttons.
  body.box(1.56, 2.5, 1.44, 0.12, 0.8, 0.22, K.dark, 'metal');
  body.box(-1.56, 2.8, 1.44, 0.12, 0.45, 0.22, K.dark, 'metal');

  // Screen (x −1.16‥1.16, y −1.48‥3.14): sky over sandstone, a face, the shutter.
  const z = 1.8;
  const band = (y0: number, y1: number, c: number) => screen.span(-1.16, y0, z - 0.02, 1.16, y1, z + 0.02, c, 'glow');
  band(2.3, 3.14, 0x9ccff0);
  band(1.3, 2.3, 0xc7e3f2);
  band(-0.2, 1.3, 0xe7c898);
  band(-1.48, -0.2, 0xcfa36c);
  screen.span(-0.42, 0.25, z, 0.42, 1.25, z + 0.04, PALETTE.skin.light, 'glow');
  screen.span(-0.5, 1.2, z, 0.5, 1.55, z + 0.04, 0x5a4034, 'glow');
  screen.span(-0.24, -0.08, z, 0.24, 0.26, z + 0.04, 0xd8c4ab, 'glow');
  screen.box(0, -1.08, z + 0.03, 0.46, 0.46, 0.04, 0xffffff, 'glow');
  return { body, screen };
}
