import { galleryRoofPiece, type GalleryRoofOptions } from '../../lib/roof';
import { SANDSTONE } from '../../palette';
import { stoneSurf, type StoneFinish } from '../../surface';
import { defineKitAsset } from '../../types';

/** The sheet's roof: the grey-brown stone of the §19.1 mossy sample, lichen and grime on it. */
const ROOF_STONE: StoneFinish = { palette: SANDSTONE.mossy, surf: stoneSurf({ stain: 0.35, moss: 0.12, lichen: 0.15 }), wear: 0.12 };

/**
 * ⑤ Roof tile — the gallery roof of the §21.2 sheet: a pitched stone roof
 * carved as rows of tiles, a ridge along the top and stepped gable ends with a
 * finial, the vault's dark opening under the front gable. Real Angkor roofs
 * are corbelled vaults whose outer face imitates tiles, so the module is a
 * roof over a real gallery (2.5 m corridor between 1.0 m walls), sitting on
 * the cornice at y = 0; the straight bays tile along X. Built with lib/roof.ts.
 */
const VARIANTS: Record<string, Omit<GalleryRoofOptions, 'seed'>> = {
  // As the sheet: a long roof (four bays), both ends gabled over the open vault.
  gabled: { length: 8, finish: ROOF_STONE, ends: ['arch', 'arch'] },
  // Closed gables with a carved tympanum, as at a gallery's end.
  closed: { length: 6, finish: ROOF_STONE, ends: ['gable', 'gable'] },
  // One 2 m bay, open at both ends: tiles along a gallery.
  bay: { length: 2, finish: ROOF_STONE },
  // A bay ending in a closed gable at +X.
  end: { length: 2, finish: ROOF_STONE, ends: ['open', 'gable'] },
  // The pillared half-gallery's lean-to, 1.5 m lower, against the main wall.
  lean: { length: 2, finish: ROOF_STONE, lean: true, width: 2.5, corridor: 2.0, rise: 2.0, ends: ['open', 'gable'] },
  // Mossy, grass along the ridge.
  mossy: { length: 4, finish: { ...ROOF_STONE, surf: stoneSurf({ moss: 0.35, stain: 0.3, lichen: 0.1 }) }, ends: ['arch', 'open'], moss: 0.45, grass: 0.7 },
};

export default defineKitAsset({
  section: '21.2',
  order: 5,
  name: 'Roof tile',
  caption: 'Roof tile for galleries and roofs.',
  size: {
    real: 'gallery roof over 4.5 m of wall (2.5 m corridor + 2 × 1.0 m walls), eaves 0.25 m over them (5.0 m wide); ridge 2.5 m above the cornice; 9 rows of 0.25 m, tiles 0.25 m wide, every other one a texel proud (the ribs); 2 m bays (8 m with gables); gables 0.5 m thick standing 0.5 m over the ridge, finial to 3.75 m',
    sheet: '≈ 3 × 2.5 m of cube blocks, ≈ 1.5 m high',
    note: 'Angkor’s gallery roofs are corbelled sandstone vaults carved outside as rows of curved tiles, rising 2–2.75 m above the cornice over a 2.2–2.9 m corridor (Glaize). The sheet’s block roof is a quarter of that; its look (tile rows over an eave band, ridge, stepped gables, finials) is kept on the real section. The ribs stand a texel (0.0625 m) proud rather than the real ≈ 0.125 m, which read as noise at this scale.',
  },
  variants: [
    { id: 'gabled', name: 'Gabled roof' },
    { id: 'closed', name: 'Closed gables' },
    { id: 'bay', name: '2 m bay' },
    { id: 'end', name: 'Gable end' },
    { id: 'lean', name: 'Half-gallery lean-to' },
    { id: 'mossy', name: 'Mossy' },
  ],
  shots: [
    { view: 'side', label: 'Front (gable)' },
    { view: 'front', label: 'Side' },
    { view: 'top', label: 'Top' },
  ],
  ref: { sheet: 'section 21/Codex Image Sep 22, 2026, 12_46_24 PM.png', box: [1031, 91, 1269, 433] },
  build: ({ variant, seed, height }) => {
    const v = VARIANTS[variant] ?? VARIANTS.gabled;
    return galleryRoofPiece({ ...v, seed, rise: height ?? v.rise });
  },
});
