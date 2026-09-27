import type { Object3D } from 'three';
import type { HeightField } from '../heightfield';
import { BACK_HAMLET, JUNGLE_SITES, LAKES, TRAILS } from '../layout';
import type { RoofKind, WallKind } from '../village/_spots';

/**
 * Where the pieces of the hamlet behind Angkor Wat stand (world metres),
 * worked out from the layout (`BACK_HAMLET`, the `Lotus pond`, the back
 * trail, the `hamlet lane`) and the land (`backSpots(field)`, read once,
 * the same for every reader): the hamlet part builds from it
 * (`_backHamlet.ts`), the people behind Angkor Wat live by it
 * (people/_sceneBack.ts).
 *
 * The hamlet sits on the 8 m rise north of the back trail: four stilt
 * houses round a dirt yard (their fronts, verandas and stairs facing it), a
 * rice granary, the cattle pen by the lane's end, the lotus pond west of it
 * (the children's plank jetty on its east bank, the buffalo wallow at its
 * muddy west end). Down by the trail, where the lane leaves it: the sala
 * (a rest pavilion) with the coconut and sugarcane juice cart under a
 * tamarind. South of the trail: the meadow where the cattle graze by day.
 *
 * A home's frame: `x, z` the middle of its floor, `facing` the way its front
 * looks (radians: toward (sin, cos) in x, z; its local +z), local +x across
 * (toward (cos, −sin)).
 */

export type P2 = readonly [number, number];
export type P3 = readonly [number, number, number];

/** Rise and run of a stair step (m), as the village's. */
export const STEP = 0.5;

/** One house round the yard. */
export interface BackHome {
  id: string;
  x: number;
  z: number;
  facing: number;
  /** Across, the rooms' depth, the veranda's depth in front (m). */
  w: number;
  d: number;
  v: number;
  /** Floor top over the ground at its middle (m): room to stand under it. */
  lift: number;
  roof: RoofKind;
  walls: WallKind;
  /** Local x of the front stair's middle (the veranda's railing opens there). */
  stair: number;
  /** What is in the shade under the floor. */
  under: 'hammock' | 'loom' | 'moto' | 'coop';
  /** The kitchen fire in the yard (local x, z), or null. */
  fire: P2 | null;
  /** A small deck at the back door (the children's house: over the pond side). */
  deck?: boolean;
  /** A little gabled porch roof on two posts over the head of the front stair (the Khmer phteah pet). */
  porch?: boolean;
  /** Its roof of old clay tiles (its tin's `roof` kind builds the shape; `_bhHouses.ts` lays tiles instead). */
  tile?: boolean;
  seed: number;
}

export const HOMES: readonly BackHome[] = [
  // The old family house on the north side of the yard (a phteah kantaing: the skirt of roof all round, old clay tiles), the grandfather's hammock under it.
  { id: 'north', x: 145, z: -360, facing: 0, w: 7.6, d: 4.6, v: 2.4, lift: 3.0, roof: 'rust', walls: 'wood', stair: -2.3, under: 'hammock', fire: [-5.1, 2.2], tile: true, seed: 3 },
  // A newer house, blue boards and new tin, the moto parked under it.
  { id: 'northeast', x: 163.5, z: -350.5, facing: -1.0, w: 6.6, d: 4.2, v: 2.2, lift: 2.6, roof: 'tin', walls: 'blue', stair: 1.9, under: 'moto', fire: null, seed: 7 },
  // The weaver's house (a phteah pet: the porch roof over its stair): her loom under the floor, facing the yard.
  { id: 'east', x: 166.5, z: -331.5, facing: -1.95, w: 7.0, d: 4.4, v: 2.3, lift: 3.0, roof: 'thatch', walls: 'wood', stair: -2.2, under: 'loom', fire: [3.1, 4.6], porch: true, seed: 11 },
  // The children's house by the pond (its back deck looks over the lotus).
  { id: 'west', x: 127, z: -345, facing: 1.4, w: 6.6, d: 4.2, v: 2.2, lift: 2.6, roof: 'thatch', walls: 'ochre', stair: 1.9, under: 'coop', fire: [-3.5, 4.3], deck: true, seed: 13 },
];

/** Local (x, z) of a home → map (x, z). */
export function homeToWorld(h: { x: number; z: number; facing: number }, lx: number, lz: number): [number, number] {
  const c = Math.cos(h.facing);
  const s = Math.sin(h.facing);
  return [h.x + lx * c + lz * s, h.z - lx * s + lz * c];
}

/** The front of a home: veranda's edge, the rooms' front wall, the stair's steps and where its foot is (local z). */
export function homeFront(h: BackHome): { zf: number; zw: number; zb: number; steps: number; footZ: number } {
  const zf = (h.d + h.v) / 2;
  const zb = -zf;
  const steps = Math.round(h.lift / STEP);
  return { zf, zw: zb + h.d, zb, steps, footZ: zf + (steps - 1) * STEP + 0.7 };
}

/** The stilts under a home (local x across, z front to back): a post at every (x, z). */
export function stiltGrid(h: { w: number; d: number; v: number }): { xs: number[]; zs: number[] } {
  const zf = (h.d + h.v) / 2;
  const nx = Math.max(2, Math.ceil(h.w / 2.4) + 1);
  const nz = Math.max(2, Math.ceil((2 * zf) / 2.4) + 1);
  const xs: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i < nx; i++) xs.push(-h.w / 2 + 0.2 + ((h.w - 0.4) * i) / (nx - 1));
  for (let j = 0; j < nz; j++) zs.push(-zf + 0.2 + ((2 * zf - 0.4) * j) / (nz - 1));
  return { xs, zs };
}

/** The hammock under the old house: its two ties (local x, z: two stilts near the front), and their height over the ground (m). */
export function hammockTies(h: BackHome): { a: P2; b: P2; up: number } {
  const { xs, zs } = stiltGrid(h);
  const m = Math.floor(xs.length / 2);
  return { a: [xs[m], zs[zs.length - 2]], b: [xs[m + 1], zs[zs.length - 1]], up: 1.55 };
}

/**
 * The weaver's loom under her house (local): she sits at `seat` facing the
 * front (+z), the warp runs away from her to the back beam at `back`; the
 * shuttle crosses from `x0` to `x1` at `z`, `y` over the ground.
 */
export function loomSpot(h: BackHome): { seat: P2; breast: number; back: number; x0: number; x1: number; z: number; y: number } {
  const { zs } = stiltGrid(h);
  const z0 = zs[zs.length - 2];
  return { seat: [0, z0 + 0.05], breast: z0 + 0.5, back: zs[zs.length - 1] - 0.15, x0: -0.5, x1: 0.5, z: z0 + 0.72, y: 0.8 };
}

/** The spirit house in front of the old house (its local x, z), facing the yard. */
export const SPIRIT: P2 = [3.7, 6.5];

/** The well and its wash place, between the old house and the children's. */
export const WELL: P2 = [136.6, -352.4];

/** The vegetable garden between the blue house and the weaver's (map rectangle). */
export const GARDEN = { x0: 166.2, z0: -345.2, x1: 171.6, z1: -338.6 };

/** The rice granary (a small store on posts) north-east of the old house. */
export const GRANARY = { x: 153.6, z: -365.2, facing: 0.3, w: 2.6, d: 2.4, lift: 1.3 };

/** The cattle pen by the lane's end (map rectangle), its gate on the east side (z from `gate[0]` to `gate[1]`). */
export const PEN = { x0: 120.5, z0: -337.8, x1: 132.2, z1: -330.0, gate: [-335.4, -333.0] as P2, shelter: 125.3 };

/** The sala by the back trail where the lane leaves it: its middle, the way its front looks (toward the trail). */
export const SALA = { x: 118, z: -317.3, facing: -0.54, w: 4.4, d: 3.0, lift: 0.55 };

/** A point in the sala's frame (local +z toward the trail, +x along it toward the lane). */
export function salaToWorld(lx: number, lz: number): [number, number] {
  return homeToWorld(SALA, lx, lz);
}

/** The juice cart (sala frame), the seller's stool behind it, two plastic stools and a low table in front. */
export const CART = { lx: 4.1, lz: 1.1, seat: [4.75, -0.85] as P2, stools: [[3.1, 2.7] as P2, [4.8, 2.9] as P2], table: [3.95, 2.55] as P2 };
/** The tamarind shading the sala and the cart, and the spirit shrine of the place (neak ta) at its foot (sala frame). */
export const TAMARIND: P2 = [2.4, -3.3];
export const NEAK_TA: P2 = [0.4, -2.6];

/** The meadow south of the trail where the cattle graze by day, and the herder's shade tree. */
export const MEADOW = {
  graze: [[146.5, -284.5], [152.5, -287.5], [157.5, -281.5], [143.5, -279.5]] as P2[],
  tree: [139.2, -283.6] as P2,
  herder: [141.4, -284.8] as P2,
};

/** Where the monk's bicycle leans at his hut (the camps' `monk-hut`), and the ladder's foot. */
export const MONK_HUT = (() => {
  const s = JUNGLE_SITES.find((j) => j.id === 'monk-hut')!;
  const at = (lx: number, lz: number) => homeToWorld(s, lx, lz);
  return { site: s, foot: at(0, 2.8), bike: at(2.1, 2.3), bikeYaw: s.facing + Math.PI / 2 };
})();

/** The lotus pond (layout.ts `LAKES`). */
export const POND = LAKES.find((l) => l.name === 'Lotus pond') ?? { name: 'Lotus pond', x: 104, z: -352, rx: 12, rz: 8, level: 7 };

/** A point of the pond read from the land: the shore toward (dx, dz) from its middle (the last water, the first dry ground). */
export interface Shore {
  water: P2;
  dry: P2;
  /** Ground height at `dry` (m). */
  y: number;
}

export interface BackSpots {
  /** The yard's ground (m). */
  ground: number;
  /** Floor top of each home (m), in `HOMES` order. */
  floors: number[];
  pond: {
    level: number;
    /** The children's jetty: its land end, its end over the water, deck top, the way out (unit), width. */
    jetty: { root: P2; end: P2; y: number; dir: P2; w: number };
    /** The steps up out of the water by the jetty: in the water, on the bank (y: its ground). */
    steps: { water: P2; bank: P3 };
    /** Where the children swim (middle, radius). */
    swim: { x: number; z: number; r: number };
    /** The buffalo wallow at the muddy west end: in the water; their spots on the bank at night. */
    wallow: P2[];
    bank: P3[];
    /** The west shore point (the mud). */
    west: Shore;
    shore(dx: number, dz: number): Shore;
  };
  /** Routes (map x, z, in walking order). */
  routes: {
    /** The meadow to the pen (the cattle's way home; reversed in the morning). */
    herd: P2[];
    /** The monk's hut to the alms spot in the yard (he rides to the point before it and walks the last steps). */
    monk: P2[];
    /** The weaver's house (the villager with the basket) to the far end of the trail in the east. */
    bike: P2[];
    /** The jetty's root to the children's house. */
    kids: P2[];
    /** The children's house down the lane and east along the trail (the schoolchildren's bicycles). */
    school: P2[];
  };
  /** The trail's steps with a ramp of earth steps built on them (map x, z of the edge, the way up (unit), low and high ground). */
  ramps: { x: number; z: number; ux: number; uz: number; low: number; high: number }[];
}

let cached: { field: HeightField; spots: BackSpots } | null = null;

/** The spots, read from the land (once per height field). */
export function backSpots(field: HeightField): BackSpots {
  if (cached?.field === field) return cached.spots;
  const spots = makeSpots(field);
  cached = { field, spots };
  return spots;
}

/**
 * The built hamlet (its hamlet piece's object), set when it is built, for
 * the people's walk map (they stand on its verandas, the jetty, the sala):
 * the hamlet part is built before the people.
 */
export const BACK_BUILT: { object: Object3D | null } = { object: null };

function makeSpots(field: HeightField): BackSpots {
  const ground = field.heightAt(BACK_HAMLET.x, BACK_HAMLET.z);
  const floors = HOMES.map((h) => field.heightAt(h.x, h.z) + h.lift);
  const level = field.waterAt(POND.x, POND.z) ?? POND.level;
  /** March out from the pond's middle toward (dx, dz) to the shore. */
  const shore = (dx: number, dz: number): Shore => {
    const l = Math.hypot(dx, dz) || 1;
    const ux = dx / l;
    const uz = dz / l;
    let wx = POND.x;
    let wz = POND.z;
    for (let r = 0; r < 40; r += 0.25) {
      const x = POND.x + ux * r;
      const z = POND.z + uz * r;
      const w = field.waterAt(x, z);
      if (w === null || w <= field.heightAt(x, z)) return { water: [wx, wz], dry: [x, z], y: field.heightAt(x, z) };
      wx = x;
      wz = z;
    }
    return { water: [wx, wz], dry: [wx, wz], y: field.heightAt(wx, wz) };
  };
  // The jetty: out west from the east bank, over the water toward the middle.
  const east = shore(1, 0);
  const jy = east.y + 0.15;
  const jetty = { root: [east.dry[0] + 2.6, east.dry[1]] as P2, end: [east.water[0] - 5.2, east.water[1]] as P2, y: jy, dir: [-1, 0] as P2, w: 1.3 };
  // The steps out of the water: on the bank a little south of the jetty.
  const se = shore(0.95, 0.31);
  const steps = { water: [se.water[0] - 1.0, se.water[1]] as P2, bank: [se.dry[0] + 0.9, se.y, se.dry[1]] as P3 };
  const swim = { x: jetty.end[0] + 0.6, z: jetty.end[1] + 2.4, r: 2.6 };
  // The wallow: the shallows off the west shore; the buffalo's night spots on the mud above it.
  const west = shore(-1, 0);
  const wallow: P2[] = [
    [west.water[0] + 2.4, west.water[1] + 1.7],
    [west.water[0] + 3.4, west.water[1] - 2.3],
  ];
  const bank: P3[] = [
    [west.dry[0] - 2.2, field.heightAt(west.dry[0] - 2.2, west.dry[1] + 2.2), west.dry[1] + 2.2],
    [west.dry[0] - 2.8, field.heightAt(west.dry[0] - 2.8, west.dry[1] - 2.6), west.dry[1] - 2.6],
  ];

  // Routes along the back trail and the hamlet lane (their own points, from the layout).
  const trail = TRAILS.find((t) => t.name === 'back trail')?.points ?? [];
  const lane = TRAILS.find((t) => t.name === 'hamlet lane')?.points ?? [
    [128, -306],
    [136, -322],
    [146, -336],
  ];
  const junction = lane[0];
  // (the trail's points east of the hut and of the junction: [72,−332], [108,−318], [148,−294], [188,−268], [226,−244])
  const trailFrom = (x0: number, x1: number) => trail.filter(([x]) => x > x0 && x < x1) as P2[];
  const laneUp: P2[] = [lane[0], [lane[0][0] + (lane[1][0] - lane[0][0]) * 0.5, lane[0][1] + (lane[1][1] - lane[0][1]) * 0.5], lane[1], [140.6, -329.2]];
  const penOut: P2 = [PEN.x1 + 2.2, (PEN.gate[0] + PEN.gate[1]) / 2];
  const penIn: P2 = [PEN.x1 - 2.4, (PEN.gate[0] + PEN.gate[1]) / 2];
  const herd: P2[] = [[149.5, -285.5], [147.2, -292.4], ...trailFrom(110, 147.5).reverse(), junction, ...laneUp.slice(1), [136.4, -332.4], penOut, penIn];
  const alms: P2 = [145.4, -344.6];
  const monk: P2[] = [MONK_HUT.bike, [74.6, -332.6], ...trailFrom(72.5, 127), junction, ...laneUp.slice(1), [144.0, -335.0], [144.9, -339.8], alms];
  const east3 = HOMES[2];
  const f3 = homeFront(east3);
  const foot3 = homeToWorld(east3, east3.stair, f3.footZ + 0.9);
  const bike: P2[] = [foot3, [151.2, -336.8], [144.6, -334.2], [140.6, -329.2], lane[1], [lane[0][0] + (lane[1][0] - lane[0][0]) * 0.5, lane[0][1] + (lane[1][1] - lane[0][1]) * 0.5], junction, ...trailFrom(129, 230)];
  const west4 = HOMES[3];
  const f4 = homeFront(west4);
  const foot4 = homeToWorld(west4, west4.stair, f4.footZ + 0.6);
  const kids: P2[] = [jetty.root, [jetty.root[0] + 1.6, jetty.root[1] - 1.4], homeToWorld(west4, west4.w / 2 + 1.6, 0), homeToWorld(west4, west4.w / 2 + 1.4, f4.footZ), foot4];
  const school: P2[] = [foot4, [137.5, -342.5], [141, -336], [140.6, -329.2], lane[1], [lane[0][0] + (lane[1][0] - lane[0][0]) * 0.5, lane[0][1] + (lane[1][1] - lane[0][1]) * 0.5], junction, ...trailFrom(129, 230)];

  // Ramps: where the trail and the lane step a whole land block (2 m), earth steps up it (walkable by people and bicycles).
  const ramps: BackSpots['ramps'] = [];
  for (const t of field.trails) {
    if (t.name !== 'back trail' && t.name !== 'hamlet lane') continue;
    const s = t.samples;
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1];
      const b = s[i];
      if (t.name === 'back trail' && (b.x < MONK_HUT.site.x - 4 || b.x > junction[0])) continue;
      if (Math.abs(b.y - a.y) < 1.5 || a.wet || b.wet) continue;
      const up = b.y > a.y;
      const [lo, hi] = up ? [a, b] : [b, a];
      // (the edge: where the land steps, between the two samples)
      let u0 = 0;
      let u1 = 1;
      for (let k = 0; k < 12; k++) {
        const m = (u0 + u1) / 2;
        const hm = field.heightAt(lo.x + (hi.x - lo.x) * m, lo.z + (hi.z - lo.z) * m);
        if (hm > lo.y + 0.5) u1 = m;
        else u0 = m;
      }
      const l = Math.hypot(hi.x - lo.x, hi.z - lo.z) || 1;
      ramps.push({ x: lo.x + (hi.x - lo.x) * u1, z: lo.z + (hi.z - lo.z) * u1, ux: (hi.x - lo.x) / l, uz: (hi.z - lo.z) / l, low: lo.y, high: hi.y });
    }
  }

  return {
    ground,
    floors,
    pond: { level, jetty, steps, swim, wallow, bank, west, shore },
    routes: { herd, monk, bike, kids, school },
    ramps,
  };
}

/** Where the monk stops in the yard for the alms, facing north (the women kneel before him), and their spots. */
export const ALMS = { monk: [145.4, -344.6] as P2, women: [[144.5, -346.9] as P2, [146.4, -347.1] as P2] };
