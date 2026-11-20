import { Group } from 'three';
import type { MapContext } from '../types';
import type { NyePiece } from './index';

/** The stage and the countdown board (stub: filled by its workstream). */
export function buildNyeStage(_ctx: MapContext): NyePiece {
  return { object: new Group() };
}
