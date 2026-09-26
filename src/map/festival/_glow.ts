import { AdditiveBlending, Color, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import { hazeUniforms } from '../sky/haze';
import { KIT_COMMON, type KitUniforms } from './_kit';

/**
 * Soft light of the festival at night, no lights: one additive draw of
 * quads, each either
 *  - a **halo** round a flame or a lit float (turned to the camera; `size` m
 *    across), or
 *  - a **streak** on the water under it: the reflection, a soft band from
 *    the light's foot towards the camera, shimmering (`size` m long seen
 *    from 40 m, longer farther off; `width` m wide).
 * A quad can ride a rig and drift like its candle (the kit's rigs and
 * `kDrift`, shared uniforms). Brighter at night; it fades into the haze and
 * the valley mist like everything else.
 */

export const GLOW_MODE = { halo: 0, streak: 1 } as const;

export interface GlowOpts {
  rig?: number;
  /** Halo or streak. */
  mode?: number;
  /** Night only (1), always (0). */
  show?: number;
  /** A candle's drift (the kit's `ANIM.drift` values). */
  drift?: { a: [number, number, number]; b: [number, number, number, number] };
  /** Strength (1 = full). */
  level?: number;
  /** A streak's width (m). */
  width?: number;
}

const STRIDE = 20;

export class Glow {
  private readonly data: number[] = [];
  private readonly c = new Color();

  get count(): number {
    return this.data.length / STRIDE;
  }

  /** A glow at (x, y, z) in its rig's space (a streak: its foot on the water), colour (sRGB), size (m). */
  add(x: number, y: number, z: number, color: number, size: number, o: GlowOpts = {}): void {
    this.c.setHex(color);
    const d = o.drift;
    this.data.push(
      x,
      y,
      z,
      o.rig ?? 0,
      this.c.r * (o.level ?? 1),
      this.c.g * (o.level ?? 1),
      this.c.b * (o.level ?? 1),
      size,
      o.mode ?? 0,
      o.show ?? 1,
      (x * 12.9898 + z * 78.233) % 1,
      o.width ?? 0.3,
      d ? 3 : 0,
      d ? d.a[0] : 0,
      d ? d.a[1] : 0,
      d ? d.a[2] : 0,
      d ? d.b[0] : 0,
      d ? d.b[1] : 0,
      d ? d.b[2] : 0,
      d ? d.b[3] : 0,
    );
  }

  build(name: string, u: KitUniforms): { mesh: Mesh; show(on: boolean): void; level: { value: number } } {
    const n = this.count;
    const quad = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.setIndex(quad.getIndex());
    geo.setAttribute('position', quad.getAttribute('position'));
    const d = this.data;
    const take = (off: number, size: number) => {
      const a = new Float32Array(n * size);
      for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) a[i * size + k] = d[i * STRIDE + off + k];
      return new InstancedBufferAttribute(a, size);
    };
    geo.setAttribute('gPos', take(0, 4));
    geo.setAttribute('gCol', take(4, 4));
    geo.setAttribute('gMode', take(8, 4));
    geo.setAttribute('gAnim', take(12, 4));
    geo.setAttribute('gAnim2', take(16, 4));
    geo.instanceCount = 0;
    const level = { value: 0 };
    const material = new ShaderMaterial({
      name: `${name}:glow`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: true,
      uniforms: { ...hazeUniforms(), ...u, uLevel: level },
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        attribute vec4 gPos;
        attribute vec4 gCol;
        attribute vec4 gMode;
        attribute vec4 gAnim;
        attribute vec4 gAnim2;
        ${KIT_COMMON}
        uniform float uLevel;
        varying vec2 vUv;
        varying vec3 vCol;
        varying float vKind;
        varying float vSeed;
        void main() {
          vec3 p = gPos.xyz;
          float sc = kShow(gMode.y);
          if (gAnim.x > 2.5) {
            vec4 dr = kDrift(gAnim, gAnim2, uTime);
            p += dr.xyz;
            sc *= dr.w;
          }
          p = (uRig[int(gPos.w + 0.5)] * vec4(p, 1.0)).xyz;
          // A soft flicker, slow (candles breathe, they do not strobe).
          float fl = 0.88 + 0.12 * sin(uTime * ${((190 * Math.PI * 2) / 600).toFixed(5)} + gMode.z * 40.0) * sin(uTime * ${((130 * Math.PI * 2) / 600).toFixed(5)} + gMode.z * 17.0);
          vCol = gCol.rgb * uLevel * fl * sc;
          vKind = gMode.x;
          vSeed = gMode.z;
          vUv = position.xy * 2.0;
          vec4 mvPosition;
          if (gMode.x < 0.5) {
            mvPosition = viewMatrix * vec4(p, 1.0);
            mvPosition.xy += position.xy * gCol.w * max(sc, 0.001);
          } else {
            // Reflection: from under the light towards the camera, lying on the water.
            vec2 toCam = cameraPosition.xz - p.xz;
            float dist = max(length(toCam), 1e-3);
            vec2 dir = toCam / dist;
            vec2 side = vec2(-dir.y, dir.x);
            // (longer the lower and farther it is seen, as on gently rippled water)
            float len = gCol.w * clamp(dist / 40.0, 0.5, 2.5);
            float wid = gMode.w + dist * 0.002;
            vec2 xz = p.xz + dir * ((position.y + 0.5) * len) + side * (position.x * wid);
            mvPosition = viewMatrix * vec4(xz.x, p.y + 0.14, xz.y, 1.0);
            vUv = vec2(position.x * 2.0, position.y + 0.5);
          }
          gl_Position = projectionMatrix * mvPosition;
          if (dot(vCol, vCol) < 1e-6) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vCol;
        varying float vKind;
        varying float vSeed;
        void main() {
          float a;
          if (vKind < 0.5) {
            float r2 = dot(vUv, vUv);
            a = exp(-r2 * 5.0) * 0.85 + exp(-r2 * 28.0) * 0.6;
            a *= 1.0 - smoothstep(0.8, 1.0, r2);
          } else {
            float along = vUv.y;
            float across = vUv.x;
            float ripple = 0.62 + 0.38 * sin(along * 38.0 - uTime * 1.89543 + vSeed * 30.0) * sin(along * 13.0 + uTime * 0.70162);
            a = pow(1.0 - along, 0.9) * exp(-across * across * 3.0) * ripple * smoothstep(0.0, 0.06, along);
          }
          vec3 col = vCol * a;
          #ifdef USE_FOG
            // Into the haze and the valley mist with distance (fading, not tinting: it adds light).
            vec3 hzRay = vFogWorld - cameraPosition;
            float hzDist = length(hzRay);
            float low = hazeLowAmount(cameraPosition, vFogWorld, hzDist, hazeBanks(vFogWorld.xz).x);
            col *= (1.0 - hazeDistance(hzDist)) * (1.0 - (vKind < 0.5 ? 0.85 : 0.6) * low);
          #endif
          if (max(col.r, max(col.g, col.b)) < 0.002) discard;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const mesh = new Mesh(geo, material);
    mesh.name = `${name}:glow`;
    mesh.frustumCulled = false;
    mesh.renderOrder = 12;
    mesh.raycast = () => {};
    return { mesh, show: (on) => void (geo.instanceCount = on ? n : 0), level };
  }
}
