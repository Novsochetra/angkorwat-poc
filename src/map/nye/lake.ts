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
import { LAKE_GATE, LAKE_SHORE, LAKE_STAGE, lakePlazaAt } from './plan';
import { buildBeams } from './_sqGlow';
import { buildNyeRing } from './_sqRing';
import { Bodies, lakeFrame, smooth } from './_lkKit';
import { growLakeMeadow } from './_lkMeadow';
import { buildLakeShore } from './_lkShore';
import { buildLakeStage } from './_lkStage';
import { dressLakeWater } from './_lkWater';

/**
 * New Year's Eve's second stage, by the great lake (AWP-35; where: plan.ts `LAKE_STAGE`, `LAKE_SHORE`, `LAKE_VIEW`):
 * the lakeside crowd on a paved terrace over the north-east shore looks across the shallows at a floating stage, the
 * open lake behind it (the fireworks over the water: `LAKE_SHOW`), the floating village's lights to the left.
 *
 * - The stage (`_lkStage.ts`): bamboo floats, a teak deck with a red lacquer skirt, naga balustrades at its front
 *   corners, Khmer lamps, fire bowls, and at its back a carved sandstone gate with a lotus-bud prasat over the second
 *   countdown board (`board.ts`, 9 × 4.5 m, the same states as Kulen's: clock.ts `boardAt`), red banners with the white
 *   Angkor Wat. Its blocks lie square to it in a turned group (one voxel draw, the carving one more).
 * - The shore (`_lkShore.ts`): the round plaza (`_lkPlaza*.ts`: concentric pavers round a gold lotus mandala — the
 *   Kulen ring's painting, `_sqRing.ts` — the ring wall with fire pillars, lamp posts and string lights, the Bayon-face
 *   gate with naga along its avenue, two salas, food stalls, flower beds, a lily pond), the ghat down into the water,
 *   the jetty to the stage, lantern poles and the string lights fanning from the stage, flowering trees.
 * - The garden round it (`_lkMeadow.ts`): groves, blossom trees, palms by the water, bananas, shrubs, tall grass, reeds,
 *   lilies, the fishermen's corner (nets drying, fish traps, a skiff on the sand), stepping stones; in the shore's mesh.
 * - On the water (`_lkWater.ts`): floating lotus candles from the ghat and round the stage, lily pads, moored boats.
 * - The event night (clock.ts `nightHeld`): more candles (a kit and glow of their own, drawn only then), gold
 *   searchlight beams from behind the stage over the water (the square's, `_sqGlow.ts` `buildBeams`), everything
 *   brighter; with the count the stage's light beats.
 *
 * Draws: the stage's blocks and carving (2), the shore's blocks (a mesh per family: stone, leaf, bark, petal), the kit
 * (cloth, flags, wires, candles, boats, blossom, the fires' tongues and embers: 1), the glowing boxes (flames, gilt,
 * bulbs, lantern glass: 1), the glow (halos, streaks: 1), the board (1), the naga (1, once sculpted); but on low the
 * plaza's mandala (1) and the naga by its gate (1); on the event night the extra candles (2) and the beams (1). Two
 * real lights at night (sky/lampSlots.ts): over the stage's front, and out over the plaza's avenue before its gate (the
 * gate's face, the plaza's back half). Nothing moves but in shaders and the board's texture (the part is FROZEN): the
 * stage's group is turned once, at the build.
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
  const eventGlow = new Glow();
  const bodies = new Bodies();

  // ── The stage, the shore, the water ──
  const stage = buildLakeStage(fr, kit, bodies, glow, low);
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
  // The plaza's gold lotus mandala (the Kulen ring's painting: one additive quad; not on low, where the paving's
  // darker disc and gilt middle stone carry it).
  const m = shore.plaza.mandala;
  const ring = low ? null : buildNyeRing(m.x, m.y, m.z, m.r, false);
  if (ring) {
    // (a dimmer gold than the Kulen square's: the reference's lotus is thin bright lines on dark stone, not a pool of light)
    (ring.mesh.material as ShaderMaterial).uniforms.uColor.value.multiplyScalar(0.45);
    ring.mesh.name = 'nye:lake:mandala';
    object.add(ring.mesh);
  }
  const tShore = performance.now();
  const water = dressLakeWater(field, fr, kit, glow, eventKit, eventGlow, shore.waterEdge, low);
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
    eventGlow.add(x, fr.deck + 0.7, z, 0xffd080, 2.6, { level: 0.55 });
  }
  const beams = buildBeams(beamBases, offs.length, fr.yaw + Math.PI, new Sphere(new Vector3(fr.x, fr.deck + 120, fr.z), 280));
  object.add(beams.mesh);

  // ── Where it all is: the bounds three culls by ──
  const mid = new Vector3((fr.x + LAKE_SHORE.x) / 2, fr.deck + 6, (fr.z + LAKE_SHORE.z) / 2);
  const reach = Math.hypot(LAKE_SHORE.x - fr.x, LAKE_SHORE.z - fr.z) / 2 + Math.max(LAKE_SHORE.rx, LAKE_SHORE.rz) + 55;
  const bound = (mesh: Mesh, r = reach) => {
    mesh.geometry.boundingSphere = new Sphere(mid.clone(), r);
    mesh.frustumCulled = true;
  };
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
  bound(extraKit.mesh);
  object.add(extraKit.mesh);
  const extraHalos = eventGlow.build('nye:lake:candles', u);
  bound(extraHalos.mesh);
  object.add(extraHalos.mesh);

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
  const [sx, sz] = fr.at(0, LAKE_STAGE.d / 2 + 3);
  const stageAt = new Group();
  stageAt.position.set(sx, fr.deck + 3.6, sz);
  stageAt.name = 'nye lake stage light';
  const terraceAt = new Group();
  {
    // (out over the avenue before the plaza's gate: it lights the gate's face and the plaza's back half through it; the
    // stage's light reaches the plaza's front half, the mandala glows in the middle)
    const [tx, tz] = lakePlazaAt(LAKE_GATE.phi, 28);
    terraceAt.position.set(tx, field.heightAt(tx, tz) + 8.5, tz);
  }
  terraceAt.name = 'nye lake terrace light';
  object.add(stageAt, terraceAt);
  const stageLamp = addLamp({ kind: 'point', name: 'nye lake stage', color: 0xffa050, distance: 32, anchor: stageAt });
  const terraceLamp = addLamp({ kind: 'point', name: 'nye lake terrace', color: 0xffb060, distance: 44, anchor: terraceAt });

  const shadows = new ShadowGate(true).addAll(object);
  object.updateMatrixWorld(true);

  const blocks = stage.blocks + shore.blocks + meadow + kitMesh.boxes + extraKit.boxes;
  let draws = 0;
  object.traverse((o) => {
    if ((o as Mesh).isMesh || (o as Points).isPoints) draws++;
  });
  console.info(
    `[map] nye lake: ${blocks} blocks (stage ${stage.blocks}, shore ${shore.blocks}, meadow ${meadow} + ${meadowKit} in the kit, kit ${kitMesh.boxes} + ${extraKit.boxes} on the night) · ${bodies.count} glowing boxes · ${glow.count} glows · ${water.candles} candles · ${draws} meshes (the naga +1) · deck ${fr.deck.toFixed(2)} m · built in ${(performance.now() - t0).toFixed(0)} ms (stage ${(tStage - t0).toFixed(0)}, shore ${(tShore - tStage).toFixed(0)})`,
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
      const near = frames++ < 4 || f.camera.position.distanceToSquared(mid) < 600 * 600;
      kitMesh.mesh.visible = near;
      halos.level.value = lit * (1 + 0.3 * event);
      halos.show(lit > 0);
      halos.mesh.visible = near && lit > 0;
      const extra = near && event > 0 && lit > 0;
      extraKit.show(extra);
      extraKit.mesh.visible = extra;
      extraHalos.level.value = lit;
      extraHalos.show(extra);
      extraHalos.mesh.visible = extra;
      if (body) body.mesh.visible = near;
      body?.update(n, event + 0.4 * pulse);
      beams.u.uLevel.value = event * lit;
      beams.u.uTime.value = now % 600;
      beams.mesh.visible = event * lit > 0.001;
      const breathe = 1 + 0.06 * Math.sin(f.t * 2.3) + 0.04 * Math.sin(f.t * 3.7);
      stageLamp.intensity = 200 * lit * breathe * (1 + 0.45 * event + 0.5 * pulse);
      terraceLamp.intensity = 120 * lit * (1 + 0.3 * event);
      board.update(f);
      ring?.update(n, event, now);
      sacred.update(f);
      shadows.update(f);
    },
  };
}
