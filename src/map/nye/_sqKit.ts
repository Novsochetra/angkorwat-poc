import type { SourceTrace } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { Glow } from '../festival/_glow';
import type { HeightField } from '../heightfield';
import type { Lamps } from '../landmarks/_prasatKit';
import type { Proto } from '../veg/proto';

/**
 * The festival square's shared bits (AWP-35, `square.ts`): its stone tones, the
 * Khmer lamp on its post (the lantern walk, the gate, the stalls), and a jungle
 * tree prototype stamped onto the map (the map's own trees round the square).
 *
 * Tones are sRGB, 3–5 close values each, picked with the seeded `hash3`.
 */

export type Tones = readonly number[];

/** Kulen sandstone pavers: warm grey-buff, as the map's temples. */
export const PAVER: Tones = [0xb7a487, 0xac9a7d, 0xc0ae90, 0xa69277, 0xb3a083];
/** The processional way: bigger, paler slabs. */
export const PAVER_LIGHT: Tones = [0xcdbb9b, 0xc6b393, 0xd4c3a4, 0xc0ad8d];
/** Laterite: the border and the lamp plinths (rust-red, pitted). */
export const LATERITE: Tones = [0x9c6d50, 0x916349, 0xa67858, 0x8a5e46];
/** The ring's carved band: a darker stone. */
export const RING_STONE: Tones = [0x8a7a64, 0x82735e, 0x917f68];
/** Gilt (finials, the lamp tops' buds). */
export const GOLD: Tones = [0xd9a93a, 0xcf9d30, 0xe3b44a];
/** Lamp posts: sandstone. */
export const POST_STONE: Tones = [0xbfae90, 0xb4a385, 0xc8b799];

export const pick = (list: Tones, i: number, j: number, k: number, seed = 0): number => list[Math.floor(hash3(i, j, k, seed) * list.length) % list.length];

/** The lamps' flame colour (warm gold) for halos. */
export const LAMP_HALO = 0xffb45a;

/**
 * A Khmer lamp on a stone post (not a Japanese stone lantern, not a Chinese
 * paper one): a laterite plinth, a square sandstone post with a lotus-cushion
 * ledge, the lamp chamber (four slim corner posts round the glowing flame
 * box), and over it a little Angkor tower top: corbelled tiers getting
 * smaller, a gilt lotus bud on top, as the spirit houses' roofs. Its foot at
 * (x, y, z), `h` the post's height (m). The flame goes into `lamps` (its core,
 * blooming at night) and `glow` (a soft halo), if given.
 */
export function khmerLamp(b: VoxelBuilder, x: number, y: number, z: number, h: number, seed: number, src: SourceTrace | undefined, lamps: Lamps | null, glow: Glow | null, halo = 1.9): void {
  const s = (i: number) => hash3(x, z, i, seed);
  const lat = pick(LATERITE, x, z, 1, seed);
  const st = (i: number) => pick(POST_STONE, x, z, i, seed);
  // Plinth (sunk a little: the ground under it need not be flat).
  b.box(x, y + 0.08, z, 0.62, 0.36, 0.62, lat, 'mapStone', { src, shade: 0.95 + 0.08 * s(2) });
  b.box(x, y + 0.31, z, 0.46, 0.1, 0.46, st(3), 'mapStone', { src });
  // The post, a lotus-cushion ledge under the chamber.
  b.box(x, y + 0.36 + h / 2, z, 0.24, h, 0.24, st(4), 'mapStone', { src });
  const top = y + 0.36 + h;
  b.box(x, top + 0.04, z, 0.4, 0.08, 0.4, st(5), 'mapStone', { src, shade: 1.05 });
  b.box(x, top + 0.1, z, 0.48, 0.05, 0.48, st(6), 'mapStone', { src });
  // The chamber: four slim corner posts, the flame between them.
  const c = top + 0.125;
  for (const [dx, dz] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    b.box(x + dx * 0.19, c + 0.2, z + dz * 0.19, 0.06, 0.4, 0.06, st(7), 'mapStone', { src });
  lamps?.add([x, c + 0.2, z], 0.26, 1);
  glow?.add(x, c + 0.2, z, LAMP_HALO, halo, { level: 0.9 });
  // The tower top: a cornice, three corbelled tiers, the lotus bud.
  let yy = c + 0.4;
  b.box(x, yy + 0.04, z, 0.52, 0.08, 0.52, st(8), 'mapStone', { src, shade: 1.04 });
  yy += 0.08;
  const tiers = [0.42, 0.33, 0.24, 0.16];
  for (let t = 0; t < tiers.length; t++) {
    const th = t === 0 ? 0.12 : 0.1;
    b.box(x, yy + th / 2, z, tiers[t], th, tiers[t], st(9 + t), 'mapStone', { src, shade: 1 - t * 0.02 });
    yy += th;
  }
  b.box(x, yy + 0.07, z, 0.1, 0.14, 0.1, pick(GOLD, x, z, 14, seed), 'mapStone', { src, shade: 1.08 });
}

/**
 * Stamp a jungle prototype (veg/species.ts: the map's own trees) with its trunk at (x, y, z): its shell cells as
 * blocks (leaves or bark), its free boxes; cells in the ground left out (the flowering ones: `broadleaf`'s `flower`).
 */
export function stampTree(b: VoxelBuilder, f: HeightField, p: Proto, x: number, y: number, z: number, seed: number): void {
  const s = p.s;
  const q = seed & 3;
  const turn = (i: number, k: number): [number, number] => (q === 0 ? [i, k] : q === 1 ? [-k, i] : q === 2 ? [-i, -k] : [k, -i]);
  const src = p.src;
  for (let c = 0; c < p.n; c++) {
    if (!p.shell[c]) continue;
    const [i, k] = turn(p.ci[c], p.ck[c]);
    const cx = x + i * s;
    const cz = z + k * s;
    const cy = y + (p.cj[c] + 0.5) * s;
    if (cy - s / 2 < f.heightAt(cx, cz) - 0.05) continue;
    b.box(cx, cy, cz, s, s, s, p.color[c], p.mat[c] ? 'mapBark' : 'mapLeaf', { src, shade: p.shade[c] });
  }
  for (const bx of p.boxes) {
    const [ox, oz] = turn(bx.x, bx.z);
    const odd = (q & 1) === 1;
    b.box(x + ox, y + bx.y, z + oz, odd ? bx.sz : bx.sx, bx.sy, odd ? bx.sx : bx.sz, bx.color, bx.leaf ? 'mapLeaf' : 'mapBark', { src, shade: bx.shade });
  }
}
