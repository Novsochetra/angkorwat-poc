import type { PlaceDef } from '../layout';
import type { MapContext, MapPart, PlaceId } from '../types';
import { buildKulen } from './kulen';
import { buildOverlook } from './overlook';
import { buildRivergate } from './rivergate';
import { buildSanctuary } from './sanctuary';
import { buildShrine } from './shrine';
import { buildTerrace } from './terrace';

/** The landmark of every place, one module each (built on the place's pad). */
export const LANDMARKS: Record<PlaceId, (ctx: MapContext, place: PlaceDef) => MapPart> = {
  sanctuary: buildSanctuary,
  kulen: buildKulen,
  terrace: buildTerrace,
  overlook: buildOverlook,
  shrine: buildShrine,
  rivergate: buildRivergate,
};
