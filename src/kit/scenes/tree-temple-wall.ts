import type { TreePlan } from '../assets/18.1/_large-tree-parts';
import { BlockSet, masonry, type BlockStyle } from '../BlockSet';
import { galleryFacade } from '../lib/gallery';
import { GRASS_TONES, grassPatch } from '../lib/grass';
import { SANDSTONE } from '../palette';
import { PieceBuilder } from '../PieceBuilder';
import { rng } from '../shapes';
import { defineKitScene } from '../scene';
import { stoneSurf, type StoneFinish } from '../surface';
import type { KitPiece } from '../types';
import { flight, prasat, put, shell, soilGround, type Box } from './_scenes18';

/**
 * §18.1 environment example "Tree near temple wall", as on the sheet: a
 * jungle giant grown out of a temple gallery. The gallery runs in from the
 * left on its stepped terrace — baluster windows, a doorway with steps up to
 * it, moss on every ledge — and ends where the tree stands; past the trunk it
 * goes on as a broken wall. The buttress roots come down over the end of the
 * terrace and over the broken wall and grip the blocks at their feet; the
 * canopy spreads over the gallery roof, vines hanging from it. A tower rises
 * behind the gallery, jungle trees behind that; in front, a flagged path,
 * bushes, grass and fallen blocks.
 */

// Layout (scene space: x to the right, z towards the viewer, y up; metres).
const GZ = -3; // front face of the gallery wall
const GX0 = -16; // the gallery's left end…
const GX1 = -1; // …and right end, at the tree
const FLOOR = 1; // terrace top = the gallery's floor
const DOOR_X = GX0 + 7.5; // middle of the door bay (5 bays of 3 m, door in the 3rd)
const TF = -1.5; // front of the upper terrace (a 1.25 m walk in front of the gallery's plinth)
const TREE = { x: 3.25, z: -3.25 };
const RUIN_X0 = 6.5; // where the gallery goes on, broken, past the trunk
/** Stone between these lines is laid in the tree's own set, so its roots ride over it. */
const NEAR_X = -4;
const FAR_X = 11;

/** Gallery stone: weathered grey-brown, moss on the ledges. */
const GALLERY: StoneFinish = {
  palette: [...SANDSTONE.weathered, SANDSTONE.mossy[0], SANDSTONE.mossy[2]],
  surf: stoneSurf({ moss: 0.42, stain: 0.5, lichen: 0.12 }),
  wear: 0.08,
};
/** Terrace and the broken wall: the same stone, mossier and more worn. */
const RUIN: StoneFinish = {
  palette: [...SANDSTONE.mossy, SANDSTONE.weathered[0], SANDSTONE.weathered[2]],
  surf: stoneSurf({ moss: 0.55, stain: 0.35, lichen: 0.1 }),
  wear: 0.22,
};
/** The tower behind: darker, lichen-grey stone (no wear: too far to see chips). */
const TOWER: StoneFinish = {
  palette: [...SANDSTONE.dark, SANDSTONE.weathered[2], SANDSTONE.weathered[4]],
  surf: stoneSurf({ moss: 0.3, stain: 0.35, lichen: 0.22 }),
  wear: 0,
};
/** The flagged path in front: warm tan slabs (the sheet's lit path). */
const PATH = [...SANDSTONE.warm.slice(0, 3), SANDSTONE.broken[0], SANDSTONE.broken[2], SANDSTONE.mossy[2]];

export default defineKitScene({
  name: 'Tree near temple wall',
  caption: 'A jungle giant grown out of a ruined gallery: buttress roots gripping the terrace and the broken wall, vines over the baluster windows.',
  source: '18.1 Trees · Environment examples · Tree near temple wall',
  size: [32, 22],
  camera: { az: -20, el: 3, dist: 34, target: [1.5, 7.5, -1.5] },
  spawn: { x: -2, z: 5, yaw: 145 },
  async build(ctx, p) {
    const r = rng(18);

    // ── Ground: grass, bare humus round the tree ─────────────────────────
    soilGround(p, [
      { x0: -16, z0: 3.5, x1: 16, z1: 11, grass: 0.95 },
      { x0: -16, z0: -11, x1: -2, z1: 3.5, grass: 0.9 },
      { x0: -2, z0: -11, x1: 9, z1: 3.5, grass: 0.4, moss: 0.3 },
      { x0: 9, z0: -11, x1: 16, z1: 3.5, grass: 0.8 },
    ]);

    // ── Stone: the stepped terrace, the steps to the door, the broken wall ──
    // Stone within the roots' reach (NEAR_X < x < FAR_X) goes into the tree's
    // own set, in tree-local coordinates; the rest into `stone`.
    const stone = new BlockSet(0.125);
    const tStyle: BlockStyle = { surf: RUIN.surf };
    const lay = (set: BlockSet, b: Box, seed: number, axis: 'x' | 'z' = 'x') => {
      const [dx, dz] = set === stone ? [0, 0] : [TREE.x, TREE.z];
      return shell(set, [b[0] - dx, b[1], b[2] - dz, b[3] - dx, b[4], b[5] - dz], { length: [0.5, 1.25], course: 0.5, axis, palette: RUIN.palette, style: tStyle, seed });
    };
    // Broken tops: the wall low beside the tree, a dip, then a tall stack at the far end (the
    // sheet's block pile); its return towards the viewer stepping down.
    const profile = (x: number) => 2.1 + 0.9 * Math.sin((x - RUIN_X0) * 0.9) - 0.9 * Math.exp(-(((x - 11.5) / 1.2) ** 2)) + 3.2 * Math.max(0, Math.min(1, (x - 13.5) / 1.5));
    const cornerTop = (z: number) => 3.6 - 0.55 * (z - GZ) + 0.3 * Math.sin(z * 2.1);
    const broken = (set: BlockSet, b: Box, seed: number, top: (x: number, z: number) => number, axis: 'x' | 'z' = 'x') => {
      const [dx, dz] = set === stone ? [0, 0] : [TREE.x, TREE.z];
      for (const id of lay(set, b, seed, axis)) {
        const { min, max } = set.boxOf(id);
        if ((min[1] + max[1]) / 2 > top((min[0] + max[0]) / 2 + dx, (min[2] + max[2]) / 2 + dz) + (r() - 0.5) * 0.6) set.remove(id);
      }
    };
    const near: Box[] = [
      [NEAR_X, 0, -11, GX1 + 1.5, FLOOR, TF], // the upper terrace's end
      [NEAR_X, 0, TF, GX1 + 2.5, 0.5, TF + 1], // its lower step
      [RUIN_X0 - 0.5, 0, -11, FAR_X, 0.5, -2], // the broken gallery's terrace
    ];
    const nearWall: Box = [RUIN_X0, 0.5, GZ - 1, FAR_X, 4.5, GZ];
    // The stone in the roots' reach, with the rubble the tree grew over (its plan's blocks, in the
    // terrace's mossy stone). Rubble and wall are worn before the terraces go in, as erosion visits
    // every stone laid so far; the wall's bottom row is spared, it stands on the terrace.
    const inWall = (x: number, z: number) => x > nearWall[0] - TREE.x && z > nearWall[2] - TREE.z && z < nearWall[5] - TREE.z;
    const nearStone = (rubble: TreePlan['stones'] = []) => {
      const set = new BlockSet(0.125);
      rubble.forEach((q, n) => set.add(q.min[0], q.min[1], q.min[2], q.max[0], q.max[1], q.max[2], RUIN.palette[n % RUIN.palette.length], tStyle));
      broken(set, nearWall, 16, profile);
      set.erode(RUIN.wear, 17, { where: (x, y, z) => y > 0.75 || !inWall(x, z) });
      near.forEach((b, n) => lay(set, b, 11 + n));
      return set;
    };
    // Out of the roots' reach: the broken wall's far end and its return (worn the same way),
    // the rest of the terrace and the steps.
    broken(stone, [FAR_X, 0.5, GZ - 1, 16, 6.5, GZ], 28, profile);
    broken(stone, [15, 0.5, GZ, 16, 4, GZ + 5], 29, (_x, z) => cornerTop(z), 'z');
    stone.erode(RUIN.wear, 30, { where: (_x, y) => y > 0.75 });
    lay(stone, [GX0, 0, -11, NEAR_X, FLOOR, TF], 21);
    lay(stone, [GX0, 0, TF, DOOR_X - 1.5, 0.5, TF + 1], 22);
    lay(stone, [DOOR_X + 1.5, 0, TF, NEAR_X, 0.5, TF + 1], 23);
    flight(stone, p, { foot: [DOOR_X, 0, TF + 4 * 0.35], dir: '-z', width: 3, n: 4, palette: RUIN.palette, style: tStyle, seed: 24 });
    // One more step before the door: the plinth's own courses (0.25 m each) lead on up to its sill.
    flight(stone, p, { foot: [DOOR_X, FLOOR, GZ + 0.5 + 2 * 0.35], dir: '-z', width: 2.5, n: 1, run: 0.7, palette: RUIN.palette, style: tStyle, seed: 25 });
    lay(stone, [FAR_X, 0, -11, 16, 0.5, -2], 26);
    lay(stone, [14.5, 0, -2, 16, 0.5, GZ + 5.5], 27);
    stone.emit(p.voxels, { seed: 18 });
    p.collider(GX0, 0, -11, GX1 + 1.5, FLOOR, TF);
    p.collider(GX0, 0, TF, DOOR_X - 1.5, 0.5, TF + 1);
    p.collider(DOOR_X + 1.5, 0, TF, GX1 + 2.5, 0.5, TF + 1);
    p.collider(RUIN_X0 - 0.5, 0, -11, 16, 0.5, -2);
    p.collider(14.5, 0, -2, 16, 0.5, GZ + 5.5);
    for (let x = RUIN_X0; x < 16; x += 0.5) p.collider(x, 0.5, GZ - 1, x + 0.5, Math.min(6.5, Math.max(0.5, Math.floor(profile(x + 0.25) / 0.5) * 0.5)), GZ);
    for (let z = GZ; z < GZ + 5; z += 0.5) p.collider(15, 0.5, z, 16, Math.max(0.5, Math.floor(cornerTop(z + 0.25) / 0.5) * 0.5), z + 0.5);

    // ── Tower behind the gallery ──────────────────────────────────────────
    const tower = new BlockSet(0.25);
    p.collider(...prasat(tower, { x: -10.5, y: FLOOR, z: -8.5, base: 4.5, height: 15, finish: TOWER, seed: 21 }));
    tower.emit(p.voxels, { seed: 23 });

    // ── The gallery ───────────────────────────────────────────────────────
    put(p, galleryFacade({ length: GX1 - GX0, door: true, gallery: 1.5, finish: GALLERY, seed: 31 }), { x: (GX0 + GX1) / 2, y: FLOOR, z: GZ });
    const galleryBox: Box = [GX0, FLOOR, GZ - 2.5, GX1, FLOOR + 8, GZ + 0.4];

    // ── The giant, its roots over the terrace's end and the broken wall ───
    // Built from the large tree's parts around that stone; should they fail (they're shared
    // work in progress), the stone and the tree asset as it is.
    const clear = [...near, nearWall].map((b) => [b[0] - TREE.x, b[2] - TREE.z, b[3] - TREE.x, b[5] - TREE.z]);
    let tree: KitPiece | null = null;
    try {
      const parts = await import('../assets/18.1/_large-tree-parts');
      const plan = parts.planTree(1, 22);
      // (its rubble only where it doesn't lie in the scene's stone)
      plan.stones = plan.stones.filter((q) => !clear.some(([x0, z0, x1, z1]) => q.min[0] < x1 && q.max[0] > x0 && q.min[2] < z1 && q.max[2] > z0));
      tree = giant(parts, plan, nearStone(plan.stones));
    } catch (e) {
      console.warn('[kit] tree-temple-wall: large-tree parts failed, using the asset', e);
    }
    if (tree) put(p, tree, { x: TREE.x, y: 0, z: TREE.z }, [galleryBox]);
    else {
      const bare = new PieceBuilder();
      nearStone().emit(bare.voxels, { seed: 18 });
      put(p, bare.done(), { x: TREE.x, y: 0, z: TREE.z });
      put(p, await ctx.get('18.1/large-tree', { seed: 1, height: 22 }), { x: TREE.x, y: 0, z: TREE.z }, [galleryBox, ...near]);
    }

    // ── Jungle behind ─────────────────────────────────────────────────────
    // (one broadleaf build, turned three ways: builds are cached per seed)
    const behind: [string, number, number, number, number, number, number][] = [
      ['18.1/medium-tree', -14.5, FLOOR, -9.5, 3, 12, 0],
      ['18.1/medium-tree', -3.5, FLOOR, -10, 3, 12, 1],
      ['18.1/medium-tree', 13, 0.5, -8.5, 3, 12, 2],
      ['18.1/small-tree', 9.5, 0.5, -8, 7, 5.5, 0],
    ];
    for (const [id, x, y, z, seed, height, turn] of behind) put(p, await ctx.get(id, { seed, height }), { x, y, z, turn }, [galleryBox]);

    // ── Flagged path along the front ──────────────────────────────────────
    const path = new BlockSet(0.125);
    for (let row = 0; row < 3; row++) {
      const z0 = 6 + row * 0.75;
      const ids = masonry(path, -16, -0.125, z0, 16, 0.125, z0 + 0.75, { length: [0.5, 1.25], course: 0.25, axis: 'x', palette: PATH, style: { surf: stoneSurf({ lichen: 0.12, moss: 0.12, stain: 0.2 }) }, seed: 40 + row });
      // A few slabs gone, grass in their place.
      for (const id of ids) if (r.chance(0.05)) path.remove(id);
    }
    for (const z0 of [5.75, 8.25]) masonry(path, -16, -0.125, z0, 16, 0.25, z0 + 0.25, { length: [0.75, 1.5], course: 0.375, axis: 'x', palette: RUIN.palette, style: tStyle, seed: 50 + z0 });
    path.emit(p.voxels, { seed: 52 });
    p.collider(-16, -0.125, 6, 16, 0.125, 8.25);
    p.collider(-16, 0, 5.75, 16, 0.25, 6);
    p.collider(-16, 0, 8.25, 16, 0.25, 8.5);

    // ── Bushes, fallen blocks, fragments ──────────────────────────────────
    const props: [string, string, number, number, number, number][] = [
      ['18.1/bush', 'bush', -13, 3.0, 2, 0],
      ['18.1/bush', 'shrub', -10, 4.4, 4, 1],
      ['18.1/bush', 'bush', 12.75, 2.5, 2, 3],
      ['20/fallen-blocks', 'pile', 10.75, -0.75, 2, 0],
      ['20/fallen-blocks', 'lintel', -14, 0.9, 3, 0],
      ['20/stone-fragments', 'scatter', 7, 1.75, 4, 1],
      ['20/stone-fragments', 'large', -5.5, 0.9, 2, 0],
    ];
    for (const [id, variant, x, z, seed, turn] of props) put(p, await ctx.get(id, { variant, seed }), { x, y: 0, z, turn });

    // ── Grass along the foot of the terrace and the wall, on the path ─────
    for (let x = GX0 + 0.5; x < GX1 + 1; x += r.range(0.8, 1.6)) {
      if (Math.abs(x - DOOR_X) < 1.8) continue;
      grassPatch(p, { at: [x, 0, TF + 1.25], w: r.range(0.5, 1.1), d: 0.4, height: r.int(4, 7), gap: 2.5, flowers: r.chance(0.25) ? 1 : 0, seed: r.int(1, 1e6), tones: GRASS_TONES.meadow });
    }
    for (let x = RUIN_X0 + 1.5; x < 15.5; x += r.range(0.8, 1.5)) grassPatch(p, { at: [x, 0.5, GZ + 0.4], w: r.range(0.4, 0.9), d: 0.35, height: r.int(3, 6), seed: r.int(1, 1e6), tones: GRASS_TONES.meadow });
    for (let x = GX0 + 0.5; x < GX1 - 1; x += r.range(1.2, 2.4)) grassPatch(p, { at: [x, FLOOR, TF - 0.3], w: r.range(0.3, 0.7), d: 0.3, height: r.int(3, 5), seed: r.int(1, 1e6), tones: GRASS_TONES.meadow });
    for (let n = 0; n < 16; n++) {
      const x = r.range(-15.5, 15.5);
      const z = r.range(4.5, 10.5);
      const onPath = z > 5.6 && z < 8.6;
      if (onPath && r.chance(0.6)) continue;
      grassPatch(p, { at: [x, onPath ? 0.125 : 0, z], w: r.range(0.4, 1.2), d: r.range(0.3, 0.7), height: r.int(4, 7), gap: 2.5, flowers: r.chance(0.3) ? 1 : 0, seed: r.int(1, 1e6), tones: GRASS_TONES.meadow });
    }
  },
});

/**
 * The §18.1 large tree, built from its parts (as the asset does) around the
 * stone it grows into: its buttress roots ride over the blocks of `stone`
 * (tree-local coordinates) and down their faces instead of passing through
 * them, and the stone is emitted with it, joined to the roots lying on it.
 */
function giant(parts: typeof import('../assets/18.1/_large-tree-parts'), plan: TreePlan, stone: BlockSet): KitPiece {
  const { buildBark, buildCanopy, buildVines, emitStones, treeColliders } = parts;
  const p = new PieceBuilder();
  const high = stone.bounds().max[1];
  const top = (x: number, z: number) => {
    for (let y = high; y > 0; y -= 0.125) if (stone.solidAt(x, y - 0.0625, z)) return y;
    return 0;
  };
  const inCanopy = buildCanopy(p, plan);
  const bark = buildBark(p, plan, stone, top, inCanopy);
  buildVines(p, plan, bark.solid, inCanopy);
  emitStones(p, stone, bark.drawn, plan.seed);
  treeColliders(p, plan, bark.rootTops);
  return p.done();
}
