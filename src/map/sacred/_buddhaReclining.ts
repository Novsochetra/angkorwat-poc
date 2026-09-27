import { Sculpt } from './sculpt';
import { boxDist, noise3, rot, smax, smin, type Box, type Rot, type Shape, type V3 } from './sdf';
import {
  around,
  beltThick,
  bell,
  curve,
  ell,
  growBox,
  handParts,
  joinBox,
  limb,
  loft,
  place,
  sanghatiThick,
  slab,
  smoother,
  toWorld,
  union,
  type HandPose,
} from './_buddhaBody';
import { FIG, type HeadStyle } from './_buddhaFrame';
import { addHead } from './_buddhaHead';

/**
 * The reclining Buddha (buddha.ts kind `reclining`), after Preah Ang Thom
 * (ព្រះអង្គធំ) on Phnom Kulen: the 16th-century Buddha, about 8 m long,
 * carved out of the top of a great sandstone boulder above the pagoda of Wat
 * Preah Ang Thom, the biggest reclining Buddha in Cambodia. A modern stair
 * climbs the rock to him and a roof on posts shelters him; pilgrims kneel
 * before him, light incense and candles, lay flowers and money on him and
 * press gold leaf onto him.
 *
 * He lies as the Buddha at his last rest (parinibbāna), in the lion's
 * posture: on his right side, facing the one who kneels before him, his head
 * propped on his right hand (the elbow on a plump cushion, the forearm
 * rising, the palm under his cheek), his left arm lying along the top of
 * his body, the hand resting on his thigh, the legs straight, the left on
 * the right, the feet together, sole by sole, the toes even. His head is the
 * Khmer one (_buddhaHead.ts: the Angkorian face, a conical ushnisha with a
 * lotus bud, never the Thai flame). His body is idealized as Khmer sculpture
 * has it: calm, smooth, rounded volumes, no muscles (the torso a gentle
 * curve from the shoulder to the hip, the shoulder running on into the arm,
 * each leg one even taper). He wears the robe over the whole body: a bold
 * hem round the foot of the neck, its edge thrown over his left shoulder and
 * down across his back, the folded shoulder cloth on his chest, each arm in
 * its sleeve to a hem above the wrist, one cloth over both legs in long soft
 * folds along the body, the upper robe's edge at mid-shin, the lower robe's
 * hem at the ankles flaring a little over the feet (hollow inside, a cloth);
 * tucked under him, its edge spread on the stone bed in shallow pleats. With
 * `sash`, the people's saffron cloth across his chest; with `leaf`, gold
 * leaf in patches on his soles (region `leaf`: gold only in a palette that
 * names it, as buddha.ts `KULEN_STONE`).
 *
 * Statue space: metres (reference size: 1.5 m long, scaled later), lying
 * along x with his head at −x (on the left of one who kneels before him), on
 * the bed at y = 0, facing +z; x = 0 at the middle of his length (the bud on
 * his head to his soles). The torso and head are made upright on the seated
 * Buddha's measures (_buddhaFrame.ts; "body space", as if he stood: y up the
 * body, his left +x) and laid down by one turn (`LIE`; the head by `HEAD`,
 * propped up on his hand), through `Turned`; the legs, feet, arms, hands,
 * cushion and robe on the bed are made lying.
 */

const DEG = Math.PI / 180;

/** The torso's lean: his shoulders are broader than his hips, so lying on his side his body slopes a little down to the feet. */
const TILT = -4 * DEG;
/** How far his hand lifts his head (the neck bends at its foot). */
const PROP = 22 * DEG;
/** Hip joint to sole along the body (m). */
const LEG = 0.81;
/**
 * The robe: how far (m) it stands off the skin, its hems (bolder than the
 * seated Buddha's: he is seen 10 m long), and its long soft folds along the
 * body (how deep, how many round the torso and the legs).
 */
const ROBE = 0.0028;
const HEM = { offset: 0.009, width: 0.024, height: 0.0058 };
const FOLDS = { depth: 0.0016, torso: 10, legs: 9 };

/**
 * The robe's neckline (body space): its signed distance, below it negative:
 * a ring round the foot of the neck, dipping a little at the throat, higher
 * behind (away from the neck it drops away: the shoulders are covered).
 */
function neckline(x: number, y: number, z: number): number {
  const dz = z + 0.022;
  const r = Math.sqrt(x * x + dz * dz);
  return y - (0.347 - 0.012 * smoother(0, 0.07, z) + 0.01 * smoother(0, -0.08, z) + 1.6 * Math.max(0, r - 0.055));
}

/**
 * The robe's edge thrown over his left shoulder (body space), by the angle
 * round his body (0 in front, 90° his left side, the top as he lies, 180°
 * his back): its height on the body from the left of his throat over the
 * shoulder and down across his back to under his right arm. `edgeAt` gives
 * how far (m) a point is above it, and how much of it there is there (0 off
 * its ends, in front and on his right).
 */
const EDGE_ROWS: [number, number][] = [
  [40, 0.345],
  [90, 0.33],
  [120, 0.285],
  [150, 0.215],
  [180, 0.15],
  [210, 0.085],
  [245, 0.025],
  [262, 0.0],
];
function edgeAt(x: number, y: number, z: number): { off: number; on: number } {
  let a = (Math.atan2(x, z + 0.02) * 180) / Math.PI;
  if (a < -95) a += 360;
  if (a < 40 || a > 262) return { off: 1, on: 0 };
  let i = 1;
  while (i < EDGE_ROWS.length - 1 && EDGE_ROWS[i][0] < a) i++;
  const [a0, y0] = EDGE_ROWS[i - 1];
  const [a1, y1] = EDGE_ROWS[i];
  const t = (a - a0) / (a1 - a0);
  const u = t * t * (3 - 2 * t);
  return { off: y - (y0 + (y1 - y0) * u), on: smoother(40, 52, a) * smoother(262, 248, a) };
}

/**
 * The saffron sash the people draped over him (body space, seen from the
 * front, the same line round his back): from his right side at the waist
 * across his chest, below the neckline, over his left shoulder under the arm.
 */
const sashLine = curve([
  [-0.42, -0.02],
  [-0.2, 0.06],
  [-0.1, 0.11],
  [0.0, 0.165],
  [0.08, 0.21],
  [0.15, 0.245],
  [0.24, 0.29],
]);
const SASH = { half: 0.034, paint: 0.022, height: 0.0095 };
const sashThick = (x: number, y: number) => {
  const u = Math.abs(sashLine(x, y)) / SASH.half;
  if (u >= 1) return 0;
  return SASH.height * Math.sqrt(bell(u)) * (1 + 0.12 * Math.sin(x * 55 + y * 30));
};

// ── Laying him down ─────────────────────────────────────────────────────

const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const len3 = (a: V3) => Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]);
const unit = (a: V3): V3 => scale3(a, 1 / len3(a));
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const O: V3 = [0, 0, 0];

/** Body space → statue space (a turn about z: body +y, the way to his head, to −x; his left, +x, up). */
const LIE: Rot = rot(0, 0, Math.PI / 2 + TILT);
/** The head's turn: the body's, bent `PROP` more at the neck's foot (`PIVOT`). */
const PIVOT: V3 = [0, FIG.neck[1], FIG.neck[2]];
const HEAD: Rot = rot(0, 0, Math.PI / 2 + TILT - PROP);
const HEAD_OFF: V3 = toWorld(LIE, O, sub3(PIVOT, toWorld(rot(0, 0, -PROP), O, PIVOT)));
/** Lifted so his right shoulder rests on the bed; moved along x so his middle is at x = 0. */
const Y0 = -toWorld(LIE, O, [-0.245, 0.31, -0.02])[1];
/** The tip of the lotus bud on his ushnisha (head space). */
const BUD_TIP: V3 = [0, FIG.crown + 0.082, -0.016];
const X0 = -(add3(toWorld(HEAD, O, BUD_TIP), HEAD_OFF)[0] + toWorld(LIE, O, [-0.085, -0.04, -0.02])[0] + LEG) / 2;
const T: V3 = [X0, Y0, 0];
const HEAD_T: V3 = add3(T, HEAD_OFF);

/** A body-space point in statue space. */
const lying = (p: V3): V3 => toWorld(LIE, T, p);
/** A head-space point (_buddhaHead.ts, figure space) in statue space. */
const headAt = (p: V3): V3 => toWorld(HEAD, HEAD_T, p);

/**
 * A sculpt that turns and moves what is added to it into another one (so the
 * seated Buddha's upright head and torso can lie down); its fine zones are
 * kept (boxed again, in statue space) for the caller to join.
 */
class Turned extends Sculpt {
  readonly zones: Box[] = [];
  constructor(
    private readonly into: Sculpt,
    private readonly turn: Rot,
    private readonly move: V3,
  ) {
    super();
  }
  override add(shape: Shape, region: string, k = 0): this {
    this.into.add(place(shape, this.move, this.turn), region, k);
    return this;
  }
  override carve(shape: Shape, k = 0): this {
    this.into.carve(place(shape, this.move, this.turn), k);
    return this;
  }
  override paint(shape: Shape, region: string): this {
    this.into.paint(place(shape, this.move, this.turn), region);
    return this;
  }
  override fine(box: Box): this {
    const pts: V3[] = [];
    for (const x of [box[0], box[3]]) for (const y of [box[1], box[4]]) for (const z of [box[2], box[5]]) pts.push(toWorld(this.turn, this.move, [x, y, z]));
    this.zones.push(around(pts, 0));
    return this;
  }
}

// ── Where things are (statue space) ─────────────────────────────────────

/** The right shoulder and the hip joints, laid down. */
const R_SHOULDER = lying([-0.202, 0.304, -0.026]);
const R_HIP = lying([-0.085, -0.04, -0.02]);
const L_HIP = lying([0.085, -0.04, -0.02]);
/** The soles (x), the knees and ankles: the right leg on the bed, the left one on it. */
const SOLES = R_HIP[0] + LEG;
const KNEE_X = R_HIP[0] + 0.41;
const ANKLE_X = SOLES - 0.072;
const R_KNEE: V3 = [KNEE_X, 0.052, 0.006];
const L_KNEE: V3 = [KNEE_X, 0.052 + 0.098, 0.006];
const R_ANKLE: V3 = [ANKLE_X, 0.034, -0.002];
const L_ANKLE: V3 = [ANKLE_X, 0.034 + 0.062, -0.002];
/** The back of the heels (z). */
const HEEL_Z = -0.05;

/** His right cheek, where it rests on his palm (head space: the face's side at the cheekbone). */
const CHEEK = headAt([-0.064, 0.492, 0.024]);
/** The right hand under the cheek: palm up to the head, the fingers along the jaw to the back of the head. */
const R_HAND: HandPose = (() => {
  const back = unit(toWorld(HEAD, O, [-1, 0, 0]));
  const along = unit(toWorld(HEAD, O, [0, 0.3, -1]));
  // (the wrist under the front of the cheek, the palm's face just under it)
  const at = add3(add3(CHEEK, scale3(back, 0.011)), scale3(along, -0.05));
  return { at, along, back, thumbSide: cross3(back, along), bend: [0.12, 0.08] };
})();
/** The cushion under his elbow and head: its top (y), half-sizes. */
const CUSHION_TOP = 0.06;
/** The right elbow, on the cushion in front of him: the forearm (0.15 m) rises from it to the wrist. */
const R_ELBOW: V3 = (() => {
  const w = R_HAND.at;
  const y = CUSHION_TOP + 0.02;
  const dx = 0.012;
  const dz = Math.sqrt(Math.max(0, 0.15 * 0.15 - (w[1] - y) ** 2 - dx * dx));
  return [w[0] + dx, y, w[2] + dz];
})();
const CUSHION = { c: [R_ELBOW[0] - 0.03, CUSHION_TOP / 2, 0.0] as V3, h: [0.135, CUSHION_TOP / 2, 0.14] as V3 };

/**
 * The left arm lies along the top of his body, as on every reclining
 * Buddha: from the shoulder along his flank, the elbow resting on his waist,
 * the forearm over the hip, the hand on the thigh (palm down, fingers to the
 * knee). So the line runs calm from the shoulder to the hip, the arm on it.
 */
const L_ARM_SHOULDER = lying([0.158, 0.29, -0.004]);
const L_ELBOW = lying([0.148, 0.158, 0.006]);
const L_HAND: HandPose = (() => {
  // (on the thigh's top, a little before its middle line, down its slope to the knee)
  const axis = unit(sub3(L_KNEE, L_HIP));
  const up = unit(cross3([0, 0, 1], axis));
  const at = add3(add3(lerp3(L_HIP, L_KNEE, 0.2), scale3(up, 0.085)), [0, 0, 0.02]);
  const along = unit(add3(axis, [0, -0.035, 0.06]));
  return { at, along, back: unit(add3(up, [0, 0, 0.3])), thumbSide: cross3(along, up), bend: [0.12, 0.08] };
})();

// ── The figure ──────────────────────────────────────────────────────────

export interface RecliningOptions {
  head: HeadStyle;
  /** The people's saffron cloth across his chest. */
  sash: boolean;
  /** Gold leaf in patches on his soles (region `leaf`). */
  leaf: boolean;
}

/** Sculpts the reclining Buddha into `s` (statue space: see the file's note). */
export function addReclining(s: Sculpt, o: RecliningOptions): void {
  // The torso in its robe, laid down; the neck above the neckline, the hems and the sash painted on.
  const body = new Turned(s, LIE, T);
  const skin = torso();
  body.add(robed(skin, o.sash), 'robe');
  body.paint(onSkin(skin, (x, y, z) => 0.0015 - neckline(x, y, z)), 'skin');
  body.paint(onSkin(skin, (x, y, z) => Math.abs(neckline(x, y, z) + HEM.offset) - HEM.width * 0.42, 0.02), 'hem');
  body.paint(
    onSkin(
      skin,
      (x, y, z) => {
        const e = edgeAt(x, y, z);
        return e.on < 0.5 ? 1 : Math.abs(e.off) - 0.0085;
      },
      0.02,
    ),
    'hem',
  );
  if (o.sash) body.paint(onSkin(skin, (x, y) => Math.abs(sashLine(x, y)) - SASH.paint, 0.03), 'sash');

  // The legs, and the robe over them as one cloth: long folds, the upper robe's edge, the hem at the ankles.
  const lg = legRobe();
  s.add(lg.skin, 'skin', 0.03);
  s.add(lg.cloth, 'robe', 0.03);
  // The robe tucked under him, and its edge spread on the bed in pleats.
  const [tuck, spread] = drape();
  s.add(tuck, 'robe', 0.04);
  s.add(spread, 'robe', 0.012);

  // The arms, each in its sleeve to a hem a little above the wrist.
  for (const part of arm(R_SHOULDER, R_ELBOW, R_HAND.at)) s.add(part, 'skin', 0.022);
  for (const [i, part] of arm(L_ARM_SHOULDER, L_ELBOW, L_HAND.at).entries()) s.add(part, 'skin', i ? 0.018 : 0.03);
  const sleeves = [sleeveCloth(R_SHOULDER, R_ELBOW, R_HAND.at), sleeveCloth(L_ARM_SHOULDER, L_ELBOW, L_HAND.at)];
  for (const sl of sleeves) {
    s.add(sl.cloth, 'robe', 0.02);
    s.add(sl.cuff, 'robe', 0.003);
  }
  s.paint(union([lg.hem, ...sleeves.map((sl) => grown(sl.cuff, 0.004))]), 'hem');

  // The cushion under his elbow and head.
  s.add(cushion(), 'base', 0.004);

  // The head, propped on his hand; its neck bent smoothly into the body's.
  const head = new Turned(s, HEAD, HEAD_T);
  addHead(head, o.head);
  s.add(limb(lying([0, 0.335, -0.024]), headAt([0, 0.405, -0.014]), 0.047, 0.046), 'skin', 0.03);

  // Hands and feet, meshed fine (the right hand in the head's zone: fine zones must not overlap).
  const right = handParts(R_HAND);
  const left = handParts(L_HAND);
  s.add(right.shape, 'skin', 0.008);
  // (the left hand rests on the cloth: a small blend, and the cloth round it painted cloth, so no skin spreads onto it)
  s.add(left.shape, 'skin', 0.004);
  s.paint({ d: (x, y, z) => Math.max(0.0015 - left.shape.d(x, y, z), Math.abs(lg.cloth.d(x, y, z)) - 0.006), box: growBox(left.shape.box, 0.012) }, 'robe');
  const toes: V3[] = [];
  for (const side of [1, -1] as const) s.add(foot(side, toes), 'skin', 0.006);
  s.fine(joinBox(head.zones[0], around([...right.points, R_HAND.at], 0.0095)));
  s.fine(around([...left.points, L_HAND.at], 0.0095));
  s.fine(around(toes, 0.0095));
  s.fine(lg.zone);
  // (gold leaf in patches, where the pilgrims pressed it on: most of the soles, and the toes)
  if (o.leaf) s.paint({ d: (x, y, z) => Math.max(SOLES - 0.0065 - x, (0.12 - noise3(y * 75, z * 75, 3.1)) * 0.02), box: [SOLES - 0.02, -0.01, HEEL_Z - 0.01, SOLES + 0.02, 0.14, 0.2] }, 'leaf');

  // (nothing below the bed)
  s.carve(slab([0, -0.25, 0], [1.2, 0.25, 0.6], 0));
}

/** The statue's measures (m, reference size): what a builder needs to fit a bed, a roof and hidden blocks round him. */
export const RECLINE = {
  /** The lotus bud's tip to the soles (x −half ‥ half). */
  length: SOLES - headAt(BUD_TIP)[0],
  /** The soles (x). */
  soles: SOLES,
  /** His head's middle and his hips' (x). */
  head: headAt([0, 0.5, 0])[0],
  hips: (R_HIP[0] + L_HIP[0]) / 2,
};

// ── The torso (body space) ──────────────────────────────────────────────

/**
 * The torso, idealized as the Khmer carve it (skin level): broad shoulders,
 * a full chest, a gently narrower waist and the hips of a standing figure,
 * one calm volume with no muscles (the seated Buddha's measures above the
 * navel, its waist and back evened out). The upper shoulder is a modest
 * rounding at the end of a full slope from the neck, running on into the
 * arm that lies along him (no ball).
 */
function torso(): Shape {
  const [sx, sy, sz] = FIG.shoulder;
  const trunk = loft([
    // y, half-width, front, back
    // (the top of the thighs, where the legs part: inside them)
    [-0.11, 0.126, 0.045, -0.115],
    [-0.07, 0.136, 0.056, -0.125],
    [-0.03, 0.14, 0.064, -0.128],
    [0.02, 0.138, 0.071, -0.127],
    [0.065, 0.133, 0.077, -0.125],
    [0.1, 0.128, 0.081, -0.123],
    [FIG.navel[1], 0.124, FIG.navel[2] + 0.001, -0.121],
    [0.185, 0.122, 0.082, -0.119],
    [0.225, 0.127, 0.084, -0.119],
    [0.26, 0.136, 0.088, -0.121],
    [FIG.chestY, 0.142, FIG.chestZ, -0.122],
    [0.315, 0.145, 0.083, -0.121],
    [0.334, 0.14, 0.069, -0.115],
    [0.346, 0.13, 0.055, -0.108],
  ]);
  return union(
    [
      trunk,
      ell([0, 0.342, -0.026], [0.12, 0.03, 0.075]),
      // (the left shoulder, on top: a full slope from the neck out to it, the shoulder itself
      // a modest rounding that runs on into the arm lying along him)
      limb([0.03, FIG.neck[1] - 0.02, sz], [sx - 0.045, sy - 0.018, sz + 0.018], 0.036, 0.036),
      ell([sx - 0.032, sy - 0.037, sz + 0.026], [0.034, 0.058, 0.05]),
      // (the right one, under him, the arm raised to his head)
      limb([-0.03, FIG.neck[1] - 0.026, sz - 0.01], [-(sx - 0.03), sy - 0.006, sz - 0.002], 0.034, 0.032),
      ell([-(sx - 0.002), sy - 0.012, sz + 0.004], [0.04, 0.046, 0.044]),
      limb([0, FIG.neck[1] - 0.04, FIG.neck[2] - 0.006], [0, FIG.neck[1] + 0.02, FIG.neck[2] + 0.002], 0.048, 0.044),
    ],
    0.04,
  );
}

/**
 * The torso in its cloth (body space): the robe over all of it below the
 * neckline (both shoulders covered), a bold hem round the neckline, the
 * robe's edge thrown over the left shoulder with its hem, the waistband, the
 * folded shoulder cloth, long soft folds round the lower body along its
 * length (fading up the chest and into the hips) and (with `sash`) the
 * saffron sash, lower on his chest than the seated Buddha's, clear of the
 * neckline.
 */
function robed(skin: Shape, sash: boolean): Shape {
  const most = 0.027;
  const b = growBox(skin.box, most);
  return {
    d(x, y, z) {
      const far = boxDist(b, x, y, z);
      if (far > 0.075) return far;
      const d = skin.d(x, y, z);
      if (d > 0.08) return d - most;
      const e = neckline(x, y, z);
      const cover = smoother(0.006, -0.01, e);
      let t = ROBE * cover + HEM.height * bell((e + HEM.offset) / HEM.width) + beltThick(x, y) * smoother(-0.07, 0.03, z) + sanghatiThick(x, y);
      // (the edge over the left shoulder: its hem, the cloth doubled a little on its lower side)
      const edge = edgeAt(x, y, z);
      if (edge.on > 0) t += (0.0042 * bell(edge.off / 0.013) + 0.0012 * smoother(0.004, -0.004, edge.off)) * edge.on * cover;
      const fade = cover * smoother(0.24, 0.15, y) * smoother(-0.1, -0.03, y);
      if (fade > 0) t += FOLDS.depth * Math.cos(Math.atan2(x, z + 0.025) * FOLDS.torso) * fade;
      if (sash) t += sashThick(x, y);
      return d - t;
    },
    box: b,
  };
}

/** The torso's surface (within `reach` m of its skin) where `where` (body space) is below 0: for a paint. */
function onSkin(skin: Shape, where: (x: number, y: number, z: number) => number, reach = 0.012): Shape {
  return { d: (x, y, z) => Math.max(where(x, y, z), Math.abs(skin.d(x, y, z)) - reach), box: growBox(skin.box, reach) };
}

// ── Legs and feet (statue space) ────────────────────────────────────────

/** A leg's radius at a share `t` of the way from the hip joint to the ankle: full at the thigh, narrowing evenly to the ankle (no knee, no calf: a calm volume). */
const legR = (t: number) => 0.03 + 0.045 * Math.pow(1 - t, 1.25);

/** Where the upper robe's edge crosses the shins, and where the lower robe's hem ends, just above the ankles (x). */
const X_UPPER = KNEE_X + (ANKLE_X - KNEE_X) * 0.3;
const X_HEM = ANKLE_X - 0.012;

/**
 * A smooth tapered limb from `a` to `b`, its radius `r(t)` along it (t 0 at
 * a, 1 at b), round at its ends (as `limb`, near enough for a slowly
 * narrowing shape).
 */
function taper(a: V3, b: V3, r: (t: number) => number): Shape {
  const n = 64;
  const R = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) R[i] = r(i / n);
  const [ax, ay, az] = a;
  const bx = b[0] - ax;
  const by = b[1] - ay;
  const bz = b[2] - az;
  const il = 1 / (bx * bx + by * by + bz * bz);
  const m = Math.max(...R);
  return {
    d(x, y, z) {
      const px = x - ax;
      const py = y - ay;
      const pz = z - az;
      let t = (px * bx + py * by + pz * bz) * il;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const f = t * n;
      const i = f >= n ? n - 1 : f | 0;
      const rr = R[i] + (R[i + 1] - R[i]) * (f - i);
      const qx = px - bx * t;
      const qy = py - by * t;
      const qz = pz - bz * t;
      return Math.sqrt(qx * qx + qy * qy + qz * qz) - rr;
    },
    box: [Math.min(ax, b[0]) - m, Math.min(ay, b[1]) - m, Math.min(az, b[2]) - m, Math.max(ax, b[0]) + m, Math.max(ay, b[1]) + m, Math.max(az, b[2]) + m],
  };
}

/**
 * The legs and the robe over them. The legs (skin): two calm tapers, the
 * left lying on the right, joined where they touch. The robe: one cloth over
 * both, bridging the crease between them, thin, in long soft folds along
 * them (round the middle between the two legs); the upper robe's edge a low
 * step with a raised hem at mid-shin; the lower robe's hem at the ankles, a
 * raised band, flaring a little away from the ankles over the feet and onto
 * the bed, hollow inside (a cloth, not a block). `hem` is that band, for its
 * paint; `zone`, the box round it meshed fine.
 */
function legRobe(): { skin: Shape; cloth: Shape; hem: Shape; zone: Box } {
  const right = taper(R_HIP, R_ANKLE, legR);
  const left = taper(L_HIP, L_ANKLE, legR);
  const skin = union([right, left], 0.02);
  // (a leg's axis at x: y or z)
  const axis = (a: V3, b: V3, x: number, k: 1 | 2) => {
    const t = Math.max(0, Math.min(1, (x - a[0]) / (b[0] - a[0])));
    return a[k] + (b[k] - a[k]) * t;
  };
  const x0 = Math.min(R_HIP[0], L_HIP[0]);
  const most = ROBE + 0.007 + FOLDS.depth + 0.004 + 0.0035;
  const cloth: Shape = {
    d(x, y, z) {
      const base = smin(right.d(x, y, z), left.d(x, y, z), 0.05);
      // (far from the legs: near enough, and cheap)
      if (base > 0.04) return base - most;
      const flare = 0.007 * smoother(X_HEM - 0.06, X_HEM, x) ** 2;
      const yc = (axis(R_HIP, R_ANKLE, x, 1) + axis(L_HIP, L_ANKLE, x, 1)) / 2;
      const zc = (axis(R_HIP, R_ANKLE, x, 2) + axis(L_HIP, L_ANKLE, x, 2)) / 2;
      const fold = FOLDS.depth * Math.cos(Math.atan2(y - yc, z - zc) * FOLDS.legs) * smoother(x0 + 0.03, x0 + 0.15, x);
      // (the upper robe over the lower down to mid-shin, its edge a raised hem; the lower robe's hem band at its end)
      const upper = 0.0016 * smoother(X_UPPER + 0.003, X_UPPER - 0.003, x) + 0.0024 * bell((x - X_UPPER + 0.006) / 0.01);
      const rim = 0.0035 * bell((x - X_HEM + 0.008) / 0.009);
      const outer = ROBE + flare + fold + upper + rim;
      // (the cloth's inside hugs the legs, lifting off them as the hem flares)
      const inner = flare * 0.85 - 0.0008;
      return smax(Math.max(base - outer, inner - base), x - X_HEM, 0.003);
    },
    // (the legs' box grown by the most cloth there is, ending at the hem)
    box: (() => {
      const g = growBox(skin.box, most + 0.004);
      return [g[0], g[1], g[2], Math.min(g[3], X_HEM + 0.004), g[4], g[5]] as Box;
    })(),
  };
  const hem: Shape = {
    d: (x, y, z) => Math.max(Math.abs(x - (X_HEM - 0.007)) - 0.01, Math.abs(cloth.d(x, y, z)) - 0.004, 0.0015 - skin.d(x, y, z)),
    box: [X_HEM - 0.02, -0.01, R_ANKLE[2] - 0.065, X_HEM + 0.005, L_ANKLE[1] + 0.07, R_ANKLE[2] + 0.065],
  };
  const zone: Box = [X_HEM - 0.032, -0.012, R_ANKLE[2] - 0.06, X_HEM + 0.008, L_ANKLE[1] + 0.065, R_ANKLE[2] + 0.06];
  return { skin, cloth, hem, zone };
}

/**
 * A foot, the sole to +x (the end of the statue), the toes to the front:
 * made in its own frame (u from the heel to the toes, v out of the sole, w
 * towards the big toe) and set at the heel. `side` 1: the right foot, on the
 * bed, its big toe up; −1: the left, on it. Adds the toes' points to `toes`.
 */
function foot(side: 1 | -1, toes: V3[]): Shape {
  const parts: Shape[] = [
    // heel, sole, instep rising to the ankle, the ball
    ell([0.03, -0.024, 0], [0.03, 0.024, 0.025]),
    slab([0.082, -0.011, 0.0], [0.074, 0.011, 0.027], 0.0105),
    ell([0.072, -0.031, 0.004], [0.066, 0.026, 0.024]),
    limb([0.046, -0.048, 0], [0.04, -0.076, 0], 0.03, 0.031),
    ell([0.126, -0.014, 0.004], [0.022, 0.0145, 0.029]),
  ];
  // (across w: big toe to little toe; the tips even, one of his marks)
  const rows = [
    [0.02, 0.0086],
    [0.0065, 0.0072],
    [-0.0055, 0.0068],
    [-0.0165, 0.0064],
    [-0.0265, 0.0058],
  ];
  const R = frameOf([0, 0, 1], [1, 0, 0], [0, side, 0]);
  const at: V3 = [SOLES, side > 0 ? 0.031 : 0.093, HEEL_Z];
  const toeShapes: Shape[] = [];
  for (const [w, r] of rows) {
    const base: V3 = [0.136 - Math.abs(w - 0.004) * 0.25, -0.012, w];
    const tip: V3 = [0.162, -0.011, w * 1.03];
    toeShapes.push(limb(base, tip, r, r * 0.9));
    toes.push(toWorld(R, at, base), toWorld(R, at, tip));
  }
  parts.push(union(toeShapes, 0.002));
  return place(union(parts, 0.011), at, R);
}

/** A turn whose local x points along `x`, local y along `y`, local z to the side of `zHint` (it may mirror; `x` ⟂ `y`). */
function frameOf(x: V3, y: V3, zHint: V3): Rot {
  const X = unit(x);
  const Y = unit(y);
  let Z = cross3(X, Y);
  if (Z[0] * zHint[0] + Z[1] * zHint[1] + Z[2] * zHint[2] < 0) Z = scale3(Z, -1);
  return [X[0], Y[0], Z[0], X[1], Y[1], Z[1], X[2], Y[2], Z[2]];
}

// ── Arms (statue space) ─────────────────────────────────────────────────

/** Long smooth arms: shoulder, elbow, wrist, tapering (as the seated Buddha's). */
function arm(shoulder: V3, elbow: V3, wrist: V3): Shape[] {
  const mid = lerp3(elbow, wrist, 0.3);
  return [limb(shoulder, elbow, 0.036, 0.0245), limb(elbow, mid, 0.0245, 0.024), limb(mid, wrist, 0.024, 0.0158)];
}

/**
 * An arm's sleeve: the robe over the arm from the shoulder down to a little
 * above the wrist, standing off it, and its hem there, a bold band.
 */
function sleeveCloth(shoulder: V3, elbow: V3, wrist: V3): { cloth: Shape; cuff: Shape } {
  const axis = unit(sub3(wrist, elbow));
  const end = sub3(wrist, scale3(axis, 0.021));
  const cloth = union([limb(shoulder, elbow, 0.036 + 0.0035, 0.0245 + 0.0035), limb(elbow, end, 0.0245 + 0.0035, 0.0198)], 0.02);
  const cuff = limb(sub3(end, scale3(axis, 0.004)), add3(end, scale3(axis, 0.0025)), 0.0238, 0.0238);
  return { cloth, cuff };
}

/** `s` grown by `by` m (its box too): a paint over a shape's own surface. */
function grown(s: Shape, by: number): Shape {
  return { d: (x, y, z) => s.d(x, y, z) - by, box: growBox(s.box, by) };
}

// ── Cushion and drape (statue space) ────────────────────────────────────

/** The cushion under his elbow and head: a plump pad, its edges rounded, a raised seam round its middle. */
function cushion(): Shape {
  const { c, h } = CUSHION;
  const seam = slab([c[0], c[1] + 0.001, c[2]], [h[0] + 0.0035, 0.004, h[2] + 0.0035], 0.0035);
  // (its top a little domed, as a stuffed cushion)
  const puff = ell([c[0], c[1] + h[1] * 0.45, c[2]], [h[0] * 0.86, h[1] * 0.75, h[2] * 0.86]);
  return union([union([slab(c, h, 0.021), puff], 0.02), seam], 0.005);
}

/**
 * The robe under him: tucked under his side from the right shoulder to the
 * ankles (so no light shows under his waist), its front a little back from
 * his and leaning in as it rises; and its edge spread on the bed before him,
 * a thin cloth in shallow pleats, its rim softly scalloped.
 */
function drape(): [Shape, Shape] {
  // (along x: how high the tuck reaches up into him, where its front is at the bed)
  const under = (p: V3) => p[1] + 0.03;
  const rows: [number, number, number][] = [
    [R_SHOULDER[0] + 0.03, 0.03, 0.045],
    [lying([0, FIG.chestY, 0])[0], under(lying([-0.142, FIG.chestY, 0])), 0.062],
    [lying([0, 0.185, 0])[0], under(lying([-0.122, 0.185, 0])), 0.058],
    [lying([0, -0.03, 0])[0], under(lying([-0.14, -0.03, 0])), 0.052],
    [lerp3(R_HIP, R_KNEE, 0.5)[0], 0.06, 0.046],
    [R_KNEE[0], 0.032, 0.04],
    [ANKLE_X - 0.045, 0.022, 0.03],
  ];
  const x0 = rows[0][0];
  const x1 = rows[rows.length - 1][0];
  const at = (x: number, k: 1 | 2) => {
    if (x <= x0) return rows[0][k];
    for (let i = 1; i < rows.length; i++)
      if (x <= rows[i][0]) {
        const t = (x - rows[i - 1][0]) / (rows[i][0] - rows[i - 1][0]);
        const u = t * t * (3 - 2 * t);
        return rows[i - 1][k] + (rows[i][k] - rows[i - 1][k]) * u;
      }
    return rows[rows.length - 1][k];
  };
  const back = -0.085;
  const top = Math.max(...rows.map((r) => r[1]));
  const most = Math.max(...rows.map((r) => r[2]));
  const ends = (x: number) => Math.max(x0 - x, x - x1);
  const tuck: Shape = {
    d(x, y, z) {
      const h = at(x, 1);
      // (its front leans back into him as it rises)
      const front = at(x, 2) - 0.03 * smoother(0, h, y);
      let d = smax(y - h, z - front, 0.02);
      // (its back leans in under him too, rounded)
      d = smax(d, back + 0.045 * smoother(0, h, y) - z, 0.025);
      d = smax(d, ends(x), 0.03);
      return smax(d, -0.004 - y, 0.004);
    },
    box: [x0 - 0.01, -0.004, back - 0.01, x1 + 0.01, top + 0.01, most + 0.01],
  };
  // The spread edge: 1 cm thick, reaching 3.5 cm past the tuck, shallow pleats running out to its softly scalloped rim.
  const reach = 0.035;
  const spread: Shape = {
    d(x, y, z) {
      const u = (x - x0) * ((2 * Math.PI) / 0.07);
      const rim = at(x, 2) + reach - 0.0028 * (1 - Math.abs(Math.cos(u * 0.5)));
      const out = smoother(at(x, 2) - 0.01, rim, z);
      const topY = 0.011 - 0.006 * out + 0.0017 * Math.cos(u) * out;
      let d = smax(y - topY, z - rim, 0.005);
      d = smax(d, -0.02 - z, 0.01);
      d = smax(d, ends(x) - 0.01, 0.02);
      return smax(d, -0.004 - y, 0.003);
    },
    box: [x0 - 0.02, -0.004, -0.03, x1 + 0.02, 0.016, most + reach + 0.01],
  };
  return [tuck, spread];
}
