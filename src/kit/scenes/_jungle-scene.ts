import { hash3 } from '../../voxel/random';
import { BlockSet, masonry } from '../BlockSet';
import { SANDSTONE, SOIL } from '../palette';
import type { PieceBuilder } from '../PieceBuilder';
import { rng, snap, TEXEL } from '../shapes';
import { leafSurf, soilSurf, stoneSurf, STONE_FINISH } from '../surface';
import type { Surf } from '../../voxel/VoxelBuilder';

/**
 * Architecture of the "Dense jungle vegetation" diorama (§18.1 environment
 * examples): the sheet's small sanctuary on its terrace, a broken tower in the
 * trees behind and a stretch of paving — stand-ins in weathered, mossy 0.5 m
 * sandstone until the temple sections are built.
 */

/** Weathered stone going green: the §19.1 mossy and weathered tones mixed. */
const RUIN = [...STONE_FINISH.mossy.palette, ...STONE_FINISH.weathered.palette.slice(0, 3)];
/** Moss thick on the tops, run-off stains down the faces. */
const RUIN_SURF = stoneSurf({ moss: 0.55, lichen: 0.12, stain: 0.35 });
/** The lower courses and the terrace: damper, greener. */
const LOW_SURF = stoneSurf({ moss: 0.62, lichen: 0.08, stain: 0.45 });
/** Hanging creepers on the stone. */
const CREEPER = [0x5f7f34, 0x6f8f38, 0x4f6f30, 0x7f9a3c];

type Lay = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, seed: number, o?: { axis?: 'x' | 'z'; length?: [number, number]; course?: number; surf?: Surf }) => void;

function layer(set: BlockSet): Lay {
  return (x0, y0, z0, x1, y1, z1, seed, o = {}) =>
    masonry(set, x0, y0, z0, x1, y1, z1, { length: o.length ?? [0.5, 1.25], course: o.course ?? 0.5, depth: 0.75, axis: o.axis ?? 'x', palette: RUIN, style: { surf: o.surf ?? RUIN_SURF }, seed });
}

/**
 * The sheet's small sanctuary, half swallowed by the jungle: a moulded
 * terrace with steps up the front between cheek walls, a gallery whose front
 * is a colonnade of square pillars on bases carrying an architrave, the dark
 * hall behind them showing between the pillars, a projecting cornice and a
 * roof of three tiers stepping in to a crown. Weathered and mossy, a few
 * blocks gone, one roof corner fallen (its blocks are the scene's to place).
 * Faces +z; (x, z) is the middle of the terrace's front edge, on the 1/4 m
 * grid like the stones. Returns the terrace's footprint [x0, z0, x1, z1] (metres).
 */
export function ruinedShrine(p: PieceBuilder, o: { x: number; z: number; seed: number }): [number, number, number, number] {
  // The massive terrace on a quarter-metre carve grid (its chips read at a distance and stay cheap), the sanctuary on the finer one.
  const base = new BlockSet(0.25);
  const set = new BlockSet(0.125);
  const lay = layer(set);
  const { x, z, seed } = o;
  const r = rng(seed);
  // Terrace: 9 × 7.5 m, a base course, a recessed band and a projecting top course.
  const [tx0, tx1, tz0, tz1] = [x - 4.5, x + 4.5, z - 7.5, z];
  const H = 1.25;
  const layBase = layer(base);
  layBase(tx0, 0, tz0, tx1, 0.5, tz1, seed, { surf: LOW_SURF });
  layBase(tx0 + 0.25, 0.5, tz0 + 0.25, tx1 - 0.25, 1.0, tz1 - 0.25, seed + 1, { surf: LOW_SURF });
  layBase(tx0 - 0.25, 1.0, tz0 - 0.25, tx1 + 0.25, H, tz1 + 0.25, seed + 2, { course: 0.25, length: [0.75, 1.5] });
  // Steps up the front, between cheek walls.
  const steps = 5;
  const tread = 0.35;
  for (let k = 0; k < steps; k++) {
    const z1 = tz1 + (steps - k) * tread;
    set.add(x - 1.25, k * 0.25, tz1, x + 1.25, (k + 1) * 0.25, z1, RUIN[(k * 3) % RUIN.length], { surf: LOW_SURF });
    p.collider(x - 1.25, 0, tz1, x + 1.25, (k + 1) * 0.25, z1);
  }
  for (const s of [-1, 1]) {
    set.add(x + s * 1.25, 0, tz1, x + s * 1.875, 1.0, tz1 + steps * tread, RUIN[s < 0 ? 1 : 4], { surf: RUIN_SURF });
    p.collider(Math.min(x + s * 1.25, x + s * 1.875), 0, tz1, Math.max(x + s * 1.25, x + s * 1.875), 1.0, tz1 + steps * tread);
  }
  p.collider(tx0, 0, tz0, tx1, H, tz1);

  // The gallery: 7 × 5 m on the terrace, closed at the back and the ends, open to the front.
  const y0 = H;
  const [sx0, sx1] = [x - 3.5, x + 3.5];
  const [sz0, sz1] = [tz0 + 1.0, tz1 - 1.5];
  const top = y0 + 3.5;
  lay(sx0, y0, sz0, sx1, top, sz0 + 1, seed + 10);
  // (End walls 0.625 m thick: the gaps either side of the four pillars all come out 0.75 m.)
  lay(sx0, y0, sz0 + 1, sx0 + 0.625, top, sz1, seed + 11, { axis: 'z' });
  lay(sx1 - 0.625, y0, sz0 + 1, sx1, top, sz1, seed + 12, { axis: 'z' });
  // The dark hall: its back wall and floor in deep shadow, seen between the pillars.
  const dark = SANDSTONE.cavity;
  p.voxels.span(sx0 + 0.625, y0, sz0 + 1, sx1 - 0.625, top, sz0 + 1.125, dark[0], 'sandstone', { surf: stoneSurf() });
  p.voxels.span(sx0 + 0.625, y0, sz0 + 1.125, sx1 - 0.625, y0 + 0.0625, sz1 - 0.5, dark[2], 'sandstone', { surf: stoneSurf() });
  // The colonnade: four square pillars on bases, capitals, an architrave across them.
  const pz: [number, number] = [sz1 - 0.5, sz1];
  for (let n = 0; n < 4; n++) {
    const px = x + (n - 1.5) * 1.25;
    // (Base and capital an eighth proud of the shaft all round: on the carve grid.)
    set.add(px - 0.375, y0, pz[0] - 0.125, px + 0.375, y0 + 0.25, pz[1] + 0.125, RUIN[n % RUIN.length], { surf: LOW_SURF });
    lay(px - 0.25, y0 + 0.25, pz[0], px + 0.25, top - 0.75, pz[1], seed + 30 + n, { length: [0.5, 0.5], axis: 'z' });
    set.add(px - 0.375, top - 0.75, pz[0] - 0.125, px + 0.375, top - 0.5, pz[1] + 0.125, RUIN[(n + 2) % RUIN.length], { surf: RUIN_SURF });
    p.collider(px - 0.375, y0, pz[0] - 0.125, px + 0.375, top - 0.5, pz[1] + 0.125);
  }
  lay(sx0, top - 0.5, pz[0], sx1, top, pz[1], seed + 35, { length: [1.25, 2.0] });
  // Cornice: two courses stepping out over the walls and the porch; the
  // roof: three tiers stepping in, each with a moulding at its foot, and a
  // crown. (On the coarse grid: their chips and the fallen corner read from afar.)
  layBase(sx0 - 0.25, top, sz0 - 0.25, sx1 + 0.25, top + 0.25, sz1 + 0.25, seed + 40, { course: 0.25 });
  layBase(sx0 - 0.5, top + 0.25, sz0 - 0.5, sx1 + 0.5, top + 0.5, sz1 + 0.5, seed + 41, { course: 0.25 });
  let [rx0, rz0, rx1, rz1] = [sx0 + 0.25, sz0 + 0.25, sx1 - 0.25, sz1 - 0.25];
  let ry = top + 0.5;
  for (let t = 0; t < 3; t++) {
    const h = t === 0 ? 1.0 : 0.75;
    layBase(rx0, ry, rz0, rx1, ry + h, rz1, seed + 50 + t);
    layBase(rx0 - 0.25, ry + h, rz0 - 0.25, rx1 + 0.25, ry + h + 0.25, rz1 + 0.25, seed + 55 + t, { course: 0.25 });
    ry += h + 0.25;
    [rx0, rz0, rx1, rz1] = [rx0 + 0.75, rz0 + 0.5, rx1 - 0.75, rz1 - 0.5];
  }
  const cx = snap((rx0 + rx1) / 2, 0.25);
  const cz = snap((rz0 + rz1) / 2, 0.25);
  layBase(cx - 0.75, ry, cz - 0.5, cx + 0.75, ry + 0.75, cz + 0.5, seed + 60);
  base.add(cx - 0.25, ry + 0.75, cz - 0.25, cx + 0.25, ry + 1.25, cz + 0.25, RUIN[2], { surf: RUIN_SURF });
  p.collider(sx0, y0, sz0, sx1, top, sz0 + 1);
  p.collider(sx0, y0, sz0 + 1, sx0 + 0.625, top, sz1);
  p.collider(sx1 - 0.625, y0, sz0 + 1, sx1, top, sz1);
  p.collider(sx0 - 0.5, top - 0.5, sz0 - 0.5, sx1 + 0.5, ry, sz1 + 0.5);

  // Ruin: the right front roof corner has fallen, blocks are missing from the
  // roof and the terrace edge, every edge is chipped.
  base.carveSphere(sx1 - 0.25, top + 1.4, sz1 - 0.25, 1.6, seed + 3, 0.4);
  const loose = base.find((bx, by) => by > top + 0.4 && (bx < sx0 + 1 || bx > sx1 - 1.5));
  for (let n = 0; n < 3 && loose.length; n++) base.remove(loose.splice(r.int(0, loose.length - 1), 1)[0]);
  const edge = base.find((bx, by, bz) => by > 0.5 && (bz > tz1 - 0.6 || bx < tx0 + 0.6) && Math.abs(bx - x) > 2.25);
  for (let n = 0; n < 3 && edge.length; n++) base.remove(edge.splice(r.int(0, edge.length - 1), 1)[0]);
  base.erode(0.28, seed + 4);
  set.erode(0.16, seed + 5);
  base.emit(p.voxels, { seed });
  set.emit(p.voxels, { seed });

  // Creepers hanging from the cornice, and from the first roof tier down to the cornice.
  for (let n = 0; n < 9; n++) {
    const vx = snap(r.range(sx0, sx1));
    const onRoof = r.chance(0.35);
    const vy = onRoof ? top + 1.5 : top + 0.25;
    const vz = snap(onRoof ? sz1 - 0.125 : sz1 + 0.3125);
    const len = onRoof ? 1.0 : snap(r.range(0.8, 2.6), 0.25);
    for (let y = vy; y > vy - len + 1e-6; y -= 0.25) {
      const w = TEXEL * (hash3(n, Math.round(y * 4), 1, seed) < 0.5 ? 3 : 4);
      p.voxels.box(vx + (hash3(n, Math.round(y * 4), 2, seed) < 0.3 ? TEXEL : 0), y - 0.125, vz, w, 0.25, w, CREEPER[(n + Math.round(y * 4)) % CREEPER.length], 'leaves', { surf: leafSurf() });
    }
  }
  return [tx0, tz0, tx1, tz1 + steps * tread];
}

/**
 * A broken tower (prasat) in the trees: a square body on a plinth, a doorway,
 * then tiers stepping in, the top ones fallen. (x, z) is its centre, on the
 * 1/4 m grid.
 */
export function towerStub(p: PieceBuilder, o: { x: number; z: number; seed: number; height?: number }): void {
  const set = new BlockSet(0.25);
  const lay = layer(set);
  const { x, z, seed } = o;
  const H = o.height ?? 6;
  const body = snap(H * 0.55, 0.25);
  lay(x - 2, 0, z - 2, x + 2, 0.75, z + 2, seed, { surf: LOW_SURF, course: 0.375 });
  lay(x - 1.75, 0.75, z - 1.75, x + 1.75, body, z + 1.75, seed + 1);
  let y = body;
  let w = 2.0;
  for (let t = 0; y < H; t++) {
    lay(x - w, y, z - w, x + w, y + 0.25, z + w, seed + 10 + t, { course: 0.25 });
    lay(x - w + 0.25, y + 0.25, z - w + 0.25, x + w - 0.25, y + 0.75, z + w - 0.25, seed + 20 + t);
    y += 0.75;
    w -= 0.5;
  }
  // A dark doorway in the front.
  p.voxels.span(x - 0.5, 0.75, z + 1.25, x + 0.5, 2.75, z + 1.375, SANDSTONE.cavity[0], 'sandstone', { surf: stoneSurf() });
  set.carve((bx, by, bz) => Math.abs(bx - x) < 0.5 && by > 0.75 && by < 2.75 && bz > z + 1.25);
  // The top has come down on one side.
  set.carveSphere(x + 1.4, H - 0.4, z + 0.8, 1.7, seed + 3, 0.45);
  set.erode(0.35, seed + 5);
  set.emit(p.voxels, { seed });
  p.collider(x - 2, 0, z - 2, x + 2, 0.75, z + 2);
  p.collider(x - 1.75, 0.75, z - 1.75, x + 1.75, body, z + 1.75);
}

/** Top of the paved path: two texels proud of the ground, on the paving's 1/8 m carve grid. */
export const PATH_TOP = 0.125;

/**
 * A stretch of paving along x (the sheet's path at the panel's foot): rows of
 * slabs, weathered, a few missing, moss in the joints. Top at PATH_TOP.
 */
export function pavedPath(p: PieceBuilder, o: { x0: number; x1: number; z: number; w: number; seed: number }): void {
  const set = new BlockSet(0.125);
  const rows = Math.round(o.w / 0.75);
  for (let n = 0; n < rows; n++) {
    const z0 = o.z - o.w / 2 + n * 0.75;
    masonry(set, o.x0, -0.25, z0, o.x1, PATH_TOP, z0 + 0.75, { length: [0.5, 1.25], course: 0.3125, axis: 'x', palette: [...SANDSTONE.weathered, SANDSTONE.mossy[0]], style: { surf: stoneSurf({ moss: 0.35, lichen: 0.15, stain: 0.3 }) }, seed: o.seed + n });
  }
  const r = rng(o.seed);
  const slabs = set.find((_x, y) => y > -0.1);
  for (let n = 0; n < 4 && slabs.length; n++) set.remove(slabs.splice(r.int(0, slabs.length - 1), 1)[0]);
  set.erode(0.2, o.seed + 1);
  set.emit(p.voxels, { seed: o.seed });
  p.collider(o.x0, -0.25, o.z - o.w / 2, o.x1, PATH_TOP, o.z + o.w / 2);
}

/**
 * A scene's forest floor, laid last: 1 m soil blocks (sides merged, so the
 * pattern runs on unbroken), damp, mossy and dark where the canopy closes
 * overhead, grassy and brighter where it opens — the patchy light on the
 * sheet's jungle floor. Top at y = 0, `depth` deep (default 0.5 m); one collider.
 */
export function forestFloor(p: PieceBuilder, o: { w: number; d: number; depth?: number }): void {
  const depth = o.depth ?? 0.5;
  const ni = Math.round(o.w);
  const nk = Math.round(o.d);
  const [x0, z0] = [-o.w / 2, -o.d / 2];
  // Leaf cover above head height, per metre square, blurred a little.
  const cover = new Float32Array(ni * nk);
  for (const b of p.voxels.boxes) {
    if (b.mat !== 'leaves' || b.y < 3) continue;
    const i = Math.floor(b.x - x0);
    const k = Math.floor(b.z - z0);
    if (i >= 0 && i < ni && k >= 0 && k < nk) cover[k * ni + i] += b.sx * b.sz;
  }
  const at = (i: number, k: number) => cover[Math.min(nk - 1, Math.max(0, k)) * ni + Math.min(ni - 1, Math.max(0, i))];
  for (let k = 0; k < nk; k++)
    for (let i = 0; i < ni; i++) {
      let c = 0;
      for (let di = -1; di <= 1; di++) for (let dk = -1; dk <= 1; dk++) c += at(i + di, k + dk) / (di || dk ? 12 : 3);
      const shade = Math.min(1, c / 2.5);
      const r = hash3(i, 7, k, 5);
      const surf = soilSurf({ grass: 0.9 - 0.55 * shade, moss: 0.3 + 0.4 * shade, wet: 0.15 + 0.4 * shade });
      const color = shade > 0.5 ? SOIL.humus[Math.floor(r * 3)] : SOIL.dirt[Math.floor(r * 5)];
      // Sides against another square merge into it; only the outer edge is open.
      const merge = (i < ni - 1 ? 1 : 0) | (i > 0 ? 2 : 0) | (k < nk - 1 ? 16 : 0) | (k > 0 ? 32 : 0);
      p.voxels.box(x0 + i + 0.5, -depth / 2, z0 + k + 0.5, 1, depth, 1, color, 'soil', { surf, merge, open: 63 & ~merge });
    }
  p.collider(x0, -depth, z0, x0 + o.w, 0, z0 + o.d);
}
