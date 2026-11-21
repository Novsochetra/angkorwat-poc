import { Vector4 } from 'three';

/**
 * The sparklers' tips on New Year's Eve (AWP-35), handed from the people to the night's life (`_life.ts`): each venue's
 * crowd scene (people/_sceneNye.ts, _sceneNyeLake.ts) writes where its sparklers burn as it steps (x, y, z, and w: 1
 * lit … 0 out or not shown), and the life piece's shader throws sparks from them (these vectors are its uniform's
 * own: whatever order the parts step in, the frame draws what the people last wrote).
 */

/** Sparklers drawn at most, a venue. */
export const SPARK_MAX = 24;

export type SparkSite = 'kulen' | 'lake';

export const SPARKS: Record<SparkSite, Vector4[]> = {
  kulen: Array.from({ length: SPARK_MAX }, () => new Vector4()),
  lake: Array.from({ length: SPARK_MAX }, () => new Vector4()),
};

/** All of a venue's sparklers out (the scene hid its people). */
export function sparksOut(site: SparkSite): void {
  for (const v of SPARKS[site]) v.w = 0;
}
