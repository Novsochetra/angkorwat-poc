import { terracePiece } from '../../lib/terrace';
import { snap } from '../../shapes';
import { defineKitAsset } from '../../types';
import { coreLook, coreShots, CORE_VARIANTS } from './_core-looks';

/**
 * ① Lower terrace — a wide, low platform, the inner avenue's class: one
 * stage 1.5 m high with a Khmer moulded face (plinth and step band, a course
 * of dado, step band and coping, each set a little out from the dado) and a
 * top paved in rows of slabs, moss on the rim and the ledges, grass in the
 * joints — the sheet's few courses under a mossy paved top.
 */
export default defineKitAsset({
  section: '16',
  order: 1,
  name: 'Lower terrace',
  caption: 'Base terrace level.',
  size: {
    real: '8 × 8 m sample (2 m grid), 1.5 m to the walkable top; `height` sets other levels (Terrace of Honour ≈ 2.5 m)',
    sheet: 'about 3 courses (≈ 1–1.5 m), about 6 × 6 blocks',
    note: 'The inner avenue is "raised above ground level by 1.5 m" (Glaize); the Terrace of Honour ≈ 2.5 m. The sheet’s few plain courses become a moulded Khmer base of 0.25 m bands around a 0.5 m dado course, which still reads as five stepped courses.',
  },
  variants: CORE_VARIANTS,
  shots: coreShots(),
  ref: { sheet: 'section 16/51F119C4-CD9A-4DB5-BCFD-840E8D3A151C.PNG', box: [20, 92, 312, 382] },
  build: ({ variant, seed, height }) => {
    const look = coreLook(variant);
    return terracePiece({ width: 8, depth: 8, stages: [{ height: snap(height ?? 1.5, 0.25) }], finish: look.finish, weather: look.weather, seed });
  },
});
