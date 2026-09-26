import { WALL_STONE, wallSegment, type WallEnd, type WallStone } from '../../lib/wall';
import { defineKitAsset, type KitAsset } from '../../types';

/** The §15 sheet (all §15 components share it). */
export const SHEET_15 = 'section 15/ChatGPT Image Sep 22, 2026, 10_38_08 AM.png';

/** Finish variants of the §15 pieces: the sheet's weathered stone first. */
export const FINISHES: Record<string, { stone: WallStone; name: string }> = {
  weathered: { stone: WALL_STONE.weathered, name: 'Weathered' },
  mossy: { stone: WALL_STONE.mossy, name: 'Mossy' },
  clean: { stone: WALL_STONE.clean, name: 'Clean' },
};

interface SegmentSpec {
  order: number;
  name: string;
  caption: string;
  length: number;
  thickness?: number;
  /** The segment's own stone for its main variant (default the sheet's weathered). */
  stone?: WallStone;
  size: KitAsset['size'];
  box: [number, number, number, number];
}

/**
 * A straight §15 wall segment as the sheet draws it — plinth, a band of blind
 * baluster windows between string courses, cornice and coping, a pier at each
 * end standing taller and wider — with finish variants and the ends that tile.
 */
export function segmentAsset(s: SegmentSpec): KitAsset {
  const main = s.stone ?? WALL_STONE.weathered;
  const variants: { id: string; name: string; stone: WallStone; ends: WallEnd | [WallEnd, WallEnd] }[] = [
    { id: 'piers', name: 'Piers at both ends', stone: main, ends: 'pier' },
    { id: 'mossy', name: 'Mossy', stone: WALL_STONE.mossy, ends: 'pier' },
    { id: 'clean', name: 'Clean (new)', stone: WALL_STONE.clean, ends: 'pier' },
    { id: 'open', name: 'Open ends (tiles)', stone: main, ends: 'open' },
    { id: 'inner', name: 'Pier + open end (tiles)', stone: main, ends: ['inner-pier', 'open'] },
  ];
  return defineKitAsset({
    section: '15',
    order: s.order,
    name: s.name,
    caption: s.caption,
    size: s.size,
    variants: variants.map(({ id, name }) => ({ id, name })),
    shots: [
      { view: 'front', label: 'Front view' },
      { view: 'top', label: 'Top view' },
      { view: 'side', label: 'Side view' },
      { view: 'iso', variant: 'mossy', label: 'Mossy' },
      { view: 'iso', variant: 'clean', label: 'Clean (new)' },
      { view: 'iso', variant: 'open', label: 'Open ends (tiles)' },
      { view: 'iso', variant: 'inner', label: 'Pier + open end' },
    ],
    ref: { sheet: SHEET_15, box: s.box },
    build: ({ variant, seed, height }) => {
      const v = variants.find((x) => x.id === variant) ?? variants[0];
      return wallSegment({ length: s.length, thickness: s.thickness, height, ends: v.ends, finish: v.stone.finish, weather: v.stone.weather, seed });
    },
  });
}

