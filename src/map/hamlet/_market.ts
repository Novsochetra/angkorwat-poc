import { Group, Vector3, type ShaderMaterial } from 'three';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { ShadowGate } from '../cull';
import { len2 } from '../fauna/_len';
import { pointScale } from '../road/glow';
import type { MapContext, MapFrame } from '../types';
import { ShrineGlow } from '../jungle/_incense';
import { buildSmoke } from '../village/_smoke';
import type { HamletPiece } from './index';
import { MkBuild } from './_mkKit';
import { buildLights } from './_mkLights';
import { BUSY, inWindow, MK, NOODLE_BULB, STALLS, stallById, stallPoint, TABLE_BULB } from './_mkPlan';
import { buildSteam } from './_mkSteam';
import { buildStalls, closedTag, openTag, PARKING_TAG, type Lamp } from './_mkStalls';
import { Toggles } from './_mkToggles';
import { registerMarketShops } from './_shops';

/**
 * The morning market (ផ្សារព្រឹក, layout.ts `MARKET`) in the square where
 * the east village road comes down from Ta Prohm's hills and turns east
 * along the sugar-palm village's street (off the picker's frame: seen while
 * roaming, flying in from Ta Prohm's glider ramp or walking down the road).
 * Where everything stands: `_mkPlan.ts` (the people, people/_sceneMarket.ts,
 * read it too).
 *
 * - Rows of stalls facing each other across the road under faded blue,
 *   orange and striped tarps on bamboo poles and big market parasols;
 *   tables, a raised bamboo platform, goods on a mat, a rack of kramas and
 *   sarongs (`_mkStalls.ts`, `_mkKit.ts`); a covered hall with a long roof of
 *   rusty corrugated tin on wooden posts; the painted sign "ផ្សារ" over the
 *   way in (`_mkSign.ts`); a big shade tree over the noodle stall's low
 *   tables and plastic stools; the grill, the sugarcane cart; motos and
 *   bicycles parked.
 * - Goods that read from a few metres away (`_mkGoods.ts`): silver fish in
 *   round basins and a big snakehead, dried fish, prahok jars, morning glory,
 *   long beans, chillies, lemongrass, eggplants, pumpkins, mangoes, bananas,
 *   dragon fruit, rambutan, pomelos, coconuts, palm sugar cakes and rice in
 *   open sacks, kramas and sarongs, baskets, mats and palm-leaf hats, lotus
 *   buds, marigold garlands and incense, pork on the block, skewers on the
 *   grill, sugarcane.
 * - The day: each stall is open over its own window of the clock (`STALLS`
 *   `open`): the fish before dawn, the square busiest in the morning, half
 *   the stalls packed up by the afternoon (their tarps rolled, parasols
 *   folded), all gone at dusk but the grill and the noodle stall, and at
 *   night only the noodle stall under its bare bulb and string of lights.
 *   What changes is shown and hidden (`_mkToggles.ts`: instances folded
 *   away, nothing built again) a few times a day.
 * - Steam off the noodle pots (`_mkSteam.ts`), the grill's smoke (the
 *   village's kitchen smoke, village/_smoke.ts), glows and halos, pools of
 *   lamplight at night (`_mkLights.ts`; no light is added).
 * - The neak ta shrine at the tree's foot (`_mkStalls.ts` `neakTa`): its
 *   candles, incense tips and thread of smoke are the jungle shrines' lights
 *   (jungle/_incense.ts).
 *
 * Cost: ≈ 2.5 k blocks in four voxel draws (wood, tin, goods, leaves: one per
 * family), the glows (blocks, halos, the night's pools), steam and smoke
 * points, the shrine's lights; far off (> `NEAR` m) all but the voxels hide
 * and the update does nothing but the shadow gate. URL: `mkopen=all|none`
 * (every stall open or shut, whatever the clock; the people follow it too).
 */

/** The camera within this (m): the small things show and the time of day is followed. */
const NEAR = 330;

export function buildMarket(ctx: MapContext): HamletPiece {
  const t0 = performance.now();
  const field = ctx.field;
  const mk = new MkBuild();
  const built = buildStalls(field, mk);
  // Trees keep off the square and whatever stands on it.
  field.occupy(MK.x - 21, MK.z - 23, MK.x + 18, MK.z + 14);
  for (const [x0, z0, x1, z1] of built.covers) field.occupy(x0, z0, x1, z1);

  const object = new Group();
  object.name = 'market';
  const voxels = buildVoxelMesh(mk.b, { quality: ctx.quality === 'low' ? 'low' : 'medium', name: 'market' });
  object.add(voxels);
  const toggles = new Toggles(voxels, mk);
  // (pools of lamplight under the noodle stall's two bulbs: over its cart, and over the tables from the tree)
  const [bx, bz] = stallPoint(stallById('noodles'), NOODLE_BULB.x, NOODLE_BULB.z);
  const pools = [new Vector3(MK.x + bx, 0, MK.z + bz), new Vector3(MK.x + TABLE_BULB.x, 0, MK.z + TABLE_BULB.z)];
  for (const p of pools) p.y = field.heightAt(p.x, p.z);
  const lights = buildLights(built.lamps, ctx.renderer, pools);
  object.add(lights.object);
  const steam = buildSteam(built.steam);
  object.add(steam.object);
  const smoke = buildSmoke(built.smoke);
  smoke.object.name = 'market:smoke';
  object.add(smoke.object);
  const smokeAmount = (smoke.object.material as ShaderMaterial).uniforms.uAmount;
  // The neak ta shrine's candles, incense tips and thread of smoke (the jungle shrines' lights).
  const shrine = new ShrineGlow(built.shrine);
  shrine.object.name = 'market:shrine';
  object.add(shrine.object);
  // (the voxels cast shadows while their ground is seen; drawn wherever the camera is in the first frames, so their shaders compile at load)
  const shadows = new ShadowGate(true).addAll(voxels);
  // (its food and drink stalls sell to the roaming explorer while they are open: _shops.ts)
  registerMarketShops(field);

  console.info(
    `[map] market: ${STALLS.length} stalls · ${mk.b.boxes.length} blocks (${toggles.tags.length} toggles) · ${built.lamps.length} lamps · ${built.steam.length} pots, ${built.smoke.length} grill · built in ${(performance.now() - t0).toFixed(1)} ms`,
  );
  const params = new URLSearchParams(location.search);
  const force = params.get('mkopen');
  const open = STALLS.map(() => false);
  const index = new Map(STALLS.map((s, i) => [s.id, i]));
  const isOpen = (id: string) => open[index.get(id) ?? -1] ?? false;
  const lit = (on: Lamp['on']) => (on === 'dawn' ? dawnLamps : on === 'noodle' ? noodleLit : grillLit);
  let dawnLamps = false;
  let noodleLit = false;
  let grillLit = false;
  let near = true;
  let lastClock = -1;

  /** The stalls open now, and what shows (only when the clock has moved on). */
  const follow = (f: MapFrame) => {
    const c = f.clock;
    if (Math.abs(c - lastClock) < 0.0005) return;
    lastClock = c;
    STALLS.forEach((s, i) => {
      const on = force === 'all' ? true : force === 'none' ? false : inWindow(c, s.open);
      open[i] = on;
      toggles.set(openTag(i), on);
      toggles.set(closedTag(i), !on);
    });
    toggles.set(PARKING_TAG, force === 'all' || (force !== 'none' && inWindow(c, [BUSY[0], 0.12])));
    // The lamps: the sellers' before sunrise; the noodle stall's from dusk to dawn while it is open; the grill's embers at dusk.
    dawnLamps = inWindow(c, [0.67, 0.765]);
    noodleLit = isOpen('noodles') && inWindow(c, [0.18, 0.78]);
    grillLit = isOpen('grill') && f.night > 0.25;
  };

  return {
    object,
    blocks: mk.b.boxes.length,
    update(f: MapFrame) {
      shadows.update(f);
      const cam = f.camera.position;
      const d = len2(cam.x - MK.x, cam.z - MK.z);
      const nowNear = d < NEAR;
      if (nowNear !== near) {
        near = nowNear;
        lights.object.visible = steam.object.visible = smoke.object.visible = shrine.object.visible = near;
      }
      if (!near) return;
      follow(f);
      lights.update(f, f.camera, lit);
      shrine.update(f);
      const scale = pointScale(ctx.renderer, f.camera);
      steam.update(f, scale, isOpen);
      smoke.update(f, scale);
      // (the grill's smoke while it is open, thicker as it gets going; none in rain)
      const grill = isOpen('grill');
      smokeAmount.value = grill ? 0.75 * (1 - 0.7 * f.weather.rain) : 0;
      smoke.object.visible = grill;
    },
  };
}
