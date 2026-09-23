import { hash3 } from '../../voxel/random';
import { envelopeWear, ramp } from '../assets/19.2/_damage-b';
import { BlockSet } from '../BlockSet';
import { fromSheet } from '../palette';
import { placePiece, type PlaceTarget } from '../place';
import { rng } from '../shapes';
import { defineKitScene } from '../scene';
import { stoneSurf } from '../surface';
import { finishLook, heap, hollow, mossLedges, noise, paving, Ruin, soil, tufts, type Finish, type Look, type Rubble, type Tuft } from './_scenes192';

/**
 * §19.2 "Combination examples — multiple damage types combined for natural
 * variation": a long temple wall of 0.5 m sandstone courses on a stepped
 * plinth, bays framed by pilasters, two framed niches, and every kind of §19.2
 * damage along it — the corner of the buttress on the left broken off in
 * ledges, its end worn back, the top edges eroded and stepping down, face
 * stones missing and leaving dark holes, blocks split by stepped cracks, a
 * bay collapsed with its stones heaped at the foot, dark run-off streaks under
 * the coping and moss low down and on every ledge. The stones take the §19.1
 * finishes in patches: clean and warm in the sunlit middle, weathered and dark
 * on most of it, mossy towards the damp right end.
 */
const X0 = -9.5;
const X1 = 9.5;
/** Front and back faces of the wall, and the joint between its two skins. */
const FZ = -2.5;
const BZ = -3.5;
const SKIN = FZ - 0.5;
/** Heights: plinth top, top of the thin lower courses, wall top, coping top. */
const PLINTH = 0.75;
const BAND = 1.75;
const TOP = 4.25;
const COPE = 4.5;
/** How far each plinth step stands out in front of the wall (bottom step first). */
const STEPS = [1.05, 0.7, 0.35];

/** Pilasters: x ranges, standing 0.25 m proud. */
const PIERS: [number, number][] = [
  [-4.25, -3.5],
  [1.0, 1.75],
  [5.5, 6.25],
  [8.75, X1],
];
/** The buttress at the left end, 0.5 m proud. */
const BUTTRESS: [number, number] = [X0, -7.0];
/** Framed niches: opening x range and top; sills at BAND. */
const NICHES = [
  { x0: -2.25, x1: -0.75, top: 3.75 },
  { x0: 2.875, x1: 4.125, top: 3.75 },
];
/** Face stones missing, leaving dark holes: boxes [x0, y0, x1, y1] of the front skin. */
const MISSING = [
  [-6.7, 2.05, -5.3, 2.95],
  [-5.2, 3.3, -4.3, 3.7],
  [-6.9, 1.0, -6.1, 1.25],
  [4.5, 1.8, 5.45, 2.7],
];
/** The collapsed bay: its breach bottoms out at (x, y) and widens upwards. */
const BREACH = { x: 7.3, y: 1.5, x0: 5.6, x1: 9.4 };

/** Stones' finishes: patches of the §19.1 finishes, wear rising towards the ground, the ends and the damp right. */
function finishAt(x: number, y: number, z: number): Finish {
  const s =
    0.5 +
    0.32 * ramp(2.0, 0.6, y) -
    0.14 * ramp(3.4, 4.4, y) +
    0.22 * ramp(-6.5, -8.5, x) -
    0.16 * ramp(-4, -2, x) * ramp(5.5, 3.5, x) +
    0.22 * ramp(5, 8, x) +
    (noise(x, y, z, 1.7, 11) - 0.5) * 0.75 +
    (hash3(Math.round(x * 8), Math.round(y * 8), Math.round(z * 8), 5) - 0.5) * 0.22;
  return s < 0.12 ? 'clean' : s < 0.22 ? 'cracked' : s < 0.33 ? 'warm' : s < 0.6 ? 'weathered' : s < 0.78 ? 'dark' : 'mossy';
}

/** Run-off streaks under the coping, moss low down and towards the damp right. */
const look = (x: number, y: number, z: number): Look =>
  finishLook(finishAt(x, y, z), x, y, z, 21, stoneSurf({ stain: 0.5 * ramp(2.8, 4.2, y) * noise(x, 0, z, 1.2, 3), moss: 0.35 * ramp(1.6, 0.8, y) + 0.3 * ramp(5.5, 8.5, x) * ramp(3, 1.5, y) }));

/** Paving slabs: the sheet's sunlit court (#e3ae77 … #f4cc9c on the tops). */
const PAVING = [0xd9a672, 0xdcab78, 0xd2a06e, 0xe0b27f, 0xc99a6c].map(fromSheet);

/** Height of the plinth's treads (or the paving) in front of the wall. */
const ground = (x: number, z: number) => (x < X0 - 0.25 || x > X1 + 0.25 ? 0 : STEPS.reduce((y, proj, k) => (z < FZ + proj ? (k + 1) * 0.25 : y), 0));

const inside = (x: number, y: number, b: readonly number[], pad = 0) => x > b[0] - pad && x < b[2] + pad && y > b[1] - pad && y < b[3] + pad;

export default defineKitScene({
  name: 'Damaged wall',
  caption: 'Multiple damage types combined for natural variation: a broken corner, missing blocks, cracks, an eroded top, a collapse, weathering and moss along one temple wall.',
  source: '19.2 Stone damage · Combination examples · Multiple damage types combined',
  size: [22, 12],
  camera: { az: -10, el: 8, dist: 17, target: [-0.4, 2.3, -2.4] },
  spawn: { x: -1, z: 3, yaw: 180 },
  async build(ctx, p) {
    const target: PlaceTarget = { voxels: p.voxels, collider: (c) => p.colliders.push(c), extra: (o) => p.extras.push(o) };
    const wall = new Ruin(look);

    // ── Plinth: three steps of 0.25 m risers running under the whole wall ──
    STEPS.forEach((proj, k) => {
      wall.courses(X0 - 0.25, k * 0.25, BZ - 0.25, X1 + 0.25, (k + 1) * 0.25, FZ + proj, { length: [0.625, 1.25], course: 0.25, depth: 1.0, axis: 'x', seed: 40 + k });
      p.collider(X0 - 0.25, 0, BZ - 0.25, X1 + 0.25, (k + 1) * 0.25, FZ + proj);
    });

    // ── Back skin, the whole length ──
    wall.courses(X0, PLINTH, BZ, X1, BAND, SKIN, { length: [0.5, 1.0], course: 0.25, axis: 'x', seed: 50 });
    wall.courses(X0, BAND, BZ, X1, TOP, SKIN, { length: [0.5, 1.0], course: 0.5, axis: 'x', seed: 51 });

    // ── Front skin: buttress, pilasters, and the bays between them ──
    wall.courses(BUTTRESS[0], PLINTH, SKIN, BUTTRESS[1], TOP, FZ + 0.5, { length: [0.75, 1.25], course: 0.5, axis: 'x', seed: 60 });
    PIERS.forEach(([a, b], n) => wall.courses(a, PLINTH, SKIN, b, TOP, FZ + 0.25, { length: [b - a, b - a], course: 0.5, depth: 0.75, axis: 'x', seed: 70 + n }));
    const edges = [BUTTRESS[1], ...PIERS.flat()].sort((a, b) => a - b);
    for (let n = 0; n + 1 < edges.length; n += 2) {
      const [a, b] = [edges[n], edges[n + 1]];
      wall.courses(a, PLINTH, SKIN, b, BAND, FZ, { length: [0.5, 1.0], course: 0.25, axis: 'x', seed: 80 + n });
      const niche = NICHES.find((w) => w.x0 > a && w.x1 < b);
      if (!niche) {
        wall.courses(a, BAND, SKIN, b, TOP, FZ, { length: [0.5, 1.0], course: 0.5, axis: 'x', seed: 90 + n });
        continue;
      }
      // A framed niche: sill, jambs and lintel standing proud of the face, the wall courses either side.
      const [f0, f1] = [niche.x0 - 0.25, niche.x1 + 0.25];
      wall.courses(a, BAND, SKIN, f0, TOP, FZ, { length: [0.5, 1.0], course: 0.5, axis: 'x', seed: 100 + n });
      wall.courses(f1, BAND, SKIN, b, TOP, FZ, { length: [0.5, 1.0], course: 0.5, axis: 'x', seed: 110 + n });
      wall.stone(f0, BAND, SKIN, f1, BAND + 0.25, FZ + 0.1875);
      wall.stone(f0, BAND + 0.25, SKIN, niche.x0, niche.top, FZ + 0.125);
      wall.stone(niche.x1, BAND + 0.25, SKIN, f1, niche.top, FZ + 0.125);
      wall.stone(f0, niche.top, SKIN, f1, TOP, FZ + 0.1875);
    }

    // ── Coping: a course over the bays, deeper caps over the buttress and piers ──
    for (let n = 0; n + 1 < edges.length; n += 2) wall.courses(edges[n], TOP, BZ - 0.125, edges[n + 1], COPE, FZ + 0.125, { length: [0.625, 1.125], course: 0.25, depth: 0.625, axis: 'x', seed: 120 + n });
    wall.courses(BUTTRESS[0], TOP, BZ - 0.125, BUTTRESS[1], COPE, FZ + 0.625, { length: [0.75, 1.25], course: 0.25, depth: 0.625, axis: 'x', seed: 130 });
    for (const [a, b] of PIERS) wall.stone(a, TOP, BZ - 0.125, b, COPE, FZ + 0.375);

    // ── Stones gone before the rest were laid: missing face stones, the left
    // niche broken through at its foot, two riser stones, the collapsed bay ──
    const breach = (x: number, y: number) => y > BREACH.y + Math.abs(x - BREACH.x) * 1.55 + (noise(x, y, 0, 0.6, 9) - 0.5) * 0.5;
    wall.omit(
      (x, y, z) =>
        (z > SKIN && z < FZ && MISSING.some((b) => inside(x, y, b))) ||
        (z < SKIN && inside(x, y, [-1.35, BAND + 0.05, -0.6, BAND + 0.45])) ||
        (Math.abs(y - 0.375) < 0.1 && z > FZ && inside(x, z, [-2.9, FZ, -2.3, FZ + 0.7])) ||
        (Math.abs(y - 0.625) < 0.1 && z > FZ - 0.3 && inside(x, z, [3.2, FZ - 0.3, 3.8, FZ + 0.35])) ||
        (x > BREACH.x0 && x < BREACH.x1 && y > PLINTH && breach(x, y)),
    );

    // ── Lay: worn stone crumbles into cubes ──
    // The top eroded in terraces over the left bay, stepping down towards the buttress; chips elsewhere.
    const top = envelopeWear([-20, PLINTH, BZ - 0.125], [20, COPE, FZ + 0.125], (x, y, z) => 1.15 * ramp(-3.5, -6.8, x) * (0.75 + 0.5 * noise(x, y, z, 0.35, 12)) + 0.45 * (noise(x, y, z, 0.3, 13) - 0.68), { mode: 'top' });
    // The buttress's end and arrises worn back.
    const end = envelopeWear([X0, PLINTH, SKIN], [BUTTRESS[1], COPE, FZ + 0.625], (x, y, z) => 0.55 * ramp(-8.3, -9.5, x) * (0.6 + 0.8 * noise(x, y, z, 0.3, 14)) + 0.3 * (noise(x, y, z, 0.25, 15) - 0.6));
    // Round the breach the stones are broken back in rough steps.
    const edge = (x: number, y: number) => !breach(x + 0.3 * (noise(x, y, 1, 0.3, 16) - 0.2), y + 0.25);
    wall.lay({
      // (the wear only reaches the top metre, the buttress and the breach)
      wear: (x, y, z) => (x < BUTTRESS[1] ? end(x, y, z) : y < COPE - 0.9 || top(x, y, z)) && (x < BREACH.x0 || x > BREACH.x1 || y < PLINTH + 0.25 || edge(x, y)),
      piece: (_x, y) => ({ surf: stoneSurf({ moss: 0.25 + 0.3 * ramp(3.5, 1.5, y), stain: 0.45 }) }),
    });

    // The niches' backs and the stones behind the missing ones, in shadow.
    wall.restyle(
      (x, y, z) => z < SKIN && (NICHES.some((w) => x > w.x0 - 0.3 && x < w.x1 + 0.3 && y > BAND && y < w.top + 0.2) || MISSING.some((b) => inside(x, y, b, 0.3))),
      { shade: 0.6, surf: stoneSurf({ stain: 0.4 }) },
      hollow,
    );

    // ── Damage carved into the laid stone ──
    // The buttress's top corner broken off in ledges, down four courses.
    wall.breakAway({ at: [X0, COPE, FZ + 0.625], reach: [1.9, 1.05], below: 1.9, ledges: 4, rough: 0.35 }, 3);
    // Smaller breaks: the top of the middle pier, the pier at the collapse's edge.
    wall.breakAway({ at: [1.75, COPE, FZ + 0.375], reach: [0.55, 0.5], below: 0.6, ledges: 2 }, 4);
    wall.breakAway({ at: [6.25, 3.25, FZ + 0.25], reach: [0.5, 0.45], below: 0.75, ledges: 2 }, 5);
    // Stepped cracks: down the buttress, through the cracked bay's big stones, a pier, a jamb, across the coping.
    wall.crack({ on: 'front', from: [-8.05, 3.6], to: [-7.55, 0.9], through: [FZ - 0.1, FZ + 0.5], wander: 3 }, 6);
    wall.crack({ on: 'front', from: [2.35, 4.2], to: [2.6, 2.35], through: [SKIN, FZ], wander: 2 }, 7);
    wall.crack({ on: 'front', from: [5.2, 3.7], to: [4.75, 2.3], through: [SKIN, FZ], wander: 2.5 }, 8);
    wall.crack({ on: 'front', from: [-3.8, 3.3], to: [-3.95, 1.9], through: [SKIN, FZ + 0.25], wander: 1.5 }, 9);
    wall.crack({ on: 'front', from: [-0.55, 3.6], to: [-0.6, 2.2], through: [SKIN, FZ + 0.125], wander: 1 }, 10);
    wall.crack({ on: 'top', from: [-6.2, FZ], to: [-6.0, BZ], through: [TOP - 0.3, COPE], wander: 1.5 }, 11);
    // Nicked arrises all along, worst on the left and round the collapse.
    wall.nick(0.35, 17, [X0 - 0.3, 0, BZ - 0.3], [X1 + 0.3, COPE, FZ + 1.1], (x, y) => ramp(-3, -8, x) + ramp(4.5, 7, x) + 0.35 > hash3(Math.floor(x), Math.floor(y * 2), 3, 1) * 1.2);
    wall.emit(p, 23);

    // Moss on the ledges: the coping, the treads, the broken ledges; most on the damp right.
    mossLedges(p, wall, (x, y) => (y > TOP ? 0.5 : y < PLINTH + 0.1 ? 0.32 : y < BAND ? 0.3 : 0.12) + 0.25 * ramp(4.5, 8, x) * ramp(3.5, 1.5, y) + 0.15 * ramp(-6, -9, x), 31);

    // Wall colliders: the buttress, the bays (the collapsed one low), the piers either side of it.
    p.collider(X0, PLINTH, BZ, BUTTRESS[1], COPE - 0.5, FZ + 0.5);
    p.collider(BUTTRESS[1], PLINTH, BZ, 5.5, COPE, FZ + 0.25);
    p.collider(5.5, PLINTH, BZ, 6.25, COPE - 0.75, FZ + 0.25);
    p.collider(6.25, PLINTH, BZ, 8.75, BREACH.y, FZ);
    p.collider(8.75, PLINTH, BZ, X1, TOP, FZ + 0.25);

    // ── Ground: paving in front, soil and grass round the plinth and behind ──
    // The court's slabs: the sheet's warm tan, a few paler, greyer ones near the wall.
    const pave = (x: number, z: number): Look => ({
      color: PAVING[Math.floor(hash3(Math.round(x * 4), 0, Math.round(z * 4), 43) * PAVING.length)],
      style: { surf: stoneSurf({ lichen: 0.12, stain: 0.12 + 0.35 * ramp(-0.5, -1.4, z) + 0.2 * noise(x, 0, z, 2, 41), moss: 0.1, crack: noise(x, 0, z, 1.5, 42) > 0.7 ? 0.3 : 0 }) },
    });
    const court = paving(p, {
      x0: -11,
      x1: 11,
      z0: FZ + STEPS[0],
      z1: 6,
      seed: 44,
      look: pave,
      // Slabs gone at the court's ragged ends, near the wall, and here and there.
      gone: (x, z) => {
        const h = (s: number) => hash3(Math.round(x * 2), Math.round(z * 2), s, 45);
        return (Math.abs(x) > 10.2 && h(1) < 0.5) || (z < -0.5 && h(2) < 0.08) || h(3) < 0.025;
      },
    });
    soil(p, -11, -6, 11, BZ - 0.25);
    soil(p, -11, BZ - 0.25, X0 - 0.25, FZ + STEPS[0]);
    soil(p, X1 + 0.25, BZ - 0.25, 11, FZ + STEPS[0]);

    // ── Rubble ──
    const rubble = new BlockSet(1 / 16);
    // Fallen stones: weathered, darker and mossier than the wall, lying in the damp.
    const stoneLook = (x: number, z: number) => finishLook(noise(x, 0, z, 1.3, 55) > 0.55 ? 'dark' : noise(x, 1, z, 1.1, 56) > 0.5 ? 'mossy' : 'weathered', x, 0, z, 57, stoneSurf({ stain: 0.45, moss: 0.3, lichen: 0.15 }));
    const pieces = (list: number[][], tilt = false): Rubble[] =>
      list.map(([x, z, w, h, d, rx = 0, ry = 0, rz = 0]) => ({ x, z, size: [w, h, d], look: stoneLook(x, z), ...(tilt ? { tilt: [rx, ry, rz] } : {}) }));
    // Under the broken corner: its pieces, crumbled, and a block that fell on its side.
    heap(p, rubble, [...pieces([[-9.7, -1.3, 0.75, 0.5, 0.625], [-9.1, -0.95, 0.5, 0.375, 0.5], [-10.2, -0.7, 0.375, 0.25, 0.375], [-8.5, -1.15, 0.375, 0.3125, 0.375], [-9.6, -0.2, 0.25, 0.1875, 0.25], [-8.9, -1.9, 0.5, 0.375, 0.5]]), ...pieces([[-7.9, -0.45, 1.0, 0.5, 0.5, 0, 0.35, 0.12]], true)], ground, 50);
    // The collapse's stones heaped at its foot: against the wall on the plinth, spilling over the paving.
    heap(
      p,
      rubble,
      [
        ...pieces([
          [6.8, -2.15, 0.75, 0.5, 0.5],
          [7.7, -2.2, 1.0, 0.5, 0.5],
          [8.5, -2.1, 0.625, 0.4375, 0.5],
          [7.2, -2.1, 0.625, 0.375, 0.5],
          [8.0, -1.75, 0.5, 0.4375, 0.4375],
          [6.4, -1.6, 0.625, 0.375, 0.5],
          [7.3, -1.45, 0.75, 0.375, 0.5],
          [8.7, -1.3, 0.5, 0.375, 0.5],
          [6.0, -0.9, 0.625, 0.5, 0.5],
          [9.3, -0.8, 0.5, 0.3125, 0.5],
          [7.6, -0.6, 0.375, 0.25, 0.375],
        ]),
        ...pieces(
          [
            [7.0, -1.1, 1.0, 0.5, 0.5, 0.1, 0.5, 0.3],
            [8.2, -0.2, 1.0, 0.5, 0.5, 0.2, -0.4, 0.06],
            [5.1, 0.35, 0.75, 0.5, 0.5, 0.08, 0.2, 0],
          ],
          true,
        ),
      ],
      ground,
      51,
    );
    // Lone blocks out on the court.
    heap(p, rubble, pieces([[-1.4, 1.4, 1.0, 0.5, 0.5, 0, 0.25, 0.03], [2.4, 2.2, 0.625, 0.5, 0.5, 0.05, -0.6, 0]], true), ground, 52);
    rubble.emit(p.voxels, { seed: 53, jitter: 0.08 });
    mossLedges(p, rubble, (_x, y) => 0.25 + 0.2 * ramp(0.2, 0.8, y), 54);

    // Kit pieces: a fallen carved lintel from the collapse, a heap of blocks, debris.
    const lintel = await ctx.get('19.2/collapsed-decorative', { variant: 'fallen', seed: 3 });
    if (lintel) placePiece(target, lintel, { x: 4.4, y: 0, z: -0.5 });
    const pile = await ctx.get('20/fallen-blocks', { variant: 'pile', seed: 4 });
    if (pile) placePiece(target, pile, { x: 8.2, y: 0, z: 1.5, turn: 2 });
    const debris = await ctx.get('20/stone-fragments', { variant: 'small', seed: 5 });
    if (debris) placePiece(target, debris, { x: 5.0, y: 0, z: 2.4, turn: 1 });
    const scatter = await ctx.get('20/stone-fragments', { variant: 'scatter', seed: 2 });
    if (scatter) placePiece(target, scatter, { x: -7.6, y: 0, z: 1.5, turn: 3 });
    // ── Grass: at the plinth's foot, on its lowest tread, in the paving's joints and holes, round the rubble ──
    const r = rng(5);
    const grass: Tuft[] = [];
    // (in clumps: where the ground stays damp, thicker and taller)
    for (let x = X0; x < X1; x += r.range(0.2, 0.45)) {
      const damp = noise(x, 0, 0, 1.4, 63);
      if (damp > 0.56) grass.push({ x, y: 0, z: FZ + STEPS[0] + r.range(0.03, 0.18), height: Math.round(3 + (damp - 0.56) * 14 + r.range(0, 1.5)), radius: damp > 0.66 ? 1.5 : 1 });
    }
    for (let x = X0; x < X1; x += r.range(0.3, 0.6)) if (noise(x, 1, 0, 1.1, 64) > 0.66) grass.push({ x, y: 0.25, z: FZ + STEPS[1] + r.range(0.02, 0.1), height: r.int(2, 5), radius: 1 });
    for (const [x, z] of court.joints) if (r.chance(0.12)) grass.push({ x, y: 0, z, height: r.int(2, 4), radius: 1 });
    for (const [x, z] of court.holes) grass.push({ x, y: -0.25, z, height: r.int(5, 8), radius: 1.5 });
    for (const [x, z] of [
      [-10.8, -1.6],
      [-9.2, -0.1],
      [5.6, -0.4],
      [9.7, -1.5],
      [9.9, 0.3],
    ])
      grass.push({ x, y: 0, z, height: r.int(5, 9), radius: 1.5 });
    // Tall grass along the back of the wall.
    for (let x = -10.6; x < 10.6; x += r.range(0.5, 1.2)) grass.push({ x, y: 0, z: BZ - r.range(0.45, 1.8), height: r.int(5, 10), radius: 1.5 });
    tufts(p, grass, 61);
  },
});
