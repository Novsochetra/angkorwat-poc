import { t } from '../ui/lang';
import type { AddonEnv, AddonHold } from './_addons';
import { BODHI, BODHI_PLAN, bodhiCue, bodhiToWorld } from './_bodhiHooks';
import { GardenHands } from './_gardenProps';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * The head monk gives him the bodhi sapling (roam/_bodhi.ts): E "Talk to the
 * monk" beside him (people/_sceneBodhiMonk.ts). He steps up to the monk and
 * greets him the Khmer way, palms raised to his face (`greetHigh`: as one greets a
 * monk); the monk asks after him and his garden ("សុខសប្បាយទេ ញោម? …"), holds
 * the sapling out in both hands in its black nursery bag — "Plant it here at the
 * wat, as an act of merit" —; he takes it (the `interact` action; the sapling in
 * his hands a moment: roam/_gardenProps.ts), the toast, he thanks him with
 * another sampeah, and the monk points to the ring of stones by the hall where it
 * is to go ("សូមដាំវានៅត្រង់រង្វង់ថ្មនោះ…"). The camera comes round to their
 * side, both in view.
 *
 * Until the sapling is in his hands (`TAKEN`) nothing is kept: back to the map
 * meanwhile, and the monk offers it again next time.
 */

/** The timeline (s from E): he greets, the monk talks, holds it out, he takes it, it is his, he thanks him, the monk shows the place. */
export const TALK = { greet: 0.45, give: 3.4, take: 5.0, taken: 5.7, bag: 6.9, thank: 7.3, show: 8.6, end: 12.2 } as const;
/** How far in front of the monk he stands (m, at his roaming size), how fast he steps there (m/s), how fast he turns (1/s). */
const GAP = 2.0;
const STEP = 1.3;
const TURN = 7;
/** The camera on their side: how far, how high (radians), and how fast it comes round (1/s). */
const CAM = { dist: 6.4, pitch: 0.2, rate: 1.8 };
/** While the sapling is in his hands: the planting's moment with the bagged seedling in both hands (garden/actions.ts `plantTree`). */
const HELD_AT = 3.0;

export interface TalkSession {
  readonly kind: 'talk';
  readonly time: number;
  readonly done: boolean;
  /** Before the mode's step (the add-on's `input`): the drag still looks round. */
  input(ctx: RoamCtx): void;
  hold(ctx: RoamCtx, dt: number): AddonHold;
  /** At once (a new mode, back to the map): the monk goes back to his day if the sapling is not his yet. */
  stop(): void;
}

/** Start talking to the monk (`at`: seconds already in, a URL's `bodhi=talk`); `given` when the sapling is his. */
export function startTalk(env: AddonEnv, ctx: RoamCtx, given: () => void, at = 0): TalkSession {
  const m = BODHI.monk;
  const body = ctx.body;
  // Where the monk stands (as the scene has him; a still that has not stepped him yet: the middle of his grass).
  let gx = m.x;
  let gz = m.z;
  if (!m.shown || !Number.isFinite(gx)) ({ x: gx, z: gz } = bodhiToWorld(BODHI_PLAN.sweep.x, BODHI_PLAN.sweep.z));
  // Where he stands: toward him from the monk, a step and a half off; on the ground the monk stands on.
  let dx = body.pos.x - gx;
  let dz = body.pos.z - gz;
  const d = Math.hypot(dx, dz);
  if (d < 0.2) {
    dx = 0;
    dz = 1;
  } else {
    dx /= d;
    dz /= d;
  }
  const gap = GAP * (body.scale / 1.4);
  let sx = gx + dx * gap;
  let sz = gz + dz * gap;
  const w = ctx.world;
  const h = 1.7 * body.scale * 0.95;
  let sy = w.standAt ? w.standAt(sx, sz, body.pos.y + 0.5, 0.6, h) : w.groundAt(sx, sz);
  if (!Number.isFinite(sy) || Math.abs(sy - body.pos.y) > 0.6) {
    sx = body.pos.x;
    sz = body.pos.z;
    sy = body.pos.y;
  }
  const face = Math.atan2(gx - sx, gz - sz);
  // The camera's side: square to the line between them, the side with more room (else the side it is on now).
  const nx = -dz;
  const nz = dx;
  const mx = (gx + sx) / 2;
  const mz = (gz + sz) / 2;
  const my = sy + 1.7 * body.scale * 0.8;
  const clear = (sd: number) => {
    const cw = w.hardClearance ?? w.clearance;
    const r = CAM.dist * (body.scale / 1.4);
    return cw ? cw(mx, my, mz, mx + nx * sd * r * Math.cos(CAM.pitch), my + r * Math.sin(CAM.pitch), mz + nz * sd * r * Math.cos(CAM.pitch)) : 1;
  };
  const cx = ctx.cam.camera.position.x - mx;
  const cz = ctx.cam.camera.position.z - mz;
  const here = at > 0 ? 1 : nx * cx + nz * cz >= 0 ? 1 : -1;
  const side = clear(-here) > clear(here) + 0.15 ? -here : here;
  const camYaw = Math.atan2(-nx * side, -nz * side);
  const before = { pitch: ctx.cam.pitch, distance: ctx.cam.distance };
  let time = at;
  let done = false;
  let fired: (keyof typeof TALK)[] = at > 0 ? (Object.keys(TALK) as (keyof typeof TALK)[]).filter((k) => TALK[k] <= at) : [];
  const fire = (k: keyof typeof TALK) => {
    if (fired.includes(k) || time < TALK[k]) return false;
    fired = [...fired, k];
    return true;
  };
  const ex = env.explorer;
  const hands = new GardenHands(ex);
  let holding = false;
  /** The player has looked round (a drag): the camera is theirs from then on. */
  let dragged = false;
  const cueNow = () => (at >= TALK.show ? 'show' : at >= TALK.taken ? 'taken' : at >= TALK.give ? 'give' : 'talk');
  bodhiCue(cueNow(), { x: sx, y: sy, z: sz });
  if (at >= TALK.taken) given();
  if (at > 0) {
    body.pos.set(sx, sy, sz);
    body.yaw = face;
    ctx.cam.yaw = camYaw;
    ctx.cam.pitch = CAM.pitch;
    ctx.cam.distance = CAM.dist;
    if (at >= TALK.taken && at < TALK.bag) {
      holding = true;
      hands.update('plantTree', HELD_AT, 'bodhi');
    }
  }
  body.vel.set(0, 0, 0);

  const finish = () => {
    if (holding) hands.clear();
    holding = false;
  };

  return {
    kind: 'talk',
    get time() {
      return time;
    },
    get done() {
      return done;
    },
    input(c) {
      const i = c.input;
      c.cam.turn(i.lookYaw, i.lookPitch, i.zoom);
      if (i.lookYaw || i.lookPitch) dragged = true;
    },
    hold(c, dt) {
      time += dt;
      const { cam } = c;
      body.vel.set(0, 0, 0);
      body.grounded = true;
      // He steps up to the monk and turns to face him.
      const ddx = sx - body.pos.x;
      const ddz = sz - body.pos.z;
      const dist = Math.hypot(ddx, ddz);
      if (dist > 0.03) {
        const v = STEP * (body.scale / 1.4);
        const step = Math.min(dist, v * dt);
        body.pos.x += (ddx / dist) * step;
        body.pos.z += (ddz / dist) * step;
        body.pos.y += (sy - body.pos.y) * Math.min(1, dt * 10);
        const want = dist > 0.3 ? Math.atan2(ddx, ddz) : face;
        body.yaw += angleDiff(want, body.yaw) * Math.min(1, dt * TURN);
        ex.setMotion(step / Math.max(1e-3, dt) / body.scale, true, 0);
      } else {
        body.pos.set(sx, sy, sz);
        body.yaw += angleDiff(face, body.yaw) * Math.min(1, dt * TURN);
        ex.setMotion(0, true, 0);
      }
      // (a sampeah to a monk: palms raised to his face; the monk does not bow back to a lay person)
      if (fire('greet')) {
        if (ex.currentAction) ex.stop();
        ex.play('greetHigh');
        c.sound('greet', 1);
      }
      if (fire('give')) bodhiCue('give', body.pos);
      if (fire('take')) {
        if (ex.currentAction) ex.stop();
        ex.play('interact');
      }
      if (fire('taken')) {
        bodhiCue('taken', body.pos);
        given();
        holding = true;
        hands.update('plantTree', HELD_AT, 'bodhi');
        c.hud.toast(t('gardenBodhiGot'));
      }
      // (the sapling into his bag; then his thanks)
      if (fire('bag')) finish();
      if (fire('thank')) {
        if (ex.currentAction) ex.stop();
        ex.play('greetHigh');
      }
      if (fire('show')) bodhiCue('show', body.pos);
      if (fire('end')) {
        bodhiCue('idle');
        done = true;
        cam.pitch = before.pitch;
        cam.distance = before.distance;
      }
      // The camera: on their side, both in view, looking at the middle between them.
      // (a check's start: there at once, while the still settles)
      const k = 1 - Math.exp(-(at > 0 ? 30 : CAM.rate) * dt);
      if (time < 1.4 || !dragged) {
        cam.yaw += angleDiff(camYaw, cam.yaw) * k * (time < 2.5 || at > 0 ? 1 : 0.2);
        cam.pitch += (CAM.pitch - cam.pitch) * k;
        cam.distance += (CAM.dist * (body.scale / 1.4) - cam.distance) * k;
      }
      const hh = 1.7 * body.scale * 0.8;
      cam.focus.set((body.pos.x + (m.shown ? m.x : gx)) / 2, body.pos.y + hh, (body.pos.z + (m.shown ? m.z : gz)) / 2);
      cam.behindYaw = cam.yaw;
      return { prompt: null };
    },
    stop() {
      finish();
      if (done) return;
      done = true;
      // (not his yet: the monk goes back to his broom, and offers it again next time)
      bodhiCue('idle');
      if (ex.currentAction === 'interact' || ex.currentAction === 'greetHigh') ex.stop();
    },
  };
}
