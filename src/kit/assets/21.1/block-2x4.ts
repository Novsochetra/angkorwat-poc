import { blockAsset } from './_block';

export default blockAsset({
  kind: '2x4',
  order: 5,
  name: '2x4 block',
  caption: 'Large platform block. Used for terraces, floors and large structures.',
  size: {
    real: '2.0 × 1.0 × 0.5 m — five stones',
    sheet: '2 × 4 × 1 units',
    note: 'As one stone it would be 1.0 m³, ≈ 2.3 t — far over Angkor Wat’s ≈ 1.5 t maximum — so it shows its joints: a back row of two 1.0 m ashlars and a front row of 0.5 + 1.0 + 0.5 m, in running bond. The unit seams inside a stone are grooves.',
  },
  box: [840, 95, 1085, 552],
});
