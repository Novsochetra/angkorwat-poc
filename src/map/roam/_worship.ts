import type { PlaceId } from '../types';

/**
 * A spot where the roaming explorer stops to pay respect: he stands at
 * (x, y, z), turns to face (fx, fz) — a Buddha, an altar, a sanctum door or
 * a candle shrine — and kneels to pray (`roam/_pray.ts`).
 */
export interface WorshipSpot {
  /** Short name for checks and bug reports, e.g. `sanctuary-central-door`. */
  id: string;
  /** The place it belongs to (null: a spot of its own, e.g. in the jungle). */
  place: PlaceId | null;
  /** Where he kneels (m; `y` = the floor he stands on there). */
  x: number;
  y: number;
  z: number;
  /** The point he faces while he prays (m). */
  fx: number;
  fz: number;
}

/**
 * Every worship spot on the map (filled in from the landmarks' builds).
 * World metres, worked out from each landmark's build (its grid origin and
 * cells); `y` is the floor there in the walk map (roam/walkmap.ts
 * `standAt`). Each spot is reachable on foot from the place's beacon or
 * road, and he kneels and bows there (1.5 m forward) without touching stone.
 */
export const WORSHIP: WorshipSpot[] = [
  // Angkor Wat: the gilt Buddha in the main gate's passage on the road
  // (_sanctuaryShrine.ts `mainGateShrine`: sanctuary.ts `gopura` at z −174,
  // the Buddha at z −170.6 before the lit door), knelt in the passage mouth
  // (floor 58), the beacon behind him. (The terraces above are out of reach
  // on foot, so the central tower is not a spot.)
  { id: 'sanctuary-main-gate', place: 'sanctuary', x: 0, y: 58, z: -166.9, fx: 0, fz: -170.6 },
  // Bayon: the naga Buddha in the central tower's sanctum, through its south
  // door (overlook.ts `sanctum`: door cell (−2, 6, 3), the Buddha at z
  // −228.85), knelt in the doorway on its floor (46).
  { id: 'overlook-central-candles', place: 'overlook', x: -301.5, y: 46, z: -224.8, fx: -301.5, fz: -228.85 },
  // Preah Khan: the sandstone Buddha in the gate's passage (shrine.ts
  // `gateShrine`, at (−79.5, −40.45)), the central tower's doorway beyond
  // him; knelt in the passage (25).
  { id: 'shrine-gate-candles', place: 'shrine', x: -79.5, y: 25, z: -36.6, fx: -79.5, fz: -40.45 },
  // Ta Prohm: the sandstone Buddha in the central tower's south sanctum
  // (terrace.ts: on its altar at (183.5, −159), glowing at night), knelt in
  // the doorway at the top of the stair up from the gate (40).
  { id: 'terrace-central-door', place: 'terrace', x: 183.5, y: 40, z: -155.3, fx: 183.5, fz: -159 },
  // Ta Prohm: the garden stupa by the road, across from the temple
  // (terrace.ts: on its plinth at pad (4.5, 20.5) → (204.5, −119.5), its
  // offerings on the plinth's west edge); knelt on the lawn west of it (35).
  { id: 'terrace-garden-stupa', place: 'terrace', x: 201.1, y: 35, z: -119.5, fx: 204.5, fz: -119.5 },
  // Phnom Kulen: the gilt Buddha on the altar at the foot of the pyramid's
  // central stair (kulen.ts: pad centre + (0, 14.5) → z −425.5), the lit
  // south door of the sanctuary at the stair's top beyond him; knelt on the
  // pad before the altar (grass over 150).
  { id: 'kulen-stair-foot', place: 'kulen', x: 370, y: 150.25, z: -422.6, fx: 370, fz: -425.5 },
  // River Gate: the gilt Buddha in the door of the riverside shrine behind
  // the first gate (rivergate.ts `prasat` at road frame (cx, −16) →
  // (−85.97, 28.38); the Buddha 1 m out along its door's axis → (−85.41,
  // 29.21)); knelt on the grass on that axis, between the shrine and the
  // gate's wing (8).
  { id: 'rivergate-shrine', place: 'rivergate', x: -83.01, y: 8, z: 32.77, fx: -85.41, fz: 29.21 },
  // River Gate: the whitewashed stupa by the second gate, a Buddha in its
  // niche (rivergate.ts, road frame (cx − 6, −11) → (−54.99, 13.51)),
  // knelt on its road side before the offerings on its plinth (grass over 8).
  { id: 'rivergate-stupa', place: 'rivergate', x: -53.01, y: 8.3, z: 16.43, fx: -54.99, fz: 13.51 },
  // The floating village's pagoda (village/_pagoda.ts, `PAGODA` in
  // village/_spots.ts): knelt on the porch before the open north door (floor
  // 10, door at z 99), facing the golden Buddha on the altar inside (z 110.9).
  { id: 'village-pagoda-door', place: null, x: -306, y: 10, z: 96.8, fx: -306, fz: 110.9 },
  // The jungle's shrines (jungle/_ruinShrines.ts `KNEEL`, site space → map
  // metres by each site's frame): on the flat ground of the clearing
  // between its trail and its offerings, facing the statue.
  // The forest Buddha on the back trail (throne at (−52, −312)), knelt on
  // the stepping stones before his offering table (floor 10).
  { id: 'jungle-forest-buddha', place: null, x: -52, y: 10, z: -306.9, fx: -52, fz: -312 },
  // The whitewashed stupa by the lake, its urn of incense between him and it (8).
  { id: 'jungle-lake-shrine', place: null, x: -438.07, y: 8, z: -69.8, fx: -439.44, fz: -65.67 },
  // The stone shrine at the foot of Phnom Kulen, its little Buddha in the doorway (8).
  { id: 'jungle-kulen-shrine', place: null, x: 268, y: 8, z: -236.65, fx: 268, fz: -242.2 },
  // The spirit house by the village trail, on the grass before its post (8).
  { id: 'jungle-spirit-house', place: null, x: -124.5, y: 8, z: 86.3, fx: -124.5, fz: 89.2 },
];
