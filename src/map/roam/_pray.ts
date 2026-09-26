import type { AngkorExplorer } from '../../character/AngkorExplorer';
import { ACTIONS, PRAY } from '../../character/clips';
import { t } from '../ui/lang';
import { WORSHIP, type WorshipSpot } from './_worship';
import { angleDiff } from './followCam';
import type { RoamBody, RoamCtx, RoamHud } from './types';

/** He kneels once he has stood still this long (s)… */
const STILL_FOR = 1.0;
/** …with a worship spot this near his feet (m: across, and up or down). */
const NEAR = 5;
const NEAR_UP = 2.5;
/** …and in front of the shrine: within this angle (cos) of the line from the shrine out through the spot (not beside a wall of it). */
const FRONT = Math.cos((50 * Math.PI) / 180);
/** Standing still: slower than this (m/s), the stick under this. */
const STILL_SPEED = 0.3;
const STICK = 0.05;
/** A spot he prayed at comes back once he has been this far from it (m). */
const AWAY = 12;
/** The turn to face the shrine (s, for a half turn; a small one is quicker). */
const TURN = 0.55;
/** The temple bell at the first bow (gain of the 'enter' bell: soft). */
const BELL = 0.3;

export interface Prayer {
  /** His hands are for the prayer (turning to the shrine, kneeling, getting up): the lantern, torch or flashlight is put away. */
  readonly handsBusy: boolean;
  /** The prayer has his hat off (it goes back on at the end). */
  readonly hatOff: boolean;
  /**
   * On foot, after the walker's step: watch for a still stand by a shrine,
   * turn him to it, start the prayer; while `pray` plays (whoever started
   * it, also `act=pray`) the hat and the bell on time. `free`: no camera or
   * phone up, no album open.
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

/**
 * Paying respect at a shrine while roaming: when the explorer stands still
 * for a moment near a worship spot (`_worship.ts`), he turns to face it,
 * puts away what is in his left hand, takes his hat off, kneels, puts his
 * palms together (sampeah) and bows three times (thvay bangkum; the `pray`
 * action, `PRAY` times in character/clips.ts), then puts his hat back on and
 * gets up. A soft temple bell rings at the first bow. The stick or Space
 * gets him up at once (tools.ts). He prays at a spot again only after he
 * has been well away from it.
 */
export function createPrayer(d: PrayerDeps): Prayer {
  const { explorer, body } = d;
  const extra: WorshipSpot[] = [];
  /** Spots he prayed at (until he has been `AWAY` from them). */
  const used = new Set<WorshipSpot>();
  let still = 0;
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

  /** The nearest spot within reach of his feet and in front of its shrine (used or not), or null. */
  function nearest(): WorshipSpot | null {
    const p = body.pos;
    let best: WorshipSpot | null = null;
    let bd = NEAR * NEAR;
    for (const list of [WORSHIP, extra])
      for (const s of list) {
        if (Math.abs(s.y - p.y) > NEAR_UP) continue;
        const dd = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
        if (dd >= bd) continue;
        // (from the shrine: out to the spot, out to him)
        const ax = s.x - s.fx;
        const az = s.z - s.fz;
        const bx = p.x - s.fx;
        const bz = p.z - s.fz;
        if (ax * bx + az * bz < FRONT * Math.hypot(ax, az) * Math.hypot(bx, bz)) continue;
        bd = dd;
        best = s;
      }
    return best;
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
    turn = null;
    lastT = 0;
    restore = 0;
    hatDone = hatTaken = bellRung = hatLater = false;
    // (started from the URL too: not again at once at this spot)
    const s = nearest();
    if (s) used.add(s);
    prayedAt = s;
    told = false;
    d.hud.toast(t('rPray'));
  }

  /** The prayer is over: it ended (`soft`: the arms come down before the tool comes back), was stopped, or another action took over. */
  function ended(soft: boolean): void {
    praying = false;
    hatBack();
    restore = soft ? ACTIONS.pray.fadeOut : 0;
  }

  return {
    get handsBusy() {
      return turn !== null || praying || restore > 0 || explorer.currentAction === 'pray';
    },
    get hatOff() {
      return hatTaken;
    },
    step(ctx, dt, free) {
      const p = body.pos;
      for (const s of used) if ((s.x - p.x) ** 2 + (s.z - p.z) ** 2 > AWAY * AWAY) used.delete(s);
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
        still = 0;
        return;
      }

      const input = ctx.input;
      const moving = Math.hypot(input.move.x, input.move.y) > STICK || input.jump;
      // Turning to face the shrine (the stick or Space: never mind).
      if (turn) {
        if (moving || !free || !body.grounded || explorer.currentAction) {
          turn = null;
          still = 0;
          return;
        }
        turn.t += dt;
        const k = Math.min(1, turn.t / turn.len);
        body.yaw = turn.from + turn.by * k * k * (3 - 2 * k);
        if (k >= 1) {
          explorer.play('pray');
          begin();
        }
        return;
      }

      // Standing still by a shrine for a moment (not running past it).
      if (!free || moving || !body.grounded || explorer.currentAction || Math.hypot(body.vel.x, body.vel.z) > STILL_SPEED) {
        still = 0;
        return;
      }
      still += dt;
      if (still < STILL_FOR) return;
      const spot = nearest();
      if (!spot || used.has(spot)) return;
      used.add(spot);
      still = 0;
      const by = angleDiff(Math.atan2(spot.fx - p.x, spot.fz - p.z), body.yaw);
      turn = { from: body.yaw, by, t: 0, len: TURN * (0.45 + (0.55 * Math.abs(by)) / Math.PI) };
    },
    stop(soft = false) {
      turn = null;
      still = 0;
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
