import { HalfFloatType, MathUtils, ShaderMaterial, Vector2, Vector3, WebGLRenderTarget } from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { graphicsNow, samplesAt } from './graphics';
import { SKY } from './sky/palette';
import type { MapContext, MapFrame } from './types';

/**
 * The finished picture:
 *  1. the scene into a half-float target (multisampled),
 *  2. bloom: everything above {@link BLOOM_THRESHOLD} in linear light glows
 *     softly (sun, moon, lamps, beacons, the road light); half resolution,
 *  3. grade (still linear): warm golden highlights and lavender shadows by
 *     day, cool blue by night, pale gold over cool blue at dawn, greyer in
 *     the rain, a touch of contrast, a soft vignette and a faint blur along
 *     the top edge (tilt-shift: the far hills look far),
 *  4. OutputPass: tone mapping (the renderer's, Neutral) and sRGB.
 */
export interface MapPost {
  render(f: MapFrame): void;
  setSize(width: number, height: number): void;
}

/** Linear brightness where bloom starts (it is full by +0.6 above). Glowing things should go above it at night. */
export const BLOOM_THRESHOLD = 1.0;

const GradeShader = {
  name: 'MapGrade',
  uniforms: {
    tDiffuse: { value: null },
    uTexel: { value: new Vector2(1, 1) },
    uBalance: { value: new Vector3(1, 1, 1) },
    uShadowTint: { value: new Vector3(1, 1, 1) },
    uHighTint: { value: new Vector3(1, 1, 1) },
    uSaturation: { value: 1 },
    uContrast: { value: 1 },
    uVignette: { value: 0.3 },
    uTilt: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uTexel;
    uniform vec3 uBalance;
    uniform vec3 uShadowTint;
    uniform vec3 uHighTint;
    uniform float uSaturation;
    uniform float uContrast;
    uniform float uVignette;
    uniform float uTilt;
    varying vec2 vUv;

    // (a broken pixel from anywhere shows black here, and spreads nowhere)
    vec3 clean(vec3 c) {
      return (any(isnan(c)) || any(isinf(c))) ? vec3(0.0) : min(c, vec3(60.0));
    }

    void main() {
      vec3 c = clean(texture2D(tDiffuse, vUv).rgb);
      // Tilt-shift: a soft blur that grows towards the top edge only.
      float r = uTilt * smoothstep(0.8, 1.0, vUv.y);
      if (r > 0.35) {
        vec3 sum = c;
        float n = 1.0;
        for (int i = 0; i < 12; i++) {
          float fi = float(i);
          float a = fi * 2.39996;
          float d = sqrt((fi + 0.5) / 12.0) * r;
          sum += clean(texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * d * uTexel).rgb);
          n += 1.0;
        }
        c = sum / n;
      }
      c *= uBalance;
      // Split tone: shadows and highlights each lean their own way.
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c *= mix(uShadowTint, uHighTint, smoothstep(0.02, 0.6, l / (l + 0.18)));
      l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = max(mix(vec3(l), c, uSaturation), 0.0);
      // Contrast around middle grey, in log space.
      c = 0.18 * pow(c / 0.18 + 1e-5, vec3(uContrast));
      // Vignette: soft, wider than tall.
      vec2 q = (vUv - 0.5) * vec2(1.0, 0.8);
      c *= 1.0 - uVignette * smoothstep(0.18, 0.62, dot(q, q) * 2.0);
      gl_FragColor = vec4(c, 1.0);
    }`,
};

interface Grade {
  /** White balance, shadow and highlight tints: linear multipliers (kept at the same brightness). */
  balance: [number, number, number];
  shadow: [number, number, number];
  high: [number, number, number];
  saturation: number;
  contrast: number;
  vignette: number;
  bloom: number;
}
/** Grade keys: golden hour, moonlit night and dawn (cool shadows, pale gold highlights, soft). */
const DAY_GRADE: Grade = { balance: [1, 1, 1], shadow: [0.96, 0.97, 1.08], high: [1.05, 1.0, 0.93], saturation: 1.12, contrast: 1.08, vignette: 0.22, bloom: 0.5 };
const NIGHT_GRADE: Grade = { balance: [0.97, 1, 1.04], shadow: [0.92, 0.98, 1.12], high: [1.04, 1.0, 0.94], saturation: 1.06, contrast: 1.06, vignette: 0.32, bloom: 0.8 };
const DAWN_GRADE: Grade = { balance: [0.98, 0.995, 1.03], shadow: [0.95, 0.96, 1.1], high: [1.05, 1.01, 0.95], saturation: 1.06, contrast: 1.03, vignette: 0.24, bloom: 0.62 };
const mixGrade = (out: Grade, a: Grade, b: Grade, t: number): Grade => {
  for (const k of ['balance', 'shadow', 'high'] as const) for (let i = 0; i < 3; i++) out[k][i] = a[k][i] + (b[k][i] - a[k][i]) * t;
  for (const k of ['saturation', 'contrast', 'vignette', 'bloom'] as const) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
};

export function createPost(ctx: MapContext): MapPost {
  const { renderer, scene, camera } = ctx;
  // Multisampling: the voxel edges crawl without it. Fewer samples on dense screens (graphics.ts: none on low).
  const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: samplesAt(graphicsNow, renderer.getPixelRatio()) });
  target.texture.name = 'map scene';
  const composer = new EffectComposer(renderer, target);

  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new Vector2(256, 256), 0.6, 0.55, BLOOM_THRESHOLD);
  // A soft knee (glow grows from the threshold over the next 0.6), and a
  // guard: one broken pixel (NaN, or past half-float range) must not spread
  // over the whole picture.
  const highPass = bloom as unknown as { highPassUniforms: Record<string, { value: number }>; materialHighPassFilter: ShaderMaterial };
  highPass.highPassUniforms.smoothWidth.value = 0.6;
  highPass.materialHighPassFilter.fragmentShader = /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 defaultColor;
    uniform float defaultOpacity;
    uniform float luminosityThreshold;
    uniform float smoothWidth;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      c = (any(isnan(c)) || any(isinf(c))) ? vec3(0.0) : min(c, vec3(60.0));
      float v = luminance(c);
      float alpha = smoothstep(luminosityThreshold, luminosityThreshold + smoothWidth, v);
      gl_FragColor = mix(vec4(defaultColor, defaultOpacity), vec4(c, 1.0), alpha);
    }`;
  composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  composer.addPass(new OutputPass());

  const setSize = (w: number, h: number) => {
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    grade.uniforms.uTexel.value.set(1 / (w * renderer.getPixelRatio()), 1 / (h * renderer.getPixelRatio()));
  };
  const size = renderer.getSize(new Vector2());
  setSize(size.x, size.y);

  const tint = (out: Vector3, a: number[], b: number[], t: number) => {
    out.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    // (a tint, not a dimmer: same brightness)
    out.divideScalar(out.x * 0.2126 + out.y * 0.7152 + out.z * 0.0722);
  };

  const g: Grade = mixGrade({ balance: [1, 1, 1], shadow: [1, 1, 1], high: [1, 1, 1], saturation: 1, contrast: 1, vignette: 0, bloom: 0 }, DAY_GRADE, DAY_GRADE, 0);
  const one = [1, 1, 1];

  /** The graphics level's multisampling (it changes with the level and the pixel ratio): the targets are made again. */
  const matchSamples = () => {
    const samples = samplesAt(graphicsNow, renderer.getPixelRatio());
    if (composer.renderTarget1.samples === samples) return;
    for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
      rt.samples = samples;
      rt.dispose();
    }
  };

  return {
    render(f: MapFrame) {
      matchSamples();
      const n = MathUtils.smoothstep(f.night, 0, 1);
      const u = grade.uniforms;
      // Day ↔ night, leaning to the dawn grade on the morning side (SKY.dawn: its share of the sky's blend).
      mixGrade(g, DAY_GRADE, NIGHT_GRADE, n);
      if (SKY.dawn > 0) mixGrade(g, g, DAWN_GRADE, SKY.dawn);
      // Rain: greyer, flatter.
      const wet = SKY.rain;
      tint(u.uBalance.value, g.balance, one, 0);
      tint(u.uShadowTint.value, g.shadow, one, 0);
      tint(u.uHighTint.value, g.high, one, wet * 0.6);
      u.uSaturation.value = g.saturation * (1 - 0.22 * wet);
      u.uContrast.value = g.contrast * (1 - 0.03 * wet);
      u.uVignette.value = g.vignette + 0.06 * wet;
      // Blur radius at the very top (px): only in the wide views. Glow and blur are off on the low graphics level.
      u.uTilt.value = graphicsNow.glow ? 2.2 * renderer.getPixelRatio() : 0;
      bloom.enabled = graphicsNow.glow;
      bloom.strength = g.bloom;
      renderer.toneMappingExposure = SKY.exposure || 1;
      composer.render(f.dt);
    },
    setSize,
  };
}
