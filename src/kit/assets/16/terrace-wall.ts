import type { Box6 } from '../../lib/gallery';
import { edgePlacement } from '../../lib/terrace';
import { PieceBuilder } from '../../PieceBuilder';
import { defineKitAsset } from '../../types';
import { EDGE_LOOKS, LEVEL, levelOf, nagaLook, put, SHEET_16, terraceArm, WALL_DEPTH, type EdgeLookId } from './_edges-arm';
import { nagaRunIn, PARAPET_INSET, piercedParapet, placeRun, type PostEnd } from './_edges-parapet';

/**
 * ④ Terrace wall — the retaining face of a terrace as a straight module that
 * tiles: 4 m of the terrace's moulded face (plinth and bands stepping in, the
 * dado, bands stepping out to the coping) with a strip of paved top behind
 * it, and on the rim the parapet — Angkor Wat's naga balustrade, the sheet's
 * pierced parapet with finial posts, or nothing (a plain coping).
 *
 * Placement: the module runs along X with its ends at x = ±2 (put the next
 * one at x + 4); its face (plinth and coping) at z = +1, its back at z = −1
 * where the terrace's fill carries on; walkable top at the level. Its face
 * is `terrace()`'s own for a one-stage body of that height, so it continues
 * the §16 terraces' faces and edges any terrace built with them. The ends and
 * back are dressed with plain ashlar (hidden once tiled).
 */
interface WallVariant {
  id: string;
  name: string;
  level: number;
  top: 'naga' | 'pierced' | 'none';
  /** The pierced parapet's ends. */
  ends?: readonly [PostEnd, PostEnd];
  look: EdgeLookId;
}

const VARIANTS: WallVariant[] = [
  { id: 'naga', name: 'Naga balustrade', level: LEVEL.first, top: 'naga', look: 'mossy' },
  { id: 'pierced', name: 'Pierced parapet (sheet)', level: LEVEL.first, top: 'pierced', ends: ['post', 'post'], look: 'mossy' },
  { id: 'coping', name: 'Plain coping', level: LEVEL.first, top: 'none', look: 'mossy' },
  { id: 'avenue', name: 'Avenue 1.5 m, naga', level: LEVEL.avenue, top: 'naga', look: 'mossy' },
  { id: 'run', name: 'Pierced, shared posts (tiles)', level: LEVEL.first, top: 'pierced', ends: ['half', 'half'], look: 'mossy' },
  { id: 'weathered', name: 'Weathered', level: LEVEL.first, top: 'naga', look: 'weathered' },
  { id: 'clean', name: 'Clean', level: LEVEL.first, top: 'pierced', ends: ['post', 'post'], look: 'clean' },
];

const L = 4;

function build(v: WallVariant, seed: number, height?: number) {
  const H = levelOf(height, v.level);
  const look = EDGE_LOOKS[v.look];
  const axis = WALL_DEPTH / 2 - PARAPET_INSET;
  const keepOff: Box6[] = v.top === 'none' ? [] : [[-L / 2, H - 0.125, axis - 0.5, L / 2, H + 2, axis + 0.5]];
  const { piece, info } = terraceArm({
    width: L,
    depth: WALL_DEPTH,
    height: H,
    sides: ['front'],
    dress: [{ side: 'back' }, { side: 'left' }, { side: 'right' }],
    look,
    seed,
    keepOff,
  });
  const p = new PieceBuilder();
  put(p, piece, 0, 0);
  const at = edgePlacement(info.edges[0], 0, PARAPET_INSET);
  if (v.top === 'naga') placeRun(p, at, nagaRunIn(nagaLook(look, seed + 5), -L / 2, L / 2));
  else if (v.top === 'pierced')
    placeRun(p, at, (q) => piercedParapet(q, { x0: -L / 2, x1: L / 2, ends: v.ends ?? ['post', 'post'], finish: look.finish, seed: seed + 5, moss: look.moss, grass: look.grass, wear: look.wear }));
  return p.done();
}

export default defineKitAsset({
  section: '16',
  order: 4,
  name: 'Terrace wall',
  caption: 'Straight terrace edge: moulded retaining face, paved top, parapet.',
  size: {
    real: '4.0 m module (ends at x = ±2) × 2.0 m deep (0.875 m moulded facing + 1.125 m of paving) × 3.25 m to the walkable top (first level; avenue 1.5 m; `height` sets it). Parapet 1.0 m on the rim, its axis 0.75 m behind the face: naga balustrade on 2 m post bays, or the pierced parapet with 0.875 m posts, finials 1.75 m',
    sheet: '≈ 7 openings between two end posts, a free-standing wall ≈ 3 courses high on a 2-course base, the posts ≈ 1.5 × the wall (≈ 2–3 m in all)',
    note: 'A terrace wall at Angkor Wat is the moulded retaining face of an earth-filled platform: the avenue stands 1.5 m up, the first level 3.3 m (SIZES-ARCH §1.8). Its face here is terrace()’s own Khmer base (plinth, fillet, torus and step bands, a dado of 0.5 m ashlars, the same mirrored under the coping), so it tiles with the §16 terraces. Angkor Wat’s terrace edges carry the naga balustrade, 1.0 m high (Glaize: the Grand Terrace’s “overhanging cornice … supports a naga-balustrade”), or nothing — so that is the default; the sheet’s pierced post-and-rail parapet is a variant built at the same real 1.0 m (its posts 1.375 m with a lotus-bud finial), not the sheet’s ≈ 2 m.',
  },
  variants: VARIANTS.map(({ id, name }) => ({ id, name })),
  shots: [
    { view: 'front', label: 'Front' },
    { view: 'side', label: 'Side' },
    { view: 'top', label: 'Top' },
    { view: 'iso', variant: 'pierced', label: 'Pierced parapet (sheet)' },
    { view: 'front', variant: 'pierced', label: 'Pierced, front' },
    { view: 'iso', variant: 'coping', label: 'Plain coping' },
    { view: 'iso', variant: 'avenue', label: 'Avenue 1.5 m' },
    { view: 'iso', variant: 'run', label: 'Shared posts (tiles)' },
    { view: 'iso', variant: 'weathered', label: 'Weathered' },
    { view: 'iso', variant: 'clean', label: 'Clean' },
  ],
  ref: { sheet: SHEET_16, box: [928, 92, 1215, 382] },
  build: ({ variant, seed, height }) => build(VARIANTS.find((x) => x.id === variant) ?? VARIANTS[0], seed, height),
});
