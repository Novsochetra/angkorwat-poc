import {
  AdditiveBlending,
  BoxGeometry,
  type BufferGeometry,
  BufferAttribute,
  Color,
  DoubleSide,
  DataTexture,
  FloatType,
  Frustum,
  Group,
  InstancedBufferGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  NearestFilter,
  Quaternion,
  RGBAFormat,
  ShaderMaterial,
  Sphere,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { graphicsNow } from '../graphics';
import { PX_SCALE, view } from '../resolution';
import { hazeUniforms } from '../sky/haze';
import { addLamp } from '../sky/lampSlots';
import { clearSkyTint, SKY_TINT } from '../sky/tint';
import type { GraphicsLevel, MapContext, MapFrame, MapPart } from '../types';
import { showTime } from './clock';
import { FW_FRAGMENT, FW_VERTEX, KIND_INDEX, ROW, SEGS } from './_fwShaders';
import { SQUARE } from './plan';
import {
  burstAt,
  burstGlow,
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
 * lantern (`LAKE_BARGES`: dark hulls in one unlit instanced draw, their lanterns' glow and streaks on the water in the
 * show's draw; there from when the part is built).
 *
 * GPU-driven: each frame the rockets in the air (launched, their sparks, glow or smoke not yet gone) go into a
 * small float texture, a line each (`_fwShaders.ts`: where it bursts, when, its kind, colours, size, seed); every
 * spark is placed in the vertex shader from its rocket's line, its index and the time (ballistic with drag and
 * gravity: nothing per spark on the CPU, so a held moment looks as it would live). One additive draw for all of it,
 * its instances in four runs:
 *  - the sparks: `PER[level]` instances a rocket (each its spark count at this level, the rest hidden), a ribbon
 *    streaked along its path for its trail (a willow's long and bending as it droops); a palm's few thick arms, a
 *    comet's glittering tail shed as it climbs, a crossette's stars popping into white-gold pieces, the signature's
 *    picture (a lotus and Angkor Wat's three towers, `_fwAngkor.ts`: its points in a small float texture, a stroke a
 *    spark, every spark of the rocket: fewer, longer strokes on low);
 *  - the halos, four a rocket: the shell climbing on its thin trail, the white flash of the burst, its glow in the
 *    air round it (the haze lit in its colour), its smoke drifting, lit by the bursts after it (not on low);
 *  - the reflections: under each burst a column of glints on the great lake, the Kulen pool and the stream by the
 *    square (a wedge from the eye along the water toward the burst, a rocket and stretch of water, hidden where it
 *    misses the water; each point as bright as a ripple there would turn the burst to the eye);
 *  - the barges' lanterns: a warm glow at each and its streak on the water toward the camera, broken by ripples (as
 *    the lake venue's lights, nye/_lkReflect.ts), whenever the barges are in the picture, the show on or not.
 * Additive, no depth write, the map's haze. Light on the world: two lamps (sky/lampSlots.ts), the brightest burst
 * now and the rest of them together, in their colours, light the hill, the square and its crowd (or the lake, its stage
 * and the shore); and the sky (sky/tint.ts `SKY_TINT`): the haze, the low sky and the clouds round the show take the
 * bursts' colours. Both follow the show nearer the camera (and before it): a burst's light counts for less the farther
 * its site is than the nearer one's, so by the lake the lake's show lights the scene, on the square Kulen's.
 *
 * Rockets wholly behind the camera or off the picture's sides are not drawn (on every level: the other show, 750 m
 * off, mostly is), their light counts all the same. On low, a site's small low bursts (`Rocket.close`) are drawn only within `SITE_NEAR` of its
 * crowd view.
 *
 * No show (before midnight, after its 480 s): nothing is drawn and the update returns at once.
 */

/** Sparks a rocket of each kind has (on high, at a 35 m burst; bigger or smaller with its size; the signature all `PER`). */
const SPARKS: Record<BurstKind, number> = { peony: 160, chrysanthemum: 150, willow: 110, crackle: 48, ring: 72, palm: 110, comet: 90, angkor: 160 };
/** Share of those drawn on each graphics level (a phone on low keeps 30 a second: no more sparks a rocket there than before). */
const LEVEL_SPARKS: Record<GraphicsLevel, number> = { low: 0.28, medium: 0.52, high: 1, max: 1.25 };
/** Spark instances a rocket on each level (the most a rocket has there). */
const PER = Object.fromEntries(Object.entries(LEVEL_SPARKS).map(([k, v]) => [k, Math.ceil(Math.max(...Object.values(SPARKS)) * 1.12 * v)])) as Record<GraphicsLevel, number>;
/**
 * Lines of the data texture: rockets in the air at once, at most (both sites' finale: ≈ 220 with their smoke; on low,
 * without smoke, near a site the other's small low ones left out: fewer; `fwstats=1` logs the busiest second).
 */
const SLOTS = 256;
/** How long after its burst a rocket is still drawn: its sparks (their kind's life, up to 1.15 times it: a willow 7.4 s), the smoke 9 s. */
const SPARK_LIFE: Record<BurstKind, number> = { peony: 3.4, chrysanthemum: 4.0, willow: 7.4, crackle: 2.0, ring: 3.3, palm: 4.6, comet: 2.2, angkor: 6.1 };
const SMOKE_LIFE = 9;
/** A lamp's intensity (cd) for a burst's light of 1 (a 40 m peony at its peak): it lights the hill and the square ≈ 150‥250 m off. */
const LAMP_POWER = 30000;
/** The halos' and sparks' look: the water near the square (m) its reflections are drawn on. */
const WATER_REACH = 170;
const MAX_SPOTS = 12;
/**
 * The crowd: with more than `CROWD` bursts glowing in the picture at once, each star, glow and puff of smoke dims by
 * (CROWD / bursts)^power (a finale's 60‥80 to about half on high; less on low, which has no bloom to wash it out).
 * Crackles and comets count for less.
 */
const CROWD = 8;
const CROWD_POWER: Record<GraphicsLevel, number> = { low: 0.15, medium: 0.3, high: 0.32, max: 0.32 };
/** The rest's light in the smoke against their light on the land (about `burstGlow` over `burstLight` once a flash is past). */
const GLOW_SHARE = 0.7;
const GLOWS: Record<BurstKind, number> = { peony: 1, chrysanthemum: 1, willow: 1, crackle: 0.3, ring: 0.7, palm: 1, comet: 0.3, angkor: 1 };
/** The barges' lanterns the shader holds (`uBarge`), their height over the water and how far astern of the middle (m). */
const MAX_BARGES = 24;
const BARGE_LANTERN = 3.1;
const BARGE_STERN = 2.8;

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

  // ── The show: sparks, halos and the water's glitter, one draw (_fwShaders.ts: the instance's number says which).
  const lightPos = [new Vector4(), new Vector4()];
  const lightCol = [new Vector4(), new Vector4()];
  const viewU = new Vector4(540, 1, 1, 1);

  // The water that mirrors them: the great lake under the lake show (one wide stretch along its middle: the shore's
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

  // (each barge's lantern: x, y, z and the water's level under it; set with the barges below)
  const bargeAt = Array.from({ length: MAX_BARGES }, () => new Vector4(0, -1000, 0, 0));
  const material = new ShaderMaterial({
    name: 'fireworks',
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    // (a ribbon turns with its path on the screen: either face)
    side: DoubleSide,
    fog: true,
    uniforms: {
      ...hazeUniforms(),
      uData: { value: tex },
      uTime: { value: 0 },
      uShape: { value: shapeTex },
      uShapeN: { value: ANGKOR_POINTS },
      uSparkN: { value: 0 },
      uHaloN: { value: 0 },
      uPer: { value: PER.medium },
      uFirst: { value: 0 },
      uSmoke: { value: 1 },
      uCrowd: { value: 1 },
      uView: { value: viewU },
      uLightPos: { value: lightPos },
      uLightCol: { value: lightCol },
      uSpots: { value: Math.max(1, spots) },
      uWaterN: { value: 0 },
      uBarge: { value: bargeAt },
      uSpotA: { value: spotA },
      uSpotB: { value: spotB },
    },
    vertexShader: FW_VERTEX,
    fragmentShader: FW_FRAGMENT,
  });
  const u = material.uniforms;
  const rib = ribbon();
  const geo = new InstancedBufferGeometry();
  geo.setIndex(rib.index);
  geo.setAttribute('position', rib.position);
  geo.instanceCount = 0;
  // (a sphere that holds every burst, its sparks' fall and the shells' climb (from the script), and the water)
  const box = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  const hold = (x: number, y: number, z: number) => {
    box.x0 = Math.min(box.x0, x);
    box.x1 = Math.max(box.x1, x);
    box.y0 = Math.min(box.y0, y);
    box.y1 = Math.max(box.y1, y);
    box.z0 = Math.min(box.z0, z);
    box.z1 = Math.max(box.z1, z);
  };
  script.forEach((r, i) => {
    const m = r.size * 1.3;
    hold(r.bx - m, r.by - m - 40, r.bz - m);
    hold(r.bx + m, r.by + m, r.bz + m);
    hold(r.x, launchY[i], r.z);
  });
  spotA.slice(0, spots).forEach((a, i) => {
    hold(a.x - spotB[i].x, spotB[i].y, a.y - spotB[i].x);
    hold(a.z + spotB[i].x, spotB[i].y, a.w + spotB[i].x);
  });
  geo.boundingSphere = new Sphere(new Vector3((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (box.z0 + box.z1) / 2), Math.hypot(box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0) / 2 + 10);
  const fx = new Mesh(geo, material);
  fx.name = 'fireworks:show';
  // (after the water and the festival's glows)
  fx.renderOrder = 14;
  fx.raycast = () => {};
  fx.matrixAutoUpdate = false;
  object.add(fx);

  // ── The lake show's barges: a dark low pontoon each, a lantern on a pole at its stern; one unlit instanced draw
  // (dark against the water, as the lantern boats round them, never pale under the moon). The lantern's warm glow and
  // its streak on the water are the show's draw's last run (`bargeLit`), from when the part is built, while the barges
  // are in the picture.
  const barges = (() => {
    const n = LAKE_BARGES.length;
    const tint = (g: BufferGeometry, c: Color) => {
      const k = g.getAttribute('position').count;
      const col = new Float32Array(k * 3);
      for (let i = 0; i < k; i++) col.set([c.r, c.g, c.b], i * 3);
      g.setAttribute('color', new BufferAttribute(col, 3));
      return g;
    };
    // (linear: a near-black tarred hull, a dark pole, the lantern's gold glass; no haze: 150‥250 m off the haze is the
    // pale night mist, and a hazed hull read as a pale rectangle on the deep blue water)
    const parts = [
      tint(new BoxGeometry(3.2, 0.9, 7.5), new Color(0.016, 0.011, 0.008)),
      tint(new BoxGeometry(0.14, BARGE_LANTERN - 0.7, 0.14).translate(0, (BARGE_LANTERN - 0.7) / 2 + 0.45, BARGE_STERN), new Color(0.02, 0.012, 0.008)),
      tint(new BoxGeometry(0.42, 0.56, 0.42).translate(0, BARGE_LANTERN - 0.25, BARGE_STERN), new Color(0.85, 0.36, 0.08)),
    ];
    const mesh = new InstancedMesh(mergeGeometries(parts) ?? parts[0], new MeshBasicMaterial({ vertexColors: true, fog: false }), n);
    mesh.name = 'fireworks:barges';
    const mat = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    const one = new Vector3(1, 1, 1);
    const at = new Vector3();
    LAKE_BARGES.forEach((b, i) => {
      const level = field.waterAt(b.x, b.z) ?? 5;
      q.setFromAxisAngle(up, b.yaw);
      mesh.setMatrixAt(i, mat.compose(at.set(b.x, level + 0.25, b.z), q, one));
      bargeAt[i]?.set(b.x + Math.sin(b.yaw) * BARGE_STERN, level + BARGE_LANTERN, b.z + Math.cos(b.yaw) * BARGE_STERN, level);
    });
    mesh.computeBoundingSphere();
    mesh.raycast = () => {};
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = true;
    object.add(mesh);
    return mesh;
  })();

  // ── Light on the world: the brightest burst now, and the rest together (the explorer's own lamps' rank: a burst's
  // light comes at once, as a flash does, never eased in over the slots' 0.45 s; only while the show lights them).
  const lamps = [0, 1].map((i) => addLamp({ kind: 'point', name: `fireworks ${i ? 'rest' : 'brightest'}`, distance: 900, decay: 2, own: true }));

  // ── Per frame: the rockets in the air into the texture.
  const alive: number[] = [];
  const drawn: number[] = [];
  const SITES: readonly ShowSite[] = ['kulen', 'lake'];
  const near: Record<ShowSite, boolean> = { kulen: true, lake: true };
  const dist: Record<ShowSite, number> = { kulen: 1, lake: 1 };
  const weight: Record<ShowSite, number> = { kulen: 1, lake: 1 };
  const fwd = new Vector3();
  const frustum = new Frustum();
  const viewProj = new Matrix4();
  const mid = new Vector3();
  const buf = new Vector2();
  const tmp = new Color();
  const sum = new Vector3();
  const skyAt = new Vector3();
  const skyCol = new Color();
  let warm = 3;
  // (a shot's `fwstats=1`: how the show reads from its camera, logged once: _fwStats.ts)
  let stats = ctx.shot && new URLSearchParams(location.search).get('fwstats') === '1' ? 3 : 0;
  let frames = 0;
  let crowd = 1;
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
      const level = graphicsNow.level;
      // (the scene's height in pixels: the sparks' least width is in screen pixels, pxscale= grows it)
      ctx.renderer.getDrawingBufferSize(buf);
      // (low: no bloom, fewer sparks: each a little wider and brighter)
      viewU.set((buf.y * view.scene) / view.canvas, PX_SCALE * (level === 'low' ? 1.35 : 1), Math.min(1.8, Math.sqrt(1 / LEVEL_SPARKS[level])) ** 0.6, f.night);
      frustum.setFromProjectionMatrix(viewProj.multiplyMatrices(f.camera.projectionMatrix, f.camera.matrixWorldInverse));
      // (the barges' lanterns glow and streak the water whenever the barges are in the picture)
      const bargeLit = barges.boundingSphere && frustum.intersectsSphere(barges.boundingSphere) ? Math.min(LAKE_BARGES.length, MAX_BARGES) * 2 : 0;
      if (s === null) {
        // (shown for the first frames all the same, drawing nothing but the lanterns: their shaders compile at load)
        fx.visible = warm > 0 || bargeLit > 0;
        if (warm > 0) warm--;
        u.uTime.value = (performance.now() / 1000) % 600;
        u.uSparkN.value = u.uHaloN.value = u.uWaterN.value = 0;
        geo.instanceCount = bargeLit;
        lampsOff();
        return;
      }
      fx.visible = true;
      warm = 0;
      if (stats > 0 && --stats === 0) {
        const camera = f.camera;
        void import('./_fwStats').then((m) => m.logShowStats(camera, field, new URLSearchParams(location.search).get('cam') ?? 'camera', SPARK_LIFE, SMOKE_LIFE));
      }
      u.uTime.value = s;

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
      const [right, left, , , , nearPlane] = frustum.planes;
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
      let first = -1;
      let best = -1;
      let bestL = 0;
      let restL = 0;
      sum.set(0, 0, 0);
      let skyW = 0;
      skyAt.set(0, 0, 0);
      skyCol.setRGB(0, 0, 0);
      tmp.setRGB(0, 0, 0);
      drawn.length = 0;
      for (const i of alive) {
        const r = script[i];
        const b = burstAt(r);
        // (drawn unless all of it is behind the camera or off its picture to the left or right: its burst with its
        // sparks' reach and fall, its climb from the launch (not above or below the picture: its glints on the water
        // may be in it); the other show, 750 m off, mostly is. Its light counts all the same: a show out of the
        // picture still lights what it looks at)
        mid.set((r.bx + r.x) / 2, (r.by + launchY[i]) / 2, (r.bz + r.z) / 2);
        const reach = r.size * 1.6 + 60 + Math.hypot(r.bx - r.x, r.by - launchY[i], r.bz - r.z) / 2;
        if (nearPlane.distanceToPoint(mid) > -reach && left.distanceToPoint(mid) > -reach && right.distanceToPoint(mid) > -reach) drawn.push(i);
        // (the light now: the brightest alone, the others summed where their light's middle is; the far site's dimmed;
        // the sky's own, its flashes softened)
        const l = burstLight(r, s - b) * weight[r.site];
        if (l <= 0) continue;
        const c1 = COLOURS[r.color];
        const g = burstGlow(r, s - b) * weight[r.site];
        skyW += g;
        skyAt.x += r.bx * g;
        skyAt.y += r.by * g;
        skyAt.z += r.bz * g;
        skyCol.r += c1.r * g;
        skyCol.g += c1.g * g;
        skyCol.b += c1.b * g;
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
      // The drawn ones into the texture (the newest if more than its lines).
      const n = Math.min(drawn.length, SLOTS);
      const from = drawn.length - n;
      // (how many bursts glow in the picture at once: their stars and halos dim as the sky fills, so a finale's
      // hundred bursts stay distinct bursts on a dark sky and never add up to one bright wash in the bloom)
      let glowing = 0;
      for (let k = 0; k < n; k++) {
        const i = drawn[from + k];
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
        if (s >= b && s < b + SPARK_LIFE[r.kind] * 0.75) glowing += GLOWS[r.kind];
      }
      tex.needsUpdate = true;
      peak = Math.max(peak, n);
      crowd = Math.min(1, (CROWD / Math.max(glowing, 1)) ** CROWD_POWER[level]);
      u.uCrowd.value = crowd;
      viewU.z *= crowd;
      if (first < 0) first = n;
      const per = PER[level];
      u.uPer.value = per;
      u.uFirst.value = first;
      u.uSmoke.value = smoke ? 1 : 0;
      u.uSparkN.value = (n - first) * per;
      u.uHaloN.value = n * 4;
      u.uWaterN.value = n * Math.max(1, spots);
      geo.instanceCount = (n - first) * per + n * 4 + n * Math.max(1, spots) + bargeLit;

      // Lamps: the brightest burst, and the rest of them where their light is, in their colours.
      const dim = 0.35 + 0.65 * f.night;
      if (best >= 0) {
        const q = script[best];
        lamps[0].position.set(q.bx, q.by, q.bz);
        lamps[0].color.copy(COLOURS[q.color]);
        lamps[0].intensity = bestL * LAMP_POWER * dim;
        lightPos[0].set(q.bx, q.by, q.bz, 1);
        // (the smoke round it is lit by its glow, its flash softened: a burst just opening lights the smoke as its
        // stars do, never a soft ball of its colour round it)
        const g0 = burstGlow(q, s - burstAt(q)) * weight[q.site];
        lightCol[0].set(COLOURS[q.color].r * g0, COLOURS[q.color].g * g0, COLOURS[q.color].b * g0, 1);
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
        lightCol[1].set(tmp.r * restK * GLOW_SHARE, tmp.g * restK * GLOW_SHARE, tmp.b * restK * GLOW_SHARE, 1);
      } else {
        lamps[1].intensity = 0;
        lightCol[1].set(0, 0, 0, 0);
      }

      // The sky: all of it together (each burst's flash softened: `burstGlow`), saturating softly (a finale tints the
      // haze and clouds, it never floods them: at most 1.2, so the hill and the sky between the bursts stay dark), where
      // its light's middle is.
      if (skyW > 1e-3) {
        const k = ((1.2 * (1 - Math.exp(-skyW / 1.2))) / skyW) * dim;
        SKY_TINT.r = skyCol.r * k;
        SKY_TINT.g = skyCol.g * k;
        SKY_TINT.b = skyCol.b * k;
        SKY_TINT.x = skyAt.x / skyW;
        SKY_TINT.y = skyAt.y / skyW;
        SKY_TINT.z = skyAt.z / skyW;
      } else clearSkyTint();

      if (f.dt > 0 && frames < 24) {
        cpu += performance.now() - c0;
        if (++frames === 24 && ctx.shot)
          console.info(
            `[map] fireworks: ${(cpu / 24).toFixed(3)} ms a frame (CPU, average of 24) at ${s.toFixed(1)} s · ${alive.length} rockets in the air, ${n} drawn (most ${peak}; crowd ${crowd.toFixed(2)}; light: Kulen ${weight.kulen.toFixed(2)}, the lake ${weight.lake.toFixed(2)}), ` +
              `${u.uSparkN.value} spark + ${u.uHaloN.value} halo + ${u.uWaterN.value} water + ${bargeLit} lantern instances (one draw) on ${level}`,
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
