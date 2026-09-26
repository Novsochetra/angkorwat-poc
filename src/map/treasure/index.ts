import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshStandardMaterial, Points, ShaderMaterial, Vector3, Vector4, type WebGLProgramParametersWithUniforms } from 'three';
import { hash3 } from '../../voxel/random';
import posthog, { isPostHogConfigured } from '../../posthog';
import type { RoamCtx, RoamHud } from '../roam/types';
import type { MapContext, MapFrame, MapPart, RoamSound } from '../types';
import { lang, num, t } from '../ui/lang';
import { createTreasureHud, type TreasureHud } from './_hud';
import { B, CELL, D, G, K, P, sketchOf, type Sketch } from './_models';
import { GOLD, goldAt, goldTurn, type GoldDef } from './_spots';
import { loadTreasure, saveTreasure, type TreasureSave } from './_store';
import { installTreasure, type GoldNear } from './hooks';

/**
 * Hidden gold (part `treasure`): a gentle goal for explorers.
 *
 * - Fifteen small golden figures, each a Khmer motif (_models.ts), hidden
 *   round the map (_spots.ts): in a quiet corner of every temple and at
 *   the jungle sites and the village. Each turns slowly on its lotus
 *   plinth and glints now and then (a small star that catches the eye from
 *   20–30 m; a faint glow and halo at night, no light). On foot, E by one
 *   ("E  Pick up the golden naga"): he bends down, it flies into his bag, a
 *   chime and "Golden naga found — 4 / 15". Found ones stay found (_store.ts).
 * - A small gold counter while roaming (_hud.ts).
 *
 * The roaming modes reach it through `hooks.ts` (the walker's prompt and
 * E). Two draw calls: the figures (one mesh, each figure placed and turned
 * in the vertex shader) and their glints (points); nothing to do when
 * nothing is near.
 *
 * URL (checks): `gold=all|none|<n>|<id>,<id>…` which are found (for the
 * visit; shots start with none) · `gold=lineup` every figure in a row on
 * the valley road (south of the ramp below Angkor Wat) · `goldfound=<id>`
 * as if that one was just found (the message, the counter).
 */

/** Reach from his feet to a figure (m, across and up or down). */
const REACH = 2.3;
const REACH_UP = 1.7;
/** A slow turn (rad/s). */
const SPIN = 0.32;
/** The glint shows from this far (m), fully from `GLINT_FULL`. */
const GLINT_FAR = 42;
const GLINT_FULL = 26;
/** Picking up: he reaches down (s, the `interact` action's hand low at ~0.8 s), then it flies to his bag (s). */
const PICK_DELAY = 0.7;
const PICK_FLY = 0.9;
/** Figures this far from the camera (m, across) are not drawn at all. */
const FAR = 180;

/** Figure tones (sRGB): gold, bright, deep, dark, pale. */
const TONES = [0xe2a93b, 0xf6cf63, 0xa8741e, 0x5c3a10, 0xffefb8];

interface Figure {
  def: GoldDef;
  x: number;
  y: number;
  z: number;
  turn: number;
  found: boolean;
  /** Picked up: when it starts to fly (the part's clock), and the pick's start point. */
  pickAt: number;
  /** Top of the figure over its feet (m): where the glint sits. */
  height: number;
}

export function buildTreasure(ctx: MapContext): MapPart {
  const t0 = performance.now();
  const params = new URLSearchParams(location.search);
  const shot = ctx.shot;
  const object = new Group();
  object.name = 'treasure';

  // ── What was found (kept between visits; shots start fresh) ─────────────
  const save: TreasureSave = shot ? { found: [] } : loadTreasure();
  const goldParam = params.get('gold');
  const lineup = goldParam === 'lineup';
  /** A `gold=` list (checks, demos) stands in for the saved one: never written back, so real progress is kept. */
  const demo = shot || goldParam !== null;
  if (goldParam && !lineup) {
    const ids = GOLD.map((g) => g.id as string);
    save.found = goldParam === 'all' ? ids : goldParam === 'none' ? [] : /^\d+$/.test(goldParam) ? ids.slice(0, Number(goldParam)) : goldParam.split(',').filter((id) => ids.includes(id));
  }

  // ── The figures ─────────────────────────────────────────────────────────
  const sketches = GOLD.map((d) => sketchOf(d.id));
  const figs: Figure[] = GOLD.map((def, i) => {
    let [x, y, z] = goldAt(def, ctx.field);
    let turn = goldTurn(def, ctx.field);
    if (lineup) {
      // In a row across the valley road south of the ramp, facing the camera (+z).
      x = -16.1 + i * 2.3;
      z = -34;
      y = NaN;
      turn = 0;
    }
    if (Number.isNaN(y)) y = ctx.field.heightAt(x, z);
    let top = 0;
    for (const k of sketches[i].cells.keys()) top = Math.max(top, Number(k.split(',')[1]) + 1);
    return { def, x, y, z, turn, found: save.found.includes(def.id), pickAt: -1, height: top * CELL };
  });
  const geo = bakeFigures(sketches);
  const blocks = sketches.reduce((n, s) => n + s.cells.size, 0);
  /** Per figure: where (x, y, z) and its turn (w); scale (x), glow (y). */
  const uFig = { value: figs.map(() => new Vector4()) };
  const uFigB = { value: figs.map(() => new Vector4()) };
  const uEnv = { value: new Color() };
  const gold = new MeshStandardMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.4, name: 'treasure:gold' });
  gold.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uFig = uFig;
    shader.uniforms.uFigB = uFigB;
    shader.uniforms.uGoldEnv = uEnv;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aFig;\nuniform vec4 uFig[${figs.length}];\nuniform vec4 uFigB[${figs.length}];\nvarying float vGlow;`)
      .replace(
        '#include <beginnormal_vertex>',
        `int gIdx = int(aFig + 0.5);
        vec4 gP = uFig[gIdx];
        vec4 gB = uFigB[gIdx];
        float gc = cos(gP.w);
        float gs = sin(gP.w);
        vec3 objectNormal = vec3(gc * normal.x + gs * normal.z, normal.y, -gs * normal.x + gc * normal.z);
        vGlow = gB.y;`,
      )
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3(gc * position.x + gs * position.z, position.y, -gs * position.x + gc * position.z) * gB.x + gP.xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uGoldEnv;\nvarying float vGlow;')
      .replace(
        '#include <opaque_fragment>',
        `{
          // Gold: the sky in it (bright on what faces up, a rim at grazing angles) and its own faint glow.
          vec3 gV = normalize(vViewPosition);
          vec3 gN = normalize(normal);
          vec3 gR = reflect(-gV, gN);
          vec3 gUp = (viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz;
          float gE = smoothstep(-0.35, 0.85, dot(gR, gUp));
          float gF = pow(1.0 - clamp(dot(gV, gN), 0.0, 1.0), 2.0);
          outgoingLight += diffuseColor.rgb * uGoldEnv * (0.22 + 0.78 * gE) * (0.7 + 0.7 * gF);
          outgoingLight += diffuseColor.rgb * vGlow;
        }
        #include <opaque_fragment>`,
      );
  };
  gold.customProgramCacheKey = () => 'treasure-gold';
  const figMesh = new Mesh(geo, gold);
  figMesh.name = 'treasure:figures';
  figMesh.frustumCulled = false;
  figMesh.receiveShadow = true;
  object.add(figMesh);

  // Glints: one point over each figure.
  const glintGeo = new BufferGeometry();
  glintGeo.setAttribute('position', new BufferAttribute(new Float32Array(figs.length * 3), 3));
  glintGeo.setAttribute('aFig', new BufferAttribute(new Float32Array(figs.map((_, i) => i)), 1));
  const uSpark = { value: figs.map(() => new Vector4()) };
  const glintU = { uSpark, uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 500 } };
  const glints = new Points(
    glintGeo,
    new ShaderMaterial({
      name: 'treasure:glints',
      defines: { FIGS: figs.length },
      uniforms: glintU,
      vertexShader: GLINT_VERTEX,
      fragmentShader: GLINT_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
    }),
  );
  glints.name = 'treasure:glints';
  glints.frustumCulled = false;
  glints.renderOrder = 4;
  object.add(glints);

  // ── Roaming: the player's side ──────────────────────────────────────────
  let clock = 0;
  let hud: RoamHud | null = null;
  let sound: ((s: RoamSound, gain?: number) => void) | null = null;
  let body: RoamCtx['body'] | null = null;
  let ui: TreasureHud | null = null;
  let settled = false;
  const foundCount = () => figs.filter((f) => f.found).length;

  const name = (f: Figure) => t(f.def.name);
  /** "Golden naga" at the start of a sentence (English only has capitals). */
  const cap = (s: string) => (lang() === 'en' ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  /** Put the figures on what is really there (the walk map: a floor, a step, the ground), once. */
  function settle(c: RoamCtx): void {
    settled = true;
    if (lineup) return;
    const w = c.world;
    if (!w.standAt) return;
    for (const f of figs) {
      // (from a little over it: a floor up to 1.5 m higher, never the roof over it)
      const g = w.standAt(f.x, f.z, f.y + 0.3, 1.2, 0.5);
      if (!Number.isNaN(g) && Math.abs(g - f.y) < 1.6) f.y = g;
    }
  }

  function remember(c: RoamCtx): void {
    hud = c.hud;
    sound = c.sound;
    body = c.body;
  }

  installTreasure({
    near(c): GoldNear | null {
      remember(c);
      if (!settled) settle(c);
      const p = c.body.pos;
      let best: Figure | null = null;
      let bestD = REACH;
      for (const f of figs) {
        if (f.found || Math.abs(f.y - p.y) > REACH_UP) continue;
        const fx = f.x - p.x;
        const fz = f.z - p.z;
        const d = Math.sqrt(fx * fx + fz * fz);
        if (d < bestD) {
          bestD = d;
          best = f;
        }
      }
      return best ? { id: best.def.id, prompt: `E  ${t('tgPick', { name: name(best) })}` } : null;
    },
    pick(c, id) {
      remember(c);
      const f = figs.find((g) => g.def.id === id);
      if (!f || f.found) return;
      f.found = true;
      f.pickAt = clock + PICK_DELAY;
      save.found = figs.filter((g) => g.found).map((g) => g.def.id);
      if (isPostHogConfigured) posthog.capture('treasure_collected', { collection_count: save.found.length, collection_total: figs.length });
      if (!demo) saveTreasure(save);
      // He turns to it and bends down to pick it up.
      c.body.yaw = Math.atan2(f.x - c.body.pos.x, f.z - c.body.pos.z);
      c.body.explorer.play('interact');
    },
    found: () => figs.filter((f) => f.found && f.pickAt < 0).map((f) => ({ id: f.def.id, x: f.x, z: f.z })),
  });

  // ── Every frame ─────────────────────────────────────────────────────────
  // (found from the start, so the walker never offers to pick it up: only the message waits for the interface)
  const goldfound = params.get('goldfound');
  const goldfoundFig = goldfound ? figs.find((x) => x.def.id === goldfound) : undefined;
  if (goldfoundFig) goldfoundFig.found = true;
  let goldfoundShown = !goldfoundFig;
  const cam = new Vector3();

  /** Frames drawn (the figures' mesh is drawn from the start, so its shader compiles at load). */
  let frames = 0;

  function update(f: MapFrame): void {
    clock += f.dt;
    frames++;
    const mode = f.roam;
    const roaming = mode !== 'overview';
    cam.copy(f.camera.position);
    const night = f.night;

    // The interface: the counter (and a found message asked for by the URL).
    if (!ui && roaming) {
      const layer = document.querySelector<HTMLElement>('.map-ui.rh');
      if (layer) {
        ui = createTreasureHud(layer);
        ui.count(foundCount(), figs.length);
      }
    }
    // (no hud.prompt(null) here: the walker owns the prompt and only redraws it when its text changes)
    if (goldfoundFig && !goldfoundShown && hud && ui) {
      goldfoundShown = true;
      ui.count(foundCount(), figs.length, true);
      hud.toast(t('tgFound', { name: cap(name(goldfoundFig)), n: num(foundCount()), total: num(figs.length) }));
    }

    // Figures: turn, glint, fly into his bag once picked.
    const env = uEnv.value;
    // (the sky in the gold: warm by day, a dim blue by night)
    env.setRGB(0.42 - 0.34 * night, 0.34 - 0.26 * night, 0.22 - 0.1 * night);
    const glow = 0.05 + 0.32 * night;
    for (const [i, g] of figs.entries()) {
      const P = uFig.value[i];
      const Bv = uFigB.value[i];
      const S = uSpark.value[i];
      const angle = g.turn + clock * SPIN * (i % 2 ? 1 : -1);
      if (g.found && g.pickAt >= 0 && body) {
        // Up into his hand, then to his bag, spinning and shrinking.
        const u = (clock - g.pickAt) / PICK_FLY;
        if (u >= 1) {
          g.pickAt = -1;
          Bv.set(0, 0, 0, 0);
          S.w = 0;
          sound?.('gold', 1);
          const n = foundCount();
          ui?.count(n, figs.length, true);
          hud?.toast(n >= figs.length ? t('tgAll', { total: num(figs.length) }) : t('tgFound', { name: cap(name(g)), n: num(n), total: num(figs.length) }));
          continue;
        }
        const k = Math.max(0, u);
        const sc = body.scale;
        // (his bag: on his back at the waist, behind him)
        const bx = body.pos.x - Math.sin(body.yaw) * 0.25 * sc;
        const bz = body.pos.z - Math.cos(body.yaw) * 0.25 * sc;
        const by = body.pos.y + 0.95 * sc;
        const e = k * k * (3 - 2 * k);
        const lift = Math.sin(k * Math.PI) * 0.8;
        P.set(g.x + (bx - g.x) * e, g.y + (by - g.y) * e + lift, g.z + (bz - g.z) * e, angle + k * 9);
        Bv.set(1 - 0.85 * e, glow + 1.2 * (1 - k), 0, 0);
        S.set(P.x, P.y + g.height * Bv.x, P.z, 1 - k);
        continue;
      }
      if (g.found || (!roaming && !lineup)) {
        // (the overview stays as the concept art: no figures, no glints)
        Bv.set(0, 0, 0, 0);
        S.w = 0;
        continue;
      }
      const d = cam.distanceTo(_p.set(g.x, g.y, g.z));
      // A soft shimmer runs over it when the glint flashes.
      const flash = glintFlash(clock, i);
      P.set(g.x, g.y, g.z, angle);
      Bv.set(1, glow + 0.35 * flash, 0, 0);
      S.set(g.x, g.y + g.height + 0.12, g.z, 1 - smoothstep(GLINT_FULL, GLINT_FAR, d));
    }
    // (nothing to draw when every figure is far: they are specks past this)
    let near = false;
    for (const g of figs) if (!g.found || g.pickAt >= 0) near ||= Math.abs(g.x - cam.x) < FAR && Math.abs(g.z - cam.z) < FAR;
    figMesh.visible = frames < 4 || lineup || (roaming && near);
    glints.visible = figMesh.visible;
    glintU.uTime.value = clock;
    glintU.uNight.value = night;
    glintU.uScale.value = innerHeight / (2 * Math.tan((f.camera.fov * Math.PI) / 360));
  }

  const ms = Math.round(performance.now() - t0);
  console.info(`[treasure] ${figs.length} golden figures (${blocks} cells, ${geo.getAttribute('position').count} vertices) · found ${foundCount()} · built in ${ms} ms`);
  return {
    name: 'treasure',
    object,
    update,
    blocks,
    // (for checks: where the figures are, found or not)
    get debug() {
      return { figures: figs.map((f) => ({ id: f.def.id, x: f.x, y: f.y, z: f.z, found: f.found })), settled };
    },
  } as MapPart;
}

const _p = new Vector3();

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The glint's flash (0‥1): a quick bright star every few seconds, each figure on its own beat (as the shader has it). */
function glintFlash(t: number, i: number): number {
  const period = 2.6 + (i % 3) * 0.45;
  const ph = (((t / period + i * 0.173) % 1) + 1) % 1;
  return smoothstep(0, 0.05, ph) * (1 - smoothstep(0.05, 0.3, ph));
}

/**
 * All figures in one geometry: the faces of each cell that show (none
 * between two cells), a soft corner shade (ambient occlusion) per vertex,
 * the tone with a little variation, and the figure's index (`aFig`).
 * Positions are the figure's own (m, its plinth's foot at 0); the shader
 * turns and places it.
 */
function bakeFigures(sketches: Sketch[]): BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const fig: number[] = [];
  const idx: number[] = [];
  const tones = TONES.map((h) => new Color().setHex(h));
  const c = new Color();
  const AO = [0.5, 0.68, 0.84, 1];
  // Faces: normal axis, its sign, and the two axes across it.
  const FACES: [number, number, number, number][] = [
    [0, 1, 1, 2],
    [0, -1, 2, 1],
    [1, 1, 2, 0],
    [1, -1, 0, 2],
    [2, 1, 0, 1],
    [2, -1, 1, 0],
  ];
  sketches.forEach((s, fi) => {
    const has = (x: number, y: number, z: number) => s.cells.has(`${x},${y},${z}`);
    for (const [key, tone] of s.cells) {
      const cell = key.split(',').map(Number);
      const vary = 0.9 + 0.16 * hash3(cell[0], cell[1], cell[2], fi * 7 + 3);
      // (a little lighter higher up, as if the light falls from above)
      const lift = 0.94 + 0.08 * Math.min(1, cell[1] / 16);
      const base = tones[tone === K ? K : tone === P ? P : tone === B ? B : tone === D ? D : G];
      for (const [ax, sg, ua, va] of FACES) {
        const n = [0, 0, 0];
        n[ax] = sg;
        if (has(cell[0] + n[0], cell[1] + n[1], cell[2] + n[2])) continue;
        const start = pos.length / 3;
        const ao: number[] = [];
        for (const [du, dv] of [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ]) {
          const o = [cell[0] + n[0], cell[1] + n[1], cell[2] + n[2]];
          const a = [...o];
          a[ua] += du;
          const b = [...o];
          b[va] += dv;
          const cc = [...o];
          cc[ua] += du;
          cc[va] += dv;
          const s1 = has(a[0], a[1], a[2]) ? 1 : 0;
          const s2 = has(b[0], b[1], b[2]) ? 1 : 0;
          const s3 = has(cc[0], cc[1], cc[2]) ? 1 : 0;
          const level = s1 && s2 ? 0 : 3 - (s1 + s2 + s3);
          ao.push(level);
          const v = [cell[0], cell[1] + 0.5, cell[2]];
          v[ax] += sg * 0.5;
          v[ua] += du * 0.5;
          v[va] += dv * 0.5;
          pos.push(v[0] * CELL, v[1] * CELL, v[2] * CELL);
          nor.push(n[0], n[1], n[2]);
          c.copy(base).multiplyScalar(vary * lift * AO[level]);
          col.push(c.r, c.g, c.b);
          fig.push(fi);
        }
        // (split the quad along the diagonal with the lighter corners: no dark streak across it)
        if (ao[0] + ao[2] >= ao[1] + ao[3]) idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
        else idx.push(start + 1, start + 2, start + 3, start + 1, start + 3, start);
      }
    }
  });
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setAttribute('aFig', new BufferAttribute(new Float32Array(fig), 1));
  g.setIndex(idx);
  return g;
}

const GLINT_VERTEX = /* glsl */ `
attribute float aFig;
uniform vec4 uSpark[FIGS];
uniform float uTime;
uniform float uNight;
uniform float uScale;
varying float vA;
varying float vFlash;
varying float vTurn;
void main() {
  vec4 s = uSpark[int(aFig + 0.5)];
  vec4 mvPosition = modelViewMatrix * vec4(s.xyz, 1.0);
  float period = 2.6 + mod(aFig, 3.0) * 0.45;
  float ph = fract(uTime / period + aFig * 0.173);
  vFlash = smoothstep(0.0, 0.05, ph) * (1.0 - smoothstep(0.05, 0.3, ph));
  vA = s.w;
  vTurn = uTime * 0.5 + aFig * 1.7;
  float d = max(1.0, -mvPosition.z);
  // (about a metre across when it flashes, smaller between; bigger and softer at night)
  float size = (0.6 + 0.9 * vFlash + 0.5 * uNight) * uScale / d;
  gl_PointSize = s.w > 0.002 ? clamp(size, 3.0, 110.0) : 0.0;
  gl_Position = projectionMatrix * mvPosition;
}`;

const GLINT_FRAGMENT = /* glsl */ `
uniform float uNight;
varying float vA;
varying float vFlash;
varying float vTurn;
void main() {
  vec2 p = gl_PointCoord * 2.0 - 1.0;
  float c = cos(vTurn * 0.3);
  float s = sin(vTurn * 0.3);
  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  float r2 = dot(p, p);
  float core = exp(-r2 * 16.0);
  // Four soft rays, longer as it flashes.
  float len = mix(4.5, 1.6, vFlash);
  float rays = exp(-abs(p.x) * 30.0) * exp(-abs(p.y) * len) + exp(-abs(p.y) * 30.0) * exp(-abs(p.x) * len);
  float halo = exp(-r2 * 4.0) * (0.12 + 0.35 * uNight);
  float i = core * (0.9 + 1.6 * vFlash) + rays * (0.12 + 1.3 * vFlash) + halo;
  gl_FragColor = vec4(vec3(1.0, 0.84, 0.48) * i * vA * (1.3 + 0.6 * uNight), 1.0);
}`;
