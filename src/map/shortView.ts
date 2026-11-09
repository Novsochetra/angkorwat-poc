import type { Fog, Object3D, PerspectiveCamera } from 'three';
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
 * The far backdrop's rings of hills (sky/backdrop.ts, 950–2750 m out, round
 * the camera: three's frustum test never leaves them out) are hidden while
 * the view is short: wholly in the haze there, four draws for nothing.
 *
 * In the air (the glider, the hang glider, the balloon, the leap) the view is
 * whole: there the far land is the point, and the flights are short. The
 * haze eases in and out over a few seconds (landing, taking off, the switch),
 * and the far plane moves in only once the haze is whole, so nothing pops.
 */
export const SHORT = { far: 260, hazeNear: 70, hazeFar: 68, rate: 1.2 };
/** The camera's own far plane (main.ts). */
const WHOLE = 9000;

/**
 * The view is short now (wholly: the far plane in), and where the camera is (m):
 * the atmosphere draws the still shadows over a box round it then
 * (atmosphere.ts `NEAR_BOX`), not over the whole roaming area.
 */
export const SHORT_NOW = { on: false, x: 0, z: 0 };
const GROUND: ReadonlySet<RoamMode> = new Set<RoamMode>(['walk', 'boat']);

export class ShortView {
  /** How far in it is now: 0 the whole view … 1 short. */
  k = 0;
  /** What is hidden while the view is short (the far backdrop), and whether this hid it. */
  private readonly hide: Object3D[] = [];
  private hid = false;

  /** Hide these while the view is short (main.ts: the far backdrop). */
  hideWhenShort(...o: Object3D[]): void {
    this.hide.push(...o);
  }

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
    const short = k >= 1;
    SHORT_NOW.on = short;
    SHORT_NOW.x = camera.position.x;
    SHORT_NOW.z = camera.position.z;
    if (short !== this.hid) {
      this.hid = short;
      for (const o of this.hide) o.visible = !short;
    }
    const far = short ? SHORT.far : WHOLE;
    if (camera.far !== far) {
      camera.far = far;
      camera.updateProjectionMatrix();
    }
  }
}

const AUTO_KEY = 'angkor-map-auto-shortview';

/**
 * Auto turns Short view on, once, for a phone that cannot keep its 30 frames
 * a second at the lowest graphics level (main.ts: the Graphics setting on
 * Auto, the level low, on the ground while roaming, Short view off): frames
 * slower than {@link AUTO_SLOW} a second for {@link AUTO_WINDOWS} windows of
 * 2 s in a row. The setting is turned on as the player would (the switch
 * shows it, it is saved) and a toast says where it is; it is kept for this
 * device, so Auto never does it again, even if the player turns it off (picking
 * Auto again starts over: {@link reset}).
 */
export const AUTO_SLOW = 26;
export const AUTO_WINDOWS = 3;
export class AutoShortView {
  /** Auto has turned it on before on this device. */
  done: boolean;
  private time = 0;
  private frames = 0;
  private slow = 0;

  constructor() {
    let kept: string | null = null;
    try {
      kept = localStorage.getItem(AUTO_KEY);
    } catch {
      /* no storage */
    }
    this.done = kept === '1';
  }

  /** A frame at full pace took `dt` s; `may`: Auto may turn it on now. True: turn it on. */
  watch(dt: number, may: boolean): boolean {
    if (!may || this.done || dt > 0.25) {
      this.time = this.frames = this.slow = 0;
      return false;
    }
    this.time += dt;
    this.frames++;
    if (this.time < 2) return false;
    const avg = this.time / this.frames;
    this.time = this.frames = 0;
    this.slow = avg > 1 / AUTO_SLOW ? this.slow + 1 : 0;
    if (this.slow < AUTO_WINDOWS) return false;
    this.done = true;
    try {
      localStorage.setItem(AUTO_KEY, '1');
    } catch {
      /* this visit only */
    }
    return true;
  }

  /** Auto picked again in the settings: it may turn Short view on again. */
  reset(): void {
    this.done = false;
    this.time = this.frames = this.slow = 0;
    try {
      localStorage.removeItem(AUTO_KEY);
    } catch {
      /* no storage */
    }
  }
}
