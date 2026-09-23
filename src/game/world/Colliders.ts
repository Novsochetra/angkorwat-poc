import { traceSource, type SourceTrace } from '../../feedback/sourceTrace';

/**
 * Axis-aligned box colliders in metres with a uniform spatial hash, plus the
 * queries the character controller needs: ground height under a circle,
 * horizontal push-out and camera ray clipping. Everything in the test world
 * (causeway, stairs, walls, tower bases) is built from these boxes, so the same
 * data drives both what you see and what you collide with.
 */
export interface AABB {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
  /** Blocks movement but is never stood on (water, invisible bounds). */
  noStand?: boolean;
  /** The code that added this box (dev builds; shown by the feedback tool). */
  src?: SourceTrace;
}

const CELL = 16;
const key = (cx: number, cz: number) => cx * 73856093 + cz * 19349663;

export class ColliderWorld {
  readonly boxes: AABB[] = [];
  private readonly grid = new Map<number, number[]>();
  private readonly stamp: number[] = [];
  private query = 0;

  add(box: AABB): AABB {
    box.src ??= traceSource();
    const id = this.boxes.length;
    this.boxes.push(box);
    this.stamp.push(0);
    for (let cx = Math.floor(box.minX / CELL); cx <= Math.floor(box.maxX / CELL); cx++)
      for (let cz = Math.floor(box.minZ / CELL); cz <= Math.floor(box.maxZ / CELL); cz++) {
        const k = key(cx, cz);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(id);
      }
    return box;
  }

  addBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, extra: Partial<AABB> = {}): AABB {
    return this.add({
      minX: Math.min(x0, x1),
      minY: Math.min(y0, y1),
      minZ: Math.min(z0, z1),
      maxX: Math.max(x0, x1),
      maxY: Math.max(y0, y1),
      maxZ: Math.max(z0, z1),
      ...extra,
    });
  }

  /** Visit each box overlapping the XZ rectangle once. */
  forEachNear(minX: number, minZ: number, maxX: number, maxZ: number, fn: (b: AABB) => void): void {
    const q = ++this.query;
    for (let cx = Math.floor(minX / CELL); cx <= Math.floor(maxX / CELL); cx++)
      for (let cz = Math.floor(minZ / CELL); cz <= Math.floor(maxZ / CELL); cz++) {
        const list = this.grid.get(key(cx, cz));
        if (!list) continue;
        for (const id of list) {
          if (this.stamp[id] === q) continue;
          this.stamp[id] = q;
          const b = this.boxes[id];
          if (b.maxX < minX || b.minX > maxX || b.maxZ < minZ || b.minZ > maxZ) continue;
          fn(b);
        }
      }
  }

  /**
   * Highest standable surface under a circle whose top is at most `maxY`
   * (current feet + step height). Returns `floor` if nothing is there.
   */
  groundHeight(x: number, z: number, radius: number, maxY: number, floor = 0): number {
    let best = floor;
    const r = radius * 0.7; // stand on ledges once most of the foot is over them
    this.forEachNear(x - r, z - r, x + r, z + r, (b) => {
      if (b.noStand || b.maxY > maxY || b.maxY <= best) return;
      if (circleHitsBox(x, z, r, b)) best = b.maxY;
    });
    return best;
  }

  /**
   * Push a vertical capsule (circle in XZ between feet and head) out of every box
   * it overlaps that is too tall to step onto. Mutates and returns `pos`.
   */
  resolveHorizontal(pos: { x: number; z: number }, feetY: number, height: number, radius: number, step: number): { x: number; z: number; hit: boolean } {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      this.forEachNear(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius, (b) => {
        if (b.maxY <= feetY + step && !b.noStand) return; // can step onto it
        if (b.minY >= feetY + height || b.maxY <= feetY + 0.02) return; // above head / below feet
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        let dx = pos.x - cx;
        let dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) return;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2);
          const push = radius - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          // Centre inside the box: leave through the nearest side.
          const exits = [pos.x - b.minX, b.maxX - pos.x, pos.z - b.minZ, b.maxZ - pos.z];
          const m = Math.min(...exits);
          if (m === exits[0]) pos.x = b.minX - radius;
          else if (m === exits[1]) pos.x = b.maxX + radius;
          else if (m === exits[2]) pos.z = b.minZ - radius;
          else pos.z = b.maxZ + radius;
          dx = dz = 0;
        }
        moved = hit = true;
      });
      if (!moved) break;
    }
    return { x: pos.x, z: pos.z, hit };
  }

  /** Lowest ceiling above `feetY` over the circle (for jumping under lintels). */
  ceiling(x: number, z: number, radius: number, feetY: number): number {
    let best = Infinity;
    this.forEachNear(x - radius, z - radius, x + radius, z + radius, (b) => {
      if (b.minY > feetY && b.minY < best && circleHitsBox(x, z, radius, b)) best = b.minY;
    });
    return best;
  }

  /** Distance along a ray to the first box, or `maxDist`. Used to keep the camera out of walls. */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): number {
    let best = maxDist;
    const ex = ox + dx * maxDist;
    const ez = oz + dz * maxDist;
    this.forEachNear(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), (b) => {
      if (b.noStand) return;
      const t = rayBox(ox, oy, oz, dx, dy, dz, b);
      if (t >= 0 && t < best) best = t;
    });
    return best;
  }

  /** Nearest box along a ray, water and bounds included (the feedback tool's picker). */
  pick(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): { box: AABB; t: number } | null {
    let best: { box: AABB; t: number } | null = null;
    const ex = ox + dx * maxDist;
    const ez = oz + dz * maxDist;
    this.forEachNear(Math.min(ox, ex), Math.min(oz, ez), Math.max(ox, ex), Math.max(oz, ez), (b) => {
      const t = rayBox(ox, oy, oz, dx, dy, dz, b);
      if (t > 0 && t < (best?.t ?? maxDist)) best = { box: b, t };
    });
    return best;
  }

  /** Boxes containing a point, give or take `eps` metres. */
  boxesAt(x: number, y: number, z: number, eps = 0.02): AABB[] {
    const out: AABB[] = [];
    this.forEachNear(x - eps, z - eps, x + eps, z + eps, (b) => {
      if (y >= b.minY - eps && y <= b.maxY + eps) out.push(b);
    });
    return out;
  }
}

function circleHitsBox(x: number, z: number, r: number, b: AABB): boolean {
  const cx = Math.max(b.minX, Math.min(x, b.maxX));
  const cz = Math.max(b.minZ, Math.min(z, b.maxZ));
  return (x - cx) ** 2 + (z - cz) ** 2 < r * r;
}

function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: AABB): number {
  let tmin = -Infinity;
  let tmax = Infinity;
  const axes: [number, number, number, number][] = [
    [ox, dx, b.minX, b.maxX],
    [oy, dy, b.minY, b.maxY],
    [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return -1;
      continue;
    }
    let t1 = (lo - o) / d;
    let t2 = (hi - o) / d;
    if (t1 > t2) [t1, t2] = [t2, t1];
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }
  if (tmax < 0) return -1;
  return Math.max(0, tmin);
}
