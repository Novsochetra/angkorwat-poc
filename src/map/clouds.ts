import { BackSide, BufferGeometry, Color, Float32BufferAttribute, Group, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, ShaderMaterial, ShapeUtils, SphereGeometry, Vector2, Vector3 } from 'three';
import { hash3 } from '../voxel/random';
import { MAP_BOUNDS } from './layout';
import { EDGE_BAND, pastLand, ROAM_BOXES } from './terrain/views';
import { buildBackdrop, RING_CENTRE } from './sky/backdrop';
import { fogNow } from './sky/fogLevel';
import { FRONT_BANK, HAZE, HAZE_FUNCS, HAZE_PARS, hazeUniforms, WIND } from './sky/haze';
import { MIST_STACK, MIST_WET, mistBankMaterial, mistLayerMaterial, SEA_FROM } from './sky/mist';
import { mistNoiseTexture } from './sky/noise';
import { SKY } from './sky/palette';
import type { FogStep, MapContext, MapFrame, MapPart } from './types';

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
 *   the thicker parts, so they build soft mounds. Clear over the land: the
 *   planes are a ring round it ({@link mistPlaneShape}), so no pixel there
 *   runs their shader.
 * - Banks: soft upright puffs along the map's side and back edges (so no cut
 *   land shows; they sway on their posts), beyond the front edge (seen when
 *   roaming looks south), and far out between the backdrop rings, where they
 *   drift slowly round the rings with long thin wisps between them. The
 *   mist inside every bank streams and rises, so its edges billow. One
 *   instanced draw, sorted back to front.
 *
 * The Fog setting (sky/fogLevel.ts, `fogNow.step`, read every frame: a change
 * shows at once): full draws all of it; light two planes, each a stack of
 * the layers ({@link PLANES}: as thick a sea), and the far banks of the two
 * nearer rings only ({@link BANKS_FOR}); simple the two planes and the edge
 * and front banks only (and the haze's simple step, sky/haze.ts).
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

/**
 * The mist planes for each Fog step: each draws a stack of LAYER_Y's layers
 * (their indices, lowest first; sky/mist.ts `mistLayerMaterial`) at height
 * `at` (m). Full: a plane a layer. Light and simple: two, the lower three
 * layers and the upper two, so the sea stays as thick (only the parallax
 * between the layers of a stack is lost); each about the middle of its
 * layers (off the blocks' whole metres, so no block top lies in it).
 */
const PLANES: Record<FogStep, { layers: number[]; at: number }[]> = {
  full: LAYER_Y.map((y, i) => ({ layers: [i], at: y })),
  light: [
    { layers: [0, 1, 2], at: 13.75 },
    { layers: [3, 4], at: 25.75 },
  ],
  simple: [
    { layers: [0, 1, 2], at: 13.75 },
    { layers: [3, 4], at: 25.75 },
  ],
};

/** What kind of bank (the Fog step picks by it: {@link BANKS_FOR}). */
type BankKind = 'edge' | 'front' | 'far' | 'wisp';
/** The light step keeps the far banks of the rings nearer than this (m): the two that show most, whole. */
const LIGHT_RINGS = 1200;
/**
 * The banks each Fog step draws. Every step keeps the edge banks (the map's
 * cut edges never show) and the front's (the land's end reads as a shore);
 * light keeps the two nearer rings of far banks (not the two farther ones,
 * paler in the haze, nor the wisps between them), simple none.
 */
const BANKS_FOR: Record<FogStep, (b: Bank) => boolean> = {
  full: () => true,
  light: (b) => b.kind === 'edge' || b.kind === 'front' || (b.kind === 'far' && b.r < LIGHT_RINGS),
  simple: (b) => b.kind === 'edge' || b.kind === 'front',
};

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
  kind: BankKind;
}

/**
 * The mist planes' shape: the 9000 m square less the land, where every layer
 * is clear anyway (sky/mist.ts: from `SEA_FROM` m inside the land's end at
 * the side and back edges, and up to the front edge), so no pixel over the
 * land runs their shader. The hole is the roaming boxes (all reach the front
 * edge) grown to where the sea starts, less a margin, cut to the map's box.
 * Seen from high over the land the sea reaches in over the front edge
 * (sky/haze.ts `FRONT_BANK`): a strip there, drawn only then — its triangles
 * come last, so the draw range leaves them out (`ring` indices, or `all`).
 */
function mistPlaneShape(): { geometry: BufferGeometry; ring: number; all: number } {
  /** (a little inside where the sea starts, for the land map's 4 m texels) */
  const MARGIN = 8;
  const grow = EDGE_BAND - SEA_FROM - MARGIN;
  const inset = SEA_FROM + MARGIN;
  const [x0, x1] = [MAP_BOUNDS.x0 + inset, MAP_BOUNDS.x1 - inset];
  const zBack = MAP_BOUNDS.z0 + inset;
  /** The hole's front: at the front edge (the sea starts past it), and with the strip where the front bank reaches. */
  const front = MAP_BOUNDS.z1 - 2;
  const frontHigh = MAP_BOUNDS.z1 - FRONT_BANK.reach - MARGIN;
  // (boxes that stop short of the front edge have an edge there too: left in the plane, which is always right)
  const boxes = ROAM_BOXES.filter((b) => b.z1 >= MAP_BOUNDS.z1).map((b) => ({ x0: Math.max(x0, b.x0 - grow), x1: Math.min(x1, b.x1 + grow), z0: Math.max(zBack, b.z0 - grow) }));
  // The hole's back edge along x: the deepest box over each stretch; runs of stretches with a box are holes.
  const xs = [...new Set(boxes.flatMap((b) => [b.x0, b.x1]))].sort((a, b) => a - b);
  const holes: Vector2[][] = [];
  /** The front strip's pieces: x from, x to, back z (never deeper than the hole there). */
  const strips: [number, number, number][] = [];
  let run: Vector2[] = [];
  let runX0 = 0;
  const close = (xEnd: number) => {
    if (!run.length) return;
    // (earcut takes holes either way round; this one runs front → back → front)
    holes.push([new Vector2(runX0, front), ...run, new Vector2(xEnd, front)]);
    run = [];
  };
  for (let i = 0; i + 1 < xs.length; i++) {
    const [xa, xb] = [xs[i], xs[i + 1]];
    const over = boxes.filter((b) => b.x0 <= xa && b.x1 >= xb);
    if (!over.length) {
      close(xa);
      continue;
    }
    const z = Math.min(...over.map((b) => b.z0));
    if (!run.length) runX0 = xa;
    const last = run[run.length - 1];
    if (last && last.y === z) last.x = xb;
    else run.push(new Vector2(xa, z), new Vector2(xb, z));
    const zs = Math.max(z, frontHigh);
    const s = strips[strips.length - 1];
    if (s && s[1] === xa && s[2] === zs) s[1] = xb;
    else strips.push([xa, xb, zs]);
  }
  close(xs[xs.length - 1]);
  // The square (as the single plane was: 9000 m, its middle at z −300).
  const S = 4500;
  const square = [new Vector2(-S, -300 - S), new Vector2(S, -300 - S), new Vector2(S, -300 + S), new Vector2(-S, -300 + S)];
  const faces = ShapeUtils.triangulateShape(square, holes);
  const points = [square, ...holes].flat();
  const pos: number[] = points.flatMap((p) => [p.x, 0, p.y]);
  const index: number[] = faces.flat();
  const ring = index.length;
  for (const [xa, xb, zs] of strips) {
    if (zs >= front) continue;
    const k = pos.length / 3;
    pos.push(xa, 0, zs, xb, 0, zs, xb, 0, front, xa, 0, front);
    index.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geometry.setIndex(index);
  geometry.computeBoundingSphere();
  return { geometry, ring, all: index.length };
}

export function buildClouds(ctx: MapContext): MapPart {
  const field = ctx.field;
  const object = new Group();
  object.name = 'clouds';

  const backdrop = buildBackdrop();
  object.add(backdrop.object);

  // ── Sea of mist ─────────────────────────────────────────────────────────
  // (a mesh a plane of the full step; the other steps use the first ones: `PLANES`)
  const shape = mistPlaneShape();
  const plane = shape.geometry;
  const layers = LAYER_Y.map((y, i) => {
    const mesh = new Mesh(plane, mistLayerMaterial(y, i / (LAYER_Y.length - 1)));
    mesh.name = `mist ${y} m`;
    mesh.position.set(0, y, 0);
    mesh.renderOrder = 2 + i;
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    object.add(mesh);
    return mesh;
  });
  /** Point the planes at a Fog step's stacks, their heights (m) sunk by `sink` (after rain). */
  function stackPlanes(step: FogStep, sink: number): void {
    const stacks = PLANES[step];
    layers.forEach((mesh, i) => {
      const s = stacks[i];
      mesh.visible = !!s;
      if (!s) return;
      const u = (mesh.material as ShaderMaterial).uniforms;
      mesh.position.y = s.at - sink;
      // (a layer a component, lowest first; while the land dries this runs every frame: nothing allocated)
      const n = Math.min(s.layers.length, MIST_STACK);
      const ys = u.uY.value as Vector3;
      const ks = u.uK.value as Vector3;
      for (let j = 0; j < MIST_STACK; j++) {
        const l = s.layers[Math.min(j, n - 1)];
        ys.setComponent(j, LAYER_Y[l] - sink);
        ks.setComponent(j, l / (LAYER_Y.length - 1));
      }
      u.uN.value = n;
    });
  }

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

  // Along the side and back edges, where the land has sunk into the mist (the
  // sinking band's outer edge round each box of the roaming area, views.ts;
  // not where another box's land goes on): tall where the land is high there.
  const edgeRuns: [number, number, number, number][] = ROAM_BOXES.flatMap((b): [number, number, number, number][] => {
    const [x0, x1, z0] = [b.x0 - EDGE_BAND, b.x1 + EDGE_BAND, b.z0 - EDGE_BAND];
    return [
      [x0, z0, x1, z0],
      [x0, z0, x0, -240],
      [x1, z0, x1, -240],
    ];
  });
  for (const [xa, za, xb, zb] of edgeRuns) {
    const len = Math.hypot(xb - xa, zb - za);
    for (let s = 0; s <= len; s += 58) {
      const t = s / len;
      if (pastLand(xa + (xb - xa) * t, za + (zb - za) * t) < -1) continue;
      const x = xa + (xb - xa) * t + (rnd(s, xa, 1) - 0.5) * 30;
      const z = za + (zb - za) * t + (rnd(s, za, 2) - 0.5) * 30;
      const ground = maxAround(Math.min(MAP_BOUNDS.x1 - 2, Math.max(MAP_BOUNDS.x0 + 2, x)), Math.max(MAP_BOUNDS.z0 + 2, z), 50);
      const h = Math.max(40, ground + 20 + rnd(s, 3, 3) * 18);
      const seed = rnd(s, 5, 5);
      banks.push({ x, y: -8, z, w: Math.max(h * 1.6, 120 + rnd(s, 4, 4) * 90), h: h + 8, seed, wisp: 0, roll: 2.5 + rnd(s, 6, 6) * 1.5, alpha: 0.95, sway: 12 + seed * 14, ...still, kind: 'edge' });
    }
  }

  // Beyond the front edge (below the overview camera's view): banks rising
  // from the sea of mist, so the land's end reads as its shore when roaming
  // looks south.
  for (let x = MAP_BOUNDS.x0 - 40; x <= MAP_BOUNDS.x1 + 40; x += 75) {
    const seed = rnd(x, 7, 7);
    banks.push({ x: x + (rnd(x, 8, 8) - 0.5) * 30, y: 0, z: MAP_BOUNDS.z1 + 90 + rnd(x, 9, 9) * 70, w: 150 + rnd(x, 10, 10) * 90, h: 50 + seed * 20, seed, wisp: 0, roll: 3, alpha: 0.95, sway: 15, ...still, kind: 'front' });
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
      banks.push({ x: 0, y: 0, z: 0, w: wide * (0.7 + rnd(i, r, 42) * 0.6), h: tall * (0.8 + rnd(i, r, 43) * 0.8), seed, wisp: 0, roll: speed * 1.4, alpha: 0.85, sway: 0, orbit: -speed / r, r, a, kind: 'far' });
      // A wisp between this ring and the next, now and then.
      if (rnd(i, r, 45) < 0.45) {
        const rw = r * 1.2 + rnd(i, r, 46) * r * 0.1;
        const aw = a + Math.PI / n;
        banks.push({ x: 0, y: 12 + rnd(i, r, 47) * tall * 0.3, z: 0, w: wide * (0.9 + rnd(i, r, 48) * 0.8), h: tall * 0.28, seed: rnd(i, r, 49), wisp: 1, roll: speed * 2, alpha: 0.7, sway: 0, orbit: (-speed * 1.25) / rw, r: rw, a: aw, kind: 'wisp' });
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

  // Where each bank is now (x, y, z, w, h), and the draw order of those the Fog step shows.
  const now = new Float32Array(banks.length * 5);
  let order = banks.map((_, i) => i);
  const shown = banks.map(() => true);
  const dist = new Float32Array(banks.length);
  let lastT = NaN;
  /** The banks a Fog step shows (placed from the next frame on). */
  function showBanks(step: FogStep): void {
    const keep = BANKS_FOR[step];
    banks.forEach((b, i) => void (shown[i] = keep(b)));
    order = banks.flatMap((_, i) => (shown[i] ? [i] : []));
    geo.instanceCount = order.length;
    lastT = NaN;
  }
  // (a walk over the whole list with forEach: scripts/bake-native.mjs finds the banks so)
  function place(t: number): void {
    banks.forEach((b, i) => {
      if (!shown[i]) return;
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
    for (const i of order) {
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

  /** The Fog step the planes and banks were last set for. */
  let stepNow: FogStep | null = null;
  let sinkNow = NaN;

  return {
    name: 'clouds',
    object,
    update(f: MapFrame) {
      const w = f.weather;
      const step = fogNow.step;
      backdrop.update(SKY, f.drift);
      if (step !== stepNow) showBanks(step);
      if (f.drift !== lastT) {
        lastT = f.drift;
        place(f.drift);
      }
      sortBanks(f.camera.position, WET_SETTLE * w.wet);
      // After rain the sea of mist lies a little lower and thicker.
      MIST_WET.value = w.wet;
      const sink = WET_SINK * w.wet;
      if (step !== stepNow || sink !== sinkNow) stackPlanes(step, sink);
      stepNow = step;
      sinkNow = sink;
      // (the strip over the front edge only while the sea can reach in over it: FRONT_BANK)
      const cam = f.camera.position;
      plane.setDrawRange(0, cam.y > FRONT_BANK.eyeY - 2 && cam.z < FRONT_BANK.eyeZ + 2 ? shape.all : shape.ring);
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
