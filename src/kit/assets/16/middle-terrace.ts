import { terracePiece } from '../../lib/terrace';
import { snap } from '../../shapes';
import { defineKitAsset } from '../../types';
import { coreLook, coreShots, CORE_VARIANTS } from './_core-looks';

/**
 * ② Middle terrace — two stepped stages, the first level's class (the
 * bas-relief gallery stands 3.25 m up): a 2 m stage with a moulded face
 * (plinth, step band, two dado courses, step band, coping) and, set back
 * 1.25 m behind its rim, a 1.25 m stage with a plinth and a coping; a paved
 * tread between them, moss creeping out from the foot of the upper stage.
 */
export default defineKitAsset({
  section: '16',
  order: 2,
  name: 'Middle terrace',
  caption: 'Intermediate terrace level.',
  size: {
    real: '8 × 8 m sample, 3.25 m to the top in two stages (2.0 m + 1.25 m, set back 1.25 m); `height` sets the total',
    sheet: 'about 5 courses in two stages (≈ 2–2.5 m)',
    note: 'Angkor Wat’s first level is raised about 3.3 m (Hidden Architecture, Glaize). The sheet’s stages are plain stacks of cubes; here each is a moulded Khmer base, and the upper stage is set back enough to leave a walkable tread.',
  },
  variants: CORE_VARIANTS,
  shots: coreShots(),
  ref: { sheet: 'section 16/51F119C4-CD9A-4DB5-BCFD-840E8D3A151C.PNG', box: [325, 92, 615, 382] },
  build: ({ variant, seed, height }) => {
    const look = coreLook(variant);
    const H = snap(height ?? 3.25, 0.25);
    const lower = Math.max(0.75, snap(H * 0.6, 0.25));
    return terracePiece({
      width: 8,
      depth: 8,
      stages: [{ height: lower }, { height: Math.max(0.75, H - lower), setback: 1.25 }],
      finish: look.finish,
      weather: look.weather,
      seed,
    });
  },
});
