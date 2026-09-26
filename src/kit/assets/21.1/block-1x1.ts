import { blockAsset } from './_block';

export default blockAsset({
  kind: '1x1',
  order: 1,
  name: '1x1 stone block',
  caption: 'Basic unit block. Used for fine details and adjustments.',
  size: {
    real: '0.5 × 0.5 × 0.5 m — one stone, ≈ 0.29 t',
    sheet: '1 × 1 × 1 units',
    note: 'One unit is the kit’s 0.5 m temple block (TEMPLE_BLOCK_M): Angkor Wat’s courses are 0.40–0.55 m high. A 0.5 m cube is a half stone or filler — real ashlars are 1.0–1.2 m long — at 2.3 t/m³ about 0.29 t. The sheet splits each unit face into quarters by fine lines, as if the cube were built of 0.25 m cubes; no wall stone is that small, so they are shallow grooves cut into one stone: a cross on the top, a bedding groove at mid height and a short upright one on each side. Too tall to step onto (the explorer climbs 0.42 m): use height 0.25 m for steps.',
  },
  box: [23, 95, 203, 552],
});
