import { guardianLion, type LionOptions } from '../../lib/lion';
import { PieceBuilder } from '../../PieceBuilder';
import { defineKitAsset, type KitPiece } from '../../types';

/**
 * §21.2 ⑪ Lion — "Lion guardian for entrances and terraces": a guardian
 * lion on a two-tier plinth, chest out, mane of curls, mouth open, weathered
 * warm sandstone with moss. Built with the shared {@link guardianLion}: the
 * Angkor Wat lion stands (the sheet's seated lion is the other temples' type,
 * kept as a variant), and pairs mirror each other.
 */
const VARIANTS: Record<string, LionOptions> = {
  standing: { pose: 'standing', side: 'right' },
  left: { pose: 'standing', side: 'left' },
  seated: { pose: 'seated', side: 'right' },
  weathered: { pose: 'standing', side: 'right', finish: 'grey', weather: 1, moss: 0.25 },
};

export default defineKitAsset({
  section: '21.2',
  order: 11,
  name: 'Lion',
  caption: 'Lion guardian for entrances and terraces.',
  size: {
    real: 'lion 1.375 m from its soles to the top of the mane, on a 0.375 m two-tier plinth (1.75 m in all); plinth 0.75 × 1.0 m, top tier 0.625 × 0.875 m; lion 0.47 m across the paws, 0.5 m across the haunches, 0.53 m across the mane',
    sheet: 'no size given; drawn seated, the lion about 1.5 × the plinth width and the plinth a fifth of the height',
    note: "Angkor Wat's lions stand on four legs, chest up, head raised, about the explorer's height on their plinths (photos scaled against stair risers, the naga fan and people; museum Khmer lions 0.8–1.1 m, Bayon-period ones up to 2 m). The sheet's seated lion is the type of other temples: kept as the 'Seated' variant at the same height.",
  },
  variants: [
    { id: 'standing', name: 'Standing (Angkor Wat)' },
    { id: 'left', name: 'Left of a pair' },
    { id: 'seated', name: 'Seated (sheet)' },
    { id: 'weathered', name: 'Weathered' },
  ],
  shots: [
    { view: 'front', label: 'Front' },
    { view: 'side', label: 'Side' },
    { view: 'top', label: 'Top' },
    { view: 'iso', variant: 'left', label: 'Left of a pair' },
    { view: 'iso', variant: 'seated', label: 'Seated (sheet)' },
    { view: 'iso', variant: 'weathered', label: 'Weathered' },
  ],
  ref: { sheet: 'section 21/Codex Image Sep 22, 2026, 12_46_24 PM.png', box: [1031, 443, 1269, 741] },
  build: ({ variant, seed, height }): KitPiece => {
    const p = new PieceBuilder();
    guardianLion(p, { ...(VARIANTS[variant] ?? VARIANTS.standing), seed, height });
    return p.done();
  },
});
