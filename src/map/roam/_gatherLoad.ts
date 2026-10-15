import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { Materials } from '../build/materials';

/**
 * **The load on his back** (the gathering add-on, roam/_gather.ts; AWP-10…13):
 * what his bag holds, tied on behind his pack, so the player sees what he
 * carries as he walks (the load chip says how much):
 *
 * - **bamboo poles** (ឫស្សី): a bundle slanting over his right shoulder, pale cut
 *   ends, node rings, two rope ties;
 * - **logs** (ឈើ): lying across his back one over the other, bark round and pale
 *   sawn ends, roped;
 * - **palm-leaf thatch** (ស្លឹកត្នោត): panels as on the village roofs (the leaves
 *   folded over a split-bamboo stick, hanging in a fringe; dried silver-brown,
 *   the newest still a little green), stacked flat and tied;
 * - **clay** (ដីឥដ្ឋ): lumps heaped in a woven bamboo basket (កញ្ច្រែង) low on
 *   his back.
 *
 * A builder for his `backpack` joint (rest-pose body units, as the pack's own
 * blocks: +x his left, y up from his soles, +z ahead; the pack's back is at
 * z −6.8), made again when the bag changes. All in the `wood` family: one draw.
 * `pack`: his backpack is on (else the load sits on his back itself).
 */

/** At most this many of each drawn (the bag's limit allows six poles, three logs, twelve bundles, six lumps). */
const MOST = { bamboo: 6, log: 3, thatch: 12, clay: 6 } as const;

const BAMBOO = [0xa3ae4d, 0x95a245, 0xb1ba5b, 0x899840];
const NODE = 0x68762f;
const BARK = [0x5f4a38, 0x6b533e, 0x564231, 0x735a43];
const SAWN = [0xd8b27a, 0xcfa56b, 0xe0bd88];
const ROPE = [0x7a6446, 0x6e5a3e, 0x857050];
/** The village roofs' dried palm thatch (village/_kit.ts `ROOFS.thatch`), and a newer, greener panel. */
const THATCH = [0x9a876a, 0x8f7d62, 0xa8946f, 0x857358, 0x9e8a66];
const THATCH_NEW = [0x9c9a62, 0xa8a36c, 0x8e8c58];
const STICK = 0xc9a66b;
const BASKET = [0xb8955a, 0xa07f48, 0xc4a266];
const CLAY = [0x9a6a48, 0x8a5c40, 0xa87656, 0x7a5038];

const tone = (list: readonly number[], i: number, j: number, k: number) => list[Math.floor(hash3(i, j, k, 5501) * list.length) % list.length];

export function gatherLoadBuilder(bag: Materials, pack: boolean): VoxelBuilder | null {
  const n = {
    bamboo: Math.min(MOST.bamboo, bag.bamboo ?? 0),
    log: Math.min(MOST.log, bag.log ?? 0),
    thatch: Math.min(MOST.thatch, bag.thatch ?? 0),
    clay: Math.min(MOST.clay, bag.clay ?? 0),
  };
  if (!n.bamboo && !n.log && !n.thatch && !n.clay) return null;
  const b = new VoxelBuilder();
  /** His back (the pack's back, or his own). */
  const z0 = pack ? -6.9 : -3.1;
  let y = 9.6;
  let deep = 0;

  // The clay: a woven basket low on his back, the lumps heaped in it.
  if (n.clay) {
    const zc = z0 - 2.7;
    const w = 7;
    const d = 4.8;
    const h = 4.6;
    // (the weave: rows of strips, every other one darker)
    for (let r = 0; r < 5; r++) {
      const yy = y + 0.45 + r * 0.9;
      const c = tone(BASKET, r, 1, 1);
      b.box(0, yy, zc + d / 2, w, 0.9, 0.4, c, 'wood');
      b.box(0, yy, zc - d / 2, w, 0.9, 0.4, tone(BASKET, r, 2, 2), 'wood');
      b.box(w / 2, yy, zc, 0.4, 0.9, d, tone(BASKET, r, 3, 3), 'wood');
      b.box(-w / 2, yy, zc, 0.4, 0.9, d, tone(BASKET, r, 4, 4), 'wood');
    }
    b.box(0, y + 0.2, zc, w, 0.4, d, 0x8a6a3c, 'wood');
    // (its rim, a little wider)
    b.box(0, y + h + 0.1, zc + d / 2 + 0.1, w + 0.6, 0.5, 0.5, 0x8a6a3c, 'wood');
    b.box(0, y + h + 0.1, zc - d / 2 - 0.1, w + 0.6, 0.5, 0.5, 0x8a6a3c, 'wood');
    // The lumps: a row, then heaped higher.
    for (let i = 0; i < n.clay; i++) {
      const row = i < 3 ? 0 : 1;
      const k = row ? i - 3 : i;
      const x = (k - (row ? 1 : 1)) * 2.2 + (row ? 0.4 : 0);
      const ly = y + h - 0.6 + row * 1.5;
      const s = 2.1 + 0.4 * hash3(i, 5, 5, 5502);
      b.box(x, ly, zc + (hash3(i, 6, 6, 5503) - 0.5) * 1.2, s, 1.7, s * 0.9, tone(CLAY, i, 7, 7), 'wood', { ry: hash3(i, 8, 8, 5504) * 1.2 });
    }
    deep = Math.max(deep, d + 0.6);
    y += h + 0.6;
  }

  // The logs: across his back, one over the other.
  if (n.log) {
    const L = 13;
    const D = 3.2;
    const zl = z0 - D / 2 - 0.3;
    for (let i = 0; i < n.log; i++) {
      const ly = y + D / 2 + i * (D - 0.25);
      const c = tone(BARK, i, 9, 9);
      const off = (hash3(i, 10, 10, 5505) - 0.5) * 1.6;
      // (round-ish: two boxes turned 45° about its length)
      b.box(off, ly, zl, L, D * 0.82, D * 0.82, c, 'wood');
      b.box(off, ly, zl, L - 0.1, D * 0.82, D * 0.82, tone(BARK, i, 11, 11), 'wood', { rx: Math.PI / 4 });
      for (const s of [-1, 1]) {
        const x = off + s * (L / 2 + 0.05);
        b.box(x, ly, zl, 0.2, D * 0.66, D * 0.66, tone(SAWN, i, s, 12), 'wood');
        b.box(x + s * 0.06, ly, zl, 0.12, D * 0.3, D * 0.3, 0xb88e58, 'wood');
      }
    }
    // (two ropes round them)
    const top = y + n.log * (D - 0.25) + 0.2;
    for (const x of [-3.6, 3.6]) {
      b.box(x, (y + top) / 2, zl - D / 2 - 0.1, 0.5, top - y, 0.3, tone(ROPE, x, 13, 13), 'wood');
      b.box(x, top, zl, 0.5, 0.3, D, tone(ROPE, x, 14, 14), 'wood');
    }
    deep = Math.max(deep, D + 0.6);
    y = top + 0.3;
  }

  // The thatch: panels as on the roofs, stacked flat on his back and tied (from his shoulder blades down: never over his
  // seat). Each a split-bamboo stick along its top, the leaves folded over it hanging in strips, a ragged fringe at the foot.
  if (n.thatch) {
    const W = 10.5;
    const H = 7.4;
    // (each panel thin, a gap of shade between them, each a little off the one under it: a stack of panels from the
    // side, never a block)
    const t = 0.52;
    const pt = 0.34;
    const zt = z0 - 0.4;
    const y0 = Math.max(y, 11.6);
    const strips = 7;
    for (let i = 0; i < n.thatch; i++) {
      const z = zt - (i + 0.5) * t;
      const fresh = i >= n.thatch - Math.ceil(n.thatch / 4);
      const tones = fresh ? THATCH_NEW : THATCH;
      const dx = (hash3(i, 15, 15, 5506) - 0.5) * 1.4;
      const dy = (hash3(i, 18, 15, 5509) - 0.5) * 0.9;
      const top = y0 + H + dy;
      b.box(dx, top - 0.3, z, W + 0.8, 0.5, pt + 0.12, STICK, 'wood', { shade: 0.9 + 0.15 * hash3(i, 21, 1, 5510) });
      for (let s = 0; s < strips; s++) {
        const sx = dx - W / 2 + (s + 0.5) * (W / strips);
        const long = H - 0.6 - hash3(i, s, 16, 5507) * 1.6;
        b.box(sx, top - 0.55 - long / 2, z, W / strips - 0.14, long, pt, tone(tones, i, s, 17), 'wood', { shade: (s % 2 ? 0.86 : 1.08) * (0.92 + 0.12 * hash3(i, 22, 2, 5511)) });
      }
    }
    const back = zt - n.thatch * t;
    for (const x of [-3.2, 3.2]) {
      b.box(x, y0 + H / 2, back - 0.15, 0.5, H * 0.9, 0.3, tone(ROPE, x, 19, 19), 'wood');
      b.box(x, y0 + H * 0.95, (zt + back) / 2, 0.5, 0.3, zt - back + 0.4, tone(ROPE, x, 20, 20), 'wood');
    }
    deep = Math.max(deep, n.thatch * t + 0.8);
    y = y0 + H + 0.3;
  }

  // The bamboo poles: a bundle slanting up over his right shoulder, outermost.
  if (n.bamboo) {
    const L = 30;
    const r = 1.3;
    const tilt = 0.42;
    const dir = { x: -Math.sin(tilt), y: Math.cos(tilt) };
    const across = { x: Math.cos(tilt), y: Math.sin(tilt) };
    const zb = z0 - deep - r / 2 - 0.2;
    const mid = { x: -0.5, y: 15.5 };
    for (let i = 0; i < n.bamboo; i++) {
      // (two rows: three across, the next three behind them)
      const row = i < 3 ? 0 : 1;
      const k = (row ? i - 3 : i) - 1;
      const off = k * (r + 0.1) + row * 0.6;
      const along = (hash3(i, 21, 21, 5509) - 0.5) * 2.4;
      const cx = mid.x + across.x * off + dir.x * along;
      const cy = mid.y + across.y * off + dir.y * along;
      const z = zb - row * (r + 0.05);
      const seg = 3.6;
      for (let s = 0; s < Math.round(L / seg); s++) {
        const u = -L / 2 + (s + 0.5) * seg;
        b.box(cx + dir.x * u, cy + dir.y * u, z, r, seg + 0.02, r, tone(BAMBOO, i, s, 22), 'wood', { rz: tilt });
        if (s % 2 === 1) b.box(cx + dir.x * (u + seg / 2), cy + dir.y * (u + seg / 2), z, r + 0.2, 0.3, r + 0.2, NODE, 'wood', { rz: tilt });
      }
      for (const e of [-1, 1]) b.box(cx + dir.x * e * (L / 2 + 0.06), cy + dir.y * e * (L / 2 + 0.06), z, r * 0.8, 0.14, r * 0.8, 0xe9dfb4, 'wood', { rz: tilt });
    }
    // (two ties round the bundle)
    const width = Math.min(3, n.bamboo) * (r + 0.1) + 0.5;
    for (const u of [-6, 6]) {
      const x = mid.x + dir.x * u;
      const yy = mid.y + dir.y * u;
      b.box(x, yy, zb - (n.bamboo > 3 ? (r + 0.05) / 2 : 0), width, 0.5, n.bamboo > 3 ? 2 * r + 0.5 : r + 0.4, tone(ROPE, u, 23, 23), 'wood', { rz: tilt });
    }
  }
  return b;
}
