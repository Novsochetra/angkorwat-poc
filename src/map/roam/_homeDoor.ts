import { Vector3 } from 'three';
import { BODY_UNIT_M } from '../../world/scale';
import { SFX } from '../audio/addonSfx';
import { HOME, HOME_AT, HOME_DOOR, HOME_LEAF, HOME_T, HOME_Z, leafPoint } from '../hamlet/_homePlan';
import { progress } from '../progress';
import type { AddonEnv, AddonHold } from './_addons';
import { dogState } from './_dog';
import { doorPose } from './_homePoses';
import { DOORWAY, inDoorway } from './_homeWalk';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * His stilt house's doors, opened and closed at will (roam/_home.ts offers
 * them; the house draws them, hamlet/_home.ts; while they are shut the walk
 * map, the dog's way-finding and the camera keep out of the doorway,
 * _homeWalk.ts).
 *
 * - **Where**: on his feet on the floor, before the doorway (on the veranda
 *   or in the room, within `ZONE` of its middle) and turned to it (within
 *   `FACING`): E "បិទទ្វារ / Close the door" or "បើកទ្វារ / Open the door".
 *   Nowhere else, so E by his mat, on the rest of the veranda or by the dog
 *   is theirs.
 * - **Never on him**: while he or the dog is in the doorway the doors are not
 *   offered to close (they wait for the way to clear). In the room the leaves
 *   swing round toward him: he stands as near as their sweep lets him
 *   (`spotFor`), stepping back first if he is in it.
 * - **The swing**: he steps to his spot (outside, up to the doorway) turned to
 *   the doors, leans in with both hands out to them (their rings outside,
 *   their edges inside, following them as they move: _homePoses.ts
 *   `doorPose`), and they swing in half a second (`HOME_LEAF.swing`, eased)
 *   with a creak (`homeDoorOpen`) or a creak and a wooden clap
 *   (`homeDoorShut`); the very first time he unlocks them with the
 *   grandmother's key (`homeDoor`: the hasp, then the swing). Going to bed he
 *   shuts them the same way (roam/_home.ts).
 * - **Kept**: progress.ts `home.door` (true open, the default; false shut),
 *   besides `home.opened` (unlocked once).
 */

/** Where he works the doors from (local m): this far either way across the doorway's middle; this far out from the wall on the veranda, in from it in the room. */
const ZONE = { across: 1.25, out: 2.1, in: 2.1 };
/** Turned to the doorway's middle within this (radians), feet on the floor within this (m). */
const FACING = 0.95;
const LEVEL = 0.35;
/** The dog's size round (m) for the doorway. */
const DOG_R = 0.35;
/** Seconds: reaching out, the hasp (the first time), the most the doors wait for the doorway to clear, letting go. */
const T = { reach: 0.3, hasp: 0.35, wait: 2.5, back: 0.32 };
/** Stepping to his spot (m/s at his roaming size), turning (1/s), the longest the step may take over its walk (s). */
const STEP = 1.5;
const TURN = 9;
const STEP_SPARE = 0.6;
/**
 * His hands (his space, BU): where they are ready, out before him a shoulder's width apart, while the doors are far;
 * his shoulders (leaning in); how far from a shoulder a leaf may be for the arm to go out to it (straight out toward
 * it where it is past his short arms' reach: the IK keeps the length), and over how much more it gives up on it.
 */
const READY = { x: 4.6, y: 14.5, z: 7.5 };
const SHOULDER = { x: 4.6, y: 17.6, z: 2.5 };
const REACH = 22;
const FADE = 6;

/** The house's frame (as _homePlan.ts `homeLocal` / `homeToWorld`), without allocating. */
const S = Math.sin(HOME_AT.facing);
const C = Math.cos(HOME_AT.facing);
const lxOf = (x: number, z: number) => (x - HOME_AT.x) * C - (z - HOME_AT.z) * S;
const lzOf = (x: number, z: number) => (x - HOME_AT.x) * S + (z - HOME_AT.z) * C;
const wxOf = (lx: number, lz: number) => HOME_AT.x + lx * C + lz * S;
const wzOf = (lx: number, lz: number) => HOME_AT.z - lx * S + lz * C;
/** The doorway's middle (local z: in the wall's depth). */
const MID_Z = HOME_Z.wall - HOME_T / 2;

/** The doors open or shut from now on (kept: `home.door`); the house swings them (hamlet/_home.ts). */
export function setDoors(open: boolean): void {
  HOME.closed = !open;
  HOME.doorHold = -1;
  progress.set('home.door', open);
}

/** The doors are open now (or on their way open). */
export const doorsOpen = (): boolean => HOME.opened && !HOME.closed;

/**
 * Which side of the doors he works them from (+1 the veranda, −1 the room), or 0: not before them (in the doorway
 * itself, off to a side, too far, off the floor) or not turned to them.
 */
export function doorSide(ctx: RoamCtx, floor: number): -1 | 0 | 1 {
  const b = ctx.body;
  const p = b.pos;
  if (Math.abs(p.y - floor) > LEVEL) return 0;
  const lx = lxOf(p.x, p.z);
  const lz = lzOf(p.x, p.z);
  if (Math.abs(lx) > ZONE.across) return 0;
  const side = lz > HOME_Z.wall ? 1 : lz < HOME_Z.wall - HOME_T ? -1 : 0;
  if (side === 0 || (side > 0 ? lz > HOME_Z.wall + ZONE.out : lz < HOME_Z.wall - HOME_T - ZONE.in)) return 0;
  // (turned to the doorway's middle)
  const dx = wxOf(0, MID_Z) - p.x;
  const dz = wzOf(0, MID_Z) - p.z;
  const d = Math.hypot(dx, dz);
  if (d > 1e-3 && (dx * Math.sin(b.yaw) + dz * Math.cos(b.yaw)) / d < Math.cos(FACING)) return 0;
  return side;
}

/** He or the dog is in the doorway (where the shut doors would be): they wait. */
export function doorwayBusy(ctx: RoamCtx, floor: number): boolean {
  const p = ctx.body.pos;
  if (Math.abs(p.y - floor) < 1.5 && inDoorway(p.x, p.z, 0.3 * ctx.body.scale)) return true;
  const dog = dogState();
  return Math.abs(dog.y - floor) < 1 && inDoorway(dog.x, dog.z, DOG_R);
}

/**
 * Where he stands to work the doors from (local x, z, written to `out`), from where he is across (`lx`), body `r` m
 * round: on the veranda, up at the doorway (out of it: its rings in his hands) toward its middle; in the room, as near
 * as the leaves' sweep lets him (each turns round its hinge on a circle as wide as it is), toward the middle.
 */
function spotFor(lx: number, side: -1 | 1, r: number, out: [number, number]): [number, number] {
  if (side > 0) {
    out[0] = Math.min(0.7, Math.max(-0.7, lx));
    out[1] = DOORWAY.z1 + r + 0.06;
    return out;
  }
  const x = Math.min(0.45, Math.max(-0.45, lx));
  const R = HOME_LEAF.w + r + 0.08;
  const dx = HOME_DOOR.half - Math.abs(x);
  out[0] = x;
  out[1] = Math.min(HOME_LEAF.z - Math.sqrt(Math.max(0, R * R - dx * dx)), DOORWAY.z0 - r - 0.06);
  return out;
}

/** What E at the doors does: unlock them (the first time: they swing open), open them, close them. */
export type DoorAct = 'unlock' | 'open' | 'close';

/** A short hold of his own: E at the doors (he steps to them, reaches out, they swing, he lets go). */
export interface DoorSession {
  readonly kind: 'door';
  readonly done: boolean;
  hold(ctx: RoamCtx, dt: number): AddonHold;
  /** At once (a new mode, back to the map): what was asked is done (the doors' state), he stands at ease. */
  stop(): void;
}

const _lp: [number, number] = [0, 0];
const _a = new Vector3();
const _b = new Vector3();

/**
 * Start working the doors from `side` (doorSide). `unlock` (the first time): the house becomes his and the doors
 * unlocked (roam/_home.ts: `home.owned`, `home.opened`), called as they begin to swing.
 */
export function startDoor(env: AddonEnv, ctx: RoamCtx, floor: number, act: DoorAct, side: -1 | 1, unlock: () => void): DoorSession {
  const ex = env.explorer;
  const body = ctx.body;
  const open = act !== 'close';
  const [sx, sz] = spotFor(lxOf(body.pos.x, body.pos.z), side, 0.3 * body.scale, [0, 0]);
  const spot = { x: wxOf(sx, sz), z: wzOf(sx, sz) };
  const face = Math.atan2(wxOf(0, MID_Z) - spot.x, wzOf(0, MID_Z) - spot.z);
  const speed = STEP * (body.scale / 1.4);
  const stepMax = Math.hypot(spot.x - body.pos.x, spot.z - body.pos.z) / speed + STEP_SPARE;
  const handL = new Vector3(READY.x, READY.y, READY.z);
  const handR = new Vector3(-READY.x, READY.y, READY.z);
  let phase: 'step' | 'reach' | 'swing' | 'back' | 'done' = 'step';
  let pt = 0;
  let k = 0;
  let swung = false;
  let posed = false;
  let hasp = false;
  const posture = (tt: number) => doorPose(k, handL, handR, tt);

  /** A leaf's ring (outside) or edge (inside), at the rings' height, in his space (BU: +x his left, +z ahead, from his feet). */
  function ringOf(leaf: -1 | 1, out: Vector3): Vector3 {
    leafPoint(leaf, HOME.door, HOME_LEAF.w - HOME_LEAF.edge, side > 0 ? 0.085 : -0.06, _lp);
    const s = 1 / (BODY_UNIT_M * body.scale);
    const c = Math.cos(body.yaw);
    const n = Math.sin(body.yaw);
    const rx = wxOf(_lp[0], _lp[1]) - body.pos.x;
    const rz = wzOf(_lp[0], _lp[1]) - body.pos.z;
    return out.set((rx * c - rz * n) * s, (floor + HOME_LEAF.ring - body.pos.y) * s, (rx * n + rz * c) * s);
  }

  /** Hand `sh` (1 his left, −1 his right) to `at` where he can reach it, else ready before him (in between as it comes in reach). */
  function reachFor(hand: Vector3, sh: number, at: Vector3): void {
    const d = Math.hypot(at.x - sh * SHOULDER.x, at.y - SHOULDER.y, at.z - SHOULDER.z);
    const w = Math.min(1, Math.max(0, (REACH + FADE - d) / FADE));
    hand.set(sh * READY.x + (at.x - sh * READY.x) * w, READY.y + (at.y - READY.y) * w, READY.z + (at.z - READY.z) * w);
  }

  /** His hands to the leaves (the one more to his left in his left hand). */
  function hands(): void {
    ringOf(-1, _a);
    ringOf(1, _b);
    const leftFirst = _a.x >= _b.x;
    reachFor(handL, 1, leftFirst ? _a : _b);
    reachFor(handR, -1, leftFirst ? _b : _a);
  }

  function swing(): void {
    swung = true;
    if (act === 'unlock') unlock();
    setDoors(open);
    if (act !== 'unlock') SFX.play(open ? 'homeDoorOpen' : 'homeDoorShut');
  }

  function letGo(): void {
    if (posed) {
      ex.animator.posture = null;
      ex.animator.postureFeet = true;
      posed = false;
    }
    phase = 'done';
  }

  return {
    kind: 'door',
    get done() {
      return phase === 'done';
    },
    hold(c, dt) {
      pt += dt;
      c.cam.turn(c.input.lookYaw, c.input.lookPitch, c.input.zoom);
      body.vel.set(0, 0, 0);
      body.grounded = true;
      const h = 1.7 * body.scale * 0.95;
      c.cam.focus.set(body.pos.x, body.pos.y + h * 0.86, body.pos.z);
      switch (phase) {
        case 'step': {
          // To his spot (a step or two: out of the doorway, out of the leaves' way), turning to the doors.
          const dx = spot.x - body.pos.x;
          const dz = spot.z - body.pos.z;
          const d = Math.hypot(dx, dz);
          const go = Math.min(d, speed * dt);
          if (d > 1e-3) {
            body.pos.x += (dx / d) * go;
            body.pos.z += (dz / d) * go;
          }
          const dy = angleDiff(face, body.yaw);
          body.yaw += dy * Math.min(1, dt * TURN);
          // (his legs walk him forward to it; a step back out of the leaves' way is a shuffle)
          const ahead = d > 1e-3 ? Math.max(0, (dx * Math.sin(body.yaw) + dz * Math.cos(body.yaw)) / d) : 0;
          ex.setMotion((go / Math.max(1e-3, dt) / body.scale) * ahead, true, 0);
          if ((d < 0.02 && Math.abs(dy) < 0.12) || pt > stepMax) {
            body.pos.x = spot.x;
            body.pos.z = spot.z;
            ex.setMotion(0, true, 0);
            hands();
            ex.animator.posture = posture;
            ex.animator.postureFeet = true;
            posed = true;
            phase = 'reach';
            pt = 0;
          }
          break;
        }
        case 'reach':
          ex.setMotion(0, true, 0);
          body.yaw += angleDiff(face, body.yaw) * Math.min(1, dt * TURN);
          k = Math.min(1, k + dt / T.reach);
          hands();
          // (the first time, his hands on them: the hasp, and the doors swing as it lets go — `homeDoor`'s own timing)
          if (act === 'unlock' && !hasp && pt >= T.reach * 0.7) {
            hasp = true;
            SFX.play('homeDoor');
          }
          if (pt < T.reach * 0.7 + (act === 'unlock' ? T.hasp : 0)) break;
          // (shutting: not on him or the dog — they wait for the doorway to clear, and give up after a while)
          if (!open && doorwayBusy(c, floor)) {
            if (pt > T.wait) phase = 'back';
            break;
          }
          swing();
          phase = 'swing';
          pt = 0;
          break;
        case 'swing':
          ex.setMotion(0, true, 0);
          k = Math.min(1, k + dt / T.reach);
          hands();
          if (Math.abs(HOME.door - (open ? 1 : 0)) < 0.02 || pt > HOME_LEAF.swing + 0.3) {
            phase = 'back';
            pt = 0;
          }
          break;
        case 'back':
          ex.setMotion(0, true, 0);
          k = Math.max(0, k - dt / T.back);
          hands();
          if (k <= 0) letGo();
          break;
        default:
          break;
      }
      return { prompt: null };
    },
    stop() {
      if (phase === 'done') return;
      // (back to the map, a new mode: what he asked for is done all the same, unless the doorway was busy)
      if (!swung && (open || !doorwayBusy(ctx, floor))) {
        if (act === 'unlock') unlock();
        setDoors(open);
      }
      k = 0;
      letGo();
    },
  };
}
