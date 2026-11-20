import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Sphere,
  Euler,
  Vector3,
} from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import type { HeightField } from '../heightfield';
import { hazeUniforms } from '../sky/haze';
import type { MapContext, MapFrame } from '../types';
import { nightHeld, nyeSeconds } from './clock';
import { BOARD, GATE, GROUND, LANTERN_WALK, onSquare, RING, SQUARE, STAGE, STALLS } from './plan';
import { buildSquareEdge } from './_sqEdge';
import { INLAY, TOP } from './_sqFloor';
import { AVENUE, onAvenue } from './_sqWalk';
import { GOLD, LATERITE, pick } from './_sqKit';

/**
 * The festival square's light and air at night (AWP-35; the owner: "from above it looks quiet, small and dark":
 * the reference, assets/new-year-online/plaza-reference.png, is a bright warm plaza). No real lights: glow, additive
 * light and bloom.
 *
 * - **The edge** (`_sqEdge.ts`): the carved balustrade round the plaza, Khmer lamps on pedestals every ≈ 5.6 m.
 * - **Light pools on the ground**: soft gold decals draped on the land (a grid each, following its height): a big
 *   one over the square, under the stage and the gate, round each stall, pedestal lamp, pole and lamp of the
 *   lantern walk, under the trees' lanterns; the gilt band of the floor (`_sqFloor.ts` `INLAY`) a thin gold line.
 *   One draw.
 * - **A canopy of string lights**: from the stage gate's top (its pillars, its corner towers, the prasat's front)
 *   fanning out to eight tall lacquered poles round the square's edge, the poles joined round the edge, and strings
 *   across the lantern walk before the gate, all sagging (catenaries ≥ 7 m over the square's middle, high over the
 *   gate → ring → stage way). Wires: one line draw; bulbs and lantern bodies: one draw (glowing boxes, colours over
 *   1.0 at night: the bloom).
 * - **Hanging lanterns** (Khmer: a little Angkor tower top over a glowing body, or a round paper lamp in warm
 *   colours, never a Chinese red lantern with tassels): from the poles' arms and in the square's trees. Their wood
 *   and stone, the poles and the edge: one voxel mesh (`mapStone`).
 * - **The glow over the square**: halos round the lamps and some bulbs and a few large soft camera-facing glows
 *   (a dome of lit air) that fade out as the camera comes in under them and into the haze far off. One draw.
 * - **The event night** (clock.ts `nightHeld`): gold searchlight beams from behind the stage sweeping slowly in the
 *   sky (additive cones turned to the camera round their axis, swept in the shader; one draw), everything a little
 *   brighter; from ten seconds before midnight the square's pool and a glow over the ring pulse with the count.
 *
 * Draws: ground 1, wires 1, voxels 1, glowing bodies 1, glows 1, beams 1 (only on the event night). Nothing moves
 * but in shaders and uniforms: no matrix changes after the build (the part is FROZEN).
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
}

type V3 = { x: number; y: number; z: number };

/** Warm bulb tones (sRGB): warm white-gold mostly, some amber. */
const BULB = [0xffd89a, 0xffc878, 0xffe4b8, 0xffb860, 0xffd08a];
/** Lantern bodies: gold, saffron, amber, and now and then a lotus pink. */
const LANTERN = [0xffb44a, 0xff9a36, 0xffc45c, 0xffa848, 0xff9c8c];
/** The poles' red lacquer, the lanterns' dark wood. */
const LACQUER = [0x5a2a20, 0x642f24, 0x52261c];
const WOOD = [0x3e2a1e, 0x48301f, 0x36251a];

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
  const glows = new Glows();
  const bodies = new Bodies();
  const wires: number[] = [];

  // ── The edge: balustrade and pedestal lamps ──
  const flames = buildSquareEdge(b, field, low);
  for (const [x, y, z] of flames) {
    bodies.add(x, y, z, 0.26, 0.3, 0.26, 0xffb860, 1.1);
    glows.halo(x, y, z, 2.6, 0xffb45a, 0.9);
    pools.add(x, z, 4.2, 0xffa850, 0.42);
  }

  // ── Big pools: the square, before the stage, the gate, the stalls; the gilt band ──
  pools.add(SQUARE.x, SQUARE.z + 1, 34, 0xffa040, 0.2, 0, 18);
  pools.add(STAGE.x, STAGE.front + 2, 15, 0xffa850, 0.22);
  pools.add(GATE.x, GATE.z - 4, 9, 0xffa850, 0.24);
  pools.add(GATE.x, GATE.z + 6, 11, 0xffa850, 0.34);
  for (const s of STALLS) pools.add(s.x + Math.sin(s.facing) * 1.5, s.z + Math.cos(s.facing) * 1.5, 7, 0xffb058, 0.3);
  pools.ring(RING.x, RING.z, INLAY, 0.32, 0xffc060, 0.55, G + TOP + 0.03);
  // At midnight the square's pool beats with the count (pulse only).
  pools.add(RING.x, RING.z, 26, 0xffb040, 0.55, 2, 14);

  // ── Tall poles round the edge, each with lanterns on its arms ──
  const poleTop = 10.2;
  const poles: (V3 & { th: number })[] = [];
  for (const th of [-16, 18, 48, 72, 108, 132, 162, 196]) {
    const spot = freeSpot(field, th, [1.1, 1.16, 1.04, 1.22], input.trees ?? []);
    if (!spot) continue;
    const [x, z] = spot;
    const g = field.heightAt(x, z);
    const out = Math.atan2(x - SQUARE.x, z - SQUARE.z);
    tallPole(b, bodies, glows, wires, x, g, z, poleTop, out, src);
    field.occupy(x - 0.5, z - 0.5, x + 0.5, z + 0.5);
    pools.add(x, z, 6, 0xffa850, 0.3);
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
  const string = (p: V3, q: V3, sag: number, halos: boolean) => stringLights(p, q, sag, every, bodies, low || !halos ? null : glows, wires);
  for (const pole of poles) for (const a of fan[pole.th] ?? []) string(anchors[a], pole, 3.2, true);
  for (let i = 0; i + 1 < poles.length; i++) string(poles[i], poles[i + 1], 1.5, false);

  // ── The lantern walk before the gate: pole pairs, strings across and along ──
  const pairs = walkPairs(field);
  for (const [i, pair] of pairs.entries()) {
    const ends: V3[] = [];
    for (const [k, [x, z]] of pair.entries()) {
      const g = field.heightAt(x, z);
      const toward = Math.atan2(pair[1 - k][0] - x, pair[1 - k][1] - z);
      walkPole(b, bodies, glows, wires, x, g, z, 6.4, toward, src, i * 2 + k);
      field.occupy(x - 0.4, z - 0.4, x + 0.4, z + 0.4);
      pools.add(x, z, 4.5, 0xffa850, 0.28);
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

  // ── The lantern walk's own lamps: a pool under each ──
  for (const [x, z] of input.walk ?? []) pools.add(x, z, 4.2, 0xffa850, 0.34);
  // (and the avenue's kerb lamps: a warm run of light up its middle)
  for (let z = AVENUE.z0 + 3; z < AVENUE.z1 - 1; z += 6) pools.add(AVENUE.x, z, 5.5, 0xffa850, 0.24);

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
      lantern(b, bodies, glows, wires, lx, hang, lz, drop, (i + k) % 3 === 0 ? 'round' : 'tower', i * 5 + k, src);
    }
    pools.add(x + Math.sin(toSq) * r * 0.7, z + Math.cos(toSq) * r * 0.7, 5.5, 0xffa850, 0.2);
  }

  // ── The glow over the square: the dome of lit air (night), the ring's glow at midnight ──
  glows.dome(SQUARE.x, G + 14, SQUARE.z - 1, 78, 0xffb050, 0.24);
  glows.dome(SQUARE.x, G + 5, SQUARE.z + 1, 46, 0xffbc60, 0.22);
  glows.dome(GATE.x + 6, G + 4, GATE.z + 10, 30, 0xffa850, 0.16);
  glows.add(RING.x, G + 2.5, RING.z, 30, 0xffc060, 0.5, 1, 2);

  // ── The beams (the event night only) ──
  const beamBases: [number, number, number, number][] = [];
  const offs = low ? [-14, -5, 5, 14] : [-17, -10, -3.5, 3.5, 10, 17];
  for (const [i, dx] of offs.entries()) {
    const x = STAGE.x + dx;
    const z = STAGE.back - 3.5 - Math.abs(dx) * 0.12;
    const y = field.heightAt(x, z) + 0.6;
    beamBases.push([x, y, z, i]);
    glows.add(x, y + 0.6, z, 5, 0xffd080, 0.9, 0, 1);
  }

  // ── Build ──
  const blocks = b.boxes.length;
  const vox = buildVoxelMesh(b, { quality: low ? 'low' : 'medium', name: 'nye:glow' });
  object.add(vox);
  const ground = pools.build();
  object.add(ground.mesh);
  const body = bodies.build();
  if (body) object.add(body.mesh);
  const wireGeo = new BufferGeometry();
  wireGeo.setAttribute('position', new Float32BufferAttribute(wires, 3));
  const wireMesh = new LineSegments(wireGeo, new LineBasicMaterial({ color: 0x241e1a, fog: true }));
  wireMesh.name = 'nye:glow:wires';
  wireMesh.raycast = () => {};
  object.add(wireMesh);
  const glowMesh = glows.build();
  object.add(glowMesh.mesh);
  const beams = buildBeams(beamBases, offs.length);
  object.add(beams.mesh);

  console.info(
    `[map] nye glow: ${blocks} blocks · ${flames.length} edge lamps · ${poles.length} poles · ${pairs.length} walk pairs · ${bodies.count} bulbs and lanterns · ${glows.count} glows · ${pools.count} pools · built in ${(performance.now() - t0).toFixed(1)} ms`,
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
      const boost = 1 + 0.25 * event;
      const t = now % 600;
      ground.u.uLevel.value = lit * boost;
      ground.u.uPulse.value = pulse;
      ground.mesh.visible = lit > 0.001;
      glowMesh.u.uLevel.value = lit * boost;
      glowMesh.u.uEvent.value = event;
      glowMesh.u.uPulse.value = pulse;
      glowMesh.u.uTime.value = t;
      glowMesh.mesh.visible = lit > 0.001;
      body?.update(n, event);
      beams.u.uLevel.value = event * lit;
      beams.u.uTime.value = t;
      beams.mesh.visible = event * lit > 0.001;
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
  for (const s of [8, 17, 26]) {
    const [cx, cz, tx, tz] = at(s);
    const pair: [number, number][] = [];
    for (const side of [-1, 1]) {
      for (const d of [5.6, 6.4, 7.2, 4.8, 8.2]) {
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

/** A tall lacquered pole, a gilt collar and finial, a cross arm with a tower lantern hanging at each end. */
function tallPole(b: VoxelBuilder, bodies: Bodies, glows: Glows, wires: number[], x: number, g: number, z: number, h: number, out: number, src: ReturnType<typeof traceSource>): void {
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
  for (const s of [-1, 1]) lantern(b, bodies, glows, wires, x + cx * s * 0.85, ay - 0.05, z + cz * s * 0.85, 0.45, 'tower', Math.round(x * 3 + s), src);
}

/** A walk pole: lacquer, a gilt top, a short bracket toward the way with a lantern on it. */
function walkPole(b: VoxelBuilder, bodies: Bodies, glows: Glows, wires: number[], x: number, g: number, z: number, h: number, toward: number, src: ReturnType<typeof traceSource>, seed: number): void {
  b.box(x, g + 0.18, z, 0.5, 0.36, 0.5, pick(LATERITE, x, z, 1, 93), 'mapStone', { src });
  b.box(x, g + h / 2, z, 0.18, h, 0.18, pick(LACQUER, x, z, 2, 93), 'mapStone', { src });
  b.box(x, g + h + 0.06, z, 0.26, 0.12, 0.26, pick(GOLD, x, z, 3, 93), 'mapStone', { src });
  b.box(x, g + h + 0.22, z, 0.12, 0.22, 0.12, pick(GOLD, x, z, 4, 93), 'mapStone', { src, shade: 1.08 });
  const ay = g + h - 1.2;
  const sx = Math.sin(toward);
  const sz = Math.cos(toward);
  b.box(x + sx * 0.4, ay, z + sz * 0.4, 0.8, 0.08, 0.08, pick(LACQUER, x, z, 5, 93), 'mapStone', { src, ry: toward - Math.PI / 2 });
  lantern(b, bodies, glows, wires, x + sx * 0.75, ay - 0.04, z + sz * 0.75, 0.35, seed % 2 ? 'round' : 'tower', 200 + seed, src);
}

/**
 * A hanging lantern from (x, y, z) on a cord `drop` m long: `tower` a glowing body under a little Angkor tower top
 * (three corbelled tiers and a gilt lotus bud) on a dark wooden frame; `round` a round paper lamp (an octagon of two
 * crossed boxes) between two dark wooden rings.
 */
function lantern(b: VoxelBuilder, bodies: Bodies, glows: Glows, wires: number[], x: number, y: number, z: number, drop: number, kind: 'tower' | 'round', seed: number, src: ReturnType<typeof traceSource>): void {
  const top = y - drop;
  wires.push(x, y, z, x, top, z);
  const col = LANTERN[Math.floor(hash3(x, z, seed, 94) * LANTERN.length) % LANTERN.length];
  const wood = (i: number) => pick(WOOD, x, z, i, 94 + seed);
  if (kind === 'tower') {
    // The tower top, from its bud down to the eave.
    b.box(x, top - 0.05, z, 0.07, 0.1, 0.07, pick(GOLD, x, z, 1, 94), 'mapStone', { src, shade: 1.1 });
    const tiers = [0.14, 0.22, 0.3];
    let yy = top - 0.1;
    for (const [i, w] of tiers.entries()) {
      b.box(x, yy - 0.05, z, w, 0.1, w, wood(2 + i), 'mapStone', { src, shade: 1 + i * 0.03 });
      yy -= 0.1;
    }
    b.box(x, yy - 0.03, z, 0.44, 0.06, 0.44, wood(6), 'mapStone', { src });
    yy -= 0.06;
    bodies.add(x, yy - 0.22, z, 0.34, 0.44, 0.34, col, 1);
    b.box(x, yy - 0.47, z, 0.4, 0.06, 0.4, wood(7), 'mapStone', { src });
    glows.halo(x, yy - 0.22, z, 2.4, col, 0.75);
  } else {
    b.box(x, top - 0.03, z, 0.26, 0.06, 0.26, wood(2), 'mapStone', { src });
    bodies.add(x, top - 0.3, z, 0.44, 0.48, 0.44, col, 0.9);
    bodies.add(x, top - 0.3, z, 0.44, 0.48, 0.44, col, 0.9, Math.PI / 4);
    b.box(x, top - 0.57, z, 0.26, 0.06, 0.26, wood(3), 'mapStone', { src });
    glows.halo(x, top - 0.3, z, 2.6, col, 0.75);
  }
}

/** A string of bulbs from p to q, sagging `sag` m in the middle: the wire into `wires`, a bulb every `every` m. */
function stringLights(p: V3, q: V3, sag: number, every: number, bodies: Bodies, glows: Glows | null, wires: number[]): void {
  const len = Math.hypot(q.x - p.x, q.z - p.z);
  if (len < 1) return;
  const yAt = (u: number) => p.y + (q.y - p.y) * u - sag * 4 * u * (1 - u);
  const pieces = Math.max(4, Math.round(len / 1.5));
  for (let i = 0; i < pieces; i++) {
    const u0 = i / pieces;
    const u1 = (i + 1) / pieces;
    wires.push(p.x + (q.x - p.x) * u0, yAt(u0), p.z + (q.z - p.z) * u0, p.x + (q.x - p.x) * u1, yAt(u1), p.z + (q.z - p.z) * u1);
  }
  const n = Math.max(2, Math.round(len / every));
  for (let i = 1; i < n; i++) {
    const u = i / n;
    const x = p.x + (q.x - p.x) * u;
    const z = p.z + (q.z - p.z) * u;
    const y = yAt(u) - 0.08;
    const c = BULB[Math.floor(hash3(x, z, i, 95) * BULB.length) % BULB.length];
    bodies.add(x, y, z, 0.11, 0.13, 0.11, c, 0.85 + 0.3 * hash3(x, z, i, 96));
    if (glows && i % 3 === 0) glows.halo(x, y, z, 0.8, c, 0.3);
  }
}

// ── The glowing bodies: bulbs and lanterns (one instanced draw, unlit, over 1.0 at night) ──

class Bodies {
  private readonly items: { p: [number, number, number]; s: [number, number, number]; c: number; k: number; ry: number }[] = [];
  get count(): number {
    return this.items.length;
  }
  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, c: number, k: number, ry = 0): void {
    this.items.push({ p: [x, y, z], s: [sx, sy, sz], c, k, ry });
  }
  build(): { mesh: InstancedMesh; update(night: number, event: number): void } | null {
    if (!this.items.length) return null;
    const material = new MeshBasicMaterial({ color: 0xffffff });
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), material, this.items.length);
    mesh.name = 'nye:glow:bodies';
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Euler();
    const v = new Vector3();
    const s = new Vector3();
    const c = new Color();
    this.items.forEach((it, i) => {
      q.setFromEuler(e.set(0, it.ry, 0));
      m.compose(v.set(...it.p), q, s.set(...it.s));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setHex(it.c).multiplyScalar(it.k));
    });
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.raycast = () => {};
    mesh.computeBoundingSphere();
    return {
      mesh,
      update(night, event) {
        const n = smooth(0.1, 0.85, night);
        // Paper and glass by day (a little warm), over 1.0 at night for the bloom.
        material.color.setScalar((0.6 + 2.4 * n) * (1 + 0.2 * event));
      },
    };
  }
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
  build(): { mesh: Mesh; u: { uLevel: { value: number }; uPulse: { value: number } } } {
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('pLoc', new Float32BufferAttribute(this.loc, 2));
    geo.setAttribute('pCol', new Float32BufferAttribute(this.col, 3));
    geo.setAttribute('pShape', new Float32BufferAttribute(this.shape, 4));
    geo.setIndex(this.idx);
    geo.computeBoundingSphere();
    const u = { ...hazeUniforms(), uLevel: { value: 0 }, uPulse: { value: 0 } };
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
        void main() {
          vLoc = pLoc;
          vShape = pShape.xyz;
          float on = pShape.w > 1.5 ? uPulse : 1.0;
          vCol = pCol * uLevel * on;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        varying vec2 vLoc;
        varying vec3 vCol;
        varying vec3 vShape;
        void main() {
          float r = length(vLoc);
          // A pool: soft to its rim; a ring: a thin line of light at its radius with a faint spill.
          float q = r / vShape.y;
          float pool = (exp(-q * q * 3.2) - 0.04) * (1.0 - smoothstep(0.85, 1.0, q));
          float dr = (r - vShape.y) / max(vShape.z, 0.01);
          float ring = exp(-dr * dr) + 0.12 * exp(-dr * dr * 0.08);
          float a = mix(pool, ring, vShape.x);
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
  private readonly c = new Color();
  get count(): number {
    return this.data.length / 12;
  }
  /** A glow at (x, y, z), `size` m across, colour (sRGB) × level; `kind` 0 halo, 1 dome; `show` 0 night, 1 event night, 2 midnight pulse. */
  add(x: number, y: number, z: number, size: number, color: number, level: number, kind = 0, show = 0): void {
    this.c.setHex(color).multiplyScalar(level);
    this.data.push(x, y, z, size, this.c.r, this.c.g, this.c.b, kind, show, (x * 12.9898 + z * 78.233) % 1, 0, 0);
  }
  halo(x: number, y: number, z: number, size: number, color: number, level: number): void {
    this.add(x, y, z, size, color, level, 0, 0);
  }
  dome(x: number, y: number, z: number, size: number, color: number, level: number): void {
    this.add(x, y, z, size, color, level, 1, 0);
  }
  build(): { mesh: Mesh; u: { uLevel: { value: number }; uEvent: { value: number }; uPulse: { value: number }; uTime: { value: number } } } {
    const n = this.count;
    const quad = new PlaneGeometry(1, 1);
    const geo = new InstancedBufferGeometry();
    geo.setIndex(quad.getIndex());
    geo.setAttribute('position', quad.getAttribute('position'));
    const take = (off: number) => {
      const a = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) a[i * 4 + k] = this.data[i * 12 + off + k];
      return new InstancedBufferAttribute(a, 4);
    };
    geo.setAttribute('sPos', take(0));
    geo.setAttribute('sCol', take(4));
    geo.setAttribute('sOpt', take(8));
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
        uniform float uLevel;
        uniform float uEvent;
        uniform float uPulse;
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vCol;
        varying float vKind;
        void main() {
          // Shown: at night (0), on the event night (1), with the midnight pulse (2).
          vec3 shows = vec3(1.0, uEvent, uPulse);
          float on = dot(shows, vec3(step(sOpt.x, 0.5), step(0.5, sOpt.x) * step(sOpt.x, 1.5), step(1.5, sOpt.x)));
          vec4 mvPosition = viewMatrix * vec4(sPos.xyz, 1.0);
          float dist = length(mvPosition.xyz);
          // A dome fades out as the camera comes in under it (and costs no pixels there).
          float near = mix(1.0, smoothstep(sPos.w * 0.45, sPos.w * 1.25, dist), sCol.w);
          float fl = 1.0 + 0.06 * sin(uTime * 1.7 + sOpt.y * 40.0) * (1.0 - sCol.w);
          vCol = sCol.rgb * uLevel * on * near * fl;
          vKind = sCol.w;
          vUv = position.xy * 2.0;
          mvPosition.xy += position.xy * sPos.w;
          gl_Position = projectionMatrix * mvPosition;
          if (dot(vCol, vCol) < 1e-7) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        #include <fog_pars_fragment>
        varying vec2 vUv;
        varying vec3 vCol;
        varying float vKind;
        void main() {
          float r2 = dot(vUv, vUv);
          float halo = exp(-r2 * 5.0) * 0.85 + exp(-r2 * 28.0) * 0.6;
          float dome = exp(-r2 * 3.0) - 0.05;
          float a = mix(halo, dome, vKind) * (1.0 - smoothstep(0.8, 1.0, r2));
          vec3 col = vCol * max(a, 0.0);
          #ifdef USE_FOG
            // Into the haze with distance; the mist dims the halos, the lit air glows in it.
            vec3 hzRay = vFogWorld - cameraPosition;
            float hzDist = length(hzRay);
            float low = hazeLowAmount(cameraPosition, vFogWorld, hzDist, hazeBanks(vFogWorld.xz).x);
            col *= (1.0 - 0.8 * hazeDistance(hzDist)) * (1.0 - mix(0.8, 0.25, vKind) * low);
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

function buildBeams(bases: [number, number, number, number][], count: number): { mesh: Mesh; u: { uLevel: { value: number }; uTime: { value: number } } } {
  const quad = new PlaneGeometry(1, 1, 1, 8);
  const geo = new InstancedBufferGeometry();
  geo.setIndex(quad.getIndex());
  geo.setAttribute('position', quad.getAttribute('position'));
  const base = new Float32Array(bases.length * 4);
  const aim = new Float32Array(bases.length * 4);
  bases.forEach(([x, y, z, i], k) => {
    base.set([x, y, z, hash3(i, 1, 2, 97) * 6.28], k * 4);
    // Up and out to their side (never into Kulen's slope behind): azimuth (π/2 east, −π/2 west), elevation (the
    // outer ones lower), sweep amplitude, sweep speed (rad/s).
    const side = (i + 0.5) / count - 0.5;
    const az = (side > 0 ? 1 : -1) * (Math.PI / 2 - 0.35 + 0.3 * hash3(i, 9, 1, 97));
    aim.set([az, 1.42 - Math.abs(side) * 0.55 + 0.06 * hash3(i, 3, 4, 97), 0.45 + 0.15 * hash3(i, 5, 6, 97), 0.11 + 0.06 * hash3(i, 7, 8, 97)], k * 4);
  });
  geo.setAttribute('bBase', new InstancedBufferAttribute(base, 4));
  geo.setAttribute('bAim', new InstancedBufferAttribute(aim, 4));
  geo.instanceCount = bases.length;
  // (bound: the beams' reach; the map's culling reads it)
  geo.boundingSphere = new Sphere(new Vector3(STAGE.x, GROUND + 120, STAGE.back), 280);
  const u = { ...hazeUniforms(), uLevel: { value: 0 }, uTime: { value: 0 }, uColor: { value: new Color(0xffd890) } };
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
        vec3 p = bBase.xyz + dir * (t * 260.0);
        vec3 side = normalize(cross(dir, p - cameraPosition));
        p += side * position.x * mix(1.6, 34.0, t);
        vUv = vec2(position.x * 2.0, t);
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform float uLevel;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float across = exp(-vUv.x * vUv.x * 4.0) * 0.8 + exp(-vUv.x * vUv.x * 30.0) * 0.5;
        float along = pow(1.0 - vUv.y, 1.6) * smoothstep(0.0, 0.03, vUv.y);
        vec3 col = uColor * (0.3 * uLevel * across * along);
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
  return { mesh, u };
}
