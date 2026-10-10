import { Vector3, type Group } from 'three';
import { BLESS_BOWS, BLESS_HAT, BLESS_KNEEL, BLESS_RISE, blessPose, blessState } from '../../character/blessing';
import { PRAY, PRAY_PALMS } from '../../character/clips';
import { gardenBody, gardenPose } from '../../character/gardenWork';
import { buildHand } from '../../character/parts/limbs';
import { JOINTS } from '../../character/skeleton';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { BODY_UNIT_M } from '../../world/scale';
import '../audio/_bless';
import '../audio/_garden';
import { SFX } from '../audio/addonSfx';
import { ACTIONS } from '../garden/actions';
import { pad } from '../pad/pad';
import { t } from '../ui/lang';
import type { AddonEnv, AddonHold } from './_addons';
import { BODHI, BODHI_FLICKS, BODHI_PLAN, BODHI_TREE, bodhiCue, bodhiToWorld, bodhiYaw } from './_bodhiHooks';
import { GardenHands } from './_gardenProps';
import { clearView, groundLantern } from './_bodhiSight';
import { gardenSay } from './_gardenToasts';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * Planting the bodhi tree at the pagoda (roam/_bodhi.ts): E "Plant the bodhi tree"
 * at the ring of stones.
 *
 * - **Planting**: he steps to the ring and plants the sapling as he plants a
 *   tree at home (garden/actions.ts `plantTree`: four chops of the hoe, he kneels,
 *   tears the black bag off, sets the root ball in the hole, firms the earth with
 *   both hands, stands; the poses character/gardenWork.ts, what he holds
 *   roam/_gardenProps.ts, the sounds audio/_garden.ts). As the root ball goes in,
 *   the tree is his (`GARDEN.plant('bodhi', …, 'pagoda')`: the garden's view draws
 *   it, the monks water it). Meanwhile the head monk walks over to his place
 *   beside it, the sprig for the lustral water in his hand.
 * - **The blessing**: he steps back a pace and kneels before the sapling, his hat
 *   off, sits back on his heels, palms together at his face (the kneel of the
 *   monk's blessing: character/blessing.ts). The monk chants the Pali blessing
 *   (audio/_bless.ts `blessChant`, his bubbles the Pali lines), then raises the
 *   sprig and flicks the water over the sapling and over him (the drops land: his
 *   eyes shut); then the blessing in Khmer ("សូមឱ្យដើមពោធិ៍នេះលូតលាស់…"). He bows
 *   three times to the ground (the temple bell at the first), gets up, his hat
 *   back on; the monk nods and goes back to his day. The toast: "Sathu! …".
 * - **Leaving off**: E, Space or the stick (once the sapling is in the ground) gets
 *   him up; back to the map, all stops at once (the tree stays planted).
 *
 * With no monk (the people part left out) he plants it and stands, and the toast
 * says the same.
 *
 * The camera comes round to his right side, low and square to the line from him to
 * the sapling: him in profile on its left, the sapling on its right, the monk
 * standing beyond the sapling, facing him; a drag looks round.
 */

/** The steps, in order (`go`: to his place at the ring). */
type Step = 'go' | 'plant' | 'back' | 'down' | 'settle' | 'chant' | 'sprinkle' | 'words' | 'bow' | 'up' | 'leave' | 'end';

/** Seconds a step lasts (a fixed one), the kneel's rates (as the monk's blessing: roam/_blessing.ts). */
const BACK_T = 0.7;
const KNEEL_RATE = 1.15;
const SETTLE_T = 0.8;
const CHANT_T = 4.4;
const SPRINKLE_T = 3.4;
const WORDS_T = 4.0;
const BOW_RATE = 1.0;
const LEAVE_T = 0.6;
/** He walks to the ring at this pace (m/s at his roaming size), turns this fast (1/s). */
const STEP = 1.3;
const TURN = 7;
/** Bowed under the chant and the water (character/blessing.ts `bowHead`). */
const BOW_HEAD = 0.55;
/** The stick past this, Space or E: leave off. */
const STICK = 0.35;
/**
 * The camera: on his right (`places`, the first with a clear view; local x, z from the tree: he kneels at `BODHI_PLAN.kneel` facing it, the monk across
 * the sapling from him), looking across him at a point between the sapling and him, low; eased there over `for` s, then the player's
 * (a drag); back to where it was after.
 */
const FRAME = { places: [[5.6, 0.75], [5.2, 2.6], [5.3, -1.4], [3.9, 4.4], [4.2, -3.2]] as const, look: { x: -0.6, z: 0.85 }, y: 1.2, pitch: 0.15, rate: 1.8, back: 2.2, for: 3.5 };

export interface PlantSession {
  readonly kind: 'plant';
  readonly done: boolean;
  readonly step: Step;
  /** Seconds since E. */
  readonly time: number;
  /** Before the mode's step (the add-on's `input`): leaving off (E, Space, the stick), the drag looks round. */
  input(ctx: RoamCtx): void;
  hold(ctx: RoamCtx, dt: number): AddonHold;
  /** At once (a new mode, back to the map): up, his hat back on; the sapling, if set, stays planted. */
  stop(): void;
}

const _v = new Vector3();
const _f = { x: 0, z: 0 };

/** A point on the map in his space (BU), into `out`. */
function toBody(ctx: RoamCtx, x: number, y: number, z: number, out: Vector3): Vector3 {
  const b = ctx.body;
  const k = 1 / (BODY_UNIT_M * b.scale);
  const dx = x - b.pos.x;
  const dz = z - b.pos.z;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return out.set((c * dx - s * dz) * k, (y - b.pos.y) * k, (s * dx + c * dz) * k);
}

const smooth = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
const over = (x: number, a: number, b: number) => smooth((x - a) / (b - a));

/** His flat hands for the sampeah (made once, kept). */
let flat: { L: Group; R: Group } | null = null;

/**
 * Start planting (`plant`: puts the tree in the ground and returns whether it did, at the root ball's moment); `at`
 * seconds already in (a URL's `bodhi=plant:<s>`: run on at once, silently, his place reached).
 */
export function startPlant(env: AddonEnv, ctx: RoamCtx, plant: () => boolean, at = 0): PlantSession {
  const ex = env.explorer;
  const body = ctx.body;
  const tree = { x: BODHI_TREE.x, z: BODHI_TREE.z };
  const ground = ctx.world.field.heightAt(tree.x, tree.z);
  const standW = bodhiToWorld(BODHI_PLAN.stand.x, BODHI_PLAN.stand.z, { x: 0, z: 0 });
  const kneelW = bodhiToWorld(BODHI_PLAN.kneel.x, BODHI_PLAN.kneel.z, { x: 0, z: 0 });
  const stand = new Vector3(standW.x, ground, standW.z);
  const kneel = new Vector3(kneelW.x, ground, kneelW.z);
  // (facing the tree: back toward it along its front)
  const facing = bodhiYaw(Math.PI);
  const gb = gardenBody('plantTree');
  gb.kind = 'bodhi';
  const ps = blessState();
  const hands = new GardenHands(ex);
  const garden = () => gardenPose(gb);
  const kneeling = () => blessPose(ps);
  const monk = BODHI.monk;
  const blessing = monk.ready;
  let step = 'go' as Step;
  let st = 0;
  let time = 0;
  let done = false;
  let planted = false;
  let silent = false;
  let hatTaken = false;
  let handsOpen = false;
  let faceShown: 'asleep' | 'happy' | null = null;
  let framed = 0;
  /** A check's start: the camera put there at once. */
  let snap = false;
  const before = { pitch: ctx.cam.pitch, distance: ctx.cam.distance, restored: false };
  const lookAt = bodhiToWorld(FRAME.look.x, FRAME.look.z, { x: 0, z: 0 });
  // (the first of its places with nothing in the way: no plant, tree or wall before the lens; _bodhiSight.ts)
  const camAt = { x: 0, z: 0 };
  const sightFrom = new Vector3(lookAt.x, ground + FRAME.y * (body.scale / 1.4), lookAt.z);
  const sightTo = new Vector3();
  for (const [ax, az] of FRAME.places) {
    bodhiToWorld(ax, az, camAt);
    const d = Math.hypot(lookAt.x - camAt.x, lookAt.z - camAt.z);
    sightTo.set(camAt.x, sightFrom.y + Math.tan(FRAME.pitch) * d, camAt.z);
    if (clearView(env, sightFrom, sightTo)) break;
  }
  const camYaw = Math.atan2(lookAt.x - camAt.x, lookAt.z - camAt.z);
  const camDist = Math.hypot(lookAt.x - camAt.x, lookAt.z - camAt.z);
  /**
   * His lantern set down after dark (his hands are for the sampeah): before him at his left, toward the sapling (the
   * camera is on his right): it lights his face, the sapling and the monk across it, its glass half hidden by him.
   */
  const lantern = groundLantern(env);
  const lanternAt = bodhiToWorld(BODHI_PLAN.kneel.x - 0.5, BODHI_PLAN.kneel.z - 0.6, { x: 0, z: 0 });

  const go = (s: Step) => {
    step = s;
    st = 0;
  };
  const sfx = (name: string, gain = 1) => {
    if (!silent) SFX.play(name, gain);
  };
  const posture = (which: 'garden' | 'kneel' | null) => {
    const a = ex.animator;
    a.posture = which === 'garden' ? garden : which === 'kneel' ? kneeling : null;
    a.postureFeet = which === null;
  };
  const setHat = (on: boolean) => {
    if (ex.currentOutfit.hat === on) return;
    ex.setOutfit({ hat: on });
    env.photo.refreshBody();
  };
  const openHands = (on: boolean) => {
    if (on === handsOpen) return;
    handsOpen = on;
    if (on) {
      if (!flat) {
        const q = ex.rig.quality;
        const mk = (side: 'L' | 'R') => {
          const p = JOINTS[`wrist${side}`].pivot;
          return buildVoxelMesh(buildHand(side, 'open'), { quality: q, offset: new Vector3(p[0], p[1], p[2]), castShadow: true, name: `bodhi:hand${side}` });
        };
        flat = { L: mk('L'), R: mk('R') };
      }
      ex.rig.setSlotObject('handL', 'wristL', flat.L);
      ex.rig.setSlotObject('handR', 'wristR', flat.R);
    } else {
      ex.setHandPose('L', 'relaxed');
      ex.setHandPose('R', 'relaxed');
    }
  };
  const showFace = (f: 'asleep' | 'happy' | null) => {
    if (f === faceShown) return;
    faceShown = f;
    ex.showFace(f);
  };
  /** The monk's face (m), for him to look at. */
  const monkFace = (out: Vector3) => {
    if (monk.shown && Number.isFinite(monk.x)) return out.set(monk.x, monk.y + 2.15, monk.z);
    const p = bodhiToWorld(BODHI_PLAN.monk.x, BODHI_PLAN.monk.z, _f);
    return out.set(p.x, ground + 2.15, p.z);
  };
  const cueAt = (at: number, dt: number) => st >= at && st - dt < at;
  const kneelUp = () => {
    ps.pray = BLESS_KNEEL;
    ps.prayW = 1;
    ps.rise = 1;
    ps.palms = ps.offer = ps.admire = ps.bowHead = ps.stepW = ps.lookW = 0;
  };

  /** One step of it (no camera, no input). */
  const advance = (c: RoamCtx, dt: number): void => {
    st += dt;
    time += dt;
    ps.t += dt;
    gb.life += dt;
    switch (step) {
      case 'go': {
        // To his place at the ring, facing the tree.
        const dx = stand.x - body.pos.x;
        const dz = stand.z - body.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.03 && st < 4) {
          const v = Math.min(d, STEP * (body.scale / 1.4) * dt);
          body.pos.x += (dx / d) * v;
          body.pos.z += (dz / d) * v;
          body.pos.y += (ground - body.pos.y) * Math.min(1, dt * 10);
          body.yaw += angleDiff(d > 0.3 ? Math.atan2(dx, dz) : facing, body.yaw) * Math.min(1, dt * TURN);
          ex.setMotion(v / Math.max(1e-3, dt) / body.scale, true, 0);
          break;
        }
        body.pos.copy(stand);
        body.yaw += angleDiff(facing, body.yaw) * Math.min(1, dt * TURN);
        ex.setMotion(0, true, 0);
        if (Math.abs(angleDiff(facing, body.yaw)) < 0.05 || st > 4.5) {
          body.yaw = facing;
          if (ex.currentAction) ex.stop();
          posture('garden');
          gb.t = 0;
          go('plant');
        }
        break;
      }
      case 'plant': {
        // The garden's planting of a tree, its beats' sounds; the tree is planted as the root ball goes in.
        const A = ACTIONS.plantTree;
        const was = gb.t;
        gb.t = Math.min(A.len, st);
        toBody(c, tree.x, ground, tree.z, gb.spot);
        for (const b of A.beats) {
          if (was < b.at && gb.t >= b.at) {
            if (b.sound) sfx(b.sound, 0.9);
            if (b.name === 'set' && !planted) planted = plant();
            if (b.name === 'chop') pad.rumble('tick', 0.25);
          }
        }
        hands.update('plantTree', gb.t, 'bodhi');
        ex.setMotion(0, true, 0);
        if (gb.t >= A.len) {
          if (!planted) planted = plant();
          hands.clear();
          if (!blessing) {
            posture(null);
            go('end');
            break;
          }
          posture('kneel');
          kneelUp();
          ps.pray = 0;
          go('back');
        }
        break;
      }
      case 'back': {
        // A pace back from the sapling, still facing it.
        body.pos.lerpVectors(stand, kneel, smooth(st / BACK_T));
        ex.setMotion(st < BACK_T ? 0.5 : 0, true, 0);
        if (st >= BACK_T) {
          body.pos.copy(kneel);
          sfx('blessCloth', 0.8);
          go('down');
        }
        break;
      }
      case 'down':
        ps.pray = Math.min(BLESS_KNEEL, st * KNEEL_RATE);
        if (!hatTaken && ps.pray >= BLESS_HAT.off && ex.currentOutfit.hat) {
          hatTaken = true;
          setHat(false);
        }
        if (ps.pray >= BLESS_KNEEL) {
          ps.prayW = 0;
          go('settle');
        }
        break;
      case 'settle':
        // Back on his heels, palms together at his face, looking at the sapling and the monk beside it.
        ps.rise = 1 - over(st, 0, SETTLE_T);
        ps.palms = over(st, 0, SETTLE_T * 0.75);
        ps.lookW = 0.8 * over(st, 0, SETTLE_T);
        toBody(c, monkFace(_v).x, _v.y, _v.z, ps.look);
        openHands(ps.palms > 0.45);
        if (st >= SETTLE_T) {
          go('chant');
          bodhiCue('chant', body.pos);
          sfx('blessChant', 0.85);
        }
        break;
      case 'chant':
        // Bowed under the chant (his head well below the monk's, standing).
        ps.palms = 1;
        ps.bowHead = BOW_HEAD * over(st, 0, 1.2);
        ps.lookW = 0.8 - 0.5 * over(st, 0, 1.2);
        toBody(c, monkFace(_v).x, _v.y, _v.z, ps.look);
        if (st >= CHANT_T) {
          go('sprinkle');
          bodhiCue('sprinkle', body.pos);
        }
        break;
      case 'sprinkle': {
        // The water over the sapling and over him: his eyes shut as the drops land.
        ps.palms = 1;
        ps.bowHead = BOW_HEAD;
        let shut = false;
        for (const f of BODHI_FLICKS) {
          if (cueAt(f + 0.3, dt)) sfx('blessDrops', 0.8);
          if (st >= f + 0.2 && st < f + 0.85) shut = true;
        }
        showFace(shut ? 'asleep' : null);
        if (st >= SPRINKLE_T) {
          showFace(null);
          go('words');
          bodhiCue('words', body.pos);
        }
        break;
      }
      case 'words':
        // The monk's blessing in Khmer: palms together, his head up a little to hear it, a smile.
        ps.palms = 1;
        ps.bowHead = BOW_HEAD * (1 - 0.6 * over(st, 0, 0.8));
        toBody(c, monkFace(_v).x, _v.y, _v.z, ps.look);
        ps.lookW = 0.7 * over(st, 0, 0.8);
        showFace(st > 0.4 && st < WORDS_T - 0.4 ? 'happy' : null);
        if (st >= WORDS_T) {
          showFace(null);
          ps.pray = BLESS_BOWS;
          ps.lookW = 0;
          go('bow');
        }
        break;
      case 'bow': {
        // Three bows to the ground (the prayer's own), the temple bell at the first.
        const was = ps.pray;
        ps.pray = Math.min(BLESS_RISE, BLESS_BOWS + st * BOW_RATE);
        ps.prayW = over(st, 0, 0.45);
        ps.bowHead = BOW_HEAD * (1 - over(st, 0, 0.45));
        openHands(ps.pray < PRAY_PALMS[1]);
        for (const b of PRAY.bows) if (was < b && ps.pray >= b && !silent) pad.rumble('tick', 0.35);
        if (was < PRAY.bows[0] && ps.pray >= PRAY.bows[0] && !silent) c.sound('enter', 0.3);
        if (ps.pray >= BLESS_RISE) {
          sfx('blessCloth', 0.8);
          bodhiCue('done', body.pos);
          go('up');
        }
        break;
      }
      case 'up':
        ps.prayW = 1;
        ps.pray = Math.min(PRAY.duration, BLESS_RISE + st * KNEEL_RATE);
        openHands(false);
        if (hatTaken && ps.pray >= BLESS_HAT.on) {
          hatTaken = false;
          setHat(true);
        }
        if (ps.pray >= PRAY.duration - 0.05) go('end');
        break;
      case 'leave': {
        // Left off while kneeling: the hands back, on his heels, then up the prayer's way.
        const k = Math.min(1, (dt / LEAVE_T) * 3);
        ps.rise += (0 - ps.rise) * k;
        ps.palms = Math.max(0, ps.palms - dt / LEAVE_T);
        ps.bowHead = Math.max(0, ps.bowHead - dt / LEAVE_T);
        ps.prayW = Math.max(0, ps.prayW - dt / LEAVE_T);
        ps.lookW = 0;
        openHands(ps.palms > 0.45);
        showFace(null);
        if (st >= LEAVE_T) {
          kneelUp();
          ps.pray = BLESS_RISE;
          ps.rise = 0;
          go('up');
        }
        break;
      }
      default:
        break;
    }
    if (step !== 'go' && step !== 'back') ex.setMotion(0, true, 0);
  };

  const finish = () => {
    if (done) return;
    done = true;
    hands.clear();
    openHands(false);
    showFace(null);
    posture(null);
    if (hatTaken) setHat(true);
    hatTaken = false;
    if (blessing && monk.cue !== 'done' && monk.cue !== 'idle') bodhiCue('done', body.pos);
    lantern.hide();
    if (planted) gardenSay(t('gardenBodhiDone'), 'gardenSprout');
  };

  // The monk comes over as he begins.
  if (blessing) bodhiCue('come', { x: stand.x, y: ground, z: stand.z });
  lantern.set(lanternAt.x, ctx.world.field.heightAt(lanternAt.x, lanternAt.z), lanternAt.z, ctx.night, body.scale);
  body.vel.set(0, 0, 0);
  if (at > 0) {
    // (a check: his place reached, then on to `at` s in silence)
    body.pos.copy(stand);
    body.yaw = facing;
    silent = true;
    const dt = 1 / 30;
    let n = 0;
    while (time < at && step !== 'end' && n++ < 4000) advance(ctx, dt);
    silent = false;
    // (the monk's cue for that moment: `come` until the chant)
    const cue = step === 'chant' ? 'chant' : step === 'sprinkle' ? 'sprinkle' : step === 'words' ? 'words' : step === 'bow' || step === 'up' ? 'done' : 'come';
    if (blessing) bodhiCue(cue, body.pos);
    ctx.cam.yaw = camYaw;
    ctx.cam.pitch = FRAME.pitch;
    ctx.cam.distance = camDist;
    // (and kept there while the still settles: roaming's start may set its own)
    snap = true;
  }

  return {
    kind: 'plant',
    get done() {
      return done;
    },
    get step() {
      return step;
    },
    get time() {
      return time;
    },
    input(c) {
      const i = c.input;
      // Leave off: E, Space or the stick (once the sapling is in, and he is not on his way up already).
      const want = i.use || i.jump || Math.hypot(i.move.x, i.move.y) > STICK;
      if (want && planted && (step === 'back' || step === 'down' || step === 'settle' || step === 'chant' || step === 'sprinkle' || step === 'words')) {
        if (step === 'back' || step === 'down') {
          kneelUp();
          ps.pray = Math.min(ps.pray, BLESS_KNEEL);
        }
        go('leave');
        if (blessing) bodhiCue('done', body.pos);
      }
      c.cam.turn(i.lookYaw, i.lookPitch, i.zoom);
      if (i.lookYaw || i.lookPitch) framed = Infinity;
    },
    hold(c, dt) {
      advance(c, dt);
      if (step === 'end') finish();
      const { cam } = c;
      body.vel.set(0, 0, 0);
      body.grounded = true;
      // The camera: at the tree's front on his right, low; eased there, then the player's; back as it was after.
      const s = body.scale / 1.4;
      if (!done) {
        cam.focus.set(lookAt.x, ground + FRAME.y * s, lookAt.z);
        framed += dt;
        if (framed < FRAME.for) {
          const r = 1 - Math.exp(-(snap ? 30 : FRAME.rate) * dt);
          cam.yaw += angleDiff(camYaw, cam.yaw) * r;
          cam.pitch += (FRAME.pitch - cam.pitch) * r;
          cam.distance += (camDist - cam.distance) * r;
        }
        cam.behindYaw = cam.yaw;
      } else if (!before.restored) {
        before.restored = true;
        cam.pitch = before.pitch;
        cam.distance = before.distance;
      }
      const stepPrompt = planted && step !== 'up' && step !== 'end' && step !== 'leave' && step !== 'bow' ? `E  ${t('blessUp')}` : null;
      return { prompt: stepPrompt };
    },
    stop() {
      if (done) return;
      // (the sapling in the ground if the hole was dug: it stays planted)
      if (!planted && step === 'plant' && gb.t >= 3.5) planted = plant();
      finish();
    },
  };
}
