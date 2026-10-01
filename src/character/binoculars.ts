import { Vector3 } from 'three';
import { VoxelBuilder } from '../voxel/VoxelBuilder';
import { hash3 } from '../voxel/random';
import { PALETTE } from './palette';

/**
 * The explorer's binoculars (the map's roam/_binoculars.ts raises them to his
 * eyes): a pair of chunky field binoculars in his own blocky style, two
 * olive rubber-armoured barrels (roof prisms: straight tubes) joined by a dark
 * hinge bridge with a ribbed focus wheel on top, black rubber eyecups at the
 * back, a metal rim and deep blue-violet coated glass with a glint at the
 * front, small strap lugs on the outer sides and a brass dot on the bridge.
 *
 * Authored in its own frame, in body units (BU), not in character space:
 * the origin is the middle of the eyecups' back faces, between the barrels
 * at the height of their axes; +z runs out along the barrels (the way he
 * looks), +x is his left, +y up. The barrels sit `EYE_X` either side of the
 * middle, as far apart as his eyes (parts/face.ts), so the eyecups meet them.
 * About 7.3 BU across and 3.6 long: for his big head and hands, as his
 * camera is (parts/gear.ts).
 */

/** Half the distance between the barrels' axes (BU): his eyes' (parts/face.ts `EYE_X`). */
export const BINO_EYE_X = 2.5;
/** Back to front (BU): the eyecups' backs at 0, the front rims here. */
export const BINO_LENGTH = 3.6;
/**
 * Where each fist holds them (BU, the binoculars' frame): round the outer
 * side of each barrel, a little under its axis, towards the back (the hands
 * cradle the barrels, the fingers over the top). L is his left hand (+x).
 */
export const BINO_GRIP = { L: new Vector3(4.15, -0.55, 1.25), R: new Vector3(-4.15, -0.55, 1.25) } as const;

/** Colours: olive rubber armour (a darker band at the front), black eyecups, dark metal, coated glass. */
const C = {
  armour: 0x4b553f,
  armourDark: 0x3f4835,
  armourLight: 0x56614a,
  cup: 0x1d2022,
  cupRim: 0x2a2e31,
  metal: 0x2c2f32,
  hinge: 0x3b3f43,
  wheel: 0x5b5e61,
  wheelRib: 0x34373a,
  rim: PALETTE.camera.plate,
  glass: 0x1f2c48,
  glassDeep: 0x141b2e,
  glint: 0xffffff,
  lug: 0x8b8986,
  strap: PALETTE.leather.strap,
} as const;

/** The binoculars, in their own frame (see above). */
export function buildBinoculars(): VoxelBuilder {
  const b = new VoxelBuilder();
  for (const side of [1, -1] as const) {
    const x = side * BINO_EYE_X;
    // Eyecups: soft black rubber, a little narrower than the barrels, a darker ring at the back.
    b.box(x, 0, 0.32, 1.5, 1.5, 0.64, C.cup, 'leather', { shade: 0.95 });
    b.box(x, 0, 0.05, 1.18, 1.18, 0.1, C.cupRim, 'leather', { shade: 0.9 });
    // The eyepiece tube between the cup and the body.
    b.box(x, 0, 0.82, 1.62, 1.62, 0.4, C.metal, 'metal');
    // The body: rubber armour, a lighter grip band where the fingers go, a darker band at the front.
    b.box(x, 0, 1.75, 2.1, 2.2, 1.5, C.armour, 'leather', { shade: 0.97 + hash3(side, 1, 0, 61) * 0.06 });
    b.box(x, 0, 1.45, 2.16, 2.26, 0.5, C.armourLight, 'leather', { shade: 0.98 });
    b.box(x, 0, 2.85, 2.24, 2.24, 0.7, C.armourDark, 'leather');
    // The front: a metal rim round the coated glass (a square ring of four bars), the glass set back in it, a glint up and to the outside.
    const fz = 3.36;
    const half = 1.06;
    const bar = 0.3;
    b.box(x, half - bar / 2, fz, 2.12, bar, 0.36, C.rim, 'metal');
    b.box(x, -half + bar / 2, fz, 2.12, bar, 0.36, C.rim, 'metal');
    b.box(x + half - bar / 2, 0, fz, bar, 2.12 - 2 * bar, 0.36, C.rim, 'metal');
    b.box(x - half + bar / 2, 0, fz, bar, 2.12 - 2 * bar, 0.36, C.rim, 'metal');
    b.box(x, 0, fz - 0.06, 1.5, 1.5, 0.12, C.glassDeep, 'lens');
    b.box(x, 0, fz + 0.02, 1.3, 1.3, 0.06, C.glass, 'lens');
    b.box(x + side * 0.34, 0.36, fz + 0.06, 0.28, 0.28, 0.03, C.glint, 'lens', { shade: 0.9 });
    // Strap lugs on the outer side, with a stub of the leather strap.
    b.box(side * 3.66, 0.62, 0.95, 0.24, 0.42, 0.42, C.lug, 'metal');
    b.box(side * 3.72, 0.3, 0.95, 0.16, 0.5, 0.3, C.strap, 'leather');
  }
  // The bridge between the barrels and the hinge down its middle.
  b.box(0, 0.34, 1.72, 2.9, 0.86, 2.1, C.metal, 'metal');
  b.box(0, 0.3, 1.72, 0.92, 1.12, 2.6, C.hinge, 'metal');
  // The focus wheel on top of the hinge, near the back: ribbed.
  b.box(0, 0.98, 0.92, 1.0, 0.5, 0.74, C.wheel, 'metal');
  for (const z of [0.68, 0.92, 1.16]) b.box(0, 1.24, z, 1.04, 0.06, 0.1, C.wheelRib, 'metal');
  // A small brass dot on the front of the bridge (the maker's mark).
  b.box(0, 0.42, 2.8, 0.42, 0.32, 0.08, PALETTE.brass, 'brass');
  return b;
}
