import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3, Vector4 } from 'three';
import { HAZE_FUNCS, HAZE_PARS, hazeOwnUniforms } from './haze';
import { mistNoiseTexture } from './noise';
import type { SkyState } from './palette';

/**
 * The sky: a dome that follows the camera. A gradient from the haze at the
 * horizon to lavender blue (day) or deep blue (night) up high, a broad warm
 * glow around the sun, the sun and moon discs (far above 1.0 in linear light
 * so they bloom), soft clouds and, at night, stars. At the horizon the sky
 * is exactly the haze colour, so far land melts into it; below the horizon
 * it is the valley mist.
 */
export interface SkyDome {
  mesh: Mesh;
  update(sky: SkyState, t: number, cameraPos: Vector3): void;
}

export function buildSkyDome(): SkyDome {
  const u = {
    uZenith: { value: new Color() },
    uHorizon: { value: new Color() },
    uGlow: { value: new Color() },
    uGlowDir: { value: new Vector3() },
    uSunDir: { value: new Vector3() },
    uMoonDir: { value: new Vector3() },
    /** sun visibility, moon visibility, stars, glow strength */
    uAmounts: { value: new Vector4() },
    uCloudLit: { value: new Color() },
    uCloudBody: { value: new Color() },
    uTime: { value: 0 },
    uNoise: { value: mistNoiseTexture() },
  };
  // The haze (the sky has no scene fog, so it gets its own fog colour and range).
  const haze = hazeOwnUniforms();
  const fogColor = new Color();
  haze.fogColor.value = fogColor;
  const material = new ShaderMaterial({
    name: 'map sky',
    side: BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    uniforms: { ...u, ...haze },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${HAZE_PARS}
      ${HAZE_FUNCS}
      uniform vec3 uZenith;
      uniform vec3 uHorizon;
      uniform vec3 uGlow;
      uniform vec3 uGlowDir;
      uniform vec3 uSunDir;
      uniform vec3 uMoonDir;
      uniform vec4 uAmounts;
      uniform vec3 uCloudLit;
      uniform vec3 uCloudBody;
      uniform float uTime;
      uniform sampler2D uNoise;
      varying vec3 vDir;

      float hash13(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.zyx + 31.32);
        return fract((p.x + p.y) * p.z);
      }
      vec3 hash33(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.xxy + p.yxx) * p.zyx);
      }
      // A disc on the sky: x, y across it (−1‥1 inside) for direction d.
      vec2 discUV(vec3 d, vec3 c, float r) {
        vec3 right = normalize(cross(c, vec3(0.0, 1.0, 0.0)));
        vec3 up = cross(right, c);
        return vec2(dot(d, right), dot(d, up)) / r;
      }

      void main() {
        vec3 d = normalize(vDir);
        float e = d.y;
        float sunA = uAmounts.x;
        float moonA = uAmounts.y;

        // Gradient: horizon colour up to the zenith colour by about 18°.
        float up = smoothstep(0.0, 0.32, e);
        vec3 col = mix(uHorizon, uZenith, pow(up, 0.6));
        // Warm glow around the sun (or cool around the moon), broad and soft.
        float mu = max(dot(d, uGlowDir), 0.0);
        col += uGlow * uAmounts.w * (0.12 * pow(mu, 4.0) + 0.45 * pow(mu, 16.0) + 0.9 * pow(mu, 110.0));
        // The haze band at the horizon: exactly the haze, as far land fades into it.
        vec3 haze = hazeColorDir(d);
        col = mix(col, haze, 1.0 - smoothstep(-0.01, 0.12, e));
        // Below the horizon: the sea of mist.
        vec3 low = mix(haze, hazeMistColor(vec2(1.0, 0.55), haze), hazeHeight.w);
        col = mix(col, low, smoothstep(0.0, -0.05, e));

        // Clouds: a soft layer seen from below, drifting.
        float cl = 0.0;
        if (e > 0.005) {
          vec2 p = d.xz / (e + 0.08) * 0.22 + vec2(uTime * 0.0012, uTime * 0.0004);
          float n = texture2D(uNoise, p * 0.35).r * 0.55 + texture2D(uNoise, p * 0.9 + 0.3).g * 0.3 + texture2D(uNoise, p * 2.1 + 0.7).b * 0.15;
          // Wispy streaks: stretched along x.
          float s = texture2D(uNoise, vec2(p.x * 0.25, p.y * 1.6) + 0.5).r;
          n = n * 0.75 + s * 0.25;
          cl = smoothstep(0.5, 0.78, n);
          cl *= smoothstep(0.005, 0.08, e) * (1.0 - 0.6 * pow(mu, 60.0));
          // Lit from the sun side: bright rims near the sun, soft body elsewhere.
          float lit = pow(mu, 4.0);
          vec3 cc = mix(uCloudBody, uCloudLit, clamp(lit * 1.3 + (1.0 - cl) * 0.35 * lit + 0.15, 0.0, 1.0));
          cc += uGlow * uAmounts.w * pow(mu, 30.0) * (1.0 - cl) * 1.2;
          col = mix(col, cc, cl * 0.8);
        }

        // Stars.
        if (uAmounts.z > 0.001 && e > 0.0) {
          vec3 sp = d * 420.0;
          vec3 cell = floor(sp);
          float h = hash13(cell);
          if (h > 0.972) {
            vec3 c = cell + 0.5 + (hash33(cell) - 0.5) * 0.6;
            float r = length(sp - c);
            float tw = 0.65 + 0.35 * sin(uTime * (0.7 + h * 2.3) + h * 91.0);
            float b = smoothstep(0.45, 0.0, r) * (0.4 + 2.2 * pow((h - 0.972) / 0.028, 3.0)) * tw;
            col += vec3(0.85, 0.9, 1.0) * b * uAmounts.z * smoothstep(0.02, 0.2, e) * (1.0 - cl);
          }
        }

        // Sun disc.
        if (sunA > 0.001) {
          float r = length(discUV(d, uSunDir, 0.024));
          float disc = 1.0 - smoothstep(0.85, 1.0, r);
          col += vec3(1.0, 0.9, 0.68) * 14.0 * disc * sunA * (1.0 - 0.7 * cl);
          col += vec3(1.0, 0.72, 0.42) * 0.9 * exp(-r * 1.6) * sunA;
        }
        // Moon: a pale disc with darker seas, soft glow.
        if (moonA > 0.001) {
          vec2 q = discUV(d, uMoonDir, 0.03);
          float r = length(q);
          float disc = 1.0 - smoothstep(0.9, 1.0, r);
          float seas = texture2D(uNoise, q * 0.18 + 0.37).r * 0.7 + texture2D(uNoise, q * 0.45 + 0.11).g * 0.3;
          float shade = mix(0.78, 1.0, smoothstep(0.35, 0.62, seas)) * (1.0 - 0.18 * r * r);
          col = mix(col, vec3(0.82, 0.9, 1.0) * 3.2 * shade, disc * moonA * (1.0 - 0.6 * cl));
          col += vec3(0.55, 0.7, 1.0) * 0.22 * exp(-r * 1.5) * moonA;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new Mesh(new SphereGeometry(4000, 48, 24), material);
  mesh.name = 'sky';
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return {
    mesh,
    update(sky, t, cameraPos) {
      u.uZenith.value.copy(sky.zenith);
      u.uHorizon.value.copy(sky.horizon);
      u.uGlow.value.copy(sky.glow);
      u.uGlowDir.value.copy(sky.glowDir);
      u.uSunDir.value.copy(sky.sunDir);
      u.uMoonDir.value.copy(sky.moonDir);
      u.uAmounts.value.set(sky.sun, sky.moon, sky.stars, sky.glowStrength);
      u.uCloudLit.value.copy(sky.cloudLit);
      u.uCloudBody.value.copy(sky.cloudBody);
      u.uTime.value = t;
      fogColor.copy(sky.haze);
      haze.fogNear.value = sky.hazeNear;
      haze.fogFar.value = sky.hazeFar;
      mesh.position.copy(cameraPos);
    },
  };
}
