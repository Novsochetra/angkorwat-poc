import { Group, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, Vector3 } from 'three';
import { hash3 } from '../voxel/random';
import { MAP_BOUNDS } from './layout';
import { buildBackdrop } from './sky/backdrop';
import { mistBankMaterial, mistLayerMaterial } from './sky/mist';
import { SKY } from './sky/palette';
import type { MapContext, MapFrame, MapPart } from './types';

/**
 * Mist: the sea of cloud the mesas rise from, banks drifting between them,
 * and far silhouettes (hills and temple towers) fading into the haze.
 *
 * - The mist between the mesas is part of the haze (sky/haze.ts): every
 *   material fogs itself with banks of valley mist, so trees and cliffs
 *   stand in it with soft feet and no cut lines. Its banks drift, thicken
 *   towards the side and back edges of the land, and keep off the road and
 *   the places (the land map, sky/mist.ts).
 * - Far backdrop (sky/backdrop.ts): four rings of hills and prasat towers
 *   beyond the map, paler with distance.
 * - Sea of mist beyond the land: five stacked planes (10–29 m) sharing one
 *   slow noise field; each higher one keeps only the thicker parts, so they
 *   build soft lit mounds. Clear over the land.
 * - Banks: soft upright puffs along the map's side and back edges (so no cut
 *   land shows) and far out between the backdrop rings. One instanced draw,
 *   sorted back to front.
 * Everything drifts very slowly with `f.drift` (still under "reduce motion").
 */

/** Mist planes (m). */
const LAYER_Y = [10, 14, 18, 23, 29];

interface Bank {
  x: number;
  y: number;
  z: number;
  /** Width, height (m); height < 0: a flat wisp this wide. */
  w: number;
  h: number;
  seed: number;
  heading: number;
  drift: number;
  alpha: number;
}

export function buildClouds(ctx: MapContext): MapPart {
  const field = ctx.field;
  const object = new Group();
  object.name = 'clouds';

  const backdrop = buildBackdrop();
  object.add(backdrop.object);

  // ── Sea of mist ─────────────────────────────────────────────────────────
  const plane = new PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2);
  LAYER_Y.forEach((y, i) => {
    const mesh = new Mesh(plane, mistLayerMaterial(y, i / (LAYER_Y.length - 1)));
    mesh.name = `mist ${y} m`;
    mesh.position.set(0, y, -300);
    mesh.renderOrder = 2 + i;
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    object.add(mesh);
  });

  // ── Banks ───────────────────────────────────────────────────────────────
  const banks: Bank[] = [];
  const rnd = (a: number, b: number, s: number) => hash3(Math.round(a * 7), Math.round(b * 7), s, 9173);
  /** Highest ground within r of (x, z) (sampled on a ring and the centre). */
  const maxAround = (x: number, z: number, r: number) => {
    let h = field.heightAt(x, z);
    for (let a = 0; a < 12; a++) {
      const t = (a / 12) * Math.PI * 2;
      h = Math.max(h, field.heightAt(x + Math.cos(t) * r, z + Math.sin(t) * r), field.heightAt(x + Math.cos(t) * r * 0.5, z + Math.sin(t) * r * 0.5));
    }
    return h;
  };
  const inside = (x: number, z: number) => x > MAP_BOUNDS.x0 && x < MAP_BOUNDS.x1 && z > MAP_BOUNDS.z0 && z < MAP_BOUNDS.z1;

  // Along the side and back edges: tall where the land is high at the edge.
  const edgeRuns: [number, number, number, number][] = [
    [MAP_BOUNDS.x0, MAP_BOUNDS.z0, MAP_BOUNDS.x1, MAP_BOUNDS.z0],
    [MAP_BOUNDS.x0, MAP_BOUNDS.z0, MAP_BOUNDS.x0, -240],
    [MAP_BOUNDS.x1, MAP_BOUNDS.z0, MAP_BOUNDS.x1, -240],
  ];
  for (const [xa, za, xb, zb] of edgeRuns) {
    const len = Math.hypot(xb - xa, zb - za);
    for (let s = 0; s <= len; s += 58) {
      const t = s / len;
      const x = xa + (xb - xa) * t + (rnd(s, xa, 1) - 0.5) * 30;
      const z = za + (zb - za) * t + (rnd(s, za, 2) - 0.5) * 30;
      const ground = maxAround(Math.min(MAP_BOUNDS.x1 - 2, Math.max(MAP_BOUNDS.x0 + 2, x)), Math.max(MAP_BOUNDS.z0 + 2, z), 50);
      const h = Math.max(40, ground + 20 + rnd(s, 3, 3) * 18);
      banks.push({ x, y: -8, z, w: Math.max(h * 1.6, 120 + rnd(s, 4, 4) * 90), h: h + 8, seed: rnd(s, 5, 5), heading: 0, drift: 0.4 + rnd(s, 6, 6), alpha: 0.95 });
    }
  }

  // Far out, between the backdrop rings (cloud layers towards the horizon).
  for (const [r, wide, tall] of [
    [760, 260, 45],
    [1150, 380, 60],
    [1650, 520, 80],
    [2300, 700, 100],
  ] as const) {
    const step = (wide * 0.55) / r;
    for (let a = -2.1; a <= 2.1; a += step) {
      const aa = a + (rnd(a, r, 41) - 0.5) * step * 0.6;
      const x = Math.sin(aa) * r;
      const z = -200 - Math.cos(aa) * r;
      if (inside(x, z)) continue;
      banks.push({ x, y: 0, z, w: wide * (0.7 + rnd(a, r, 42) * 0.6), h: tall * (0.8 + rnd(a, r, 43) * 0.8), seed: rnd(a, r, 44), heading: 0, drift: 0.8, alpha: 0.85 });
    }
  }

  const quad = new PlaneGeometry(1, 1);
  const geo = new InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  const aCentre = new InstancedBufferAttribute(new Float32Array(banks.length * 3), 3);
  const aSize = new InstancedBufferAttribute(new Float32Array(banks.length * 2), 2);
  const aSeed = new InstancedBufferAttribute(new Float32Array(banks.length * 4), 4);
  geo.setAttribute('aCentre', aCentre);
  geo.setAttribute('aSize', aSize);
  geo.setAttribute('aSeed', aSeed);
  geo.instanceCount = banks.length;
  const bankMesh = new Mesh(geo, mistBankMaterial());
  bankMesh.name = 'mist banks';
  bankMesh.frustumCulled = false;
  bankMesh.renderOrder = 10;
  bankMesh.raycast = () => {};
  object.add(bankMesh);

  // Back to front for the camera (they blend over each other).
  const order = banks.map((_, i) => i);
  const dist = new Float32Array(banks.length);
  const lastCam = new Vector3(Infinity, 0, 0);
  function sortBanks(cam: Vector3): void {
    if (lastCam.distanceToSquared(cam) < 0.25) return;
    lastCam.copy(cam);
    for (let i = 0; i < banks.length; i++) {
      const b = banks[i];
      dist[i] = (b.x - cam.x) ** 2 + (b.y + Math.abs(b.h) * 0.4 - cam.y) ** 2 + (b.z - cam.z) ** 2;
    }
    order.sort((a, b) => dist[b] - dist[a]);
    order.forEach((bi, i) => {
      const b = banks[bi];
      aCentre.setXYZ(i, b.x, b.y, b.z);
      aSize.setXY(i, b.w, b.h);
      aSeed.setXYZW(i, b.seed, b.heading, b.drift, b.alpha);
    });
    aCentre.needsUpdate = aSize.needsUpdate = aSeed.needsUpdate = true;
  }

  return {
    name: 'clouds',
    object,
    update(f: MapFrame) {
      backdrop.update(SKY, f.drift);
      sortBanks(f.camera.position);
    },
  };
}
