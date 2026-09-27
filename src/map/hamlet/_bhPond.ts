import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { pickTone, Site } from '../jungle/_campKit';
import type { Subject } from '../types';
import { BAMBOO, DECK, POST, tone } from '../village/_kit';
import type { BuildEnv } from './_bhHouses';
import { POND, type BackSpots } from './_bhSpots';

/**
 * The lotus pond by the hamlet behind Angkor Wat: pink lotus flowers, buds
 * and big round leaves on the still water (clumps, the leaves held up on
 * their stalks as well as floating), reeds along its north and west shores;
 * on the east bank the children's plank jetty on posts (a bamboo ladder at
 * its end, flip-flops left on the planks, a krama hung on a post) and flat
 * stones stepping up out of the water beside it; at the muddy west end the
 * buffalo wallow: churned mud on the bank and in the shallows.
 *
 * Returns the lotus flowers and buds for the nature book.
 */

const PAD = [0x3f7a2e, 0x4a8a34, 0x467f30, 0x55903a, 0x3a6e2a];
const LOTUS = [0xf08ab0, 0xe8729c, 0xf6b0c8, 0xec80a8];
const STALK = [0x5a7a3a, 0x4e6e34];
const REED = [0x6a8a3a, 0x7a9842, 0x5e7e34, 0x8a9a4a, 0x9a8a4e];
const MUD = [0x6a5842, 0x5e4e3a, 0x74624a, 0x655440];
const STONE = [0x8a857c, 0x7d786f, 0x958f84];

export function buildPond(env: BuildEnv, spots: BackSpots): Subject[] {
  const src = traceSource();
  const p = spots.pond;
  const level = p.level;
  // (a frame at the pond's middle, on the water: local y 0 is the water)
  const s = new Site(env.world, env.field, POND.x, level, POND.z, 0, src, 71);
  const flowers: Subject[] = [];
  jetty(env, s, spots);
  stepsOut(s, spots);
  lotusBeds(env, s, spots, flowers);
  wallow(env, s, spots);
  reeds(env, s, spots);
  return flowers;
}

/** The children's jetty: planks on two bearers on posts, a ladder at its end, a few things left on it. */
function jetty(env: BuildEnv, s: Site, spots: BackSpots): void {
  const j = spots.pond.jetty;
  const y = j.y - s.y;
  const [rx, rz] = j.root;
  const [ex] = j.end;
  const hw = j.w / 2;
  const x0 = Math.min(rx, ex) - s.x;
  const x1 = Math.max(rx, ex) - s.x;
  const z = rz - s.z;
  // Planks across, a finger's gap between them.
  for (let x = x0, i = 0; x < x1 - 0.05; x += 0.42, i++) s.box(x + 0.19, y - 0.06, z, 0.38, 0.12, j.w, pickTone(DECK, i, 1, 2, s.seed), 'mapBark', { shade: 0.93 + 0.1 * hash3(i, 3, 4, 71) });
  for (const d of [-hw + 0.18, hw - 0.18]) s.box((x0 + x1) / 2, y - 0.2, z + d, x1 - x0, 0.14, 0.14, tone(POST, 0.4), 'mapBark', { shade: 0.85 });
  // Posts in pairs down to the bed, the end pair standing up past the deck.
  for (let x = x0 + 0.3; x < x1; x += 1.7) {
    for (const d of [-hw + 0.1, hw - 0.1]) {
      const wx = s.x + x;
      const wz = s.z + z + d;
      const g = env.field.heightAt(wx, wz) - s.y;
      if (g > y - 0.4) continue;
      const end = x < x0 + 0.5;
      const top = end ? y + 0.8 : y - 0.27;
      s.box(x, (g - 0.3 + top) / 2, z + d, 0.16, top - g + 0.3, 0.16, pickTone(POST, x * 10, d * 10, 3, s.seed), 'mapBark');
    }
  }
  // (a krama hung over the end post, drying)
  s.box(x0 + 0.3, y + 0.55, z + hw - 0.1, 0.2, 0.5, 0.05, 0xb8322c, 'petal');
  s.box(x0 + 0.3, y + 0.6, z + hw - 0.07, 0.21, 0.08, 0.05, 0xf0ece0, 'petal');
  // The bamboo ladder down into the water on the south side of the end.
  for (const d of [x0 + 0.85, x0 + 1.45]) s.box(d, y - 0.55, z + hw + 0.1, 0.07, 1.4, 0.07, tone(BAMBOO, d), 'mapBark');
  for (let k = 0; k < 3; k++) s.box(x0 + 1.15, y - 0.3 - k * 0.35, z + hw + 0.1, 0.66, 0.06, 0.06, tone(BAMBOO, 0.6), 'mapBark');
  // Flip-flops kicked off on the planks, a bucket.
  s.box(x1 - 1.2, y + 0.015, z - 0.3, 0.11, 0.03, 0.25, 0x3a6ac0, 'petal', { ry: 0.3 });
  s.box(x1 - 1.0, y + 0.015, z - 0.15, 0.11, 0.03, 0.25, 0x3a6ac0, 'petal', { ry: -0.2 });
  s.box(x1 - 1.9, y + 0.015, z + 0.35, 0.11, 0.03, 0.25, 0xd04a4a, 'petal', { ry: 1.2 });
  s.box(x1 - 0.6, y + 0.16, z + 0.4, 0.3, 0.3, 0.3, 0xe8c040, 'mapStone');
}

/** Flat stones stepping up out of the water onto the bank, south of the jetty (the children climb out here). */
function stepsOut(s: Site, spots: BackSpots): void {
  const { water, bank } = spots.pond.steps;
  const [wx, wz] = water;
  const [bx, by, bz] = bank;
  const dx = bx - wx;
  const dz = bz - wz;
  const ry = Math.atan2(dx, dz);
  const tops = [-0.05, 0.3, (by - s.y) * 0.72];
  tops.forEach((t, k) => {
    const u = 0.2 + k * 0.28;
    s.box(wx + dx * u - s.x, (t - 0.9) / 2, wz + dz * u - s.z, 1.1, t + 0.9, 0.7, pickTone(STONE, k, 5, 6, s.seed), 'mapStone', { ry, shade: 0.9 + 0.05 * k });
  });
}

/**
 * Lotus clumps over the pond (not in the children's swimming water, round
 * the jetty or in the wallow): floating pads, leaves held up on stalks,
 * open flowers (a ring of pink petals round a gold heart) and buds.
 */
function lotusBeds(env: BuildEnv, s: Site, spots: BackSpots, flowers: Subject[]): void {
  const p = spots.pond;
  const f = env.field;
  const wet = (x: number, z: number) => {
    const w = f.waterAt(x, z);
    return w !== null && w > f.heightAt(x, z) + 0.3;
  };
  const clear = (x: number, z: number) => {
    if (Math.hypot(x - p.swim.x, z - p.swim.z) < p.swim.r + 1.2) return false;
    if (Math.abs(z - p.jetty.root[1]) < 2.2 && x > p.jetty.end[0] - 2) return false;
    if (Math.hypot(x - p.steps.water[0], z - p.steps.water[1]) < 2.5) return false;
    for (const [wx, wz] of p.wallow) if (Math.hypot(x - wx, z - wz) < 3.6) return false;
    return true;
  };
  const R = Math.max(POND.rx, POND.rz) + 1;
  for (let z = POND.z - R; z <= POND.z + R; z += 0.85)
    for (let x = POND.x - R; x <= POND.x + R; x += 0.85) {
      const jx = x + (hash3(x * 10, z * 10, 1, 72) - 0.5) * 0.6;
      const jz = z + (hash3(x * 10, z * 10, 2, 72) - 0.5) * 0.6;
      if (!wet(jx, jz) || !wet(jx + 0.6, jz) || !wet(jx - 0.6, jz) || !wet(jx, jz + 0.6) || !wet(jx, jz - 0.6)) continue;
      if (!clear(jx, jz)) continue;
      // Clumps: a smooth field picks where they grow.
      const clump = hash3(Math.floor(jx / 3.2), Math.floor(jz / 3.2), 3, 72);
      if (clump < 0.4 || hash3(x * 10, z * 10, 4, 72) > 0.62) continue;
      const lx = jx - s.x;
      const lz = jz - s.z;
      const size = 0.55 + 0.4 * hash3(x * 10, z * 10, 5, 72);
      const turn = hash3(x * 10, z * 10, 6, 72) * Math.PI;
      const r = hash3(x * 10, z * 10, 8, 72);
      const c = pickTone(PAD, x * 10, z * 10, 7, s.seed);
      if (r < 0.62) {
        // A floating pad (two squares turned: a round leaf).
        s.box(lx, 0.03, lz, size, 0.03, size * 0.9, c, 'mapLeaf', { ry: turn });
        s.box(lx, 0.035, lz, size * 0.8, 0.03, size * 0.8, c, 'mapLeaf', { ry: turn + Math.PI / 4, shade: 1.06 });
      } else if (r < 0.8) {
        // A leaf held up on its stalk, tipped a little.
        const h = 0.45 + 0.5 * hash3(x, z, 9, 72);
        s.box(lx, h / 2, lz, 0.04, h, 0.04, pickTone(STALK, x, z, 10, s.seed), 'mapLeaf');
        s.box(lx, h, lz, size * 1.05, 0.05, size * 1.05, c, 'mapLeaf', { ry: turn, rz: 0.22, shade: 1.08 });
      } else if (r < 0.9) {
        // An open flower on a pad.
        s.box(lx, 0.03, lz, size, 0.03, size * 0.9, c, 'mapLeaf', { ry: turn });
        flower(s, lx + 0.12, 0.05, lz + 0.06, x * 10 + z);
        flowers.push({ kind: 'lotus', x: jx + 0.12, y: s.y + 0.2, z: jz + 0.06, r: 0.45 });
      } else {
        // A bud on its stalk, standing out of the water; now and then a flower held up high.
        const h = 0.5 + 0.4 * hash3(x, z, 11, 72);
        s.box(lx, h / 2, lz, 0.04, h, 0.04, pickTone(STALK, x, z, 12, s.seed), 'mapLeaf');
        if (r < 0.95) {
          s.box(lx, h + 0.08, lz, 0.14, 0.22, 0.14, pickTone(LOTUS, x, z, 13, s.seed), 'petal');
          s.box(lx, h + 0.22, lz, 0.07, 0.08, 0.07, pickTone(LOTUS, x, z, 14, s.seed), 'petal', { shade: 1.1 });
        } else flower(s, lx, h, lz, x * 7 + z);
        flowers.push({ kind: 'lotus', x: jx, y: s.y + h + 0.1, z: jz, r: 0.4 });
      }
    }
}

/** A lotus flower open: a ring of pink petals leaning out round a gold heart. */
function flower(s: Site, x: number, y: number, z: number, i: number): void {
  const turn = hash3(i, 1, 2, 73) * Math.PI;
  for (let p = 0; p < 6; p++) {
    const a = turn + (p / 6) * Math.PI * 2;
    s.box(x + Math.sin(a) * 0.11, y + 0.09, z + Math.cos(a) * 0.11, 0.11, 0.18, 0.05, pickTone(LOTUS, i, p, 3, s.seed), 'petal', { ry: a, rx: -0.5 });
  }
  for (let p = 0; p < 4; p++) {
    const a = turn + 0.4 + (p / 4) * Math.PI * 2;
    s.box(x + Math.sin(a) * 0.05, y + 0.13, z + Math.cos(a) * 0.05, 0.08, 0.16, 0.04, pickTone(LOTUS, i, p, 4, s.seed), 'petal', { ry: a, rx: -0.2, shade: 1.08 });
  }
  s.box(x, y + 0.11, z, 0.08, 0.06, 0.08, 0xf2c94c, 'petal');
}

/** The wallow at the pond's west end: mud trodden into the bank, churned brown in the shallows. */
function wallow(env: BuildEnv, s: Site, spots: BackSpots): void {
  const p = spots.pond;
  const [cx, cz] = p.west.dry;
  const f = env.field;
  for (let k = 0; k < 30; k++) {
    const a = hash3(k, 1, 2, 74) * Math.PI * 2;
    const d = Math.sqrt(hash3(k, 3, 4, 74)) * 4.4;
    const x = cx + 1.2 + Math.cos(a) * d;
    const z = cz + Math.sin(a) * d * 1.3;
    const w = f.waterAt(x, z);
    const g = f.heightAt(x, z);
    const inWater = w !== null && w > g;
    // (on the bank only near the water's edge: the mud they churn going in and out)
    if (!inWater && Math.abs(x - cx) + Math.abs(z - cz) * 0.3 > 2.2) continue;
    // (smaller patches overlapping, low and soft: trodden mud, not boards)
    const size = 0.55 + hash3(k, 5, 6, 74) * 0.8;
    const y = inWater ? -0.06 : g - s.y + 0.012 + 0.006 * (k % 3);
    s.box(x - s.x, y, z - s.z, size, 0.03, size * (0.7 + 0.4 * hash3(k, 7, 8, 74)), pickTone(MUD, k, 9, 10, s.seed), inWater ? 'petal' : 'mapStone', { ry: a, shade: inWater ? 0.8 : 0.9 + 0.08 * hash3(k, 11, 12, 74) });
  }
  // (hoof prints: darker dabs on the bank toward the water)
  for (let k = 0; k < 8; k++) {
    const x = cx - 1.5 + hash3(k, 11, 12, 74) * 3;
    const z = cz - 2.5 + hash3(k, 13, 14, 74) * 5;
    const g = f.heightAt(x, z);
    if ((f.waterAt(x, z) ?? -1e9) > g) continue;
    s.box(x - s.x, g - s.y + 0.075, z - s.z, 0.18, 0.02, 0.22, 0x2e241c, 'mapStone', { shade: 0.9 });
  }
}

/** Reeds in clumps along the north and west shores. */
function reeds(env: BuildEnv, s: Site, spots: BackSpots): void {
  const p = spots.pond;
  const dirs: [number, number][] = [];
  for (let a = 0; a < 24; a++) {
    const t = (a / 24) * Math.PI * 2;
    const dx = Math.cos(t);
    const dz = Math.sin(t);
    // (north: −z; west: −x; not by the jetty or the steps, not in the wallow)
    if (dz > 0.35 || (dx > 0.55 && dz > -0.6)) continue;
    if (hash3(a, 1, 2, 75) < 0.35) continue;
    dirs.push([dx, dz]);
  }
  for (const [n, [dx, dz]] of dirs.entries()) {
    const sh = p.shore(dx, dz);
    const [x, z] = sh.water;
    if (Math.hypot(x - p.west.water[0], z - p.west.water[1]) < 4.5) continue;
    const blades = 5 + Math.floor(hash3(n, 3, 4, 75) * 4);
    for (let b = 0; b < blades; b++) {
      const ox = (hash3(n, b, 5, 75) - 0.5) * 1.3;
      const oz = (hash3(n, b, 6, 75) - 0.5) * 1.3;
      const h = 1.1 + hash3(n, b, 7, 75) * 1.0;
      const lean = (hash3(n, b, 8, 75) - 0.5) * 0.5;
      const g = Math.min(0, env.field.heightAt(x + ox, z + oz) - s.y);
      s.box(x + ox - s.x, g + h / 2 - 0.2, z + oz - s.z, 0.07, h, 0.07, pickTone(REED, n, b, 9, s.seed), 'mapLeaf', { rz: lean, rx: lean * 0.6 });
      if (b % 3 === 0) s.box(x + ox - s.x + lean * 0.4, g + h - 0.05, z + oz - s.z, 0.1, 0.28, 0.1, 0x7a5a36, 'mapLeaf');
    }
  }
}
