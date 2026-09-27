import { Frustum, Group, Matrix4, Sphere, Vector3 } from 'three';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { ShadowGate } from '../cull';
import { EAST_VILLAGE } from '../layout';
import { pointScale } from '../road/glow';
import type { MapContext, MapFrame } from '../types';
import { Palms } from '../veg/palms';
import { VillageLights } from '../village/_lights';
import { buildSmoke, type SmokeSource } from '../village/_smoke';
import type { EvEnv } from './_evKit';
import { evHouse } from './_evHouse';
import { EV_BRIDGE_AT, EV_BUILT, EV_HOMES } from './_evSpots';
import { evStream } from './_evStream';
import { evYard } from './_evYard';
import { registerVillageShop } from './_shops';
import type { HamletPiece } from './index';

/**
 * The sugar-palm village (ភូមិត្នោត, layout.ts `EAST_VILLAGE`) on the east
 * lowland at the foot of Phnom Kulen, "the other side" from the floating
 * village: a Khmer land village along its street (the `east village road`
 * trail, from the market square east over the Kulen stream).
 *
 * - Fourteen houses on stilts (`_evHouse.ts`): five each side of the street,
 *   one round each back yard, two over the stream, in the Khmer forms (rông
 *   daol, kantaing with its roof skirt, pet with its porch roof); plank walls
 *   plain or painted, tiles, thatch or tin, plain barge boards, fans of rays
 *   and kbach leaves in the gables, verandas and stairs, life under the
 *   floors, kitchen huts behind, spirit houses, kramas on the lines, fences
 *   and gates.
 * - Round them (`_evYard.ts`): two rice granaries, the cattle pen, the
 *   public hand pump, the sala (a rest pavilion) and the village's spirit
 *   house at the Kulen trail's corner under an old tamarind with the neak
 *   ta's shrine, the little roadside shop (its signs in Khmer: `_evSign.ts`),
 *   rice straw stacks, gardens: sugar and coconut palms (veg/palms.ts),
 *   mango, papaya, banana, bamboo, kitchen beds, hedges.
 * - The stream (`_evStream.ts`): the foot bridge (a boat passes under),
 *   the washing steps down the bank face to a landing at the water, a boat
 *   on the sand, a fish trap.
 * - Life: cooking smoke from the kitchen huts at dawn and supper (and a
 *   thread of it late at night), lit windows, lanterns and tube lights on
 *   the verandas, the shop's light, candles at the shrines (glows with
 *   halos, no lights: village/_lights.ts, village/_smoke.ts); roosters at
 *   dawn, hens by day (`f.calls`). Its people are people/_sceneEastVillage.ts.
 *
 * Where everything stands: `_evSpots.ts` (`EV_SPOTS` for the people).
 * Cost: one voxel build in four block families (four draws, their shadows
 * gated to when they can be seen, cull.ts), the palms' own draws (≤ 3),
 * one draw of glows, one of halos, one of smoke; the glows, halos and
 * smoke hide while the village is out of view. Solid in the walk map but
 * plants and cloth. URL: `parts=terrain,water,hamlet,…` to look at it
 * alone (see docs/map-work/BRIEF.md, "The sugar-palm village").
 */

/** The village's middle, and a sphere round everything it builds (m). */
const MID = { x: 412, z: -63 };
const REACH = 82;
/** Roosters and hens are heard within this of the ears (m). */
const HEAR = 170;

export function buildEastVillage(ctx: MapContext): HamletPiece {
  const t0 = performance.now();
  const field = ctx.field;
  const world = new VoxelBuilder();
  const lights = new VillageLights();
  const smoke: SmokeSource[] = [];
  const palms = new Palms();
  const env: EvEnv = { field, world, lights, smoke, palms };
  EV_BUILT.clear();
  EV_BRIDGE_AT.built = false;
  for (const h of EV_HOMES) if (evHouse(h, env)) EV_BUILT.add(h.id);
  evYard(env);
  const bridge = evStream(env);
  // (the floating village's props in tin and brass come out as plain stone: four families, four draws)
  for (const b of world.boxes) if (b.mat === 'metal' || b.mat === 'brass') b.mat = 'mapStone';

  const object = new Group();
  object.name = 'eastVillage';
  const quality = ctx.quality === 'low' ? 'low' : 'medium';
  const blocks = buildVoxelMesh(world, { quality, name: 'eastVillage' });
  object.add(blocks);
  const palmSet = palms.build({ name: 'eastVillage:palms' });
  object.add(palmSet.object);
  const shadows = new ShadowGate().addAll(object);
  // Glows, halos and smoke: drawn only while the village can be seen.
  const light = lights.build(ctx.renderer);
  light.object.name = 'eastVillage:lights';
  const fires = buildSmoke(smoke);
  fires.object.name = 'eastVillage:smoke';
  const lit = new Group();
  lit.name = 'eastVillage:life';
  lit.add(light.object, fires.object);
  object.add(lit);

  // (its little shop sells water, iced coffee and snacks to the roaming explorer: _shops.ts)
  registerVillageShop(field);
  const ms = performance.now() - t0;
  console.info(
    `[map] eastVillage: ${EV_BUILT.size} of ${EV_HOMES.length} houses${EV_BUILT.size < EV_HOMES.length ? ` (left out, their ground unfit: ${EV_HOMES.filter((h) => !EV_BUILT.has(h.id)).map((h) => h.id).join(', ')})` : ''} · ${world.boxes.length} blocks in ${blocks.children.length} draws · ${palms.list.length} palms (${palmSet.pieces} pieces) · ${lights.still.list.length} glows, ${lights.halos.length} halos, ${smoke.length} kitchen fires · ${bridge ? `bridge ${Math.round(Math.hypot(bridge.bx - bridge.ax, bridge.bz - bridge.az))} m` : 'no bridge'} · built in ${ms.toFixed(0)} ms`,
  );

  const view = new Frustum();
  const m = new Matrix4();
  const sphere = new Sphere(new Vector3(MID.x, field.heightAt(EAST_VILLAGE.x, EAST_VILLAGE.z) + 6, MID.z), REACH);
  let next = 0;
  // (CPU a frame, over the first frames that move: printed once in a still)
  let cpu = 0;
  let frames = 0;
  return {
    object,
    blocks: world.boxes.length,
    update(f: MapFrame) {
      const c0 = performance.now();
      shadows.update(f);
      const cam = f.camera;
      m.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
      view.setFromProjectionMatrix(m);
      const seen = view.intersectsSphere(sphere) && cam.position.distanceTo(sphere.center) < 900;
      lit.visible = seen;
      if (seen) {
        light.update(f, cam);
        fires.update(f, pointScale(ctx.renderer, cam));
        palmSet.update(f);
      }
      if (f.dt > 0 && f.t >= next) next = crow(f, sphere.center.y - 6);
      if (f.dt > 0 && frames < 24) {
        cpu += performance.now() - c0;
        if (++frames === 24 && ctx.shot) console.info(`[map] eastVillage: ${(cpu / 24).toFixed(3)} ms a frame (CPU, average of 24; ${seen ? 'in view' : 'out of view'})`);
      }
    },
    subjects(out) {
      if (lit.visible) palmSet.subjects(out);
    },
  };
}

/** The rooster at dawn, hens clucking by day, now and then from a yard (when the ears are near). Returns when to call next. */
function crow(f: MapFrame, ground: number): number {
  const l = f.listener;
  const dx = l.x - MID.x;
  const dz = l.z - MID.z;
  if (dx * dx + dz * dz > HEAR * HEAR) return f.t + 4;
  const r = hash3(Math.floor(f.t * 10), 11, 3, 91);
  const dawn = f.clock > 0.7 && f.clock < 0.9;
  if (dawn || f.night < 0.45) {
    const h = EV_HOMES[Math.floor(r * EV_HOMES.length)];
    const rooster = dawn ? r < 0.7 : r < 0.12;
    f.calls.push({ kind: rooster ? 'rooster' : 'hen', x: h.x, y: ground + 0.5, z: h.z, gain: rooster ? 0.5 : 0.32 });
  }
  return f.t + (dawn ? 8 : 15) + r * 20;
}
