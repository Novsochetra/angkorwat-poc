import { blockAsset } from './_block';

export default blockAsset({
  kind: '1x3',
  order: 3,
  name: '1x3 block',
  caption: 'Extended horizontal block. Used for longer walls and decorative bands.',
  size: {
    real: '1.5 × 0.5 × 0.5 m — one stone, ≈ 0.86 t',
    sheet: '1 × 3 × 1 units',
    note: 'A long ashlar or lintel stone, at the top of the real range (Angkor Wat’s stones run to 1.2 m and more; the heaviest ≈ 1.5 t). 0.375 m³ of sandstone is about 0.86 t, so it is one stone: the unit seams are grooves across it, not joints.',
  },
  box: [422, 95, 632, 552],
});
