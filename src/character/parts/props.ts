import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { hash3 } from '../../voxel/random';
import { PALETTE } from '../palette';

/**
 * Hat, lantern and torch from the "Equipment / Variations" row of the sheet.
 * Lantern and torch are authored in their own local frame (origin = grip point).
 */

/** Hair above this height is trimmed away under the hat crown. */
export const HAT_CLIP_Y = 29.6;

/** Wide-brimmed khaki explorer hat. Head joint. */
export function buildHat(): VoxelBuilder {
  const b = new VoxelBuilder();
  const H = PALETTE.hat;
  const zc = -0.9;
  // Brim: stepped voxel ellipse, curling down slightly at the rim.
  const brim = b.grid({ cell: [1, 0.7, 1], origin: [-10.5, 28.9, zc - 10.5], mat: 'hat', jitter: 0.05, ao: 0.2, seed: 111 });
  for (let i = 0; i < 21; i++)
    for (let k = 0; k < 21; k++) {
      const x = i - 10;
      const z = k - 10;
      const r = Math.hypot(x / 9.7, z / 10.0);
      if (r > 1) continue;
      brim.set(i, 0, k, r > 0.82 ? H.light : hash3(i, 0, k, 3) < 0.6 ? H.base : H.shade);
    }
  brim.commit();
  // Rim lip one step lower at the edge (gives the brim a soft downward curl).
  for (let i = 0; i < 21; i++)
    for (let k = 0; k < 21; k++) {
      const r = Math.hypot((i - 10) / 9.7, (k - 10) / 10.0);
      if (r > 0.9 && r <= 1.0 && hash3(i, 1, k, 4) < 0.55) b.box(i - 10, 28.74, zc + k - 10, 0.98, 0.32, 0.98, H.shade, 'hat', { shade: 0.9 });
    }
  // Crown: band row + three tapering rows with a centre crease on top.
  const crown = b.grid({ cell: 1, origin: [-7.5, 29.6, zc - 7.5], mat: 'hat', jitter: 0.05, ao: 0.28, seed: 113 });
  const rows = [
    { rx: 6.6, rz: 7.0, band: true },
    { rx: 6.4, rz: 6.8, band: false },
    { rx: 6.0, rz: 6.4, band: false },
    { rx: 5.2, rz: 5.6, band: false },
  ];
  rows.forEach((row, j) => {
    for (let i = 0; i < 15; i++)
      for (let k = 0; k < 15; k++) {
        const x = i - 7;
        const z = k - 7;
        if ((x / row.rx) ** 2 + (z / row.rz) ** 2 > 1) continue;
        if (j === 3 && Math.abs(x) <= 1 && Math.abs(z) <= 3) continue; // pinch
        crown.set(i, j, k, row.band ? H.band : hash3(i, j, k, 5) < 0.6 ? H.base : H.light);
      }
  });
  crown.commit();
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
