import { BufferAttribute, BufferGeometry, CanvasTexture, Color, Points, PointsMaterial } from 'three';
import { smoothstep } from '../../character/pose';
import { hash3 } from '../../voxel/random';
import type { HeightField } from '../heightfield';
import type { RoamWorld } from './types';

/**
 * Rising air for the hang glider: it keeps the real glider up and lets him
 * fly the whole map (with easy flying, hangGlider.ts, it only helps).
 *
 * - Along cliffs (ridge lift): wherever the land rises steeply close by,
 *   the air goes up over it, from the cliff's foot to some way over its
 *   top. Fly along a cliff to climb.
 * - Warm columns (thermals) over open lowland, a few on the map, marked by
 *   golden seed fluff drifting up in slow spirals (seen from far while
 *   flying). Circle inside one to climb high.
 *
 * `liftAt` is m/s upwards at a point. The sink of the glider itself is
 * hangGlider.ts's.
 */

/** Ridge lift: strongest (m/s) where a cliff this high (m) rises within ~35 m; it fades from this far over the cliff's top (m). */
const RIDGE = 2.4;
const RIDGE_RISE = [6, 24] as const;
const RIDGE_OVER = [10, 42] as const;
/**
 * Thermals: core strength (m/s), radius (m), how high they reach over the
 * ground (m). Wide enough that a full-bank circle (about 25 m round, see
 * hangGlider.ts) stays in the strong part: about 1.3 m/s up there.
 */
const THERMAL = 3.6;
const THERMAL_R = 36;
const THERMAL_TOP = 165;
/** Where they rise (m): open ground by the mesas and hills, round the map. */
const THERMAL_AT: readonly [number, number][] = [
  // (the open valley under the summit's south cliff, clear of the shrine mesa)
  [12, -45],
  [-135, -95],
  [140, -55],
  [-215, 20],
  [70, -330],
  [255, -300],
  [-300, -360],
];
/** The most the air rises anywhere (m/s): a thermal by a cliff. */
const LIFT_MAX = 4.5;
/** Seed fluff in each column, and its size (m: big enough to see a column from a few hundred metres). */
const MOTES = 72;
const MOTE_SIZE = 2.2;

const RING = Array.from({ length: 12 }, (_, i) => [Math.cos((i * Math.PI) / 6), Math.sin((i * Math.PI) / 6)] as const);

export interface Thermal {
  x: number;
  z: number;
  ground: number;
  top: number;
}

export class Lift {
  readonly thermals: Thermal[];
  /** The seed fluff (shown while flying). */
  readonly object: Points<BufferGeometry, PointsMaterial>;
  private readonly pos: Float32Array;
  /** Each mote's seeds (three per mote), drawn once. */
  private readonly seeds: Float32Array;
  private shown = 0;

  constructor(
    field: HeightField,
    private readonly world: RoamWorld,
  ) {
    this.thermals = THERMAL_AT.map(([x, z]) => {
      const ground = Math.max(field.heightAt(x, z), field.waterAt(x, z) ?? -Infinity);
      return { x, z, ground, top: ground + THERMAL_TOP };
    });
    this.pos = new Float32Array(this.thermals.length * MOTES * 3);
    this.seeds = new Float32Array(this.pos.length);
    for (let i = 0, n = 0; i < this.thermals.length; i++) for (let k = 0; k < MOTES; k++) for (let c = 1; c <= 3; c++) this.seeds[n++] = hash3(i, k, c, 61);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    // (plain blending: added light turns white against the bright evening sky; gold should read as gold)
    const mat = new PointsMaterial({ size: MOTE_SIZE, map: fluffTexture(), color: new Color(1, 0.8, 0.42), transparent: true, opacity: 0, depthWrite: false, fog: true });
    this.object = new Points(geo, mat);
    this.object.name = 'roam:thermals';
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  /** Air rising at (x, y, z) (m/s; a thermal by a cliff adds to its ridge lift, up to a limit). */
  liftAt(x: number, y: number, z: number): number {
    return Math.min(LIFT_MAX, this.ridge(x, y, z) + this.thermal(x, y, z));
  }

  /** Air rising in the thermals at (x, y, z) (m/s; a little sinking round their edges). */
  thermal(x: number, y: number, z: number): number {
    let up = 0;
    for (const t of this.thermals) {
      const d = Math.hypot(x - t.x, z - t.z) / THERMAL_R;
      if (d >= 1.3 || y > t.top) continue;
      // Strong over most of it, a little sinking air round its edge; weaker near the ground and the top.
      const core = d < 1 ? 1 - d * d * d : -0.25 * Math.sin(((d - 1) / 0.3) * Math.PI);
      up += THERMAL * core * smoothstep(t.ground + 2, t.ground + 20, y) * (1 - smoothstep(t.top - 40, t.top, y));
    }
    return up;
  }

  /**
   * Circling in a thermal, the pilot feels where it is stronger and edges
   * his circle that way: the way (m, level) from (x, z) to the core of the
   * thermal he is in, and how much he is in it (0‥1; 0 = in none).
   */
  toCore(x: number, y: number, z: number, out: { x: number; z: number }): number {
    for (const t of this.thermals) {
      const dx = t.x - x;
      const dz = t.z - z;
      const d = Math.hypot(dx, dz) / THERMAL_R;
      if (d >= 1.25 || y > t.top || y < t.ground + 2) continue;
      out.x = dx;
      out.z = dz;
      return 1 - smoothstep(0.9, 1.25, d);
    }
    out.x = out.z = 0;
    return 0;
  }

  private ridge(x: number, y: number, z: number): number {
    const w = this.world;
    const g0 = Math.max(w.groundAt(x, z), w.waterAt(x, z) ?? -Infinity);
    let top = g0;
    for (const [cx, cz] of RING) top = Math.max(top, w.groundAt(x + cx * 16, z + cz * 16), w.groundAt(x + cx * 34, z + cz * 34));
    const rise = top - g0;
    if (rise < RIDGE_RISE[0]) return 0;
    return RIDGE * smoothstep(RIDGE_RISE[0], RIDGE_RISE[1], rise) * (1 - smoothstep(RIDGE_OVER[0], RIDGE_OVER[1], y - top)) * smoothstep(g0 + 1, g0 + 6, y);
  }

  /** The seed fluff: spirals up each column (only drawn while `show`). */
  frame(t: number, dt: number, night: number, show: boolean): void {
    this.shown = Math.min(1, Math.max(0, this.shown + (show ? dt : -dt) / 1.5));
    const mat = this.object.material;
    mat.opacity = this.shown * (0.9 - 0.4 * night);
    this.object.visible = this.shown > 0.01;
    if (!this.object.visible) return;
    const p = this.pos;
    const sd = this.seeds;
    let n = 0;
    for (const th of this.thermals) {
      const h = th.top - th.ground - 10;
      for (let k = 0; k < MOTES; k++) {
        const a = sd[n];
        const b = sd[n + 1];
        const c = sd[n + 2];
        // Up at 1.5‥3 m/s round and round, in the strong middle of the column, wider higher up.
        const up = (c * h + t * (1.5 + 1.5 * a)) % h;
        const r = THERMAL_R * (0.1 + 0.55 * b) * (0.7 + 0.5 * (up / h));
        const ang = a * 6.283 + t * (0.25 + 0.2 * b) + up * 0.02;
        p[n++] = th.x + Math.cos(ang) * r;
        p[n++] = th.ground + 6 + up;
        p[n++] = th.z + Math.sin(ang) * r;
      }
    }
    this.object.geometry.attributes.position.needsUpdate = true;
  }
}

/** A soft round speck (a tuft of seed fluff), drawn once. */
function fluffTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,248,225,0.55)');
  grd.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  return new CanvasTexture(c);
}
