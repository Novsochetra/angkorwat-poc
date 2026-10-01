/**
 * The lotus he picked from the boat (roam/_lotus.ts), for others that have
 * him offer a lotus: Visak Bochea's procession (roam/_visak.ts) lays his own
 * lotus with the candle when he carries one. A plain module object (no
 * three.js), filled in by the lotus add-on once roaming is built; until then
 * he has none.
 */
export const LOTUS_HOOK = {
  /** He carries a lotus he picked. */
  has: (): boolean => false,
  /** Offer one of his own (`where`: for the count's notes): out of his bag, counted; false if he has none. */
  offerWith: (_where: string): boolean => false,
};

/** The lotus bed in the great lake off the floating village's south end (roam/_lotusBed.ts): its middle and reach (m); the maps' badge. */
export const LOTUS_BED = { x: -377.5, z: 80.5, r: 11 } as const;
