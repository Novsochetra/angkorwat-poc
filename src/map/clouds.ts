import { BackSide, Color, Group, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, ShaderMaterial, SphereGeometry, Vector2, Vector3 } from 'three';
import { hash3 } from '../voxel/random';
import { MAP_BOUNDS } from './layout';
import { buildBackdrop, RING_CENTRE } from './sky/backdrop';
import { HAZE, HAZE_FUNCS, HAZE_PARS, hazeUniforms, WIND } from './sky/haze';
import { MIST_WET, mistBankMaterial, mistLayerMaterial } from './sky/mist';
import { mistNoiseTexture } from './sky/noise';
import { SKY } from './sky/palette';
import type { MapContext, MapFrame, MapPart } from './types';

/**
 * Mist: the sea of cloud the mesas rise from, banks drifting between them,
 * and far silhouettes (hills and temple towers) fading into the haze. All of
 * it is alive — calm, but it moves while you watch: the mist drifts west
 * with the wind (`WIND`, sky/haze.ts), rolls and breathes, nearer mist a
 * little faster than far mist. Everything runs on `f.drift`, so it stands
 * still under "reduce motion".
 *
 * - The mist between the mesas is part of the haze (sky/haze.ts): every
 *   material fogs itself with banks of valley mist, so trees and cliffs
 *   stand in it with soft feet and no cut lines. Its banks drift (≈ 2 m/s),
 *   roll and swell, thicken towards the side and back edges of the land
 *   (where the sinking land's end drowns in it), and keep off the road and
 *   the places (the land map, sky/mist.ts). Seen from low down it stays
 *   clear near the eye. Above it, wisps drift a little faster (≈ 27 m up,
 *   over the valley trees). The haze also carries soft cloud shadows over
 *   the land by day (set here, {@link SHADE}).
 * - Far backdrop (sky/backdrop.ts): four rings of hills and prasat towers
 *   all round the map, paler with distance.
 * - Sea of mist beyond the land: five stacked planes (10–29 m) sharing one
 *   noise field that flows (≈ 3 m/s) and rolls; each higher one keeps only
 *   the thicker parts, so they build soft mounds. Clear over the land.
 * - Banks: soft upright puffs along the map's side and back edges (so no cut
 *   land shows; they sway on their posts), beyond the front edge (seen when
 *   roaming looks south), and far out between the backdrop rings, where they
 *   drift slowly round the rings with long thin wisps between them. The
 *   mist inside every bank streams and rises, so its edges billow. One
 *   instanced draw, sorted back to front.
 *
 * Weather (`f.weather`, sky/weather.ts):
 * - Rain clouds ({@link rainDeck}): as a shower comes, low dark clouds build
 *   under the sky's own (which the atmosphere greys over): a few ragged
 *   heaps, then more, darker and closer together until they close over,
 *   with torn scud below them hurrying on the wind; lightning lights them
 *   from inside, brightest where it struck. One draw at the far plane, only
 *   while there are any.
 * - Cloud shadows: more of them, darker, as the clouds build; gone when it
 *   is overcast (then the whole light dims: the atmosphere).
 * - After rain (`wet`) the mist lies thicker and a little lower: the sea of
 *   mist sinks a few metres and fills in, the banks thicken and settle.
 */

/** Mist planes (m). */
const LAYER_Y = [10, 14, 18, 23, 29];

/** Cloud shadows by day: darkening, patch size (m), cover (0‥1, higher = fewer). */
const SHADE = { amount: 0.14, size: 1100, cover: 0.48 };
/** After rain: how far the sea of mist sinks (m) and the banks settle (share of their height). */
const WET_SINK = 4;
const WET_SETTLE = 0.12;

interface Bank {
  /** Resting base centre (m). */
  x: number;
  y: number;
  z: number;
  /** Width, height (m). */
  w: number;
  h: number;
  seed: number;
  /** 0 = a round puff ‥ 1 = a long thin wisp. */
  wisp: number;
  /** How fast the mist rolls through it (m/s). */
  roll: number;
  alpha: number;
  /** Sways back and forth along the wind (m either way): it stays on its post. */
  sway: number;
  /** Drifts round the backdrop rings (rad/s; 0 = stays), on a ring of radius r (m) from angle a. */
  orbit: number;
  r: number;
  a: number;
}

export function buildClouds(ctx: MapContext): MapPart {
  const field = ctx.field;
  const object = new Group();
  object.name = 'clouds';

  const backdrop = buildBackdrop();
  object.add(backdrop.object);

  // ── Sea of mist ─────────────────────────────────────────────────────────
  const plane = new PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2);
  const layers = LAYER_Y.map((y, i) => {
    const mesh = new Mesh(plane, mistLayerMaterial(y, i / (LAYER_Y.length - 1)));
    mesh.name = `mist ${y} m`;
    mesh.position.set(0, y, -300);
    mesh.renderOrder = 2 + i;
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    object.add(mesh);
    return mesh;
  });

  // ── Banks ───────────────────────────────────────────────────────────────
  const banks: Bank[] = [];
  const rnd = (a: number, b: number, s: number) => hash3(Math.round(a * 7), Math.round(b * 7), s, 9173);
  /** Highest ground within r of (x, z) (sampled on a ring and the centre). */
  const maxAround = (x: number, z: number, r: number) => {
    let h = field.heightAt(x, z);
    for (let a = 0; a < 12; a++) {
      const t = (a / 12) * Math.PI * 2;
      h = Math.max(h, field.heightAt(x + Math.cos(t) * r, z + Math.sin(t) * r), field.heightAt(x + Math.cos(t) * r * 0.5, z + Math.sin(t) * r * 0.5));
    }
    return h;
  };
  const still = { orbit: 0, r: 0, a: 0 };

  // Along the side and back edges: tall where the land is high at the edge.
  const edgeRuns: [number, number, number, number][] = [
    [MAP_BOUNDS.x0, MAP_BOUNDS.z0, MAP_BOUNDS.x1, MAP_BOUNDS.z0],
    [MAP_BOUNDS.x0, MAP_BOUNDS.z0, MAP_BOUNDS.x0, -240],
    [MAP_BOUNDS.x1, MAP_BOUNDS.z0, MAP_BOUNDS.x1, -240],
  ];
  for (const [xa, za, xb, zb] of edgeRuns) {
    const len = Math.hypot(xb - xa, zb - za);
    for (let s = 0; s <= len; s += 58) {
      const t = s / len;
      const x = xa + (xb - xa) * t + (rnd(s, xa, 1) - 0.5) * 30;
      const z = za + (zb - za) * t + (rnd(s, za, 2) - 0.5) * 30;
      const ground = maxAround(Math.min(MAP_BOUNDS.x1 - 2, Math.max(MAP_BOUNDS.x0 + 2, x)), Math.max(MAP_BOUNDS.z0 + 2, z), 50);
      const h = Math.max(40, ground + 20 + rnd(s, 3, 3) * 18);
      const seed = rnd(s, 5, 5);
      banks.push({ x, y: -8, z, w: Math.max(h * 1.6, 120 + rnd(s, 4, 4) * 90), h: h + 8, seed, wisp: 0, roll: 2.5 + rnd(s, 6, 6) * 1.5, alpha: 0.95, sway: 12 + seed * 14, ...still });
    }
  }

  // Beyond the front edge (below the overview camera's view): banks rising
  // from the sea of mist, so the land's end reads as its shore when roaming
  // looks south.
  for (let x = MAP_BOUNDS.x0 - 40; x <= MAP_BOUNDS.x1 + 40; x += 75) {
    const seed = rnd(x, 7, 7);
    banks.push({ x: x + (rnd(x, 8, 8) - 0.5) * 30, y: 0, z: MAP_BOUNDS.z1 + 90 + rnd(x, 9, 9) * 70, w: 150 + rnd(x, 10, 10) * 90, h: 50 + seed * 20, seed, wisp: 0, roll: 3, alpha: 0.95, sway: 15, ...still });
  }

  // Far out, between the backdrop rings, all the way round (cloud layers
  // towards the horizon): banks, and long thin wisps drifting between them.
  // They drift slowly round the rings, westward in the north (with the wind):
  // farther rings slower.
  for (const [r, wide, tall, speed] of [
    [760, 260, 45, 3.2],
    [1150, 380, 60, 3.6],
    [1650, 520, 80, 4],
    [2300, 700, 100, 4.4],
  ] as const) {
    const step = (wide * 0.55) / r;
    const n = Math.round((Math.PI * 2) / step);
    for (let i = 0; i < n; i++) {
      const a = ((i + (rnd(i, r, 41) - 0.5) * 0.6) / n) * Math.PI * 2;
      const seed = rnd(i, r, 44);
      banks.push({ x: 0, y: 0, z: 0, w: wide * (0.7 + rnd(i, r, 42) * 0.6), h: tall * (0.8 + rnd(i, r, 43) * 0.8), seed, wisp: 0, roll: speed * 1.4, alpha: 0.85, sway: 0, orbit: -speed / r, r, a });
      // A wisp between this ring and the next, now and then.
      if (rnd(i, r, 45) < 0.45) {
        const rw = r * 1.2 + rnd(i, r, 46) * r * 0.1;
        const aw = a + Math.PI / n;
        banks.push({ x: 0, y: 12 + rnd(i, r, 47) * tall * 0.3, z: 0, w: wide * (0.9 + rnd(i, r, 48) * 0.8), h: tall * 0.28, seed: rnd(i, r, 49), wisp: 1, roll: speed * 2, alpha: 0.7, sway: 0, orbit: (-speed * 1.25) / rw, r: rw, a: aw });
      }
    }
  }

  const quad = new PlaneGeometry(1, 1);
  const geo = new InstancedBufferGeometry();
  geo.index = quad.index;
  geo.setAttribute('position', quad.getAttribute('position'));
  const aCentre = new InstancedBufferAttribute(new Float32Array(banks.length * 3), 3);
  const aSize = new InstancedBufferAttribute(new Float32Array(banks.length * 2), 2);
  const aSeed = new InstancedBufferAttribute(new Float32Array(banks.length * 4), 4);
  geo.setAttribute('aCentre', aCentre);
  geo.setAttribute('aSize', aSize);
  geo.setAttribute('aSeed', aSeed);
  geo.instanceCount = banks.length;
  const bankMesh = new Mesh(geo, mistBankMaterial());
  bankMesh.name = 'mist banks';
  bankMesh.frustumCulled = false;
  bankMesh.renderOrder = 10;
  bankMesh.raycast = () => {};
  object.add(bankMesh);

  // Where each bank is now (x, y, z, w, h), and the draw order.
  const now = new Float32Array(banks.length * 5);
  const order = banks.map((_, i) => i);
  const dist = new Float32Array(banks.length);
  let lastT = NaN;
  function place(t: number): void {
    banks.forEach((b, i) => {
      let x = b.x;
      let z = b.z;
      if (b.orbit) {
        const a = b.a + t * b.orbit;
        x = RING_CENTRE.x + Math.sin(a) * b.r;
        z = RING_CENTRE.z - Math.cos(a) * b.r;
      } else {
        // Back and forth along the wind (a minute or two each way).
        const s = Math.sin(t * (0.05 + b.seed * 0.03) + b.seed * 6.28) * b.sway;
        x += WIND.x * s;
        z += WIND.z * s;
      }
      // Breathing: a bank swells and settles.
      const k = i * 5;
      now[k] = x;
      now[k + 1] = b.y;
      now[k + 2] = z;
      now[k + 3] = b.w * (1 + 0.05 * Math.sin(t * 0.17 + b.seed * 11));
      now[k + 4] = b.h * (1 + 0.1 * Math.sin(t * 0.21 + b.seed * 17));
    });
  }
  /** Back to front for the camera (they blend over each other); `settle` lowers their tops (after rain). */
  function sortBanks(cam: { x: number; y: number; z: number }, settle: number): void {
    for (let i = 0; i < banks.length; i++) {
      const k = i * 5;
      dist[i] = (now[k] - cam.x) ** 2 + (now[k + 1] + now[k + 4] * 0.4 - cam.y) ** 2 + (now[k + 2] - cam.z) ** 2;
    }
    order.sort((a, b) => dist[b] - dist[a]);
    order.forEach((bi, i) => {
      const b = banks[bi];
      const k = bi * 5;
      aCentre.setXYZ(i, now[k], now[k + 1], now[k + 2]);
      aSize.setXY(i, now[k + 3], now[k + 4] * (1 - settle));
      aSeed.setXYZW(i, b.seed, b.wisp, b.roll, b.alpha);
    });
    aCentre.needsUpdate = aSize.needsUpdate = aSeed.needsUpdate = true;
  }

  // ── Rain clouds ──────────────────────────────────────────────────────────
  const deck = rainDeck(ctx);
  object.add(deck.mesh);

  return {
    name: 'clouds',
    object,
    update(f: MapFrame) {
      const w = f.weather;
      backdrop.update(SKY, f.drift);
      if (f.drift !== lastT) {
        lastT = f.drift;
        place(f.drift);
      }
      sortBanks(f.camera.position, WET_SETTLE * w.wet);
      // After rain the sea of mist lies a little lower and thicker.
      MIST_WET.value = w.wet;
      for (let i = 0; i < layers.length; i++) {
        const y = LAYER_Y[i] - WET_SINK * w.wet;
        layers[i].position.y = y;
        (layers[i].material as ShaderMaterial).uniforms.uY.value = y;
      }
      // Cloud shadows by day only (the moon's would be too faint to read): more and darker as
      // the clouds build, gone under a closed sky (then all the light dims instead).
      const day = 1 - Math.min(1, Math.max(0, (f.night - 0.1) / 0.4));
      const c = w.cloud;
      const broken = Math.min(1, c / 0.5) * (1 - smooth01((c - 0.6) / 0.35));
      HAZE.shade.set(SHADE.amount * day * day * (1 + 1.3 * broken) * (1 - smooth01((c - 0.6) / 0.35)), 1 / SHADE.size, SHADE.cover - 0.2 * broken);
      deck.update(f);
    },
  };
}

const smooth01 = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/** A deck's sheet: a direction d meets it at s = d.xz / (d.y + DECK_FLAT) (lower and closer than the sky's: squeezed more at the horizon). */
const DECK_FLAT = 0.1;
/** How high the deck is (m): the camera's move shifts it by move / height. */
const DECK_HEIGHT = 650;
/** Noise lookups: scale (texture units per sheet unit) and share of the wind (the scud runs ahead). */
const DECK_LOOKUPS = [
  { scale: 0.03, wind: 0.5 },
  { scale: 0.075, wind: 1 },
  { scale: 0.19, wind: 1.1 },
  { scale: 0.3, wind: 1.9 },
];

/**
 * Low rain clouds: a shell round the camera drawn at the far plane (like the
 * sky dome: only where no land or backdrop covers it), transparent over the
 * sky. `f.weather.cloud` sets how much of the sky they cover (a few heaps …
 * closed), `storm` how dark their cores are; they drift with the wind
 * (`wind`, `windDir`), the scud under them faster; `flash` lights them from
 * inside round where the lightning struck (`flashX`, `flashZ`). Colours from
 * the sky's own clouds (sky/palette.ts, already greyed by the rain there),
 * darker; at the horizon they melt into the haze.
 */
function rainDeck(ctx: MapContext): { mesh: Mesh; update(f: MapFrame): void } {
  const u = {
    uCover: { value: 0 },
    uStorm: { value: 0 },
    uBody: { value: new Color() },
    uLit: { value: new Color() },
    uGlowDir: { value: new Vector3(0, 1, 0) },
    uFlash: { value: 0 },
    uFlashDir: { value: new Vector3(0, 1, 0) },
    uOff: { value: DECK_LOOKUPS.map(() => new Vector2()) },
    uNoise: { value: mistNoiseTexture() },
  };
  const S = DECK_LOOKUPS.map((l) => l.scale.toFixed(3));
  const material = new ShaderMaterial({
    name: 'rain clouds',
    side: BackSide,
    transparent: true,
    depthWrite: false,
    fog: true,
    uniforms: { ...hazeUniforms(), ...u },
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
      uniform float uCover;
      uniform float uStorm;
      uniform vec3 uBody;
      uniform vec3 uLit;
      uniform vec3 uGlowDir;
      uniform float uFlash;
      uniform vec3 uFlashDir;
      uniform vec2 uOff[${DECK_LOOKUPS.length}];
      uniform sampler2D uNoise;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float e = d.y;
        if (e < -0.01) discard;
        vec2 s = d.xz / (max(e, 0.0) + ${DECK_FLAT.toFixed(2)});
        // Slow swirls bend the heaps a little.
        vec2 w = (texture2D(uNoise, s * ${S[0]} + uOff[0]).rg - 0.5) * 1.4;
        vec2 q = s + w;
        // Heaped clouds: big lumps with billowy edges.
        float n = texture2D(uNoise, q * ${S[1]} + uOff[1]).r * 0.6 + texture2D(uNoise, q * ${S[2]} + uOff[2]).a * 0.4;
        // The same a little toward the light: the side facing it is lit, the far side in shade.
        vec2 toLight = uGlowDir.xz / max(length(uGlowDir.xz), 1e-3);
        vec2 ql = q + toLight * 0.35;
        float nl = texture2D(uNoise, ql * ${S[1]} + uOff[1]).r * 0.6 + texture2D(uNoise, ql * ${S[2]} + uOff[2]).a * 0.4;
        // A few ragged heaps at first, more and more until they close over.
        float th = mix(0.84, 0.22, uCover);
        float heap = smoothstep(th - 0.03, th + 0.07, n);
        // Torn scud below them, hurrying on the wind.
        // (overhead only: squeezed toward the horizon they would be specks)
        float scud = smoothstep(0.58, 0.85, texture2D(uNoise, q * ${S[3]} + uOff[3]).b) * smoothstep(0.35, 0.8, uCover) * smoothstep(0.12, 0.35, e);
        float a = max(heap * (0.8 + 0.2 * smoothstep(th, th + 0.2, n)), scud * 0.7) * smoothstep(0.08, 0.3, uCover);
        // Dark, heavy bases (darker in their thick cores and in a storm), their edges and the side toward the light paler.
        float thick = smoothstep(th, th + 0.3, n);
        float lit = clamp(0.45 + (nl - n) * 5.0, 0.0, 1.0);
        float toward = pow(max(dot(d, uGlowDir), 0.0), 4.0);
        vec3 col = mix(uBody, uLit, clamp(lit * (1.0 - 0.6 * thick) + 0.3 * toward, 0.0, 1.0));
        col *= 1.0 - 0.35 * uStorm * thick;
        col = mix(col, uBody * 0.85, scud * (1.0 - heap));
        // Far off they melt into the haze.
        vec3 haze = hazeColorDir(d);
        col = mix(col, haze, (1.0 - smoothstep(0.0, 0.12, e)) * 0.55);
        a *= smoothstep(-0.005, 0.03, e);
        // Lightning lights them from inside, brightest round where it struck.
        float mu = max(dot(d, uFlashDir), 0.0);
        col += vec3(0.78, 0.82, 1.0) * uFlash * (0.12 + 3.0 * pow(mu, 14.0)) * (0.25 + 0.75 * thick);
        gl_FragColor = vec4(col, a * 0.95);
      }`,
  });
  const mesh = new Mesh(new SphereGeometry(3000, 32, 16), material);
  mesh.name = 'rain clouds';
  mesh.frustumCulled = false;
  // (first of the see-through things: the rainbow, mist and rain go over it)
  mesh.renderOrder = 0;
  mesh.raycast = () => {};
  let compiled = false;
  mesh.onAfterRender = () => void (compiled = true);

  // Where the wind has carried the deck (sheet units = m / height).
  const travel = new Vector2();
  const grey = new Color();
  return {
    mesh,
    update(f: MapFrame) {
      const w = f.weather;
      const speed = (3 + 12 * w.wind) / DECK_HEIGHT;
      const vx = Math.sin(w.windDir) * speed;
      const vz = Math.cos(w.windDir) * speed;
      if (ctx.shot) travel.set(vx * f.t, vz * f.t);
      else travel.set(travel.x + vx * f.dt, travel.y + vz * f.dt);
      const on = w.cloud > 0.08;
      mesh.visible = on || !compiled;
      if (!mesh.visible) return;
      mesh.position.copy(f.camera.position);
      const cam = f.camera.position;
      for (let i = 0; i < DECK_LOOKUPS.length; i++) {
        const l = DECK_LOOKUPS[i];
        const x = (cam.x / DECK_HEIGHT - travel.x * l.wind) * l.scale;
        const y = (cam.z / DECK_HEIGHT - travel.y * l.wind) * l.scale;
        u.uOff.value[i].set(x - Math.floor(x), y - Math.floor(y));
      }
      u.uCover.value = on ? w.cloud : 0;
      u.uStorm.value = w.storm;
      // The sky's cloud colours (greyed by the rain there), darker and duller: rain-laden.
      const b = SKY.cloudBody;
      grey.setScalar(0.3 * b.r + 0.5 * b.g + 0.2 * b.b);
      u.uBody.value.copy(b).lerp(grey, 0.4).multiplyScalar(0.55);
      u.uLit.value.copy(SKY.cloudLit).lerp(SKY.haze, 0.5).multiplyScalar(0.85);
      u.uGlowDir.value.copy(SKY.glowDir);
      u.uFlash.value = w.flash;
      u.uFlashDir.value.set(w.flashX - cam.x, DECK_HEIGHT + 150 - cam.y, w.flashZ - cam.z).normalize();
    },
  };
}
