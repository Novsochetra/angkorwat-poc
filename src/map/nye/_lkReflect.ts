import {
  AddEquation,
  AdditiveBlending,
  CircleGeometry,
  Color,
  CustomBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  OneFactor,
  PlaneGeometry,
  ShaderMaterial,
  SrcColorFactor,
  Vector2,
  Vector3,
  ZeroFactor,
} from 'three';
import { KIT_COMMON, type KitUniforms } from '../festival/_kit';
import { hazeUniforms } from '../sky/haze';

/**
 * The water at the lake venue at night (AWP-35, lake.ts): the owner's picture (assets/new-year-online/lake-reference.png)
 * has a DEEP BLUE lake with a soft gold reflection under every light; the great lake's own water (water/surface.ts, the
 * map's) mirrors the pale moonlit sky at low angles, so round the stage it read grey-lavender and the warm light was lost.
 *
 * - `deepWater`: one flat disc lying just over the great lake, MULTIPLYING what is under it by a deep blue (darker and
 *   bluer; the waves' pattern kept, only weaker), out to the far shore the venue looks across, gone by `r1`; at night
 *   only (gently, in full on the event night), fading into the haze with distance and away as the camera leaves the
 *   venue (`update`'s `fade`: the overview and the far map keep the lake as it was). The moon's path is spared: where
 *   the water mirrors the moon's bearing (a column from under the moon toward the camera) it stays bright, as in the
 *   owner's picture. Drawn first among the see-through things (`renderOrder` −1), so the reflections and the
 *   fireworks' mirror add over it.
 * - `WaterLights`: the light ON the water — every lantern's, candle's, fire bowl's and bulb's reflection (a streak) and
 *   the halos of the things afloat — in ONE additive instanced draw. A streak lies on the water from under its light
 *   toward the camera, as a light's mirror image smeared by the ripples: on the screen it reaches down from the light's
 *   foot about 1.6 times the light's own height there, plus a little (so from the terrace a long column on the water,
 *   from above a short patch, the same against its lantern either way), broken into ripples evenly spaced on the screen
 *   that drift toward the viewer and wobble sideways. Things
 *   afloat ride the festival kit's drift (`kDrift`, the same clock), so a boat's halo and streak stay under it. Lights of
 *   the event night only are drawn only then (`event`).
 */

export interface DeepWater {
  mesh: Mesh;
  /** Each frame: night 0‥1, the event night 0‥1, how near the camera is to the venue (1 near … 0 gone), the way to the moon (night: `MapFrame.lightDir`). */
  update(night: number, event: number, fade: number, moon: Vector3): void;
}

/** The deep blue the water is multiplied by at the middle (linear light). */
const TINT = new Color(0.3, 0.42, 0.8);

export function deepWater(x: number, z: number, y: number, r0: number, r1: number): DeepWater {
  const geo = new CircleGeometry(r1, 72);
  geo.rotateX(-Math.PI / 2);
  geo.translate(x, y, z);
  const uniforms = {
    ...hazeUniforms(),
    uCenter: { value: new Vector2(x, z) },
    uR: { value: new Vector2(r0, r1) },
    uTint: { value: TINT.clone() },
    uLevel: { value: 0 },
    uY: { value: y },
    uMoon: { value: new Vector3(0, 1, 0) },
  };
  const material = new ShaderMaterial({
    name: 'nye:lake:deep water',
    transparent: true,
    depthWrite: false,
    fog: true,
    blending: CustomBlending,
    blendEquation: AddEquation,
    // (result = what is there × the shader's colour; its alpha kept)
    blendSrc: ZeroFactor,
    blendDst: SrcColorFactor,
    blendSrcAlpha: ZeroFactor,
    blendDstAlpha: OneFactor,
    uniforms,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      varying vec2 vXZ;
      void main() {
        vXZ = position.xz;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform vec2 uCenter;
      uniform vec2 uR;
      uniform vec3 uTint;
      uniform float uLevel;
      uniform float uY;
      uniform vec3 uMoon;
      varying vec2 vXZ;
      void main() {
        float r = length(vXZ - uCenter);
        float k = uLevel * (1.0 - smoothstep(uR.x, uR.y, r));
        // The moon's path spared: the view ray mirrored by the water, along the moon's bearing (a few degrees either side).
        vec3 view = vec3(vXZ.x, uY, vXZ.y) - cameraPosition;
        vec2 rxz = normalize(view.xz + vec2(1e-5, 0.0));
        vec2 mxz = normalize(uMoon.xz + vec2(1e-5, 0.0));
        float path = smoothstep(0.986, 0.9985, dot(rxz, mxz)) * smoothstep(0.0, 0.12, uMoon.y);
        k *= 1.0 - 0.85 * path;
        #ifdef USE_FOG
          // (less into the haze, but not gone: the far lake under the haze reads deep blue to the horizon too)
          float hzDist = length(vFogWorld - cameraPosition);
          k *= 1.0 - 0.5 * hazeDistance(hzDist);
        #endif
        gl_FragColor = vec4(mix(vec3(1.0), uTint, k), 1.0);
      }`,
  });
  const mesh = new Mesh(geo, material);
  mesh.name = 'nye:lake:deep water';
  mesh.renderOrder = -1;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = () => {};
  geo.computeBoundingSphere();
  return {
    mesh,
    update(night, event, fade, moon) {
      const n = night * night * (3 - 2 * night);
      // (gently on any night, in full on the event night)
      uniforms.uLevel.value = n * (0.4 + 0.6 * event) * fade;
      uniforms.uMoon.value.copy(moon);
      mesh.visible = uniforms.uLevel.value > 0.01;
    },
  };
}

/** Warm light on the water (sRGB). */
export const REFLECT_WARM = 0xffa040;

type Drift = { a: [number, number, number]; b: [number, number, number, number] };

export interface WaterLightOpts {
  /** Strength (1 = the colour at full). */
  level?: number;
  /** A streak's width (m). */
  width?: number;
  /** Rides a candle's or boat's drift (the festival kit's `ANIM.drift` values). */
  drift?: Drift;
  /** Drawn on the event night only. */
  event?: boolean;
}

const STRIDE = 20;

/** Halos and reflections of the lights on and over the lake (one additive draw; see the file's note). */
export class WaterLights {
  private readonly data: number[] = [];
  private readonly c = new Color();

  get count(): number {
    return this.data.length / STRIDE;
  }

  private push(kind: number, x: number, y: number, z: number, color: number, size: number, o: WaterLightOpts): void {
    this.c.setHex(color);
    const k = o.level ?? 1;
    const d = o.drift;
    this.data.push(x, y, z, kind, this.c.r * k, this.c.g * k, this.c.b * k, size, o.event ? 1 : 0, (x * 12.9898 + z * 78.233) % 1, o.width ?? 0.5, 0, d ? 3 : 0, d ? d.a[0] : 0, d ? d.a[1] : 0, d ? d.a[2] : 0, d ? d.b[0] : 0, d ? d.b[1] : 0, d ? d.b[2] : 0, d ? d.b[3] : 0);
  }

  /** A soft round halo round a light at (x, y, z), `size` m across. */
  halo(x: number, y: number, z: number, color: number, size: number, o: WaterLightOpts = {}): void {
    this.push(0, x, y, z, color, size, o);
  }

  /**
   * The reflection of a light standing `high` m over the water at (x, wy, z) (wy: the water's level): a streak from
   * under it toward the camera, on the screen ≈ 1.6 × the light's height seen from there, and ≈ 0.7° more.
   */
  streak(x: number, wy: number, z: number, high: number, color: number = REFLECT_WARM, o: WaterLightOpts = {}): void {
    this.push(1, x, wy, z, color, 1.6 * high + 0.3, o);
  }

  build(name: string, u: KitUniforms): { mesh: Mesh; update(level: number, event: number): void } {
    const n = this.count;
    const quad = new PlaneGeometry(1, 1, 1, 10);
    const geo = new InstancedBufferGeometry();
    geo.setIndex(quad.getIndex());
    geo.setAttribute('position', quad.getAttribute('position'));
    const d = this.data;
    const take = (off: number, size: number) => {
      const a = new Float32Array(Math.max(1, n) * size);
      for (let i = 0; i < n; i++) for (let k = 0; k < size; k++) a[i * size + k] = d[i * STRIDE + off + k];
      return new InstancedBufferAttribute(a, size);
    };
    geo.setAttribute('wPos', take(0, 4));
    geo.setAttribute('wCol', take(4, 4));
    geo.setAttribute('wMode', take(8, 4));
    geo.setAttribute('wAnim', take(12, 4));
    geo.setAttribute('wAnim2', take(16, 4));
    geo.instanceCount = n;
    const level = { value: 0 };
    const event = { value: 0 };
    const material = new ShaderMaterial({
      name: `${name}:water lights`,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: true,
      uniforms: { ...hazeUniforms(), ...u, uLevel: level, uEvent: event },
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        attribute vec4 wPos;
        attribute vec4 wCol;
        attribute vec4 wMode;
        attribute vec4 wAnim;
        attribute vec4 wAnim2;
        ${KIT_COMMON}
        uniform float uLevel;
        uniform float uEvent;
        varying vec2 vUv;
        varying vec3 vCol;
        varying float vKind;
        varying float vSeed;
        varying float vGraze;
        void main() {
          vec3 p = wPos.xyz;
          float sc = mix(1.0, uEvent, wMode.x);
          if (wAnim.x > 2.5) {
            vec4 dr = kDrift(wAnim, wAnim2, uTime);
            p += dr.xyz;
            sc *= dr.w;
          }
          // (candles breathe, they do not strobe)
          float fl = 0.88 + 0.12 * sin(uTime * ${((190 * Math.PI * 2) / 600).toFixed(5)} + wMode.y * 40.0) * sin(uTime * ${((130 * Math.PI * 2) / 600).toFixed(5)} + wMode.y * 17.0);
          vCol = wCol.rgb * uLevel * fl * sc;
          vKind = wPos.w;
          vSeed = wMode.y;
          vGraze = 1.0;
          vUv = position.xy * 2.0;
          vec4 mvPosition;
          if (wPos.w < 0.5) {
            mvPosition = viewMatrix * vec4(p, 1.0);
            // (a little bigger far off, as a light seen through the night air: from the shore the far boats still glow)
            float far = min(sqrt(max(1.0, -mvPosition.z / 60.0)), 1.5);
            mvPosition.xy += position.xy * wCol.w * far * max(sc, 0.001);
          } else {
            // On the water, from under the light toward the camera; long seen low, short seen from above.
            vec2 toCam = cameraPosition.xz - p.xz;
            float dist = max(length(toCam), 1e-3);
            vec2 dir = toCam / dist;
            vec2 side = vec2(-dir.y, dir.x);
            // (from the light's foot down the screen: its angle below the horizon grows evenly along the streak; back on the
            // water that is a distance from the camera, never nearer than half a metre)
            float eye = max(cameraPosition.y - p.y, 0.3);
            float foot = atan(eye, dist);
            // (long only seen at a grazing angle, from the terrace or a boat; looked down on, a short soft patch by the light)
            float graze = 1.0 - 0.78 * smoothstep(0.06, 0.3, foot);
            vGraze = graze;
            float reach = (wCol.w / dist + 0.012) * graze;
            float s = position.y + 0.5;
            float ang = min(foot + s * reach, 1.5);
            float near = max(eye / tan(ang), 0.5);
            float wid = (wMode.z + dist * 0.0025) * (1.0 + 0.35 * (1.0 - graze));
            // (the ripples bend it a little from side to side)
            float wob = 0.1 * wid * sin(s * 9.0 + uTime * ${((80 * Math.PI * 2) / 600).toFixed(5)} + wMode.y * 31.0);
            vec2 xz = p.xz + dir * max(dist - near, 0.0) + side * (position.x * wid + wob);
            mvPosition = viewMatrix * vec4(xz.x, p.y + 0.07, xz.y, 1.0);
            vUv = vec2(position.x * 2.0, s);
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
        varying float vGraze;
        void main() {
          float a;
          if (vKind < 0.5) {
            float r2 = dot(vUv, vUv);
            a = exp(-r2 * 5.0) * 0.85 + exp(-r2 * 28.0) * 0.6;
            a *= 1.0 - smoothstep(0.8, 1.0, r2);
          } else {
            float s = vUv.y;
            float x = vUv.x;
            // Broken into ripples drifting toward the viewer: bright dashes with dark water between.
            // (three ripples at odd lengths, so the dashes come uneven, never a string of beads)
            // (as many ripples as the streak is long: a short patch from above has two or three)
            float bands = mix(0.3, 1.0, vGraze);
            float r1 = 0.5 + 0.5 * sin(s * 31.0 * bands - uTime * ${((230 * Math.PI * 2) / 600).toFixed(5)} + vSeed * 20.0);
            float r2 = 0.5 + 0.5 * sin(s * 13.0 * bands + uTime * ${((100 * Math.PI * 2) / 600).toFixed(5)} + vSeed * 9.0);
            float r3 = 0.5 + 0.5 * sin(s * 67.0 * bands - uTime * ${((370 * Math.PI * 2) / 600).toFixed(5)} + vSeed * 47.0);
            float broken = smoothstep(0.25, 0.95, r1 * 0.5 + r2 * 0.35 + r3 * 0.3);
            float across = exp(-x * x * (2.0 + 2.5 * (1.0 - broken)));
            // (clamped: s may come a hair over 1, and a NaN here would draw a black line through the bloom)
            float along = smoothstep(0.0, 0.05, s) * pow(clamp(1.0 - s, 0.0, 1.0), 0.85);
            a = along * across * (0.4 + 0.8 * broken);
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
    material.customProgramCacheKey = () => 'nye-lake-water-lights';
    const mesh = new Mesh(geo, material);
    mesh.name = `${name}:water lights`;
    mesh.frustumCulled = false;
    mesh.renderOrder = 12;
    mesh.raycast = () => {};
    return {
      mesh,
      update(l, e) {
        level.value = l;
        event.value = e;
        geo.instanceCount = l > 0.001 ? n : 0;
      },
    };
  }
}
