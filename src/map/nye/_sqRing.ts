import { AdditiveBlending, CanvasTexture, Color, LinearMipmapLinearFilter, Mesh, PlaneGeometry, ShaderMaterial, Sphere, Vector3 } from 'three';
import { hazeUniforms } from '../sky/haze';

/**
 * The gathering ring of light on the square's floor (AWP-35; plan.ts `RING`): a Khmer lotus mandala in gold,
 * one additive quad lying on the pavers, its pattern painted once on a canvas (the alpha of the lines; no
 * texture file), breathing softly. Thin crisp gold lines (the owner's reference: readable from over the gate, never
 * a blurred disc of light): the petals barely filled, the lines sharp-edged, a faint pool under it. Faint gold by day,
 * at night the lines' brightest parts just reach the bloom; brighter, with a slow light running round it, on the event
 * night (`event` 0‥1).
 *
 * The pattern, from the rim in: a double rim, a band of kbach flame tips, sixteen lotus petals with their veins,
 * a ring of dots, eight inner petals, the lotus heart. One draw; its shader is short (one texture read, the haze).
 */

/** How far the quad reaches past the ring's rim (m: the soft pool of light round it). */
const PAD = 1.4;

export interface NyeRing {
  mesh: Mesh;
  /** Night 0‥1, the event night 0‥1, the clock (s). */
  update(night: number, event: number, t: number): void;
}

export function buildNyeRing(x: number, y: number, z: number, r: number, low: boolean): NyeRing {
  const R = r + PAD;
  const tex = paintMandala(r, R, low ? 512 : 1024);
  const geo = new PlaneGeometry(2 * R, 2 * R);
  geo.rotateX(-Math.PI / 2);
  const u = {
    ...hazeUniforms(),
    uMap: { value: tex },
    uColor: { value: new Color(0xffb848) },
    uLevel: { value: 0 },
    uTime: { value: 0 },
    uEvent: { value: 0 },
    uR: { value: R },
  };
  const material = new ShaderMaterial({
    name: 'nye:ring',
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
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform sampler2D uMap;
      uniform vec3 uColor;
      uniform float uLevel;
      uniform float uTime;
      uniform float uEvent;
      uniform float uR;
      varying vec2 vUv;
      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float d = length(p);
        float lines = texture2D(uMap, vUv).r;
        // (a soft pool of light under the ring, fading out past its rim)
        float pool = 0.025 * (1.0 - smoothstep(0.6, 1.0, d));
        // On the event night a slow light runs round the ring.
        float run = 1.0 + uEvent * 0.45 * sin(atan(p.y, p.x) * 2.0 - uTime * 0.9);
        vec3 col = uColor * (lines * run + pool) * uLevel;
        #ifdef USE_FOG
          vec3 hzRay = vFogWorld - cameraPosition;
          float hzDist = length(hzRay);
          float low = hazeLowAmount(cameraPosition, vFogWorld, hzDist, hazeBanks(vFogWorld.xz).x);
          col *= (1.0 - hazeDistance(hzDist)) * (1.0 - 0.7 * low);
        #endif
        if (max(col.r, max(col.g, col.b)) < 0.002) discard;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new Mesh(geo, material);
  mesh.name = 'nye:ring';
  mesh.position.set(x, y, z);
  mesh.renderOrder = 11;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = () => {};
  geo.boundingSphere = new Sphere(new Vector3(0, 0, 0), R * 1.42);
  return {
    mesh,
    update(night, event, t) {
      const n = Math.min(1, Math.max(0, (night - 0.15) / 0.6));
      // A slow breath (about 6 s), deeper on the event night.
      const breathe = 1 + (0.08 + 0.08 * event) * Math.sin(t * (1.05 + 0.25 * event));
      // Faint gold by day (an inlay catching the light), bright gold lines at night: only their hearts reach the bloom.
      u.uLevel.value = (0.12 + n * n * (1.15 + 0.5 * event)) * breathe;
      u.uTime.value = t % 600;
      u.uEvent.value = event;
      mesh.visible = u.uLevel.value > 0.01;
    },
  };
}

/** The mandala's lines (white on black, soft-edged) on a canvas `px` square: the ring of radius `r` in a square of half side `R` (m). */
function paintMandala(r: number, R: number, px: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = px;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, px, px);
  const k = px / (2 * R);
  const c = px / 2;
  const P = (rad: number, a: number): [number, number] => [c + Math.cos(a) * rad * k, c + Math.sin(a) * rad * k];
  g.strokeStyle = '#fff';
  g.fillStyle = '#fff';
  g.lineJoin = 'round';
  g.lineCap = 'round';
  // (a hair of softness on the lines' edges, no more: they stay crisp from afar)
  g.shadowColor = '#fff';
  g.shadowBlur = px / 700;
  const circle = (rad: number, w: number, alpha = 1) => {
    g.globalAlpha = alpha;
    g.lineWidth = w * k;
    g.beginPath();
    g.arc(c, c, rad * k, 0, Math.PI * 2);
    g.stroke();
  };
  /** A lotus petal (pointed, an ogee tip) at angle `a` from r0 to r1, half as wide as `w` radians at its base. */
  const petal = (a: number, r0: number, r1: number, w: number) => {
    const L = r1 - r0;
    g.beginPath();
    g.moveTo(...P(r0, a - w));
    g.bezierCurveTo(...P(r0 + 0.45 * L, a - w * 1.25), ...P(r0 + 0.8 * L, a - w * 0.55), ...P(r1, a));
    g.bezierCurveTo(...P(r0 + 0.8 * L, a + w * 0.55), ...P(r0 + 0.45 * L, a + w * 1.25), ...P(r0, a + w));
  };
  const s = r / 8.5;
  // The rim: a bold line and a thin one inside it.
  circle(r, 0.24 * s);
  circle(r - 0.45 * s, 0.08 * s, 0.8);
  // Kbach flame tips round the band, pointing out.
  const tips = 40;
  for (let i = 0; i < tips; i++) {
    const a = (i / tips) * Math.PI * 2;
    petal(a, r - 1.45 * s, r - 0.6 * s, (Math.PI / tips) * 0.8);
    g.globalAlpha = 0.9;
    g.lineWidth = 0.07 * s * k;
    g.stroke();
    g.globalAlpha = 0.05;
    g.fill();
  }
  circle(r - 1.6 * s, 0.1 * s, 0.9);
  // Sixteen lotus petals, each with its vein, a faint fill.
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.5) / n) * Math.PI * 2;
    petal(a, 3.4 * s, r - 1.85 * s, (Math.PI / n) * 0.92);
    g.globalAlpha = 0.06;
    g.fill();
    g.globalAlpha = 1;
    g.lineWidth = 0.13 * s * k;
    g.stroke();
    petal(a, 3.9 * s, r - 2.6 * s, (Math.PI / n) * 0.5);
    g.globalAlpha = 0.6;
    g.lineWidth = 0.06 * s * k;
    g.stroke();
    // (a dot between two petals)
    const [dx, dy] = P(3.35 * s, (i / n) * Math.PI * 2);
    g.globalAlpha = 0.9;
    g.beginPath();
    g.arc(dx, dy, 0.14 * s * k, 0, Math.PI * 2);
    g.fill();
  }
  circle(3.1 * s, 0.1 * s, 0.85);
  // Eight inner petals.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    petal(a, 1.6 * s, 2.95 * s, (Math.PI / 8) * 0.85);
    g.globalAlpha = 0.08;
    g.fill();
    g.globalAlpha = 0.95;
    g.lineWidth = 0.1 * s * k;
    g.stroke();
  }
  // The lotus heart: a circle, eight small petals, a bright seed head.
  circle(1.45 * s, 0.09 * s, 0.9);
  for (let i = 0; i < 8; i++) {
    petal(((i + 0.5) / 8) * Math.PI * 2, 0.45 * s, 1.3 * s, (Math.PI / 8) * 0.8);
    g.globalAlpha = 0.2;
    g.fill();
    g.globalAlpha = 0.9;
    g.lineWidth = 0.06 * s * k;
    g.stroke();
  }
  g.globalAlpha = 1;
  g.beginPath();
  g.arc(c, c, 0.38 * s * k, 0, Math.PI * 2);
  g.fill();
  const tex = new CanvasTexture(canvas);
  tex.name = 'nye ring';
  tex.minFilter = LinearMipmapLinearFilter;
  tex.anisotropy = 8;
  return tex;
}
