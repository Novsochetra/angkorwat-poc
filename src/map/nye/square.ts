import { Group } from 'three';
import type { MapContext } from '../types';
import type { NyePiece } from './index';

/** The festival square (stub: filled by its workstream). */
export function buildNyeSquare(_ctx: MapContext): NyePiece {
  return { object: new Group() };
}
