import { Group, Sphere, Vector3, type Mesh, type Points, type ShaderMaterial } from 'three';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { ShadowGate } from '../cull';
import { Glow } from '../festival/_glow';
import { Kit, kitUniforms, PERIOD } from '../festival/_kit';
import { nagaFanReady, stairNaga } from '../sacred/naga';
import { trackSacred } from '../sacred/pending';
import { SacredSet } from '../sacred/set';
import { addLamp } from '../sky/lampSlots';
import type { MapContext, MapFrame } from '../types';
import { buildBoard } from './board';
import { nightHeld, nyeSeconds } from './clock';
import type { NyePiece } from './index';
import { LAKE_GATE, LAKE_SHORE, LAKE_STAGE, LAKE_WALL, lakePlazaAt } from './plan';
import { buildBeams } from './_sqGlow';
import { buildNyeRing } from './_sqRing';
import { Bodies, lakeFrame, smooth } from './_lkKit';
import { growLakeMeadow } from './_lkMeadow';
import { buildLakeShore } from './_lkShore';
import { buildLakeStage } from './_lkStage';
import { deepWater, WaterLights } from './_lkReflect';
import { dressLakeWater } from './_lkWater';

/**
 * New Year's Eve's second stage, by the great lake (AWP-35; where: plan.ts `LAKE_STAGE`, `LAKE_SHORE`, `LAKE_VIEW`):
 * the lakeside crowd on a paved terrace over the north-east shore looks across the shallows at a floating stage, the
 * open lake behind it (the fireworks over the water: `LAKE_SHOW`), the floating village's lights to the left.
 *
 * - The stage (`_lkStage.ts`): bamboo floats, a teak deck with a red lacquer skirt and a row of small bulbs, two big
 *   naga rearing either side of the board's front, their bodies along the front rail, fire bowls (live flames in the
 *   kit: `_sqKit.ts` `kitFire`), Khmer lamps, and at its back a deep carved sandstone gate over the second countdown board
 *   (`board.ts`, 10 × 5 m, the same states as Kulen's: clock.ts `boardAt`) under three lotus-bud towers outlined in
 *   bulbs, red banners with the white Angkor Wat on tall poles. Its blocks lie square to it in a turned group (one voxel
 *   draw, the carving one more).
 * - The shore (`_lkShore.ts`): the round plaza (`_lkPlaza*.ts`: concentric pavers round a gold lotus mandala — the
 *   Kulen ring's painting, `_sqRing.ts` — the ring wall with fire pillars, lamp posts and string lights, the Bayon-face
 *   gate with naga along its avenue, two salas, food stalls, flower beds, a lily pond), the ghat down into the water,
 *   the jetty to the stage, lantern poles and the string lights fanning from the stage, flowering trees.
 * - The garden round it (`_lkMeadow.ts`): groves, blossom trees, palms by the water, bananas, shrubs, tall grass, reeds,
 *   lilies, the fishermen's corner (nets drying, fish traps, a skiff on the sand), stepping stones; in the shore's mesh.
 * - On the water (`_lkWater.ts`): floating lotus candles from the ghat and round the stage, lily pads and glowing
 *   lotus, moored boats; every light's reflection a warm streak (`_lkReflect.ts`); at night the water round the venue
 *   deepened to the reference's blue (`_lkReflect.ts` `deepWater`, one draw).
 * - The event night (clock.ts `nightHeld`): more candles and the lantern flotilla (`_lkBoats.ts`: lantern boats, lotus
 *   floats, two illuminated floats with Angkor Wat in lights; in a kit of their own, drawn only then), gold
 *   searchlight beams from behind the stage over the water (the square's, `_sqGlow.ts` `buildBeams`), everything
 *   brighter; with the count the stage's light beats.
 *
 * Draws: the stage's blocks and carving (2), the shore's blocks (a mesh per family: stone, leaf, bark, petal), the kit
 * (cloth, flags, wires, candles, boats, blossom, the plaza's fire tongues and embers, the stage's live flames: 1), the
 * glowing boxes (gilt, bulbs, lantern glass, the plaza's fires' hearts: 1), the glow (the shore's halos and streaks: 1),
 * the water lights (what floats: halos; every light's reflection on the water: 1), the board (1), the naga (1, once
 * sculpted), the deep water (1, at night), the plaza's light on the ground (its pools of firelight and its mandala: 1);
 * but on low the naga by the plaza's gate (1); on the event night the night's kit (the extra candles, the flotilla: 1)
 * and the beams (1). Two real lights at night (sky/lampSlots.ts): over the stage's front, and low before the plaza's
 * gate (its Bayon face lit from below). Nothing moves but in shaders and the board's texture (the part is FROZEN):
 * the stage's group is turned once, at the build.
 */
export function buildNyeLake(ctx: MapContext): NyePiece {
  const t0 = performance.now();
  const { field } = ctx;
  const low = ctx.quality === 'low';
  const fr = lakeFrame(field);
  const object = new Group();
  object.name = 'nye:lake';

  const u = kitUniforms();
  const kit = new Kit();
  const glow = new Glow();
  const eventKit = new Kit();
  /** The halos of what floats and every light's reflection on the water (one draw; the event night's only then). */
  const lights = new WaterLights();
  const bodies = new Bodies();

  // ── The stage, the shore, the water ──
  const stage = buildLakeStage(fr, kit, bodies, glow, lights, low);
  object.add(stage.object);
  const tStage = performance.now();
  const sb = new VoxelBuilder();
  const shore = buildLakeShore(field, sb, kit, kit, bodies, glow, fr, stage.anchors, low);
  // The garden round it all (groves, palms by the water, bananas, shrubs, tall grass, reeds and lilies, the fishermen's corner): after the shore.
  const kitBefore = kit.count;
  growLakeMeadow(sb, kit, glow, field, fr, low);
  const meadow = sb.boxes.length - shore.blocks;
  const meadowKit = kit.count - kitBefore;
  const shoreMesh = buildVoxelMesh(sb, { quality: low ? 'low' : 'medium', name: 'nye:lake:shore' });
  object.add(shoreMesh);
  // The plaza's light on the ground: the pools of firelight round its fires, lamps, stalls and salas, and the gold
  // lotus mandala in its middle (the Kulen ring's painted texture, `_sqRing.ts`), one additive draw (`_lkPlazaLight.ts`).
  const m = shore.plaza.mandala;
  const painted = buildNyeRing(m.x, m.y, m.z, m.r, low);
  painted.mesh.geometry.dispose();
  shore.plaza.pools.mandala(m.x, m.y, m.z, m.r + 1.4);
  const plazaLight = shore.plaza.pools.build('nye:lake:plaza', (painted.mesh.material as ShaderMaterial).uniforms.uMap.value, 0xffb848, 0.8);
  object.add(plazaLight.mesh);
  const tShore = performance.now();
  const water = dressLakeWater(field, fr, kit, glow, eventKit, lights, shore.waterEdge, low);
  // (the stage on the water: no trees, nothing else built there)
  for (let v = -LAKE_STAGE.d / 2 - 1; v <= LAKE_STAGE.d / 2 + 1; v += 1.5)
    for (let w = -LAKE_STAGE.w / 2 - 1; w <= LAKE_STAGE.w / 2 + 1; w += 1.5) {
      const [x, z] = fr.at(w, v);
      field.occupy(x - 1, z - 1, x + 1, z + 1);
    }

  // ── The searchlights behind the stage (the event night), leaning out over the lake ──
  const beamBases: [number, number, number, number][] = [];
  const offs = low ? [-8, -2.7, 2.7, 8] : [-9.5, -5.7, -1.9, 1.9, 5.7, 9.5];
  for (const [i, du] of offs.entries()) {
    const [x, z] = fr.at(du, -LAKE_STAGE.d / 2 - 0.2);
    beamBases.push([x, fr.deck + 0.4, z, i]);
    lights.halo(x, fr.deck + 0.7, z, 0xffd080, 1.6, { level: 0.4, event: true });
  }
  // (the Kulen beams' look: soft and slim, so they frame the stage and the show and do not fill the crowd's sky)
  const beams = buildBeams(beamBases, offs.length, fr.yaw + Math.PI, new Sphere(new Vector3(fr.x, fr.deck + 120, fr.z), 280), { level: 0.2, width: 20 });
  object.add(beams.mesh);

  // ── Where it all is: the bounds three culls by ──
  const mid = new Vector3((fr.x + LAKE_SHORE.x) / 2, fr.deck + 6, (fr.z + LAKE_SHORE.z) / 2);
  const reach = Math.hypot(LAKE_SHORE.x - fr.x, LAKE_SHORE.z - fr.z) / 2 + Math.max(LAKE_SHORE.rx, LAKE_SHORE.rz) + 55;
  const bound = (mesh: Mesh, r = reach, at = mid) => {
    mesh.geometry.boundingSphere = new Sphere(at.clone(), r);
    mesh.frustumCulled = true;
  };
  /** The night's flotilla reaches ≈ 150 m out round the stage (`_lkBoats.ts`). */
  const lakeMid = new Vector3(fr.x, fr.water + 4, fr.z);
  const kitMesh = kit.build('nye:lake', u);
  kitMesh.show(true);
  kitMesh.mesh.castShadow = false;
  bound(kitMesh.mesh);
  object.add(kitMesh.mesh);
  const halos = glow.build('nye:lake', u);
  bound(halos.mesh);
  object.add(halos.mesh);
  const extraKit = eventKit.build('nye:lake:candles', u);
  extraKit.mesh.castShadow = false;
  bound(extraKit.mesh, 175, lakeMid);
  object.add(extraKit.mesh);
  const waterLights = lights.build('nye:lake', u);
  bound(waterLights.mesh, 185, lakeMid);
  object.add(waterLights.mesh);
  // The great lake at night: deep blue under the warm reflections, from the venue to the far shore it looks across
  // (round the lake's middle, west of the stage; the floating village's water too), the moon's path left bright.
  const deep = deepWater(-468, 14, fr.water + 0.035, 170, 310);
  object.add(deep.mesh);


  // ── The board, facing the shore ──
  const board = buildBoard({ ...stage.board, yaw: fr.yaw, far: 200, name: 'nye:lake:board', ground: 'lake' });
  object.add(board.mesh);

  // ── The glowing boxes (built after everything put its flames in) ──
  const body = bodies.build('nye:lake:bodies');
  if (body) object.add(body.mesh);

  // ── The naga (sculpted in a worker: sacred/naga.ts) ──
  const sacred = new SacredSet('nye:lake');
  object.add(sacred.object);
  void trackSacred(
    Promise.all([nagaFanReady('stair'), nagaFanReady('stairFar')]).then(() => {
      sacred.add(stairNaga({ ...stage.naga, look: 'stone', hide: 320 }));
    }),
  );
  // (and the plaza's two along its avenue, by the gate: not on low)
  const plazaNaga = shore.plaza.naga;
  if (plazaNaga) void trackSacred(Promise.all([nagaFanReady('stair'), nagaFanReady('stairFar')]).then(() => void sacred.add(stairNaga({ ...plazaNaga, look: 'stone', hide: 260 }))));

  // ── Two real lights at night: before the stage, over the plaza's avenue before its gate ──
  // (high and out over the shallows, a softer warm white: the gate and its towers lit, the dancers on the deck's front in
  // their own colours, not turned orange by a lamp a few metres off)
  const [sx, sz] = fr.at(0, LAKE_STAGE.d / 2 + 6);
  const stageAt = new Group();
  stageAt.position.set(sx, fr.deck + 6.5, sz);
  stageAt.name = 'nye lake stage light';
  const terraceAt = new Group();
  {
    // (low on the avenue before the plaza's gate, by its braziers: it lights the gate's Bayon face warm from below; the
    // plaza's floor has its pools of firelight, the stage's light reaches its front)
    const [tx, tz] = lakePlazaAt(LAKE_GATE.phi, LAKE_WALL.r + LAKE_GATE.depth / 2 + 6.5);
    terraceAt.position.set(tx, field.heightAt(tx, tz) + 3.6, tz);
  }
  terraceAt.name = 'nye lake terrace light';
  object.add(stageAt, terraceAt);
  // (a warm white, not orange: the stone should read pale sandstone lit by fire, not an orange box)
  const stageLamp = addLamp({ kind: 'point', name: 'nye lake stage', color: 0xffe2c8, distance: 34, anchor: stageAt });
  const terraceLamp = addLamp({ kind: 'point', name: 'nye lake terrace', color: 0xffc488, distance: 30, anchor: terraceAt });

  const shadows = new ShadowGate(true).addAll(object);
  object.updateMatrixWorld(true);

  const blocks = stage.blocks + shore.blocks + meadow + kitMesh.boxes + extraKit.boxes;
  let draws = 0;
  object.traverse((o) => {
    if ((o as Mesh).isMesh || (o as Points).isPoints) draws++;
  });
  console.info(
    `[map] nye lake: ${blocks} blocks (stage ${stage.blocks}, shore ${shore.blocks}, meadow ${meadow} + ${meadowKit} in the kit, kit ${kitMesh.boxes} + ${extraKit.boxes} on the night) · ${bodies.count} glowing boxes (stage bulbs ${stage.bulbs}) · ${stage.flames} live flames · ${glow.count} glows, ${lights.count} water lights · ${water.candles} candles · flotilla ${water.flotilla.boats} boats, ${water.flotilla.lotus} lotus floats, ${water.flotilla.floats} illuminated floats · ${draws} meshes (the naga +1) · tower tip ${stage.top.toFixed(1)} m · deck ${fr.deck.toFixed(2)} m · built in ${(performance.now() - t0).toFixed(0)} ms (stage ${(tStage - t0).toFixed(0)}, shore ${(tShore - tStage).toFixed(0)})`,
  );

  let now = 0;
  let started = false;
  let frames = 0;
  return {
    object,
    blocks,
    update(f: MapFrame) {
      if (!started) {
        started = true;
        now = f.t;
      } else now += f.dt;
      const n = f.night;
      const lit = smooth(0.3, 0.75, n);
      const event = nightHeld() ? 1 : 0;
      // The count: a beat each second in the last ten, then a slow throb after midnight.
      let pulse = 0;
      if (event) {
        const s = nyeSeconds();
        if (s >= -10 && s < 0) pulse = 0.35 + 0.65 * Math.exp(-(s - Math.floor(s)) * 4);
        else if (s >= 0 && s < 120) pulse = (0.65 + 0.35 * Math.sin(now * 2.6)) * (1 - smooth(80, 120, s));
      }
      u.uTime.value = ((now % PERIOD) + PERIOD) % PERIOD;
      u.uNight.value = n;
      u.uGlow.value = 0.3 + 3.2 * n * n;
      // (the small things — cloth, candles, boats, bulbs, halos — only within 600 m: past it they are a few pixels)
      // (and drawn wherever the camera is in the first frames, so their shaders compile at load)
      const first = frames++ < 4;
      const near = first || f.camera.position.distanceToSquared(mid) < 600 * 600;
      kitMesh.mesh.visible = near;
      halos.level.value = lit * (1 + 0.3 * event);
      halos.show(lit > 0);
      halos.mesh.visible = near && lit > 0;
      const extra = near && event > 0 && lit > 0;
      extraKit.show(extra);
      extraKit.mesh.visible = extra;
      waterLights.update(near ? lit * (1 + 0.3 * event) : 0, event);
      // (in the first frames drawn with nothing in them, so the program compiles at load, not at dusk)
      waterLights.mesh.visible = near && (lit > 0 || first);
      if (body) body.mesh.visible = near;
      body?.update(n, event + 0.4 * pulse);
      // (the deep water fades out as the camera leaves the venue, rather than going at once: from 450 m to 600 m)
      const dm = Math.sqrt(f.camera.position.distanceToSquared(mid));
      deep.update(n, event, 1 - smooth(450, 600, dm), f.lightDir);
      if (first) deep.mesh.visible = true;
      beams.u.uLevel.value = event * lit;
      beams.u.uTime.value = now % 600;
      beams.mesh.visible = event * lit > 0.001;
      const breathe = 1 + 0.06 * Math.sin(f.t * 2.3) + 0.04 * Math.sin(f.t * 3.7);
      stageLamp.intensity = 150 * lit * breathe * (1 + 0.45 * event + 0.5 * pulse);
      terraceLamp.intensity = 55 * lit * (1 + 0.3 * event);
      board.update(f);
      plazaLight.update(n, event, now);
      plazaLight.mesh.visible = near && plazaLight.mesh.visible;
      sacred.update(f);
      shadows.update(f);
    },
  };
}
