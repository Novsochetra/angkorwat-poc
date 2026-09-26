import { BLOCK_FINISH, blockPiece, type BlockKind } from '../../lib/blocks';
import { defineKitAsset, type KitAsset } from '../../types';

/**
 * §21.1 basic blocks: one asset per block of the sheet, built by `lib/blocks`
 * (see its header for how the sheet's unit seams become joints or grooves).
 * Variants are finishes: the sheet's mossy pinkish-tan stone, §19.1 weathered
 * and §19.1 clean. The card shows the sheet's additional views (front, side,
 * top) beside the other finishes.
 */
export const BLOCK_VARIANTS = [
  { id: 'mossy', name: 'Mossy (sheet)' },
  { id: 'weathered', name: 'Weathered' },
  { id: 'clean', name: 'Clean' },
];

/** The detailed 21.1 sheet. */
const SHEET = 'section 21/Codex Image Sep 22, 2026, 12_44_48 PM.png';

export function blockAsset(o: {
  kind: BlockKind;
  order: number;
  name: string;
  caption: string;
  size: KitAsset['size'];
  /** Crop box on the detailed sheet. */
  box: [number, number, number, number];
}): KitAsset {
  return defineKitAsset({
    section: '21.1',
    order: o.order,
    name: o.name,
    caption: o.caption,
    size: o.size,
    variants: BLOCK_VARIANTS,
    shots: [
      { view: 'front', label: 'Front view' },
      { view: 'side', label: 'Side view' },
      { view: 'top', label: 'Top view' },
      { view: 'iso', variant: 'weathered', label: 'Weathered' },
      { view: 'iso', variant: 'clean', label: 'Clean' },
    ],
    ref: { sheet: SHEET, box: o.box },
    build: ({ variant, seed }) => blockPiece(o.kind, { seed, finish: BLOCK_FINISH[variant as keyof typeof BLOCK_FINISH] ?? BLOCK_FINISH.mossy }),
  });
}
