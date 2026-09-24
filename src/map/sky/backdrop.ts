import { BufferAttribute, BufferGeometry, Color, Group, Mesh, ShaderMaterial, Vector3 } from 'three';
import { fbm } from '../heightfield';
import { OVERVIEW } from '../layout';
import { HAZE_FUNCS, HAZE_PARS, hazeOwnUniforms } from './haze';
import { SUN_DIR, type SkyState } from './palette';

/**
 * The far backdrop: layers of hills and temple towers beyond the edge of the
 * map, each farther one paler, fading into the haze — the band at the top of
 * the concept art. Every layer is a curtain on a ring around the map, its
 * top a stepped silhouette (flat blocks, like the voxels, only bigger the
 * farther the layer: 6 m near, 16 m far). Temple groups (Angkor prasat
 * towers: a stepped bud on a plinth) stand on some of the ridges. The ridges
 * dip where the sun and moon set, so the discs stay clear. At night a few
 * warm lights burn in the far temples.
 */

interface Layer {
  /** Ring radius (m) around the map centre. */
  r: number;
  /** Width of a column (m), and the height step of the hills (m). */
  col: number;
  step: number;
  /** Ridge height range (m). */
  lo: number;
  hi: number;
  /** Size of the hills along the ring (m). */
  scale: number;
  /** Tree crowns on the ridge line (m high, 0 = none). */
  crowns: number;
  /** Share of haze over the layer (0 = own colour, 1 = the haze). */
  fade: number;
  seed: number;
  /** Temple groups: bearing seen from the overview camera (degrees, + east), towers, width and height (m). */
  temples: { at: number; towers: number; w: number; h: number }[];
}

const LAYERS: Layer[] = [
  { r: 950, col: 4, step: 4, lo: 14, hi: 110, scale: 380, crowns: 8, fade: 0.3, seed: 3, temples: [{ at: -50, towers: 3, w: 120, h: 66 }, { at: 47, towers: 1, w: 44, h: 52 }] },
  { r: 1380, col: 4, step: 6, lo: 24, hi: 170, scale: 480, crowns: 9, fade: 0.5, seed: 5, temples: [{ at: -29, towers: 5, w: 250, h: 104 }, { at: 33, towers: 3, w: 130, h: 70 }] },
  { r: 1950, col: 6, step: 10, lo: 40, hi: 270, scale: 640, crowns: 0, fade: 0.66, seed: 7, temples: [{ at: -12, towers: 5, w: 300, h: 140 }, { at: -64, towers: 3, w: 170, h: 90 }] },
  { r: 2750, col: 10, step: 16, lo: 60, hi: 400, scale: 820, crowns: 0, fade: 0.8, seed: 9, temples: [] },
];

/** Centre of the rings (m) and the arc they cover (radians either side of north). */
const CENTRE = { x: 0, z: -200 };
const ARC = (128 * Math.PI) / 180;

/** Height of a prasat group at offset dx (m) from its centre, 0 outside. */
function templeHeight(dx: number, t: Layer['temples'][number]): number {
  const half = t.w / 2;
  if (Math.abs(dx) > half) return 0;
  // Gallery base along the whole group.
  let h = t.h * 0.22;
  const n = t.towers;
  for (let i = 0; i < n; i++) {
    // Towers spread over the base, the middle one tallest.
    const pos = n === 1 ? 0 : (i / (n - 1) - 0.5) * t.w * 0.74;
    const mid = 1 - Math.abs(i - (n - 1) / 2) / Math.max(1, (n - 1) / 2);
    const th = t.h * (n === 1 ? 1 : 0.7 + 0.3 * mid);
    const tw = n === 1 ? t.w * 0.8 : (t.w / n) * (0.95 + 0.25 * mid);
    const u = Math.abs(dx - pos) / (tw / 2);
    if (u < 1) {
      // A bud (pine cone): a body on a plinth, tapering in a soft curve to a point.
      const body = th * (1 - Math.pow(u, 1.8)) * (1 - 0.25 * u);
      h = Math.max(h, Math.max(body, th * 0.28));
    }
  }
  return h;
}

export interface Backdrop {
  object: Group;
  update(sky: SkyState, t: number): void;
}

export function buildBackdrop(): Backdrop {
  const object = new Group();
  object.name = 'far backdrop';
  const cam = new Vector3(...OVERVIEW.pos);
  const sunBearing = Math.atan2(SUN_DIR.x, -SUN_DIR.z);
  const uniforms = {
    uFar: { value: new Color() },
    uRim: { value: new Color() },
    uGlowDir: { value: new Vector3() },
    uNight: { value: 0 },
  };
  const haze = hazeOwnUniforms();
  const fogColor = new Color();
  haze.fogColor.value = fogColor;
  const material = new ShaderMaterial({
    name: 'far backdrop',
    fog: false,
    uniforms: { ...uniforms, ...haze },
    vertexShader: /* glsl */ `
      attribute vec4 aInfo; // top of the column (m), layer fade, shade, layer's middle height (m)
      varying vec3 vWorld;
      varying vec4 vInfo;
      void main() {
        vInfo = aInfo;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${HAZE_PARS}
      ${HAZE_FUNCS}
      uniform vec3 uFar;
      uniform vec3 uRim;
      uniform vec3 uGlowDir;
      uniform float uNight;
      varying vec3 vWorld;
      varying vec4 vInfo;
      void main() {
        vec3 ray = vWorld - cameraPosition;
        vec3 dir = normalize(ray);
        float fade = vInfo.y;
        // Own colour: dark, a little lighter towards the top, with a rim
        // where the low sun (or the moon) catches the ridge from behind.
        float below = vInfo.x - vWorld.y;
        vec3 col = uFar * vInfo.z * (0.82 + 0.18 * smoothstep(60.0, 0.0, below));
        float back = pow(max(dot(dir, uGlowDir), 0.0), 6.0);
        col += uRim * smoothstep(5.0, 0.0, below) * (0.25 + 1.1 * back);
        // Haze: the layer's share, more towards its foot (mist lies low).
        float foot = 1.0 - smoothstep(0.0, vInfo.w * 0.9, vWorld.y);
        float h = clamp(fade + (1.0 - fade) * foot * 0.85, 0.0, 1.0);
        // (all mist where the sea of mist lies)
        h = max(h, 1.0 - smoothstep(14.0, 34.0, vWorld.y));
        vec3 haze = hazeColorDir(dir);
        vec3 low = mix(haze, hazeMistColor(vec2(1.0, 0.5), haze), 0.7);
        col = mix(col, mix(haze, low, foot), h);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });

  for (const L of LAYERS) {
    const cols = Math.ceil((2 * ARC * L.r) / L.col);
    const pos = new Float32Array(cols * 4 * 3);
    const info = new Float32Array(cols * 4 * 4);
    const index: number[] = [];
    const base = -4;
    const ref = (L.lo + L.hi) / 2;
    for (let j = 0; j < cols; j++) {
      const a0 = -ARC + (j / cols) * 2 * ARC;
      const a1 = -ARC + ((j + 1) / cols) * 2 * ARC;
      const am = (a0 + a1) / 2;
      const s = am * L.r;
      const x = CENTRE.x + Math.sin(am) * L.r;
      const z = CENTRE.z - Math.cos(am) * L.r;
      // Hills: broad swells (fractal noise stretched to its full range) and sharper crests.
      const n = Math.min(1, Math.max(0, (fbm(s / L.scale, L.seed * 13.7, L.seed, 4) - 0.28) / 0.44));
      const ridge = 1 - Math.abs(fbm(s / (L.scale * 0.55), L.seed * 3.1, L.seed + 50, 3) * 2 - 1);
      let h = L.lo + (L.hi - L.lo) * Math.pow(Math.min(1, Math.max(0, n * 0.8 + ridge * 0.35 - 0.12)), 1.25);
      // Tree crowns along the ridge line (jungle).
      if (L.crowns) h += Math.pow(fbm(s / 14, L.seed, L.seed + 90, 2), 1.5) * L.crowns;
      h = Math.round(h / L.step) * L.step;
      // Temples (placed by their bearing from the overview camera), on a flat rise.
      const bearing = Math.atan2(x - cam.x, cam.z - z);
      const dist = Math.hypot(x - cam.x, z - cam.z);
      for (const t of L.temples) {
        const dx = (bearing - (t.at * Math.PI) / 180) * dist;
        const th = templeHeight(dx, t);
        const rise = Math.round((L.lo + (L.hi - L.lo) * 0.3) / L.step) * L.step;
        if (Math.abs(dx) < t.w * 0.75) h = Math.max(h, rise);
        if (th > 0) h = Math.max(h, rise + Math.round(th / 3) * 3);
      }
      // A dip where the sun and moon set (the discs stay clear of the ridges).
      const off = Math.abs(bearing - sunBearing - 0.02);
      const clear = cam.y + dist * (Math.tan(Math.asin(SUN_DIR.y)) - 0.034);
      if (h > clear) h = Math.round((clear + (h - clear) * Math.min(1, Math.max(0, (off - 0.07) / 0.2))) / L.step) * L.step;
      h = Math.max(L.step, h);
      const shade = 0.9 + 0.2 * fbm(s / 60, 1, L.seed + 7, 2);
      const v = j * 4;
      const set = (k: number, a: number, y: number) => {
        pos.set([CENTRE.x + Math.sin(a) * L.r, y, CENTRE.z - Math.cos(a) * L.r], (v + k) * 3);
        info.set([h, L.fade, shade, ref], (v + k) * 4);
      };
      set(0, a0, base);
      set(1, a1, base);
      set(2, a1, h);
      set(3, a0, h);
      index.push(v, v + 1, v + 2, v, v + 2, v + 3);
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(pos, 3));
    geo.setAttribute('aInfo', new BufferAttribute(info, 4));
    geo.setIndex(index);
    geo.computeBoundingSphere();
    const mesh = new Mesh(geo, material);
    mesh.name = `far layer ${L.r} m`;
    mesh.raycast = () => {};
    // Farthest first, so nearer layers cover them (they are opaque anyway).
    mesh.renderOrder = -5 + LAYERS.indexOf(L) * -1;
    object.add(mesh);
  }
  return {
    object,
    update(sky) {
      uniforms.uFar.value.copy(sky.far);
      uniforms.uRim.value.copy(sky.hazeSun).multiplyScalar(0.6);
      uniforms.uGlowDir.value.copy(sky.glowDir);
      uniforms.uNight.value = sky.night;
      fogColor.copy(sky.haze);
      haze.fogNear.value = sky.hazeNear;
      haze.fogFar.value = sky.hazeFar;
    },
  };
}
