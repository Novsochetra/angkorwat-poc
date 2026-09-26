import { Group } from 'three';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { Frame } from '../landmarks/_prasatKit';
import { ShadowGate } from '../cull';
import { pointScale } from '../road/glow';
import type { MapContext, MapFrame, MapPart } from '../types';
import { Bobbing, Floaters, floatingHome, hyacinth } from './_floating';
import { jetty, shore, stillGlow, stiltHouse, type Env } from './_houses';
import { toWorld, type GlowFn } from './_kit';
import { VillageLights } from './_lights';
import { buildPagoda } from './_pagoda';
import { buildSmoke, type SmokeSource } from './_smoke';
import { FLOATING, GROUND, JETTY, PAGODA, SHOP_HOME, shoreAt, STILT_HOMES, VILLAGE_SPOTS } from './_spots';

export { VILLAGE_SPOTS };

/**
 * The floating village on the great lake's east shore (roadmap phase 5), a
 * Tonle Sap village: stilt houses astride the shore (palm thatch or rusty
 * tin, verandas, ladders down to the boats, stairs down to the beach), a
 * shop where the trails meet, a jetty out to the floating houses on their
 * bamboo rafts (a floating shop, a fish farm, a floating garden), a pagoda
 * with a naga stair on the rise south of the houses. Life: cooking smoke,
 * lamps in the windows at night, washing, a dog asleep on a veranda, hens,
 * water hyacinth. Places: `_spots.ts` (`VILLAGE_SPOTS` for people and
 * festivals).
 *
 * One part, `village`: the still build (solid: the verandas, stairs, jetty
 * and pagoda are walked on) and the floating build (solid too, so the boat
 * goes round the rafts; they bob a few centimetres in the vertex shader,
 * which the walk map ignores), glows (no lights), smoke points. Its blocks
 * cast shadows only while those can be seen (cull.ts).
 */

/**
 * Middle of the village; how near the camera must be for the lit panes on
 * the rafts to bob with them on the CPU (m; farther, the few centimetres
 * they would move are under a pixel), and for the hens to be heard.
 */
const MID = { x: -320, z: 60 };
const BOB_NEAR = 150;
const HEAR_NEAR = 330;

export function buildVillage(ctx: MapContext): MapPart {
  const field = ctx.field;
  const world = new VoxelBuilder();
  const lights = new VillageLights();
  const smoke: SmokeSource[] = [];
  const floaters = new Floaters();
  const env: Env = { field, world, lights, smoke, floaters };

  // Keep the trees off the pagoda's rise and the ground round the houses.
  const T = PAGODA.terrace;
  field.occupy(T.x0 - 3, PAGODA.stair.z0 - 4, T.x1 + 3, T.z1 + 2);
  for (const h of [...STILT_HOMES, SHOP_HOME]) field.occupy(h.x - 7, h.z - 7, h.x + 7, h.z + 7);

  for (const h of STILT_HOMES) stiltHouse(h, env);
  stiltHouse(SHOP_HOME, env);
  jetty(env);
  shore(env);
  // (its worship spot is in roam/_worship.ts: `village-pagoda-door`)
  buildPagoda(field, world, stillGlow(env, new Frame(0, 0, 0, 0)));

  // What floats: the rafts, the boats tied up, hyacinth.
  const glowOf = (owner: number, fr: Frame): GlowFn => (x, y, z, sx, sy, sz, color, halo) => {
    const [wx, wy, wz] = toWorld(fr, x, y, z);
    lights.addFloating(owner, wx, wy, wz, sx, sy, sz, fr.theta, color, hash3(Math.round(wx), Math.round(wz), 4, 72) * 6.28);
    if (halo) lights.halo(wx, wy, wz, halo, wz * 0.29);
  };
  for (const f of FLOATING) floatingHome(floaters, f, glowOf);
  hyacinthBeds(floaters, field);

  const object = new Group();
  object.name = 'village';
  const quality = ctx.quality === 'low' ? 'low' : 'medium';
  object.add(buildVoxelMesh(world, { quality, name: 'village' }));
  const floating = buildVoxelMesh(floaters.b, { quality, name: 'village:floating' });
  object.add(floating);
  const bob = new Bobbing(floaters.rafts);
  bob.trackVoxels(floating, floaters.b.boxes, floaters.owner);
  const glow = lights.build(ctx.renderer);
  object.add(glow.object);
  if (glow.floatingMesh) bob.track(glow.floatingMesh, lights.floatingOwner);
  const fires = buildSmoke(smoke);
  object.add(fires.object);
  // (drawn wherever the camera is in the first frames: the rafts' bobbing shaders compile at load)
  const shadows = new ShadowGate(true).addAll(object);

  let lastBob = -1;
  let nextCall = 0;
  return {
    name: 'village',
    object,
    blocks: world.boxes.length + floaters.b.boxes.length,
    update(f: MapFrame) {
      shadows.update(f);
      bob.clock(f.t);
      const cam = f.camera.position;
      const d = Math.hypot(cam.x - MID.x, cam.z - MID.z);
      if ((d < BOB_NEAR || lastBob < 0) && f.t !== lastBob) {
        bob.update(f.t);
        lastBob = f.t;
      }
      glow.update(f, f.camera);
      fires.update(f, pointScale(ctx.renderer, f.camera));
      if (f.dt > 0 && d < HEAR_NEAR) nextCall = calls(f, nextCall);
    },
  };
}

/** The rooster at dawn, hens clucking by day, now and then, from the houses (when the ears are near). Returns when to call next. */
function calls(f: MapFrame, next: number): number {
  if (f.t < next) return next;
  const r = hash3(Math.floor(f.t * 10), 7, 3, 73);
  const dawn = f.clock > 0.7 && f.clock < 0.9;
  const day = f.night < 0.45;
  const l = f.listener;
  if (Math.hypot(l.x - MID.x, l.z - MID.z) < 160 && (dawn || day)) {
    const h = STILT_HOMES[Math.floor(r * STILT_HOMES.length)];
    const rooster = dawn ? r < 0.7 : r < 0.15;
    f.calls.push({ kind: rooster ? 'rooster' : 'hen', x: h.x, y: GROUND + 0.5, z: h.z, gain: rooster ? 0.55 : 0.35 });
  }
  return f.t + (dawn ? 9 : 16) + r * 22;
}

/** Clusters of water hyacinth drifting in the shallows along the shore and round the rafts. */
function hyacinthBeds(fl: Floaters, field: MapContext['field']): void {
  const spots: [number, number, number][] = [];
  for (let s = 1; s < 88; s += 5.5) {
    const p = shoreAt(s);
    const out = 5 + hash3(Math.round(s * 10), 1, 1, 74) * 4;
    spots.push([p.x - p.dz * out, p.z + p.dx * out, 3 + Math.floor(hash3(Math.round(s), 2, 2, 75) * 5)]);
  }
  for (let i = 0; i < 10; i++) {
    const a = hash3(i, 3, 3, 76) * Math.PI * 2;
    const d = 8 + hash3(i, 4, 4, 77) * 20;
    spots.push([-338 + Math.cos(a) * d, 48 + Math.sin(a) * d, 4 + Math.floor(hash3(i, 5, 5, 78) * 6)]);
  }
  const [jx, jz] = JETTY.to;
  spots.forEach(([x, z, n], i) => {
    // (on open water, off the jetty, the rafts and the race lane)
    if (field.waterAt(x, z) === null || Math.hypot(x - jx, z - jz) < 5 || z < 22) return;
    if (FLOATING.some((f) => Math.hypot(f.x - x, f.z - z) < Math.max(f.w, f.d) * 0.75 + 1.5)) return;
    hyacinth(fl, x, z, n, 800 + i);
  });
}
