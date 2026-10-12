import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import type { RideCow } from '../cattle/ride';
import { CH, type Flock, type V3 } from '../fauna/_kit';
import { OX, OX_LIE, OX_ROCK } from './_ox';

/**
 * A white ox he rides (roam/_cowRide.ts), drawn and posed: shared by every
 * keeper of cattle he may ride (the village herd, people/_sceneEastVillage.ts;
 * his own, map/cattle/) and the ride. No keeper imports the ride.
 *
 * - **Keepers**: while `cow.ridden`, draw it every frame with `drawRideCow`
 *   (its place and the ride's tilt on the instance, its step phase exactly,
 *   its gait, head, lying), and skip it in the herd's own step.
 * - **The ride** writes the `RideCow` fields, and what the contract has no
 *   field for in `OX_RIDDEN` (its gait share, how far down it lies while it
 *   gets up, the head's turn), and finds points on the body as the shader
 *   draws them (`oxPoint`: where he sits, the nose rope's ring).
 */

/** What the ride knows of the cow it has besides the `RideCow` fields (read by `drawRideCow` for that cow only). */
export const OX_RIDDEN = {
  /** The cow these are for (the ride's), or null. */
  cow: null as RideCow | null,
  /** The gait channel (0 still, 1 walk, up to 2 a trot), the step rate (cycles a second). */
  gait: 0,
  hz: 0,
  /** Lying (0 standing ‥ 1 down): exact while it gets up with him on it. */
  rest: 0,
  /** The head turned (−1 right ‥ 1 left): into its turns. */
  turn: 0,
};

/**
 * Its pace: ground covered in one cycle of its four steps (m, a cow of size 1), walking and trotting; the gait
 * channel for a speed (m/s, size `s`): 0‥1 walking up to `walk`, 1‥2 into the trot up to `trot`.
 */
export const OX_STRIDE = { walk: 0.95, trot: 1.3 };
export function oxGait(speed: number, s: number, walk: number, trot: number): number {
  const v = Math.abs(speed);
  if (v <= walk * s) return v / (walk * s);
  return 1 + Math.min(1, (v - walk * s) / Math.max(1e-3, (trot - walk) * s));
}
/** Steps a second at a gait (channel) and speed (m/s, size `s`): the stride lengthens into the trot. */
export function oxHz(gait: number, speed: number, s: number): number {
  const run = Math.min(1, Math.max(0, gait - 1));
  return Math.abs(speed) / ((OX_STRIDE.walk + (OX_STRIDE.trot - OX_STRIDE.walk) * run) * s);
}

const _q = new Quaternion();
const _e = new Euler();
const _m = new Matrix4();
const _p = new Vector3();
const _s = new Vector3();

/**
 * Draw a ridden cow (`cow.ridden`) from its fields, every frame: placed, tilted with the ground (and the ride's rock),
 * its legs on the ride's step phase (`gait`: cycles), its head, lying or not.
 */
export function drawRideCow(fl: Flock, i: number, cow: RideCow, now: number): void {
  const mine = OX_RIDDEN.cow === cow;
  fl.place(i, cow.x, cow.y, cow.z, cow.yaw, cow.scale);
  if (cow.pitch !== 0 || cow.roll !== 0) {
    // (`place` writes only the heading; the whole turn, written over it: `place` rewrites it next time, as it differs)
    _q.setFromEuler(_e.set(cow.pitch, cow.yaw, cow.roll, 'YXZ'));
    _m.compose(_p.set(cow.x, cow.y, cow.z), _q, _s.setScalar(cow.scale));
    _m.toArray(fl.mesh.instanceMatrix.array as Float32Array, i * 16);
    fl.mesh.instanceMatrix.needsUpdate = true;
  }
  const g = mine ? OX_RIDDEN.gait : oxGait(cow.speed, cow.scale, 1.3, 2.3);
  const hz = mine ? OX_RIDDEN.hz : oxHz(g, cow.speed, cow.scale);
  fl.pace(i, g, (cow.gait % 1) * Math.PI * 2, cow.speed < 0 ? -hz : hz, now);
  fl.set(i, CH.head, cow.head, now, true);
  fl.set(i, CH.turn, mine ? OX_RIDDEN.turn : 0, now, true);
  fl.set(i, CH.act, 0, now, true);
  // (lying: exact from the ride; else eased by the shader from `lying`)
  if (mine) fl.set(i, CH.rest, OX_RIDDEN.rest, now, true);
  else fl.set(i, CH.rest, cow.lying ? 1 : 0, now);
}

// ── Points on it, as the shader draws them ─────────────────────────────────

/** A ridden ox's pose: its feet (m), heading and tilt (rad), size, and the channels (gait 0‥2, rest, head, turn) and step phase (rad). */
export interface OxPose {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  scale: number;
  gait: number;
  rest: number;
  head: number;
  turn: number;
  phase: number;
}

const pivot = (name: string): V3 => OX.model.bones[OX.model.id(name)].pivot;
const PIVOT = { body: pivot('body'), neck: pivot('neck'), head: pivot('head') };
const ORIGIN: V3 = [0, 0, 0];

/** Points on it (model units: its own space, feet at y = 0, facing +z): where he sits (on the back, behind the hump), the nose rope's ring under the muzzle. */
export const OX_SEAT: V3 = [0, 1.3, -0.12];
export const OX_NOSE: V3 = [0, 0.9, 1.66];
/** The nose rope's way to his hands (model units, its left side): along the cheek, over the shoulder by the hump. */
export const OX_CHEEK: V3 = [0.17, 1.0, 1.32];
export const OX_SHOULDER: V3 = [0.22, 1.47, 0.42];
/** Its barrel's half-width (model units), the hump's top. */
export const OX_HALF = 0.3;

/** Turn `p` (model units) about `pv` by the shader's (pitch, yaw, roll) of a bone: R = Ry · Rx · Rz. */
function boneTurn(p: Vector3, pv: V3, rx: number, ry: number, rz: number): void {
  const x0 = p.x - pv[0];
  const y0 = p.y - pv[1];
  const z0 = p.z - pv[2];
  // (no allocation: this runs a few times a frame)
  let c = Math.cos(rz);
  let s = Math.sin(rz);
  const x1 = c * x0 - s * y0;
  const y1 = s * x0 + c * y0;
  c = Math.cos(rx);
  s = Math.sin(rx);
  const y2 = c * y1 - s * z0;
  const z2 = s * y1 + c * z0;
  c = Math.cos(ry);
  s = Math.sin(ry);
  p.set(c * x1 + s * z2 + pv[0], y2 + pv[1], -s * x1 + c * z2 + pv[2]);
}

/**
 * Where a point of the ox's body (`bone` 'body'), neck or head is now, in metres on the map: the shader's pose
 * (people/_ox.ts `faunaBoneRot`, `faunaRootMove`), then its place and tilt. The chewing and a head shake are left out.
 */
export function oxPoint(b: OxPose, bone: 'body' | 'neck' | 'head', point: V3, out: Vector3): Vector3 {
  const run = Math.min(1, Math.max(0, b.gait - 1));
  const walk = Math.min(1, Math.max(0, b.gait)) - run;
  const down = Math.max(b.head, 0);
  const up = Math.max(-b.head, 0);
  const ph = b.phase;
  const nod = (OX_ROCK.nod * walk + OX_ROCK.trotNod * run) * Math.sin(ph * 2);
  out.set(point[0], point[1], point[2]);
  if (bone === 'head') boneTurn(out, PIVOT.head, 0.15 * down - 0.1 * up + 0.5 * nod, b.turn * 0.6, 0.05 * b.turn);
  if (bone !== 'body') boneTurn(out, PIVOT.neck, 0.25 * down - 0.15 * up + nod, 0.2 * b.turn, 0);
  boneTurn(out, PIVOT.body, OX_ROCK.trotPitch * run * Math.sin(ph * 2 + 1), 0, (OX_ROCK.roll * walk + OX_ROCK.trotRoll * run) * Math.sin(ph));
  out.y += -OX_LIE.drop * b.rest + (OX_ROCK.lift * walk + OX_ROCK.trotLift * run) * Math.sin(ph * 2) * (1 - b.rest);
  out.multiplyScalar(b.scale);
  boneTurn(out, ORIGIN, b.pitch, b.yaw, b.roll);
  return out.set(out.x + b.x, out.y + b.y, out.z + b.z);
}

/** The body's own tilt under the seat now (radians, the shader's sense), on top of `OxPose.pitch`, `roll`. */
export function oxBodyTilt(b: OxPose, out: { pitch: number; roll: number }): { pitch: number; roll: number } {
  const run = Math.min(1, Math.max(0, b.gait - 1));
  const walk = Math.min(1, Math.max(0, b.gait)) - run;
  out.pitch = OX_ROCK.trotPitch * run * Math.sin(b.phase * 2 + 1);
  out.roll = (OX_ROCK.roll * walk + OX_ROCK.trotRoll * run) * Math.sin(b.phase);
  return out;
}
