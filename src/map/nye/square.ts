import { Group, Sphere, Vector3, type Mesh } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { ShadowGate, splitByPlace } from '../cull';
import { Glow } from '../festival/_glow';
import { Kit, kitUniforms, PERIOD } from '../festival/_kit';
import { Lamps } from '../landmarks/_prasatKit';
import { addLamp } from '../sky/lampSlots';
import type { MapContext, MapFrame } from '../types';
import { nightHeld } from './clock';
import type { NyePiece } from './index';
import { GATE, RING, SQUARE } from './plan';
import { dressSquare } from './_sqDecor';
import { layFloor, TOP } from './_sqFloor';
import { buildGate } from './_sqGate';
import { khmerLamp } from './_sqKit';
import { buildNyeRing } from './_sqRing';
import { buildStalls } from './_sqStalls';
import { layLanternWalk } from './_sqWalk';

/**
 * The festival square at Phnom Kulen's foot (AWP-35, docs/discussion/new-year-online.md; where: plan.ts), all
 * but the stage and its board (`stage.ts`):
 *
 * - the paved floor (`_sqFloor.ts`): sandstone pavers flush with the land, a laterite border fading into the
 *   grass, the processional way gate → ring → stage. Not in the walk map (`noWalk`): he walks on the land under it;
 * - the gathering ring of light on it (`_sqRing.ts`): a gold Khmer lotus mandala, one additive quad, breathing,
 *   brighter on the event night (clock.ts `nightHeld`);
 * - the entrance gate on the village side with a Bayon face on each side of its tower (`_sqGate.ts`);
 * - the lantern walk from the village up the Kulen foot trail to the gate (`_sqWalk.ts`), Khmer lamps on posts;
 * - red banners with the white Angkor Wat on tall poles, the map's own trees with string lights, lotus pots
 *   (`_sqDecor.ts`); the four New Year snack stalls, each a shop (`_sqStalls.ts`).
 *
 * Draws: the floor (1), the square's blocks (a mesh per family: stone, bark, leaf, petal), the lantern walk's
 * (stone, in two places, culled apart), the kit (banners and the strings' wires: 1, waving in its shader), the
 * flames and the bulbs (2), the halos (1), the ring (1). Two real lights (sky/lampSlots.ts), at night only: the
 * ring's and the gate's; the rest is glow and bloom. What moves: the banners (the kit's shader), the ring's
 * breath and the glows (uniforms): no matrix changes after the build.
 */
export function buildNyeSquare(ctx: MapContext): NyePiece {
  const t0 = performance.now();
  const { field } = ctx;
  const low = ctx.quality === 'low';
  const quality = low ? 'low' : 'medium';
  const src = traceSource();
  const object = new Group();
  object.name = 'nye:square';

  const lamps = new Lamps(0.6, 4.6);
  const bulbs = new Lamps(0.35, 3.4);
  bulbs.base.set(0xffc27a);
  const u = kitUniforms();
  const kit = new Kit();
  const glow = new Glow();

  // The floor (its own mesh: kept out of the walk map, casting no shadow).
  const fb = new VoxelBuilder();
  layFloor(fb, field, low);
  // The gate, its lamps either side of the passage, both faces.
  const b = new VoxelBuilder();
  const gate = buildGate(b, field);
  field.occupy(...gate.box);
  for (const dz of [3.9, -3.9])
    for (const dx of [-3.6, 3.6]) {
      const x = GATE.x + dx;
      const z = GATE.z + dz;
      khmerLamp(b, x, field.heightAt(x, z), z, 1.5, 7 + dx + dz, src, lamps, glow, 2.2);
    }
  const decor = dressSquare(b, kit, field, bulbs, glow, low);
  buildStalls(b, field, lamps, glow, low);
  const wb = new VoxelBuilder();
  const walk = layLanternWalk(wb, field, lamps, glow, low ? 14 : 11);

  const floor = buildVoxelMesh(fb, { quality, name: 'nye:floor', castShadow: false });
  floor.traverse((o) => void (o.userData.noWalk = true));
  object.add(floor);
  const square = buildVoxelMesh(b, { quality, name: 'nye:square' });
  object.add(square);
  // (the walk's lamps in two places, the village end and the hill end: three leaves out the one off screen)
  const mid = walk.length ? walk[Math.floor(walk.length / 2)] : [0, 0];
  const split = splitByPlace(wb, [{ x: walk[0]?.[0] ?? 0, z: walk[0]?.[1] ?? 0 }, { x: mid[0], z: mid[1] }], 30);
  for (const [i, part] of [...split.parts, split.rest].entries()) if (part.boxes.length) object.add(buildVoxelMesh(part, { quality, name: `nye:walk${i}` }));
  const shadows = new ShadowGate(true).addAll(object);

  // The kit (banners, wires): waving in its shader; casts no shadow (still shadows on low and medium: it moves).
  const kitMesh = kit.build('nye:square', u);
  kitMesh.show(true);
  kitMesh.mesh.castShadow = false;
  bound(kitMesh.mesh, new Sphere(new Vector3(SQUARE.x, field.heightAt(SQUARE.x, SQUARE.z) + 4, SQUARE.z + 4), Math.max(SQUARE.rx, SQUARE.rz) * 1.45));
  object.add(kitMesh.mesh);
  // The halos round every flame and some bulbs (one additive draw, night only).
  const halos = glow.build('nye:square', u);
  {
    const s = new Sphere();
    const pts = [[SQUARE.x, SQUARE.z], ...walk].map(([x, z]) => new Vector3(x, field.heightAt(x, z) + 3, z));
    s.setFromPoints(pts);
    s.radius += SQUARE.rx * 1.5;
    bound(halos.mesh, s);
  }
  object.add(halos.mesh);
  const flames = lamps.build('nye:flames');
  const lights = bulbs.build('nye:bulbs');
  if (flames) object.add(flames);
  if (lights) object.add(lights);
  const g0 = field.heightAt(RING.x, RING.z);
  const ring = buildNyeRing(RING.x, g0 + TOP + 0.015, RING.z, RING.r, low);
  object.add(ring.mesh);

  // Two real lights, at night: warm gold over the ring, and in the gate's passage.
  const ringAt = new Group();
  ringAt.position.set(RING.x, g0 + 7, RING.z);
  ringAt.name = 'nye ring light';
  const gateAt = new Group();
  gateAt.position.set(GATE.x, field.heightAt(GATE.x, GATE.z) + 3.4, GATE.z);
  gateAt.name = 'nye gate light';
  object.add(ringAt, gateAt);
  const ringLamp = addLamp({ kind: 'point', name: 'nye ring', color: 0xffb050, distance: 26, anchor: ringAt });
  const gateLamp = addLamp({ kind: 'point', name: 'nye gate', color: 0xffa860, distance: 13, anchor: gateAt });

  const blocks = fb.boxes.length + b.boxes.length + wb.boxes.length + kitMesh.boxes;
  console.info(
    `[map] nye square: ${blocks} blocks (floor ${fb.boxes.length}, square ${b.boxes.length}, walk ${wb.boxes.length} · ${walk.length} lamps, kit ${kitMesh.boxes}, trees ${decor.trees.length}) · ${lamps.count + bulbs.count} flames · built in ${(performance.now() - t0).toFixed(1)} ms`,
  );

  let now = 0;
  let started = false;
  return {
    object,
    blocks,
    update(f: MapFrame) {
      if (!started) {
        started = true;
        now = f.t;
      } else now += f.dt;
      const n = f.night;
      // The event night: the ring and the lamps brighter (from 22:30 ICT until the night ends: clock.ts).
      const event = nightHeld() ? 1 : 0;
      u.uTime.value = ((now % PERIOD) + PERIOD) % PERIOD;
      u.uNight.value = n;
      u.uGlow.value = 0.3 + 3.2 * n * n;
      const lit = Math.max(0, Math.min(1, (n - 0.3) / 0.4));
      halos.level.value = lit * (1 + 0.3 * event);
      halos.show(lit > 0);
      lamps.update(n, now);
      bulbs.update(n, now + 1.7);
      ring.update(n, event, now);
      ringLamp.intensity = 110 * lit * (1 + 0.4 * event);
      gateLamp.intensity = 45 * lit;
      shadows.update(f);
    },
  };
}

/** A mesh posed in its shader: culled by three on the sphere that holds all it draws (world m; the mesh stays at the origin). */
function bound(mesh: Mesh, s: Sphere): void {
  mesh.geometry.boundingSphere = s;
  mesh.frustumCulled = true;
}
