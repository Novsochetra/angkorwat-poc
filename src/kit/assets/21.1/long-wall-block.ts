import { blockAsset } from './_block';

export default blockAsset({
  kind: 'long',
  order: 6,
  name: 'Long wall block',
  caption: 'Long wall block. Used for gallery walls, corridors and railings.',
  size: {
    real: '2.0 × 0.5 × 0.5 m — two 1.0 m stones',
    sheet: '1 × 4 × 1 units',
    note: 'As one stone it would be 0.5 m³ (≈ 1.15 t), longer than any course stone at Angkor Wat (1.0–1.5 m), so it is two 1.0 m ashlars end to end with a true joint in the middle; the seams across each stone are grooves. 2.0 m is also the kit’s bay.',
  },
  box: [1099, 95, 1317, 552],
});
