import { AdditiveBlending, BufferGeometry, Color, Float32BufferAttribute, Mesh, ShaderMaterial, Sphere, Vector3, type Texture } from 'three';
import type { HeightField } from '../heightfield';
import { hazeUniforms } from '../sky/haze';

/**
 * The lake plaza's light on the ground at night (AWP-35, the owner's lake reference: warm sandstone glowing in pools of
 * firelight, the gold lotus in the middle; as the Kulen square's pools, `_sqGlow.ts`): ONE additive draw of
 *
 * - **pools**: soft round gold decals draped on the land (a small grid each, following its height) or lying flat at a
 *   floor's height (a sala's), round each fire pillar, lamp post, stall, sala, brazier and the gate — full on paving,
 *   a fifth as bright on grass (the light is added, not lit: on dark grass it would read as an orange wash), fading
 *   out where the land steps; dark gaps left between them;
 * - **the mandala**: one quad lying on the pavers with the Kulen ring's painted lotus (`_sqRing.ts` `buildNyeRing`'s
 *   texture: thin gold lines), breathing, a slow light running round it on the event night.
 *
 * `update(night, event, t)`: the pools only at night; the lotus faint by day (an inlay catching the light), bright gold
 * lines at night. Its shader is short (one texture read, the haze).
 */

export interface PlazaLight {
  mesh: Mesh;
  count: number;
  update(night: number, event: number, t: number): void;
}

export class PlazaPools {
  private readonly pos: number[] = [];
  private readonly loc: number[] = [];
  private readonly col: number[] = [];
  private readonly shape: number[] = [];
  private readonly idx: number[] = [];
  private n = 0;
  private readonly c = new Color();
  private readonly box = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, y: 0 };

  /** `paved(x, z)`: full light there (the plaza's floor, the landing, the avenue); else ×0.22. */
  constructor(
    private readonly field: HeightField,
    private readonly paved: (x: number, z: number) => boolean,
    private readonly top: number,
  ) {}

  get count(): number {
    return this.n;
  }

  /** A soft round pool at (x, z), `r` m, colour (sRGB) × level; draped on the land, or flat at `y` (a raised floor). */
  add(x: number, z: number, r: number, color: number, level: number, y: number | null = null): void {
    const grid = y === null ? Math.max(3, Math.min(8, Math.round(r / 1.2))) : 1;
    this.quad(x, z, r, color, level, 0, grid, y);
  }

  /** The mandala: a quad of half side `R` lying at `y`, the painted lotus on it. */
  mandala(x: number, y: number, z: number, R: number): void {
    this.quad(x, z, R, 0xffffff, 1, 2, 1, y);
  }

  private quad(x: number, z: number, r: number, color: number, level: number, kind: number, grid: number, y: number | null): void {
    const f = this.field;
    this.c.setHex(color).multiplyScalar(level);
    const base = this.pos.length / 3;
    for (let j = 0; j <= grid; j++)
      for (let i = 0; i <= grid; i++) {
        const u = (i / grid) * 2 - 1;
        const v = (j / grid) * 2 - 1;
        const px = x + u * r;
        const pz = z + v * r;
        let py = y;
        let flat = 1;
        if (py === null) {
          // (over the highest land near the point; where the land steps more than a kerb the light fades out there)
          const hs = [f.heightAt(px, pz), f.heightAt(px + 0.8, pz), f.heightAt(px - 0.8, pz), f.heightAt(px, pz + 0.8), f.heightAt(px, pz - 0.8)];
          const h = Math.max(...hs);
          flat = 1 - Math.min(1, Math.max(0, (h - Math.min(...hs) - 0.3) / 0.5));
          if (f.waterAt(px, pz) !== null) flat = 0;
          const onStone = this.paved(px, pz);
          if (!onStone) flat *= 0.22;
          py = h + (onStone ? this.top + 0.05 : 0.12);
        }
        this.pos.push(px, py, pz);
        this.loc.push(u, v);
        this.col.push(this.c.r * flat, this.c.g * flat, this.c.b * flat);
        this.shape.push(kind);
        this.box.x0 = Math.min(this.box.x0, px);
        this.box.x1 = Math.max(this.box.x1, px);
        this.box.z0 = Math.min(this.box.z0, pz);
        this.box.z1 = Math.max(this.box.z1, pz);
        this.box.y = py;
      }
    for (let j = 0; j < grid; j++)
      for (let i = 0; i < grid; i++) {
        const a = base + j * (grid + 1) + i;
        this.idx.push(a, a + grid + 1, a + 1, a + 1, a + grid + 1, a + grid + 2);
      }
    this.n++;
  }

  /** The mesh; `map` the painted lotus (white lines on black, its red channel), `gold` its colour, `scale` its brightness. */
  build(name: string, map: Texture, gold: number, scale: number): PlazaLight {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('pLoc', new Float32BufferAttribute(this.loc, 2));
    geo.setAttribute('pCol', new Float32BufferAttribute(this.col, 3));
    geo.setAttribute('pKind', new Float32BufferAttribute(this.shape, 1));
    geo.setIndex(this.idx);
    const b = this.box;
    const mid = new Vector3((b.x0 + b.x1) / 2, b.y, (b.z0 + b.z1) / 2);
    geo.boundingSphere = new Sphere(mid, Math.hypot(b.x1 - b.x0, b.z1 - b.z0) / 2 + 4);
    const u = {
      ...hazeUniforms(),
      uMap: { value: map },
      uGold: { value: new Color(gold).multiplyScalar(scale) },
      uLevel: { value: 0 },
      uLotus: { value: 0 },
      uEvent: { value: 0 },
      uTime: { value: 0 },
    };
    const material = new ShaderMaterial({
      name: `${name}:light`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
      fog: true,
      uniforms: u,
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        attribute vec2 pLoc;
        attribute vec3 pCol;
        attribute float pKind;
        uniform float uLevel;
        varying vec2 vLoc;
        varying vec3 vCol;
        varying float vKind;
        void main() {
          vLoc = pLoc;
          vKind = pKind;
          vCol = pCol * uLevel;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        uniform sampler2D uMap;
        uniform vec3 uGold;
        uniform float uLotus;
        uniform float uEvent;
        uniform float uTime;
        varying vec2 vLoc;
        varying vec3 vCol;
        varying float vKind;
        void main() {
          float q = length(vLoc);
          vec3 col;
          if (vKind > 1.5) {
            // The lotus: the painted lines, a faint pool under them, a light running round on the event night.
            float lines = texture2D(uMap, vLoc * 0.5 + 0.5).r;
            float pool = 0.03 * (1.0 - smoothstep(0.6, 1.0, q));
            float run = 1.0 + uEvent * 0.45 * sin(atan(vLoc.y, vLoc.x) * 2.0 - uTime * 0.9);
            col = uGold * (lines * run + pool) * uLotus;
          } else {
            // A pool: soft to its rim.
            col = vCol * max((exp(-q * q * 3.2) - 0.04) * (1.0 - smoothstep(0.85, 1.0, q)), 0.0);
          }
          #ifdef USE_FOG
            vec3 hzRay = vFogWorld - cameraPosition;
            float hzDist = length(hzRay);
            float low = hazeLowAmount(cameraPosition, vFogWorld, hzDist, hazeBanks(vFogWorld.xz).x);
            col *= (1.0 - hazeDistance(hzDist)) * (1.0 - 0.6 * low);
          #endif
          if (max(col.r, max(col.g, col.b)) < 0.002) discard;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const mesh = new Mesh(geo, material);
    mesh.name = `${name}:light`;
    mesh.renderOrder = 10;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.raycast = () => {};
    return {
      mesh,
      count: this.n,
      update(night, event, t) {
        const n = Math.min(1, Math.max(0, (night - 0.15) / 0.6));
        const lit = n * n * (3 - 2 * n);
        u.uLevel.value = lit * (1 + 0.3 * event);
        // (the lotus as the Kulen ring: faint gold by day, bright lines at night, a slow breath)
        const breathe = 1 + (0.08 + 0.08 * event) * Math.sin(t * (1.05 + 0.25 * event));
        u.uLotus.value = (0.12 + n * n * (0.95 + 0.4 * event)) * breathe;
        u.uEvent.value = event;
        u.uTime.value = t % 600;
        mesh.visible = u.uLotus.value > 0.01;
      },
    };
  }
}
