import { Color, Group, Vector3, type BufferAttribute, type InstancedMesh, type PerspectiveCamera, type ShaderMaterial, type WebGLRenderer } from 'three';
import { hash3 } from '../../voxel/random';
import { GlowBlocks, glowMaterial, haloPoints, LightPools, pointScale } from '../road/glow';
import type { MapFrame } from '../types';
import type { Lamp } from './_mkStalls';

/**
 * The market's lights, all glow (no light is added): the sellers' LED tubes
 * and the hall's bare bulbs in the dark before sunrise, the noodle stall's
 * bare bulb and its string of small coloured bulbs from dusk to dawn, the
 * grill's embers. Unlit boxes whose colour goes above 1.0 (linear) at night
 * so the bloom catches them, a soft halo round each, and a warm pool of
 * light faked on the ground under the noodle stall's bulbs. A lamp that is off is
 * a dark bulb (its colour swapped, its halo shrunk to nothing): changed only
 * when one switches. Three draws, the pool only at night.
 */
export interface MarketLights {
  object: Group;
  /** Once a frame (near): which lamps are lit now (`lit(kind)`), the glow level from the night. */
  update(f: MapFrame, camera: PerspectiveCamera, lit: (on: Lamp['on']) => boolean): void;
}

const OFF = new Color(0x2a2622);

export function buildLights(lamps: Lamp[], renderer: WebGLRenderer, pools: Vector3[]): MarketLights {
  const object = new Group();
  object.name = 'market:lights';
  const blocks = new GlowBlocks();
  lamps.forEach((l) => blocks.add(l.x, l.y, l.z, l.sx, l.sy, l.sz, 0, l.color, hash3(Math.round(l.x * 10), Math.round(l.z * 10), 3, 91) * 6.28));
  const { material, uniforms } = glowMaterial('lamp');
  material.name = 'market:glow';
  const mesh: InstancedMesh = blocks.mesh(material, 'market:glow');
  object.add(mesh);
  const halo = haloPoints(lamps.map((l) => ({ x: l.x, y: l.y, z: l.z, size: l.halo, kind: 0 as const, phase: l.x * 0.37 })));
  halo.points.name = 'market:halos';
  halo.uniforms.uColor.value.setRGB(1, 0.7, 0.4);
  object.add(halo.points);
  const sizes = halo.points.geometry.getAttribute('aSize') as BufferAttribute;
  // Pools of light on the ground under the noodle stall's bulbs (one mesh).
  const pool = new LightPools();
  let poolUniforms: ReturnType<LightPools['mesh']>['uniforms'] | null = null;
  let poolMesh: ReturnType<LightPools['mesh']>['mesh'] | null = null;
  pools.forEach((p, k) => {
    const r = 5.4;
    const y = p.y + 0.04;
    pool.quad(new Vector3(p.x - r, y, p.z - r), new Vector3(p.x + r, y, p.z - r), new Vector3(p.x + r, y, p.z + r), new Vector3(p.x - r, y, p.z + r), p.x, p.y + 2.7, p.z, 1.3 + k * 2.1);
  });
  if (pool.quads) {
    const pm = pool.mesh('market:pool');
    pm.uniforms.uFar.value.set(50, 120);
    (pm.mesh.material as ShaderMaterial).uniforms.uColor.value.setRGB(1, 0.62, 0.3);
    poolUniforms = pm.uniforms;
    poolMesh = pm.mesh;
    poolMesh.visible = false;
    object.add(poolMesh);
  }
  const on = lamps.map(() => true);
  const c = new Color();
  return {
    object,
    update(f, camera, lit) {
      let colors = false;
      lamps.forEach((l, i) => {
        const want = lit(l.on);
        if (want === on[i]) return;
        on[i] = want;
        mesh.setColorAt(i, want ? c.setHex(l.color) : OFF);
        colors = true;
        (sizes.array as Float32Array)[i] = want ? l.halo : 0;
        sizes.needsUpdate = true;
      });
      if (colors && mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      const n = f.night;
      const k = n * n * (3 - 2 * n);
      uniforms.uTime.value = f.t;
      uniforms.uLevel.value = 0.12 + k * 3.2;
      uniforms.uPulse.value = 0.03 + k * 0.04;
      uniforms.uNearLevel.value = 1 - k * 0.45;
      halo.uniforms.uTime.value = f.t;
      halo.uniforms.uScale.value = pointScale(renderer, camera);
      halo.uniforms.uLamp.value = k * k * 1.15;
      if (poolMesh && poolUniforms) {
        const level = lit('noodle') ? k * k * 0.55 : 0;
        poolMesh.visible = level > 0.01;
        poolUniforms.uLevel.value = level;
        poolUniforms.uTime.value = f.t;
        poolUniforms.uPulse.value = 0.04;
      }
    },
  };
}
