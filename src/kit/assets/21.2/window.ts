import { DryMasonry, finishLook } from '../../lib/gallery';
import { balusterWindow, mossTops, OPENING_FINISH, OPENINGS, pilaster, pilasterGrow, windowCut, windowExtent, type WindowOptions } from '../../lib/openings';
import { PieceBuilder } from '../../PieceBuilder';
import { defineKitAsset } from '../../types';
import { showWall } from './_openings-wall';

/**
 * §21.2 ② Window — the stone-bar window of Angkor Wat's galleries, framed as
 * on the sheet by a short piece of wall: carved pilasters at its ends, a base
 * moulding, a cornice over the top. The window itself (lib/openings) is a
 * moulded frame through the 1 m wall with a sill ledge and a drip band, and
 * seven lathe-turned balusters nearly touching — the sheet draws four.
 * Variants: five balusters in a smaller opening, a blind window (balusters
 * half sunk under a lowered stone blind) and a ruined one (broken balusters,
 * weathered stone).
 */

/** The piece: a 3.5 m bay of 1 m wall, its body 2.75 m to the cornice. */
const L = 3.5;
const WALL = OPENINGS.wall;
const H = 2.75;
/** End pilasters: the pillar's 0.5 m shaft, 0.125 m proud. */
const PIL = 0.5;

export default defineKitAsset({
  section: '21.2',
  order: 2,
  name: 'Window',
  caption: 'Stone-bar window for walls and galleries.',
  size: {
    real: 'clear opening 1.375 × 1.625 m, sill 0.5 m above the floor, moulded frame 0.1875 m (outer 1.75 × 2.0 m), 7 balusters 0.1875 m apart; in a 3.5 × 1.0 × 3.25 m piece of wall',
    sheet: 'a frame of about 1.5 × 1.5 m with 4 balusters, set in a wall two blocks thick',
    note: 'Measured Angkor Wat windows are ≈ 1.37 m wide and 1.5–1.8 m high with 7 balusters (some 5) so close their rings nearly touch, the sill ≈ 0.54 m above the gallery floor (SIZES-ARCH §1.5). The sheet’s four balusters are too few. The 5-baluster window is 1.0 × 1.375 m.',
  },
  variants: [
    { id: 'seven', name: '7 balusters' },
    { id: 'five', name: '5 balusters' },
    { id: 'blind', name: 'Blind window' },
    { id: 'ruined', name: 'Ruined window' },
  ],
  mainView: 'iso-low',
  shots: [
    { view: 'front', label: 'Front' },
    { view: 'side', label: 'Side' },
    { view: 'top', label: 'Top' },
    { view: 'iso', variant: 'blind', label: 'Blind window' },
    { view: 'iso', variant: 'ruined', label: 'Ruined' },
  ],
  ref: { sheet: 'section 21/Codex Image Sep 22, 2026, 12_46_24 PM.png', box: [269, 91, 510, 433] },
  build: ({ variant, seed }) => {
    const p = new PieceBuilder();
    const ruined = variant === 'ruined';
    const look = finishLook(ruined ? OPENING_FINISH.aged : OPENING_FINISH.sheet, seed, { moss: ruined ? 0.2 : 0.08 });
    const moss = ruined ? 0.8 : 0.5;
    const m = new DryMasonry(seed);
    const win: WindowOptions = {
      seed,
      look,
      mason: m,
      moss,
      ledge: 0,
      kind: variant === 'blind' ? 'blind' : 'open',
      broken: ruined ? 0.45 : 0,
      ...(variant === 'five' ? { width: 1.0, height: 1.375, balusters: 5 } : {}),
    };
    // Pilasters at the ends, their widest tiers flush with the ends, on both faces.
    const half = (PIL + pilasterGrow(PIL)) / 2;
    const skip: [number, number][] = [];
    for (const sx of [-1, 1]) {
      const x = sx * (L / 2 - half);
      skip.push([x - half, x + half]);
      for (const s of [1, -1] as const) pilaster(p, { x, z: (s * WALL) / 2, side: s, y: 0, height: H, width: PIL, proud: 0.125, capped: true, seed: seed + sx * 3 + s, look, mason: m, moss });
    }
    const tops = showWall(p, { length: L, thickness: WALL, height: H, cut: windowCut(win), look, mason: m, plinth: { h: 0.1875, skip, covered: [[windowExtent(win).x0, windowExtent(win).x1]] }, cornice: [0.3125, 0.375], keys: skip.map(([a, b]) => (a + b) / 2), seed });
    balusterWindow(p, win);
    m.emit(p.voxels);
    mossTops(p, tops, moss, seed + 5);
    return p.done();
  },
});
