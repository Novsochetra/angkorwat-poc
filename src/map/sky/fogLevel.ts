import type { FogChoice, FogStep, GraphicsLevel } from '../types';

/**
 * The Fog setting (docs/map-work/PERFORMANCE-PLAN.md 3c): how much of the
 * mist is drawn, apart from the Graphics level. The fog runs per pixel, so
 * it costs more at a bigger resolution. There is no "off": the mist hides
 * the map's cut edges and far things coming into view.
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
 * Auto follows the graphics level (low simple, medium light, high and max
 * full). `fogNow.step` is read live by the parts that draw the fog (the haze
 * through the shared uniform `HAZE.fog`, sky/haze.ts; the planes and banks
 * in clouds.ts's update); a change shows at once, with no recompile.
 */
export const fogNow: { step: FogStep } = { step: 'full' };

/** Auto's step for a graphics level. */
export const FOG_FOR_LEVEL: Record<GraphicsLevel, FogStep> = { low: 'simple', medium: 'light', high: 'full', max: 'full' };

/** The step for a choice and the graphics level in use. */
export const fogStepFor = (choice: FogChoice, level: GraphicsLevel): FogStep => (choice === 'auto' ? FOG_FOR_LEVEL[level] : choice);

/** Use a fog choice now (main.ts: at start, on a new setting or a new graphics level). */
export function setFog(choice: FogChoice, level: GraphicsLevel): void {
  fogNow.step = fogStepFor(choice, level);
}
