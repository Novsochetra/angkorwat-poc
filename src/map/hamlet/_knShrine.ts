import { FLAGSTONE, pickTone, type Site } from '../jungle/_campKit';
import type { KnFx } from './_knFx';

/**
 * The picnic place's neak ta (អ្នកតា): the guardian spirit of the falls, at
 * the foot of the big shade tree. A little stone shrine shaped like an
 * Angkor tower (a square body with a dark doorway, three receding tiers
 * with small leaf antefixes at their corners, a lotus-bud top) on a laterite
 * plinth; before it the families' offerings: a bay sei (the banana-leaf
 * offering), an urn of incense sticks, two candles (lit at dusk: `_knFx.ts`),
 * a marigold garland, bananas and a can of drink; a band of bright cloth
 * tied round the tree's trunk behind it (a sacred tree).
 *
 * Site space (m): +z its front (toward the terrace), +x its left, y up from
 * the ground; `trunk` is the tree's trunk (local x, z). Families `mapStone`,
 * `petal`, `mapLeaf` (the bay sei).
 */

/** Weathered grey-brown sandstone (as at Bakheng and Kulen), a little lighter on the tiers' cornices. */
const STONE = [0x9d8f7a, 0x91836f, 0xa89a84, 0x877a67];
const LIGHT = [0xb8a98f, 0xaea086, 0xc1b298];

export function neakTa(s: Site, fx: KnFx, trunk: readonly [number, number] = [0, -1.9]): void {
  const tone = (list: readonly number[], a: number, b: number) => pickTone(list, a, b, 7, s.seed);
  // The plinth: two courses of laterite.
  s.box(0, 0.12, 0.05, 1.4, 0.24, 1.35, tone(FLAGSTONE, 1, 1), 'mapStone');
  s.box(0, 0.3, 0.02, 1.26, 0.12, 1.2, tone(FLAGSTONE, 2, 2), 'mapStone', { shade: 1.05 });
  // The tower's body, its doorway (dark) under a lintel, a figure of the neak ta inside.
  const zb = -0.2;
  s.box(0, 0.66, zb, 0.72, 0.6, 0.72, tone(STONE, 3, 3), 'mapStone');
  s.box(0, 0.6, zb + 0.35, 0.26, 0.4, 0.04, 0x2a2420, 'mapStone');
  s.box(0, 0.84, zb + 0.37, 0.38, 0.08, 0.05, tone(LIGHT, 4, 4), 'mapStone');
  s.box(0, 0.53, zb + 0.31, 0.1, 0.2, 0.06, 0xb8aa92, 'mapStone');
  // Three receding tiers, their cornices lighter, small leaf antefixes at the corners; a lotus bud on top.
  let y = 0.96;
  for (const [k, w] of [0.66, 0.52, 0.4].entries()) {
    s.box(0, y + 0.07, zb, w, 0.14, w, tone(STONE, 5 + k, k), 'mapStone');
    s.box(0, y + 0.15, zb, w + 0.04, 0.03, w + 0.04, tone(LIGHT, 6 + k, k), 'mapStone');
    for (const [ax, az] of [
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ])
      s.box((ax * w) / 2, y + 0.22, zb + (az * w) / 2, 0.06, 0.1, 0.06, tone(LIGHT, 7 + k, ax + az), 'mapStone');
    y += 0.18;
  }
  s.box(0, y + 0.08, zb, 0.2, 0.16, 0.2, tone(STONE, 9, 9), 'mapStone');
  s.box(0, y + 0.2, zb, 0.13, 0.1, 0.13, tone(LIGHT, 10, 10), 'mapStone');
  s.box(0, y + 0.29, zb, 0.06, 0.08, 0.06, tone(LIGHT, 11, 11), 'mapStone');

  // ── The offerings on the plinth's front ──
  const top = 0.36;
  const zo = 0.42;
  // The bay sei: a cone of folded banana leaf in tiers, a flower on its tip.
  for (const [k, w] of [0.2, 0.15, 0.11, 0.07].entries()) s.box(-0.4, top + 0.035 + k * 0.07, zo, w, 0.07, w, k % 2 ? 0x5a9a3a : 0x4e8a32, 'mapLeaf');
  s.box(-0.4, top + 0.32, zo, 0.06, 0.06, 0.06, 0xf0e8e0, 'petal');
  // The urn of incense (its sticks leaning a little), the candles either side of the door.
  s.box(0, top + 0.06, zo + 0.05, 0.16, 0.12, 0.16, 0xb8903a, 'mapStone');
  for (const [k, dx] of [-0.04, -0.015, 0.015, 0.04].entries()) s.box(dx, top + 0.26, zo + 0.05 + (k % 2) * 0.02, 0.012, 0.3, 0.012, 0xa8402a, 'petal', { rz: dx * 2 });
  for (const sx of [1, -1]) {
    s.box(sx * 0.2, top + 0.07, zo - 0.05, 0.05, 0.14, 0.05, 0xf2ecde, 'petal');
    const w = s.world(sx * 0.2, top + 0.17, zo - 0.05);
    fx.candle(w.x, w.y, w.z);
  }
  // A hand of bananas and a can of drink; a marigold garland along the front edge.
  s.box(0.4, top + 0.04, zo, 0.24, 0.06, 0.14, 0xe8c83a, 'petal', { ry: 0.4 });
  s.box(0.52, top + 0.07, zo - 0.12, 0.06, 0.13, 0.06, 0xd83a2e, 'mapStone');
  for (let k = 0; k < 7; k++) s.box(-0.6 + k * 0.2, top - 0.05 - (k % 2) * 0.03, 0.66, 0.12, 0.1, 0.08, k % 3 === 1 ? 0xf2c14a : 0xe8902a, 'petal');

  // ── The cloth tied round the tree's trunk (red, yellow, green bands) ──
  const [tx, tz] = trunk;
  for (const [k, c] of [0xc8342a, 0xe8c040, 0x3a8a4a].entries()) s.box(tx, 1.15 + k * 0.14, tz, 0.98, 0.13, 0.98, c, 'petal');
}
