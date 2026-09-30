import type { FogChoice, FogStep, GraphicsLevel } from '../types';

/**
 * The fog's step (docs/map-work/PERFORMANCE-PLAN.md 3c): how much of the
 * mist is drawn. It follows the Graphics level (it was a setting of its own;
 * the settings' Fog is now one slider, its thickness, below); `fog=` in the
 * URL holds a step for checks. The fog runs per pixel, so it costs more at a
 * bigger resolution. There is no "off": the mist hides the map's cut edges
 * and far things coming into view.
 *
 *            haze in every material                          sea of mist        banks
 *  full      distance haze, valley mist banks, wisps,        5 planes           all
 *            cloud shadows, the sea of mist's edge
 *  light     the same                                        2 planes (each a   edges, front, half
 *                                                            stack: as thick)   the far ones
 *  simple    distance haze, an even valley mist (no banks,   2 planes           edges and front only
 *            wisps or cloud shadows), the edge mist
 *
 * On every step the planes are a ring round the land (clouds.ts
 * `mistPlaneShape`): no pixel over the land runs their shader. The edge
 * mist (side and back edges, the sea reaching in over the front edge from
 * high up) and the edge banks stay on every step, so no cut edge shows.
 *
 * Auto, the map's, follows the graphics level (low simple, medium light,
 * high and max full). `fogNow.step` is read live by the parts that draw the fog (the haze
 * through the shared uniform `HAZE.fog`, sky/haze.ts; the planes and banks
 * in clouds.ts's update); a change shows at once, with no recompile.
 *
 * The fog's thickness (the settings' Fog slider, the free camera's; `fogamount=`
 * in a shot) is apart from the step: `fogNow.amount`, 0‥{@link FOG_AMOUNT_MAX},
 * 1 the game's own. It thins or thickens the mist over the land (the distance
 * haze, the valley mist and its banks, the wisps) as that much of it would:
 * 0 is clear air. The edge mist, the sea of mist and the banks round the land
 * are left as they are, so no cut edge shows at 0 either.
 */
export const fogNow: { step: FogStep; amount: number } = { step: 'full', amount: 1 };

/** The thickest the fog can be made: half again the game's own. */
export const FOG_AMOUNT_MAX = 1.5;

/** A fog amount that can be used (0‥{@link FOG_AMOUNT_MAX}); anything else is the game's own, 1. */
export const fogAmountOf = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(FOG_AMOUNT_MAX, Math.max(0, v)) : 1);

/** Auto's step for a graphics level. */
export const FOG_FOR_LEVEL: Record<GraphicsLevel, FogStep> = { low: 'simple', medium: 'light', high: 'full', max: 'full' };

/** The step for a choice and the graphics level in use. */
export const fogStepFor = (choice: FogChoice, level: GraphicsLevel): FogStep => (choice === 'auto' ? FOG_FOR_LEVEL[level] : choice);

/** Use a fog choice now (main.ts: at start and on a new graphics level). */
export function setFog(choice: FogChoice, level: GraphicsLevel): void {
  fogNow.step = fogStepFor(choice, level);
}
