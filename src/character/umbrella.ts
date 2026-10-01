import { Euler, Group, Matrix4, Quaternion, Vector3 } from 'three';
import { VoxelBuilder } from '../voxel/VoxelBuilder';
import { buildVoxelMesh, disposeVoxelMesh, type VoxelQuality } from '../voxel/VoxelMesh';
import { JOINTS, type JointName } from './skeleton';

/**
 * The explorer's umbrella (ឆ័ត្រ): the plain rain umbrella of the markets in
 * Cambodia — a solid colour (deep blue by default; black or green), eight
 * panels on eight ribs with small metal tips, a thin metal shaft, a runner
 * and its stretchers under the canopy, a ferrule on top, and a dark curved
 * (J) handle held in the fist. Not a paper parasol, not a wagasa: the people's
 * rain umbrellas (people/_sceneMarket.ts `UMBRELLAS`) are the same kind.
 *
 * Built in body units (BU) like his other props, its origin in the middle of
 * the fist (the prop joint), the shaft along +Y, the hook curling forward
 * (+Z). Sized for his big head (a little over life size, as his hat is): the
 * canopy covers his head and shoulders with the shaft beside his face.
 *
 * Folding: the canopy (its own group, origin at the apex) is scaled — narrow
 * and long, it is furled down the shaft; `spread` 1 is open. The runner rides
 * down the shaft as it folds.
 *
 * `umbrellaArm` is the arm that holds it: arm IK (the Animator's `solveArm`,
 * without allocating) puts the fist out beside his shoulder at chest height,
 * the elbow down and out, and turns the wrist so the fist grips the shaft
 * along its grip axis.
 */

export type UmbrellaColor = 'blue' | 'black' | 'green';
export const UMBRELLA_COLORS: readonly UmbrellaColor[] = ['blue', 'black', 'green'];
export const isUmbrellaColor = (s: string | null | undefined): s is UmbrellaColor => !!s && (UMBRELLA_COLORS as readonly string[]).includes(s);

/** The canopy's cloth (two panel tones, the seams over the ribs) per colour (sRGB). */
const CLOTH: Record<UmbrellaColor, { a: number; b: number; seam: number }> = {
  // (the market's deep navy, as the pilgrims' `0x2a3a5a`, a little richer)
  blue: { a: 0x2b4170, b: 0x283c68, seam: 0x1f2f52 },
  black: { a: 0x2f2f33, b: 0x2b2b2f, seam: 0x1f1f22 },
  green: { a: 0x2f5a48, b: 0x2c5543, seam: 0x22443a },
};
const METAL = 0x40434a;
const TIP = 0xc8ccd1;
const HANDLE = 0x2e2420;

/** Sizes (BU). */
export const UMB = {
  /** Canopy radius (to a rib tip) and its height from the rim to the apex. */
  radius: 14.5,
  height: 6.0,
  /** Fist to apex along the shaft. */
  shaft: 25.5,
  /** The runner below the apex when open. */
  runner: 6.5,
  /** Folded: the canopy's width and length over open. */
  furlWide: 0.085,
  furlLong: 2.35,
} as const;

const RIBS = 8;
/** Strips down each panel: fine enough that a strip's corners (it is a box, the panel a triangle) stay under the seam. */
const STRIPS = 14;
/** The dome: a sphere cap through the apex and the rim. */
const CAP = (UMB.radius * UMB.radius + UMB.height * UMB.height) / (2 * UMB.height);
const domeY = (r: number) => -(CAP - Math.sqrt(Math.max(0, CAP * CAP - r * r)));

export interface UmbrellaModel {
  /** Origin in the fist, shaft along +Y (BU). */
  readonly root: Group;
  /** The canopy (origin at the apex): scaled by `setSpread`. */
  readonly canopy: Group;
  /** The rib tips (canopy space, open): where the drops gather and drip. */
  readonly tips: readonly Vector3[];
  /** 0 furled down the shaft … 1 open (over 1: the overshoot of the pop open); `flutter` −1‥1 (wind). */
  setSpread(spread: number, flutter: number): void;
  dispose(): void;
}

const _m = new Matrix4();
const _m2 = new Matrix4();
const _e = new Euler();
const _q = new Quaternion();
const _a = new Vector3();
const _b = new Vector3();
const Z = new Vector3(0, 0, 1);

/** Euler XYZ (the builder's) of a yaw `ry` after a tilt `rx` about the box's own X. */
function yawTilt(ry: number, rx: number): { rx: number; ry: number; rz: number } {
  _m.makeRotationY(ry).multiply(_m2.makeRotationX(rx));
  _e.setFromRotationMatrix(_m, 'XYZ');
  return { rx: _e.x, ry: _e.y, rz: _e.z };
}

/** A thin rod of blocks from `a` to `b` (its square side `w`). */
function rod(v: VoxelBuilder, a: Vector3, b: Vector3, w: number, color: number, mat: 'metal' | 'wood' | 'shorts'): void {
  const d = _b.subVectors(b, a);
  const len = d.length();
  if (len < 1e-4) return;
  _q.setFromUnitVectors(Z, d.multiplyScalar(1 / len));
  _e.setFromQuaternion(_q, 'XYZ');
  v.box((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, w, w, len, color, mat, { rx: _e.x, ry: _e.y, rz: _e.z });
}

/** The canopy (apex at the origin): panels, the seams over the ribs, the tips, the frame under it, the tie strap. */
function buildCanopy(color: UmbrellaColor): { blocks: VoxelBuilder; tips: Vector3[] } {
  const v = new VoxelBuilder();
  const C = CLOTH[color];
  const half = Math.PI / RIBS;
  const tan = Math.tan(half);
  const cos = Math.cos(half);
  const T = 0.42;
  // Panels: each a triangle from the apex to the chord between two rib tips, in strips down the slope.
  const reach = UMB.radius * cos;
  for (let p = 0; p < RIBS; p++) {
    const ac = (p * 2 + 1) * half;
    const sx = Math.sin(ac);
    const sz = Math.cos(ac);
    const tone = p % 2 ? C.b : C.a;
    for (let j = 0; j < STRIPS; j++) {
      const d0 = (j / STRIPS) * reach;
      const d1 = ((j + 1) / STRIPS) * reach;
      // (on a rib the cloth is at the dome's height for that ring; straight across between two ribs)
      const y0 = domeY(d0 / cos);
      const y1 = domeY(d1 / cos);
      const dm = (d0 + d1) / 2;
      const len = Math.hypot(d1 - d0, y1 - y0) + 0.12;
      const w = 2 * dm * tan + 0.06;
      const slope = Math.atan2(y0 - y1, d1 - d0);
      // (the strip's top on the profile: its middle half a thickness under it)
      const nx = Math.sin(slope);
      const ny = Math.cos(slope);
      v.box(sx * (dm - nx * T * 0.5), (y0 + y1) / 2 - ny * T * 0.5, sz * (dm - nx * T * 0.5), w, T, len, tone, 'shorts', {
        ...yawTilt(ac, slope),
        shade: 1.05 - j * 0.011,
      });
    }
  }
  // Seams over the ribs, the metal ribs under them, and the tips past the rim.
  const tips: Vector3[] = [];
  const steps = 10;
  for (let k = 0; k < RIBS; k++) {
    const a = k * 2 * half;
    const sx = Math.sin(a);
    const sz = Math.cos(a);
    for (let j = 0; j < steps; j++) {
      const r0 = (j / steps) * UMB.radius;
      const r1 = ((j + 1) / steps) * UMB.radius;
      // (each a little longer than its step, so the joints close up)
      const e0 = Math.max(0, r0 - 0.15);
      const e1 = Math.min(UMB.radius, r1 + 0.15);
      _a.set(sx * e0, domeY(e0) + 0.07, sz * e0);
      const b = new Vector3(sx * e1, domeY(e1) + 0.07, sz * e1);
      rod(v, _a.clone(), b, 0.62, C.seam, 'shorts');
      // (under the cloth: the rib)
      rod(v, new Vector3(sx * r0, domeY(r0) - T - 0.12, sz * r0), new Vector3(sx * r1, domeY(r1) - T - 0.12, sz * r1), 0.26, METAL, 'metal');
    }
    // The tip: a small metal cap just past the rim, along the rib's last slope.
    const r = UMB.radius;
    const end = new Vector3(sx * r, domeY(r), sz * r);
    const dir = new Vector3(sx * 0.06, domeY(r) - domeY(r - 0.06), sz * 0.06).normalize();
    rod(v, end, end.clone().addScaledVector(dir, 0.85), 0.36, TIP, 'metal');
    tips.push(end.clone().addScaledVector(dir, 0.9));
    // The stretcher: from the runner up to the rib's middle.
    const rm = r * 0.52;
    rod(v, new Vector3(sx * 0.35, -UMB.runner, sz * 0.35), new Vector3(sx * rm, domeY(rm) - T - 0.2, sz * rm), 0.22, METAL, 'metal');
  }
  // The runner (it slides up the shaft as the umbrella opens; in here it folds with the canopy).
  v.box(0, -UMB.runner, 0, 1.0, 1.1, 1.0, METAL, 'metal');
  // The top notch over the ribs' ends.
  v.box(0, -0.15, 0, 1.3, 0.7, 1.3, METAL, 'metal');
  // The tie strap hanging from the rim of one panel (its snap button on the end).
  const as = 3 * half;
  const rs = UMB.radius * cos - 0.4;
  const ys = domeY(UMB.radius) - 0.3;
  v.box(Math.sin(as) * rs, ys - 1.0, Math.cos(as) * rs, 0.75, 2.4, 0.18, C.seam, 'shorts', { ry: as });
  v.box(Math.sin(as) * (rs + 0.1), ys - 2.05, Math.cos(as) * (rs + 0.1), 0.45, 0.45, 0.22, TIP, 'metal', { ry: as });
  return { blocks: v, tips };
}

/** What stays as it is: the shaft, the ferrule on top, the handle with its hook (the fist's middle at the origin). */
function buildStick(): VoxelBuilder {
  const v = new VoxelBuilder();
  // The shaft from the handle up to the apex, the ferrule over the canopy.
  v.span(-0.2, 1.2, -0.2, 0.2, UMB.shaft, 0.2, METAL, 'metal');
  v.box(0, UMB.shaft + 0.95, 0, 0.42, 1.5, 0.42, HANDLE, 'wood');
  v.box(0, UMB.shaft + 1.75, 0, 0.3, 0.3, 0.3, TIP, 'metal');
  // The handle: the grip through the fist, a ring where it meets the shaft, and the hook curling forward under the hand.
  v.span(-0.48, -2.9, -0.48, 0.48, 1.5, 0.48, HANDLE, 'wood');
  v.box(0, 1.55, 0, 0.62, 0.3, 0.62, METAL, 'metal');
  const R = 1.35;
  const cz = R + 0.05;
  const cy = -2.9;
  const n = 7;
  for (let i = 0; i < n; i++) {
    // (from straight down at the grip's end, round under, up the front)
    const a0 = Math.PI * (i / n);
    const a1 = Math.PI * ((i + 1) / n);
    _a.set(0, cy - Math.sin(a0) * R, cz - Math.cos(a0) * R);
    rod(v, _a.clone(), new Vector3(0, cy - Math.sin(a1) * R, cz - Math.cos(a1) * R), 0.82, HANDLE, 'wood');
  }
  // (the end of the hook, rounded off a little higher)
  v.box(0, cy + 0.35, cz + R, 0.82, 0.9, 0.82, HANDLE, 'wood');
  return v;
}

/** Build the umbrella's meshes (once; the colour is fixed for it). */
export function buildUmbrella(color: UmbrellaColor = 'blue', quality: VoxelQuality = 'high'): UmbrellaModel {
  const root = new Group();
  root.name = 'umbrella';
  const stick = buildVoxelMesh(buildStick(), { quality, name: 'umbrella:stick' });
  const { blocks, tips } = buildCanopy(color);
  const cloth = buildVoxelMesh(blocks, { quality, name: 'umbrella:canopy' });
  const canopy = new Group();
  canopy.name = 'umbrella:fold';
  canopy.position.set(0, UMB.shaft, 0);
  canopy.add(cloth);
  root.add(stick, canopy);
  return {
    root,
    canopy,
    tips,
    setSpread(s, flutter) {
      const k = Math.max(0, s);
      const wide = UMB.furlWide + (1 - UMB.furlWide) * k;
      // (furled long down the shaft; open, the dome's own height, breathing a little in the wind)
      const long = (UMB.furlLong + (1 - UMB.furlLong) * Math.min(1, k)) * (1 + 0.035 * flutter * Math.min(1, k));
      canopy.scale.set(wide, long, wide);
    },
    dispose() {
      root.removeFromParent();
      disposeVoxelMesh(stick);
      disposeVoxelMesh(cloth);
    },
  };
}

// ── The arm that holds it ───────────────────────────────────────────────────

const sub = (a: JointName, b: JointName) => new Vector3(...JOINTS[a].pivot).sub(new Vector3(...JOINTS[b].pivot));
/** Arm bones in chest space (BU) at rest: the shoulder, the upper arm, elbow → wrist, wrist → the fist's middle (as the Animator's). */
const ARM = {
  L: { shoulder: sub('shoulderL', 'chest'), upper: sub('elbowL', 'shoulderL'), wrist: sub('wristL', 'elbowL'), fist: sub('propL', 'wristL') },
  R: { shoulder: sub('shoulderR', 'chest'), upper: sub('elbowR', 'shoulderR'), wrist: sub('wristR', 'elbowR'), fist: sub('propR', 'wristR') },
};
/** Lengths: the upper arm, and the elbow to the fist's middle. */
const UPPER = ARM.R.upper.length();
const FORE = sub('propR', 'elbowR').length();
/** The upper arm's rest direction (it splays out a little; the forearm hangs straight down). */
const U0 = { L: ARM.L.upper.clone().normalize(), R: ARM.R.upper.clone().normalize() };
/**
 * Where the fist holds it (chest space, BU; the right hand, the left mirrors it):
 * out beside the shoulder, a little forward, at chest height, so the shaft
 * goes up clear of the side of his head. Running, further forward and up.
 */
const FIST = new Vector3(-7.0, 5.0, 4.0);
const FIST_RUN = new Vector3(0.3, 0.9, 1.6);
/** The elbow: down, out and a little back. */
const POLE = { R: new Vector3(-0.75, -1, -0.3).normalize(), L: new Vector3(0.75, -1, -0.3).normalize() };

/** An arm's joints (Euler XYZ, radians), filled in place by `umbrellaArm` (no allocation per frame). */
export interface UmbrellaArm {
  readonly shoulder: Vector3;
  elbow: number;
  readonly wrist: Vector3;
}
const OUT: UmbrellaArm = { shoulder: new Vector3(), elbow: 0, wrist: new Vector3() };

const _t = new Vector3();
const _d = new Vector3();
const _f = new Vector3();
const _u = new Vector3();
const _p = new Vector3();
const _v2 = new Vector3();
const _goal = new Vector3();
const _rs = new Matrix4();
const _re = new Matrix4();
const _rw = new Matrix4();
const _rest = new Matrix4();
const _b1 = new Vector3();
const _b2 = new Vector3();
const _b3 = new Vector3();

/** Orthonormal frame from a direction and a second vector in its plane (matrix columns). */
function frame(a: Vector3, b: Vector3, out: Matrix4): Matrix4 {
  _b1.copy(a).normalize();
  _b2.copy(b).addScaledVector(_b1, -b.dot(_b1)).normalize();
  _b3.crossVectors(_b1, _b2);
  return out.makeBasis(_b1, _b2, _b3);
}

/**
 * Two-bone arm IK in chest space (the Animator's `solveArm`, into `OUT`): the
 * shoulder's turn and the elbow's bend that put the fist on `target`, the
 * elbow toward `pole`. The wrist is left as it is.
 */
function solve(side: 'L' | 'R', target: Vector3, pole: Vector3): void {
  const a = UPPER;
  const b = FORE;
  _d.subVectors(target, ARM[side].shoulder);
  const len = Math.min(a + b - 0.01, Math.max(Math.abs(a - b) + 0.01, _d.length()));
  _d.normalize();
  const cosA = (a * a + len * len - b * b) / (2 * a * len);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  _p.copy(pole).addScaledVector(_d, -pole.dot(_d)).normalize();
  // (the upper arm's way, then the forearm's)
  _u.copy(_d).multiplyScalar(cosA).addScaledVector(_p, sinA);
  _f.copy(_d).multiplyScalar(len).addScaledVector(_u, -a).normalize();
  const u0 = U0[side];
  const elbow = -Math.acos(Math.min(1, Math.max(-1, _u.dot(_f) / -u0.y)));
  _v2.set(0, -Math.cos(elbow), -Math.sin(elbow));
  frame(u0, _v2, _rest).transpose();
  frame(_u, _f, _rs).multiply(_rest);
  _e.setFromRotationMatrix(_rs, 'XYZ');
  OUT.shoulder.set(_e.x, _e.y, _e.z);
  OUT.elbow = elbow;
}

/** The forearm's rotation in chest space (the shoulder's turn, then the elbow's bend). */
function forearm(out: Matrix4): Matrix4 {
  out.makeRotationFromEuler(_e.set(OUT.shoulder.x, OUT.shoulder.y, OUT.shoulder.z, 'XYZ'));
  return out.multiply(_re.makeRotationX(OUT.elbow));
}

/** The fist's middle (chest space) for the arm in `OUT`. */
function fistOf(side: 'L' | 'R', out: Vector3): Vector3 {
  const arm = ARM[side];
  forearm(_rs);
  out.copy(arm.fist).applyMatrix4(_rw.makeRotationFromEuler(_e.set(OUT.wrist.x, OUT.wrist.y, OUT.wrist.z, 'XYZ'))).add(arm.wrist).applyMatrix4(_rs);
  _u.copy(arm.upper).applyMatrix4(_rw.makeRotationFromEuler(_e.set(OUT.shoulder.x, OUT.shoulder.y, OUT.shoulder.z, 'XYZ')));
  return out.add(_u).add(arm.shoulder);
}

/** The wrist's turn that puts the fist's grip axis (+Z) along `shaft` (chest space, unit), the fingers as near the forearm's line as it lets. */
function gripWrist(shaft: Vector3): void {
  forearm(_rs).transpose();
  _f.copy(shaft).applyMatrix4(_rs).normalize();
  _u.set(0, 1, 0).addScaledVector(_f, -_f.y);
  if (_u.lengthSq() < 1e-6) _u.set(0, 0, 1).addScaledVector(_f, -_f.z);
  _u.normalize();
  _p.crossVectors(_u, _f);
  _e.setFromRotationMatrix(_rw.makeBasis(_p, _u, _f), 'XYZ');
  OUT.wrist.set(_e.x, _e.y, _e.z);
}

/**
 * The arm holding the umbrella (chest space): the fist where it holds it
 * (`run` 0‥1 brings it forward and up), the wrist turned so the shaft
 * (`shaft`, chest space, unit) runs through the fist; twice round, so the
 * wrist's turn does not move the fist off its place. The same object every
 * call (no allocation).
 */
export function umbrellaArm(side: 'L' | 'R', run: number, shaft: Vector3): Readonly<UmbrellaArm> {
  const goal = _goal.copy(FIST).addScaledVector(FIST_RUN, run);
  if (side === 'L') goal.x = -goal.x;
  _t.copy(goal);
  solve(side, _t, POLE[side]);
  for (let i = 0; i < 2; i++) {
    gripWrist(shaft);
    // (aim off by as far as the wrist's turn took the fist from its place)
    _t.add(_a.subVectors(goal, fistOf(side, _b)));
    solve(side, _t, POLE[side]);
  }
  gripWrist(shaft);
  return OUT;
}
