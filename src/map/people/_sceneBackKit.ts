import { eventsNow } from '../events';
import type { P2 } from '../hamlet/_bhSpots';
import type { MapFrame } from '../types';
import { CARRY, FEAT, SLOT, type Look } from './_personModel';
import { RigDef, type Things } from './_things';

/**
 * Plumbing for the life behind Angkor Wat (`_sceneBack.ts`): the day's
 * clock in seconds, ways to walk and ride (points resampled every half
 * metre), the children's splash in the pond, the grandfather's hammock,
 * umbrellas in the rain.
 */

/** Seconds a day of the map's clock lasts while it cycles (main.ts `CYCLE`): how far along a walk is when it is first seen part way. */
export const DAY_S = 360;

/** The clock in [a, b), wrapping past midnight's other side (0‥1). */
export function within(c: number, a: number, b: number): boolean {
  return a <= b ? c >= a && c < b : c >= a || c < b;
}

/** Seconds since the clock passed `a` (0 ‥ `DAY_S`). */
export function since(c: number, a: number): number {
  return ((((c - a) % 1) + 1) % 1) * DAY_S;
}

export interface WayPoint {
  x: number;
  z: number;
  /** Heading along the way (radians, toward (sin, cos)). */
  yaw: number;
}

/**
 * A way through points (map x, z), resampled every half metre and
 * smoothed a little (its corners round off): the point and heading at a
 * distance along it. `reversed()` runs it the other way.
 */
export class Way {
  readonly xs: Float32Array;
  readonly zs: Float32Array;
  readonly len: number;

  constructor(pts: readonly P2[]) {
    const xs: number[] = [];
    const zs: number[] = [];
    let carry = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const d = Math.hypot(bx - ax, bz - az);
      let u = carry;
      for (; u < d; u += 0.5) {
        xs.push(ax + ((bx - ax) * u) / d);
        zs.push(az + ((bz - az) * u) / d);
      }
      carry = u - d;
    }
    const last = pts[pts.length - 1];
    xs.push(last[0]);
    zs.push(last[1]);
    // (smoothed over ±1 m, the ends kept)
    const n = xs.length;
    const sx = xs.slice();
    const sz = zs.slice();
    for (let i = 2; i < n - 2; i++) {
      let ax = 0;
      let az = 0;
      for (let j = -2; j <= 2; j++) {
        ax += sx[i + j];
        az += sz[i + j];
      }
      xs[i] = ax / 5;
      zs[i] = az / 5;
    }
    this.xs = Float32Array.from(xs);
    this.zs = Float32Array.from(zs);
    this.len = Math.max(0, (n - 1) * 0.5);
  }

  /** The point `s` m along (clamped to the ends) and the heading there, into `out`. */
  at(s: number, out: WayPoint): WayPoint {
    const n = this.xs.length;
    const f = Math.max(0, Math.min(n - 1, s / 0.5));
    const i = Math.min(n - 2, Math.floor(f));
    if (i < 0) {
      out.x = this.xs[0];
      out.z = this.zs[0];
      out.yaw = 0;
      return out;
    }
    const k = f - i;
    out.x = this.xs[i] + (this.xs[i + 1] - this.xs[i]) * k;
    out.z = this.zs[i] + (this.zs[i + 1] - this.zs[i]) * k;
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(n - 1, i + 2);
    out.yaw = Math.atan2(this.xs[i1] - this.xs[i0], this.zs[i1] - this.zs[i0]);
    return out;
  }

  /** The same way, the other way round. */
  reversed(): Way {
    const pts: P2[] = [];
    for (let i = this.xs.length - 1; i >= 0; i--) pts.push([this.xs[i], this.zs[i]]);
    return new Way(pts);
  }
}

/** Foam bits round the splash, drops thrown up. */
const RING = 10;
const DROPS = 8;

/**
 * A splash where a child hits the water (the jump off the jetty, a bout of
 * splashing each other): a ring of foam spreading and thinning, drops
 * thrown up and falling back; loose boxes of the people's things, gone in
 * a second and a half.
 */
export class Splash {
  private readonly base: number;
  private t0 = -1e9;
  private x = 0;
  private y = 0;
  private z = 0;
  private big = 1;
  private shown = false;

  constructor(private readonly things: Things) {
    this.base = things.alloc(RING + DROPS);
    for (let k = 0; k < RING + DROPS; k++) things.paint(this.base + k, k < RING ? 0xe8f0ee : 0xf4f8f6);
  }

  /** A splash at (x, y: the water, z), `big` 1 a jump, less for hands slapping the water. */
  start(now: number, x: number, y: number, z: number, big = 1): void {
    this.t0 = now;
    this.x = x;
    this.y = y;
    this.z = z;
    this.big = big;
  }

  update(now: number): void {
    const a = now - this.t0;
    const th = this.things;
    const b = this.base;
    if (a < 0 || a > 1.6) {
      if (this.shown) th.hide(b, RING + DROPS);
      this.shown = false;
      return;
    }
    this.shown = true;
    const k = this.big;
    // The foam ring: out from the splash, thinning.
    const R = (0.35 + 1.1 * Math.sqrt(a / 1.6)) * k;
    const w = 0.18 * k * (1 - a / 1.6) ** 1.4;
    for (let i = 0; i < RING; i++) {
      const p = (i / RING) * Math.PI * 2 + 0.3;
      const rr = R * (1 + 0.06 * Math.sin(i * 2.7));
      th.put(b + i, this.x + Math.sin(p) * rr, this.y + 0.02, this.z + Math.cos(p) * rr, w + 0.04, 0.03, ((Math.PI * 2 * R) / RING) * 0.8, p + Math.PI / 2);
    }
    // Drops: up and out, falling back into the water.
    const d0 = b + RING;
    if (a < 0.8) {
      for (let i = 0; i < DROPS; i++) {
        const p = (i / DROPS) * Math.PI * 2 + i * 0.37;
        const v = (2.4 + 1.2 * ((i * 7) % 3)) * k;
        const out = (0.2 + 0.9 * a) * k * (0.7 + 0.3 * ((i * 5) % 2));
        const y = this.y + v * a - 4.9 * a * a;
        const s = 0.1 * k * (1 - a / 0.8);
        if (y < this.y) th.hide(d0 + i);
        else th.put(d0 + i, this.x + Math.sin(p) * out, y, this.z + Math.cos(p) * out, s, s * 1.3, s);
      }
    } else th.hide(d0, DROPS);
  }
}

/**
 * The grandfather's hammock under the old house (_sceneBackFolk.ts): its ends this far in from the stilts' middles
 * (m), its sag (m), cloth and stripe colours. (The explorer may lie in it: roam/_hammock.ts draws it the same.)
 */
export const GRANDPA_HAMMOCK = { inset: 0.12, sag: 0.62, cloth: 0x3a6ab8, stripe: 0xe0c040 } as const;

/**
 * A hammock from x = −half to +half (its ends at y = 0), sagging `sag` in
 * the middle: part `swing` is the whole of it, turning about the line
 * between its ends (it swings). Rig space: across x, +y up.
 */
export function hammockDef(half: number, sag: number, cloth: number, stripe: number): { def: RigDef; swing: number } {
  const d = new RigDef();
  const swing = d.part([0, 0, 0]);
  const n = 9;
  const rope = 0x8a7450;
  for (let k = 0; k < n; k++) {
    const u = (k + 0.5) / n;
    const x = half - 2 * half * u;
    const y = -sag * 4 * u * (1 - u);
    const tilt = Math.atan((sag * 4 * (1 - 2 * u)) / (2 * half));
    const len = (2 * half) / n / Math.cos(tilt) + 0.03;
    if (u < 0.17 || u > 0.83) d.box([x, y, 0], [len, 0.04, 0.06], rope, { part: swing, rot: [0, 0, tilt] });
    else {
      // (the cloth, widest in the middle, its edges curled up)
      const w = 0.8 - Math.abs(u - 0.5) * 0.7;
      d.box([x, y - 0.03, 0], [len, 0.05, w], k % 3 === 1 ? stripe : cloth, { part: swing, rot: [0, 0, tilt] });
      d.box([x, y + 0.03, w / 2 - 0.02], [len, 0.08, 0.05], cloth, { part: swing, rot: [0, 0, tilt] });
      d.box([x, y + 0.03, -w / 2 + 0.02], [len, 0.08, 0.05], cloth, { part: swing, rot: [0, 0, tilt] });
    }
  }
  return { def: d, swing };
}

/** Rain umbrellas (as the other scenes'): black, dark blue, plum, a flowered one. */
export const UMBRELLAS = [0x2e2e32, 0x2a3a5a, 0x6a2a3a, 0xd86a8a];

/** A look with an umbrella up in the right hand (`CARRY.umbrella`: hold it with `carry(1)`), as people/_sceneMarket.ts's. */
export function withUmbrella(base: Look, cover: number): Look {
  const colors = base.colors.slice();
  colors[SLOT.prop] = cover;
  colors[SLOT.prop2] = cover + 0x181818;
  colors[SLOT.wood] = 0x3a3634;
  return { ...base, colors, feats: [...base.feats.filter((f) => f !== FEAT.phone && f !== FEAT.parcel), FEAT.umbrella], carry: CARRY.umbrella };
}

/** Umbrellas up now (the day's events: rain), held a little past the moment it eases (`was`: the last answer). */
export function raining(f: MapFrame, was: boolean): boolean {
  const wet = eventsNow(f).umbrellas;
  return wet > 0.5 || (was && wet > 0.3);
}
