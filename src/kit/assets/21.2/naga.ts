import { NAGA, nagaBalustrade, NAGA_FINISH, type NagaBalustradeOptions } from '../../lib/naga';
import { fromSheet, SANDSTONE } from '../../palette';
import { PieceBuilder } from '../../PieceBuilder';
import { placePiece } from '../../place';
import { stoneSurf, type StoneFinish } from '../../surface';
import { defineKitAsset, type KitPiece } from '../../types';

/**
 * §21.2 ⑩ Naga — "Naga for balustrades and causeways." Built with the shared
 * naga library (src/kit/lib/naga.ts) to the real Angkor Wat balustrade rather
 * than the sheet's single dragon head on a solid plinth: the seven-headed
 * cobra fan rearing on its post at the end of a round, scaled body carried on
 * short open posts.
 *
 * The library runs balustrades along X; here each variant is turned a quarter
 * so it lies as on the sheet — the body running back along −Z and the end
 * facing the viewer (+Z) — which puts the fan face-on in the front view and
 * the body's length in the side view, like the sheet's small views.
 */

/** Old, grey-brown stone for the weathered variant (the §21 sheet's weathered tones, through fromSheet), darker in patches. */
const WEATHERED: StoneFinish = {
  palette: [0xa98664, 0x9e7c5e, 0xb08e6c, 0x977a60, 0xa6865f, SANDSTONE.weathered[0], SANDSTONE.weathered[3]].map((c, i) => (i < 5 ? fromSheet(c) : c)),
  surf: stoneSurf({ moss: 0.25, lichen: 0.2, stain: 0.45, crack: 0.2 }),
  wear: 0.3,
};

const VARIANTS: Record<string, Omit<NagaBalustradeOptions, 'seed'>> = {
  head: { bays: 1, right: 'head' },
  run: { bays: 2 },
  tail: { bays: 1, right: 'tail' },
  full: { bays: 2, left: 'tail', right: 'head' },
  weathered: { bays: 1, right: 'head', finish: WEATHERED, moss: 0.5, broken: 0.6 },
};

/** A piece turned so its +X end faces +Z (the library's run along X → along Z). */
function toFront(piece: KitPiece): KitPiece {
  const p = new PieceBuilder();
  placePiece({ voxels: p.voxels, collider: (c) => p.colliders.push(c) }, piece, { x: 0, y: 0, z: 0, turn: 3 });
  return p.done();
}

export default defineKitAsset({
  section: '21.2',
  order: 10,
  name: 'Naga',
  caption: 'Naga for balustrades and causeways.',
  size: {
    real: `seven-headed end ${NAGA.headTop} m tall, fan ${NAGA.fanWidth} m wide, on a 0.625 m post and 0.3125 m step block; balustrade ${NAGA.top} m high — body ⌀ ${NAGA.body} m on 0.4375 m posts every ${NAGA.bay} m over a ${NAGA.kerb} m kerb, ${NAGA.width} m wide; tail curls up to ≈ 2.2 m`,
    sheet: 'one dragon head ≈ 2.5 m high, the body lying on a solid plinth of two block courses (≈ 1 m)',
    note:
      'Angkor Wat’s naga is a seven-headed cobra: the hoods fan out 1.3–1.5 m wide over a flame-edged halo, rising ≈ 2 m on their own post (top 2.5–3 m above the deck), and its body is round (⌀ ≈ 0.4 m) on short open posts ≈ 2 m apart — you see between them — with the top at 1.0–1.1 m (SIZES-ARCH §1.10, scaled on photos of the causeway naga beside its 1.4 m lion, and walkers). The sheet’s single head and solid plinth follow no real naga, so the form and sizes come from the monument; the warm, mossy voxel stone comes from the sheet.',
  },
  variants: [
    { id: 'head', name: 'Head end' },
    { id: 'run', name: 'Balustrade' },
    { id: 'tail', name: 'Tail end' },
    { id: 'full', name: 'Head and tail' },
    { id: 'weathered', name: 'Weathered' },
  ],
  shots: [
    { view: 'front', label: 'Front' },
    { view: 'side', label: 'Side' },
    { view: 'top', label: 'Top' },
  ],
  ref: { sheet: 'section 21/Codex Image Sep 22, 2026, 12_46_24 PM.png', box: [775, 443, 1015, 741] },
  build({ variant, seed }) {
    const v = VARIANTS[variant] ?? VARIANTS.head;
    return toFront(nagaBalustrade({ finish: NAGA_FINISH, ...v, seed }));
  },
});
