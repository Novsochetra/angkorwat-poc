import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { plantJungle, ROW, SINGLE, STACK, type Busy, type JunglePlan } from '../assets/18.1/_jungle';
import { LITTER_MIX, scatterLeaves } from '../lib/leaves';
import { placePiece } from '../place';
import { defineKitScene } from '../scene';
import type { KitCollider } from '../types';
import { forestFloor, PATH_TOP, pavedPath, ruinedShrine, towerStub } from './_jungle-scene';

/**
 * §18.1 Environment examples · "Dense jungle vegetation": a small sandstone
 * sanctuary on its terrace, half swallowed by the forest. A giant with
 * buttress roots (§18.1 ①) stands at its right shoulder, its crown over the
 * roof; tall trunks and a palm (the §18.1 ⑥ cluster's jungle edge) and a
 * broken tower recede into the dark on the right; round-crowned young trees,
 * bushes, ferns and fallen blocks (§20) fill the front, and a strip of old
 * paving strewn with leaves runs along the foot of the panel. The canopy's
 * gaps let the warm light through in patches, onto a floor that is grassy
 * there and dark humus under the crowns.
 */

/** The tallest trees round the ruin (m): the plan's heights are shares of it. */
const SCENE_H = 21;
const HERO: [number, number] = [1.75, -4.25];
const SHRINE: [number, number] = [-9.25, -1.25];
const TOWER: [number, number] = [5.5, -10.0];
/** The §18.1 ⑥ cluster's jungle-edge strip, turned to face the ruin: the tall trunks on the right. */
const EDGE = { x: 11.5, z: -2.5, turn: 3 };

/** The jungle around the ruin, as a cluster plan (heights are shares of SCENE_H). */
const PLAN: JunglePlan = {
  w: 30,
  d: 24,
  trees: [
    // Behind the sanctuary, over its roof: the forest closes in.
    { x: -12.4, z: -10.2, h: 0.82, w: 0.42, base: 0.58, trunk: 1.3, clumps: 13, roots: 4, reach: 1.5, vines: 4, stones: 0, cell: 0.4375, tint: 'shade' },
    { x: -7.6, z: -11.0, h: 0.7, w: 0.44, base: 0.55, trunk: 1.1, clumps: 12, roots: 4, reach: 1.3, vines: 3, stones: 0, cell: 0.375, tint: 'olive' },
    { x: -14.4, z: -7.6, h: 0.6, w: 0.5, base: 0.5, trunk: 1.0, clumps: 11, roots: 4, reach: 1.2, vines: 2, stones: 0, cell: 0.3125, tint: 'shade' },
    // Young round-crowned trees in the foreground, left and middle.
    { x: -13.6, z: 9.4, h: 0.28, w: 0.8, base: 0.3, trunk: 0.7, clumps: 9, roots: 4, reach: 0.9, vines: 0, stones: 0, cell: 0.3125, tint: 'bright' },
    { x: 2.6, z: 8.8, h: 0.28, w: 0.72, base: 0.34, trunk: 0.8, clumps: 10, roots: 4, reach: 1.0, vines: 1, stones: 0, cell: 0.375, tint: 'sun' },
    // At the left edge, its crown over the end of the terrace.
    { x: -14.2, z: 0.6, h: 0.42, w: 0.66, base: 0.42, trunk: 0.9, clumps: 10, roots: 4, reach: 1.0, vines: 1, stones: 0, cell: 0.375, tint: 'bright' },
    // Young trees along the back, the dark between the trunks.
    { x: -1.4, z: -11.2, h: 0.5, w: 0.55, base: 0.34, trunk: 0.8, clumps: 10, roots: 3, reach: 0.9, vines: 1, stones: 0, cell: 0.3125, tint: 'shade' },
    { x: 11.0, z: -11.2, h: 0.46, w: 0.58, base: 0.32, trunk: 0.7, clumps: 9, roots: 3, reach: 0.8, vines: 1, stones: 0, cell: 0.375, tint: 'shade' },
    { x: -4.2, z: -9.9, h: 0.34, w: 0.62, base: 0.28, trunk: 0.6, clumps: 8, roots: 3, reach: 0.8, vines: 0, stones: 0, cell: 0.4375, tint: 'shade' },
    { x: 14.0, z: -11.0, h: 0.4, w: 0.6, base: 0.3, trunk: 0.6, clumps: 8, roots: 3, reach: 0.8, vines: 1, stones: 0, cell: 0.3125, tint: 'shade' },
  ],
  palms: [],
  shrubs: [
    { x: -4.6, z: 3.6, h: 1.5, w: 2.4 },
    { x: -12.0, z: 1.7, h: 1.8, w: 2.4 },
    { x: 4.4, z: 3.2, h: 2.4, w: 3.0 },
    { x: -1.4, z: 9.0, h: 1.5, w: 2.2 },
    { x: -14.3, z: -4.2, h: 2.6, w: 2.6 },
    { x: 6.8, z: -5.4, h: 2.4, w: 2.8 },
    { x: -5.4, z: -8.2, h: 2.2, w: 2.8 },
    { x: -2.6, z: 2.8, h: 1.4, w: 2.0 },
    { x: 6.4, z: 1.0, h: 2.0, w: 2.6 },
    { x: -10.6, z: 4.4, h: 1.3, w: 2.0 },
    { x: 9.4, z: 9.4, h: 1.4, w: 2.2 },
    { x: -12.6, z: 7.4, h: 1.8, w: 2.6 },
    { x: -6.2, z: 9.8, h: 1.6, w: 2.4 },
    { x: 0.6, z: 6.4, h: 1.8, w: 2.4 },
  ],
  bushes: [
    { x: -7.2, z: 5.8, h: 1.6, variant: 'bush', turn: 0 },
    { x: 11.2, z: 7.4, h: 1.4, variant: 'shrub', turn: 3 },
    { x: -0.6, z: 5.2, h: 1.2, variant: 'shrub', turn: 1 },
  ],
  heaps: [
    // Old fallen blocks along the path and by the steps.
    { x: 5.8, z: 7.2, blocks: ROW },
    { x: -9.8, z: 9.0, blocks: SINGLE },
    { x: 7.6, z: -2.4, blocks: STACK },
  ],
  ferns: 70,
  tufts: 60,
  edges: 0.2,
};

export default defineKitScene({
  name: 'Dense jungle',
  caption: 'A small sanctuary half swallowed by the jungle: a giant’s buttress roots at its shoulder, tall trunks, ferns, bushes and fallen blocks in patchy late light.',
  source: '18.1 Trees · Environment examples · Dense jungle vegetation',
  size: [30, 24],
  camera: { az: 8, el: 9, dist: 27, target: [-4.5, 6, -1] },
  spawn: { x: -8.6, z: 11.2, yaw: 180 },
  async build(ctx, p) {
    const target = { voxels: p.voxels, collider: (c: KitCollider) => p.colliders.push(c) };
    const busy: Busy = [];
    const [tx0, tz0, tx1, tz1] = ruinedShrine(p, { x: SHRINE[0], z: SHRINE[1], seed: 11 });
    for (let x = tx0 + 0.75; x < tx1; x += 1.5) for (let z = tz0 + 0.75; z < tz1; z += 1.5) busy.push([x, z, 1.0]);
    towerStub(p, { x: TOWER[0], z: TOWER[1], seed: 23, height: 6.5 });
    busy.push([TOWER[0], TOWER[1], 2.6]);
    pavedPath(p, { x0: -2, x1: 15, z: 10.625, w: 2.25, seed: 31 });
    for (let x = -1; x < 15; x += 1.5) busy.push([x, 10.625, 1.1]);

    // The jungle cluster's edge strip along the right, its own patch of ground
    // left out (it stands on the scene's floor), facing the ruin.
    const edge = await ctx.get('18.1/jungle-cluster', { variant: 'edge', seed: 1 });
    if (edge) {
      const voxels = new VoxelBuilder();
      voxels.boxes.push(...edge.voxels.boxes.filter((b) => b.mat !== 'soil' || b.y > 0));
      placePiece(target, { voxels, colliders: edge.colliders.filter((c) => c.max[1] > 0) }, { x: EDGE.x, y: 0, z: EDGE.z, turn: EDGE.turn });
      for (let t = -7; t <= 7; t += 2) busy.push([EDGE.x, EDGE.z + t, 3.4]);
    }
    // The giant at the sanctuary's shoulder.
    const giant = await ctx.get('18.1/large-tree', { seed: 2, height: 18.5 });
    if (giant) {
      placePiece(target, giant, { x: HERO[0], y: 0, z: HERO[1] });
      busy.push([HERO[0], HERO[1], 4.2]);
    }
    // §20 fallen blocks: the blocks of the fallen roof corner heaped below it, column drums by the steps.
    const props: [string, number, number, number, number][] = [
      ['pile', -3.25, 0.625, 0, 1.8],
      ['column', -6.25, 2.25, 1, 1.2],
    ];
    for (const [variant, x, z, turn, r] of props) {
      const piece = await ctx.get('20/fallen-blocks', { variant, seed: 3 });
      if (!piece) continue;
      placePiece(target, piece, { x, y: 0, z, turn });
      busy.push([x, z, r]);
    }
    // Leaf litter blown along the old paving, and drifted at the foot of the steps.
    scatterLeaves(p, { x: 6.5, z: 10.625, w: 16, d: 2, count: 70, seed: 41, palette: LITTER_MIX.fallen, torn: 0.3, ground: PATH_TOP });
    scatterLeaves(p, { x: SHRINE[0], z: SHRINE[1] + 3.0, r: 1.1, count: 18, seed: 43, palette: LITTER_MIX.wet, torn: 0.3 });
    plantJungle(p, PLAN, { seed: 7, height: SCENE_H, vary: false, busy });
    // Last, the floor under it all: dark and mossy under the crowns, grassy in the gaps.
    forestFloor(p, { w: 30, d: 24 });
  },
});
