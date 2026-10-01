import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { BIKE, pedalPitch } from '../../character/bike';
import { BODY_UNIT_M } from '../../world/scale';
import type { Things } from '../people/_things';

/**
 * A black Khmer town bicycle to ride (roam/_bike.ts), made of boxes like the
 * people's (people/_bicycle.ts) but sized for the explorer (character/bike.ts
 * `BIKE`: the saddle, the grips and the pedals are where his posture puts
 * his seat, his fists and his boots): a step-through frame with two curved
 * tubes, a sprung saddle, upright bars with a bell, a woven basket on the
 * front and a lamp under it (lit at night while he rides: a dynamo), a rack
 * over the back wheel with a red reflector, mudguards, a chain case, a side
 * stand. Its wheels turn with the way rolled, the cranks with his pedalling
 * (the pedals stay under his boots), the bars, the fork, the front wheel and
 * the basket with the steering, the stand flips up and down.
 *
 * Every box is a slot of a `Things` (the people's instanced boxes: one draw
 * for every bicycle, one more for the shadows), written only when it moves.
 * Built in metres at his roaming size (`m`), kept in his body units, placed
 * at his scale. ≈ 150 boxes.
 */

/** Metres at the roaming size → body units (as character/bike.ts). */
const m = (v: number) => v / (BODY_UNIT_M * 1.4);

const FRAME = 0x1c1c1e;
const STEEL = 0x9a9a9e;
const CHROME = 0xc4c4c8;
const TYRE = 0x1a1818;
const SADDLE = 0x2e2420;
const GRIP = 0x2a2a2a;
const BRASS = 0xc8b060;
const CANE = 0xb89a5a;
const CANE_DARK = 0x8a6a3a;
const CANE_RIM = 0x7a5a30;
const LENS = 0xfff0c8;

/** The parts that turn: the frame (0), the back wheel, the steering (bars, fork, basket, lamp), the front wheel (in the steering), the cranks, each pedal (on the cranks), the stand. */
const ROOT = 0;
const REAR = 1;
const STEER = 2;
const FRONT = 3;
const CRANK = 4;
const PEDAL_L = 5;
const PEDAL_R = 6;
const STAND = 7;
const PARENT = [-1, ROOT, ROOT, STEER, ROOT, CRANK, CRANK, ROOT];

/** Where the stand is hinged (BU): on the left chain stay behind the cranks. */
const STAND_AT = new Vector3(m(0.07), m(0.3), m(-0.08));
const STAND_LEN = m(0.32);
/** The stand folded up along the stay (rad, about x) and down, out to the left (rad, about z). */
const STAND_UP = 1.35;
const STAND_OUT = 0.32;

/** How the parts are turned this frame: the steering (rad, + to the left), the wheels' and the cranks' turns, the stand (0 up ‥ 1 down). */
export interface BikeTurns {
  steer: number;
  front: number;
  rear: number;
  crank: number;
  stand: number;
  /** The lamp's glow (0 off ‥ 1). */
  lamp: number;
}

interface Box {
  part: number;
  /** Its matrix in its part's space (from the part's pivot). */
  local: Matrix4;
  color: number;
}

const _q = new Quaternion();
const _e = new Euler();
const _v = new Vector3();
const _s = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const Z = new Vector3(0, 0, 1);
const STEER_AXIS = new Vector3(0, Math.cos(BIKE.rake), -Math.sin(BIKE.rake));

/** The boxes of a bicycle (`seed`: what it carries) and its parts' pivots (BU, at rest). */
function design(seed: number): { boxes: Box[]; pivots: Vector3[] } {
  const R = BIKE.wheel;
  const hubY = R;
  const pivots = [
    new Vector3(0, 0, 0),
    new Vector3(0, hubY, BIKE.rear),
    new Vector3(0, BIKE.headY, BIKE.headZ),
    new Vector3(0, hubY, BIKE.front),
    new Vector3(0, BIKE.bbY, BIKE.bbZ),
    new Vector3(BIKE.pedalX - m(0.05), BIKE.bbY + BIKE.crank, BIKE.bbZ),
    new Vector3(-BIKE.pedalX + m(0.05), BIKE.bbY - BIKE.crank, BIKE.bbZ),
    STAND_AT.clone(),
  ];
  const boxes: Box[] = [];
  /** A box: its middle and size (metres at the roaming size), turned (rad, applied y, x, z). */
  const box = (part: number, c: [number, number, number], size: [number, number, number], color: number, rot?: [number, number, number]) => {
    const p = pivots[part];
    const local = new Matrix4().compose(
      _v.set(m(c[0]) - p.x, m(c[1]) - p.y, m(c[2]) - p.z),
      rot ? _q.setFromEuler(_e.set(rot[0], rot[1], rot[2], 'YXZ')) : _q.identity(),
      _s.set(m(size[0]), m(size[1]), m(size[2])),
    );
    boxes.push({ part, local, color });
  };
  /** A tube from a to b (metres), `w` thick (`h` tall: a flat strip), on `part`. */
  const tube = (part: number, a: [number, number, number], b: [number, number, number], w: number, color: number, h = w) => {
    _a.set(...a);
    _b.set(...b);
    const len = _a.distanceTo(_b);
    const p = pivots[part];
    _q.setFromUnitVectors(Z, _v.subVectors(_b, _a).normalize());
    const local = new Matrix4().compose(
      _v.addVectors(_a, _b).multiplyScalar(0.5).set(m(_v.x) - p.x, m(_v.y) - p.y, m(_v.z) - p.z),
      _q,
      _s.set(m(w), m(h), m(len + w * 0.6)),
    );
    boxes.push({ part, local, color });
  };
  const toM = (bu: number) => bu * BODY_UNIT_M * 1.4;
  const r = toM(R);
  const rear = toM(BIKE.rear);
  const front = toM(BIKE.front);
  const bbY = toM(BIKE.bbY);
  const bbZ = toM(BIKE.bbZ);

  // ── The wheels: a black tyre ring, a bright rim inside it, spokes through the hub (they show the turn) ──
  for (const [part, z] of [[REAR, rear], [FRONT, front]] as const) {
    const n = 14;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rt = r - 0.024;
      box(part, [0, r + Math.cos(a) * rt, z + Math.sin(a) * rt], [0.05, 0.048, (2 * Math.PI * rt) / n + 0.012], TYRE, [a, 0, 0]);
    }
    for (let k = 0; k < 10; k++) {
      const a = ((k + 0.5) / 10) * Math.PI * 2;
      const rr = r - 0.06;
      box(part, [0, r + Math.cos(a) * rr, z + Math.sin(a) * rr], [0.022, 0.016, (2 * Math.PI * rr) / 10], CHROME, [a, 0, 0]);
    }
    for (let k = 0; k < 3; k++) box(part, [0, r, z], [0.008, 0.008, (r - 0.06) * 2], STEEL, [(k / 3) * Math.PI, 0, 0]);
    box(part, [0, r, z], [0.08, 0.05, 0.05], STEEL);
  }

  // ── Mudguards over both wheels (the front one turns with the fork), the back one's stays ──
  const guard = (part: number, z: number, from: number, to: number, n: number) => {
    const rg = r + 0.035;
    for (let k = 0; k < n; k++) {
      const a = from + ((k + 0.5) / n) * (to - from);
      box(part, [0, r + Math.cos(a) * rg, z - Math.sin(a) * rg], [0.075, 0.014, (rg * (to - from)) / n + 0.01], FRAME, [-a, 0, 0]);
    }
  };
  // (angles from the top, + toward the back)
  guard(ROOT, rear, -0.4, 1.95, 5);
  guard(STEER, front, -1.35, 0.6, 4);
  for (const x of [0.045, -0.045]) tube(ROOT, [x, r + Math.cos(1.85) * (r + 0.03), rear - Math.sin(1.85) * (r + 0.03)], [x, r, rear], 0.01, STEEL);

  // ── The frame: two curved tubes down from the head to the cranks (the step-through), the seat tube, the stays ──
  const headTop: [number, number] = [toM(BIKE.headY), toM(BIKE.headZ)];
  const along = (t: number): [number, number] => [headTop[0] - Math.cos(BIKE.rake) * t, headTop[1] + Math.sin(BIKE.rake) * t];
  const headLow = along(0.24);
  tube(ROOT, [0, ...along(-0.01)], [0, ...headLow], 0.05, FRAME);
  const upper: [number, number][] = [along(0.05), [0.6, 0.42], [0.42, 0.25], [bbY + 0.02, bbZ + 0.02]];
  const lower: [number, number][] = [along(0.2), [0.5, 0.48], [0.36, 0.3], [bbY, bbZ + 0.03]];
  for (const line of [upper, lower]) for (let i = 0; i < line.length - 1; i++) tube(ROOT, [0, ...line[i]], [0, ...line[i + 1]], 0.038, FRAME);
  const seatTop: [number, number] = [0.71, -0.05];
  tube(ROOT, [0, bbY, bbZ], [0, ...seatTop], 0.04, FRAME);
  for (const x of [0.05, -0.05]) {
    tube(ROOT, [x, bbY, bbZ - 0.02], [x, r, rear], 0.024, FRAME);
    tube(ROOT, [x, seatTop[0] - 0.02, seatTop[1] - 0.01], [x, r, rear], 0.022, FRAME);
  }
  // The chain case on the right (the chain and the big sprocket under it).
  tube(ROOT, [-0.075, bbY, bbZ], [-0.075, r, rear], 0.012, FRAME, 0.11);
  box(ROOT, [-0.08, bbY, bbZ], [0.014, 0.19, 0.19], FRAME);
  box(ROOT, [-0.08, bbY, bbZ], [0.014, 0.19, 0.19], FRAME, [Math.PI / 4, 0, 0]);
  // The seat post, the sprung saddle (wide at the back, two coil springs under it).
  tube(ROOT, [0, ...seatTop], [0, toM(BIKE.saddle) - 0.04, -0.06], 0.026, CHROME);
  const sy = toM(BIKE.saddle);
  box(ROOT, [0, sy - 0.022, -0.06], [0.2, 0.045, 0.13], SADDLE);
  box(ROOT, [0, sy - 0.026, 0.05], [0.1, 0.038, 0.13], SADDLE);
  for (const x of [0.06, -0.06]) box(ROOT, [x, sy - 0.07, -0.09], [0.03, 0.05, 0.03], STEEL);

  // ── The rack over the back wheel, its struts, a red reflector at its end ──
  const rackY = r * 2 + 0.085;
  for (const x of [0.085, -0.085]) {
    tube(ROOT, [x, rackY, rear - 0.3], [x, rackY, rear + 0.22], 0.02, STEEL);
    tube(ROOT, [x, rackY, rear - 0.28], [x * 0.75, r, rear], 0.016, STEEL);
    tube(ROOT, [x, rackY, rear + 0.2], [0.05 * Math.sign(x), seatTop[0] - 0.06, seatTop[1] - 0.04], 0.014, STEEL);
  }
  for (const z of [rear - 0.26, rear - 0.04, rear + 0.18]) box(ROOT, [0, rackY, z], [0.19, 0.016, 0.02], STEEL);
  box(ROOT, [0, rackY - 0.035, rear - 0.315], [0.07, 0.035, 0.012], 0xc0302a);

  // ── The steering: the fork, the stem, the bars with their grips and the bell, the basket and its lamp ──
  const crown = along(0.25);
  box(STEER, [0, crown[0], crown[1]], [0.13, 0.03, 0.05], FRAME);
  for (const x of [0.05, -0.05]) tube(STEER, [x, crown[0], crown[1]], [x, r, front], 0.026, FRAME);
  const stemTop = along(-0.12);
  tube(STEER, [0, ...headTop], [0, ...stemTop], 0.032, CHROME);
  const gx = toM(BIKE.gripX);
  const gy = toM(BIKE.gripY);
  const gz = toM(BIKE.gripZ);
  const clamp: [number, number] = [gy - 0.04, gz + 0.09];
  tube(STEER, [0, ...stemTop], [0, ...clamp], 0.03, CHROME);
  tube(STEER, [gx - 0.08, ...clamp], [-gx + 0.08, ...clamp], 0.024, CHROME);
  for (const sg of [1, -1]) {
    tube(STEER, [sg * (gx - 0.08), ...clamp], [sg * gx, gy, gz + 0.04], 0.024, CHROME);
    tube(STEER, [sg * gx, gy, gz + 0.06], [sg * (gx + 0.01), gy + 0.005, gz - 0.06], 0.042, GRIP);
  }
  // (the thumb bell by the left grip)
  box(STEER, [gx - 0.11, gy + 0.005, gz + 0.06], [0.05, 0.03, 0.05], BRASS);
  box(STEER, [gx - 0.11, gy + 0.024, gz + 0.06], [0.03, 0.012, 0.03], 0xe0cc80);
  // The basket: a woven box on the front, open at the top, a darker rim and weave, a strut down to the fork.
  const bz0 = gz + 0.13;
  const bz1 = bz0 + 0.27;
  const by0 = gy - 0.24;
  const by1 = gy + 0.0;
  const bw = 0.34;
  const bmid = (bz0 + bz1) / 2;
  box(STEER, [0, by0 + 0.01, bmid], [bw, 0.02, bz1 - bz0], CANE_DARK);
  box(STEER, [0, (by0 + by1) / 2, bz1], [bw, by1 - by0, 0.02], CANE);
  box(STEER, [0, (by0 + by1) / 2, bz0], [bw, by1 - by0, 0.02], CANE);
  for (const sg of [1, -1]) box(STEER, [(sg * bw) / 2, (by0 + by1) / 2, bmid], [0.02, by1 - by0, bz1 - bz0], CANE);
  for (const sg of [1, -1]) box(STEER, [(sg * bw) / 2, by1, bmid], [0.03, 0.025, bz1 - bz0 + 0.03], CANE_RIM);
  for (const z of [bz0, bz1]) box(STEER, [0, by1, z], [bw + 0.03, 0.025, 0.03], CANE_RIM);
  for (const x of [-0.1, 0, 0.1]) box(STEER, [x, (by0 + by1) / 2 - 0.01, bz1 + 0.006], [0.025, by1 - by0 - 0.03, 0.012], CANE_DARK);
  for (const sg of [1, -1]) box(STEER, [(sg * bw) / 2 + sg * 0.006, (by0 + by1) / 2 - 0.01, bmid], [0.012, by1 - by0 - 0.03, 0.025], CANE_DARK);
  tube(STEER, [0, by0, bz0 + 0.05], [0, crown[0] + 0.02, crown[1] + 0.03], 0.02, STEEL);
  // The lamp under the basket's front (its lens glows while he rides at night).
  box(STEER, [0, by0 - 0.05, bz1 - 0.04], [0.085, 0.08, 0.075], CHROME);
  box(STEER, [0, by0 - 0.05, bz1 - 0.0], [0.06, 0.06, 0.012], LENS);

  // ── The cranks, the pedals (each stays level under its boot), the stand ──
  box(CRANK, [0, bbY, bbZ], [0.17, 0.04, 0.04], STEEL);
  for (const sg of [1, -1]) box(CRANK, [sg * 0.095, bbY + sg * toM(BIKE.crank) * 0.5, bbZ], [0.022, toM(BIKE.crank) + 0.03, 0.032], CHROME);
  const pedal = (part: number, sg: number) => {
    const p = pivots[part];
    box(part, [toM(p.x) + sg * 0.05, toM(p.y), toM(p.z)], [0.1, 0.024, 0.065], GRIP);
    box(part, [toM(p.x) + sg * 0.05, toM(p.y), toM(p.z)], [0.11, 0.01, 0.075], STEEL);
  };
  pedal(PEDAL_L, 1);
  pedal(PEDAL_R, -1);
  box(STAND, [toM(STAND_AT.x), toM(STAND_AT.y - STAND_LEN / 2), toM(STAND_AT.z)], [0.02, toM(STAND_LEN), 0.025], STEEL);
  box(STAND, [toM(STAND_AT.x), toM(STAND_AT.y - STAND_LEN) + 0.008, toM(STAND_AT.z)], [0.035, 0.016, 0.06], STEEL);

  // ── What it carries (one of four) ──
  const rackTop = rackY + 0.008;
  if (seed % 4 === 1) {
    // A krama folded on the rack: red and white check.
    box(ROOT, [0, rackTop + 0.025, rear - 0.04], [0.2, 0.05, 0.26], 0xc23a32);
    for (const z of [-0.1, -0.02, 0.06]) box(ROOT, [0, rackTop + 0.026, rear - 0.04 + z], [0.205, 0.052, 0.025], 0xf2ece0);
    for (const x of [-0.06, 0.03]) box(ROOT, [x, rackTop + 0.026, rear - 0.04], [0.022, 0.053, 0.265], 0xf2ece0);
  } else if (seed % 4 === 2) {
    // Morning glory from the market, standing up out of the basket.
    for (const [x, z, h] of [[-0.07, 0.04, 0.16], [0.03, -0.03, 0.2], [0.09, 0.05, 0.14]] as const) box(STEER, [x, by0 + h / 2 + 0.02, bmid + z], [0.07, h, 0.06], 0x4f9a3a);
    box(STEER, [0.02, by0 + 0.21, bmid], [0.12, 0.03, 0.08], 0x7cc25a);
  } else if (seed % 4 === 3) {
    // A sack of rice on the rack.
    box(ROOT, [0, rackTop + 0.075, rear - 0.04], [0.26, 0.15, 0.3], 0xe8e0c8);
    box(ROOT, [0, rackTop + 0.155, rear - 0.04], [0.2, 0.02, 0.24], 0xd8cfb4);
  } else {
    // A green coconut and a krama in the basket.
    box(STEER, [0.06, by0 + 0.09, bmid], [0.13, 0.14, 0.13], 0x6a9a34);
    box(STEER, [-0.07, by0 + 0.05, bmid], [0.15, 0.06, 0.2], 0x3a62a8);
  }
  return { boxes, pivots };
}

/** Where the lamp's lens is (BU, bars straight): the light starts there. */
export const LAMP_AT = new Vector3(0, m(1.02 - 0.24 - 0.05), m(0.56 + 0.13 + 0.27 + 0.01));

const _root = new Matrix4();
const _m = new Matrix4();
const _t = new Matrix4();
const ZERO = new Vector3();
const ONE = new Vector3(1, 1, 1);

/** One bicycle on the map. */
export class BikeModel {
  readonly base: number;
  readonly n: number;
  shown = false;
  private readonly boxes: Box[];
  private readonly pivots: Vector3[];
  private readonly parts: Matrix4[];
  private readonly turns: Quaternion[];
  private readonly lens: number;
  private lampNow = -1;
  /** Placed or turned since the last write. */
  private moved = true;
  private readonly root = new Matrix4();

  constructor(
    private readonly things: Things,
    seed: number,
  ) {
    const d = design(seed);
    this.boxes = d.boxes;
    this.pivots = d.pivots;
    this.n = d.boxes.length;
    this.base = things.alloc(this.n);
    d.boxes.forEach((b, k) => things.paint(this.base + k, b.color));
    this.lens = d.boxes.findIndex((b) => b.color === LENS);
    this.parts = d.pivots.map(() => new Matrix4());
    this.turns = d.pivots.map(() => new Quaternion());
  }

  /** Boxes the bicycle of `seed` has (its `Things` must hold them). */
  static boxes(seed: number): number {
    return design(seed).boxes.length;
  }

  /**
   * Where it stands: the point on the ground under the saddle (m), its heading
   * (rad), its lean (rad, + its left side down) and pitch (rad, + its front
   * down) about that point, the rider's size (`body.scale`); and its parts' turns.
   */
  place(x: number, y: number, z: number, yaw: number, lean: number, pitch: number, scale: number, t: BikeTurns): void {
    const k = BODY_UNIT_M * scale;
    // (turned, then leaned over about its ground line, then pitched: as his posture leans him, character/bike.ts)
    _root.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(pitch, yaw, -lean, 'YZX')), _s.set(k, k, k));
    if (!_root.equals(this.root)) {
      this.root.copy(_root);
      this.moved = true;
    }
    this.turn(REAR, _q.setFromAxisAngle(_a.set(1, 0, 0), t.rear));
    this.turn(FRONT, _q.setFromAxisAngle(_a.set(1, 0, 0), t.front));
    this.turn(STEER, _q.setFromAxisAngle(STEER_AXIS, t.steer));
    this.turn(CRANK, _q.setFromAxisAngle(_a.set(1, 0, 0), t.crank));
    // (the pedals undo the cranks' turn: level, tipped as his boots tip them)
    this.turn(PEDAL_L, _q.setFromAxisAngle(_a.set(1, 0, 0), pedalPitch(t.crank) - t.crank));
    this.turn(PEDAL_R, _q.setFromAxisAngle(_a.set(1, 0, 0), pedalPitch(t.crank + Math.PI) - t.crank));
    const st = Math.min(1, Math.max(0, t.stand));
    this.turn(STAND, _q.setFromEuler(_e.set(STAND_UP * (1 - st), 0, STAND_OUT * st, 'XYZ')));
    // The lamp: a dynamo's, as bright as it turns.
    const lamp = Math.round(Math.min(1, Math.max(0, t.lamp)) * 40) / 40;
    if (lamp !== this.lampNow && this.lens >= 0) {
      this.lampNow = lamp;
      // (a small lens: it glows, but not so much that it blooms round him seen from behind)
      this.things.paint(this.base + this.lens, LENS, lamp * 0.55);
    }
  }

  private turn(p: number, q: Quaternion): void {
    if (this.turns[p].equals(q)) return;
    this.turns[p].copy(q);
    this.moved = true;
  }

  /** Put every box on the map (nothing to do if it has not moved). */
  write(): void {
    if (this.shown && !this.moved) return;
    this.moved = false;
    const piv = this.pivots;
    for (let p = 0; p < piv.length; p++) {
      const parent = PARENT[p];
      // parent · T(pivot − the parent's pivot) · turn
      _t.compose(_v.subVectors(piv[p], parent < 0 ? ZERO : piv[parent]), this.turns[p], ONE);
      this.parts[p].multiplyMatrices(parent < 0 ? this.root : this.parts[parent], _t);
    }
    for (let k = 0; k < this.n; k++) {
      const b = this.boxes[k];
      this.things.set(this.base + k, _m.multiplyMatrices(this.parts[b.part], b.local));
    }
    this.shown = true;
  }

  hide(): void {
    if (!this.shown) return;
    this.shown = false;
    this.things.hide(this.base, this.n);
  }
}
