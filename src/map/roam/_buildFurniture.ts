import type { Group } from 'three';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh, disposeVoxelMesh } from '../../voxel/VoxelMesh';
import { BLOCKS, cellOf } from '../blocks/store';
import { FOOTS } from '../build/footState';
import { FURN, FURNITURE_IDS, HANG, isFurniture, type FurnitureId } from '../build/furniture';
import { BUILT, PIECES, type Built } from '../build/pieces';
import { BUILD } from '../build/state';
import type { BuildView } from '../build/view';
import { graphicsNow } from '../graphics';
import type { AddonEnv } from './_addons';
import { furnSpot, hangCeil, hungFrom, onFurnFloor, type FurnSpot } from './_buildFurnSpots';
import type { RoamCtx, RoamWorld } from './types';

/**
 * Furniture and lanterns at home, the add-on's side (AWP-23; the pieces:
 * build/furniture.ts; where they may stand: _buildFurnSpots.ts). roam/_build.ts
 * calls `installFurniture` once and `furnFromUrl` with its URL.
 *
 * - **The cords**: each hanging lantern's cord from its hook up to the roof over
 *   it (`hangCeil`: his blocks, his house's roof, a shelter's rafters), one
 *   small batch of the bark family for all (one draw, no shadow), made again
 *   when a piece comes, rises or goes, or his blocks change; none while there is
 *   no hanging lantern. A roof taken away after: the cord stops `LOOSE` m up.
 * - **Checks** (shots and the dev server): `furn=<id>@x/z/yaw[/y][:done],…`
 *   (each where `furnSpot` puts it for feet at height `y`: his blocks' floor, his
 *   house's; the land's height when left out; refused spots are put there all
 *   the same, with a warning), `window.__furn`: `spot(id, x, z, deg, y)`,
 *   `floor(x, y, z)`, `cords()`.
 */

/** A cord with no roof over it any more stops this far over its hook (m). */
const LOOSE = 0.3;
/** The cord: its thickness (m) and colour (coir rope). */
const CORD = { t: 0.022, color: 0x7a6446 };

let world: RoamWorld | null = null;
let cords: Group | null = null;
let host: Group | null = null;
let cordCount = 0;

/** The hanging lanterns' cords made again. */
function makeCords(): void {
  if (!world || !host) return;
  if (cords) {
    cords.removeFromParent();
    disposeVoxelMesh(cords);
    cords = null;
  }
  cordCount = 0;
  const b = new VoxelBuilder();
  for (const p of BUILT.list) {
    if (p.id !== 'hanglamp' || p.done <= 0) continue;
    const from = p.y + HANG.hook;
    const c = hangCeil(world, p.x, p.z, p.y);
    const to = Number.isFinite(c) && c - p.y <= HANG.max ? c + 0.04 : from + LOOSE;
    if (to <= from) continue;
    b.box(p.x, (from + to) / 2, p.z, CORD.t, to - from, CORD.t, CORD.color, 'mapBark');
    // (tied round what it hangs from)
    if (to > from + LOOSE) b.box(p.x, to - 0.06, p.z, 0.05, 0.05, 0.05, CORD.color, 'mapBark', { shade: 0.9 });
    cordCount++;
  }
  if (!b.boxes.length) return;
  cords = buildVoxelMesh(b, { quality: graphicsNow.plainBlocks ? 'low' : 'medium', name: 'build:cords', castShadow: false, receiveShadow: true });
  host.add(cords);
}

/** Once, from the build add-on's `init`: the cords in the view's group, kept up to date. */
export function installFurniture(e: AddonEnv, view: BuildView): void {
  world = e.world;
  host = view.object;
  BUILD.on((ev) => {
    if (ev.piece.id === 'hanglamp' && (ev.type !== 'progress' || ev.piece.done > 0)) makeCords();
  });
  BLOCKS.onChange(() => {
    if (BUILT.list.some((p) => p.id === 'hanglamp')) makeCords();
  });
  makeCords();
  if (e.shot || import.meta.env.DEV)
    Object.assign(window, {
      __furn: {
        spot: (id: FurnitureId, x: number, z: number, deg = 0, y = NaN) => {
          const s: FurnSpot = { y: 0, ceil: 0, reason: null };
          furnSpot(e.world, id, x, z, (deg * Math.PI) / 180, Number.isFinite(y) ? y : e.world.field.heightAt(x, z), s);
          return { y: +s.y.toFixed(3), ceil: Number.isFinite(s.ceil) ? +s.ceil.toFixed(3) : null, reason: s.reason };
        },
        floor: (x: number, y: number, z: number) => onFurnFloor(e.world, x, y, z),
        cords: () => cordCount,
        ids: FURNITURE_IDS,
      },
    });
}

/**
 * A check's furniture (`furn=<id>@x/z/yaw[/y][:done],…`, yaw in degrees, `y` the feet's height whose floor it goes
 * on: the land's when left out; done 0‥1, 1 when left out). Shots and the dev server only (the caller's gate).
 */
export function furnFromUrl(q: URLSearchParams, ctx: RoamCtx): number {
  const v = q.get('furn');
  if (!v) return 0;
  let n = 0;
  const s: FurnSpot = { y: 0, ceil: 0, reason: null };
  for (const part of v.split(',')) {
    const m = /^([a-z]+)@(-?[\d.]+)\/(-?[\d.]+)(?:\/(-?[\d.]+))?(?:\/(-?[\d.]+))?(?::([\d.]+))?$/.exec(part.trim());
    if (!m || !isFurniture(m[1])) {
      if (part.trim()) console.warn(`[build] furn=: "${part}" is not <id>@x/z/yaw[/y][:done] (ids: ${FURNITURE_IDS.join(', ')})`);
      continue;
    }
    const id = m[1];
    const x = Number(m[2]);
    const z = Number(m[3]);
    const yaw = ((Number(m[4]) || 0) * Math.PI) / 180;
    const feet = m[5] === undefined ? ctx.world.field.heightAt(x, z) : Number(m[5]);
    const done = m[6] === undefined ? 1 : Number(m[6]);
    if (![x, z, yaw, feet, done].every(Number.isFinite)) continue;
    furnSpot(ctx.world, id, x, z, yaw, feet, s);
    if (s.reason) console.warn(`[build] furn=: the ${id} at ${x}, ${z} would not fit (${s.reason}); put there all the same`);
    if (BUILD.add(id, x, s.y, z, yaw, done)) n++;
    else console.warn(`[build] furn=: no more than ${PIECES[id].max} × ${id}`);
  }
  console.info(`[build] furn=: ${n} pieces of furniture (${Object.keys(FURN).length} kinds)`);
  return n;
}

/** The furniture as a check's `furn=` (bug reports: each on its floor, `y` its floor's height), or null. */
export function furnReport(): string | null {
  const l = BUILD.list.filter((p) => isFurniture(p.id));
  if (!l.length) return null;
  return l.map((p) => `${p.id}@${p.x.toFixed(2)}/${p.z.toFixed(2)}/${((p.yaw * 180) / Math.PI).toFixed(1)}/${(p.y + 0.05).toFixed(2)}${p.done < 1 ? `:${p.done.toFixed(3)}` : ''}`).join(',');
}

/**
 * The furniture a footprint building holds up (AWP-20's, by its uid): standing on its blocks (its floor), or a lantern
 * hung from its roof. Taking the building down is refused while there is any (roam/_build.ts `askTake`): nothing is
 * left floating, nothing he paid for is lost. Furniture on the land inside a shed stays where it is and does not count.
 */
export function furnitureIn(uid: string): Built[] {
  const rec = FOOTS.byUid(uid);
  if (!rec || !world) return [];
  const plan = FOOTS.plan(rec);
  const cells = new Set<string>();
  for (let b = 0; b < plan.n; b++) cells.add(`${plan.cells[b * 3]},${plan.cells[b * 3 + 1]},${plan.cells[b * 3 + 2]}`);
  const has = (x: number, y: number, z: number) => cells.has(`${cellOf(x)},${cellOf(y)},${cellOf(z)}`);
  const out: Built[] = [];
  for (const p of BUILT.list) {
    if (!isFurniture(p.id)) continue;
    if (has(p.x, p.y - 0.05, p.z)) out.push(p);
    else if (FURN[p.id].hang) {
      const c = hangCeil(world, p.x, p.z, p.y);
      if (Number.isFinite(c) && has(p.x, c + 0.05, p.z)) out.push(p);
    }
  }
  return out;
}

/**
 * What `uid` holds up (AWP-23 review): a footprint building's furniture (`furnitureIn`), or the lanterns hung from a
 * shelter's roof. No other piece holds one: furniture stands only on a floor (the land, his blocks, his house) and a
 * lantern hangs only from a roof (his blocks, his house's, a shelter's). Taking a holder down is refused while it holds
 * any (roam/_build.ts `askTake`).
 */
export function furnitureHeldBy(uid: string): Built[] {
  const piece = BUILD.byUid(uid);
  if (!piece) return furnitureIn(uid);
  if (piece.id !== 'shelter' || !world) return [];
  const out: Built[] = [];
  for (const p of BUILT.list)
    if (p.id === 'hanglamp' && Number.isFinite(hangCeil(world, p.x, p.z, p.y)) && hungFrom === piece) out.push(p);
  return out;
}
