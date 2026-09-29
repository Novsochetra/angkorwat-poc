import { Box3, Vector3 } from 'three';
import { FIRST_Z0 } from '../heightfield';
import { MAP_BOUNDS } from '../layout';

/**
 * The map cut into square chunks (their rows on the back edge the map was
 * first made with, heightfield.ts `FIRST_Z0`: as the map grows north, the
 * land and the jungle keep their chunks, and so switch to plain boxes where
 * they did). Plain data: the build workers (map/work/) use it too.
 */
export class ChunkGrid {
  private readonly cx: number;
  private readonly cz: number;
  /** North edge of the first row of chunks (m). */
  private readonly z0: number;
  /** Number of chunks. */
  readonly count: number;

  /** `size`: chunk side (m). */
  constructor(readonly size: number) {
    this.z0 = FIRST_Z0 - Math.ceil((FIRST_Z0 - MAP_BOUNDS.z0) / size) * size;
    this.cx = Math.ceil((MAP_BOUNDS.x1 - MAP_BOUNDS.x0) / size);
    this.cz = Math.ceil((MAP_BOUNDS.z1 - this.z0) / size);
    this.count = this.cx * this.cz;
  }

  /** Chunk of a map point (points off the map go to the nearest chunk). */
  at(x: number, z: number): number {
    const a = Math.min(this.cx - 1, Math.max(0, Math.floor((x - MAP_BOUNDS.x0) / this.size)));
    const b = Math.min(this.cz - 1, Math.max(0, Math.floor((z - this.z0) / this.size)));
    return a + b * this.cx;
  }

  /** A chunk's ground plan, as a box of any height. */
  box(n: number): Box3 {
    const a = n % this.cx;
    const b = (n - a) / this.cx;
    const x0 = MAP_BOUNDS.x0 + a * this.size;
    const z0 = this.z0 + b * this.size;
    return new Box3(new Vector3(x0, -Infinity, z0), new Vector3(x0 + this.size, Infinity, z0 + this.size));
  }
}
