import { Group } from 'three';
import { hash3 } from '../../voxel/random';
import { CH, Flock } from '../fauna/_kit';
import { FOWL } from '../fauna/_landFowl';
import { len2 } from '../fauna/_len';
import { COWS, HENS } from '../hamlet/_psPlan';
import type { MapFrame, Subject } from '../types';
import { OX } from './_ox';
import type { Ground, Obstacle, Traffic } from './_routes';

/**
 * The palm sugar family's animals in their yard (hamlet/_psPlan.ts `COWS`,
 * `HENS`; the people are `_scenePalmSugar.ts`):
 *
 * - **Two white Khmer cows** (the ox cart's zebu, `_ox.ts`), each tied to
 *   its stake — one across the lane by the palm there, one west of the house
 *   by the straw stack — grazing round it as far as the rope lets them, a
 *   few slow steps to a new patch now and then, chewing, their bells
 *   clonking (`cowBell`); at night they stand dozing, heads low.
 * - **The hens and the rooster** scratching round the yard between the
 *   house and the shed: they peck, rake the ground with a foot, look up, walk
 *   a few steps to a new spot; the explorer coming too close sends one
 *   scurrying off; after dusk they sit under the house, heads tucked in.
 *
 * All of it only while the yard is near (the scene's `Pace`); the cows are
 * in the people's traffic (they step round them) and the nature book
 * (`ox`).
 */

const COW_SCALE = 1.22;
const HEN_SCALE = 1.25;
/** The hens: a rooster and four hens. */
const N_HENS = 5;
/** Walking pace of a cow (m/s) and a hen; a hen running off. */
const COW_WALK = 0.35;
const HEN_WALK = 0.42;
const HEN_RUN = 2.6;
/** A hen runs off from the explorer this near (m). */
const SHY = 2.2;

interface Beast {
  x: number;
  y: number;
  z: number;
  yaw: number;
  gx: number;
  gz: number;
  /** When it next picks a new spot / a new thing to do. */
  moveAt: number;
  /** A hen's doing: 0 stand, 1 peck, 2 rake, 3 look up. */
  act: number;
  run: boolean;
}

const beast = (x: number, z: number): Beast => ({ x, y: 0, z, yaw: 0, gx: x, gz: z, moveAt: 0, act: 0, run: false });

export class PsYardAnimals {
  readonly object = new Group();
  private readonly cows = new Flock(OX, COWS.length);
  private readonly hens = new Flock(FOWL, N_HENS);
  private readonly cowAt: Beast[];
  private readonly henAt: Beast[];
  private bellAt = 0;
  private readonly obstacles: Obstacle[] = COWS.map(() => ({ x: 0, y: 0, z: 0, r: 1, vx: 0, vz: 0, who: 'animal' }));

  constructor(private readonly ground: Ground) {
    this.object.name = 'people:palmsugar-animals';
    this.object.add(this.cows.mesh, this.hens.mesh);
    this.cowAt = COWS.map((c, i) => {
      this.cows.setup(i, i % 2, 0.31 + 0.27 * i, 0.97 + 0.05 * i);
      return beast(c.x + 0.6, c.z + 0.4 * (i ? -1 : 1));
    });
    this.henAt = [];
    for (let i = 0; i < N_HENS; i++) {
      this.hens.setup(i, i === 0 ? 0 : 1, hash3(i, 1, 2, 9401), 0.95 + 0.08 * hash3(i, 2, 2, 9402));
      const a = hash3(i, 3, 3, 9403) * Math.PI * 2;
      const r = Math.sqrt(hash3(i, 4, 4, 9404)) * HENS.r;
      this.henAt.push(beast(HENS.x + Math.cos(a) * r, HENS.z + Math.sin(a) * r));
    }
  }

  /** One step (`now`: the people's clock); `ex`: the explorer, if roaming. */
  update(dt: number, now: number, f: MapFrame, ex: Obstacle | null): void {
    const night = f.night > 0.55;
    this.stepCows(dt, now, f, night);
    this.stepHens(dt, now, ex, night);
    this.cows.flush(now);
    this.hens.flush(now);
  }

  hide(): void {
    for (let i = 0; i < COWS.length; i++) this.cows.hide(i);
    for (let i = 0; i < N_HENS; i++) this.hens.hide(i);
    this.cows.flush(0);
    this.hens.flush(0);
  }

  /** The cows into the traffic as animals (people step round them). */
  report(traffic: Traffic): void {
    this.cowAt.forEach((c, k) => {
      const o = this.obstacles[k];
      o.x = c.x;
      o.y = c.y;
      o.z = c.z;
      o.r = 1.0;
      traffic.list.push(o);
    });
  }

  subjects(out: Subject[]): void {
    this.cowAt.forEach((c, i) => {
      if (this.cows.isShown(i)) out.push({ kind: 'ox', x: c.x, y: c.y + 1, z: c.z, r: 1.0 * COW_SCALE });
    });
  }

  /** Grazing on the rope: a new patch now and then, walked to slowly; the head down to the grass most of the time; dozing at night. */
  private stepCows(dt: number, now: number, f: MapFrame, night: boolean): void {
    const fl = this.cows;
    let walking = -1;
    this.cowAt.forEach((c, i) => {
      const stake = COWS[i];
      if (now > c.moveAt && !night) {
        c.moveAt = now + 16 + 14 * hash3(i, Math.floor(now), 3, 9411);
        const a = hash3(i, Math.floor(now), 4, 9412) * Math.PI * 2;
        const r = stake.r * (0.4 + 0.6 * hash3(i, Math.floor(now), 5, 9413));
        c.gx = stake.x + Math.cos(a) * r;
        c.gz = stake.z + Math.sin(a) * r;
      }
      const dx = c.gx - c.x;
      const dz = c.gz - c.z;
      const d = len2(dx, dz);
      const moving = d > 0.05 && !night;
      if (moving) {
        const v = Math.min(d, COW_WALK * dt) / d;
        c.x += dx * v;
        c.z += dz * v;
        // (turning slowly toward the way it walks)
        const want = Math.atan2(dx, dz);
        let e = want - c.yaw;
        e = Math.atan2(Math.sin(e), Math.cos(e));
        c.yaw += Math.max(-0.8 * dt, Math.min(0.8 * dt, e));
        walking = i;
      }
      const g = this.ground.at(c.x, c.z, c.y + 0.6);
      c.y = Number.isFinite(g) ? g : this.ground.field.heightAt(c.x, c.z);
      fl.place(i, c.x, c.y, c.z, c.yaw, COW_SCALE);
      fl.gait(i, moving ? 1 : 0, moving ? COW_WALK / (1.55 * COW_SCALE * 0.5) : 0.5, now);
      const graze = Math.sin(now * 0.07 + i * 2.1) > -0.55;
      fl.set(i, CH.head, night ? 0.9 : moving ? 0.35 : graze ? 1 : Math.round(10 * 0.2 * Math.sin(now * 0.13 + i)) / 10, now);
      fl.set(i, CH.turn, moving || graze ? 0 : Math.round(10 * 0.4 * Math.sin(now * 0.1 + i * 2.3)) / 10, now);
      fl.set(i, CH.act, !night && !moving && hash3(i, Math.floor(now / 6), 7, 9414) > 0.85 ? 1 : 0, now);
    });
    // Bells: with the steps while one walks, now and then as they graze.
    if (f.dt > 0 && now > this.bellAt) {
      const k = walking >= 0 ? walking : Math.floor(hash3(Math.floor(now * 3), 1, 9, 9415) * COWS.length) % COWS.length;
      const c = this.cowAt[k];
      const cam = f.camera.position;
      this.bellAt = now + (walking >= 0 ? 0.9 + 0.8 * hash3(Math.floor(now * 5), 2, 9, 9416) : 6 + 9 * hash3(Math.floor(now), 3, 9, 9417));
      if (len2(c.x - cam.x, c.z - cam.z) < 70) f.calls.push({ kind: 'cowBell', x: c.x, y: c.y + 1.1, z: c.z, gain: walking >= 0 ? 0.45 : night ? 0.12 : 0.28 });
    }
  }

  /** The hens: peck, rake, look, walk to a new spot in the yard; off at a run from the explorer; sitting under the house at night. */
  private stepHens(dt: number, now: number, ex: Obstacle | null, night: boolean): void {
    const fl = this.hens;
    this.henAt.forEach((h, i) => {
      const r = (k: number) => hash3(i, Math.floor(now * 0.5), k, 9421);
      if (night) {
        // (to the roost under the house, side by side)
        h.gx = HENS.roost.x + (i - 2) * 0.32;
        h.gz = HENS.roost.z + (i % 2) * 0.3;
        h.run = false;
      } else if (ex && len2(ex.x - h.x, ex.z - h.z) < SHY && !h.run) {
        // (off at a run, away from him, a few metres, then back to scratching)
        const ax = h.x - ex.x;
        const az = h.z - ex.z;
        const l = len2(ax, az) || 1;
        h.gx = h.x + (ax / l) * 3.2;
        h.gz = h.z + (az / l) * 3.2;
        const cx = h.gx - HENS.x;
        const cz = h.gz - HENS.z;
        const lc = len2(cx, cz);
        if (lc > HENS.r + 2) {
          h.gx = HENS.x + (cx / lc) * (HENS.r + 2);
          h.gz = HENS.z + (cz / lc) * (HENS.r + 2);
        }
        h.run = true;
        h.moveAt = now + 3;
      } else if (now > h.moveAt) {
        h.run = false;
        h.moveAt = now + 2.5 + 5 * r(1);
        if (r(2) < 0.45) {
          const a = r(3) * Math.PI * 2;
          const d = 0.6 + 1.6 * r(4);
          let gx = h.x + Math.cos(a) * d;
          let gz = h.z + Math.sin(a) * d;
          // (kept round the yard's middle)
          const cx = gx - HENS.x;
          const cz = gz - HENS.z;
          const lc = len2(cx, cz);
          if (lc > HENS.r) {
            gx = HENS.x + (cx / lc) * HENS.r * 0.9;
            gz = HENS.z + (cz / lc) * HENS.r * 0.9;
          }
          h.gx = gx;
          h.gz = gz;
          h.act = 0;
        } else h.act = r(5) < 0.6 ? 1 : r(6) < 0.6 ? 2 : 3;
      }
      const dx = h.gx - h.x;
      const dz = h.gz - h.z;
      const d = len2(dx, dz);
      const moving = d > 0.04;
      const speed = h.run ? HEN_RUN : HEN_WALK;
      if (moving) {
        const v = Math.min(d, speed * dt) / d;
        h.x += dx * v;
        h.z += dz * v;
        h.yaw = Math.atan2(dx, dz);
      } else if (h.run) h.run = false;
      const g = this.ground.at(h.x, h.z, h.y + 0.3);
      h.y = Number.isFinite(g) ? g : this.ground.field.heightAt(h.x, h.z);
      fl.place(i, h.x, h.y, h.z, h.yaw, HEN_SCALE);
      fl.gait(i, moving ? (h.run ? 2 : 1) : 0, moving ? (h.run ? 6 : 2.4) : 0.5, now);
      const sit = night && !moving;
      fl.set(i, CH.rest, sit ? 1 : 0, now);
      fl.set(i, CH.head, sit ? 1 : h.act === 3 ? -1 : 0, now);
      fl.set(i, CH.act, moving || sit ? 0 : h.act === 1 ? 1 : h.act === 2 ? 2 : 0, now);
      fl.set(i, CH.turn, moving || sit ? 0 : Math.round(10 * 0.5 * Math.sin(now * 0.7 + i * 1.7)) / 10, now);
    });
  }
}
