import type { RoamCtx } from '../roam/types';

/**
 * The link between the `treasure` part (treasure/index.ts: hidden golden
 * figures) and the roaming modes, with nothing heavy in
 * it: the walker and the mini-map import this
 * small module, the part fills it in once it is built. Until then (or if
 * the part failed) every hook does nothing, so roaming works without it.
 */
export interface GoldNear {
  id: string;
  /** "E  Pick up the golden naga" (in the language in use). */
  prompt: string;
}

export interface TreasureHooks {
  /**
   * On foot, each grounded step (walker.ts): a golden figure within reach
   * of his feet, or null. The first call settles the figures on the walk map.
   */
  near(ctx: RoamCtx): GoldNear | null;
  /** E by it: he bends down and picks it up; it flies into his bag (a chime, a message). */
  pick(ctx: RoamCtx, id: string): void;
  /** Where the figures he found are (m), for the big map. */
  found(): readonly { id: string; x: number; z: number }[];
}

export const treasure: TreasureHooks = {
  near: () => null,
  pick() {},
  found: () => [],
};

/** The part puts its hooks in (treasure/index.ts). */
export function installTreasure(h: TreasureHooks): void {
  Object.assign(treasure, h);
}
