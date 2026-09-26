import { PieceBuilder } from '../../PieceBuilder';
import { defineKitAsset, type KitShot } from '../../types';
import { coreLook } from './_core-looks';
import { decoBlock, DECO_KINDS, type DecoKind } from './_deco-blocks';

/**
 * ⑨ Terrace decorative blocks — the sheet's eight small carved stones, each a
 * variant (and all eight in the sheet's two rows): a cube with a lotus rosette
 * on every side, a lotus-bud finial, a post with a devata in a niche, a block
 * with a kala's face, a moulded pedestal, a corner stone carved on its two
 * outer faces, a stacked finial hung with lotus petals and a miniature shrine
 * (the antefix of tiers and terraces). Built with `_deco-blocks.ts`, which the
 * terrace stair uses for its finials; the §16 terraces' mossy stone.
 */
const ALL: DecoKind[][] = [
  ['rosette', 'lotus', 'figure', 'relief'],
  ['moulded', 'corner', 'stacked', 'shrine'],
];

export default defineKitAsset({
  section: '16',
  order: 9,
  name: 'Terrace decorative blocks',
  caption: 'Carved decorative blocks for terraces.',
  size: {
    real: 'carved blocks 0.75 m (rosette cube, corner stone 0.75 m cubes; kala block 0.75 × 1.19 m; moulded pedestal 0.75 × 0.88 m); lotus-bud finial ⌀ 0.56 × 0.94 m on a 0.5 m foot; devata post 0.63 × 1.25 m; stacked finial 0.75 × 0.94 m; miniature shrine (antefix) 0.63 m plinth, 0.5 m body, 1.25 m tall',
    sheet: 'no sizes; drawn 1.5–2 cubes wide and 1.5–2.5 cubes tall',
    note: 'Read against the sheet’s 0.5 m cubes, the blocks are 0.75–1.25 m: the size of the carved stones, finials and antefixes on Angkor Wat’s terrace rims and tower tiers (SIZES-ARCH §2 §16-9: blocks 0.5–1.0 m, finials ⌀ 0.5 × 0.75 m, antefixes 0.5 × 0.5 × 1.0–1.25 m), under the explorer’s 1.70 m. Carving is cut on the half-texel (3 cm) grid, a few centimetres deep, running across the joints as Khmer reliefs do.',
  },
  variants: [{ id: 'all', name: 'All eight' }, ...DECO_KINDS.map(({ id, name }) => ({ id, name }))],
  shots: DECO_KINDS.map((k): KitShot => ({ view: 'iso', variant: k.id, label: k.name })),
  ref: { sheet: 'section 16/51F119C4-CD9A-4DB5-BCFD-840E8D3A151C.PNG', box: [1110, 395, 1516, 665] },
  build: ({ variant, seed }) => {
    const finish = coreLook('mossy').finish;
    const p = new PieceBuilder();
    if (variant === 'all') {
      // The sheet's two rows of four, 1.5 m apart.
      ALL.forEach((row, j) => row.forEach((kind, i) => decoBlock(p, { kind, finish, seed: seed + j * 4 + i, at: [(i - 1.5) * 1.5, 0, (j - 0.5) * 2] })));
    } else {
      const kind = DECO_KINDS.find((k) => k.id === variant)?.id ?? 'rosette';
      decoBlock(p, { kind, finish, seed });
    }
    return p.done();
  },
});
