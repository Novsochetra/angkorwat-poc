import { JOINT_NAMES, type JointName } from './skeleton';

/** Local joint offsets on top of the rest pose: Euler rotation (rad) + translation (BU). */
export interface JointPose {
  rx?: number;
  ry?: number;
  rz?: number;
  px?: number;
  py?: number;
  pz?: number;
}
export type Pose = Partial<Record<JointName, JointPose>>;

const CH = 6;
const INDEX: Record<JointName, number> = Object.fromEntries(JOINT_NAMES.map((n, i) => [n, i])) as Record<JointName, number>;

/** Flat float buffer of 6 channels per joint, used to blend poses cheaply. */
export class PoseBuffer {
  readonly data = new Float32Array(JOINT_NAMES.length * CH);

  clear(): this {
    this.data.fill(0);
    return this;
  }

  copy(other: PoseBuffer): this {
    this.data.set(other.data);
    return this;
  }

  /** Accumulate `weight × pose`. */
  add(pose: Pose, weight = 1): this {
    if (weight === 0) return this;
    for (const name in pose) {
      const p = pose[name as JointName]!;
      const o = INDEX[name as JointName] * CH;
      if (p.rx) this.data[o] += p.rx * weight;
      if (p.ry) this.data[o + 1] += p.ry * weight;
      if (p.rz) this.data[o + 2] += p.rz * weight;
      if (p.px) this.data[o + 3] += p.px * weight;
      if (p.py) this.data[o + 4] += p.py * weight;
      if (p.pz) this.data[o + 5] += p.pz * weight;
    }
    return this;
  }

  /** Move the listed joints toward `pose` by `weight` (0 = keep, 1 = replace). */
  override(pose: Pose, weight: number, joints: readonly JointName[]): this {
    if (weight <= 0) return this;
    for (const name of joints) {
      const p = pose[name] ?? {};
      const o = INDEX[name] * CH;
      const vals = [p.rx ?? 0, p.ry ?? 0, p.rz ?? 0, p.px ?? 0, p.py ?? 0, p.pz ?? 0];
      for (let c = 0; c < CH; c++) this.data[o + c] += (vals[c] - this.data[o + c]) * weight;
    }
    return this;
  }

  /** Blend this buffer toward another buffer. */
  lerp(other: PoseBuffer, t: number): this {
    for (let i = 0; i < this.data.length; i++) this.data[i] += (other.data[i] - this.data[i]) * t;
    return this;
  }

  get(name: JointName, channel: 0 | 1 | 2 | 3 | 4 | 5): number {
    return this.data[INDEX[name] * CH + channel];
  }

  set(name: JointName, channel: 0 | 1 | 2 | 3 | 4 | 5, value: number): this {
    this.data[INDEX[name] * CH + channel] = value;
    return this;
  }
}

/** Keyframe helper: sample a list of [time, pose] keys with eased interpolation. */
export function sampleKeys(t: number, keys: readonly (readonly [number, Pose])[]): Pose {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [t0, p0] = keys[i];
    const [t1, p1] = keys[i + 1];
    if (t <= t1) {
      const u = ease((t - t0) / (t1 - t0));
      return mixPose(p0, p1, u);
    }
  }
  return keys[keys.length - 1][1];
}

export function mixPose(a: Pose, b: Pose, u: number): Pose {
  const out: Pose = {};
  const names = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<JointName>;
  for (const n of names) {
    const pa = a[n] ?? {};
    const pb = b[n] ?? {};
    out[n] = {
      rx: lerp(pa.rx ?? 0, pb.rx ?? 0, u),
      ry: lerp(pa.ry ?? 0, pb.ry ?? 0, u),
      rz: lerp(pa.rz ?? 0, pb.rz ?? 0, u),
      px: lerp(pa.px ?? 0, pb.px ?? 0, u),
      py: lerp(pa.py ?? 0, pb.py ?? 0, u),
      pz: lerp(pa.pz ?? 0, pb.pz ?? 0, u),
    };
  }
  return out;
}

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const ease = (t: number) => {
  const c = clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};
export const smoothstep = (a: number, b: number, v: number) => ease((v - a) / (b - a));
