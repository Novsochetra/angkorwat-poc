import {
  AddEquation,
  BufferGeometry,
  Color,
  CustomBlending,
  DataTexture,
  DataUtils,
  DoubleSide,
  DstColorFactor,
  Float32BufferAttribute,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OneFactor,
  RGBAFormat,
  ShaderMaterial,
  Vector3,
  ZeroFactor,
} from 'three';
import { CELL, type HeightField } from '../heightfield';
import { GROUND_LIGHT } from '../people/_groundLight';
import { hazeUniforms } from '../sky/haze';
import { onSquare } from './plan';
import { TOP } from './_sqFloor';
import { FLICKER_GLSL } from './_sqLightFlicker';

/**
 * Light that lies on things (AWP-35; the owner: "layered warm golden illumination: distinct pools of light under
 * lamps and string lights, darker gaps between them, the floor and the ring readable"): one draw that multiplies what
 * is drawn under it by 1 + its light (blending: dst × src + dst), so the pavers, the ring's carving, the gate's stone
 * keep their own tones and shadows and only grow warm and bright where a lamp shines; a dark gap stays dark. No real
 * lights.
 *
 * - **pools** on the land and the floor: under lamps, lanterns, poles, stalls and string lights. Round the square
 *   (`MAP`) they add up into a small light map (a texel ½ m, 1 m on low; baked once) drawn by one mesh, a flat quad on
 *   each land cell that is lit, so overlapping pools add as light does (each quad multiplying the one under it would
 *   burn: × 5 × 5 × 5); a pool farther off is a quad of its own;
 * - **washes** on walls: an uplight's cone from its foot up a wall (the gate's faces), quads lying a few cm in front
 *   of the stone.
 *
 * Under a flame the light flickers with it (`_sqLightFlicker.ts`: the same x, z; in the light map, each texel's
 * brightest flame's). It fades with the haze, at dusk with the night (`uLevel`); `uGain` scales it all (the night's
 * base light on the stone is dim and blue: ≈ 7 makes a lamp's pool gold). It is the first of the see-through draws:
 * it lights the solid world only. Light multiplied over a real lamp's (sky/lampSlots.ts) burns: keep it faint there.
 */

type V3 = { x: number; y: number; z: number };

/** The light map round the square (map m: x0, z0 on the land's 2 m grid, its side). */
const MAP = { x0: 332, z0: -314, size: 116 } as const;
/** The light map's own colour (sRGB): a pool's colour sets only how bright it is there. */
const MAP_LIGHT = 0xffc68a;

/** A pool's light at `q` (its distance over its radius): soft to its rim, a brighter heart (the shader's, too). */
const poolShape = (q: number): number => {
  const t = Math.max(0, Math.min(1, (q - 0.75) / 0.25));
  return (Math.exp(-q * q * 2.8) * 0.8 + Math.exp(-q * q * 9) * 0.35) * (1 - t * t * (3 - 2 * t));
};

export class LightWash {
  private readonly pos: number[] = [];
  private readonly loc: number[] = [];
  private readonly col: number[] = [];
  private readonly shape: number[] = [];
  private readonly src: number[] = [];
  private readonly idx: number[] = [];
  private n = 0;
  private readonly c = new Color();
  /** The light map: texels a side, their size (m); steady light, flames' light, the brightest flame's x, z and light. */
  private readonly texels: number;
  private readonly texel: number;
  private readonly steady: Float32Array;
  private readonly flame: Float32Array;
  private readonly flameAt: Float32Array;
  private readonly flameTop: Float32Array;
  private readonly mapLum: number;

  constructor(
    private readonly field: HeightField,
    low = false,
  ) {
    this.texel = low ? 1 : 0.5;
    this.texels = Math.round(MAP.size / this.texel);
    const n = this.texels * this.texels;
    this.steady = new Float32Array(n);
    this.flame = new Float32Array(n);
    this.flameAt = new Float32Array(n * 2);
    this.flameTop = new Float32Array(n);
    this.c.setHex(MAP_LIGHT);
    this.mapLum = this.c.r + this.c.g + this.c.b;
  }

  get count(): number {
    return this.n;
  }

  /** A round pool at (x, z), `r` m, colour (sRGB) × level; `flick` 0‥1 flickers it with a flame at (fx, fz) (default its middle). */
  pool(x: number, z: number, r: number, color: number, level: number, flick = 0, fx = x, fz = z): void {
    if (x - r >= MAP.x0 && x + r <= MAP.x0 + MAP.size && z - r >= MAP.z0 && z + r <= MAP.z0 + MAP.size) this.splat(x, z, r, color, level, flick, fx, fz);
    else this.quad(x, z, r, color, level, flick, fx, fz);
  }

  /** Into the light map: the pool's light on each texel it reaches. */
  private splat(x: number, z: number, r: number, color: number, level: number, flick: number, fx: number, fz: number): void {
    this.c.setHex(color);
    const k = (level * (this.c.r + this.c.g + this.c.b)) / this.mapLum;
    const s = this.texel;
    const i0 = Math.max(0, Math.floor((x - r - MAP.x0) / s));
    const i1 = Math.min(this.texels - 1, Math.floor((x + r - MAP.x0) / s));
    const j0 = Math.max(0, Math.floor((z - r - MAP.z0) / s));
    const j1 = Math.min(this.texels - 1, Math.floor((z + r - MAP.z0) / s));
    // (the flame's place, on the flicker's own ¼ m grid: exact in a half float, so the floor breathes with its flame)
    const qx = (Math.floor(fx * 4) + 0.5) / 4 - MAP.x0;
    const qz = (Math.floor(fz * 4) + 0.5) / 4 - MAP.z0;
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const q = Math.hypot(MAP.x0 + (i + 0.5) * s - x, MAP.z0 + (j + 0.5) * s - z) / r;
        if (q >= 1) continue;
        const a = k * poolShape(q);
        const t = i + j * this.texels;
        this.steady[t] += a * (1 - flick);
        this.flame[t] += a * flick;
        if (a * flick > this.flameTop[t]) {
          this.flameTop[t] = a * flick;
          this.flameAt[t * 2] = qx;
          this.flameAt[t * 2 + 1] = qz;
        }
      }
  }

  /** A pool of its own (away from the square): a grid draped on the land. */
  private quad(x: number, z: number, r: number, color: number, level: number, flick: number, fx: number, fz: number): void {
    const f = this.field;
    const grid = Math.max(2, Math.min(7, Math.round(r / 1.6)));
    this.c.setHex(color).multiplyScalar(level);
    const base = this.pos.length / 3;
    for (let j = 0; j <= grid; j++)
      for (let i = 0; i <= grid; i++) {
        const u = ((i / grid) * 2 - 1) * r;
        const v = ((j / grid) * 2 - 1) * r;
        const px = x + u;
        const pz = z + v;
        // (over the highest land near the point: block steps stay under it)
        const h = Math.max(f.heightAt(px, pz), f.heightAt(px + 0.9, pz), f.heightAt(px - 0.9, pz), f.heightAt(px, pz + 0.9), f.heightAt(px, pz - 0.9));
        this.vertex(px, h + (onSquare(px, pz, 0.5) ? TOP + 0.04 : 0.1), pz, u, v, 0, r, 0, 0, fx, fz, flick);
      }
    for (let j = 0; j < grid; j++)
      for (let i = 0; i < grid; i++) {
        const a = base + j * (grid + 1) + i;
        this.idx.push(a, a + grid + 1, a + 1, a + 1, a + grid + 1, a + grid + 2);
      }
    this.n++;
  }

  /**
   * An uplight's wash up a wall: its foot `at` on the wall's face (map m), the wall running along (ax, az) (unit,
   * level), facing out along (nx, nz); lit `w0` m wide at its foot, widening `spread` m a metre, fading out by
   * `height` m up; the quad clipped to the wall (`u0`‥`u1` along, `y0`‥`y1` up from the foot).
   */
  wall(at: V3, ax: number, az: number, nx: number, nz: number, w0: number, spread: number, height: number, color: number, level: number, clip: { u0: number; u1: number; y0: number; y1: number }, flick = 0): void {
    this.c.setHex(color).multiplyScalar(level);
    const base = this.pos.length / 3;
    const off = 0.035;
    for (const [u, v] of [
      [clip.u0, clip.y0],
      [clip.u1, clip.y0],
      [clip.u0, clip.y1],
      [clip.u1, clip.y1],
    ])
      this.vertex(at.x + ax * u + nx * off, at.y + v, at.z + az * u + nz * off, u, v, 1, height, w0, spread, at.x, at.z, flick);
    this.idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
    this.n++;
  }

  private vertex(x: number, y: number, z: number, u: number, v: number, kind: number, size: number, w0: number, spread: number, fx: number, fz: number, flick: number): void {
    this.pos.push(x, y, z);
    this.loc.push(u, v);
    this.col.push(this.c.r, this.c.g, this.c.b);
    this.shape.push(kind, size, w0, spread);
    this.src.push(fx, fz, flick);
  }

  /** The light map as a texture, and a flat quad on each lit land cell to draw it on. */
  private bakeMap(): DataTexture {
    const n = this.texels;
    const data = new Uint16Array(n * n * 4);
    let peak = 0;
    for (let t = 0; t < n * n; t++) {
      data[t * 4] = DataUtils.toHalfFloat(this.steady[t]);
      data[t * 4 + 1] = DataUtils.toHalfFloat(this.flame[t]);
      data[t * 4 + 2] = DataUtils.toHalfFloat(this.flameAt[t * 2]);
      data[t * 4 + 3] = DataUtils.toHalfFloat(this.flameAt[t * 2 + 1]);
      peak = Math.max(peak, this.steady[t] + this.flame[t]);
    }
    const tex = new DataTexture(data, n, n, RGBAFormat, HalfFloatType);
    tex.name = 'nye light map';
    tex.magFilter = LinearFilter;
    tex.minFilter = LinearFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    // The cells: one flat quad on each land cell where the light reaches (at its own height, on the floor over the square).
    const f = this.field;
    const per = Math.round(CELL / this.texel);
    this.c.setHex(MAP_LIGHT);
    for (let cz = 0; cz < MAP.size / CELL; cz++)
      for (let cx = 0; cx < MAP.size / CELL; cx++) {
        let lit = 0;
        for (let j = 0; j < per; j++) for (let i = 0; i < per; i++) {
          const t = cx * per + i + (cz * per + j) * n;
          lit = Math.max(lit, this.steady[t] + this.flame[t]);
        }
        if (lit < 0.004 * Math.max(1, peak)) continue;
        const x = MAP.x0 + (cx + 0.5) * CELL;
        const z = MAP.z0 + (cz + 0.5) * CELL;
        const y = f.heightAt(x, z) + (onSquare(x, z, 0.5) ? TOP + 0.04 : 0.1);
        const base = this.pos.length / 3;
        for (const [dx, dz] of [
          [-1, -1],
          [1, -1],
          [-1, 1],
          [1, 1],
        ])
          this.vertex(x + (dx * CELL) / 2, y, z + (dz * CELL) / 2, x + (dx * CELL) / 2, z + (dz * CELL) / 2, 2, 1, 0, 0, 0, 0, 0);
        this.idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
      }
    return tex;
  }

  build(name: string): { mesh: Mesh; u: { uLevel: { value: number }; uGain: { value: number }; uTime: { value: number } } } {
    const map = this.bakeMap();
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('lLoc', new Float32BufferAttribute(this.loc, 2));
    geo.setAttribute('lCol', new Float32BufferAttribute(this.col, 3));
    geo.setAttribute('lShape', new Float32BufferAttribute(this.shape, 4));
    geo.setAttribute('lSrc', new Float32BufferAttribute(this.src, 3));
    geo.setIndex(this.idx);
    geo.computeBoundingSphere();
    const u = {
      ...hazeUniforms(),
      uLevel: { value: 0 },
      uGain: { value: 7 },
      uTime: { value: 0 },
      uMap: { value: map },
      uMapAt: { value: new Vector3(MAP.x0, MAP.z0, 1 / MAP.size) },
    };
    // (the same light on the people standing in it: people/_groundLight.ts; its strength set each frame by square.ts)
    GROUND_LIGHT.uPGround.value = map;
    GROUND_LIGHT.uPGroundAt.value.set(MAP.x0, MAP.z0, 1 / MAP.size, 0);
    const material = new ShaderMaterial({
      name,
      transparent: true,
      depthWrite: false,
      // (dst × src + dst: light on what is there, its own colour and shade kept)
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: DstColorFactor,
      blendDst: OneFactor,
      blendSrcAlpha: ZeroFactor,
      blendDstAlpha: OneFactor,
      // (a wall's wash is seen from its front whichever way it was wound)
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
      fog: true,
      uniforms: u,
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        attribute vec2 lLoc;
        attribute vec3 lCol;
        attribute vec4 lShape;
        attribute vec3 lSrc;
        uniform float uLevel;
        uniform float uGain;
        uniform float uTime;
        varying vec2 vLoc;
        varying vec3 vCol;
        varying vec4 vShape;
        ${FLICKER_GLSL}
        void main() {
          vLoc = lLoc;
          vShape = lShape;
          float fl = 1.0 + 0.16 * lSrc.z * nyeFlicker(lSrc.xy, uTime);
          vCol = lCol * uLevel * uGain * fl;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          if (uLevel < 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        uniform sampler2D uMap;
        uniform vec3 uMapAt;
        uniform float uTime;
        varying vec2 vLoc;
        varying vec3 vCol;
        varying vec4 vShape;
        ${FLICKER_GLSL}
        void main() {
          // A pool of its own: soft to its rim, a brighter heart.
          float q = length(vLoc) / vShape.y;
          float pool = (exp(-q * q * 2.8) * 0.8 + exp(-q * q * 9.0) * 0.35) * (1.0 - smoothstep(0.75, 1.0, q));
          // A wash: an uplight's cone up the wall, hottest just over its foot, widening and fading as it climbs.
          float up = max(vLoc.y, 0.0);
          float wide = vShape.z + up * vShape.w;
          float across = vLoc.x / wide;
          float h = clamp(up / vShape.y, 0.0, 1.0);
          float wash = exp(-across * across * 2.2) * smoothstep(-0.3, 0.4, vLoc.y) * pow(1.0 - h, 1.5) * (0.7 + 0.9 * exp(-up * 0.9));
          // The light map: the steady light, and the flames' breathing with the brightest of them there.
          vec4 m = texture2D(uMap, (vLoc - uMapAt.xy) * uMapAt.z);
          float mapped = m.r + m.g * (1.0 + 0.16 * nyeFlicker(uMapAt.xy + m.ba, uTime));
          // (by kind: a table, not a branch)
          vec3 kind = vec3(step(vShape.x, 0.5), step(0.5, vShape.x) * step(vShape.x, 1.5), step(1.5, vShape.x));
          vec3 col = vCol * max(dot(kind, vec3(pool, wash, mapped)), 0.0);
          #ifdef USE_FOG
            vec3 hzRay = vFogWorld - cameraPosition;
            float hzDist = length(hzRay);
            float low = hazeLowAmount(cameraPosition, vFogWorld, hzDist, hazeBanks(vFogWorld.xz).x);
            col *= (1.0 - hazeDistance(hzDist)) * (1.0 - 0.6 * low);
          #endif
          if (max(col.r, max(col.g, col.b)) < 0.004) discard;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const mesh = new Mesh(geo, material);
    mesh.name = name;
    // (first of the see-through draws: it lights the solid world only; drawn after any glow, it would multiply that
    // glow too)
    mesh.renderOrder = -50;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.raycast = () => {};
    return { mesh, u };
  }
}
