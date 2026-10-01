import { Group, Quaternion, Vector3 } from 'three';
import { BELT_EMPTY, BELT_FULL, palmBeltPoint, palmClimbPose, palmClimbState, palmGivePose, type PalmGivePose } from '../../character/palmClimb';
import { MEAL } from '../../character/meals';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { BODY_UNIT_M } from '../../world/scale';
import { SFX } from '../audio/addonSfx';
import '../audio/_palm';
import { PALM_CLIMB, poleOut, psBarTop, PS_CLIMB_PALMS, psRungs } from '../hamlet/_psPalms';
import { HUT, psPlan, psWorking, RUNG, type PsPalm } from '../hamlet/_psPlan';
import { pad } from '../pad/pad';
import { Bubble } from '../people/_bubble';
import type { Point } from '../people/_routes';
import { TIME } from '../time';
import type { MapFrame } from '../types';
import { num, onLang, t } from '../ui/lang';
import { palmBend, sugarPalmWork, type PalmSpec } from '../veg/palms';
import { registerAddon, touchJump, type AddonEnv, type AddonHold, type AddonKey } from './_addons';
import { angleDiff } from './followCam';
import { CARRY_MAX, nameOf, type Kept } from './_shopPurse';
import type { RoamCtx } from './types';

/**
 * Climbing a sugar palm's bamboo ladder in the palm sugar family's yard
 * (hamlet/_palmSugar.ts; its ladders `_psPalms.ts`, its people
 * people/_scenePalmSugar.ts). A walk-mode add-on that holds him (_addons.ts):
 *
 * - **At the foot** of a yard palm's ladder (`PS_CLIMB_PALMS`: the one by the
 *   lane, behind the house, behind the shed, south of the racks) nobody is
 *   on: "E  ឡើងជណ្ដើរ / Climb the ladder" (the tapper up it, or on his way
 *   to it: it says so; a storm: not now). E steps him onto the first stubs.
 * - **Climbing**: W (the stick forward) climbs, S comes down, Shift quicker;
 *   let go, he finishes the step he is in. Each sole stands on a stub and
 *   each fist holds one higher up (the bare pole above the last), moving up
 *   stub by stub as he rises — a fist with the foot under it — by IK
 *   (character/palmClimb.ts), as fast as he climbs; the culm knocks under his
 *   boots, his palms slap the stubs, the old bamboo creaks in its lashings.
 *   His hat comes off on the ladder (its brim would go through the trunk) and
 *   back on at its foot. The camera comes round to his side and out as he
 *   goes up; at the top (his feet on the crossbar under the crown), once he
 *   stops, it pulls back and up over the yard, the fields and the palms, and
 *   he looks out where it looks (drag to look round: the camera is then the
 *   player's until the next moment). The camera (4) and the phone (5) work
 *   up there.
 * - **At the top, E swaps the tube**: the full one hanging under the cut
 *   flower stalk on his right (smoke-blackened bamboo, the juice foaming at
 *   its mouth) for the clean one he brought on his belt; the full one goes
 *   on his belt and sloshes all the way down. Only while the family works
 *   (by night the tubes fill: come back in the morning) and once a tube is
 *   full again (a new work day, or a while after he changed it).
 * - **Getting off**: S (or E) on the lowest stubs steps him off backwards;
 *   Space jumps off from the lowest rungs only; Esc / back to the map takes
 *   him off at once.
 * - **The cook** (the tapper's wife) leaves her woks when he swaps and waits
 *   at the palm's foot looking up; he steps off, turns and holds the tube
 *   out; she takes it ("អរគុណណាក្មួយ!"), tucks it in her waist, hands him a
 *   cup of fresh palm juice ("ទឹកត្នោតស្រស់មួយកែវ សម្រាប់ក្មួយ!"), which
 *   goes in his bag (6 drinks it: roam/_shop.ts) — his bag full, he drinks it
 *   there — and she carries the juice back and pours it into the first wok.
 * - **The tapper**, up his own palm meanwhile, calls across to him.
 *
 * Hooks: `PALM_CLIMB` (hamlet/_psPalms.ts) tells the family where he is and
 * what he does; they tell him where the cook and the tapper are.
 *
 * URL (checks): `palm=<0‥1>` him that far up the ladder (from its lowest
 * stubs to the crossbar) · `palm=top` at the top, stopped (the view) ·
 * `palm=swap:<s>` that far into the swap · `palm=full:<0‥1>` climbing with
 * the full tube on his belt · `palm=wait` stepped off with it, the cook
 * coming · `palm=give:<s>` that far into handing it over, she in front of
 * him · `palmtree=g1|g2|g3|g4` which palm (else the nearest to `at=`). A
 * shot settles 0.8 s after it is put there (no `sim=`): `swap:` and `give:`
 * count that in. In `sim=`: `w`, `s` climb, `e` swaps or steps off, `j`
 * jumps off.
 */

// ── The ladder and his body on it ──────────────────────────────────────────

/** The pole's middle stands this far in front of his feet's middle (BU at his size). */
const PZ_BU = 6.8;
/** His distance from the trunk follows the pole this far over his feet (m). */
const REF_UP = 0.9;
/** The soles stand this far out along the stubs from the pole's middle; the fists hold them this far out; on the bare pole this far (m). */
const FOOT_OUT = 0.2;
const HAND_OUT = 0.17;
const POLE_HAND = 0.06;
/** The stubs' half thickness (m): a sole stands on the top. */
const STUB_HALF = 0.0275;
/** A tube in his fist hangs this far under it (m: he holds it under the rim). */
const HANG = 0.2;
/**
 * The climbing cycle (m of rise): a foot leaves its stub when it is this far
 * over his feet, a hand when its stub is this far; each takes this much of
 * his rise to reach the next one up its side (`2 × RUNG` higher). The hands'
 * are two cycles over the feet's: a hand goes up with the foot under it
 * (his short arms hold the stubs from his chest to his shoulders).
 */
const LEAVE_FOOT = 0.03;
const LEAVE_HAND = LEAVE_FOOT + 4 * RUNG;
const SWING_FOOT = 0.24;
const SWING_HAND = 0.15;
/**
 * Where all four are on stubs (between one side's move and the other's: m of
 * his rise, every `2 × RUNG` from each): he stops there, finishing the step
 * he is in when the stick lets go. The lowest is where he gets on.
 */
const REST = [0.194, 0.449];
const S_MIN = REST[0];
/** Finishing a step: at most this fast (m/s), slowing into it at this rate (1/s). */
const SETTLE_V = 0.35;
const SETTLE_K = 6;
/** Climbing speeds (m/s, his size: a tapper climbs ≈ 0.6), Shift's share more, easing (1/s). */
const UP = 0.55;
const DOWN = 0.75;
const QUICK = 1.5;
const EASE = 7;
/** Space jumps off only this low (m: his feet over the palm's foot). */
const JUMP_MAX = 1.3;
/** Getting on and off (s); stepping off he lands this far further out (m). */
const ON = 0.55;
const OFF = 0.5;
const STEP_BACK = 0.8;
/** Near the foot's spot to be offered the climb (m, across; and up or down). */
const REACH = 1.35;
const RISE = 1.2;
/** A storm this strong keeps him (and the tapper) off the palms. */
const STORM = 0.4;
/** The view from the top goes round from behind him at most this far (radians: further, the trunk and the crown are between). */
const VIEW_ROUND = 2.4;
/** His head turns this far at most (radians, the neck and the head together). */
const LOOK_MAX = 1.3;
/** A tube he changed is full again after this long (s of roaming), or on the next work day. */
const REFILL = 150;

// ── The swap at the top and the hand-over at the foot (s) ─────────────────

/** The right hand to the belt (the clean tube), up to the stalk, the exchange, down to the belt (the full one), back to the pole. */
const SWAP = { belt: 0.55, stalk: 1.45, swap: 1.6, hold: 1.75, down: 2.6, back: 3.3 };
/** He holds the tube out; she has it; it goes to her waist; she holds out the cup; it is his; into his bag. */
const HAND = { out: 0.45, taken: 0.95, tuck: 1.6, cup: 1.9, got: 2.9, bag: 3.7 };
/** Waiting for her at most (s) before going on without her; with no word from the family at all, this long. */
const WAIT_MAX = 25;
const NOBODY = 1.5;
/** Nobody on the way to him this long after he stepped off (s; the cook was not out to see him swap): he walks on. */
const NOT_COMING = 4;

/** The cup of fresh palm juice she gives (the stall's own item: _palmSugar.ts `palmJuice`). */
const JUICE: Kept = { shop: 'palm-sugar-stall', id: 'palmJuice', name: { km: 'ទឹកត្នោតស្រស់', en: 'Fresh palm juice' }, consume: 'cupDrink', colors: [0x9a7a44, 0xeee2b8] };

type State = 'idle' | 'on' | 'climb' | 'swap' | 'off' | 'wait' | 'hand' | 'drink';

interface Ladder {
  id: string;
  p: PsPalm;
  spec: PalmSpec;
  /** Facing the trunk (radians); the ladder's way out (unit), across (his left). */
  yaw: number;
  lx: number;
  lz: number;
  tx: number;
  tz: number;
  /** Stub tops for each foot and grips for each fist (m over the palm's foot), bottom up, a few made up below and above. */
  feet: { L: number[]; R: number[] };
  hands: { L: number[]; R: number[] };
  /** The highest real stub each side (the fists hold the bare pole over it). */
  lastStub: { L: number; R: number };
  /** His feet on the crossbar (m over the palm's foot). */
  sTop: number;
  /** The tube he swaps (under the flower stalk on his right): its middle at rest (world), its top's height, the palm's turn. */
  tube: { x: number; y: number; z: number; top: number };
  turn: number;
  /**
   * The view from the top: the camera's heading once he stands up there (towards the shed, its steam and the yard's
   * palms, as far round from his back as still sees him past the trunk), and its side (±1: round to his left or right).
   */
  view: number;
  side: number;
}

/** Where a limb is: on stub index `a`, or between `a` and `a + 1` (`u` 0‥1). */
const _lim = { a: 0, u: 0 };
function limbAt(H: readonly number[], sv: number, leave: number, swing: number): typeof _lim {
  let j = -1;
  for (let i = 0; i < H.length; i++) {
    if (H[i] - leave <= sv) j = i;
    else break;
  }
  if (j < 0) {
    _lim.a = 0;
    _lim.u = 0;
  } else if (j + 1 < H.length && sv < H[j] - leave + swing) {
    _lim.a = j;
    _lim.u = (sv - (H[j] - leave)) / swing;
  } else {
    _lim.a = Math.min(j + 1, H.length - 1);
    _lim.u = 0;
  }
  return _lim;
}

const smooth = (u: number) => {
  const c = Math.min(1, Math.max(0, u));
  return c * c * (3 - 2 * c);
};

// ── The tubes (world size: the palm's own are 0.13 × 0.55 m) ──────────────

/** The clean tube, as the palm's own (veg/palms.ts): pale bamboo, a darker rim and node. Its middle at the origin. */
function emptyTube(): VoxelBuilder {
  const b = new VoxelBuilder();
  b.box(0, 0, 0, 0.13, 0.55, 0.13, 0xbfa86c, 'wood');
  b.box(0, 0.265, 0, 0.15, 0.05, 0.15, 0x7d6c40, 'wood');
  b.box(0, -0.215, 0, 0.145, 0.04, 0.145, 0x7d6c40, 'wood', { shade: 1.1 });
  return b;
}

/** The full tube: smoke-blackened bamboo, a sooty rim and node, the fresh juice foaming over its mouth (a little over the palm's own: it hides it). */
function fullTube(): VoxelBuilder {
  const b = new VoxelBuilder();
  b.box(0, 0.01, 0, 0.148, 0.6, 0.148, 0x4e3e2d, 'wood');
  b.box(0, 0.016, 0.0745, 0.1, 0.5, 0.004, 0x67513a, 'wood');
  b.box(0, 0.29, 0, 0.17, 0.056, 0.17, 0x2c2219, 'wood');
  b.box(0, -0.215, 0, 0.162, 0.042, 0.162, 0x2c2219, 'wood');
  b.box(0, 0.322, 0, 0.13, 0.03, 0.13, 0xf1e8cf, 'wood', { shade: 1.08 });
  b.box(0.012, 0.343, -0.01, 0.07, 0.022, 0.07, 0xf7f0dc, 'wood', { shade: 1.1 });
  b.box(0.072, 0.27, 0.02, 0.03, 0.09, 0.05, 0xe8dcc0, 'wood');
  return b;
}

/** A tube shown in the world (on a stalk, in a hand, with the cook) or hung on his belt (a slot of his hips joint). */
class Tube {
  readonly mesh: Group;
  readonly world = new Group();
  readonly belt = new Group();
  place: 'off' | 'world' | 'belt' = 'off';
  constructor(
    b: VoxelBuilder,
    name: string,
    private readonly slot: string,
    private readonly e: AddonEnv,
    /** Its rim's place on his belt (hips space, BU), or null (it never goes there). */
    private readonly top: Vector3 | null,
  ) {
    this.mesh = buildVoxelMesh(b, { quality: 'low', name });
    this.world.name = name;
    this.world.visible = false;
    this.world.add(this.mesh);
    e.scene.add(this.world);
  }

  hide(): void {
    if (this.place === 'belt') this.e.explorer.rig.clearSlot(this.slot);
    this.world.visible = false;
    this.place = 'off';
  }

  toWorld(): Group {
    if (this.place === 'belt') this.e.explorer.rig.clearSlot(this.slot);
    if (this.mesh.parent !== this.world) this.world.add(this.mesh);
    this.world.visible = true;
    this.place = 'world';
    return this.world;
  }

  toBelt(scale: number): void {
    if (this.place === 'belt' || !this.top) return;
    this.world.visible = false;
    this.belt.add(this.mesh);
    // (his rig is in body units at his size; the tube keeps its own, hanging from its rim)
    const u = BODY_UNIT_M * scale;
    this.belt.scale.setScalar(1 / u);
    this.belt.position.copy(this.top).y -= HANG / u;
    this.e.explorer.rig.setSlotObject(this.slot, 'hips', this.belt);
    this.place = 'belt';
  }
}

// ── The add-on's state ──────────────────────────────────────────────────────

let env: AddonEnv | null = null;
let ladders: Ladder[] = [];
let L: Ladder | null = null;
let state: State = 'idle';
/** Feet over the palm's foot (m) and the climb's speed (m/s); the moment of the state (s). */
let s = S_MIN;
let vel = 0;
let st = 0;
/** Where he is finishing his step to (m; NaN: climbing on). */
let goal = Number.NaN;
/** Looking up or down (eased), seconds stopped, the clock (s). */
let dir = 0;
let still = 0;
let clock = 0;
/** The follow camera's own `follow` before (put back after). */
let followBefore = 0.6;
/** Getting on / off: from, to (feet), and the facing. */
const from = new Vector3();
const to = new Vector3();
let yawFrom = 0;
let yawTo = 0;
/** He carries the full tube (swapped, not handed over yet); a jump off with it waits for the landing; the cook carries it back. */
let full = false;
let jumped = false;
let carried = false;
/** The swap's moment last step (its events pass once). */
let lastSwap = -1;
/** He had his hat on when he got on (its wide brim would go through the trunk: off on the ladder, on again at its foot). */
let hatBefore = false;
/** Toasts said this climb (night, not full yet), when "too high" was last, the keys' toast this visit. */
const said = { night: false, notFull: false, high: -99, keys: false };
/** Each palm's tube: when he last changed it (the work day and the roaming seconds). */
const changed = new Map<string, { day: number; t: number }>();
/** The frame's clock (the family's hours), the roaming seconds; the family's last update seen, and for how long not since. */
let dayClock = 0.85;
let roamT = 0;
let seenWas = -1;
let seenFor = 0;
/** The limbs' stubs last step (a sound as each comes onto a new one). */
const lastOn = { fL: -1, fR: -1, hL: -1, hR: -1 };
/** A creak now and then while he climbs, a slosh of the full tube. */
let creakIn = 1.2;
let sloshIn = 0.8;
/** Drinking it there (the bag full): its sips sounded, the breath after; his bubble and how long it shows. */
let sips = 0;
let ahh = false;
let bubble: Bubble | null = null;
let talkLeft = 0;

const pose = palmClimbState();
const give: PalmGivePose = { k: 0, t: 0 };
const climbPosture = () => palmClimbPose(pose);
const givePosture = () => palmGivePose(give);

/** The full tube (the stalk, his hand, his belt, his hands held out), the clean one (his belt, his hand), the one the cook carries. */
let tubeFull: Tube | null = null;
let tubeEmpty: Tube | null = null;
let tubeCook: Tube | null = null;

const _v = new Vector3();
const _w = new Vector3();
const _a = new Vector3();
const _c = new Vector3();
const _d = new Vector3();
const _rest = new Vector3();
const _b = { x: 0, z: 0 };
const _b2 = { x: 0, z: 0 };
const _q = new Quaternion();
const _q2 = new Quaternion();
const _up = new Vector3(0, 1, 0);
const _x = new Vector3(1, 0, 0);
const head: Point = { x: 0, y: 0, z: 0 };

/** Metres a body unit at his size. */
const unit = () => BODY_UNIT_M * (env?.body.scale ?? 1.4);

/** Built once roaming is (the plan read off the land). */
function makeLadders(e: AddonEnv): Ladder[] {
  const plan = psPlan(e.world.field);
  return PS_CLIMB_PALMS.map((id) => {
    const p = plan.byId[id];
    const spec: PalmSpec = { kind: 'sugar', x: p.x, y: p.y, z: p.z, h: p.h, seed: p.seed, tapped: true, ladder: p.ladder };
    const rungs = psRungs(p);
    const sTop = psBarTop(p);
    const feet = { L: [] as number[], R: [] as number[] };
    const hands = { L: [] as number[], R: [] as number[] };
    const lastStub = { L: 0, R: 0 };
    for (const side of ['L', 'R'] as const) {
      const mine = rungs.filter((r) => (r.side === 1) === (side === 'L')).map((r) => r.s + STUB_HALF);
      lastStub[side] = mine[mine.length - 1];
      // (made up below: the steps up from the ground; the feet end on the crossbar, the fists go on up the bare pole to its top)
      const below = [mine[0] - 4 * RUNG, mine[0] - 2 * RUNG];
      feet[side] = [...below, ...mine.filter((h) => h < sTop - 0.06), sTop];
      const g = [...below, ...mine];
      for (let h = g[g.length - 1] + 2 * RUNG; h < p.crown - p.y + 0.7; h += 2 * RUNG) g.push(h);
      hands[side] = g;
    }
    const work = sugarPalmWork(spec);
    const tube = work.tubes[1] ?? work.tubes[0];
    const yaw = Math.atan2(-p.lx, -p.lz);
    // (the view from the top: on over him towards the shed, round from his back at most `VIEW_ROUND`)
    const toShed = angleDiff(Math.atan2(HUT.x - p.x, HUT.z - p.z), yaw);
    const view = yaw + Math.max(-VIEW_ROUND, Math.min(VIEW_ROUND, toShed));
    const side = toShed >= 0 ? 1 : -1;
    return {
      id,
      p,
      spec,
      yaw,
      lx: p.lx,
      lz: p.lz,
      tx: -p.lz,
      tz: p.lx,
      feet,
      hands,
      lastStub,
      sTop,
      tube: { x: tube.x, y: tube.y, z: tube.z, top: tube.top },
      turn: hash3(p.seed, 1, 17, 9431) * Math.PI * 2,
      view,
      side,
    };
  });
}

/** His feet's middle on the ladder at height `h` (m over the palm's foot), swaying with the palm (world). */
function rootAt(l: Ladder, h: number, out: Vector3): Vector3 {
  const R = poleOut(l.p, h + REF_UP) + PZ_BU * unit();
  palmBend(l.spec, h + 1.2, _b);
  return out.set(l.p.x + l.lx * R + _b.x, l.p.y + h, l.p.z + l.lz * R + _b.z);
}

/** A point of the ladder (`h` m up, `q` across: + his left, `o` out from the pole's middle) in his body space with his feet `sv` m up (BU). */
function onLadder(l: Ladder, sv: number, h: number, q: number, o: number, out: Vector3): Vector3 {
  const u = unit();
  const R = poleOut(l.p, sv + REF_UP) + PZ_BU * u;
  palmBend(l.spec, h, _b);
  palmBend(l.spec, sv + 1.2, _b2);
  const bx = _b.x - _b2.x;
  const bz = _b.z - _b2.z;
  return out.set((q + bx * l.tx + bz * l.tz) / u, (h - sv) / u, (R - poleOut(l.p, Math.max(-0.1, h)) - o - (bx * l.lx + bz * l.lz)) / u);
}

/** A world point in his body space (BU). */
function toBody(x: number, y: number, z: number, out: Vector3): Vector3 {
  const b = env!.body;
  const u = unit();
  const dx = x - b.pos.x;
  const dz = z - b.pos.z;
  const c = Math.cos(b.yaw);
  const sn = Math.sin(b.yaw);
  return out.set((dx * c - dz * sn) / u, (y - b.pos.y) / u, (dx * sn + dz * c) / u);
}

/** Where he steps off at the ladder's foot (on the ground). */
function standSpot(l: Ladder, out: Vector3): Vector3 {
  const R = poleOut(l.p, REF_UP) + PZ_BU * unit() + STEP_BACK;
  const x = l.p.x + l.lx * R;
  const z = l.p.z + l.lz * R;
  const w = env!.world;
  const g = w.standAt?.(x, z, l.p.y + 1, 2, 2.3);
  return out.set(x, g !== undefined && Number.isFinite(g) ? g : w.groundAt(x, z), z);
}

/**
 * The four limbs for feet `sv` m up (the ladder's cycle; near the crossbar
 * they settle there, the fists on the pole). A step and a grip sound as a
 * limb comes onto a new stub (not `quiet`).
 */
const SIDES = ['L', 'R'] as const;
function limbs(l: Ladder, sv: number, quiet: boolean): void {
  const top = smooth((sv - (l.sTop - 0.3)) / 0.3);
  for (const side of SIDES) {
    const sg = side === 'L' ? 1 : -1;
    // A foot: on its stub, or on its way up (or down) to the next, out from the ladder and a little higher between.
    const fH = l.feet[side];
    const f = limbAt(fH, sv, LEAVE_FOOT, SWING_FOOT);
    const fa = fH[f.a];
    const fb = fH[Math.min(f.a + 1, fH.length - 1)];
    const arc = Math.sin(Math.PI * f.u);
    const fh = Math.max(0, fa + (fb - fa) * smooth(f.u)) + 0.05 * arc;
    const foot = side === 'L' ? pose.footL : pose.footR;
    onLadder(l, sv, fh, sg * FOOT_OUT, 0.01 + 0.1 * arc, foot);
    if (top > 0) foot.lerp(onLadder(l, sv, l.sTop, sg * FOOT_OUT, 0.03, _v), top);
    if (side === 'L') pose.liftL = arc * (1 - top);
    else pose.liftR = arc * (1 - top);
    const fKey = side === 'L' ? 'fL' : 'fR';
    if (f.u === 0) {
      if (f.a !== lastOn[fKey] && lastOn[fKey] >= 0 && !quiet) {
        SFX.play('palmStep', 0.45 + Math.min(0.55, Math.abs(vel)));
        pad.rumble('tick', 0.25);
      }
      lastOn[fKey] = f.a;
    }
    // A fist: on its stub (the bare pole over the last), on its way to the next.
    const hH = l.hands[side];
    const h = limbAt(hH, sv, LEAVE_HAND, SWING_HAND);
    const ha = hH[h.a];
    const hb = hH[Math.min(h.a + 1, hH.length - 1)];
    const harc = Math.sin(Math.PI * h.u);
    const hy = ha + (hb - ha) * smooth(h.u);
    const onPole = hy > l.lastStub[side] + 0.05;
    const hand = side === 'L' ? pose.handL : pose.handR;
    onLadder(l, sv, hy - STUB_HALF + 0.012 + 0.06 * harc, sg * (onPole ? POLE_HAND : HAND_OUT), 0.08 * harc, hand);
    // (at the top: the left fist high on the pole, the right lower: he stands on the crossbar holding on)
    if (top > 0) hand.lerp(onLadder(l, sv, l.sTop + (side === 'L' ? 1.4 : 1.16), sg * POLE_HAND, 0, _v), top);
    const hKey = side === 'L' ? 'hL' : 'hR';
    if (h.u === 0) {
      if (h.a !== lastOn[hKey] && lastOn[hKey] >= 0 && !quiet && top < 0.5) SFX.play('palmGrip', 0.4 + Math.min(0.6, Math.abs(vel)));
      lastOn[hKey] = h.a;
    }
  }
  pose.lean = 1 - 0.1 * top;
}

/** Where he comes to rest from `sv` going `v` (m/s; 0: the nearest): all four on stubs (`REST`), or the crossbar near the top. */
function restPoint(l: Ladder, sv: number, v: number): number {
  const top = l.sTop - 0.3;
  if (sv > top && v >= 0) return l.sTop;
  let below = S_MIN;
  let above = l.sTop;
  for (let k = 0; ; k++) {
    let past = false;
    for (const r of REST) {
      const g = r + 2 * RUNG * k;
      if (g > top) {
        past = true;
        break;
      }
      if (g <= sv + 1e-4) below = g;
      else if (g < above) above = g;
    }
    if (past) break;
  }
  if (v > 0.02) return above;
  if (v < -0.02) return below;
  return sv - below < above - sv ? below : above;
}

/** The tube he swaps (on the stalk, swaying with the palm): its middle now (world). */
function tubeSpot(l: Ladder, out: Vector3): Vector3 {
  palmBend(l.spec, l.tube.top - l.p.y, _b);
  return out.set(l.tube.x + _b.x, l.tube.y, l.tube.z + _b.z);
}

/** The work day now (one starts in the blue hour, when the family comes out: `psWorking`). */
const workDay = () => Math.floor(TIME.days() - 0.69);

/** Is this palm's tube full (he has not changed it this work day, nor lately)? */
function isFull(id: string): boolean {
  const c = changed.get(id);
  return !c || (c.day !== workDay() && roamT - c.t > 20) || roamT - c.t > REFILL;
}

/** Can he swap the tube at the top now? Why not, when not. */
function swapCheck(l: Ladder): 'ok' | 'night' | 'notFull' | 'done' {
  if (full) return 'done';
  if (!psWorking(dayClock)) return 'night';
  if (!isFull(l.id)) return 'notFull';
  return 'ok';
}

/** The prompts, made once a language (asked every step). */
const prompts = { climb: '', busy: '', storm: '', swap: '', bottom: '', low: '', wait: '' };
function makePrompts(): void {
  prompts.climb = `E  ${t('palmClimb')}`;
  prompts.busy = t('palmBusy');
  prompts.storm = t('palmStorm');
  prompts.swap = `E  ${t('palmSwap')}`;
  prompts.bottom = `E  ${t('palmOff')}  ·  Space  ${t('palmJump')}`;
  prompts.low = `Space  ${t('palmJump')}`;
  prompts.wait = t('palmWait');
}

/** The yard ladder whose foot he stands at (feet x, y, z), or null. */
function ladderAt(x: number, y: number, z: number): Ladder | null {
  let best: Ladder | null = null;
  let bd = REACH;
  for (const l of ladders) {
    const R = poleOut(l.p, REF_UP) + PZ_BU * unit() + 0.25;
    const d = Math.hypot(x - (l.p.x + l.lx * R), z - (l.p.z + l.lz * R));
    if (d < bd && Math.abs(y - l.p.y) < RISE) {
      bd = d;
      best = l;
    }
  }
  return best;
}

// ── Getting on and off ──────────────────────────────────────────────────────

/** His hat off (on the ladder) or on again (at its foot), as the rest and the prayer do. */
function setHat(on: boolean): void {
  const e = env!;
  if (e.explorer.currentOutfit.hat === on) return;
  e.explorer.setOutfit({ hat: on });
  e.photo.refreshBody();
}

/** Back on his feet at the ladder's foot: his hat on again if it was. */
function hatBack(): void {
  if (hatBefore) setHat(true);
  hatBefore = false;
}

/** Onto ladder `l` from where he stands. */
function getOn(ctx: RoamCtx, l: Ladder): void {
  const e = env!;
  hatBefore = e.explorer.currentOutfit.hat;
  setHat(false);
  L = l;
  state = 'on';
  st = 0;
  s = S_MIN;
  vel = 0;
  goal = Number.NaN;
  dir = 0;
  still = 0;
  full = false;
  jumped = false;
  said.night = said.notFull = false;
  from.copy(ctx.body.pos);
  yawFrom = ctx.body.yaw;
  yawTo = l.yaw;
  lastOn.fL = lastOn.fR = lastOn.hL = lastOn.hR = -1;
  limbs(l, s, true);
  pose.lookYaw = pose.lookPitch = 0;
  followBefore = ctx.cam.follow;
  ctx.cam.follow = 0;
  camMoment = '';
  camMine = false;
  e.explorer.animator.posture = climbPosture;
  e.explorer.animator.postureFeet = false;
  // (the clean tube on his belt at the back: he brought it for the swap)
  if (swapCheck(l) === 'ok') tubeEmpty!.toBelt(ctx.body.scale);
  PALM_CLIMB.climbs++;
  PALM_CLIMB.top = false;
  standSpot(l, _w);
  const h = PALM_CLIMB.stand;
  h.x = _w.x;
  h.y = _w.y;
  h.z = _w.z;
  h.ox = l.lx;
  h.oz = l.lz;
  SFX.play('palmGrip', 0.6);
  if (!said.keys && !e.shot) {
    said.keys = true;
    const touch = document.body.classList.contains('roam-touch');
    e.hud.toast(t(pad.active || touch ? 'palmKeysStick' : 'palmKeys'));
  }
}

/** Off at the foot (`jump`: pushed off from the lowest rungs; the walk lands him). */
function getOff(ctx: RoamCtx, jump: boolean): void {
  const e = env!;
  e.explorer.animator.posture = null;
  e.explorer.animator.postureFeet = true;
  if (jump) {
    const l = L!;
    ctx.body.vel.set(l.lx * 2.6, 4.2, l.lz * 2.6);
    ctx.body.grounded = false;
    ctx.sound('jump', 0.7);
    jumped = full;
    hatBack();
    release(ctx);
    return;
  }
  state = 'off';
  st = 0;
  from.copy(ctx.body.pos);
  standSpot(L!, to);
  yawFrom = ctx.body.yaw;
  // (with the full tube he turns round to the cook as he steps down; else he stays facing the palm)
  yawTo = full ? L!.yaw + Math.PI : L!.yaw;
  handSide = clearSide(ctx, to, yawTo);
  SFX.play('palmStep', 0.5);
}

/** Waiting at the foot with the full tube for the cook. */
function startWait(ctx: RoamCtx): void {
  if (state !== 'off') handSide = clearSide(ctx, ctx.body.pos, ctx.body.yaw);
  state = 'wait';
  st = 0;
  seenFor = 0;
  const h = PALM_CLIMB.hand;
  h.on = true;
  h.t = -1;
  h.x = ctx.body.pos.x;
  h.y = ctx.body.pos.y;
  h.z = ctx.body.pos.z;
}

// ── The key help (bottom left) and the touch Jump button while it holds him ──

const LOOK: AddonKey = ['Q R', 'rLook', 'rstick'];
const KEYS = {
  climb: [['W S', 'palmKeyClimb', 'lstick'], ['Shift', 'palmKeyQuick', 'r2'], LOOK],
  low: [['W S', 'palmKeyClimb', 'lstick'], ['Shift', 'palmKeyQuick', 'r2'], ['Space', 'palmJump', 'south'], LOOK],
  bottom: [['W', 'palmClimb', 'lstick'], ['E S', 'palmOff', 'west'], ['Space', 'palmJump', 'south'], LOOK],
  topSwap: [['S', 'palmKeyDown', 'lstick'], ['E', 'palmSwap', 'west'], ['4 5', 'rPhoto', 'dpadx'], LOOK],
  top: [['S', 'palmKeyDown', 'lstick'], ['4 5', 'rPhoto', 'dpadx'], LOOK],
  busy: [LOOK],
} satisfies Record<string, readonly AddonKey[]>;

/** The key help's lines for where he is now (one of the kept lists: the hud compares them). */
function keysNow(): readonly AddonKey[] {
  if (state !== 'climb' || !L) return KEYS.busy;
  if (s >= L.sTop - 0.005) return swapCheck(L) === 'ok' ? KEYS.topSwap : KEYS.top;
  if (s <= S_MIN + 0.005) return KEYS.bottom;
  return s < JUMP_MAX ? KEYS.low : KEYS.climb;
}

/** What the touch Jump button says now (Space jumps off only from the lowest rungs; else it is hidden). */
let jumpShown: 'palmJump' | 'hide' | null = null;
function showJump(k: 'palmJump' | 'hide' | null): void {
  if (k === jumpShown) return;
  jumpShown = k;
  touchJump(k);
}

/** The ladder lets him go: the walk has him again. */
function release(ctx: RoamCtx): void {
  showJump(null);
  state = 'idle';
  ctx.cam.follow = followBefore;
  PALM_CLIMB.palm = null;
  PALM_CLIMB.top = false;
  PALM_CLIMB.hand.on = false;
  PALM_CLIMB.warp = false;
  give.k = 0;
  if (!full) tubeEmpty?.hide();
}

/** The hand-over is over (or nobody came): he walks on, the tube is the family's. */
function finish(ctx: RoamCtx): void {
  full = false;
  tubeFull?.hide();
  release(ctx);
}

/** All off at once, nothing left behind (back to the map, another mode). */
function stopAll(ctx: RoamCtx | null): void {
  const e = env;
  if (!e) return;
  if (state !== 'idle') {
    e.explorer.animator.posture = null;
    e.explorer.animator.postureFeet = true;
    if (state === 'hand' || state === 'drink') {
      if (e.explorer.currentAction === 'drink') e.explorer.stop('drink');
      e.explorer.holdFood(null);
    }
    if (ctx) {
      // (off the ladder: on the ground at its foot)
      if (L && (state === 'on' || state === 'climb' || state === 'swap' || state === 'off')) standSpot(L, ctx.body.pos);
      ctx.body.vel.set(0, 0, 0);
      ctx.body.grounded = true;
      ctx.cam.follow = followBefore;
    }
  }
  if (state === 'on' || state === 'climb' || state === 'swap' || state === 'off') hatBack();
  if (state !== 'idle') showJump(null);
  state = 'idle';
  full = false;
  jumped = false;
  carried = false;
  tubeFull?.hide();
  tubeEmpty?.hide();
  tubeCook?.hide();
  PALM_CLIMB.palm = null;
  PALM_CLIMB.top = false;
  PALM_CLIMB.hand.on = false;
  PALM_CLIMB.warp = false;
}

// ── The camera ──────────────────────────────────────────────────────────────

/** The hand-over is framed from his side: which (±1, round to his left or right), the one with nothing solid between. */
let handSide = 1;
const HAND_VIEW = { side: 1.3, pitch: 0.2, distance: 6.2 };

/** The side (±1) from which the camera sees him and the cook in profile with nothing solid between (his feet at `p`, facing `yaw`). */
function clearSide(ctx: RoamCtx, p: Vector3, yaw: number): number {
  const w = ctx.world;
  const hard = w.hardClearance ?? w.clearance;
  if (!hard) return 1;
  const fy = p.y + 1.25 * (ctx.body.scale / 1.4);
  let best = 1;
  let bestFree = -1;
  for (const sg of [1, -1]) {
    const a = yaw + sg * HAND_VIEW.side;
    const d = HAND_VIEW.distance + 1;
    const cp = Math.cos(HAND_VIEW.pitch);
    // (and a little to either side of it, as the follow camera looks)
    let free = 1;
    for (const k of [0, 1, -1]) {
      const x = p.x - Math.sin(a) * cp * d + Math.cos(a) * 0.6 * k;
      const z = p.z - Math.cos(a) * cp * d - Math.sin(a) * 0.6 * k;
      free = Math.min(free, hard(p.x, fy, p.z, x, fy + Math.sin(HAND_VIEW.pitch) * d, z));
    }
    if (free > bestFree + 0.02) {
      bestFree = free;
      best = sg;
    }
  }
  return best;
}

/**
 * The moment the camera is framed for (climbing, the view from the top, the swap, the hand-over): once the player
 * turns or zooms the camera in one, it is theirs until the next.
 */
let camMoment = '';
let camMine = false;

/** The camera eases to this framing (yaw, pitch, distance) unless the player has taken it this moment. */
function frameCam(ctx: RoamCtx, dt: number, yaw: number, pitch: number, dist: number, rate = 1.6): void {
  if (camMine) return;
  const k = 1 - Math.exp(-rate * dt);
  const c = ctx.cam;
  c.yaw += angleDiff(yaw, c.yaw) * k;
  c.pitch += (pitch - c.pitch) * k;
  c.distance += (Math.min(c.maxDistance, dist) - c.distance) * k;
}

/** The framing of each moment: round his side and out as he climbs, back and up over the view at the top once he stops. */
function stepCam(ctx: RoamCtx, dt: number): void {
  const l = L!;
  const k = Math.min(1, Math.max(0, (s - S_MIN) / (l.sTop - S_MIN)));
  const moment = state === 'on' || state === 'climb' ? (s >= l.sTop - 0.01 && still > 0.6 ? 'view' : 'climb') : state === 'swap' ? 'swap' : 'hand';
  if (moment !== camMoment) {
    camMoment = moment;
    camMine = false;
  }
  switch (state) {
    case 'on':
    case 'climb':
      if (s >= l.sTop - 0.01 && still > 0.6) frameCam(ctx, dt, l.view, 0.36, 15, 0.9);
      else frameCam(ctx, dt, l.yaw + l.side * 0.7, 0.16 + 0.2 * k, 6.5 + 6 * k);
      break;
    case 'swap':
      // (round to his right, where the tube hangs)
      frameCam(ctx, dt, l.yaw + 0.95, 0.18, 6.8, 1.4);
      break;
    case 'off':
    case 'wait':
    case 'hand':
    case 'drink':
      // (him and the cook in profile, from the side nothing stands on)
      frameCam(ctx, dt, ctx.body.yaw + handSide * HAND_VIEW.side, HAND_VIEW.pitch, HAND_VIEW.distance, 1.5);
      break;
    default:
      break;
  }
}

/** The camera where the framing eases to, at once (a shot put him there). */
function frameNow(ctx: RoamCtx): void {
  camMine = false;
  for (let i = 0; i < 40; i++) stepCam(ctx, 0.25);
}

// ── Each step while he is on the ladder (or at its foot with the tube) ─────

function hold(ctx: RoamCtx, dt: number): AddonHold {
  const e = env!;
  const l = L!;
  const { body, input, cam } = ctx;
  clock += dt;
  st += dt;
  pose.t = clock;
  cam.turn(input.lookYaw, input.lookPitch, input.zoom);
  if (input.lookYaw || input.lookPitch || input.zoom) camMine = true;
  let prompt: string | null = null;
  switch (state) {
    case 'on': {
      // A step up onto the first stubs, turning to the trunk.
      const k = smooth(st / ON);
      rootAt(l, s, _v);
      body.pos.lerpVectors(from, _v, k);
      body.pos.y += Math.sin(Math.PI * k) * 0.12;
      body.yaw = yawFrom + angleDiff(yawTo, yawFrom) * k;
      limbs(l, s, true);
      if (st >= ON) state = 'climb';
      break;
    }
    case 'climb': {
      const want = input.move.y;
      const target = want > 0.2 ? UP * Math.min(1, want) * (input.run ? QUICK : 1) : want < -0.2 ? -DOWN * Math.min(1, -want) * (input.run ? QUICK : 1) : 0;
      if (target !== 0) {
        goal = NaN;
        vel += (target - vel) * (1 - Math.exp(-EASE * dt));
      } else {
        // Let go: he finishes the step he is in (on to where all four are on stubs, the way he was going).
        if (Number.isNaN(goal)) goal = restPoint(l, s, vel);
        const d = goal - s;
        vel += (Math.max(-SETTLE_V, Math.min(SETTLE_V, d * SETTLE_K)) - vel) * (1 - Math.exp(-EASE * dt));
        if (Math.abs(d) < 0.002 && Math.abs(vel) < 0.02) {
          s = goal;
          vel = 0;
        }
      }
      s += vel * dt;
      if (s >= l.sTop) {
        s = l.sTop;
        vel = Math.min(0, vel);
      }
      if (s <= S_MIN) {
        s = S_MIN;
        vel = Math.max(0, vel);
      }
      const atTop = s >= l.sTop - 0.005;
      const atBottom = s <= S_MIN + 0.005;
      still = Math.abs(vel) < 0.05 ? still + dt : 0;
      dir += ((vel > 0.05 ? 1 : vel < -0.05 ? -1 : 0) - dir) * (1 - Math.exp(-4 * dt));
      pose.dir = dir;
      // Up there: why there is no swap (said once a climb).
      if (atTop && !PALM_CLIMB.top) {
        PALM_CLIMB.top = true;
        const why = swapCheck(l);
        if (why === 'night' && !said.night) {
          said.night = true;
          e.hud.toast(t('palmNight'));
        } else if (why === 'notFull' && !said.notFull) {
          said.notFull = true;
          e.hud.toast(t('palmNotFull'));
        }
      } else if (s < l.sTop - 0.4) PALM_CLIMB.top = false;
      if (atTop && swapCheck(l) === 'ok') {
        prompt = prompts.swap;
        if (input.use) {
          state = 'swap';
          st = 0;
          lastSwap = -1;
          // (the clean tube on his belt, if he got on before the family was out)
          if (tubeEmpty!.place !== 'belt') tubeEmpty!.toBelt(body.scale);
          SFX.play('palmCreak', 0.6);
        }
      } else if (atBottom) {
        prompt = prompts.bottom;
        if (input.use || (want < -0.3 && vel <= 0.01)) {
          getOff(ctx, false);
          break;
        }
      } else if (s < JUMP_MAX) prompt = prompts.low;
      if (state !== 'climb') break;
      if (input.jump) {
        if (s < JUMP_MAX) {
          getOff(ctx, true);
          body.explorer.setMotion(0, false, 4);
          return { prompt: null };
        }
        if (clock - said.high > 4) {
          said.high = clock;
          e.hud.toast(t('palmTooHigh'));
        }
      }
      // The old bamboo creaks now and then as he climbs (the higher, the louder); the full tube sloshes.
      if (Math.abs(vel) > 0.1) {
        creakIn -= dt;
        if (creakIn <= 0) {
          SFX.play('palmCreak', 0.4 + 0.5 * (s / l.sTop));
          creakIn = 2.2 + 3 * hash3(Math.floor(clock * 10), 3, 1, 9701);
        }
        if (full) {
          sloshIn -= dt;
          if (sloshIn <= 0) {
            SFX.play('palmSlosh', 0.5);
            sloshIn = 1.1 + 1.4 * hash3(Math.floor(clock * 10), 5, 2, 9702);
          }
        }
      }
      rootAt(l, s, body.pos);
      body.yaw = l.yaw;
      limbs(l, s, false);
      // (at the top, standing: he looks out over the view, where the camera looks (the player's turn too), slowly round)
      const out = atTop && still > 0.4 ? smooth((still - 0.4) / 1.2) : 0;
      const away = Math.max(-LOOK_MAX, Math.min(LOOK_MAX, angleDiff(cam.yaw, l.yaw) + 0.2 * Math.sin(clock * 0.23)));
      pose.lookYaw += (out * away - pose.lookYaw) * (1 - Math.exp(-3 * dt));
      pose.lookPitch += (out * (0.1 + 0.05 * Math.sin(clock * 0.31)) - pose.lookPitch) * (1 - Math.exp(-3 * dt));
      break;
    }
    case 'swap': {
      rootAt(l, s, body.pos);
      body.yaw = l.yaw;
      limbs(l, s, true);
      pose.dir += (0 - pose.dir) * (1 - Math.exp(-4 * dt));
      swapStep(ctx, l);
      if (st >= SWAP.back) {
        state = 'climb';
        still = 0;
      }
      break;
    }
    case 'off': {
      const k = smooth(st / OFF);
      body.pos.lerpVectors(from, to, k);
      body.pos.y += Math.sin(Math.PI * k) * 0.18;
      body.yaw = yawFrom + angleDiff(yawTo, yawFrom) * k;
      if (st >= OFF) {
        body.pos.copy(to);
        body.grounded = true;
        ctx.sound('land', 0.25);
        hatBack();
        if (full) startWait(ctx);
        else {
          release(ctx);
          body.explorer.setMotion(0, true, 0);
          return { prompt: null };
        }
      }
      break;
    }
    case 'wait': {
      // With the full tube, for the cook: he turns to her as she comes.
      const c = PALM_CLIMB.cook;
      if (c.state !== 'none') body.yaw += angleDiff(Math.atan2(c.x - body.pos.x, c.z - body.pos.z), body.yaw) * (1 - Math.exp(-5 * dt));
      prompt = prompts.wait;
      // (nobody to take it: the family's part is not running — or she never comes)
      if (PALM_CLIMB.seen !== seenWas) {
        seenWas = PALM_CLIMB.seen;
        seenFor = 0;
      } else seenFor += dt;
      if (c.state === 'ready') {
        state = 'hand';
        st = 0;
        give.k = 0;
        e.explorer.animator.posture = givePosture;
        e.explorer.animator.postureFeet = true;
      } else if (!ctx.shot && (seenFor > NOBODY || st > WAIT_MAX || (c.state === 'none' && st > NOT_COMING))) {
        finish(ctx);
        return { prompt: null };
      }
      break;
    }
    case 'hand': {
      const c = PALM_CLIMB.cook;
      if (c.state !== 'none') body.yaw += angleDiff(Math.atan2(c.x - body.pos.x, c.z - body.pos.z), body.yaw) * (1 - Math.exp(-6 * dt));
      PALM_CLIMB.hand.t = st;
      handStep(ctx);
      if (state !== 'hand') return { prompt: null };
      break;
    }
    case 'drink': {
      // The bag full: he drinks it here, a sip at each of the meal's sips, a satisfied breath, then "So refreshing!".
      const m = MEAL.drink;
      while (sips < m.sips.length && st >= m.sips[sips]) {
        sips++;
        ctx.sound('sip', 0.75);
      }
      if (!ahh && st >= m.ahh) {
        ahh = true;
        ctx.sound('ahh', 0.8);
      }
      if (st > 0.15 && e.explorer.currentAction !== 'drink') {
        e.explorer.holdFood(null);
        e.purse.taste(JUICE.id);
        bubble ??= new Bubble();
        bubble.say('byFresh', headAt, 2.6);
        talkLeft = 3.6;
        finish(ctx);
        return { prompt: null };
      }
      break;
    }
    default:
      break;
  }
  if (state === 'idle') return { prompt: null };
  // The camera at his chest, framed for the moment.
  cam.focus.set(body.pos.x, body.pos.y + 1.25 * (body.scale / 1.4), body.pos.z);
  cam.behindYaw = body.yaw;
  stepCam(ctx, dt);
  const onIt = state === 'on' || state === 'climb' || state === 'swap';
  // (H on the ladder: it goes back on at the foot)
  if (onIt && e.explorer.currentOutfit.hat) {
    hatBefore = true;
    setHat(false);
  }
  body.vel.set(0, state === 'climb' ? vel : 0, 0);
  // (on the ladder he is off the ground; standing on the crossbar at the top he may take out the camera or the phone)
  body.grounded = !onIt || (state === 'climb' && s >= l.sTop - 0.01 && still > 0.3);
  body.explorer.setMotion(0, true, 0);
  // What the family sees of him.
  const h = PALM_CLIMB;
  h.palm = onIt ? l.id : null;
  h.s = s;
  h.head.x = body.pos.x;
  h.head.y = body.pos.y + 2.35 * (body.scale / 1.4);
  h.head.z = body.pos.z;
  const k = keysNow();
  showJump(k === KEYS.low || k === KEYS.bottom ? 'palmJump' : 'hide');
  return { prompt: e.photo.kind || e.photo.albumOpen ? null : prompt };
}

/** The right hand from `a` to `b` (body space), `u` of the way, out a little from the trunk on the way (clear of his body and the pole). */
function seg(a: Vector3, b: Vector3, u: number, arc: number): void {
  pose.handR.lerpVectors(a, b, smooth(u));
  pose.handR.z -= Math.sin(Math.PI * Math.min(1, Math.max(0, u))) * arc;
}

/** The swap: his right hand and the two tubes (see `SWAP`). */
function swapStep(ctx: RoamCtx, l: Ladder): void {
  const T = st;
  // Where the hand goes in each part (body space): the clean tube at his back, the stalk, his belt's side, the pole.
  _rest.copy(pose.handR);
  palmBeltPoint(pose, BELT_EMPTY, _a);
  palmBeltPoint(pose, BELT_FULL, _c);
  tubeSpot(l, _w);
  toBody(_w.x, _w.y + HANG, _w.z, _d);
  if (T < SWAP.belt) seg(_rest, _a, T / SWAP.belt, 1.5);
  else if (T < SWAP.stalk) seg(_a, _d, (T - SWAP.belt) / (SWAP.stalk - SWAP.belt), 2.5);
  else if (T < SWAP.hold) {
    pose.handR.copy(_d);
    // (a little wiggle: the tube's cord untied from the stalk, the other's tied on)
    pose.handR.y += 0.25 * Math.sin((T - SWAP.stalk) * 40) * (1 - (T - SWAP.stalk) / (SWAP.hold - SWAP.stalk));
  } else if (T < SWAP.down) seg(_d, _c, (T - SWAP.hold) / (SWAP.down - SWAP.hold), 2.2);
  else seg(_c, _rest, (T - SWAP.down) / (SWAP.back - SWAP.down), 1.5);
  // The tubes, as the hand passes their moments (each once).
  const passed = (m: number) => T >= m && lastSwap < m;
  if (passed(SWAP.belt)) {
    tubeEmpty!.toWorld();
    SFX.play('palmTube', 0.4);
  }
  if (passed(SWAP.swap)) {
    // The exchange: the clean one is on the stalk now (the palm's own shows), the full one in his hand.
    tubeEmpty!.hide();
    full = true;
    changed.set(l.id, { day: workDay(), t: roamT });
    PALM_CLIMB.swaps++;
    PALM_CLIMB.swapPalm = l.id;
    SFX.play('palmTube', 0.8);
    SFX.play('palmSlosh', 0.7);
    pad.rumble('tick', 0.4);
  }
  if (passed(SWAP.down)) {
    tubeFull!.toBelt(ctx.body.scale);
    SFX.play('palmTube', 0.6);
    SFX.play('palmSlosh', 0.6);
  }
  lastSwap = T;
  // He watches his hand.
  pose.lookYaw = Math.max(-1.2, Math.min(1.2, Math.atan2(pose.handR.x, Math.max(0.5, pose.handR.z)))) * 0.8;
  pose.lookPitch = Math.max(-0.4, Math.min(0.5, -(pose.handR.y - 22) / 14));
}

/** The hand-over (see `HAND`): his arms out with the tube and back down, the cup into his hands, then his bag. */
function handStep(ctx: RoamCtx): void {
  const e = env!;
  give.t = clock;
  give.k = st < HAND.taken ? Math.min(1, st / HAND.out) : Math.max(0, 1 - (st - HAND.taken) / 0.4);
  if (st >= HAND.taken) carried = true;
  if (st >= HAND.taken + 0.45 && e.explorer.animator.posture === givePosture) e.explorer.animator.posture = null;
  if (st >= HAND.got && st < HAND.bag && !e.explorer.foodHeld) e.explorer.holdFood(JUICE.consume, JUICE.colors);
  if (st < HAND.bag) return;
  // Into his bag; the bag full, he drinks it here.
  if (e.purse.keep(JUICE)) {
    e.explorer.holdFood(null);
    e.hud.toast(t('byKept', { name: nameOf(JUICE), n: num(e.purse.kept.length), max: num(CARRY_MAX) }));
    finish(ctx);
    return;
  }
  e.hud.toast(t('byBagFull'));
  full = false;
  tubeFull?.hide();
  PALM_CLIMB.hand.on = false;
  state = 'drink';
  st = 0;
  sips = 0;
  ahh = false;
  e.explorer.play('drink');
}

const headAt = (): Point => {
  const b = env!.body;
  head.x = b.pos.x;
  head.y = b.pos.y + 2.75 * (b.scale / 1.4);
  head.z = b.pos.z;
  return head;
};

// ── The tubes in the world, every frame ────────────────────────────────────

const yawQ = (y: number) => _q.setFromAxisAngle(_up, y);

function placeTubes(): void {
  const e = env!;
  const l = L;
  const ex = e.explorer;
  // The full tube: on the stalk while he is on that palm and it is full; in his hand; held out in both.
  if (tubeFull) {
    if (l && (state === 'on' || state === 'climb' || (state === 'swap' && st < SWAP.swap)) && !full && swapCheck(l) === 'ok') {
      const g = tubeFull.toWorld();
      tubeSpot(l, g.position);
      g.quaternion.copy(yawQ(l.turn));
    } else if (state === 'swap' && st >= SWAP.swap && st < SWAP.down) {
      const g = tubeFull.toWorld();
      ex.rig.joints.propR.getWorldPosition(g.position).y -= HANG;
      g.quaternion.copy(yawQ(e.body.yaw));
    } else if (state === 'hand' && st < HAND.taken) {
      // From his belt into both his hands, held out.
      const g = tubeFull.toWorld();
      ex.rig.joints.hips.updateWorldMatrix(true, false);
      ex.rig.joints.hips.localToWorld(_v.copy(BELT_FULL));
      _v.y -= HANG;
      ex.rig.joints.propR.getWorldPosition(_w);
      ex.rig.joints.propL.getWorldPosition(_a);
      _w.lerp(_a, 0.5);
      g.position.lerpVectors(_v, _w, smooth(st / 0.3));
      g.quaternion.copy(yawQ(e.body.yaw));
    } else if (tubeFull.place === 'world' && state !== 'swap') tubeFull.hide();
  }
  // The clean tube in his hand during the swap (once on the stalk, the palm's own shows).
  if (tubeEmpty && l && state === 'swap' && st >= SWAP.belt && st < SWAP.swap) {
    const g = tubeEmpty.toWorld();
    ex.rig.joints.propR.getWorldPosition(g.position).y -= HANG;
    g.quaternion.copy(yawQ(st > SWAP.stalk ? l.turn : e.body.yaw));
  }
  // The one the cook took: in her hands, tucked in her waist on her way back, tipped over the first wok as she pours it.
  if (tubeCook) {
    const c = PALM_CLIMB.cook;
    if (!carried || (state !== 'hand' && c.state !== 'ready' && c.state !== 'back' && c.state !== 'pour')) {
      carried = false;
      if (tubeCook.place !== 'off') tubeCook.hide();
      return;
    }
    const g = tubeCook.toWorld();
    if (c.state === 'pour') {
      g.position.set(c.hands.x, c.hands.y, c.hands.z);
      g.quaternion.copy(yawQ(c.yaw)).multiply(_q2.setFromAxisAngle(_x, 1.75));
    } else if (state === 'hand' && st < HAND.tuck) {
      g.position.set(c.hands.x, c.hands.y, c.hands.z);
      g.quaternion.copy(yawQ(c.yaw));
    } else {
      g.position.set(c.hip.x, c.hip.y, c.hip.z);
      g.quaternion.copy(yawQ(c.yaw));
    }
  }
}

// ── Registration ────────────────────────────────────────────────────────────

registerAddon({
  id: 'palm',
  get holding() {
    return state !== 'idle';
  },
  get handsBusy() {
    return state !== 'idle';
  },

  init(e) {
    env = e;
    ladders = makeLadders(e);
    makePrompts();
    onLang(makePrompts);
    tubeFull = new Tube(fullTube(), 'palmClimb:full', 'palmTubeFull', e, BELT_FULL);
    tubeEmpty = new Tube(emptyTube(), 'palmClimb:empty', 'palmTubeEmpty', e, BELT_EMPTY);
    tubeCook = new Tube(fullTube(), 'palmClimb:cook', 'palmTubeCook', e, null);
    // (checks on the dev server: the pose's targets, the state)
    if (import.meta.env.DEV) Object.assign(window, { __palmClimb: { env: e, pose, get state() { return state; }, get s() { return s; }, get ladder() { return L; } }, __palmHook: PALM_CLIMB });
  },

  offer(ctx, mode) {
    if (mode !== 'walk' || !env || env.busy() || state !== 'idle') return null;
    const p = ctx.body.pos;
    const l = ladderAt(p.x, p.y, p.z);
    if (!l) return null;
    if (PALM_CLIMB.tapperPalm === l.id) return prompts.busy;
    if ((ctx.weather?.storm ?? 0) > STORM) return prompts.storm;
    return prompts.climb;
  },

  use(ctx) {
    const p = ctx.body.pos;
    const l = ladderAt(p.x, p.y, p.z);
    if (!l || state !== 'idle' || PALM_CLIMB.tapperPalm === l.id || (ctx.weather?.storm ?? 0) > STORM) return;
    getOn(ctx, l);
  },

  hold,

  keys: keysNow,

  after(ctx, mode) {
    // Jumped off with the full tube: once he has landed, he waits for the cook with it.
    if (jumped && state === 'idle' && mode === 'walk' && ctx.body.grounded) {
      jumped = false;
      ctx.body.vel.set(0, 0, 0);
      followBefore = ctx.cam.follow;
      startWait(ctx);
    }
  },

  frame(f: MapFrame, mode) {
    dayClock = f.clock;
    if (f.dt > 0 && mode !== 'overview') roamT += f.dt;
    if (!env) return;
    placeTubes();
    if (bubble && talkLeft > 0) {
      talkLeft -= f.dt;
      bubble.update(f.dt, f.camera, mode !== 'overview');
    }
  },

  setMode(next, _prev, ctx) {
    if (next !== 'walk') stopAll(ctx);
  },

  fromUrl(q, ctx) {
    const v = q.get('palm');
    if (!v || !env) return;
    const id = q.get('palmtree');
    const p = ctx.body.pos;
    const near = (a: Ladder, b: Ladder) => (Math.hypot(b.p.x - p.x, b.p.z - p.z) < Math.hypot(a.p.x - p.x, a.p.z - p.z) ? b : a);
    const l = ladders.find((x) => x.id === id) ?? ladders.reduce(near);
    // (a shot without `sim=` settles 0.8 s after this: the times count it in)
    const settle = q.has('sim') ? 0 : 0.8;
    const [kind, arg] = v.split(':');
    const frac = (x: string | undefined) => Math.min(1, Math.max(0, Number(x) || 0));
    const swapped = () => {
      full = true;
      tubeEmpty!.hide();
      changed.set(l.id, { day: workDay(), t: roamT });
      PALM_CLIMB.swaps++;
      PALM_CLIMB.swapPalm = l.id;
    };
    standSpot(l, ctx.body.pos);
    getOn(ctx, l);
    state = 'climb';
    st = 0;
    PALM_CLIMB.warp = true;
    const setS = (x: number) => {
      s = x;
      rootAt(l, s, ctx.body.pos);
      ctx.body.yaw = l.yaw;
      lastOn.fL = lastOn.fR = lastOn.hL = lastOn.hR = -1;
      limbs(l, s, true);
    };
    if (kind === 'top') {
      setS(l.sTop);
      still = 2;
      PALM_CLIMB.top = true;
    } else if (kind === 'swap') {
      setS(l.sTop);
      state = 'swap';
      st = Math.max(0, (Number(arg) || 0) - settle);
      if (tubeEmpty!.place !== 'belt') tubeEmpty!.toBelt(ctx.body.scale);
      // (what the swap has done by then)
      if (st >= SWAP.swap) swapped();
      if (st >= SWAP.down) tubeFull!.toBelt(ctx.body.scale);
      lastSwap = st;
    } else if (kind === 'full') {
      swapped();
      setS(S_MIN + frac(arg) * (l.sTop - S_MIN));
      tubeFull!.toBelt(ctx.body.scale);
    } else if (kind === 'wait' || kind === 'give') {
      swapped();
      env.explorer.animator.posture = null;
      env.explorer.animator.postureFeet = true;
      standSpot(l, ctx.body.pos);
      ctx.body.yaw = l.yaw + Math.PI;
      ctx.body.grounded = true;
      startWait(ctx);
      seenFor = -3;
      if (kind === 'wait') tubeFull!.toBelt(ctx.body.scale);
      else {
        state = 'hand';
        st = Math.max(0, (Number(arg) || 0) - settle);
        PALM_CLIMB.hand.t = st;
        give.k = st < HAND.taken ? Math.min(1, st / HAND.out) : Math.max(0, 1 - (st - HAND.taken) / 0.4);
        if (st < HAND.taken + 0.45) {
          env.explorer.animator.posture = givePosture;
          env.explorer.animator.postureFeet = true;
        }
        if (st >= HAND.taken) carried = true;
        if (st >= HAND.got && st < HAND.bag) env.explorer.holdFood(JUICE.consume, JUICE.colors);
      }
    } else setS(S_MIN + frac(kind) * (l.sTop - S_MIN));
    // The camera: the URL's orbit round him as he now faces (roam.ts set it before he was turned), else the moment's framing.
    const rc = q.get('rcam')?.split(',').map(Number);
    if (rc) {
      // (the URL's camera stays for the shot: as if the player had set it)
      camMoment = 'climb';
      stepCam(ctx, 0);
      camMine = true;
      ctx.cam.yaw = ctx.body.yaw + ((rc[0] || 0) * Math.PI) / 180;
      ctx.cam.focus.set(ctx.body.pos.x, ctx.body.pos.y + 1.25 * (ctx.body.scale / 1.4), ctx.body.pos.z);
    } else frameNow(ctx);
  },

  report() {
    if (state === 'idle' || !L) return null;
    const k = ((s - S_MIN) / (L.sTop - S_MIN)).toFixed(3);
    const v =
      state === 'swap'
        ? `swap:${st.toFixed(2)}`
        : state === 'wait'
          ? 'wait'
          : state === 'hand' || state === 'drink'
            ? `give:${Math.min(st, HAND.bag - 0.1).toFixed(2)}`
            : full
              ? `full:${k}`
              : s >= L.sTop - 0.005
                ? 'top'
                : k;
    // (his hat is only off for the ladder: the shot puts it on, the climb takes it off again and gives it back at the foot)
    const hatHeld = hatBefore && (state === 'on' || state === 'climb' || state === 'swap' || state === 'off');
    return { palm: v, palmtree: L.id, ...(hatHeld ? { hat: '1' } : {}) };
  },
});
