import { DryMasonry, finishLook } from '../../lib/gallery';
import { doorCut, doorExtent, doorFrame, mossTops, OPENING_FINISH, OPENINGS, type DoorOptions, type DoorSize } from '../../lib/openings';
import { PieceBuilder } from '../../PieceBuilder';
import { defineKitAsset } from '../../types';
import { showWall } from './_openings-wall';

/**
 * §21.2 ③ Door — a gallery doorway in its piece of wall, as on the sheet a
 * portal of piers under a heavy lintel band over a threshold, built the way
 * Angkor Wat's doors are: a 2 : 1 opening (the sheet's is 3 : 1) lined by
 * jambs, octagonal colonnettes carrying a proud carved lintel, pilasters
 * outside them — a surround about three times the clear width — on both
 * faces. Walkable: the opening stays clear in the colliders. Variants: the
 * standard, main (axial) and small doors, and a false door of carved leaves.
 */

const WALL = OPENINGS.wall;

export default defineKitAsset({
  section: '21.2',
  order: 3,
  name: 'Door',
  caption: 'Doorway for entrances and interior rooms.',
  size: {
    real: 'clear 1.25 × 2.5 m over a 0.125 m threshold, 0.5 m lintels, surround 3.9 m wide; main 1.75 × 3.375 m, small 1.0 × 2.0625 m; in 1.0 m walls 4.0 / 5.0 / 3.0 m long',
    sheet: 'an opening about 1 × 3 m (3 : 1) between plain piers two blocks wide',
    note: 'Measured Angkor Wat doors are ≈ 2 : 1 (an inner door ≈ 0.99 × 2.06 m next to a 1.37 m window), framed by colonnettes and pilasters about 3 × the clear width under a 0.5 m lintel (SIZES-ARCH §1.4). The sheet’s narrow 3 : 1 opening and plain piers are neither. The small door still clears the 1.70 m explorer.',
  },
  variants: [
    { id: 'standard', name: 'Gallery door' },
    { id: 'main', name: 'Main door' },
    { id: 'small', name: 'Small door' },
    { id: 'false', name: 'False door' },
  ],
  mainView: 'iso-low',
  shots: [
    { view: 'front', label: 'Front' },
    { view: 'side', label: 'Side' },
    { view: 'top', label: 'Top' },
    { view: 'iso', variant: 'main', label: 'Main door' },
    { view: 'iso', variant: 'false', label: 'False door' },
  ],
  ref: { sheet: 'section 21/Codex Image Sep 22, 2026, 12_46_24 PM.png', box: [523, 91, 761, 433] },
  build: ({ variant, seed }) => {
    const p = new PieceBuilder();
    const size: DoorSize = variant === 'main' || variant === 'small' ? variant : 'standard';
    const look = finishLook(OPENING_FINISH.sheet, seed, { moss: 0.08 });
    const m = new DryMasonry(seed);
    const door: DoorOptions = { seed, look, mason: m, size, kind: variant === 'false' ? 'false' : 'open', moss: 0.5 };
    // The wall: as long as the surround (whole half metres), a course over the lintel.
    const ext = doorExtent(door);
    const L = Math.ceil((ext.x1 - ext.x0) / 0.5 - 1e-6) * 0.5;
    const cut = doorCut(door);
    const tops = showWall(p, { length: L, thickness: WALL, height: cut[4] + 0.375, cut, look, mason: m, cornice: [0.3125, 0.375], keys: [ext.x0 + 0.375, ext.x1 - 0.375], seed });
    doorFrame(p, door);
    m.emit(p.voxels);
    mossTops(p, tops, 0.5, seed + 5);
    return p.done();
  },
});
