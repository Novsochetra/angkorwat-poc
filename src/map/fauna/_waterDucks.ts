import { mulberry32 } from '../../voxel/random';
import type { HeightField } from '../heightfield';
import type { MapFrame } from '../types';
import { call, creatureMaterial, Herd, smooth, window01, type Explorer, type View } from './_waterAirKit';
import { DUCK, duckShapes } from './_waterModels';
import type { Rings } from './_waterRings';
import { reachIndex, reachNear, reachPoint, type Reach, type ReachPoint } from './_waterRivers';

/**
 * Little families of ducks on the calm river reaches: Indian spot-billed
 * ducks (a parent or two with a line of ducklings) and small groups of
 * lesser whistling ducks. Each family swims a long slow loop on its reach —
 * down one side with the current, back up the other — the others following
 * the leader's wake in a loose line. They bob, dabble (tail up, head under)
 * and preen now and then, and leave small ripples behind them.
 *
 * When the roaming explorer (on foot or in his boat) comes close they hurry
 * off along the river away from him, quacking, the grown ducks pattering and
 * flapping low over the water; once he is gone they paddle slowly back.
 * At night they drift slower, heads tucked.
 */

interface FamilyDef {
  at: [number, number];
  kind: 'spotbill' | 'whistler';
  adults: number;
  young: number;
}

const FAMILIES: FamilyDef[] = [
  // Near the River Gate landing (the boat starts here) and on to the front.
  { at: [-20, 84], kind: 'spotbill', adults: 2, young: 5 },
  // Mid-valley, in front of the summit.
  { at: [34, 14], kind: 'whistler', adults: 6, young: 0 },
  // Under the summit's great fall, in the east valley.
  { at: [76, -56], kind: 'spotbill', adults: 1, young: 4 },
  // The west river, below the cliffs.
  { at: [-140, -26], kind: 'spotbill', adults: 2, young: 3 },
  // The garden stream where it meets the valley river.
  { at: [90, 10], kind: 'whistler', adults: 4, young: 0 },
  // The spring on the summit's middle tier, beside Angkor Wat (above the road's bridge).
  { at: [71, -224], kind: 'spotbill', adults: 2, young: 3 },
  // The west river's last reach, by the River Gate.
  { at: [-102, 44], kind: 'whistler', adults: 5, young: 0 },
];

/** Size over real life (as the roaming explorer, so they read at his scale). */
const SIZE = 1.3;
/** Swimming speed (m/s): down the river with the current, back up against it, round the turns. */
const DOWN = 0.36;
const UP = 0.2;
const ROUND = 0.26;
/** Length of a turn from one side of the river to the other (m), and the most room between followers (m). */
const TURN = 4;
const GAP = 0.5;
/** Length of each duck model, bill to tail (m). */
const LENGTH = [0.73, 0.28, 0.62];
/** Fleeing: how close the explorer may come (m, on foot / by boat) and how fast they go (m/s). */
const SHY = 11;
const SHY_BOAT = 16;
const FLEE = 2.1;
/** Ripples: seconds between them, and how long one lasts. */
const RIPPLE = 1.5;
const RIPPLE_LIFE = 2.6;
/** Farthest a duck is drawn (m). */
const FAR = 330;

interface Duck {
  kind: number;
  size: number;
  adult: boolean;
  /** Metres behind the leader along the loop. */
  back: number;
  across: number;
  phase: number;
  dabP: number;
  dabO: number;
  preP: number;
  preO: number;
  tint: number;
  /** Last ripples: x, z, start time (three slots). */
  ring: Float32Array;
  ringN: number;
}

interface Family {
  reach: Reach;
  mid: number;
  /** Half the length of the loop's straight legs (m), and the time round it (s). */
  span: number;
  period: number;
  phase: number;
  ducks: Duck[];
  /** Own clock (slower at night), metres slid along the river, fleeing state. */
  clock: number;
  shift: number;
  shiftV: number;
  alarm: number;
  run: number;
  fleeDir: number;
  away: number;
  quackIn: number;
}

export interface Ducks {
  herd: Herd;
  count: number;
  families: number;
  update(f: MapFrame, view: View, me: Explorer, rings: Rings | null): void;
}

export function buildDucks(field: HeightField): Ducks {
  const rnd = mulberry32(5150);
  const families: Family[] = [];
  for (const def of FAMILIES) {
    const reach = reachNear(field, def.at[0], def.at[1], 40);
    if (!reach || reach.b - reach.a < 20) continue;
    const span = Math.min(24, (reach.b - reach.a) / 2 - 3);
    const period = (2 * span) / DOWN + (2 * span) / UP + (2 * TURN) / ROUND;
    const n = def.adults + def.young;
    const ducks: Duck[] = [];
    for (let i = 0; i < n; i++) {
      // The line: a parent first, the ducklings, the other parent last.
      const young = def.kind === 'spotbill' && i > 0 && i <= def.young;
      const kind = def.kind === 'whistler' ? DUCK.whistler : young ? DUCK.duckling : DUCK.spotbill;
      const prev = ducks[i - 1];
      const len = LENGTH[kind] * SIZE;
      ducks.push({
        kind,
        size: SIZE * (young ? 1 : 0.95 + rnd() * 0.1),
        adult: !young,
        back: prev ? prev.back + (LENGTH[prev.kind] * SIZE + len) / 2 + GAP * (0.3 + rnd() * 0.7) : 0,
        across: (rnd() - 0.5) * 0.18,
        phase: rnd() * 100,
        dabP: (young ? 9 : 13) + rnd() * 9,
        dabO: rnd() * 30,
        preP: 19 + rnd() * 14,
        preO: rnd() * 40,
        tint: 0.92 + rnd() * 0.14,
        ring: new Float32Array(9).fill(-1e4),
        ringN: -1,
      });
    }
    families.push({
      reach,
      mid: (reach.a + reach.b) / 2,
      span,
      period,
      phase: rnd() * period,
      ducks,
      clock: NaN,
      shift: 0,
      shiftV: 0,
      alarm: 0,
      run: 0,
      fleeDir: 1,
      away: 0,
      quackIn: 4 + rnd() * 10,
    });
  }
  const count = families.reduce((s, fa) => s + fa.ducks.length, 0);
  const herd = new Herd('wildlife:ducks', duckShapes(), creatureMaterial('map:ducks', { shoulder: [0.11, 0.13, 0.04] }), count);
  const p: ReachPoint = { x: 0, z: 0, dx: 0, dz: 1, level: 0 };
  const q: ReachPoint = { x: 0, z: 0, dx: 0, dz: 1, level: 0 };
  const talk = mulberry32(99);

  /** Where the leader is along its loop at time τ (m from the start of the downstream leg). */
  const leadAt = (fa: Family, tau: number): number => {
    const L = 2 * fa.span;
    let s = (((tau + fa.phase) % fa.period) + fa.period) % fa.period;
    // Down the river, round, back up, round.
    if (s < L / DOWN) return s * DOWN;
    s -= L / DOWN;
    if (s < TURN / ROUND) return L + s * ROUND;
    s -= TURN / ROUND;
    if (s < L / UP) return L + TURN + s * UP;
    s -= L / UP;
    return 2 * L + TURN + Math.min(TURN, s * ROUND);
  };

  /**
   * Where a duck is `back` metres behind the leader (at `s` along the loop),
   * with the family `shift` metres down the river.
   */
  const place = (fa: Family, d: Duck, s: number, shift: number, out: ReachPoint) => {
    const L = 2 * fa.span;
    const loop = 2 * L + 2 * TURN;
    let k = (((s - d.back) % loop) + loop) % loop;
    let u: number;
    let v: number;
    if (k < L) [u, v] = [k - fa.span, 0.5];
    else if ((k -= L) < TURN) [u, v] = [fa.span + 0.8 * Math.sin((k / TURN) * Math.PI), 0.5 * Math.cos((k / TURN) * Math.PI)];
    else if ((k -= TURN) < L) [u, v] = [fa.span - k, -0.5];
    else {
      k -= L;
      [u, v] = [-fa.span - 0.8 * Math.sin((k / TURN) * Math.PI), -0.5 * Math.cos((k / TURN) * Math.PI)];
    }
    const r = fa.reach;
    u += fa.mid + shift;
    // (soft ends: a family pushed to the end of its reach bunches up there)
    const lo = r.a + 2;
    const hi = r.b - 2;
    const uu = u < lo ? lo - (1 - Math.exp(-(lo - u) / 4)) * 1.5 : u > hi ? hi + (1 - Math.exp(-(u - hi) / 4)) * 1.5 : u;
    const vv = Math.max(-1, Math.min(1, v * (1 - 0.6 * fa.alarm) + fa.away * fa.alarm * 0.75 + d.across));
    return reachPoint(r, uu, vv, out);
  };

  return {
    herd,
    count,
    families: families.length,
    update(f, view, me, rings) {
      const t = f.t;
      const dt = f.dt;
      const sleep = smooth(0.6, 0.95, f.night);
      herd.begin();
      for (const fa of families) {
        if (Number.isNaN(fa.clock)) fa.clock = t;
        fa.clock += dt * (1 - 0.75 * sleep);
        const along = leadAt(fa, fa.clock);
        place(fa, fa.ducks[0], along, fa.shift, p);
        const level = p.level;

        // ── Shy of the explorer ────────────────────────────────────────
        let near = Infinity;
        if (me.near && Math.abs(me.y - level) < 5) {
          for (const d of fa.ducks) {
            place(fa, d, along, fa.shift, q);
            near = Math.min(near, Math.hypot(q.x - me.x, q.z - me.z));
          }
        }
        const shy = me.boat ? SHY_BOAT : SHY;
        if (near < shy) {
          if (fa.alarm < 0.5) {
            // Away along the river from him (the other way if the reach ends there), to the far side.
            const ui = reachIndex(fa.reach, me.x, me.z);
            const ul = reachIndex(fa.reach, p.x, p.z);
            fa.fleeDir = ul >= ui ? 1 : -1;
            if ((fa.fleeDir > 0 && ul > fa.reach.b - 8) || (fa.fleeDir < 0 && ul < fa.reach.a + 8)) fa.fleeDir *= -1;
            const side = (me.x - p.x) * -p.dz + (me.z - p.z) * p.dx;
            fa.away = side > 0 ? -1 : 1;
            fa.quackIn = Math.min(fa.quackIn, 0.1);
          }
          fa.alarm = 1;
          fa.run = Math.min(1, fa.run + dt * 3 * (near < shy * 0.75 ? 1 : 0));
          fa.shiftV = fa.fleeDir * FLEE * (0.6 + 0.4 * fa.run);
        } else {
          fa.alarm = Math.max(0, fa.alarm - dt / 9);
          fa.run = Math.max(0, fa.run - dt / 1.2);
          // Paddle slowly back home once calm again.
          fa.shiftV = fa.alarm > 0.3 ? fa.shiftV * Math.exp(-dt * 1.5) : -Math.sign(fa.shift) * Math.min(0.3, Math.abs(fa.shift) / Math.max(dt, 1e-3));
        }
        fa.shift += fa.shiftV * dt;
        const span = fa.reach.b - fa.reach.a;
        fa.shift = Math.max(-span, Math.min(span, fa.shift));

        // ── Quacks ────────────────────────────────────────────────────
        fa.quackIn -= dt;
        if (fa.quackIn <= 0 && dt > 0) {
          const alarmed = fa.alarm > 0.5;
          fa.quackIn = alarmed ? 0.3 + talk() * 0.7 : (7 + talk() * 16) * (1 + 2 * sleep);
          call(f, 'duck', p.x, level + 0.3, p.z, alarmed ? 0.75 + talk() * 0.25 : 0.3 + talk() * 0.25);
        }

        // ── Draw ──────────────────────────────────────────────────────
        if (view.dist(p.x, level, p.z) > FAR + 40) continue;
        const ripples = rings && view.dist(p.x, level, p.z) < 90;
        for (const d of fa.ducks) {
          place(fa, d, along, fa.shift, p);
          if (!view.sees(p.x, level, p.z, 1, FAR)) continue;
          // Heading: where it will be a moment later.
          place(fa, d, along + 0.3, fa.shift + fa.shiftV, q);
          const yaw = Math.atan2(q.x - p.x, q.z - p.z);
          const ph = d.phase;
          const calm = 1 - fa.alarm;
          const dab = window01(0, d.adult ? 2.6 : 1.3, 0.45, (t + d.dabO) % d.dabP) * calm * (1 - sleep);
          const pre = window01(0, 3.4, 0.6, (t + d.preO) % d.preP) * calm * (1 - dab);
          const run = d.adult ? fa.run : 0;
          const tuck = Math.max(pre, sleep);
          const s = d.size;
          const y = level + 0.015 * Math.sin(t * 2.3 + ph) - 0.05 * dab + run * (0.12 + 0.06 * Math.sin(t * 17 + ph));
          const pitch = 0.035 * Math.sin(t * 1.9 + ph) + 1.2 * dab - 0.3 * run;
          const roll = 0.05 * Math.sin(t * 1.4 + ph) + 0.12 * pre;
          const o = herd.add(p.x, y, p.z, s, yaw, pitch, roll, d.kind);
          if (o < 0) continue;
          const a = herd.data;
          // Wings: folded; flapping hard when running off.
          a[o + 8] = run > 0.05 ? 0.12 + 0.55 * Math.sin(t * 31 + ph) : 0;
          a[o + 9] = run > 0.05 ? 1 : 0;
          a[o + 10] = 0.55 * dab + 0.7 * tuck + 0.08 * Math.sin(t * 0.7 + ph) * calm;
          a[o + 11] = 1.6 * tuck * (d.phase > 50 ? 1 : -1) + 0.35 * Math.sin(t * 0.37 + ph) * calm * (1 - tuck);
          a[o + 13] = 0.35 * dab + 0.12 * Math.max(0, Math.sin(t * 3.1 + ph)) * calm;
          a[o + 16] = a[o + 17] = a[o + 18] = d.tint;

          // Ripples behind it (one every RIPPLE s; quicker and splashier when running).
          if (!ripples) continue;
          const every = run > 0.2 ? 0.25 : d.adult ? RIPPLE : RIPPLE * 0.75;
          const n = Math.floor((fa.clock + ph) / every);
          const r = d.ring;
          if (n !== d.ringN) {
            const k = (n % 3) * 3;
            // (first frame: as if it had been swimming here)
            r[k] = d.ringN < 0 ? p.x - Math.sin(yaw) * 0.4 : p.x;
            r[k + 1] = d.ringN < 0 ? p.z - Math.cos(yaw) * 0.4 : p.z;
            r[k + 2] = d.ringN < 0 ? t - every * 0.5 : t;
            d.ringN = n;
          }
          for (let k = 0; k < 9; k += 3)
            if (t - r[k + 2] < RIPPLE_LIFE) rings.add(r[k], level, r[k + 1], r[k + 2], (d.adult ? 0.75 : 0.45) * s * (run > 0.2 ? 1.2 : 1), run > 0.2 ? 0.7 : 0.4, RIPPLE_LIFE, run > 0.2 ? 0.5 : 0);
        }
      }
      herd.end();
    },
  };
}
