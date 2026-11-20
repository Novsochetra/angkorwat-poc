import { Group } from 'three';
import type { MapContext, MapPart } from '../types';

/** The fireworks show's part (stub: filled by its workstream). */
export function buildFireworks(_ctx: MapContext): MapPart {
  return { name: 'fireworks', object: new Group() };
}
