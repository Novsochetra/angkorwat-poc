import { Group, Vector3, type ShaderMaterial } from 'three';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { MkBuild } from '../hamlet/_mkKit';
import { buildSteam } from '../hamlet/_mkSteam';
import { Toggles } from '../hamlet/_mkToggles';
import { Frame } from '../landmarks/_prasatKit';
import { ShadowGate } from '../cull';
import { LightPools, pointScale } from '../road/glow';
import { SacredSet } from '../sacred/set';
import type { MapContext, MapFrame, MapPart } from '../types';
import { Bobbing, Floaters, floatingHome, hyacinth } from './_floating';
import { buildFvMarket, followMarket, fvOpen } from './_fvMarket';
import { FV_GATE, FV_TREE } from './_fvPlan';
import { buildFvVillage } from './_fvVillage';
import { jetty, shore, stillGlow, stiltHouse, type Env } from './_houses';
import { toWorld, villagePalms, type GlowFn } from './_kit';
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
 * with a naga stair on the rise south of the houses. Its heart (`_fvPlan.ts`,
 * `_fvVillage.ts`, `_fvMarket.ts`): the village gate where the trail comes
 * down off the dike, the village tree and its neak ta where the trails
 * meet, the market (ផ្សារ) between the trails' end and the jetty (stalls,
 * the noodle stall lit till late, boats selling at the jetty in the morning:
 * people/_sceneVillageMarket.ts), the north street's second row of houses,
 * trodden earth where people walk. Life: cooking smoke, lamps in the
 * windows at night, washing, a dog asleep on a veranda, hens, water
 * hyacinth. Places: `_spots.ts` (`VILLAGE_SPOTS` for people and
 * festivals). URL: `fvopen=all|none` (every market stall open or shut,
 * whatever the clock; its people follow it too).
 *
 * One part, `village`: the still build (solid: the verandas, stairs, jetty
 * and pagoda are walked on) and the floating build (solid too, so the boat
 * goes round the rafts; they bob a few centimetres in the vertex shader,
 * which the walk map ignores), glows (no lights), smoke points. Its blocks
 * cast shadows only while those can be seen (cull.ts). The market's goods,
 * tarps and parasols come and go with the time of day: instances of the
 * same meshes folded away or put back (hamlet/_mkToggles.ts); its steam,
 * the grill's smoke and the pool of lamplight under the noodle stall are
 * three draws more, hidden while far.
 */

/**
 * Middle of the village; how near the camera must be for the lit panes on
 * the rafts to bob with them on the CPU (m; farther, the few centimetres
 * they would move are under a pixel), and for the hens to be heard.
 */
const MID = { x: -320, z: 60 };
const BOB_NEAR = 150;
const HEAR_NEAR = 330;
/** The camera within this (m): the market follows the clock, its steam, smoke and pool of light show. */
const MARKET_NEAR = 330;

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
  const sacred = new SacredSet('village');
  buildPagoda(field, world, stillGlow(env, new Frame(0, 0, 0, 0)), sacred);
  // The market at the jetty's foot, and the heart round it: the gate, the village tree, the north street, trodden earth.
  const t0 = performance.now();
  const market = buildFvMarket(field, lights);
  const heart = buildFvVillage({ field, world, mk: market.mk, lights, smoke });
  for (const [x0, z0, x1, z1] of market.covers) field.occupy(x0, z0, x1, z1);
  field.occupy(FV_GATE.x - 4, FV_GATE.z - 4, FV_GATE.x + 4, FV_GATE.z + 4);
  field.occupy(FV_TREE.x - 7, FV_TREE.z - 7, FV_TREE.x + 7, FV_TREE.z + 7);
  field.occupy(-282, 18, -262, 58);

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
  // (the village's blocks and the market's in one mesh a family: the market's boxes carry their toggles, the rest none)
  const all = new MkBuild();
  all.b.append(world);
  for (let i = 0; i < world.boxes.length; i++) all.tags.push(0);
  all.b.append(market.mk.b);
  for (const tag of market.mk.tags) all.tags.push(tag);
  const blocks = buildVoxelMesh(all.b, { quality, name: 'village' });
  object.add(blocks);
  const toggles = new Toggles(blocks, all);
  const floating = buildVoxelMesh(floaters.b, { quality, name: 'village:floating' });
  object.add(floating);
  const bob = new Bobbing(floaters.rafts);
  bob.trackVoxels(floating, floaters.b.boxes, floaters.owner);
  const glow = lights.build(ctx.renderer);
  object.add(glow.object);
  if (glow.floatingMesh) bob.track(glow.floatingMesh, lights.floatingOwner);
  const fires = buildSmoke(smoke);
  object.add(fires.object);
  // The market's steam (the noodle pots), the grill's smoke, the pool of light under the noodle stall's bulbs.
  const steam = buildSteam(market.steam);
  steam.object.name = 'village:steam';
  object.add(steam.object);
  const grill = buildSmoke(market.smoke);
  grill.object.name = 'village:grill-smoke';
  object.add(grill.object);
  const grillAmount = (grill.object.material as ShaderMaterial).uniforms.uAmount;
  const pools = new LightPools();
  for (const [x, y, z] of market.pools) {
    const r = 5;
    const py = y + 0.1;
    pools.quad(new Vector3(x - r, py, z - r), new Vector3(x + r, py, z - r), new Vector3(x + r, py, z + r), new Vector3(x - r, py, z + r), x, y + 2.7, z, 1.7);
  }
  const pool = pools.mesh('village:pool');
  pool.uniforms.uFar.value.set(50, 120);
  (pool.mesh.material as ShaderMaterial).uniforms.uColor.value.setRGB(1, 0.62, 0.3);
  pool.mesh.visible = false;
  object.add(pool.mesh);
  const marketFx = [steam.object, grill.object, pool.mesh];
  const force = new URLSearchParams(location.search).get('fvopen');
  console.info(`[map] village market: ${market.mk.b.boxes.length} blocks (${toggles.tags.length} toggles) · ${market.steam.length} pots, ${market.smoke.length} grill · ${heart.houses} houses on the north street · built in ${(performance.now() - t0).toFixed(1)} ms`);
  object.add(sacred.object);
  // The coconut palms the shore planted (veg/palms.ts).
  const palms = villagePalms();
  object.add(palms.object);
  // (drawn wherever the camera is in the first frames: the rafts' bobbing shaders compile at load)
  const shadows = new ShadowGate(true).addAll(object);

  let lastBob = -1;
  let nextCall = 0;
  let near = true;
  let lastClock = -1;
  return {
    name: 'village',
    object,
    blocks: all.b.boxes.length + floaters.b.boxes.length,
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
      // The market: what is open now (only when the clock has moved), its steam, smoke and pool of light (near only).
      const nowNear = d < MARKET_NEAR;
      if (nowNear !== near) {
        near = nowNear;
        for (const o of marketFx) o.visible = near;
      }
      if (near) {
        if (Math.abs(f.clock - lastClock) > 0.0005) {
          lastClock = f.clock;
          followMarket(f, force, toggles, glow.setLit);
        }
        const scale = pointScale(ctx.renderer, f.camera);
        steam.update(f, scale, (id) => fvOpen(id, f.clock, force));
        const grilling = fvOpen('grill', f.clock, force);
        grill.object.visible = grilling;
        if (grilling) {
          grillAmount.value = 0.7 * (1 - 0.7 * f.weather.rain);
          grill.update(f, scale);
        }
        const n = f.night;
        const k = n * n * (3 - 2 * n);
        const level = fvOpen('noodles', f.clock, force) ? k * k * 0.55 : 0;
        pool.mesh.visible = level > 0.01;
        pool.uniforms.uLevel.value = level;
        pool.uniforms.uTime.value = f.t;
        pool.uniforms.uPulse.value = 0.04;
      }
      sacred.update(f);
      palms.update(f);
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
