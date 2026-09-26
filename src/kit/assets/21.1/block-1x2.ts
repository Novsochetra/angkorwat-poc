import { blockAsset } from './_block';

export default blockAsset({
  kind: '1x2',
  order: 2,
  name: '1x2 block',
  caption: 'Horizontal block. Common for walls and steps.',
  size: {
    real: '1.0 × 0.5 × 0.5 m — one stone, ≈ 0.58 t',
    sheet: '1 × 2 × 1 units',
    note: 'The typical Angkor Wat ashlar: 1.0 m long, one 0.5 m course high (real 1.0–1.2 m × 0.45–0.5 m × 0.6 m deep), about 0.58 t at 2.3 t/m³. One stone, so the seam the sheet draws between its two units is a groove across it, notched into the arrises, not a joint; the quarter lines are shallower grooves.',
  },
  box: [217, 95, 408, 552],
});
