import { terracePiece, type TerraceStage } from '../../lib/terrace';
import { snap } from '../../shapes';
import { defineKitAsset } from '../../types';
import { coreLook, coreShots } from './_core-looks';

/**
 * ③ Upper terrace — three stages stepping in, the second level's base
 * (5.75 m): the middle stage carries the sheet's band of dark recessed
 * niches, here blind windows with turned balusters standing in them. The
 * Bakan variant is the third level's two-stage base, 6.25 + 6.25 m, with
 * the full Khmer profile (plinth, step, fillet, torus, fillet, a tall dado,
 * and the same mirrored under the coping).
 */
function stagesFor(variant: string, height?: number): TerraceStage[] {
  const H = snap(height ?? (variant === 'bakan' ? 12.5 : 5.75), 0.25);
  if (H >= 9) {
    // The Bakan: two equal stages, the upper set well back.
    const a = snap(H / 2, 0.25);
    return [{ height: a }, { height: H - a, setback: 2 }];
  }
  const a = Math.max(0.75, snap(H * 0.39, 0.25));
  const b = Math.max(0.75, snap(H * 0.35, 0.25));
  return [{ height: a }, { height: b, setback: 1, niches: variant !== 'plain' }, { height: Math.max(0.75, H - a - b), setback: 1 }];
}

export default defineKitAsset({
  section: '16',
  order: 3,
  name: 'Upper terrace',
  caption: 'Upper terrace level.',
  size: {
    real: '8 × 8 m sample, 5.75 m in three stages (2.25 + 2.0 + 1.5 m, each set back 1 m); Bakan base 12.5 m in two 6.25 m stages on a 12 × 12 m sample (the upper set back 2 m); `height` sets the total (≥ 9 m gives the two-stage Bakan form)',
    sheet: 'about 7–8 courses in three stages (≈ 3.5–4 m)',
    note: 'The second level’s base is about 5.8 m high and the Bakan’s two-stage base 11–13 m (40 steps × 0.3125 m = 12.5 m). The sheet’s low stacks are built as moulded Khmer bases at those heights; its dark openings in the middle stage become blind windows with balusters.',
  },
  variants: [
    { id: 'mossy', name: 'Mossy, niche band' },
    { id: 'plain', name: 'Plain stages' },
    { id: 'weathered', name: 'Weathered' },
    { id: 'clean', name: 'Clean' },
    { id: 'bakan', name: 'Bakan base (12.5 m)' },
  ],
  shots: coreShots({ view: 'iso', variant: 'bakan', label: 'Bakan base' }),
  ref: { sheet: 'section 16/51F119C4-CD9A-4DB5-BCFD-840E8D3A151C.PNG', box: [629, 92, 913, 382] },
  build: ({ variant, seed, height }) => {
    const look = coreLook(variant === 'plain' || variant === 'bakan' ? 'mossy' : variant);
    const stages = stagesFor(variant, height);
    // (a two-stage Bakan-class base on the 8 m sample would read as a tower: its sample is 12 m)
    const W = stages.length === 2 ? 12 : 8;
    return terracePiece({ width: W, depth: W, stages, finish: look.finish, weather: look.weather, seed });
  },
});
