import { BufferAttribute, BufferGeometry, Color, CustomBlending, DoubleSide, Mesh, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial, Vector3 } from 'three';
import type { MapContext, MapFrame, MapPart } from '../types';
import { mistNoiseTexture } from './noise';
import { KEY_DAY, SKY } from './palette';

/**
 * A rainbow after rain (the part `rainbow`): a soft, faint arc in the
 * west-north-west, over Bayon, round the point opposite the key light's
 * bearing (by day `KEY_DAY`: the sun from the east-south-east; it follows the
 * key as it turns), taken at the real sun's low height (≥ 2°), not the key's
 * 25°: a tall, near upright bow. The overview never sees its top; its right
 * leg stands in the open sky between the title card and Angkor Wat's.
 *
 * As the real one: the primary bow at 40–42.5° from that point, red on the
 * outside, violet inside; the sky inside it a little brighter; a faint
 * secondary bow at 50–53.5° with the colours the other way round, and the
 * darker band between them (Alexander's). Broad soft bands (the sun is not
 * a point), a little warm in the low sun, patchy along the arc where the
 * rain curtain is thinner, the patches drifting slowly.
 *
 * It follows the camera, as a real rainbow does (it is always the same
 * angle from the eye), on a band of sky 1100 m out: nearer land hides it,
 * farther hills and haze show it in front of them. Light only adds (and the
 * dark band takes a little away): never garish. `f.weather.rainbow` fades
 * it in and out (sky/weather.ts: after rain, by day). One draw, only while
 * there is one (its shader is compiled on the first frame drawn).
 */

/** Distance of the band (m). */
const RADIUS = 1100;
/** The band holds these angles from the antisolar point (degrees). */
const INNER = 30;
const OUTER = 56;
/** The sun is never taken lower than this for the bow (rad). */
const LOW_SUN = (2 * Math.PI) / 180;
/** Brightness at full (linear light added). */
const STRENGTH = 0.36;

export function buildRainbow(ctx: MapContext): MapPart {
  void ctx;
  // A band of a cone round +z (rings × segments); turned each frame to the point opposite the sun.
  const RINGS = 6;
  const SEGS = 96;
  const pos: number[] = [];
  const index: number[] = [];
  for (let r = 0; r <= RINGS; r++) {
    const th = ((INNER + ((OUTER - INNER) * r) / RINGS) * Math.PI) / 180;
    for (let s = 0; s <= SEGS; s++) {
      const ps = (s / SEGS) * Math.PI * 2;
      pos.push(Math.sin(th) * Math.cos(ps) * RADIUS, Math.sin(th) * Math.sin(ps) * RADIUS, Math.cos(th) * RADIUS);
    }
  }
  for (let r = 0; r < RINGS; r++)
    for (let s = 0; s < SEGS; s++) {
      const a = r * (SEGS + 1) + s;
      const b = a + SEGS + 1;
      index.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  geo.setIndex(index);

  const anti = KEY_DAY.clone().negate();
  const side = new Vector3();
  const up = new Vector3();
  const Z = new Vector3(0, 0, 1);
  const Y = new Vector3(0, 1, 0);
  const u = {
    uAnti: { value: anti },
    uSide: { value: side },
    uUp: { value: up },
    uAmount: { value: 0 },
    uTint: { value: new Color(1, 1, 1) },
    uTime: { value: 0 },
    uNoise: { value: mistNoiseTexture() },
  };
  const material = new ShaderMaterial({
    name: 'rainbow',
    side: DoubleSide,
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    uniforms: u,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = mat3(modelMatrix) * position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uAnti;
      uniform vec3 uSide;
      uniform vec3 uUp;
      uniform float uAmount;
      uniform vec3 uTint;
      uniform float uTime;
      uniform sampler2D uNoise;
      varying vec3 vDir;
      float band(float x, float c, float w) {
        float k = (x - c) / w;
        return exp(-k * k);
      }
      // Colours across a bow: x 0 = its violet edge … 1 = its red edge.
      vec3 spectrum(float x) {
        return vec3(
          band(x, 0.88, 0.2) + 0.22 * band(x, 0.04, 0.1),
          band(x, 0.56, 0.2),
          band(x, 0.22, 0.2)
        );
      }
      void main() {
        vec3 d = normalize(vDir);
        float th = degrees(acos(clamp(dot(d, uAnti), -1.0, 1.0)));
        // Primary: violet at 40.2°, red at 42.6°; secondary: red at 50.3°, violet at 53.7°.
        float x1 = (th - 40.2) / 2.4;
        float x2 = (53.7 - th) / 3.4;
        vec3 c = spectrum(x1) * smoothstep(-0.35, 0.05, x1) * smoothstep(1.35, 0.95, x1);
        c += 0.17 * spectrum(x2) * smoothstep(-0.35, 0.05, x2) * smoothstep(1.35, 0.95, x2);
        // (softer, less saturated than a spectrum: a real bow is washed with sky light)
        c = mix(c, vec3(dot(c, vec3(0.3, 0.5, 0.2))), 0.28);
        // The sky inside the bow is a little brighter; between the bows, a little darker.
        c += vec3(0.07) * smoothstep(25.0, 39.5, th) * smoothstep(40.8, 39.8, th);
        float dark = 0.06 * smoothstep(42.4, 43.6, th) * smoothstep(50.6, 49.4, th);
        // Patchy along the arc (where the rain curtain is thinner), drifting slowly.
        float along = atan(dot(d, uUp), dot(d, uSide));
        float thin = texture2D(uNoise, vec2(along * 0.35 + uTime * 0.004, 0.37 + uTime * 0.002)).r;
        float k = uAmount * (0.6 + 0.6 * smoothstep(0.2, 0.75, thin));
        // Right at the horizon it fades into the haze; where far land shows under it, fainter still.
        float e = d.y;
        k *= mix(0.4, 1.0, smoothstep(-0.03, 0.03, e)) * smoothstep(-0.25, -0.05, e);
        gl_FragColor = vec4(c * uTint * ${STRENGTH.toFixed(3)} * k, dark * k);
      }`,
  });
  const mesh = new Mesh(geo, material);
  mesh.name = 'rainbow';
  mesh.frustumCulled = false;
  // (after the rain clouds, before the mist in front of it)
  mesh.renderOrder = 1;
  mesh.raycast = () => {};
  let compiled = false;
  mesh.onAfterRender = () => void (compiled = true);

  return {
    name: 'rainbow',
    object: mesh,
    update(f: MapFrame) {
      const a = f.weather.rainbow;
      mesh.visible = a > 0.002 || !compiled;
      if (!mesh.visible) return;
      mesh.position.copy(f.camera.position);
      // Opposite the sun: the key light's bearing (it matches the shading) but the
      // real sun's low height (not the key's 25°): a tall, near upright bow whose
      // right leg stands in the open sky of the overview. Turn the band there, and
      // the axes round it (side level, up above).
      const el = Math.max(Math.asin(Math.min(1, Math.max(-1, SKY.sunDir.y))), LOW_SUN);
      const h = Math.hypot(SKY.keyDir.x, SKY.keyDir.z) || 1;
      anti.set((-SKY.keyDir.x / h) * Math.cos(el), -Math.sin(el), (-SKY.keyDir.z / h) * Math.cos(el));
      mesh.quaternion.setFromUnitVectors(Z, anti);
      side.crossVectors(Y, anti).normalize();
      up.crossVectors(anti, side).normalize();
      u.uAmount.value = a;
      u.uTime.value = f.drift;
      // A little warm in the low sun (its colour, brightest channel 1), half way.
      const key = SKY.key;
      const m = Math.max(key.r, key.g, key.b, 1e-3);
      u.uTint.value.setRGB(0.5 + (0.5 * key.r) / m, 0.5 + (0.5 * key.g) / m, 0.5 + (0.5 * key.b) / m);
    },
  };
}
