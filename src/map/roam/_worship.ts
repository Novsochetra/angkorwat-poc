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
  // Angkor Wat: the warm lit doorway of the main gate on the road
  // (sanctuary.ts `gopura` at z −174, its glowing door at z −169), knelt in
  // the passage mouth (floor 58), the beacon behind him. (The terraces
  // above are out of reach on foot, so the central tower is not a spot.)
  { id: 'sanctuary-main-gate', place: 'sanctuary', x: 0, y: 58, z: -166.9, fx: 0, fz: -169 },
  // Bayon: the candles in the central tower's south porch (overlook.ts
  // `candles`: tower door cell (−2, 6, 3) → z −226.7), knelt on the porch floor (46).
  { id: 'overlook-central-candles', place: 'overlook', x: -301.5, y: 46, z: -224.2, fx: -301.5, fz: -226.7 },
  // Preah Khan: the candles in the gate's passage (shrine.ts, (−79.5, −39.5)),
  // the central tower's doorway beyond them; knelt in the passage (25).
  { id: 'shrine-gate-candles', place: 'shrine', x: -79.5, y: 25, z: -36.6, fx: -79.5, fz: -39.5 },
  // Ta Prohm: the central tower's south door, glowing at night (terrace.ts
  // `windows.strip` at (183.5, −155.95)), at the top of the stair up from the
  // gate (40).
  { id: 'terrace-central-door', place: 'terrace', x: 183.5, y: 40, z: -154.2, fx: 183.5, fz: -155.95 },
  // Ta Prohm: the garden stupa by the road, across from the temple
  // (terrace.ts `stupa` at pad (4.5, 20.5) → (204.75, −119.75)); knelt on
  // the lawn west of it (35).
  { id: 'terrace-garden-stupa', place: 'terrace', x: 201.1, y: 35, z: -119.75, fx: 204.75, fz: -119.75 },
  // Phnom Kulen: the foot of the pyramid's central stair on the pad (grass
  // over 150), facing the sanctuary's lit south door at its top (kulen.ts,
  // pad centre + (0, 5) → z −435).
  { id: 'kulen-stair-foot', place: 'kulen', x: 370, y: 150.25, z: -423.3, fx: 370, fz: -435 },
  // River Gate: the riverside shrine behind the first gate (rivergate.ts
  // `prasat` at road frame (cx, −16) → (−85.97, 28.38)), its door facing the
  // road (−84.71, 30.25); knelt on the grass between it and the gate's wing (8).
  { id: 'rivergate-shrine', place: 'rivergate', x: -83.45, y: 8, z: 32.83, fx: -84.71, fz: 30.25 },
  // River Gate: the stupa by the second gate (rivergate.ts `stupa` at road
  // frame (cx − 6, −11) → (−54.97, 13.53)), knelt on its road side (grass over 8).
  { id: 'rivergate-stupa', place: 'rivergate', x: -53.01, y: 8.3, z: 16.43, fx: -54.97, fz: 13.53 },
];
