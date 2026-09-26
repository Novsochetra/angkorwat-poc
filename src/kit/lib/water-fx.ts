import {
  Color,
  HalfFloatType,
  Matrix4,
  Mesh,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  PlaneGeometry,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  UnsignedByteType,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderTarget,
  type BufferGeometry,
  type Camera,
  type Material,
  type Object3D,
  type Scene,
  type WebGLRenderer,
} from 'three';
import type { PieceBuilder } from '../PieceBuilder';
import { here, TEXEL } from '../shapes';
import type { WaterEdge, WaterSide, WaterSurface } from './water';

/**
 * §17.2 water effects — the reflection and the ripples of any kit water
 * surface (a {@link WaterSurface} from `lib/water.ts`, or any rectangle of
 * water at a height).
 *
 * What the sheet draws: ① temples, trees and sky mirrored in still water, the
 * reflection darker and bluer than the scene and broken into horizontal pixel
 * strips by small waves; ② concentric ripple rings spreading over the water,
 * drawn as rings of lighter and darker texels, fading outwards.
 *
 * ## How it works
 * {@link waterFx} lays one flat, see-through plane a hair over the water's
 * surface (an extra of the piece). Its shader draws, texel by texel on the
 * kit's 1/16 m grid (coarser far away, so it never shimmers):
 *  - **the reflection** — a planar mirror: the scene is drawn once more, from
 *    the camera mirrored in the water plane, into a render target (half the
 *    view's resolution, at most 1024 px), clipped at the surface so nothing
 *    under the water shows in it. Every surface at the same height shares that
 *    one render per frame and camera, so a moat of a hundred tiles costs one
 *    extra scene render, not a hundred. The plane samples it per texel,
 *    shifted strip by strip by the wave slopes (the sheet's horizontal strips),
 *    tinted darker and bluer, blended by a Fresnel term (the water mirrors more
 *    the lower one looks across it). Where the mirror shows nothing (the
 *    studio has no sky), a sky gradient with pixel clouds stands in.
 *  - **the ripples** — ring sets from point sources (a drop, a fish, a lily
 *    pad or a stone the water laps against) and rain, animated: see
 *    {@link RippleSource}. Their slopes also break the reflection up.
 *  - **breeze** — the still water's faint undulation, and with wind, patches
 *    of fine ripples (cat's paws) that break and dull the reflection.
 *
 * Nothing ticks kit extras, so the plane drives itself: it reads the clock
 * ({@link fxClock}) when it is drawn. Screenshots (`shot=1`) freeze the clock
 * at the showcase moment, so cards and headless shots are deterministic; add
 * `&fxt=<seconds>` to the URL to freeze it at another moment. The studio
 * redraws only when something changes, so there the rings stand still between
 * redraws (the plane is flagged `userData.animated` for a studio that wants to
 * keep drawing).
 *
 * Static versions, for places without the extra (baked dioramas, far LODs):
 * {@link rippleTexels} lays the rings of a frozen moment as texel panes on the
 * surface, {@link rippleOverlay} paints them into the surface through
 * `water()`'s `overlay` (which averages them to 1/8 m: only the broad outer
 * rings survive, as seen from afar).
 *
 * ## Placement contract
 *  - The plane covers the surface rectangle at `top` + {@link FX_LIFT}, inset
 *    a texel on each `'glass'` side (the tile's pale rim stays) and flush on
 *    `'open'` sides (tiles side by side join without a seam). Pass the same
 *    `sides` you gave `water()`.
 *  - Ripple sources are in piece space; they move and turn with the piece
 *    (`placePiece` clones the plane; clones share its geometry and material).
 *  - Things standing in the water (lily pads, stones, the explorer) hide the
 *    plane where they rise above the surface, and appear in the mirror.
 *
 * ## Cost
 *  - One draw call per plane (a quad; the fragment loops over at most
 *    {@link MAX_SOURCES} sources, skipping those out of reach, plus 3 × 3 rain
 *    cells when it rains).
 *  - One extra scene render per water height, per camera, per frame, at
 *    `WATER_FX.resolution` of the view (default 0.5), capped at
 *    `WATER_FX.maxSize` px (default 1024); shadows are reused, not redrawn;
 *    what lies below the water is culled. Up to three heights keep their own
 *    render target (≈ 2 MB each at 960 × 540 in half floats); more share them.
 *  - `WATER_FX.mirror = false` turns the mirror off everywhere (the sky
 *    gradient still reflects); `WATER_FX.animate = false` freezes the water.
 *
 * ## Usage
 * ```ts
 * const p = new PieceBuilder();
 * const s = waterTile(p, { depth: WATER_DEPTH.open, tint: 'moat', bed: 'silt', seed });
 * // still water mirroring what stands round it, a drop's rings and a light shower:
 * waterFx(p, s, { ripples: { sources: [drop(0.5, -0.4, { age: 3 })], rain: rain(2) } });
 * // a moat strip whose back side runs into the embankment, a breeze on it:
 * waterFx(p, s2, { sides: { nz: 'open' }, breeze: 0.8 });
 * // the frozen rings as voxels (no extra): after the water and its plants
 * rippleTexels(p, s, { sources: [drop(0, 0)] });
 * ```
 */

// ── Kit standard (sizes: see the §17.2 assets) ───────────────────────────────

/** Height of the effects plane over the water's surface (m): above its top face, under anything floating on it. */
export const FX_LIFT = 1 / 256;

/** Point sources one plane can hold. */
export const MAX_SOURCES = 12;

/**
 * Ripple physics (deep water, gravity–capillary waves). Surface tension and
 * gravity give water waves a minimum group speed of ≈ 0.18 m/s (at λ ≈ 4 cm):
 * after a drop, the water stays calm inside a circle growing at that speed,
 * and outside it the rings sort themselves by length — a crest at distance r,
 * t seconds after the drop, has the wavelength λ = 8π (r/t)² / g (the
 * Cauchy–Poisson solution), so the long waves lead and the rings crowd
 * together towards the calm middle. The kit draws the rings between 0.18 and
 * ≈ 0.4 m/s (λ ≈ 0.08–0.4 m), and only those at least two texels long (λ ≥
 * 0.125 m; the real 2–10 cm wavelets inside are below the texel grid): the
 * visible rings expand at ≈ 0.22–0.4 m/s, a stone's reaching ≈ 1.5 m after
 * 5–6 s. Raindrops' real rings are capillary wavelets of 1–3 cm that die
 * within a second or so; drawn on the texel grid they are small ring sets of
 * 0.1–0.4 m.
 */
export const RIPPLE = {
  g: 9.81,
  /** Calm inside this speed (m/s): the minimum group speed of water waves. */
  calm: 0.18,
  /** Rings fade out beyond this speed (m/s): the longest, weakest leading waves. */
  front: 0.34,
} as const;

// ── Settings and clock ───────────────────────────────────────────────────────

/** Global switches for the water effects (e.g. a low-quality mode turns the mirror off). */
export const WATER_FX = {
  /** Live planar reflection. */
  mirror: true,
  /** Mirror resolution, as a share of the view's. */
  resolution: 0.5,
  /** Longest side of the mirror image (px). */
  maxSize: 1024,
  /** Animate ripples and breeze (false: frozen at the showcase moment). */
  animate: true,
};

/**
 * The effects' clock (seconds). Running: wall time, wrapped every hour (the
 * shader's floats stay precise). Frozen: screenshots (`shot=1`) show the
 * showcase moment t = 0, which the assets' ripple ages are set for; `fxt=`
 * in the URL freezes another moment.
 */
export const fxClock = {
  frozen: null as number | null,
  now(): number {
    if (this.frozen !== null) return this.frozen;
    return WATER_FX.animate ? (performance.now() / 1000) % 3600 : 0;
  },
};
if (typeof location !== 'undefined') {
  const q = new URLSearchParams(location.search);
  if (q.has('fxt')) fxClock.frozen = Number(q.get('fxt'));
  else if (q.get('shot') === '1') fxClock.frozen = 0;
}

// ── Ripple sources ───────────────────────────────────────────────────────────

/**
 * A source of ripple rings (piece space). It repeats: a ring set leaves it
 * every `every` seconds and lives `life` seconds; at the showcase moment
 * (t = 0) the newest one is `age` seconds old.
 */
export interface RippleSource {
  x: number;
  z: number;
  /** Radius of the thing the rings leave from (a lily pad's rim, a stone), 0 for a drop. */
  r0: number;
  /** Strength (1 = a stone dropped in: the rings show plainly). */
  amp: number;
  every: number;
  life: number;
  age: number;
  /** A new spot within this many metres of x, z for every ring set (drips, insects). */
  wander: number;
  /** A second, weaker ring set this long after the first (the splash's jet falling back), and its strength. */
  echo: [delay: number, amp: number];
}

/** Rain over the whole surface: rings per m² per second, and each ring set's life and strength. */
export interface RippleRain {
  rate: number;
  life: number;
  amp: number;
}

/** Everything rippling one surface. */
export interface RippleSet {
  sources?: RippleSource[];
  rain?: RippleRain;
}

/**
 * A pebble or a fish breaking the surface: rings reaching ≈ 1.5 m in 6 s, and
 * a second, weaker set 1.2 s later inside them (drops of the splash falling
 * back). `age` sets how far they have spread at the showcase moment (3 s ≈
 * 0.7–1.3 m).
 */
export function drop(x: number, z: number, o: Partial<RippleSource> = {}): RippleSource {
  return { x, z, r0: 0, amp: 1, every: 7, life: 6.5, age: 3, wander: 0, echo: [1.2, 0.6], ...o };
}

/**
 * Rings lapping out from something floating or standing in the water (a lily
 * pad bobbing, a stone the current wraps round): weak, short ring sets from
 * its rim every 1.6 s.
 */
export function rimRipples(x: number, z: number, r0: number, o: Partial<RippleSource> = {}): RippleSource {
  return { x, z, r0, amp: 0.55, every: 1.6, life: 3.4, age: 2.2, wander: 0, echo: [0, 0], ...o };
}

/**
 * Rain: `rate` rings per m² per second (a light shower ≈ 2–4 as drawn; real
 * rain drops hundreds per m² per second, most of their rings below a texel).
 */
export function rain(rate: number, o: Partial<RippleRain> = {}): RippleRain {
  return { rate, life: 1.5, amp: 0.8, ...o };
}

// ── The ripple field (CPU twin of the shader, for the static versions) ───────

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const fract = (v: number) => v - Math.floor(v);
/** Dave Hoskins' hash (the shader's twin). */
function hash12(x: number, y: number): number {
  let a = fract(x * 0.1031);
  let b = fract(y * 0.1031);
  let c = fract(x * 0.1031);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d;
  b += d;
  c += d;
  return fract((a + b) * c);
}
function hash22(x: number, y: number): [number, number] {
  let a = fract(x * 0.1031);
  let b = fract(y * 0.103);
  let c = fract(x * 0.0973);
  const d = a * (b + 33.33) + b * (c + 33.33) + c * (a + 33.33);
  a += d;
  b += d;
  c += d;
  return [fract((a + b) * c), fract((a + c) * b)];
}

/**
 * One ring set `tau` seconds old, `d` metres out from its source's rim:
 * height and radial slope (both −1‥1 × the envelope). See {@link RIPPLE}.
 */
function ringSet(d: number, tau: number, life: number, cell: number): [number, number] {
  if (tau <= 0 || tau >= life) return [0, 0];
  const dd = Math.max(d, 0.03);
  const v = dd / tau;
  const lambda = (8 * Math.PI * v * v) / RIPPLE.g;
  const f = tau / life;
  const env =
    smooth(RIPPLE.calm, RIPPLE.calm + 0.035, v) *
    (1 - smooth(RIPPLE.front, RIPPLE.front + 0.1, v)) *
    smooth(1.6 * cell, 2.4 * cell, lambda) *
    ((RING_GAIN * (1 - f * f)) / Math.sqrt(1 + 1.2 * dd));
  const ph = (RIPPLE.g * tau * tau) / (4 * dd);
  return [env * Math.cos(ph), env * Math.sin(ph)];
}

/** Rings at full strength (young, near the source) come out ≈ 1.5: the strongest crests read two steps lighter. */
const RING_GAIN = 1.5;

/** Farthest a source's rings reach from its centre (m). */
const reach = (s: RippleSource) => s.r0 + s.wander + (RIPPLE.front + 0.1) * (s.life + s.echo[0]);

/**
 * The rippled surface at moment `t` (see {@link fxClock}): at a point, the
 * height (−1‥1-ish) and slope vector of all rings, drawn for texels of `cell`.
 */
export function rippleField(set: RippleSet, t = 0, cell = TEXEL): (x: number, z: number) => { h: number; sx: number; sz: number } {
  const sources = set.sources ?? [];
  return (x, z) => {
    let h = 0;
    let sx = 0;
    let sz = 0;
    const add = (ax: number, az: number, r0: number, tau: number, life: number, amp: number) => {
      const dx = x - ax;
      const dz = z - az;
      const r = Math.hypot(dx, dz);
      const [hh, s] = ringSet(Math.max(0, r - r0), tau, life, cell);
      h += hh * amp;
      if (r > 1e-6) {
        sx += (dx / r) * s * amp;
        sz += (dz / r) * s * amp;
      }
    };
    sources.forEach((s, i) => {
      if (Math.hypot(x - s.x, z - s.z) > reach(s)) return;
      const tt = t + s.age;
      const cyc = Math.floor(tt / s.every);
      for (let k = 0; k < 3; k++) {
        const tau = tt - (cyc - k) * s.every;
        if (tau >= s.life + s.echo[0]) break;
        const [jx, jz] = hash22(cyc - k, i);
        const [ax, az] = [s.x + (jx - 0.5) * 2 * s.wander, s.z + (jz - 0.5) * 2 * s.wander];
        add(ax, az, s.r0, tau, s.life, s.amp);
        if (s.echo[1] > 0) add(ax, az, s.r0, tau - s.echo[0], s.life * 0.7, s.amp * s.echo[1]);
      }
    });
    const rn = set.rain;
    if (rn && rn.rate > 0) {
      const period = 1 / (rn.rate * RAIN_CELL * RAIN_CELL);
      const ci = Math.floor(x / RAIN_CELL);
      const ck = Math.floor(z / RAIN_CELL);
      for (let di = -1; di <= 1; di++)
        for (let dk = -1; dk <= 1; dk++) {
          const [i, k] = [ci + di, ck + dk];
          const tt = t + hash12(i, k) * period;
          const cyc = Math.floor(tt / period);
          for (let c = 0; c < 2; c++) {
            const tau = tt - (cyc - c) * period;
            if (tau >= rn.life) break;
            const [jx, jz] = hash22(i + (cyc - c) * 7.13, k - (cyc - c) * 3.71);
            add((i + jx) * RAIN_CELL, (k + jz) * RAIN_CELL, 0, tau, rn.life, rn.amp);
          }
        }
    }
    return { h, sx, sz };
  };
}

/** Rain cells (m): each drops one ring set per period somewhere inside it. */
const RAIN_CELL = 0.5;

/** Light-direction lean of the ring shading: facets tilted towards the studio's key light (upper left, in front) read lighter. */
const LEAN: [number, number] = [-0.55, 0.83];

/**
 * How a texel of rings reads, −2‥2: light (crests and facets turned to the
 * light), dark (troughs), or 0 (plain water). Shared by both static versions.
 */
function ringLevel(f: { h: number; sx: number; sz: number }): number {
  const v = f.h * 0.75 - (f.sx * LEAN[0] + f.sz * LEAN[1]) * 0.45;
  return v > 0.5 ? 2 : v > 0.2 ? 1 : v < -0.5 ? -2 : v < -0.2 ? -1 : 0;
}

type Rgb = [number, number, number];
const _c = new Color();
const lin = (hex: number): Rgb => {
  _c.setHex(hex);
  return [_c.r, _c.g, _c.b];
};
const hexOf = (c: Rgb): number => _c.setRGB(Math.min(1, Math.max(0, c[0])), Math.min(1, Math.max(0, c[1])), Math.min(1, Math.max(0, c[2]))).getHex();
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Pale ring crests: the sky caught on the wavelets. Dark troughs: the water's deep tone. */
const RING_LIGHT = lin(0xcfe6ea);

/** A texel's colour with rings on it (linear in, linear out). */
function ringColor(c: Rgb, level: number, dark: Rgb): Rgb {
  return level > 0 ? mixRgb(c, RING_LIGHT, 0.2 * level) : mixRgb(c, dark, -0.28 * level);
}

/**
 * The rings of moment `t` painted into a water surface through `water()`'s
 * `overlay` (a cheap, block-free version for far views: `water()` averages
 * the texels to 1/8 m, so only the broad outer rings survive). Pass the
 * tint's darkest tone as `dark`.
 */
export function rippleOverlay(set: RippleSet, o: { t?: number; dark: number }): (x: number, z: number, color: number) => number {
  const field = rippleField(set, o.t ?? 0);
  const dark = lin(o.dark);
  return (x, z, color) => {
    const level = ringLevel(field(x, z));
    return level ? hexOf(ringColor(lin(color), level, dark)) : color;
  };
}

/**
 * The rings of moment `t` as texel panes laid on a finished water surface —
 * the frozen, texel-sharp version of the animated rings (a card, a baked
 * diorama). Call it after the water and anything floating on it: it reads the
 * surface's own colours back from the builder, lightens or darkens them, and
 * skips texels something else covers. Returns the number of panes laid.
 */
export function rippleTexels(p: PieceBuilder, s: WaterSurface, set: RippleSet, o: { t?: number; sides?: Partial<Record<WaterSide, WaterEdge>> } = {}): number {
  const src = here();
  const field = rippleField(set, o.t ?? 0);
  const [x0, z0, x1, z1] = inset(s, o.sides);
  const n = Math.round((x1 - x0) / TEXEL);
  const m = Math.round((z1 - z0) / TEXEL);
  // The surface as built: each texel's colour (the skin's top panes), and texels something else stands in.
  const color = new Int32Array(n * m).fill(-1);
  const covered = new Uint8Array(n * m);
  const y = s.top + FX_LIFT;
  for (const b of p.voxels.boxes) {
    if (b.rx || b.ry || b.rz) continue;
    const [lo, hi] = [b.y - b.sy / 2, b.y + b.sy / 2];
    const skin = b.mat === 'water' && Math.abs(hi - s.top) < 1e-4;
    if (!skin && !(hi > s.top + 1e-4 && lo < y)) continue;
    const i0 = Math.max(0, Math.round((b.x - b.sx / 2 - x0) / TEXEL));
    const i1 = Math.min(n, Math.round((b.x + b.sx / 2 - x0) / TEXEL));
    const k0 = Math.max(0, Math.round((b.z - b.sz / 2 - z0) / TEXEL));
    const k1 = Math.min(m, Math.round((b.z + b.sz / 2 - z0) / TEXEL));
    for (let k = k0; k < k1; k++)
      for (let i = i0; i < i1; i++) {
        if (skin) color[k * n + i] = b.color;
        else covered[k * n + i] = 1;
      }
  }
  const dark = lin(s.tint.abyss[0]);
  let panes = 0;
  for (let k = 0; k < m; k++) {
    // Runs of equal colour along x become one pane.
    let run: { i: number; c: number } | null = null;
    const flush = (i: number) => {
      if (!run) return;
      p.voxels.span(x0 + run.i * TEXEL, s.top, z0 + k * TEXEL, x0 + i * TEXEL, s.top + FX_LIFT, z0 + (k + 1) * TEXEL, run.c, 'water', { merge: 1 | 2 | 16 | 32, src });
      panes++;
      run = null;
    };
    for (let i = 0; i < n; i++) {
      const a = k * n + i;
      const level = color[a] < 0 || covered[a] ? 0 : ringLevel(field(x0 + (i + 0.5) * TEXEL, z0 + (k + 0.5) * TEXEL));
      const c = level ? hexOf(ringColor(lin(color[a]), level, dark)) : -1;
      if (run && run.c !== c) flush(i);
      if (c >= 0 && !run) run = { i, c };
    }
    flush(n);
  }
  return panes;
}

// ── The effects plane ────────────────────────────────────────────────────────

export interface WaterFxOptions {
  /** The water's sides, as given to `water()` (default all `'glass'`): the plane keeps off glass rims. */
  sides?: Partial<Record<WaterSide, WaterEdge>>;
  /** Mirror the scene (default true; false: only the sky gradient reflects). */
  mirror?: boolean;
  /**
   * Wind on the water, 0‥1: 0 = still (a faint undulation; the reflection
   * nearly whole), 1 = a breeze of ≈ 3 m/s (the reflection broken into
   * strips, patches of fine ripples dulling it).
   */
  breeze?: number;
  /** How strongly it mirrors, 0‥1 (default 1). */
  reflect?: number;
  ripples?: RippleSet;
  /** Wind direction (radians about +Y from +X; default a little north of west, like the game's afternoon). */
  wind?: number;
}

/**
 * Wave slopes (rms, radians) the reflection is broken by: glassy water
 * (wind < 0.5 m/s, a sheltered moat) and a breeze of ≈ 3 m/s — Cox & Munk's
 * sea-surface slopes (σ² ≈ 0.008 + 0.0016 U on a slick) scaled down for the
 * moat's short fetch. See the §17.2 reflection asset.
 */
export const WAVE_SLOPE = { still: 0.012, breezy: 0.07 } as const;

/** Rectangle of the plane: the surface less a texel on each glass side. */
function inset(s: WaterSurface, sides: Partial<Record<WaterSide, WaterEdge>> = {}): [number, number, number, number] {
  const g = (side: WaterSide) => ((sides[side] ?? 'glass') === 'glass' ? TEXEL : 0);
  return [s.x0 + g('nx'), s.z0 + g('nz'), s.x1 - g('px'), s.z1 - g('pz')];
}

/**
 * Add the effects plane to a piece (see the file comment): the reflection,
 * breeze and ripples of one water surface. Returns the plane (already in
 * `p.extras`).
 */
export function waterFx(p: PieceBuilder, s: WaterSurface, o: WaterFxOptions = {}): Object3D {
  const [x0, z0, x1, z1] = inset(s, o.sides);
  const geo = new PlaneGeometry(x1 - x0, z1 - z0);
  geo.rotateX(-Math.PI / 2);
  const material = fxMaterial(s, o, [(x0 + x1) / 2, (z0 + z1) / 2]);
  const mesh = new WaterFxMesh(geo, material);
  mesh.name = 'water-fx';
  mesh.position.set((x0 + x1) / 2, s.top + FX_LIFT, (z0 + z1) / 2);
  mesh.renderOrder = 1;
  mesh.userData.animated = true;
  p.extras.push(mesh);
  return mesh;
}

/** Every effects material: hidden while a mirror is drawn (no plane shows in another's reflection). */
const FX_MATERIALS = new Set<ShaderMaterial>();

function fxMaterial(s: WaterSurface, o: WaterFxOptions, centre: [number, number]): ShaderMaterial {
  const breeze = Math.min(1, Math.max(0, o.breeze ?? 0));
  const src = (o.ripples?.sources ?? []).slice(0, MAX_SOURCES);
  const vec4s = () => Array.from({ length: MAX_SOURCES }, () => new Vector4());
  const [a, b, c] = [vec4s(), vec4s(), vec4s()];
  src.forEach((q, i) => {
    // (in the plane's own frame: centred on it)
    a[i].set(q.x - centre[0], q.z - centre[1], q.r0, q.amp);
    b[i].set(q.every, q.life, q.age, q.wander);
    c[i].set(q.echo[0], q.echo[1], reach(q), 0);
  });
  const rn = o.ripples?.rain;
  const wind = o.wind ?? Math.PI * 0.9;
  const tone = (hex: number) => new Color(hex);
  const material = new ShaderMaterial({
    name: 'water-fx',
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        tMirror: { value: null },
        uMirrorMatrix: { value: new Matrix4() },
        uMirrorScale: { value: new Vector2(1, 1) },
        uMirrorOn: { value: 0 },
        uLocal: { value: new Matrix4() },
        uLocalInv: { value: new Matrix4() },
        uParentWorld: { value: new Matrix4() },
        uTime: { value: 0 },
        uTexel: { value: TEXEL },
        uLift: { value: FX_LIFT },
        uFresnel: { value: new Vector2(0.2, 0.85).multiplyScalar(o.reflect ?? 1) },
        uReflTint: { value: new Vector3(0.74, 0.84, 0.97) },
        uSkyTop: { value: tone(0x6fa3d8) },
        uSkyHorizon: { value: tone(0xe9e4d2) },
        uCloud: { value: tone(0xf6f3ea) },
        uDeep: { value: tone(s.tint.abyss[0]) },
        uRingLight: { value: tone(0xcfe6ea) },
        uWave: { value: new Vector4(WAVE_SLOPE.still + (WAVE_SLOPE.breezy - WAVE_SLOPE.still) * breeze, breeze, Math.cos(wind), Math.sin(wind)) },
        uSrcN: { value: src.length },
        uSrcA: { value: a },
        uSrcB: { value: b },
        uSrcC: { value: c },
        uRain: { value: new Vector3(rn?.rate ?? 0, rn?.life ?? 1, rn?.amp ?? 0) },
      },
    ]),
    defines: { MAX_SOURCES, RING_GAIN: RING_GAIN.toFixed(3), RAIN_CELL: RAIN_CELL.toFixed(4), ORTHO_REACH: '3.0', CALM: RIPPLE.calm.toFixed(3), FRONT: RIPPLE.front.toFixed(3), LEAN: `vec2(${LEAN[0]}, ${LEAN[1]})` },
    vertexShader: FX_VERTEX,
    fragmentShader: FX_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -4,
  });
  material.userData.mirror = o.mirror ?? true;
  FX_MATERIALS.add(material);
  material.addEventListener('dispose', () => FX_MATERIALS.delete(material));
  return material;
}

/**
 * The effects plane. Its hook runs as it is drawn: it brings the mirror image
 * for this camera and height up to date (shared, see {@link mirrorFor}) and
 * sets the per-draw uniforms (clones share the material, so each draw sets its
 * own frame). A class, so clones keep the hook; it takes no part in picking.
 */
class WaterFxMesh extends Mesh<BufferGeometry, ShaderMaterial> {
  private readonly localInv = new Matrix4();

  override raycast(): void {}

  override onBeforeRender(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
    const m = this.material;
    const u = m.uniforms;
    this.localInv.copy(this.matrix).invert();
    u.uLocal.value = this.matrix;
    u.uLocalInv.value = this.localInv;
    u.uParentWorld.value = this.parent ? this.parent.matrixWorld : IDENTITY;
    u.uTime.value = fxClock.now();
    const slot = m.userData.mirror && WATER_FX.mirror ? mirrorFor(renderer, scene, camera, this.matrixWorld.elements[13] - FX_LIFT) : null;
    u.uMirrorOn.value = slot ? 1 : 0;
    if (slot) {
      u.tMirror.value = slot.rt.texture;
      u.uMirrorMatrix.value = slot.matrix;
      u.uMirrorScale.value = slot.scale;
    }
    m.uniformsNeedUpdate = true;
  }
}

const IDENTITY = new Matrix4();

// ── The mirror ───────────────────────────────────────────────────────────────

/** A mirror image: the scene seen from the camera mirrored in the plane y = height. */
interface MirrorSlot {
  height: number;
  /** Camera and frame it was drawn for. */
  key: string;
  rt: WebGLRenderTarget;
  /** World → mirror texture coordinates (projective). */
  matrix: Matrix4;
  /** Share of the render target the image fills. */
  scale: Vector2;
  persp: PerspectiveCamera;
  ortho: OrthographicCamera;
  used: number;
}

interface MirrorPool {
  slots: MirrorSlot[];
  /** Mirror renders so far: `info.render.frame` less these counts the outer frames. */
  inner: number;
  busy: boolean;
}

const pools = new WeakMap<WebGLRenderer, MirrorPool>();
/** Render targets kept (one per water height seen in a frame; more share them). */
const MAX_SLOTS = 3;
/** The mirror clips a little above the surface, so the water's own top never shows in it. */
const CLIP_BIAS = 0.01;

const _v4 = new Vector4();
const _q = new Vector4();
const _c4 = new Vector4();
const _pos = new Vector3();
const _look = new Vector3();
const _up = new Vector3();
const _rot = new Matrix4();
const _inv = new Matrix4();
const _plane = new Plane();
const _clear = new Color();
const BIAS = new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);

/**
 * The mirror image for this camera at this water height, drawn now unless
 * this frame already has it. Null when the camera is under the water, looks
 * along it or up, or while a mirror is being drawn.
 */
function mirrorFor(renderer: WebGLRenderer, scene: Scene, camera: Camera, height: number): MirrorSlot | null {
  let pool = pools.get(renderer);
  if (!pool) pools.set(renderer, (pool = { slots: [], inner: 0, busy: false }));
  if (pool.busy) return null;
  const persp = (camera as PerspectiveCamera).isPerspectiveCamera === true;
  if (!persp && (camera as OrthographicCamera).isOrthographicCamera !== true) return null;
  const cam = camera as PerspectiveCamera | OrthographicCamera;
  _rot.extractRotation(cam.matrixWorld);
  _look.set(0, 0, -1).applyMatrix4(_rot);
  _pos.setFromMatrixPosition(cam.matrixWorld);
  if (persp ? _pos.y <= height + 0.02 : _look.y > -0.02) return null;

  const h = Math.round(height * 1000) / 1000;
  const key = `${cam.id}:${renderer.info.render.frame - pool.inner}`;
  let slot = pool.slots.find((q) => q.height === h);
  if (slot && slot.key === key) return slot;
  if (!slot) {
    if (pool.slots.length < MAX_SLOTS) {
      const half = renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float');
      slot = {
        height: h,
        key: '',
        rt: new WebGLRenderTarget(16, 16, { type: half ? HalfFloatType : UnsignedByteType, samples: 0 }),
        matrix: new Matrix4(),
        scale: new Vector2(1, 1),
        persp: new PerspectiveCamera(),
        ortho: new OrthographicCamera(),
        used: 0,
      };
      slot.rt.texture.name = 'water-fx mirror';
      pool.slots.push(slot);
    } else slot = pool.slots.reduce((a, b) => (a.used <= b.used ? a : b));
    slot.height = h;
  }
  slot.used = pool.inner;

  // Size: a share of the view, capped, in a render target that only grows.
  renderer.getCurrentViewport(_v4);
  let w = Math.max(16, Math.round(_v4.z * WATER_FX.resolution));
  let hh = Math.max(16, Math.round(_v4.w * WATER_FX.resolution));
  const cap = WATER_FX.maxSize / Math.max(w, hh);
  if (cap < 1) [w, hh] = [Math.max(16, Math.round(w * cap)), Math.max(16, Math.round(hh * cap))];
  if (slot.rt.width < w || slot.rt.height < hh) slot.rt.setSize(Math.max(slot.rt.width, w), Math.max(slot.rt.height, hh));
  slot.rt.viewport.set(0, 0, w, hh);
  slot.scale.set(w / slot.rt.width, hh / slot.rt.height);

  // The mirrored camera: position, view and up reflected in the plane.
  const v = persp ? slot.persp : slot.ortho;
  if (persp) (v as PerspectiveCamera).copy(cam as PerspectiveCamera, false);
  else {
    const o = v as OrthographicCamera;
    o.copy(cam as OrthographicCamera, false);
    // (the mirrored scene lies deeper than the view's fitted depth range: widen it)
    o.near = cam.near - 200;
    o.far = cam.far + 200;
    o.updateProjectionMatrix();
  }
  _up.set(0, 1, 0).applyMatrix4(_rot);
  v.position.set(_pos.x, 2 * h - _pos.y, _pos.z);
  v.up.set(_up.x, -_up.y, _up.z);
  v.lookAt(_pos.x + _look.x, 2 * h - _pos.y - _look.y, _pos.z + _look.z);
  v.updateMatrixWorld(true);
  if (persp) v.projectionMatrix.copy(cam.projectionMatrix);
  slot.matrix.copy(BIAS).multiply(v.projectionMatrix).multiply(v.matrixWorldInverse);

  // Clip at the surface: the projection's near plane becomes the water plane (Lengyel's oblique frustum).
  _plane.set(_up.set(0, 1, 0), -(h + CLIP_BIAS)).applyMatrix4(v.matrixWorldInverse);
  _c4.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
  const P = v.projectionMatrix;
  const e = P.elements;
  _inv.copy(P).invert();
  _q.set(Math.sign(_c4.x), Math.sign(_c4.y), 1, 1).applyMatrix4(_inv);
  const cq = _c4.dot(_q);
  if (Math.abs(cq) > 1e-9) {
    const k = (2 * (e[3] * _q.x + e[7] * _q.y + e[11] * _q.z + e[15] * _q.w)) / cq;
    e[2] = k * _c4.x - e[3];
    e[6] = k * _c4.y - e[7];
    e[10] = k * _c4.z - e[11];
    e[14] = k * _c4.w - e[15];
    v.projectionMatrixInverse.copy(P).invert();
  }

  // Draw it: no effects planes, shadows reused, cleared to nothing (the shader's sky shows there).
  const target = renderer.getRenderTarget();
  const xr = renderer.xr.enabled;
  const shadows = renderer.shadowMap.autoUpdate;
  const autoClear = renderer.autoClear;
  renderer.getClearColor(_clear);
  const alpha = renderer.getClearAlpha();
  const shown: Material[] = [];
  for (const mat of FX_MATERIALS)
    if (mat.visible) {
      mat.visible = false;
      shown.push(mat);
    }
  pool.busy = true;
  renderer.xr.enabled = false;
  renderer.shadowMap.autoUpdate = false;
  renderer.autoClear = false;
  renderer.setRenderTarget(slot.rt);
  renderer.state.buffers.depth.setMask(true);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene, v);
  pool.inner++;
  renderer.setRenderTarget(target);
  renderer.setClearColor(_clear, alpha);
  renderer.autoClear = autoClear;
  renderer.shadowMap.autoUpdate = shadows;
  renderer.xr.enabled = xr;
  pool.busy = false;
  for (const mat of shown) mat.visible = true;
  slot.key = `${cam.id}:${renderer.info.render.frame - pool.inner}`;
  return slot;
}

// ── Shaders ──────────────────────────────────────────────────────────────────

const FX_VERTEX = /* glsl */ `
uniform mat4 uLocal;
varying vec3 vParent;
varying vec3 vWorld;
#include <fog_pars_vertex>
void main() {
  // The parent's space is the one the voxels' texel patterns live in.
  vParent = (uLocal * vec4(position, 1.0)).xyz;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const FX_FRAGMENT = /* glsl */ `
uniform sampler2D tMirror;
uniform mat4 uMirrorMatrix;
uniform vec2 uMirrorScale;
uniform float uMirrorOn;
uniform mat4 uLocalInv;
uniform mat4 uLocal;
uniform mat4 uParentWorld;
uniform float uTime;
uniform float uTexel;
uniform float uLift;
uniform vec2 uFresnel;
uniform vec3 uReflTint;
uniform vec3 uSkyTop;
uniform vec3 uSkyHorizon;
uniform vec3 uCloud;
uniform vec3 uDeep;
uniform vec3 uRingLight;
uniform vec4 uWave;
uniform int uSrcN;
uniform vec4 uSrcA[MAX_SOURCES];
uniform vec4 uSrcB[MAX_SOURCES];
uniform vec4 uSrcC[MAX_SOURCES];
uniform vec3 uRain;
varying vec3 vParent;
varying vec3 vWorld;
#include <fog_pars_fragment>

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

// One ring set tau seconds old, d metres out from its source's rim: height, radial slope (see RIPPLE in water-fx.ts).
vec2 ringSet(float d, float tau, float life, float cell) {
  if (tau <= 0.0 || tau >= life) return vec2(0.0);
  float dd = max(d, 0.03);
  float v = dd / tau;
  float lambda = 25.1327 * v * v / 9.81;
  float f = tau / life;
  float env = smoothstep(CALM, CALM + 0.035, v) * (1.0 - smoothstep(FRONT, FRONT + 0.1, v))
    * smoothstep(1.6 * cell, 2.4 * cell, lambda) * RING_GAIN * (1.0 - f * f) * inversesqrt(1.0 + 1.2 * dd);
  float ph = 9.81 * tau * tau / (4.0 * dd);
  return env * vec2(cos(ph), sin(ph));
}

// Height and slope (xz) of every ring at a point of the plane's own frame.
vec3 ripples(vec2 p, float cell) {
  vec3 acc = vec3(0.0);
  for (int i = 0; i < MAX_SOURCES; i++) {
    if (i >= uSrcN) break;
    vec4 a = uSrcA[i];
    vec4 b = uSrcB[i];
    vec4 c = uSrcC[i];
    if (length(p - a.xy) > c.z) continue;
    float tt = uTime + b.z;
    float cyc = floor(tt / b.x);
    for (int k = 0; k < 3; k++) {
      float tau = tt - (cyc - float(k)) * b.x;
      if (tau >= b.y + c.x) break;
      vec2 at = a.xy + (hash22(vec2(cyc - float(k), float(i))) - 0.5) * 2.0 * b.w;
      vec2 dv = p - at;
      float r = max(length(dv), 1e-4);
      vec2 w = ringSet(max(0.0, r - a.z), tau, b.y, cell) * a.w;
      if (c.y > 0.0) w += ringSet(max(0.0, r - a.z), tau - c.x, b.y * 0.7, cell) * a.w * c.y;
      acc += vec3(w.x, dv / r * w.y);
    }
  }
  if (uRain.x > 0.0) {
    float period = 1.0 / (uRain.x * RAIN_CELL * RAIN_CELL);
    vec2 cc = floor(p / RAIN_CELL);
    for (int di = -1; di <= 1; di++)
      for (int dk = -1; dk <= 1; dk++) {
        vec2 ci = cc + vec2(float(di), float(dk));
        float tt = uTime + hash12(ci) * period;
        float cyc = floor(tt / period);
        for (int k = 0; k < 2; k++) {
          float n = cyc - float(k);
          float tau = tt - n * period;
          if (tau >= uRain.y) break;
          vec2 at = (ci + hash22(ci + vec2(n * 7.13, -n * 3.71))) * RAIN_CELL;
          vec2 dv = p - at;
          float r = max(length(dv), 1e-4);
          vec2 w = ringSet(r, tau, uRain.y, cell) * uRain.z;
          acc += vec3(w.x, dv / r * w.y);
        }
      }
  }
  return acc;
}

void main() {
  bool ortho = projectionMatrix[3][3] > 0.5;
  // Screen axes laid on the water: across (the view's right) and along (towards the camera).
  vec2 across = normalize(vec2(viewMatrix[0][0], viewMatrix[2][0]) + vec2(1e-5, 0.0));
  vec2 along = vec2(-across.y, across.x);
  // Texels of the kit grid near by; far away, cells a few pixels wide (so it never shimmers).
  float fa = fwidth(dot(vParent.xz, across));
  float fb = fwidth(dot(vParent.xz, along));
  float cell = uTexel * exp2(max(0.0, ceil(log2(fa * 1.2 / uTexel))));
  float strip = uTexel * exp2(max(0.0, ceil(log2(fb * 1.5 / uTexel))));
  vec2 q = (floor(vParent.xz / cell) + 0.5) * cell;
  vec3 qw = (uParentWorld * vec4(q.x, vParent.y - uLift, q.y, 1.0)).xyz;
  vec2 local = (uLocalInv * vec4(q.x, vParent.y, q.y, 1.0)).xz;

  // ── Waves: the still water's faint undulation, cat's paws in a breeze, the ripple rings ──
  float breeze = uWave.y;
  float t = uTime * mix(0.35, 1.0, breeze);
  float sb = dot(q, along);
  float row = floor(sb / strip);
  float seg = floor(dot(q, across) / (max(cell, strip) * 7.0) + hash12(vec2(row, 5.3)));
  vec2 wind = uWave.zw;
  float paws = breeze * smoothstep(0.5, 0.78, vnoise(vec3((q - wind * uTime * 0.6) * 0.45, uTime * 0.05)));
  float sigma = uWave.x * (1.0 + 1.6 * paws);
  vec2 slope = (vec2(vnoise(vec3(row * 0.71, seg * 1.37, t)), vnoise(vec3(row * 0.53 + 17.0, seg * 0.91, t * 1.3))) - 0.5) * 3.4 * sigma;
  vec3 rip = ripples(local, cell);
  vec2 ripSlope = (mat3(uLocal) * vec3(rip.y, 0.0, rip.z)).xz;
  // (ring slopes are per unit of the envelope: a strong ring tilts the water ≈ 0.12 rad)
  slope += vec2(dot(ripSlope, across), dot(ripSlope, along)) * 0.12;
  vec2 slopeW = across * slope.x + along * slope.y;

  // ── Reflection ──
  vec3 V = ortho ? normalize(vec3(viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2])) : normalize(cameraPosition - qw);
  vec3 N = normalize(vec3(-slopeW.x, 1.0, -slopeW.y));
  float cosT = clamp(dot(N, V), 0.0, 1.0);
  float R = mix(uFresnel.x, uFresnel.y, pow(1.0 - cosT, 3.0)) * (1.0 - 0.35 * paws);
  vec3 r = reflect(-V, N);
  float up = max(r.y, 0.02);
  vec3 sky = mix(uSkyHorizon, uSkyTop, pow(min(1.0, up * 1.8), 0.75));
  vec2 cp = qw.xz + r.xz / up * 6.0;
  float cloud = smoothstep(0.56, 0.7, vnoise(vec3(cp * 0.32, 0.5)) * 0.65 + vnoise(vec3(cp * 0.9, 2.5)) * 0.35);
  sky = mix(sky, uCloud, cloud * 0.85);
  vec3 refl = sky;
  if (uMirrorOn > 0.5) {
    vec4 tc = uMirrorMatrix * vec4(qw, 1.0);
    vec2 uv = tc.xy / tc.w;
    // A facet tilted by s turns the reflected ray by 2s: in perspective that is an angle, in the studio's
    // orthographic views a shift of what stands ≈ ORTHO_REACH m behind the point.
    vec2 k = vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * (ortho ? ORTHO_REACH : 1.0);
    uv += slope * k;
    vec4 m = texture2D(tMirror, clamp(uv, vec2(0.002), vec2(0.998)) * uMirrorScale);
    refl = mix(sky, m.rgb, clamp(m.a, 0.0, 1.0));
  }
  refl = mix(refl * uReflTint, uDeep, 0.12);

  // ── Ripple and cat's-paw texels: lighter crests and facets turned to the light, darker troughs ──
  float lv = rip.x * 0.75 - dot(ripSlope, LEAN) * 0.45;
  float spark = hash12(floor(q / cell) + floor(uTime * 3.0) * 13.7);
  lv += paws * (spark > 0.9 ? 0.8 : (spark < 0.12 ? -0.6 : 0.0));
  float level = lv > 0.5 ? 2.0 : (lv > 0.2 ? 1.0 : (lv < -0.5 ? -2.0 : (lv < -0.2 ? -1.0 : 0.0)));
  float w = abs(level) * (level > 0.0 ? 0.2 : 0.14);
  vec3 ring = level > 0.0 ? uRingLight : uDeep;
  float alpha = 1.0 - (1.0 - R) * (1.0 - w);
  vec3 color = (refl * R * (1.0 - w) + ring * w) / max(alpha, 1e-4);

  gl_FragColor = vec4(color, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;
