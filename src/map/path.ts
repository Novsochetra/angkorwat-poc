import { Group } from 'three';
import { traceSource } from '../feedback/sourceTrace';
import { hash3 } from '../voxel/random';
import { VoxelBuilder, type VoxelBox } from '../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../voxel/VoxelMesh';
import { GlowBlocks, glowMaterial, haloPoints, LightPools, pointScale, type Halo } from './road/glow';
import { buildBeacons, buildLamps } from './road/lamps';
import { buildRoadNetwork, KIND, LIFT, STEP, type Station } from './road/line';
import { cutIntoPieces, ROAD_PIECES } from './road/pieces';
import { buildRoadStone } from './road/stone';
import type { MapContext, MapFrame, MapPart, PlaceId } from './types';

/**
 * The glowing road between the places: sandstone paving on the land, straight
 * staircases where it climbs a cliff, small footbridges over the rivers (the
 * River Gate builds its own big bridge), small stone lamps every ~12 m, a
 * beacon at every place, and a warm line of light down the middle with slow
 * pulses running along it from the River Gate outwards.
 *
 * The line is the journey seen from afar. Walking the road, it gives way
 * near the camera to the carved stone strip it is set in (it shows again
 * further on), and at night the lamps light the way with pools of light.
 *
 * Helpers in road/: line.ts (centre line and heights), stone.ts (paving,
 * stairs, walls, bridges), lamps.ts (lanterns, beacons), glow.ts (light),
 * pieces.ts (the blocks and the inlay cut into pieces, each its own mesh, so
 * the pieces out of view are left out).
 */

/** Width of the inlay of light (m). */
const INLAY_W = 1.1;
/** Inlay colours (sRGB, before the level). */
const INLAY = [0xffc474, 0xffbd6a, 0xffcb7c];
/** The carved stone strip under the light (pale warm sandstone), seen where the light fades near the camera. */
const INLAY_STONE = [0xe3cba4, 0xdcc39b, 0xe8d2ad, 0xd6bc93];
/** Roaming: the road light is gone within `[0]` m of the camera and full from `[1]` m. */
const ROAM_FADE = [22, 110];

export function buildPath(ctx: MapContext): MapPart {
  const object = new Group();
  object.name = 'path';
  const net = buildRoadNetwork(ctx.field);

  const b = new VoxelBuilder();
  buildRoadStone(b, net.roads, ctx.field);
  const inlay = new GlowBlocks();
  const glass = new GlowBlocks();
  const beacon = new GlowBlocks();
  const halos: Halo[] = [];
  const lightPools = new LightPools();
  // (the carved stone under the light: a builder of its own, below)
  const carved = new VoxelBuilder();
  net.roads.forEach((road, r) => inlayBlocks(carved, inlay, road.stations, r));
  buildLamps(b, net, ctx.field, glass, halos, lightPools);
  const beaconSpans = buildBeacons(b, net, ctx.field, beacon, halos);

  // In pieces, each its own meshes (road/pieces.ts): those out of view are left out.
  const quality = ctx.quality === 'low' ? 'low' : 'medium';
  // The carved stone under the light keeps its cut edges however far it is (graphics.ts `plainFar` leaves a group
  // marked `chunkLod` as it is): its top lies a centimetre under the light's, and as plain boxes far off its full top
  // would win more of the light's pixels from it (where depth runs out of precision), the far golden line thinner and
  // broken on the stairs. (Built for low, every block is a plain box, near or far: it goes with the rest.)
  const keep = quality !== 'low';
  const stone = keep ? b.boxes : [...b.boxes, ...carved.boxes];
  for (const piece of blockPieces(stone, (mat) => (mat === 'mapGrass' ? ROAD_PIECES.grass : ROAD_PIECES.stone))) object.add(buildVoxelMesh(piece, { quality, name: 'path' }));
  if (keep)
    for (const piece of blockPieces(carved.boxes, () => ROAD_PIECES.glow)) {
      const group = buildVoxelMesh(piece, { quality, name: 'path' });
      group.userData.chunkLod = true;
      object.add(group);
    }
  const road = glowMaterial('road');
  const lamp = glowMaterial('lamp');
  const bright = glowMaterial('lamp');
  const beaconMesh = beacon.mesh(bright.material, 'path:beacons');
  for (const list of cutIntoPieces(inlay.list, ROAD_PIECES.glow, (g) => g.x, (g) => g.z)) {
    const piece = new GlowBlocks();
    for (const g of list) piece.list.push(g);
    const inlayMesh = piece.mesh(road.material, 'path:inlay');
    // (drawn over its stone, after the other opaque things)
    inlayMesh.renderOrder = 1;
    object.add(inlayMesh);
  }
  object.add(glass.mesh(lamp.material, 'path:lamps'), beaconMesh);
  const pools = lightPools.mesh('path:pools');
  object.add(pools.mesh);
  const halo = haloPoints(halos);
  object.add(halo.points);
  // At night lamps and beacons soften when you walk up to them (the halos
  // too, in glow.ts): lit to be seen from afar, they would blind up close.
  lamp.uniforms.uNear.value.set(4, 30);
  bright.uniforms.uNear.value.set(10, 70);
  let roaming = 0;

  // The beacon of the hovered or picked place brightens (eased), so the card
  // and its spot on the map read together.
  const beaconColors = beaconMesh.instanceColor;
  const baseColors = Float32Array.from(beaconColors?.array ?? []);
  const boost = beaconSpans.map(() => 0);
  let lit: PlaceId | null = null;
  const haloSize = halo.points.geometry.getAttribute('aSize');
  const baseSize = Float32Array.from(haloSize.array);
  const brighten = (dt: number) => {
    if (!beaconColors) return;
    let changed = false;
    beaconSpans.forEach((sp, i) => {
      const goal = sp.id === lit ? 1 : 0;
      const next = dt > 0 ? boost[i] + (goal - boost[i]) * (1 - Math.exp(-dt * 5)) : goal;
      if (Math.abs(next - boost[i]) < 1e-4) return;
      boost[i] = next;
      changed = true;
      const k = 1 + next * 1.6;
      for (let j = sp.from * 3; j < sp.to * 3; j++) beaconColors.array[j] = baseColors[j] * k;
      for (let j = sp.halos[0]; j < sp.halos[1]; j++) haloSize.array[j] = baseSize[j] * (1 + next * 0.9);
    });
    if (changed) beaconColors.needsUpdate = haloSize.needsUpdate = true;
  };

  return {
    name: 'path',
    object,
    blocks: b.boxes.length + carved.boxes.length + inlay.list.length + glass.list.length + beacon.list.length,
    highlight(id) {
      lit = id;
    },
    update(f: MapFrame) {
      brighten(f.dt);
      const n = f.night;
      // The inlay: a soft golden line by day (only its pulses bloom much), a
      // bright one at night, where the dark land round it makes it glow. By day
      // it is tinted deeper gold, or the tone mapping turns it white.
      road.uniforms.uTime.value = f.t;
      road.uniforms.uLevel.value = 2.5 + n * 0.35;
      road.material.color.setRGB(1, 0.8 + n * 0.2, 0.55 + n * 0.45);
      road.uniforms.uPulse.value = 0.4 + n * 0.3;
      // Roaming, it fades out near the camera (eased in and out, so the
      // overview and the places' close-ups keep the whole line); at night a
      // faint ember stays in the stone.
      const goal = f.roam === 'overview' ? 0 : 1;
      roaming = f.dt > 0 ? roaming + (goal - roaming) * (1 - Math.exp(-f.dt * 1.5)) : goal;
      road.uniforms.uNear.value.set(ROAM_FADE[0] * roaming, ROAM_FADE[1] * roaming);
      road.uniforms.uNearLevel.value = n * n * 0.1;
      // Lamps: stone with dim amber glass by day, lit at night, with pools of
      // light on the paving round them; beacons: always lit.
      lamp.uniforms.uTime.value = f.t;
      lamp.uniforms.uLevel.value = 0.35 + n * 3.4;
      lamp.uniforms.uPulse.value = 0.02 + n * 0.05;
      lamp.uniforms.uNearLevel.value = 1 - n * 0.55;
      pools.uniforms.uTime.value = f.t;
      pools.uniforms.uLevel.value = n * n * 0.6;
      pools.uniforms.uPulse.value = 0.02 + n * 0.05;
      pools.mesh.visible = n > 0.05;
      bright.uniforms.uTime.value = f.t;
      bright.uniforms.uLevel.value = 1.3 + n * 3.5;
      bright.uniforms.uPulse.value = 0.04;
      bright.uniforms.uNearLevel.value = 1 - n * 0.72;
      halo.uniforms.uTime.value = f.t;
      halo.uniforms.uScale.value = pointScale(ctx.renderer, f.camera);
      halo.uniforms.uLamp.value = n * n * 1.4;
      halo.uniforms.uBeacon.value = 0.4 + n * 0.8;
    },
  };
}

/**
 * Blocks in pieces (road/pieces.ts), each family cut on its own into `k(family)`:
 * the stone (paving, steps, walls, bridges, lamps, beacons) in
 * `ROAD_PIECES.stone`, the grass on the paving's edges in fewer (a few
 * hundred blocks: a piece more is a draw more).
 */
function blockPieces(boxes: readonly VoxelBox[], k: (family: string) => number): VoxelBuilder[] {
  const families = new Map<string, VoxelBox[]>();
  for (const box of boxes) {
    let list = families.get(box.mat);
    if (!list) families.set(box.mat, (list = []));
    list.push(box);
  }
  const out: VoxelBuilder[] = [];
  for (const [mat, list] of families)
    for (const cut of cutIntoPieces(list, k(mat), (p) => p.x, (p) => p.z)) {
      const piece = new VoxelBuilder();
      for (const box of cut) piece.boxes.push(box);
      out.push(piece);
    }
  return out;
}

/**
 * The inlay of light down the middle: long strips where the road is flat
 * (up to 4 m, so the pulses stay smooth), one short bar per step on stairs.
 * Under each strip lies its carved stone (in up to 2 m stones), a little
 * inside the light, so it shows only where the light fades.
 */
function inlayBlocks(b: VoxelBuilder, inlay: GlowBlocks, st: Station[], road: number): void {
  const src = traceSource();
  for (let i = 0; i < st.length; ) {
    const a = st[i];
    if (a.kind === KIND.gate) {
      i++;
      continue;
    }
    let e = i;
    if (!a.stair) while (e + 1 < st.length && e - i < 7 && !st[e + 1].stair && st[e + 1].h === a.h && st[e + 1].kind !== KIND.gate) e++;
    const c = st[e];
    const along = a.stair ? STEP * 0.6 : (e - i + 1) * STEP;
    const x = (a.x + c.x) / 2;
    const z = (a.z + c.z) / 2;
    const ry = Math.atan2(a.tx + c.tx, a.tz + c.tz);
    const color = INLAY[Math.floor(hash3(road, i, 0, 61) * INLAY.length)];
    inlay.add(x, a.h + LIFT - 0.02, z, INLAY_W, 0.12, along, ry, color, (a.s + c.s) / 2);
    const pieces = Math.ceil(along / 2 - 1e-6);
    for (let p = 0; p < pieces; p++) {
      const k = ((p + 0.5) / pieces - 0.5) * along;
      const tone = hash3(road, i, p, 62);
      b.box(x + Math.sin(ry) * k, a.h + LIFT - 0.07, z + Math.cos(ry) * k, INLAY_W - 0.04, 0.2, along / pieces, INLAY_STONE[Math.floor(tone * INLAY_STONE.length)], 'mapStone', { ry, shade: 0.95 + tone * 0.06, src });
    }
    i = e + 1;
  }
}
