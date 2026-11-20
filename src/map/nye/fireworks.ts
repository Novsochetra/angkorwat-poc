import {
  AdditiveBlending,
  BufferAttribute,
  Color,
  DoubleSide,
  DataTexture,
  FloatType,
  Group,
  InstancedBufferGeometry,
  Mesh,
  NearestFilter,
  PlaneGeometry,
  RGBAFormat,
  ShaderMaterial,
  Sphere,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { graphicsNow } from '../graphics';
import { PX_SCALE, view } from '../resolution';
import { hazeUniforms } from '../sky/haze';
import { addLamp } from '../sky/lampSlots';
import type { GraphicsLevel, MapContext, MapFrame, MapPart } from '../types';
import { showTime } from './clock';
import { KIND_INDEX, ROW, SEGS, SKY_FRAGMENT, SKY_VERTEX, WATER_FRAGMENT, WATER_VERTEX } from './_fwShaders';
import { SQUARE } from './plan';
import { burstAt, burstLight, burstPower, isGlitter, rocketsBetween, showScript, SHOW_COLOURS, type BurstKind, type ShowColour } from './show';

/**
 * The New Year's Eve fireworks (AWP-35): the show's script (show.ts) drawn over Phnom Kulen's east flank, played
 * from the real clock (clock.ts `showTime`; `fireworks=<s>` holds it at second s in a shot).
 *
 * GPU-driven: each frame the rockets in the air (launched, their sparks, glow or smoke not yet gone) go into a
 * small float texture, a line each (`_fwShaders.ts`: where it bursts, when, its kind, colours, size, seed); every
 * spark is placed in the vertex shader from its rocket's line, its index and the time (ballistic with drag and
 * gravity: nothing per spark on the CPU, so a held moment looks as it would live). Three draws:
 *  - the sparks: `PER[level]` instances a rocket (each its spark count at this level, the rest hidden), a ribbon
 *    streaked along its path for its trail (a willow's long and bending as it droops);
 *  - the halos, four a rocket: the shell climbing on its thin trail, the white flash of the burst, its glow in the
 *    air round it (the haze lit in its colour), its smoke drifting, lit by the bursts after it (not on low);
 *  - the reflections: each burst where the Kulen pool and the stream by the square mirror it (a quad per rocket and
 *    stretch of water, hidden where it misses the water).
 * Additive, no depth write, the map's haze. Light on the world: two lamps (sky/lampSlots.ts), the brightest burst
 * now and the rest of them together, in their colours, light the hill, the square and its crowd.
 *
 * No show (before midnight, after its 480 s): nothing is drawn and the update returns at once.
 */

/** Sparks a rocket of each kind has (on high, at a 35 m burst; bigger or smaller with its size). */
const SPARKS: Record<BurstKind, number> = { peony: 150, chrysanthemum: 130, willow: 100, crackle: 48, ring: 72 };
/** Share of those drawn on each graphics level (a phone on low keeps 30 a second). */
const LEVEL_SPARKS: Record<GraphicsLevel, number> = { low: 0.3, medium: 0.55, high: 1, max: 1.3 };
/** Spark instances a rocket on each level (the most a rocket has there). */
const PER = Object.fromEntries(Object.entries(LEVEL_SPARKS).map(([k, v]) => [k, Math.ceil(Math.max(...Object.values(SPARKS)) * 1.12 * v)])) as Record<GraphicsLevel, number>;
/** Lines of the data texture: rockets in the air at once, at most (the finale has ≈ 145 with their smoke). */
const SLOTS = 176;
/** How long after its burst a rocket is still drawn: its sparks (a willow 6.4 s at most, a little longer for the slowest), the smoke 9 s. */
const SPARK_LIFE: Record<BurstKind, number> = { peony: 2.8, chrysanthemum: 3.4, willow: 7.4, crackle: 2.0, ring: 2.8 };
const SMOKE_LIFE = 9;
/** A lamp's intensity (cd) for a burst's light of 1 (a 35 m peony at its peak): it lights the hill and the square ≈ 150‥250 m off. */
const LAMP_POWER = 30000;
/** The halos' and sparks' look: the water near the square (m) its reflections are drawn on. */
const WATER_REACH = 170;
const MAX_SPOTS = 12;

const COLOURS = Object.fromEntries(Object.entries(SHOW_COLOURS).map(([k, hex]) => [k, new Color(hex)])) as Record<ShowColour, Color>;

/** The ribbon: `SEGS` + 1 rows along, a cap row at each end; two vertices a row. */
function ribbon(): { position: BufferAttribute; index: BufferAttribute } {
  const rows: [number, number][] = [[0, -1]];
  for (let i = 0; i <= SEGS; i++) rows.push([i / SEGS, 0]);
  rows.push([1, 1]);
  const pos: number[] = [];
  for (const [s, cap] of rows) pos.push(-1, s, cap, 1, s, cap);
  const idx: number[] = [];
  for (let r = 0; r + 1 < rows.length; r++) {
    const a = r * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return { position: new BufferAttribute(new Float32Array(pos), 3), index: new BufferAttribute(new Uint16Array(idx), 1) };
}

export function buildFireworks(ctx: MapContext): MapPart {
  const t0 = performance.now();
  const script = showScript();
  const field = ctx.field;
  const object = new Group();
  object.name = 'fireworks';

  // ── The rockets' lines (a float texture: no uniform arrays that big on every GPU).
  const data = new Float32Array(ROW * 4 * SLOTS);
  const tex = new DataTexture(data, ROW, SLOTS, RGBAFormat, FloatType);
  tex.magFilter = tex.minFilter = NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;

  // (the launch points on the land: the script's are on the hill as it is about; drawn from the land itself)
  const launchY = script.map((r) => Math.max(r.y, field.heightAt(r.x, r.z) + 0.5));
  const seeds = script.map((r) => (r.seed % 65521) / 65521);
  const glitter = script.map((r) => (isGlitter(r) ? 1 : 0));

  // ── The sky: sparks and halos (one program, two materials: their own uniforms).
  const lightPos = [new Vector4(), new Vector4()];
  const lightCol = [new Vector4(), new Vector4()];
  const viewU = new Vector4(540, 1, 1, 1);
  const shared = { uData: { value: tex }, uTime: { value: 0 } };
  const skyMaterial = (mode: number) =>
    new ShaderMaterial({
      name: mode ? 'fireworks:halos' : 'fireworks:sparks',
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      // (a ribbon turns with its path on the screen: either face)
      side: DoubleSide,
      fog: true,
      uniforms: {
        ...hazeUniforms(),
        ...shared,
        uMode: { value: mode },
        uPer: { value: mode ? 4 : PER.medium },
        uFirst: { value: 0 },
        uSmoke: { value: 1 },
        uView: { value: viewU },
        uLightPos: { value: lightPos },
        uLightCol: { value: lightCol },
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
    });
  const rib = ribbon();
  const skyGeo = () => {
    const g = new InstancedBufferGeometry();
    g.setIndex(rib.index);
    g.setAttribute('position', rib.position);
    g.instanceCount = 0;
    return g;
  };
  // (a sphere that holds every burst, its sparks' fall and the shells' climb: from the script)
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  script.forEach((r, i) => {
    const m = r.size * 1.3;
    box.x0 = Math.min(box.x0, r.bx - m, r.x);
    box.x1 = Math.max(box.x1, r.bx + m, r.x);
    box.y0 = Math.min(box.y0, r.by - m - 40, launchY[i]);
    box.y1 = Math.max(box.y1, r.by + m);
    box.z0 = Math.min(box.z0, r.bz - m, r.z);
    box.z1 = Math.max(box.z1, r.bz + m, r.z);
  });
  const skySphere = new Sphere(new Vector3((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (box.z0 + box.z1) / 2), 0);
  skySphere.radius = Math.hypot(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0) / 2 + 10;

  const sparkGeo = skyGeo();
  const haloGeo = skyGeo();
  sparkGeo.boundingSphere = skySphere.clone();
  haloGeo.boundingSphere = skySphere.clone();
  const sparkMat = skyMaterial(0);
  const haloMat = skyMaterial(1);
  const sparks = new Mesh(sparkGeo, sparkMat);
  const halos = new Mesh(haloGeo, haloMat);
  sparks.name = 'fireworks:sparks';
  halos.name = 'fireworks:halos';
  // (after the water and the festival's glows; the halos under the sparks)
  halos.renderOrder = 13;
  sparks.renderOrder = 14;

  // ── The water near the square that mirrors them: the Kulen pool, the stream by the square.
  const spotA: Vector4[] = [];
  const spotB: Vector4[] = [];
  const POOL = { x: 446, z: -303, r: 11 };
  const poolLevel = field.waterAt(POOL.x, POOL.z);
  if (poolLevel !== null) {
    spotA.push(new Vector4(POOL.x, POOL.z, POOL.x + 0.01, POOL.z));
    spotB.push(new Vector4(POOL.r, poolLevel, 0, 0));
  }
  for (const river of field.rivers) {
    let from: { x: number; z: number; level: number; w: number } | null = null;
    for (const s of river.samples) {
      if (spotA.length >= MAX_SPOTS) break;
      const near = Math.hypot(s.x - SQUARE.x, s.z - SQUARE.z) < WATER_REACH && Math.hypot(s.x - POOL.x, s.z - POOL.z) > POOL.r + 2;
      if (!near) {
        from = null;
        continue;
      }
      if (!from) from = s;
      else if (Math.hypot(s.x - from.x, s.z - from.z) >= 14 || Math.abs(s.level - from.level) > 0.6) {
        spotA.push(new Vector4(from.x, from.z, s.x, s.z));
        spotB.push(new Vector4(Math.max(1.5, Math.min(from.w, s.w) / 2), (from.level + s.level) / 2, 0, 0));
        from = s;
      }
    }
  }
  while (spotA.length < MAX_SPOTS) {
    spotA.push(new Vector4(0, 0, 0, 0));
    spotB.push(new Vector4(0, -1000, 0, 0));
  }
  const spots = spotB.filter((b) => b.y > -999).length;
  const plane = new PlaneGeometry(1, 1);
  const waterGeo = new InstancedBufferGeometry();
  waterGeo.setIndex(plane.getIndex());
  waterGeo.setAttribute('position', plane.getAttribute('position'));
  waterGeo.instanceCount = 0;
  {
    const ws = new Sphere();
    const pts = spotA.slice(0, spots).flatMap((a, i) => [new Vector3(a.x, spotB[i].y, a.y), new Vector3(a.z, spotB[i].y, a.w)]);
    ws.setFromPoints(pts.length ? pts : [new Vector3(POOL.x, 8, POOL.z)]);
    ws.radius += 50;
    waterGeo.boundingSphere = ws;
  }
  const nightU = { value: 1 };
  const waterMat = new ShaderMaterial({
    name: 'fireworks:water',
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    fog: true,
    uniforms: { ...hazeUniforms(), ...shared, uSpots: { value: Math.max(1, spots) }, uSpotA: { value: spotA }, uSpotB: { value: spotB }, uNight: nightU },
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
  });
  const water = new Mesh(waterGeo, waterMat);
  water.name = 'fireworks:water';
  water.renderOrder = 12;
  for (const m of [sparks, halos, water]) {
    m.raycast = () => {};
    m.matrixAutoUpdate = false;
    object.add(m);
  }

  // ── Light on the world: the brightest burst now, and the rest together (the explorer's own lamps' rank: a burst's
  // light comes at once, as a flash does, never eased in over the slots' 0.45 s; only while the show lights them).
  const lamps = [0, 1].map((i) => addLamp({ kind: 'point', name: `fireworks ${i ? 'rest' : 'brightest'}`, distance: 900, decay: 2, own: true }));

  // ── Per frame: the rockets in the air into the texture.
  const alive: number[] = [];
  const buf = new Vector2();
  const tmp = new Color();
  const sum = new Vector3();
  let warm = 3;
  let videoFrom: number | null = null;
  let frames = 0;
  let cpu = 0;
  let peak = 0;

  const lampsOff = () => {
    for (const l of lamps) l.intensity = 0;
  };

  /** The show's second now (a video moves on from the URL's moment), or null. */
  const nowInShow = (f: MapFrame): number | null => {
    const s = showTime();
    if (s === null) return null;
    if (!ctx.video) return s;
    videoFrom ??= f.t;
    return s + (f.t - videoFrom);
  };

  if (ctx.shot) {
    // (how far each burst is clear of the land under it: the script keeps them over the hill as it is about)
    let low = Infinity;
    let at = '';
    for (const r of script) {
      const clear = r.by - r.size * 0.5 - field.heightAt(r.bx, r.bz);
      if (clear < low) {
        low = clear;
        at = `${r.kind} at ${burstAt(r).toFixed(1)} s (${r.bx.toFixed(0)}, ${r.by.toFixed(0)}, ${r.bz.toFixed(0)})`;
      }
    }
    console.info(
      `[map] fireworks: ${script.length} rockets, ${spots} stretches of water mirror them, sparks a rocket ${Object.entries(PER)
        .map(([k, v]) => `${k} ${v}`)
        .join(' · ')}; the lowest burst is ${low.toFixed(0)} m over the land (${at}); built in ${(performance.now() - t0).toFixed(1)} ms`,
    );
  }

  return {
    name: 'fireworks',
    object,
    update(f: MapFrame) {
      const c0 = performance.now();
      const s = nowInShow(f);
      if (s === null) {
        // (shown for the first frames all the same, drawing nothing: their shaders compile at load)
        object.visible = warm > 0;
        if (warm > 0) warm--;
        sparkGeo.instanceCount = haloGeo.instanceCount = waterGeo.instanceCount = 0;
        lampsOff();
        return;
      }
      object.visible = true;
      warm = 0;
      const level = graphicsNow.level;
      shared.uTime.value = s;
      // (the scene's height in pixels: the sparks' least width is in screen pixels, pxscale= grows it)
      ctx.renderer.getDrawingBufferSize(buf);
      // (low: no bloom, fewer sparks: each a little wider and brighter)
      viewU.set((buf.y * view.scene) / view.canvas, PX_SCALE * (level === 'low' ? 1.35 : 1), Math.min(1.8, Math.sqrt(1 / LEVEL_SPARKS[level])) ** 0.6, f.night);
      nightU.value = f.night;

      // The rockets in the air: launched, their last light (smoke, or sparks on low) not yet gone.
      const smoke = level !== 'low';
      inTheAir(s, smoke);
      const n = Math.min(alive.length, SLOTS);
      const from = alive.length - n;
      let first = -1;
      let best = -1;
      let bestL = 0;
      let restL = 0;
      sum.set(0, 0, 0);
      tmp.setRGB(0, 0, 0);
      for (let k = 0; k < n; k++) {
        const i = alive[from + k];
        const r = script[i];
        const o = k * ROW * 4;
        const b = burstAt(r);
        const c1 = COLOURS[r.color];
        const c2 = COLOURS[r.color2];
        data[o] = r.bx;
        data[o + 1] = r.by;
        data[o + 2] = r.bz;
        data[o + 3] = b;
        data[o + 4] = r.x;
        data[o + 5] = launchY[i];
        data[o + 6] = r.z;
        data[o + 7] = r.rise;
        data[o + 8] = c1.r;
        data[o + 9] = c1.g;
        data[o + 10] = c1.b;
        data[o + 11] = KIND_INDEX[r.kind];
        data[o + 12] = c2.r;
        data[o + 13] = c2.g;
        data[o + 14] = c2.b;
        data[o + 15] = r.size;
        data[o + 16] = seeds[i];
        data[o + 17] = Math.round(SPARKS[r.kind] * LEVEL_SPARKS[level] * (0.6 + 0.4 * Math.min(1.25, r.size / 35)));
        data[o + 18] = glitter[i];
        // (its light's strength: the shader's burstLight is show.ts's)
        data[o + 19] = burstPower(r);
        if (first < 0 && s < b + SPARK_LIFE[r.kind]) first = k;
        // (the light now: the brightest alone, the others summed where their light's middle is)
        const l = burstLight(r, s - b);
        if (l <= 0) continue;
        if (l > bestL) {
          if (best >= 0) {
            const q = script[best];
            restL += bestL;
            sum.x += q.bx * bestL;
            sum.y += q.by * bestL;
            sum.z += q.bz * bestL;
            tmp.r += COLOURS[q.color].r * bestL;
            tmp.g += COLOURS[q.color].g * bestL;
            tmp.b += COLOURS[q.color].b * bestL;
          }
          best = i;
          bestL = l;
        } else {
          restL += l;
          sum.x += r.bx * l;
          sum.y += r.by * l;
          sum.z += r.bz * l;
          tmp.r += c1.r * l;
          tmp.g += c1.g * l;
          tmp.b += c1.b * l;
        }
      }
      tex.needsUpdate = true;
      peak = Math.max(peak, n);
      if (first < 0) first = n;
      const per = PER[level];
      sparkMat.uniforms.uPer.value = per;
      sparkMat.uniforms.uFirst.value = first;
      sparkGeo.instanceCount = (n - first) * per;
      haloMat.uniforms.uSmoke.value = smoke ? 1 : 0;
      haloGeo.instanceCount = n * 4;
      waterGeo.instanceCount = n * Math.max(1, spots);

      // Lamps: the brightest burst, and the rest of them where their light is, in their colours.
      const dim = 0.35 + 0.65 * f.night;
      if (best >= 0) {
        const q = script[best];
        lamps[0].position.set(q.bx, q.by, q.bz);
        lamps[0].color.copy(COLOURS[q.color]);
        lamps[0].intensity = bestL * LAMP_POWER * dim;
        lightPos[0].set(q.bx, q.by, q.bz, 1);
        lightCol[0].set(COLOURS[q.color].r * bestL, COLOURS[q.color].g * bestL, COLOURS[q.color].b * bestL, 1);
      } else {
        lamps[0].intensity = 0;
        lightCol[0].set(0, 0, 0, 0);
      }
      // (the rest together saturate softly: a finale's sky full of willows lights the land, it does not burn it out)
      const restK = restL > 1e-3 ? (1.6 * (1 - Math.exp(-restL / 1.6))) / restL : 0;
      if (restL > 1e-3) {
        lamps[1].position.set(sum.x / restL, sum.y / restL, sum.z / restL);
        lamps[1].color.setRGB(tmp.r / restL, tmp.g / restL, tmp.b / restL);
        lamps[1].intensity = restL * restK * LAMP_POWER * dim;
        lightPos[1].set(sum.x / restL, sum.y / restL, sum.z / restL, 1);
        lightCol[1].set(tmp.r * restK, tmp.g * restK, tmp.b * restK, 1);
      } else {
        lamps[1].intensity = 0;
        lightCol[1].set(0, 0, 0, 0);
      }

      if (f.dt > 0 && frames < 24) {
        cpu += performance.now() - c0;
        if (++frames === 24 && ctx.shot)
          console.info(
            `[map] fireworks: ${(cpu / 24).toFixed(3)} ms a frame (CPU, average of 24) at ${s.toFixed(1)} s · ${n} rockets in the air (most ${peak}), ` +
              `${sparkGeo.instanceCount} spark + ${haloGeo.instanceCount} halo + ${waterGeo.instanceCount} water instances on ${level}`,
          );
      }
    },
  };

  /** Into `alive`: the indices of the rockets launched by `s` whose last light is not yet gone (in launch order). */
  function inTheAir(s: number, smoke: boolean): void {
    // (launched at most a climb (4 s) and the longest life before now)
    rocketsBetween(s - 4 - (smoke ? SMOKE_LIFE : SPARK_LIFE.willow), s + 1e-6, alive);
    let n = 0;
    for (const i of alive) {
      const r = script[i];
      if (s < burstAt(r) + (smoke ? Math.max(SMOKE_LIFE, SPARK_LIFE[r.kind]) : SPARK_LIFE[r.kind])) alive[n++] = i;
    }
    alive.length = n;
  }
}
