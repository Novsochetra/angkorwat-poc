import { hash3 } from '../../voxel/random';
import { perPeriod } from '../festival/_kit';

/**
 * The square's hanging things swaying in the breeze (AWP-35; the owner: "subtle environmental movement without making
 * the scene chaotic"), posed in vertex shaders from a clock (no matrix changes: the part is FROZEN), the same way
 * everywhere: the edge strings (`_sqLifeSway.ts`), the canopy's strings, its hanging lanterns and their halos
 * (`_sqGlow.ts`, `_sqGlowBodies.ts`).
 *
 * - **A string** hanging from p to q, sagging `sag` m in the middle, swings sideways round the line between its ends,
 *   at most `k` × its sag there (a fifth low down, less on the canopy's high spans: `stringK`), none at the ends, on
 *   two slow beats of its own, rising a little as it swings out, as a hanging cord does.
 * - **A lantern** on its cord swings as a pendulum from where it hangs: ≤ ≈ 4°, a period of 2.5‥4 s, each its own
 *   phase and bearing (mostly with the breeze, east–west), going round a narrow ellipse; cord, wood and glowing body
 *   turn together round the pivot.
 *
 * Every speed is a whole number of turns in the kit's `PERIOD` (600 s), so a clock that wraps there never jumps.
 * Each thing carries its sway as three vec4s (`Sway`): a = (p, sag | pivot, angle), b = (q, phase | bearing, rad/s,
 * phase, 0), c = (u along the string, k, on a string 0/1, on a cord 0/1); all zero stays still. No branches: both
 * motions are computed and weighed (`c.z`, `c.w`), as the shaders of people and animals do (commit b250279).
 */

/** Twelve floats: three vec4s for the shader (see above). */
export type Sway = readonly number[];

/** A thing that does not sway. */
export const STILL: Sway = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

type V3 = { readonly x: number; readonly y: number; readonly z: number };

/** A string's sway, the same for each point of it but where along it the point is. */
export interface SwaySpan {
  p: V3;
  q: V3;
  sag: number;
  /** Its own beat (rad). */
  phase: number;
  /** How far it swings: × its sag at most, in the middle. */
  k: number;
}

/** The two beats a string swings on (rad/s: ≈ 4.8 s and ≈ 2.8 s). */
const BEAT_1 = perPeriod(1.31);
const BEAT_2 = perPeriod(2.23);

/** How far a string swings (× its sag): a fifth low down, less on a high span (its middle ≥ 7 m over the ground: 0.13). */
export function stringK(midHeight: number): number {
  const t = Math.max(0, Math.min(1, (midHeight - 4.5) / 3));
  return 0.2 - 0.07 * t * t * (3 - 2 * t);
}

/** A string's sway (its phase from its ends and `seed`). */
export function swaySpan(p: V3, q: V3, sag: number, k: number, seed: number): SwaySpan {
  return { p, q, sag, k, phase: hash3(p.x, p.z, seed, 77) * Math.PI * 2 };
}

/** The sway of the point `u` (0‥1) along a string. */
export function alongString(s: SwaySpan, u: number): Sway {
  return [s.p.x, s.p.y, s.p.z, s.sag, s.q.x, s.q.y, s.q.z, s.phase, u, s.k, 1, 0];
}

/**
 * The sway of a lantern hanging from (x, y, z) on a cord `drop` m long: its angle (≤ 3.6°, `calm` × that: 0.5 in a
 * sheltered passage), period (2.5‥4 s, longer cords slower), phase and bearing from `seed`.
 */
export function onCord(x: number, y: number, z: number, drop: number, seed: number, calm = 1): Sway {
  const h = (k: number) => hash3(x, z, seed, 300 + k);
  const deg = (2.2 + 1.4 * h(1)) * calm;
  const long = Math.max(0, Math.min(1, (drop - 0.35) / 1.15));
  const period = 2.5 + 1.0 * h(2) + 0.5 * long;
  const bearing = (h(3) - 0.5) * 1.2;
  return [x, y, z, (deg * Math.PI) / 180, bearing, perPeriod((Math.PI * 2) / period), h(4) * Math.PI * 2, 0, 0, 0, 0, 1];
}

/** GLSL: `nyeStringSway`, `nyeCordSwing` and `nyeSwayAt(p, a, b, c, t)` (p moved by its sway at the time t, s). */
export const SWAY_GLSL = /* glsl */ `
// A string's swing at u (0‥1 along it) from where it hangs still: sideways round the line between its ends, at most
// k × its sag in the middle (none at the ends), on two slow beats, rising a little as it swings out.
vec3 nyeStringSway(vec3 span, float sag, float k, float phase, float u, float t) {
  vec3 side = vec3(-span.z, 0.0, span.x) * inversesqrt(max(span.x * span.x + span.z * span.z, 1e-8));
  float bow = 4.0 * u * (1.0 - u);
  float swing = k * sag * bow * (0.62 * sin(t * ${BEAT_1.toFixed(6)} + phase) + 0.38 * sin(t * ${BEAT_2.toFixed(6)} + phase * 1.7));
  return side * swing + vec3(0.0, 0.5 * swing * swing / max(sag, 0.3), 0.0);
}

// A lantern on its cord: v (from the pivot) turned as a pendulum, sw = (angle rad, bearing, rad/s, phase): round the
// level axis across its swing, and a little round the one along it a quarter beat late (a narrow ellipse); to second
// order, so it rises as it swings out. Returns how far v moves.
vec3 nyeCordSwing(vec3 v, vec4 sw, float t) {
  float w = t * sw.z + sw.w;
  vec2 along = vec2(cos(sw.y), sin(sw.y));
  vec2 r = sw.x * (vec2(-along.y, along.x) * sin(w) + along * (0.35 * cos(w)));
  vec3 axis = vec3(r.x, 0.0, r.y);
  vec3 turned = cross(axis, v);
  return turned + 0.5 * cross(axis, turned);
}

// p moved by its sway: a = (p, sag | pivot, angle), b = (q, phase | bearing, rad/s, phase, 0),
// c = (u, k, on a string, on a cord); all zero: still.
vec3 nyeSwayAt(vec3 p, vec4 a, vec4 b, vec4 c, float t) {
  vec3 onString = nyeStringSway(b.xyz - a.xyz, a.w, c.y, b.w, c.x, t);
  vec3 onCord = nyeCordSwing(p - a.xyz, vec4(a.w, b.x, b.y, b.z), t);
  return p + c.z * onString + c.w * onCord;
}
`;
