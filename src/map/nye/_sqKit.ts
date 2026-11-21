import type { SourceTrace } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { ANIM, perPeriod, type Kit } from '../festival/_kit';
import type { Glow } from '../festival/_glow';
import type { HeightField } from '../heightfield';
import type { Lamps } from '../landmarks/_prasatKit';
import type { Proto } from '../veg/proto';

/**
 * The festival square's shared bits (AWP-35, `square.ts`): its stone tones, the
 * Khmer lamp on its post (the lantern walk, the gate, the stalls), a jungle
 * tree prototype stamped onto the map (the map's own trees round the square),
 * and in the festival kit the hanging banner with the white Angkor Wat and the
 * live fire of the fire bowls (`hangingBanner`, `kitFire`).
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

// ── Banners and fire (the festival kit: cloth waving, flames leaping, in its shader) ──

/** The banners' red, its deep edge, the gilt. */
const BANNER_RED = 0xbe1422;
const BANNER_DEEP = 0x7c0c14;
const BANNER_GILT = 0xe8b44a;
const BANNER_WHITE = 0xfffaf0;
/** Swaying at about 1.6 rad/s (whole turns in the kit's period). */
const SWAY = perPeriod(1.6);

/**
 * Angkor Wat for a banner's few threads (its square: `x`, `y` 0‥1 across and down): the flag's drawing (roam/_flag.ts
 * `onTemple`) has slender spires that, on 10 threads, read as a thin spike, a crown or a raised hand. Here THREE
 * lotus-bud towers with body — the middle one tallest and widest, swelling from its foot and drawn in to a point —
 * on a gallery and a stepped base.
 */
export function bannerTemple(x: number, y: number): boolean {
  if (x < 0 || x > 1 || y < 0 || y > 1) return false;
  // The galleries and the stepped base.
  if (y >= 0.62 && y <= 0.72 && x >= 0.12 && x <= 0.88) return true;
  if (y > 0.72 && y <= 0.84 && x >= 0.05 && x <= 0.95) return true;
  for (const [c, hw, tip] of [
    [0.5, 0.17, 0.02],
    [0.22, 0.11, 0.24],
    [0.78, 0.11, 0.24],
  ] as const) {
    if (y < tip || y > 0.62) continue;
    // (a lotus bud: drawn to a point at its tip, widest two thirds down, a little waist at its foot)
    const k = (y - tip) / (0.62 - tip);
    const p = k < 0.66 ? Math.pow(Math.sin((k / 0.66) * (Math.PI / 2)), 0.7) : 1 - 0.14 * ((k - 0.66) / 0.34);
    if (Math.abs(x - c) <= hw * p) return true;
  }
  return false;
}

/**
 * A banner hanging flat from (x, top, z), its face toward `face` (radians toward (sin, cos) in x, z), `w` × `h` m: red
 * with gilt borders and a gilt band at the top, the white Angkor Wat (THREE lotus-bud towers, the middle tallest:
 * `bannerTemple`) on its upper half, a gilt band under it, a pointed foot (the owner's sheet: the gathering
 * area's pillars, the gate). Cloth in the festival kit, columns of runs of one colour, swaying a little at its foot;
 * the temple's white faintly lit at night so it reads in the dark.
 */
export function hangingBanner(kit: Kit, x: number, top: number, z: number, face: number, w: number, h: number, low: boolean, seed: number, sway = 0.03): void {
  const cols = low ? 9 : 13;
  const rows = low ? 26 : 40;
  const du = w / cols;
  const dv = h / rows;
  // (across the cloth: the face's left to right)
  const ax = Math.cos(face);
  const az = -Math.sin(face);
  const tip = Math.round(rows * 0.12);
  const phase = hash3(x, z, seed, 3) * 6.28;
  const sq = { v0: 0.14, side: w * 0.8 };
  const colour = (c: number, r: number): number | null => {
    const u = (c + 0.5) / cols;
    const v = (r + 0.5) * dv;
    const fromFoot = rows - r;
    if (fromFoot <= tip && Math.abs(u - 0.5) > (fromFoot / tip) * 0.5) return null;
    if (r < 2) return BANNER_GILT;
    if (c === 0 || c === cols - 1) return BANNER_GILT;
    if (fromFoot <= tip && Math.abs(u - 0.5) > (fromFoot / tip) * 0.5 - 1 / cols) return BANNER_GILT;
    const ty = (v - sq.v0 * h) / sq.side;
    const tx = (u * w - (w - sq.side) / 2) / sq.side;
    if (bannerTemple(tx, ty)) return BANNER_WHITE;
    const lv = v - (sq.v0 * h + sq.side + 0.12);
    if (lv >= 0 && lv <= dv * 1.5 && c > 1 && c < cols - 2) return BANNER_GILT;
    if (c === 1 || c === cols - 2) return BANNER_DEEP;
    return BANNER_RED;
  };
  for (let c = 0; c < cols; c++) {
    const off = -w / 2 + (c + 0.5) * du;
    let r0 = 0;
    while (r0 < rows) {
      const col = colour(c, r0);
      let r1 = r0 + 1;
      while (r1 < rows && colour(c, r1) === col) r1++;
      if (col !== null) {
        const len = (r1 - r0) * dv;
        const mid = r0 * dv + len / 2;
        const white = col === BANNER_WHITE;
        // (the box's own x runs down the cloth: rolled −90°; the sway grows from the bar down)
        kit.box(x + ax * off, top - mid, z + az * off, len + 0.002, du + 0.002, white ? 0.05 : 0.03, col, {
          yaw: face,
          roll: -Math.PI / 2,
          anim: ANIM.wave,
          a: [sway, r0 * dv, SWAY],
          b: [phase, 0, 0, 0],
          // (lit a little from within at night, as by the fire over it: the red and the white temple read in the dark)
          glow: white ? 0.16 : col === BANNER_GILT ? 0.12 : 0.07,
        });
      }
      r0 = r1;
    }
  }
}

/** Flame colours (sRGB): the deep tongue, the heart, the yellow core; embers. */
const FIRE = { tongue: 0xff9026, heart: 0xffbc44, core: 0xffe68c, ember: 0xe8501a } as const;

/**
 * A live fire in a bowl whose rim is at (x, y, z), `s` its size (1: a bowl ≈ 0.7 m across): embers on the rim, a wide
 * heart and three tongues that leap, narrow and sway (the kit's `ANIM.flame`: each at its own pace, never in step with
 * the next bowl's), glowing (blooming a little at night, orange and gold, never white). In the festival kit: no draw
 * of its own. The halo and the pool of light round it are the caller's.
 */
export function kitFire(kit: Kit, x: number, y: number, z: number, s: number, seed: number): void {
  const r = (k: number) => hash3(x, z, k, seed);
  const ph = r(1) * 6.28;
  kit.box(x, y + 0.03 * s, z, 0.56 * s, 0.06 * s, 0.56 * s, FIRE.ember, { glow: 0.24 });
  // (each tongue a tall box tapering as it leaps: `ANIM.flame` narrows its top)
  const tongue = (dx: number, dz: number, w: number, hh: number, color: number, glow: number, leap: number, k: number, speed: number) =>
    kit.box(x + dx * s, y + 0.04 * s + (hh * s) / 2, z + dz * s, w * s, hh * s, w * s, color, { yaw: r(k) * 1.5, glow, anim: ANIM.flame, a: [leap, ph + k * 1.9, perPeriod(speed)] });
  // (glow: at night ≈ 0.8 of the colour, orange and gold kept; the halo round it is the glow)
  tongue(0, 0, 0.42, 0.28, FIRE.heart, 0.25, 0.3, 2, 5.3);
  tongue(0.11, -0.07, 0.2, 0.56, FIRE.tongue, 0.24, 0.7, 3, 7.1);
  tongue(-0.12, 0.05, 0.19, 0.48, FIRE.tongue, 0.24, 0.75, 4, 6.4);
  tongue(0.06, 0.12, 0.16, 0.42, FIRE.tongue, 0.24, 0.8, 6, 7.7);
  tongue(0.01, 0.0, 0.14, 0.78, FIRE.core, 0.3, 0.85, 5, 8.2);
}
