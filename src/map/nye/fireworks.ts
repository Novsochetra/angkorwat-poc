import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  Color,
  DoubleSide,
  DataTexture,
  FloatType,
  Group,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  NearestFilter,
  PlaneGeometry,
  Quaternion,
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
import { clearSkyTint, SKY_TINT } from '../sky/tint';
import type { GraphicsLevel, MapContext, MapFrame, MapPart } from '../types';
import { showTime } from './clock';
import { KIND_INDEX, ROW, SEGS, SKY_FRAGMENT, SKY_VERTEX, WATER_FRAGMENT, WATER_VERTEX } from './_fwShaders';
import { SQUARE } from './plan';
import {
  burstAt,
  burstLight,
  burstPower,
  isGlitter,
  LAKE_BARGES,
  rocketsBetween,
  showScript,
  SHOW_COLOURS,
  SHOW_SITES,
  SITE_NEAR,
  type BurstKind,
  type ShowColour,
  type ShowSite,
} from './show';
import { ANGKOR_POINTS, angkorShape } from './_fwAngkor';

/**
 * The New Year's Eve fireworks (AWP-35): the show's script (show.ts) drawn over Phnom Kulen's east flank and over the
 * great lake behind the lake stage (two sites, one clock: `Rocket.site`), played from the real clock (clock.ts
 * `showTime`; `fireworks=<s>` holds it at second s in a shot). The lake's are fired from a line of barges, each with a
 * lantern (`LAKE_BARGES`: two instanced draws, there from when the part is built).
 *
 * GPU-driven: each frame the rockets in the air (launched, their sparks, glow or smoke not yet gone) go into a
 * small float texture, a line each (`_fwShaders.ts`: where it bursts, when, its kind, colours, size, seed); every
 * spark is placed in the vertex shader from its rocket's line, its index and the time (ballistic with drag and
 * gravity: nothing per spark on the CPU, so a held moment looks as it would live). Three draws:
 *  - the sparks: `PER[level]` instances a rocket (each its spark count at this level, the rest hidden), a ribbon
 *    streaked along its path for its trail (a willow's long and bending as it droops); a palm's few thick arms, a
 *    comet's glittering tail shed as it climbs, a crossette's stars popping into white-gold pieces, the signature's
 *    picture (a lotus and Angkor Wat's three towers, `_fwAngkor.ts`: its points in a small float texture, a stroke a
 *    spark, every spark of the rocket: fewer, longer strokes on low);
 *  - the halos, four a rocket: the shell climbing on its thin trail, the white flash of the burst, its glow in the
 *    air round it (the haze lit in its colour), its smoke drifting, lit by the bursts after it (not on low);
 *  - the reflections: each burst where the great lake, the Kulen pool and the stream by the square mirror it (a quad
 *    per rocket and stretch of water, hidden where it misses the water).
 * Additive, no depth write, the map's haze. Light on the world: two lamps (sky/lampSlots.ts), the brightest burst
 * now and the rest of them together, in their colours, light the hill, the square and its crowd (or the lake, its stage
 * and the shore); and the sky (sky/tint.ts `SKY_TINT`): the haze, the low sky and the clouds round the show take the
 * bursts' colours. Both follow the show nearer the camera (and before it): a burst's light counts for less the farther
 * its site is than the nearer one's, so by the lake the lake's show lights the scene, on the square Kulen's.
 *
 * On low, a site's small low bursts (`Rocket.close`) are drawn only within `SITE_NEAR` of its crowd view: the finale
 * keeps ≤ 150 rockets in the air for a phone wherever it is.
 *
 * No show (before midnight, after its 480 s): nothing is drawn and the update returns at once.
 */

/** Sparks a rocket of each kind has (on high, at a 35 m burst; bigger or smaller with its size; the signature all `PER`). */
const SPARKS: Record<BurstKind, number> = { peony: 150, chrysanthemum: 130, willow: 100, crackle: 48, ring: 72, palm: 110, comet: 90, angkor: 150 };
/** Share of those drawn on each graphics level (a phone on low keeps 30 a second). */
const LEVEL_SPARKS: Record<GraphicsLevel, number> = { low: 0.3, medium: 0.55, high: 1, max: 1.3 };
/** Spark instances a rocket on each level (the most a rocket has there). */
const PER = Object.fromEntries(Object.entries(LEVEL_SPARKS).map(([k, v]) => [k, Math.ceil(Math.max(...Object.values(SPARKS)) * 1.12 * v)])) as Record<GraphicsLevel, number>;
/**
 * Lines of the data texture: rockets in the air at once, at most (both sites' finale: ≈ 202 with their smoke, 149
 * without; on low, near a site, the other's small low ones left out: ≤ 147).
 */
const SLOTS = 224;
/** How long after its burst a rocket is still drawn: its sparks (a willow 6.4 s at most, a little longer for the slowest), the smoke 9 s. */
const SPARK_LIFE: Record<BurstKind, number> = { peony: 2.8, chrysanthemum: 3.4, willow: 7.4, crackle: 2.0, ring: 2.8, palm: 4.6, comet: 2.2, angkor: 5.4 };
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
  // (flags: 1 glitter, 2 a crossette)
  const flags = script.map((r) => (isGlitter(r) ? 1 : 0) + (r.cross ? 2 : 0));
  // (the point each faces: the signature's picture turns to it; its site's crowd view by default)
  const faceX = script.map((r) => r.face?.[0] ?? SHOW_SITES[r.site].view[0]);
  const faceZ = script.map((r) => r.face?.[1] ?? SHOW_SITES[r.site].view[2]);
  const shapeTex = new DataTexture(angkorShape(), ANGKOR_POINTS, 1, RGBAFormat, FloatType);
  shapeTex.magFilter = shapeTex.minFilter = NearestFilter;
  shapeTex.generateMipmaps = false;
  shapeTex.needsUpdate = true;

  // ── The sky: sparks and halos (one program, two materials: their own uniforms).
  const lightPos = [new Vector4(), new Vector4()];
  const lightCol = [new Vector4(), new Vector4()];
  const viewU = new Vector4(540, 1, 1, 1);
  const shared = { uData: { value: tex }, uTime: { value: 0 } };
  const shape = { uShape: { value: shapeTex }, uShapeN: { value: ANGKOR_POINTS } };
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
        ...shape,
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

  // ── The water that mirrors them: the great lake under the lake show (one wide stretch along its middle: the shore's
  // land, a metre over the water, hides what of it reaches past the water), the Kulen pool, the stream by the square.
  const spotA: Vector4[] = [];
  const spotB: Vector4[] = [];
  const lakeLevel = field.waterAt(-470, 20);
  if (lakeLevel !== null) {
    spotA.push(new Vector4(-620, 22, -370, 20));
    spotB.push(new Vector4(72, lakeLevel, 0, 0));
  }
  const POOL = { x: 446, z: -303, r: 11 };
  const poolLevel = field.waterAt(POOL.x, POOL.z);
  if (poolLevel !== null) {
    spotA.push(new Vector4(POOL.x, POOL.z, POOL.x + 0.01, POOL.z));
    spotB.push(new Vector4(POOL.r, poolLevel, 0, 0));
  }
  type Sample = { x: number; z: number; level: number; w: number };
  const stretch = (a: Sample, b: Sample) => {
    spotA.push(new Vector4(a.x, a.z, b.x, b.z));
    spotB.push(new Vector4(Math.max(1.5, Math.min(a.w, b.w) / 2), (a.level + b.level) / 2, 0, 0));
  };
  for (const river of field.rivers) {
    let from: Sample | null = null;
    let prev: Sample | null = null;
    for (const s of river.samples) {
      if (spotA.length >= MAX_SPOTS) break;
      const near = Math.hypot(s.x - SQUARE.x, s.z - SQUARE.z) < WATER_REACH && Math.hypot(s.x - POOL.x, s.z - POOL.z) > POOL.r + 2;
      if (!near) {
        from = prev = null;
        continue;
      }
      if (!from || !prev) from = s;
      else if (Math.abs(s.level - from.level) > 0.6) {
        // (a fall or a rapid: no flat water to mirror over it; the still stretch before it does)
        if (Math.hypot(prev.x - from.x, prev.z - from.z) >= 4) stretch(from, prev);
        from = s;
      } else if (Math.hypot(s.x - from.x, s.z - from.z) >= 14) {
        stretch(from, s);
        from = s;
      }
      prev = s;
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
  // (the show's three draws, hidden with nothing in the air; the barges stay)
  const fx = new Group();
  fx.name = 'fireworks:show';
  object.add(fx);
  for (const m of [sparks, halos, water]) {
    m.raycast = () => {};
    m.matrixAutoUpdate = false;
    fx.add(m);
  }

  // ── The lake show's barges: a dark low pontoon each, a lantern on a short pole at its stern (two instanced draws).
  {
    const n = LAKE_BARGES.length;
    const hulls = new InstancedMesh(new BoxGeometry(3.2, 0.9, 7.5), new MeshLambertMaterial({ color: 0x3a2c22 }), n);
    const lights = new InstancedMesh(new BoxGeometry(0.5, 0.7, 0.5), new MeshBasicMaterial({ color: 0xffb760 }), n);
    hulls.name = 'fireworks:barges';
    lights.name = 'fireworks:barge-lanterns';
    const mat = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const one = new Vector3(1, 1, 1);
    const at = new Vector3();
    LAKE_BARGES.forEach((b, i) => {
      const level = field.waterAt(b.x, b.z) ?? 5;
      q.setFromAxisAngle(up, b.yaw);
      hulls.setMatrixAt(i, mat.compose(at.set(b.x, level + 0.25, b.z), q, one));
      lights.setMatrixAt(i, mat.compose(at.set(b.x + Math.sin(b.yaw) * 2.8, level + 2.2, b.z + Math.cos(b.yaw) * 2.8), q, one));
    });
    for (const m of [hulls, lights]) {
      m.computeBoundingSphere();
      m.raycast = () => {};
      m.matrixAutoUpdate = false;
      m.frustumCulled = true;
      object.add(m);
    }
  }

  // ── Light on the world: the brightest burst now, and the rest together (the explorer's own lamps' rank: a burst's
  // light comes at once, as a flash does, never eased in over the slots' 0.45 s; only while the show lights them).
  const lamps = [0, 1].map((i) => addLamp({ kind: 'point', name: `fireworks ${i ? 'rest' : 'brightest'}`, distance: 900, decay: 2, own: true }));

  // ── Per frame: the rockets in the air into the texture.
  const alive: number[] = [];
  const SITES: readonly ShowSite[] = ['kulen', 'lake'];
  const near: Record<ShowSite, boolean> = { kulen: true, lake: true };
  const dist: Record<ShowSite, number> = { kulen: 1, lake: 1 };
  const weight: Record<ShowSite, number> = { kulen: 1, lake: 1 };
  const fwd = new Vector3();
  const buf = new Vector2();
  const tmp = new Color();
  const sum = new Vector3();
  let warm = 3;
  let frames = 0;
  let cpu = 0;
  let peak = 0;

  const lampsOff = () => {
    for (const l of lamps) l.intensity = 0;
    clearSkyTint();
  };

  /** The show's second now (a video moves on from the URL's moment: clock.ts `nyeVideoTime`), or null. */
  const nowInShow = (_f: MapFrame): number | null => showTime();

  if (ctx.shot) {
    // (how far each burst is clear of the land under it: the script keeps them over the hill as it is about)
    const kinds: Record<string, number> = {};
    for (const r of script) kinds[r.kind] = (kinds[r.kind] ?? 0) + 1;
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
      `[map] fireworks: ${script.length} rockets (Kulen ${script.filter((r) => r.site === 'kulen').length}, the lake ${script.filter((r) => r.site === 'lake').length} from ${LAKE_BARGES.length} barges; ${Object.entries(kinds)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')}; ${script.filter((r) => r.cross).length} crossettes), ${spots} stretches of water mirror them, sparks a rocket ${Object.entries(PER)
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
        fx.visible = warm > 0;
        if (warm > 0) warm--;
        sparkGeo.instanceCount = haloGeo.instanceCount = waterGeo.instanceCount = 0;
        lampsOff();
        return;
      }
      fx.visible = true;
      warm = 0;
      const level = graphicsNow.level;
      shared.uTime.value = s;
      // (the scene's height in pixels: the sparks' least width is in screen pixels, pxscale= grows it)
      ctx.renderer.getDrawingBufferSize(buf);
      // (low: no bloom, fewer sparks: each a little wider and brighter)
      viewU.set((buf.y * view.scene) / view.canvas, PX_SCALE * (level === 'low' ? 1.35 : 1), Math.min(1.8, Math.sqrt(1 / LEVEL_SPARKS[level])) ** 0.6, f.night);
      nightU.value = f.night;

      // The rockets in the air: launched, their last light (smoke, or sparks on low) not yet gone; on low a site's
      // small low ones only near it.
      const smoke = level !== 'low';
      const cam = f.camera.position;
      for (const site of SITES) {
        const v = SHOW_SITES[site].view;
        near[site] = level !== 'low' || Math.hypot(cam.x - v[0], cam.z - v[2]) < SITE_NEAR;
        // (each site's light counts by how near it is, against the nearer one: the nearer show lights the scene)
        const a = SHOW_SITES[site].at;
        dist[site] = Math.max(1, Math.hypot(cam.x - a.x, cam.y - a.y, cam.z - a.z));
      }
      // (and by whether the camera looks its way: from the overview, between the two, the one in the picture; the
      // nearest in front of it counts in full)
      const dNear = Math.min(dist.kulen, dist.lake);
      f.camera.getWorldDirection(fwd);
      let most = 0;
      for (const site of SITES) {
        const a = SHOW_SITES[site].at;
        const facing = Math.max(0, (fwd.x * (a.x - cam.x) + fwd.y * (a.y - cam.y) + fwd.z * (a.z - cam.z)) / dist[site]);
        const inView = Math.min(1, Math.max(0, (facing - 0.35) / 0.45));
        weight[site] = (dNear / dist[site]) ** 4 * (0.1 + 0.9 * inView * inView * (3 - 2 * inView)) ** 2;
        most = Math.max(most, weight[site]);
      }
      for (const site of SITES) weight[site] /= most;
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
        data[o + 17] = r.kind === 'angkor' ? PER[level] : Math.round(SPARKS[r.kind] * LEVEL_SPARKS[level] * (0.6 + 0.4 * Math.min(1.25, r.size / 35)));
        data[o + 18] = flags[i];
        // (its light's strength: the shader's burstLight is show.ts's)
        data[o + 19] = burstPower(r);
        data[o + 20] = faceX[i];
        data[o + 21] = faceZ[i];
        if (first < 0 && s < b + SPARK_LIFE[r.kind]) first = k;
        // (the light now: the brightest alone, the others summed where their light's middle is; the far site's dimmed)
        const l = burstLight(r, s - b) * weight[r.site];
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

      // The sky: all of it together, saturating softly (a finale tints the haze and clouds, it never floods them),
      // where its light's middle is.
      const w0 = bestL;
      const w1 = restL * restK;
      const total = w0 + w1;
      if (total > 1e-3) {
        const k = ((1.6 * (1 - Math.exp(-total / 1.6))) / total) * dim;
        SKY_TINT.r = (lightCol[0].x + lightCol[1].x) * k;
        SKY_TINT.g = (lightCol[0].y + lightCol[1].y) * k;
        SKY_TINT.b = (lightCol[0].z + lightCol[1].z) * k;
        SKY_TINT.x = (lightPos[0].x * w0 + lightPos[1].x * w1) / total;
        SKY_TINT.y = (lightPos[0].y * w0 + lightPos[1].y * w1) / total;
        SKY_TINT.z = (lightPos[0].z * w0 + lightPos[1].z * w1) / total;
      } else clearSkyTint();

      if (f.dt > 0 && frames < 24) {
        cpu += performance.now() - c0;
        if (++frames === 24 && ctx.shot)
          console.info(
            `[map] fireworks: ${(cpu / 24).toFixed(3)} ms a frame (CPU, average of 24) at ${s.toFixed(1)} s · ${n} rockets in the air (most ${peak}; light: Kulen ${weight.kulen.toFixed(2)}, the lake ${weight.lake.toFixed(2)}), ` +
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
      if (r.close && !near[r.site]) continue;
      if (s < burstAt(r) + (smoke ? Math.max(SMOKE_LIFE, SPARK_LIFE[r.kind]) : SPARK_LIFE[r.kind])) alive[n++] = i;
    }
    alive.length = n;
  }
}
