import { mulberry32 } from '../../voxel/random';
import { SURFACE } from '../heightfield';
import { CH, Model, type Flock, type Species } from './_kit';
import type { Ground, Walker } from './_landBrain';
import type { Canopy, Trunk } from './_jungleSurvey';
import { len2 } from './_len';

/**
 * Small life round the roaming explorer, one small pool of animals that
 * keeps near him (they are too small to see further off):
 *
 * - a variable squirrel on a tree trunk (rusty grey, or the cream form):
 *   it clings, flicks its bushy tail, runs up or down in spurts, scolds him
 *   when he comes close, then dashes up into the crown;
 * - a water monitor by the water: basks on the bank, tongue flicking, walks
 *   slowly; slips into the water and under when he comes near;
 * - an oriental whip snake, thin and bright green, lying over a bush with
 *   its head raised, swaying a little; slides away into the leaves if he
 *   comes right up;
 * - jungle skinks, bronze with a dark side stripe, on the forest floor:
 *   short dashes, head bobs, gone under the leaves when he comes by.
 *
 * All of them are about by day only. One model with each kind's own bones
 * (`q*` squirrel, `m*` monitor, `n*` snake, `k*` skink); variants 0 and 4
 * are the two squirrels.
 *
 * Channels: gait 0 still, 1 walk / crawl / climb, 2 run; rest (squirrel)
 * 1 = clinging to a trunk head up, −1 head down; head −1 up ‥ 1 down; turn;
 * act 1 = tongue flicking (monitor, snake) / tail flicks (squirrel).
 */

export const SMALL = { squirrel: 0, monitor: 1, snake: 2, skink: 3, squirrel2: 4 } as const;
const Q = (1 << SMALL.squirrel) | (1 << SMALL.squirrel2);
const M = 1 << SMALL.monitor;
const N = 1 << SMALL.snake;
const K = 1 << SMALL.skink;

const S = { qback: 0, qbelly: 1, qtail: 2, qtip: 3, eye: 4, mskin: 5, mspot: 6, mbelly: 7, tongue: 8, green: 9, stripe: 10, neye: 11, kback: 12, kside: 13, kflank: 14 };

const model = new Model()
  // Squirrel: a root that tilts it onto the trunk, the body on it.
  .bone('qroot', null, [0, 0, 0])
  .bone('qbody', 'qroot', [0, 0.07, 0])
  .bone('qhead', 'qbody', [0, 0.09, 0.08])
  .bone('qtail', 'qbody', [0, 0.08, -0.09])
  .bone('qtip', 'qtail', [0, 0.08, -0.18])
  .boneLR('qfleg*', 'qbody', [0.03, 0.06, 0.06])
  .boneLR('qhleg*', 'qbody', [0.035, 0.07, -0.05])
  // Monitor.
  .bone('mbody', null, [0, 0.1, 0])
  .bone('mneck', 'mbody', [0, 0.11, 0.23])
  .bone('mhead', 'mneck', [0, 0.11, 0.35])
  .bone('mtongue', 'mhead', [0, 0.1, 0.52])
  .bone('mtail1', 'mbody', [0, 0.1, -0.22])
  .bone('mtail2', 'mtail1', [0, 0.09, -0.48])
  .bone('mtail3', 'mtail2', [0, 0.075, -0.74])
  .boneLR('mfleg*', 'mbody', [0.1, 0.1, 0.16])
  .boneLR('mhleg*', 'mbody', [0.1, 0.1, -0.16])
  // Snake: from the middle, forward to the head and back to the tail.
  .bone('n1', null, [0, 0.02, 0])
  .bone('n2', 'n1', [0, 0.02, 0.18])
  .bone('n3', 'n2', [0, 0.02, 0.36])
  .bone('nhead', 'n3', [0, 0.02, 0.52])
  .bone('n0', 'n1', [0, 0.02, 0])
  .bone('nb1', 'n0', [0, 0.02, -0.18])
  .bone('nb2', 'nb1', [0, 0.02, -0.36])
  // Skink.
  .bone('kbody', null, [0, 0.03, 0])
  .bone('khead', 'kbody', [0, 0.032, 0.075])
  .bone('ktail', 'kbody', [0, 0.03, -0.075])
  .bone('ktip', 'ktail', [0, 0.026, -0.165])
  .boneLR('kfleg*', 'kbody', [0.025, 0.03, 0.045])
  .boneLR('khleg*', 'kbody', [0.025, 0.03, -0.045]);

model
  // ── Squirrel ──
  .box('qbody', [0, 0.07, 0], [0.075, 0.075, 0.18], S.qback, Q)
  .box('qbody', [0, 0.037, 0.01], [0.06, 0.012, 0.14], S.qbelly, Q)
  .box('qhead', [0, 0.1, 0.115], [0.055, 0.055, 0.06], S.qback, Q)
  .box('qhead', [0, 0.092, 0.152], [0.035, 0.035, 0.025], S.qback, Q)
  .boxLR('qhead', [0.017, 0.133, 0.103], [0.012, 0.018, 0.01], S.qback, Q)
  .boxLR('qhead', [0.028, 0.106, 0.125], [0.004, 0.012, 0.012], S.eye, Q)
  .box('qtail', [0, 0.085, -0.135], [0.06, 0.06, 0.1], S.qtail, Q)
  .box('qtip', [0, 0.085, -0.245], [0.075, 0.075, 0.13], S.qtip, Q)
  .boxLR('qfleg*', [0.03, 0.03, 0.065], [0.02, 0.06, 0.025], S.qback, Q)
  .boxLR('qhleg*', [0.035, 0.035, -0.05], [0.025, 0.06, 0.055], S.qback, Q)
  // ── Water monitor ──
  .box('mbody', [0, 0.11, 0], [0.2, 0.11, 0.46], S.mskin, M)
  .box('mbody', [0, 0.055, 0], [0.16, 0.01, 0.4], S.mbelly, M)
  .boxLR('mbody', [0.055, 0.167, 0.12], [0.03, 0.006, 0.03], S.mspot, M)
  .boxLR('mbody', [0.05, 0.167, 0.0], [0.03, 0.006, 0.035], S.mspot, M)
  .boxLR('mbody', [0.055, 0.167, -0.12], [0.03, 0.006, 0.03], S.mspot, M)
  .boxLR('mbody', [0.101, 0.12, -0.05], [0.004, 0.025, 0.05], S.mspot, M)
  .box('mneck', [0, 0.115, 0.29], [0.1, 0.08, 0.13], S.mskin, M)
  .box('mhead', [0, 0.115, 0.415], [0.09, 0.065, 0.14], S.mskin, M)
  .box('mhead', [0, 0.103, 0.5], [0.06, 0.045, 0.06], S.mskin, M)
  .boxLR('mhead', [0.046, 0.128, 0.42], [0.004, 0.012, 0.014], S.eye, M)
  .box('mtongue', [0, 0.098, 0.56], [0.012, 0.004, 0.08], S.tongue, M)
  .box('mtail1', [0, 0.1, -0.35], [0.13, 0.09, 0.26], S.mskin, M)
  .box('mtail1', [0, 0.147, -0.35], [0.1, 0.006, 0.04], S.mspot, M)
  .box('mtail2', [0, 0.09, -0.61], [0.09, 0.07, 0.26], S.mskin, M)
  .box('mtail2', [0, 0.127, -0.6], [0.07, 0.006, 0.035], S.mspot, M)
  .box('mtail3', [0, 0.075, -0.86], [0.05, 0.05, 0.24], S.mskin, M)
  .boxLR('mfleg*', [0.145, 0.09, 0.16], [0.09, 0.04, 0.045], S.mskin, M)
  .boxLR('mfleg*', [0.185, 0.045, 0.17], [0.035, 0.08, 0.035], S.mskin, M)
  .boxLR('mfleg*', [0.195, 0.008, 0.195], [0.05, 0.016, 0.06], S.mskin, M)
  .boxLR('mhleg*', [0.145, 0.09, -0.16], [0.09, 0.045, 0.05], S.mskin, M)
  .boxLR('mhleg*', [0.185, 0.045, -0.17], [0.04, 0.08, 0.04], S.mskin, M)
  .boxLR('mhleg*', [0.195, 0.008, -0.14], [0.055, 0.016, 0.07], S.mskin, M)
  // ── Whip snake ──
  .box('n1', [0, 0.022, 0.09], [0.03, 0.028, 0.19], S.green, N)
  .box('n2', [0, 0.022, 0.27], [0.028, 0.026, 0.19], S.green, N)
  .box('n3', [0, 0.022, 0.44], [0.026, 0.024, 0.17], S.green, N)
  .box('nhead', [0, 0.024, 0.555], [0.034, 0.022, 0.075], S.green, N)
  .box('nhead', [0, 0.021, 0.605], [0.018, 0.015, 0.03], S.green, N)
  .boxLR('nhead', [0.017, 0.03, 0.56], [0.004, 0.01, 0.012], S.neye, N)
  .box('n0', [0, 0.022, -0.09], [0.03, 0.028, 0.19], S.green, N)
  .box('nb1', [0, 0.02, -0.27], [0.025, 0.024, 0.19], S.green, N)
  .box('nb2', [0, 0.018, -0.44], [0.018, 0.018, 0.17], S.green, N)
  .box('nb2', [0, 0.016, -0.56], [0.01, 0.012, 0.08], S.green, N)
  .boxLR('n1', [0.0155, 0.014, 0.09], [0.002, 0.006, 0.19], S.stripe, N)
  .boxLR('n2', [0.0145, 0.014, 0.27], [0.002, 0.006, 0.19], S.stripe, N)
  .boxLR('n0', [0.0155, 0.014, -0.09], [0.002, 0.006, 0.19], S.stripe, N)
  .boxLR('nb1', [0.013, 0.013, -0.27], [0.002, 0.006, 0.19], S.stripe, N)
  // ── Skink ──
  .box('kbody', [0, 0.03, 0], [0.05, 0.035, 0.15], S.kback, K)
  .boxLR('kbody', [0.026, 0.032, 0], [0.004, 0.012, 0.15], S.kside, K)
  .boxLR('kbody', [0.026, 0.019, 0.005], [0.004, 0.01, 0.12], S.kflank, K)
  .box('khead', [0, 0.032, 0.1], [0.04, 0.03, 0.05], S.kback, K)
  .boxLR('khead', [0.021, 0.036, 0.105], [0.004, 0.008, 0.01], S.eye, K)
  .box('ktail', [0, 0.028, -0.12], [0.035, 0.028, 0.1], S.kback, K)
  .box('ktip', [0, 0.022, -0.215], [0.02, 0.02, 0.1], S.kback, K)
  .boxLR('kfleg*', [0.04, 0.015, 0.05], [0.03, 0.012, 0.012], S.kback, K)
  .boxLR('khleg*', [0.04, 0.015, -0.045], [0.032, 0.012, 0.014], S.kback, K);

const GLSL = /* glsl */ `
vec3 faunaBoneRot(int b, FaunaPose P) {
  float move = clamp(P.gait, 0.0, 1.0);
  float flick = step(0.5, P.act);
  // ── Squirrel ──
  if (b == B_QROOT) return vec3(-P.rest * 1.5708, 0.0, 0.0);
  if (b == B_QBODY) return vec3(0.12 * sin(P.phase) * P.run, 0.0, 0.0);
  if (b == B_QHEAD) return vec3(0.5 * P.head + 0.1 * sin(P.phase) * P.run, P.turn * 0.8, 0.0);
  if (b == B_QTAIL) {
    // Arched up over the back at rest, streaming out behind running; flicks in bursts.
    float f = flick * 0.35 * sin(P.t * 17.0) * step(0.3, sin(P.t * 2.3 + P.seed * 9.0));
    return vec3(1.0 - 0.75 * P.run - 0.35 * P.walk + f, 0.0, 0.0);
  }
  if (b == B_QTIP) {
    float f = flick * 0.5 * sin(P.t * 17.0 - 0.8) * step(0.3, sin(P.t * 2.3 + P.seed * 9.0));
    return vec3(0.7 - 0.6 * P.run - 0.3 * P.walk + f, 0.08 * sin(P.t * 1.3 + P.seed * 5.0), 0.0);
  }
  if (b == B_QFLEGL || b == B_QFLEGR) return vec3(-sin(P.phase) * 0.8 * move, 0.0, 0.0);
  if (b == B_QHLEGL || b == B_QHLEGR) return vec3(-sin(P.phase + 3.1416) * 0.9 * move, 0.0, 0.0);
  // ── Monitor: the body snakes from side to side as it walks ──
  float wave = P.phase;
  float wig = 0.03 * sin(P.t * 0.6 + P.seed * 7.0);
  if (b == B_MBODY) return vec3(0.0, 0.12 * sin(wave) * move, 0.0);
  if (b == B_MNECK) return vec3(-0.25 * max(-P.head, 0.0) + 0.1 * max(P.head, 0.0), -0.1 * sin(wave) * move + P.turn * 0.35, 0.0);
  if (b == B_MHEAD) return vec3(-0.1 * max(-P.head, 0.0), P.turn * 0.35, 0.0);
  if (b == B_MTONGUE) {
    // Out in quick flicks, else drawn back into the mouth.
    float flicked = flick * step(0.0, sin(P.t * 9.0 + P.seed * 3.0)) * step(-0.3, sin(P.t * 1.1 + P.seed * 11.0));
    return vec3(0.12 * sin(P.t * 40.0) * flicked, 3.1416 * (1.0 - flicked), 0.0);
  }
  if (b == B_MTAIL1) return vec3(0.0, -0.2 * sin(wave - 0.8) * move + wig, 0.0);
  if (b == B_MTAIL2) return vec3(0.0, -0.25 * sin(wave - 1.6) * move + wig * 1.5, 0.0);
  if (b == B_MTAIL3) return vec3(0.0, -0.3 * sin(wave - 2.4) * move + wig * 2.0, 0.0);
  if (b == B_MFLEGL || b == B_MFLEGR || b == B_MHLEGL || b == B_MHLEGR) {
    // Sprawling steps: the legs swing forward and back out at the sides, diagonal pairs.
    float sd = (b == B_MFLEGL || b == B_MHLEGL) ? 1.0 : -1.0;
    float hind = (b == B_MHLEGL || b == B_MHLEGR) ? 1.0 : 0.0;
    float th = wave + (sd > 0.0 ? 0.0 : 3.1416) + hind * 3.1416;
    return vec3(0.0, sd * 0.55 * sin(th) * move, sd * 0.25 * max(0.0, cos(th)) * move);
  }
  // ── Snake: a slow S, a crawl's travelling wave; the front raised, the head level ──
  float crawl = move;
  float k = 1.4;
  if (b == B_N1 || b == B_N2 || b == B_N3 || b == B_NHEAD || b == B_N0 || b == B_NB1 || b == B_NB2) {
    float i = b == B_NB2 ? -3.0 : b == B_NB1 ? -2.0 : b == B_N0 ? -1.0 : b == B_N1 ? 0.0 : b == B_N2 ? 1.0 : b == B_N3 ? 2.0 : 3.0;
    float rest = 0.32 * sin(i * 1.3 + P.seed * 6.0 + 0.25 * sin(P.t * 0.35 + P.seed * 4.0));
    float yaw = mix(rest, 0.42 * sin(i * k - P.phase), crawl);
    if (b == B_N1) yaw *= 0.5;
    float lift = max(-P.head, 0.0);
    if (b == B_N3) return vec3(-0.45 * lift * (1.0 - 0.6 * crawl), yaw, 0.0);
    if (b == B_NHEAD) return vec3(0.4 * lift * (1.0 - 0.6 * crawl), yaw * 0.5 + P.turn * 0.6 + 0.08 * sin(P.t * 0.9 + P.seed * 3.0), 0.0);
    return vec3(0.0, yaw, 0.0);
  }
  // ── Skink ──
  if (b == B_KBODY) return vec3(0.0, 0.18 * sin(P.phase) * move, 0.0);
  if (b == B_KHEAD) {
    float bob = 0.25 * max(0.0, sin(P.t * 5.0 + P.seed * 8.0)) * step(0.7, sin(P.t * 0.7 + P.seed * 13.0)) * (1.0 - move);
    return vec3(-0.25 * max(-P.head, 0.0) - bob, P.turn * 0.6 - 0.15 * sin(P.phase) * move, 0.0);
  }
  if (b == B_KTAIL) return vec3(0.0, -0.3 * sin(P.phase - 0.9) * move + wig, 0.0);
  if (b == B_KTIP) return vec3(0.0, -0.4 * sin(P.phase - 1.8) * move + wig * 2.0, 0.0);
  float sd = (b == B_KFLEGL || b == B_KHLEGL) ? 1.0 : -1.0;
  float hind = (b == B_KHLEGL || b == B_KHLEGR) ? 1.0 : 0.0;
  float th = P.phase + (sd > 0.0 ? 0.0 : 3.1416) + hind * 3.1416;
  return vec3(0.0, sd * 0.6 * sin(th) * move, 0.0);
}

vec3 faunaRootMove(FaunaPose P) {
  return vec3(0.0);
}
`;

export const CRITTERS: Species = {
  name: 'smalllife',
  model,
  palettes: [
    // rusty grey squirrel
    [0x6e6258, 0xa0522e, 0x6a5e54, 0x8a7a6a, 0x0a0808, 0, 0, 0, 0, 0, 0, 0, 0x7a5a32, 0x2a2018, 0xb0602a],
    // water monitor
    [0, 0, 0, 0, 0x0a0808, 0x2e3028, 0xb8a44a, 0x8a8458, 0x6a3a50, 0, 0, 0, 0, 0, 0],
    // whip snake
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0x74c040, 0xe2eaa0, 0xd8c040, 0, 0, 0],
    // skink
    [0, 0, 0, 0, 0x0a0808, 0, 0, 0, 0, 0, 0, 0, 0x7a5a32, 0x2a2018, 0xb0602a],
    // cream squirrel
    [0xd8cbb0, 0xe8dcc4, 0xd4c6aa, 0xa06a48, 0x0a0808, 0, 0, 0, 0, 0, 0, 0, 0x7a5a32, 0x2a2018, 0xb0602a],
  ],
  glsl: GLSL,
  ease: [0.12, 0.25, 0.3, 0.3, 0.2],
};

// ── The pool ────────────────────────────────────────────────────────────────

type Kind = 'squirrel' | 'monitor' | 'snake' | 'skink';

/** Sizes over real life (seen from the follow camera, as the explorer is 1.4 × his size). */
const SIZE: Record<Kind, number> = { squirrel: 1.7, monitor: 1.2, snake: 1.5, skink: 1.8 };
/** Where they turn up round him (m), and when they are let go (m). */
const RING: Record<Kind, [number, number]> = { squirrel: [7, 20], monitor: [9, 24], snake: [5, 14], skink: [5, 13] };
const GONE = 36;
/** How close he may come (m). */
const SHY: Record<Kind, number> = { squirrel: 6, monitor: 7, snake: 2.8, skink: 3.5 };

interface Critter {
  kind: Kind;
  i: number;
  variant: number;
  scale: number;
  on: boolean;
  x: number;
  y: number;
  z: number;
  yaw: number;
  state: 'idle' | 'move' | 'flee' | 'hide';
  timer: number;
  /** Target of a move. */
  tx: number;
  ty: number;
  tz: number;
  /** Squirrel: its trunk and the heights it climbs between; monitor: where the water is. */
  trunk: Trunk | null;
  y0: number;
  y1: number;
  wx: number;
  wz: number;
  /** Something to call out (read and cleared by jungle.ts). */
  event: 'scold' | null;
  scolded: number;
}

export class SmallLife {
  readonly critters: Critter[] = [];
  private readonly rnd = mulberry32(9151);
  private spawnIn = 0;
  private turn = 0;

  constructor(
    readonly flock: Flock,
    private readonly cn: Canopy,
    private readonly floor: Ground,
    /** A headless still (they may turn up in view). */
    private readonly still = false,
  ) {
    const kinds: Kind[] = ['squirrel', 'squirrel', 'monitor', 'snake', 'skink', 'skink', 'skink'];
    kinds.forEach((kind, i) => {
      const variant = kind === 'squirrel' ? (i === 0 ? SMALL.squirrel : SMALL.squirrel2) : SMALL[kind];
      flock.setup(i, variant, this.rnd(), 0.92 + 0.16 * this.rnd());
      this.critters.push({ kind, i, variant, scale: SIZE[kind] * (0.9 + 0.2 * this.rnd()), on: false, x: 0, y: 0, z: 0, yaw: 0, state: 'idle', timer: 0, tx: 0, ty: 0, tz: 0, trunk: null, y0: 0, y1: 0, wx: 0, wz: 0, event: null, scolded: -1e9 });
    });
  }

  static count = 7;

  /**
   * One update: `ex` the explorer on foot (null otherwise: they are let go
   * when out of sight), `fwd` his heading (x, z), `seen(x, y, z)` whether
   * the camera sees a point, `day` 0‥1.
   */
  step(dt: number, now: number, ex: Walker | null, fx: number, fz: number, seen: (x: number, y: number, z: number) => boolean, day: boolean): void {
    this.spawnIn -= dt;
    for (const c of this.critters) {
      if (!c.on) continue;
      const d = ex ? len2(c.x - ex.x, c.z - ex.z) : Infinity;
      // Let go: far from him, or night / him gone, out of sight.
      if ((d > GONE || !ex || !day) && (!seen(c.x, c.y + 0.1, c.z) || d > GONE + 15)) {
        c.on = false;
        this.flock.hide(c.i);
        continue;
      }
      this.live(c, dt, now, ex, d);
    }
    if (ex && day && this.spawnIn <= 0) {
      // (one free slot a try, in turn: a kind with no place near him does not hold up the others)
      this.spawnIn = 0.3;
      const n = this.critters.length;
      for (let k = 0; k < n; k++) {
        const c = this.critters[(this.turn + k) % n];
        if (c.on) continue;
        this.turn = (this.turn + k + 1) % n;
        this.spawn(c, ex, fx, fz, seen);
        break;
      }
    }
  }

  private spawn(c: Critter, ex: Walker, fx: number, fz: number, seen: (x: number, y: number, z: number) => boolean): void {
    const [r0, r1] = RING[c.kind];
    const f = this.cn.field;
    for (let n = 0; n < 8; n++) {
      // (mostly ahead of him, to the sides)
      const a = Math.atan2(fx, fz) + (this.rnd() - 0.5) * 3.4;
      const r = r0 + (r1 - r0) * this.rnd();
      let x = ex.x + Math.sin(a) * r;
      let z = ex.z + Math.cos(a) * r;
      let y = NaN;
      c.trunk = null;
      if (c.kind === 'squirrel') {
        const t = this.trunkNear(x, z, 5);
        if (!t) continue;
        const g = f.heightAt(t.x, t.z);
        const c0 = f.index(t.x, t.z);
        const under = this.cn.under[c0];
        const top = Number.isNaN(under) ? g + 5 : Math.min(under - 0.3, g + 8);
        if (top - g < 2.5) continue;
        // On the side he can see.
        const face = Math.atan2(ex.x - t.x, ex.z - t.z) + (this.rnd() - 0.5) * 1.6;
        x = t.x + Math.sin(face) * (t.r + 0.02);
        z = t.z + Math.cos(face) * (t.r + 0.02);
        c.trunk = t;
        c.y0 = g + 0.9;
        c.y1 = top;
        y = g + 1.2 + (top - g - 1.5) * this.rnd();
        c.yaw = face + Math.PI;
      } else if (c.kind === 'monitor') {
        y = this.floor(x, z);
        if (Number.isNaN(y) || Math.abs(y - ex.y) > 4) continue;
        const w = this.waterBy(x, z);
        if (!w) continue;
        c.wx = w[0];
        c.wz = w[1];
        c.yaw = Math.atan2(w[0] - x, w[1] - z) + Math.PI * (0.35 + 0.3 * this.rnd()) * (this.rnd() < 0.5 ? 1 : -1);
      } else if (c.kind === 'snake') {
        const cc = f.index(x, z);
        if (cc < 0 || !(this.cn.cover[cc] & 1)) continue;
        const top = this.cn.top[cc];
        const g = f.height[cc];
        if (!(top - g > 1.2 && top - g < 4.5) || Math.abs(g - ex.y) > 4) continue;
        y = top;
        c.yaw = this.rnd() * Math.PI * 2;
      } else {
        y = this.floor(x, z);
        if (Number.isNaN(y) || Math.abs(y - ex.y) > 3 || f.surface[f.index(x, z)] === SURFACE.path) continue;
        c.yaw = this.rnd() * Math.PI * 2;
      }
      if (Number.isNaN(y)) continue;
      // (not popping up where he looks, close by; stills show them where they are)
      if (!this.still && seen(x, y + 0.1, z) && Math.hypot(x - ex.x, z - ex.z) < r1 * 0.8) continue;
      c.on = true;
      c.x = x;
      c.y = y;
      c.z = z;
      c.state = 'idle';
      c.timer = 1 + 3 * this.rnd();
      this.pose(c, 0, 0);
      return;
    }
  }

  /** The nearest trunk to (x, z) within r m (a squirrel's). */
  private trunkNear(x: number, z: number, r: number): Trunk | null {
    let best: Trunk | null = null;
    let bd = r;
    for (const t of this.cn.trunks) {
      if (Math.abs(t.x - x) > r || Math.abs(t.z - z) > r) continue;
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  /** Water within 3 m of (x, z) (where a monitor slips in), or null. */
  private waterBy(x: number, z: number): [number, number] | null {
    const f = this.cn.field;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      for (const r of [1.5, 3]) {
        const wx = x + Math.sin(a) * r;
        const wz = z + Math.cos(a) * r;
        const c = f.index(wx, wz);
        if (c >= 0 && f.water[c] > f.height[c] + 0.3) return [wx, wz];
      }
    }
    return null;
  }

  private live(c: Critter, dt: number, now: number, ex: Walker | null, d: number): void {
    c.timer -= dt;
    const shy = ex !== null && d < SHY[c.kind] && c.state !== 'flee' && c.state !== 'hide';
    if (shy) this.flee(c, ex!);
    if (c.kind === 'squirrel') this.squirrel(c, dt, now, d);
    else if (c.kind === 'monitor') this.monitor(c, dt);
    else if (c.kind === 'snake') this.snake(c, dt);
    else this.skink(c, dt);
  }

  private flee(c: Critter, ex: Walker): void {
    c.state = 'flee';
    if (c.kind === 'squirrel') {
      c.ty = c.y1 + 0.6;
      c.event = 'scold';
    } else if (c.kind === 'monitor') {
      c.tx = c.wx;
      c.tz = c.wz;
    } else {
      // Away from him, a few metres.
      const a = Math.atan2(c.x - ex.x, c.z - ex.z) + (this.rnd() - 0.5) * 0.8;
      const r = c.kind === 'snake' ? 0.8 : 2.5;
      c.tx = c.x + Math.sin(a) * r;
      c.tz = c.z + Math.cos(a) * r;
      c.timer = c.kind === 'snake' ? 5 : 1.2;
    }
  }

  private squirrel(c: Critter, dt: number, now: number, d: number): void {
    // Scolds him from the trunk now and then when he is near.
    if (d < 10 && now - c.scolded > 15 && this.rnd() < dt * 0.1) {
      c.scolded = now;
      c.event = 'scold';
    }
    if (c.state === 'flee' || c.state === 'move') {
      const speed = c.state === 'flee' ? 2.6 : 1.1;
      const dy = c.ty - c.y;
      const go = Math.sign(dy) * Math.min(Math.abs(dy), speed * dt);
      c.y += go;
      this.pose(c, c.state === 'flee' ? 2 : 1, dy >= 0 ? 1 : -1, speed);
      if (Math.abs(dy) < 0.02) {
        if (c.state === 'flee') {
          // Up into the leaves: gone.
          c.on = false;
          this.flock.hide(c.i);
          return;
        }
        c.state = 'idle';
        c.timer = 1 + 4 * this.rnd();
      }
      return;
    }
    if (c.timer <= 0) {
      c.state = 'move';
      const span = 0.6 + 2.2 * this.rnd();
      const up = this.rnd() < 0.5;
      c.ty = Math.max(c.y0, Math.min(c.y1 - 0.4, c.y + (up ? span : -span)));
      return;
    }
    // Clinging: head up or down as it last went, flicking its tail.
    const fl = this.flock;
    fl.gait(c.i, 0, 3, now);
    fl.set(c.i, CH.act, 1, now);
    fl.set(c.i, CH.head, d < 14 ? -0.4 : 0, now);
  }

  private monitor(c: Critter, dt: number): void {
    if (c.state === 'flee') {
      const arrived = this.walkTo(c, dt, 1.2);
      this.pose(c, 1, 0, 1.2);
      // In the water: under it goes.
      const f = this.cn.field;
      const w = f.water[f.index(c.x, c.z)];
      if (arrived || w > f.height[f.index(c.x, c.z)]) {
        c.state = 'hide';
        c.timer = 2;
      }
      return;
    }
    if (c.state === 'hide') {
      c.y -= dt * 0.25;
      this.pose(c, 1, 0, 1.2);
      if (c.timer <= 0) {
        c.on = false;
        this.flock.hide(c.i);
      }
      return;
    }
    if (c.state === 'move') {
      const arrived = this.walkTo(c, dt, 0.3);
      this.pose(c, 1, 0, 0.6);
      if (arrived || c.timer <= 0) {
        c.state = 'idle';
        c.timer = 5 + 8 * this.rnd();
      }
      return;
    }
    this.pose(c, 0, 0);
    this.flock.set(c.i, CH.act, 1, this.now);
    if (c.timer <= 0) {
      const a = c.yaw + (this.rnd() - 0.5) * 1.5;
      const x = c.x + Math.sin(a) * 2.5;
      const z = c.z + Math.cos(a) * 2.5;
      if (!Number.isNaN(this.floor(x, z))) {
        c.tx = x;
        c.tz = z;
        c.state = 'move';
        c.timer = 12;
      } else c.timer = 3;
    }
  }

  private snake(c: Critter, dt: number): void {
    if (c.state === 'flee') {
      // Slides on and down into the leaves.
      this.walkTo(c, dt, 0.25, true);
      c.y -= dt * 0.08;
      this.pose(c, 1, 0, 0.9);
      if (c.timer <= 0) {
        c.on = false;
        this.flock.hide(c.i);
      }
      return;
    }
    this.pose(c, 0, 0);
    this.flock.set(c.i, CH.head, -1, this.now);
    this.flock.set(c.i, CH.act, 1, this.now);
  }

  private skink(c: Critter, dt: number): void {
    if (c.state === 'flee' || c.state === 'move') {
      const arrived = this.walkTo(c, dt, c.state === 'flee' ? 2.2 : 1.4);
      this.pose(c, 1, 0, 6);
      if (c.state === 'flee' && (arrived || c.timer <= 0)) {
        c.on = false;
        this.flock.hide(c.i);
      } else if (arrived || c.timer <= 0) {
        c.state = 'idle';
        c.timer = 1.5 + 5 * this.rnd();
      }
      return;
    }
    this.pose(c, 0, 0);
    if (c.timer <= 0) {
      const a = this.rnd() * Math.PI * 2;
      const r = 0.6 + 1.4 * this.rnd();
      const x = c.x + Math.sin(a) * r;
      const z = c.z + Math.cos(a) * r;
      if (!Number.isNaN(this.floor(x, z))) {
        c.tx = x;
        c.tz = z;
        c.state = 'move';
        c.timer = 3;
      } else c.timer = 1;
    }
  }

  /** Walk to the target on the floor (`free`: anywhere, the snake over the leaves); true on arrival. */
  private walkTo(c: Critter, dt: number, speed: number, free = false): boolean {
    const dx = c.tx - c.x;
    const dz = c.tz - c.z;
    const d = len2(dx, dz);
    if (d < 0.05) return true;
    c.yaw = Math.atan2(dx, dz);
    const go = Math.min(d, speed * dt);
    const nx = c.x + (dx / d) * go;
    const nz = c.z + (dz / d) * go;
    if (!free) {
      const f = this.cn.field;
      const g = f.heightAt(nx, nz);
      if (Math.abs(g - c.y) > 0.8 && c.kind !== 'monitor') return true;
      c.y += (g - c.y) * Math.min(1, dt * 8);
    }
    c.x = nx;
    c.z = nz;
    return false;
  }

  /** Gait (0 still, 1 moving, 2 running), climbing direction (squirrel), steps a second. */
  private pose(c: Critter, gait: number, climb: number, hz = 2): void {
    const fl = this.flock;
    const now = this.now;
    fl.gait(c.i, gait, hz, now);
    if (c.kind === 'squirrel') fl.set(c.i, CH.rest, climb === 0 ? fl.target(c.i, CH.rest) || 1 : climb, now);
    if (gait) {
      fl.set(c.i, CH.act, 0, now);
      fl.set(c.i, CH.head, 0, now);
    }
  }

  /** The clock of the flock (set by jungle.ts before `step`). */
  now = 0;

  /** Put the ones about on the map; the squirrel's trunk faces it, as it climbs. */
  show(): void {
    for (const c of this.critters) {
      if (!c.on) continue;
      let yaw = c.yaw;
      // Head down going down the trunk: its back to the trunk.
      if (c.kind === 'squirrel' && this.flock.target(c.i, CH.rest) < 0 && c.trunk) yaw = Math.atan2(c.x - c.trunk.x, c.z - c.trunk.z);
      if (c.kind === 'squirrel' && this.flock.target(c.i, CH.rest) > 0 && c.trunk) yaw = Math.atan2(c.trunk.x - c.x, c.trunk.z - c.z);
      this.flock.place(c.i, c.x, c.y, c.z, yaw, c.scale);
    }
  }
}
