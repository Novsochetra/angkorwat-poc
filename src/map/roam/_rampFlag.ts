import { BufferAttribute, BufferGeometry, DoubleSide, DynamicDrawUsage, Mesh, MeshStandardMaterial, Sphere, type Matrix4, type Vector3 } from 'three';
import { hash3 } from '../../voxel/random';
import { weatherNow } from '../sky/weather';
import { FLAG_ASPECT, flagTexture } from './_flag';

/**
 * The flags of Cambodia flying from the take-off ramps' masts
 * (_launchRamp.ts), big enough to find a ramp by from a few hundred metres.
 *
 * A cloth with the flag painted on it (_flag.ts `flagTexture`: the true
 * 25 : 16 rectangle, straight bands, Angkor Wat upright in the middle),
 * seen from both sides (the back shows it through, as a real flag does;
 * the flag is the same both ways round). It is cut in narrow strips from
 * the hoist to the fly and waves by turning them, a little at the hoist
 * and more towards the fly end, in a ripple running out along it: `update`
 * moves the strips' edges (a few dozen points; nothing is rebuilt). The
 * weather's wind (sky/weather.ts) makes it stream out and snap faster, in
 * a storm's gusts hard. At night the beacon above lights it softly.
 *
 * All the ramps' flags are one mesh (one draw): each flag's cloth is worked
 * out in its own space and written where it flies (`update`, with the
 * turn of the mast's top); a flag out of sight is left as it was.
 *
 * Flag space: origin at the top of the hoist (on the mast), +x along the
 * flag to the fly end, +y up (the flag hangs below its origin).
 */

export const FLAG = {
  /** Size (m): the flag's own shape at this height. */
  height: 4,
  width: 4 * FLAG_ASPECT,
};

/** Strips across, and rows down (they only let the fly end droop). */
const COLS = 24;
const ROWS = 3;
/** Points of one flag. */
const N = (COLS + 1) * (ROWS + 1);
/** The ripple: how far a strip turns at the hoist and at the fly end (rad), its pace (rad/s) and wave number (rad per strip). */
const TURN_HOIST = 0.08;
const TURN_FLY = 0.5;
const PACE = 2.6;
const WAVE = 0.5;
/** In a lull the fly end droops (m). */
const DROOP = 0.35;
/** At night the beacon above lights it: its own colours, this bright. */
const NIGHT_LIT = 0.3;

let material: MeshStandardMaterial | null = null;

/** The cloth, one for every ramp's flag (they are all lit alike). */
function cloth(): MeshStandardMaterial {
  material ??= new MeshStandardMaterial({ map: flagTexture(), emissiveMap: flagTexture(), emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.9, metalness: 0, side: DoubleSide });
  return material;
}

/** The strips' corners of one flag (`index`, `uv`: a point is `r · (COLS + 1) + c`, row `r` down, strip edge `c` along). */
function grid(): { uv: Float32Array; index: number[] } {
  const uv = new Float32Array(N * 2);
  const index: number[] = [];
  for (let r = 0; r <= ROWS; r++)
    for (let c = 0; c <= COLS; c++) {
      const i = r * (COLS + 1) + c;
      uv[i * 2] = c / COLS;
      uv[i * 2 + 1] = 1 - r / ROWS;
    }
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const a = r * (COLS + 1) + c;
      index.push(a, a + COLS + 1, a + 1, a + 1, a + COLS + 1, a + COLS + 2);
    }
  return { uv, index };
}

export class RampFlags {
  readonly object: Mesh;
  private readonly pos: BufferAttribute;
  private readonly nor: BufferAttribute;
  /** Where each strip's edge is (flag space, reused every frame). */
  private readonly ex = new Float32Array(COLS + 1);
  private readonly ez = new Float32Array(COLS + 1);
  /** Each flag's ripple phase (rad) and the time it was last moved (s). */
  private readonly clock: Float32Array;
  private readonly lastT: Float32Array;

  /** `hoists`: where each flag's hoist is (world; the bounds), `seeds` their ripples' phases. */
  constructor(hoists: readonly Vector3[], seeds: readonly number[]) {
    const n = hoists.length;
    const { uv, index } = grid();
    const all = new BufferGeometry();
    this.pos = new BufferAttribute(new Float32Array(n * N * 3), 3).setUsage(DynamicDrawUsage);
    this.nor = new BufferAttribute(new Float32Array(n * N * 3), 3).setUsage(DynamicDrawUsage);
    const uvs = new Float32Array(n * N * 2);
    const idx: number[] = [];
    for (let f = 0; f < n; f++) {
      uvs.set(uv, f * N * 2);
      for (const i of index) idx.push(i + f * N);
    }
    all.setAttribute('position', this.pos);
    all.setAttribute('normal', this.nor);
    all.setAttribute('uv', new BufferAttribute(uvs, 2));
    all.setIndex(idx);
    // (they wave out of their flat shape and turn on their masts: a sphere round all they can reach)
    const s = new Sphere().setFromPoints(hoists as Vector3[]);
    s.radius += FLAG.width + 1.5;
    all.boundingSphere = s;
    this.object = new Mesh(all, cloth());
    this.object.name = 'launchRamp:flags';
    this.object.castShadow = true;
    this.object.receiveShadow = true;
    this.clock = Float32Array.from(seeds, (seed) => hash3(seed, 5, 2, 73) * 30);
    this.lastT = new Float32Array(n);
  }

  /**
   * Wave flag `i` in the breeze: `t` the time (s), `gust` how strong it blows (0 a lull … 1), `night` 0‥1, `place`
   * its flag space in the world (the mast's top, turned); the weather's wind on top. `move` false (out of sight):
   * only the night light follows; the cloth keeps its shape and place, and nothing is uploaded.
   */
  update(i: number, t: number, gust: number, night: number, move: boolean, place: Matrix4): void {
    cloth().emissiveIntensity = NIGHT_LIT * night;
    if (!move) return;
    const cw = FLAG.width / COLS;
    // (the weather's wind: a lull only in calm air; in a strong wind it snaps quick and flies out flatter)
    const wind = weatherNow().wind;
    gust = Math.min(1, gust * (1 - wind) + wind * (0.7 + 0.3 * gust) + wind * 0.3);
    const pace = PACE * (0.75 + 0.5 * gust + 2 * wind);
    // (the ripple runs on its own clock at the pace of the moment, so a change of pace never jumps it)
    this.clock[i] += Math.min(0.1, Math.max(0, t - this.lastT[i])) * pace;
    this.lastT[i] = t;
    const swing = (0.6 + 0.4 * gust) * (1 - 0.35 * wind);
    // Each strip turned a little, more towards the fly end, in a ripple running out along it.
    for (let c = 0; c < COLS; c++) {
      const a = (TURN_HOIST + (TURN_FLY - TURN_HOIST) * (c / (COLS - 1))) * swing * Math.sin(this.clock[i] - c * WAVE);
      this.ex[c + 1] = this.ex[c] + Math.cos(a) * cw;
      this.ez[c + 1] = this.ez[c] - Math.sin(a) * cw;
    }
    const droop = DROOP * (1 - gust);
    // Where it flies (the mast's top, turned: a turn and a move, no scale): each point placed, each strip's
    // normal turned. A strip hangs straight down between its two edges, so a point's normal lies flat, across
    // the edges either side of it (as three's computeVertexNormals would find it, without its work).
    const e = place.elements;
    const out = this.pos.array as Float32Array;
    const outN = this.nor.array as Float32Array;
    const { ex, ez } = this;
    for (let c = 0; c <= COLS; c++) {
      const k = c / COLS;
      const sag = droop * k * k;
      const x = ex[c];
      const z = ez[c];
      const dx = ex[Math.min(COLS, c + 1)] - ex[Math.max(0, c - 1)];
      const dz = ez[Math.min(COLS, c + 1)] - ez[Math.max(0, c - 1)];
      const l = 1 / Math.sqrt(dx * dx + dz * dz);
      const nx = -dz * l;
      const nz = dx * l;
      const wnx = e[0] * nx + e[8] * nz;
      const wny = e[1] * nx + e[9] * nz;
      const wnz = e[2] * nx + e[10] * nz;
      for (let r = 0; r <= ROWS; r++) {
        const y = -(r / ROWS) * FLAG.height - sag;
        const o = (i * N + r * (COLS + 1) + c) * 3;
        out[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
        out[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
        out[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
        outN[o] = wnx;
        outN[o + 1] = wny;
        outN[o + 2] = wnz;
      }
    }
    touch(this.pos, i * N * 3, N * 3);
    touch(this.nor, i * N * 3, N * 3);
  }
}

/** Send part of an attribute to the GPU; past a few dozen parts (the mesh left out for long), all of it. */
function touch(a: BufferAttribute, start: number, count: number): void {
  if (a.updateRanges.length < 32) a.addUpdateRange(start, count);
  else if (a.updateRanges.length === 32) a.addUpdateRange(0, a.array.length);
  a.needsUpdate = true;
}
