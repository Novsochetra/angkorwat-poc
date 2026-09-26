import { Color, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, ShaderMaterial, Vector2, Vector3 } from 'three';
import { hash3 } from '../../voxel/random';
import type { MapContext, MapFrame, MapPart } from '../types';
import { hazeUniforms } from './haze';
import { SKY } from './palette';

/**
 * Rain (the part `rain`): falling streaks round the camera, one instanced
 * draw (one quad a drop), in three nested boxes that travel with the camera
 * and wrap round it, so the drops stay put in the world as it moves (and
 * slide past it as they should):
 *  - near: a 36 m box of short thin streaks (on foot, in the boat: the rain
 *    round the explorer; left out over the picker, where nothing near the
 *    camera shows them for rain and they read as scratches on the lens);
 *  - middle: 170 m, longer ones (shorter and fainter over the picker);
 *  - far: 1100 m, short faint streaks, many of them: a veil, so the rain
 *    reads from the overview too.
 * Each layer shows only where the one inside it ends, so no drop is ever
 * a thick rod right at the lens; a drop narrower than a pixel is drawn one
 * pixel wide and fainter (no shimmer). The drops fall at 7.5–9.5 m/s and
 * slant with the wind (`f.weather.wind`, `windDir`), the harder it blows
 * the more; fewer of them in light rain (the instance count follows
 * `rain`). They are lit softly by the sky's own light (the haze colour
 * and the sky fill: visible against the sky and the dark jungle, soft at
 * night), light up in a lightning flash, and fade into the haze like
 * everything else (three's fog chunks). None above ≈ 500 m (the cloud
 * base: gliding over it, it is dry).
 *
 * Nothing is drawn while it is dry (hidden; its shader is compiled on the
 * first frames). No allocation per frame.
 *
 * `RAIN_RINGS_GLSL`: rings and splash dots where drops hit water, for water
 * shaders (water/surface.ts: the rivers and the lake).
 */

/** Drop layers: box size across and tall (m), streak length and width (m), opacity, share of the drops. */
const LAYERS = [
  { box: 36, tall: 26, len: 0.85, width: 0.011, alpha: 0.6, share: 0.42 },
  { box: 170, tall: 120, len: 3.4, width: 0.03, alpha: 0.45, share: 0.13 },
  // (far away: short streaks, many of them, a veil rather than long lines)
  { box: 1100, tall: 460, len: 6, width: 0.12, alpha: 0.45, share: 0.45 },
];
/** The middle layer over the picker: its streak length and opacity, times. */
const OVER_MID = { len: 0.35, alpha: 0.8 };
/** Drops at full rain (all layers). */
const DROPS = 20000;
/** Sideways speed in a full wind (m/s). */
const WIND_SPEED = 7;

export function buildRain(ctx: MapContext): MapPart {
  const quad = new PlaneGeometry(1, 1);
  const geo = new InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  const n = DROPS;
  const drop = new Float32Array(n * 3);
  const info = new Float32Array(n * 2);
  // (the layers are mixed through the list, so fewer drops in light rain thins every layer alike)
  for (let i = 0; i < n; i++) {
    drop[i * 3] = hash3(i, 1, 7, 811);
    drop[i * 3 + 1] = hash3(i, 2, 7, 812);
    drop[i * 3 + 2] = hash3(i, 3, 7, 813);
    let k = hash3(i, 5, 7, 815);
    let layer = 0;
    while (layer < LAYERS.length - 1 && k >= LAYERS[layer].share) k -= LAYERS[layer++].share;
    info[i * 2] = layer;
    info[i * 2 + 1] = hash3(i, 4, 7, 814);
  }
  geo.setAttribute('aDrop', new InstancedBufferAttribute(drop, 3));
  geo.setAttribute('aInfo', new InstancedBufferAttribute(info, 2));
  geo.instanceCount = n;

  const u = {
    uBox: { value: LAYERS.map((l) => new Vector3(l.box, l.tall, l.box)) },
    uShape: { value: LAYERS.map((l) => new Vector3(l.len, l.width, l.alpha)) },
    /** How far the wind has carried the drops (m, x and z), and the time they have fallen (s, y). */
    uDrift: { value: new Vector3() },
    uWind: { value: new Vector2() },
    /** Metres a pixel covers 1 m from the camera. */
    uPixel: { value: 0.001 },
    uColor: { value: new Color() },
    uOpacity: { value: 0 },
  };
  const material = new ShaderMaterial({
    name: 'rain',
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: true,
    defines: { HAZE_MIST: '' },
    uniforms: { ...hazeUniforms(), ...u },
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      uniform vec3 uBox[${LAYERS.length}];
      uniform vec3 uShape[${LAYERS.length}];
      uniform vec3 uDrift;
      uniform vec2 uWind;
      uniform float uPixel;
      attribute vec3 aDrop;
      attribute vec2 aInfo;
      varying vec2 vUv;
      varying float vAlpha;
      void main() {
        int L = int(aInfo.x + 0.5);
        vec3 B = uBox[L];
        vec3 shape = uShape[L];
        float r = aInfo.y;
        float speed = mix(7.5, 9.5, r);
        float sway = mix(0.85, 1.15, fract(r * 7.31));
        // Where the drop is: its place in the box, carried down and along, wrapped round the camera.
        vec3 P = aDrop * B + vec3(uDrift.x * sway, -uDrift.y * speed, uDrift.z * sway);
        vec3 lo = cameraPosition - B * 0.5;
        vec3 head = lo + mod(P - lo, B);
        vec3 along = normalize(vec3(uWind.x * sway, -speed, uWind.y * sway));
        vec3 toCam = cameraPosition - head;
        float dist = max(length(toCam), 1e-3);
        vec3 across = normalize(cross(along, toCam / dist) + vec3(1e-5, 0.0, 0.0));
        // Never thinner than a pixel, never shorter than three (fainter instead).
        float px = dist * uPixel;
        float w = max(shape.y, px * 1.1);
        float len = max(shape.x, px * 3.0);
        vec3 world = head + across * (position.x * w) - along * ((position.y + 0.5) * len);
        // Soft at the box's sides and ends; a layer shows only past the one inside it.
        vec3 rel = (head - cameraPosition) / (B * 0.5);
        float edge = (1.0 - smoothstep(0.6, 1.0, max(abs(rel.x), abs(rel.z)))) * (1.0 - smoothstep(0.55, 1.0, abs(rel.y)));
        float inner = L == 0 ? smoothstep(0.5, 2.0, dist) : smoothstep(uBox[max(L - 1, 0)].x * 0.2, uBox[max(L - 1, 0)].x * 0.42, dist);
        // (none above the cloud base)
        float base = 1.0 - smoothstep(420.0, 540.0, head.y);
        vAlpha = shape.z * edge * inner * base * (shape.y / w);
        vUv = vec2(position.x * 2.0, position.y + 0.5);
        vec4 mvPosition = viewMatrix * vec4(world, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        // (a drop that does not show: off the screen)
        if (vAlpha < 0.003) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vUv;
      varying float vAlpha;
      void main() {
        // Brightest at the head (vUv.y 0), fading along the tail; soft across.
        float a = vAlpha * uOpacity * (1.0 - abs(vUv.x)) * smoothstep(0.0, 0.08, vUv.y) * pow(1.0 - vUv.y, 0.8);
        if (a < 0.002) discard;
        gl_FragColor = vec4(uColor, a);
        #include <fog_fragment>
      }`,
  });
  const mesh = new Mesh(geo, material);
  mesh.name = 'rain';
  mesh.frustumCulled = false;
  mesh.renderOrder = 20;
  mesh.raycast = () => {};

  const buf = new Vector2();
  const tint = new Color();
  const drift = u.uDrift.value;
  // (drawn, unseen, until it has been drawn once: its shader compiles before the first shower)
  let compiled = false;
  mesh.onAfterRender = () => void (compiled = true);

  return {
    name: 'rain',
    object: mesh,
    update(f: MapFrame) {
      const w = f.weather;
      const rain = w.rain;
      const wx = Math.sin(w.windDir) * w.wind * WIND_SPEED;
      const wz = Math.cos(w.windDir) * w.wind * WIND_SPEED;
      u.uWind.value.set(wx, wz);
      if (ctx.shot) drift.set(wx * f.t, f.t, wz * f.t);
      else drift.set(drift.x + wx * f.dt, drift.y + f.dt, drift.z + wz * f.dt);
      const dry = rain <= 0.002;
      mesh.visible = !dry || !compiled;
      if (!mesh.visible) return;
      geo.instanceCount = dry ? LAYERS.length : Math.max(LAYERS.length, Math.ceil(n * Math.min(1, rain * 1.25)));
      // Over the picker (no explorer, nothing near the camera) the drops right at the
      // lens would read as long bright scratches on it: the near layer is left out
      // and the middle one is shorter and fainter, a veil over the land.
      const over = f.roam === 'overview';
      u.uShape.value[0].z = over ? 0 : LAYERS[0].alpha;
      u.uShape.value[1].set(LAYERS[1].len * (over ? OVER_MID.len : 1), LAYERS[1].width, LAYERS[1].alpha * (over ? OVER_MID.alpha : 1));
      ctx.renderer.getDrawingBufferSize(buf);
      const cam = f.camera;
      u.uPixel.value = (2 * Math.tan((cam.fov * Math.PI) / 360)) / Math.max(1, buf.y) / cam.zoom;
      // Lit by the sky: the haze colour and a little of the sky fill and the key light; a flash lights every drop.
      u.uColor.value
        .copy(SKY.haze)
        .multiplyScalar(0.9)
        .add(tint.copy(SKY.fillSky).multiplyScalar(0.18 * SKY.fillIntensity))
        .add(tint.copy(SKY.key).multiplyScalar(0.04 * SKY.keyIntensity))
        .addScalar(0.7 * w.flash);
      u.uOpacity.value = dry ? 0 : 0.55 + 0.45 * Math.min(1, rain);
    },
  };
}

/**
 * GLSL: rain on water. `rainRings(p, t, amount)` at a water point `p` (world
 * xz, m) at time `t` (s) with `amount` rain (0‥1): xy = a slope to add to the
 * surface normal (x, z), z = a splash's brightness (0‥1). Every 0.6 m cell
 * of two offset grids gets a drop now and then (more in heavier rain), at a
 * new spot each time; its ring spreads to ≈ 0.2 m and fades within a second.
 * Up close only: fade it out by 100 m or so.
 */
export const RAIN_RINGS_GLSL = /* glsl */ `
float rainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 rainRings(vec2 p, float t, float amount) {
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    vec2 q = p * 1.65 + float(k) * vec2(0.37, 0.71);
    vec2 cell = floor(q);
    float h = rainHash(cell + float(k) * 19.1);
    float rate = 0.9 + 0.6 * h;
    float cyc = t * rate + h * 7.0;
    float n = floor(cyc);
    float ph = cyc - n;
    // (a drop here this time round, or not: more of them in heavier rain)
    if (rainHash(cell + n * vec2(3.1, 7.7)) > amount * 0.9) continue;
    vec2 c = cell + 0.3 + 0.4 * vec2(rainHash(cell + n * 1.7 + 0.5), rainHash(cell - n * 2.3 + 9.1));
    vec2 dv = q - c;
    float d = length(dv);
    float r = ph * 0.34;
    float fade = (1.0 - ph) * (1.0 - ph);
    float ring = exp(-pow((d - r) / 0.045, 2.0)) * fade;
    acc.xy += dv / max(d, 1e-3) * ring * 0.9;
    acc.z += (1.0 - smoothstep(0.0, 0.05, d)) * (1.0 - smoothstep(0.0, 0.12, ph)) + ring * 0.12;
  }
  return acc;
}
`;
