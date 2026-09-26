import { FACE, finishLook, type Box6 } from '../../lib/gallery';
import { TEXEL as T } from '../../shapes';
import { lintel, petals, Relief, rosette, StoneWork, type LintelDesign, type V3 } from '../../lib/carving';
import { mossTops, OPENING_FINISH } from '../../lib/openings';
import { PieceBuilder } from '../../PieceBuilder';
import { defineKitAsset } from '../../types';

/**
 * §21.2 ⑧ Lintel — "Lintel for doorways and windows." The sheet draws a long
 * block on two short square posts: its ends (over the posts) stand out as
 * square blocks carved with hooked spirals, and between them runs a band of
 * scrolls around a central medallion. Built to a standard 1.25 m gallery
 * door: one 2.25 × 0.5 × 0.5 m stone bearing 0.5 m on each post, its end
 * sections a step proud with a curl turning inward (the makara / naga ends of
 * real lintels), the middle a sunk band carved on the half-texel grid. The
 * posts are the tops of the door jambs: 0.5 m square stones with a sunk
 * panel; `height` sets the whole height (e.g. 3.0 m = on 2.5 m jambs).
 */

const L = 2.25;
const H = 0.5;
const D = 0.5;
/** Posts: 0.5 m square, under the lintel's ends; the opening between them is 1.25 m. */
const POST = 0.5;

const variants: { id: string; name: string; design: LintelDesign; posts: number }[] = [
  { id: 'scroll', name: 'Scroll band', design: 'scroll', posts: 0.75 },
  { id: 'kala', name: 'Kala face', design: 'kala', posts: 0.75 },
  { id: 'doorway', name: 'On door jambs', design: 'kala', posts: 2.5 },
  { id: 'weathered', name: 'Weathered', design: 'scroll', posts: 0.75 },
  { id: 'plain', name: 'Lintel stone only', design: 'plain', posts: 0 },
];

export default defineKitAsset({
  section: '21.2',
  order: 8,
  name: 'Lintel',
  caption: 'Lintel for doorways and windows.',
  size: {
    real: 'lintel 2.25 × 0.5 m, 0.5 m deep (one ≈ 1.3 t stone) over a 1.25 m door; posts 0.5 m square — stubs 0.75 m tall as on the sheet, 2.5 m as door jambs',
    sheet: 'not given; drawn ≈ 8 × 2 cubes on posts 1.5 cubes tall',
    note: 'SIZES-ARCH: lintel 0.5 m tall, 0.375–0.5 m deep, clear width + 0.25–0.5 m each side; standard door 1.25 × 2.5 m. Museum lintels of earlier styles run taller (Met 38587, Baphuon: 0.68 × 2.05 m; National Museum of Cambodia, Banteay Srei: 0.82 × 1.86 m); Angkor Wat’s door lintels measure ≈ 0.5 m on photos. The sheet’s short posts are kept as jamb tops (use `height` or the “On door jambs” variant for a walkable 1.25 × 2.5 m doorway).',
  },
  variants: variants.map(({ id, name }) => ({ id, name })),
  shots: [
    { view: 'front', label: 'Front' },
    { view: 'side', label: 'Side' },
    { view: 'top', label: 'Top' },
    { view: 'front', variant: 'kala', label: 'Kala face' },
    { view: 'iso', variant: 'doorway', label: 'On door jambs' },
    { view: 'iso', variant: 'weathered', label: 'Weathered' },
  ],
  ref: { sheet: 'section 21/Codex Image Sep 22, 2026, 12_46_24 PM.png', box: [269, 443, 510, 741] },
  build: ({ variant, seed, height }) => {
    const v = variants.find((x) => x.id === variant) ?? variants[0];
    const weathered = variant === 'weathered';
    const p = new PieceBuilder();
    const w = new StoneWork({
      look: finishLook(weathered ? OPENING_FINISH.aged : OPENING_FINISH.sheet, seed, { moss: weathered ? 0.15 : 0.05 }),
      seed,
      recessMoss: weathered ? 0.45 : 0.15,
    });
    const posts = v.posts && height ? Math.max(0.5, Math.round((height - H) * 8) / 8) : v.posts;
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -L / 2 : L / 2 - POST;
      if (posts) {
        post(w, x0, posts, s);
        p.collider(x0, 0, -D / 2, x0 + POST, posts, D / 2);
      }
    }
    const box = lintel(w, { y0: posts, length: L, height: H, depth: D, design: v.design, wear: weathered ? 0.35 : 0, seed });
    w.emit(p.voxels);
    mossTops(p, [{ x0: box[0], z0: box[2], x1: box[3], z1: box[5], y: box[4], edges: FACE.px | FACE.nx | FACE.pz | FACE.nz }], weathered ? 0.65 : 0.45, seed);
    p.collider(...box);
    return p.done();
  },
});

/**
 * A post (a door jamb's top, or the whole jamb): shaft stones in 0.5 m
 * courses, each face carved with a sunk square round a rosette (the sheet's
 * carved squares), under a capital a texel proud with a band of lotus petals
 * — and on a jamb 1 m or taller, a matching base.
 */
function post(w: StoneWork, x0: number, h: number, side: number): void {
  const cap = 0.25;
  const base = h >= 1 ? 0.25 : 0;
  const cell = 1 / 32;
  const n = Math.round(POST / cell);
  const band = (y: number) => {
    // (petals hang from a fillet under the lintel, over a fillet at the capital's foot)
    const ph = Math.round(cap / cell);
    const r = petals(n + 4, ph, { width: 5, down: true }).rect(0, ph - 2, n + 4, ph, 2).rect(0, 0, n + 4, 1, 2);
    const box: Box6 = [x0 - T, y, -D / 2 - T, x0 + POST + T, y + cap, D / 2 + T];
    // (carved on the front and on the outer side, the faces a doorway shows)
    const outer = side < 0 ? { face: FACE.nx, at: [box[0], y, box[2]] as V3 } : { face: FACE.px, at: [box[3], y, box[5]] as V3 };
    w.stone(box, [{ face: FACE.pz, relief: r, at: [box[0], y, box[5]] }, { ...outer, relief: r }]);
  };
  if (base) band(0);
  for (let y = base; y < h - cap - 1e-6; y += 0.5) {
    const y1 = Math.min(h - cap, y + 0.5);
    const r = new Relief(n, Math.round((y1 - y) / cell), { face: 2 });
    if (r.h >= 12) {
      r.rect(2, 2, n - 2, r.h - 2, 0);
      const d = Math.min(n, r.h) - 6;
      r.stamp(rosette(d), Math.round(n / 2 - d / 2), Math.round(r.h / 2 - d / 2), { op: 'over', ground: 0 });
    }
    w.stone([x0, y, -D / 2, x0 + POST, y1, D / 2], [{ face: FACE.pz, relief: r, at: [x0, y, D / 2] }]);
  }
  band(h - cap);
}
