import { segmentAsset } from './_core-segment';

/**
 * §15 ② Long wall segment: the small segment's wall at twice its length — a
 * long band of blind baluster windows between two end piers.
 */
export default segmentAsset({
  order: 2,
  name: 'Long wall segment',
  caption: 'Long run of temple wall: a band of blind baluster windows between two end piers.',
  length: 16,
  size: {
    real: '16.0 m long × 1.0 m thick (1.5 m at the piers) × 5.0 m to the cornice (5.375 m to the coping, 6.125 m at the pier heads)',
    sheet: '≈ 3 m high, ≈ 3.7 × as long as high (twice the small segment), 2 blocks thick; ~20 balusters',
    note: 'Walls ≈ 5 m to the cornice as on the small segment. Twice the small segment’s length, as on the sheet: a 1 m pier at each end and seven 2 m bays of blind windows (7 balusters each), so it tiles with every other §15 module on the 2 m bay.',
  },
  box: [280, 92, 660, 352],
});
