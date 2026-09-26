import { FACE, finishLook } from '../../lib/gallery';
import { mossTops, OPENING_FINISH } from '../../lib/openings';
import { keyBand, moulding, mouldingCorner, petals, StoneWork, weather, type Band, type Relief } from '../../lib/carving';
import { PieceBuilder } from '../../PieceBuilder';
import { defineKitAsset } from '../../types';

/**
 * §21.2 ⑦ Cornice — "Decorative cornice for roof edges and wall tops." The
 * sheet draws a long block whose top two courses project as a heavy cap over
 * a set-back band carved with key cartouches (square spirals), moss on the
 * top. Built as Angkor Wat's cornices are: stacked projecting bands on top of
 * a 1.0 m wall — a frieze of key cartouches a texel proud of the wall face, a
 * band with a row of pendant lotus petals on a fillet, and the cap — laid in
 * running bond through the wall with the carving running across the joints.
 * Module 2.0 m along x (ends exactly at ±1 m, the key pattern repeats every
 * 0.5 m so modules tile), sitting on the wall top at y = 0, the wall's faces
 * at z = ±0.5.
 */

/** The profile, bottom up (metres; `out` = projection in front of the wall face). */
const FRIEZE: Band = { h: 0.25, out: 0.0625, relief: (w, h) => keyBand(w, h) };
const PETALS: Band = { h: 0.25, out: 0.1875, relief: (w, h) => petalRow(w, h) };
const CAP: Band = { h: 0.25, out: 0.3125 };

/** Pendant lotus petals hanging from the band's top under a fillet, on its lower part. */
function petalRow(w: number, h: number) {
  const r = petals(w, h, { width: 8, down: true });
  // (a plain fillet along the top edge, where the petals hang from)
  return r.rect(0, h - 2, w, h, r.face);
}

const variants = [
  { id: 'carved', name: 'Wall top (carved)' },
  { id: 'roof-edge', name: 'Roof edge' },
  { id: 'corner', name: 'Corner' },
  { id: 'weathered', name: 'Weathered' },
];

export default defineKitAsset({
  section: '21.2',
  order: 7,
  name: 'Cornice',
  caption: 'Decorative cornice for roof edges and wall tops.',
  size: {
    real: '2.0 m module × 0.75 m high: 0.25 m key frieze + 0.5 m cornice (two 0.25 m bands); projects 0.3125 m past a 1.0 m wall (1.625 m deep as a wall top, 1.3125 m as a roof edge)',
    sheet: 'not given; drawn ≈ 5 × 4 cubes (as tall as it is long)',
    note: 'SIZES-ARCH: cornice 0.5 m (2 × 0.25 m bands) projecting 0.25–0.375 m on 1.0 m gallery walls, 2 m module. The sheet’s key-pattern band under the cap is kept as a 0.25 m frieze course, so the piece stands 0.75 m; the sheet’s chunky proportions (height ≈ length) are not a real cornice’s. The key cartouches are cut a texel deep on the half-texel grid (0.25 m apart), so the pattern reads at card size.',
  },
  variants,
  mainView: 'iso-low',
  shots: [
    { view: 'front', label: 'Front' },
    { view: 'side', label: 'Side' },
    { view: 'top', label: 'Top' },
    { view: 'iso', variant: 'roof-edge', label: 'Roof edge' },
    { view: 'iso', variant: 'corner', label: 'Corner' },
    { view: 'iso', variant: 'weathered', label: 'Weathered' },
  ],
  ref: { sheet: 'section 21/Codex Image Sep 22, 2026, 12_46_24 PM.png', box: [21, 443, 255, 741] },
  build: ({ variant, seed, height }) => {
    const p = new PieceBuilder();
    // (`height` sets the module's length here: whole metres, 2 m by default)
    const L = height ? Math.max(1, Math.round(height)) : 2;
    const weathered = variant === 'weathered';
    const finish = weathered ? OPENING_FINISH.aged : OPENING_FINISH.sheet;
    const w = new StoneWork({ look: finishLook(finish, seed, { moss: weathered ? 0.15 : 0.05 }), seed, recessMoss: weathered ? 0.45 : 0.2 });
    const bands = weathered ? [FRIEZE, PETALS, CAP].map((b) => ({ ...b, relief: b.relief && ((cw: number, ch: number) => wear(b.relief!(cw, ch), seed)) })) : [FRIEZE, PETALS, CAP];
    const boxes =
      variant === 'corner'
        ? mouldingCorner(w, { x0: -1.5, z0: -1.5, front: 0.5, side: 0.5, thick: 1, bands, seed })
        : moulding(w, { x0: -L / 2, x1: L / 2, front: 0.5, back: -0.5, sides: variant === 'roof-edge' ? 'front' : 'both', bands, seed });
    w.emit(p.voxels);
    // Moss along the cap's free edges (a straight module's ends continue into the next one).
    const cap = boxes.slice(-(variant === 'corner' ? 2 : 1));
    const edges = variant === 'corner' ? [FACE.pz | FACE.px, FACE.px] : [FACE.pz | (variant === 'roof-edge' ? 0 : FACE.nz)];
    mossTops(p, cap.map((b, i) => ({ x0: b[0], z0: b[2], x1: b[3], z1: b[5], y: b[4], edges: edges[i] })), weathered ? 0.75 : 0.55, seed);
    for (const b of boxes) p.collider(...b);
    return p.done();
  },
});

/** Weathered carving: the cartouches and petals worn down in patches. */
function wear(r: Relief, seed: number): Relief {
  return weather(r, 0.45, seed + 11);
}
