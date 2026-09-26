import { BufferGeometry, Color, Float32BufferAttribute, Group, Points, ShaderMaterial, UniformsLib, UniformsUtils, Vector3, type InstancedMesh, type Object3D, type WebGLRenderer } from 'three';
import { hash3 } from '../../voxel/random';
import { haloPoints, pointScale, type Halo } from '../road/glow';
import type { MapFrame } from '../types';
import type { Site } from './_campKit';

/**
 * The camps' lights and smoke, with no light added to the scene: glowing
 * blocks (the `glow` family, unlit; their colour goes above 1.0 at night so
 * they bloom) for the monk's lamp and the woodcutters' embers, soft halos
 * round them at night (one cloud of points, as the road's lanterns), and a
 * thin wisp of smoke over the fire (a few soft points rising and fading,
 * moved in the vertex shader: nothing to do on the CPU).
 */

export type GlowKind = 'lamp' | 'ember' | 'flame';

/** What the site builders call to light things. */
export interface CampLights {
  /** A glowing block at a site's local point, sized along its axes. */
  glow(site: Site, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, kind: GlowKind): void;
  /** A soft halo round a light at night (m across). */
  halo(site: Site, lx: number, ly: number, lz: number, size: number, kind: GlowKind): void;
  /** A thin wisp of smoke rising from here. */
  smoke(site: Site, lx: number, ly: number, lz: number): void;
}

/** Linear colours of the lights, scaled by `level` below. */
const COLOR: Record<GlowKind, Color> = { lamp: new Color(1, 0.6, 0.26), ember: new Color(1, 0.3, 0.07), flame: new Color(1, 0.58, 0.18) };
/** By day (soft) and at night (blooms). */
const LEVEL: Record<GlowKind, [number, number]> = { lamp: [0.4, 4.2], ember: [0.55, 3.4], flame: [0.9, 5.2] };
/** Smoke puffs per fire, how long one rises (s) and how high (m). */
const PUFFS = 14;
const RISE_T = 11;
const RISE_H = 7.5;

export class CampFx implements CampLights {
  readonly object = new Group();
  private readonly glows: { index: number; kind: GlowKind; phase: number }[] = [];
  private glowCount = 0;
  private readonly halos: Halo[] = [];
  private readonly smokes: Vector3[] = [];
  private mesh: InstancedMesh | null = null;
  private haloU: ReturnType<typeof haloPoints>['uniforms'] | null = null;
  private smokeMat: ShaderMaterial | null = null;
  private readonly c = new Color();

  constructor() {
    this.object.name = 'camps:fx';
  }

  glow(site: Site, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, kind: GlowKind): void {
    site.box(lx, ly, lz, sx, sy, sz, 0xffffff, 'glow');
    this.glows.push({ index: this.glowCount++, kind, phase: hash3(lx * 10, ly * 10, lz * 10, 7) * 20 });
  }

  halo(site: Site, lx: number, ly: number, lz: number, size: number, kind: GlowKind): void {
    const p = site.world(lx, ly, lz);
    // (kind 0 follows the lamp's level, 1 the embers')
    this.halos.push({ x: p.x, y: p.y, z: p.z, size, kind: kind === 'lamp' ? 0 : 1, phase: this.halos.length * 1.7 });
  }

  smoke(site: Site, lx: number, ly: number, lz: number): void {
    this.smokes.push(site.world(lx, ly, lz));
  }

  /** After the camps' voxel mesh is built: find the glow blocks in it, make the halos and the smoke. */
  finish(voxels: Object3D): void {
    // (the builder's glow boxes, in order, are this mesh's instances; nothing else in the camps glows)
    this.mesh = (voxels.children.find((c) => c.name.endsWith(':glow')) as InstancedMesh | undefined) ?? null;
    if (this.mesh) this.mesh.castShadow = false;
    if (this.halos.length) {
      const h = haloPoints(this.halos);
      h.points.name = 'camps:halos';
      this.haloU = h.uniforms;
      this.object.add(h.points);
    }
    if (this.smokes.length) this.object.add(this.makeSmoke());
  }

  update(f: MapFrame, renderer: WebGLRenderer): void {
    const n = f.night;
    if (this.mesh) {
      for (const g of this.glows) {
        const [day, night] = LEVEL[g.kind];
        const tt = f.t + g.phase;
        // Embers breathe slowly; the fire's small flames dance; the lamp's flame barely moves.
        const flicker =
          g.kind === 'ember'
            ? 0.8 + 0.2 * Math.sin(tt * 0.9) * Math.sin(tt * 0.37 + 1) + 0.08 * Math.sin(tt * 7.3)
            : g.kind === 'flame'
              ? 0.75 + 0.2 * Math.sin(tt * 9.1) * Math.sin(tt * 3.7 + 2) + 0.12 * Math.sin(tt * 15.3)
              : 1 + n * (0.05 * Math.sin(tt * 11.3) + 0.04 * Math.sin(tt * 17.9));
        this.mesh.setColorAt(g.index, this.c.copy(COLOR[g.kind]).multiplyScalar((day + (night - day) * n) * flicker));
      }
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
    if (this.haloU) {
      this.haloU.uTime.value = f.t;
      this.haloU.uScale.value = pointScale(renderer, f.camera);
      this.haloU.uLamp.value = n * n * 1.4;
      this.haloU.uBeacon.value = n * n * 0.8 + 0.04;
    }
    if (this.smokeMat) {
      const u = this.smokeMat.uniforms;
      u.uTime.value = f.drift;
      u.uScale.value = pointScale(renderer, f.camera);
      // The breeze bends the wisp over (toward where the wind blows); rain beats it down.
      const w = f.weather;
      (u.uWind.value as Vector3).set(Math.sin(w.windDir), 0, Math.cos(w.windDir)).multiplyScalar(0.25 + 1.6 * w.wind);
      // Pale grey-blue smoke by day, a faint dark grey at night (linear colours).
      (u.uColor.value as Color).setRGB(0.45 - 0.4 * n, 0.46 - 0.41 * n, 0.5 - 0.45 * n);
      u.uOpacity.value = (0.3 - 0.1 * n) * (1 - 0.7 * w.rain);
    }
  }

  private makeSmoke(): Points {
    const pos: number[] = [];
    const seed: number[] = [];
    for (const [s, p] of this.smokes.entries())
      for (let i = 0; i < PUFFS; i++) {
        pos.push(p.x, p.y, p.z);
        seed.push(i / PUFFS + 0.03 * hash3(i, s, 1, 3));
      }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
    const material = new ShaderMaterial({
      name: 'camps:smoke',
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        { uTime: { value: 0 }, uScale: { value: 800 }, uWind: { value: new Vector3() }, uColor: { value: new Color(0.6, 0.6, 0.62) }, uOpacity: { value: 0.3 } },
      ]),
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        uniform float uScale;
        uniform vec3 uWind;
        varying float vA;
        #include <common>
        #include <fog_pars_vertex>
        void main() {
          // Each puff rises for ${RISE_T} s, then starts again at the fire.
          float age = fract(uTime / ${RISE_T.toFixed(1)} + aSeed);
          float h = age * ${RISE_H.toFixed(1)};
          vec3 p = position;
          p.y += h;
          // A lazy curl, wider as it rises, and the breeze bending it over.
          float s = aSeed * 43.0;
          p.x += sin(s + uTime * 0.31 + age * 4.0) * 0.35 * age + uWind.x * h * h * 0.05;
          p.z += cos(s * 1.3 + uTime * 0.27 + age * 3.5) * 0.35 * age + uWind.z * h * h * 0.05;
          vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = (0.35 + 2.1 * age) * uScale / max(1.0, -mvPosition.z);
          vA = smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.35, 1.0, age));
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vA;
        #include <common>
        #include <fog_pars_fragment>
        void main() {
          vec2 q = gl_PointCoord * 2.0 - 1.0;
          float r2 = dot(q, q);
          if (r2 >= 1.0) discard;
          float a = exp(-r2 * 3.0) * (1.0 - r2) * vA * uOpacity;
          if (a < 0.004) discard;
          gl_FragColor = vec4(uColor, a);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      fog: true,
    });
    this.smokeMat = material;
    const points = new Points(geo, material);
    points.name = 'camps:smoke';
    points.frustumCulled = false;
    points.renderOrder = 2;
    return points;
  }
}
