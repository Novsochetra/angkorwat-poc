import type { Object3D } from 'three';
import type { AngkorExplorer } from '../../character/AngkorExplorer';
import { ACTIONS, PRAY } from '../../character/clips';
import { t } from '../ui/lang';
import { createPrayMark } from './_prayMark';
import { WORSHIP, type WorshipSpot } from './_worship';
import { angleDiff } from './followCam';
import type { RoamBody, RoamCtx, RoamHud } from './types';

/** E prays at a worship spot this near his feet (m: across, and up or down)… */
const NEAR = 5;
const NEAR_UP = 2.5;
/** …and in front of the shrine: within this angle (cos) of the line from the shrine out through the spot (not beside a wall of it). */
const FRONT = Math.cos((50 * Math.PI) / 180);
/** The lotus on the floor shows from this far (m: across, and up or down), brighter as he comes (full within `NEAR`); it fades at this rate (/s). */
const SEE = 16;
const SEE_UP = 5;
const FADE = 4;
/** The player's stick past this (or Space): he stops walking to the spot, or turning to the shrine. */
const STICK = 0.05;
/** Walking to the kneeling place after E: a calm walk (this share of his pace), slower over the last `SLOW` m, there within `THERE` (m). */
const PACE = 0.6;
const SLOW = 1.5;
const THERE = 0.2;
/** He kneels where he is once he has come no closer for this long (s: a candle stand in the way), or after this long in all. */
const STALL = 0.6;
const GO_FOR = 5;
/** The turn to face the shrine (s, for a half turn; a small one is quicker). */
const TURN = 0.55;
/** The temple bell at the first bow (gain of the 'enter' bell: soft). */
const BELL = 0.3;
/**
 * The camera while he prays: it comes down behind him to about eye level
 * and a little closer, looking the way he looks, so the Buddha shows over
 * his shoulder (through a pagoda's door, under a lintel) instead of the
 * roof from above. It eases there over the first `FRAME_FOR` s (after that
 * the player may look round), and back to where it was when he gets up.
 */
const FRAME = { pitch: 0.04, distance: 4.5, rate: 2.2, back: 2.5 };
const FRAME_FOR = 3;

export interface Prayer {
  /** The golden lotus on the floor where he would kneel (_prayMark.ts; in the scene from the start). */
  readonly object: Object3D;
  /** His hands are for the prayer (walking to it, turning to the shrine, kneeling, getting up): the lantern, torch or flashlight is put away. */
  readonly handsBusy: boolean;
  /** The prayer has his hat off (it goes back on at the end). */
  readonly hatOff: boolean;
  /**
   * On foot, before the walker's step: after E at a shrine, steer him to
   * its kneeling place as the stick would (the player's stick or Space:
   * never mind, he stops).
   */
  lead(ctx: RoamCtx): void;
  /**
   * On foot, after the walker's step: once he is at the kneeling place,
   * turn him to the shrine and start the prayer; while `pray` plays
   * (whoever started it, also `act=pray`) the hat and the bell on time;
   * the lotus. `free`: no camera or phone up, no album open.
   */
  step(ctx: RoamCtx, dt: number, free: boolean): void;
  /**
   * Get up now. `soft` (the stick, Space, a key): the hat and the tool come
   * back once he has got up; else (a new mode) at once.
   */
  stop(soft?: boolean): void;
  /** The player put the hat on or off during the prayer (H): it stays as they left it. */
  hatChosen(): void;
  /** A worship spot of its own (URL `kneelat=`, for checks and new shrines). */
  addSpot(spot: WorshipSpot): void;
}

export interface PrayerDeps {
  explorer: AngkorExplorer;
  body: RoamBody;
  hud: RoamHud;
  /** After the hat changes (photo.ts `refreshBody`, as the H key). */
  refreshBody(): void;
  /** A prayer was completed (the three bows done) at this spot (null: not at a known one): the passport's lotus seal. */
  onPrayed?(spot: WorshipSpot | null): void;
}

/** What E does at a shrine, for the walker (walker.ts). */
export interface ShrineHooks {
  /** He is on his way to a kneeling place, turning to the shrine, praying or getting up (no prompt over him meanwhile). */
  busy(): boolean;
  /** The worship spot E would pray at now: within reach of his feet and in front of its shrine (null: none, or busy). */
  near(): WorshipSpot | null;
  /** E there: he walks to the spot's kneeling place, turns to the shrine and kneels. */
  kneel(spot: WorshipSpot): void;
}

/**
 * The walker's link to the prayer: in its row of what E does close by
 * ("E  Pray", after a golden figure). `createPrayer` fills it in; until
 * then no shrine is near.
 */
export const shrine: ShrineHooks = { busy: () => false, near: () => null, kneel() {} };

/**
 * Paying respect at a shrine while roaming. Near a worship spot
 * (`_worship.ts`) a golden lotus glows on the floor where he would kneel
 * (_prayMark.ts), and in front of the shrine the walker offers "E  Pray"
 * (on touch, the Use button). E walks him onto the lotus; he turns to face
 * the shrine, puts away what is in his left hand, takes his hat off,
 * kneels, puts his palms together (sampeah) and bows three times (thvay
 * bangkum; the `pray` action, `PRAY` times in character/clips.ts), then
 * puts his hat back on and gets up. A soft temple bell rings at the first
 * bow. E, the stick, Space or a tool key gets him up at once (tools.ts).
 * (He no longer kneels by himself when he stands still there: a player
 * stopping to read "E  Pray" would kneel before pressing it, and E then
 * got him up again.)
 */
export function createPrayer(d: PrayerDeps): Prayer {
  const { explorer, body } = d;
  const extra: WorshipSpot[] = [];
  const lotus = createPrayMark();
  /** The spot the lotus is on, and how much it shows (0‥1). */
  let shown: WorshipSpot | null = null;
  let seen = 0;
  /** After E: walking to this spot's kneeling place: for how long (s), the nearest he has come (m) and how long ago (s). */
  let go: { spot: WorshipSpot; t: number; best: number; since: number } | null = null;
  /** The spot E chose (for the passport), until the prayer begins. */
  let chosen: WorshipSpot | null = null;
  /** Turning to the shrine: from which yaw, by how much, how far along and how long (s). */
  let turn: { from: number; by: number; t: number; len: number } | null = null;
  let praying = false;
  /** The prayer's time last step (s), to tell an end from a stop. */
  let lastT = 0;
  let hatDone = false;
  let hatTaken = false;
  let bellRung = false;
  /** The hands stay empty this long after the prayer (s): the arms come down from the bow first. */
  let restore = 0;
  /** Stopped part way: the hat goes back on once `restore` has run out (he is up). */
  let hatLater = false;
  /** The spot of this prayer, and whether it was completed (told once: `onPrayed`). */
  let prayedAt: WorshipSpot | null = null;
  let told = false;
  /** The player's camera before the prayer (to go back to), and how long it has been framed for the prayer (s). */
  let before: { pitch: number; distance: number } | null = null;
  let framed = 0;

  const busy = () => go !== null || turn !== null || praying || restore > 0 || explorer.currentAction === 'pray';

  /** Brings the camera down behind him while he turns and prays, and back after (see `FRAME`). */
  function frame(ctx: RoamCtx, dt: number): void {
    const cam = ctx.cam;
    if (turn || praying) {
      before ??= { pitch: cam.pitch, distance: cam.distance };
      framed += dt;
      if (framed > FRAME_FOR) return;
      const k = 1 - Math.exp(-FRAME.rate * dt);
      const yaw = turn ? turn.from + turn.by : body.yaw;
      cam.yaw += angleDiff(yaw, cam.yaw) * k;
      cam.pitch += (FRAME.pitch - cam.pitch) * k;
      cam.distance += (Math.min(before.distance, FRAME.distance) - cam.distance) * k;
      return;
    }
    if (!before) return;
    // (getting up: back to the player's own view)
    const k = 1 - Math.exp(-FRAME.back * dt);
    cam.pitch += (before.pitch - cam.pitch) * k;
    cam.distance += (before.distance - cam.distance) * k;
    if (Math.abs(before.pitch - cam.pitch) < 0.005 && Math.abs(before.distance - cam.distance) < 0.05) {
      before = null;
      framed = 0;
    }
  }

  /** The nearest spot within `reach` of his feet (`up` up or down) and, with `front`, in front of its shrine; or null. */
  function nearest(reach: number, up: number, front: boolean): WorshipSpot | null {
    const p = body.pos;
    let best: WorshipSpot | null = null;
    let bd = reach * reach;
    for (const list of [WORSHIP, extra])
      for (const s of list) {
        if (Math.abs(s.y - p.y) > up) continue;
        const dd = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
        if (dd >= bd) continue;
        if (front) {
          // (from the shrine: out to the spot, out to him)
          const ax = s.x - s.fx;
          const az = s.z - s.fz;
          const bx = p.x - s.fx;
          const bz = p.z - s.fz;
          if (ax * bx + az * bz < FRONT * Math.hypot(ax, az) * Math.hypot(bx, bz)) continue;
        }
        bd = dd;
        best = s;
      }
    return best;
  }

  /** The lotus on the spot nearest him: brighter as he comes, full where E prays; not while he kneels, nor in a photo. */
  function mark(ctx: RoamCtx, dt: number, free: boolean): void {
    const s = nearest(SEE, SEE_UP, false);
    let want = 0;
    if (s && free && !turn && !praying && restore === 0 && explorer.currentAction !== 'pray') {
      const far = (Math.hypot(s.x - body.pos.x, s.z - body.pos.z) - NEAR) / (SEE - NEAR);
      want = far <= 0 ? 1 : 0.8 * (1 - far);
    }
    // (on to another spot: it fades out here first)
    if (s !== shown) {
      if (seen < 0.01) shown = s;
      else want = 0;
    }
    seen += (want - seen) * (1 - Math.exp(-FADE * dt));
    lotus.show(shown, seen, ctx.t, ctx.night, body.scale);
  }

  /** From where he stands, turn him to face the shrine; he kneels at the end of the turn. */
  function turnTo(s: WorshipSpot): void {
    const by = angleDiff(Math.atan2(s.fx - body.pos.x, s.fz - body.pos.z), body.yaw);
    turn = { from: body.yaw, by, t: 0, len: TURN * (0.45 + (0.55 * Math.abs(by)) / Math.PI) };
  }

  function setHat(on: boolean): void {
    if (explorer.currentOutfit.hat === on) return;
    explorer.setOutfit({ hat: on });
    d.refreshBody();
  }

  function hatBack(): void {
    if (!hatTaken) return;
    hatTaken = false;
    setHat(true);
  }

  function begin(): void {
    praying = true;
    turn = go = null;
    lastT = 0;
    restore = 0;
    hatDone = hatTaken = bellRung = hatLater = false;
    // (the spot E chose; started from the URL, the one he is at)
    prayedAt = chosen ?? nearest(NEAR, NEAR_UP, true);
    chosen = null;
    told = false;
    d.hud.toast(t('rPray'));
  }

  /** The prayer is over: it ended (`soft`: the arms come down before the tool comes back), was stopped, or another action took over. */
  function ended(soft: boolean): void {
    praying = false;
    hatBack();
    restore = soft ? ACTIONS.pray.fadeOut : 0;
  }

  Object.assign(shrine, {
    busy,
    near: () => (busy() ? null : nearest(NEAR, NEAR_UP, true)),
    kneel(spot: WorshipSpot) {
      chosen = spot;
      go = { spot, t: 0, best: Infinity, since: 0 };
    },
  } satisfies ShrineHooks);

  return {
    object: lotus.object,
    get handsBusy() {
      return busy();
    },
    get hatOff() {
      return hatTaken;
    },
    lead(ctx) {
      if (!go) return;
      const input = ctx.input;
      if (Math.hypot(input.move.x, input.move.y) > STICK || input.jump) {
        go = chosen = null;
        return;
      }
      input.run = false;
      const dx = go.spot.x - body.pos.x;
      const dz = go.spot.z - body.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist < THERE) return;
      // The stick that walks him along (dx, dz) with the camera where it is (walker.ts turns it back).
      const k = (PACE * Math.min(1, Math.max(0.3, dist / SLOW))) / dist;
      const fx = Math.sin(ctx.cam.yaw);
      const fz = Math.cos(ctx.cam.yaw);
      input.move.x = (fx * dz - fz * dx) * k;
      input.move.y = (fx * dx + fz * dz) * k;
    },
    step(ctx, dt, free) {
      frame(ctx, dt);
      mark(ctx, dt, free);
      restore = Math.max(0, restore - dt);
      if (hatLater && restore === 0) {
        hatLater = false;
        hatBack();
      }

      // Driven by the action itself (so `act=pray` works too).
      const now = explorer.currentAction === 'pray';
      if (now && !praying) begin();
      else if (!now && praying) ended(lastT >= ACTIONS.pray.duration - ACTIONS.pray.fadeOut - 0.1);
      if (praying) {
        const at = explorer.animator.actionTime;
        lastT = at;
        if (!hatDone && at >= PRAY.hatOff) {
          hatDone = true;
          // (if the player had it off already, it stays off)
          if (explorer.currentOutfit.hat) {
            setHat(false);
            hatTaken = true;
          }
        }
        if (!bellRung && at >= PRAY.bows[0]) {
          bellRung = true;
          ctx.sound('enter', BELL);
        }
        if (at >= PRAY.hatOn) hatBack();
        // (the bows done, the hat going back on: a completed prayer)
        if (!told && at >= PRAY.hatOn) {
          told = true;
          d.onPrayed?.(prayedAt);
        }
        return;
      }

      // Walking to the kneeling place (`lead` steers him): there, or no nearer for a moment, or too long: he turns to the shrine.
      if (go) {
        if (!free || explorer.currentAction) {
          go = chosen = null;
          return;
        }
        go.t += dt;
        const dist = Math.hypot(go.spot.x - body.pos.x, go.spot.z - body.pos.z);
        if (dist < go.best - 0.05) {
          go.best = dist;
          go.since = 0;
        } else go.since += dt;
        // (not in the air: a hop up a step on the way)
        if (body.grounded && (dist < THERE || go.since > STALL || go.t > GO_FOR)) {
          turnTo(go.spot);
          go = null;
        }
        return;
      }

      // Turning to face the shrine (the stick or Space: never mind).
      if (turn) {
        const input = ctx.input;
        if (Math.hypot(input.move.x, input.move.y) > STICK || input.jump || !free || !body.grounded || explorer.currentAction) {
          turn = chosen = null;
          return;
        }
        turn.t += dt;
        const k = Math.min(1, turn.t / turn.len);
        body.yaw = turn.from + turn.by * k * k * (3 - 2 * k);
        if (k >= 1) {
          explorer.play('pray');
          begin();
        }
      }
    },
    stop(soft = false) {
      turn = go = chosen = null;
      // (a new mode: the lotus goes at once)
      if (!soft) {
        seen = 0;
        lotus.show(null, 0, 0, 0, 1);
      }
      if (explorer.currentAction === 'pray') explorer.stop('pray');
      if (!praying) {
        // (already getting up, and now a new mode: the hat goes back on at once, not later on foot)
        if (!soft && hatLater) {
          hatLater = false;
          restore = 0;
          hatBack();
        }
        return;
      }
      praying = false;
      if (soft) {
        // (the arms and legs come up out of the kneel first: no lantern in a flat hand, no hat put on from the floor)
        restore = ACTIONS.pray.fadeOut;
        hatLater = true;
      } else {
        restore = 0;
        hatLater = false;
        hatBack();
      }
    },
    hatChosen() {
      hatTaken = hatLater = false;
    },
    addSpot(spot) {
      extra.push(spot);
    },
  };
}
