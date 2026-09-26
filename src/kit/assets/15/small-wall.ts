import { segmentAsset } from './_core-segment';

/**
 * §15 ① Small wall segment: an 8 m run of free-standing temple wall between
 * two end piers — moulded plinth, a band of blind baluster windows between
 * string courses, cornice and coping with moss on the tops, the piers standing
 * taller and wider with capped heads.
 */
export default segmentAsset({
  order: 1,
  name: 'Small wall segment',
  caption: 'Short run of temple wall: blind baluster windows between two end piers.',
  length: 8,
  size: {
    real: '8.0 m long × 1.0 m thick (1.5 m at the piers) × 5.0 m to the cornice (5.375 m to the coping, 6.125 m at the pier heads)',
    sheet: '≈ 3 m high (6 courses), about twice as long as high, 2 blocks thick; one band of ~9 balusters',
    note: 'Angkor Wat’s gallery and enclosure walls stand ≈ 5 m to the cornice (1 m plinth, 3.5 m body, 0.5 m cornice) in 0.4–0.55 m courses of ≈ 1 m stones: the sheet’s 3 m wall is too low. At the true height the length keeps the sheet’s long, low look on the kit’s 2 m bay: a 1 m pier at each end and three bays of blind windows — Angkor Wat’s false windows, 1.375 × 1.625 m clear with 7 balusters half-sunk in a shallow recess (the sheet draws too few balusters).',
  },
  box: [18, 92, 268, 352],
});
