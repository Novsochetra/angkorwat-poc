import type { Group } from 'three';
import { jarAt } from '../roam/_gardenSpots';
import type { RoamWorld } from '../roam/types';
import { ACTIONS, POLE_ACTIONS, type GardenAction, type PoleAction } from './actions';
import { SFX } from '../audio/addonSfx';
import { GARDEN_FX, type FxBeat } from './fx';
import type { PlantKindId } from './kinds';
import { GARDEN, JAR_MAX } from './state';
import { DROP, DUST, FLY, LEAF, Particles, STAY } from './_fxParticles';

/**
 * The garden work's effects (the hook garden/fx.ts `GARDEN_FX`, filled here when
 * the view is made: garden/view.ts): what the work does to the world, beat by
 * beat, in the map's little blocks (garden/_fxParticles.ts: one instanced mesh,
 * a fixed pool, nothing drawn when idle).
 *
 * - **Digging** (`plant`, `plantTree`): each `chop` throws a burst of earth from
 *   where the hoe bites (a few grass bits with the first), mostly back toward
 *   him, falling, bouncing once and settling, with a puff of dust; the hole
 *   grows with the chops: the first cuts the grass away (a brown patch), the
 *   second opens a hole with a heap of earth beside it on his side, the third
 *   (and the tree's fourth) deepens it and the heap grows. `tear` throws the
 *   black bag's scraps aside; `set` a few crumbs; each `pat` crumbs from the
 *   heap to the hole as the heap shrinks into it; at `up` what is left eases
 *   away as the plant's own bed (the view's earth, rising from `set`) takes
 *   its place. Stopped half done (`cancel`), the hole fills back in gently.
 * - **Water**: splashes where the can's water lands (little white-blue blocks
 *   bouncing up), from `pour` to `stop`; the earth darkens (the view's).
 * - **Fill**, the pole's `poleFill` / `poleJar` / `poleScoop`, a `spill`:
 *   splashes at the water, in the jar, on the earth; drops falling.
 * - **Clear**: earth and roots sprayed at each `tug` and `out`; the stick tossed
 *   lands with a puff of dust.
 * - **Picking** (`pickLow`, `pickReach`, `pickCut`, `pickPole`): a few leaves
 *   shaken loose drifting down, of the plant's own green; `pickGround`, and ripe
 *   fruit falling (the view's drop: `puff`): a puff of dust where it lands.
 * - **The jar's water**: his yard's jar (roam/_gardenSpots.ts `jarAt`, its mouth
 *   open: hamlet/_home.ts) shows its water at the height of its pours
 *   (`GARDEN.jar`, 0‥`JAR_MAX`), and it bobs and splashes when poured into.
 *
 * Seeded (the same picture every time). The "reduce motion" setting (`calm`)
 * throws fewer blocks and no dust. A shot of a piece of work held still
 * (`gardenact=<action>:<t>`, roam/_gardenWork.ts; the pole's `carry=<action>:<t>`) plays its beats from the
 * start to `t` before the picture: the earth in the air is where it would be.
 */

/** The dug earth's tones, grass, dust, water, the bag, roots, a dry stick (sRGB). */
const EARTH = [0x6e4e36, 0x5e4230, 0x7d5a3e, 0x8a6646, 0x4f3828] as const;
const GRASS = [0x6e9a38, 0x5d8a30, 0x7aa440, 0x689534] as const;
const DUSTS = [0xc8b8a0, 0xbcae98, 0xd2c4ac] as const;
const WATER = [0xdcf0f8, 0xb8dcef, 0x9cc8e4, 0xeef8fc] as const;
const BAG = [0x1e1e20, 0x2a2a2c, 0x161618] as const;
const ROOT = [0xb8956a, 0xa27f58, 0x8a6a48] as const;
const HOLE = [0x3a2a1e, 0x2e2118] as const;
/** Bark chips and the pale wood under it (an axe at a trunk's foot). */
const CHIPS = [0x6a4a30, 0x5a3e28, 0xd8c08a, 0xc8ac78] as const;
const JAR_WATER = [0x3e5a66, 0x5a7a86, 0x8aa8b4] as const;
/** Each kind's leaf green (sRGB), and a yellowed one now and then. */
const LEAVES: Record<PlantKindId, readonly number[]> = {
  eggplant: [0x4e8a30, 0x5a9636],
  corn: [0x6aa040, 0x7aac48],
  pumpkin: [0x5a9a34, 0x4e8a2e],
  sugarcane: [0x7aa848, 0x6a9a3a],
  banana: [0x6a9a3a, 0x7aac46],
  papaya: [0x5a9a34, 0x4a8a2e],
  guava: [0x5a8a34, 0x6a9a3e],
  mango: [0x3f6e2a, 0x4a7a30],
  jackfruit: [0x3a6a2a, 0x46762e],
  durian: [0x4a6a30, 0x56763a],
  coconut: [0x7a9a3a, 0x8aaa46],
  sugarPalm: [0x5a7a3a, 0x6a8a44],
  bodhi: [0x4a8a34, 0x5a9a3e],
};
const YELLOW = 0xb8a040;

/** What the effects ask of the view: a plant's height and where its crown is (m over its foot), null if none. */
export type PlantInfo = (id: number) => { readonly x: number; readonly y: number; readonly z: number; readonly height: number; readonly base: number; readonly reach: number } | null;

export interface GardenFx {
  readonly object: Group | null;
  /** Each frame (s; `calm`: the reduce-motion setting). */
  frame(dt: number, calm: boolean): void;
  /** A drop of water burst (watered): splashes from (x, y, z). */
  pop(x: number, y: number, z: number): void;
  /** A felled tree has hit the ground (foot at x, y, z, fallen along (wx, wz), its height, its crown's base, its reach): dust along it, leaves shaken from its crown. */
  fell(kind: PlantKindId, x: number, y: number, z: number, wx: number, wz: number, height: number, base: number, reach: number): void;
  /** Dust where something heavy landed (a fruit fallen: the view's drop). */
  puff(x: number, y: number, z: number, big: number): void;
  readonly stats: () => { alive: number; spawned: number };
  dispose(): void;
}

/** A dig in progress: the hole's blocks (the patch, the hole, its depth), the heap's, where. */
interface Dig {
  x: number;
  y: number;
  z: number;
  fx: number;
  fz: number;
  tree: boolean;
  patch: number;
  hole: number;
  deep: number;
  rim: number[];
  heap: number[];
}

/** Pending effects (the stick landing): when (s from now), what, where. */
interface Later {
  /** What: 0 the stick landing (a puff), 1 clods landing (the crumbs' sound, `gain`). */
  what: number;
  gain: number;
  t: number;
  x: number;
  y: number;
  z: number;
}

/** The beat's time in its action (s): its `n`th beat of that name. */
function beatAt(action: GardenAction | PoleAction, name: string, n: number): number {
  const list = (ACTIONS as Record<string, { beats: readonly { at: number; name: string }[] }>)[action]?.beats ?? (POLE_ACTIONS as Record<string, { beats: readonly { at: number; name: string }[] }>)[action]?.beats ?? [];
  let k = 0;
  for (const b of list) if (b.name === name && k++ === n) return b.at;
  return 0;
}

export function installGardenFx(group: Group, world: RoamWorld, plantInfo: PlantInfo, shot: boolean, takingOut: (id: number, how: 'uproot' | 'fell', yaw: number, beat: string) => void = () => undefined): GardenFx {
  const P = new Particles();
  group.add(P.mesh);
  let calm = false;
  let alive = true;
  /** The dig under way (one at a time: he digs one hole). */
  let dig: Dig | null = null;
  /** The water landing (from `pour` to `stop`): where, until when (s, a safety), how much is owed. */
  const pour = { on: false, x: 0, y: 0, z: 0, left: 0, owed: 0 };
  const later: Later[] = [];
  const pick = <T>(list: readonly T[]): T => list[Math.floor(P.rnd() * list.length) % list.length];
  /** How many of `n` to throw (fewer under reduce motion). */
  const many = (n: number): number => (calm ? Math.max(1, Math.round(n / 3)) : n);

  // ── Bursts ──
  /** Earth thrown up from (x, y, z): `n` blocks, mostly toward (bx, bz) (unit; 0, 0: every way), up to `up` m/s. */
  function earth(x: number, y: number, z: number, n: number, bx: number, bz: number, up: number, size = 1, colors: readonly number[] = EARTH, spread = 0.12): void {
    for (let i = 0; i < many(n); i++) {
      const a = P.rnd() * Math.PI * 2;
      const out = 0.5 + P.rnd() * 1.1;
      const s = (0.045 + P.rnd() * 0.06) * size;
      P.spawn(FLY, x + (P.rnd() - 0.5) * spread, y + 0.05, z + (P.rnd() - 0.5) * spread, Math.cos(a) * out * 0.6 + bx * out, up * (0.55 + P.rnd() * 0.45), Math.sin(a) * out * 0.6 + bz * out, s * (1 + P.rnd() * 0.4), s * 0.8, s, pick(colors), 1.6 + P.rnd() * 1.2, y);
    }
  }
  /** A puff of dust at (x, y, z): `n` pale blocks rising and spreading a little, swelling, then gone. */
  function dust(x: number, y: number, z: number, n: number, size = 1): void {
    if (calm) return;
    for (let i = 0; i < n; i++) {
      const a = P.rnd() * Math.PI * 2;
      const s = (0.06 + P.rnd() * 0.05) * size;
      P.spawn(DUST, x + Math.cos(a) * 0.08, y + 0.06, z + Math.sin(a) * 0.08, Math.cos(a) * 0.45, 0.25 + P.rnd() * 0.3, Math.sin(a) * 0.45, s, s, s, pick(DUSTS), 0.55 + P.rnd() * 0.3, y);
    }
  }
  /** Water splashing up from (x, y, z): `n` little white-blue blocks bouncing, `up` m/s. */
  function splash(x: number, y: number, z: number, n: number, up = 1.4, spread = 0.15): void {
    for (let i = 0; i < many(n); i++) {
      const a = P.rnd() * Math.PI * 2;
      const out = 0.3 + P.rnd() * 0.6;
      const s = 0.025 + P.rnd() * 0.025;
      P.spawn(FLY, x + Math.cos(a) * spread * P.rnd(), y + 0.02, z + Math.sin(a) * spread * P.rnd(), Math.cos(a) * out, up * (0.5 + P.rnd() * 0.5), Math.sin(a) * out, s, s, s, pick(WATER), 0.45 + P.rnd() * 0.25, y);
    }
  }
  /** Drops falling from `h` m over (x, y, z) round `r` m: gone as they land (a splash each, `land`). */
  function drops(x: number, y: number, z: number, n: number, h: number, r: number): void {
    for (let i = 0; i < many(n); i++) {
      const a = P.rnd() * Math.PI * 2;
      const d = P.rnd() * r;
      const s = 0.03 + P.rnd() * 0.02;
      P.spawn(DROP, x + Math.cos(a) * d, y + h * (0.6 + P.rnd() * 0.4), z + Math.sin(a) * d, 0, -0.5, 0, s, s * 1.6, s, pick(WATER), 2, y);
    }
  }
  /** Leaves shaken loose from round (x, z), between `lo` and `hi` m up, drifting down to `y`. */
  function leaves(kind: PlantKindId | null, x: number, y: number, z: number, lo: number, hi: number, n: number, r: number): void {
    const greens = LEAVES[kind ?? 'eggplant'];
    for (let i = 0; i < many(n); i++) {
      const a = P.rnd() * Math.PI * 2;
      const d = P.rnd() * r;
      const s = 0.07 + P.rnd() * 0.05;
      P.spawn(LEAF, x + Math.cos(a) * d, y + lo + P.rnd() * (hi - lo), z + Math.sin(a) * d, (P.rnd() - 0.5) * 0.3, 0, (P.rnd() - 0.5) * 0.3, s, 0.012, s * 0.6, P.rnd() < 0.2 ? YELLOW : pick(greens), 3.2 + P.rnd() * 1.6, y);
    }
  }

  /** The clods of a burst landing in a moment: their sound once (audio/_garden.ts `gardenCrumbs`), `gain` by how much earth. */
  function crumbs(gain: number, after = 0.45): void {
    if (later.length < 8) later.push({ what: 1, gain: Math.min(1, gain), t: after, x: 0, y: 0, z: 0 });
  }

  // ── The dig ──
  /** The hole's patch, hole and heap blocks (`STAY`), made as the chops come. */
  function digChop(b: FxBeat): void {
    const tree = b.action === 'plantTree';
    // (the way he faces: the heap is on his side of the hole, a little to his right)
    const fx = Math.sin(b.yaw);
    const fz = Math.cos(b.yaw);
    if (!dig || b.n === 0 || Math.hypot(dig.x - b.x, dig.z - b.z) > 0.6) {
      if (dig) fillIn(dig);
      dig = { x: b.x, y: b.y, z: b.z, fx, fz, tree, patch: -1, hole: -1, deep: -1, rim: [], heap: [] };
    }
    const d = dig;
    const w = tree ? 0.62 : 0.44;
    // (the earth thrown back toward him and to his right, as a hoe pulls it)
    const bx = -fx * 0.8 + fz * 0.3;
    const bz = -fz * 0.8 - fx * 0.3;
    const n = b.n;
    if (n === 0) {
      d.patch = P.spawn(STAY, d.x, d.y + 0.012, d.z, 0, 0, 0, w, 0.024, w, EARTH[2], Infinity, d.y);
      earth(d.x, d.y, d.z, 7, bx, bz, 2.4);
      earth(d.x, d.y, d.z, 4, bx, bz, 2.6, 1.1, GRASS);
      crumbs(0.55);
    } else {
      earth(d.x, d.y, d.z, tree ? 12 : 10, bx, bz, 2.6 + n * 0.2);
      crumbs(tree ? 0.85 : 0.7, 0.5);
      const hx = d.x - fx * (w * 0.5 + 0.17) + fz * 0.08;
      const hz = d.z - fz * (w * 0.5 + 0.17) - fx * 0.08;
      if (n === 1) {
        d.hole = P.spawn(STAY, d.x, d.y + 0.026, d.z, 0, 0, 0, w * 0.55, 0.012, w * 0.55, HOLE[0], Infinity, d.y);
        for (let k = 0; k < 4; k++) {
          const a = b.yaw + (k * Math.PI) / 2 + 0.4;
          const r = w * 0.36;
          d.rim.push(P.spawn(STAY, d.x + Math.sin(a) * r, d.y + 0.04, d.z + Math.cos(a) * r, 0, 0, 0, 0.08, 0.05, 0.07, pick(EARTH), Infinity, d.y));
        }
        d.heap.push(P.spawn(STAY, hx, d.y + 0.05, hz, 0, 0, 0, 0.22, 0.1, 0.18, EARTH[1], Infinity, d.y));
      } else if (n === 2) {
        d.deep = P.spawn(STAY, d.x, d.y + 0.03, d.z, 0, 0, 0, w * 0.4, 0.012, w * 0.4, HOLE[1], Infinity, d.y);
        d.heap.push(P.spawn(STAY, hx + fz * 0.06, d.y + 0.11, hz - fx * 0.06, 0, 0, 0, 0.16, 0.08, 0.14, EARTH[0], Infinity, d.y));
      } else {
        // (the tree's fourth: wider, the heap higher)
        P.place(d.hole, d.x, d.y + 0.026, d.z, w * 0.62, 0.012, w * 0.62);
        d.heap.push(P.spawn(STAY, hx - fz * 0.1, d.y + 0.06, hz + fx * 0.1, 0, 0, 0, 0.18, 0.11, 0.16, EARTH[3], Infinity, d.y));
      }
    }
    dust(d.x, d.y, d.z, 3);
  }
  /** The heap patted back into the hole, a little each pat. */
  function digPat(b: FxBeat, last: boolean): void {
    const d = dig;
    if (!d) return;
    for (const h of d.heap) P.target(h, last ? 0.15 : 0.55);
    P.target(d.deep, 0);
    // (crumbs from the heap to the hole)
    earth(d.x - d.fx * 0.2, d.y, d.z - d.fz * 0.2, 5, d.fx * 0.4, d.fz * 0.4, 1.2, 0.8);
    crumbs(0.3, 0.25);
    dust(d.x, d.y, d.z, 2, 0.8);
    void b;
  }
  /** What is left of the dig eases away (the plant's bed has risen in its place). */
  function digDone(): void {
    const d = dig;
    if (!d) return;
    for (const i of [d.patch, d.hole, d.deep, ...d.rim, ...d.heap]) P.release(i);
    dig = null;
  }
  /** Stopped half done: the heap goes back into the hole and it all eases away. */
  function fillIn(d: Dig): void {
    for (const h of d.heap) P.place(h, d.x, d.y + 0.03, d.z);
    for (const i of [d.patch, d.hole, d.deep, ...d.rim, ...d.heap]) P.release(i);
    if (dig === d) dig = null;
  }

  // ── The jar's water ──
  const [jx, jz] = jarAt();
  const jy = world.field.heightAt(jx, jz);
  /** Its water: two squares across each other and a glint; its level shown (0‥1), its bob (s since poured into). */
  const jar = { a: -1, b: -1, glint: -1, level: -1, bob: 9 };
  function jarFrame(dt: number): void {
    const want = Math.max(0, Math.min(1, GARDEN.jar / JAR_MAX));
    if (jar.a < 0) {
      jar.a = P.spawn(STAY, jx, jy, jz, 0, 0, 0, 0.33, 0.01, 0.33, JAR_WATER[0], Infinity, jy);
      jar.b = P.spawn(STAY, jx, jy, jz, 0, 0, 0, 0.3, 0.01, 0.3, JAR_WATER[1], Infinity, jy);
      jar.glint = P.spawn(STAY, jx, jy, jz, 0, 0, 0, 0.12, 0.01, 0.05, JAR_WATER[2], Infinity, jy);
    }
    jar.bob += dt;
    if (want === jar.level && jar.bob > 1.5) return;
    jar.level = want;
    // (inside the open mouth: from just over its dark floor to just under its rim; none when empty)
    const y = jy + 0.69 + 0.11 * want + (jar.bob < 1.5 ? 0.01 * Math.sin(jar.bob * 14) * (1 - jar.bob / 1.5) : 0);
    P.place(jar.a, jx, y, jz);
    P.place(jar.b, jx, y + 0.002, jz);
    P.place(jar.glint, jx + 0.06, y + 0.004, jz - 0.05);
    const k = want > 0.01 ? 1 : 0;
    P.target(jar.a, k);
    P.target(jar.b, k);
    P.target(jar.glint, k);
  }
  /** The jar's water surface now (m), for a splash in it. */
  const jarWater = () => jy + 0.69 + 0.11 * Math.max(0, Math.min(1, GARDEN.jar / JAR_MAX));
  const nearJar = (x: number, z: number) => Math.hypot(x - jx, z - jz) < 0.7;

  // ── The beats ──
  function beat(b: FxBeat): void {
    P.reseed(b.x * 31.7 + b.z * 17.3 + b.n * 5.1 + b.beat.length);
    const a = b.action;
    const fx = Math.sin(b.yaw);
    const fz = Math.cos(b.yaw);
    // (the land under the spot: a pick's spot is the fruit, up in the plant; the plant's own earth, its foot)
    const g = world.field.heightAt(b.x, b.z);
    const info = b.plant >= 0 ? plantInfo(b.plant) : null;
    const foot = info ? info.y : g;
    const an = a as string;
    if ((an === 'uproot' || an === 'fell') && b.plant >= 0) takingOut(b.plant, an, b.yaw, b.beat);
    if (an === 'uproot') {
      // Dug up: earth loosened round it, earth and roots at each tug, a spray as it comes out, a puff where it is laid.
      if (b.beat === 'loosen') {
        earth(b.x, foot, b.z, 6, -fx * 0.4, -fz * 0.4, 1.4, 0.9);
        dust(b.x, foot, b.z, 2, 0.8);
      } else if (b.beat === 'tug') {
        earth(b.x, foot, b.z, 7, -fx * 0.6, -fz * 0.6, 1.9);
        earth(b.x, foot, b.z, 3, -fx * 0.6, -fz * 0.6, 1.8, 1, ROOT);
        crumbs(0.45, 0.4);
      } else if (b.beat === 'out') {
        earth(b.x, foot, b.z, 12, -fx * 0.7, -fz * 0.7, 2.5);
        earth(b.x, foot, b.z, 7, -fx * 0.7, -fz * 0.7, 2.3, 1.2, ROOT);
        dust(b.x, foot, b.z, 3);
        crumbs(0.8, 0.5);
      }
      return;
    }
    if (an === 'fell') {
      // Felled: bark chips and pale wood from the axe's cut at the foot, a little earth; the fall itself is the view's.
      if (b.beat === 'chop') {
        const h = foot + 0.35;
        earth(b.x - fx * 0.15, h, b.z - fz * 0.15, 7, -fx * 0.5 + fz * 0.5, -fz * 0.5 - fx * 0.5, 2.0, 0.8, CHIPS, 0.06);
        earth(b.x, foot, b.z, 2, -fx * 0.4, -fz * 0.4, 1.0, 0.7);
        crumbs(0.35, 0.35);
      }
      return;
    }
    if (an === 'fillRope' || an === 'poleFillRope') {
      // On a rope down to the water below: a splash as the can (the bucket) goes in, drips as it comes up.
      if (b.beat.startsWith('dip') || b.beat.startsWith('splash') || b.beat === 'in') splash(b.x, b.y, b.z, 14, 1.7, 0.15);
      else if (b.beat.startsWith('full') || b.beat.startsWith('up') || b.beat.startsWith('pull') || b.beat === 'lift') drops(b.x, b.y, b.z, 9, 1.2, 0.12);
      return;
    }
    switch (a) {
      case 'plant':
      case 'plantTree':
        if (b.beat === 'chop') digChop(b);
        else if (b.beat === 'tear') {
          // (the black nursery bag torn off: scraps thrown to his side)
          earth(b.x, b.y + 0.3, b.z, 7, fz * 0.9, -fx * 0.9, 1.6, 1.3, BAG, 0.2);
          earth(b.x, b.y + 0.25, b.z, 3, 0, 0, 1.2, 0.8);
        } else if (b.beat === 'set') {
          earth(b.x, b.y, b.z, 4, 0, 0, 1.0, 0.7);
          dust(b.x, b.y, b.z, 2, 0.7);
        } else if (b.beat === 'pat') digPat(b, b.n >= 1);
        else if (b.beat === 'up') digDone();
        break;
      case 'water':
        if (b.beat === 'pour') Object.assign(pour, { on: true, x: info ? info.x : b.x, y: foot, z: info ? info.z : b.z, left: 2.2, owed: 0 });
        else if (b.beat === 'stop') pour.on = false;
        break;
      case 'fill':
      case 'poleFill': {
        const y = nearJar(b.x, b.z) ? jarWater() : b.y;
        if (b.beat === 'dip' || b.beat === 'dip1' || b.beat === 'dip2') {
          splash(b.x, y, b.z, 12, 1.6, 0.12);
          if (nearJar(b.x, b.z)) jar.bob = 0;
        } else if (b.beat === 'lift' || b.beat === 'up') drops(b.x, y, b.z, 8, 0.5, 0.12);
        break;
      }
      case 'poleJar':
        if (b.beat === 'tip1' || b.beat === 'tip2') {
          splash(jx, jarWater(), jz, 14, 1.8, 0.1);
          jar.bob = 0;
        }
        break;
      case 'poleScoop':
        if (b.beat === 'pour') {
          splash(b.x, foot, b.z, 14, 1.5, 0.2);
          earth(b.x, foot, b.z, 3, 0, 0, 0.8, 0.6);
        }
        break;
      case 'poleUp':
      case 'poleDown':
        if (b.beat === 'down') dust(b.x, g, b.z, 2, 0.8);
        break;
      case 'clear':
        if (b.beat === 'tug') {
          earth(b.x, foot, b.z, 6, -fx * 0.6, -fz * 0.6, 1.8);
          crumbs(0.45, 0.4);
          earth(b.x, foot, b.z, 2, -fx * 0.6, -fz * 0.6, 1.8, 1, ROOT);
        } else if (b.beat === 'out') {
          earth(b.x, foot, b.z, 12, -fx * 0.7, -fz * 0.7, 2.6);
          crumbs(0.8, 0.5);
          earth(b.x, foot, b.z, 6, -fx * 0.7, -fz * 0.7, 2.4, 1.2, ROOT);
          dust(b.x, foot, b.z, 3);
        } else if (b.beat === 'toss') {
          // (the stick thrown to his right lands there a moment later)
          const sx = b.x - fx * 0.6 + fz * 1.3;
          const sz = b.z - fz * 0.6 - fx * 1.3;
          if (later.length < 8) later.push({ what: 0, gain: 0, t: 0.38, x: sx, y: world.field.heightAt(sx, sz), z: sz });
        }
        break;
      case 'pickLow':
      case 'pickReach':
      case 'pickCut':
      case 'pickPole': {
        if (b.beat !== 'grip' && b.beat !== 'take' && b.beat !== 'cut' && b.beat !== 'hook') break;
        const h = info ? info.height : 1.2;
        const base = info ? info.base : 0.3;
        const lo = a === 'pickPole' ? Math.max(base, h * 0.55) : a === 'pickLow' ? Math.min(h, 0.6) * 0.4 : Math.min(h * 0.9, 1.4);
        const hi = a === 'pickPole' ? h * 0.92 : a === 'pickLow' ? Math.min(h, 0.6) : Math.min(h, 2);
        const cx = info ? info.x + (b.x - info.x) * 0.5 : b.x;
        const cz = info ? info.z + (b.z - info.z) * 0.5 : b.z;
        leaves(b.kind, cx, foot, cz, lo, Math.max(lo + 0.1, hi), b.beat === 'take' ? 3 : 2, a === 'pickPole' ? 1.2 : 0.4);
        break;
      }
      case 'pickGround':
        if (b.beat === 'take') dust(b.x, foot, b.z, 3, 0.8);
        break;
    }
    if (b.beat === 'spill') drops(b.x, g, b.z, 6, 0.9, 0.35);
  }
  function cancel(action: GardenAction | PoleAction): void {
    if ((action === 'plant' || action === 'plantTree') && dig) fillIn(dig);
    if (action === 'water') pour.on = false;
  }

  /** Run the water and the pending effects on by `dt` (s). */
  function emitters(dt: number): void {
    if (pour.on) {
      pour.left -= dt;
      if (pour.left <= 0) pour.on = false;
      // (the water landing on the plant's earth: a splash every few hundredths of a second)
      pour.owed += dt * (calm ? 10 : 30);
      while (pour.owed >= 1) {
        pour.owed -= 1;
        const a = P.rnd() * Math.PI * 2;
        const d = P.rnd() * 0.18;
        splash(pour.x + Math.cos(a) * d, pour.y + 0.1, pour.z + Math.sin(a) * d, 2, 1.1, 0.04);
      }
    }
    for (let i = later.length - 1; i >= 0; i--) {
      const l = later[i];
      l.t -= dt;
      if (l.t > 0) continue;
      if (l.what === 1) {
        if (!shot) SFX.play('gardenCrumbs', l.gain);
      } else {
        dust(l.x, l.y, l.z, 4, 1);
        earth(l.x, l.y, l.z, 3, 0, 0, 1.0, 0.7);
      }
      later.splice(i, 1);
    }
  }

  // A shot of a piece of work held still (`gardenact=<action>:<t>`): its beats come all at once before the picture;
  // played here in order from the start, and on to `t`.
  const q = shot ? new URLSearchParams(location.search) : null;
  // (the shoulder pole's: `carry=<up|down|fill|jar|scoop>:<t>`, roam/_carryPole.ts)
  const pole = q?.get('carry')?.split(':');
  const POLE: Record<string, PoleAction> = { up: 'poleUp', down: 'poleDown', fill: 'poleFill', jar: 'poleJar', scoop: 'poleScoop' };
  const act = q?.get('gardenact')?.split(':') ?? (pole && POLE[pole[0]] && pole[1] ? [POLE[pole[0]], pole[1]] : undefined);
  const actT = act ? Number(act[1]) : NaN;
  const queued: { at: number; b: FxBeat }[] = [];
  let replayed = false;

  GARDEN_FX.beat = (b: FxBeat) => {
    if (!alive) return;
    if (act && !replayed && b.action === act[0] && Number.isFinite(actT)) {
      queued.push({ at: beatAt(b.action, b.beat, b.n), b: { ...b } });
      return;
    }
    beat(b);
  };
  GARDEN_FX.cancel = (a) => {
    if (alive) cancel(a);
  };

  /** Everything on by `t` s in steps (a shot's replay). */
  function run(t: number): void {
    for (let left = t; left > 1e-6; left -= 1 / 30) {
      const d = Math.min(1 / 30, left);
      emitters(d);
      P.step(d);
    }
  }

  return {
    object: group,
    frame(dt, isCalm) {
      calm = isCalm;
      if (queued.length && !replayed) {
        replayed = true;
        queued.sort((p, q) => p.at - q.at);
        let now = 0;
        for (const q of queued) {
          run(q.at - now);
          now = q.at;
          beat(q.b);
        }
        run(Math.max(0, actT - now));
        queued.length = 0;
      }
      jarFrame(dt);
      emitters(dt);
      P.step(dt);
    },
    fell(kind, x, y, z, wx, wz, height, base, reach) {
      P.reseed(x * 7.3 + z * 3.1);
      for (let i = 0; i < 6; i++) {
        const d = (height * (i + 0.5)) / 6;
        const px = x + wx * d;
        const pz = z + wz * d;
        dust(px, world.field.heightAt(px, pz), pz, i < 3 ? 2 : 3, 1.1);
      }
      // (leaves shaken loose where the crown hit, a few thrown up)
      const mid = (base + height) / 2;
      const cx = x + wx * mid;
      const cz = z + wz * mid;
      const g = world.field.heightAt(cx, cz);
      leaves(kind, cx, g, cz, 0.3, Math.max(0.6, reach * 0.8), 14, Math.max(0.8, reach * 0.8));
      earth(x + wx * 0.3, y, z + wz * 0.3, 6, wx * 0.5, wz * 0.5, 1.6, 1, ROOT);
      if (!shot) {
        SFX.play('gardenCrumbs', 1);
        // (the thud as it lands, louder for a bigger tree)
        SFX.play('gardenThud', Math.min(1, 0.45 + height / 16));
      }
    },
    pop(x, y, z) {
      P.reseed(x * 3.3 + z * 9.1);
      for (let i = 0; i < many(10); i++) {
        const a = P.rnd() * Math.PI * 2;
        const s = 0.04 + P.rnd() * 0.03;
        P.spawn(FLY, x, y, z, Math.cos(a) * 1.1, 1.2 + P.rnd() * 1.2, Math.sin(a) * 1.1, s, s, s, pick(WATER), 0.8, world.field.heightAt(x, z));
      }
    },
    puff(x, y, z, big) {
      P.reseed(x * 13.1 + z * 7.7);
      dust(x, y, z, Math.round(3 + 2 * big), 0.8 + 0.5 * big);
      earth(x, y, z, Math.round(2 + 2 * big), 0, 0, 0.9, 0.7);
    },
    stats: () => ({ alive: P.alive, spawned: P.spawned }),
    dispose() {
      alive = false;
      GARDEN_FX.beat = () => undefined;
      GARDEN_FX.cancel = () => undefined;
      P.dispose();
    },
  };
}
