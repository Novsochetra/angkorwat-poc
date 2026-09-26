import { PieceBuilder } from '../../PieceBuilder';
import { spire, spireLayout, TOWER, type SpireOptions } from '../../lib/tower';
import { fromSheet, SANDSTONE } from '../../palette';
import { stoneSurf } from '../../surface';
import { defineKitAsset } from '../../types';

/**
 * ⑫ Tower tier — the stepped, redented tiers of Angkor Wat's prasat towers,
 * as the §21.2 sheet draws them: a bulging cone of warm sandstone courses on
 * a cross plan (the sheet's top view), every ledge lined with small blocks.
 * Real tiers are miniatures of the tower's storey — a body with a false door
 * on each axis under a corbelled cornice, antefixes along the ledge (a small
 * pediment on the axis, stepped mini-shrines on the redent corners) — and the
 * spire ends in three rows of lotus petals and the bud (Glaize). Built with
 * lib/tower.ts. The main render is a corner tower's whole spire (the
 * sheet's picture); the stackable sections are the central tower's — tiers
 * 1–2, tiers 3–4, tier 5 with the crown — and one tier on its own.
 */
type Pick = { tower: keyof typeof TOWER; from: number; to?: number; look?: Partial<SpireOptions> };

/**
 * The sheet's second opinion (the §21 overview) and the §06 towers: grey-tan
 * stone gone olive with moss (the temple's mossy and weathered tones, lit
 * #9d7b4f sampled off the overview's tower), cushions of moss and grass on
 * every ledge, chipped and cracked stones, the odd one fallen out.
 */
const WEATHERED: Partial<SpireOptions> = {
  finish: {
    palette: [...SANDSTONE.mossy, SANDSTONE.weathered[4], SANDSTONE.cracked[3], fromSheet(0x9d7b4f)],
    surf: stoneSurf({ stain: 0.35, moss: 0.15, lichen: 0.15 }),
    wear: 0,
  },
  moss: 0.3,
  overgrowth: 0.55,
  damage: 0.6,
};

const VARIANTS: Record<string, Pick> = {
  spire: { tower: 'corner', from: 0 },
  base: { tower: 'central', from: 0, to: 2 },
  mid: { tower: 'central', from: 2, to: 4 },
  top: { tower: 'central', from: 4 },
  single: { tower: 'central', from: 0, to: 1 },
  central: { tower: 'central', from: 0 },
  weathered: { tower: 'corner', from: 0, look: WEATHERED },
};

export default defineKitAsset({
  section: '21.2',
  order: 12,
  name: 'Tower tier',
  caption: 'Tower tier for temple spires and central towers.',
  size: {
    real: 'Corner spire 10 m wide (lowest cornice) × 17.25 m; central spire 13.5 × 23 m. Central tiers: 1–2 are 13.5 m wide × 6.75 m (tier 1: 12.375 m body, 3.5 m tall), 3–4 are 11.375 m × 6 m, tier 5 + crown 7.875 m × 10.25 m (3 lotus-petal rows 2 / 1.5 / 1.25 m, bud 2.375 m wide × 2.75 m). Antefixes ≈ 0.6–1.2 m tall.',
    sheet: '≈ 4–5 m wide pyramid of ≈ 8 block courses (no scale given)',
    note: 'Measured on photos of the five towers, scaled by the ≈ 54 m between the corner towers and checked against the central tower’s 42 m above the Bakan: the central spire is ≈ 13.5 m wide at its lowest cornice and ≈ 23 m from the body’s cornice to the tip, in 5 tiers of 3.5 → 2.75 m, 3 lotus-petal rows of 2 → 1.25 m and a bud; the corner spires ≈ 0.75 × that. So the research table’s 18–19 m base and 4–5 m tiers are too big. The sheet draws one small pyramid; real tiers are storeys with false doors, cornices and antefixes about 1 m tall.',
  },
  variants: [
    { id: 'spire', name: 'Corner spire' },
    { id: 'base', name: 'Base tiers (1–2)' },
    { id: 'mid', name: 'Mid tiers (3–4)' },
    { id: 'top', name: 'Top tier + crown' },
    { id: 'single', name: 'Single tier' },
    { id: 'central', name: 'Central spire' },
    { id: 'weathered', name: 'Weathered spire' },
  ],
  shots: [
    { view: 'front', label: 'Front' },
    { view: 'side', label: 'Side' },
    { view: 'top', label: 'Top' },
    { view: 'iso', variant: 'base', label: 'Base tiers' },
    { view: 'iso', variant: 'mid', label: 'Mid tiers' },
    { view: 'iso', variant: 'top', label: 'Top + crown' },
    { view: 'iso', variant: 'weathered', label: 'Weathered' },
  ],
  ref: { sheet: 'section 21/Codex Image Sep 22, 2026, 12_46_24 PM.png', box: [1284, 443, 1516, 741] },
  build: ({ variant, seed, height }) => {
    const v = VARIANTS[variant] ?? VARIANTS.spire;
    const t = TOWER[v.tower];
    const o: SpireOptions = { ...t, ...v.look, seed, from: v.from, to: v.to };
    if (height) {
      // `height` sizes what the variant shows (a tier, or tier + crown, or the spire); the rest scales with it.
      const lay = spireLayout(o);
      const shown = (v.to !== undefined ? lay.parts[v.to].y : lay.top) - lay.parts[v.from].y;
      const k = height / shown;
      o.width = t.width * k;
      o.height = t.height * k;
    }
    const p = new PieceBuilder();
    spire(p, o);
    return p.done();
  },
});
