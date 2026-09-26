import { lilies, WATER_DEPTH, waterTile, type WaterTintName } from '../../lib/water';
import { PieceBuilder } from '../../PieceBuilder';
import { defineKitAsset, type KitRef } from '../../types';

/**
 * ① Water surface — a 4 × 4 m tile of calm moat water, as on the §17.1
 * sheets: a slab of translucent teal-blue whose top is a mosaic of soft light
 * and dark squares, a patch of gold sun glints in the back, the bed's olive
 * silt faintly through it and a band of bed blocks along its foot. Variants:
 * sheet A's sunlit tile (white glint streaks), sheet B's tile with lily pads,
 * and sheet B's five water colours (clear, blue, green, dark, muddy — each
 * with the pads that tile shows).
 *
 * The surface is at y = 0; 1 m of water (open moat water) over a silt bed.
 */
const SHEET_B = 'section 17/B65034CE-0DD5-499B-B913-792827EFB323.PNG';
const colourRef = (x0: number, x1: number): KitRef => ({ sheet: SHEET_B, box: [x0, 540, x1, 690] });

interface Look {
  tint: WaterTintName;
  glints: number;
  /** White sun streaks instead of the moat's gold. */
  white?: boolean;
  /** Lily-pad clusters, open flowers, loose pads. */
  flora?: [number, number, number];
}

const LOOKS: Record<string, Look> = {
  calm: { tint: 'moat', glints: 0.35 },
  sunlit: { tint: 'moat', glints: 1, white: true },
  lilies: { tint: 'moat', glints: 0.15, flora: [4, 2, 2] },
  clear: { tint: 'clear', glints: 0.2, flora: [4, 3, 2] },
  blue: { tint: 'blue', glints: 0.2, flora: [4, 1, 3] },
  green: { tint: 'green', glints: 0.1, flora: [4, 1, 3] },
  dark: { tint: 'dark', glints: 0.15, flora: [3, 0, 3] },
  muddy: { tint: 'muddy', glints: 0.1, flora: [3, 1, 1] },
};

export default defineKitAsset({
  section: '17.1',
  order: 1,
  name: 'Water surface',
  caption: 'Calm water surface with subtle waves.',
  size: {
    real: '4 × 4 m tile, surface at y = 0, 1.0 m of water over a 0.25 m silt bed (1.25 m tall)',
    sheet: 'not given (a thin slab, ≈ 4 m by its mosaic of 1/4 m water cells)',
    note: 'SIZES-ARCH §1.15: the moat holds 1–1.5 m of water on average, 2.5 m below the bank top. The open-water tile takes 1.0 m, between the shallow margins (0.5 m) and the deep middle (1.5 m), so the three tiles share the surface and their beds step down 0.5 m towards the middle.',
  },
  variants: [
    { id: 'calm', name: 'Calm' },
    { id: 'sunlit', name: 'Sun glints' },
    { id: 'lilies', name: 'Lily pads', ref: { sheet: SHEET_B, box: [20, 138, 257, 482] } },
    { id: 'clear', name: 'Clear', ref: colourRef(26, 162) },
    { id: 'blue', name: 'Blue', ref: colourRef(158, 294) },
    { id: 'green', name: 'Green', ref: colourRef(290, 426) },
    { id: 'dark', name: 'Dark', ref: colourRef(422, 558) },
    { id: 'muddy', name: 'Muddy', ref: colourRef(555, 691) },
  ],
  shots: [
    { view: 'top', label: 'Top view' },
    { view: 'iso', variant: 'sunlit', label: 'Sun glints' },
    { view: 'iso', variant: 'clear', label: 'Clear' },
    { view: 'iso', variant: 'green', label: 'Green' },
    { view: 'iso', variant: 'muddy', label: 'Muddy' },
  ],
  ref: { sheet: 'section 17/9CD32C14-908E-487E-9287-BF45055F93A6.PNG', box: [20, 136, 257, 456] },
  build: ({ variant, seed, height }) => {
    const look = LOOKS[variant] ?? LOOKS.calm;
    const p = new PieceBuilder();
    const s = waterTile(p, { depth: height ?? WATER_DEPTH.open, tint: look.tint, bed: 'silt', glints: look.glints, glint: look.white ? 0xfbf8ec : undefined, seed });
    if (look.flora) lilies(p, s, { seed, clusters: look.flora[0], flowers: look.flora[1], pads: look.flora[2] });
    return p.done();
  },
});
