import { Box3, BufferGeometry, Color, Float32BufferAttribute, Points, ShaderMaterial, Sphere, UniformsLib, UniformsUtils, Vector2, Vector3, type BufferAttribute } from 'three';
import { hash3 } from '../../voxel/random';
import { SKY } from '../sky/palette';
import type { MapFrame } from '../types';

/**
 * What rises from the palm sugar stove, as one cloud of camera-facing
 * points moved in the vertex shader (no work per frame but a few uniforms):
 *
 * - **steam** off the three woks: thick soft billows welling up; most gather
 *   under the ridge and pour out of the roof's vent in one plume, some roll
 *   out of the hut's open side under the eaves; then they lean with the
 *   breeze, spreading and thinning as they climb. Thickest in the cool
 *   morning, lighter in the afternoon's heat. Coloured like the valley mist
 *   at that hour (`SKY.mistLit` on top, `mistShade` below) and, looking toward
 *   the low sun through it, glowing with the sun's light (forward
 *   scattering: the backlit steam of the morning);
 * - **wood smoke** from the chimney: out of the vent too, a thin blue-grey
 *   thread, higher and slower;
 * - **sparks** at night: now and then an ember flies up from the chimney or
 *   a fire mouth, bright (it blooms) and gone in a moment.
 *
 * Sources are world points; the object stays at the origin.
 */

/** Puffs per wok, smoke puffs, sparks. */
const STEAM = 72;
const SMOKE = 18;
const SPARKS = 16;

export interface SteamSources {
  woks: Vector3[];
  chimney: Vector3;
  mouths: Vector3[];
  /** Where the steam that rolls out of the hut's open side goes (x, z, m over its life), and where the rest gathers to go out of the ridge's vent (from the woks, m). */
  out: Vector2;
  vent: Vector2;
}

interface SteamUniforms {
  uTime: { value: number };
  uScale: { value: number };
  uSteam: { value: number };
  uSmoke: { value: number };
  uSpark: { value: number };
  uWind: { value: Vector2 };
  uOut: { value: Vector2 };
  uVent: { value: Vector2 };
  uLit: { value: Color };
  uShade: { value: Color };
  uGlow: { value: Color };
  uGlowDir: { value: Vector3 };
  uEmber: { value: Color };
}

export function buildSteam(src: SteamSources): { object: Points; update(f: MapFrame, scale: number, steam: number, smoke: number, spark: number): void } {
  const pos: number[] = [];
  const ps: number[] = [];
  src.woks.forEach((w, j) => {
    for (let i = 0; i < STEAM; i++) {
      // (a little spread over the wok's face)
      const a = hash3(i, j, 1, 9201) * Math.PI * 2;
      const d = Math.sqrt(hash3(i, j, 2, 9202)) * 0.4;
      pos.push(w.x + Math.cos(a) * d, w.y + 0.05, w.z + Math.sin(a) * d);
      ps.push((i + hash3(i, j, 3, 9203) * 0.7) / STEAM, hash3(i, j, 4, 9204), 0, 0);
    }
  });
  for (let i = 0; i < SMOKE; i++) {
    const c = src.chimney;
    pos.push(c.x, c.y, c.z);
    ps.push((i + hash3(i, 5, 5, 9205) * 0.6) / SMOKE, hash3(i, 6, 6, 9206), 1, 0);
  }
  for (let i = 0; i < SPARKS; i++) {
    const fromMouth = i % 3 === 2 && src.mouths.length > 0;
    const c = fromMouth ? src.mouths[i % src.mouths.length] : src.chimney;
    pos.push(c.x, c.y, c.z);
    ps.push(hash3(i, 7, 7, 9207), hash3(i, 8, 8, 9208), 2, 0);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('aPs', new Float32BufferAttribute(ps, 4));
  const material = new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uTime: { value: 0 },
        uScale: { value: 800 },
        uSteam: { value: 0 },
        uSmoke: { value: 0 },
        uSpark: { value: 0 },
        uWind: { value: new Vector2(0.1, 0.05) },
        uOut: { value: src.out.clone() },
        uVent: { value: src.vent.clone() },
        uLit: { value: new Color(0.9, 0.88, 0.84) },
        uShade: { value: new Color(0.6, 0.62, 0.66) },
        uGlow: { value: new Color(1, 0.7, 0.4) },
        uGlowDir: { value: new Vector3(0, 0, -1) },
        uEmber: { value: new Color(1, 0.42, 0.1) },
      },
    ]),
    vertexShader: /* glsl */ `
      attribute vec4 aPs;
      uniform float uTime;
      uniform float uScale;
      uniform float uSteam;
      uniform float uSmoke;
      uniform float uSpark;
      uniform vec2 uWind;
      uniform vec2 uOut;
      uniform vec2 uVent;
      uniform vec3 uGlowDir;
      varying float vA;
      varying float vKind;
      varying float vAge;
      varying float vFwd;
      #include <common>
      #include <fog_pars_vertex>
      void main() {
        float kind = aPs.z;
        vec3 p = position;
        float a;
        float size;
        float age;
        if (kind < 0.5) {
          // Steam: wells up fast off the hot syrup and slows; most of it gathers under the roof's ridge and pours
          // out of the vent, some rolls out of the open side under the eaves; then it leans with the breeze.
          age = fract(uTime / 10.0 + aPs.x);
          bool side = aPs.y < 0.3;
          p.y += (side ? 4.4 : 9.5) * (1.0 - (1.0 - age) * (1.0 - age));
          p.xz += (side ? uOut * smoothstep(0.0, 0.5, age) : uVent * smoothstep(0.0, 0.32, age)) + uWind * age * age * 6.0;
          // (along the vent the plumes of the three woks spread into one)
          p.z += side ? 0.0 : (aPs.y - 0.65) * 2.4 * smoothstep(0.2, 0.6, age);
          // (each puff its own wander: the plume goes ragged and wispy as it climbs)
          float sw = uTime * 0.37 + aPs.y * 6.283;
          p.xz += vec2(sin(sw + age * 3.0), cos(sw * 0.8 + age * 2.4)) * (0.12 + 1.1 * age);
          size = mix(0.5, side ? 3.1 : 4.4, sqrt(age)) * (0.7 + 0.6 * aPs.y);
          a = smoothstep(0.0, 0.06, age) * (1.0 - smoothstep(0.45, 1.0, age)) * uSteam * (0.65 + 0.35 * aPs.y);
        } else if (kind < 1.5) {
          // Wood smoke from the chimney: to the vent too, then a thin thread, high and slow.
          age = fract(uTime / 14.0 + aPs.x);
          p.y += age * 10.0 * (1.0 - 0.3 * age);
          p.xz += uWind * age * age * 8.0 + uVent * smoothstep(0.0, 0.2, age);
          float sw = uTime * 0.21 + aPs.y * 6.283;
          p.xz += vec2(sin(sw + age * 2.5), cos(sw * 0.8 + age * 2.0)) * (0.1 + 0.8 * age);
          size = mix(0.35, 2.6, sqrt(age));
          a = smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.3, 1.0, age)) * uSmoke;
        } else {
          // A spark: flies up wobbling, fades; each only on some of its turns.
          age = fract(uTime / 2.6 + aPs.x);
          float turn = floor(uTime / 2.6 + aPs.x);
          p.y += age * (1.4 + 1.8 * aPs.y);
          p.xz += vec2(sin(uTime * 3.1 + aPs.y * 20.0), cos(uTime * 2.7 + aPs.y * 13.0)) * 0.14 * age + uWind * age * 1.5;
          size = 0.05 + 0.04 * aPs.y;
          a = (1.0 - age) * uSpark * step(0.55, fract(turn * 0.618 + aPs.y));
        }
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        float px = size * uScale / max(1.0, -mvPosition.z);
        gl_PointSize = kind > 1.5 ? max(1.5, px) : min(px, 480.0);
        vA = a;
        vKind = kind;
        vAge = age;
        // (looking toward the sun through it: forward scattering)
        vFwd = pow(max(dot(normalize(p - cameraPosition), uGlowDir), 0.0), 6.0);
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uLit;
      uniform vec3 uShade;
      uniform vec3 uGlow;
      uniform vec3 uEmber;
      varying float vA;
      varying float vKind;
      varying float vAge;
      varying float vFwd;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec2 q = gl_PointCoord * 2.0 - 1.0;
        float r2 = dot(q, q);
        if (r2 >= 1.0 || vA <= 0.002) discard;
        vec3 col;
        float alpha;
        if (vKind > 1.5) {
          alpha = vA * (1.0 - r2);
          col = uEmber * (2.2 + 2.0 * (1.0 - vAge));
        } else {
          float puff = exp(-r2 * 3.0) * (1.0 - r2);
          // (lit from above: the top of a puff brighter)
          vec3 base = mix(uShade, uLit, clamp(0.55 - 0.45 * q.y, 0.0, 1.0)) * 0.94;
          if (vKind > 0.5) base *= vec3(0.74, 0.77, 0.84);
          // (backlit: its edges and thin parts glow most, the thick middle of a puff less)
          col = base + uGlow * vFwd * (vKind > 0.5 ? 0.25 : 0.35) * (0.6 + 0.8 * r2);
          alpha = puff * vA * (vKind > 0.5 ? 0.4 : 0.44);
        }
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    fog: true,
  });
  material.name = 'palmSugar:steam';
  const object = new Points(geo, material);
  object.name = 'palmSugar:steam';
  // (culled on the woks and the chimney, grown by the most a puff goes in the shader: 10 m up, 12 m across with the
  // vent, the breeze and its wander, and half its size, 2.9 m)
  geo.boundingSphere = new Box3().setFromBufferAttribute(geo.getAttribute('position') as BufferAttribute).expandByVector(new Vector3(15, 13, 15)).getBoundingSphere(new Sphere());
  object.renderOrder = 3;
  object.castShadow = false;
  const u = material.uniforms as unknown as SteamUniforms;
  return {
    object,
    update(f, scale, steam, smoke, spark) {
      u.uTime.value = f.t % 1456;
      u.uScale.value = scale;
      u.uSteam.value = steam;
      u.uSmoke.value = smoke;
      u.uSpark.value = spark;
      const w = f.weather;
      const wind = 0.1 + w.wind * 0.9;
      u.uWind.value.set(Math.sin(w.windDir) * wind, Math.cos(w.windDir) * wind);
      u.uLit.value.copy(SKY.mistLit);
      u.uShade.value.copy(SKY.mistShade);
      u.uGlow.value.copy(SKY.glow).multiplyScalar(0.55 * SKY.glowStrength * SKY.sun);
      u.uGlowDir.value.copy(SKY.glowDir);
    },
  };
}
