import { BlockSet } from '../../BlockSet';
import { PieceBuilder } from '../../PieceBuilder';
import { stoneSurf } from '../../surface';
import { defineKitAsset, type KitPiece } from '../../types';
import { B, crumble, envelopeWear, JOINT, layWall, noise, ramp, sheetTones, T, tileStones, type Stone } from './_damage-b';

/**
 * §19.2 ④ Eroded edge: stacks of 0.5 m sandstone blocks whose exposed edges
 * and corners the weather has worn into rounded, terraced notches — deepest at
 * the top corner that faces the rain — with moss settling in the hollows and
 * joints. The sheet shows a 3-course wall worn down at its top right, a lower
 * wall whose top steps down to one end, a block stack with a worn corner and a
 * top-view tile of worn paving edges with moss in the joints.
 */

/** The card's stone (lit faces #efc088 / #ba8f69 …): a shade duller than clean sandstone. */
const STONE = sheetTones(0xcaa16c, 0xbd9563, 0xd2a976, 0xb48c5d);

type Wear = (x: number, y: number, z: number) => number;

/**
 * A wall of 0.5 m courses worn at its weather corner by `heavy` (metres of
 * wear), with a few notches along its other edges: stones the wear reaches
 * crumble into 1/8 m cubes, moss grows on them.
 */
function wall(set: BlockSet, w: number, courses: number, d: number, seed: number, heavy: Wear): void {
  const lay = layWall({
    x0: -w / 2,
    x1: w / 2,
    z0: -d / 2,
    z1: d / 2,
    courses: Array(courses).fill(B),
    length: [0.5, 0.8125],
    palette: STONE,
    seed: seed * 7 + 1,
    // Moss settles in patches, near the worn corner and low down where the rain runs off.
    style: (x, y, z) => ({
      surf: stoneSurf({ moss: 0.1 + 0.42 * ramp(0.35, 0.75, noise(x, y, z, 0.7, seed + 4)) + Math.min(0.3, heavy(x, y + B / 2, z)) + (y < B ? 0.12 : 0), stain: 0.55, lichen: 0.1 }),
    }),
    mortar: { surf: stoneSurf({ moss: 0.55 }) },
  });
  // The weather wears the top down in terraces; elsewhere the odd notch.
  const worn = envelopeWear(lay.min, lay.max, (x, y, z) => heavy(x, y, z) * (0.8 + 0.4 * noise(x, y, z, 0.3, seed + 11)), { mode: 'top' });
  const notched = envelopeWear(lay.min, lay.max, (x, y, z) => 0.8 * (noise(x, y, z, 0.3, seed + 13) - 0.6));
  const keep = (x: number, y: number, z: number) => worn(x, y, z) && notched(x, y, z);
  crumble(set, lay.stones, keep, { cell: [0.25, 0.125, 0.25], piece: terrace(0.42) });
  // The joint fill stays a texel inside whatever stone survives.
  const e = T;
  crumble(set, lay.joints, (x, y, z) => keep(x, y, z) && keep(x + e, y, z) && keep(x - e, y, z) && keep(x, y + e, z) && keep(x, y, z + e) && keep(x, y, z - e));
}

/** Terrace pieces darken with depth below their stone's top, as the sheet's stepped hollows do. */
const terrace = (moss: number) => (s: Stone, _x: number, y: number) => ({ surf: stoneSurf({ moss, stain: 0.5 }), shade: 1 - 1.4 * Math.max(0, s.max[1] - y - 0.04) });

/**
 * Worn paving, 1.5 × 1 m: stones whose top edges are worn down in texel-high
 * terraces — deepest where two stones meet in the middle — moss in the joints.
 */
function tile(set: BlockSet, p: PieceBuilder, seed: number): void {
  const style = (moss: number) => ({ surf: stoneSurf({ moss, stain: 0.55, lichen: 0.1 }) });
  const stones = tileStones(p, 24, 16, 0.25, [
    { rect: [0, 0, 8, 6], color: STONE[0], style: style(0.1) },
    { rect: [9, 0, 17, 6], color: STONE[1], style: style(0.12) },
    { rect: [18, 0, 24, 6], color: STONE[2], style: style(0.35) },
    { rect: [0, 7, 10, 16], color: STONE[3], style: style(0.18) },
    { rect: [11, 7, 24, 12], color: STONE[0], style: style(0.2) },
    { rect: [11, 13, 18, 16], color: STONE[2], style: style(0.18) },
    { rect: [19, 13, 24, 16], color: STONE[1], style: style(0.5) },
  ], { color: JOINT, surf: stoneSurf({ moss: 0.55 }) });
  // Hollows where the stones meet: the big one between the lower left and middle stones.
  const W = (x: number, y: number, z: number) =>
    (Math.max(0, 0.48 - Math.hypot(x + 0.1, z) * 0.8) + Math.max(0, 0.3 - Math.hypot(x - 0.32, z - 0.26) * 0.9)) * (0.75 + 0.5 * noise(x, y, z, 0.15, seed + 11)) +
    0.4 * (noise(x, y, z, 0.2, seed + 13) - 0.7);
  // (never deeper than two texels: worn, not holed)
  const keep = (x: number, y: number, z: number, s: Stone) => {
    const edge = Math.min(x - s.min[0], s.max[0] - x, z - s.min[2], s.max[2] - z);
    return y < s.max[1] - 2 * T || 2 * (s.max[1] - y) + edge >= W(x, y, z);
  };
  crumble(set, stones, keep, { cell: [0.125, 0.0625, 0.125], piece: terrace(0) });
}

function build(variant: string, seed: number): KitPiece {
  const set = new BlockSet(T);
  const p = new PieceBuilder();
  if (variant === 'tile') tile(set, p, seed);
  else if (variant === 'stepped') {
    // Two courses whose top steps down to the right end.
    wall(set, 1.5, 2, 1, seed, (x, y) => 0.62 * ramp(-0.15, 0.75, x) * ramp(0.2, 1, y));
  } else if (variant === 'corner') {
    // A 2 × 2 × 2 stack with its top front-left corner worn hollow.
    wall(set, 1, 2, 1, seed, (x, y, z) => 0.5 * ramp(0.25, -0.5, x) * ramp(-0.3, 0.5, z) * ramp(0.3, 1, y));
  } else {
    // Three courses worn down at the top right, the corner facing the weather.
    wall(set, 1.75, 3, 1, seed, (x, y, z) => 0.45 * ramp(-0.1, 0.875, x) * ramp(0.7, 1.5, y) * (0.7 + 0.3 * ramp(-0.5, 0.5, z)));
  }
  set.emit(p.voxels, { seed, jitter: 0.09 });
  p.boundsCollider();
  return p.done();
}

export default defineKitAsset({
  section: '19.2',
  order: 4,
  name: 'Eroded edge',
  caption: 'Edges worn down by time and elements.',
  size: {
    real: '0.5 m blocks; wall 1.75 × 1 m, 1.5 m high',
    sheet: 'not given',
    note: 'Built from the kit’s 0.5 m sandstone blocks (Angkor’s run 0.4–0.6 m high); the wear notches are 1/8 m terraces with 1/16 m chips, like the sheet.',
  },
  variants: [
    { id: 'wall', name: 'Eroded wall' },
    { id: 'stepped', name: 'Stepped eroded wall' },
    { id: 'corner', name: 'Worn corner stack' },
    { id: 'tile', name: 'Tile (top view)' },
  ],
  shots: [
    { view: 'iso', variant: 'stepped', label: 'Stepped wall' },
    { view: 'iso', variant: 'corner', label: 'Worn corner' },
    { view: 'top', variant: 'tile', label: 'Tile (top view)' },
  ],
  ref: { sheet: 'section 19/DC8CFA59-53FC-45C2-9C62-F650EC8907C8.PNG', box: [774, 131, 1014, 642] },
  build: ({ variant, seed }) => build(variant, seed),
});
