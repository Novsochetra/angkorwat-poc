import { BufferAttribute, BufferGeometry, Color, DynamicDrawUsage, Group, Line, LineBasicMaterial, type Object3D } from 'three';
import { Kite, seasonBreeze, type KiteLook, type KiteWind } from '../people/_kite';
import { Things } from '../people/_things';
import { WIND } from '../sky/haze';
import type { MapWeather } from '../types';

/**
 * What flying his own kite draws (roam/_kiteFly.ts), and the wind it flies in.
 *
 * - **His kite**: a small khleng ek (ខ្លែងឯក, people/_kite.ts: the bird of prey
 *   seen from below, its humming bow on the beak, two palm-leaf tails), 1 m
 *   true (1.4 m drawn, as the people's), in the people's kites' colours: a
 *   red paper sail with a cream border, a gold lozenge on the mother and a
 *   blue one on the child. Its boxes are one InstancedMesh of the people's
 *   things (`Things`: its own, here in roaming's group; the same material as
 *   the people's, so no new shader), with the market's kites for sale
 *   (_kiteStall.ts): one draw and its shadow.
 * - **The line**: a thin sagging curve from his fist to the kite's bridle
 *   knot, one `Line` strip (a pixel wide, as the fishing line), paler by day,
 *   dim at night.
 * - **The wind aloft** (`windAloft`): as the people's kites have it
 *   (_sceneKites.ts `blow`: the weather's direction followed slowly; a steady
 *   breeze over the weather's own), but only in the kite season — the north
 *   wind from after the Water Festival to March (`seasonBreeze`); in the wet
 *   months the air up there is too still for a kite.
 *
 * Nothing is made before it is needed (`createKiteGear` on first use);
 * nothing allocated per frame.
 */

/**
 * His kite (the grandfather's gift, or the market's): a small male khleng ek (pointed wings), its own voice. A
 * red paper sail with a cream border, a gold lozenge on the mother and a blue one on the child (the people's
 * kites' colours: their red borders, the young men's gold): it reads against the sky, and among theirs.
 */
export const HIS_KITE: KiteLook = {
  kind: 'ek',
  tips: 'pointed',
  sail: 0xc8382a,
  edge: 0xf2ead4,
  motif: 0xe8b43a,
  motif2: 0x1f3f9a,
  tail: 0xd8c890,
  size: 1.4,
  line: 0,
  tails: 4.5,
  lineColor: 0xeee8d8,
};

/** The size its ek sings for (m: audio/kite.ts, as the people's `voiceOf`): its own, a pointed (male) kite. */
export const HIS_VOICE = HIS_KITE.size;

/** Points along the line (a sagging curve). */
const LINE_POINTS = 24;
/** The line's colour by day (it dims at night). */
const LINE_DAY = new Color(0.84, 0.81, 0.72);
/** Boxes of the things: his kite (36) and the market's three for sale with their pole (≈ 80). */
const CAPACITY = 128;

export interface KiteGear {
  readonly things: Things;
  /** His kite. */
  readonly kite: Kite;
  /** The line from (ax, ay, az) to his kite's knot, sagging `sag` m at its middle; `night` 0‥1 dims it. */
  line(ax: number, ay: number, az: number, sag: number, night: number): void;
  hideLine(): void;
  /** Once a frame, after everything is placed: what changed goes to the GPU; `on` false: nothing of it is out (no draw). */
  flush(night: number, on: boolean): void;
}

export function createKiteGear(parent: Object3D): KiteGear {
  const group = new Group();
  group.name = 'kite';
  const things = new Things(CAPACITY);
  things.mesh.name = 'kite:things';
  group.add(things.mesh);
  const kite = new Kite(things, HIS_KITE, 0.37, { line: false });
  kite.hide();

  const geo = new BufferGeometry();
  const pos = new BufferAttribute(new Float32Array(LINE_POINTS * 3), 3);
  pos.setUsage(DynamicDrawUsage);
  geo.setAttribute('position', pos);
  geo.setDrawRange(0, 0);
  const mat = new LineBasicMaterial({ color: LINE_DAY, transparent: true, opacity: 0.72, depthWrite: false, fog: true });
  mat.name = 'kite line';
  const strip = new Line(geo, mat);
  strip.name = 'kite:line';
  // (rewritten every frame it shows)
  strip.frustumCulled = false;
  strip.raycast = () => {};
  strip.renderOrder = 3;
  group.add(strip);
  parent.add(group);
  let lineOn = false;

  return {
    things,
    kite,
    line(ax, ay, az, sag, night) {
      const k = kite.knot;
      const a = pos.array as Float32Array;
      for (let i = 0; i < LINE_POINTS; i++) {
        const u = i / (LINE_POINTS - 1);
        a[i * 3] = ax + (k.x - ax) * u;
        a[i * 3 + 1] = ay + (k.y - ay) * u - sag * 4 * u * (1 - u);
        a[i * 3 + 2] = az + (k.z - az) * u;
      }
      pos.needsUpdate = true;
      if (!lineOn) {
        lineOn = true;
        geo.setDrawRange(0, LINE_POINTS);
      }
      mat.color.copy(LINE_DAY).multiplyScalar(1 - 0.7 * night);
    },
    hideLine() {
      if (!lineOn) return;
      lineOn = false;
      geo.setDrawRange(0, 0);
    },
    flush(night, on) {
      group.visible = on;
      if (on) things.flush(night);
    },
  };
}

/** Fair weather for a paper kite: no rain, no storm, no snow (as the people bring theirs in: _sceneKites.ts `fair`). */
export function kiteWeather(w: Readonly<MapWeather>): boolean {
  return w.rain < 0.25 && w.storm < 0.3 && (w.snow ?? 0) < 0.2;
}

/** Less than this wind aloft (`windAloft`) will not hold a kite up. */
export const LIFT = 0.45;

/**
 * The wind aloft his kite flies in (0 still … 1 strong): the people's kites' (a steady breeze over the weather's
 * wind: 0.55 + 0.8 × wind) in the kite season; out of it only the weather's own, not enough to lift a kite.
 */
export function windAloft(w: Readonly<MapWeather>, season: number): number {
  return Math.min(1, Math.max(0, 0.1 + 0.45 * seasonBreeze(season) + 0.8 * w.wind));
}

/**
 * Follow the weather's wind direction slowly (8 s, as the people's kites: _sceneKites.ts `blow`), into `out`
 * (downwind x, z); `dir` is the state (NaN: start where the weather is). Returns the new `dir`.
 */
export function followWind(out: KiteWind, w: Readonly<MapWeather> | undefined, dir: number, dt: number): number {
  const want = w ? w.windDir : Math.atan2(WIND.x, WIND.z);
  if (Number.isNaN(dir)) dir = want;
  else {
    const d = Math.atan2(Math.sin(want - dir), Math.cos(want - dir));
    dir += d * (1 - Math.exp(-Math.max(0, dt) / 8));
  }
  out.x = Math.sin(dir);
  out.z = Math.cos(dir);
  return dir;
}
