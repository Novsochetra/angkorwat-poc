import { Vector3 } from 'three';
import { Rig, RigDef, type Things } from './_things';

/**
 * Khmer kites for the kite flyers (`_sceneKites.ts`), as boxes of the
 * people's things (`_things.ts`: a rig for the kite, loose boxes for its line
 * and its tails):
 *
 * - **ខ្លែងឯក khleng ek** (also written ខ្លែងអែក; its old names ខ្លែងព្នង
 *   khleng pnong, ខ្លែងមេកូន "the mother-and-child kite"): the kite of the
 *   dry season over Cambodia's fields, 1.5‥4 m along its spine (commonly
 *   ≈ 2.2 m wing to wing, 2.4 m tall). Seen from below it is a bird of prey
 *   gliding (a khleng is the brahminy kite): a bamboo spine; the **mother**
 *   (មេ), the big upper wings on one bent bamboo, their trailing edge swept
 *   up to the tips (pointed on a "male" kite, which sings deep; rounded on a
 *   "female", which sings high); the narrow **waist** (ចង្កេះ); the **child**
 *   (កូន), a smaller pair of wings; and the **duck's foot** (ជើងទា), two splayed toes at
 *   the bottom from which two long tails of dried sugar-palm leaf trail
 *   (10‥20 m). On its beak sits the **ek** (ឯក), the thing it is named
 *   for: a bow of old bamboo as wide as the mother, strung with a ribbon of
 *   rattan shaved as thin as paper (the "tongue", អណ្ដាតឯក; or a strip of
 *   palm leaf), that twists and flutters in the wind and hums, the notes
 *   rising and falling one after another (five at least, seven for a
 *   master's), heard half a kilometre off. Paper or cloth over the frame,
 *   plain or painted in bright colours; a painted border and motifs here.
 * - **ខ្លែងកណ្ដូង khleng kandaung**: the children's small "pocket" kite, a
 *   square flown on its corner (a diamond) without a tail, which they fight
 *   and dart about.
 *
 * A kite's space: +y up its spine, +x across, +z its front (towards the
 * flyer); the bridle knot, where the line is tied, at the origin, a third
 * of the way down and a little in front of the sail. `Kite.fly` puts it
 * on the map at the end of its line from a hand or a stake, downwind at the
 * angle the wind holds it: its face turned down the line to the flyer, its
 * nose into the wind (so from the flyer's side it shows its whole outline),
 * bobbing and drifting, the ek's ribbon shimmering, the tails waving. The
 * line sags; less in a stronger wind.
 *
 * Boxes: a khleng ek 28 + 8 for its tails + 8 for its line; a kandaung
 * 4 + 8. Nothing allocated per flight. By day its paper lets the light
 * through (a faint glow on the sail, `light`), so a kite seen from below
 * against the sky still shows its colours; none at night.
 */

/** The spine and frame, the ek's bow (older, paler bamboo), its rattan ribbon. */
const BAMBOO = 0x8a6a3e;
const BOW = 0xc49a58;
const RATTAN = 0xe8d6a2;
/** The sail's thickness, in the kite's own units (its sail runs from the head at y 1 to the duck's toes at −1.2; a unit is `size / 2` m). */
const T = 0.012;
/** Line segments, and segments of each tail. */
const LINE_SEGS = 8;
const TAIL_SEGS = 4;
/** Daylight through the paper: a sail seen against the sky shows its colours (a faint glow, gone at night). */
const PAPER_GLOW = 0.16;

export type KiteKind = 'ek' | 'kandaung';

export interface KiteLook {
  kind: KiteKind;
  /** Khleng ek: the mother's wing tips — pointed (a male kite, a deep voice) or rounded (a female, a high one). */
  tips?: 'pointed' | 'round';
  /** The sail, its painted border (and the duck's foot), the motif on the mother, the one on the child (sRGB). */
  sail: number;
  edge: number;
  motif: number;
  motif2?: number;
  /** The tails' colour (dried sugar-palm leaf; a child's may be plastic ribbon). */
  tail?: number;
  /** Its size (m, drawn at the people's scale: 1.4 × the true kite): the sail is 1.1 × this from head to toes, 1.22 × with the ek. */
  size: number;
  /** The line out at full flight (m). */
  line: number;
  /** Each tail's length (m, drawn); 0 for none. */
  tails?: number;
  /** The line's colour (white nylon, or a pale vegetable fibre). */
  lineColor?: number;
}

/** The kite's middle in its own space (for the sound and the book): the waist, on the sail. */
const MID: [number, number, number] = [0, 0.05 - 0.3, -0.3];

/** The wind the kites fly in: downwind (unit, x z) and its strength at kite height (0 slack … 1 strong). */
export interface KiteWind {
  x: number;
  z: number;
  k: number;
}

/**
 * The kite season: the steady north wind aloft from after the Water Festival to the end of March (`season`,
 * 0 = mid-April), when the families fly their khleng ek (the grandfather's weeks, _sceneKites.ts `EAST`).
 */
export const KITE_SEASON: readonly [number, number] = [0.6, 0.97];

/** How much of the season's wind aloft blows at `season` (0 none, the wet months … 1 the kite season), eased in over the weeks before it and out after. */
export function seasonBreeze(season: number): number {
  const s = ((season % 1) + 1) % 1;
  const ease = (v: number) => {
    const c = Math.min(1, Math.max(0, v));
    return c * c * (3 - 2 * c);
  };
  return ease((s - (KITE_SEASON[0] - 0.03)) / 0.03) * (1 - ease((s - KITE_SEASON[1]) / 0.03));
}

/**
 * Between the kite flyers (_sceneKites.ts) and the explorer's own kite (roam/_kiteFly.ts): plain values, no
 * three.js objects (as greet.ts).
 * - `giver`: the grandfather on the east field with his khleng ek (the scene writes it each step it runs): out
 *   there flying (`out`), where he stands (m).
 * - `gift`: the explorer asked him for a kite. Roaming writes `n` (one more each time he asks), `t` (seconds
 *   since he asked; −1: none now) and where he stands and faces; the scene answers: the grandfather looks at
 *   him and says so, his son comes up and holds a small kite out to him (`giving`, his hands at `hx, hy, hz`).
 */
export const KITE_HOOK = {
  giver: { out: false, x: 0, y: 0, z: 0 },
  gift: { n: 0, t: -1, x: 0, y: 0, z: 0, yaw: 0, giving: false, hx: 0, hy: 0, hz: 0 },
};

const A = new Vector3();
const B = new Vector3();
const SPINE = new Vector3();
const ACROSS = new Vector3();
const FACE = new Vector3();
const P = new Vector3();
const D = new Vector3();

export class Kite {
  readonly rig: Rig;
  /** The bridle knot (the line's top end) and the kite's middle, as last flown (m). */
  readonly knot = new Vector3();
  readonly mid = new Vector3();
  /** Its drawn radius (m): half its height with the ek (the nature book, the sound). */
  readonly r: number;
  /** Up in the air (flown this step); false once hidden. */
  shown = false;
  private readonly ribbon: number;
  private readonly paper: number[];
  private lit = -1;
  private readonly line: number;
  private readonly tail: number;
  private readonly roots: [number, number, number][] = [];
  private dartAt: number;
  private dartSide = 1;

  constructor(
    private readonly things: Things,
    readonly look: KiteLook,
    /** 0‥1: its own rhythm. */
    readonly seed: number,
    /** `line: false`: no line of boxes (the explorer's own kite draws its line itself: roam/_kiteSky.ts). */
    opts: { line?: boolean } = {},
  ) {
    const { def, ribbon, paper, roots } = look.kind === 'ek' ? ekDef(look) : kandaungDef(look);
    this.rig = new Rig(things, def);
    this.ribbon = ribbon;
    this.paper = paper;
    this.roots = roots;
    this.r = look.size * (look.kind === 'ek' ? 0.61 : 0.5);
    this.line = opts.line === false ? -1 : things.alloc(LINE_SEGS);
    if (this.line >= 0) for (let s = 0; s < LINE_SEGS; s++) things.paint(this.line + s, look.lineColor ?? 0xeee8d8);
    const nt = look.tails ? roots.length * TAIL_SEGS : 0;
    this.tail = nt ? things.alloc(nt) : -1;
    for (let s = 0; s < nt; s++) things.paint(this.tail + s, look.tail ?? 0xd8c890);
    this.dartAt = 12 + 17 * seed;
  }

  /**
   * Fly it from the anchor (a fist or a stake's top, m): `out` 0 (in the
   * hand, being launched or brought in) … 1 (on its full line), in wind `w`
   * at `now` (s). Writes the rig, the line and the tails.
   */
  fly(ax: number, ay: number, az: number, w: KiteWind, out: number, now: number): void {
    const look = this.look;
    const k = w.k;
    const t = now + this.seed * 97;
    const small = look.kind === 'kandaung';
    // How lively it is: a big khleng ek hangs steady in the sky; a small kite wanders and darts.
    const live = small ? 1 : look.size < 2.4 ? 0.65 : 0.35;
    const o = out * out * (3 - 2 * out);
    const L = look.line * (0.12 + 0.88 * out);
    // The line's angle: higher in a stronger wind, a slow bob; low while it is launched or brought in.
    let e = (small ? 0.7 : 0.8) + 0.3 * k + (0.02 + 0.03 * k) * Math.sin(t * 0.53) + 0.02 * live * Math.sin(t * 1.9 + 1);
    let side = live * (0.26 * Math.sin(t * 0.13) + 0.09 * Math.sin(t * 0.41 + 2)) + 0.05 * Math.sin(t * 0.071 + 4);
    let roll = (0.03 + 0.05 * k) * (0.6 + live) * Math.sin(t * 0.7 + 1.3) + 0.02 * k * Math.sin(t * 5.3);
    // A small kite darts now and then: dives off to one side and climbs back.
    if (small) {
      if (now > this.dartAt + 5) {
        this.dartAt = now + 12 + 16 * frac(Math.sin(this.seed * 71 + now * 0.37) * 4375.5);
        this.dartSide = -this.dartSide;
      }
      const sw = now > this.dartAt ? Math.sin(Math.min(1, (now - this.dartAt) / 4.5) * Math.PI) : 0;
      e -= 0.5 * sw;
      side += 0.38 * sw * this.dartSide;
      roll += 0.7 * sw * this.dartSide;
    }
    e = 0.14 + (e - 0.14) * o;
    this.put(ax, ay, az, w, L, e, side, roll * o, o, live, now);
  }

  /**
   * Fly it where the caller says (the explorer's own kite, roam/_kiteSky.ts): `L` m of line from the anchor at
   * `e` over the level (radians), turned `side` from downwind about the vertical (+ to the flyer's left as he
   * faces it), rolled `roll`; `out` as `fly`'s (0 low, being launched or brought in … 1 up), `now` (s).
   */
  flyAt(ax: number, ay: number, az: number, w: KiteWind, L: number, e: number, side: number, roll: number, out: number, now: number): void {
    const live = this.look.kind === 'kandaung' ? 1 : this.look.size < 2.4 ? 0.65 : 0.35;
    this.put(ax, ay, az, w, L, e, side, roll, out * out * (3 - 2 * out), live, now);
  }

  /**
   * In a hand, or hung up by its head (the explorer's, the market's): the knot at (x, y, z), its face turned
   * to `yaw`, tipped `pitch` (front down) and rolled; `scale` of its size; the tails hang `tails` m, swaying
   * `sway` of a flight's wave; the ek's ribbon still.
   */
  hold(x: number, y: number, z: number, yaw: number, pitch: number, roll: number, now: number, tails: number, sway = 0.3, scale = 1): void {
    const rig = this.rig;
    rig.place(x, y, z, yaw, pitch, roll, (this.look.size / 2) * scale);
    if (this.ribbon > 0) rig.turn(this.ribbon, 0);
    rig.write();
    this.knot.set(x, y, z);
    rig.point(MID[0], MID[1], MID[2], this.mid);
    if (this.line >= 0) this.things.hide(this.line, LINE_SEGS);
    if (this.tail >= 0) this.tails(0, 0, 0, now + this.seed * 97, tails * scale, sway);
    this.shown = true;
  }

  /** On its line: the knot `L` m from the anchor at `e` and `side`, its face down the line, the ribbon, its line of boxes (if any), the tails. */
  private put(ax: number, ay: number, az: number, w: KiteWind, L: number, e: number, side: number, roll: number, o: number, live: number, now: number): void {
    const look = this.look;
    const k = w.k;
    const t = now + this.seed * 97;
    const cs = Math.cos(side);
    const ss = Math.sin(side);
    // (downwind, turned `side` about the vertical)
    const dx = w.x * cs + w.z * ss;
    const dz = w.z * cs - w.x * ss;
    const ce = Math.cos(e);
    const se = Math.sin(e);
    const kn = this.knot.set(ax + dx * L * ce, ay + L * se, az + dz * L * ce);
    // Its face down the line to the flyer, its nose into the wind (a little steeper than the line: it holds its own weight).
    const yaw = Math.atan2(-dx, -dz) + 0.05 * live * Math.sin(t * 0.43);
    const pitch = e + (0.16 - 0.08 * k) * o + 0.03 * Math.sin(t * 0.9 + 2);
    const S = look.size / 2;
    const rig = this.rig;
    rig.place(kn.x, kn.y, kn.z, yaw, pitch, roll, S);
    // The ek's rattan ribbon: a fast shimmer (a twist about its length), livelier in a strong wind.
    if (this.ribbon > 0) rig.turn(this.ribbon, (0.25 + 0.5 * k) * Math.sin(now * 71 + this.seed * 13) * Math.min(1, o * 3));
    rig.write();
    rig.point(MID[0], MID[1], MID[2], this.mid);
    // The line from the hand, sagging (less in a strong wind).
    if (this.line >= 0) {
      const th = this.things;
      const sag = L * (0.075 - 0.04 * k);
      let px = ax;
      let py = ay;
      let pz = az;
      for (let s = 1; s <= LINE_SEGS; s++) {
        const u = s / LINE_SEGS;
        const qx = ax + (kn.x - ax) * u;
        const qy = ay + (kn.y - ay) * u - sag * 4 * u * (1 - u);
        const qz = az + (kn.z - az) * u;
        th.segment(this.line + s - 1, px, py, pz, qx, qy, qz, look.kind === 'kandaung' ? 0.02 : 0.028);
        px = qx;
        py = qy;
        pz = qz;
      }
    }
    if (this.tail >= 0) this.tails(dx, dz, k, t, (look.tails ?? 0) * (0.35 + 0.65 * o));
    this.shown = true;
  }

  /**
   * The two tails of palm leaf from the duck's foot: down the spine at first,
   * then drooping and trailing downwind, a slow wave running along each (the
   * two out of step), a flutter across. `len`: each tail's length now (m); `sway`: of the flight's wave.
   */
  private tails(dx: number, dz: number, k: number, t: number, len: number, sway = 1): void {
    const rig = this.rig;
    // (the kite's axes on the map, from three of its points)
    rig.point(0, 0, 0, A);
    SPINE.copy(rig.point(0, 1, 0, B)).sub(A).normalize();
    ACROSS.copy(rig.point(1, 0, 0, B)).sub(A).normalize();
    FACE.copy(rig.point(0, 0, 1, B)).sub(A).normalize();
    const seg = len / TAIL_SEGS;
    const droop = 1.2 - 0.6 * k;
    const wide = 0.06 * Math.max(1, this.look.size * 0.4);
    const th = this.things;
    let slot = this.tail;
    for (let j = 0; j < this.roots.length; j++) {
      const root = this.roots[j];
      rig.point(root[0], root[1], root[2], P);
      const ph = j * 1.9 + this.seed * 5;
      const splay = (j === 0 ? -1 : 1) * 0.12;
      for (let i = 0; i < TAIL_SEGS; i++) {
        const u = (i + 0.5) / TAIL_SEGS;
        const wave = (0.45 + 0.35 * k) * sway * u * Math.sin(t * 1.9 - i * 1.1 + ph);
        const flutter = 0.18 * sway * u * Math.sin(t * 3.3 - i * 0.9 + ph * 1.7);
        D.copy(SPINE).multiplyScalar(-(1 - 0.6 * u));
        D.y -= (0.25 + 0.5 * u) * droop;
        D.x += dx * (0.35 + 0.45 * u);
        D.z += dz * (0.35 + 0.45 * u);
        D.addScaledVector(ACROSS, wave + splay).addScaledVector(FACE, flutter).normalize();
        const qx = P.x + D.x * seg;
        const qy = P.y + D.y * seg;
        const qz = P.z + D.z * seg;
        th.segment(slot++, P.x, P.y, P.z, qx, qy, qz, wide);
        P.set(qx, qy, qz);
      }
    }
  }

  /** Daylight through its paper (0 night … 1 day), repainted only when it changes. */
  light(day: number): void {
    if (Math.abs(day - this.lit) < 0.03 && (day > 0 || this.lit === 0)) return;
    this.lit = day;
    const boxes = this.rig.def.boxes;
    for (const k of this.paper) this.rig.paint(k, boxes[k].color, PAPER_GLOW * day);
  }

  hide(): void {
    if (!this.shown && !this.rig.shown) return;
    this.shown = false;
    this.rig.hide();
    if (this.line >= 0) this.things.hide(this.line, LINE_SEGS);
    if (this.tail >= 0) this.things.hide(this.tail, this.roots.length * TAIL_SEGS);
  }
}

/** Where the bridle knot is: this far down from the head (the sail runs 1 … −1.2) and in front of the sail. */
const TOW = 0.3;
const BRIDLE = 0.3;

/** A kite's boxes: its rig, the ek's ribbon (a part; −1 none), its paper boxes, where its tails hang. */
interface Made {
  def: RigDef;
  ribbon: number;
  paper: number[];
  roots: [number, number, number][];
}

/**
 * The khleng ek's rig (see the top): 28 boxes, drawn from the head (y 1)
 * down to the duck's toes (−1.2), 1.9 wide at the mother (a little taller
 * than wide, as the kites are: 2.2 × 2.4 m, 1.04 × 1.39 m), the ek above
 * the head, the sail at z = 0, the wings bowed back. Returns the
 * ribbon's part, the paper boxes (they let the daylight through) and where
 * the tails hang (the duck's toes).
 */
function ekDef(look: KiteLook): Made {
  const d = new RigDef();
  const paper: number[] = [];
  const { sail, edge, motif } = look;
  const motif2 = look.motif2 ?? edge;
  type Opts = { rot?: [number, number, number]; part?: number };
  // (the rig's origin is the knot: TOW down from the head, BRIDLE in front of the sail)
  const b = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, opts: Opts = {}, isPaper = true) => {
    if (isPaper) paper.push(d.boxes.length);
    d.box([x, y - TOW, z - BRIDLE], [sx, sy, sz], color, opts);
  };
  /**
   * A wing panel each side whose leading edge runs from (x0, y0) to (x1, y1) (the +x side; the −x side
   * mirrored), `chord` deep behind it, `z` back and bowed back `bow` (rad) — and the paint along its
   * leading edge (the bent bamboo) when `band`.
   */
  const wing = (x0: number, y0: number, x1: number, y1: number, chord: number, z: number, bow: number, band: boolean, color = sail) => {
    const a = Math.atan2(y1 - y0, x1 - x0);
    const l = Math.hypot(x1 - x0, y1 - y0);
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const sa = Math.sin(a);
    const ca = Math.cos(a);
    // (a negative chord: the panel lies above the edge — a trailing edge, the panel reaching up into the wing)
    for (const s of [-1, 1]) {
      b(s * (mx + (chord / 2) * sa), my - (chord / 2) * ca, z, l + 0.02, Math.abs(chord), T, color, { rot: [0, s * bow, s * a] });
      if (band) b(s * (mx + 0.03 * sa), my - 0.03 * ca, z + 0.012, l + 0.03, 0.085, T * 2, edge, { rot: [0, s * bow, s * a] });
    }
  };
  // The spine, behind the sail, from the beak (where the ek sits) down to the duck's foot.
  b(0, 0.04, -0.03, 0.036, 2.46, 0.036, BAMBOO, {}, false);
  // The mother: a middle panel under the head, and each side a wide wing on the bent bamboo — two panels
  // along the leading edge (painted along the bamboo), one along the trailing edge sweeping up to the
  // tip — and the tip: pointed, a male kite; rounded, a female.
  b(0, 0.68, 0, 0.44, 0.64, T, sail);
  b(0, 0.99, 0.008, 0.46, 0.085, T * 2, edge);
  wing(0.2, 1.0, 0.58, 0.965, 0.42, -0.04, 0.1, true);
  wing(0.58, 0.965, 0.86, 0.86, 0.3, -0.1, 0.2, true);
  wing(0.2, 0.36, 0.86, 0.6, -0.3, -0.07, 0.15, false);
  if (look.tips === 'round') wing(0.84, 0.87, 0.97, 0.77, 0.24, -0.15, 0.3, false);
  else wing(0.86, 0.86, 1.04, 0.65, 0.09, -0.16, 0.3, false);
  // The waist, and the child: a middle panel and two small wings swept down from its shoulders.
  b(0, 0.16, 0, 0.3, 0.42, T, sail);
  b(0, -0.32, 0, 0.46, 0.54, T, sail);
  wing(0.16, -0.04, 0.6, -0.22, 0.34, -0.04, 0.12, false);
  // The duck's foot: its neck and two splayed toes (the tails hang from their tips).
  b(0, -0.7, 0, 0.14, 0.26, T, sail);
  for (const s of [-1, 1]) b(s * 0.12, -0.98, 0, 0.12, 0.46, T, edge, { rot: [0, 0, s * 0.4] });
  // Painted lozenges on the mother and the child.
  b(0, 0.68, 0.012, 0.26, 0.26, T, motif, { rot: [0, 0, Math.PI / 4] });
  b(0, -0.3, 0.012, 0.2, 0.2, T, motif2, { rot: [0, 0, Math.PI / 4] });
  // The ek: an arched bow of old bamboo on the beak, as wide as the mother; its rattan ribbon straight across.
  b(0, 1.28, 0.03, 0.66, 0.05, 0.05, BOW, {}, false);
  for (const s of [-1, 1]) b(s * 0.64, 1.19, 0.03, 0.67, 0.05, 0.05, BOW, { rot: [0, 0, -s * 0.28] }, false);
  const ribbon = d.part([0, 1.1 - TOW, 0.03 - BRIDLE]);
  b(0, 1.1, 0.03, 1.9, 0.024, 0.006, RATTAN, { part: ribbon }, false);
  return {
    def: d,
    ribbon,
    paper,
    roots: [
      [-0.21, -1.19 - TOW, -BRIDLE],
      [0.21, -1.19 - TOW, -BRIDLE],
    ],
  };
}

/** The khleng kandaung: a square sail on its corner (a diamond), a painted diamond on it, the spine and cross-spar behind: 4 boxes. */
function kandaungDef(look: KiteLook): Made {
  const d = new RigDef();
  const tow = 0.3;
  const bridle = 0.25;
  const b = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, rot?: [number, number, number]) =>
    d.box([x, y - tow, z - bridle], [sx, sy, sz], color, { rot });
  b(0, 0, -0.03, 0.035, 2, 0.035, BAMBOO);
  b(0, 0, -0.03, 2, 0.035, 0.035, BAMBOO);
  b(0, 0, 0, 1.414, 1.414, T * 1.4, look.sail, [0, 0, Math.PI / 4]);
  b(0, 0.04, 0.014, 0.6, 0.6, T, look.motif, [0, 0, Math.PI / 4]);
  return { def: d, ribbon: -1, paper: [2, 3], roots: [] };
}

function frac(x: number): number {
  return x - Math.floor(x);
}
