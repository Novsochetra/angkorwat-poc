import { OPENING_FINISH, OPENINGS, pillar } from '../../lib/openings';
import { PieceBuilder } from '../../PieceBuilder';
import { defineKitAsset } from '../../types';

/**
 * §21.2 ① Pillar — the square gallery pillar of Angkor Wat's colonnades as
 * the sheet draws it: a stepped base and a capital that flare a tier at a
 * time, both carved with key spirals and frets, a shaft of stacked drums with
 * a niche panel at its foot and lotus petals under the capital, moss on the
 * ledges. Built at the real slender proportion, not the sheet's squat one.
 * Variants: the round column of the terraces and causeway, and a weathered
 * pillar (chipped, one drum split, mossier).
 */
export default defineKitAsset({
  section: '21.2',
  order: 1,
  name: 'Pillar',
  caption: 'Structural pillar for galleries, halls and pavilions.',
  size: {
    real: '0.5 m square shaft, 3.75 m tall: a 0.5 m base and a 0.56 m capital stepping out to 0.875 m (a 0.625 m seat for the architrave on top); round column ⌀ 0.5 m, 3.75 m',
    sheet: 'about 3 × as tall as wide (a pier two blocks square, six blocks high)',
    note: 'Angkor Wat’s gallery pillars are about 0.5 m square and 3–3.5 m to the capital, 6–7 × their width (SIZES-ARCH §1.6; the outer colonnade measured against monks ≈ 3 m); the sheet’s pillar is a squat pier. Round columns of the causeway and Terrace of Honour are ⌀ 0.5–0.55 m. The shaft is laid in three drums (a 3 m monolith would pass Angkor’s ≈ 1.5 t stones); `height` sets the overall height.',
  },
  variants: [
    { id: 'square', name: 'Gallery pillar' },
    { id: 'round', name: 'Round column' },
    { id: 'weathered', name: 'Weathered pillar' },
  ],
  shots: [
    { view: 'front', label: 'Front' },
    { view: 'side', label: 'Side' },
    { view: 'top', label: 'Top' },
    { view: 'iso', variant: 'round', label: 'Round column' },
    { view: 'iso', variant: 'weathered', label: 'Worn' },
  ],
  ref: { sheet: 'section 21/Codex Image Sep 22, 2026, 12_46_24 PM.png', box: [21, 91, 255, 433] },
  build: ({ variant, seed, height }) => {
    const p = new PieceBuilder();
    const old = variant === 'weathered';
    pillar(p, {
      seed,
      height: height ?? OPENINGS.pillar.height,
      shape: variant === 'round' ? 'round' : 'square',
      finish: old ? OPENING_FINISH.aged : OPENING_FINISH.sheet,
      weathered: old ? 0.8 : 0.15,
      moss: old ? 0.85 : 0.6,
    });
    return p.done();
  },
});
