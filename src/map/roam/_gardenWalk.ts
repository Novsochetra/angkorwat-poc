import { KINDS, stageOf, trunkAt } from '../garden/kinds';
import { GARDEN, type Plant } from '../garden/state';
import type { RoamWorld } from './types';

/**
 * His garden's trees in the walk map (roam/walkmap.ts is made once from the
 * map's parts; the garden grows after): a tree's trunk from its third stage
 * on (garden/kinds.ts `trunkAt`: half its girth while young, all of it grown)
 * is a wall to his feet, as the village's trunks are; its crown is something
 * the follow camera keeps out of softly, as it keeps out of the map's crowns
 * (and sees through them: the near fade, roam/_nearFade.ts). Laid over the
 * world's `standAt`, `clearance` and `softClearance` (as _homeWalk.ts lays the
 * doorway's wall): where no tree of his stands, every answer is the world's
 * own.
 *
 * Cheap: at most a dozen trees (and the pagoda's bodhi), a box round them all
 * first, then a distance test each. The list is made again when the garden
 * changes (a tree planted, grown a stage, pulled out; `GARDEN.on`).
 */

interface Tree {
  x: number;
  z: number;
  /** The trunk: its radius (m; 0: none yet) and from the ground to the crown's top. */
  r: number;
  y0: number;
  y1: number;
  /** The crown: its radius and from where it begins (to `y1`); 0: none for the camera. */
  cr: number;
  c0: number;
}

/** The share of a grown tree's height each stage stands (the camera's crown; the models are near it). */
const TALL = [0.05, 0.15, 0.35, 0.6, 1];

export function installGardenWalk(world: RoamWorld): void {
  const trees: Tree[] = [];
  /** Feet over the ground per plant (the walk map's ground, made once a plant). */
  const ground = new Map<number, number>();
  let dirty = true;
  let seen: readonly Plant[] | null = null;
  let seenN = -1;
  /** A box round every tree and crown (m). */
  let x0 = 0;
  let x1 = -1;
  let z0 = 0;
  let z1 = -1;
  GARDEN.on((e) => {
    if (e.type === 'planted' || e.type === 'stage' || e.type === 'grown' || e.type === 'died' || e.type === 'cleared' || e.type === 'picked') dirty = true;
  });
  const { standAt, clearance, softClearance } = world;
  const groundAt = world.groundAt;

  function refresh(): void {
    const plants = GARDEN.plants;
    if (!dirty && plants === seen && plants.length === seenN) return;
    dirty = false;
    seen = plants;
    seenN = plants.length;
    trees.length = 0;
    x0 = z0 = Infinity;
    x1 = z1 = -Infinity;
    for (const p of plants) {
      const k = KINDS[p.kind];
      if (k.size !== 'tree') continue;
      const st = stageOf(k, p.age);
      // (a dead young tree is a dry stick he pulls out: he walks up to it)
      const r = p.dead ? 0 : trunkAt(k, st);
      const cr = p.dead || st < 3 ? 0 : k.spread * (st === 4 ? 0.8 : 0.45);
      if (r <= 0 && cr <= 0) continue;
      let y0 = ground.get(p.id);
      if (y0 === undefined) ground.set(p.id, (y0 = groundAt(p.x, p.z)));
      const h = k.height * TALL[st];
      trees.push({ x: p.x, z: p.z, r, y0, y1: y0 + h, cr, c0: y0 + h * 0.4 });
      const reach = Math.max(r, cr);
      x0 = Math.min(x0, p.x - reach);
      x1 = Math.max(x1, p.x + reach);
      z0 = Math.min(z0, p.z - reach);
      z1 = Math.max(z1, p.z + reach);
    }
  }

  /** Part of the way a → b (0‥1) before it enters a tree's trunk (`crowns`: or crown), from a; 1 if none. `leave`: not those a is in. */
  function cut(ax: number, ay: number, az: number, bx: number, by: number, bz: number, crowns: boolean, leave: boolean): number {
    refresh();
    if (!trees.length || Math.max(ax, bx) < x0 || Math.min(ax, bx) > x1 || Math.max(az, bz) < z0 || Math.min(az, bz) > z1) return 1;
    const dx = bx - ax;
    const dz = bz - az;
    const dy = by - ay;
    const A = dx * dx + dz * dz;
    let best = 1;
    for (const t of trees) {
      for (let pass = 0; pass < 2; pass++) {
        const r = pass ? (crowns ? t.cr : 0) : t.r;
        if (r <= 0) continue;
        const lo = pass ? t.c0 : t.y0;
        const fx = ax - t.x;
        const fz = az - t.z;
        const C = fx * fx + fz * fz - r * r;
        let u: number;
        if (C <= 0) {
          // (a is in it: from the start, unless the way leaves what a is in)
          if (leave || ay < lo || ay > t.y1) continue;
          u = 0;
        } else {
          if (A < 1e-9) continue;
          const B = 2 * (fx * dx + fz * dz);
          const disc = B * B - 4 * A * C;
          if (disc < 0) continue;
          u = (-B - Math.sqrt(disc)) / (2 * A);
          if (u < 0 || u >= best) continue;
          const y = ay + dy * u;
          if (y < lo || y > t.y1) continue;
        }
        if (u < best) best = u;
      }
    }
    return best;
  }

  if (standAt)
    world.standAt = (x, z, y, up, h) => {
      refresh();
      if (trees.length && x >= x0 && x <= x1 && z >= z0 && z <= z1)
        for (const t of trees) {
          if (t.r <= 0) continue;
          const ex = x - t.x;
          const ez = z - t.z;
          // (a trunk is a wall from the ground to its crown: feet within it, or a body reaching into it)
          if (ex * ex + ez * ez < t.r * t.r && y < t.y1 && y + h > t.y0) return NaN;
        }
      return standAt(x, z, y, up, h);
    };
  if (clearance) world.clearance = (ax, ay, az, bx, by, bz) => Math.min(clearance(ax, ay, az, bx, by, bz), cut(ax, ay, az, bx, by, bz, false, false));
  if (softClearance) world.softClearance = (ax, ay, az, bx, by, bz, leave) => Math.min(softClearance(ax, ay, az, bx, by, bz, leave), cut(ax, ay, az, bx, by, bz, true, leave ?? false));
}
