import { hash3 } from '../../voxel/random';
import type { HeightField } from '../heightfield';
import type { JungleSite } from '../layout';
import type { Subject } from '../types';
import { FERN, fern, MOSS, pickTone, ROCK, Site, stone } from './_campKit';

/**
 * The pool at the foot of the Bayon stream's fall (the fall itself is the
 * water part's): mossy stones round its banks and big boulders at the foot
 * of the cliff, one in the water where the fall comes down, ferns in the
 * damp ground, a flat stone on the near bank to sit on facing the fall, and
 * lily pads with a few pink lotus flowers and buds in the still water at the
 * far end, away from the splash.
 *
 * Built in map space round the site (a `Site` with no turn: its local x, z
 * are map offsets; y from the pool's surface). Returns the open flowers and
 * buds as the nature book's lotus subjects (roam/_book.ts).
 */

/** Keep this far (m) from the trail's middle line (and the bridge on it). */
const TRAIL_CLEAR = 2.2;
/** Lotus pink and its heart (petal family), lily-pad greens (mapLeaf). */
const LOTUS = [0xe59bb0, 0xeaa6bb, 0xd98aa2, 0xf0b8c8];
const PAD = [0x4f7f33, 0x5e8f3a, 0x46752d, 0x689a40];

export function buildPool(s: Site, field: HeightField, site: JungleSite, level: number, keepOff: (x: number, z: number) => boolean): Subject[] {
  const flowers: Subject[] = [];
  const seed = s.seed;
  const tone = (list: readonly number[], i: number, j: number, k: number) => pickTone(list, i, j, k, seed);
  const R = site.r + 2;
  const fall = field.falls.filter((f) => Math.hypot(f.x - site.x, f.z - site.z) < R + 8).sort((a, b) => a.bottom - b.bottom)[0];
  const wet = (x: number, z: number) => {
    const w = field.waterAt(x, z);
    return w !== null && w > field.heightAt(x, z);
  };
  const near = (x: number, z: number) => wet(x + 2, z) || wet(x - 2, z) || wet(x, z + 2) || wet(x, z - 2);
  const blocked = (x: number, z: number) => keepOff(x, z) || trailNear(field, x, z) < TRAIL_CLEAR;

  // ── Stones round the banks, boulders at the cliff's foot ─────────────────
  let id = 0;
  for (let z = site.z - R; z <= site.z + R; z += 2)
    for (let x = site.x - R; x <= site.x + R; x += 2) {
      const cx = Math.floor(x / 2) * 2 + 1;
      const cz = Math.floor(z / 2) * 2 + 1;
      if (Math.hypot(cx - site.x, cz - site.z) > R || wet(cx, cz) || blocked(cx, cz)) continue;
      const h = field.heightAt(cx, cz);
      const r = hash3(cx, cz, 1, seed);
      // (a wall of the cliff next to it: the foot of the fall's cliff)
      const cliff = Math.max(field.heightAt(cx + 2, cz), field.heightAt(cx - 2, cz), field.heightAt(cx, cz + 2), field.heightAt(cx, cz - 2)) > h + 6;
      if (h > level + 2.5) continue;
      const jx = (hash3(cx, cz, 2, seed) - 0.5) * 1.2;
      const jz = (hash3(cx, cz, 3, seed) - 0.5) * 1.2;
      if (cliff && r < 0.55) stone(s, cx + jx - s.x, cz + jz - s.z, 1.3 + 0.9 * hash3(cx, cz, 4, seed), id++, 0.95, 0.25);
      else if (near(cx, cz) && r < 0.4) stone(s, cx + jx - s.x, cz + jz - s.z, 0.6 + 0.7 * hash3(cx, cz, 5, seed), id++, 0.75);
      else if (r > 0.62 && r < 0.8) fern(s, cx + jx - s.x, cz + jz - s.z, 0.8 + 0.5 * hash3(cx, cz, 6, seed), id++);
    }
  // Boulders in the water where the fall comes down, wet and dark, moss on their tops.
  if (fall) {
    for (const [i, [ox, oz, size]] of [
      [2.2, 2.6, 1.6],
      [-2.6, 1.8, 1.2],
      [0.6, 4.4, 0.9],
    ].entries()) {
      // (along the fall's flow and across it)
      const x = fall.x + fall.dir[0] * oz - fall.dir[1] * ox;
      const z = fall.z + fall.dir[1] * oz + fall.dir[0] * ox;
      if (!wet(x, z)) continue;
      const bed = field.heightAt(x, z) - s.y;
      const w = size * (1 + 0.2 * hash3(i, 7, 8, seed));
      s.box(x - s.x, bed + size * 0.35, z - s.z, w, size * 0.9, size * 0.8, tone([0x5f5a52, 0x6a645b, 0x55504a], i, 9, 9), 'mapStone', { ry: i * 1.3 });
      s.box(x - s.x + 0.1, bed + size * 0.85, z - s.z, w * 0.7, 0.14, size * 0.55, tone(MOSS, i, 10, 10), 'mapLeaf', { ry: i * 1.3 + 0.2 });
    }
  }

  // ── The flat stone on the near bank, facing the fall ─────────────────────
  // On the bank toward the trail (the site's facing): the nearest dry ground there, turned to look at the fall.
  const fx = Math.sin(site.facing);
  const fz = Math.cos(site.facing);
  for (let d = 4; d < R; d += 0.5) {
    const x = site.x + fx * d;
    const z = site.z + fz * d;
    if (wet(x, z) || wet(x + fx, z + fz) || field.heightAt(x, z) > level + 2) continue;
    const g = field.heightAt(x, z) - s.y;
    const look = fall ? Math.atan2(fall.x - x, fall.z - z) : site.facing + Math.PI;
    s.box(x - s.x, g + 0.2, z - s.z, 1.6, 0.4, 0.95, tone(ROCK, 1, 11, 11), 'mapStone', { ry: look + Math.PI / 2 });
    s.box(x - s.x, g + 0.44, z - s.z, 1.4, 0.1, 0.8, tone(ROCK, 2, 12, 12), 'mapStone', { ry: look + Math.PI / 2, shade: 1.06 });
    // A smaller stone as a footrest in front, a fern behind.
    s.box(x - s.x + Math.sin(look) * 0.9, g + 0.1, z - s.z + Math.cos(look) * 0.9, 0.6, 0.2, 0.45, tone(ROCK, 3, 13, 13), 'mapStone', { ry: look });
    fern(s, x - s.x - Math.sin(look) * 1.4, z - s.z - Math.cos(look) * 1.4, 1.0, 99);
    break;
  }

  // ── Lily pads and lotus in the still water, away from the fall ────────────
  for (let z = site.z - R; z <= site.z + R; z += 0.9)
    for (let x = site.x - R; x <= site.x + R; x += 0.9) {
      const jx = x + (hash3(x * 10, z * 10, 1, seed) - 0.5) * 0.6;
      const jz = z + (hash3(x * 10, z * 10, 2, seed) - 0.5) * 0.6;
      if (!wet(jx, jz) || !wet(jx + 0.6, jz) || !wet(jx - 0.6, jz) || !wet(jx, jz + 0.6) || !wet(jx, jz - 0.6)) continue;
      if (fall && Math.hypot(jx - fall.x, jz - fall.z) < 8.5) continue;
      if (blocked(jx, jz)) continue;
      // Clumps, not an even sprinkle: a smooth field picks where.
      const clump = hash3(Math.floor(jx / 3), Math.floor(jz / 3), 3, seed);
      if (clump < 0.45 || hash3(x * 10, z * 10, 4, seed) > 0.55) continue;
      const y = (field.waterAt(jx, jz) ?? level) - s.y + 0.03;
      const size = 0.5 + 0.35 * hash3(x * 10, z * 10, 5, seed);
      const turn = hash3(x * 10, z * 10, 6, seed) * Math.PI;
      const c = tone(PAD, x * 10, z * 10, 7);
      s.box(jx - s.x, y, jz - s.z, size, 0.03, size * 0.9, c, 'mapLeaf', { ry: turn });
      s.box(jx - s.x, y + 0.005, jz - s.z, size * 0.8, 0.03, size * 0.8, c, 'mapLeaf', { ry: turn + Math.PI / 4, shade: 1.06 });
      const r = hash3(x * 10, z * 10, 8, seed);
      if (r < 0.22) {
        lotus(s, jx - s.x + 0.1, y + 0.03, jz - s.z + 0.05, x * 10 + z);
        // (a little bigger than the flower: the pad round it too)
        flowers.push({ kind: 'lotus', x: jx + 0.1, y: s.y + y + 0.15, z: jz + 0.05, r: 0.45 });
      } else if (r < 0.32) {
        // A bud on its stalk, standing out of the water.
        const bx = jx - s.x - size * 0.4;
        const bz = jz - s.z;
        s.box(bx, y + 0.3, bz, 0.04, 0.6, 0.04, tone(FERN, x, z, 9), 'mapLeaf');
        s.box(bx, y + 0.66, bz, 0.13, 0.2, 0.13, tone(LOTUS, x, z, 10), 'petal');
        s.box(bx, y + 0.79, bz, 0.07, 0.08, 0.07, tone(LOTUS, x, z, 11), 'petal', { shade: 1.1 });
        flowers.push({ kind: 'lotus', x: bx + s.x, y: s.y + y + 0.6, z: bz + s.z, r: 0.4 });
      }
    }
  return flowers;
}

/** A lotus flower open on the water: a ring of pink petals round a yellow heart. */
function lotus(s: Site, x: number, y: number, z: number, i: number): void {
  const turn = hash3(i, 1, 2, s.seed) * Math.PI;
  for (let p = 0; p < 6; p++) {
    const a = turn + (p / 6) * Math.PI * 2;
    const c = pickTone(LOTUS, i, p, 3, s.seed);
    s.box(x + Math.sin(a) * 0.1, y + 0.08, z + Math.cos(a) * 0.1, 0.1, 0.16, 0.05, c, 'petal', { ry: a, rx: -0.5 });
  }
  for (let p = 0; p < 4; p++) {
    const a = turn + 0.4 + (p / 4) * Math.PI * 2;
    s.box(x + Math.sin(a) * 0.05, y + 0.12, z + Math.cos(a) * 0.05, 0.08, 0.15, 0.04, pickTone(LOTUS, i, p, 4, s.seed), 'petal', { ry: a, rx: -0.2, shade: 1.08 });
  }
  s.box(x, y + 0.1, z, 0.07, 0.06, 0.07, 0xf2c94c, 'petal');
}

/** Distance (m) from (x, z) to the nearest jungle trail sample (within 12 m; else a big number). */
export function trailNear(field: HeightField, x: number, z: number): number {
  let d = 1e9;
  for (const t of field.trails)
    for (const s of t.samples) {
      if (Math.abs(s.x - x) > 12 || Math.abs(s.z - z) > 12) continue;
      d = Math.min(d, Math.hypot(s.x - x, s.z - z));
    }
  return d;
}
