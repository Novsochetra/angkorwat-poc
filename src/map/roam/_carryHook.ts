/**
 * The shoulder pole (ដងរែក: two buckets of water on a bamboo pole across his shoulder; the add-on
 * roam/_carryPole*.ts) as the other add-ons see it, without loading its module (roam/_addons.ts: no add-on imports
 * another's). The carry add-on writes it; the garden (roam/_garden.ts) reads it: while he carries the pole the
 * garden offers none of its own jobs (his hands are on the pole) — the carry add-on offers what can be done with
 * the buckets (fill them, pour them into the jar, water a plant with the dipper, set the pole down).
 */
export const CARRY = {
  /** He carries the pole now (on his shoulder, or set down beside him for a moment of work). */
  on: false,
  /** Pours of water in the two buckets now (0‥2 × `BUCKET_POURS`, garden/state.ts). */
  water: 0,
};
