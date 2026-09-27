import { Group } from 'three';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { ShadowGate } from '../cull';
import { len2 } from '../fauna/_len';
import type { HeightField } from '../heightfield';
import { BACK_HAMLET } from '../layout';
import { pointScale } from '../road/glow';
import type { MapContext, MapFrame, Subject } from '../types';
import { swayLeaves } from '../veg/sway';
import { VillageLights } from '../village/_lights';
import { buildSmoke, type SmokeSource } from '../village/_smoke';
import { backHouse, granary, type BuildEnv } from './_bhHouses';
import { buildBackMarket, BUSY_TAG, closedTag, occupyMarket, openTag, registerBackShops } from './_bhMarket';
import { BM_STALLS, BUSY, DAWN_LAMP, EVENING_LAMP, inWin, stallOpen } from './_bhMarketPlan';
import { BackToggles, LampSwitch } from './_bhToggles';
import { buildSteam } from './_mkSteam';
import { buildPondMist } from './_bhMist';
import { buildPond } from './_bhPond';
import { buildSala } from './_bhSala';
import { BACK_BUILT, backSpots, CART, GARDEN, GRANARY, HOMES, homeFront, homeToWorld, MEADOW, PEN, POND, SALA, salaToWorld, WELL, type BackSpots } from './_bhSpots';
import { buildTrees, treeFeet } from './_bhTrees';
import { buildYard } from './_bhYard';
import type { HamletPiece } from './index';

/**
 * The little hamlet behind Angkor Wat (layout.ts `BACK_HAMLET`), north of
 * the back trail: round the back of the temple, where villagers live among
 * the trees. Four stilt houses round a swept dirt yard (verandas, stairs,
 * the grandfather's hammock and the weaver's loom in the shade under the
 * floors; the old family house a phteah kantaing under old clay tiles, the
 * weaver's a phteah pet with its porch roof over the stair), the rice
 * granary, the cattle pen with its straw stacks, the spirit house, the
 * well, the vegetable garden, fruit trees and palms; the lotus pond west of
 * it with the children's plank jetty and the buffalo wallow at its muddy
 * end; down by the trail, where the lane leaves it, the sala with the
 * coconut and sugarcane juice cart under a tamarind and the little neak ta
 * shrine, and the hamlet's morning market round the lane's foot under the
 * big old tree across the trail. Where things stand: `_bhSpots.ts` (the
 * people of people/_sceneBack.ts live by it), the market's
 * `_bhMarketPlan.ts`. The builds: `_bhHouses.ts` (houses, granary),
 * `_bhYard.ts` (pen, straw, spirit house, well, garden, washing, the earth
 * steps on the lane and the trail), `_bhPond.ts` (lotus, jetty, wallow,
 * reeds), `_bhSala.ts` (sala, cart, tamarind, shrine), `_bhTrees.ts` (fruit
 * trees, palms, bamboo), `_bhMist.ts` (the pond's dawn mist), `_bhMarket.ts`
 * (the market's stalls, goods, tree, bicycles: its blocks appended after
 * the hamlet's, what comes and goes with the time of day shown and hidden
 * by `_bhToggles.ts`; its shops and the cart's registered, shop.ts).
 *
 * At night: lamps in the windows and on the verandas, embers in the
 * kitchen stoves, the candles at the spirit house and the shrine (glows and
 * halos, no light); smoke from the kitchen fires at dawn and supper time.
 * The market's lamps are among the glows, lit only when theirs (`LampSwitch`):
 * the breakfast stall's LED tube before sunrise, the stoves' embers while
 * their stalls are open, the num krok seller's lamp in the evening; steam
 * off the pots and the griddle while they cook (hamlet/_mkSteam.ts).
 * Roosters crow at dawn, hens cluck by day, when near.
 *
 * Solid to walk (verandas, stairs, the jetty, the sala, the steps, the
 * market's tables and stoves) but for leaves, cloth, straw and goods; the
 * jungle's trees and the undergrowth keep off what it builds on
 * (`field.occupy`). One set of meshes (four voxel families, the palms'
 * three, glow, halos, smoke, steam, mist), cast shadows only while they can
 * be seen (cull.ts `ShadowGate`), all of it hidden when the camera is over
 * `FAR` m away (the overview).
 *
 * URL: `pondmist=1` holds the pond's mist; `bhopen=all|none` opens or shuts
 * every stall of the market, whatever the clock (its people follow it).
 */

/** Hidden past this distance (m, camera to the hamlet's middle): out of the overview's sight behind the summit. */
const FAR = 430;
/** The roosters and hens are heard this near (m, the ears). */
const HEAR = 150;

export function buildBackHamlet(ctx: MapContext): HamletPiece {
  const t0 = performance.now();
  const field = ctx.field;
  const spots = backSpots(field);
  const world = new VoxelBuilder();
  const lights = new VillageLights();
  const smoke: SmokeSource[] = [];
  const env: BuildEnv = {
    field,
    world,
    smoke,
    glow(x, y, z, sx, sy, sz, ry, color, halo) {
      lights.still.add(x, y, z, sx, sy, sz, ry, color, hash3(Math.round(x * 3), Math.round(z * 3), 5, 97) * 6.28);
      if (halo) lights.halo(x, y, z, halo, x * 0.37);
    },
  };
  occupy(field, spots);
  for (const h of HOMES) backHouse(h, env);
  granary(env);
  buildYard(env, spots);
  buildSala(env);
  const lotus = buildPond(env, spots);
  const palms = buildTrees(env);
  // The morning market at the lane's foot: its blocks after the hamlet's (tagged: what comes and goes), its lamps among the glows.
  const tm = performance.now();
  const market = buildBackMarket(field);
  occupyMarket(field, market);
  const base = world.boxes.length;
  world.append(market.mk.b);
  for (let i = base; i < world.boxes.length; i++) if (world.boxes[i].mat === 'metal') world.boxes[i].mat = 'mapStone';
  const tags = new Array<number>(base).fill(0);
  for (const t of market.mk.tags) tags.push(t);
  const lamps = market.lamps.map((l) => {
    const glowAt = lights.still.list.length;
    lights.still.add(l.x, l.y, l.z, l.sx, l.sy, l.sz, 0, l.color, hash3(Math.round(l.x * 10), Math.round(l.z * 10), 3, 91) * 6.28);
    const haloAt = lights.halos.length;
    lights.halo(l.x, l.y, l.z, l.halo, l.x * 0.37);
    return { ...l, glowAt, haloAt };
  });
  registerBackShops(field);
  const marketMs = performance.now() - tm;

  const object = new Group();
  object.name = 'backHamlet';
  const voxels = buildVoxelMesh(world, { quality: ctx.quality === 'low' ? 'low' : 'medium', name: 'hamlet:back' });
  object.add(voxels);
  swayLeaves(voxels, field);
  object.add(palms.object);
  const glow = lights.build(ctx.renderer);
  object.add(glow.object);
  const toggles = new BackToggles(voxels, world.boxes, tags);
  const switches = new LampSwitch(glow.object, lamps);
  const steam = buildSteam(market.steam);
  steam.object.name = 'hamlet:back-steam';
  object.add(steam.object);
  const fires = buildSmoke(smoke);
  fires.object.name = 'hamlet:back-smoke';
  object.add(fires.object);
  const params = new URLSearchParams(location.search);
  const mist = buildPondMist(POND.x, POND.z, POND.rx, POND.rz, POND.rot ?? 0, spots.pond.level, params.get('pondmist') === '1');
  object.add(mist.object);
  // (the smoke, the mist and the halos never cast; the blocks only while their shadows can be seen)
  const shadows = new ShadowGate(true).addAll(voxels);
  BACK_BUILT.object = object;
  const blocks = world.boxes.length;
  console.info(
    `[map] hamlet behind Angkor Wat: ${blocks} blocks (the market ${world.boxes.length - base}, ${toggles.tags.length} toggles, ${BM_STALLS.length} stalls, ${lamps.length} lamps, ${market.steam.length} pots; ${marketMs.toFixed(1)} ms), ${palms.palms} palms, ${lights.still.list.length} glows, ${smoke.length} fires · built in ${Math.round(performance.now() - t0)} ms`,
  );

  // The market's day: which stalls are open (their goods and spread tarps, or rolled tarps), the busy morning's bicycles, the lamps (only when the clock has moved on).
  const force = params.get('bhopen');
  const stallOn = BM_STALLS.map(() => false);
  const stallIndex = new Map(BM_STALLS.map((s, i) => [s.id, i]));
  const isOpen = (id: string) => stallOn[stallIndex.get(id) ?? -1] ?? false;
  let lastClock = -1;
  const follow = (f: MapFrame) => {
    const c = f.clock;
    if (Math.abs(c - lastClock) < 0.0005) return;
    lastClock = c;
    BM_STALLS.forEach((s, i) => {
      const on = force === 'all' ? true : force === 'none' ? false : stallOpen(s, c);
      stallOn[i] = on;
      toggles.set(openTag(i), on);
      toggles.set(closedTag(i), !on);
    });
    toggles.set(BUSY_TAG, force === 'all' || (force !== 'none' && inWin(c, BUSY)));
    lamps.forEach((l, k) => {
      const open = isOpen(l.stall);
      switches.set(k, l.on === 'fire' ? open : l.on === 'dawn' ? open && inWin(c, DAWN_LAMP) : open && inWin(c, EVENING_LAMP));
    });
  };

  let frames = 0;
  let nextCall = 0;
  return {
    object,
    blocks,
    update(f: MapFrame) {
      const c = f.camera.position;
      // (drawn in the first frames wherever the camera is: its shaders compile at load)
      const near = len2(c.x - BACK_HAMLET.x, c.z - BACK_HAMLET.z) < FAR;
      object.visible = near || frames < 4;
      frames++;
      if (!object.visible) return;
      shadows.update(f);
      palms.update(f);
      glow.update(f, f.camera);
      const scale = pointScale(ctx.renderer, f.camera);
      fires.update(f, scale);
      mist.update(f, scale);
      follow(f);
      steam.update(f, scale, isOpen);
      if (f.dt > 0) nextCall = calls(f, nextCall, spots.ground);
    },
    // (the nature book: the pond's lotus, the sugar palms)
    subjects(out: Subject[]) {
      if (!object.visible) return;
      for (const l of lotus) out.push(l);
      palms.subjects(out);
    },
  };
}

/** Roosters at dawn, hens by day, now and then from the yard (when the ears are near). Returns when to call next. */
function calls(f: MapFrame, next: number, ground: number): number {
  if (f.t < next) return next;
  const l = f.listener;
  if (len2(l.x - BACK_HAMLET.x, l.z - BACK_HAMLET.z) > HEAR) return f.t + 5;
  const r = hash3(Math.floor(f.t * 10), 7, 3, 98);
  const dawn = f.clock > 0.7 && f.clock < 0.9;
  const day = f.night < 0.45;
  if (dawn || day) {
    const h = HOMES[Math.floor(r * HOMES.length) % HOMES.length];
    const rooster = dawn ? r < 0.7 : r < 0.12;
    f.calls.push({ kind: rooster ? 'rooster' : 'hen', x: h.x, y: ground + 0.5, z: h.z, gain: rooster ? 0.5 : 0.32 });
  }
  return f.t + (dawn ? 8 : 15) + r * 20;
}

/**
 * Keep the jungle's trees (and the undergrowth) off what the hamlet builds
 * on: the yard, the houses and their stairs, the granary, the pen, the
 * garden, the well, the sala and the cart, the jetty's foot, the wallow's
 * mud, the trees it plants itself. (Grass between them stays open.)
 */
function occupy(field: HeightField, spots: BackSpots): void {
  const box = (pts: [number, number][], pad: number) => {
    const xs = pts.map((p) => p[0]);
    const zs = pts.map((p) => p[1]);
    field.occupy(Math.min(...xs) - pad, Math.min(...zs) - pad, Math.max(...xs) + pad, Math.max(...zs) + pad);
  };
  // The yard: the dirt in the middle.
  field.occupy(BACK_HAMLET.x - 13, BACK_HAMLET.z - 14, BACK_HAMLET.x + 12, BACK_HAMLET.z + 11);
  for (const h of HOMES) {
    const { zf, zb, footZ } = homeFront(h);
    const hw = h.w / 2 + 0.6;
    box([homeToWorld(h, -hw, zb - (h.deck ? 1.5 : 0.6)), homeToWorld(h, hw, zb - 0.6), homeToWorld(h, -hw, footZ), homeToWorld(h, hw, footZ), homeToWorld(h, hw, zf)], 1.5);
  }
  field.occupy(GRANARY.x - 3, GRANARY.z - 3, GRANARY.x + 3, GRANARY.z + 3);
  // (the paddy drying by the granary)
  field.occupy(144, -370, 149.5, -365.5);
  field.occupy(PEN.x0 - 3.5, PEN.z0 - 1, PEN.x1 + 1, PEN.z1 + 1);
  field.occupy(GARDEN.x0 - 0.5, GARDEN.z0 - 0.5, GARDEN.x1 + 0.5, GARDEN.z1 + 0.5);
  field.occupy(WELL[0] - 2, WELL[1] - 2, WELL[0] + 3, WELL[1] + 2);
  box([salaToWorld(-SALA.w / 2 - 1.2, -SALA.d / 2 - 1), salaToWorld(CART.lx + 1.6, -SALA.d / 2 - 1), salaToWorld(-SALA.w / 2 - 1.2, CART.stools[1][1] + 0.6), salaToWorld(CART.lx + 1.6, CART.stools[1][1] + 0.6)], 0.5);
  const [rx, rz] = spots.pond.jetty.root;
  field.occupy(rx - 3, rz - 3.5, rx + 2.5, rz + 4.5);
  const [wx, wz] = spots.pond.west.dry;
  field.occupy(wx - 5, wz - 5, wx + 2, wz + 5);
  for (const [x, z, r] of treeFeet()) field.occupy(x - r - 1, z - r - 1, x + r + 1, z + r + 1);
  field.occupy(MEADOW.herder[0] - 1.5, MEADOW.herder[1] - 1.5, MEADOW.herder[0] + 1.5, MEADOW.herder[1] + 1.5);
}
