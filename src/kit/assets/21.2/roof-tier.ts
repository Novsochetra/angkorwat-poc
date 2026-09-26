import { roofTiersPiece, type RoofTierOptions } from '../../lib/roof';
import { STONE_FINISH, stoneSurf, type StoneFinish } from '../../surface';
import { defineKitAsset } from '../../types';

/** The sheet's tiers: warm sandstone greyed with lichen, moss on the tops. */
const TIER_STONE: StoneFinish = { ...STONE_FINISH.warm, surf: stoneSurf({ moss: 0.1, lichen: 0.15, stain: 0.12 }) };

/**
 * ⑥ Roof tier — the stepped roof of the §21.2 sheet: tiers of dressed
 * sandstone, each set back from the one below on a redented, cross-shaped
 * plan (the sheet's top view), the lowest carved with key-pattern panels, the
 * others with a band of false baluster windows, moss on the ledges. Real
 * gopura and pavilion roofs have 3–4 such tiers of 1–1.5 m, antefixes on
 * their corners and a lotus bud on top. Built with lib/roof.ts.
 */
const VARIANTS: Record<string, Omit<RoofTierOptions, 'seed'>> = {
  // As the sheet: four tiers on a 6 m square (a corner pavilion's roof).
  four: { finish: TIER_STONE, width: 6, tiers: 4 },
  // Three tiers on 4.5 m: a porch or small pavilion.
  three: { finish: TIER_STONE, width: 4.5, tiers: 3, height: 1.25, setback: 0.5 },
  // An oblong gopura roof: 8 × 5 m, three tiers.
  gopura: { finish: TIER_STONE, width: 8, depth: 5, tiers: 3 },
  // One tier, to stack.
  single: { finish: TIER_STONE, width: 6, tiers: 1, finial: false },
  // Overgrown: heavy moss and grass on every ledge.
  mossy: { finish: STONE_FINISH.mossy, width: 6, tiers: 4, moss: 0.8, grass: 0.6 },
};

export default defineKitAsset({
  section: '21.2',
  order: 6,
  name: 'Roof tier',
  caption: 'Roof tier for multi-level roofs and towers.',
  size: {
    real: '6 × 6 m base, 4 tiers of 1.5 / 1.375 / 1.25 / 1.125 m, each set back 0.625 m (6 → 2.25 m wide), two redents of 0.75 m at each corner (scaled on the tiers above); antefixes 0.31 × 0.56 m; lotus bud 0.75 m wide: ≈ 6.4 m tall',
    sheet: '≈ 3 m wide, 3.5 m tall (6 blocks, 4 tiers of 1–2 blocks)',
    note: 'Gopura and pavilion roofs at Angkor Wat rise in 3–4 receding tiers of about 1–1.5 m, set back 0.5–0.75 m each, over bodies 6–10 m across (a corner pavilion ≈ 8 m); the sheet’s cube tiers are half that size. Antefixes at the corners and the crowning lotus bud are the real roofs’; the sheet shows neither.',
  },
  variants: [
    { id: 'four', name: 'Four tiers' },
    { id: 'three', name: 'Three tiers' },
    { id: 'gopura', name: 'Oblong (gopura)' },
    { id: 'single', name: 'Single tier' },
    { id: 'mossy', name: 'Overgrown' },
  ],
  shots: [
    { view: 'front', label: 'Front' },
    { view: 'side', label: 'Side' },
    { view: 'top', label: 'Top' },
  ],
  ref: { sheet: 'section 21/Codex Image Sep 22, 2026, 12_46_24 PM.png', box: [1284, 91, 1516, 433] },
  build: ({ variant, seed, height }) => {
    const v = VARIANTS[variant] ?? VARIANTS.four;
    return roofTiersPiece({ ...v, seed, height: height ?? v.height });
  },
});
