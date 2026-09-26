import { Matrix4, type InstancedMesh, type Object3D } from 'three';
import { mulberry32 } from '../../voxel/random';
import { LIFT, type Station } from '../road/line';
import { CH, type Flock } from './_kit';
import type { Survey } from './_landPlaces';
import type { Splash } from './_landSplash';

/**
 * The elephants' bath (the `elephantBath` event, events.ts): in the
 * afternoon the cow and her calf leave the valley road below the River Gate
 * (`findBathSite`: the nearest open, gentle way down the bank into shallow
 * water, near (−39, 16)), wade in, and bathe:
 *
 * - the cow dips her trunk in the river, lifts it and curls it back to
 *   spray the water over her head and back (the drops fly and fall back,
 *   rings where they land, a splash), fans her ears, turns a little, again;
 * - the calf plays: wades about, lies down on its side in the shallows and
 *   kicks, squirts a little water of its own, comes under its mother's spray;
 * - then the calf comes back to her, and they walk up the bank to the road
 *   (the calf behind her, on her track) and walk on.
 *
 * `Bath` places both animals while it runs (flock instances 0 cow, 1 calf,
 * as the trek has them); the trek (_landTrek.ts) walks them to the site's
 * point on the road first and takes them back after.
 */

export interface P3 {
  x: number;
  y: number;
  z: number;
}

/** A way along points, with its length so far at each (m). */
class Line {
  readonly acc: number[] = [0];
  readonly len: number;

  constructor(readonly pts: P3[]) {
    for (let i = 1; i < pts.length; i++) this.acc.push(this.acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    this.len = this.acc[this.acc.length - 1];
  }

  /** The point `s` m along (clamped), and the heading there (yaw: 0 = +z, turning to +x). */
  at(s: number, out: P3 & { yaw: number }): P3 & { yaw: number } {
    const p = this.pts;
    if (p.length < 2) return Object.assign(out, p[0], { yaw: out.yaw });
    s = Math.max(0, Math.min(this.len, s));
    let i = 0;
    while (i < p.length - 2 && this.acc[i + 1] < s) i++;
    const seg = this.acc[i + 1] - this.acc[i] || 1e-6;
    const k = Math.min(1, Math.max(0, (s - this.acc[i]) / seg));
    const a = p[i];
    const b = p[i + 1];
    out.x = a.x + (b.x - a.x) * k;
    out.y = a.y + (b.y - a.y) * k;
    out.z = a.z + (b.z - a.z) * k;
    if (Math.hypot(b.x - a.x, b.z - a.z) > 1e-4) out.yaw = Math.atan2(b.x - a.x, b.z - a.z);
    return out;
  }
}

export interface BathSite {
  /** Along the elephants' stretch of road (m from its first station): where they leave it. */
  s: number;
  /** From the cow's lane on the road down the bank into the water, every 0.5 m; the ground eased into a slope. */
  path: P3[];
  /** The water's surface there (m). */
  level: number;
  /** Out over the water (unit, x z). */
  out: [number, number];
  /** Where the calf plays: a circle of shallow water beside the cow. */
  play: { x: number; z: number; r: number };
  /** Shallow enough to stand in, deep enough to wade (m of water), at (x, z)? */
  wadeable(x: number, z: number): boolean;
  /** …and in the afternoon sun there (for the calf)? */
  sunny(x: number, z: number): boolean;
  /** The river bed (or the ground) at (x, z). */
  bed(x: number, z: number): number;
}

/** Deepest water they stand in, and the shallowest the calf plays in (m). */
const DEEP = 1.35;
const SHALLOW = 0.4;
/** How far into the water the cow wades (m past the edge). */
const WADE = 2.5;
/**
 * Towards the afternoon sun (clock 0: the key light, low in the south-east;
 * sky/palette.ts): the bath is kept out of the shade of the big trees on the
 * far bank, so the elephants are seen in the golden light.
 */
const SUN = (() => {
  const [x, y, z] = [0.7, 0.42, 0.58];
  const l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
})();

/**
 * The blocks that cast shadows (trees, temples) in a box round the bath's
 * reach, as x y z triples: `shadeAt` counts those near the ray from a
 * point towards the afternoon sun.
 */
export function sunBlockers(scene: Object3D, x0: number, x1: number, z0: number, z1: number, y0: number): Float32Array {
  const out: number[] = [];
  const m = new Matrix4();
  scene.updateMatrixWorld(true);
  scene.traverse((o) => {
    const mesh = o as InstancedMesh;
    if (!mesh.isInstancedMesh || !mesh.castShadow || !mesh.count || mesh.name.startsWith('fauna') || mesh.name.endsWith(':plain')) return;
    const a = mesh.instanceMatrix.array as Float32Array;
    // (most parts sit at the origin: their blocks' places are read straight from the array)
    const plain = mesh.matrixWorld.equals(IDENTITY);
    for (let i = 0; i < mesh.count; i++) {
      let x = a[i * 16 + 12];
      let y = a[i * 16 + 13];
      let z = a[i * 16 + 14];
      if (!plain) {
        const e = m.fromArray(a, i * 16).premultiply(mesh.matrixWorld).elements;
        x = e[12];
        y = e[13];
        z = e[14];
      }
      if (x > x0 && x < x1 && z > z0 && z < z1 && y > y0) out.push(x, y, z);
    }
  });
  return new Float32Array(out);
}

const IDENTITY = new Matrix4();

/** Blocks within ~a block of the ray from (x, y, z) towards the afternoon sun. */
function shadeAt(blockers: Float32Array, x: number, y: number, z: number): number {
  let n = 0;
  for (let i = 0; i < blockers.length; i += 3) {
    const vx = blockers[i] - x;
    const vy = blockers[i + 1] - y;
    const vz = blockers[i + 2] - z;
    const along = vx * SUN.x + vy * SUN.y + vz * SUN.z;
    if (along < 0.5) continue;
    if ((vx - SUN.x * along) ** 2 + (vy - SUN.y * along) ** 2 + (vz - SUN.z * along) ** 2 < 0.8) n++;
  }
  return n;
}
/** Water on the legs where they stand in the river: the cow's, the calf's (m). */
const COW_WET = 0.85;
const CALF_WET = 0.6;

/**
 * The best way down to the river from the stretch of road `st` (stations
 * every 0.5 m), on the cow's lane `side` m left of the way: short, clear of
 * trunks and walls, no step over 2.3 m, into water shallow enough to stand
 * in; nearest `target` wins.
 */
export function findBathSite(sv: Survey, st: Station[], side: number, target: { x: number; z: number }, blockers: Float32Array = new Float32Array(0)): BathSite | null {
  const f = sv.field;
  const wadeable = (x: number, z: number) => {
    const c = f.index(x, z);
    if (c < 0) return false;
    const d = f.water[c] - f.height[c];
    return d >= SHALLOW && d <= DEEP && !(sv.cover[c] & 6);
  };
  const bed = (x: number, z: number) => {
    const c = f.index(x, z);
    return c < 0 ? 0 : f.water[c] > f.height[c] ? Math.max(f.height[c], f.water[c] - CALF_WET) : f.height[c];
  };
  /** In the afternoon shade at (x, z): the elephant's back or the calf's (heights over the water)? */
  const shaded = (x: number, y: number, z: number) => shadeAt(blockers, x, y, z) > 0;
  let best: { score: number; i: number; path: P3[]; level: number; out: [number, number] } | null = null;
  // (not right at the stretch's ends, where the trek turns round)
  for (let i = 12; i < st.length - 6; i += 2) {
    const a = st[i];
    const rx = a.x + a.tz * side;
    const rz = a.z - a.tx * side;
    const ry = a.h + LIFT;
    // Towards the nearest river water.
    let near: { x: number; z: number; d: number } | null = null;
    for (const r of f.rivers)
      for (let k = 0; k < r.samples.length; k += 2) {
        const q = r.samples[k];
        const d = Math.hypot(q.x - rx, q.z - rz);
        if (d < 32 && (!near || d < near.d)) near = { x: q.x, z: q.z, d };
      }
    if (!near) continue;
    const ux = (near.x - rx) / near.d;
    const uz = (near.z - rz) / near.d;
    const path: P3[] = [{ x: rx, y: ry, z: rz }];
    let entry = -1;
    let level = 0;
    let last = ry;
    let ok = true;
    for (let k = 1; k <= 64; k++) {
      const d = k * 0.5;
      const x = rx + ux * d;
      const z = rz + uz * d;
      const c = f.index(x, z);
      if (c < 0 || sv.cover[c] & 6) {
        ok = false;
        break;
      }
      const h = f.height[c];
      const w = f.water[c];
      let g = Number.isNaN(sv.paving[c]) ? h : sv.paving[c];
      if (w > h) {
        if (w - h > DEEP) {
          ok = entry >= 0 && d - entry >= 2;
          break;
        }
        g = h;
        if (entry < 0) {
          entry = d;
          level = w;
        }
      }
      if (Math.abs(g - last) > 2.3) {
        ok = false;
        break;
      }
      last = g;
      path.push({ x, y: g, z });
      if (entry >= 0 && d - entry >= WADE) break;
    }
    if (!ok || entry < 0) continue;
    const end = path[path.length - 1];
    const score = -Math.hypot(rx - target.x, rz - target.z) / 3 - path.length / 8 - (shaded(end.x, level + 2, end.z) ? 12 : 0);
    if (!best || score > best.score) best = { score, i, path, level, out: [ux, uz] };
  }
  if (!best) return null;
  // Ease the ground into a slope (a 2 m step of the land becomes a steep bank), the road's end kept as it is;
  // in the river they stand on its sandy bottom, the water up to the cow's knees (the bed there is flat and deeper).
  const raw = best.path.map((p) => p.y);
  const low = best.level - COW_WET;
  const path = best.path.map((p, k) => {
    if (k === 0) return p;
    const n = Math.min(3, k, raw.length - 1 - k);
    let y = 0;
    for (let j = -n; j <= n; j++) y += Math.max(low, raw[k + j]);
    return { x: p.x, y: y / (2 * n + 1), z: p.z };
  });
  // In the water, she wades on to the nearest spot in the sun (her back and her flanks out of the shade) within a few metres.
  const level = best.level;
  const sunny = (x: number, z: number, h: number) => wadeable(x, z) && !shaded(x, level + h, z) && !shaded(x, level + h * 0.4, z);
  // (all of her: her middle and round it, her back and her flanks)
  const cowSunny = (x: number, z: number) => sunny(x, z, 2.2) && [0, 1, 2, 3, 4, 5].every((k) => sunny(x + Math.sin(k * 1.047) * 1.4, z + Math.cos(k * 1.047) * 1.4, 1.6));
  let end = path[path.length - 1];
  if (!cowSunny(end.x, end.z)) {
    let pick: { x: number; z: number; d: number } | null = null;
    for (let dz = -7; dz <= 7; dz += 0.5)
      for (let dx = -7; dx <= 7; dx += 0.5) {
        const d = Math.hypot(dx, dz);
        const x = end.x + dx;
        const z = end.z + dz;
        if (d > 7 || (pick && d >= pick.d) || !cowSunny(x, z)) continue;
        // (room round her, and a clear wade there)
        if (![0, 1, 2, 3].every((k) => wadeable(x + Math.sin(k * 1.571) * 1.4, z + Math.cos(k * 1.571) * 1.4))) continue;
        const n = Math.ceil(d / 0.5);
        let clear = true;
        for (let j = 1; j <= n && clear; j++) clear = wadeable(end.x + (dx * j) / n, end.z + (dz * j) / n);
        if (clear) pick = { x, z, d };
      }
    if (pick) {
      const n = Math.ceil(pick.d / 0.5);
      const from = end;
      for (let j = 1; j <= n; j++) path.push({ x: from.x + ((pick.x - from.x) * j) / n, y: from.y, z: from.z + ((pick.z - from.z) * j) / n });
      end = path[path.length - 1];
    }
  }
  // The calf's pool: beside her, where most of it is wadeable and in the sun.
  const [ux, uz] = best.out;
  let play = { x: end.x + ux * 1.5, z: end.z + uz * 1.5, r: 2.5 };
  let most = -Infinity;
  for (let a = 0; a < 16; a++)
    for (const r of [2.8, 3.8]) {
      const cx = end.x + Math.sin(a * 0.3927) * r;
      const cz = end.z + Math.cos(a * 0.3927) * r;
      if (!wadeable(cx, cz)) continue;
      let n = 0;
      for (let b = 0; b < 12; b++)
        for (const q of [0.8, 1.6, 2.4]) {
          const x = cx + Math.sin(b * 0.5236) * q;
          const z = cz + Math.cos(b * 0.5236) * q;
          if (wadeable(x, z)) n += sunny(x, z, 1.1) ? 1 : 0.2;
        }
      if (n > most) {
        most = n;
        play = { x: cx, z: cz, r: 2.4 };
      }
    }
  return { s: best.i * 0.5, path, level, out: best.out, play, wadeable, sunny: (x, z) => sunny(x, z, 1.1), bed };
}

type Phase = 'down' | 'bathe' | 'gather' | 'up' | 'done';
type CalfDoes = 'follow' | 'wade' | 'roll' | 'rise' | 'squirt' | 'near' | 'stand';
export type BathEvent = 'splash' | 'roll' | 'call' | null;

const V = { cow: 0.72, cowWater: 0.5, calf: 1.4, calfWade: 0.55 };
/** The calf keeps this far behind the cow on her track (m). */
const GAP = 4.5;
/** The cow's steps a second, the calf's (it is smaller). */
const COW_HZ = 0.5;
const CALF_HZ = 0.8;
export const CALF_SIZE = 0.44;

export class Bath {
  phase: Phase = 'down';
  /** Something to hear this step (land.ts makes it a call): the spray falling, the calf flopping over, the cow calling. */
  event: BathEvent = null;
  readonly cow = { x: 0, y: 0, z: 0, yaw: 0 };
  readonly calf = { x: 0, y: 0, z: 0, yaw: 0 };
  private readonly rnd: () => number;
  private readonly down: Line;
  private cowLine: Line;
  private cowS = 0;
  private calfLine: Line;
  private calfS = 0;
  /** The cow's place on the calf's track when she is at the start of hers. */
  private calfOff = 0;
  private readonly p = { x: 0, y: 0, z: 0, yaw: 0 };
  // The cow in the water: what she does, until when; the bath's end.
  private cowDoes: 'dip' | 'spray' | 'idle' = 'idle';
  private cowUntil = 0;
  private cowFace = 0;
  private sprayFrom = 0;
  private sprayed = 0;
  private endAt = 0;
  private gatherUntil = 0;
  private calfDoes: CalfDoes = 'follow';
  private calfUntil = 0;
  private calfTo = { x: 0, z: 0 };
  private calfSpray = 0;
  private cowRing = 0;
  private calfRing = 0;
  private started = false;

  constructor(
    private readonly flock: Flock,
    private readonly site: BathSite,
    /** Where they walk on after (the road ahead, on the cow's lane: the calf's track ends on it). */
    private readonly after: P3[],
    cow: { x: number; y: number; z: number; yaw: number },
    calf: { x: number; y: number; z: number; yaw: number },
    private readonly splash: Splash | null,
    seed: number,
  ) {
    this.rnd = mulberry32(seed);
    Object.assign(this.cow, cow);
    Object.assign(this.calf, calf);
    this.down = new Line(site.path);
    this.cowLine = this.down;
    const lead = { x: calf.x, y: calf.y, z: calf.z };
    this.calfLine = new Line([lead, ...site.path]);
    this.calfOff = this.calfLine.acc[1];
  }

  /** The time the bath began, and its phases (checks). */
  readonly log: string[] = [];

  step(dt: number, now: number, night: number): void {
    const f = this.flock;
    const r = this.rnd;
    this.event = null;
    if (!this.started) {
      this.started = true;
      this.log.push(`down ${now.toFixed(1)}`);
    }
    const inWater = (x: number, z: number) => this.site.wadeable(x, z) || this.site.bed(x, z) < this.site.level - 0.2;

    // ── The cow ──
    let cowMoving = false;
    if (this.phase === 'down' || this.phase === 'up') {
      const at = this.cowLine.at(this.cowS + 0.6, this.p);
      const want = at.yaw;
      const diff = wrap(want - this.cow.yaw);
      this.cow.yaw = wrap(this.cow.yaw + clamp(diff, -0.5 * dt, 0.5 * dt));
      const wet = inWater(this.cow.x, this.cow.z);
      const v = (wet ? V.cowWater : V.cow) * Math.max(0, Math.cos(diff) * 1.4 - 0.4);
      if (v > 0.02) {
        this.cowS = Math.min(this.cowLine.len, this.cowS + v * dt);
        cowMoving = true;
      }
      const p = this.cowLine.at(this.cowS, this.p);
      this.cow.x = p.x;
      this.cow.y = p.y;
      this.cow.z = p.z;
      if (this.cowS >= this.cowLine.len - 0.01 && Math.abs(diff) < 0.05) {
        if (this.phase === 'down') {
          this.phase = 'bathe';
          this.endAt = now + 50 + 20 * r();
          this.cowFace = this.cow.yaw;
          this.cowDoes = 'idle';
          this.cowUntil = now + 2;
          this.event = 'call';
          this.log.push(`bathe ${now.toFixed(1)}`);
        } else {
          this.phase = 'done';
          this.log.push(`done ${now.toFixed(1)}`);
        }
      }
    } else if (this.phase === 'bathe' || this.phase === 'gather') {
      // Dip, spray, rest (a little turn now and then), again; at night or at the end: out.
      if (now >= this.cowUntil) {
        if (this.cowDoes === 'dip') {
          this.cowDoes = 'spray';
          this.cowUntil = now + 2.6;
          this.sprayFrom = now + 0.8;
          this.sprayed = 0;
        } else if (this.cowDoes === 'spray') {
          this.cowDoes = 'idle';
          this.cowUntil = now + 3 + 4 * r();
          if (r() < 0.5) this.cowFace = wrap(this.cowFace + (r() - 0.5) * 1.1);
        } else if (this.phase === 'bathe' && now < this.endAt && night < 0.6) {
          this.cowDoes = 'dip';
          this.cowUntil = now + 2.2 + 0.6 * r();
        } else if (this.phase === 'bathe') {
          // Time to go: the calf comes to her (a rolling calf gets up first).
          this.phase = 'gather';
          this.gatherUntil = now + 25;
          if (this.calfDoes === 'roll') this.calfUntil = now;
          else if (this.calfDoes !== 'follow') {
            this.calfDoes = 'near';
            this.calfTo = this.behindCow();
          }
          this.cowUntil = now + 1e9;
          this.log.push(`gather ${now.toFixed(1)}`);
        }
      }
      this.cow.yaw = wrap(this.cow.yaw + clamp(wrap(this.cowFace - this.cow.yaw), -0.25 * dt, 0.25 * dt));
      if (this.cowDoes === 'dip' && now > this.cowRing) {
        this.cowRing = now + 0.6;
        const tx = this.cow.x + Math.sin(this.cow.yaw) * 2.1;
        const tz = this.cow.z + Math.cos(this.cow.yaw) * 2.1;
        this.splash?.ring(tx, this.site.level, tz, now, 0.7, 0.55, 1.6);
      }
      if (this.cowDoes === 'spray') this.spray(now, dt, false);
    }
    f.gait(0, cowMoving ? 1 : 0, COW_HZ, now);
    f.set(0, CH.act, this.phase === 'bathe' || this.phase === 'gather' ? (this.cowDoes === 'dip' ? -1 : this.cowDoes === 'spray' ? 3 : 0) : 0, now);
    f.set(0, CH.head, 0, now);
    f.set(0, CH.rest, 0, now);
    f.set(0, CH.turn, 0, now);
    if (inWater(this.cow.x, this.cow.z) && now > this.cowRing && (cowMoving || r() < dt * 0.7)) {
      this.cowRing = now + (cowMoving ? 0.7 : 1.2);
      this.splash?.ring(this.cow.x + (r() - 0.5) * 0.8, this.site.level, this.cow.z + (r() - 0.5) * 0.8, now, cowMoving ? 2.1 : 1.7, 0.6, 2.4);
    }
    f.place(0, this.cow.x, this.cow.y, this.cow.z, this.cow.yaw, 1);

    // ── The calf ──
    this.stepCalf(dt, now, r, inWater);
    // Everyone out: once the calf is back by her, up the bank.
    if (this.phase === 'gather' && (this.calfDoes === 'stand' || now > this.gatherUntil) && this.cowDoes === 'idle') {
      this.phase = 'up';
      this.log.push(`up ${now.toFixed(1)}`);
      const back = [...this.site.path].reverse();
      this.cowLine = new Line([{ x: this.cow.x, y: this.cow.y, z: this.cow.z }, ...back.slice(1), ...this.after]);
      this.cowS = 0;
      this.calfLine = new Line([{ x: this.calf.x, y: this.calf.y, z: this.calf.z }, ...this.cowLine.pts]);
      this.calfOff = this.calfLine.acc[1];
      this.calfS = 0;
      this.calfDoes = 'follow';
    }
  }

  private stepCalf(dt: number, now: number, r: () => number, inWater: (x: number, z: number) => boolean): void {
    const f = this.flock;
    const c = this.calf;
    let moving = 0;
    let rest = 0;
    let act = 0;
    if (this.calfDoes === 'follow') {
      // On the cow's track, a few metres behind her.
      const want = Math.max(0, this.calfOff + this.cowS - GAP);
      const gap = want - this.calfS;
      if (gap > 0.05) {
        const v = Math.min(gap * 0.9, V.calf);
        this.calfS += v * dt;
        moving = v > 1 ? 2 : 1;
      }
      const p = this.calfLine.at(this.calfS, this.p);
      c.x = p.x;
      c.y = p.y;
      c.z = p.z;
      if (moving) c.yaw = turnTo(c.yaw, p.yaw, 2.5 * dt);
      // Its mother is in the water: off to play.
      if (this.phase === 'bathe') this.pickCalf(now, r, true);
    } else {
      const inPool = this.calfDoes === 'wade' || this.calfDoes === 'near';
      if (inPool) {
        const dx = this.calfTo.x - c.x;
        const dz = this.calfTo.z - c.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.15) {
          const diff = wrap(Math.atan2(dx, dz) - c.yaw);
          c.yaw = wrap(c.yaw + clamp(diff, -2 * dt, 2 * dt));
          const go = Math.min(d, V.calfWade * dt * Math.max(0, Math.cos(diff)));
          c.x += Math.sin(c.yaw) * go;
          c.z += Math.cos(c.yaw) * go;
          moving = go > 0 ? 1 : 0;
        } else if (this.calfDoes === 'near') {
          this.calfDoes = 'stand';
          this.calfUntil = now + (this.phase === 'gather' ? 1e9 : 3 + 3 * r());
          c.yaw = this.cow.yaw;
        } else this.calfUntil = Math.min(this.calfUntil, now);
      }
      if (this.calfDoes === 'roll') {
        rest = 2;
        if (now > this.calfRing) {
          this.calfRing = now + 0.8 + 0.6 * r();
          this.splash?.ring(c.x + (r() - 0.5) * 0.9, this.site.level, c.z + (r() - 0.5) * 0.9, now, 1.1 + 0.6 * r(), 0.75, 1.8, 0.45);
        }
      }
      if (this.calfDoes === 'squirt') {
        act = 3;
        this.spray(now, dt, true);
      }
      // (lying down it rolls on the shallow sand at the edge of its pool: a little higher, more of it out of the water)
      c.y += (this.site.bed(c.x, c.z) + (this.calfDoes === 'roll' ? 0.25 : 0) - c.y) * Math.min(1, dt * 1.5);
      if (now >= this.calfUntil && this.calfDoes !== 'stand') this.pickCalf(now, r, false);
      else if (this.calfDoes === 'stand' && now >= this.calfUntil) this.pickCalf(now, r, false);
    }
    if (moving && inWater(c.x, c.z) && now > this.calfRing) {
      this.calfRing = now + 0.5;
      this.splash?.ring(c.x, this.site.level, c.z, now, 0.9, 0.45, 1.5);
    }
    const hz = moving === 2 ? CALF_HZ * 1.6 : CALF_HZ;
    f.gait(1, moving, hz, now);
    f.set(1, CH.rest, rest, now);
    f.set(1, CH.act, act, now);
    f.set(1, CH.head, moving ? 0 : 0.2, now);
    f.set(1, CH.turn, 0, now);
    f.place(1, c.x, c.y, c.z, c.yaw, CALF_SIZE);
  }

  /** What the calf does next in the pool (first: wade out and flop over). */
  private pickCalf(now: number, r: () => number, first: boolean): void {
    const c = this.calf;
    const was = this.calfDoes;
    if (was === 'roll') {
      // (getting up again takes a moment)
      this.calfDoes = 'rise';
      this.calfUntil = now + 2.6;
      return;
    }
    if (this.phase === 'gather') {
      this.calfDoes = 'near';
      this.calfTo = this.behindCow();
      return;
    }
    const pick = first ? 0 : r() * 10;
    if (pick < 3.5 && was !== 'wade') {
      this.calfDoes = 'wade';
      this.calfTo = this.poolSpot(r);
      this.calfUntil = now + 14;
    } else if (pick < 6 && was !== 'rise') {
      this.calfDoes = 'roll';
      this.calfUntil = now + 5 + 3 * r();
      this.calfRing = now + 0.4;
      this.splash?.ring(c.x, this.site.level, c.z, now, 1.6, 0.8, 2, 1);
      this.event = 'roll';
    } else if (pick < 7.5) {
      this.calfDoes = 'squirt';
      this.calfUntil = now + 2.2;
      this.calfSpray = now + 0.7;
    } else {
      this.calfDoes = 'near';
      this.calfTo = this.behindCow();
      this.calfUntil = now + 14;
    }
  }

  /** A wadeable spot in the calf's pool. */
  private poolSpot(r: () => number): { x: number; z: number } {
    const pl = this.site.play;
    for (let k = 0; k < 16; k++) {
      const a = r() * Math.PI * 2;
      const d = pl.r * Math.sqrt(r());
      const x = pl.x + Math.sin(a) * d;
      const z = pl.z + Math.cos(a) * d;
      // (in the sun if it can: the first tries)
      if ((k < 10 ? this.site.sunny(x, z) : this.site.wadeable(x, z)) && Math.hypot(x - this.cow.x, z - this.cow.z) > 2.2) return { x, z };
    }
    return { x: this.calf.x, z: this.calf.z };
  }

  /** Beside the cow, towards the water (under her spray). */
  private behindCow(): { x: number; z: number } {
    const c = this.cow;
    const [ux, uz] = this.site.out;
    for (const ok of [this.site.sunny, this.site.wadeable])
      for (const s of [1, -1])
        for (const out of [0.8, -0.8]) {
          const x = c.x + Math.cos(c.yaw) * 1.9 * s + ux * out;
          const z = c.z - Math.sin(c.yaw) * 1.9 * s + uz * out;
          if (ok(x, z)) return { x, z };
        }
    return { x: c.x + ux * 2.2, z: c.z + uz * 2.2 };
  }

  /** Water thrown up from the trunk and back over the head (the calf: a small squirt). */
  private spray(now: number, dt: number, small: boolean): void {
    const from = small ? this.calfSpray : this.sprayFrom;
    const span = small ? 0.8 : 1.5;
    if (now < from || now > from + span || !this.splash) return;
    const a = small ? this.calf : this.cow;
    const k = small ? CALF_SIZE : 1;
    const rate = small ? 28 : 90;
    const r = this.rnd;
    const s = Math.sin(a.yaw);
    const c = Math.cos(a.yaw);
    // (the trunk's tip, curled up over the forehead)
    const tx = a.x + s * 2.0 * k;
    const tz = a.z + c * 2.0 * k;
    const ty = a.y + 3.2 * k;
    this.sprayed += rate * dt;
    while (this.sprayed >= 1) {
      this.sprayed--;
      const t0 = now - r() * dt;
      // Up and back over the back, fanning out.
      const up = (2.6 + 1.4 * r()) * Math.sqrt(k);
      const back = -(1.7 + 1.6 * r()) * Math.sqrt(k);
      const lat = (r() - 0.5) * 1.8 * Math.sqrt(k);
      const vx = c * lat + s * back;
      const vz = -s * lat + c * back;
      this.splash.drop(tx + (r() - 0.5) * 0.25, ty, tz + (r() - 0.5) * 0.25, t0, vx, up, vz, (0.1 + 0.12 * r()) * (small ? 0.75 : 1), 2.2, this.site.level);
      // Some make a ring where they come down.
      if (r() < 0.3) {
        const fall = (up + Math.sqrt(up * up + 19.6 * (ty - this.site.level))) / 9.8;
        this.splash.ring(tx + vx * fall, this.site.level, tz + vz * fall, t0 + fall, 0.45 + 0.4 * r(), 0.7, 1.3);
      }
    }
    if (!small && now - dt < from + 0.9 && now >= from + 0.9) this.event = 'splash';
  }
}

const TAU = Math.PI * 2;
function wrap(a: number): number {
  a %= TAU;
  return a > Math.PI ? a - TAU : a < -Math.PI ? a + TAU : a;
}
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
function turnTo(yaw: number, want: number, k: number): number {
  return wrap(yaw + clamp(wrap(want - yaw), -k, k));
}
