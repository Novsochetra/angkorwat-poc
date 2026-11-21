import { Color, Group } from 'three';
import { mulberry32 } from '../../voxel/random';
import type { HeightField, RiverSample } from '../heightfield';
import { PX_SCALE } from '../resolution';
import { pointScale } from '../road/glow';
import type { MapContext, MapFrame, MapQuality } from '../types';
import { BOARD, GATE, GROUND, NAGA, onSquare, SQUARE, STAGE } from './plan';
import { TOP } from './_sqFloor';
import { NYE_TREES, type Bloom, type BuiltTree } from './_sqGarden';
import { Petals } from './_sqLifePetals';
import { SPARK, Sparks } from './_sqLifeSparks';
import { bulbLight, bulbsAlong, buildSway, hangAt, type StringSpan } from './_sqLifeSway';
import { Wings, type Flyer } from './_sqLifeWings';
import { ARCH, AVENUE } from './_sqWalk';

/**
 * The festival square alive (AWP-35; the owner: "flying animals so it feels alive"), subtle, never busy:
 *
 * - **fireflies** at night: warm-green glows drifting and blinking in loose swarms, thick at the forest's edge under
 *   Kulen, in the gardens round the square, along the avenue and the Kulen stream, only a few high over the crowd;
 * - **embers** rising from the fire bowls (the stage's, the braziers before the board, the avenue's) at dusk and night;
 * - **petals** falling from the flowering trees (crape myrtle, the pink trumpet tree, frangipani's whole white
 *   flowers), rocking down, drifting west on the breeze, lying a while where they land and fading;
 * - **butterflies** round the flowering trees, the beds and the avenue by day and into the evening; **dragonflies**
 *   hovering and darting over the Kulen stream and its pool by day; **moths** circling the Khmer lamps and the edge
 *   strings' bulbs at night; **bats** crossing the sky over the square at night and two or three circling the stage's
 *   prasat, as flying foxes round Angkor Wat's towers;
 * - the edge strings of bulbs (`_sqDecor.ts`) **swaying** in the breeze (`_sqLifeSway.ts`; the same swing as the
 *   canopy's strings and its hanging lanterns, `_sqSway.ts`, drawn by `_sqGlow.ts`).
 *
 * No sky lanterns (khom loi: Thai). Draws: sparks 1 (night), petals 1, flyers 1 (the day's or the night's), strings 1;
 * all motion in vertex shaders from one clock, nothing drawn out of its time, no work a frame but uniforms. Counts by
 * the build's graphics level (`COUNTS`).
 */

export interface LifeUniforms {
  uLifeT: { value: number };
  /** Butterflies and dragonflies (by day and into the evening), moths and bats (at night), fireflies, embers: 0‥1. */
  uDayOn: { value: number };
  uFlyNight: { value: number };
  uFlies: { value: number };
  uFire: { value: number };
  /** The petals' own light at night (the lanterns in the trees). */
  uPetalGlow: { value: number };
  /** Drawn pixels per metre at 1 m (road/glow.ts `pointScale`), and the picture's scale (`pxscale=`). */
  uPxPerM: { value: number };
  uPx: { value: number };
  /** The edge strings' bulbs (linear colour × light). */
  uBulb: { value: Color };
}

export interface LifeInput {
  /** The flowering trees as built (`_sqGarden.ts`). */
  trees: readonly BuiltTree[];
  /** The lantern walk's lamps and the avenue's lamps and fire bowls (map x, z: `_sqWalk.ts`, `_sqFlags.ts`). */
  walk: readonly [number, number][];
  avenue: readonly [number, number][];
  /** The edge strings of bulbs (`_sqDecor.ts`): drawn here, swaying. */
  strings: readonly StringSpan[];
}

export interface SquareLife {
  object: Group;
  update(f: MapFrame): void;
}

/** Per build level: fireflies, embers a fire, petals a tree, butterflies, dragonflies, moths a lamp, bats. */
const COUNTS: Record<MapQuality, { flies: number; embers: number; petals: number; butterflies: number; dragonflies: number; moths: number; bats: number }> = {
  low: { flies: 72, embers: 4, petals: 6, butterflies: 14, dragonflies: 5, moths: 1, bats: 3 },
  medium: { flies: 360, embers: 8, petals: 16, butterflies: 40, dragonflies: 10, moths: 2, bats: 6 },
  high: { flies: 520, embers: 12, petals: 22, butterflies: 56, dragonflies: 14, moths: 3, bats: 8 },
};

const BUTTERFLY = [0xf2a33a, 0xf5d04a, 0xf6f1e4, 0x8fc0ea, 0xe8762e, 0xf3ec9a];
const DRAGONFLY = [0x2f86e0, 0xd8402a, 0x3aa0d8, 0xe0602a];
const MOTH = [0xe9dfc8, 0xd9caa8, 0xf2ead8, 0xcbb894];
const BAT = 0x3a2e28;
/** Petals (sRGB, mid to lit: the garden's blossom), frangipani's white flowers with a warm heart. */
const PETAL: Record<Bloom, readonly number[]> = {
  pink: [0xd96e97, 0xe98cb0, 0xf3a9c6, 0xf9c6da],
  purple: [0x9455b6, 0xab6cca, 0xc18ada, 0xd6a8e8],
  white: [0xf8f1e2, 0xfdf8ec, 0xfffcf4, 0xf6e4b0],
};
/** The breeze carries things west (m/s; the square's flags fly that way). */
const BREEZE = 0.3;

export function buildSquareLife(ctx: MapContext, input: LifeInput): SquareLife {
  const t0 = performance.now();
  const object = new Group();
  object.name = 'nye:life';
  const u: LifeUniforms = {
    uLifeT: { value: 0 },
    uDayOn: { value: 1 },
    uFlyNight: { value: 0 },
    uFlies: { value: 0 },
    uFire: { value: 0 },
    uPetalGlow: { value: 0 },
    uPxPerM: { value: 800 },
    uPx: { value: PX_SCALE },
    uBulb: { value: new Color() },
  };
  let sparks: ReturnType<Sparks['build']> = null;
  let wings: { update(): void } | null = null;
  // (the strings first, on their own: they are the square's edge lights, drawn nowhere else)
  try {
    const sway = buildSway(input.strings, u);
    if (sway) object.add(sway);
  } catch (e) {
    console.error("[map] nye: the square's swaying strings failed:", e);
  }
  try {
    const { field } = ctx;
    const n = COUNTS[ctx.quality];
    const rnd = mulberry32(3535);
    const seed = (): [number, number, number, number] => [rnd(), rnd(), rnd(), rnd()];
    const stream = streamNear(field);

    const s = new Sparks();
    const flies = fireflySpots(field, stream, n.flies, rnd);
    for (const [x, y, z] of flies) s.add(SPARK.firefly, x, y, z, seed());
    for (const [x, y, z, k] of fires(field)) for (let i = 0; i < n.embers; i++) s.add(SPARK.ember, x + (rnd() - 0.5) * 0.4 * k, y, z + (rnd() - 0.5) * 0.4 * k, seed());
    sparks = s.build(u);

    const p = new Petals();
    for (const t of input.trees) fallFrom(p, field, t, bloomOf(t), n.petals, rnd);

    const w = new Wings();
    for (const f of flyers(field, stream, input, n, rnd)) w.add(f, seed());
    wings = w.build(object, u);

    for (const m of [sparks, p.build(u)]) if (m) object.add(m);
    console.info(
      `[map] nye life: ${flies.length} fireflies, ${s.count - flies.length} embers, ${p.count} petals, ${w.count} flyers, ${input.strings.length} swaying strings · built in ${(performance.now() - t0).toFixed(1)} ms`,
    );
  } catch (e) {
    console.error("[map] nye: the square's life failed:", e);
  }

  return {
    object,
    update(f: MapFrame) {
      const night = f.night;
      // (in rain the flyers shelter and the fireflies go dark)
      const out = 1 - smooth(0.2, 0.7, Math.max(f.weather.rain, f.weather.snow));
      u.uLifeT.value = f.t;
      u.uDayOn.value = (1 - smooth(0.3, 0.6, night)) * out;
      u.uFlyNight.value = smooth(0.4, 0.7, night) * out;
      u.uFlies.value = smooth(0.35, 0.8, night) * out;
      u.uFire.value = smooth(0.15, 0.6, night);
      u.uPetalGlow.value = 0.25 * smooth(0.3, 0.8, night);
      u.uPxPerM.value = pointScale(ctx.renderer, f.camera);
      bulbLight(u.uBulb.value, night, f.t + 1.7);
      if (sparks) sparks.visible = u.uFlies.value > 0.002 || u.uFire.value > 0.002;
      wings?.update();
    },
  };
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The Kulen stream's points by the square (its pool's foot to the woodcutters' camp). */
function streamNear(field: HeightField): RiverSample[] {
  const river = field.rivers.find((r) => r.name === 'Kulen stream');
  return (river?.samples ?? []).filter((s) => s.x > 420 && s.x < 465 && s.z > -312 && s.z < -200);
}

/** Metres from (x, z) to the stream's bank (0 over its water). */
function toStream(stream: readonly RiverSample[], x: number, z: number): number {
  let best = Infinity;
  for (const s of stream) best = Math.min(best, Math.hypot(s.x - x, s.z - z) - s.w / 2);
  return Math.max(0, best);
}

/**
 * Where fireflies gather (world m): swarms of 4‥9 a few metres across, their middles picked by how much fireflies like
 * a place: the gardens round the square and along the avenue, the forest's edge under Kulen and the stream's banks;
 * a few high over the paving (the crowd).
 */
function fireflySpots(field: HeightField, stream: readonly RiverSample[], count: number, rnd: () => number): [number, number, number][] {
  const like = (x: number, z: number): number => {
    if (onSquare(x, z)) return 0.06;
    const e = Math.hypot((x - SQUARE.x) / SQUARE.rx, (z - SQUARE.z) / SQUARE.rz);
    const out = (e - 1) * 29;
    let w = out < 1 ? 0.3 : out < 24 ? 1 : Math.max(0, 1 - (out - 24) / 26) * 0.7;
    if (z < STAGE.back + 4 && z > STAGE.back - 34 && x > 340 && x < 432) w = Math.max(w, 1.4);
    const ax = Math.abs(x - AVENUE.x);
    if (ax > 3.4 && ax < 20 && z > AVENUE.z0 && z < AVENUE.z1 + 6) w = Math.max(w, 1.1);
    if (toStream(stream, x, z) < 9) w = Math.max(w, 1.3);
    return w;
  };
  const out: [number, number, number][] = [];
  for (let tries = 0; out.length < count && tries < 20000; tries++) {
    const cx = 328 + rnd() * 140;
    const cz = -332 + rnd() * 140;
    if (rnd() * 1.4 > like(cx, cz)) continue;
    const swarm = 4 + Math.floor(rnd() * 6);
    for (let i = 0; i < swarm && out.length < count; i++) {
      const a = rnd() * Math.PI * 2;
      const r = Math.sqrt(rnd()) * 4;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const water = field.waterAt(x, z);
      const g = water ?? field.heightAt(x, z);
      const y = onSquare(x, z) ? g + 3.5 + rnd() * 2.5 : z < STAGE.back ? g + 0.6 + rnd() * 4 : g + 0.4 + rnd() * 2.4;
      out.push([x, y, z]);
    }
  }
  return out;
}

/**
 * The fires (world m: where their embers leave the flame, and the fire's size), as stage.ts and `_sqWalk.ts` lay
 * them: the stage's six bowls on its front edge and the two braziers before the board; the avenue's four.
 */
function fires(field: HeightField): [number, number, number, number][] {
  const top = GROUND + STAGE.h;
  const out: [number, number, number, number][] = [];
  for (const nb of NAGA) {
    const s = nb.x < STAGE.x ? -1 : 1;
    for (const d of [2.6, 5.6]) out.push([nb.x + s * d, top + 1.26, STAGE.front - 1.05, 1]);
  }
  for (const x of [STAGE.x - STAGE.stair / 2 - 0.3, STAGE.x + STAGE.stair / 2 + 0.3]) out.push([x, top + 1.26, STAGE.front - 1.05, 1]);
  for (const x of [BOARD.x - 4.2, BOARD.x + 4.2]) out.push([x, top + 1.7, BOARD.z + 2.6, 1.35]);
  const half = AVENUE.w / 2;
  for (const [x, z, k] of [
    [AVENUE.x - half - 1.6, AVENUE.z0 + 0.9, 1.2],
    [AVENUE.x + half + 1.6, AVENUE.z0 + 0.9, 1.2],
    [ARCH.x - 4.6, ARCH.z + 0.6, 1],
    [ARCH.x + 4.6, ARCH.z + 0.6, 1],
  ] as const)
    out.push([x, field.heightAt(x, z) + 2.05 * k, z, k]);
  return out;
}

/** The bloom of a built tree: the `NYE_TREES` spot nearest where the garden puts it (edge trees keep their angle). */
function bloomOf(t: BuiltTree): Bloom {
  let best: Bloom = 'pink';
  let bd = Infinity;
  for (const nt of NYE_TREES) {
    let x = nt.x;
    let z = nt.z;
    if (nt.edge) {
      const th = Math.atan2((nt.z - SQUARE.z) / 21, (nt.x - SQUARE.x) / 22);
      x = Math.min(418, SQUARE.x + Math.cos(th) * (SQUARE.rx + 4.5));
      z = SQUARE.z + Math.sin(th) * (SQUARE.rz + 4.5);
    }
    const d = Math.hypot(x - t.x, z - t.z);
    if (d < bd) [bd, best] = [d, nt.bloom];
  }
  return best;
}

/** `count` petals falling from a tree's crown: where each starts, lands (ground, pavers or water), and how long it falls. */
function fallFrom(p: Petals, field: HeightField, t: BuiltTree, bloom: Bloom, count: number, rnd: () => number): void {
  const tones = PETAL[bloom];
  const landAt = (x: number, z: number): number => {
    const water = field.waterAt(x, z);
    if (water !== null) return water + 0.03;
    return field.heightAt(x, z) + (onSquare(x, z) ? TOP + 0.02 : 0.1);
  };
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    const r = t.r * 0.8 * Math.sqrt(rnd());
    const x = t.x + Math.cos(a) * r;
    const z = t.z + Math.sin(a) * r;
    // (from the crown's underside: seen as soon as it lets go)
    const y = t.low - 0.3 + rnd() * 0.9;
    const speed = 0.45 + 0.35 * rnd();
    const guess = Math.max(1, (y - landAt(x, z)) / speed);
    const lx = x - BREEZE * guess + (rnd() - 0.5) * 1.4;
    const lz = z + (rnd() - 0.5) * 1.4;
    const ly = landAt(lx, lz);
    if (ly > y - 0.5) continue;
    p.add([x, y, z], [lx, ly, lz], (y - ly) / speed, 4 + 5 * rnd(), tones[Math.floor(rnd() * tones.length)], [rnd(), rnd(), rnd(), rnd()]);
  }
}

/** Every flyer: butterflies and dragonflies (day), moths and bats (night). */
function flyers(field: HeightField, stream: readonly RiverSample[], input: LifeInput, n: (typeof COUNTS)[MapQuality], rnd: () => number): Flyer[] {
  const out: Flyer[] = [];
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length) % list.length];
  const turn = (a: number, b: number) => (rnd() < 0.5 ? -1 : 1) * (a + b * rnd());

  // ── Butterflies: round the trees' lower crowns, over the beds by the square's edge, along the avenue ──
  const flowers: [number, number, number, number][] = [];
  for (const t of input.trees) flowers.push([t.x, t.ground + 1.2, t.z, t.r * 0.8]);
  for (let k = 0; k < 16; k++) {
    const a = rnd() * Math.PI * 2;
    const e = 1.06 + rnd() * 0.2;
    const x = SQUARE.x + Math.cos(a) * SQUARE.rx * e;
    const z = SQUARE.z + Math.sin(a) * SQUARE.rz * e;
    flowers.push([x, field.heightAt(x, z) + 0.8, z, 1.4]);
  }
  for (const sd of [-1, 1])
    for (const z of [AVENUE.z0 + 8, AVENUE.z0 + 20, AVENUE.z0 + 30]) {
      const x = AVENUE.x + sd * (5 + rnd() * 4);
      flowers.push([x, field.heightAt(x, z) + 0.8, z, 1.6]);
    }
  for (let i = 0; i < n.butterflies; i++) {
    const [x, y, z, r] = flowers[i % flowers.length];
    out.push({
      at: [x + (rnd() - 0.5) * 2, y + rnd() * 1.4, z + (rnd() - 0.5) * 2],
      night: 0,
      r: r * (0.6 + 0.6 * rnd()),
      w: turn(0.45, 0.4),
      bob: 0.45,
      uneven: 0.3,
      span: 0.17 + 0.08 * rnd(),
      chord: 0.78,
      rate: 2.6 + 1.2 * rnd(),
      beat: 1.15,
      jitter: 0.07,
      color: pick(BUTTERFLY),
      glow: 0,
    });
  }

  // ── Dragonflies: over the stream and its pool, hovering and darting ──
  const water: [number, number, number][] = stream.map((s) => [s.x, s.level, s.z]);
  water.push([445, field.waterAt(445, -302) ?? 7, -302]);
  for (let i = 0; i < n.dragonflies && water.length; i++) {
    const [x, y, z] = water[Math.floor(((i + rnd()) / n.dragonflies) * water.length) % water.length];
    out.push({
      at: [x + (rnd() - 0.5) * 2, y + 0.5 + rnd() * 0.8, z + (rnd() - 0.5) * 2],
      night: 0,
      r: 1.4 + 1.6 * rnd(),
      w: turn(0.7, 0.4),
      bob: 0.2,
      uneven: 0.86,
      span: 0.18 + 0.05 * rnd(),
      chord: 0.22,
      rate: 24 + 6 * rnd(),
      beat: 0.35,
      jitter: 0.03,
      color: pick(DRAGONFLY),
      glow: 0,
    });
  }

  // ── Moths: round the gate's lamps, the stage's, the avenue's, the lantern walk's near the gate, some edge bulbs ──
  const lamps: [number, number, number][] = [];
  for (const dz of [3.9, -3.9]) for (const dx of [-3.6, 3.6]) lamps.push([GATE.x + dx, field.heightAt(GATE.x + dx, GATE.z + dz) + 2.19, GATE.z + dz]);
  for (const x of [STAGE.x0 + 0.55, STAGE.x1 - 0.55]) for (const z of [STAGE.front - 0.55, STAGE.back + 0.55]) lamps.push([x, GROUND + STAGE.h + 1.98, z]);
  for (const [x, z] of input.avenue) lamps.push([x, field.heightAt(x, z) + 2.14, z]);
  for (const [x, z] of input.walk) if (Math.hypot(x - GATE.x, z - GATE.z) < 70) lamps.push([x, field.heightAt(x, z) + 1.99, z]);
  const every = n.moths > 2 ? 5 : n.moths > 1 ? 8 : 0;
  if (every) for (const span of input.strings) for (const [i, t] of bulbsAlong(span).entries()) if (i % every === 2) lamps.push(hangAt(span, t));
  // (on the low level every other lamp)
  for (const [k, [x, y, z]] of lamps.entries()) {
    if (n.moths < 2 && k % 2) continue;
    for (let i = 0; i < n.moths; i++)
      out.push({
        at: [x, y + 0.1, z],
        night: 1,
        r: 0.3 + 0.45 * rnd(),
        w: turn(2.6, 2.4),
        bob: 0.22,
        uneven: 0.35,
        span: 0.15 + 0.06 * rnd(),
        chord: 0.55,
        rate: 11 + 4 * rnd(),
        beat: 1.0,
        jitter: 0.1,
        color: pick(MOTH),
        glow: 0.85,
      });
  }

  // ── Bats: across the sky over the square's north half and the stage, and flying foxes round the stage's prasat (its front: behind it is Kulen's forest) ──
  const round = Math.max(1, Math.round(n.bats / 3));
  for (let i = 0; i < n.bats; i++) {
    const fox = i < round;
    const a = rnd() * Math.PI * 2;
    out.push({
      at: fox
        ? [BOARD.x + (rnd() - 0.5) * 6, GROUND + BOARD.top + 3 + rnd() * 7, BOARD.z + 7 + (rnd() - 0.5) * 3]
        : [SQUARE.x + (rnd() - 0.5) * 50, GROUND + 20 + rnd() * 16, SQUARE.z - 14 + (rnd() - 0.5) * 24],
      night: 1,
      r: fox ? 7 + 4 * rnd() : 2 + 2 * rnd(),
      w: fox ? turn(0.38, 0.2) : turn(1.4, 1),
      bob: fox ? 2.5 : 1.2,
      uneven: 0.25,
      pass: fox ? undefined : { dx: Math.cos(a), dz: Math.sin(a), len: 110 + 40 * rnd(), period: 14 + 8 * rnd() },
      span: fox ? 1.0 + 0.3 * rnd() : 0.8 + 0.3 * rnd(),
      chord: 0.42,
      rate: fox ? 2.2 + 0.6 * rnd() : 2.8 + 0.8 * rnd(),
      beat: 0.95,
      jitter: fox ? 0.6 : 0.35,
      color: BAT,
      glow: 0,
    });
  }
  return out;
}
