import { Vector3, type Group } from 'three';
import { VoxelBuilder } from '../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../voxel/VoxelMesh';
import type { AngkorExplorer } from './AngkorExplorer';
import { ARM_CENTER_X, JOINTS } from './skeleton';

/**
 * The red string (អំបោះក្រហម): a thin cord of red cotton a monk ties round the
 * explorer's right wrist when he blesses him (the map's roam/_blessing.ts). It
 * goes round the forearm just above the hand (parts/limbs.ts: the forearm a
 * 2 BU block from y 12 to 14, the hand from 12.3 down), a knot on the outside
 * of the wrist with its two short ends hanging. On the forearm's joint
 * (`elbowR`): it turns with the arm, not with the hand, so whatever the hand
 * holds (the umbrella's handle, a skewer, the phone, a flat hand for the
 * sampeah) it stays where it is, clear of the fist.
 *
 * Stages, for the tying (roam/_blessing.ts): 0 the cord laid under the
 * wrist, 1 round it, 2 knotted (worn from then on). One rig slot
 * (`redString`), its three meshes built the first time each is shown, reused.
 */

/** Its colours: red cotton, the knot's tighter weave a shade darker. */
const RED = 0xc8202a;
const KNOT = 0x9c141c;

/** The slot it rides in. */
export const RED_STRING_SLOT = 'redString';

/** The cord's middle height on the forearm, its height and thickness (BU). */
const Y = 12.62;
const H = 0.36;
const T = 0.25;
/** The forearm's half width (BU): the cord just outside it. */
const HALF = 1.0;

/** The red string at `stage` (0 under the wrist, 1 round it, 2 knotted), in character space (the right forearm). */
export function buildRedString(stage: 0 | 1 | 2): VoxelBuilder {
  const b = new VoxelBuilder();
  const x = -ARM_CENTER_X;
  const r = HALF + T / 2;
  // (under the wrist: the cord's middle, laid across it; then round it)
  b.box(x, Y, -r, 2 * HALF + 2 * T, H, T, RED, 'shirt');
  if (stage >= 1) {
    b.box(x, Y, r, 2 * HALF + 2 * T, H, T, RED, 'shirt');
    b.box(x + r, Y, 0, T, H, 2 * HALF, RED, 'shirt');
    b.box(x - r, Y, 0, T, H, 2 * HALF, RED, 'shirt');
  } else {
    // (its two ends coming up either side, toward the monk's fingers)
    b.box(x + r, Y + 0.5, -r + 0.2, T, 1.0, T, RED, 'shirt');
    b.box(x - r, Y + 0.5, -r + 0.2, T, 1.0, T, RED, 'shirt');
  }
  if (stage >= 2) {
    // The knot on the outside of the wrist (his right: −x), its two ends hanging.
    b.box(x - r - 0.12, Y + 0.02, 0.15, 0.36, 0.42, 0.42, KNOT, 'shirt');
    b.box(x - r - 0.16, Y - 0.42, 0.32, 0.14, 0.62, 0.14, RED, 'shirt');
    b.box(x - r - 0.1, Y - 0.36, -0.05, 0.14, 0.5, 0.14, RED, 'shirt');
  }
  return b;
}

/** Each explorer's three meshes (built when first shown) and the stage on him now (−1: none). */
const WORN = new WeakMap<AngkorExplorer, { meshes: (Group | null)[]; stage: number }>();

/** Put the red string on his right wrist at `stage`, or take it off (null). Cheap when nothing changes. */
export function wearRedString(explorer: AngkorExplorer, stage: 0 | 1 | 2 | null): void {
  let w = WORN.get(explorer);
  if (!w) WORN.set(explorer, (w = { meshes: [null, null, null], stage: -1 }));
  const want = stage ?? -1;
  if (want === w.stage) return;
  w.stage = want;
  const rig = explorer.rig;
  if (stage === null) {
    rig.clearSlot(RED_STRING_SLOT);
    return;
  }
  const pivot = JOINTS.elbowR.pivot;
  const mesh = (w.meshes[stage] ??= buildVoxelMesh(buildRedString(stage), { quality: rig.quality, offset: new Vector3(pivot[0], pivot[1], pivot[2]), castShadow: false, name: `redString:${stage}` }));
  rig.setSlotObject(RED_STRING_SLOT, 'elbowR', mesh);
}

/** The stage of the red string on him now (−1: none). */
export function redStringStage(explorer: AngkorExplorer): number {
  return WORN.get(explorer)?.stage ?? -1;
}
