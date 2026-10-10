import type { Vector3 } from 'three';
import type { AngkorExplorer } from '../../character/AngkorExplorer';
import { applyCarryWalk, yokePlace, type CarryWalk } from '../../character/carryPole';
import { gardenBody, gardenPose, gardenYoke } from '../../character/gardenWork';
import type { PoleAction } from '../garden/actions';
import type { Plant } from '../garden/state';
import { Yoke } from './_carryPoleProps';

/**
 * His body with the shoulder pole, for the carry add-on (roam/_carryPole.ts): the pole and its buckets on him
 * (roam/_carryPoleProps.ts `Yoke`: built once, hung on his right shoulder, the buckets swinging by its `YokeRig`), his
 * upper body over his walk (character/carryPole.ts `applyCarryWalk`), and an action's posture while one runs
 * (character/gardenWork.ts `gardenPose` with a pole action; where it puts the pole and buckets: `gardenYoke`).
 *
 * Each frame after his animation (the add-on's `frame`): `frame(dt, walk, fill, run)`. The swing is `yoke.rig` (sway,
 * slosh, spill, spills, bounce: read after `frame`).
 */
export class CarryPoleBody {
  readonly yoke = new Yoke('medium');
  private on = false;
  /** The action's body (its posture reads it), and whether one is on. */
  private readonly work = gardenBody('poleUp');
  private acting = false;
  private readonly place = yokePlace();
  private readonly posture = () => gardenPose(this.work);
  /** His chest's turn as the walk overlay left it (NaN: none yet). */
  private readonly left = [NaN, NaN, NaN];

  constructor(private readonly explorer: AngkorExplorer) {}

  /** The pole and buckets are on him now (checks). */
  get carried(): boolean {
    return this.on;
  }

  /** The pole on him (on his shoulder, or in his hands for an action) or not. */
  carry(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    if (on) this.yoke.carry(this.explorer);
    else this.yoke.drop();
  }

  /**
   * An action at `t` s (its place `spot` in his space, BU: the pole's foot, the water, the jar's mouth, the plant's
   * foot; `dt` its step, for his breathing), or none (`a` null): his posture is the action's while it runs. Taking it
   * up from where it leans at his house, or leaning it back there: `lean` (its foot and top in his space, BU), else it
   * lies on its buckets.
   */
  act(a: PoleAction | null, t: number, spot?: Vector3, plant?: Plant | null, dt = 0, lean: { foot: Vector3; top: Vector3 } | null = null): void {
    const anim = this.explorer.animator;
    if (a === null) {
      if (this.acting && anim.posture === this.posture) {
        anim.posture = null;
        anim.postureFeet = true;
      }
      this.acting = false;
      return;
    }
    const w = this.work;
    if (!this.acting || w.action !== a) w.life = 0;
    w.action = a;
    w.t = t;
    w.life += dt;
    w.kind = plant?.kind ?? null;
    if (spot) w.spot.copy(spot);
    const r = w.poleRest;
    r.at = lean ? 'lean' : 'ground';
    if (lean) {
      r.foot.copy(lean.foot);
      r.top.copy(lean.top);
    }
    this.acting = true;
    anim.posture = this.posture;
    anim.postureFeet = false;
  }

  /** Each frame after his pose: his upper body with the pole (walking), the pole placed (on his shoulder, or as the action's pose has it), the buckets swinging. */
  frame(dt: number, walk: CarryWalk, fill: readonly [number, number], run: number): void {
    if (!this.on) return;
    this.yoke.setWater(fill[0], fill[1]);
    if (this.acting) this.yoke.frame(dt, 0, gardenYoke(this.work, this.place));
    else {
      // (his walk overlay adds to the pose his animation set this frame: when nothing posed him since — a shot's
      // still frames, a paused animation — the chest is as it was left, and adding again would bend him double)
      const chest = this.explorer.rig.joints.chest.rotation;
      const fresh = chest.x !== this.left[0] || chest.y !== this.left[1] || chest.z !== this.left[2];
      if (fresh) {
        applyCarryWalk(this.explorer.rig, walk);
        this.left[0] = chest.x;
        this.left[1] = chest.y;
        this.left[2] = chest.z;
      }
      this.yoke.frame(dt, run);
    }
    // (the swing's first frame after it is hung on him reads no speed yet: what it says is taken as calm)
    const rig = this.yoke.rig;
    if (!Number.isFinite(rig.spill + rig.spills[0] + rig.spills[1] + rig.slosh + rig.sway + rig.bounce)) {
      rig.spill = rig.spills[0] = rig.spills[1] = rig.slosh = rig.sway = rig.bounce = 0;
    }
  }
}
