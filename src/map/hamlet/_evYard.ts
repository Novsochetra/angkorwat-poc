import { traceSource } from '../../feedback/sourceTrace';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { Frame } from '../landmarks/_prasatKit';
import { banana, BAMBOO, bougainvillea, DECK, gableEnd, gableRoof, hen, jar, Local, planks, POST, shadeTree, tone, WALLS, type Roof } from '../village/_kit';
import { GLOW } from '../village/_lights';
import { bambooClump, CONCRETE, EV_RIDGE, EV_ROOFS, frameGlow, gableTrim, hedge, kbach, khmerSpiritHouse, mango, papaya, STRAW, strawStack, vegBed, type EvEnv } from './_evKit';
import { signWord } from './_evSign';
import { EV_GRANARIES, EV_HERD_WAY, EV_KIOSK, EV_PEN, EV_PLAY, EV_PUMP, EV_SALA, EV_SPIRIT, EV_STRAW, EV_TAMARIND } from './_evSpots';

/**
 * The sugar-palm village round its houses: the two rice granaries on
 * their rat-guarded posts, the cattle pen (a rail fence, a thatched
 * shelter, a log trough, hay), the public hand pump on its concrete apron
 * with a basin and buckets, the sala (an open rest pavilion by the street,
 * a water jar for passers-by), the village's spirit house on its post and
 * the old tamarind at the corner of the Kulen trail with the neak ta's
 * shrine at its foot (statues, bay sei, incense), the little shop by the
 * street (drinks, snacks, petrol in glass bottles, its signs in Khmer, a
 * tube light at night), rice straw stacks, and
 * the gardens: sugar palms (the village's name), coconut palms, mango and
 * papaya trees, banana plants, bamboo clumps, kitchen beds, flowering
 * hedges. Everything marks its ground (`field.occupy`) so the forest keeps
 * off the village.
 */
export function evYard(env: EvEnv): void {
  const src = traceSource();
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, 1777);
  const g = (x: number, z: number) => env.field.heightAt(x, z);
  const occ = (x: number, z: number, r: number) => env.field.occupy(x - r, z - r, x + r, z + r);

  for (const gr of EV_GRANARIES) granary(env, gr);
  pen(env);
  pump(env);
  sala(env);
  shrine(env);
  kiosk(env);
  for (const [x, z, s] of EV_STRAW) {
    strawStack(L, x, g(x, z), z, s);
    occ(x, z, 2);
  }

  // ── Trees and gardens ─────────────────────────────────────────────────────
  // Sugar palms (the village's name): at the street's west end, the village's gate; along the lanes, in the fields round it.
  const sugar: [number, number, number][] = [
    [360.5, -77, 13],
    [362.5, -64, 15],
    [357.5, -66.5, 11.5],
    [386.5, -100, 14],
    [404.5, -87, 16],
    [439.2, -93, 12.5],
    [402, -33, 13.5],
    [365, -29.5, 15.5],
    [433, -29, 12],
    [458.5, -38, 14],
    [471, -56, 12.5],
    [472.5, -88, 15],
    [414.5, -92, 12],
    // (over the stream: round the two houses and the meadow)
    [466, -56.5, 13],
    [476.5, -74.5, 14.5],
    [471.5, -44, 12],
  ];
  sugar.forEach(([x, z, h], i) => {
    env.palms.add({ kind: 'sugar', x, y: g(x, z), z, h, seed: 7100 + i });
    occ(x, z, 1.5);
  });
  // Coconut palms by the houses, leaning out over the yards.
  const coconut: [number, number, number, number, number][] = [
    [430.5, -91, 9, 1.2, -1.6],
    [412, -44, 8.5, -1.3, 1.1],
    [457.5, -71.5, 9.5, -1.8, 0.4],
    [372.5, -43.5, 8, 1.4, 0.8],
    [361, -91, 9, -1.4, -1.1],
  ];
  coconut.forEach(([x, z, h, lx, lz], i) => {
    env.palms.add({ kind: 'coconut', x, y: g(x, z), z, h, seed: 7200 + i, lean: [lx, lz] });
    occ(x, z, 1.5);
  });
  // Mango trees round the yards and at the village's edges: their dark crowns over the roofs from above. (None in the
  // palm lane's view from the street down to the palm sugar yard, west of the lane: _palmSugar.ts keeps it clear.)
  for (const [x, z, r, seed] of [
    [431, -84.5, 3, 1],
    [366.5, -35.5, 3.2, 2],
    [418.5, -33.5, 2.8, 3],
    [403.5, -98, 3, 4],
    [358.5, -86, 2.8, 5],
    [405, -28, 2.9, 6],
    [425, -96, 3.2, 7],
    [366.5, -101, 2.7, 8],
    [474.5, -67.5, 3, 9],
    [475.5, -51.5, 2.8, 10],
  ]) {
    mango(L, x, g(x, z), z, r, seed);
    occ(x, z, r + 0.5);
  }
  for (const [x, z] of [
    [404.8, -45.5],
    [425.5, -41.2],
    [428.8, -39.5],
    [372.5, -89.8],
    [391.5, -46.2],
    [466.5, -39],
  ]) {
    papaya(L, x, g(x, z), z, 3.1 + ((x * 7) % 1) * 0.8);
    occ(x, z, 1);
  }
  // Banana plants in clumps behind the houses and by the sala.
  const bananas: [number, number][] = [
    [414, -39],
    [416.5, -37],
    [413.5, -35.5],
    [420.5, -38.5],
    [401, -79.5],
    [403.5, -82],
    [400.5, -84.5],
    [360, -57],
    [358.5, -54],
    [446.8, -93],
    [455.5, -54],
    [468.5, -69.5],
  ];
  for (const [x, z] of bananas) {
    banana(L, x, g(x, z), z);
    occ(x, z, 1.2);
  }
  for (const [x, z, seed] of [
    [439.3, -41, 51],
    [439.8, -86.5, 52],
    [456.5, -49.5, 53],
  ]) {
    bambooClump(L, x, g(x, z), z, seed);
    occ(x, z, 2.5);
  }
  // Kitchen beds (morning glory, herbs, lemongrass) behind the south houses and by the east house.
  for (const [x0, z0, x1, z1] of [
    [422.5, -38, 431.5, -34.5],
    [402.5, -41.5, 409.5, -38.5],
    [369.5, -28.5, 374.5, -25],
    [460.5, -36.5, 465.5, -33.5],
  ]) {
    vegBed(L, x0, z0, x1, z1, g((x0 + x1) / 2, (z0 + z1) / 2));
    env.field.occupy(x0 - 0.5, z0 - 0.5, x1 + 0.5, z1 + 0.5);
  }
  // Flowering hedges: along the sala's back, by the shop, round the pump.
  hedge(L, EV_SALA.x - 2.6, EV_SALA.z - 2.3, EV_SALA.x + 2.6, EV_SALA.z - 2.3, g(EV_SALA.x, EV_SALA.z - 2.3));
  hedge(L, EV_KIOSK.x + 1.8, EV_KIOSK.z + 1.4, EV_KIOSK.x + 1.8, EV_KIOSK.z - 1.2, g(EV_KIOSK.x + 1.8, EV_KIOSK.z));
  for (const [x, z, seed] of [
    [398.7, -60.4, 61],
    [364.5, -61, 62],
    [459.2, -64.5, 63],
  ]) {
    bougainvillea(L, x, g(x, z), z, seed);
    occ(x, z, 1);
  }
  // Hens scratching in the yards and on the lane.
  for (let k = 0; k < 5; k++) hen(L, 387 + k * 0.9, g(387, -83), -83.5 + L.r(k, 1) * 1.6, k === 1, k % 2 === 0);
  for (let k = 0; k < 4; k++) hen(L, 374 + k * 0.8, g(374, -49), -49 + L.r(k, 2) * 1.4, false, k % 2 === 1);

  // The ways people and cattle walk (kept clear of trees): the lane up to the pen, the play yard, the path to the washing steps.
  for (let i = 0; i < EV_HERD_WAY.length - 1; i++) {
    const [ax, az] = EV_HERD_WAY[i];
    const [bx, bz] = EV_HERD_WAY[i + 1];
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 2);
    for (let k = 0; k <= n; k++) occ(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n, 1.8);
  }
  occ(EV_PLAY.x, EV_PLAY.z, EV_PLAY.r + 1);
  env.world.append(lb);
}

/** A rice granary: a small plank barn on six posts with rat guards, a steep roof, a little door up high, a bamboo ladder to it. */
function granary(env: EvEnv, gr: (typeof EV_GRANARIES)[number]): void {
  const src = traceSource();
  const fr = new Frame(gr.x, 0, gr.z, gr.facing);
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, gr.seed * 53);
  const ground = (x: number, z: number) => env.field.heightAt(fr.wx(x, z), fr.wz(x, z));
  const g0 = ground(0, 0);
  const F = g0 + 1.2;
  const w = gr.w;
  const d = gr.d;
  const top = F + 2.0;
  for (const x of [-w / 2 + 0.15, 0, w / 2 - 0.15])
    for (const z of [-d / 2 + 0.15, d / 2 - 0.15]) {
      L.span(x - 0.13, ground(x, z) - 0.2, z - 0.13, x + 0.13, F - 0.2, z + 0.13, tone(POST, L.r(x, z, 1)), 'mapBark');
      // (the rat guard: a flat collar near the top of the post)
      L.box(x, F - 0.45, z, 0.5, 0.05, 0.5, 0x8a8a84, 'mapStone');
    }
  L.span(-w / 2 - 0.1, F - 0.2, -d / 2 - 0.1, w / 2 + 0.1, F, d / 2 + 0.1, tone(DECK, 0.3), 'mapBark');
  const wall = WALLS.wood;
  planks(L, 'x', d / 2 - 0.08, 0.16, -w / 2, w / 2, F, top, [{ a0: -0.4, a1: 0.4, y0: F + 0.5, y1: F + 1.6 }], wall);
  planks(L, 'x', -d / 2 + 0.08, 0.16, -w / 2, w / 2, F, top, [], wall);
  for (const s of [-1, 1]) planks(L, 'z', s * (w / 2 - 0.08), 0.16, -d / 2 + 0.16, d / 2 - 0.16, F, top, [], wall);
  // The door (shut), a ladder of bamboo up to it.
  L.span(-0.4, F + 0.5, d / 2 - 0.02, 0.4, F + 1.6, d / 2 + 0.06, 0x5a4232, 'mapBark');
  for (const s of [-1, 1]) L.span(s * 0.3 - 0.04, g0, d / 2 + 0.75, s * 0.3 + 0.04, F + 0.55, d / 2 + 0.83, tone(BAMBOO, L.r(s, 2)), 'mapBark');
  for (let y = g0 + 0.35; y < F + 0.4; y += 0.38) L.span(-0.3, y - 0.03, d / 2 + 0.74, 0.3, y + 0.03, d / 2 + 0.84, tone(BAMBOO, L.r(y, 3)), 'mapBark');
  const run = 0.4;
  const rise = gr.roof === 'thatch' ? 0.5 : 0.36;
  const r: Roof = { x0: -w / 2 - 0.35, x1: w / 2 + 0.35, z0: -d / 2 - run, z1: d / 2 + run, eave: top - rise, run, rise };
  for (const s of [-1, 1]) gableEnd(L, r, s * (w / 2 - 0.08), 0.16, -d / 2, d / 2, top, wall);
  gableRoof(L, r, EV_ROOFS[gr.roof], EV_RIDGE[gr.roof], gr.roof === 'thatch' ? 'mapBark' : 'mapStone', 1.2);
  fr.place(lb, env.world);
  for (const s of [-1, 1]) gableTrim(env, fr, src, r, s * (r.x1 + 0.04), gr.roof === 'thatch' ? 0x5a4232 : 0x7a6a5a);
  env.field.occupy(gr.x - 3, gr.z - 3, gr.x + 3, gr.z + 3);
}

/** The cattle pen: a rail fence on posts, the gate open on its south side, a thatched shelter at the back, a log trough, a hay rack. */
function pen(env: EvEnv): void {
  const src = traceSource();
  const P = EV_PEN;
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, 1901);
  const g = (x: number, z: number) => env.field.heightAt(x, z);
  const x0 = P.x - P.w / 2;
  const x1 = P.x + P.w / 2;
  const z0 = P.z - P.d / 2;
  const z1 = P.z + P.d / 2;
  const rails = (ax: number, az: number, bx: number, bz: number, gaps: [number, number][] = []) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 1.75));
    const ry = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i <= n; i++) {
      const s = (len * i) / n;
      if (gaps.some(([p, q]) => s > p - 0.05 && s < q + 0.05)) continue;
      const x = ax + ((bx - ax) * s) / len;
      const z = az + ((bz - az) * s) / len;
      L.box(x, g(x, z) + 0.6, z, 0.16, 1.4, 0.16, tone(POST, L.r(x, z, 1)), 'mapBark');
    }
    const segs: [number, number][] = [];
    let a = 0;
    for (const [p, q] of gaps) {
      segs.push([a, p]);
      a = q;
    }
    segs.push([a, len]);
    for (const [p, q] of segs) {
      if (q - p < 0.3) continue;
      const m = (p + q) / 2;
      const x = ax + ((bx - ax) * m) / len;
      const z = az + ((bz - az) * m) / len;
      for (const hy of [0.45, 0.85, 1.2]) lb.box(x, g(x, z) + hy, z, 0.07, 0.1, q - p, tone([0x8a6a48, 0x7a5a3a, 0x9a7a54], L.r(hy * 3, m, 2)), 'mapBark', { src, ry });
    }
  };
  const gateAt = P.gate.x - x0;
  rails(x0, z1, x1, z1, [[gateAt - 0.95, gateAt + 0.95]]);
  rails(x1, z1, x1, z0);
  rails(x1, z0, x0, z0);
  rails(x0, z0, x0, z1);
  // The gate, swung open against the fence.
  for (const hy of [0.45, 0.85, 1.2]) L.span(P.gate.x - 0.95, g(P.gate.x, z1) + hy - 0.05, z1 + 0.1, P.gate.x - 0.9, g(P.gate.x, z1) + hy + 0.05, z1 + 1.9, 0x9a7a54, 'mapBark');
  // The shelter over the back: four posts, a thatched lean-to.
  const sb = z0 + 0.1;
  const sf = z0 + 2.2;
  for (const x of [x0 + 0.2, x1 - 0.2]) {
    L.span(x - 0.1, g(x, sb) - 0.2, sb - 0.1, x + 0.1, g(x, sb) + 2.3, sb + 0.1, tone(POST, 0.2), 'mapBark');
    L.span(x - 0.1, g(x, sf) - 0.2, sf - 0.1, x + 0.1, g(x, sf) + 2.6, sf + 0.1, tone(POST, 0.6), 'mapBark');
  }
  const gy = g(P.x, P.z);
  for (let i = 0; i < 3; i++) {
    const za = sf + 0.4 - i * 0.9;
    const y = gy + 2.62 - i * 0.18;
    for (let x = x0 - 0.3, j = 0; x < x1 + 0.25; x += 1.4, j++) L.span(x, y - 0.12, za - 0.9, Math.min(x1 + 0.3, x + 1.4), y + 0.12, za, tone(EV_ROOFS.thatch, L.r(i, j, 3)), 'mapBark');
  }
  // A trough cut from a log, water in it; a hay rack against the back fence; straw on the floor.
  L.span(P.x - 1.2, gy, P.z + 0.6, P.x + 1.2, gy + 0.45, P.z + 1.15, 0x6a4a30, 'mapBark');
  L.span(P.x - 1.05, gy + 0.3, P.z + 0.7, P.x + 1.05, gy + 0.4, P.z + 1.05, 0x3a5a6a, 'petal');
  L.span(x0 + 0.8, gy + 0.6, z0 + 0.3, x1 - 0.8, gy + 1.3, z0 + 0.8, tone(STRAW, 0.2), 'mapLeaf');
  for (let k = 0; k < 5; k++) {
    const x = x0 + 0.8 + L.r(k, 4) * (P.w - 1.6);
    const z = z0 + 1 + L.r(k, 5) * (P.d - 2);
    L.box(x, gy + 0.03, z, 0.8 + L.r(k, 6) * 0.6, 0.06, 0.6 + L.r(k, 7) * 0.5, tone(STRAW, L.r(k, 8)), 'mapLeaf', 0.85);
  }
  env.world.append(lb);
  env.field.occupy(x0 - 1, z0 - 1, x1 + 1, z1 + 2);
}

/** The public hand pump by the street: a concrete apron, the iron pump and its handle, a basin, buckets, a jar. */
function pump(env: EvEnv): void {
  const src = traceSource();
  const P = EV_PUMP;
  const fr = new Frame(P.x, 0, P.z, P.facing);
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, 1931);
  const g = env.field.heightAt(P.x, P.z);
  L.span(-1.1, g - 0.1, -1.1, 1.1, g + 0.12, 1.1, tone(CONCRETE, 0.6), 'mapStone', 0.92);
  L.span(-1.1, g + 0.12, -1.1, 1.1, g + 0.2, -0.95, tone(CONCRETE, 0.2), 'mapStone');
  const iron = 0x2f5a6a;
  L.box(-0.3, g + 0.65, -0.4, 0.16, 1.0, 0.16, iron, 'mapStone');
  L.box(-0.3, g + 1.2, -0.4, 0.26, 0.3, 0.26, iron, 'mapStone', 1.05);
  L.box(-0.3, g + 1.0, -0.22, 0.08, 0.08, 0.28, iron, 'mapStone');
  // The basin under the spout, water in it.
  L.span(-0.9, g + 0.12, 0.05, 0.4, g + 0.5, 0.8, tone(CONCRETE, 0.3), 'mapStone');
  L.span(-0.8, g + 0.42, 0.15, 0.3, g + 0.47, 0.7, 0x4a7a8a, 'petal');
  // Buckets (blue and red plastic), a jar.
  L.box(0.75, g + 0.34, -0.5, 0.36, 0.44, 0.36, 0x2a6ac8, 'petal');
  L.box(0.8, g + 0.34, 0.35, 0.34, 0.42, 0.34, 0xc83a2a, 'petal');
  jar(L, 1.6, g, -0.2, 0.9);
  // The handle, raised behind the head.
  L.box(-0.3, g + 1.4, -0.72, 0.07, 0.07, 0.8, iron, 'mapStone');
  fr.place(lb, env.world);
  env.field.occupy(P.x - 2, P.z - 2, P.x + 2.5, P.z + 2);
}

/**
 * The sala: an open pavilion by the street on six red posts, its plank
 * floor raised a step for sitting, a back rail, a tiled roof with plain
 * white barge boards and a kbach leaf in each gable, a water jar with a cup
 * for passers-by (as Khmer villages keep for whoever walks by).
 */
function sala(env: EvEnv): void {
  const src = traceSource();
  const S = EV_SALA;
  const fr = new Frame(S.x, 0, S.z, S.facing);
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, 1951);
  const ground = (x: number, z: number) => env.field.heightAt(fr.wx(x, z), fr.wz(x, z));
  const g0 = ground(0, 0);
  const F = g0 + 0.6;
  const w = S.w;
  const d = S.d;
  // The floor on its low stone base, a step in front.
  L.span(-w / 2, g0 - 0.3, -d / 2, w / 2, F - 0.12, d / 2, tone([0x9a948a, 0x8e887e], 0.4), 'mapStone');
  for (let x = -w / 2, i = 0; x < w / 2 - 0.05; x += 0.5, i++) L.span(x, F - 0.12, -d / 2, Math.min(w / 2, x + 0.5), F, d / 2, tone(DECK, L.r(i, 1)), 'mapBark', 0.95 + L.r(i, 2) * 0.08);
  L.span(-1, g0 - 0.2, d / 2, 1, g0 + 0.3, d / 2 + 0.45, tone([0x9a948a, 0x8e887e], 0.7), 'mapStone');
  // Posts, the back rail.
  const red = [0x9a3a2a, 0x8a3226];
  for (const x of [-w / 2 + 0.15, 0, w / 2 - 0.15])
    for (const z of [-d / 2 + 0.15, d / 2 - 0.15]) L.span(x - 0.12, F, z - 0.12, x + 0.12, F + 2.7, z + 0.12, tone(red, L.r(x, z, 3)), 'mapBark');
  L.span(-w / 2 + 0.15, F + 0.55, -d / 2 + 0.05, w / 2 - 0.15, F + 0.65, -d / 2 + 0.2, tone(red, 0.2), 'mapBark');
  for (const s of [-1, 1]) L.span(s * (w / 2 - 0.2), F + 0.55, -d / 2 + 0.2, s * (w / 2 - 0.1), F + 0.65, d / 2 - 0.3, tone(red, 0.7), 'mapBark');
  // The water jar for passers-by on its stand, a cup on the lid.
  L.span(w / 2 - 0.9, F, d / 2 - 0.85, w / 2 - 0.2, F + 0.35, d / 2 - 0.2, 0x6a5038, 'mapBark');
  jar(L, w / 2 - 0.55, F + 0.35, d / 2 - 0.52, 0.85);
  L.box(w / 2 - 0.55, F + 1.15, d / 2 - 0.52, 0.12, 0.12, 0.12, 0xe8e4dc, 'petal');
  // A mat and a kettle on the floor.
  L.span(-w / 2 + 0.4, F, -0.6, -w / 2 + 1.8, F + 0.03, 0.8, 0xb8423a, 'petal');
  L.box(-w / 2 + 1.2, F + 0.12, 0.2, 0.22, 0.2, 0.22, 0x5a4a3a, 'mapStone');
  const run = 0.45;
  const rise = 0.45;
  const top = F + 2.7;
  const r: Roof = { x0: -w / 2 - 0.5, x1: w / 2 + 0.5, z0: -d / 2 - run - 0.1, z1: d / 2 + run + 0.1, eave: top - rise + 0.2, run, rise };
  gableRoof(L, r, EV_ROOFS.tile, EV_RIDGE.tile, 'mapStone', 1.2);
  for (const s of [-1, 1]) {
    gableEnd(L, r, s * (w / 2 + 0.3), 0.12, -d / 2 - 0.4, d / 2 + 0.4, top + 0.2, [0xe8e0cc, 0xdcd4c0]);
    kbach(L, s * (w / 2 + 0.36), top + 0.2 + (r.rise * Math.ceil((r.z1 - r.z0) / 2 / r.run)) * 0.42, 0, 0.6, s, 0xa44a2c);
  }
  fr.place(lb, env.world);
  for (const s of [-1, 1]) gableTrim(env, fr, src, r, s * (r.x1 + 0.04), 0xeee6d2);
  env.field.occupy(S.x - w / 2 - 1.5, S.z - d / 2 - 1.5, S.x + w / 2 + 1.5, S.z + d / 2 + 1.5);
}

/** The village's spirit house by the corner (a little Angkor tower on its post), the old tamarind, and the neak ta's humble shrine at its foot. */
function shrine(env: EvEnv): void {
  const src = traceSource();
  const g = (x: number, z: number) => env.field.heightAt(x, z);
  const S = EV_SPIRIT;
  const fr = new Frame(S.x, 0, S.z, S.facing);
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, 1971);
  const glow = frameGlow(env, fr, 71);
  // The village's own, a little Angkor tower on its post, on a whitewashed footing; a pot of incense at its foot.
  const g0 = g(S.x, S.z);
  L.box(0, g0 + 0.1, 0, 0.9, 0.2, 0.9, tone(CONCRETE, 0.3), 'mapStone');
  const [fx, fy, fz] = khmerSpiritHouse(L, 0, g0 + 0.2, 0);
  glow(fx, fy + 0.05, fz, 0.06, 0.1, 0.06, 0xffb050, 0.9);
  L.box(0.3, g0 + 0.32, 0.3, 0.18, 0.24, 0.18, 0x8a5a3a, 'mapStone');
  fr.place(lb, env.world);
  env.field.occupy(S.x - 1, S.z - 1, S.x + 1, S.z + 1);
  // The tamarind, and the neak ta's shrine at its foot.
  const T = EV_TAMARIND;
  const tb = new VoxelBuilder();
  const Lt = new Local(tb, src, 1973);
  shadeTree(Lt, T.x, g(T.x, T.z), T.z, 1973);
  env.world.append(tb);
  neakTa(env, T.x - 1.6, T.z + 1.5, 0.35);
  env.field.occupy(T.x - 3, T.z - 3, T.x + 3, T.z + 3);
}

/**
 * The neak ta's shrine (អ្នកតា, the guardian spirit of the village) at the
 * foot of the old tree: a humble wooden shrine on short legs, open in front,
 * a small tin roof; the neak ta's little statues inside on a red cloth; bay
 * sei (banana-leaf offering cones) and a pot of incense before them, a
 * candle that glows at night; a mat on the ground for whoever kneels.
 */
function neakTa(env: EvEnv, x: number, z: number, facing: number): void {
  const src = traceSource();
  const fr = new Frame(x, 0, z, facing);
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, 1975);
  const glow = frameGlow(env, fr, 75);
  const g = env.field.heightAt(x, z);
  const wood = [0x6a4a32, 0x5a4030, 0x7a5a3e];
  const F = g + 0.55;
  for (const sx of [-0.42, 0.42]) for (const sz of [-0.3, 0.3]) L.box(sx, g + 0.27, sz, 0.08, 0.55, 0.08, tone(wood, L.r(sx, sz, 1)), 'mapBark');
  L.span(-0.5, F - 0.06, -0.38, 0.5, F, 0.38, tone(wood, 0.3), 'mapBark');
  // Three walls of old planks, open in front; a small tin roof.
  L.span(-0.5, F, -0.38, 0.5, F + 0.62, -0.32, tone(wood, 0.6), 'mapBark', 0.9);
  for (const sx of [-1, 1]) L.span(sx * 0.5 - 0.03, F, -0.32, sx * 0.5 + 0.03, F + 0.62, 0.3, tone(wood, 0.8), 'mapBark', 0.92);
  for (const sz of [-1, 1]) L.span(-0.62, F + 0.62 + (sz > 0 ? 0 : 0.14), sz > 0 ? 0 : -0.5, 0.62, F + 0.72 + (sz > 0 ? 0 : 0.14), sz > 0 ? 0.52 : 0, tone(EV_ROOFS.rust, L.r(sz, 2)), 'mapStone');
  // Inside: a red cloth, the neak ta's little statues (dark stone, one gilt), flowers.
  L.span(-0.44, F, -0.3, 0.44, F + 0.03, 0.24, 0xb8322c, 'petal');
  for (const [sx, h, c] of [
    [-0.22, 0.24, 0x3a3632],
    [0.02, 0.3, 0xc8a040],
    [0.24, 0.2, 0x4a4540],
  ]) {
    L.box(sx, F + 0.03 + h / 2, -0.12, 0.12, h, 0.1, c, 'mapStone');
    L.box(sx, F + 0.03 + h + 0.04, -0.12, 0.08, 0.08, 0.08, c, 'mapStone', 1.05);
  }
  L.box(-0.35, F + 0.08, 0.12, 0.08, 0.1, 0.08, 0xf2a020, 'petal');
  L.box(0.36, F + 0.08, 0.12, 0.08, 0.1, 0.08, 0xe84a6a, 'petal');
  // Before it, on the ground: two bay sei (banana-leaf cones, a flower on top), a pot of incense, a candle; a mat.
  for (const sx of [-0.45, 0.45]) {
    L.box(sx, g + 0.08, 0.75, 0.3, 0.16, 0.3, 0x4a8a34, 'petal');
    L.box(sx, g + 0.22, 0.75, 0.22, 0.14, 0.22, 0x5a9a3c, 'petal');
    L.box(sx, g + 0.34, 0.75, 0.13, 0.12, 0.13, 0x68a844, 'petal');
    L.box(sx, g + 0.44, 0.75, 0.07, 0.08, 0.07, 0xf4f0e0, 'petal');
  }
  L.box(0, g + 0.1, 0.72, 0.2, 0.2, 0.2, 0x8a5a3a, 'mapStone');
  for (const d of [-0.04, 0, 0.04]) L.box(d, g + 0.34, 0.72, 0.02, 0.3, 0.02, 0xb83a2a, 'petal');
  glow(0, g + 0.5, 0.72, 0.03, 0.03, 0.03, 0xff8a3a);
  L.box(0.18, g + 0.08, 0.95, 0.06, 0.16, 0.06, 0xf4f0e0, 'petal');
  glow(0.18, g + 0.2, 0.95, 0.05, 0.08, 0.05, 0xffb050, 0.6);
  L.span(-0.6, g, 1.1, 0.6, g + 0.03, 2.0, 0xb8423a, 'petal');
  fr.place(lb, env.world);
}

/** The little shop by the street: a counter under a tin lean-to, shelves of goods, petrol in glass bottles on a stand, a cooler, stools, a tube light. */
function kiosk(env: EvEnv): void {
  const src = traceSource();
  const K = EV_KIOSK;
  const fr = new Frame(K.x, 0, K.z, K.facing);
  const lb = new VoxelBuilder();
  const L = new Local(lb, src, 1991);
  const glow = frameGlow(env, fr, 91);
  const g = env.field.heightAt(K.x, K.z);
  const w = 2.6;
  const d = 1.8;
  // Posts, the tin lean-to (high over the counter, down at the back).
  for (const [x, z, h] of [
    [-w / 2, d / 2, 2.6],
    [w / 2, d / 2, 2.6],
    [-w / 2, -d / 2, 2.3],
    [w / 2, -d / 2, 2.3],
  ])
    L.span(x - 0.08, g - 0.2, z - 0.08, x + 0.08, g + h, z + 0.08, tone(POST, 0.4), 'mapBark');
  for (let i = 0; i < 3; i++) {
    const za = d / 2 + 0.6 - i * 1.0;
    L.span(-w / 2 - 0.3, g + 2.62 - i * 0.14, za - 1.0, w / 2 + 0.3, g + 2.72 - i * 0.14, za, tone(EV_ROOFS.rust, L.r(i, 1)), 'mapStone');
  }
  // The counter at the front, shelves of bright packets behind, strips of snacks hung up.
  L.span(-w / 2 + 0.1, g, d / 2 - 0.5, w / 2 - 0.1, g + 1.0, d / 2 - 0.1, 0x3a6a9a, 'mapBark');
  L.span(-w / 2, g + 1.0, d / 2 - 0.55, w / 2, g + 1.06, d / 2, 0xe8e2d4, 'mapBark');
  L.span(-w / 2 + 0.1, g, -d / 2 + 0.05, w / 2 - 0.1, g + 1.9, -d / 2 + 0.2, 0x5a4232, 'mapBark');
  for (const sy of [g + 0.7, g + 1.25]) {
    L.span(-w / 2 + 0.1, sy - 0.04, -d / 2 + 0.2, w / 2 - 0.1, sy, -d / 2 + 0.55, 0x7a5a40, 'mapBark');
    for (let x = -w / 2 + 0.3, i = 0; x < w / 2 - 0.2; x += 0.3, i++) L.box(x, sy + 0.12, -d / 2 + 0.38, 0.22, 0.22, 0.2, tone([0xd83a2a, 0x2a7ad8, 0xf0c030, 0x3aa84a, 0xf07a2a, 0xe8e0d0], L.r(i, sy, 2)), 'petal');
  }
  for (let i = 0; i < 4; i++) L.box(-w / 2 + 0.5 + i * 0.35, g + 1.85, d / 2 - 0.05, 0.2, 0.6, 0.04, tone([0xe83a2a, 0xf0c030, 0x2a8ad8], L.r(i, 3)), 'petal');
  // Petrol in glass bottles on a little stand by the road (yellow, and the pink two-stroke mix).
  L.span(w / 2 + 0.3, g, d / 2 - 0.2, w / 2 + 1.1, g + 0.7, d / 2 + 0.2, 0x7a5a3a, 'mapBark');
  for (let row = 0; row < 2; row++)
    for (let i = 0; i < 4; i++) L.box(w / 2 + 0.4 + i * 0.18, g + 0.85 + row * 0.02, d / 2 - 0.1 + row * 0.2, 0.1, 0.3, 0.1, row === 0 && i === 3 ? 0xe86a8a : 0xe8b830, 'petal');
  // A cooler, two plastic stools, a sign board.
  L.span(-w / 2 - 0.9, g, d / 2 - 0.3, -w / 2 - 0.2, g + 0.8, d / 2 + 0.3, 0x2a6ac8, 'mapStone');
  L.span(-w / 2 - 0.88, g + 0.8, d / 2 - 0.28, -w / 2 - 0.22, g + 0.88, d / 2 + 0.28, 0xe8eef2, 'mapStone');
  L.box(-0.6, g + 0.22, d / 2 + 0.9, 0.36, 0.44, 0.36, 0xc8302a, 'petal');
  L.box(0.5, g + 0.22, d / 2 + 1.0, 0.36, 0.44, 0.36, 0x2a6ac8, 'petal');
  // The shop's sign under the roof's edge, "ហាងលក់ទំនិញ" (a shop selling goods) in cream on red; "សាំង" (petrol) over the bottles.
  L.span(-w / 2 - 0.05, g + 1.98, d / 2 + 0.02, w / 2 + 0.05, g + 2.6, d / 2 + 0.1, 0xb8302a, 'mapStone');
  signWord(L, 'shop', 0, g + 2.29, d / 2 + 0.1, 2.2 / 113, 0xf4ecd8);
  L.span(w / 2 + 1.0, g, d / 2 + 0.12, w / 2 + 1.06, g + 1.4, d / 2 + 0.18, 0x5a4232, 'mapBark');
  L.span(w / 2 + 0.33, g + 1.18, d / 2 + 0.18, w / 2 + 1.07, g + 1.62, d / 2 + 0.22, 0xf0ece0, 'mapStone');
  signWord(L, 'petrol', w / 2 + 0.7, g + 1.4, d / 2 + 0.22, 0.62 / 36, 0xc8302a);
  glow(0, g + 2.52, d / 2 - 0.45, 1.2, 0.06, 0.06, GLOW.tube, 1.1);
  glow(0, g + 1.0, -d / 2 + 0.6, w - 0.6, 1.2, 0.05, GLOW.warm);
  fr.place(lb, env.world);
  env.field.occupy(K.x - 3, K.z - 2.5, K.x + 3, K.z + 2.5);
}

