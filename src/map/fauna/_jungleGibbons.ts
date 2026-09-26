import { mulberry32 } from '../../voxel/random';
import { CH, Model, type Flock, type Species } from './_kit';
import type { Walker } from './_landBrain';
import { canopyTop, type Canopy, type Crown, type Spot } from './_jungleSurvey';

/**
 * Pileated gibbons, the gibbons of Cambodia's forests: small apes with very
 * long arms and no tail, living as a family high in the crowns. The male is
 * black, the female silvery buff with a black cap and a black chest, both
 * with a white ring round the face (the male's white hands and feet too);
 * the young are buff.
 *
 * A family keeps to a few neighbouring crowns: they sit on the tops, look
 * about, eat, groom; then the mother leads them to another crown, swinging
 * under the gaps by the arms (brachiating) and leaping over the leaves, one
 * after the other. They watch the explorer from above and move off if he
 * comes right under them. In the morning the pair sings its duet (the
 * female's "great call", the male's phrases; jungle.ts plays it); at night
 * they sleep sitting hunched on a crown.
 *
 * Variants: 0 male (black), 1 female (buff, black cap and chest), 2 young.
 * Gait: 1 swinging by the arms, 2 leaping. Act: 1 sing, 2 the great call's
 * climax (arms up, bouncing), 3 eat, 4 groom.
 */

const S = { fur: 0, dark: 1, face: 2, ring: 3, hand: 4, eye: 5 };

const model = new Model()
  .bone('body', null, [0, 0.36, 0])
  .bone('head', 'body', [0, 0.66, 0.01])
  .boneLR('arm*', 'body', [0.115, 0.62, 0])
  .boneLR('fore*', 'arm*', [0.122, 0.33, 0])
  .boneLR('leg*', 'body', [0.06, 0.36, 0])
  .boneLR('shin*', 'leg*', [0.06, 0.18, 0]);

model
  // Body: chest and pelvis; the female's black chest.
  .box('body', [0, 0.5, 0], [0.2, 0.3, 0.15], S.fur)
  .box('body', [0, 0.37, -0.005], [0.17, 0.08, 0.13], S.fur)
  .box('body', [0, 0.52, 0.077], [0.13, 0.19, 0.01], S.dark)
  // Head: round skull with the dark cap, the face in its white ring, eyes and muzzle.
  .box('head', [0, 0.735, 0.015], [0.14, 0.13, 0.13], S.fur)
  .box('head', [0, 0.803, 0.01], [0.13, 0.02, 0.12], S.dark)
  .box('head', [0, 0.72, 0.083], [0.085, 0.085, 0.01], S.face)
  .box('head', [0, 0.768, 0.085], [0.11, 0.016, 0.012], S.ring)
  .boxLR('head', [0.05, 0.72, 0.084], [0.012, 0.07, 0.012], S.ring)
  .box('head', [0, 0.676, 0.084], [0.07, 0.012, 0.012], S.ring)
  .boxLR('head', [0.02, 0.735, 0.089], [0.018, 0.012, 0.004], S.eye)
  .box('head', [0, 0.698, 0.093], [0.045, 0.03, 0.016], S.face)
  // Long arms and hands.
  .boxLR('arm*', [0.12, 0.475, 0], [0.055, 0.29, 0.06], S.fur)
  .boxLR('fore*', [0.125, 0.18, 0], [0.05, 0.3, 0.055], S.fur)
  .boxLR('fore*', [0.125, -0.02, 0.005], [0.045, 0.1, 0.05], S.hand)
  // Short legs, long feet.
  .boxLR('leg*', [0.06, 0.27, 0], [0.075, 0.18, 0.085], S.fur)
  .boxLR('shin*', [0.06, 0.1, 0], [0.062, 0.16, 0.068], S.fur)
  .boxLR('shin*', [0.06, 0.012, 0.04], [0.06, 0.024, 0.13], S.hand);

const GLSL = /* glsl */ `
vec3 faunaBoneRot(int b, FaunaPose P) {
  float hang = P.walk;
  float leap = P.run;
  float still = 1.0 - hang - leap;
  float sit = P.rest * still;
  float sing = clamp(1.0 - abs(P.act - 1.0), 0.0, 1.0) * still;
  float climax = clamp(1.0 - abs(P.act - 2.0), 0.0, 1.0) * still;
  float eat = clamp(1.0 - abs(P.act - 3.0), 0.0, 1.0) * sit;
  float groom = clamp(1.0 - abs(P.act - 4.0), 0.0, 1.0) * sit;
  float down = max(P.head, 0.0);
  float sleep = sit * down * step(0.75, P.head);
  float shake = sin(P.t * 11.0 + P.seed * 5.0);
  if (b == B_BODY) {
    float pitch = 0.08 * sit + 0.3 * sleep + 1.15 * leap + 0.12 * climax * shake + 0.05 * sin(P.phase * 2.0) * hang;
    return vec3(pitch, 0.0, 0.22 * sin(P.phase) * hang);
  }
  if (b == B_HEAD) {
    float pitch = 0.5 * P.head * (1.0 - leap) - 0.45 * sing - 0.35 * climax - 1.0 * leap + 0.25 * sleep;
    return vec3(pitch, P.turn * 0.9 * (1.0 - leap), 0.0);
  }
  bool left = b == B_ARML || b == B_FOREL || b == B_LEGL || b == B_SHINL;
  float s = left ? 1.0 : -1.0;
  // Swinging: the arms reach up in turn, hand over hand.
  float reach = 0.5 + 0.5 * s * sin(P.phase);
  if (b == B_ARML || b == B_ARMR) {
    // (sitting at rest, the long arms folded over the knees; singing, spread; the climax, straight up)
    float rel = max(0.0, sit - sing - climax);
    float pitch = -0.5 * rel - (0.9 + 2.2 * reach) * hang - 2.4 * leap - 0.6 * sing - (2.9 + 0.25 * shake) * climax - 0.2 * sleep;
    float roll = 0.08 * rel + 0.2 * hang + 0.5 * leap + 0.55 * sing + 0.35 * climax - 0.1 * sleep;
    if (!left) pitch += -0.8 * eat - 0.5 * groom;
    return vec3(pitch, 0.0, s * roll);
  }
  if (b == B_FOREL || b == B_FORER) {
    float rel = max(0.0, sit - sing - climax);
    float pitch = -1.6 * rel - 0.9 * (1.0 - reach) * hang - 0.2 * leap - 0.5 * sing - 0.15 * climax - 0.3 * sleep;
    if (!left) pitch += 0.2 * eat + (0.3 + 0.35 * sin(P.t * 6.5 + P.seed * 4.0)) * groom;
    return vec3(pitch, 0.0, 0.0);
  }
  // Sitting crouched: knees drawn up, feet by the seat.
  if (b == B_LEGL || b == B_LEGR) return vec3(-2.1 * sit - 0.3 * sleep - 0.7 * hang + 0.5 * leap, 0.0, s * (0.3 * sit + 0.1 * hang));
  return vec3(2.45 * sit + 0.2 * sleep + 1.1 * hang + 0.6 * leap, 0.0, 0.0);
}

vec3 faunaRootMove(FaunaPose P) {
  float still = 1.0 - P.walk - P.run;
  float climax = clamp(1.0 - abs(P.act - 2.0), 0.0, 1.0) * still;
  // Sitting on the crown; the body's middle on the path when leaping.
  float bounce = 0.05 * climax * abs(sin(P.t * 5.5 + P.seed * 5.0));
  return vec3(0.0, -0.3 * P.rest * still - 0.3 * P.run + bounce, 0.0);
}
`;

export const GIBBON: Species = {
  name: 'gibbon',
  model,
  palettes: [
    [0x1b1918, 0x131111, 0x2a2220, 0xd4d0c6, 0xcfc8ba, 0x0c0808],
    [0xc4ad84, 0x1f1b19, 0x2e2622, 0xe2dccb, 0xb8a078, 0x0c0808],
    [0xbba684, 0x8a7458, 0x3a2e28, 0xdcd4c2, 0xb09a78, 0x0c0808],
  ],
  glsl: GLSL,
  ease: [0.22, 0.6, 0.4, 0.4, 0.5],
};

/** Size over real life (as the roaming explorer: they are seen high up). */
const SIZE = 1.45;
/** Explorer distances (m, on the map): they watch him, and move off. */
const WATCH = 24;
const SHY = 13;
/** Crowns a family keeps to: within this of its grove (m); neighbours when this close (m) and this far up or down. */
const RANGE = 42;
const REACH = 11;
const STEP_Y = 4.5;
/** Swinging speed (m/s) and the longest single swing (m). */
const SPEED = 4.2;
const HOP = 6;
/** The song's length (s) and the female's climax in it (s from the start: the trill in audio/animals.ts `gibbon`). */
export const SONG = 14;
const CLIMAX: [number, number] = [6.6, 9.8];

interface Hop {
  x0: number;
  y0: number;
  z0: number;
  x1: number;
  y1: number;
  z1: number;
  /** Swung under a gap (hanging by the arms), else leapt over the leaves. */
  under: boolean;
  dur: number;
}

interface Ape {
  i: number;
  variant: number;
  scale: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Seat on this crown (offset from the crown's top). */
  seat: [number, number];
  hops: Hop[];
  hop: number;
  hopT: number;
  /** Seconds before it follows the leader. */
  wait: number;
  /** Idle activity and when to change it. */
  act: number;
  actIn: number;
  turn: number;
}

export type FamilyEvent = 'song' | 'hoot' | null;

export class Family {
  readonly apes: Ape[] = [];
  /** Crowns of the territory, and their neighbours. */
  readonly crowns: Crown[];
  private readonly nbr: number[][];
  at: number;
  x: number;
  y: number;
  z: number;
  private restFor: number;
  private readonly rnd: () => number;
  /** The song: its start (s), and when the next may come. */
  songAt = -1e9;
  private nextSong: number;
  private nextHoot: number;
  /** Something to call out (read and cleared by jungle.ts). */
  event: FamilyEvent = null;
  asleep = false;

  constructor(
    private readonly flock: Flock,
    private readonly cn: Canopy,
    crowns: Crown[],
    first: number,
    seed: number,
  ) {
    this.rnd = mulberry32(seed);
    this.crowns = crowns;
    this.nbr = crowns.map((a) =>
      crowns.map((b, j) => (b !== a && Math.hypot(a.x - b.x, a.z - b.z) <= REACH && Math.abs(a.y - b.y) <= STEP_Y ? j : -1)).filter((j) => j >= 0),
    );
    this.at = 0;
    const c = crowns[0];
    this.x = c.x;
    this.y = c.y;
    this.z = c.z;
    this.restFor = 5 + 20 * this.rnd();
    this.nextSong = 20 + 60 * this.rnd();
    this.nextHoot = 60 + 200 * this.rnd();
    // Mother, father, one or two young.
    const young = this.rnd() < 0.5 ? 2 : 1;
    const variants = [1, 0, ...Array(young).fill(2)];
    const SEATS: [number, number][] = [
      [0, 0],
      [1.3, 0.6],
      [-1.1, 1.0],
      [0.4, -1.3],
    ];
    variants.forEach((v, k) => {
      const i = first + k;
      const ape: Ape = {
        i,
        variant: v,
        scale: SIZE * (v === 2 ? 0.62 + 0.12 * (k - 2) : v === 0 ? 1.04 : 1),
        x: c.x,
        y: c.y,
        z: c.z,
        yaw: this.rnd() * Math.PI * 2,
        seat: SEATS[k],
        hops: [],
        hop: 0,
        hopT: 0,
        wait: 0,
        act: 0,
        actIn: this.rnd() * 6,
        turn: 0,
      };
      this.seatOn(ape, c);
      flock.setup(i, v, this.rnd(), 0.94 + 0.12 * this.rnd());
      flock.set(i, CH.rest, 1, 0, true);
      this.apes.push(ape);
    });
  }

  /** Sit an ape on its seat of a crown (on the leaves there, or on the top). */
  private seatOn(a: Ape, c: Crown): void {
    const x = c.x + a.seat[0];
    const z = c.z + a.seat[1];
    const y = canopyTop(this.cn, x, z);
    if (y > c.y - 1.6) {
      a.x = x;
      a.y = y;
      a.z = z;
    } else {
      a.x = c.x + a.seat[0] * 0.3;
      a.y = c.y;
      a.z = c.z + a.seat[1] * 0.3;
    }
  }

  get moving(): boolean {
    return this.apes.some((a) => a.hops.length > 0);
  }

  /** One update: `ex` the explorer's feet on foot (null otherwise), `clock` the time of day (types.ts `clock`). */
  step(dt: number, now: number, ex: Walker | null, night: number, clock: number): void {
    const fl = this.flock;
    const moving = this.moving;
    this.asleep = night > 0.62;
    const singing = now - this.songAt < SONG;
    // ── The explorer below ──
    let d = Infinity;
    if (ex && ex.y < this.y - 2) d = Math.hypot(ex.x - this.x, ex.z - this.z);
    if (!moving && !singing && d < (this.asleep ? SHY * 0.5 : SHY)) this.moveAway(ex!);
    else if (!moving) {
      // ── Rest, song, then off to another crown ──
      this.restFor -= dt;
      const morning = clock > 0.72 && clock < 0.95;
      if (!this.asleep && !singing && now > this.nextSong && d > SHY) {
        if (morning || this.rnd() < dt / 400) {
          this.songAt = now;
          this.event = 'song';
          this.nextSong = now + (morning ? 80 + 120 * this.rnd() : 300 + 300 * this.rnd());
          this.restFor = Math.max(this.restFor, SONG + 4);
        } else this.nextSong = now + 20;
      }
      if (!this.asleep && !singing && now > this.nextHoot) {
        this.nextHoot = now + 90 + 240 * this.rnd();
        if (d > SHY) this.event = 'hoot';
      }
      if (this.restFor <= 0 && !this.asleep && !singing) this.wander();
    }
    // ── Each ape ──
    const watch = d < WATCH && !this.asleep;
    for (const a of this.apes) {
      if (a.hops.length) this.swing(a, dt, now);
      else {
        a.actIn -= dt;
        if (a.actIn <= 0) {
          a.actIn = 4 + 8 * this.rnd();
          const r = this.rnd();
          a.act = r < 0.45 ? 0 : r < 0.7 ? 3 : r < 0.85 && a.variant === 2 ? 4 : 0;
          a.turn = this.rnd() < 0.4 ? 0 : (this.rnd() * 2 - 1) * 0.9;
          if (this.rnd() < 0.2) a.yaw += (this.rnd() - 0.5) * 2;
        }
        let act = a.act;
        let head = 0;
        let turn = a.turn;
        if (singing) {
          const s = now - this.songAt;
          act = a.variant === 1 && s > CLIMAX[0] && s < CLIMAX[1] ? 2 : a.variant === 2 && s < 5 ? 0 : 1;
          head = -0.3;
          turn = 0;
        } else if (this.asleep) {
          act = 0;
          head = 1;
          turn = 0;
        } else if (watch && ex) {
          // Look down at him.
          const want = Math.atan2(ex.x - a.x, ex.z - a.z);
          let dy = want - a.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          if (Math.abs(dy) > 1.1) a.yaw += Math.sign(dy) * Math.min(Math.abs(dy) - 1, dt * 1.5);
          turn = Math.max(-1, Math.min(1, dy / 1.1));
          head = 0.6;
          act = 0;
        }
        fl.gait(a.i, 0, 1, now);
        fl.set(a.i, CH.rest, 1, now);
        fl.set(a.i, CH.act, act, now);
        fl.set(a.i, CH.head, head, now);
        fl.set(a.i, CH.turn, Math.round(turn * 10) / 10, now);
      }
    }
    const lead = this.apes[0];
    this.x = lead.x;
    this.y = lead.y;
    this.z = lead.z;
  }

  /** Off to a crown one to three steps away. */
  private wander(): void {
    const path = [this.at];
    const hops = 1 + Math.floor(this.rnd() * 3);
    for (let k = 0; k < hops; k++) {
      const n = this.nbr[path[path.length - 1]].filter((j) => !path.includes(j));
      if (!n.length) break;
      path.push(n[Math.floor(this.rnd() * n.length)]);
    }
    this.restFor = 15 + 35 * this.rnd();
    if (path.length > 1) this.go(path);
  }

  /** Away from the explorer: the reachable crown farthest from him. */
  private moveAway(ex: Walker): void {
    // (breadth first over the neighbours, up to six steps)
    const prev = new Map<number, number>([[this.at, -1]]);
    let front = [this.at];
    for (let s = 0; s < 6 && front.length; s++) {
      const next: number[] = [];
      for (const c of front)
        for (const j of this.nbr[c])
          if (!prev.has(j)) {
            prev.set(j, c);
            next.push(j);
          }
      front = next;
    }
    let best = -1;
    let bd = Math.hypot(this.crowns[this.at].x - ex.x, this.crowns[this.at].z - ex.z) + 6;
    for (const j of prev.keys()) {
      const dj = Math.hypot(this.crowns[j].x - ex.x, this.crowns[j].z - ex.z);
      if (dj > bd) {
        bd = dj;
        best = j;
      }
    }
    this.restFor = 20 + 20 * this.rnd();
    if (best < 0) return;
    const path: number[] = [];
    for (let c = best; c >= 0; c = prev.get(c)!) path.unshift(c);
    this.go(path);
  }

  /** Every ape swings along the crowns of `path`, the mother first, the others a little after. */
  private go(path: number[]): void {
    this.at = path[path.length - 1];
    this.apes.forEach((a, k) => {
      const pts: [number, number, number][] = [[a.x, a.y, a.z]];
      for (let p = 1; p < path.length; p++) {
        const c = this.crowns[path[p]];
        const last = p === path.length - 1;
        const x = c.x + (last ? a.seat[0] : a.seat[0] * 0.3);
        const z = c.z + (last ? a.seat[1] : a.seat[1] * 0.3);
        const top = canopyTop(this.cn, x, z);
        pts.push([x, top > c.y - 1.6 ? top : c.y, z]);
      }
      a.hops = [];
      for (let p = 1; p < pts.length; p++) {
        const [x0, y0, z0] = pts[p - 1];
        const [x1, y1, z1] = pts[p];
        const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / HOP));
        let px = x0;
        let py = y0;
        let pz = z0;
        for (let s = 1; s <= n; s++) {
          const u = s / n;
          const qx = x0 + (x1 - x0) * u;
          const qz = z0 + (z1 - z0) * u;
          const line = y0 + (y1 - y0) * u;
          const top = canopyTop(this.cn, qx, qz);
          const qy = s < n && Math.abs(top - line) < 2.5 ? top : line;
          const mx = (px + qx) / 2;
          const mz = (pz + qz) / 2;
          const mid = canopyTop(this.cn, mx, mz);
          const d = Math.hypot(qx - px, qz - pz, qy - py);
          a.hops.push({ x0: px, y0: py, z0: pz, x1: qx, y1: qy, z1: qz, under: !(mid > Math.min(py, qy) - 1), dur: 0.55 + d / SPEED });
          px = qx;
          py = qy;
          pz = qz;
        }
      }
      a.hop = 0;
      a.hopT = 0;
      a.wait = k === 0 ? 0 : k * (0.9 + 0.8 * this.rnd());
      a.act = 0;
    });
  }

  private swing(a: Ape, dt: number, now: number): void {
    const fl = this.flock;
    if (a.wait > 0) {
      a.wait -= dt;
      fl.set(a.i, CH.act, 0, now);
      fl.set(a.i, CH.head, 0, now);
      return;
    }
    const h = a.hops[a.hop];
    a.hopT += dt;
    const u = Math.min(1, a.hopT / h.dur);
    const d = Math.hypot(h.x1 - h.x0, h.z1 - h.z0);
    a.x = h.x0 + (h.x1 - h.x0) * u;
    a.z = h.z0 + (h.z1 - h.z0) * u;
    const line = h.y0 + (h.y1 - h.y0) * u;
    const arc = Math.sin(Math.PI * u);
    // (under a gap the body swings down below the line of the hand holds; over the leaves it leaps)
    a.y = h.under ? line - (0.9 + 0.22 * d) * arc : line + (0.3 + 0.08 * d) * arc;
    if (d > 0.3) a.yaw = Math.atan2(h.x1 - h.x0, h.z1 - h.z0);
    fl.gait(a.i, h.under ? 1 : 2, 0.5 / h.dur, now);
    fl.set(a.i, CH.rest, 0, now);
    fl.set(a.i, CH.act, 0, now);
    fl.set(a.i, CH.head, 0, now);
    fl.set(a.i, CH.turn, 0, now);
    if (u >= 1) {
      a.hop++;
      a.hopT = 0;
      if (a.hop >= a.hops.length) {
        a.hops = [];
        a.actIn = 1 + 3 * this.rnd();
        a.yaw += (this.rnd() - 0.5) * 1.5;
      }
    }
  }

  /** Far from every camera: finish any swing at once (no updates until someone comes near). */
  freeze(now: number): void {
    for (const a of this.apes) {
      if (!a.hops.length) continue;
      const last = a.hops[a.hops.length - 1];
      a.x = last.x1;
      a.y = last.y1;
      a.z = last.z1;
      a.hops = [];
      this.flock.gait(a.i, 0, 1, now);
      this.flock.set(a.i, CH.rest, 1, now);
    }
  }

  /** Put every ape on the map (or hide it, `far` m from the camera). */
  show(cx: number, cy: number, cz: number, far: number): void {
    for (const a of this.apes) {
      if (Math.hypot(a.x - cx, a.y - cy, a.z - cz) < far) this.flock.place(a.i, a.x, a.y, a.z, a.yaw, a.scale);
      else this.flock.hide(a.i);
    }
  }
}

/** The crowns of a family's grove: those within `RANGE` of it that it can swing between from its middle one. */
export function territory(cn: Canopy, g: Spot): Crown[] {
  const near = cn.crowns.filter((c) => c.h >= 8 && Math.hypot(c.x - g.x, c.z - g.z) < RANGE);
  if (near.length < 4) return [];
  near.sort((a, b) => Math.hypot(a.x - g.x, a.z - g.z) - Math.hypot(b.x - g.x, b.z - g.z));
  // (the ones joined to the middle crown)
  const keep = new Set([0]);
  let front = [0];
  while (front.length) {
    const next: number[] = [];
    for (const i of front)
      near.forEach((b, j) => {
        const a = near[i];
        if (!keep.has(j) && Math.hypot(a.x - b.x, a.z - b.z) <= REACH && Math.abs(a.y - b.y) <= STEP_Y) {
          keep.add(j);
          next.push(j);
        }
      });
    front = next;
  }
  return keep.size >= 4 ? [...keep].sort((a, b) => a - b).map((i) => near[i]) : [];
}

/** Members of a new family (for sizing the flock before it is made). */
export const FAMILY_MAX = 4;
