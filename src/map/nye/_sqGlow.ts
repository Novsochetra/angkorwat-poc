import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  PlaneGeometry,
  ShaderMaterial,
  Sphere,
  Vector3,
} from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import type { HeightField } from '../heightfield';
import { PERIOD } from '../festival/_kit';
import { hazeUniforms } from '../sky/haze';
import type { MapContext, MapFrame } from '../types';
import { nightHeld, nyeSeconds, showTime } from './clock';
import { BOARD, GATE, GROUND, LANTERN_WALK, onSquare, RING, SQUARE, STAGE, STALLS } from './plan';
import { buildSquareEdge } from './_sqEdge';
import { INLAY, TOP } from './_sqFloor';
import { AVENUE, onAvenue } from './_sqWalk';
import { GOLD, LATERITE, pick } from './_sqKit';
import { LightWash } from './_sqLight';
import { buildSquareAir } from './_sqLightAir';
import { FLICKER_GLSL } from './_sqLightFlicker';
import { Bodies, Wires, type Toward } from './_sqGlowBodies';
import { alongString, onCord, STILL, stringK, SWAY_GLSL, swaySpan, type Sway, type SwaySpan } from './_sqSway';
import { lightGate } from './_sqLightGate';

/**
 * The festival square's light and air at night (AWP-35; the owner: "from above it looks quiet, small and dark":
 * the reference, assets/new-year-online/plaza-reference.png, is a bright warm plaza). No real lights: glow, additive
 * light and bloom.
 *
 * - **The edge** (`_sqEdge.ts`): the carved balustrade round the plaza, Khmer lamps on pedestals every ≈ 5.6 m.
 * - **Light on things** (`_sqLight.ts`, the owner: "layered warm light, distinct pools, darker gaps, the floor and
 *   the ring readable"): pools that multiply what lies under them (the pavers keep their tones) under each lamp,
 *   pole, stall, lantern, along the string lights and at the stage's front; the gate's washes (`_sqLightGate.ts`:
 *   fire bowls, an uplight on its Bayon face, a lantern in its passage). One draw.
 * - **Light pools on the ground** (added light, faint: dark grass shows the lamps too): under the same lamps; the gilt
 *   band of the floor (`_sqFloor.ts` `INLAY`) a thin gold line; slices of warm haze low over the square, thin from
 *   above, thicker seen across. One draw.
 * - **A canopy of string lights**: from the stage gate's top (its pillars, its corner towers, the prasat's front)
 *   fanning out to eight tall lacquered poles round the square's edge, the poles joined round the edge, and strings
 *   across the lantern walk before the gate, all sagging (catenaries ≥ 7 m over the square's middle, high over the
 *   gate → ring → stage way), swaying gently in the breeze as the edge strings do (`_sqSway.ts`: the high spans a
 *   little less). Wires: one line draw; bulbs and lantern bodies: one draw (glowing boxes, colours over 1.0 at night:
 *   the bloom; `_sqGlowBodies.ts`), both posed in their shaders, the halos round the bulbs going with them.
 * - **Hanging lanterns** (Khmer: a little Angkor tower top over a glowing body, or a round paper lamp in warm
 *   colours, never a Chinese red lantern with tassels): from the poles' arms, the gate's passage and in the square's
 *   trees, each swinging on its cord as a slow pendulum (≤ ≈ 4°, 2.5‥4 s), cord, wood, body and halo together: their
 *   wood is boxes in the bodies' draw, lit by the hour and their own glow. The poles and the edge: one voxel mesh
 *   (`mapStone`).
 * - **The glow over the square**: halos round the lamps and some bulbs (breathing with their flames:
 *   `_sqLightFlicker.ts`), soft shafts of light under the poles' lanterns, the flowering crowns lit from under by an
 *   uplight at each trunk, a large soft dome of lit air seen only from far off. One draw.
 * - **The air** (`_sqLightAir.ts`): cool blue mist lying in the forest edges and over the water, spray at the foot of
 *   the falls near the square. One draw, at night.
 * - **The event night** (clock.ts `nightHeld`): four slim warm searchlight beams from behind the stage (two on low)
 *   sweeping slowly in the sky (additive cones turned to the camera round their axis, swept in the shader; one draw),
 *   dimmed while the fireworks play; everything a little brighter; from ten seconds before midnight the square's pool
 *   and a glow over the ring pulse with the count.
 *
 * Draws: light on things 1, ground 1, wires 1, voxels 1, glowing bodies 1, glows 1, air 1 (at night), beams 1 (only
 * on the event night). Nothing moves but in shaders and uniforms (the strings and lanterns swaying among them, on the
 * glow's clock): no matrix changes after the build (the part is FROZEN).
 */

export interface SquareGlow {
  object: Group;
  blocks: number;
  update(f: MapFrame): void;
}

export interface SquareGlowInput {
  /** The lantern walk's lamps (map x, z: `_sqWalk.ts`). */
  walk?: readonly [number, number][];
  /** The square's trees (map x, z, crown radius: `_sqDecor.ts`). */
  trees?: readonly [number, number, number][];
  /** The garden's trees as built (map x, z, crown radius, the ground, the crown's underside and top: `_sqGarden.ts`): their uplights. */
  crowns?: readonly { x: number; z: number; r: number; ground: number; low: number; top: number }[];
}

type V3 = { x: number; y: number; z: number };

/** Warm bulb tones (sRGB): warm white-gold mostly, some amber. */
const BULB = [0xffd89a, 0xffc878, 0xffe4b8, 0xffb860, 0xffd08a];
/** Lantern bodies: gold, saffron, amber, and now and then a lotus pink. */
const LANTERN = [0xffb44a, 0xff9a36, 0xffc45c, 0xffa848, 0xff9c8c];
/** The poles' red lacquer, the lanterns' dark wood. */
const LACQUER = [0x5a2a20, 0x642f24, 0x52261c];
const WOOD = [0x3e2a1e, 0x48301f, 0x36251a];
/** The light lamps and lanterns lay on things (sRGB): added, and multiplying (paler: it multiplies the stone's own warm buff). */
const LAMPLIGHT = 0xffa850;
const LAMPLIGHT_ON = 0xffc68a;

export function buildSquareGlow(ctx: MapContext, input: SquareGlowInput = {}): SquareGlow {
  const t0 = performance.now();
  const { field } = ctx;
  const low = ctx.quality === 'low';
  const src = traceSource();
  const object = new Group();
  object.name = 'nye:glow';
  const G = field.heightAt(SQUARE.x, SQUARE.z);

  const b = new VoxelBuilder();
  const pools = new Pools(field);
  const light = new LightWash(field, low);
  const glows = new Glows();
  const bodies = new Bodies();
  const wires = new Wires();
  /** A lamp's light on the ground: a pool on the stone (its own tones kept) and a faint added glow (dark grass shows it too). */
  const lit = (x: number, z: number, r: number, level: number, flick = 0) => {
    light.pool(x, z, r, LAMPLIGHT_ON, level, flick);
    pools.add(x, z, r * 0.75, LAMPLIGHT, 0.1 * level);
  };

  // ── The edge: balustrade and pedestal lamps ──
  const flames = buildSquareEdge(b, field, low);
  for (const [x, y, z] of flames) {
    bodies.add(x, y, z, 0.26, 0.3, 0.26, 0xffb860, 1.05, 0, 1);
    glows.halo(x, y, z, 2.2, 0xffb45a, 0.75, 1);
    lit(x, z, 4, 0.9, 1);
  }

  // ── The stage's front, the stalls; the gilt band; the gate (_sqLightGate.ts) ──
  // (the stage's fires light its front already, stage.ts: this only gathers it into a pool)
  light.pool(STAGE.x, STAGE.front + 3, 12, 0xffc080, 0.05, 0.5);
  for (const s of STALLS) lit(s.x + Math.sin(s.facing) * 1.5, s.z + Math.cos(s.facing) * 1.5, 6, 0.85);
  pools.ring(RING.x, RING.z, INLAY, 0.3, 0xffc060, 0.42, G + TOP + 0.03);
  // At midnight the square's pool beats with the count (pulse only).
  pools.add(RING.x, RING.z, 26, 0xffb040, 0.45, 2, 14);
  lightGate(
    {
      b,
      src,
      light,
      flame: (x, y, z, sx, sy, sz, color, k, flick) => bodies.add(x, y, z, sx, sy, sz, color, k, 0, flick),
      halo: (x, y, z, size, color, level, flick) => glows.halo(x, y, z, size, color, level, flick),
      pool: (x, z, r, color, level) => pools.add(x, z, r, color, level),
      // (in the passage, sheltered: it swings half as far)
      lantern: (x, y, z, drop, seed) => lantern(bodies, glows, wires, x, y, z, drop, 'tower', seed, 0.5),
    },
    field,
  );

  // ── Tall poles round the edge, each with lanterns on its arms ──
  const poleTop = 10.2;
  const poles: (V3 & { th: number })[] = [];
  for (const th of [-16, 18, 48, 72, 108, 132, 162, 196]) {
    const spot = freeSpot(field, th, [1.1, 1.16, 1.04, 1.22], input.trees ?? []);
    if (!spot) continue;
    const [x, z] = spot;
    const g = field.heightAt(x, z);
    const out = Math.atan2(x - SQUARE.x, z - SQUARE.z);
    tallPole(b, bodies, glows, wires, x, g, z, poleTop, out, src, low);
    field.occupy(x - 0.5, z - 0.5, x + 0.5, z + 0.5);
    lit(x, z, 5.5, 0.8, 0.6);
    poles.push({ x, y: g + poleTop - 0.15, z, th });
  }

  // ── The canopy: strings from the stage gate's top to the poles, and round the poles ──
  const gz = -289.3;
  const anchors = {
    P: { x: BOARD.x, y: GROUND + 14.6, z: -288.4 },
    TE: { x: BOARD.x + 6, y: GROUND + 13.4, z: gz },
    TW: { x: BOARD.x - 6, y: GROUND + 13.4, z: gz },
    PE: { x: BOARD.x + BOARD.w / 2 + 2.6, y: GROUND + 11.4, z: gz },
    PW: { x: BOARD.x - BOARD.w / 2 - 2.6, y: GROUND + 11.4, z: gz },
  };
  const fan: Record<number, (keyof typeof anchors)[]> = {
    [-16]: ['PE'],
    18: ['TE', 'PE'],
    48: ['TE', 'P'],
    72: ['P'],
    108: ['P'],
    132: ['TW', 'P'],
    162: ['TW', 'PW'],
    196: ['PW'],
  };
  const every = low ? 1.9 : 0.95;
  // (the strings' light on the floor: soft pools along them, fainter the higher they hang, dark gaps between)
  const under = (x: number, y: number, z: number) => {
    const h = y - field.heightAt(x, z);
    if (h < 2 || !onSquare(x, z, 2)) return;
    light.pool(x, z, 2.2 + 0.14 * h, 0xffc070, 0.6 * Math.min(1, (6 / h) ** 2));
  };
  // (each swaying: the high spans, their middles ≥ 7 m up, a little less far: _sqSway.ts)
  let strings = 0;
  const string = (p: V3, q: V3, sag: number, halos: boolean) => {
    const mid = (p.y + q.y) / 2 - sag - field.heightAt((p.x + q.x) / 2, (p.z + q.z) / 2);
    stringLights(swaySpan(p, q, sag, stringK(mid), strings++), every, bodies, halos ? glows : null, wires, low ? 2 : 4, under);
  };
  for (const pole of poles) for (const a of fan[pole.th] ?? []) string(anchors[a], pole, 3.2, true);
  for (let i = 0; i + 1 < poles.length; i++) string(poles[i], poles[i + 1], 1.5, false);

  // ── The lantern walk before the gate: pole pairs, strings across and along ──
  const pairs = walkPairs(field);
  for (const [i, pair] of pairs.entries()) {
    const ends: V3[] = [];
    for (const [k, [x, z]] of pair.entries()) {
      const g = field.heightAt(x, z);
      const toward = Math.atan2(pair[1 - k][0] - x, pair[1 - k][1] - z);
      walkPole(b, bodies, glows, wires, x, g, z, 6.4, toward, src, i * 2 + k, low);
      field.occupy(x - 0.4, z - 0.4, x + 0.4, z + 0.4);
      lit(x, z, 4.5, 0.75, 0.6);
      ends.push({ x, y: g + 6.25, z });
    }
    string(ends[0], ends[1], 0.9, true);
    if (i > 0) {
      const prev = pairs[i - 1];
      for (let k = 0; k < 2; k++) {
        const [px, pz] = prev[k];
        string({ x: px, y: field.heightAt(px, pz) + 6.25, z: pz }, ends[k], 0.8, false);
      }
    }
  }

  // ── The lantern walk's own lamps: a pool under each (flickering with its flame) ──
  for (const [x, z] of input.walk ?? []) lit(x, z, 4.2, 0.85, 1);
  // (and the avenue's kerb lamps: pools of light up its middle, dark between)
  for (let z = AVENUE.z0 + 3; z < AVENUE.z1 - 1; z += 6) lit(AVENUE.x, z, 4.6, 0.6);

  // ── Lanterns in the square's trees ──
  for (const [i, [x, z, r]] of (input.trees ?? []).entries()) {
    const g = field.heightAt(x, z);
    const toSq = Math.atan2(SQUARE.x - x, SQUARE.z - z);
    for (let k = 0; k < 3; k++) {
      const a = toSq + (k - 1) * 0.75 + 0.2 * hash3(i, k, 1, 91);
      const d = r * (0.72 + 0.2 * hash3(i, k, 2, 91));
      const lx = x + Math.sin(a) * d;
      const lz = z + Math.cos(a) * d;
      const hang = g + 5.4 + 0.5 * hash3(i, k, 3, 91);
      const drop = 0.7 + 0.8 * hash3(i, k, 4, 91);
      lantern(bodies, glows, wires, lx, hang, lz, drop, (i + k) % 3 === 0 ? 'round' : 'tower', i * 5 + k);
    }
    lit(x + Math.sin(toSq) * r * 0.7, z + Math.cos(toSq) * r * 0.7, 5, 0.6, 0.5);
  }

  // ── Uplights into the flowering crowns: a fixture at the trunk's foot, its beam in the air, the crown lit from under ──
  for (const [i, t] of (input.crowns ?? []).entries()) {
    if (Math.hypot(t.x - SQUARE.x, t.z - SQUARE.z) > SQUARE.rx + 22) continue;
    const toSq = Math.atan2(SQUARE.x - t.x, SQUARE.z - t.z);
    const fx = t.x + Math.sin(toSq) * 0.9;
    const fz = t.z + Math.cos(toSq) * 0.9;
    const fy = field.heightAt(fx, fz);
    b.box(fx, fy + 0.1, fz, 0.32, 0.2, 0.32, pick(LATERITE, fx, fz, 1, 98), 'mapStone', { src });
    glows.halo(fx, fy + 0.28, fz, 0.8, 0xffc070, 0.5, 0);
    if (!low) glows.shaft(fx, fy + 0.25, fz, -(t.low - fy - 0.25), 0.2, t.r * 0.55, 0xffb060, 0.035);
    glows.canopy(t.x, t.low * 0.62 + t.top * 0.38, t.z, t.r * 2.3, t.r * 0.85, 0xffa050, 0.16 + 0.04 * hash3(i, 1, 1, 98));
    light.pool(fx, fz, 2.4, 0xffc070, 0.9);
  }

  // ── The air over the square: a low warm haze (thin seen from above, thicker across it), lit air at the stage and the gate ──
  pools.haze(SQUARE.x, G + 0.9, SQUARE.z - 2, 40, 0xffa850, 0.006);
  pools.haze(SQUARE.x, G + 2.6, SQUARE.z - 4, 36, 0xffa850, 0.0045);
  pools.haze(STAGE.x, G + 3.4, STAGE.front + 5, 17, 0xffa040, 0.007);
  pools.haze(GATE.x, G + 1.8, GATE.z + 5, 9, 0xffa850, 0.006);
  pools.haze(GATE.x, G + 1.8, GATE.z - 6, 10, 0xffa850, 0.005);
  // (the dome of lit air only from far off, where the square is a warm spot in the dark land; the ring's glow at midnight)
  glows.dome(SQUARE.x, G + 14, SQUARE.z - 1, 78, 0xffb050, 0.13, 2.4);
  glows.dome(GATE.x + 6, G + 4, GATE.z + 10, 30, 0xffa850, 0.06, 2.4);
  glows.add(RING.x, G + 2.5, RING.z, 30, 0xffc060, 0.4, 1, 2);

  // ── The beams (the event night only): two a side behind the stage, slim, slow and warm; one a side on low ──
  const beamBases: [number, number, number, number][] = [];
  const offs = low ? [-13, 13] : [-16, -6.5, 6.5, 16];
  for (const [i, dx] of offs.entries()) {
    const x = STAGE.x + dx;
    const z = STAGE.back - 3.5 - Math.abs(dx) * 0.12;
    const y = field.heightAt(x, z) + 0.6;
    beamBases.push([x, y, z, i]);
    glows.add(x, y + 0.5, z, 2.6, 0xffc070, 0.5, 0, 1);
  }

  // ── Build ──
  const blocks = b.boxes.length;
  const vox = buildVoxelMesh(b, { quality: low ? 'low' : 'medium', name: 'nye:glow' });
  object.add(vox);
  const ground = pools.build();
  object.add(ground.mesh);
  const wash = light.build('nye:glow:light');
  object.add(wash.mesh);
  const body = bodies.build();
  if (body) object.add(body.mesh);
  const wire = wires.build();
  object.add(wire.mesh);
  const glowMesh = glows.build();
  object.add(glowMesh.mesh);
  const beams = buildBeams(beamBases, offs.length);
  object.add(beams.mesh);
  const air = buildSquareAir(field, low);
  if (air) object.add(air.mesh);

  console.info(
    `[map] nye glow: ${blocks} blocks · ${flames.length} edge lamps · ${poles.length} poles · ${pairs.length} walk pairs · ${strings} swaying strings · ${bodies.count} bulbs, lanterns and their wood · ${glows.count} glows · ${pools.count} pools · ${light.count} lights on things · ${air ? (air.mesh.geometry as InstancedBufferGeometry).instanceCount : 0} puffs of air · built in ${(performance.now() - t0).toFixed(1)} ms`,
  );

  let now = 0;
  let started = false;
  return {
    object,
    blocks,
    update(f: MapFrame) {
      if (!started) {
        started = true;
        now = f.t;
      } else now += f.dt;
      const n = f.night;
      const lit = smooth(0.3, 0.75, n);
      const event = nightHeld() ? 1 : 0;
      // The count and midnight: a beat each second in the last ten, then a slow throb for a minute and a half.
      let pulse = 0;
      if (event) {
        const s = nyeSeconds();
        if (s >= -10 && s < 0) pulse = 0.35 + 0.65 * Math.exp(-(s - Math.floor(s)) * 4);
        else if (s >= 0 && s < 120) pulse = (0.65 + 0.35 * Math.sin(now * 2.6)) * (1 - smooth(80, 120, s));
      }
      const boost = 1 + 0.2 * event;
      const t = now % PERIOD;
      ground.u.uLevel.value = lit * boost;
      ground.u.uPulse.value = pulse;
      ground.u.uTime.value = t;
      ground.mesh.visible = lit > 0.001;
      wash.u.uLevel.value = lit * boost;
      wash.u.uTime.value = t;
      wash.mesh.visible = lit > 0.001;
      glowMesh.u.uLevel.value = lit * boost;
      glowMesh.u.uEvent.value = event;
      glowMesh.u.uPulse.value = pulse;
      glowMesh.u.uTime.value = t;
      glowMesh.mesh.visible = lit > 0.001;
      body?.update(n, event, t);
      wire.time.value = t;
      beams.u.uLevel.value = event * lit;
      beams.u.uTime.value = t;
      beams.mesh.visible = event * lit > 0.001;
      if (air) {
        air.u.uLevel.value = lit;
        air.u.uTime.value = t;
        air.mesh.visible = lit > 0.001;
      }
    },
  };
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A free spot round the square's edge at θ (degrees), trying the radii `ks` (× the ellipse). */
function freeSpot(field: HeightField, th: number, ks: number[], trees: readonly [number, number, number][]): [number, number] | null {
  const a = (th * Math.PI) / 180;
  for (const k of ks) {
    const x = SQUARE.x + Math.cos(a) * SQUARE.rx * k;
    const z = SQUARE.z + Math.sin(a) * SQUARE.rz * k;
    const c = field.index(x, z);
    // (the square's own margin is marked taken for the trees: there only the trees themselves are in the way)
    if (c < 0 || field.waterAt(x, z) !== null || field.trail[c] === 2) continue;
    if (onSquare(x, z, 1.6) ? trees.some(([tx, tz]) => Math.hypot(tx - x, tz - z) < 2) : field.occupied[c]) continue;
    if (Math.abs(field.heightAt(x, z) - GROUND) > 1.5) continue;
    return [x, z];
  }
  return null;
}

/** Pole pairs either side of the lantern walk before the gate (map x, z each). */
function walkPairs(field: HeightField): [[number, number], [number, number]][] {
  // The walk from the gate outward.
  const pts = [...LANTERN_WALK].reverse();
  const acc: number[] = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const at = (s: number): [number, number, number, number] => {
    let i = 1;
    while (i < pts.length - 1 && acc[i] < s) i++;
    const [ax, az] = pts[i - 1];
    const [bx, bz] = pts[i];
    const L = acc[i] - acc[i - 1];
    const u = Math.min(1, Math.max(0, (s - acc[i - 1]) / L));
    return [ax + (bx - ax) * u, az + (bz - az) * u, (bx - ax) / L, (bz - az) / L];
  };
  const ok = (x: number, z: number): boolean => {
    const c = field.index(x, z);
    if (c < 0 || field.trail[c] === 2 || field.occupied[c] || field.waterAt(x, z) !== null || field.dropAt(x, z) > 1.2) return false;
    if (onSquare(x, z, 1.5) || onAvenue(x, z, 1.6) || Math.hypot(x - GATE.x, z - GATE.z) < 7) return false;
    return true;
  };
  const out: [[number, number], [number, number]][] = [];
  for (const s of [7, 15]) {
    const [cx, cz, tx, tz] = at(s);
    const pair: [number, number][] = [];
    for (const side of [-1, 1]) {
      for (const d of [6.4, 7.2, 5.6, 8.2]) {
        const x = cx - tz * side * d;
        const z = cz + tx * side * d;
        if (ok(x, z)) {
          pair.push([x, z]);
          break;
        }
      }
    }
    if (pair.length === 2) out.push([pair[0], pair[1]]);
  }
  return out;
}

/** A tall lacquered pole, a gilt collar and finial, a cross arm with a tower lantern hanging at each end (and its soft shaft of light down to the ground but on low). */
function tallPole(b: VoxelBuilder, bodies: Bodies, glows: Glows, wires: Wires, x: number, g: number, z: number, h: number, out: number, src: ReturnType<typeof traceSource>, low: boolean): void {
  b.box(x, g + 0.2, z, 0.6, 0.4, 0.6, pick(LATERITE, x, z, 1, 92), 'mapStone', { src });
  b.box(x, g + h / 2, z, 0.2, h, 0.2, pick(LACQUER, x, z, 2, 92), 'mapStone', { src });
  b.box(x, g + h * 0.62, z, 0.28, 0.14, 0.28, pick(GOLD, x, z, 3, 92), 'mapStone', { src });
  b.box(x, g + h + 0.06, z, 0.3, 0.12, 0.3, pick(GOLD, x, z, 4, 92), 'mapStone', { src });
  b.box(x, g + h + 0.26, z, 0.14, 0.28, 0.14, pick(GOLD, x, z, 5, 92), 'mapStone', { src, shade: 1.08 });
  // The arm across the way round the square (its ends hang a lantern each).
  const ay = g + h * 0.7;
  const ry = out;
  b.box(x, ay, z, 1.9, 0.1, 0.1, pick(LACQUER, x, z, 6, 92), 'mapStone', { src, ry });
  const cx = Math.cos(out);
  const cz = -Math.sin(out);
  for (const s of [-1, 1]) {
    const lx = x + cx * s * 0.85;
    const lz = z + cz * s * 0.85;
    lantern(bodies, glows, wires, lx, ay - 0.05, lz, 0.45, 'tower', Math.round(x * 3 + s));
    if (!low) glows.shaft(lx, ay - 1.0, lz, ay - 1.0 - g, 0.3, 2.4, 0xffb060, 0.03);
  }
}

/** A walk pole: lacquer, a gilt top, a short bracket toward the way with a lantern on it. */
function walkPole(b: VoxelBuilder, bodies: Bodies, glows: Glows, wires: Wires, x: number, g: number, z: number, h: number, toward: number, src: ReturnType<typeof traceSource>, seed: number, low: boolean): void {
  b.box(x, g + 0.18, z, 0.5, 0.36, 0.5, pick(LATERITE, x, z, 1, 93), 'mapStone', { src });
  b.box(x, g + h / 2, z, 0.18, h, 0.18, pick(LACQUER, x, z, 2, 93), 'mapStone', { src });
  b.box(x, g + h + 0.06, z, 0.26, 0.12, 0.26, pick(GOLD, x, z, 3, 93), 'mapStone', { src });
  b.box(x, g + h + 0.22, z, 0.12, 0.22, 0.12, pick(GOLD, x, z, 4, 93), 'mapStone', { src, shade: 1.08 });
  const ay = g + h - 1.2;
  const sx = Math.sin(toward);
  const sz = Math.cos(toward);
  b.box(x + sx * 0.4, ay, z + sz * 0.4, 0.8, 0.08, 0.08, pick(LACQUER, x, z, 5, 93), 'mapStone', { src, ry: toward - Math.PI / 2 });
  lantern(bodies, glows, wires, x + sx * 0.75, ay - 0.04, z + sz * 0.75, 0.35, seed % 2 ? 'round' : 'tower', 200 + seed);
  if (!low) glows.shaft(x + sx * 0.75, ay - 0.9, z + sz * 0.75, ay - 0.9 - g, 0.28, 2, 0xffb060, 0.03);
}

/**
 * A hanging lantern from (x, y, z) on a cord `drop` m long: `tower` a glowing body under a little Angkor tower top
 * (three corbelled tiers and a gilt lotus bud) on a dark wooden frame; `round` a round paper lamp (an octagon of two
 * crossed boxes) between two dark wooden rings. It swings on its cord in the breeze (`calm` × as far: `_sqSway.ts`),
 * cord, wood, body and halo together, so its wood is in the bodies' draw, not the square's still voxels.
 */
function lantern(bodies: Bodies, glows: Glows, wires: Wires, x: number, y: number, z: number, drop: number, kind: 'tower' | 'round', seed: number, calm = 1): void {
  const top = y - drop;
  const sway = onCord(x, y, z, drop, seed, calm);
  wires.add([x, y, z], sway, [x, top, z], sway);
  const col = LANTERN[Math.floor(hash3(x, z, seed, 94) * LANTERN.length) % LANTERN.length];
  const wood = (yy: number, w: number, h: number, i: number, shade: number, toward: Toward) => bodies.wood(x, yy, z, w, h, w, pick(WOOD, x, z, i, 94 + seed), shade, toward, sway);
  if (kind === 'tower') {
    // The tower top, from its bud down to the eave.
    bodies.wood(x, top - 0.05, z, 0.07, 0.1, 0.07, pick(GOLD, x, z, 1, 94), 1.1, 0, sway);
    const tiers = [0.14, 0.22, 0.3];
    let yy = top - 0.1;
    for (const [i, w] of tiers.entries()) {
      wood(yy - 0.05, w, 0.1, 2 + i, 1 + i * 0.03, 0);
      yy -= 0.1;
    }
    wood(yy - 0.03, 0.44, 0.06, 6, 1, 1);
    yy -= 0.06;
    bodies.add(x, yy - 0.22, z, 0.34, 0.44, 0.34, col, 0.95, 0, 0.8, sway);
    wood(yy - 0.47, 0.4, 0.06, 7, 1, -1);
    glows.halo(x, yy - 0.22, z, 2.2, col, 0.6, 0.8, sway);
  } else {
    wood(top - 0.03, 0.26, 0.06, 2, 1, 1);
    bodies.add(x, top - 0.3, z, 0.44, 0.48, 0.44, col, 0.85, 0, 0.8, sway);
    bodies.add(x, top - 0.3, z, 0.44, 0.48, 0.44, col, 0.85, Math.PI / 4, 0.8, sway);
    wood(top - 0.57, 0.26, 0.06, 3, 1, -1);
    glows.halo(x, top - 0.3, z, 2.4, col, 0.6, 0.8, sway);
  }
}

/**
 * A string of bulbs hanging along `s` (from p to q, sagging in the middle, swaying: `_sqSway.ts`): its wire, a bulb every
 * `every` m, a small halo round every `haloEvery`th (swaying with it), and `under` called every ≈ 4.5 m along it where
 * it hangs still (its light on the floor).
 */
function stringLights(s: SwaySpan, every: number, bodies: Bodies, glows: Glows | null, wires: Wires, haloEvery = 3, under?: (x: number, y: number, z: number) => void): void {
  const { p, q, sag } = s;
  const len = Math.hypot(q.x - p.x, q.z - p.z);
  if (len < 1) return;
  const at = (u: number): [number, number, number] => [p.x + (q.x - p.x) * u, p.y + (q.y - p.y) * u - sag * 4 * u * (1 - u), p.z + (q.z - p.z) * u];
  const pieces = Math.max(4, Math.round(len / 1.5));
  for (let i = 0; i < pieces; i++) wires.add(at(i / pieces), alongString(s, i / pieces), at((i + 1) / pieces), alongString(s, (i + 1) / pieces));
  const n = Math.max(2, Math.round(len / every));
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const [x, hy, z] = at(u);
    const y = hy - 0.08;
    const c = BULB[Math.floor(hash3(x, z, i, 95) * BULB.length) % BULB.length];
    const sway = alongString(s, u);
    bodies.add(x, y, z, 0.11, 0.13, 0.11, c, 0.62 + 0.2 * hash3(x, z, i, 96), 0, 0, sway);
    if (glows && i % haloEvery === 0) glows.halo(x, y, z, 0.5, c, 0.16, 0, sway);
  }
  if (!under) return;
  const m = Math.max(1, Math.round(len / 4.5));
  for (let i = 0; i < m; i++) under(...at((i + 0.5) / m));
}

// ── The light pools on the ground (one draw: a grid per pool, draped on the land) ──

class Pools {
  private readonly pos: number[] = [];
  private readonly loc: number[] = [];
  private readonly col: number[] = [];
  private readonly shape: number[] = [];
  private readonly idx: number[] = [];
  private n = 0;
  private readonly c = new Color();
  constructor(private readonly field: HeightField) {}
  get count(): number {
    return this.n;
  }
  /** A soft round pool at (x, z), `r` m, colour (sRGB) × level; `show` 0 night, 2 the midnight pulse; `grid` cells a side. */
  add(x: number, z: number, r: number, color: number, level: number, show = 0, grid = 0): void {
    this.quad(x, z, r, color, level, 0, 0, show, grid || Math.max(3, Math.min(8, Math.round(r / 1.5))), null);
  }
  /** A thin ring of light (radius `R`, half width `w`) lying flat at `y`. */
  ring(x: number, z: number, R: number, w: number, color: number, level: number, y: number): void {
    this.quad(x, z, R + 1.2, color, level, 1, R, 0, 32, y, w);
  }
  /**
   * A slice of lit haze, flat at `y`, `r` m round (x, z): faint seen from above, thicker the flatter the eye looks
   * across it (as a layer of air is), drifting; a few slices one over another read as a low warm haze.
   */
  haze(x: number, y: number, z: number, r: number, color: number, level: number): void {
    this.quad(x, z, r, color, level, 2, r, 0, 1, y);
  }
  private quad(x: number, z: number, r: number, color: number, level: number, kind: number, R: number, show: number, grid: number, y: number | null, w = 0): void {
    const f = this.field;
    this.c.setHex(color).multiplyScalar(level);
    const base = this.pos.length / 3;
    for (let j = 0; j <= grid; j++)
      for (let i = 0; i <= grid; i++) {
        const u = (i / grid) * 2 - 1;
        const v = (j / grid) * 2 - 1;
        const px = x + u * r;
        const pz = z + v * r;
        let py = y;
        if (py === null) {
          // (over the highest land near the point: block steps stay under it)
          const h = Math.max(f.heightAt(px, pz), f.heightAt(px + 0.9, pz), f.heightAt(px - 0.9, pz), f.heightAt(px, pz + 0.9), f.heightAt(px, pz - 0.9));
          py = h + (onSquare(px, pz, 0.5) ? TOP + 0.05 : 0.12);
        }
        this.pos.push(px, py, pz);
        this.loc.push(u * r, v * r);
        this.col.push(this.c.r, this.c.g, this.c.b);
        this.shape.push(kind, kind ? R : r, kind ? w : 0, show);
      }
    for (let j = 0; j < grid; j++)
      for (let i = 0; i < grid; i++) {
        const a = base + j * (grid + 1) + i;
        this.idx.push(a, a + grid + 1, a + 1, a + 1, a + grid + 1, a + grid + 2);
      }
    this.n++;
  }
  build(): { mesh: Mesh; u: { uLevel: { value: number }; uPulse: { value: number }; uTime: { value: number } } } {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('pLoc', new Float32BufferAttribute(this.loc, 2));
    geo.setAttribute('pCol', new Float32BufferAttribute(this.col, 3));
    geo.setAttribute('pShape', new Float32BufferAttribute(this.shape, 4));
    geo.setIndex(this.idx);
    geo.computeBoundingSphere();
    const u = { ...hazeUniforms(), uLevel: { value: 0 }, uPulse: { value: 0 }, uTime: { value: 0 } };
    const material = new ShaderMaterial({
      name: 'nye:pools',
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
      fog: true,
      uniforms: u,
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        attribute vec2 pLoc;
        attribute vec3 pCol;
        attribute vec4 pShape;
        uniform float uLevel;
        uniform float uPulse;
        varying vec2 vLoc;
        varying vec3 vCol;
        varying vec3 vShape;
        varying vec3 vWorld;
        void main() {
          vLoc = pLoc;
          vShape = pShape.xyz;
          float on = pShape.w > 1.5 ? uPulse : 1.0;
          vCol = pCol * uLevel * on;
          vWorld = position;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        uniform float uTime;
        varying vec2 vLoc;
        varying vec3 vCol;
        varying vec3 vShape;
        varying vec3 vWorld;
        void main() {
          float r = length(vLoc);
          // A pool: soft to its rim; a ring: a thin line of light at its radius with a faint spill.
          float q = r / vShape.y;
          float pool = (exp(-q * q * 3.2) - 0.04) * (1.0 - smoothstep(0.85, 1.0, q));
          float dr = (r - vShape.y) / max(vShape.z, 0.01);
          float ring = exp(-dr * dr) + 0.12 * exp(-dr * dr * 0.08);
          // A slice of haze: as thick as the eye's path through a layer of air (1 / its slope, capped), drifting, and
          // gone as the eye comes level with it (no line where the camera crosses it).
          vec3 ray = vWorld - cameraPosition;
          float slope = abs(ray.y) / max(length(ray), 1e-3);
          float across = min(1.0 / max(slope, 0.07), 9.0) * smoothstep(0.3, 1.8, abs(ray.y));
          float drift = 0.6 + 0.4 * sin(vWorld.x * 0.23 + uTime * 0.105 + 2.0 * sin(vWorld.z * 0.17 - uTime * 0.073)) * sin(vWorld.z * 0.29 - uTime * 0.052 + vWorld.x * 0.05);
          float haze = exp(-q * q * 2.2) * (1.0 - smoothstep(0.8, 1.0, q)) * across * drift;
          // (by kind: a table, not a branch)
          vec3 kind = vec3(step(vShape.x, 0.5), step(0.5, vShape.x) * step(vShape.x, 1.5), step(1.5, vShape.x));
          float a = dot(kind, vec3(pool, ring, haze));
          vec3 col = vCol * max(a, 0.0);
          #ifdef USE_FOG
            vec3 hzRay = vFogWorld - cameraPosition;
            float hzDist = length(hzRay);
            float low = hazeLowAmount(cameraPosition, vFogWorld, hzDist, hazeBanks(vFogWorld.xz).x);
            col *= (1.0 - hazeDistance(hzDist)) * (1.0 - 0.6 * low);
          #endif
          if (max(col.r, max(col.g, col.b)) < 0.002) discard;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const mesh = new Mesh(geo, material);
    mesh.name = 'nye:glow:pools';
    mesh.renderOrder = 10;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.raycast = () => {};
    return { mesh, u };
  }
}

// ── The glows: halos round lamps and some bulbs, the dome of lit air (one instanced draw) ──

class Glows {
  private readonly data: number[] = [];
  /** How each glow sways (`_sqSway.ts`: a halo round a swaying bulb or lantern goes with it). */
  private readonly sway: number[] = [];
  private readonly c = new Color();
  get count(): number {
    return this.data.length / 12;
  }
  /**
   * A glow at (x, y, z), `size` m across, colour (sRGB) × level; `kind` 0 halo, 1 dome, 2 shaft, 3 canopy; `show` 0
   * night, 1 event night, 2 midnight pulse; `a`, `b` by kind (a halo: —, its flicker 0‥1; a dome: how far off it
   * starts showing, × its size; a shaft: its length down (m, up if < 0), its far end's width; a canopy: how far it
   * lies toward the eye, m).
   */
  add(x: number, y: number, z: number, size: number, color: number, level: number, kind = 0, show = 0, a = kind === 1 ? 1 : 0, b = 0, sway: Sway = STILL): void {
    this.c.setHex(color).multiplyScalar(level);
    this.data.push(x, y, z, size, this.c.r, this.c.g, this.c.b, kind, show, (x * 12.9898 + z * 78.233) % 1, a, b);
    this.sway.push(...sway);
  }
  /** A halo round a light; `flick` 0‥1 breathes with the flame there (`_sqLightFlicker.ts`); it sways with its light. */
  halo(x: number, y: number, z: number, size: number, color: number, level: number, flick = 0, sway: Sway = STILL): void {
    this.add(x, y, z, size, color, level, 0, 0, 0, flick, sway);
  }
  /** A dome of lit air, `size` m, showing from `far` × its size away. */
  dome(x: number, y: number, z: number, size: number, color: number, level: number, far = 1): void {
    this.add(x, y, z, size, color, level, 1, 0, far);
  }
  /** A soft shaft of light in the air from a lamp at (x, y, z) down `len` m (up if < 0), `w0` m wide there, `w1` at its end. */
  shaft(x: number, y: number, z: number, len: number, w0: number, w1: number, color: number, level: number): void {
    this.add(x, y, z, w0, color, level, 2, 0, len, w1);
  }
  /** A crown lit from under: a soft glow `size` m across round (x, y, z), lying `push` m toward the eye (on the crown's near side). */
  canopy(x: number, y: number, z: number, size: number, push: number, color: number, level: number): void {
    this.add(x, y, z, size, color, level, 3, 0, push);
  }
  build(): { mesh: Mesh; u: { uLevel: { value: number }; uEvent: { value: number }; uPulse: { value: number }; uTime: { value: number } } } {
    const n = this.count;
    const quad = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.setIndex(quad.getIndex());
    geo.setAttribute('position', quad.getAttribute('position'));
    const take = (from: readonly number[], off: number) => {
      const a = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) a[i * 4 + k] = from[i * 12 + off + k];
      return new InstancedBufferAttribute(a, 4);
    };
    geo.setAttribute('sPos', take(this.data, 0));
    geo.setAttribute('sCol', take(this.data, 4));
    geo.setAttribute('sOpt', take(this.data, 8));
    geo.setAttribute('sSwA', take(this.sway, 0));
    geo.setAttribute('sSwB', take(this.sway, 4));
    geo.setAttribute('sSwC', take(this.sway, 8));
    geo.instanceCount = n;
    // (bound: every glow and its size)
    const pts: Vector3[] = [];
    for (let i = 0; i < n; i++) pts.push(new Vector3(this.data[i * 12], this.data[i * 12 + 1], this.data[i * 12 + 2]));
    const sphere = new Sphere().setFromPoints(pts);
    sphere.radius += 45;
    geo.boundingSphere = sphere;
    const u = { ...hazeUniforms(), uLevel: { value: 0 }, uEvent: { value: 0 }, uPulse: { value: 0 }, uTime: { value: 0 } };
    const material = new ShaderMaterial({
      name: 'nye:glows',
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: true,
      uniforms: u,
      vertexShader: /* glsl */ `
        #include <fog_pars_vertex>
        attribute vec4 sPos;
        attribute vec4 sCol;
        attribute vec4 sOpt;
        attribute vec4 sSwA;
        attribute vec4 sSwB;
        attribute vec4 sSwC;
        uniform float uLevel;
        uniform float uEvent;
        uniform float uPulse;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vCol;
        varying vec4 vKind;
        ${FLICKER_GLSL}
        ${SWAY_GLSL}
        void main() {
          // Shown: at night (0), on the event night (1), with the midnight pulse (2).
          vec3 shows = vec3(1.0, uEvent, uPulse);
          float on = dot(shows, vec3(step(sOpt.x, 0.5), step(0.5, sOpt.x) * step(sOpt.x, 1.5), step(1.5, sOpt.x)));
          // The kind, as weights (halo, dome, shaft, canopy): a table, no branches.
          float k = sCol.w;
          vec4 kind = vec4(step(k, 0.5), step(0.5, k) * step(k, 1.5), step(1.5, k) * step(k, 2.5), step(2.5, k));
          // (a halo goes with its swaying bulb or lantern)
          vec3 at = nyeSwayAt(sPos.xyz, sSwA, sSwB, sSwC, uTime);
          vec4 mvPosition = viewMatrix * vec4(at, 1.0);
          float dist = length(mvPosition.xyz);
          // A dome shows only from sOpt.z × its size off (a warm spot seen from afar, no haze over the square up close).
          float near = mix(1.0, smoothstep(sPos.w * 0.45 * sOpt.z, sPos.w * 1.25 * sOpt.z, dist), kind.y);
          // A halo breathes with its flame.
          float fl = 1.0 + 0.12 * sOpt.w * kind.x * nyeFlicker(sPos.xz, uTime);
          vCol = sCol.rgb * uLevel * on * near * fl;
          vKind = kind;
          // Halos, domes, canopies: turned to the eye (a canopy lies on the crown's near side); a shaft: a strip from the
          // lamp down (or up) turned to the eye round its own length, widening.
          vec4 face = mvPosition;
          face.xyz += kind.w * normalize(-mvPosition.xyz) * sOpt.z;
          face.xy += position.xy * sPos.w;
          float t = 0.5 - position.y;
          vec3 sp = at - vec3(0.0, sOpt.z * t, 0.0);
          vec3 across = cross(vec3(0.0, 1.0, 0.0), sp - cameraPosition) + vec3(1e-4, 0.0, 0.0);
          sp += normalize(across) * position.x * mix(sPos.w, sOpt.w, t);
          vec4 strip = viewMatrix * vec4(sp, 1.0);
          mvPosition = mix(face, strip, kind.z);
          vUv = mix(position.xy * 2.0, vec2(position.x * 2.0, t), kind.z);
          gl_Position = projectionMatrix * mvPosition;
          if (dot(vCol, vCol) < 1e-7) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        varying vec2 vUv;
        varying vec3 vCol;
        varying vec4 vKind;
        void main() {
          float r2 = dot(vUv, vUv);
          float rim = 1.0 - smoothstep(0.8, 1.0, r2);
          float halo = (exp(-r2 * 5.0) * 0.85 + exp(-r2 * 28.0) * 0.6) * rim;
          float dome = (exp(-r2 * 3.0) - 0.05) * rim;
          // A shaft: soft across, from the lamp out to nothing at its end.
          float shaft = exp(-vUv.x * vUv.x * 3.0) * smoothstep(0.0, 0.12, vUv.y) * pow(1.0 - clamp(vUv.y, 0.0, 1.0), 1.4);
          // A crown lit from under: brightest low on it, fading up and to its edge.
          float canopy = exp(-r2 * 2.4) * (0.35 + 0.65 * smoothstep(0.7, -0.7, vUv.y)) * rim;
          float a = dot(vKind, vec4(halo, dome, shaft, canopy));
          vec3 col = vCol * max(a, 0.0);
          #ifdef USE_FOG
            // Into the haze with distance; the mist dims the halos, the lit air glows in it.
            vec3 hzRay = vFogWorld - cameraPosition;
            float hzDist = length(hzRay);
            float low = hazeLowAmount(cameraPosition, vFogWorld, hzDist, hazeBanks(vFogWorld.xz).x);
            col *= (1.0 - 0.8 * hazeDistance(hzDist)) * (1.0 - mix(0.8, 0.25, vKind.y + vKind.z) * low);
          #endif
          if (max(col.r, max(col.g, col.b)) < 0.002) discard;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const mesh = new Mesh(geo, material);
    mesh.name = 'nye:glow:glows';
    mesh.frustumCulled = true;
    mesh.renderOrder = 12;
    mesh.raycast = () => {};
    return { mesh, u };
  }
}

// ── The searchlight beams (the event night): soft additive cones swept in the shader ──

/** Most beams a stage shows (the owner: "two to four, slimmer, dimmer, warmer, slowly sweeping: the fireworks own the sky"). */
const BEAMS_MAX = 4;
/** How much of their light the beams keep while the fireworks play. */
const BEAMS_IN_SHOW = 0.3;

/**
 * The beams from `bases` (x, y, z, index): up and out to the sides of a stage facing `facing` (radians toward (sin, cos)
 * in x, z; 0 the Kulen stage, facing south); `bound` the sphere round their reach (the map's culling reads it). The lake
 * stage's too (lake.ts). At most `BEAMS_MAX` of the bases (evenly picked, the outer ones kept); they dim while the
 * fireworks play.
 */
export function buildBeams(
  all: [number, number, number, number][],
  count: number,
  facing = 0,
  bound: Sphere = new Sphere(new Vector3(STAGE.x, GROUND + 120, STAGE.back), 280),
): { mesh: Mesh; u: { uLevel: { value: number }; uTime: { value: number } } } {
  const bases = all.length <= BEAMS_MAX ? all : Array.from({ length: BEAMS_MAX }, (_, k) => all[Math.round((k * (all.length - 1)) / (BEAMS_MAX - 1))]);
  const quad = new PlaneGeometry(1, 1, 1, 8);
  const geo = new InstancedBufferGeometry();
  geo.setIndex(quad.getIndex());
  geo.setAttribute('position', quad.getAttribute('position'));
  const base = new Float32Array(bases.length * 4);
  const aim = new Float32Array(bases.length * 4);
  bases.forEach(([x, y, z, i], k) => {
    base.set([x, y, z, hash3(i, 1, 2, 97) * 6.28], k * 4);
    // Up and out to their side (never into Kulen's slope behind): azimuth (π/2 east, −π/2 west), elevation (the
    // outer ones lower), sweep amplitude, sweep speed (rad/s: slow, a sweep a minute or so).
    const side = (i + 0.5) / count - 0.5;
    const az = facing + (side > 0 ? 1 : -1) * (Math.PI / 2 - 0.45 + 0.3 * hash3(i, 9, 1, 97));
    aim.set([az, 1.36 - Math.abs(side) * 0.5 + 0.06 * hash3(i, 3, 4, 97), 0.32 + 0.12 * hash3(i, 5, 6, 97), 0.05 + 0.03 * hash3(i, 7, 8, 97)], k * 4);
  });
  geo.setAttribute('bBase', new InstancedBufferAttribute(base, 4));
  geo.setAttribute('bAim', new InstancedBufferAttribute(aim, 4));
  geo.instanceCount = bases.length;
  // (bound: the beams' reach; the map's culling reads it)
  geo.boundingSphere = bound;
  const u = { ...hazeUniforms(), uLevel: { value: 0 }, uTime: { value: 0 }, uShow: { value: 1 }, uColor: { value: new Color(0xffb45c) } };
  const material = new ShaderMaterial({
    name: 'nye:beams',
    transparent: true,
    // (turned to the camera round its axis: either winding)
    side: DoubleSide,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: true,
    uniforms: u,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute vec4 bBase;
      attribute vec4 bAim;
      uniform float uTime;
      varying vec2 vUv;
      void main() {
        float az = bAim.x + bAim.z * sin(uTime * bAim.w + bBase.w);
        float el = bAim.y + 0.08 * sin(uTime * bAim.w * 0.71 + bBase.w * 1.3);
        vec3 dir = vec3(cos(el) * sin(az), sin(el), cos(el) * cos(az));
        float t = position.y + 0.5;
        vec3 p = bBase.xyz + dir * (t * 220.0);
        vec3 side = normalize(cross(dir, p - cameraPosition));
        p += side * position.x * mix(0.9, 13.0, t);
        vUv = vec2(position.x * 2.0, t);
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uLevel;
      uniform float uShow;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float across = exp(-vUv.x * vUv.x * 5.0) * 0.7 + exp(-vUv.x * vUv.x * 40.0) * 0.5;
        float along = pow(1.0 - vUv.y, 1.8) * smoothstep(0.0, 0.03, vUv.y);
        vec3 col = uColor * (0.1 * uLevel * uShow * across * along);
        #ifdef USE_FOG
          vec3 hzRay = vFogWorld - cameraPosition;
          col *= 1.0 - 0.55 * hazeDistance(length(hzRay));
        #endif
        if (max(col.r, max(col.g, col.b)) < 0.002) discard;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new Mesh(geo, material);
  mesh.name = 'nye:glow:beams';
  mesh.frustumCulled = true;
  mesh.renderOrder = 13;
  mesh.visible = false;
  mesh.raycast = () => {};
  // (dimmed while the fireworks play, over 3 s each way: here, so both stages' beams do it)
  mesh.onBeforeRender = () => {
    const s = showTime();
    const into = s === null ? 0 : Math.min(1, s / 3, Math.max(0, (SHOW_END - s) / 3));
    u.uShow.value = 1 - (1 - BEAMS_IN_SHOW) * into;
  };
  return { mesh, u };
}

/** The show's length (s: show.ts's 465 s and its last embers). */
const SHOW_END = 470;
