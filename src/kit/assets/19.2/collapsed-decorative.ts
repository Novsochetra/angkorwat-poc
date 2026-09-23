import { BlockSet } from '../../BlockSet';
import { PieceBuilder } from '../../PieceBuilder';
import { stoneSurf } from '../../surface';
import { defineKitAsset, type KitPiece } from '../../types';
import { hash3 } from '../../../voxel/random';
import { Mason, within, type ColliderBox } from './_damage-a';
import { JOINT, reliefStone, sheetTones, T, tileStones, type V3 } from './_damage-b';

/**
 * §19.2 ⑤ Collapsed decorative piece — "Broken or fallen decorative elements."
 * The sheet's card: a solid carved lintel block about 1.5–1.75 m wide and
 * 0.9 m high — a long stone carved with a band of lozenges and a plain pier,
 * a thick band projecting along the top, a crest of big stones — whose top
 * has broken away in steps towards its near end, a crest stone tumbled to the
 * ground and chunks lying at its foot, front right; a broken pediment corner
 * with a pointed niche; a fallen carved lintel; and, as the tile, the relief
 * seen from above (a stepped triangle, a spiral, a beaded band). Big whole
 * stones laid tight, reliefs cut a texel or two into the lit face with their
 * ground in shadow (not black), fresh rough breaks — so it reads at card size.
 * (Seen from our front-right camera the frieze runs the other way than on the
 * sheet, so its broken end is laid at the near, right end as the sheet's is.)
 */
/**
 * The card's weathered stone (lit faces #dba671 / #bc895f …): warm tans and a
 * couple of greyer, older stones, darker than ①–③; the heavy grime below takes
 * them towards the sheet's pier (median #916c54; ours renders #b0885e).
 */
const DECO = sheetTones(0xc8966a, 0xbe8e60, 0xcea070, 0xbc9872, 0xb08e6a);
/** Fresh breaks: rougher and a lighter orange. */
const BROKE = sheetTones(0xdcaa72, 0xd29f69, 0xe3b47e);
/**
 * Dressed faces weathered hard: the sheet's piece is mottled darker than ①–③
 * (dark and pale texels both) — grime over much of each face, but in texels,
 * not the pattern's big run-off streaks, which read as holes at card size.
 */
const DRESSED = stoneSurf({ stain: 0.52, lichen: 0.35, moss: 0.06 });
/** Carved stones: little grime, so the motifs stand clean and pale over their shadowed ground as on the sheet. */
const CARVED = stoneSurf({ stain: 0.18, lichen: 0.1 });
/** The look of the mason's stones: laid tight, breaks rough with a first trace of moss. */
const LOOK = { palette: DECO, surf: DRESSED, raw: BROKE, rough: stoneSurf({ stain: 0.42, moss: 0.06 }), tight: true };

type Box = { min: V3; max: V3 };
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => ({ min: [x0, y0, z0], max: [x1, y1, z1] });
const inside = (b: Box) => (x: number, y: number, z: number) => within(x, y, z, b.min, b.max);

// Relief motifs (see Mason.relief), top row first, one character per texel:
// '#' stands proud, anything else is cut back to the ground.

/**
 * The frieze's lozenge band (23 × 8): three bold diamonds seven texels
 * across, standing proud of a sunk field a texel apart, over a bottom fillet.
 */
const LOZENGES = [...Array(8)].map((_, r) =>
  [...Array(23)].map((_, u) => {
    const d = (((u - 3) % 8) + 8) % 8;
    return r === 7 || Math.min(d, 8 - d) + Math.abs(r - 3) <= 3 ? '#' : '.';
  }).join(''),
);
/** Three flame leaves with split hearts, a gap of ground by the left post (18 × 5). */
const FLAMES = ['...#.....#.....#..', '..###...###...###.', '..#.#...#.#...#.#.', '.##.##.##.##.##.##', '.#####.#####.#####'];
/** A pointed niche, cut deep into the pediment's tall stone (7 × 10). */
const NICHE = ['#######', '###.###', '##...##', '##...##', '#.....#', '#.....#', '#.....#', '#.....#', '#.....#', '#######'];

/** Lay out broken chunks: stones on the ground (and on each other). Damage them with {@link breakChunks}. */
function layChunks(m: Mason, stones: Box[]): Box[] {
  for (const s of stones) m.block(...s.min, ...s.max, DRESSED, { tight: false });
  return stones;
}

/** Knock a corner off each chunk and fray them all over; returns their bounds. */
function breakChunks(m: Mason, stones: Box[], seed: number): Box {
  stones.forEach((s, n) => {
    const at: V3 = [hash3(n, seed, 1, 5) < 0.5 ? s.min[0] : s.max[0], s.max[1], s.max[2]];
    m.breakAway({ at, reach: [(s.max[0] - s.min[0]) * 0.5, (s.max[2] - s.min[2]) * 0.5], below: (s.max[1] - s.min[1]) * 0.5, ledges: 2, rough: 0.3, clip: s }, seed + n);
  });
  const lo = (a: number) => Math.min(...stones.map((s) => s.min[a]));
  const hi = (a: number) => Math.max(...stones.map((s) => s.max[a]));
  const all = box(lo(0), 0, lo(2), hi(0), hi(1), hi(2));
  m.roughen(0.45, inside(all));
  return all;
}

/** Half the depth of the carved pieces: 0.375 m, so their carved fronts lead in the iso view. */
const Z = 0.1875;

/** A crest stone that tumbled off the break, askew on the ground in front of the pier (centre x, z, size, turn about y). */
const TUMBLED = { x: 0.56, z: 0.47, size: [0.375, 0.1875, 0.25] as V3, ry: 0.3 };

/** Axis-aligned bounds of the tumbled stone, turned about y (for its collider). */
function tumbledBox(): ColliderBox {
  const t = TUMBLED;
  const [hx, hz] = [t.size[0] / 2, t.size[2] / 2];
  const [c, s] = [Math.abs(Math.cos(t.ry)), Math.abs(Math.sin(t.ry))];
  const [ex, ez] = [hx * c + hz * s, hx * s + hz * c];
  return [t.x - ex, 0, t.z - ez, t.x + ex, t.size[1], t.z + ez];
}

/**
 * The collapsed frieze (1.75 × 0.375 m, 0.94 m high), one solid mass: the
 * long stone carved with the lozenge band and a pier; a thick band projecting
 * a texel over them (more, and its shadow would swallow the diamonds' upper
 * halves); a crest of big stones. The crest broke away in steps
 * down towards the pier at the near end and the band's end with it; the
 * pieces lie low in front of the pier, front right, clear of the relief (the
 * tumbled crest stone is added askew).
 */
function frieze(m: Mason, seed: number): ColliderBox[] {
  const [S, C, H] = [0.5, 0.6875, 0.9375];
  m.block(-0.875, 0, -Z, 0.5625, S, Z, CARVED, { tone: DECO[2] });
  m.block(0.5625, 0, -Z, 0.875, S, Z);
  m.row([-0.875, 0, 0.875], S, C, -Z, Z + T);
  // The crest's big stones, each its own tone so they read apart without dark joints.
  [-0.875, -0.5, -0.125, 0.375].forEach((x0, n, xs) => m.block(x0, C, -Z, xs[n + 1] ?? 0.875, H, Z, DRESSED, { tone: DECO[(n * 2 + 1) % DECO.length] }));
  const heap = layChunks(m, [box(0.5625, 0, 0.25, 0.875, 0.25, 0.5), box(0.6875, 0.25, 0.3125, 0.875, 0.4375, 0.5)]);
  // Moss takes on the crest where it broke.
  m.style((x, y) => x > 0.1 && y > C - 0.01, stoneSurf({ stain: 0.5, lichen: 0.3, moss: 0.3 }));
  // The lozenge band, its field cut a texel into the long stone (deeper, the 3/4 view would hide it behind the diamonds).
  m.relief({ at: [-0.875, S, Z], art: LOZENGES, depth: 1 });
  // The crest broke away in steps down to the right, most at the front, a bite out of the next stone…
  m.terrace({ ...box(-0.3125, C, -Z, 0.875, H, Z), fall: [1, 0.35], high: H, low: C, rise: 2 * T, rough: 0.15 }, seed + 1);
  m.breakAway({ at: [-0.125, H, Z], reach: [0.16, 0.2], below: 0.1875, ledges: 2, rough: 0.3, clip: box(-0.5, C, -Z, -0.125, H, Z) }, seed + 3);
  // …and the band's end with it, in texel-high ledges down to the pier.
  m.terrace({ ...box(0.125, S, -Z, 0.875, C, Z + T), fall: [1, 0.45], high: C, low: S, rise: T, rough: 0.2 }, seed + 2);
  m.roughen(0.25, (x, y) => x > -0.45 && y > S - 0.02);
  const a = breakChunks(m, heap, seed + 20);
  return [[-0.875, 0, -Z, 0.875, H, Z + T], [...a.min, ...a.max], tumbledBox()];
}

/**
 * A fallen carved lintel (1.5 × 0.375 m, 1 m high): a base band, end posts
 * framing a sunken panel of three flame leaves, a projecting band and cap
 * stones — the right end broken off in rough steps.
 */
function fallen(m: Mason, seed: number): void {
  m.row([-0.75, 0.0625, 0.75], 0, 0.1875, -Z, Z);
  m.block(-0.75, 0.1875, -Z, -0.5625, 0.5625, Z);
  m.block(-0.5625, 0.1875, -Z, 0.5625, 0.5625, Z - T, CARVED);
  m.block(0.5625, 0.1875, -Z, 0.75, 0.5625, Z);
  m.row([-0.75, -0.125, 0.75], 0.5625, 0.75, -Z, Z + T);
  m.row([-0.75, -0.25, 0.25, 0.75], 0.75, 1.0, -Z, Z);
  m.relief({ at: [-0.5625, 0.5, Z - T], art: FLAMES });
  // The right end broke off: the cap falls away in steps, the band and post bitten with it.
  m.terrace({ ...box(0.25, 0.75, -Z, 0.75, 1.0, Z), fall: [1, 0.3], high: 1.0, low: 0.75, rough: 0.2 }, seed + 1);
  m.breakAway({ at: [0.75, 0.75, Z + T], reach: [0.28, 0.34], below: 0.375, ledges: 3, rough: 0.3, clip: box(0.4375, 0.1875, -Z, 0.75, 0.75, Z + T) }, seed + 2);
  m.roughen(0.4, (x, y) => x > 0.3 && y > 0.15);
}

/**
 * A broken pediment corner (1.25 × 0.375 m, 1 m high): on a base course, stones
 * stepping down to the right, the tall one cut with a pointed niche; the steps
 * broken ragged and a chunk fallen at the foot.
 */
function pediment(m: Mason, seed: number): ColliderBox[] {
  m.row([-0.625, 0.0625, 0.625], 0, 0.25, -Z, Z);
  m.block(-0.625, 0.25, -Z, -0.125, 0.625, Z);
  m.block(-0.625, 0.625, -Z, -0.125, 1.0, Z);
  m.block(-0.125, 0.25, -Z, 0.25, 0.75, Z);
  m.block(0.25, 0.25, -Z, 0.625, 0.5, Z);
  const heap = layChunks(m, [box(0.375, 0, 0.3125, 0.625, 0.1875, 0.5625)]);
  m.relief({ at: [-0.625, 0.875, Z], art: NICHE, depth: 3 });
  // The steps broke: each stone's top falls away to the right.
  m.terrace({ ...box(-0.625, 0.625, -Z, -0.125, 1.0, Z), fall: [1, 0.2], high: 1.0, low: 0.8125, rough: 0.25 }, seed + 1);
  m.terrace({ ...box(-0.125, 0.25, -Z, 0.25, 0.75, Z), fall: [1, 0.3], high: 0.75, low: 0.5625, rough: 0.25 }, seed + 2);
  m.breakAway({ at: [0.625, 0.5, Z], reach: [0.24, 0.3], below: 0.1875, ledges: 2, rough: 0.3, clip: box(0.25, 0.25, -Z, 0.625, 0.5, Z) }, seed + 3);
  m.roughen(0.4, (x, y) => y > 0.3 && x > -0.3);
  const a = breakChunks(m, heap, seed + 20);
  return [[-0.625, 0, -Z, 0.625, 1.0, Z], [...a.min, ...a.max]];
}

/** The tile's scroll and leaf relief: a stepped leaf triangle with its bud (9 × 11)… */
const LEAF = ['....#....', '...###...', '...#+#...', '..##+##..', '..#+#+#..', '.##+#+##.', '.#+###+#.', '##+#m#+##', '#+++++++#', '#########', '.........'];
/** …and its spiral scroll (10 × 11). */
const SCROLL = ['.#######..', '##.....##.', '#..###..##', '#.##.##..#', '#.#...##.#', '#.#.#..#.#', '#.#.##.#.#', '#..#..##.#', '##..##..##', '.##....##.', '..######..'];

/**
 * The tile, 1.75 × 1.25 m seen from above: the relief stone (a stepped leaf
 * triangle with its bud and a spiral scroll inside a frame), the beaded band
 * below it, a bottom course and a mossy plain stone on the right.
 */
function tile(set: BlockSet, p: PieceBuilder): void {
  const h = 0.25;
  const style = { surf: DRESSED };
  const mossy = { surf: stoneSurf({ moss: 0.55, stain: 0.45, lichen: 0.2 }) };
  const stones = tileStones(p, 28, 20, h, [
    { rect: [0, 0, 21, 13], color: DECO[3] },
    { rect: [0, 14, 9, 17], color: DECO[0] },
    { rect: [10, 14, 21, 17], color: DECO[2] },
    { rect: [0, 18, 13, 20], color: DECO[1], style },
    { rect: [14, 18, 21, 20], color: DECO[0], style },
    { rect: [22, 0, 28, 9], color: DECO[1], style: mossy },
    { rect: [22, 10, 28, 20], color: DECO[2], style: mossy },
  ], { color: JOINT, surf: stoneSurf({ moss: 0.4 }) });
  // The relief stone and the two beaded band stones are carved; the rest are plain.
  const beads = (n: number, first: string) => ['#'.repeat(n), [...Array(n)].map((_, i) => ((i % 2 === 0) === (first === 'o') ? 'o' : '#')).join(''), '#'.repeat(n)];
  const arts = [['#'.repeat(21), '#'.repeat(21), ...LEAF.map((l, r) => '#' + l + SCROLL[r] + '#')], beads(9, '#'), beads(11, 'o')];
  stones.forEach((s, i) => {
    if (i < arts.length) reliefStone(set, { ...s, face: 'top', art: arts[i], ground: sheetTones(0x5a3f2a)[0], style }, p);
    else set.add(...s.min, ...s.max, s.color, s.style);
  });
}

function build(variant: string, seed: number): KitPiece {
  if (variant === 'tile') {
    const set = new BlockSet(T);
    const p = new PieceBuilder();
    tile(set, p);
    set.emit(p.voxels, { seed, jitter: 0.08 });
    p.boundsCollider();
    return p.done();
  }
  const m = new Mason(seed, LOOK);
  if (variant === 'pediment') return m.finish({ colliders: pediment(m, seed) });
  if (variant === 'fallen') {
    fallen(m, seed);
    return m.finish();
  }
  const piece = m.finish({ colliders: frieze(m, seed) });
  // The crest stone that tumbled off the break lies askew in front of the pier.
  const t = TUMBLED;
  piece.voxels.box(t.x, t.size[1] / 2, t.z, ...t.size, DECO[Math.floor(hash3(seed, 3, 9, 1) * DECO.length)], 'sandstone', { ry: t.ry, surf: DRESSED, shade: 0.96 });
  return piece;
}

export default defineKitAsset({
  section: '19.2',
  order: 5,
  name: 'Collapsed decorative piece',
  caption: 'Broken or fallen decorative elements.',
  size: {
    real: 'frieze 1.75 × 0.375 m, 0.94 m high; lintel 1.5 m long, 1 m high; pediment corner 1.25 m',
    sheet: 'not given',
    note: 'Laid in the kit’s sandstone courses — a 0.5 m storey, a 0.19 m band projecting 1/16 m, a 0.25 m crest of 0.375–0.5 m stones — 0.375 m deep like a lintel; Angkor’s lintels run 1.2–2 m. Reliefs are cut on the 1/16 m texel grid, one to two texels deep (the niche three), in bold motifs five to seven texels wide so they read at card size.',
  },
  variants: [
    { id: 'frieze', name: 'Collapsed frieze' },
    { id: 'pediment', name: 'Broken pediment corner' },
    { id: 'fallen', name: 'Fallen carved lintel' },
    { id: 'tile', name: 'Tile (top view)' },
  ],
  shots: [
    { view: 'iso', variant: 'pediment', label: 'Pediment corner' },
    { view: 'iso', variant: 'fallen', label: 'Fallen lintel' },
    { view: 'top', variant: 'tile', label: 'Tile (top view)' },
  ],
  ref: { sheet: 'section 19/DC8CFA59-53FC-45C2-9C62-F650EC8907C8.PNG', box: [1025, 131, 1266, 642] },
  build: ({ variant, seed }) => build(variant, seed),
});
