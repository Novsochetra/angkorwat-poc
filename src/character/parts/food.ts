import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { VoxelMaterialKey } from '../../voxel/materials';
import { hash3 } from '../../voxel/random';
import type { HandPose } from './limbs';

/**
 * Food and drink in the explorer's hands: what he buys at the map's stalls
 * (src/map/shop.ts `ConsumeKind`, the same names) and eats or drinks (the
 * `eat`, `bite` and `drink` actions: clips.ts, meals.ts). Chibi-sized like
 * his other props (the lantern, the phone: about twice real size), in his
 * blocks, readable in the follow camera, and built only when he first holds
 * one (AngkorExplorer.holdFood).
 *
 * Each item is authored in its own frame (body units): a container stands
 * on y = 0 with +Y up (+X his left, +Z away from him as he holds it; the
 * coconut's origin is its middle, the drink bag's its knot); a rod
 * (chopsticks, spoon, a stick, the rice cake) runs along +Z from the fist's
 * middle, the grip channel (see `FOOD_GRIPS` for how each hand holds each
 * item). Each item comes in stages, full first: a portion of the bowl,
 * a piece off the stick, a sip down the cup; the explorer shows the stage
 * for how far along he is.
 */

/** What he can eat or drink (= map/shop.ts `ConsumeKind`). */
export const FOOD_KINDS = ['noodles', 'riceBowl', 'skewer', 'fruit', 'sweet', 'coconut', 'cupDrink', 'bagDrink', 'bottle'] as const;
export type FoodKind = (typeof FOOD_KINDS)[number];
export const isFoodKind = (s: string | null | undefined): s is FoodKind => !!s && (FOOD_KINDS as readonly string[]).includes(s);

/** One held thing: its stages (full first) and the hand's shape holding it. */
export interface FoodItem {
  stages: VoxelBuilder[];
  hand: HandPose;
}

/** What each hand holds for a kind (either may be null; the coconut is in `right`, held with both hands). */
export interface FoodModel {
  left: FoodItem | null;
  right: FoodItem | null;
}

type V3 = readonly [number, number, number];

/** A fist on an item: the prop joint's place (the fist's middle) and its X and Y axes, in the item's frame (Z = X × Y: the thumb). */
export interface Grip {
  at: V3;
  x: V3;
  y: V3;
}

/** The straws' ends (item frames): what goes to his mouth for a sip (the bottle: its mouth). */
const COCONUT_STRAW: V3 = [0, 5.9, -2.0];
const CUP_STRAW: V3 = [0.05, 7.0, -0.3];
const BAG_STRAW: V3 = [0.2, 3.9, 0.1];
const BOTTLE_MOUTH: V3 = [0, 4.45, 0];

/** A fist through a rod item: the item's frame is the fist's own. */
const ROD: Grip = { at: [0, 0, 0], x: [1, 0, 0], y: [0, 1, 0] };
const n3 = (x: number, y: number, z: number): V3 => {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
};
/**
 * The left hand flat under a container, palm up (the fingers forward and
 * to his right under its bottom), the hand's middle under the item's
 * middle. (Hand frame: fingers along −Y, the left palm toward −X, thumb +Z.)
 */
const PALM_UP_L: Grip = { at: [0.2, -1.35, -0.4], x: [0, -1, 0], y: n3(0.45, 0, -0.9) };
/** The right fist round an upright cup or bottle on its right side, thumb up, the fingers round its front; `r`: its radius there, `y`: how high. */
const CUP_R = (r: number, y: number): Grip => ({ at: [-(r + 0.85), y, 0], x: [1, 0, 0], y: [0, 0, -1] });

/**
 * How the hands hold each kind: `left` / `right` the fist on that hand's
 * item (the coconut: `right` and `both`, the left fist, on the one item);
 * `bites` the item points that go to his mouth (a piece per bite; one
 * point: every bite or sip the same, the chopsticks' tips, the straw's end).
 * (His arms are short for his big head: the rods are held near their far
 * ends, as chopsticks are, so the elbow stays down and the tip still reaches.)
 */
export const FOOD_GRIPS: Record<FoodKind, { left?: Grip; right?: Grip; both?: Grip; bites: readonly V3[] }> = {
  noodles: { left: PALM_UP_L, right: ROD, bites: [[0, -0.45, 4.95]] },
  riceBowl: { left: PALM_UP_L, right: ROD, bites: [[0, 0.45, 4.35]] },
  fruit: { left: PALM_UP_L, right: ROD, bites: [[0, 0.2, 4.9]] },
  skewer: { right: ROD, bites: [[0, 0, 5.45], [0, 0, 3.95]] },
  sweet: { right: ROD, bites: [[0, 0, 4.4], [0, 0, 3.65]] },
  // (both open hands flat on its sides, the fingers forward along his forearms)
  coconut: { right: { at: [-3.9, -0.17, -0.43], x: [1, 0, 0], y: n3(0, 0.3, -0.95) }, both: { at: [3.9, -0.17, -0.43], x: [1, 0, 0], y: n3(0, 0.3, -0.95) }, bites: [COCONUT_STRAW] },
  cupDrink: { right: CUP_R(1.3, 2.3), bites: [CUP_STRAW] },
  // (the fist round the knot, the bag hanging under it)
  bagDrink: { right: { at: [0, -0.45, 0], x: [1, 0, 0], y: [0, 0, -1] }, bites: [BAG_STRAW] },
  // (held high, round its shoulder: tipped up to drink, his elbow out to the side)
  bottle: { right: CUP_R(0.8, 2.9), bites: [BOTTLE_MOUTH] },
};

/**
 * Default colours (sRGB) of each kind, the most visible first; a shop item's
 * `colors` replaces them in order (the rest stay):
 * noodles [noodles, broth, herbs, bowl band] · riceBowl [rice, topping, garnish, box] ·
 * skewer [pieces, stick] · fruit [fruit, the chilli-salt packet] ·
 * sweet [wrapping (leaf, crust), filling, core] · coconut [husk, trimmed top, straw] ·
 * cupDrink [drink, straw, lid] · bagDrink [drink, its top (milk, ice), straw, string] ·
 * bottle [water, cap, label].
 */
export const FOOD_COLORS: Record<FoodKind, readonly number[]> = {
  // num banh chok: rice noodles in the green-yellow fish curry, fresh herbs; a white bowl with a blue band
  noodles: [0xf4efe1, 0xc7bf5e, 0x5c9a3a, 0x3d6db3],
  // bai sach chrouk: broken rice, grilled pork, pickled carrot (and cucumber); a foam box
  riceBowl: [0xf4f0e6, 0x9a4526, 0xe6893b, 0xf3f1ea],
  // sach ko ang: grilled beef on a bamboo stick
  skewer: [0x8b3f21, 0xd9bb7c],
  // green mango slices in a small plastic bag, a packet of chilli salt, a bamboo stick
  fruit: [0xc9d474, 0xc8342e],
  // num ansom: sticky rice in banana leaf, the leaf peeled back at the top, a banana core
  sweet: [0x5f8f37, 0xf2ece0, 0xe6cb6f],
  // a young green coconut, its top trimmed white, a straw
  coconut: [0x6c9a37, 0xece2c2, 0xe45a86],
  // sugarcane juice (tuk ampov) in a plastic cup with a lid
  cupDrink: [0xc3d376, 0xd8413f, 0xe6eeec],
  // iced coffee with milk (kafe tuk doh ko) in a plastic bag tied with a string
  bagDrink: [0xb27b4a, 0xd9bf9a, 0xf2f0ec, 0xd8383d],
  // a bottle of water
  bottle: [0xd4e6ef, 0x2458b8, 0x2f78d0],
};

/** Stages each kind has (full → empty). */
export const FOOD_STAGES: Record<FoodKind, { left: number; right: number }> = {
  noodles: { left: 4, right: 2 },
  riceBowl: { left: 4, right: 2 },
  fruit: { left: 4, right: 2 },
  skewer: { left: 0, right: 3 },
  sweet: { left: 0, right: 3 },
  coconut: { left: 0, right: 1 },
  cupDrink: { left: 0, right: 4 },
  bagDrink: { left: 0, right: 4 },
  bottle: { left: 0, right: 4 },
};

// ── Shapes ─────────────────────────────────────────────────────────────────

/** A round layer (two crossed boxes: an octagon), y0‥y1, radius r. */
function disc(b: VoxelBuilder, y0: number, y1: number, r: number, color: number, mat: VoxelMaterialKey, shade = 1): void {
  const n = r * 0.62;
  b.span(-r, y0, -n, r, y1, n, color, mat, { shade });
  // (a hair lower: the first one's top wins where they overlap)
  b.span(-n, y0, -r, n, y1 - 0.01, r, color, mat, { shade: shade * 0.985 });
}

/** A ring of eight bars round y0‥y1: outer radius r, `t` thick (a rim you can see into). */
function ring(b: VoxelBuilder, y0: number, y1: number, r: number, t: number, color: number, mat: VoxelMaterialKey, shade = 1): void {
  const len = 2 * r * Math.tan(Math.PI / 8) + 0.02;
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const d = r - t / 2;
    b.box(Math.sin(a) * d, (y0 + y1) / 2, Math.cos(a) * d, len, y1 - y0, t, color, mat, { ry: a, shade: shade * (1 - 0.03 * (i % 2)) });
  }
}

const pick = (kind: FoodKind, colors: readonly number[] | undefined, i: number) => colors?.[i] ?? FOOD_COLORS[kind][i];
/** A colour a little lighter (k > 1) or darker. */
const tint = (c: number, k: number) => {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (f(c >> 16) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
};
const mixc = (a: number, b: number, t: number) => {
  const f = (s: number) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t);
  return (f(16) << 16) | (f(8) << 8) | f(0);
};

const WHITE = 0xf3efe7;
const BAMBOO = 0xe0c690;
const FILM = 0xe6eeec;
const ICE = 0xeef6f7;

/** Chopsticks: a pair of pale bamboo sticks along +Z, held near the far end (z −1.2‥5.4); loaded: a bundle of noodles hanging from the tips. */
function chopsticks(noodle: number, herb: number, loaded: boolean): VoxelBuilder {
  const b = new VoxelBuilder();
  for (const s of [-1, 1]) b.box(s * 0.17, 0, 2.1, 0.26, 0.26, 6.6, s < 0 ? BAMBOO : tint(BAMBOO, 0.94), 'wood', { ry: -s * 0.02 });
  if (loaded) {
    // (strands hanging from the tips, one a little longer; a leaf of herb)
    for (const [x, len, z] of [[-0.24, 1.45, 4.8], [0.12, 1.15, 5.1], [0.36, 0.95, 4.65]] as const) b.box(x, -len / 2 + 0.1, z, 0.28, len, 0.28, noodle, 'shirt', { rz: x * 0.3 });
    b.box(0, -0.3, 4.95, 0.95, 0.5, 0.7, noodle, 'shirt');
    b.box(0.15, -0.05, 5.2, 0.42, 0.22, 0.42, herb, 'hat');
  }
  return b;
}

/** A spoon along +Z (the handle z −1.2‥3.6, its bowl 3.6‥5.1 opening up: +Y); loaded: rice and a piece of pork on it. */
function spoon(rice: number, pork: number, loaded: boolean): VoxelBuilder {
  const b = new VoxelBuilder();
  const M = 0xcdd1d5;
  b.span(-0.21, -0.1, -1.2, 0.21, 0.12, 3.65, M, 'metal');
  b.span(-0.64, 0.0, 3.6, 0.64, 0.22, 5.15, M, 'metal', { shade: 1.04 });
  b.span(-0.64, 0.22, 3.6, -0.44, 0.42, 5.15, M, 'metal');
  b.span(0.44, 0.22, 3.6, 0.64, 0.42, 5.15, M, 'metal');
  b.span(-0.44, 0.22, 4.95, 0.44, 0.42, 5.15, M, 'metal');
  if (loaded) {
    b.span(-0.46, 0.2, 3.75, 0.46, 0.72, 4.9, rice, 'shirt');
    b.box(0.1, 0.82, 4.4, 0.55, 0.25, 0.6, pork, 'leather', { ry: 0.3 });
  }
  return b;
}

/** A thin bamboo stick along +Z (z −1.0‥5.2); loaded: a mango slice speared on its tip. */
function fruitStick(flesh: number, skin: number, loaded: boolean): VoxelBuilder {
  const b = new VoxelBuilder();
  b.span(-0.11, -0.11, -1.0, 0.11, 0.11, 5.2, BAMBOO, 'wood');
  if (loaded) {
    b.box(0, 0.2, 4.9, 0.5, 2.0, 0.78, flesh, 'skin', { rx: -0.2 });
    b.box(0, 0.16, 5.32, 0.52, 1.9, 0.14, skin, 'skin', { rx: -0.2 });
  }
  return b;
}

/**
 * The noodle bowl (num banh chok), its foot on y = 0: a white bowl with a
 * blue band, the rim a ring you see into; broth, a mound of noodles (lower
 * with each portion eaten: `left` 0‥3), herbs, a slice of cucumber, a chilli.
 */
function noodleBowl(broth: number, noodle: number, herb: number, band: number, left: number): VoxelBuilder {
  const b = new VoxelBuilder();
  disc(b, 0, 0.3, 1.05, tint(WHITE, 0.93), 'lens');
  disc(b, 0.3, 0.8, 1.55, WHITE, 'lens');
  disc(b, 0.8, 1.25, 1.95, WHITE, 'lens');
  disc(b, 1.25, 1.65, 2.22, band, 'lens');
  ring(b, 1.65, 2.05, 2.38, 0.32, WHITE, 'lens');
  disc(b, 1.65, 1.86, 2.1, broth, 'lens', 0.95);
  const h = [0.58, 0.38, 0.18, 0][left] ?? 0;
  if (h > 0) {
    b.span(-1.15, 1.84, -0.9, 1.0, 1.84 + h, 1.1, noodle, 'shirt');
    b.span(-0.6, 1.84, -1.35, 0.7, 1.84 + h * 0.7, 1.45, noodle, 'shirt', { shade: 0.97 });
    if (left < 2) b.span(-0.45, 1.84 + h, -0.35, 0.55, 2.06 + h, 0.6, noodle, 'shirt', { shade: 1.03 });
  }
  // Herbs, a cucumber slice and a chilli on top (fewer as he eats).
  const top = 1.86 + h;
  const herbs: [number, number, number][] = [[0.8, 0.45, 0.2], [-0.7, -0.55, 0.4], [0.2, 0.9, 0.1], [-0.2, -1.1, 0.3]];
  herbs.slice(0, 4 - left).forEach(([x, z, r], i) => b.box(x, top + 0.1, z, 0.7, 0.22, 0.46, i % 2 ? herb : tint(herb, 1.25), 'hat', { ry: r + i }));
  if (left < 2) b.box(-0.8, top + 0.08, 0.55, 0.78, 0.16, 0.78, 0xcfe39c, 'hat', { ry: 0.4 });
  if (left < 3) b.box(0.5, top + 0.12, -0.5, 0.28, 0.2, 0.56, 0xd63d2c, 'skin', { ry: 0.8 });
  return b;
}

/**
 * Bai sach chrouk in a foam box, its bottom on y = 0: a white box, its lid
 * open flat behind (away from him); broken rice, grilled pork slices (fewer
 * with each portion: `left` 0‥3), pickled cucumber and carrot.
 */
function riceBox(rice: number, pork: number, pickle: number, box: number, left: number): VoxelBuilder {
  const b = new VoxelBuilder();
  const W = 2.05;
  const D = 1.55;
  b.span(-W, 0, -D, W, 1.25, D, box, 'sock');
  b.span(-W + 0.25, 1.25, -D, W - 0.25, 1.36, -D + 0.28, box, 'sock', { shade: 0.97 });
  // The lid, open flat at the far side (a clamshell: a shallow empty tray, its rim up), a little down.
  const lid = (y: number, z: number, sx: number, sy: number, sz: number, c: number) => b.box(0, 1.1 + y - z * 0.16, D + z, sx, sy, sz, c, 'sock', { rx: 0.16 });
  lid(0, 1.5, W * 2, 0.22, 2.95, tint(box, 0.97));
  lid(0.22, 0.12, W * 2, 0.26, 0.24, box);
  lid(0.22, 2.9, W * 2, 0.26, 0.24, box);
  for (const sx of [-1, 1]) b.box(sx * (W - 0.12), 1.32 - 1.5 * 0.16, D + 1.5, 0.24, 0.26, 2.95, box, 'sock', { rx: 0.16 });
  // Rice: a mound on the left two thirds, lower as he eats.
  const h = [0.5, 0.34, 0.18, 0.05][left] ?? 0;
  b.span(-W + 0.25, 1.2, -D + 0.28, W * 0.45, 1.25 + h, D - 0.22, rice, 'shirt');
  if (left < 2) b.span(-W + 0.65, 1.25 + h, -D + 0.55, W * 0.1, 1.43 + h, D - 0.55, rice, 'shirt', { shade: 1.03 });
  // Pork slices fanned on the rice (glazed red-brown, a darker grilled edge).
  const slices = 3 - left;
  for (let i = 0; i < slices; i++) {
    const x = -1.1 + i * 0.7;
    b.box(x, 1.35 + h + i * 0.04, 0.1, 0.8, 0.2, 2.0, i % 2 ? pork : tint(pork, 1.12), 'leather', { ry: 0.25, rz: -0.12 });
    b.box(x + 0.32, 1.4 + h + i * 0.04, 0.1, 0.17, 0.24, 1.95, tint(pork, 0.62), 'leather', { ry: 0.25, rz: -0.12 });
  }
  // Pickles on the right: carrot and cucumber sticks.
  for (let i = 0; i < 4; i++) b.box(W * 0.6 + (i % 2) * 0.42, 1.34, -0.85 + i * 0.55, 0.33, 0.28, 0.85, i % 2 ? 0xcfe39c : pickle, 'hat', { ry: 0.3 * (i - 1.5) });
  return b;
}

/**
 * Green mango slices in a small clear bag, standing on its bottom (y = 0):
 * the bag's film, the slices sticking up out of its open top (one fewer
 * with each bite: `left` 0‥3), a red packet of chilli salt.
 */
function mangoBag(flesh: number, packet: number, left: number): VoxelBuilder {
  const b = new VoxelBuilder();
  const film = FILM;
  const skin = tint(flesh, 0.62);
  // (the slices seen through the clear film: pale green-yellow, lighter at the top where it is empty)
  const through = mixc(film, flesh, 0.55);
  b.span(-1.4, 0, -1.05, 1.4, 0.45, 1.05, tint(through, 0.95), 'lens');
  b.span(-1.5, 0.45, -1.15, 1.5, 1.9, 1.15, through, 'lens');
  b.span(-1.5, 1.9, -1.15, 1.5, 2.5, 1.15, film, 'lens', { shade: 1.02 });
  // (the open top: a thin rim, a little crumpled)
  for (const [x, z, sx, sz, r] of [[0, 1.1, 3.1, 0.14, 0.05], [0, -1.1, 3.1, 0.14, -0.04], [1.45, 0, 0.14, 2.2, 0.06], [-1.45, 0, 0.14, 2.2, -0.05]] as const)
    b.box(x, 2.72, z, sx, 0.45, sz, film, 'lens', { rx: r, rz: r, shade: 1.03 });
  const n = 5 - left;
  for (let i = 0; i < n; i++) {
    const x = -0.9 + i * 0.45;
    const tilt = (i - 2) * 0.12;
    const hgt = 3.5 + hash3(i, 1, 2, 91) * 0.5;
    b.box(x, hgt / 2 + 0.3, (i % 2) * 0.45 - 0.22, 0.44, hgt, 0.8, flesh, 'skin', { rz: tilt, shade: 1 - 0.04 * (i % 2) });
    b.box(x + 0.02, hgt / 2 + 0.32, (i % 2) * 0.45 + 0.2, 0.46, hgt - 0.2, 0.14, skin, 'skin', { rz: tilt });
  }
  b.box(0.95, 2.0, -0.85, 0.85, 0.95, 0.24, packet, 'skin', { rz: -0.2 });
  return b;
}

/**
 * Grilled beef on a bamboo stick along +Z (z −1.2‥6.5): two chunky glazed
 * pieces (the top one off at the first bite, the other at the second:
 * `left` 0‥2), a bit of fat between.
 */
function skewer(meat: number, stick: number, left: number): VoxelBuilder {
  const b = new VoxelBuilder();
  const glaze = tint(meat, 0.66);
  b.span(-0.12, -0.12, -1.2, 0.12, 0.12, left >= 2 ? 3.1 : left >= 1 ? 4.6 : 6.5, stick, 'wood');
  // (the bare stick where the pieces were: darker with the grill)
  if (left >= 1) b.span(-0.1, -0.1, left >= 2 ? 3.1 : 4.6, 0.1, 0.1, 6.5, tint(stick, 0.82), 'wood');
  // (a chunk: glazed, a lighter caramel top, dark grill stripes across)
  const piece = (z: number, s: number) => {
    b.box(0, 0.05, z, 1.55, 1.3, 1.45, meat, 'leather', { ry: 0.12 * s, rz: 0.1 * s });
    b.box(0.3 * s, 0.52, z + 0.15, 1.0, 0.5, 0.95, tint(meat, 1.22), 'leather', { ry: -0.3 * s });
    b.box(-0.35 * s, -0.36, z - 0.25, 0.8, 0.5, 0.85, glaze, 'leather', { rz: 0.2 });
    for (const dz of [-0.4, 0.3]) b.box(0, 0.08, z + dz, 1.62, 1.36, 0.16, tint(glaze, 0.7), 'leather', { ry: 0.12 * s, rz: 0.1 * s });
  };
  if (left < 2) piece(3.95, -1);
  if (left < 1) {
    b.box(0, 0, 4.72, 0.78, 0.68, 0.3, 0xe8d9b8, 'shirt');
    piece(5.45, 1);
  }
  return b;
}

/**
 * Num ansom: sticky rice rolled in banana leaf along +Z (z −1.2‥), tied
 * twice, the leaf peeled back at the top showing the rice and its banana
 * core (shorter with each bite: `left` 0‥2).
 */
function riceCake(fill: number, leaf: number, core: number, left: number): VoxelBuilder {
  const b = new VoxelBuilder();
  b.span(-0.92, -0.92, -1.2, 0.92, 0.92, 3.0, leaf, 'hat');
  for (const z of [0.9, 2.2]) b.span(-0.97, -0.97, z, 0.97, 0.97, z + 0.24, tint(leaf, 0.66), 'hat');
  // The peeled leaf: three flaps turned out and down round the top.
  for (const [x, y, rz, ry] of [[1.02, 0.2, -0.35, 0], [-1.02, 0.25, 0.35, 0], [0.1, 1.02, 0, 0.3]] as const)
    b.box(x, y, 2.75, Math.abs(x) > 0.5 ? 0.2 : 1.5, Math.abs(x) > 0.5 ? 1.5 : 0.2, 1.2, tint(leaf, 1.1), 'hat', { rz, ry, rx: 0.35 });
  const top = [4.75, 4.0, 3.2][left] ?? 3.2;
  b.span(-0.76, -0.76, 2.9, 0.76, 0.76, top, fill, 'shirt');
  // (the banana core showing at the top, and in the bite)
  b.span(-0.3, -0.3, 3.0, 0.3, 0.3, top + 0.05, core, 'skin');
  if (left === 1) b.span(-0.76, 0.2, top - 0.35, 0.1, 0.76, top + 0.02, tint(fill, 0.93), 'shirt');
  return b;
}

/**
 * A young green coconut to drink from, its middle at the origin: the green
 * husk (a flat white cut at the bottom), the top trimmed to a white cone
 * with a hole, a bendy straw from it, up then bent toward him (−Z) to
 * `COCONUT_STRAW` (it can stay out in front of him, clear of his camera).
 */
function coconut(husk: number, cut: number, straw: number): VoxelBuilder {
  const b = new VoxelBuilder();
  disc(b, -2.75, -2.55, 1.2, cut, 'hat');
  disc(b, -2.55, -1.95, 1.9, tint(husk, 0.92), 'krama');
  disc(b, -1.95, -0.95, 2.45, husk, 'krama');
  disc(b, -0.95, 0.55, 2.62, husk, 'krama', 1.03);
  disc(b, 0.55, 1.35, 2.35, tint(husk, 0.95), 'krama');
  // The trimmed top: white husk in three smaller steps (knife facets), the hole.
  disc(b, 1.35, 1.95, 1.85, cut, 'hat');
  disc(b, 1.95, 2.5, 1.25, tint(cut, 0.97), 'hat');
  disc(b, 2.5, 2.85, 0.68, tint(cut, 1.02), 'hat');
  b.box(0, 2.87, 0, 0.45, 0.05, 0.45, 0x8d7b52, 'hat');
  // The bendy straw: up from the hole, its ribbed bend, then back to his mouth.
  b.span(-0.16, 2.6, -0.16, 0.16, 4.5, 0.16, straw, 'lens');
  b.box(0, 4.62, -0.08, 0.38, 0.38, 0.38, tint(straw, 1.12), 'lens', { rx: -0.5 });
  b.box(0, 5.25, -1.0, 0.32, 2.3, 0.32, straw, 'lens', { rx: -1.0 });
  return b;
}

/**
 * A plastic cup with a domed lid and a straw, standing on y = 0 (the drink
 * seen through the clear plastic: lower with each sip, `sips` 0‥3; ice at
 * its top), the straw's end at `CUP_STRAW`.
 */
function cup(drink: number, straw: number, lid: number, sips: number): VoxelBuilder {
  const b = new VoxelBuilder();
  // Four bands up the tapered cup: the drink, its ice, then the empty film above.
  const bands: [number, number, number][] = [[0, 0.95, 1.08], [0.95, 1.9, 1.2], [1.9, 2.85, 1.32], [2.85, 3.75, 1.44]];
  const level = [4, 3, 2, 1][sips] ?? 1;
  bands.forEach(([y0, y1, r], i) => {
    const c = i < level - 1 ? drink : i === level - 1 ? mixc(drink, ICE, 0.35) : lid;
    disc(b, y0, y1, r, c, 'lens', i < level ? 1 - 0.03 * i : 1.02);
  });
  // Ice cubes in the top band of the drink.
  const iceY = [3.3, 2.4, 1.45, 0.5][sips] ?? 0.5;
  for (const [x, z] of [[0.62, 1.0], [-0.72, 0.9], [1.05, -0.4]] as const) b.box(x, iceY, z, 0.55, 0.5, 0.55, ICE, 'lens', { ry: x });
  disc(b, 3.75, 3.98, 1.56, tint(lid, 1.02), 'lens');
  disc(b, 3.98, 4.38, 1.22, lid, 'lens');
  disc(b, 4.38, 4.6, 0.7, lid, 'lens');
  b.box(0.05, 5.55, -0.18, 0.32, 2.9, 0.32, straw, 'lens', { rx: -0.09 });
  return b;
}

/**
 * Iced coffee with milk in a plastic bag, the knot at the origin and the
 * bag hanging below (smaller as he drinks, the ice left at the end: `sips`
 * 0‥3), a string looped round his fingers, a straw up out of the knot to
 * `BAG_STRAW`.
 */
function drinkBag(drink: number, top: number, straw: number, string: number, sips: number): VoxelBuilder {
  const b = new VoxelBuilder();
  const k = [1, 0.9, 0.8, 0.7][sips] ?? 0.7;
  const layers: [number, number, number][] = [[-4.6, -4.15, 1.0], [-4.15, -3.3, 1.5], [-3.3, -2.3, 1.68], [-2.3, -1.45, 1.35]];
  const level = [4, 3, 2, 1][sips] ?? 1;
  const up = (y: number) => -1.45 + (y + 1.45) * k;
  layers.forEach(([y0, y1, r], i) => {
    const c = i < level - 1 ? drink : i === level - 1 ? mixc(top, ICE, 0.3) : FILM;
    disc(b, up(y0), up(y1), r * (0.85 + 0.15 * k), c, 'lens', 1 - 0.02 * i);
  });
  if (sips >= 3) for (const [x, z] of [[0.45, 0.5], [-0.5, 0.25], [0.1, -0.6]] as const) b.box(x, up(-3.6), z, 0.6, 0.55, 0.6, ICE, 'lens', { ry: x });
  // The gathered neck and the knot, the string round it and its loop over his fingers.
  disc(b, -1.45, -0.4, 0.58, FILM, 'lens');
  disc(b, -0.4, 0.25, 0.48, tint(FILM, 0.96), 'lens');
  b.span(-0.6, -0.25, -0.6, 0.6, 0.05, 0.6, string, 'krama');
  b.span(-0.1, -1.1, 1.2, 0.1, 0.05, 1.4, string, 'krama');
  b.span(-0.1, -1.3, -0.1, 0.1, -1.1, 1.4, string, 'krama');
  // The straw: white with a red stripe.
  b.box(0.1, 2.05, 0.1, 0.3, 3.7, 0.3, straw, 'lens', { rz: -0.055 });
  b.box(0.12, 2.3, 0.1, 0.32, 0.45, 0.32, 0xd8413f, 'lens', { rz: -0.055 });
  return b;
}

/**
 * A small bottle of water on y = 0 (its mouth at `BOTTLE_MOUTH`): clear
 * with a blue label low down (his fist round its shoulder above), a blue
 * cap, the water lower with each sip (`sips` 0‥3).
 */
function bottle(water: number, cap: number, label: number, sips: number): VoxelBuilder {
  const b = new VoxelBuilder();
  const WATER = water;
  const AIR = mixc(water, 0xffffff, 0.6);
  const level = [4, 3, 2, 1][sips] ?? 1;
  const bands: [number, number, number][] = [[0, 0.5, 0.86], [0.5, 1.5, 0.9], [1.5, 2.4, 0.9], [2.4, 3.2, 0.9]];
  bands.forEach(([y0, y1, r], i) => disc(b, y0, y1, r, i < level ? WATER : AIR, 'lens', 1 - 0.02 * i));
  disc(b, 0.55, 1.45, 0.98, label, 'lens', 1.02);
  b.span(-0.99, 0.85, -0.26, 0.99, 1.15, 0.26, 0xf2f4f6, 'lens');
  disc(b, 3.2, 3.6, 0.72, AIR, 'lens');
  disc(b, 3.6, 4.1, 0.44, AIR, 'lens');
  disc(b, 4.1, 4.45, 0.5, cap, 'lens');
  return b;
}

/**
 * The blocks for one kind (the stages of each hand's item), in the colours
 * given (a shop item's `colors`, see `FOOD_COLORS`) or its defaults.
 */
export function buildFood(kind: FoodKind, colors?: readonly number[]): FoodModel {
  const c = (i: number) => pick(kind, colors, i);
  const stages = (n: number, f: (i: number) => VoxelBuilder) => Array.from({ length: n }, (_, i) => f(i));
  const n = FOOD_STAGES[kind];
  switch (kind) {
    case 'noodles':
      return {
        left: { stages: stages(n.left, (i) => noodleBowl(c(1), c(0), c(2), c(3), i)), hand: 'open' },
        right: { stages: [chopsticks(c(0), c(2), false), chopsticks(c(0), c(2), true)], hand: 'holding' },
      };
    case 'riceBowl':
      return {
        left: { stages: stages(n.left, (i) => riceBox(c(0), c(1), c(2), c(3), i)), hand: 'open' },
        right: { stages: [spoon(c(0), c(1), false), spoon(c(0), c(1), true)], hand: 'holding' },
      };
    case 'fruit':
      return {
        left: { stages: stages(n.left, (i) => mangoBag(c(0), c(1), i)), hand: 'open' },
        right: { stages: [fruitStick(c(0), tint(c(0), 0.62), false), fruitStick(c(0), tint(c(0), 0.62), true)], hand: 'holding' },
      };
    case 'skewer':
      return { left: null, right: { stages: stages(n.right, (i) => skewer(c(0), c(1), i)), hand: 'holding' } };
    case 'sweet':
      return { left: null, right: { stages: stages(n.right, (i) => riceCake(c(1), c(0), c(2), i)), hand: 'holding' } };
    case 'coconut':
      return { left: null, right: { stages: [coconut(c(0), c(1), c(2))], hand: 'open' } };
    case 'cupDrink':
      return { left: null, right: { stages: stages(n.right, (i) => cup(c(0), c(1), c(2), i)), hand: 'holding' } };
    case 'bagDrink':
      return { left: null, right: { stages: stages(n.right, (i) => drinkBag(c(0), c(1), c(2), c(3), i)), hand: 'holding' } };
    case 'bottle':
      return { left: null, right: { stages: stages(n.right, (i) => bottle(c(0), c(1), c(2), i)), hand: 'holding' } };
  }
}
