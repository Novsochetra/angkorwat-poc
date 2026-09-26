import { blockAsset } from './_block';

export default blockAsset({
  kind: '2x2',
  order: 4,
  name: '2x2 block',
  caption: 'Square platform block. Used for floors, bases and platforms.',
  size: {
    real: '1.0 × 1.0 × 0.5 m — two 1.0 m stones',
    sheet: '2 × 2 × 1 units',
    note: 'As one stone it would be 0.5 m³ (≈ 1.15 t), bigger than the 1.5 × 0.5 × 0.6 m that is about the most one Angkor Wat stone holds, so it is two 1.0 × 0.5 m ashlars side by side with a true joint between them — how a 1 m thick wall course is laid. The seams across each stone are grooves.',
  },
  box: [646, 95, 827, 552],
});
