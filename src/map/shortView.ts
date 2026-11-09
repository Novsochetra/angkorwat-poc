import type { Fog, PerspectiveCamera } from 'three';
import { fogNow } from './sky/fogLevel';
import type { RoamMode } from './types';

/**
 * Short view (the Graphics page's switch; `shortview=1` in the URL): on the
 * ground while roaming (walking, riding, in the boat), the haze closes in and
 * nothing past it is drawn.
 *
 * An ordinary phone's GPU is several times slower than the iPhone the low
 * level was tuned on, and in a walk a third of the frame is far away: past
 * 250 m lie ≈ 30 % of the picture's triangles in the floating village and
 * 40 % by the sugar-palm village's market, and about as large a share of the
 * draws (whole 150 m chunks of land, 100 m tiles of trees, temples on the
 * horizon). Here the distance haze (sky/haze.ts: `1 − exp(−t^1.4)`, `t` the
 * metres past `fog.near` over `fog.far`) is clear to {@link SHORT.hazeNear}
 * m and 98.5 % by {@link SHORT.far} m, and the camera's far plane is put
 * there, so three leaves out everything wholly past it (its frustum test) and
 * the haze hides where the land stops. The fog's thickness is at least the
 * game's own meanwhile (clear air would show the cut).
 *
 * In the air (the glider, the hang glider, the balloon, the leap) the view is
 * whole: there the far land is the point, and the flights are short. The
 * haze eases in and out over a few seconds (landing, taking off, the switch),
 * and the far plane moves in only once the haze is whole, so nothing pops.
 */
export const SHORT = { far: 260, hazeNear: 70, hazeFar: 68, rate: 1.2 };
/** The camera's own far plane (main.ts). */
const WHOLE = 9000;
const GROUND: ReadonlySet<RoamMode> = new Set<RoamMode>(['walk', 'boat']);

export class ShortView {
  /** How far in it is now: 0 the whole view … 1 short. */
  k = 0;

  /**
   * Each frame, after the parts' updates (the atmosphere has set the haze):
   * `on` the setting, `mode` the roaming mode the parts see, `dt` the frame's
   * step (0: at once), `amount` the fog's thickness as set.
   */
  apply(on: boolean, mode: RoamMode, dt: number, fog: Fog, camera: PerspectiveCamera, amount: number): void {
    const want = on && GROUND.has(mode) ? 1 : 0;
    this.k = dt > 0 ? this.k + (want - this.k) * (1 - Math.exp(-dt * SHORT.rate)) : want;
    if (Math.abs(want - this.k) < 2e-3) this.k = want;
    const k = this.k;
    if (k > 0) {
      // (nearer than the weather's own haze, never farther: rain draws it in already)
      fog.near += (Math.min(fog.near, SHORT.hazeNear) - fog.near) * k;
      fog.far += (Math.min(fog.far, SHORT.hazeFar) - fog.far) * k;
    }
    fogNow.amount = k > 0 ? Math.max(amount, k) : amount;
    const far = k >= 1 ? SHORT.far : WHOLE;
    if (camera.far !== far) {
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }
}
