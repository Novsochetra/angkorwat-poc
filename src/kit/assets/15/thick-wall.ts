import { WALL_STONE } from '../../lib/wall';
import { segmentAsset } from './_core-segment';

/**
 * §15 ③ Thick wall segment: the wall of a gopura, tower body or gate — half as
 * thick again as a gallery wall, in older, darker stone, its blind windows
 * sunk deeper.
 */
export default segmentAsset({
  order: 3,
  name: 'Thick wall segment',
  caption: 'Heavy wall of gates and towers: deeper, older and darker stone.',
  length: 8,
  thickness: 1.5,
  stone: WALL_STONE.aged,
  size: {
    real: '8.0 m long × 1.5 m thick (2.0 m at the piers) × 5.0 m to the cornice (5.375 m to the coping, 6.125 m at the pier heads)',
    sheet: '≈ 3 m high, 3 blocks (≈ 1.5 m) thick, about as long as the small segment',
    note: 'Gopura, tower and gate walls at Angkor Wat run 1.5–2.0 m thick; the sheet’s three blocks give 1.5 m. Same height and 2 m bays as the other segments so they line up course for course.',
  },
  box: [673, 92, 954, 352],
});
