import type { MapQuality } from '../types';

/**
 * How much the map's own plants draw (veg/banana.ts, veg/papaya.ts): their
 * cheap `lite` form on the low graphics level (phones), where a walk's
 * triangles are counted closest (docs/map-work/BRIEF.md "Budgets"). Each part
 * that plants them says the build's level before it builds
 * (`plantDetail(ctx.quality)`: hamlet/index.ts, village/index.ts,
 * jungle/camps.ts); every part of a build has the same level. Never the home
 * garden's plants (garden/models: always their full model).
 */
let lite = false;

export function plantDetail(quality: MapQuality): void {
  lite = quality === 'low';
}

/** The plants' cheap form is asked for (the build is on the low level). */
export function plantsLite(): boolean {
  return lite;
}
