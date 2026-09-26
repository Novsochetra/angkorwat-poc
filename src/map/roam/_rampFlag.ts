import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshStandardMaterial, Sphere, Vector3 } from 'three';
import { hash3 } from '../../voxel/random';
import { weatherNow } from '../sky/weather';
import { FLAG_ASPECT, flagTexture } from './_flag';

/**
 * The flag of Cambodia flying from a take-off ramp's mast (_launchRamp.ts),
 * big enough to find the ramp by from a few hundred metres.
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

export class RampFlag {
  readonly object: Mesh;
  private readonly geo = new BufferGeometry();
  private readonly pos: BufferAttribute;
  /** Where each strip's edge is (flag space, reused every frame). */
  private readonly ex = new Float32Array(COLS + 1);
  private readonly ez = new Float32Array(COLS + 1);
  /** The ripple's phase (rad) and the time it was last moved (s). */
  private clock = 0;
  private lastT = 0;

  constructor(seed: number) {
    const n = (COLS + 1) * (ROWS + 1);
    const uv = new Float32Array(n * 2);
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
    this.pos = new BufferAttribute(new Float32Array(n * 3), 3);
    this.geo.setAttribute('position', this.pos);
    this.geo.setAttribute('uv', new BufferAttribute(uv, 2));
    this.geo.setIndex(index);
    // (it waves out of its flat shape: a sphere round all it can reach)
    this.geo.boundingSphere = new Sphere(new Vector3(FLAG.width / 2, -FLAG.height / 2, 0), FLAG.width / 2 + 1.5);
    this.object = new Mesh(this.geo, cloth());
    this.object.name = 'launchRamp:flag';
    this.object.castShadow = true;
    this.object.receiveShadow = true;
    this.clock = hash3(seed, 5, 2, 73) * 30;
    this.update(0, 0.5, 0);
  }

  /** Wave in the breeze: `t` the time (s), `gust` how strong it blows (0 a lull … 1), `night` 0‥1; the weather's wind on top. */
  update(t: number, gust: number, night: number): void {
    const cw = FLAG.width / COLS;
    // (the weather's wind: a lull only in calm air; in a strong wind it snaps quick and flies out flatter)
    const wind = weatherNow().wind;
    gust = Math.min(1, gust * (1 - wind) + wind * (0.7 + 0.3 * gust) + wind * 0.3);
    const pace = PACE * (0.75 + 0.5 * gust + 2 * wind);
    // (the ripple runs on its own clock at the pace of the moment, so a change of pace never jumps it)
    this.clock += Math.min(0.1, Math.max(0, t - this.lastT)) * pace;
    this.lastT = t;
    const swing = (0.6 + 0.4 * gust) * (1 - 0.35 * wind);
    // Each strip turned a little, more towards the fly end, in a ripple running out along it.
    for (let c = 0; c < COLS; c++) {
      const a = (TURN_HOIST + (TURN_FLY - TURN_HOIST) * (c / (COLS - 1))) * swing * Math.sin(this.clock - c * WAVE);
      this.ex[c + 1] = this.ex[c] + Math.cos(a) * cw;
      this.ez[c + 1] = this.ez[c] - Math.sin(a) * cw;
    }
    const droop = DROOP * (1 - gust);
    const p = this.pos.array as Float32Array;
    for (let r = 0; r <= ROWS; r++)
      for (let c = 0; c <= COLS; c++) {
        const i = (r * (COLS + 1) + c) * 3;
        const k = c / COLS;
        p[i] = this.ex[c];
        p[i + 1] = -(r / ROWS) * FLAG.height - droop * k * k;
        p[i + 2] = this.ez[c];
      }
    this.pos.needsUpdate = true;
    this.geo.computeVertexNormals();
    cloth().emissiveIntensity = NIGHT_LIT * night;
  }
}
