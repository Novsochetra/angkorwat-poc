import { DryMasonry, FACE, finishLook, type Box6 } from '../../lib/gallery';
import { terrace, type TerraceProfile } from '../../lib/terrace';
import { PieceBuilder } from '../../PieceBuilder';
import { snap } from '../../shapes';
import { defineKitAsset } from '../../types';
import { coreLook, coreShots } from './_core-looks';

/**
 * ⑧ Terrace platform — a large flat deck, as on the sheet: a plinth, two
 * courses of dado, a dark recessed band and over it a heavy projecting rim
 * of chunky coping stones framing a court of square slabs laid in straight
 * rows; a small stepped post on each corner of the rim (where a lion or a
 * naga's head could stand).
 */
const PROFILE: TerraceProfile = {
  base: [{ h: 0.25, out: 0.25 }],
  cornice: [
    { h: 0.125, out: -0.125, shade: 0.72 },
    { h: 0.375, out: 0.3125 },
  ],
};

/** A corner post's tiers: width and height (metres), bottom up. */
const POST: [number, number][] = [
  [0.75, 0.5],
  [0.5, 0.375],
  [0.3125, 0.25],
];

function build(variant: string, seed: number, height?: number) {
  // ('posts' and 'plain' are the sheet's mossy stone)
  const look = coreLook(variant);
  const H = snap(Math.max(1, height ?? 1.5), 0.25);
  const W = 8;
  const posts = variant !== 'plain';
  // The posts stand flush with the rim's outer faces at the corners.
  const corners = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ] as const;
  const postH = POST.reduce((a, [, h]) => a + h, 0);
  const clear: Box6[] = posts ? corners.map(([sx, sz]) => box(sx * (W / 2 - POST[0][0] / 2), H, sz * (W / 2 - POST[0][0] / 2), POST[0][0], postH)) : [];
  const p = new PieceBuilder();
  const m = new DryMasonry(seed);
  terrace(p, {
    width: W,
    depth: W,
    stages: [{ height: H, profile: PROFILE }],
    finish: look.finish,
    weather: look.weather,
    seed,
    paving: { grid: true, row: 1 },
    stones: { coping: [0.5, 0.75] },
    masonry: m,
    clear,
  });
  if (posts) {
    const stoneLook = finishLook(look.finish, seed + 3, { moss: (look.weather.moss ?? 0) * 0.3 });
    for (const [sx, sz] of corners) {
      const cx = sx * (W / 2 - POST[0][0] / 2);
      const cz = sz * (W / 2 - POST[0][0] / 2);
      let y = H;
      POST.forEach(([w, h]) => {
        m.course(box(cx, y, cz, w, h), { length: [2, 2], closed: FACE.ny, look: stoneLook });
        y += h;
      });
      p.collider(cx - POST[0][0] / 2, H, cz - POST[0][0] / 2, cx + POST[0][0] / 2, H + postH, cz + POST[0][0] / 2);
    }
  }
  m.emit(p.voxels);
  return p.done();
}

/** A box w × w × h standing on (x, y, z). */
function box(x: number, y: number, z: number, w: number, h: number): Box6 {
  return [x - w / 2, y, z - w / 2, x + w / 2, y + h, z + w / 2];
}

export default defineKitAsset({
  section: '16',
  order: 8,
  name: 'Terrace platform',
  caption: 'Flat terrace platform.',
  size: {
    real: '8 × 8 m (2 m grid), 1.5 m to the deck; slabs 1 m square, 0.25 m thick; corner posts 0.75 m square, 1.125 m above the deck; `height` sets the deck height',
    sheet: 'about 6 × 6 blocks, 4 courses (≈ 2 m), posts ≈ 2–3 blocks',
    note: 'Built on the 2 m grid to the inner avenue’s 1.5 m level (§1.8). Real paving slabs are 0.5–1.0 m and about 0.25 m thick; the sheet’s grid of big square slabs is kept at 1 m. The corner posts are pedestals of the size a guardian lion or naga head would stand on.',
  },
  variants: [
    { id: 'posts', name: 'Mossy, corner posts' },
    { id: 'plain', name: 'Without posts' },
    { id: 'weathered', name: 'Weathered' },
    { id: 'clean', name: 'Clean' },
  ],
  shots: coreShots({ view: 'iso', variant: 'plain', label: 'No posts' }),
  ref: { sheet: 'section 16/51F119C4-CD9A-4DB5-BCFD-840E8D3A151C.PNG', box: [744, 395, 1095, 665] },
  build: ({ variant, seed, height }) => build(variant, seed, height),
});
