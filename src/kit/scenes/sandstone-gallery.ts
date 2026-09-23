import { hash3, valueNoise3 } from '../../voxel/random';
import { DryMasonry, FACADE, FACE, coursesOf, finish, finishLook, galleryFacade, overgrow, spansOf, type Box6, type FacadeWeather, type StoneLook } from '../lib/gallery';
import { SANDSTONE, SOIL } from '../palette';
import { defineKitScene } from '../scene';
import { here, rng, snap, TEXEL } from '../shapes';
import { soilSurf, stoneSurf, type StoneFinish } from '../surface';
import { flight, paving, place, tower, tuftsAt, vines } from './_gallery-scenes';

/**
 * §19.1 "Usage examples": one long courtyard façade showing the six
 * sandstone finishes left to right as the panorama's caption lists them —
 * clean, warm and dark, then the entrance pavilion (its left half dark, its
 * right half cracked), then cracked, weathered and moss-covered — framed by
 * short wings coming forward, a tower rising behind the entrance, jungle trees
 * behind the right-hand end and nature taking the court back from left to
 * right: bare clean paving at the left, grass in the joints, lost slabs,
 * moss cushions, vines and bushes towards the moss-covered end.
 */

const T = TEXEL;
/** Front face of the long façade. */
const F = -5.5;
/** Length of one finish's section: one window bay between two pilasters. */
const SEC = 4;
/** Half the width of the entrance pavilion. */
const GW = 3.5;
/** Front face of the pavilion, projecting from the façade. */
const FG = F + 2.5;
/** Ends of the façade: the wings come forward from here. */
const END = GW + 3 * SEC;
/** Height of the façades' cornice. */
const H = FACADE.cornice;

/** The six finishes in the caption's order, left to right, with what the weather has done to each. */
const SECTIONS: { name: 'clean' | 'warm' | 'dark' | 'cracked' | 'weathered' | 'mossy'; weather?: FacadeWeather }[] = [
  { name: 'clean' },
  { name: 'warm' },
  { name: 'dark', weather: { streaks: 0.45 } },
  { name: 'cracked', weather: { cracked: 2 } },
  { name: 'weathered', weather: { streaks: 0.35, moss: 0.35, grass: 0.35, missing: 1 } },
  { name: 'mossy', weather: { moss: 1, grass: 0.8, streaks: 0.3 } },
];

export default defineKitScene({
  name: 'Sandstone gallery',
  caption: 'Clean · Warm · Dark · Cracked · Weathered · Moss-covered sandstone — the six finishes left to right along one gallery courtyard, the entrance and its tower in the middle.',
  source: '19.1 Sandstone · Usage examples',
  size: [40, 24],
  camera: { az: 0, el: -4, dist: 32, target: [0, 5.8, F] },
  spawn: { x: 0, z: 6, yaw: 180 },
  async build(ctx, p) {
    const r = rng(19);
    // x → how far nature has got (0 at the clean end, 1 at the moss-covered end).
    const wild = (x: number) => Math.min(1, Math.max(0, (x + 4) / 20));

    // ── The court: pale slabs, mossier and grassier to the right ───────────
    const slab = [...SANDSTONE.clean, ...SANDSTONE.cracked];
    paving(p, {
      x0: -20,
      z0: F - 4.5,
      x1: 20,
      z1: 12,
      seed: 190,
      bed: SANDSTONE.mossy[3],
      look: (x, z): StoneLook => {
        const h = hash3(Math.round(x * 16), 0, Math.round(z * 16), 191);
        const n = valueNoise3(x / 2.5, 0.5, z / 2.5, 192);
        const g = wild(x);
        return {
          color: g > 0.8 && h < 0.3 ? SANDSTONE.mossy[Math.floor(h * 13) % 4] : slab[Math.floor(h * slab.length)],
          shade: 1 + (hash3(Math.round(x * 16), 1, Math.round(z * 16), 193) - 0.5) * 0.12,
          surf: stoneSurf({ moss: 0.04 + 0.55 * g * g * n, lichen: 0.06 + 0.2 * g, stain: 0.06 + 0.25 * g * n, crack: h > 0.9 ? 0.4 : 0 }),
        };
      },
      missing: (x, z) => (z > F + 1 ? 0.12 * Math.max(0, wild(x) - 0.55) : 0),
      grass: (x, z) => 0.02 + 0.5 * wild(x) ** 2 * (z < F + 3 ? 1.3 : 0.45),
    });
    // Behind the galleries: soil and grass where the trees grow.
    p.voxels.span(-20, -0.5, -12, 20, 0, F - 4.5, SOIL.dirt[0], 'soil', { surf: soilSurf({ grass: 0.9, moss: 0.2 }), open: 4 | 1 | 2 | 32, src: here() });
    p.collider(-20, -0.5, -12, 20, 0, F - 4.5);

    // ── The long façade: three sections either side of the entrance ────────
    const sectionX = (i: number) => (i < 3 ? -END + SEC / 2 + i * SEC : GW + SEC / 2 + (i - 3) * SEC);
    SECTIONS.forEach((s, i) => {
      const facade = galleryFacade({ length: SEC, bay: SEC, finish: finish(s.name), seed: 11 + i * 7, gallery: 3, sill: 1.25, lintel: 3.5, window: 1.75, pilaster: { width: 0.75 }, weather: s.weather });
      place(p, facade, { x: sectionX(i), y: 0, z: F });
    });

    // ── Wings coming forward at both ends, and corner blocks where they meet ─
    const wing = (fin: StoneFinish, seed: number, weather?: FacadeWeather) =>
      galleryFacade({ length: 5.5, bay: 2.75, finish: fin, seed, gallery: 3, sill: 1.25, lintel: 3.5, window: 1.25, pilaster: { width: 0.75 }, openEnds: true, weather });
    place(p, wing(finish('clean'), 61), { x: -END, y: 0, z: F + 3.25, turn: 1 });
    place(p, wing(finish('mossy'), 62, { moss: 1, grass: 0.9, streaks: 0.3 }), { x: END, y: 0, z: F + 3.25, turn: 3 });
    const m = new DryMasonry(7);
    for (const s of [-1, 1]) {
      const fin = finish(s < 0 ? 'clean' : 'mossy');
      const look = finishLook(fin, 70 + s);
      const [a, b] = s < 0 ? [-END - 4, -END] : [END, END + 4];
      m.wall([a, 0, F - 4, b, H + 1.5, F + 0.5], coursesOf(H + 1.5), { length: [0.75, 1.5], look });
      m.course([a + 0.25, H + 1.5, F - 3.75, b - 0.25, H + 2, F + 0.25], { length: [0.75, 1.5], look });
      m.course([a + 0.75, H + 2, F - 3.25, b - 0.75, H + 2.5, F - 0.25], { length: [0.75, 1.5], row: 1, look });
      p.collider(a, 0, F - 4, b, H + 2.5, F + 0.5);
    }

    // ── The entrance pavilion: dark on its left, cracked on its right ──────
    const dark = finishLook(finish('dark'), 31, { streaks: (x) => (Math.abs(x + 2.1) < 0.35 || Math.abs(x - 0.4) < 0.3 ? 0.55 : 0) });
    const cracked = finishLook(finish('cracked'), 32);
    const look = (x: number, y: number, z: number) => (x < 0 ? dark(x, y, z) : cracked(x, y, z));
    const back = F - 1;
    // Plinth steps either side of the stair (the façade's profile), the base under the wall.
    const pl = [[0, 0.5, FG + 0.5], [0.5, 0.75, FG + 0.375], [0.75, 1, FG + 0.25]] as const;
    for (const s of [-1, 1]) {
      const [a, b] = s < 0 ? [-GW, -2.5] : [2.5, GW];
      pl.forEach(([y0, y1, front], i) => m.course([a, y0, FG, b, y1, front], { length: [0.5, 1], row: i, closed: FACE.ny | FACE.nz, look }));
      m.wall([s < 0 ? -GW : 1.375, 0, back, s < 0 ? -1.375 : GW, 1, FG], [0.5, 0.5], { length: [0.75, 1.5], closed: FACE.ny, look });
    }
    // The stair: four risers of 0.25 m up to the door sill, between two pedestals.
    const stairs = flight(m, p, { x0: -1.375, x1: 1.375, zFoot: FG + 1.625, zBack: back, n: 4, look, length: [0.75, 1.4] });
    for (const s of [-1, 1]) {
      const [a, b] = s < 0 ? [-2.5, -1.375] : [1.375, 2.5];
      m.wall([a, 0, FG, b, 1.25, FG + 1.75], [0.5, 0.5, 0.25], { length: [1.125, 1.125], closed: FACE.ny | FACE.nz, look });
      p.collider(a, 0, FG, b, 1.25, FG + 1.75);
    }
    for (const [a, b] of [[-GW, -2.5], [2.5, GW]]) for (const [y0, , front] of pl) p.collider(a, 0, FG, b, y0 + (y0 ? 0.25 : 0.5), front);
    // The front wall with its doorway: proud jambs and lintel, a dark passage behind.
    const door: [number, number] = [-0.875, 0.875];
    const DOOR_TOP = 4.5;
    let yy = 1;
    [...coursesOf(DOOR_TOP - 1), ...coursesOf(6.5 - DOOR_TOP)].forEach((h, row) => {
      const lintel = Math.abs(yy - DOOR_TOP) < 1e-6;
      for (const [a, b] of spansOf(-GW, GW, yy < DOOR_TOP ? [[door[0] - 0.375, door[1] + 0.375]] : []))
        m.course([a, yy, back, b, yy + h, FG], {
          length: [0.5, 1.25],
          row,
          closed: FACE.ny | FACE.py,
          fixed: lintel ? [{ a: door[0] - 0.375, b: door[1] + 0.375, proud: 0.1875 }] : [],
          openBelow: lintel ? [door] : [],
          look,
        });
      yy += h;
    });
    for (const [a, b] of [[door[0] - 0.375, door[0]], [door[1], door[1] + 0.375]]) m.wall([a, 1, back, b, DOOR_TOP, FG + 0.1875], coursesOf(DOOR_TOP - 1), { length: [1, 1], closed: FACE.ny | FACE.py, look });
    const cav = SANDSTONE.cavity;
    const src = here();
    const shadow = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, k: number) => p.voxels.span(x0, y0, z0, x1, y1, z1, cav[k], 'sandstone', { shade: 0.4, open: 0, src });
    shadow(door[0], 1, back, door[0] + T, DOOR_TOP, FG - 2 * T, 0);
    shadow(door[1] - T, 1, back, door[1], DOOR_TOP, FG - 2 * T, 1);
    shadow(door[0] + T, DOOR_TOP - T, back, door[1] - T, DOOR_TOP, FG - 2 * T, 2);
    shadow(door[0] + T, 1, back, door[1] - T, 1 + T, FG - 2 * T, 0);
    shadow(door[0] + T, 1 + T, back, door[1] - T, DOOR_TOP - T, back + T, 1);
    p.collider(-GW, 1, back, GW, 6.5, FG);
    // Square pillars on the pedestals, flanking the stair up to the pier heads.
    for (const s of [-1, 1]) {
      const [a, b] = s < 0 ? [-2.375, -1.5] : [1.5, 2.375];
      m.wall([a, 1.25, FG, b, 6, FG + 0.875], coursesOf(4.75), { length: [0.875, 0.875], closed: FACE.ny | FACE.nz | FACE.py, look });
      m.course([a - 0.125, 6, FG, b + 0.125, 6.5, FG + 1], { length: [2, 2], closed: FACE.nz | FACE.py, look });
      // Up past the cornice to the pier head.
      m.course([a, 6.5, FG + 0.375, b, 7, FG + 0.875], { length: [2, 2], closed: FACE.ny | FACE.nz | FACE.py, look });
      m.wall([a, 7, FG - 0.5, b, 8, FG + 0.875], [0.5, 0.5], { length: [0.875, 0.875], look });
      m.course([snap((a + b) / 2) - 0.25, 8, FG - 0.125, snap((a + b) / 2) + 0.25, 8.375, FG + 0.375], { length: [1, 1], look });
      p.collider(a - 0.125, 1.25, FG, b + 0.125, 8, FG + 1);
    }
    // Cornice, the pavilion's stepped roof and a stepped gable over the door.
    m.course([-GW, 6.5, back, GW, 6.75, FG + 0.25], { length: [0.75, 1.5], closed: FACE.py, look });
    m.course([-GW - 0.125, 6.75, back, GW + 0.125, 7, FG + 0.375], { length: [0.75, 1.5], row: 1, closed: 0, look });
    m.course([-GW + 0.25, 7, back, GW - 0.25, 7.5, FG - 0.25], { length: [0.75, 1.5], look });
    m.course([-GW + 0.5, 7.5, back, GW - 0.5, 8, FG - 0.75], { length: [0.75, 1.5], row: 1, look });
    // The gable rises between the pier heads, a dark niche in its lower tiers.
    for (let t = 0; t < 5; t++) {
      const hw = 1.375 - t * 0.25;
      const y0 = 7 + t * 0.375;
      const niche = t > 0 && t < 3;
      for (const [a, b] of spansOf(-hw, hw, niche ? [[-0.375, 0.375]] : [])) m.course([a, y0, FG - 0.5, b, y0 + 0.375, FG + 0.125], { length: [0.5, 1], row: t, look });
      if (niche) m.course([-0.375, y0, FG - 0.5, 0.375, y0 + 0.375, FG - 0.125], { length: [1, 1], look });
    }
    shadow(-0.375, 7.375, FG - 0.125, 0.375, 8.125, FG + 0.125 - T, 1);
    m.course([-0.1875, 8.875, FG - 0.375, 0.1875, 9.375, FG], { length: [1, 1], look });
    p.collider(-GW, 6.5, back, GW, 8, FG + 0.375);

    // ── The tower behind the entrance ──────────────────────────────────────
    const towerLook = finishLook(finish('dark'), 41, { streaks: (x) => (Math.abs(x - 1.2) < 0.4 || Math.abs(x + 1.8) < 0.3 ? 0.5 : 0) });
    tower(m, p, { x: 0, y: 0, z: back - 3, w: 6, d: 5, height: 17, body: 9.5, look: towerLook });

    // Age on the pavilion: three stones split on the cracked side, a few chipped arrises.
    const d = rng(33);
    const crackable = m.stones.filter((s) => s.face === FACE.pz && s.box[0] > 0.9 && s.box[0] < 3.3 && s.box[1] > 1.2 && s.box[4] < 6.5 && Math.abs(s.box[5] - FG) < 1e-6 && s.box[3] - s.box[0] >= 0.5);
    for (let k = 0; k < 3 && crackable.length; k++) m.crack(crackable.splice(d.int(0, crackable.length - 1), 1)[0], d.int(1, 1e6));
    for (const s of m.stones) if (s.face === FACE.pz && !s.crack && s.box[5] > FG - 0.3 && d.chance(s.box[0] < 0 ? 0.08 : 0.12)) m.chip(s, d.int(1, 1e6));
    m.emit(p.voxels);
    // Grass has found the joints of the stair, on its cracked side.
    overgrow(p, stairs.map((l) => ({ ...l, x0: 0.2, joints: l.joints.filter((j) => j > 0.2) })), 0.2, 0.9, 35);

    // ── Nature taking the court back, right of the entrance ────────────────
    // Tufts along the foot of the façade, thicker towards the moss-covered end.
    const foot: [number, number, number][] = [];
    for (let x = 4; x < END + 0.5; x += r.range(0.25, 0.8)) if (r.chance(wild(x) ** 1.5)) foot.push([x, 0, F + 0.66 + r.range(0, 0.3)]);
    for (let z = F + 0.8; z < F + 6; z += r.range(0.3, 0.7)) if (r.chance(0.8)) foot.push([END - 0.66 - r.range(0, 0.3), 0, z]);
    tuftsAt(p, foot, { seed: 77, height: [3, 6], full: 0.5 });
    // Grass clumps and bushes at the moss-covered end, a few tufts by the weathered wall.
    const plants: [string, string, number, number, number][] = [
      ['20/grass-patches', 'tuft', 9.2, F + 1.1, 3],
      ['20/grass-patches', 'tall', 12.4, F + 1.3, 4],
      ['20/grass-patches', 'wild', 14.3, F + 1.6, 5],
      ['20/grass-patches', 'tuft', 15.1, F + 4.4, 6],
      ['18.1/bush', 'shrub', 13.6, F + 3.1, 7],
      ['20/grass-patches', 'tall', 6.2, F + 0.9, 8],
      ['20/grass-patches', 'wild', 11.2, F + 5.2, 9],
    ];
    for (const [id, variant, x, z, seed] of plants) place(p, await ctx.get(id, { variant, seed }), { x, y: 0, z });
    // Vines hanging from the moss-covered cornice and the weathered one.
    vines(p, { x0: END - SEC + 0.3, x1: END - 0.3, top: H - 0.05, z: F + 0.5, n: 7, seed: 5 });
    vines(p, { x0: END - 2 * SEC + 0.5, x1: END - SEC - 0.5, top: H - 0.05, z: F + 0.5, n: 2, seed: 6 });

    // ── Jungle behind the right-hand end ────────────────────────────────────
    const roofs: Box6 = [-END - 4, 0, F - 4.5, END + 4, H + 3.4, F + 0.6];
    const trees: [string, number, number, number, number][] = [
      ['18.1/medium-tree', 11.5, F - 7.5, 3, 11.5],
      ['18.1/medium-tree', 18, F - 5.5, 5, 12.5],
      ['18.1/palm-tree', 6.5, F - 6.2, 7, 14],
    ];
    for (const [id, x, z, seed, height] of trees) place(p, await ctx.get(id, { seed, height }), { x, y: 0, z }, [roofs]);
  },
});
