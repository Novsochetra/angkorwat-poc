import { Euler, Matrix4, Quaternion, Vector3, type Group, type Mesh, type Object3D, type PerspectiveCamera } from 'three';
import { solveArm } from '../../character/Animator';
import { BINO_GRIP, buildBinoculars } from '../../character/binoculars';
import { idle } from '../../character/clips';
import type { JointPose, Pose } from '../../character/pose';
import { JOINTS, type JointName } from '../../character/skeleton';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { SFX } from '../audio/addonSfx';
import '../audio/_bino';
import { PLACES, PLATEAUS, type PlaceDef } from '../layout';
import { padGlyph, type PadGlyph } from '../pad/glyphs';
import { pad } from '../pad/pad';
import type { MapFrame, RoamMode, Subject, SubjectKind } from '../types';
import { lang, num, onLang, t, type WordKey } from '../ui/lang';
import { addonBusy, ADDONS, registerAddon, type AddonEnv } from './_addons';
import { LAP_C } from './_boatPoses';
import { SPECIES_BY_KIND, STAMP_BY_ID, STAMPS, type Both, type StampDef } from './_bookData';
import { followNearFade } from './_nearFade';
import { angleDiff } from './followCam';
import { PAD_LIGHT, TOOL_KEYS } from './input';
import type { RoamCtx } from './types';

/**
 * Binoculars (កែវយឹត), to watch birds and animals far away.
 *
 * 7 (the tool bar's slot after the selfie phone, or the game pad's L2)
 * raises them: both hands bring them up to his eyes (arm IK, a posture over
 * whatever holds his body: standing, sitting on the ground (J), seated in the
 * boat, standing in the hot air balloon's basket) and the view glides into
 * them: two overlapping round lenses in a black mask with soft edges and a
 * faint coating tint near the rim, a gentle sway of his hands (more in the
 * boat, less sitting), 6× to 12× (the field of view 8° to 4°: the wheel, a
 * pinch, the pad's R1 / L1), the drag (the right stick, Q / R, also W A S D
 * and the left stick, slowly) looks round, slower the more it magnifies, as
 * his camera does. He does not walk while looking (as with the camera); the
 * follow camera's near fade is off. 7 again, Esc, the pad's ○ or L2, or the
 * touch ✕ lowers them; a tool, emote or menu key puts them away and does
 * its own thing. Lying on his back, 7 sits him up first, then raises them.
 *
 * What is in the middle is named at the bottom after half a second
 * ("Great egret · 180 m"): the living things the map's parts list for the
 * photos (`MapPart.subjects`: animals, birds, people, then plants), in the
 * middle of the view, big enough, not behind the land or stone; else a
 * temple (a place's pad as a box), a village, a holy place or a jungle site
 * of the passport where the view lands, else Phnom Kulen's slopes. Held on
 * an animal or a bird the nature book has not got yet for one more second
 * (a thin gold line fills under the name), it goes into the book as seen
 * (`Journal.seen`: a crop of the view for its picture, the book's own
 * "New in your nature book: …"), a pencil's scratch and two soft notes.
 *
 * Where: on foot (standing, or sitting on the ground), in the boat (not
 * while he fishes: the pole is in his hands) and in the balloon's basket
 * (it floats on as it would: easy flying holds its height; looking out of a
 * balloon is what binoculars are for). Not on the hang glider or under the
 * parachute: his hands must stay on the bar and the lines, and a narrow
 * view on a fast glider swings too much to find anything in it.
 *
 * Sounds (audio/_bino.ts): a rustle and the eyecups' tap and click raised, a
 * softer rustle lowered, a tiny focus whirr while zooming.
 *
 * URL (checks): `bino=1` raises them at once (on foot, sitting with
 * `act=sit`, in the boat, in the balloon), with `pview=yaw,pitch,fov` where
 * they look (degrees: yaw as the camera's, the map's heading; fov 4‥8) and
 * `sview=0‥1` holding the view there (0: the follow camera, to see him hold
 * them). `report()` gives the same.
 */

// ── Tuning ──────────────────────────────────────────────────────────────────

/** Field of view (vertical, degrees) at 6× and 12×, and when raised (8×): a plain eye's ~48° over the power. */
const FOV_WIDE = 8;
const FOV_TELE = 4;
const FOV_START = 6;
const POWER = 48;
/** Raising: the hands and the binoculars (s), the view into them (s); lowering, the same. */
const RAISE_HANDS = 0.45;
const RAISE_VIEW = 0.5;
const LOWER_HANDS = 0.5;
const LOWER_VIEW = 0.4;
/** How far he may look up and down (radians), and round from his facing when he cannot turn (seated: on the ground, in the boat, the basket). */
const PITCH = [-0.85, 1.15] as const;
const TURN = 1.75;
/** The drag (and the sticks) turn the view this share of what they turn his camera's at the same zoom (photo.ts: `fov / 50`). */
const LOOK = 0.6;
/** W A S D and the left stick pan the view this fast at the camera's 50° (radians/s; slower zoomed in, as the drag). */
const PAN = 1.1;
/** Hand sway (radians at a 6° field, scaled with it), by where he is. */
const SWAY: Record<Seat, number> = { stand: 1, sit: 0.75, boat: 1.9, balloon: 1.3 };
/** The view is named after this long on one thing (s); a new animal goes into the nature book after this much more. */
const NAME_AFTER = 0.5;
const BOOK_AFTER = 1;
/** How often the middle of the view is looked at (s). */
const LOOK_EVERY = 0.1;
/** Farthest named (m), and within this of the view's middle (its half-height's share), or within its own size. */
const RANGE = 900;
const MIDDLE = 0.13;
/** Smallest a living thing may look to be named: its radius over half the view's height. */
const MIN_SIZE = 0.02;
/** Stone, walls and tree trunks between the eye and a living thing are looked for this far out (m: the walk map's; the land the whole way). */
const NEAR_BLOCKS = 120;
/** A place's height over its pad (m), for the box the view may land on. */
const PLACE_H: Record<string, number> = { sanctuary: 70, overlook: 45, terrace: 26, shrine: 24, kulen: 22, rivergate: 24 };
/** How upright his chest is (its up's height, 1 upright): lying back under this (about 0.4 lying), sitting up over that (1 sitting). */
const LYING = 0.7;
const SITTING = 0.92;
/** The nature book's chapters a seen animal can fill (not the fish he catches, not people, not plants). */
const CATCH = new Set<SubjectKind>(['riel', 'snakehead', 'catfish', 'perch', 'featherback']);
/** The picture on a seen page (px, 4:3: _book.ts `thumb`). */
const THUMB_W = 240;
const THUMB_H = 180;

// ── The body ────────────────────────────────────────────────────────────────

/** Where he holds them: standing on foot, sitting on the ground, seated in the boat, standing in the balloon's basket. */
type Seat = 'stand' | 'sit' | 'boat' | 'balloon';

const piv = (j: JointName) => new Vector3(...JOINTS[j].pivot);
const NECK_L = piv('neck').sub(piv('chest'));
const HEAD_L = piv('head').sub(piv('neck'));
/** The binoculars' back (their origin) at his eyes, in head space (BU): eye height, at the face (parts/head.ts `HEAD.maxZ`). */
const AT_EYES = new Vector3(0, 3.2, 4.62);
/** Held low before they come up (chest space, BU), tipped down (radians). */
const LOW_AT = new Vector3(0, 4.6, 4.4);
const LOW_TIP = 0.5;
/** The view's eye (head space, BU): between his eyes. */
const EYE = new Vector3(0, 3.2, 4.4);
/**
 * The view's near plane while it is in them (m at his roaming size 1.4): binoculars cannot focus closer than a few
 * metres, so a reed, a leaf or a grass blade right before his face is gone from the view instead of filling it.
 */
const NEAR = 2.6;
/** Elbows down and out; the shoulders come forward and up as they rise (chest space, BU): his arms are short for his head. */
const POLE = { L: new Vector3(0.75, -1, 0.05).normalize(), R: new Vector3(-0.75, -1, 0.05).normalize() };
const SHRUG = { L: new Vector3(-0.15, 0.55, 1.35), R: new Vector3(0.15, 0.55, 1.35) };
const ARM_L: readonly JointName[] = ['shoulderL', 'elbowL', 'wristL'];
const ARM_R: readonly JointName[] = ['shoulderR', 'elbowR', 'wristR'];

/**
 * The two lenses on a view `w` × `h` (px): their radius and how far each middle is from the view's (wide views: side
 * by side; narrow ones: bigger, running off the sides).
 */
function lenses(w: number, h: number): { r: number; sep: number } {
  const wide = w / h >= 1.2;
  const r = wide ? Math.min(0.48 * h, 0.31 * w) : Math.min(0.48 * h, 0.5 * w);
  return { r, sep: (wide ? 0.62 : 0.5) * r };
}

const smooth = (x: number) => {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
};
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const DEG = Math.PI / 180;

// ── State ───────────────────────────────────────────────────────────────────

let env: AddonEnv | null = null;
let mode: RoamMode = 'overview';
/** Out at all (raised, or on the way up or down): nothing to do while not. */
let active = false;
/** Raised (or on the way up); the hands' and the view's way up (0‥1). */
let up = false;
let hands = 0;
let view = 0;
/** Checks (`sview=`): the view held at this blend while they are up. */
let hold: number | null = null;
let seat: Seat = 'stand';
/** Where they look (radians: yaw the map's heading as the camera's, pitch + up) and the field of view (degrees). */
const aim = { yaw: 0, pitch: 0, fov: FOV_START };
/** The hands' sway now (radians, added to the aim). */
const sway = { yaw: 0, pitch: 0 };
let clock = 0;
/** Reduce motion (the Play setting): less sway. */
let calm = false;
/** The posture under theirs (the boat's, the rest's, the balloon's; null standing), and theirs is on. */
let base: ((t: number) => Pose) | null = null;
let wrapped = false;
/** The binoculars (built when first raised) and on him. */
let prop: Group | null = null;
let worn = false;
/** He was lying down when 7 was pressed: sitting up first (s left to wait), and a second J for a sleeper. */
let sitWait = 0;
let sitAgain = false;
/** The camera or the phone was last up at this clock (the paddle is still coming off his lap: not fishing). */
let photoAt = -9;
/** We hid his body (the view inside his head), the touch layout and the page's look are ours; the photo's kind last frame. */
let hidden = false;
let shutter = false;
let photoKind: string | null = null;
/** The boat's height last step (over a fall: put away). */
let lastY = 0;
/** The map camera's own near plane (put back as the view comes out of them). */
let baseNear = 0;
/** The focus whirr: the field of view last frame and the level now. */
let lastFov = FOV_START;
let whirr = 0;

/** What is in the middle of the view. */
interface Target {
  key: string;
  name: Both | null;
  dist: number;
  kind: SubjectKind | null;
  x: number;
  y: number;
  z: number;
  r: number;
}
const target: Target = { key: '', name: null, dist: 0, kind: null, x: 0, y: 0, z: 0, r: 0 };
let lookIn = 0;
let steady = 0;
/** The name at the bottom for what is in the middle ("Great egret · 180 m"), made when it is looked at again. */
let label = '';
/** A new page to fill once the next frame is drawn (its subject, the view's crop around it). */
let pageDue: { kind: SubjectKind; x: number; y: number; z: number; r: number } | null = null;
/** The page asked for this hold of the view already (no second message while it is held). */
let booked = '';

const found: Subject[] = [];
const _eye = new Vector3();
const _dir = new Vector3();
const _v = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _q3 = new Quaternion();
const _qa = new Quaternion();
const _e = new Euler();
const _ey = new Euler(0, 0, 0, 'YXZ');
const _m = new Matrix4();
const _m2 = new Matrix4();
const _mp = new Matrix4();
const _t = new Vector3();
const _t2 = new Vector3();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
const _lowQ = new Quaternion().setFromEuler(new Euler(LOW_TIP, 0, 0));
const _upQ = new Quaternion();
const _upP = new Vector3();

// ── The pose ────────────────────────────────────────────────────────────────

/** The posture while they are up: the one under it (or the idle stance), the head along the view, the binoculars at his eyes in both hands. */
function posture(time: number): Pose {
  const p = base ? base(time) : idle(time);
  const e = env;
  if (!e) return p;
  const w = smooth(hands);
  // (in the boat the paddle goes down across his lap while his hands are on the binoculars)
  const arms = smooth(hands / 0.55);
  if (seat === 'boat') {
    const paddle = e.explorer.rig.getSlot('boatPaddle');
    if (paddle && arms > 0) {
      paddle.position.lerp(LAP_C, arms);
      paddle.rotation.y *= 1 - arms;
      paddle.rotation.z *= 1 - arms;
    }
  }
  if (w <= 0.0005) {
    if (prop) prop.visible = false;
    return p;
  }
  // Where they look, from his facing.
  const ry = clamp(angleDiff(aim.yaw + sway.yaw, e.body.yaw), -TURN, TURN);
  const rp = clamp(aim.pitch + sway.pitch, PITCH[0], PITCH[1]);
  // The chest and the neck take a share of the turn (leaning back a little to look up), the head the rest, exactly.
  const ch = (p.chest = { ...p.chest });
  const nk = (p.neck = { ...p.neck });
  ch.ry = (ch.ry ?? 0) + 0.3 * ry * w;
  ch.rx = (ch.rx ?? 0) - 0.12 * rp * w;
  nk.ry = (nk.ry ?? 0) + 0.25 * ry * w;
  nk.rx = (nk.rx ?? 0) - 0.2 * rp * w;
  const hp = p.hips ?? {};
  const hd = (p.head = { ...p.head });
  _qa.setFromEuler(_e.set(hp.rx ?? 0, hp.ry ?? 0, hp.rz ?? 0));
  _qa.multiply(_q.setFromEuler(_e.set(ch.rx ?? 0, ch.ry ?? 0, ch.rz ?? 0)));
  _qa.multiply(_q.setFromEuler(_e.set(nk.rx ?? 0, nk.ry ?? 0, nk.rz ?? 0)));
  _q2.setFromEuler(_ey.set(-rp, ry, 0)).premultiply(_qa.invert());
  _q3.setFromEuler(_e.set(hd.rx ?? 0, hd.ry ?? 0, hd.rz ?? 0)).slerp(_q2, w);
  _e.setFromQuaternion(_q3, 'XYZ');
  hd.rx = _e.x;
  hd.ry = _e.y;
  hd.rz = _e.z;

  // The head in chest space, the binoculars from low in his hands up to his eyes.
  _m.compose(_t.copy(NECK_L).add(_p.set(nk.px ?? 0, nk.py ?? 0, nk.pz ?? 0)), _q.setFromEuler(_e.set(nk.rx ?? 0, nk.ry ?? 0, nk.rz ?? 0)), _s);
  _m2.compose(_t.copy(HEAD_L).add(_p.set(hd.px ?? 0, hd.py ?? 0, hd.pz ?? 0)), _q.setFromEuler(_e.set(hd.rx, hd.ry, hd.rz)), _s);
  _m.multiply(_m2);
  _upP.copy(AT_EYES).applyMatrix4(_m);
  _upQ.setFromRotationMatrix(_m);
  const lift = smooth((hands - 0.12) / 0.88);
  const size = smooth(hands / 0.3);
  if (prop) {
    prop.visible = true;
    prop.position.lerpVectors(LOW_AT, _upP, lift);
    prop.quaternion.slerpQuaternions(_lowQ, _upQ, lift);
    prop.scale.setScalar(Math.max(0.001, size));
    _mp.compose(prop.position, prop.quaternion, _s);
  } else _mp.compose(_upP, _upQ, _s);

  // Both fists round the barrels (arm IK), the shoulders forward and up as they rise; over the arms under them by `arms`.
  for (const side of ['L', 'R'] as const) {
    const ik = solveArm(side, _t2.copy(BINO_GRIP[side]).applyMatrix4(_mp), POLE[side], _t.copy(SHRUG[side]).multiplyScalar(lift));
    for (const j of side === 'L' ? ARM_L : ARM_R) p[j] = mixJoint(p[j], ik[j], arms);
  }
  return p;
}

/** `a` towards `b` by `k`, channel by channel (a new joint: the posture under it may share its own). */
function mixJoint(a: JointPose | undefined, b: JointPose | undefined, k: number): JointPose {
  return { rx: mix(a?.rx, b?.rx, k), ry: mix(a?.ry, b?.ry, k), rz: mix(a?.rz, b?.rz, k), px: mix(a?.px, b?.px, k), py: mix(a?.py, b?.py, k), pz: mix(a?.pz, b?.pz, k) };
}
const mix = (x: number | undefined, y: number | undefined, k: number) => (x ?? 0) + ((y ?? 0) - (x ?? 0)) * k;

/** Theirs over whatever holds his body now (again if a mode put its own back meanwhile). */
function wrap(): void {
  const a = env!.explorer.animator;
  if (wrapped && a.posture === posture) return;
  base = a.posture === posture ? base : a.posture;
  a.posture = posture;
  wrapped = true;
}

/** The posture under theirs back, the binoculars off him. */
function unwrap(): void {
  const e = env;
  if (!e) return;
  if (wrapped && e.explorer.animator.posture === posture) e.explorer.animator.posture = base;
  base = null;
  wrapped = false;
  if (worn) {
    e.explorer.rig.clearSlot('binoculars');
    worn = false;
  }
}

function wear(): void {
  const e = env!;
  if (!prop) {
    prop = buildVoxelMesh(buildBinoculars(), { quality: e.explorer.rig.quality, name: 'binoculars', castShadow: true });
    prop.visible = false;
  }
  if (!worn) {
    e.explorer.rig.setSlotObject('binoculars', 'chest', prop);
    worn = true;
    // (hidden with his body the last time the view was at his eyes: shown again with him)
    const shown = !hidden;
    prop.traverse((o) => {
      if ((o as Mesh).isMesh) o.visible = shown;
    });
  }
}

/** How upright his chest is (the height of its up, 0‥1): sitting and lying on the ground. */
function upright(): number {
  const chest = env!.explorer.rig.joints.chest;
  chest.updateWorldMatrix(true, false);
  return _v.set(0, 1, 0).applyQuaternion(chest.getWorldQuaternion(_q)).y;
}

/** The view's eye (world): between his eyes. */
function eyeAt(out: Vector3): Vector3 {
  const head = env!.explorer.rig.joints.head;
  head.updateWorldMatrix(true, false);
  return head.localToWorld(out.copy(EYE));
}

/** Where the view looks (world, unit). */
function lookDir(out: Vector3, withSway = true): Vector3 {
  const y = aim.yaw + (withSway ? sway.yaw : 0);
  const p = aim.pitch + (withSway ? sway.pitch : 0);
  return out.set(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p));
}

// ── Up and down ─────────────────────────────────────────────────────────────

/** Can they come up here, and how he holds them; a message why not (or nothing). `quiet`: a check's start (no words). */
function canRaise(ctx: RoamCtx, m: RoamMode, quiet = false): Seat | null {
  const e = env!;
  const ex = e.explorer;
  const no = (w: WordKey | null): null => {
    if (w && !quiet) ctx.hud.toast(t(w));
    return null;
  };
  if (m === 'hang') return no('binoNoHang');
  if (m === 'leap' || m === 'glide') return no('binoNoChute');
  if (m === 'overview' || e.photo.albumOpen) return null;
  // (another add-on holds him or has his hands: the umbrella, the kite's line…; eating, drinking, praying)
  const handsTaken = ADDONS.some((a) => a.id !== 'binoculars' && a.handsBusy);
  if (addonBusy() || handsTaken || ex.foodHeld || ex.animator.meal.action || ex.currentAction === 'pray') return no('binoHandsBusy');
  // (theirs, while they come down: the one under it)
  const mine = ex.animator.posture === posture;
  const p = mine ? base : ex.animator.posture;
  if (m === 'walk') {
    if (!ctx.body.grounded) return null;
    if (!p) return !mine && e.busy() && !e.photo.kind ? no('binoHandsBusy') : 'stand';
    // (a posture on the ground: sitting or lying, _rest.ts; up in the air: the rope swing)
    const b = ctx.body.pos;
    if (Math.abs(b.y - ctx.world.groundAt(b.x, b.z)) > 0.5) return no('binoHandsBusy');
    return 'sit';
  }
  if (m === 'boat') {
    if (!p) return null;
    // (fishing: the paddle lies across his lap, his hands on the pole; not the camera's or the phone's moment just gone)
    const paddle = ex.rig.getSlot('boatPaddle');
    if (!quiet && paddle && paddle.position.y < 1 && !e.photo.kind && clock - photoAt > 0.8) return no('binoFishing');
    return 'boat';
  }
  if (m === 'balloon') return p ? 'balloon' : null;
  return null;
}

/** Up they come (from where they are: lowering half way, back up from there). */
function raise(ctx: RoamCtx, s: Seat, instant = false): void {
  const e = env!;
  const ex = e.explorer;
  if (e.photo.kind) e.photo.lower();
  const a = ex.currentAction;
  if (a && a !== 'pray') ex.stop(a);
  seat = s;
  if (!up && hands <= 0) {
    // Looking where the view looked (on foot he turns to it), at the horizon.
    aim.yaw = ctx.cam.yaw;
    aim.pitch = 0.02;
    if (s !== 'stand') aim.yaw = ctx.body.yaw + clamp(angleDiff(aim.yaw, ctx.body.yaw), -TURN, TURN);
  }
  up = true;
  active = true;
  calm = !!document.querySelector('.mu-calm');
  wear();
  wrap();
  steady = 0;
  target.key = '';
  booked = '';
  lastY = ctx.body.pos.y;
  if (instant) {
    hands = 1;
    view = hold ?? 1;
  } else SFX.play('binoUp');
  setLook(true);
  ui?.slot(true);
}

/** Down they go, smoothly (the view glides out, the hands come down); `quiet`: no sound (back to the map). */
function lower(ctx: RoamCtx | null, quiet = false): void {
  if (!up) return;
  up = false;
  pageDue = null;
  if (!quiet) SFX.play('binoDown');
  // (the follow camera ends up behind him, looking the way he looked)
  if (ctx) ctx.cam.yaw = aim.yaw;
  setLook(false);
  ui?.slot(false);
}

/** Put away at once (another key does its own thing now, the mode changed): the pose goes now, the view still glides out. */
function drop(ctx: RoamCtx | null, viewToo = false): void {
  if (up) lower(ctx, viewToo);
  hands = 0;
  unwrap();
  if (viewToo) view = 0;
}

/** The page's look while they are up: the touch layout's ✕ (no stick or Jump), the roaming interface away. */
function setLook(on: boolean): void {
  const e = env!;
  document.body.classList.toggle('roam-bino', on);
  if (on !== shutter) {
    // (the camera's: its drag rates and the pad's; the touch ✕, its shutter hidden by our style)
    e.controls.setShutter(on ? 'camera' : null);
    shutter = on;
    const close = document.querySelector('.rt-close');
    if (close) close.setAttribute('aria-label', t(on ? 'binoClose' : 'rtClose'));
  }
}

// ── What is in the middle ───────────────────────────────────────────────────

/** First land or water along the ray from `o` (unit `d`) within `max` m, or Infinity. */
function landHit(o: Vector3, d: Vector3, max: number): number {
  const f = env!.world.field;
  let a = 0;
  let b = Math.min(1, max);
  while (b <= max) {
    if (o.y + d.y * b < f.standY(o.x + d.x * b, o.z + d.z * b)) {
      for (let i = 0; i < 6; i++) {
        const m = (a + b) / 2;
        if (o.y + d.y * m < f.standY(o.x + d.x * m, o.z + d.z * m)) b = m;
        else a = m;
      }
      return b;
    }
    if (b === max) break;
    a = b;
    b = Math.min(max, b + 1.5 + b * 0.012);
  }
  return Infinity;
}

/** Nothing solid between the eye and (x, y, z) (a thing `r` m round): the land and water, and stone, walls and trunks near him. */
function inSight(o: Vector3, x: number, y: number, z: number, r: number): boolean {
  const dx = x - o.x;
  const dy = y - o.y;
  const dz = z - o.z;
  const dist = Math.hypot(dx, dy, dz);
  if (dist < 0.5) return true;
  _t.set(dx / dist, dy / dist, dz / dist);
  if (landHit(o, _t, Math.max(0, dist - r - 0.5)) < Infinity) return false;
  const w = env!.world;
  // (the walk map: stone, walls and tree trunks; not leaves, which the view glimpses through)
  const clear = w.clearance ?? w.hardClearance;
  if (!clear) return true;
  const seg = Math.min(dist, NEAR_BLOCKS);
  const k = seg / dist;
  const free = clear(o.x, o.y, o.z, o.x + dx * k, o.y + dy * k, o.z + dz * k);
  return free * seg >= (dist <= NEAR_BLOCKS ? seg - Math.max(r, 0.4) - 0.3 : seg - 0.01);
}

/** The best living thing in the middle (the tops of three, the first in sight), else a place, a passport stamp, the Kulen slopes. Into `target`. */
function lookAtMiddle(): void {
  const e = env!;
  const o = eyeAt(_eye);
  const d = lookDir(_dir, false);
  const tanHalf = Math.tan((aim.fov * DEG) / 2);
  found.length = 0;
  for (const p of e.parts) {
    try {
      p.subjects?.(found);
    } catch {
      /* (a part's list is for the photos: a failure there is theirs) */
    }
  }
  // The three best by how near the middle and how big, people and animals before plants.
  let b0 = -1;
  let b1 = -1;
  let b2 = -1;
  let s0 = Infinity;
  let s1 = Infinity;
  let s2 = Infinity;
  for (let i = 0; i < found.length; i++) {
    const s = found[i];
    const sp = SPECIES_BY_KIND.get(s.kind);
    if (!sp) continue;
    const dx = s.x - o.x;
    const dy = s.y - o.y;
    const dz = s.z - o.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < 1.5 || dist > RANGE) continue;
    const along = dx * d.x + dy * d.y + dz * d.z;
    if (along <= 0) continue;
    const off = Math.hypot(dx - d.x * along, dy - d.y * along, dz - d.z * along) / along;
    const size = s.r / dist / tanHalf;
    if (size < MIN_SIZE || off > Math.max(MIDDLE * tanHalf, (s.r / dist) * 1.1)) continue;
    const score = off / tanHalf - size * 0.5 + (sp.group === 'plants' ? 2 : 0);
    if (score < s0) [b2, s2, b1, s1, b0, s0] = [b1, s1, b0, s0, i, score];
    else if (score < s1) [b2, s2, b1, s1] = [b1, s1, i, score];
    else if (score < s2) [b2, s2] = [i, score];
  }
  for (const i of [b0, b1, b2]) {
    if (i < 0) continue;
    const s = found[i];
    if (!inSight(o, s.x, s.y, s.z, s.r) && !inSight(o, s.x, s.y + s.r * 0.8, s.z, s.r * 0.5)) continue;
    setTarget(`s:${s.kind}`, SPECIES_BY_KIND.get(s.kind)!.name, Math.hypot(s.x - o.x, s.y - o.y, s.z - o.z), s.kind, s);
    return;
  }
  // Where the view lands on the land or the water.
  const land = landHit(o, d, 2400);
  // A temple: its pad as a box, the nearest the view goes into before the land (not one he is in).
  let place: PlaceDef | null = null;
  let pt = Infinity;
  for (const p of PLACES) {
    const tIn = boxHit(o, d, p);
    if (tIn > 0 && tIn < pt && tIn <= land + 2) [place, pt] = [p, tIn];
  }
  if (place) {
    const st = STAMP_BY_ID.get(place.id);
    if (st) return setTarget(`p:${place.id}`, st.name, pt, null, null);
  }
  // A village, a holy place or a jungle site where the view lands (or passes close over).
  let stamp: StampDef | null = null;
  let best = Infinity;
  let sd = 0;
  const f = e.world.field;
  for (const s of STAMPS) {
    if (s.group === 'temples') continue;
    const sy = f.standY(s.x, s.z) + 2;
    const dx = s.x - o.x;
    const dy = sy - o.y;
    const dz = s.z - o.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist < s.reach + 3 || dist > RANGE * 2) continue;
    const along = dx * d.x + dy * d.y + dz * d.z;
    if (along <= 0) continue;
    const off = Math.hypot(dx - d.x * along, dy - d.y * along, dz - d.z * along);
    const reach = s.reach + 4 + along * 0.01;
    if (off > reach || land < along - s.reach - 6) continue;
    if (off / reach < best) [stamp, best, sd] = [s, off / reach, dist];
  }
  if (stamp) return setTarget(`t:${stamp.id}`, stamp.name, sd, null, null);
  // Phnom Kulen's slopes (not from on them).
  if (land < Infinity) {
    const kulen = PLATEAUS.find((p) => p.name === 'Phnom Kulen');
    const st = STAMP_BY_ID.get('kulen');
    const inK = (x: number, z: number) => kulen && ((x - kulen.x) / kulen.rx) ** 2 + ((z - kulen.z) / kulen.rz) ** 2 < 1;
    if (st && inK(o.x + d.x * land, o.z + d.z * land) && !inK(o.x, o.z)) return setTarget('k', st.name, land, null, null);
  }
  setTarget('', null, 0, null, null);
}

/** Where the ray from `o` along `d` goes into a place's box (its pad, up its height), or −1 (missed, or from inside). */
function boxHit(o: Vector3, d: Vector3, p: PlaceDef): number {
  const lo = [p.x - p.pad[0], p.y - 3, p.z - p.pad[1]];
  const hi = [p.x + p.pad[0], p.y + (PLACE_H[p.id] ?? 25), p.z + p.pad[1]];
  const oo = [o.x, o.y, o.z];
  const dd = [d.x, d.y, d.z];
  let tIn = -Infinity;
  let tOut = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(dd[i]) < 1e-9) {
      if (oo[i] < lo[i] || oo[i] > hi[i]) return -1;
      continue;
    }
    let a = (lo[i] - oo[i]) / dd[i];
    let b = (hi[i] - oo[i]) / dd[i];
    if (a > b) [a, b] = [b, a];
    tIn = Math.max(tIn, a);
    tOut = Math.min(tOut, b);
  }
  return tIn > 0 && tIn <= tOut ? tIn : -1;
}

function setTarget(key: string, name: Both | null, dist: number, kind: SubjectKind | null, s: Subject | null): void {
  target.key = key;
  target.name = name;
  target.dist = dist;
  target.kind = kind;
  if (s) {
    target.x = s.x;
    target.y = s.y;
    target.z = s.z;
    target.r = s.r;
  }
}

/** An animal or a bird the book has a page for and could get from a look (not a catch, not people, not plants). */
function bookable(kind: SubjectKind | null): kind is SubjectKind {
  if (!kind || CATCH.has(kind)) return false;
  const g = SPECIES_BY_KIND.get(kind)?.group;
  return g === 'land' || g === 'jungle' || g === 'water';
}

/** "180 m", "1.2 km" (Khmer digits in Khmer). */
function distText(d: number): string {
  if (d >= 1000) return `${num((d / 1000).toFixed(1))} ${t('km')}`;
  return `${num(d < 100 ? Math.max(1, Math.round(d)) : Math.round(d / 5) * 5)} ${t('m')}`;
}

/** The view's crop round (u, v) (0‥1 from the top left), `size` of its height: a small JPEG for the page ('' if the canvas can't be read). */
function thumb(canvas: HTMLCanvasElement, u: number, v: number, size: number): string {
  try {
    const W = canvas.width;
    const H = canvas.height;
    let ch = Math.min(H * 0.6, Math.max(H * 0.22, size * H * 3.2));
    let cw = (ch * THUMB_W) / THUMB_H;
    if (cw > W) {
      cw = W;
      ch = (W * THUMB_H) / THUMB_W;
    }
    const sx = Math.min(W - cw, Math.max(0, u * W - cw / 2));
    const sy = Math.min(H - ch, Math.max(0, v * H - ch / 2));
    const c = document.createElement('canvas');
    c.width = THUMB_W;
    c.height = THUMB_H;
    const g = c.getContext('2d');
    if (!g) return '';
    g.drawImage(canvas, sx, sy, cw, ch, 0, 0, THUMB_W, THUMB_H);
    return c.toDataURL('image/jpeg', 0.8);
  } catch {
    return '';
  }
}

// ── The view's interface ────────────────────────────────────────────────────

interface BinoUi {
  /** The tool bar's slot lit (they are up) or not. */
  slot(on: boolean): void;
  /** The view's mask, name and keys, `o` 0‥1 shown. */
  show(o: number): void;
  /** The name at the bottom (null: none), and the book's line filling (−1: none). */
  name(text: string | null, book: number): void;
  zoom(fov: number): void;
}
let ui: BinoUi | null = null;

const kbd = (k: string) => `<kbd>${k}</kbd>`;
const low = (w: WordKey) => t(w).toLowerCase();
const pads = (...gs: PadGlyph[]) => gs.map((g) => padGlyph(g)).join(' / ');
/** The keys under the view: the pad's buttons while it is in use, the touch words on touch, else the keys. */
function hintText(): string {
  if (pad.active) return [`${pads('rstick')} ${low('rLook')}`, `${pads('r1', 'l1')} ${low('rZoom')}`, `${pads('l2', 'east')} ${low('rStow')}`].join(' · ');
  if (document.body.classList.contains('roam-touch')) return [low('rDragLook'), low('binoPinch')].join(' · ');
  return [low('rDragLook'), low('rWheelZoom'), `${kbd('7')} / ${kbd('Esc')} ${low('rStow')}`].join(' · ');
}

/** 16 × 16 pixel binoculars for the tool bar (seen from the front: the eyepieces up, the lenses down, lit blue). */
const ICON = `<svg class="rtb-icon" viewBox="0 0 16 16" aria-hidden="true" shape-rendering="crispEdges">
  <path fill="currentColor" d="M2 1h3v2H2zM11 1h3v2h-3zM1 3h5v11H1zM10 3h5v11h-5zM6 5h4v4H6zM7 3h2v2H7z"/>
  <path fill="#0d1927" d="M2 9h3v4H2zM11 9h3v4h-3z"/>
  <path class="rtb-lit" fill="#8fb4e2" d="M2 10h3v2H2zM11 10h3v2h-3z"/><path class="rtb-lit" fill="#f2f6ff" d="M2 10h1v1H2zM11 10h1v1h-1z"/>
  <path class="rtb-lit" fill="#ffe07c" d="M7 6h2v1H7z"/></svg>`;

function createUi(e: AddonEnv): BinoUi {
  injectStyle();
  const layer = e.layer;
  const wrapEl = document.createElement('div');
  wrapEl.className = 'bino';
  wrapEl.setAttribute('aria-hidden', 'true');
  wrapEl.innerHTML = `<canvas class="bino-mask"></canvas>
    <div class="bino-name mu-frame mu-sm" role="status"><span class="mu-bg"></span><span class="bino-name-t"></span><span class="bino-book"><i></i></span></div>
    <div class="bino-bar mu-frame mu-sm"><span class="mu-bg"></span><b class="bino-zoom"></b><span class="bino-hint"></span></div>`;
  // (first in the roaming layer: its prompt, toast and fade show over it)
  layer.prepend(wrapEl);
  const canvas = wrapEl.querySelector<HTMLCanvasElement>('.bino-mask')!;
  const nameEl = wrapEl.querySelector<HTMLElement>('.bino-name')!;
  const nameT = wrapEl.querySelector<HTMLElement>('.bino-name-t')!;
  const bookEl = wrapEl.querySelector<HTMLElement>('.bino-book')!;
  const bookBar = bookEl.querySelector<HTMLElement>('i')!;
  const zoomEl = wrapEl.querySelector<HTMLElement>('.bino-zoom')!;
  const hintEl = wrapEl.querySelector<HTMLElement>('.bino-hint')!;

  // The tool bar's slot (7): after the selfie phone, the bag (6) and any other slot keyed below 7.
  const slotEl = document.createElement('button');
  slotEl.type = 'button';
  slotEl.className = 'rtb-slot';
  slotEl.dataset.addon = 'binoculars';
  slotEl.dataset.key = '7';
  slotEl.setAttribute('aria-pressed', 'false');
  slotEl.innerHTML = `<span class="rtb-bg"></span>${ICON}<kbd data-pad="l2">7</kbd>`;
  slotEl.addEventListener('click', () => {
    slotEl.blur();
    e.controls.press('Digit7');
  });
  const bar = layer.querySelector('.rtb');
  if (bar) {
    const before = [...bar.querySelectorAll<HTMLElement>('.rtb-slot[data-key]')].filter((b) => Number(b.dataset.key) < 7).pop();
    const after = [...bar.querySelectorAll<HTMLElement>('.rtb-slot[data-key]')].find((b) => Number(b.dataset.key) > 7);
    if (after) after.before(slotEl);
    else if (before) before.after(slotEl);
    else bar.querySelector('.rtb-sep')?.before(slotEl);
  }

  let shown = -1;
  let maskDirty = true;
  let nameText: string | null = null;
  let bookW = -2;
  let zoomText = '';
  addEventListener('resize', () => (maskDirty = true));
  const words = () => {
    slotEl.title = `${t('binoName')} (7)`;
    slotEl.setAttribute('aria-label', slotEl.title);
    hintEl.innerHTML = hintText();
  };
  words();
  onLang(words);
  pad.onChange(words);

  /** The two lenses: black round them (soft edges), a faint cool coating tint inside their rims; drawn again when the size changes. */
  function drawMask(): void {
    maskDirty = false;
    const W = Math.max(1, layer.clientWidth || innerWidth);
    const H = Math.max(1, layer.clientHeight || innerHeight);
    // (the edges are soft: the page's own pixels are enough, a sharp screen's double would only cost memory)
    const dpr = 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { r: R, sep } = lenses(W, H);
    const cy = H / 2;
    const cx = [W / 2 - sep, W / 2 + sep];
    const cut = (inner: number, outer: number) => {
      g.globalCompositeOperation = 'destination-out';
      for (const x of cx) {
        const gr = g.createRadialGradient(x, cy, 0, x, cy, R);
        gr.addColorStop(0, 'rgba(0,0,0,1)');
        gr.addColorStop(inner, 'rgba(0,0,0,1)');
        gr.addColorStop(outer, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(x - R, cy - R, 2 * R, 2 * R);
      }
      g.globalCompositeOperation = 'source-over';
    };
    // The coating tint (cut out of the middle of each lens: what is left is a ring inside the outer rim, no seam where they meet).
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(20, 58, 74, 0.2)';
    g.fillRect(0, 0, W, H);
    cut(0.6, 0.985);
    const tint = document.createElement('canvas');
    tint.width = canvas.width;
    tint.height = canvas.height;
    tint.getContext('2d')?.drawImage(canvas, 0, 0);
    // The black round the lenses, with soft edges; the tint under it.
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#020304';
    g.fillRect(0, 0, W, H);
    cut(0.935, 1);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'destination-over';
    g.drawImage(tint, 0, 0);
    g.globalCompositeOperation = 'source-over';
  }

  return {
    slot(on) {
      slotEl.classList.toggle('is-on', on);
      slotEl.setAttribute('aria-pressed', String(on));
    },
    show(o) {
      const v = Math.round(o * 100) / 100;
      // (the window's size changed: the lenses again, even while they stay up)
      if (v > 0 && maskDirty) drawMask();
      if (v === shown) return;
      if (v > 0 && shown <= 0) hintEl.innerHTML = hintText();
      shown = v;
      wrapEl.classList.toggle('is-on', v > 0);
      wrapEl.style.opacity = String(v);
    },
    name(text, book) {
      if (text !== nameText) {
        nameEl.classList.toggle('is-on', !!text);
        if (text) nameT.textContent = text;
        nameText = text;
      }
      const b = text ? Math.round(book * 100) / 100 : -1;
      if (b !== bookW) {
        bookEl.classList.toggle('is-on', b >= 0);
        bookBar.style.width = `${Math.max(0, b) * 100}%`;
        bookW = b;
      }
    },
    zoom(fov) {
      const z = `${num(Math.round(POWER / fov))}×`;
      if (z === zoomText) return;
      zoomText = z;
      zoomEl.textContent = z;
    },
  };
}

let styled = false;
function injectStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement('style');
  style.textContent = `
    .bino { position: absolute; inset: 0; pointer-events: none; opacity: 0; visibility: hidden; }
    .bino.is-on { visibility: visible; }
    .bino-mask { position: absolute; inset: 0; width: 100%; height: 100%; }
    .bino-name { position: absolute; left: 50%; bottom: calc(78 * var(--px)); display: grid; justify-items: center; gap: calc(5 * var(--px));
      padding: calc(7 * var(--px)) calc(18 * var(--px)) calc(8 * var(--px)); font-weight: 600; font-size: calc(17 * var(--px)); line-height: 1.3;
      white-space: nowrap; color: var(--mu-ink); opacity: 0; transform: translate(-50%, calc(6 * var(--px)));
      transition: opacity 0.35s, transform 0.35s var(--mu-ease); }
    .bino-name.is-on { opacity: 1; transform: translate(-50%, 0); }
    :lang(km) .bino-name { font-size: calc(18 * var(--px)); }
    .bino-book { display: none; width: 100%; min-width: calc(90 * var(--px)); height: calc(3 * var(--px)); background: rgba(255, 229, 188, 0.18); }
    .bino-book.is-on { display: block; }
    .bino-book i { display: block; height: 100%; width: 0; background: var(--mu-gold-hi); box-shadow: 0 0 calc(6 * var(--px)) rgba(255, 196, 80, 0.6); }
    .bino-bar { position: absolute; left: 50%; bottom: calc(22 * var(--px)); transform: translateX(-50%); display: flex; align-items: center;
      gap: calc(12 * var(--px)); max-width: calc(100% - 32px); padding: calc(6 * var(--px)) calc(16 * var(--px)); font-size: calc(13 * var(--px));
      white-space: nowrap; color: var(--mu-ink2); }
    .bino-zoom { font: 700 calc(15 * var(--px)) / 1 var(--mu-display); color: var(--mu-gold-hi); letter-spacing: 0.02em; }
    .bino-hint { overflow: hidden; text-overflow: ellipsis; }
    .bino-hint kbd { display: inline-block; min-width: calc(16 * var(--px)); padding: 0 calc(4 * var(--px)); border-radius: calc(3 * var(--px));
      background: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.22); font: calc(11 * var(--px)) / calc(16 * var(--px)) ui-monospace, monospace;
      text-align: center; color: var(--mu-ink); }
    .bino-hint svg { width: 1.25em; height: 1.25em; vertical-align: -0.28em; }
    /* (looking through them: only the view; the touch layout keeps its ✕, not the camera's shutter) */
    body.roam-bino .rh > :not(.bino, .rh-toast, .rh-fade), body.roam-bino .map-ui:not(.rh), body.roam-bino .fb-button {
      opacity: 0 !important; visibility: hidden !important; transition: opacity 0.3s, visibility 0s 0.3s !important; }
    body.roam-bino .rt-shutter, body.roam-bino .rr-zzz { display: none !important; }
    /* (the tool bar's slot: greyed where his hands can't, as the lights are) */
    .rh:is([data-mode='hang'], [data-mode='glide'], [data-mode='leap']) .rtb-slot[data-addon='binoculars'] { opacity: 0.32; }
    @media (max-width: 639px) { .bino-name { bottom: calc(64 * var(--px)); } .bino-bar { bottom: 12px; } }`;
  document.head.append(style);
}

// ── The add-on ──────────────────────────────────────────────────────────────

registerAddon({
  id: 'binoculars',
  // (their keys come before the other add-ons': while they are up, they have the step's input)
  order: 5,
  get handsBusy() {
    return up || hands > 0;
  },

  init(e) {
    env = e;
    ui = createUi(e);
    // (checks: what they look at, and the middle of the view looked at again now)
    Object.assign(window, {
      __bino: {
        aim,
        target,
        get up() {
          return up;
        },
        get view() {
          return view;
        },
        look: () => (lookAtMiddle(), { ...target, name: target.name?.en ?? null }),
      },
    });
  },

  input(ctx, m, tap, dt) {
    const e = env;
    if (!e) return false;
    const i = ctx.input;
    // (the pad's L2: taken every step, so a press never waits for another moment)
    const l2 = pad.take('l2');
    const seven = tap('Digit7', 'Numpad7') || l2;
    // Lying down, 7 sat him up first: J once more for a sleeper (the first J only woke him), then up when he sits.
    if (sitWait > 0 && !up) {
      if (sitAgain && !e.explorer.asleep) {
        e.controls.press('KeyJ');
        sitAgain = false;
      }
      return false;
    }
    if (!up) {
      if (!seven) return false;
      // (lying on his back: sit up first, then raise them)
      const s = canRaise(ctx, m);
      if (s === 'sit' && upright() < LYING) {
        e.controls.press('KeyJ');
        sitWait = 3;
        sitAgain = e.explorer.asleep;
        return true;
      }
      if (!s) return false;
      raise(ctx, s);
      return true;
    }
    // Up: 7, L2, Esc, ○ or the touch ✕ lower them.
    if (seven || i.exit) {
      lower(ctx);
      i.exit = false;
      return true;
    }
    // Another tool, emote or menu key: put away now, and let it do its own thing this step.
    if (i.taps)
      for (const c of i.taps)
        if ((TOOL_KEYS.has(c) || c === PAD_LIGHT) && c !== 'Slash') {
          drop(ctx);
          return false;
        }
    // Look round (slower the more they magnify, as his camera does, and a little slower still: a steady aim), W A S D and
    // the left stick slowly too; zoom.
    const k = (LOOK * aim.fov) / 50;
    aim.yaw += i.lookYaw * k - i.move.x * PAN * k * dt;
    aim.pitch = clamp(aim.pitch - i.lookPitch * k + i.move.y * PAN * k * dt, PITCH[0], PITCH[1]);
    if (i.zoom) aim.fov = clamp(aim.fov * (1 + i.zoom * 0.08), FOV_TELE, FOV_WIDE);
    if (seat !== 'stand') aim.yaw = ctx.body.yaw + clamp(angleDiff(aim.yaw, ctx.body.yaw), -TURN, TURN);
    return true;
  },

  after(ctx, m, dt) {
    const e = env;
    if (!e) return;
    clock += dt;
    if (e.photo.kind) photoAt = clock;
    if (sitWait > 0) {
      sitWait -= dt;
      if (up) sitWait = 0;
      else if (upright() > SITTING && e.explorer.animator.posture) {
        sitWait = 0;
        const s = canRaise(ctx, m);
        if (s) raise(ctx, s);
      }
    }
    if (!active) return;
    hands = clamp(hands + dt / (up ? RAISE_HANDS : -LOWER_HANDS), 0, 1);
    view = clamp(view + dt / (up ? RAISE_VIEW : -LOWER_VIEW), 0, 1);
    if (up && hold !== null) view = clamp(hold, 0, 1);
    if (up || hands > 0) wrap();
    else if (wrapped) unwrap();
    // Over a fall in the boat (or any sudden drop): put away at once.
    const vy = dt > 0 ? (ctx.body.pos.y - lastY) / dt : 0;
    lastY = ctx.body.pos.y;
    if (up && m === 'boat' && vy < -3) drop(ctx);
    // The hands' sway: breathing, a slow drift, a little tremor (more in the boat, less sitting; less with reduce motion).
    const a = aim.fov * DEG * (SWAY[seat] * (calm ? 0.35 : 1));
    const tt = clock;
    sway.yaw = a * (0.011 * Math.sin(tt * 0.83) + 0.006 * Math.sin(tt * 2.07 + 1.3) + 0.0025 * Math.sin(tt * 4.9 + 0.4));
    sway.pitch = a * (0.012 * Math.sin((tt * Math.PI * 2) / 4.2) + 0.005 * Math.sin(tt * 1.61 + 0.7) + 0.002 * Math.sin(tt * 5.7 + 2.1));
    if (!up) return;
    // On foot he turns to where they look (as with his camera). (The follow camera is put behind the view as they come down.)
    if (m === 'walk' && seat === 'stand') ctx.body.yaw += angleDiff(aim.yaw, ctx.body.yaw) * Math.min(1, 10 * dt);
    // What is in the middle, ten times a second once the view is in them.
    if (view < 0.9 && hold === null) {
      steady = 0;
      target.key = '';
      return;
    }
    if ((lookIn -= dt) <= 0) {
      lookIn = LOOK_EVERY;
      const was = target.key;
      lookAtMiddle();
      if (target.key !== was) {
        steady = 0;
        booked = '';
      }
      label = target.name ? `${target.name[lang()]} · ${distText(target.dist)}` : '';
    }
    steady += dt;
    if (bookable(target.kind) && !e.photo.journal.book[target.kind] && steady >= NAME_AFTER + BOOK_AFTER && booked !== target.key && !pageDue) {
      booked = target.key;
      pageDue = { kind: target.kind, x: target.x, y: target.y, z: target.z, r: target.r };
    }
  },

  frame(f: MapFrame, m) {
    const e = env;
    if (!e || !ui || !active) return;
    const camera: PerspectiveCamera = e.cam.camera;
    // (his camera put away as they came up: tools.ts gave the touch layout and the drag back to walking this frame)
    if (e.photo.kind !== photoKind) {
      photoKind = e.photo.kind;
      if (shutter) e.controls.setShutter('camera');
    }
    const k = smooth(view);
    // (the follow camera's near fade off while the view is in them)
    if (m !== 'overview' && m !== 'leap' && view > 0) followNearFade(e.cam.focus, f.dt > 0 ? f.dt : 1, 1 - view);
    if (k > 0) {
      camera.position.lerp(eyeAt(_v), k);
      _q.setFromEuler(_ey.set(aim.pitch + sway.pitch, aim.yaw + sway.yaw + Math.PI, 0));
      camera.quaternion.slerp(_q, k);
      // (the field is the lenses' height, not the screen's: on a phone held upright they are a strip across its middle)
      const tall = 1 / (2 * lenses(camera.aspect || 1, 1).r);
      const field = (2 * Math.atan(Math.tan((aim.fov * DEG) / 2) * tall)) / DEG;
      const fov = camera.fov + (field - camera.fov) * k;
      baseNear ||= camera.near;
      const near = baseNear + (NEAR * (e.body.scale / 1.4) - baseNear) * smooth((k - 0.5) / 0.5);
      if (Math.abs(camera.fov - fov) > 1e-3 || Math.abs(camera.near - near) > 1e-3) {
        camera.fov = fov;
        camera.near = near;
        camera.updateProjectionMatrix();
      }
      camera.updateMatrixWorld();
    }
    // His body hides while the view is at his eyes (on the way in and out too), and shows again after.
    const hide = k > 0 && camera.position.distanceTo(e.explorer.rig.joints.head.getWorldPosition(_v)) < 0.95 * e.body.scale;
    if (hide !== hidden || (hide && bodyShown(e))) {
      e.explorer.setBodyVisible(!hide);
      // (his camera's own view may want him hidden still)
      if (!hide) e.photo.refreshBody();
      hidden = hide;
    }
    // The mask, the name, the zoom.
    ui.show(smooth((view - 0.55) / 0.45));
    ui.zoom(aim.fov);
    const named = up && view > 0.9 && target.name && steady >= NAME_AFTER;
    const fresh = named && bookable(target.kind) && !e.photo.journal.book[target.kind];
    ui.name(named ? label : null, fresh ? clamp((steady - NAME_AFTER) / BOOK_AFTER, 0, 1) : -1);
    // The focus wheel's whirr, as quick as the zoom.
    const dv = f.dt > 0 ? Math.abs(aim.fov - lastFov) / f.dt : 0;
    lastFov = aim.fov;
    whirr += (clamp(dv / 2.5, 0, 1) - whirr) * (f.dt > 0 ? Math.min(1, f.dt * 18) : 1);
    SFX.level('binoFocus', up && whirr > 0.02 ? whirr : 0);
    // A new page: the crop of this frame once it is drawn (the canvas still holds it then: right after this frame's task).
    if (pageDue) {
      const p = pageDue;
      pageDue = null;
      _v.set(p.x, p.y, p.z).project(camera);
      const u = (_v.x + 1) / 2;
      const v = (1 - _v.y) / 2;
      const size = p.r / Math.max(0.5, camera.position.distanceTo(_t.set(p.x, p.y, p.z))) / Math.tan((camera.fov * DEG) / 2);
      const at = e.body.pos;
      const [x, z] = [at.x, at.z];
      queueMicrotask(() => {
        if (!env || env.photo.journal.book[p.kind]) return;
        const img = env.shot ? '' : thumb(env.canvas, u, v, size);
        if (env.photo.journal.seen(p.kind, x, z, img)) SFX.play('binoBook');
      });
    }
    if (!up && view <= 0 && hands <= 0) finish();
  },

  setMode(next, prev, ctx) {
    mode = next;
    if (next === prev || (!active && sitWait <= 0)) return;
    // (a new mode, a new pose: put away at once; back to the map: the view too)
    sitWait = 0;
    drop(ctx, true);
    finish();
  },

  fromUrl(q, ctx) {
    const b = q.get('bino');
    if (b !== '1' && b !== 'up') return;
    hold = q.has('sview') ? clamp(Number(q.get('sview')) || 0, 0, 1) : null;
    const s = canRaise(ctx, mode, true);
    if (!s) return;
    const pv = q.get('pview')?.split(',').map(Number);
    raise(ctx, s, true);
    if (pv && pv.every(Number.isFinite)) {
      aim.yaw = (pv[0] ?? 0) * DEG;
      aim.pitch = clamp((pv[1] ?? 0) * DEG, PITCH[0], PITCH[1]);
      if (pv[2]) aim.fov = clamp(pv[2], FOV_TELE, FOV_WIDE);
    } else aim.yaw = ctx.body.yaw;
    if (s === 'stand') ctx.body.yaw = aim.yaw;
    else aim.yaw = ctx.body.yaw + clamp(angleDiff(aim.yaw, ctx.body.yaw), -TURN, TURN);
    lastFov = aim.fov;
  },

  report() {
    if (!up) return null;
    const deg = (r: number) => ((((r / DEG) % 360) + 360) % 360).toFixed(0);
    return { bino: '1', pview: `${deg(aim.yaw)},${(aim.pitch / DEG).toFixed(0)},${aim.fov.toFixed(1)}` };
  },
});

/** A mesh of his head (found again when the head is built again), to tell whether his body shows. */
let probe: Object3D | null = null;
let probeOf: Object3D | null = null;
/** His body is showing now (the camera's own view may have shown him meanwhile). */
function bodyShown(e: AddonEnv): boolean {
  const g = e.explorer.rig.getSlot('head');
  if (!g) return false;
  if (probeOf !== g) {
    probeOf = g;
    probe = null;
    g.traverse((o) => {
      if (!probe && (o as Mesh).isMesh) probe = o;
    });
  }
  return !!probe && (probe as Object3D).visible;
}

/** All down: the page's look back, his body shown. */
function finish(): void {
  const e = env;
  if (!e || !active) return;
  active = false;
  hands = view = 0;
  unwrap();
  setLook(false);
  ui?.show(0);
  ui?.name(null, -1);
  SFX.level('binoFocus', 0);
  whirr = 0;
  const cam = e.cam.camera;
  if (baseNear && cam.near !== baseNear) {
    cam.near = baseNear;
    cam.updateProjectionMatrix();
  }
  target.key = '';
  steady = 0;
  if (hidden) {
    e.explorer.setBodyVisible(true);
    e.photo.refreshBody();
    hidden = false;
  }
}
