import { Vector3 } from 'three';
import { buildPose, hammerBuilder, HIT, newBuildPose, STROKE } from '../../character/buildWork';
import { BODY_UNIT_M, WALK_SPEED } from '../../world/scale';
import { SFX } from '../audio/addonSfx';
import '../audio/_build';
import { PIECES, type Built } from '../build/pieces';
import { BUILD } from '../build/state';
import { pieceLook } from '../build/view';
import { pad } from '../pad/pad';
import { lang, num, t, type WordKey } from '../ui/lang';
import { touchJump, type AddonEnv, type AddonHold, type AddonKey } from './_addons';
import { riel } from './_shopPurse';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';
import { stepSound } from './walker';

/**
 * His work on a piece (roam/_build.ts starts it): it holds him (`holding`) as
 * the garden's work does (_gardenWork.ts).
 *
 * 1. **To his place**: he walks (a calm pace, his footsteps) to the side of the
 *    piece nearest him (a side's middle, `STAND` m out from it, where he can
 *    stand), turns to it. A big piece (the pen, the shelter, a hammock) he
 *    works round: every `MOVE_EVERY` s of work he walks on to the next side.
 * 2. **The work**: his hammer in his right hand (`hammerBuilder`, a slot on his
 *    hand), the hammering posture (character/buildWork.ts: squatting for low
 *    work, standing for high, the blow where the piece is rising), a knock at
 *    each blow, a piece of wood set every few (audio/_build.ts). The piece rises
 *    block by block in its model's order (`BUILD.setDone`: the view draws its
 *    first blocks) over `PIECES[id].secs` of work. Taking one down is the same
 *    backwards, in half the time (at least 2 s), wood knocking as it comes apart.
 * 3. **Done**: it stands (a chime, a toast, a tick on the pad); taken down: it is
 *    gone and half its price is back in his purse (a toast says how much).
 *
 * The stick held away stops him at once: a piece being built stays as far as it
 * got (E "Keep building" by it goes on; a toast says so the first time), one
 * being taken down stands again whole. Back to the map, another mode: the same,
 * at once. The camera comes round to his side, a little back, the piece in view.
 */

/** The stick held away this long (s) stops him. */
const PUSH = 0.15;
/** He stands this far out from a side of the piece (m), and walks to it at this share of the walker's pace; given up after `WALK_MAX` s. */
const STAND = 0.72;
const PACE = 0.6 * 1.6;
const WALK_MAX = 5;
/** Big pieces (this across, m): he works round them, a side every `MOVE_EVERY` s of work. */
const BIG = 3.4;
const MOVE_EVERY = 5.5;
/** Taking down: this share of the time it took to build (at least `TAKE_MIN` s). */
const TAKE_SHARE = 0.5;
const TAKE_MIN = 2;
/** The work's height (m over the ground) at most and at least: where he can reach with his hammer. */
const WORK_UP = { lo: 0.16, hi: 1.65 };
/** The camera at the work: round to his side (rad from behind him), its tilt (rad), its distance (m: and this much per metre of the piece's reach), how far the focus moves toward the piece; eased over `for` s. */
const FRAME = { side: 1.05, pitch: 0.36, distance: 5.6, perReach: 0.55, toward: 0.4, rate: 2.2, for: 1.8, back: 1.6 };

interface Session {
  readonly piece: Built;
  readonly take: boolean;
  phase: 'walk' | 'turn' | 'work';
  /** Seconds of work (the strokes); of the walk; the stick held away; at this side. */
  t: number;
  walkT: number;
  push: number;
  sideT: number;
  /** Where he stands, the way he faces, which side (0 front, 1 its left, 2 back, 3 its right), the sides he may use. */
  readonly stand: Vector3;
  face: number;
  side: number;
  readonly sides: number[];
  /** The work's point on the map (the side's middle at the work's height), eased. */
  readonly work: Vector3;
  workUp: number;
  /** How far it was built when he began (taking down: stopped, it stands again so). */
  readonly from: number;
  /** Held at `t` (a check's picture). */
  frozen: boolean;
  /** Blows so far. */
  blows: number;
}

let env: AddonEnv | null = null;
let S: Session | null = null;
const pose = newBuildPose();
const posture = () => buildPose(pose);
/** The camera before (eased back to after), how long it has been framed, the side it comes round on. */
let before: { pitch: number; distance: number } | null = null;
let framed = 0;
let camSide = 1;
let lastStep = 0;
let touchShown: string | null = null;
/** The "paused" toast said this visit. */
let pausedSaid = false;

const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);
const _v = new Vector3();
const _w = new Vector3();

/** A piece's name inside a sentence (English: lower case, "the bamboo bed"). */
export const pieceWord = (p: Pick<Built, 'id'>): string => {
  const s = t(PIECES[p.id].name as WordKey);
  return lang() === 'en' ? s.toLowerCase() : s;
};

/** A side's middle (local m) and its way out (unit, local), grown by `out`. */
function sideAt(b: Built, side: number, out: number, o: Vector3): Vector3 {
  const p = PIECES[b.id];
  const hw = p.w / 2 + out;
  const hd = p.d / 2 + out;
  const lx = side === 1 ? hw : side === 3 ? -hw : 0;
  const lz = side === 0 ? hd : side === 2 ? -hd : 0;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return o.set(b.x + lx * c + lz * s, 0, b.z - lx * s + lz * c);
}

/** Can he stand at (x, z) for the work (dry, on the level of the piece's ground, room)? */
function standable(ctx: RoamCtx, b: Built, x: number, z: number): boolean {
  const w = ctx.world;
  if (w.waterAt(x, z) !== null) return false;
  const land = w.field.heightAt(x, z);
  if (Math.abs(land - b.y) > 0.6) return false;
  const g = w.standAt ? w.standAt(x, z, land, 0.3, 2.2) : w.groundAt(x, z);
  return !Number.isNaN(g) && g - land < 0.3;
}

/** The sides he may work from, nearest him first. */
function sidesFor(ctx: RoamCtx, b: Built): number[] {
  const p = ctx.body.pos;
  const list: [number, number][] = [];
  for (let i = 0; i < 4; i++) {
    sideAt(b, i, STAND, _v);
    if (!standable(ctx, b, _v.x, _v.z)) continue;
    list.push([i, Math.hypot(_v.x - p.x, _v.z - p.z)]);
  }
  list.sort((a, c) => a[1] - c[1]);
  if (!list.length) return [nearestSide(b, p.x, p.z)];
  // (round it in order from the nearest: the next side along, not across)
  const first = list[0][0];
  const ok = new Set(list.map((l) => l[0]));
  const out: number[] = [];
  for (let k = 0; k < 4; k++) {
    const s = (first + k) % 4;
    if (ok.has(s)) out.push(s);
  }
  return out;
}

/** The side of a piece facing (x, z). */
function nearestSide(b: Built, x: number, z: number): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < 4; i++) {
    sideAt(b, i, STAND, _v);
    const d = Math.hypot(_v.x - x, _v.z - z);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/** His place and facing for side `side`. */
function placeFor(s: Session): void {
  sideAt(s.piece, s.side, STAND, s.stand);
  sideAt(s.piece, s.side, 0, _w);
  s.face = Math.atan2(_w.x - s.stand.x, _w.z - s.stand.z);
}

/** The height of the work now (m over the piece's ground): the top of the block being put up (or taken off). */
function workHeight(b: Built): number {
  const look = pieceLook(b.id, b.seed);
  const n = look.boxes.length;
  if (!n) return 0.6;
  const i = Math.min(n - 1, Math.max(0, Math.floor(b.done * n)));
  const x = look.boxes[i];
  return Math.min(WORK_UP.hi, Math.max(WORK_UP.lo, x.y + x.sy * 0.3));
}

/** World → his own space (BU): x his left, y up from his soles, z ahead. */
function toBody(ctx: RoamCtx, x: number, y: number, z: number, out: Vector3): Vector3 {
  const b = ctx.body;
  const k = 1 / (BODY_UNIT_M * b.scale);
  const dx = x - b.pos.x;
  const dz = z - b.pos.z;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return out.set((dx * c - dz * s) * k, (y - b.pos.y) * k, (dx * s + dz * c) * k);
}

function settle(ctx: RoamCtx, dt: number): void {
  const p = ctx.body.pos;
  const land = ctx.world.field.heightAt(p.x, p.z);
  const top = ctx.world.groundAt(p.x, p.z);
  const y = top - land < 0.3 ? top : land;
  p.y += (y - p.y) * (dt > 0 ? damp(14, dt) : 1);
}

/** Walk toward `goal` (m), turning to the way; footsteps. True once there. */
function walkTo(ctx: RoamCtx, goal: Vector3, dt: number): boolean {
  const b = ctx.body;
  const p = b.pos;
  const dx = goal.x - p.x;
  const dz = goal.z - p.z;
  const d = Math.hypot(dx, dz);
  const speed = WALK_SPEED * b.scale * PACE;
  const v = d > 0.04 ? Math.min(speed, 0.4 + d * 3) : 0;
  if (d > 0.04) {
    const k = Math.min(d, v * dt) / d;
    p.x += dx * k;
    p.z += dz * k;
    b.yaw += angleDiff(Math.atan2(dx, dz), b.yaw) * damp(10, dt);
  }
  settle(ctx, dt);
  b.explorer.setMotion(v / b.scale, true, 0);
  const phase = b.explorer.animator.phase;
  if (v > 0.25) {
    const crossed = (q: number) => (lastStep < q && phase >= q) || (phase < lastStep && (lastStep < q || phase >= q));
    if (crossed(0.25) || crossed(0.75)) ctx.sound(stepSound(ctx.world, p.x, ctx.world.field.heightAt(p.x, p.z), p.z), 0.45 + v * 0.1);
  }
  lastStep = phase;
  return d <= 0.04;
}

function setPose(on: boolean): void {
  const ex = env?.explorer;
  if (!ex) return;
  if (on) {
    ex.animator.posture = posture;
    ex.animator.postureFeet = true;
  } else if (ex.animator.posture === posture) {
    ex.animator.posture = null;
    ex.animator.postureFeet = true;
  }
}

function hammer(on: boolean): void {
  const ex = env?.explorer;
  if (!ex) return;
  if (on) {
    if (!ex.rig.getSlot('buildHammer')) ex.rig.setSlot('buildHammer', 'propR', hammerBuilder());
  } else ex.rig.clearSlot('buildHammer');
}

function touch(want: 'hide' | null): void {
  if (want === touchShown) return;
  touchShown = want;
  touchJump(want);
}

/** The camera: behind him on his way, round to his side at the work, the piece in view (eased for a while; the player's after). */
function frameCam(ctx: RoamCtx, s: Session, dt: number): void {
  const { cam, body: b, input } = ctx;
  const h = 1.7 * b.scale;
  const working = s.phase === 'work';
  if (input.lookYaw || input.lookPitch || input.zoom) framed = FRAME.for;
  const k = dt > 0 ? damp(4, dt) : 1;
  const tw = working ? FRAME.toward : 0;
  cam.focus.x += (b.pos.x + (s.piece.x - b.pos.x) * tw - cam.focus.x) * k;
  cam.focus.z += (b.pos.z + (s.piece.z - b.pos.z) * tw - cam.focus.z) * k;
  cam.focus.y += (b.pos.y + h * (working ? 0.55 : 0.86) - cam.focus.y) * (dt > 0 ? damp(6, dt) : 1);
  cam.behindYaw = b.yaw;
  cam.follow = working ? 0 : 0.6;
  if (!working || framed >= FRAME.for) return;
  framed += dt;
  const e = dt > 0 ? damp(FRAME.rate, dt) : 1;
  const reach = pieceLook(s.piece.id, s.piece.seed).reach;
  cam.yaw += angleDiff(b.yaw + FRAME.side * camSide, cam.yaw) * e;
  cam.pitch += (FRAME.pitch - cam.pitch) * e;
  cam.distance += (Math.min(Math.max(FRAME.distance + reach * FRAME.perReach, cam.minDistance), cam.maxDistance) - cam.distance) * e;
}

/** Stop now: his hands empty, the posture off. */
function finish(ctx: RoamCtx | null): void {
  const s = S;
  if (!s) return;
  S = null;
  pose.k = 0;
  setPose(false);
  hammer(false);
  touch(null);
  if (ctx) ctx.body.explorer.setMotion(0, true, 0);
  BUILD.tick(0, true);
}

const KEYS: readonly AddonKey[] = [
  ['W A S D', 'buildKeyStop', 'lstick'],
  ['Q R', 'rLook', 'rstick'],
];

/** The prompt's words while he works, kept by language and percent (no string made a frame). */
const said = new Map<string, string>();
let saidLang = '';
function workWords(s: Session): string {
  if (lang() !== saidLang) {
    saidLang = lang();
    said.clear();
  }
  const pct = Math.round(s.piece.done * 100);
  const key = `${s.take ? 't' : 'b'}|${s.piece.id}|${pct}`;
  let w = said.get(key);
  if (w === undefined) {
    w = t(s.take ? 'buildTaking' : 'buildWorking', { name: pieceWord(s.piece), pct: num(pct) });
    if (said.size > 400) said.clear();
    said.set(key, w);
  }
  return w;
}

export const BuildWork = {
  init(e: AddonEnv): void {
    env = e;
  },
  get active(): boolean {
    return S !== null;
  },
  /** The work under way (checks, the bug report). */
  get now(): { uid: string; take: boolean; t: number; phase: string; done: number; side: number } | null {
    return S ? { uid: S.piece.uid, take: S.take, t: +S.t.toFixed(2), phase: S.phase, done: +S.piece.done.toFixed(3), side: S.side } : null;
  },
  /** The piece being worked on (or null). */
  get piece(): Built | null {
    return S?.piece ?? null;
  },

  /** Begin building (or going on with) a piece, or taking it down (`take`). */
  start(ctx: RoamCtx, piece: Built, take = false): boolean {
    if (!env || S) return false;
    const sides = sidesFor(ctx, piece);
    const s: Session = {
      piece,
      take,
      phase: 'walk',
      t: 0,
      walkT: 0,
      push: 0,
      sideT: 0,
      stand: new Vector3(),
      face: 0,
      side: sides[0],
      sides,
      work: new Vector3(),
      workUp: workHeight(piece),
      from: piece.done,
      frozen: false,
      blows: 0,
    };
    placeFor(s);
    if (Math.hypot(s.stand.x - ctx.body.pos.x, s.stand.z - ctx.body.pos.z) < 0.08) s.phase = 'turn';
    S = s;
    before ??= { pitch: ctx.cam.pitch, distance: ctx.cam.distance };
    camSide = angleDiff(ctx.cam.yaw, ctx.body.yaw) >= 0 ? 1 : -1;
    framed = 0;
    ctx.body.vel.set(0, 0, 0);
    touch('hide');
    return true;
  },

  /** A check's picture: at his work `tt` s in, his place reached, the piece as it is. */
  freeze(ctx: RoamCtx, piece: Built, tt: number, take = false): boolean {
    if (!this.start(ctx, piece, take)) return false;
    const s = S!;
    const b = ctx.body;
    b.pos.x = s.stand.x;
    b.pos.z = s.stand.z;
    b.pos.y = ctx.world.field.heightAt(b.pos.x, b.pos.z);
    b.yaw = s.face;
    s.phase = 'work';
    s.frozen = true;
    s.t = tt;
    pose.k = 1;
    pose.t = tt;
    pose.still = 0;
    sideAt(piece, s.side, 0, s.work);
    s.work.y = piece.y + workHeight(piece);
    toBody(ctx, s.work.x, s.work.y, s.work.z, pose.work);
    setPose(true);
    hammer(true);
    const ex = b.explorer;
    ex.object.position.copy(b.pos);
    ex.object.rotation.set(0, b.yaw, 0);
    for (let i = 0; i < 40; i++) ex.update(1 / 30);
    const rc = ctx.start.get('rcam')?.split(',').map(Number);
    const cam = ctx.cam;
    cam.yaw = b.yaw + (rc && Number.isFinite(rc[0]) ? (rc[0] * Math.PI) / 180 : FRAME.side);
    cam.pitch = rc && Number.isFinite(rc[1]) ? (rc[1] * Math.PI) / 180 : FRAME.pitch;
    cam.distance = rc && rc[2] ? rc[2] : FRAME.distance + pieceLook(piece.id, piece.seed).reach * FRAME.perReach;
    framed = FRAME.for;
    cam.focus.set(b.pos.x + (piece.x - b.pos.x) * FRAME.toward, b.pos.y + 1.7 * b.scale * 0.55, b.pos.z + (piece.z - b.pos.z) * FRAME.toward);
    console.info(`[build] work: ${take ? 'taking down' : 'building'} ${piece.uid} at ${(piece.done * 100).toFixed(0)}%, ${tt.toFixed(2)} s in, from side ${s.side} at (${b.pos.x.toFixed(1)}, ${b.pos.z.toFixed(1)})`);
    return true;
  },

  hold(ctx: RoamCtx, dt: number): AddonHold {
    const s = S;
    if (!s || !env) return { prompt: null };
    const { body: b, input } = ctx;
    const ex = b.explorer;
    ctx.cam.turn(input.lookYaw, input.lookPitch, input.zoom);
    // (taken away meanwhile: a check, a bug)
    if (!BUILD.list.includes(s.piece) || ex.foodHeld) {
      finish(ctx);
      return { prompt: null };
    }
    // The stick held away stops him (on his way: at once).
    const push = Math.hypot(input.move.x, input.move.y) > 0.5;
    s.push = push ? s.push + dt : 0;
    if (push && (s.frozen || s.phase !== 'work' || s.push > PUSH)) {
      this.stop(ctx);
      return { prompt: null };
    }
    switch (s.phase) {
      case 'walk': {
        s.walkT += dt;
        pose.k = Math.max(0, pose.k - dt * 4);
        if (pose.k <= 0) setPose(false);
        if (walkTo(ctx, s.stand, dt) || s.walkT > WALK_MAX) s.phase = 'turn';
        break;
      }
      case 'turn': {
        settle(ctx, dt);
        ex.setMotion(0, true, 0);
        b.yaw += angleDiff(s.face, b.yaw) * damp(10, dt);
        if (Math.abs(angleDiff(s.face, b.yaw)) < 0.06) {
          b.yaw = s.face;
          s.phase = 'work';
          s.sideT = 0;
          setPose(true);
          hammer(true);
        }
        break;
      }
      case 'work': {
        settle(ctx, dt);
        ex.setMotion(0, true, 0);
        b.vel.set(0, 0, 0);
        pose.k = Math.min(1, pose.k + dt * 3.5);
        setPose(true);
        hammer(true);
        const was = s.t;
        if (!s.frozen) {
          s.t += dt;
          s.sideT += dt;
        }
        pose.t = s.t;
        // (the work's point: the side's middle, at the height of the block going up or coming off)
        sideAt(s.piece, s.side, 0, _w);
        s.workUp += (workHeight(s.piece) - s.workUp) * damp(3, dt);
        s.work.set(_w.x, s.piece.y + s.workUp, _w.z);
        toBody(ctx, s.work.x, s.work.y, s.work.z, _v);
        pose.work.lerp(_v, damp(10, dt));
        // A blow each stroke: a knock; a piece of wood set (or coming off) every few.
        const hits = Math.floor((s.t / STROKE) - HIT + 1) - Math.floor((was / STROKE) - HIT + 1);
        if (hits > 0 && !s.frozen && pose.k > 0.6) {
          s.blows++;
          SFX.play('buildKnock', 0.7 + 0.3 * ((s.blows * 7) % 5) / 4);
          if (s.blows % (s.take ? 3 : 4) === 0) SFX.play(s.take ? 'buildTake' : 'buildWood', 0.8);
          pad.rumble('tick', 0.15);
        }
        if (s.frozen) break;
        // The piece rises (or comes down) as he works.
        const p = PIECES[s.piece.id];
        if (s.take) {
          const len = Math.max(TAKE_MIN, p.secs * TAKE_SHARE);
          const next = Math.max(0, s.piece.done - dt / len);
          if (next <= 0) {
            this.takenDown(ctx, s);
            return { prompt: null };
          }
          BUILD.setDone(s.piece, next);
        } else {
          const next = Math.min(1, s.piece.done + dt / p.secs);
          BUILD.setDone(s.piece, next);
          if (next >= 1) {
            this.built(ctx, s);
            return { prompt: null };
          }
        }
        BUILD.tick(dt);
        // (a big piece: on round it to the next side every so often)
        if (s.sides.length > 1 && Math.max(p.w, p.d) >= BIG && s.sideT >= MOVE_EVERY) {
          s.side = s.sides[(s.sides.indexOf(s.side) + 1) % s.sides.length];
          placeFor(s);
          s.phase = 'walk';
          s.walkT = 0;
        }
        break;
      }
    }
    if (S) frameCam(ctx, s, dt);
    return { prompt: S && s.phase === 'work' ? workWords(s) : null };
  },

  /** It stands: the chime, the toast. */
  built(ctx: RoamCtx, s: Session): void {
    finish(ctx);
    SFX.play('buildDone', 1);
    pad.rumble('bump', 0.4);
    ctx.hud.toast(t('buildBuilt', { name: pieceWord(s.piece) }));
    console.info(`[build] built ${s.piece.uid} at (${s.piece.x.toFixed(1)}, ${s.piece.z.toFixed(1)})`);
  },

  /** Taken down: gone, half its price back. */
  takenDown(ctx: RoamCtx, s: Session): void {
    finish(ctx);
    const back = Math.floor(PIECES[s.piece.id].price / 2);
    BUILD.remove(s.piece);
    env?.purse.earn(back);
    SFX.play('buildTake', 1);
    ctx.hud.toast(t('buildTaken', { name: pieceWord(s.piece), riel: riel(back) }));
    console.info(`[build] took down ${s.piece.uid}: ${back} riel back`);
  },

  keys(): readonly AddonKey[] | null {
    return S ? KEYS : null;
  },

  /** Back from the work: the camera eases to where it was (unless the player zooms). */
  after(ctx: RoamCtx, dt: number): void {
    if (S || !before) return;
    if (ctx.input.zoom) {
      before = null;
      return;
    }
    const k = damp(FRAME.back, dt);
    ctx.cam.pitch += (before.pitch - ctx.cam.pitch) * k;
    ctx.cam.distance += (before.distance - ctx.cam.distance) * k;
    ctx.cam.follow = 0.6;
    if (Math.abs(before.pitch - ctx.cam.pitch) < 0.005 && Math.abs(before.distance - ctx.cam.distance) < 0.05) before = null;
  },

  /** Stop (the stick, back to the map, another mode): a piece being built stays as far as it got; one being taken down stands again. */
  stop(ctx: RoamCtx | null, overview = false): void {
    const s = S;
    if (!s) return;
    finish(ctx);
    if (s.take) BUILD.setDone(s.piece, s.from);
    else if (!overview && ctx && s.piece.done > 0 && s.piece.done < 1 && !pausedSaid) {
      pausedSaid = true;
      ctx.hud.toast(t('buildPaused', { name: pieceWord(s.piece) }));
    }
    if (overview) {
      before = null;
      pausedSaid = false;
    }
  },
};
