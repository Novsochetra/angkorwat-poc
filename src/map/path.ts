import { Group } from 'three';
import { hash3 } from '../voxel/random';
import { VoxelBuilder } from '../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../voxel/VoxelMesh';
import { GlowBlocks, glowMaterial, haloPoints, pointScale, type Halo } from './road/glow';
import { buildBeacons, buildLanterns } from './road/lamps';
import { buildRoadNetwork, KIND, LIFT, STEP, type Station } from './road/line';
import { buildRoadStone } from './road/stone';
import type { MapContext, MapFrame, MapPart, PlaceId } from './types';

/**
 * The glowing road between the places: sandstone paving on the land, straight
 * staircases where it climbs a cliff, small footbridges over the rivers (the
 * River Gate builds its own big bridge), stone lanterns every ~25 m, a beacon
 * at every place, and a warm line of light down the middle with slow pulses
 * running along it from the River Gate outwards.
 *
 * Helpers in road/: line.ts (centre line and heights), stone.ts (paving,
 * stairs, walls, bridges), lamps.ts (lanterns, beacons), glow.ts (light).
 */

/** Width of the inlay of light (m). */
const INLAY_W = 1.1;
/** Inlay colours (sRGB, before the level). */
const INLAY = [0xffc474, 0xffbd6a, 0xffcb7c];

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
  net.roads.forEach((road, r) => inlayBlocks(inlay, road.stations, r));
  buildLanterns(b, net, ctx.field, glass, halos);
  const beaconSpans = buildBeacons(b, net, ctx.field, beacon, halos);

  object.add(buildVoxelMesh(b, { quality: ctx.quality === 'low' ? 'low' : 'medium', name: 'path' }));
  const road = glowMaterial('road');
  const lamp = glowMaterial('lamp');
  const bright = glowMaterial('lamp');
  const beaconMesh = beacon.mesh(bright.material, 'path:beacons');
  object.add(inlay.mesh(road.material, 'path:inlay'), glass.mesh(lamp.material, 'path:lanterns'), beaconMesh);
  const halo = haloPoints(halos);
  object.add(halo.points);

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
    blocks: b.boxes.length + inlay.list.length + glass.list.length + beacon.list.length,
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
      // Lanterns: dim amber glass by day, lit at night; beacons: always lit.
      lamp.uniforms.uTime.value = f.t;
      lamp.uniforms.uLevel.value = 0.35 + n * 3.4;
      lamp.uniforms.uPulse.value = 0.02 + n * 0.05;
      bright.uniforms.uTime.value = f.t;
      bright.uniforms.uLevel.value = 1.3 + n * 3.5;
      bright.uniforms.uPulse.value = 0.04;
      halo.uniforms.uTime.value = f.t;
      halo.uniforms.uScale.value = pointScale(ctx.renderer, f.camera);
      halo.uniforms.uLamp.value = n * n * 1.4;
      halo.uniforms.uBeacon.value = 0.4 + n * 0.8;
    },
  };
}

/**
 * The inlay of light down the middle: long strips where the road is flat
 * (up to 4 m, so the pulses stay smooth), one short bar per step on stairs.
 */
function inlayBlocks(inlay: GlowBlocks, st: Station[], road: number): void {
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
    i = e + 1;
  }
}
