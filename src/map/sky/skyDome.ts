import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector2, Vector3, Vector4, type PerspectiveCamera } from 'three';
import { HAZE_FUNCS, HAZE_PARS, hazeOwnUniforms, WIND } from './haze';
import { moonTexture } from './moon';
import { mistNoiseTexture } from './noise';
import type { SkyState } from './palette';
import { createMeteors, METEOR_GLSL } from './stars';

/**
 * The sky: a dome that follows the camera. A gradient from the haze at the
 * horizon to lavender blue (day) or deep blue (night) up high, a broad warm
 * glow around the sun, the sun disc and the moon (sky/moon.ts: its real
 * face, kept under the bloom threshold so the seas read, with a bright rim
 * and halo that bloom), two layers of drifting clouds and, at night, stars
 * that twinkle and now and then a shooting star (sky/stars.ts). At the
 * horizon the sky is exactly the haze colour, so far land melts into it;
 * below the horizon it is the valley mist.
 *
 * The moon shows its phase (`SkyState.moonLight`): the sunlit part bright,
 * a soft, slightly ragged terminator (crater rims catch the light first),
 * and the dark side hidden: only the sky there (without its stars). Its rim
 * and halo glow only beside the lit part.
 *
 * Weather (`SkyState.cloud`, `flash`): cloud cover spreads the heaped clouds
 * over the sky, closes a grey veil over it and hides the sun, moon and
 * stars; a lightning flash lights the clouds from inside.
 *
 * Clouds: two layers on flat sheets over the land, seen from below (a
 * direction d meets them at s = d.xz / (d.y + 0.18): wide overhead, squeezed
 * into streaks toward the horizon, where they thin out into the haze).
 *  - low: heaped clouds, lit on the side toward the sun (or moon), glowing
 *    where thin near it; the faster layer.
 *  - high: thin streaks, slower and on a different heading.
 * Each noise lookup slides with its layer's wind at its own share of it,
 * so the shapes form, stretch and thin out as they go; the wind's heading
 * wanders over minutes. A slow, broad field decides where the sky is
 * cloudy and where clear. The layers shift a little as the camera moves
 * (a sheet ≈ 1 km and ≈ 3 km up), so they have depth when roaming.
 *
 * Drawn last of the solid things, at the far plane, so its work is only
 * done where no land covers it.
 */
export interface SkyDome {
  mesh: Mesh;
  /** `still`: time stands still ("reduce motion"): no shooting stars. */
  update(sky: SkyState, t: number, camera: PerspectiveCamera, still?: boolean): void;
}

/** Angular radius of the moon disc (rad). The concept art's is ≈ 0.024; a little bigger reads better. */
export const MOON_RADIUS = 0.03;

/** The cloud sheet: s = d.xz / (d.y + FLAT) (higher = less squeezed at the horizon, slower overhead). */
const FLAT = 0.18;

/** A cloud layer: height (m, for the parallax), wind speed (sheet units per s) and heading (rad from +x toward +z). */
interface Layer {
  height: number;
  speed: number;
  heading: number;
  seed: number;
}
/** The mist's wind (sky/haze.ts): west and a little north. The low clouds go with it, the high ones veer off. */
const HEADING = Math.atan2(WIND.z, WIND.x);
const LOW: Layer = { height: 1000, speed: 0.034, heading: HEADING, seed: 1 };
const HIGH: Layer = { height: 3000, speed: 0.015, heading: HEADING + 0.45, seed: 2 };

/**
 * One noise lookup of the clouds: sheet → texture (scale, turn, stretch
 * along / across the turned axis), its layer and its share of the wind.
 */
interface Lookup {
  layer: Layer;
  scale: number;
  turn: number;
  along: number;
  across: number;
  wind: number;
}
const LOOKUPS: Lookup[] = [
  // 0: low warp: big slow swirls that bend the shapes.
  { layer: LOW, scale: 0.05, turn: 0.4, along: 1, across: 1, wind: 0.45 },
  // 1–3: low body: big lumps, medium lumps (turned), billowy edges (they run a little ahead).
  { layer: LOW, scale: 0.1, turn: 0, along: 1, across: 1, wind: 1 },
  { layer: LOW, scale: 0.17, turn: 1.1, along: 1, across: 1, wind: 1.08 },
  { layer: LOW, scale: 0.42, turn: 2.3, along: 1, across: 1, wind: 1.15 },
  // 4: where the sky is cloudy and where clear (very broad, slow).
  { layer: LOW, scale: 0.022, turn: 0.6, along: 1, across: 1, wind: 0.3 },
  // 5–6: high streaks, stretched along their wind.
  { layer: HIGH, scale: 0.05, turn: -HIGH.heading, along: 0.35, across: 2.2, wind: 1 },
  { layer: HIGH, scale: 0.12, turn: -HIGH.heading + 0.2, along: 0.45, across: 1.8, wind: 1.15 },
  // 7: low, fine ragged edges.
  { layer: LOW, scale: 0.9, turn: 0.8, along: 1, across: 1, wind: 1.2 },
];

/** Lookup matrix (sheet → texture), column-major like GLSL's mat2. */
function lookupMatrix(l: Lookup): [number, number, number, number] {
  const c = Math.cos(l.turn);
  const s = Math.sin(l.turn);
  // stretch · turn: rows (along·(c, −s), across·(s, c))
  return [l.scale * l.along * c, l.scale * l.across * s, -l.scale * l.along * s, l.scale * l.across * c];
}
const glslNumber = (v: number) => (Number.isInteger(v) ? v.toFixed(1) : String(v));
const LOOKUP_GLSL = LOOKUPS.map((l, i) => `const mat2 CM${i} = mat2(${lookupMatrix(l).map(glslNumber).join(', ')});`).join('\n');

/**
 * Where a layer's wind has carried it by time t (sheet units): steady on
 * its heading, the heading wandering ±25° over a few minutes, a little
 * gusting. Closed form, so a still at time t is always the same.
 */
function windTravel(out: Vector2, t: number, l: Layer): Vector2 {
  const w1 = (Math.PI * 2) / (230 + l.seed * 37);
  const w2 = (Math.PI * 2) / (97 + l.seed * 13);
  const w3 = (Math.PI * 2) / (61 + l.seed * 7);
  // Velocity: along (1 + 0.2 sin w3t), across 0.35 sin w1t + 0.2 sin(w2t + seed); integrated.
  const along = t + (0.2 * (1 - Math.cos(w3 * t))) / w3;
  const across = (0.35 * (1 - Math.cos(w1 * t))) / w1 + (0.2 * (Math.cos(l.seed) - Math.cos(w2 * t + l.seed))) / w2;
  const c = Math.cos(l.heading);
  const s = Math.sin(l.heading);
  return out.set((c * along - s * across) * l.speed, (s * along + c * across) * l.speed);
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
    /** The moon's sunlight in its disc frame (xyz: x right, y up, z toward us) and its lit share (w). */
    uMoonLight: { value: new Vector4(0, 0, 1, 1) },
    /** Weather: cloud cover, rain, lightning flash, unused. */
    uWeather: { value: new Vector4() },
    uCloudLit: { value: new Color() },
    uCloudBody: { value: new Color() },
    /** Per lookup: where the texture has slid to (wrapped to 0‥1). */
    uCloudOff: { value: LOOKUPS.map(() => new Vector2()) },
    uTime: { value: 0 },
    uNoise: { value: mistNoiseTexture() },
    uMoonMap: { value: moonTexture() },
    uMeteorFrom: { value: new Vector3(1, 0, 0) },
    uMeteorTo: { value: new Vector3(0, 0, -1) },
    uMeteor: { value: new Vector4() },
  };
  // The haze (the sky has no scene fog, so it gets its own fog colour and range).
  const haze = hazeOwnUniforms();
  const fogColor = new Color();
  haze.fogColor.value = fogColor;
  const material = new ShaderMaterial({
    name: 'map sky',
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { ...u, ...haze },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        // On the far plane: behind everything, drawn only where nothing covers it.
        gl_Position.z = gl_Position.w;
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
      uniform vec4 uMoonLight;
      uniform vec4 uWeather;
      uniform vec3 uCloudLit;
      uniform vec3 uCloudBody;
      uniform vec2 uCloudOff[${LOOKUPS.length}];
      uniform float uTime;
      uniform sampler2D uNoise;
      uniform sampler2D uMoonMap;
      varying vec3 vDir;

      ${LOOKUP_GLSL}
      ${METEOR_GLSL}

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
      // A disc in the sky, centre c, angular radius r: x, y across it (−1‥1
      // inside, y up the picture) for direction d. Measured on the picture, so
      // it stays round toward the corners (the lens would stretch it into an egg).
      vec2 discUV(vec3 d, vec3 c, float r) {
        vec3 dv = mat3(viewMatrix) * d;
        vec3 cv = mat3(viewMatrix) * c;
        if (cv.z > -0.05 || dv.z > -0.05) return vec2(1e3);
        return (dv.xy / -dv.z - cv.xy / -cv.z) * (-cv.z / r);
      }
      // The low clouds' body at sheet point q (already bent by the warp): 0‥1.
      float lowClouds(vec2 q) {
        return texture2D(uNoise, CM1 * q + uCloudOff[1]).g * 0.52
          + texture2D(uNoise, CM2 * q + uCloudOff[2]).b * 0.3
          + texture2D(uNoise, CM3 * q + uCloudOff[3]).a * 0.18;
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
        // Below the horizon: the sea of mist (seen from high up, over the sunk
        // backdrop): a mist surface ≈ 20 m up, hazed with its distance as the
        // mist layers over it are, so their far end melts into it.
        vec3 low = mix(haze, hazeMistColor(vec2(1.0, 0.55), haze), hazeHeight.w);
        low = mix(low, haze, hazeDistance(max(cameraPosition.y - 20.0, 1.0) / max(-e, 0.002)));
        col = mix(col, low, smoothstep(0.0, -0.05, e));

        // (the sky without stars: what the moon's dark side shows)
        vec3 bare = col;
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
            col += vec3(0.85, 0.9, 1.0) * b * uAmounts.z * smoothstep(0.02, 0.2, e);
          }
        }
        // Now and then a shooting star.
        if (uMeteor.z > 0.0 && e > 0.0) col += meteorAt(d) * smoothstep(0.0, 0.03, e);

        // Sun disc.
        if (sunA > 0.001) {
          float r = length(discUV(d, uSunDir, 0.024));
          float disc = 1.0 - smoothstep(0.85, 1.0, r);
          col += vec3(1.0, 0.9, 0.68) * 14.0 * disc * sunA;
          col += vec3(1.0, 0.72, 0.42) * 0.9 * exp(-r * 1.6) * sunA;
        }
        // Moon: its face (seas and highlands, a slightly darker limb) under the
        // bloom threshold, so it reads; a bright rim just outside that blooms,
        // and a soft blue halo. Its phase: lit where the sun reaches the sphere;
        // the dark side is just the sky (with no stars: the moon hides them).
        float moonMu = max(dot(d, uMoonDir), 0.0);
        if (moonA > 0.001 && moonMu > 0.99) {
          vec2 q = discUV(d, uMoonDir, ${MOON_RADIUS});
          float r = length(q);
          float aa = clamp(fwidth(r) * 1.5, 0.01, 0.2);
          float disc = 1.0 - smoothstep(1.0 - aa, 1.0, r);
          vec4 face = texture2D(uMoonMap, q * 0.5 + 0.5);
          vec3 albedo = face.r * mix(vec3(0.84, 0.93, 1.06), vec3(0.58, 0.8, 1.2), face.g);
          // The sphere here (x right, y up, z toward us) against the sunlight; near the
          // terminator crater rims catch it first and floors stay dark (face.b: relief).
          vec3 L = uMoonLight.xyz;
          vec3 nrm = vec3(q, sqrt(max(1.0 - dot(q, q), 0.0)));
          float lit = smoothstep(-0.05, 0.1, dot(nrm, L) + (face.b - 0.5) * 0.3 * (1.0 - L.z * L.z));
          vec3 moon = albedo * (1.0 - 0.22 * pow(r, 4.0)) * lit;
          // (the sky's own light lies in front of the lit part: a pale disc by day, bright at night)
          col = mix(col, bare * mix(1.0, 0.4, lit) + moon, disc * moonA);
          float past = max(r - 1.0, 0.0);
          // (the rim and the halo only beside the lit limb, so the dark side's edge never shows; the halo as bright as the moon is full)
          float limb = smoothstep(-0.05, 0.25, dot(vec3(q / max(r, 1e-4) * 0.97, 0.243), L));
          float halo = 0.2 + 0.8 * uMoonLight.w;
          col += (vec3(0.8, 0.9, 1.0) * 1.5 * exp(-past / 0.05) + vec3(0.16, 0.32, 0.8) * 0.35 * halo * exp(-past * 2.4)) * limb * (1.0 - disc) * moonA;
        }

        // Clouds.
        if (e > 0.004) {
          vec2 s = d.xz / (e + ${FLAT});
          // Toward the light (sun by day, moon by night): along the sheet, and how much we look that way (0 away … 1 at it).
          vec3 L = uGlowDir;
          vec2 toLight = L.xz / max(length(L.xz), 1e-3);
          float toward = pow(dot(d, L) * 0.5 + 0.5, 2.5);
          float horizon = 1.0 - smoothstep(0.0, 0.1, e);
          // Far clouds fade into the haze and thin out.
          float fade = smoothstep(0.004, 0.05, e);
          // Light through thin cloud near the sun / moon: a golden or silver
          // lining, and a bright ring of moonlight in veils close to the moon.
          vec3 lining = (uGlow * uAmounts.w * 1.3 + uCloudLit * moonA * 0.5) * pow(mu, 18.0) + vec3(0.55, 0.7, 1.0) * moonA * pow(moonMu, 400.0);

          // High streaks: thin, pale, catching the light.
          float hn = texture2D(uNoise, CM5 * s + uCloudOff[5]).r * 0.6 + texture2D(uNoise, CM6 * s + uCloudOff[6]).g * 0.4;
          float ha = smoothstep(0.56, 0.82, hn) * (0.34 - 0.14 * moonA) * fade;
          vec3 hc = mix(uCloudBody, uCloudLit, 0.3 + 0.6 * toward) + lining * 0.6;
          col = mix(col, mix(hc, haze, horizon * 0.8), ha);
          // Overcast: a grey sheet closes over the sky (under the heaps, thinning into the haze low down).
          float overcast = uWeather.x;
          if (overcast > 0.0) {
            vec3 sheet = mix(uCloudBody, uCloudLit, 0.2 + 0.35 * toward) + lining * 0.3;
            col = mix(col, mix(sheet, haze, horizon * 0.7), overcast * 0.8 * smoothstep(0.004, 0.08, e));
          }

          // Low heaps: a slab of cloud (top 1.35 × as high as the base). Each
          // cloud is as tall as its density is over the threshold. A ray low
          // in the sky meets the base near and the top far, so far clouds
          // show heaped, lit tops over flat, darker bases; overhead we see
          // their undersides. Three steps up through the slab, nearest first.
          vec2 w = (texture2D(uNoise, CM0 * s + uCloudOff[0]).rg - 0.5) * 1.1;
          float cover = mix(texture2D(uNoise, CM4 * s + uCloudOff[4]).r, 1.0, overcast);
          float th = mix(0.65, 0.49, smoothstep(0.25, 0.75, cover)) + horizon * 0.05 - overcast * 0.14;
          // Fine ragged detail (only matters overhead; far off it blurs away).
          float fine = (texture2D(uNoise, CM7 * s + uCloudOff[7]).b - 0.5) * 0.12;
          vec3 cc = vec3(0.0);
          float a = 0.0;
          for (int k = 0; k < 3; k++) {
            float f = float(k) * 0.5;
            vec2 q = s * (1.0 + 0.35 * f) + w;
            float n = lowClouds(q) + fine;
            // Height of the cloud here (0 at its edge, 1 = full slab).
            float h = (n - th) / 0.24;
            float o = smoothstep(f * 0.75 - 0.05, f * 0.75 + 0.4, h);
            vec3 c;
            if (k == 0) {
              // Underside: lit on the edge toward the light (the body thins that way).
              float side = clamp((n - lowClouds(q + toLight * 0.12)) * 6.0 + 0.4, 0.0, 1.0);
              c = mix(uCloudBody, uCloudLit, side * mix(0.12, 0.8, toward));
            } else {
              // Sides and tops catch the light, more toward it.
              c = mix(uCloudBody, uCloudLit, mix(0.1, 0.55, f) + mix(0.1, 0.45, f) * toward);
            }
            c += lining * (1.0 - smoothstep(0.0, 0.6, h));
            cc += (1.0 - a) * o * c;
            a += (1.0 - a) * o;
          }
          cc = mix(cc, haze * a, horizon * 0.65);
          // Only thin veils cross the moon and the sun's disc.
          float veil = 1.0 - 0.55 * moonA * pow(moonMu, 900.0) - 0.5 * sunA * pow(max(dot(d, uSunDir), 0.0), 900.0);
          float k = 0.92 * fade * veil;
          col = col * (1.0 - a * k) + cc * k;
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new Mesh(new SphereGeometry(4000, 48, 24), material);
  mesh.name = 'sky';
  // After the other solid things: the far-plane depth keeps it behind them.
  mesh.renderOrder = 1000;
  mesh.frustumCulled = false;

  const meteors = createMeteors();
  const travel = new Vector2();
  const at = new Vector2();
  const layerAt = new Map<Layer, Vector2>([
    [LOW, new Vector2()],
    [HIGH, new Vector2()],
  ]);
  return {
    mesh,
    update(sky, t, camera, still = false) {
      const cameraPos = camera.position;
      u.uZenith.value.copy(sky.zenith);
      u.uHorizon.value.copy(sky.horizon);
      u.uGlow.value.copy(sky.glow);
      u.uGlowDir.value.copy(sky.glowDir);
      u.uSunDir.value.copy(sky.sunDir);
      u.uMoonDir.value.copy(sky.moonDir);
      u.uAmounts.value.set(sky.sun, sky.moon, sky.stars, sky.glowStrength);
      u.uMoonLight.value.set(sky.moonLight.x, sky.moonLight.y, sky.moonLight.z, sky.moonLit);
      u.uWeather.value.set(sky.cloud, sky.rain, sky.flash, 0);
      const m = meteors.update(t, camera, still ? 0 : sky.stars);
      u.uMeteorFrom.value.copy(m.from);
      u.uMeteorTo.value.copy(m.to);
      u.uMeteor.value.copy(m.info);
      u.uCloudLit.value.copy(sky.cloudLit);
      u.uCloudBody.value.copy(sky.cloudBody);
      u.uTime.value = t;
      // Cloud lookups: each slides by its share of its layer's wind; the
      // camera's own move shifts a layer by move / height (parallax).
      for (const [layer, v] of layerAt) v.set(cameraPos.x / layer.height, cameraPos.z / layer.height);
      LOOKUPS.forEach((l, i) => {
        windTravel(travel, t, l.layer).multiplyScalar(l.wind);
        at.copy(layerAt.get(l.layer)!).sub(travel);
        const m = lookupMatrix(l);
        const x = m[0] * at.x + m[2] * at.y;
        const y = m[1] * at.x + m[3] * at.y;
        u.uCloudOff.value[i].set(x - Math.floor(x), y - Math.floor(y));
      });
      fogColor.copy(sky.haze);
      haze.fogNear.value = sky.hazeNear;
      haze.fogFar.value = sky.hazeFar;
      mesh.position.copy(cameraPos);
    },
  };
}
