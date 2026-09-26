import { blockAsset } from './_block';

export default blockAsset({
  kind: 'corner',
  order: 7,
  name: 'Corner block',
  caption: 'Corner block. Used for wall corners, buildings and frames.',
  size: {
    real: 'L of three 0.5 m units on 1.0 × 1.0 m, 0.5 m high — two stones',
    sheet: '2 × 2 × 1 units (L-shape)',
    note: 'The way a wall corner is bonded: a 1.0 m stretcher along one wall and a 0.5 m header starting the other, with a true joint between them (0.58 t + 0.29 t). The missing quarter is at the front right; quarter turns fit it to any corner, and its other bond (the stretcher along the other wall) laid every second course alternates the joints like a real corner.',
  },
  box: [1330, 95, 1515, 552],
});
