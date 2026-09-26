import { Group } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import type { PlaceDef } from '../layout';
import { SacredSet } from '../sacred/set';
import type { MapContext, MapFrame, MapPart } from '../types';
import { buildLights } from './_sanctuaryGlow';
import { Mason, PAD_Y } from './_sanctuaryMason';
import { flight, galleryRing, gopura, steppedBase, terrace, tower, tree, vine, type GalleryStyle } from './_sanctuaryParts';
import { AltarGlow, hiddenSolid, mainGateShrine } from './_sanctuaryShrine';
import { buildPools, type Pool } from './_sanctuaryWater';

/**
 * Angkor Wat at real size on the summit mesa, the hero of the map: a temple
 * mountain of three levels, each ringed by a gallery.
 *
 * 1. The outer gallery on the pad (105 × 76 m) with corner towers, side
 *    gates and the main gate on the road: a tall gate tower over the warm,
 *    lit doorway, reached by a causeway between two reflecting pools.
 * 2. The middle terrace (8 m high) and its gallery, towers on its corners.
 * 3. The Bakan, a 13 m stepped base with steep stairs, its own gallery and
 *    the quincunx of lotus-bud towers: four corner towers (44 m above the
 *    pad) round the central tower (60 m), clearly taller and more pointed.
 *
 * From the overview camera the centre, the Bakan's corner towers and those
 * of the middle gallery step down to the sides as the five towers of the
 * concept art. Map metres; the temple's axis is x = 0, facing south (the
 * road, whose stairs and beacon at (0, 58, −165) stay open). The two summit
 * streams start inside the pad: the outer gallery bridges the west one.
 */

/** Level heights (m). */
const L2_Y = 64;
const BAKAN_Y = 77;
const CENTRE_Z = -209;

const OUTER: GalleryStyle = { depth: 4, plinth: 2, cols: 3, roof: 3, rhythm: 3, lamps: 0.4 };
const MIDDLE: GalleryStyle = { depth: 4, plinth: 1, cols: 3, roof: 2, rhythm: 3, lamps: 0.35 };
const INNER: GalleryStyle = { depth: 3, plinth: 1, cols: 3, roof: 2, rhythm: 3, lamps: 0.3 };

/** Reflecting pools and the moat round the front corners (water cells, inclusive). */
const POOLS: Pool[] = [
  { x0: -58, z0: -166, x1: -8, z1: -163 },
  { x0: 8, z0: -166, x1: 58, z1: -163 },
  { x0: -60, z0: -198, x1: -57, z1: -163 },
  { x0: 57, z0: -198, x1: 60, z1: -163 },
];
const WATER_Y = PAD_Y + 0.8;

export function buildSanctuary(ctx: MapContext, place: PlaceDef): MapPart {
  const b = new VoxelBuilder();
  const m = new Mason(b, ctx.field);
  const cz = CENTRE_Z;

  // ── Level 1: the outer gallery on the pad ────────────────────────────────
  galleryRing(m, -52, -245, 52, -170, PAD_Y, OUTER);
  for (const sx of [-1, 1])
    for (const z of [-171, -243]) gopura(m, { x: sx * 50, z, y: PAD_Y, hx: 3, hz: 3, plinth: 2, walls: 6, tower: { half: 3, top: 79 } });
  for (const sx of [-1, 1]) gopura(m, { x: sx * 50, z: cz, y: PAD_Y, hx: 2, hz: 5, plinth: 2, walls: 6, front: sx < 0 ? 'w' : 'e', passage: true });
  // The main gate on the road, with the lit doorway.
  gopura(m, {
    x: 0,
    z: -174,
    y: PAD_Y,
    hx: 10,
    hz: 4,
    plinth: 2,
    walls: 7,
    passage: true,
    front: 's',
    glow: true,
    porch: { half: 3, depth: 3 },
    backPorch: false,
    tower: { half: 5, top: 88, body: 2 },
  });
  // The Buddha in its passage, the lit door moved back behind him.
  const sacred = new SacredSet('sanctuary');
  const hidden = new VoxelBuilder();
  const glow = new AltarGlow({ seed: 5, scale: 1.3, halo: { off: [0, 0.25, 0.3], size: 2.6 } });
  mainGateShrine(m, b, hidden, sacred, glow);

  // ── Level 2: the middle terrace and its gallery ──────────────────────────
  terrace(m, -35, -236, 35, -181, PAD_Y, L2_Y);
  flight(m, 0, -181, 's', 0, 3, 3, PAD_Y, L2_Y);
  galleryRing(m, -35, -236, 35, -181, L2_Y, MIDDLE);
  gopura(m, { x: 0, z: -183, y: L2_Y, hx: 5, hz: 2, plinth: 1, walls: 5, passage: true, front: 's', porch: { half: 2, depth: 1 } });
  for (const sx of [-1, 1]) for (const z of [-184, -233]) tower(m, { x: sx * 30, z, y: L2_Y, half: 4, top: 91, body: 5, porch: { half: 1, depth: 1 }, lamps: ['s'] });

  // ── Level 3: the Bakan, its gallery and the quincunx ─────────────────────
  steppedBase(m, 0, cz, L2_Y, 21, 17, [2, 1, 1, 1, 2, 0, 0, 0, 1, -1, -1, -1, 0]);
  for (const side of ['s', 'n'] as const) flight(m, 0, cz, side, 17, 22, 2, L2_Y, BAKAN_Y);
  for (const side of ['e', 'w'] as const) flight(m, 0, cz, side, 21, 26, 2, L2_Y, BAKAN_Y);
  galleryRing(m, -20, cz - 16, 20, cz + 16, BAKAN_Y, INNER);
  gopura(m, { x: 0, z: cz + 15, y: BAKAN_Y, hx: 4, hz: 1, plinth: 1, walls: 5, passage: true, front: 's', glow: true, porch: { half: 2, depth: 1 } });
  for (const sx of [-1, 1])
    for (const dz of [-11, 11]) tower(m, { x: sx * 15, z: cz + dz, y: BAKAN_Y, half: 6, top: 100, body: 5, porch: { half: 2, depth: 1 }, lamps: ['s'] });
  // The central sanctuary: a podium with stairs, then the tallest tower.
  for (let r = 0; r < 3; r++) m.layer(0, BAKAN_Y + r, cz, 11, 3, r === 2 ? 'ledge' : 'face');
  for (const side of ['s', 'n', 'e', 'w'] as const) flight(m, 0, cz, side, 11, 13, 1, BAKAN_Y, BAKAN_Y + 3, false);
  tower(m, { x: 0, z: cz, y: BAKAN_Y + 3, half: 8, top: 116, body: 8, porch: { half: 3, depth: 2 }, doors: ['n', 'e', 'w'], glow: ['s'] });

  // ── Water: pools either side of the causeway, the moat round the corners ─
  const water = new Set<string>();
  for (const p of POOLS) for (let x = p.x0; x <= p.x1; x++) for (let z = p.z0; z <= p.z1; z++) water.add(`${x},${z}`);
  for (const p of POOLS)
    for (let x = p.x0 - 1; x <= p.x1 + 1; x++)
      for (let z = p.z0 - 1; z <= p.z1 + 1; z++) {
        if (water.has(`${x},${z}`) || m.has(x, PAD_Y, z)) continue;
        m.put(x, PAD_Y, z, 'ledge');
        // Low balustrades along the causeway.
        if (Math.abs(x) === 7 && z >= -167) m.put(x, PAD_Y + 1, z, 'face');
      }

  // Lily pads and a few lotus flowers on the water (free boxes, off the grid).
  const src = traceSource();
  for (const key of water) {
    const [x, z] = key.split(',').map(Number);
    const r = hash3(x, 3, z, 81);
    if (r > 0.1) continue;
    const ox = (hash3(x, 4, z, 82) - 0.5) * 0.4;
    const oz = (hash3(x, 5, z, 83) - 0.5) * 0.4;
    b.box(x + ox, WATER_Y + 0.04, z + oz, 0.9, 0.12, 0.9, r < 0.05 ? 0x4f7d2c : 0x5d8b33, 'mapLeaf', { src });
    if (r < 0.025) b.box(x + ox, WATER_Y + 0.3, z + oz, 0.4, 0.4, 0.4, 0xe8a2b8, 'mapLeaf', { src });
  }

  // ── Life: courtyard trees, vines, torches ────────────────────────────────
  const trees: [number, number, number, number][] = [
    [41, -188, 5, 3.6],
    [44, -206, 4, 3.2],
    [39, -224, 6, 4],
    [-41, -188, 5, 3.4],
    [-43, -202, 4, 3],
    [24, -239, 4, 3.2],
    [-12, -239, 3, 2.6],
    [-26, -178, 3, 2.4],
    [26, -178, 3, 2.6],
    [26, -228, 3, 2.4],
    [-26, -191, 3, 2.2],
  ];
  trees.forEach(([x, z, trunk, r], i) => {
    if (!m.wet(x, z)) tree(m, x, z, x > -31 && x < 31 && z > -233 && z < -185 ? L2_Y : PAD_Y, trunk, r, 300 + i);
  });
  // Vines down the outer gallery's front and sides and the middle terrace.
  for (let x = -45; x <= 45; x++) {
    const ax = Math.abs(x);
    if (ax >= 12 && hash3(x, 1, 5, 71) < 0.12) vine(m, x, -169, PAD_Y + 5, 2 + Math.floor(hash3(x, 2, 5, 72) * 3));
    if (ax >= 7 && ax <= 24 && hash3(x, 3, 5, 73) < 0.1) vine(m, x, -180, L2_Y - 1, 2 + Math.floor(hash3(x, 4, 5, 74) * 4));
  }
  for (let z = -238; z <= -176; z++) {
    if (Math.abs(z - cz) <= 7) continue;
    for (const sx of [-1, 1]) if (hash3(sx, z, 6, 75) < 0.1 && !m.wet(sx * 53, z)) vine(m, sx * 53, z, PAD_Y + 5, 2 + Math.floor(hash3(sx, z, 7, 76) * 3));
  }
  // Torches: along the outer colonnade, on the causeway, by the stairs and the gates.
  const torch = (x: number, y: number, z: number) => {
    m.put(x, y, z, 'ledge');
    m.glow({ x, y: y + 1.3, z, sx: 0.45, sy: 0.6, sz: 0.45, color: 0xff9a3a, kind: 'flame' });
  };
  for (const x of [-37, -25, -13, 13, 25, 37]) torch(x, PAD_Y + 2, -170);
  for (const sx of [-1, 1]) {
    torch(sx * 7, PAD_Y + 2, -162);
    torch(sx * 8, L2_Y + 1, -181);
    torch(sx * 6, BAKAN_Y, cz + 17);
  }

  m.commit((_x, y) => (y < 62 ? 0.2 : y < 66 ? 0.14 : y < 72 ? 0.09 : y < 80 ? 0.03 : 0));
  ctx.field.occupy(-62, -247, 62, -162);

  const object = new Group();
  object.name = `landmark:${place.id}`;
  object.add(buildVoxelMesh(b, { quality: 'medium', name: `landmark:${place.id}` }));
  // (the door's light hangs out over the forecourt, clear of the passage: the Buddha in it stays candle-lit)
  const lights = buildLights(m.glows, [0, PAD_Y + 7, -158]);
  const pools = buildPools(
    POOLS.map((p) => ({ x0: p.x0 - 0.5, z0: p.z0 - 0.5, x1: p.x1 + 0.5, z1: p.z1 + 0.5 })),
    WATER_Y,
  );
  object.add(lights.object, pools.mesh, glow.object, sacred.object, hiddenSolid(hidden, `landmark:${place.id}-solid`));
  return {
    name: `landmark:${place.id}`,
    object,
    blocks: b.boxes.length,
    update: (f: MapFrame) => {
      lights.update(f);
      pools.update(f);
      glow.update(f);
      sacred.update(f);
    },
  };
}
