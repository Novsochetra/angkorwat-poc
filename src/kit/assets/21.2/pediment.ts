import { finishLook } from '../../lib/gallery';
import { pediment, StoneWork } from '../../lib/carving';
import { mossTops, OPENING_FINISH } from '../../lib/openings';
import { PieceBuilder } from '../../PieceBuilder';
import { defineKitAsset } from '../../types';

/**
 * §21.2 ⑨ Pediment — "Decorative pediment for entrances and towers." The
 * sheet draws a tall stepped triangle of blocks: a carved base course, the
 * steps edged with flame-like tongues, a pointed niche with a crowned figure
 * at the centre, scroll reliefs all over the tympanum and curled ends at the
 * base corners. Built as Angkor Wat's door pediments are: the gable framed by
 * the naga's body, flame tongues along its rakes, a flame finial, the naga
 * rearing at each base corner as a fan of hoods over a curl, the sunk
 * tympanum with a four-armed deity in a pointed niche among foliate scrolls,
 * all carved across 0.5 m courses of stone. Front face at z = +0.25, flat back.
 */

const variants = [
  { id: 'door', name: 'Door (3.5 m)' },
  { id: 'gopura', name: 'Gopura (5.5 m)' },
  { id: 'devata', name: 'Devata niche' },
  { id: 'weathered', name: 'Weathered' },
];

export default defineKitAsset({
  section: '21.2',
  order: 9,
  name: 'Pediment',
  caption: 'Decorative pediment for entrances and towers.',
  size: {
    real: 'door pediment 3.5 m wide × 2.5 m tall × 0.5 m thick (central figure ≈ 1 m); gopura pediment 5.5 × 3.75 × 0.625 m',
    sheet: 'not given; drawn ≈ 7 cubes wide × 5 tall, a solid block 1 cube thick',
    note: 'SIZES-ARCH: over a door, the width of the door surround (3–4 m) and 2.0–2.5 m high; main gopura pediments 5–6 m wide. Checked against Banteay Srei’s pediment in the Musée Guimet (1.96 × 2.69 m, a miniature temple): height ≈ 0.7 × width, as built here. The sheet’s stepped outline, flame edge, niche figure and curled ends are kept; its ends become Angkor Wat’s rearing naga hoods.',
  },
  variants,
  shots: [
    { view: 'front', label: 'Front' },
    { view: 'side', label: 'Side' },
    { view: 'top', label: 'Top' },
    { view: 'front', variant: 'gopura', label: 'Gopura (5.5 m)' },
    { view: 'front', variant: 'devata', label: 'Devata niche' },
    { view: 'iso', variant: 'weathered', label: 'Weathered' },
  ],
  ref: { sheet: 'section 21/Codex Image Sep 22, 2026, 12_46_24 PM.png', box: [523, 443, 761, 741] },
  build: ({ variant, seed }) => {
    const p = new PieceBuilder();
    const weathered = variant === 'weathered';
    const gopura = variant === 'gopura';
    const w = new StoneWork({
      look: finishLook(weathered ? OPENING_FINISH.aged : OPENING_FINISH.sheet, seed, { moss: weathered ? 0.15 : 0.05 }),
      seed,
      recessMoss: weathered ? 0.5 : 0.18,
    });
    const { colliders, tops } = pediment(w, {
      width: gopura ? 5.5 : 3.5,
      height: gopura ? 3.75 : 2.5,
      depth: gopura ? 0.625 : 0.5,
      figure: variant === 'devata' ? 'devata' : 'deity',
      wear: weathered ? 0.4 : 0,
      seed,
    });
    w.emit(p.voxels);
    mossTops(p, tops, weathered ? 0.75 : 0.35, seed);
    for (const b of colliders) p.collider(...b);
    return p.done();
  },
});
