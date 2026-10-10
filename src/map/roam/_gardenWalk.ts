import { KINDS, stageOf, trunkAt } from '../garden/kinds';
import { GARDEN, type Plant } from '../garden/state';
import { CROWNS } from '../garden/_viewLook';
import { ROAM_SCALE, type RoamWorld } from './types';

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
  id: number;
  x: number;
  z: number;
  /** The trunk: its radius (m; 0: none yet) and from the ground to the crown's top. */
  r: number;
  y0: number;
  y1: number;
  /** The crown for the camera, until the view has measured it (`CROWNS`): its radius and from where it keeps out (to `y1`); 0: none. */
  cr: number;
  c0: number;
}

/**
 * A trunk's wall is at least this wide (radius, m). The walker (walker.ts `fit`) tests his middle and a ring of 8
 * probes 0.3 × his size round it (0.42 m on the map): a thinner trunk (a papaya's 0.12 m, a guava's 0.14) passes
 * between two ring probes (0.16 m either side of the line between them) or between the ring and his middle
 * (0.42 m apart), and he walks through it. Half the ring's radius and a little more holds him off as the mango's
 * trunk does (his middle stops ≈ 0.55–0.65 m from the trunk's axis); thicker trunks keep their own.
 */
const WALL_MIN = 0.3 * ROAM_SCALE * 0.5 + 0.03;
/**
 * The camera keeps out of a crown: where its leaves are (the view measures each look's, garden/_viewLook.ts
 * `CROWNS`: a palm's, a papaya's and a banana's high up on a bare trunk, a mango's from its lowest boughs), entered
 * through its side or from under it. Not the bare trunk under it (the camera jammed onto his hat with a palm behind
 * him), nor the room under a crown (in an orchard it came in close behind him at every turn). Until the view has
 * measured a crown: from this share of the tree's height up, as wide as `spread` × `CROWN_R`.
 */
const CROWN_FROM = 0.4;
const CROWN_R = 0.8;
/**
 * Going out from him (`leave`: the follow camera's way out), a crown or trunk nearer him than this (m) is no bar: the camera
 * would come in onto his hat; it stays out and the near fade shows him through the leaves (as the map's rule for a
 * tree close to him, roam/followCam.ts `treeRoom`).
 */
const CROWN_NEAR = 4.5;

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
      const r = p.dead ? 0 : trunkAt(k, st) > 0 ? Math.max(WALL_MIN, trunkAt(k, st)) : 0;
      const cr = p.dead || st < 3 ? 0 : k.spread * (st === 4 ? CROWN_R : 0.45);
      if (r <= 0 && cr <= 0) continue;
      let y0 = ground.get(p.id);
      if (y0 === undefined) ground.set(p.id, (y0 = groundAt(p.x, p.z)));
      const h = k.height * TALL[st];
      trees.push({ id: p.id, x: p.x, z: p.z, r, y0, y1: y0 + h, cr, c0: y0 + h * CROWN_FROM });
      // (the box takes the widest a crown may measure)
      const reach = Math.max(r, cr, k.spread * 1.3);
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
    const len = Math.sqrt(A + dy * dy);
    /** (the part of the way a crown must be beyond to bar it, going out from him) */
    const past = leave && len > 0 ? CROWN_NEAR / len : 0;
    let best = 1;
    for (const t of trees) {
      for (let pass = 0; pass < 2; pass++) {
        const c = pass && crowns ? CROWNS.get(t.id) : undefined;
        const r = pass ? (crowns ? (c ? c.r : t.cr) : 0) : t.r;
        if (r <= 0) continue;
        const lo = pass ? (c ? c.y0 : t.c0) : t.y0;
        const hi = c ? c.y1 : t.y1;
        const fx = ax - t.x;
        const fz = az - t.z;
        const C = fx * fx + fz * fz - r * r;
        // (a in it: from the start, unless the way leaves what a is in)
        if (C <= 0 && ay >= lo && ay <= hi) {
          if (!leave) best = 0;
          continue;
        }
        // Through its side…
        if (C > 0 && A > 1e-9) {
          const B = 2 * (fx * dx + fz * dz);
          const disc = B * B - 4 * A * C;
          if (disc >= 0) {
            const u = (-B - Math.sqrt(disc)) / (2 * A);
            const y = ay + dy * u;
            if (u >= (crowns ? past : 0) && u < best && y >= lo && y <= hi) best = u;
          }
        }
        // …or its bottom or top (from under a crown up to it, from over a trunk down to it).
        if (Math.abs(dy) > 1e-9) {
          const cap = ay < lo && dy > 0 ? lo : ay > hi && dy < 0 ? hi : NaN;
          if (!Number.isNaN(cap)) {
            const u = (cap - ay) / dy;
            if (u >= (crowns ? past : 0) && u < best) {
              const ex = fx + dx * u;
              const ez = fz + dz * u;
              if (ex * ex + ez * ez <= r * r) best = u;
            }
          }
        }
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
