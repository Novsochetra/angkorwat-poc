import { mulberry32 } from '../../voxel/random';
import { CH, Model, type Flock, type Species } from './_kit';
import type { Ground, Walker } from './_landBrain';
import type { Crown, Spot } from './_jungleSurvey';

/**
 * The big birds of the jungle, one mesh:
 *
 * - Great hornbill: black with a white neck ruff (yellowed), a white belly,
 *   a broad pale bar across each wing and white trailing edges, a white tail
 *   with a black band, and the huge yellow bill with its casque. Pairs
 *   perch on the tallest crowns and fly between them over the canopy: a few
 *   heavy flaps, loud as a steam train ("whoosh"), then a long glide. A pair
 *   crossing the forest now and then is seen from the picker too.
 * - Giant ibis, Cambodia's national bird: dark grey-brown with silvery wing
 *   panels and black primaries, a bare grey head and neck with dark bands,
 *   a long down-curved bill, red-orange legs. A pair wades and probes the
 *   mud of the lowland banks and flies off low, honking, when the explorer
 *   comes near.
 *
 * Each species has its own bones (its own pivots): `h*` hornbill, `i*`
 * ibis. The wings are built open; folded, they lie along the body (flapped
 * up, then tipped back), the hands turned back over them.
 *
 * Channels: gait 0 still, 1 walk (ibis), 2 flying (wings open, legs back);
 * in flight `head` is the body's pitch (+ nose down) and `turn` its bank
 * (+ left side up); perched they turn the head. Rest: roosting. Act: in
 * flight 1 = flapping hard (take-off, landing), else flap-and-glide; on the
 * ground 1 = probing the mud / preening.
 */

export const BIRD = { hornbill: 0, ibis: 1 } as const;
const H = 1 << BIRD.hornbill;
const I = 1 << BIRD.ibis;

const S = {
  black: 0,
  white: 1,
  ruff: 2,
  bill: 3,
  casque: 4,
  eye: 5,
  bar: 6,
  foot: 7,
  // ibis
  body: 8,
  back: 9,
  panel: 10,
  prim: 11,
  skin: 12,
  band: 13,
  ibill: 14,
  leg: 15,
};

const model = new Model()
  // Hornbill.
  .bone('hbody', null, [0, 0.34, 0])
  .bone('hneck', 'hbody', [0, 0.46, 0.14])
  .bone('hhead', 'hneck', [0, 0.56, 0.2])
  .boneLR('hwing*', 'hbody', [0.11, 0.45, 0.08])
  .boneLR('htip*', 'hwing*', [0.46, 0.45, 0.06])
  .bone('htail', 'hbody', [0, 0.38, -0.22])
  .boneLR('hleg*', 'hbody', [0.05, 0.27, 0])
  // Ibis.
  .bone('ibody', null, [0, 0.55, 0])
  .bone('ineck', 'ibody', [0, 0.6, 0.18])
  .bone('ihead', 'ineck', [0, 0.8, 0.24])
  .boneLR('iwing*', 'ibody', [0.11, 0.6, 0.06])
  .boneLR('itip*', 'iwing*', [0.46, 0.6, 0.04])
  .bone('itail', 'ibody', [0, 0.57, -0.22])
  .boneLR('ileg*', 'ibody', [0.05, 0.48, 0]);

model
  // ── Hornbill ──
  .box('hbody', [0, 0.37, -0.02], [0.2, 0.2, 0.44], S.black, H)
  .box('hbody', [0, 0.28, 0.0], [0.16, 0.04, 0.3], S.white, H)
  .boxLR('hbody', [0.06, 0.28, -0.04], [0.06, 0.07, 0.1], S.white, H)
  .box('hneck', [0, 0.5, 0.17], [0.11, 0.16, 0.11], S.ruff, H)
  .box('hhead', [0, 0.58, 0.22], [0.1, 0.1, 0.12], S.black, H)
  .boxLR('hhead', [0.051, 0.59, 0.24], [0.004, 0.018, 0.018], S.eye, H)
  .box('hhead', [0, 0.565, 0.4], [0.065, 0.075, 0.26], S.bill, H)
  .box('hhead', [0, 0.548, 0.55], [0.045, 0.05, 0.06], S.bill, H)
  .box('hhead', [0, 0.565, 0.28], [0.066, 0.076, 0.02], S.black, H)
  .box('hhead', [0, 0.625, 0.35], [0.075, 0.05, 0.2], S.casque, H)
  .box('hhead', [0, 0.628, 0.455], [0.076, 0.042, 0.016], S.black, H)
  .boxLR('hwing*', [0.285, 0.45, -0.02], [0.35, 0.03, 0.3], S.black, H)
  .boxLR('hwing*', [0.285, 0.45, 0.01], [0.33, 0.034, 0.09], S.bar, H)
  .boxLR('hwing*', [0.285, 0.45, -0.175], [0.33, 0.026, 0.05], S.white, H)
  .boxLR('htip*', [0.62, 0.45, -0.04], [0.32, 0.026, 0.24], S.black, H)
  .boxLR('htip*', [0.62, 0.45, -0.165], [0.3, 0.022, 0.035], S.white, H)
  .boxLR('htip*', [0.55, 0.45, 0.0], [0.18, 0.03, 0.07], S.bar, H)
  .box('htail', [0, 0.37, -0.45], [0.16, 0.03, 0.44], S.white, H)
  .box('htail', [0, 0.37, -0.42], [0.162, 0.034, 0.12], S.black, H)
  .boxLR('hleg*', [0.05, 0.15, 0], [0.035, 0.24, 0.035], S.foot, H)
  .boxLR('hleg*', [0.05, 0.012, 0.04], [0.06, 0.024, 0.1], S.foot, H)
  // ── Giant ibis ──
  .box('ibody', [0, 0.55, -0.02], [0.2, 0.2, 0.44], S.body, I)
  .box('ibody', [0, 0.652, -0.05], [0.16, 0.012, 0.36], S.back, I)
  .boxLR('ibody', [0.05, 0.46, -0.02], [0.06, 0.07, 0.1], S.body, I)
  .box('ineck', [0, 0.7, 0.22], [0.06, 0.22, 0.06], S.skin, I)
  .box('ineck', [0, 0.72, 0.19], [0.064, 0.14, 0.016], S.band, I)
  .box('ineck', [0, 0.66, 0.2], [0.066, 0.02, 0.064], S.band, I)
  .box('ihead', [0, 0.83, 0.27], [0.07, 0.07, 0.09], S.skin, I)
  .box('ihead', [0, 0.865, 0.24], [0.06, 0.012, 0.06], S.band, I)
  .boxLR('ihead', [0.036, 0.84, 0.285], [0.004, 0.014, 0.014], S.eye, I)
  .box('ihead', [0, 0.822, 0.355], [0.026, 0.028, 0.09], S.ibill, I)
  .box('ihead', [0, 0.806, 0.43], [0.022, 0.024, 0.07], S.ibill, I)
  .box('ihead', [0, 0.782, 0.472], [0.02, 0.03, 0.03], S.ibill, I)
  .box('ihead', [0, 0.757, 0.488], [0.017, 0.03, 0.02], S.ibill, I)
  .boxLR('iwing*', [0.285, 0.6, -0.02], [0.35, 0.03, 0.3], S.body, I)
  .boxLR('iwing*', [0.27, 0.6, -0.03], [0.3, 0.034, 0.16], S.panel, I)
  .boxLR('itip*', [0.62, 0.6, -0.04], [0.32, 0.026, 0.24], S.prim, I)
  .box('itail', [0, 0.56, -0.34], [0.12, 0.03, 0.2], S.prim, I)
  .boxLR('ileg*', [0.05, 0.24, 0], [0.028, 0.46, 0.028], S.leg, I)
  .boxLR('ileg*', [0.05, 0.012, 0.04], [0.07, 0.024, 0.11], S.leg, I);

const GLSL = /* glsl */ `
vec3 faunaBoneRot(int b, FaunaPose P) {
  bool ibis = P.variant == 1;
  float fly = P.run;
  float perch = 1.0 - fly;
  float roost = P.rest * perch;
  float probe = clamp(P.act, 0.0, 1.0) * perch;
  float hard = clamp(P.act, 0.0, 1.0) * fly;
  // In flight: a few beats, then a glide (the hornbill's heavy beats, the ibis flaps more).
  float period = ibis ? 3.0 : 5.0;
  float rate = ibis ? 3.0 : 2.4;
  float share = ibis ? 0.65 : 0.42;
  float cyc = fract(P.t / period + P.seed);
  float on = max(hard, 1.0 - smoothstep(share, share + 0.07, cyc) + smoothstep(0.97, 1.0, cyc));
  float beat = sin(P.t * rate * 6.2831853);
  float wing = fly * (on * (0.12 + (0.55 + 0.25 * hard) * beat) + (1.0 - on) * 0.06);
  float tip = fly * on * 0.35 * sin(P.t * rate * 6.2831853 - 0.9);
  // Perched: turn the head, preen or probe; roosting: head sunk.
  float headP = perch * (0.55 * P.head + 0.3 * roost);
  float headY = perch * P.turn * 0.9;
  if (b == B_HBODY || b == B_IBODY) {
    float stance = ibis ? 0.0 : -0.22;
    float walkRoll = 0.05 * sin(P.phase) * P.walk;
    return vec3(fly * P.head + perch * (stance + (ibis ? 0.25 : 0.1) * probe), 0.0, fly * P.turn + walkRoll);
  }
  if (b == B_HNECK || b == B_INECK) {
    float bob = -0.12 * sin(P.phase * 2.0) * P.walk;
    float reach = ibis ? 1.0 : 0.5;
    return vec3(fly * reach + perch * ((ibis ? 0.9 : 0.4) * probe + 0.2 * roost) + bob + headP * 0.4, headY * 0.5, 0.0);
  }
  if (b == B_HHEAD || b == B_IHEAD) {
    float jab = ibis ? 0.25 * max(0.0, sin(P.t * 5.0 + P.seed * 13.0)) * step(0.0, sin(P.t * 0.9 + P.seed * 3.0)) : 0.0;
    return vec3(-fly * (ibis ? 0.95 : 0.5) + headP + (0.3 + jab) * probe, headY * 0.5, 0.0);
  }
  float s = (b == B_HWINGL || b == B_HTIPL || b == B_IWINGL || b == B_ITIPL || b == B_HLEGL || b == B_ILEGL) ? 1.0 : -1.0;
  if (b == B_HWINGL || b == B_HWINGR || b == B_IWINGL || b == B_IWINGR)
    // Folded: flapped up and tipped back along the body; open: the beat.
    return vec3(-1.5 * perch, 0.0, s * (1.5 * perch + wing));
  if (b == B_HTIPL || b == B_HTIPR || b == B_ITIPL || b == B_ITIPR) return vec3(0.0, s * 2.95 * perch, s * tip);
  if (b == B_HTAIL) return vec3(-1.0 * perch + 0.05 * fly + 0.1 * sin(P.t * 0.7 + P.seed * 5.0) * perch, 0.0, 0.0);
  if (b == B_ITAIL) return vec3(-0.25 * perch, 0.0, 0.0);
  // Legs: steps; tucked back in flight (the ibis's trail behind).
  float th = P.phase + (s > 0.0 ? 0.0 : 3.1416);
  float step = -sin(th) * 0.45 * P.walk;
  return vec3(step + fly * (ibis ? 1.45 : 1.3) - 1.0 * roost * (ibis ? 0.0 : 1.0), 0.0, 0.0);
}

vec3 faunaRootMove(FaunaPose P) {
  float bob = 0.012 * abs(sin(P.phase)) * P.walk;
  // (a perched hornbill sinks onto its legs to roost; the ibis stands)
  return vec3(0.0, bob - 0.08 * P.rest * (1.0 - P.run) * (P.variant == 1 ? 0.0 : 1.0), 0.0);
}
`;

export const BIRDS: Species = {
  name: 'bigbirds',
  model,
  palettes: [
    // hornbill (the ibis slots unused)
    [0x171515, 0xece8dc, 0xe3d6a2, 0xe8ae2e, 0xf0c23a, 0xb02a18, 0xe6dcb0, 0x4c4a48, 0, 0, 0, 0, 0, 0, 0, 0],
    // giant ibis
    [0, 0, 0, 0, 0, 0x9a2418, 0, 0, 0x4a4540, 0x38342f, 0x8c8882, 0x22201e, 0x746f68, 0x34302c, 0x86785e, 0xc8582e],
  ],
  glsl: GLSL,
  ease: [0.45, 0.8, 0.45, 0.45, 0.4],
};

/** Wing beats a second and the flap-and-glide cycle (s) per kind: as in the shader. */
const BEAT = { rate: [2.4, 3.0], period: [5.0, 3.0], share: [0.42, 0.65] };

/** In a flap burst at time t (the shader's cycle, from its seed). */
export function flapping(kind: number, t: number, seed: number): boolean {
  const c = (((t / BEAT.period[kind] + seed) % 1) + 1) % 1;
  return c < BEAT.share[kind];
}

// ── Flying ──────────────────────────────────────────────────────────────────

type V3 = [number, number, number];

/** A flight from one perch to the next: a curve over the canopy, up and down at the ends. */
interface Flight {
  t0: number;
  dur: number;
  from: V3;
  to: V3;
  /** Control point of the curve (x, z) and the cruising height over the straight line (m). */
  cx: number;
  cz: number;
  lift: number;
}

function flightAt(fl: Flight, u: number, out: V3): V3 {
  const a = 1 - u;
  out[0] = a * a * fl.from[0] + 2 * a * u * fl.cx + u * u * fl.to[0];
  out[2] = a * a * fl.from[2] + 2 * a * u * fl.cz + u * u * fl.to[2];
  // Up quickly off the perch, a long cruise, down to land.
  const up = Math.min(1, u / 0.22);
  const down = Math.min(1, (1 - u) / 0.3);
  const k = Math.min(up * (2 - up), down * (2 - down));
  out[1] = fl.from[1] + (fl.to[1] - fl.from[1]) * u + fl.lift * k - 0.8 * Math.sin(Math.PI * Math.min(1, u / 0.1));
  return out;
}

export interface Bird {
  i: number;
  kind: number;
  seed: number;
  scale: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** The one it follows in flight (and sits next to), and how far behind / beside. */
  lead: Bird | null;
  flight: Flight | null;
  /** Seconds left perched (or on the bank). */
  stay: number;
  /** The perch (hornbill: a crown) or home spot (ibis). */
  home: V3;
  /** Pose while perched: head, turn, act. */
  head: number;
  turn: number;
  act: number;
  actIn: number;
  /** Something to call out: 'off' (took off), 'call' (now and then), read and cleared by jungle.ts. */
  event: 'off' | 'call' | null;
  /** Last time a flap burst began (for the wing sound). */
  burst: boolean;
  /** Ibis: walking to a spot along the bank. */
  wx: number;
  wz: number;
  walking: boolean;
}

const P3: V3 = [0, 0, 0];
const Q3: V3 = [0, 0, 0];
const R3: V3 = [0, 0, 0];

/**
 * The birds' lives: perched (or on the bank), a flight to another perch now
 * and then or when the explorer comes near, the follower of a pair a little
 * behind its mate. Roost at night.
 */
export class BigBirds {
  readonly birds: Bird[] = [];
  private readonly rnd = mulberry32(4127);
  private roost = false;

  constructor(
    private readonly flock: Flock,
    /** Hornbill perches (the tallest crowns; the first `seen` in the overview's frame). */
    private readonly perches: Crown[],
    private readonly seen: number,
    /** Ibis banks. */
    private readonly banks: Spot[],
    private readonly bankGround: Ground,
    /** Where a hornbill beside its mate sits: the leaves' top at (x, z) near height y. */
    private readonly perchY: (x: number, z: number, y: number) => number,
  ) {}

  /** A hornbill pair on a perch. */
  addHornbills(first: number, perch: number): void {
    const c = this.perches[perch];
    const a = this.bird(first, BIRD.hornbill, 1.3, [c.x, c.y, c.z], null);
    this.bird(first + 1, BIRD.hornbill, 1.22, [c.x + 1.6, this.perchY(c.x + 1.6, c.z + 0.6, c.y), c.z + 0.6], a);
  }

  /** A giant ibis pair on a bank. */
  addIbises(first: number, bank: number): void {
    const s = this.banks[bank];
    const g = this.bankGround(s.x, s.z);
    const a = this.bird(first, BIRD.ibis, 1.25, [s.x, g, s.z], null);
    const g2 = this.bankGround(s.x + 2, s.z + 1);
    this.bird(first + 1, BIRD.ibis, 1.18, [s.x + 2, Number.isNaN(g2) ? g : g2, s.z + 1], a);
  }

  private bird(i: number, kind: number, scale: number, at: V3, lead: Bird | null): Bird {
    const seed = this.rnd();
    const b: Bird = {
      i,
      kind,
      seed,
      scale,
      x: at[0],
      y: at[1],
      z: at[2],
      yaw: this.rnd() * Math.PI * 2,
      lead,
      flight: null,
      stay: 10 + 40 * this.rnd(),
      home: [at[0], at[1], at[2]],
      head: 0,
      turn: 0,
      act: 0,
      actIn: 0,
      event: null,
      burst: false,
      wx: at[0],
      wz: at[2],
      walking: false,
    };
    this.flock.setup(i, kind, seed, 0.95 + 0.1 * this.rnd());
    this.birds.push(b);
    return b;
  }

  /** One update of every bird; `ex` the explorer's feet on foot or by boat (null otherwise); `overview`: the picker is up. */
  step(dt: number, now: number, ex: Walker | null, night: number, overview: boolean): void {
    const roost = (this.roost = night > 0.6);
    for (const b of this.birds) if (!b.lead) this.leader(b, dt, now, ex, roost, overview);
    for (const b of this.birds) if (b.lead) this.follower(b, dt, now);
    for (const b of this.birds) this.pose(b, now, roost);
  }

  private leader(b: Bird, dt: number, now: number, ex: Walker | null, roost: boolean, overview: boolean): void {
    if (b.flight) return this.fly(b, now);
    b.stay -= dt;
    // The explorer close by: off (far off at night, they sleep).
    let near = false;
    if (ex) {
      const d = Math.hypot(ex.x - b.x, ex.z - b.z);
      const shy = b.kind === BIRD.hornbill ? 22 : 28;
      near = d < (roost ? shy * 0.35 : shy) && (b.kind === BIRD.ibis || ex.y < b.y - 3);
    }
    if (near || (b.stay <= 0 && !roost)) {
      if (this.takeOff(b, now, ex, overview)) return;
      b.stay = 10 + 20 * this.rnd();
    }
    this.idle(b, dt, now, roost);
    if (b.kind === BIRD.ibis) this.wade(b, dt, roost);
  }

  /** Perched or on the bank: look about, preen or probe; the ibis walks a little along the bank. */
  private idle(b: Bird, dt: number, now: number, roost: boolean): void {
    b.actIn -= dt;
    if (b.actIn > 0) return;
    b.actIn = 3 + 6 * this.rnd();
    const r = this.rnd();
    b.act = 0;
    b.head = 0;
    b.turn = 0;
    if (roost) {
      b.head = 0.6;
      return;
    }
    if (b.kind === BIRD.ibis) {
      if (r < 0.45) b.act = 1;
      else if (r < 0.75 && !b.lead) {
        // A few steps along the bank.
        for (let k = 0; k < 4; k++) {
          const a = this.rnd() * Math.PI * 2;
          const x = b.home[0] + Math.sin(a) * 4 * this.rnd();
          const z = b.home[2] + Math.cos(a) * 4 * this.rnd();
          if (Number.isNaN(this.bankGround(x, z))) continue;
          b.wx = x;
          b.wz = z;
          b.walking = true;
          break;
        }
      } else b.turn = (this.rnd() * 2 - 1) * 0.9;
      if (this.rnd() < 0.08 && now > 5) b.event = 'call';
    } else {
      if (r < 0.2) b.head = 1;
      else b.turn = (this.rnd() * 2 - 1) * 0.9;
      if (this.rnd() < 0.12 && now > 5) b.event = 'call';
    }
  }

  private wade(b: Bird, dt: number, roost: boolean): void {
    if (!b.walking || roost) return;
    const dx = b.wx - b.x;
    const dz = b.wz - b.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.1) {
      b.walking = false;
      return;
    }
    b.yaw = Math.atan2(dx, dz);
    const go = Math.min(d, 0.35 * dt);
    const nx = b.x + (dx / d) * go;
    const nz = b.z + (dz / d) * go;
    const g = this.bankGround(nx, nz);
    if (Number.isNaN(g)) {
      b.walking = false;
      return;
    }
    b.x = nx;
    b.z = nz;
    b.y += (g - b.y) * Math.min(1, dt * 6);
  }

  /** Off to another perch or bank (away from the explorer if he is about). */
  private takeOff(b: Bird, now: number, ex: Walker | null, overview: boolean): boolean {
    const hornbill = b.kind === BIRD.hornbill;
    const spots: V3[] = hornbill
      ? this.perches.slice(0, overview ? Math.max(2, this.seen) : this.perches.length).map((c) => [c.x, c.y, c.z])
      : this.banks.map((s) => [s.x, this.bankGround(s.x, s.z), s.z]);
    const taken = this.birds.filter((o) => o !== b && !o.lead).map((o) => (o.flight ? o.flight.to : o.home));
    let best: V3 | null = null;
    let score = -Infinity;
    for (const s of spots) {
      if (Number.isNaN(s[1])) continue;
      const d = Math.hypot(s[0] - b.x, s[2] - b.z);
      if (d < (hornbill ? 45 : 40) || d > (hornbill ? 240 : 200) || taken.some((t) => Math.hypot(t[0] - s[0], t[2] - s[2]) < 10)) continue;
      const away = ex ? Math.hypot(s[0] - ex.x, s[2] - ex.z) : 100;
      if (ex && away < 40) continue;
      const sc = Math.min(away, 120) * 0.5 - Math.abs(d - (hornbill ? 120 : 90)) * 0.3 + this.rnd() * 30;
      if (sc > score) {
        score = sc;
        best = s;
      }
    }
    if (!best) return false;
    const from: V3 = [b.x, b.y, b.z];
    const to: V3 = [best[0], best[1], best[2]];
    const dx = to[0] - from[0];
    const dz = to[2] - from[2];
    const d = Math.hypot(dx, dz);
    const bend = (this.rnd() - 0.5) * 0.5 * d;
    const lift = hornbill ? 8 + 0.05 * d + Math.max(0, Math.max(from[1], to[1]) - Math.min(from[1], to[1])) * 0.3 : 5 + 0.03 * d;
    b.flight = {
      t0: now,
      dur: (d * 1.1) / (hornbill ? 9 : 8) + 2.5,
      from,
      to,
      cx: (from[0] + to[0]) / 2 + (-dz / d) * bend,
      cz: (from[2] + to[2]) / 2 + (dx / d) * bend,
      lift,
    };
    b.home = to;
    b.walking = false;
    b.event = 'off';
    for (const o of this.birds) if (o.lead === b) o.event = this.rnd() < 0.5 ? 'off' : null;
    return true;
  }

  private fly(b: Bird, now: number): void {
    const fl = b.flight!;
    const u = Math.min(1, (now - fl.t0) / fl.dur);
    this.along(b, fl, u, 0);
    if (u >= 1) {
      b.flight = null;
      b.stay = b.kind === BIRD.hornbill ? 25 + 45 * this.rnd() : 30 + 60 * this.rnd();
      b.head = 0;
      b.turn = 0;
      b.act = 0;
      b.actIn = 1;
    }
  }

  /** Place a bird `u` of the way along a flight, `side` m to the left of the line; bank into the turn, pitch with the climb. */
  private along(b: Bird, fl: Flight, u: number, side: number): void {
    flightAt(fl, u, P3);
    flightAt(fl, Math.min(1, u + 0.01), Q3);
    const h = Math.hypot(Q3[0] - P3[0], Q3[2] - P3[2]);
    const yaw = h > 1e-4 ? Math.atan2(Q3[0] - P3[0], Q3[2] - P3[2]) : b.yaw;
    // (how the heading turns a little further on: the bank)
    flightAt(fl, Math.min(1, u + 0.04), R3);
    flightAt(fl, Math.min(1, u + 0.05), Q3);
    const yaw2 = Math.hypot(Q3[0] - R3[0], Q3[2] - R3[2]) > 1e-4 ? Math.atan2(Q3[0] - R3[0], Q3[2] - R3[2]) : yaw;
    let turn = yaw2 - yaw;
    turn = Math.atan2(Math.sin(turn), Math.cos(turn));
    b.x = P3[0] + Math.cos(yaw) * side;
    b.z = P3[2] - Math.sin(yaw) * side;
    b.y = P3[1];
    b.turn = Math.max(-0.45, Math.min(0.45, -turn * 12));
    flightAt(fl, Math.min(1, u + 0.01), Q3);
    b.head = h > 1e-4 ? Math.max(-0.35, Math.min(0.35, -Math.atan2(Q3[1] - P3[1], h))) : 0;
    b.yaw = yaw;
    b.act = u < 0.18 || u > 0.86 ? 1 : 0;
  }

  /** The second of a pair: a little behind and beside its mate in flight, next to it at rest. */
  private follower(b: Bird, dt: number, now: number): void {
    const a = b.lead!;
    const side = 2.2;
    if (a.flight || b.flight) {
      if (!b.flight && a.flight) b.flight = a.flight;
      const fl = b.flight!;
      // (it follows a moment later, beside its mate, closing in to land)
      const u = Math.min(1, (now - fl.t0 - 0.9) / fl.dur);
      if (u <= 0) return this.idle(b, dt, now, this.roost);
      this.along(b, fl, u, side * (1 - 0.3 * Math.max(0, u - 0.85) / 0.15));
      b.y += 0.6 * Math.sin(Math.PI * u);
      // (down onto the leaves beside its mate, or the bank)
      if (u > 0.85) {
        const k = (u - 0.85) / 0.15;
        const land = b.kind === BIRD.hornbill ? this.perchY(b.x, b.z, fl.to[1]) : this.bankGround(b.x, b.z);
        if (!Number.isNaN(land)) b.y += (land - fl.to[1]) * k * k;
      }
      if (u >= 1) {
        b.flight = null;
        b.head = 0;
        b.turn = 0;
        b.act = 0;
        b.home = [b.x, b.y, b.z];
      }
      return;
    }
    // At rest beside its mate: on the perch, or wading near it.
    if (b.kind === BIRD.ibis) {
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      if (d > 4.5 && !b.walking) {
        b.wx = a.x + (b.x - a.x) * (2 / d);
        b.wz = a.z + (b.z - a.z) * (2 / d);
        b.walking = true;
      }
      b.home = [a.home[0], a.home[1], a.home[2]];
      this.wade(b, dt, this.roost);
    }
    this.idle(b, dt, now, this.roost);
  }

  private pose(b: Bird, now: number, roost: boolean): void {
    const fl = this.flock;
    const flying = !!b.flight && now - b.flight.t0 >= (b.lead ? 0.9 : 0);
    const moving = b.walking && !flying;
    fl.gait(b.i, flying ? 2 : moving ? 1 : 0, 1.6, now);
    fl.set(b.i, CH.rest, roost && !flying ? 1 : 0, now);
    fl.set(b.i, CH.head, Math.round(b.head * 20) / 20, now);
    fl.set(b.i, CH.turn, Math.round(b.turn * 20) / 20, now);
    fl.set(b.i, CH.act, b.act, now);
  }

  /** Put every bird on the map (or hide it, `far` m from the camera). */
  show(cx: number, cy: number, cz: number, far: (b: Bird) => number): void {
    for (const b of this.birds) {
      if (Math.hypot(b.x - cx, b.y - cy, b.z - cz) < far(b)) this.flock.place(b.i, b.x, b.y, b.z, b.yaw, b.scale);
      else this.flock.hide(b.i);
    }
  }
}
