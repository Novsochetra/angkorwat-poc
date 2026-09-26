import { fragment } from '../../lib/rocks';
import { bloomGrid, FloatLayer, lilyPad, lotusFlower, POND, WATER_DEPTH, waterTile } from '../../lib/water';
import { drop, rain, rimRipples, rippleTexels, waterFx, type RippleSet } from '../../lib/water-fx';
import { PieceBuilder } from '../../PieceBuilder';
import { TEXEL } from '../../shapes';
import { defineKitAsset } from '../../types';

/**
 * ② Ripples — rings spreading over the moat water, as the §17.2 sheet draws
 * them: concentric rings of lighter and darker texels around a point, the
 * outer ones fainter. Built with lib/water-fx.ts on a 4 × 4 m tile of open
 * moat water: the rings are drawn by the effects plane (animated in the game,
 * frozen at the showcase moment in screenshots), which also mirrors what is
 * round the water, and the rings break that reflection up.
 *
 * Variants: a single drop (a pebble or a fish: a big ring set with a smaller
 * one inside it, from the splash falling back), rain (small ring sets all
 * over), rings lapping out from a lily pad, and round a fallen stone, and the
 * drop frozen as voxel texels (the static version, for a baked diorama or a
 * far view, no effects plane).
 */

/** Where the single drop falls (a little right of and in front of the tile's middle, as on the sheet). */
const DROP: [number, number] = [0.25, 0.125];
/** The lily pad: centre (m) and radius (texels) — a 0.4 m pad, the biggest a water lily grows. */
const PAD = { x: -0.375, z: 0.0625, r: 3.2 };
/** The stone: a fallen facing block, lying in the water with its top 0.19 m above the surface. */
const STONE = { x: 0.125, z: -0.25, size: [0.75, 0.5, 0.5] as [number, number, number] };

interface Look {
  ripples: RippleSet;
  /** Sun glints on the tile (rain has none: overcast). */
  glints: number;
  /** Draw the rings as voxel texels instead of the effects plane. */
  frozen?: boolean;
}

const LOOKS: Record<string, Look> = {
  drop: { ripples: { sources: [drop(...DROP)] }, glints: 0.2 },
  rain: { ripples: { rain: rain(3.5) }, glints: 0 },
  lily: {
    ripples: { sources: [rimRipples(PAD.x, PAD.z, PAD.r * TEXEL), rimRipples(0.875, -0.75, 0.125, { amp: 0.35, age: 1.1, every: 2.1 })] },
    glints: 0.15,
  },
  stone: { ripples: { sources: [rimRipples(STONE.x, STONE.z, 0.4, { amp: 0.7, every: 1.3, life: 3.6, age: 2.6 })] }, glints: 0.2 },
  frozen: { ripples: { sources: [drop(...DROP)] }, glints: 0.2, frozen: true },
};

export default defineKitAsset({
  section: '17.2',
  order: 2,
  name: 'Ripples',
  caption: 'Dynamic ripples on water surface.',
  size: {
    real: 'Rings from ≈ 0.1 m out to ≈ 1.5 m radius over ≈ 6 s (the ring band spreads at 0.22–0.4 m/s, the water calm inside a circle growing at 0.18 m/s); crests 0.125–0.3 m apart, 2–4 rings to a set, fading outwards; rain rings 0.1–0.4 m, living 1.5 s. On a 4 × 4 m tile of open moat water (1 m deep).',
    sheet: '≈ 5 even rings ≈ 0.3–0.5 m apart filling the tile, out to its edges (no scale given)',
    note: 'Water waves have a minimum group speed of ≈ 0.18 m/s (at λ ≈ 4 cm, where surface tension and gravity balance): after a drop the water stays calm inside a circle growing at that speed, and outside it a crest r metres out t seconds later has λ = 8π(r/t)²/g (Cauchy–Poisson), so the longer waves lead and the rings crowd towards the calm middle — rings are not evenly spaced as the sheet draws them. SIZES-ARCH’s 0.05–0.15 m wavelets are the inner ones: below two texels (0.125 m) the kit cannot draw them, so the drawn rings are the 0.125–0.3 m outer ones, and raindrops’ real 1–3 cm capillary rings become small texel rings. The sheet’s rings are too many, too even and reach too far for one drop.',
  },
  variants: [
    { id: 'drop', name: 'Single drop' },
    { id: 'rain', name: 'Rain' },
    { id: 'lily', name: 'Round a lily pad' },
    { id: 'stone', name: 'Round a stone' },
    { id: 'frozen', name: 'Frozen (voxel texels)' },
  ],
  shots: [
    { view: 'top', label: 'Top view' },
    { view: 'front', label: 'Front view' },
    { view: 'iso', variant: 'rain', label: 'Rain' },
    { view: 'iso', variant: 'lily', label: 'Round a lily pad' },
    { view: 'iso', variant: 'stone', label: 'Round a stone' },
    { view: 'top', variant: 'frozen', label: 'Frozen (voxel texels)' },
  ],
  ref: { sheet: 'section 17/9CD32C14-908E-487E-9287-BF45055F93A6.PNG', box: [328, 512, 616, 716] },
  build: ({ variant, seed }) => {
    const look = LOOKS[variant] ?? LOOKS.drop;
    const p = new PieceBuilder();
    const s = waterTile(p, { depth: WATER_DEPTH.open, tint: 'moat', bed: 'silt', glints: look.glints, seed });
    if (variant === 'lily') {
      // One big pad with a lotus on it, a small one drifting off to the right.
      const origin: [number, number, number] = [s.x0, s.top, s.z0];
      const pads = new FloatLayer(origin);
      const ci = (PAD.x - s.x0) / TEXEL;
      const ck = (PAD.z - s.z0) / TEXEL;
      lilyPad(pads, ci, ck, PAD.r, 2.2, POND.pad[0]);
      lilyPad(pads, (0.875 - s.x0) / TEXEL, (-0.75 - s.z0) / TEXEL, 2, 4.1, POND.pad[2], { yellow: 0.3 });
      pads.commit(p.voxels);
      const blooms = bloomGrid(p, origin, seed);
      lotusFlower(blooms, Math.round(ci * 2), Math.round(ck * 2), { h: 0, size: 9, seed });
      blooms.commit();
    }
    if (variant === 'stone') fragment(p, { at: [STONE.x, -0.3125, STONE.z], size: STONE.size, seed, moss: 0.5 });
    if (look.frozen) rippleTexels(p, s, look.ripples);
    else waterFx(p, s, { ripples: look.ripples });
    return p.done();
  },
});
