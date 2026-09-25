import { mulberry32 } from '../../voxel/random';
import type { HeightField } from '../heightfield';
import type { MapFrame } from '../types';
import { angleTo, call, creatureMaterial, Herd, smooth, window01, type Explorer, type View } from './_waterAirKit';
import { WADER, WADER_SHOULDER, waderShapes } from './_waterModels';
import type { Rings } from './_waterRings';
import { reachNear, reachPoint, type Reach, type ReachPoint } from './_waterRivers';

/**
 * Great egrets and grey herons wading in the shallows by the banks and the
 * waterfall pools. Each one keeps to a few metres of bank: slow steps along
 * it, a long still watch over the water, a quick stab at a fish (a splash
 * ring), a preen, and back. When the roaming explorer comes within about
 * 15 m it takes off with a croak and a clatter of wings, flies low along
 * the river and lands on another stretch of bank further on (away from
 * him). At night they stand still, necks drawn in.
 */

/** Where they stand at first: near a river point, on its left (−1) or right (1) bank. */
const HOMES: { at: [number, number]; side: number; kind: 'egret' | 'heron' }[] = [
  { at: [71, -84], side: -1, kind: 'heron' },
  { at: [78, -40], side: 1, kind: 'egret' },
  { at: [58, 6], side: -1, kind: 'egret' },
  { at: [6, 22], side: 1, kind: 'egret' },
  { at: [-22, 102], side: -1, kind: 'egret' },
  { at: [-36, 57], side: 1, kind: 'egret' },
  { at: [-146, -4], side: 1, kind: 'egret' },
  { at: [-128, 32], side: -1, kind: 'heron' },
  { at: [-106, -110], side: -1, kind: 'egret' },
  { at: [119, -24], side: 1, kind: 'egret' },
  { at: [106, 7], side: -1, kind: 'egret' },
  { at: [72, -178], side: -1, kind: 'egret' },
];

/** Size over real life (as the roaming explorer). */
const SIZE = 1.25;
/** How close the explorer may come before they fly (m, on foot / by boat / at night). */
const SHY = 15;
const SHY_BOAT = 20;
const SHY_NIGHT = 7;
/** Flight speed (m/s); legs in the water (m). */
const FLY = 7.5;
const WADE = 0.3;
/** Farthest a bird is drawn (m): white egrets are specks on the river from the overview. */
const FAR = 480;

/** A stretch of bank a bird can stand on. */
interface Spot {
  reach: Reach;
  u: number;
  side: number;
  taken: boolean;
}

interface Wader {
  kind: number;
  size: number;
  phase: number;
  cycle: number;
  spot: Spot;
  /** Routine clock start (it restarts on landing). */
  since: number;
  flying: boolean;
  /** Flight: start time, length (s), from and to (x, y, z), heading. */
  t0: number;
  dur: number;
  from: [number, number, number];
  to: [number, number, number];
  yaw0: number;
  lastYaw: number;
  splashT: number;
  splashAt: [number, number, number];
}

export interface Waders {
  herd: Herd;
  count: number;
  update(f: MapFrame, view: View, me: Explorer, rings: Rings | null): void;
}

export function buildWaders(field: HeightField): Waders {
  const rnd = mulberry32(8123);
  // Landing spots: every 22 m along every river where it is calm, both banks.
  const spots: Spot[] = [];
  for (const r of field.rivers)
    for (let i = 10; i < r.samples.length - 10; i += 22) {
      const s = r.samples[i];
      const reach = reachNear(field, s.x, s.z, 6);
      if (!reach) continue;
      const u = (reach.a + reach.b) / 2;
      for (const side of [-1, 1]) spots.push({ reach, u, side, taken: false });
    }
  const birds: Wader[] = [];
  for (const h of HOMES) {
    const reach = reachNear(field, h.at[0], h.at[1], 6);
    if (!reach) continue;
    const spot: Spot = { reach, u: (reach.a + reach.b) / 2, side: h.side, taken: true };
    const heron = h.kind === 'heron';
    birds.push({
      kind: heron ? WADER.heron : WADER.egret,
      size: SIZE * (heron ? 1.08 : 0.94 + rnd() * 0.1),
      phase: rnd() * 60,
      cycle: 22 + rnd() * 8,
      spot,
      since: 0,
      flying: false,
      t0: 0,
      dur: 1,
      from: [0, 0, 0],
      to: [0, 0, 0],
      yaw0: 0,
      lastYaw: 0,
      splashT: -1e4,
      splashAt: [0, 0, 0],
    });
  }
  const herd = new Herd('wildlife:waders', waderShapes(), creatureMaterial('map:waders', { shoulder: WADER_SHOULDER, emissive: 0x2a2824 }), birds.length);
  const p: ReachPoint = { x: 0, z: 0, dx: 0, dz: 1, level: 0 };
  const talk = mulberry32(31);

  /** Standing point of a spot, walked `walk` m along the bank. */
  const stand = (sp: Spot, walk: number, out: ReachPoint) => reachPoint(sp.reach, sp.u + walk, sp.side, out);

  /** A spot to fly to: along the rivers, 35–110 m away, far from the explorer. */
  const landing = (b: Wader, me: Explorer): Spot | null => {
    stand(b.spot, 0, p);
    const x0 = p.x;
    const z0 = p.z;
    let best: Spot | null = null;
    let score = Infinity;
    for (const sp of spots) {
      if (sp.taken) continue;
      stand(sp, 0, p);
      const d = Math.hypot(p.x - x0, p.z - z0);
      const dm = Math.hypot(p.x - me.x, p.z - me.z);
      if (d < 35 || d > 110 || dm < 32 || Math.abs(p.level - b.spot.reach.level) > 14) continue;
      // (rather on its own river, away from him, and not over his head)
      const toward = ((p.x - x0) * (me.x - x0) + (p.z - z0) * (me.z - z0)) / Math.max(1e-3, d * Math.hypot(me.x - x0, me.z - z0));
      const sc = d * 0.5 - dm + (sp.reach.river === b.spot.reach.river ? 0 : 30) + 60 * Math.max(0, toward) + talk() * 12;
      if (sc < score) {
        score = sc;
        best = sp;
      }
    }
    return best;
  };

  return {
    herd,
    count: birds.length,
    update(f, view, me, rings) {
      const t = f.t;
      const still = smooth(0.55, 0.85, f.night);
      herd.begin();
      for (const b of birds) {
        // ── Take off when he comes close ─────────────────────────────────
        if (!b.flying && me.near) {
          stand(b.spot, 0, p);
          const shy = still > 0.5 ? SHY_NIGHT : me.boat ? SHY_BOAT : SHY;
          if (Math.hypot(p.x - me.x, p.z - me.z) < shy && Math.abs(me.y - p.level) < 8) {
            const from: [number, number, number] = [p.x, p.level - WADE, p.z];
            const to = landing(b, me);
            if (to) {
              b.flying = true;
              b.t0 = t;
              b.from = from;
              stand(to, 0, p);
              b.to = [p.x, p.level - WADE, p.z];
              const dist = Math.hypot(b.to[0] - b.from[0], b.to[2] - b.from[2]);
              b.dur = dist / FLY + 1.6;
              b.yaw0 = b.lastYaw;
              b.spot.taken = false;
              to.taken = true;
              b.spot = to;
              call(f, 'wings', b.from[0], b.from[1] + 1, b.from[2], 0.8);
              if (b.kind === WADER.heron || talk() < 0.6) call(f, 'egret', b.from[0], b.from[1] + 1, b.from[2], 0.7);
            }
          }
        }

        let x: number;
        let y: number;
        let z: number;
        let yaw: number;
        let pitch = 0;
        let wing = 0;
        let open = 0;
        let head = 0;
        let headYaw = 0;
        let leg = 0;
        let tuck = 0;
        if (b.flying) {
          // ── Flight: low along the river, flapping hard to rise and to land ──
          const u = Math.min(1, (t - b.t0) / b.dur);
          if (u >= 1) {
            b.flying = false;
            b.since = t;
            b.splashT = t;
            b.splashAt = [b.to[0], b.to[1] + WADE, b.to[2]];
          }
          const e = u * u * (3 - 2 * u);
          const dist = Math.hypot(b.to[0] - b.from[0], b.to[2] - b.from[2]);
          x = b.from[0] + (b.to[0] - b.from[0]) * e;
          z = b.from[2] + (b.to[2] - b.from[2]) * e;
          y = b.from[1] + (b.to[1] - b.from[1]) * e + (2.5 + dist * 0.05) * Math.pow(Math.sin(Math.PI * u), 0.6);
          const toYaw = Math.atan2(b.to[0] - b.from[0], b.to[2] - b.from[2]);
          yaw = b.yaw0 + angleTo(b.yaw0, toYaw) * smooth(0, 0.12, u);
          const hard = 1 - smooth(0.18, 0.32, u) * (1 - smooth(0.8, 0.95, u));
          const slow = b.kind === WADER.heron ? 0.8 : 1;
          const beat = Math.sin((t - b.t0) * Math.PI * 2 * (1.7 + 1.1 * hard) * slow);
          // (gliding now and then between slow beats)
          const glide = (1 - hard) * smooth(0.3, 0.9, Math.sin((t - b.t0) * 0.9 + b.phase));
          wing = 0.12 + (0.35 + 0.55 * hard) * beat * (1 - glide * 0.85);
          open = 1;
          pitch = 0.25 - 0.55 * (1 - smooth(0, 0.2, u)) - 0.6 * smooth(0.82, 1, u);
          head = -0.55 + 0.4 * smooth(0.85, 1, u);
          // Legs trailing behind; down again to land.
          tuck = 1.35 * smooth(0.05, 0.2, u) * (1 - smooth(0.85, 0.97, u));
          b.lastYaw = yaw;
        } else {
          // ── On the bank: walk, turn, watch, stab, preen ────────────────────
          const c = b.cycle;
          const s = (((t - b.since + b.phase) % c) + c) % c;
          const k = s / c;
          // Turn along the bank, walk out 1.3 m, face the water and watch;
          // turn, walk back, face the water, watch and preen.
          const walk = 1.3 * (smooth(0.04, 0.22, k) - smooth(0.54, 0.72, k)) * (1 - still);
          const walking = (window01(0.04, 0.22, 0.02, k) + window01(0.54, 0.72, 0.02, k)) * (1 - still);
          stand(b.spot, walk, p);
          x = p.x;
          z = p.z;
          y = p.level - WADE;
          const along = Math.atan2(p.dx, p.dz);
          const water = Math.atan2(p.dz * b.spot.side, -p.dx * b.spot.side);
          const back = along + Math.PI;
          yaw = water;
          if (still < 0.5)
            for (const [at, ya, yb] of [
              [0, water, along],
              [0.22, along, water],
              [0.5, water, back],
              [0.72, back, water],
            ])
              if (k >= at) yaw = ya + angleTo(ya, yb) * smooth(at, at + 0.04, k);
          leg = 0.32 * Math.sin(s * Math.PI * 2 * 0.9) * walking;
          // Watching the water, a stab at a fish, a preen.
          const watch = window01(0.26, 0.5, 0.03, k) + window01(0.76, 1, 0.03, k) * 0.7;
          const stab = window01(0.37, 0.395, 0.008, k);
          const preen = window01(0.8, 0.9, 0.02, k);
          head = 0.45 * watch + 1.25 * stab + 0.6 * preen + 0.12 * Math.sin(s * Math.PI * 2 * 0.9) * walking;
          headYaw = 2.1 * preen * (b.phase > 30 ? 1 : -1);
          pitch = 0.3 * stab + 0.05 * watch;
          // Night: still, neck drawn in.
          head = head * (1 - still) - 0.35 * still;
          y -= 0.06 * still;
          // The stab's splash.
          if (stab > 0.5 && t - b.splashT > 3 && still < 0.5) {
            b.splashT = t;
            b.splashAt = [x + Math.sin(yaw) * 0.55 * b.size, p.level, z + Math.cos(yaw) * 0.55 * b.size];
          }
          b.lastYaw = yaw;
        }

        if (rings && t - b.splashT < 2 && view.dist(b.splashAt[0], b.splashAt[1], b.splashAt[2]) < 120)
          rings.add(b.splashAt[0], b.splashAt[1], b.splashAt[2], b.splashT, 0.9, 0.55, 2, 0.6);
        if (!view.sees(x, y + 0.6, z, 1.2, FAR)) continue;
        const o = herd.add(x, y, z, b.size, yaw, pitch, 0, b.kind);
        if (o < 0) continue;
        const a = herd.data;
        a[o + 8] = wing;
        a[o + 9] = open;
        a[o + 10] = head;
        a[o + 11] = headYaw;
        a[o + 12] = leg;
        a[o + 15] = tuck;
      }
      herd.end();
    },
  };
}
