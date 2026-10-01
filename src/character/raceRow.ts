import { Euler, Group, Matrix4, Quaternion, Vector3, type Object3D } from 'three';
import { traceSource } from '../feedback/sourceTrace';
import { VoxelBuilder } from '../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../voxel/VoxelMesh';
import { solveArm } from './Animator';
import type { JointPose, Pose } from './pose';
import { JOINTS, type JointName } from './skeleton';

/**
 * The explorer paddling a ngo (the Water Festival's racing boat; the map's
 * roam/_raceRow.ts): a posture for `Animator.posture` with `postureFeet =
 * false`, sitting on a thwart of his own behind the crew's last pair, knees up,
 * his feet on the boat's floor, a single-bladed paddle in both hands on his
 * left (the port side), as the crew's.
 *
 * The stroke (`RaceRowState.u`, 0‥1, one a beat): the catch at 0 (leaning
 * forward, the blade going in ahead of his knees), the pull to 0.4 (the
 * blade sweeps back along the side, he comes upright, the shoulders turning
 * with it), then out of the water and forward through the air to the next
 * catch. Waiting for a beat he holds the paddle poised over the water
 * (`poise`); before the start and after the finish it lies across his lap
 * (`rest`); a win: the paddle held up high in his right hand, the left fist
 * up (`cheer`); a loss: across the lap, his head down (`slump`).
 *
 * The paddle hangs from the `root` joint (his own space, which the posture
 * leaves alone), placed from the grip and the shaft's way in that space, so it
 * goes into the water where the boat's side is whatever his chest does; both
 * fists reach its shaft by arm IK (the top hand on the grip, the lower one
 * seven units down).
 *
 * Units: body units (BU) in the explorer's space: +z forward, +x his left, the
 * origin the top of the thwart under his hips (the roaming explorer is drawn at
 * 1.4 × his true size: a BU is 0.0735 m on the map).
 */

export interface RaceRowState {
  /** Where the stroke is (0 the catch … 0.4 the end of the pull … 1 the next catch). */
  u: number;
  /** Poised for the next catch, the blade just over the water (0‥1): waiting for the beat. */
  poise: number;
  /** The paddle across his lap, his hands on it (0‥1): waiting at the start, at the result. */
  rest: number;
  /** A win: the paddle up high in his right hand, the left fist up (0‥1). */
  cheer: number;
  /** A loss: slumped a little, the head down (0‥1). */
  slump: number;
  /** The boat's pitch (+ bow down) and roll (+ port up), radians. */
  pitch: number;
  roll: number;
  /** Head turned (+ his left, − his right: the rival's boat), radians. */
  look: number;
  /** Seconds (breathing, the cheer's pumps). */
  t: number;
}

export const newRaceRowState = (): RaceRowState => ({ u: 0.9, poise: 1, rest: 1, cheer: 0, slump: 0, pitch: 0, roll: 0, look: 0, t: 0 });

/** The hips joint over the thwart (BU), and how far back of his origin. */
const HIP_UP = 2.6;
const HIP_BACK = 0;
/** Grip (T top) to the blade's middle, and to where the lower hand holds the shaft (BU along the shaft). */
const TO_BLADE = 22.6;
const TO_LOWER = 7;
/** The fist's centre a little off the grip's top. */
const TOP_HAND = 0.6;

/**
 * The stroke's keys: the grip (BU, his space), the shaft's lean fore and aft (`a`: + the blade ahead) and out over
 * the side (`r`: + the blade out to his left), the chest's lean (`lean`: + forward), twist (`twist`: − the left
 * shoulder forward) and side bend.
 */
interface Key {
  u: number;
  g: [number, number, number];
  a: number;
  r: number;
  lean: number;
  twist: number;
}
const KEYS: Key[] = [
  { u: 0, g: [-0.6, 11.4, 5.4], a: 0.42, r: 0.36, lean: 0.42, twist: -0.24 },
  { u: 0.2, g: [-0.2, 10.9, 3.0], a: 0.0, r: 0.4, lean: 0.24, twist: -0.06 },
  { u: 0.4, g: [0.2, 10.5, 0.6], a: -0.45, r: 0.45, lean: 0.03, twist: 0.12 },
  { u: 0.55, g: [0.0, 12.8, 1.2], a: -0.32, r: 0.66, lean: 0.06, twist: 0.08 },
  { u: 0.8, g: [-0.6, 13.6, 4.4], a: 0.22, r: 0.62, lean: 0.3, twist: -0.14 },
  { u: 1, g: [-0.6, 11.4, 5.4], a: 0.42, r: 0.36, lean: 0.42, twist: -0.24 },
];
/** Poised: the catch's reach, the blade lifted just clear of the water. */
const POISE: Key = { u: 0, g: [-0.6, 13.4, 5.2], a: 0.38, r: 0.62, lean: 0.36, twist: -0.2 };

/** Across his lap: the grip by his right hip, the shaft across his thighs, the blade out over the side (resting on the gunwale). */
const LAP_G = new Vector3(-4.2, 4.9, 4.4);
const LAP_DIR = new Vector3(1, 0.05, 0.12).normalize();
/** A win: held up in his right fist, the blade to the sky (the fist this far up and out). */
const UP_FIST = new Vector3(-6.2, 16.6, 1.6);
const UP_DIR = new Vector3(-0.12, 1, 0.08).normalize();

const REST_HIPS = new Vector3(...JOINTS.hips.pivot);
const CHEST_REST = new Vector3(...JOINTS.chest.pivot).sub(REST_HIPS);
/** Elbows down and out a little, back (chest space). */
const POLE = { L: new Vector3(0.75, -1, -0.35).normalize(), R: new Vector3(-0.75, -1, -0.35).normalize() };

const smooth = (u: number) => {
  const c = u < 0 ? 0 : u > 1 ? 1 : u;
  return c * c * (3 - 2 * c);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** The stroke's key at `u` (eased between its keys), into `out`. */
function strokeAt(u: number, out: Key): Key {
  const w = ((u % 1) + 1) % 1;
  let i = 0;
  while (i < KEYS.length - 2 && w > KEYS[i + 1].u) i++;
  const k0 = KEYS[i];
  const k1 = KEYS[i + 1];
  const t = smooth((w - k0.u) / (k1.u - k0.u));
  for (let c = 0; c < 3; c++) out.g[c] = mix(k0.g[c], k1.g[c], t);
  out.a = mix(k0.a, k1.a, t);
  out.r = mix(k0.r, k1.r, t);
  out.lean = mix(k0.lean, k1.lean, t);
  out.twist = mix(k0.twist, k1.twist, t);
  return out;
}

// Scratch (no allocation per frame beyond the arm IK's own).
const _k: Key = { u: 0, g: [0, 0, 0], a: 0, r: 0, lean: 0, twist: 0 };
const _g = new Vector3();
const _d = new Vector3();
const _d2 = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _n = new Vector3();
const _t = new Vector3();
const _m = new Matrix4();
const _m2 = new Matrix4();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const _one = new Vector3(1, 1, 1);
const UP = new Vector3(0, 1, 0);
const FWD = new Vector3(0, 0, 1);

/** One pose object, filled in place every frame. */
const JOINT_LIST: JointName[] = ['hips', 'chest', 'neck', 'head', 'hipL', 'hipR', 'kneeL', 'kneeR', 'ankleL', 'ankleR', 'shoulderL', 'elbowL', 'wristL', 'shoulderR', 'elbowR', 'wristR', 'backpack'];
const POSE: Pose = Object.fromEntries(JOINT_LIST.map((j) => [j, {}])) as Pose;
const set = (j: JointName, rx = 0, ry = 0, rz = 0, px = 0, py = 0, pz = 0) => {
  const p = POSE[j] as JointPose;
  p.rx = rx;
  p.ry = ry;
  p.rz = rz;
  p.px = px;
  p.py = py;
  p.pz = pz;
};
const copyArm = (p: Pose) => {
  for (const k in p) {
    const src = p[k as JointName]!;
    set(k as JointName, src.rx ?? 0, src.ry ?? 0, src.rz ?? 0);
  }
};

/**
 * The posture now; `paddle` (his paddle, hung from the root joint) is placed here too. The returned pose is the
 * same object every time (filled anew).
 */
export function raceRowPose(s: RaceRowState, paddle: Object3D | null): Pose {
  const rest = smooth(s.rest);
  const cheer = smooth(s.cheer);
  const slump = smooth(s.slump);
  const poise = smooth(s.poise) * (1 - rest);
  const breathe = Math.sin(s.t * 1.6) * 0.015;

  // The stroke (or poised), then the chest and the paddle's grip and way.
  strokeAt(s.u, _k);
  const k = _k;
  k.g[0] = mix(k.g[0], POISE.g[0], poise);
  k.g[1] = mix(k.g[1], POISE.g[1], poise);
  k.g[2] = mix(k.g[2], POISE.g[2], poise);
  k.a = mix(k.a, POISE.a, poise);
  k.r = mix(k.r, POISE.r, poise);
  k.lean = mix(k.lean, POISE.lean, poise);
  k.twist = mix(k.twist, POISE.twist, poise);
  const active = 1 - Math.max(rest, cheer);
  const lean = k.lean * active + (0.12 + 0.2 * slump) * (1 - active) + breathe;
  const twist = k.twist * active;
  // (the shaft: from the grip, out over the side and fore or aft)
  _g.set(k.g[0], k.g[1], k.g[2]);
  _d.set(Math.sin(k.r), -Math.cos(k.r) * Math.cos(k.a), Math.cos(k.r) * Math.sin(k.a));
  // Across the lap, or held up: blend the grip and the way.
  _g.lerp(LAP_G, rest);
  _d.lerp(LAP_DIR, rest);
  if (cheer > 0) {
    // (the fist up high: the grip a little under it, the blade over his head to the sky)
    _t.copy(UP_FIST).addScaledVector(UP_DIR, -TOP_HAND - 1.2);
    _t.y += Math.sin(s.t * 5.2) * 0.5 * cheer;
    _g.lerp(_t, cheer);
    _d.lerp(UP_DIR, cheer);
  }
  _d.normalize();

  // Hips on the thwart (with the boat's pitch and roll), the chest over them.
  set('hips', s.pitch - 0.06 + 0.04 * slump, 0, s.roll, 0, HIP_UP - REST_HIPS.y, -HIP_BACK - REST_HIPS.z);
  set('chest', lean, twist, 0.05 * active * Math.sin(Math.PI * Math.min(1, s.u / 0.4)));
  set('neck', -0.35 * lean + 0.1 * slump, 0.4 * s.look - 0.4 * twist);
  set('head', -0.3 * lean + 0.3 * slump - 0.1 * cheer, 0.55 * s.look - 0.3 * twist);
  // Knees up, apart a little, his feet flat on the boat's floor (≈ 5 BU under the thwart).
  set('hipL', -1.58, 0.14, 0.1);
  set('hipR', -1.58, -0.14, -0.1);
  set('kneeL', 1.82);
  set('kneeR', 1.82);
  set('ankleL', -0.22);
  set('ankleR', -0.22);
  set('backpack');

  // His hands on the shaft (chest space for the IK): the top one on the grip, the lower one down the shaft.
  const hp = POSE.hips!;
  _q.setFromEuler(_e.set(hp.rx ?? 0, hp.ry ?? 0, hp.rz ?? 0));
  _m.compose(_t.set(REST_HIPS.x + (hp.px ?? 0), REST_HIPS.y + (hp.py ?? 0), REST_HIPS.z + (hp.pz ?? 0)), _q, _one);
  const ch = POSE.chest!;
  _m2.compose(CHEST_REST, _q2.setFromEuler(_e.set(ch.rx ?? 0, ch.ry ?? 0, ch.rz ?? 0)), _one);
  _m.multiply(_m2).invert();
  const top = _t.copy(_g).addScaledVector(_d, TOP_HAND).applyMatrix4(_m);
  if (cheer < 0.5) copyArm(solveArm('R', top, POLE.R));
  else copyArm(solveArm('R', top, _n.set(-1, -0.2, -0.6).normalize()));
  if (cheer > 0.5) {
    // (the left fist up: a pump with the cheer)
    const pump = Math.sin(s.t * 5.2 + 1.2);
    set('shoulderL', -2.5 - 0.25 * pump, 0, 0.4);
    set('elbowL', -0.9 - 0.3 * pump);
    set('wristL');
  } else copyArm(solveArm('L', _d2.copy(_g).addScaledVector(_d, TO_LOWER).applyMatrix4(_m), POLE.L));

  if (paddle) {
    // The paddle's own frame: its −y down the shaft (grip → blade), the blade's face across (normal fore and aft;
    // lying flat across the lap).
    _y.copy(_d).negate();
    _n.copy(FWD).lerp(UP, rest).normalize();
    _x.crossVectors(_d, _n);
    if (_x.lengthSq() < 1e-6) _x.set(1, 0, 0);
    _x.normalize();
    _z.crossVectors(_x, _y).normalize();
    _m.makeBasis(_x, _y, _z);
    paddle.quaternion.setFromRotationMatrix(_m);
    paddle.position.copy(_g);
  }
  return POSE;
}

/** Where the blade's middle is now (BU, his space), for the splash at the catch: after `raceRowPose`. */
export function bladeAt(paddle: Object3D, out: Vector3): Vector3 {
  return out.set(0, -TO_BLADE, 0).applyQuaternion(paddle.quaternion).add(paddle.position);
}

// ── His paddle ──────────────────────────────────────────────────────────────

/**
 * A ngo paddle as the crew's (festival/_boats.ts: a shaft 1.4 m and a blade 0.46 × 0.2 m on the map), in his space
 * (BU: the map draws him 1.4 × true size, so it is as long as theirs next to him): a T grip at the origin, the
 * shaft down −y, the blade at the bottom, its broad face across x, painted in the crew's colour with a gold tip.
 */
export function buildRacePaddle(hull: number, band: number): Group {
  const b = new VoxelBuilder();
  const src = traceSource();
  const WOOD = 0x9a6a3a;
  // T grip, the shaft (a darker wrap where the lower hand holds it), the blade's throat. (A little stouter than the
  // crew's, as his other things in hand are: it reads at the camera's distance.)
  b.box(0, 0, 0, 2.6, 0.9, 1.0, 0x7a5232, 'wood', { src });
  b.box(0, -9.9, 0, 1.1, 19.2, 1.1, WOOD, 'wood', { src });
  b.box(0, -TO_LOWER, 0, 1.24, 1.8, 1.24, 0x6b3f22, 'leather', { src });
  b.box(0, -19.5, 0, 1.7, 1.1, 0.8, WOOD, 'wood', { src });
  // The blade: its plate in the crew's paint, a band of gold, a pale tip.
  b.box(0, -22.7, 0, 3.6, 6.2, 0.7, hull, 'wood', { src });
  b.box(0, -20.3, 0, 3.66, 0.6, 0.76, band, 'wood', { src });
  b.box(0, -26.1, 0, 3.3, 0.9, 0.7, 0xe8dcc0, 'wood', { src });
  const mesh = buildVoxelMesh(b, { quality: 'medium', name: 'race:paddle' });
  const g = new Group();
  g.name = 'race:paddle';
  g.add(mesh);
  return g;
}

// ── The winner's garland ────────────────────────────────────────────────────

/**
 * A garland of flowers for the winner (ផ្កាម្រុំ: marigolds strung with jasmine buds, a red rose and a tassel at
 * the bottom), round his neck over the krama and hanging down his chest in a U, in his space (BU) as the chest
 * slot wants it (`rig.setSlot(slot, 'chest', …)`).
 */
export function buildGarland(): VoxelBuilder {
  const b = new VoxelBuilder();
  const src = traceSource();
  const MARIGOLD = [0xf29a1a, 0xf6b52a, 0xe8781a];
  const JASMINE = 0xf6f2e4;
  // The loop (over his krama's drape: parts/scarf.ts, ±4.3 across, 3.85 out in front): round the back of the neck on
  // the drape, over the shoulders, then forward and down the front in two strands to a U at mid-chest.
  const N = 52;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const sx = Math.sin(a);
    const cz = Math.cos(a);
    const x = sx * (4.85 - 3.1 * Math.max(0, cz));
    const z = cz <= 0 ? 4.15 * cz : 4.45 * Math.min(1, Math.pow(cz / 0.4, 0.8));
    const y = 19.95 - (cz > 0.3 ? 5.9 * Math.pow((cz - 0.3) / 0.7, 1.3) : 0);
    const jas = i % 4 === 2;
    const s = jas ? 0.62 : 0.95;
    b.box(x, y, z, s, s, s, jas ? JASMINE : MARIGOLD[i % 3], 'krama', { src, rx: i * 0.37, ry: i * 0.61 });
  }
  // The rose and the tassel at the bottom of the U.
  b.box(0, 13.7, 4.75, 1.2, 1.1, 0.9, 0xc81e32, 'krama', { src });
  b.box(0, 13.8, 5.25, 0.6, 0.6, 0.3, 0xe8384a, 'krama', { src });
  b.box(0, 12.6, 4.65, 0.42, 1.2, 0.42, JASMINE, 'krama', { src });
  b.box(0, 11.8, 4.65, 0.7, 0.5, 0.5, 0xf6c21a, 'krama', { src });
  return b;
}
