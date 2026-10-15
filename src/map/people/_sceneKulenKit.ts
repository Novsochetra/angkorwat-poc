import { hash3 } from '../../voxel/random';
import { round } from '../veg/plantKit';
import { bananaHand, mangoLying, smallRounds } from '../veg/produce';
import { dress, shade, type DressOptions } from './_kinds';
import { kitInRig } from './_kitRig';
import { FEAT, type Look } from './_personModel';
import { RigDef } from './_things';

/**
 * The things of Kulen's people (`_sceneKulen.ts`), as rigs of the people's
 * things (`_things.ts`: one InstancedMesh for all, written only when they
 * move): a hammock with someone in it (it swings: its cloth is a part
 * turning about the line between its ends), a family's food on the mat, a
 * moto, the stalls' goods and the grill's fire (they come out with the
 * sellers and go home with them); and the looks: pilgrims (elders in
 * white, "yeay chi" nuns, families in their best, lotus and incense in
 * their hands), picnic families, their children.
 *
 * Rig space: feet on y = 0, +z its front, +x its left (like the people).
 */

// ── Rigs ─────────────────────────────────────────────────────────────────────

/**
 * A hammock from x = −half to +half (its ends at y = 0), sagging `sag` in the
 * middle: part 1 is the whole hammock, turning about the x axis (it swings).
 */
export function hammockRig(half: number, sag: number, cloth: number, seed: number): { def: RigDef; swing: number } {
  const d = new RigDef();
  const swing = d.part([0, 0, 0]);
  const n = 9;
  const rope = 0x8a7450;
  const stripe = shade(cloth, 1.25);
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    const x = half - 2 * half * u;
    const y = -sag * 4 * u * (1 - u);
    const tilt = Math.atan((sag * 4 * (1 - 2 * u)) / (2 * half));
    const len = (2 * half) / n / Math.cos(tilt) + 0.03;
    if (u < 0.17 || u > 0.83) d.box([x, y, 0], [len, 0.05, 0.1], rope, { part: swing, rot: [0, 0, tilt] });
    else {
      // (the cloth, widest in the middle, a little curled up at its edges)
      const w = 0.78 - Math.abs(u - 0.5) * 0.7;
      d.box([x, y - 0.03, 0], [len, 0.05, w], k % 3 === 1 ? stripe : cloth, { part: swing, rot: [0, 0, tilt] });
      d.box([x, y + 0.03, w / 2 - 0.02], [len, 0.08, 0.05], cloth, { part: swing, rot: [0, 0, tilt] });
      d.box([x, y + 0.03, -w / 2 + 0.02], [len, 0.08, 0.05], cloth, { part: swing, rot: [0, 0, tilt] });
    }
  }
  void seed;
  return { def: d, swing };
}

/** A family's food on the mat: rice in its pot, plates, grilled chicken, a fish, fruit, sticky rice, drinks. */
export function foodRig(seed: number): RigDef {
  const d = new RigDef();
  const r = (k: number) => hash3(k, 3, 7, seed);
  // The rice pot (aluminium) with its lid, a bowl of rice by it.
  d.box([-0.45, 0.1, -0.15], [0.3, 0.2, 0.3], 0xb8bcc0).box([-0.45, 0.21, -0.15], [0.32, 0.03, 0.32], 0xc8ccd0);
  d.box([-0.45, 0.06, 0.2], [0.2, 0.1, 0.2], 0xf0ece2).box([-0.45, 0.12, 0.2], [0.15, 0.04, 0.15], 0xfaf8f0);
  // Plates round the middle.
  for (const [x, z] of [
    [0, -0.3],
    [0.35, 0.05],
    [0, 0.4],
    [-0.1, 0.05],
  ])
    d.box([x, 0.02, z], [0.26, 0.03, 0.26], 0xf2efe8);
  // Grilled chicken (golden brown, splayed on its bamboo stick), a grilled fish, papaya salad.
  d.box([0.02, 0.07, -0.3], [0.22, 0.07, 0.18], 0xa0521e).box([0.02, 0.06, -0.14], [0.03, 0.03, 0.4], 0xc8a870);
  d.box([0.35, 0.06, 0.05], [0.28, 0.06, 0.1], 0x8a6a3a).box([0.5, 0.06, 0.05], [0.06, 0.08, 0.12], 0x7a5a30);
  d.box([0, 0.06, 0.4], [0.18, 0.06, 0.18], 0xd89a4a).box([0.03, 0.09, 0.38], [0.1, 0.03, 0.1], 0x7aa040);
  // Sticky rice in its little woven basket, a pile of fruit: mangoes, lychee, rambutan.
  d.box([0.5, 0.1, -0.35], [0.16, 0.2, 0.16], 0xc8a060).box([0.5, 0.21, -0.35], [0.12, 0.04, 0.12], 0xe8dcc0);
  // (the plant kit's shapes, the cheap ones: veg/produce.ts, _kitRig.ts)
  kitInRig(d, (b) => {
    mangoLying(b, [-0.1, 0.04, 0.62], 1.3, { len: 0.16, wid: 0.1, color: 0xf0b030, blush: 0xd8603a });
    mangoLying(b, [0.08, 0.04, 0.64], 1.9, { len: 0.15, wid: 0.1, color: 0xe8a828 });
    smallRounds(b, [-0.24, 0.01, 0.64], 4, 0.06, 0.06, [0xc8303a, 0xb82a30], 0.4);
    smallRounds(b, [0.38, 0.01, 0.62], 3, 0.08, 0.08, [0xd8402a], 2.1, 0x6a9a3a);
  });
  // Drinks: cans and a bottle of water.
  d.box([0.55, 0.08, 0.35], [0.07, 0.14, 0.07], r(1) < 0.5 ? 0xd83a2e : 0x2a6ac8).box([0.64, 0.08, 0.42], [0.07, 0.14, 0.07], 0xe8c02a);
  d.box([-0.62, 0.13, 0.45], [0.09, 0.26, 0.09], 0xcfe6f0);
  return d;
}

/** A moto (a small step-through scooter), along its z: wheels, the body, the seat, the handlebar, a helmet on the mirror. */
export function motoRig(color: number): RigDef {
  const d = new RigDef();
  for (const z of [-0.62, 0.62]) {
    d.box([0, 0.32, z], [0.12, 0.62, 0.62], 0x222222);
    d.box([0, 0.32, z], [0.12, 0.44, 0.44], 0x2a2a2a, { rot: [Math.PI / 4, 0, 0] });
    d.box([0, 0.32, z], [0.14, 0.14, 0.14], 0xb8b8b4);
  }
  d.box([0, 0.55, -0.1], [0.34, 0.3, 1.0], color);
  d.box([0, 0.8, -0.3], [0.34, 0.14, 0.62], 0x2a2a2a);
  d.box([0, 0.7, 0.5], [0.3, 0.55, 0.2], color, { rot: [-0.3, 0, 0] });
  d.box([0, 1.08, 0.62], [0.7, 0.07, 0.08], 0x333333);
  d.box([0, 0.98, 0.68], [0.16, 0.14, 0.1], 0xf0ecd8);
  d.box([0.3, 1.14, 0.6], [0.24, 0.2, 0.24], color === 0x2a2a2a ? 0xd84a3a : 0xf2f0ea);
  return d;
}

/**
 * The food stall's goods (its space, `_knStall.ts`: the counter's middle at
 * (0, top, 0.85), the grill at `grill`): fruit piled on the counter, bottles,
 * a jar of sweets; on the grill the embers (glowing) and chicken and fish on
 * their bamboo sticks.
 */
export function stallGoodsRig(counter: { z: number; top: number }, grill: { x: number; z: number; top: number; len: number }): RigDef {
  const d = new RigDef();
  const y = counter.top;
  const z = counter.z;
  // Lychee (red) and rambutan (red with green hair) on their trays, mangoes, a hand of bananas, pomelos: the plant
  // kit's shapes (veg/produce.ts), as rig boxes (_kitRig.ts).
  d.box([-1.18, y + 0.02, z], [0.5, 0.04, 0.34], 0xb89050);
  d.box([-0.62, y + 0.02, z], [0.48, 0.04, 0.34], 0xb89050);
  kitInRig(d, (b) => {
    smallRounds(b, [-1.14, y + 0.04, z], 7, 0.15, 0.09, [0xc02a34, 0xb02430, 0xc8343a], 1.3);
    smallRounds(b, [-0.6, y + 0.04, z], 6, 0.14, 0.1, [0xd8402a, 0xc83424], 0.7, 0x6a9a3a);
    for (let k = 0; k < 4; k++) mangoLying(b, [0.02 + k * 0.12, y + 0.04, z + (k % 2) * 0.05 - 0.02], 0.25 + k * 0.6, { len: 0.17, wid: 0.11, color: k === 1 ? 0xe8c040 : 0xf0b030, blush: k % 2 ? undefined : 0xd8603a, roll: (k - 1.5) * 0.12 });
    bananaHand(b, [0.48, y + 0.03, z - 0.05], 0.3 + Math.PI / 2, { fingers: 5, len: 0.2, thick: 0.045, color: 0xe8d040 });
    for (const [px, pz, c] of [
      [0.98, z + 0.05, 0x9ac050],
      [1.2, z - 0.06, 0xa8c858],
    ]) round(b, [px, y, pz], { wid: 0.21, hgt: 0.19, color: c, ribs: false, cap: 0x8aa848, ry: px });
  });
  // Bottles of water and cans of drink at the counter's end, a jar of sweets.
  for (let k = 0; k < 4; k++) d.box([1.32, y + 0.14, z - 0.2 + k * 0.12], [0.09, 0.28, 0.09], k % 2 ? 0xcfe6f0 : 0xe86a2a);
  d.box([-1.4, y + 0.13, z + 0.12], [0.18, 0.26, 0.18], 0xdde8e8).box([-1.4, y + 0.12, z + 0.12], [0.14, 0.18, 0.14], 0xe89ab0);
  // The grill: glowing embers along it, chicken splayed on sticks, two fish.
  const gy = grill.top;
  for (let k = 0; k < 4; k++) d.box([grill.x, gy - 0.06, grill.z - grill.len / 2 + 0.18 + k * ((grill.len - 0.36) / 3)], [0.34, 0.04, 0.24], 0xff5a1c, { glow: 1 });
  for (let k = 0; k < 3; k++) {
    const zz = grill.z - grill.len / 2 + 0.25 + k * 0.28;
    d.box([grill.x, gy + 0.06, zz], [0.26, 0.06, 0.2], k === 1 ? 0x9a4a1a : 0xa8561e).box([grill.x + 0.25, gy + 0.05, zz], [0.36, 0.025, 0.025], 0xc8a870);
  }
  d.box([grill.x, gy + 0.05, grill.z + grill.len / 2 - 0.2], [0.3, 0.05, 0.1], 0x6a5a3a).box([grill.x - 0.14, gy + 0.05, grill.z + grill.len / 2 - 0.2], [0.05, 0.07, 0.12], 0x5a4a30);
  return d;
}

/** The drinks stall's goods: cups of cane juice, a bag of ice, bottles, a bunch of cane in the cart. */
export function drinkGoodsRig(): RigDef {
  const d = new RigDef();
  // (on the cart's top, by the press)
  for (let k = 0; k < 4; k++) d.box([1.6 + (k % 2) * 0.13, 1.13, -0.35 + Math.floor(k / 2) * 0.14], [0.1, 0.18, 0.1], 0xd8e098);
  d.box([1.75, 1.15, 0.05], [0.3, 0.22, 0.26], 0xeef6fa);
  // (on the table)
  for (let k = 0; k < 3; k++) d.box([-1.45 + k * 0.14, 1.03, 0.25], [0.09, 0.28, 0.09], 0xcfe6f0);
  d.box([-0.62, 0.97, 0.25], [0.3, 0.14, 0.2], 0xe8c02a);
  return d;
}

// ── Looks ────────────────────────────────────────────────────────────────────

/**
 * A pilgrim (`_kinds.ts` `pilgrim`): `elder` in white with the sash, a
 * `yeaychi` (an old lay nun: head and eyebrows shaved, all in white), or a
 * family in their `best`; each with lotus buds and incense sticks
 * (`FEAT.offering`: raised between the palms as they kneel and bow).
 */
export function pilgrimLook(seed: number, style: 'elder' | 'yeaychi' | 'best', opts: DressOptions = {}): Look {
  return dress('pilgrim', seed, { ...opts, pilgrim: style, props: [...(opts.props ?? []), FEAT.offering] });
}

/**
 * A picnicker: the villagers' look in their weekend clothes (a T-shirt or a
 * blouse, a sarong or trousers, a krama; a palm-leaf hat for the sun now and then).
 */
export function picnicLook(seed: number, opts: DressOptions = {}): Look {
  return dress('villager', seed, opts);
}

/** A child at the picnic (the people's kid kind: a bright T-shirt or the school uniform, barefoot). */
export function kidLook(seed: number): Look {
  return dress('kid', seed, {});
}

// ── Fitting people to things ─────────────────────────────────────────────────

/**
 * Where someone's feet go to sit on a low stool at (x, z) facing `yaw`
 * (`POSE.stool`, `POSE.eat`): the hips over the seat, the feet a thigh's
 * length ahead of it (model: ≈ 0.26 m, times the person's drawn size).
 */
export function onStool(scale: number, x: number, z: number, yaw: number): { x: number; z: number } {
  const ahead = 0.26 * scale;
  return { x: x + Math.sin(yaw) * ahead, z: z + Math.cos(yaw) * ahead };
}
