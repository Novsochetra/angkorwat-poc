import { Group, Vector3 } from 'three';
import { FRUIT } from '../../character/gardenWork';
import { newShareState, shareMiddle, sharePose, type ShareState } from '../../character/share';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { KINDS, type PlantKindId } from '../garden/kinds';
import { SHARE, shareCue, type ShareWho } from '../share';
import type { AddonEnv, AddonHold } from './_addons';
import { fruitBuilder } from './_gardenProps';
import { FRUIT_COLORS, itemName, type SharePlan } from './_shareFruitWords';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * One giving (roam/_shareFruit.ts holds him through it): he steps up to them
 * (or a child runs up to him), holds the fruit out with both hands and a small
 * bow (down on his haunches to a child or someone sitting: character/share.ts),
 * they take it, thank him, and now and then give him something back, which he
 * takes. The people's side is people/_shareBack.ts, cued by `SHARE` (share.ts).
 *
 * The timeline (s from when he stands before them, `ready`): `hold` he holds it
 * out, `take` it is theirs (out of his basket: `took`), `thanks` their words;
 * to an elder he answers with the high sampeah (`greetHigh`); `back` they hold
 * their gift out, `got` he takes it (the `interact` action); `end`.
 */

/** Seconds after `ready`. */
const AT = { hold: 0, take: 1.0, thanks: 1.3, answer: 1.85, back: 0.6, got: 0.9, end: 1.0 } as const;
/** He steps up to them this fast (m/s at his roaming size), turns this fast (1/s); gives up on a child that does not come after this long (s). */
const STEP = 1.3;
const TURN = 7;
const KID_WAIT = 6;
const APPROACH = 2.6;
/** The camera at their side: how far (m at his size), how high (radians), how fast it comes round (1/s). */
const CAM = { dist: 5.4, pitch: 0.2, rate: 1.6 };
/** His roaming size the numbers are for. */
const SIZE = 1.4;
/** Easing rates (1/s) of his arms, the bow, the crouch. */
const EASE = { reach: 5, bow: 4, crouch: 3.2 };

export type ShareStep = 'hold' | 'take' | 'thanks' | 'answer' | 'back' | 'got' | 'end';

export interface ShareSession {
  readonly done: boolean;
  /** The fruit is theirs now (out of his basket). */
  readonly given: boolean;
  hold(ctx: RoamCtx, dt: number): AddonHold;
  /** At once (a new mode, back to the map): they go back to what they did. */
  stop(): void;
}

export interface ShareHooks {
  /** The fruit leaves his hands (take it out of his basket: false, it is not there any more: he stops). */
  took(): boolean;
  /** He takes what they give back. */
  got(): void;
}

/** The fruit meshes in his hands, one a kind (made the first time). */
const MESHES = new Map<PlantKindId, Group>();
function fruitMesh(k: PlantKindId): Group {
  let g = MESHES.get(k);
  if (!g) {
    g = new Group();
    g.name = `shareFruit:${k}`;
    const m = buildVoxelMesh(fruitBuilder(k, 0), { quality: 'medium', name: `shareFruit:${k}` });
    // (a bunch or canes held by the stalk: their +z up the plant goes up, the bunch hangs below)
    if (FRUIT[k].hang) m.rotation.x = -Math.PI / 2;
    g.add(m);
    MESHES.set(k, g);
  }
  return g;
}

const _mid = new Vector3();

/**
 * Start giving `kind` to `who` (`plan`: what they say and give back; `at`: seconds already in after `ready`, a check's
 * `share=`).
 */
export function startShare(env: AddonEnv, ctx: RoamCtx, who: Readonly<ShareWho>, kind: PlantKindId, plan: Readonly<SharePlan>, hooks: ShareHooks, at = -1): ShareSession {
  const body = ctx.body;
  const ex = env.explorer;
  const w = ctx.world;
  const k = body.scale / SIZE;
  const kid = who.kid && !who.seated;
  const elder = who.elder || who.gran;
  // Where he stands: before them, toward him (to a child running up: where he is; it comes to him).
  let dx = body.pos.x - who.x;
  let dz = body.pos.z - who.z;
  const d0 = Math.hypot(dx, dz) || 1;
  dx /= d0;
  dz /= d0;
  const theirs = who.scale / SIZE;
  const gap = ((who.seated ? 0.95 : 0.5) + 0.5 * theirs) * k + 0.08;
  let sx = kid ? body.pos.x : who.x + dx * gap;
  let sz = kid ? body.pos.z : who.z + dz * gap;
  const h = 1.7 * body.scale * 0.95;
  let sy = kid ? body.pos.y : w.standAt ? w.standAt(sx, sz, body.pos.y + 0.5, 0.6, h) : w.groundAt(sx, sz);
  if (!Number.isFinite(sy) || Math.abs(sy - body.pos.y) > 0.6) {
    sx = body.pos.x;
    sz = body.pos.z;
    sy = body.pos.y;
  }
  // (a child comes to stand this far before him, the way he faces it)
  const face0 = Math.atan2(who.x - sx, who.z - sz);
  const meet = (0.55 + 0.42 * theirs) * k;
  SHARE.id = who.id;
  SHARE.kid = kid;
  SHARE.fruit = FRUIT_COLORS[kind][0];
  SHARE.stalk = FRUIT_COLORS[kind][1];
  SHARE.back = plan.back;
  SHARE.backColor = plan.wrap;
  SHARE.backTie = plan.tie;
  SHARE.word = plan.word;
  SHARE.word2 = plan.word2;
  SHARE.item = KINDS[kind].fruit.item;
  SHARE.plant = plan.seeds ? KINDS[plan.seeds].name : '';
  SHARE.x = sx;
  SHARE.y = sy;
  SHARE.z = sz;
  SHARE.yaw = face0;
  SHARE.meetX = sx + Math.sin(face0) * meet;
  SHARE.meetZ = sz + Math.cos(face0) * meet;
  SHARE.px = who.x;
  SHARE.py = who.y;
  SHARE.pz = who.z;
  SHARE.arrived = false;
  SHARE.lost = false;
  shareCue('come');

  // The camera's side: square to the line between them, on the side it is on now.
  const nx = -dz;
  const nz = dx;
  const side = nx * (ctx.cam.camera.position.x - (who.x + sx) / 2) + nz * (ctx.cam.camera.position.z - (who.z + sz) / 2) >= 0 ? 1 : -1;
  const camYaw = Math.atan2(-nx * side, -nz * side);
  const before = { pitch: ctx.cam.pitch, distance: ctx.cam.distance };

  const st: ShareState = newShareState();
  st.gap = Math.min(3.8, Math.max(1.3, FRUIT[kind].w / 2 + 0.7));
  // (to a child: down on his haunches, the hands low; to someone sitting: right down)
  const crouchTo = who.seated ? 1 : kid ? 0.62 : 0;
  const lowTo = kid ? 1.2 : who.seated ? 0.4 : 0;
  const bowTo = who.seated || kid ? 0.25 : elder ? 0.85 : 0.45;
  // The steps after `ready` (s), and what is still to come.
  const steps: [number, ShareStep][] = [
    [AT.hold, 'hold'],
    [AT.take, 'take'],
    [AT.thanks, 'thanks'],
  ];
  let after = AT.thanks + (kid ? 1.1 : 1.6);
  if (elder) {
    steps.push([AT.answer, 'answer']);
    after = AT.answer + 2.5;
  }
  if (plan.back === 'bless') {
    // (the blessing comes as he bows to her: their words while his palms are at his face)
    const i = steps.findIndex((s) => s[1] === 'answer');
    steps.splice(i >= 0 ? i : steps.length, 0, [AT.answer - 0.15, 'back']);
  } else if (plan.back !== 'none') {
    steps.push([after + AT.back, 'back'], [after + AT.back + AT.got, 'got']);
    after += AT.back + AT.got + AT.end;
  }
  steps.push([after, 'end']);

  let time = 0;
  /** Seconds since he stood before them (−1: not yet). */
  let ready = at >= 0 ? at : -1;
  let next = 0;
  let given = false;
  let done = false;
  let arrived = at >= 0;
  let ended = false;
  let showing = false;
  const fruit = fruitMesh(kind);

  if (at >= 0) {
    body.pos.set(sx, sy, sz);
    body.yaw = face0;
    ctx.cam.yaw = camYaw;
    ctx.cam.pitch = CAM.pitch;
    ctx.cam.distance = CAM.dist * k;
    st.reach = at > AT.hold + 0.3 && at < AT.take ? 1 : 0;
    st.bow = at < AT.thanks + 0.4 ? bowTo : 0;
    st.crouch = crouchTo;
    st.low = lowTo;
    if (kid) {
      SHARE.arrived = true;
      shareCue('come');
    }
  }
  body.vel.set(0, 0, 0);
  ex.animator.posture = null;

  const showFruit = (on: boolean) => {
    if (on === showing) return;
    showing = on;
    if (on) ex.rig.setSlotObject('shareFruit', 'chest', fruit);
    else ex.rig.clearSlot('shareFruit');
  };
  const posture = (t: number) => {
    st.t = t;
    return sharePose(st);
  };
  const finish = () => {
    if (done) return;
    done = true;
    showFruit(false);
    if (ex.animator.posture === posture) {
      ex.animator.posture = null;
      ex.animator.postureFeet = true;
    }
  };
  const fire = (s: ShareStep, c: RoamCtx) => {
    switch (s) {
      case 'hold':
        shareCue('hold');
        break;
      case 'take':
        if (!hooks.took()) {
          // (nothing left in his basket: he stops)
          shareCue('none');
          ended = true;
          return;
        }
        given = true;
        showFruit(false);
        shareCue('take');
        break;
      case 'thanks':
        shareCue('thanks');
        break;
      case 'answer':
        // (to an elder: the high sampeah, palms up to his face, as they thank and bless him)
        ex.animator.posture = null;
        ex.animator.postureFeet = true;
        if (ex.currentAction) ex.stop();
        ex.play('greetHigh');
        c.sound('greet', 1);
        break;
      case 'back':
        shareCue('back');
        break;
      case 'got':
        ex.animator.posture = null;
        if (ex.currentAction) ex.stop();
        ex.play('interact');
        hooks.got();
        break;
      case 'end':
        shareCue('end');
        ended = true;
        break;
    }
  };

  return {
    get done() {
      return done;
    },
    get given() {
      return given;
    },
    hold(c, dt) {
      time += dt;
      const { cam } = c;
      cam.turn(c.input.lookYaw, c.input.lookPitch, c.input.zoom);
      body.vel.set(0, 0, 0);
      body.grounded = true;
      const mv = Math.hypot(c.input.move.x, c.input.move.y);
      // (they are gone meanwhile, or he walks off before it is theirs: it stays his; after, a push ends it)
      if (SHARE.lost || (mv > 0.5 && !given && time > 0.3)) {
        shareCue('none');
        finish();
        return { prompt: null };
      }
      if (mv > 0.5 && given && !ended) {
        shareCue('end');
        ended = true;
      }
      // Where they are now (a child running up: the people part says).
      const px = SHARE.px;
      const pz = SHARE.pz;
      const face = Math.atan2(px - body.pos.x, pz - body.pos.z);
      // He steps up to them (a grown-up), or waits for the child, turning to it.
      const ddx = sx - body.pos.x;
      const ddz = sz - body.pos.z;
      const dist = Math.hypot(ddx, ddz);
      if (ready < 0 && dist > 0.03 && time < APPROACH) {
        const step = Math.min(dist, STEP * k * dt);
        body.pos.x += (ddx / dist) * step;
        body.pos.z += (ddz / dist) * step;
        body.pos.y += (sy - body.pos.y) * Math.min(1, dt * 10);
        body.yaw += angleDiff(dist > 0.3 ? Math.atan2(ddx, ddz) : face, body.yaw) * Math.min(1, dt * TURN);
        ex.setMotion(step / Math.max(1e-3, dt) / body.scale, true, 0);
      } else {
        if (ready < 0) body.pos.set(sx, sy, sz);
        body.yaw += angleDiff(face, body.yaw) * Math.min(1, dt * TURN);
        ex.setMotion(0, true, 0);
        if (kid && !arrived) {
          arrived = SHARE.arrived;
          // (it does not come: he gives up, nothing given)
          if (!arrived && time > KID_WAIT) {
            shareCue('none');
            finish();
            return { prompt: null };
          }
        }
        if (ready < 0 && (!kid || arrived)) ready = 0;
      }
      // His posture: from when he stands before them until the end of his part.
      if (ready >= 0) {
        ready += dt;
        while (next < steps.length && ready >= steps[next][0] && !ended) fire(steps[next++][1], c);
        const holding = ready >= AT.hold && ready < AT.take + 0.1 && !given;
        const bowing = ready < AT.thanks + 0.5;
        const answering = ex.currentAction === 'greetHigh' || ex.currentAction === 'interact';
        st.reach += ((holding ? 1 : 0) - st.reach) * Math.min(1, dt * EASE.reach);
        st.bow += ((bowing && !ended ? bowTo : 0) - st.bow) * Math.min(1, dt * EASE.bow);
        const down = !ended && (kid ? ready < AT.thanks + 0.6 : ready < AT.thanks + 0.9);
        st.crouch += ((down ? crouchTo : 0) - st.crouch) * Math.min(1, dt * EASE.crouch);
        st.low = lowTo;
        st.lookDown = kid ? 0.18 : who.seated ? 0.12 : 0;
        // (a nod as they thank him)
        if (!elder && ready > AT.thanks && ready < AT.thanks + 0.9) st.lookDown += 0.22 * Math.sin(((ready - AT.thanks) / 0.9) * Math.PI);
        const still = st.reach > 0.01 || st.bow > 0.01 || st.crouch > 0.01;
        if (!answering && still && ex.animator.posture !== posture) {
          ex.animator.posture = posture;
          ex.animator.postureFeet = true;
        } else if (!still && ex.animator.posture === posture) ex.animator.posture = null;
        // The fruit between his hands, coming up with them, until it is theirs.
        showFruit(!given && st.reach > 0.15);
        if (showing) {
          shareMiddle(st, _mid);
          const r = Math.min(1, st.reach * 1.15);
          fruit.position.set(0, -1.8 + (_mid.y + 1.8) * r, 2.4 + (_mid.z - 2.4) * r);
        }
        if (ended && !answering && !still) finish();
      }
      // The camera: at their side, both in view, looking between them.
      const kk = 1 - Math.exp(-CAM.rate * dt);
      if (Math.abs(c.input.lookYaw) < 1e-6) {
        cam.yaw += angleDiff(camYaw, cam.yaw) * kk * (time < 2.5 ? 1 : 0.25);
        cam.pitch += (CAM.pitch - cam.pitch) * kk;
        cam.distance += (CAM.dist * k - cam.distance) * kk;
      }
      const hh = 1.7 * body.scale * (kid || who.seated ? 0.55 : 0.75);
      cam.focus.set((body.pos.x + px) / 2, body.pos.y + hh, (body.pos.z + pz) / 2);
      cam.behindYaw = cam.yaw;
      if (done) {
        cam.pitch = before.pitch;
        cam.distance = before.distance;
      }
      return { prompt: null };
    },
    stop() {
      if (done) return;
      shareCue(given ? 'end' : 'none');
      if (ex.currentAction === 'greetHigh' || ex.currentAction === 'interact') ex.stop();
      finish();
    },
  };
}

/** For words: the fruit's name in the language in use. */
export const shareItem = itemName;
