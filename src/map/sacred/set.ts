import { Group, type Object3D } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import type { MapFrame } from '../types';
import { updateSacredLights } from './finish';

/**
 * A part's sculpted sacred pieces (statues, gables, offerings): one group to
 * add to the part's object, and the per-frame work (the candle lamps that
 * light the statues). Parts call `update(f)` from their own `update`.
 */
export class SacredSet {
  readonly object = new Group();

  constructor(name: string) {
    this.object.name = `${name}:sacred`;
  }

  /** Adds a piece (already placed in world metres); bug reports (B) name the line that added it. */
  add<T extends Object3D>(o: T): T {
    o.userData.source ??= traceSource();
    this.object.add(o);
    return o;
  }

  update(f: MapFrame): void {
    if (this.object.children.length) updateSacredLights(f.camera, f.night);
  }
}
