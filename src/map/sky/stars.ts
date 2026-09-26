import { MathUtils, Vector3, Vector4, type PerspectiveCamera } from 'three';
import { hash3 } from '../../voxel/random';

/**
 * Shooting stars on clear nights: rare (one every 20–60 s), quick (about
 * half a second to a second), a soft thin streak whose tail fades behind
 * its head. The sky dome draws them ({@link METEOR_GLSL}); this file says
 * when and where.
 *
 * Seeded by time: the night is cut into {@link SLOT} s slots, each with one
 * meteor 10–30 s into it (none in the first slot, so a still at the default
 * `t=12` has none; `t=` picks one, see {@link meteorTimes}). It is placed
 * where the camera looks when it starts: across the part of the sky in view,
 * falling at a slant.
 */

/** Seconds per slot (one meteor in each, after the first). */
export const SLOT = 40;
const SEED = 6311;

/** When the meteors of slots `from…to` start and how long each lasts (s): to find a `t=` for a still. */
export function meteorTimes(from = 1, to = 8): { start: number; duration: number }[] {
  const out: { start: number; duration: number }[] = [];
  for (let k = Math.max(1, from); k <= to; k++) out.push({ start: startOf(k), duration: durationOf(k) });
  return out;
}
const startOf = (k: number) => k * SLOT + 10 + 20 * hash3(k, 1, 0, SEED);
const durationOf = (k: number) => 0.55 + 0.5 * hash3(k, 2, 0, SEED);

/** The meteor now, for the sky dome's uniforms. */
export interface MeteorNow {
  /** Where it starts and where it would end (unit directions). */
  from: Vector3;
  to: Vector3;
  /** Head (rad along from → to), tail length (rad), brightness (0 = none), width (rad). */
  info: Vector4;
}

export interface Meteors {
  now: MeteorNow;
  /** Step to time t (s, the drift clock); `stars` 0‥1 is how starry the sky is (none by day or under cloud). */
  update(t: number, camera: PerspectiveCamera, stars: number): MeteorNow;
}

const _f = new Vector3();

export function createMeteors(): Meteors {
  const now: MeteorNow = { from: new Vector3(), to: new Vector3(0, 0, -1), info: new Vector4() };
  let placed = -1;
  let length = 0;

  /** Lay slot k's meteor across the sky in view (angles from the camera's heading and pitch). */
  function place(k: number, camera: PerspectiveCamera): void {
    camera.getWorldDirection(_f);
    const heading = Math.atan2(_f.x, -_f.z);
    const pitch = Math.asin(MathUtils.clamp(_f.y, -1, 1));
    const half = MathUtils.degToRad(camera.fov / 2);
    const wide = Math.atan(Math.tan(half) * camera.aspect);
    // Start: somewhere across the view, in the sky between just over the horizon and near the top.
    const top = Math.min(pitch + half - 0.02, 0.6);
    const lo = 0.06;
    const el0 = lo + (Math.max(top, lo + 0.02) - lo) * (0.35 + 0.65 * hash3(k, 3, 0, SEED));
    const b0 = heading + (hash3(k, 4, 0, SEED) - 0.5) * wide * 1.3;
    // Falling at a slant (20–55° below the horizontal), left or right, 6–13° long, ending over the horizon.
    const side = hash3(k, 5, 0, SEED) < 0.5 ? -1 : 1;
    const slant = MathUtils.degToRad(20 + 35 * hash3(k, 6, 0, SEED));
    length = MathUtils.degToRad(6 + 7 * hash3(k, 7, 0, SEED));
    const el1 = Math.max(0.02, el0 - Math.sin(slant) * length);
    const b1 = b0 + (side * Math.cos(slant) * length) / Math.cos(el0);
    now.from.set(Math.sin(b0) * Math.cos(el0), Math.sin(el0), -Math.cos(b0) * Math.cos(el0));
    now.to.set(Math.sin(b1) * Math.cos(el1), Math.sin(el1), -Math.cos(b1) * Math.cos(el1));
    length = now.from.angleTo(now.to);
  }

  return {
    now,
    update(t, camera, stars) {
      now.info.z = 0;
      const k = Math.floor(t / SLOT);
      if (k < 1 || stars < 0.3) return now;
      const age = (t - startOf(k)) / durationOf(k);
      if (age < 0 || age > 1) return now;
      if (placed !== k) {
        place(k, camera);
        placed = k;
      }
      // The head runs the whole way; the tail (a third of it) trails behind; it flares up and fades out.
      const fade = MathUtils.smoothstep(age, 0, 0.12) * (1 - MathUtils.smoothstep(age, 0.6, 1));
      now.info.set(age * length, length * 0.34 * Math.min(1, age * 2.5), fade * MathUtils.smoothstep(stars, 0.3, 0.8), 0.0011);
      return now;
    },
  };
}

/**
 * GLSL for the sky dome: `meteorAt(d)` is the light of the shooting star
 * seen along d (add it to the colour). Uniforms `uMeteorFrom`, `uMeteorTo`
 * (unit directions) and `uMeteor` ({@link MeteorNow.info}).
 */
export const METEOR_GLSL = /* glsl */ `
uniform vec3 uMeteorFrom;
uniform vec3 uMeteorTo;
uniform vec4 uMeteor;
vec3 meteorAt(vec3 d) {
  vec3 nrm = normalize(cross(uMeteorFrom, uMeteorTo));
  // Off its path (rad) and how far along it (rad from the start).
  float off = dot(d, nrm);
  float along = atan(dot(d, cross(nrm, uMeteorFrom)), dot(d, uMeteorFrom));
  float head = uMeteor.x;
  float behind = head - along;
  if (behind < -0.004 || behind > uMeteor.y + 0.004) return vec3(0.0);
  // A thin line, soft across; bright at the head, fading along the tail.
  float w = uMeteor.w;
  float line = exp(-(off * off) / (w * w));
  float tail = behind >= 0.0 ? pow(1.0 - clamp(behind / max(uMeteor.y, 1e-4), 0.0, 1.0), 1.6) : 0.0;
  float glow = exp(-(behind * behind + off * off) / (w * w * 5.0));
  return (vec3(0.8, 0.88, 1.0) * line * tail * 1.6 + vec3(1.0, 0.95, 0.85) * glow * 3.0) * uMeteor.z;
}
`;
