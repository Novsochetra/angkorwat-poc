import { STAIR, stairPiece, type StairOptions } from '../../lib/stair';
import { STONE_FINISH, stoneSurf, type StoneFinish } from '../../surface';
import { defineKitAsset } from '../../types';

/** The sheet's stair: warm sandstone, a little moss and lichen on every stone. */
const STAIR_STONE: StoneFinish = { ...STONE_FINISH.warm, surf: stoneSurf({ moss: 0.2, lichen: 0.12, stain: 0.1 }) };

/**
 * ④ Stair — the stair module of the §21.2 sheet: broad steps of dressed
 * sandstone between cheek walls that step down with the flight, moss on the
 * ledges. The sheet draws one-block (0.5 m) risers; Angkor's stairs have
 * 0.25 m risers (0.3125 m on the Bakan), so the flight has twice the steps
 * the sheet shows, each within the explorer's 0.42 m step-up and with its own
 * collider. Built with lib/stair.ts.
 */
const VARIANTS: Record<string, Omit<StairOptions, 'seed'>> = {
  // The avenue / causeway-terrace stair: 6 × 0.25 m up to 1.5 m, cheek tiers of two steps.
  ordinary: { finish: STAIR_STONE, ...STAIR.ordinary, height: 1.5, width: 3, cheek: 0.75, tier: 2, moss: 0.12 },
  // First level (3.25 m): 13 steps at 45°, narrower, cheek tiers of three.
  steep: { finish: STAIR_STONE, ...STAIR.steep, height: 3.25, width: 2.5, cheek: 0.75, tier: 3, moss: 0.12 },
  // A Bakan stairway: 40 steps to the top of the 12.5 m base.
  bakan: { finish: STONE_FINISH.weathered, ...STAIR.bakan, height: 12.5, width: 2.5, cheek: 0.75, tier: 4, moss: 0.25 },
  // Terrace of Honour class: 2.5 m with a landing halfway, lion plinths in front.
  landing: { finish: STAIR_STONE, ...STAIR.ordinary, height: 2.5, width: 3, cheek: 0.75, tier: 3, landings: [5], landing: 1.0, pedestal: 0.5, moss: 0.12 },
  // The ordinary stair gone to ruin: stones knocked out, moss and grass in the joints.
  overgrown: { finish: { ...STONE_FINISH.weathered, surf: stoneSurf({ moss: 0.4, lichen: 0.15, stain: 0.4 }) }, ...STAIR.ordinary, height: 1.5, width: 3, cheek: 0.75, tier: 2, moss: 0.55, grass: 0.7, missing: 3 },
};

export default defineKitAsset({
  section: '21.2',
  order: 4,
  name: 'Stair',
  caption: 'Stair module for platforms, terraces and entrances.',
  size: {
    real: 'ordinary: 3.0 m flight between 0.75 m cheek walls (4.5 m wide), 1.5 m high: 6 risers of 0.25 m on 0.3125 m treads (39°), 1.9 m run. Steep 0.25/0.25 m (45°, 3.25 m); Bakan 0.3125/0.1875 m (59°, 40 steps, 12.5 m)',
    sheet: '≈ 3 × 3 m: 6 one-block steps (0.5 m risers on 0.5 m treads)',
    note: 'Angkor’s ordinary stairs have 0.25–0.3 m risers (APSARA) on 0.31–0.35 m treads; the sheet’s 0.5 m risers are over the explorer’s 0.42 m step-up. The axial terrace stairs are 3–4 m wide with cheek walls stepping down in tiers of 2–3 steps, their tops pedestals for lions. The real Bakan stairs rise at 70° on 0.12–0.2 m treads; the game eases them to 59° so the explorer can climb them.',
  },
  variants: [
    { id: 'ordinary', name: 'Terrace stair' },
    { id: 'steep', name: 'Steep temple stair' },
    { id: 'bakan', name: 'Bakan stair' },
    { id: 'landing', name: 'With a landing' },
    { id: 'overgrown', name: 'Ruined, overgrown' },
  ],
  shots: [
    { view: 'front', label: 'Front' },
    { view: 'side', label: 'Side' },
    { view: 'top', label: 'Top' },
  ],
  ref: { sheet: 'section 21/Codex Image Sep 22, 2026, 12_46_24 PM.png', box: [775, 91, 1015, 433] },
  build: ({ variant, seed, height }) => {
    const v = VARIANTS[variant] ?? VARIANTS.ordinary;
    return stairPiece({ ...v, seed, height: height ?? v.height });
  },
});
