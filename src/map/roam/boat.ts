import { Color, Euler, Group, PerspectiveCamera, PointLight, Vector3 } from 'three';
import { hash3 } from '../../voxel/random';
import type { HeightField, RiverSample } from '../heightfield';
import { OVERVIEW, PLACES } from '../layout';
import type { MapFrame } from '../types';
import { BOAT_HALF_BEAM, BOAT_LENGTH, buildBoat, buildMooring, buildPaddle, LANTERN, lanternHalo, lanternMaterial } from './_boatModel';
import { PaddleStroke, ridePose, type RideState } from './_boatPoses';
import { createWake } from './_wake';
import { angleDiff } from './followCam';
import { riverField, type RiverField } from './flow';
import { ROAM_SCALE, type RoamCtx, type RoamMode, type RoamModeHandler } from './types';

/**
 * A small wooden boat on the rivers: W / S paddle, A / D turn; the current
 * carries it (faster where the river narrows and towards a fall's lip); it
 * slides along the banks, goes over the falls (tipping forward, down with
 * the water, a splash in the pool below) but never up them. E near a bank
 * (or paddling hard into a low one) steps ashore; the boat stays moored
 * there. A second boat waits at a little landing by the River Gate bridge,
 * seen from the overview: the walker boards it with E (`mooredBoatNear`).
 *
 * The boat's middle on the waterline is the explorer's feet point
 * (`body.pos`), and they share the heading; the posture (_boatPoses.ts) seats
 * him on the thwart and tilts him with the hull.
 */

/** Paddling: push ahead and astern (m/s²), linear and square drag, turn rate (rad/s), sideways grip (1/s). */
const THRUST = 3.4;
const THRUST_BACK = 1.8;
const DRAG = 0.3;
const DRAG2 = 0.055;
const TURN = 1.15;
const GRIP = 2.5;
/** Gravity over a fall (m/s²; a little light, so the drop can be watched). */
const FALL_G = 16;
/** Highest bank he steps up onto (m): one land block, as the walker. */
const STEP_UP = 2.3;
/** How close the walker must be to a moored boat to board it (m). */
export const BOARD_REACH = 6;
/** Physics steps at most this long (s). */
const MAX_STEP = 1 / 30;
/** Points along the hull kept off the banks: (along, radius) as shares of the half length and half beam. */
const HULL = [
  [0.97, 0.4],
  [0.55, 0.85],
  [0, 1],
  [-0.55, 0.85],
  [-0.97, 0.4],
] as const;

/** A boat tied up somewhere: where, its heading, and its water level. */
export interface Moored {
  x: number;
  z: number;
  yaw: number;
  level: number;
}

/** The boats waiting to be boarded (the River Gate landing, the one he left). */
const moored: { dock: Moored | null; left: Moored | null } = { dock: null, left: null };

/**
 * The nearest boat waiting within `reach` of (x, z) (m), or null. For the
 * walker: show "E  Board the boat" and return `'boat'` on E; the boat mode
 * then seats him in that boat.
 */
export function mooredBoatNear(x: number, z: number, reach = BOARD_REACH): Moored | null {
  let best: Moored | null = null;
  let bd = reach;
  for (const m of [moored.dock, moored.left]) {
    if (!m) continue;
    const d = Math.hypot(m.x - x, m.z - z);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  return best;
}

/** The boat mode, plus `frame` for every frame in every mode (moored boats, lantern light). */
export interface BoatMode extends RoamModeHandler {
  readonly object: Group;
  /**
   * Call every frame, also in the overview: the moored boats bob, the
   * lanterns follow the time of day, the wake fades out after leaving.
   */
  frame(f: MapFrame): void;
  /** Voxel blocks of the boats, paddle and landing. */
  readonly blocks: number;
}

type Phase = 'board' | 'rise' | 'float' | 'drop';

const _e = new Euler();
/** Foam by day and by moonlight (linear). */
const FOAM_DAY = new Color(0.93, 0.96, 0.95);
const FOAM_NIGHT = new Color(0.36, 0.44, 0.58);
const _flow = { x: 0, z: 0 };
const _fb = { x: 0, z: 0 };
const _fs = { x: 0, z: 0 };

/**
 * `field`: build the River Gate landing at once (so the overview shows it);
 * without it the landing appears when the boat mode first runs.
 */
export function createBoat(field?: HeightField): BoatMode {
  const object = new Group();
  object.name = 'boat';
  const glow = lanternMaterial();
  const halo = lanternHalo();
  const model = buildBoat(glow, halo);
  const paddle = buildPaddle();
  const wake = createWake();
  object.add(wake.object);
  let blocks = model.blocks * 2 + paddle.blocks;

  // The boat he rides (hidden until the first ride) and the one at the landing.
  const ride = model.object;
  ride.name = 'boat:ride';
  ride.visible = false;
  const dock = model.object.clone();
  dock.name = 'boat:landing';
  dock.visible = false;
  object.add(ride, dock);
  // One warm light, on the lantern of the boat in use (else the landing's): lights the water round it at night.
  const light = new PointLight(0xffb266, 0, 14, 2);
  light.name = 'boat lantern';
  // (out in front of the cage, so the lantern and the bow do not burn white)
  light.position.copy(LANTERN).add(new Vector3(0, 0.1, 0.45));
  dock.add(light);

  let river: RiverField | null = null;
  let dockAt: Moored | null = null;
  const build = (f: HeightField) => {
    if (river) return;
    const t0 = performance.now();
    river = riverField(f);
    const spot = findLanding(f, river);
    if (spot) {
      dockAt = spot.boat;
      moored.dock = { ...spot.boat };
      placeHull(dock, spot.boat, 0);
      dock.visible = true;
      const m = buildMooring(spot.mooring);
      object.add(m.object);
      blocks += m.blocks;
    }
    const at = spot ? `landing at (${spot.boat.x.toFixed(0)}, ${spot.boat.z.toFixed(0)})` : 'no landing found';
    console.info(`[map] boat: ${blocks} blocks, rivers and ${at} in ${Math.round(performance.now() - t0)} ms`);
  };
  if (field) build(field);

  // ── Ride state ─────────────────────────────────────────────────────────
  let riding = false;
  let phase: Phase = 'float';
  let level = 0;
  let clock = 0;
  let yawRate = 0;
  let heave = 0;
  let heaveV = 0;
  let pitch = 0;
  let pitchV = 0;
  let roll = 0;
  let rollV = 0;
  let pushT = 0;
  let wakeRun = 0;
  let lapT = 0;
  let spawnN = 0;
  // Getting in: the hop from the bank onto a moored boat, or the boat rising under him.
  let inT = 0;
  const hopFrom = new Vector3();
  const boardAt = new Vector3();
  let boardYaw = 0;
  // Over a fall.
  const drop = { t: 0, T: 1, x0: 0, z0: 0, x1: 0, z1: 0, top: 0, bottom: 0, dx: 0, dz: 1 };
  // Camera over a drop: over a big fall swung round to watch from the front and side
  // (`watch`), down a small one tilted to look over the edge; then back as it was.
  const dropCam = { on: false, watch: false, after: 0, yaw: 0, pitch: 0.3, dist: 11 };
  let prompt: string | null = null;
  /** `frame` is called (the wake can fade out after he leaves). */
  let framed = false;

  const stroke = new PaddleStroke();
  const rideState: RideState = { pitch: 0, roll: 0, stroke, brace: 0, look: 0 };
  const posture = () => ridePose(rideState, paddle.object);

  const rnd = (k: number) => hash3(spawnN, k, 7, 913);

  /** Put a hull on the water: position, heading, tilt. */
  function placeHull(hull: Group, m: Moored, y: number, p = 0, r = 0): void {
    hull.position.set(m.x, m.level + y, m.z);
    hull.rotation.copy(_e.set(p, m.yaw, r, 'YXZ'));
    hull.scale.setScalar(ROAM_SCALE);
  }

  /**
   * Open water for the hull round (x, z) within `reach` (m): the nearest, a
   * level near `want` first (not the pool at the foot of a cliff); null if none.
   */
  function openWaterNear(x: number, z: number, reach: number, hb: number, want: number): { x: number; z: number; level: number } | null {
    const r = river!;
    let best: { x: number; z: number; level: number } | null = null;
    let score = Infinity;
    for (let d = 0; d <= reach && d < score; d += 0.75) {
      const n = d === 0 ? 1 : Math.ceil((d * Math.PI * 2) / 0.75);
      for (let a = 0; a < n; a++) {
        const x1 = x + Math.cos((a / n) * Math.PI * 2) * d;
        const z1 = z + Math.sin((a / n) * Math.PI * 2) * d;
        const lv = r.levelAt(x1, z1);
        if (lv === null || r.bankAt(x1, z1, lv) < hb) continue;
        const sc = d + Math.abs(lv - want) * 3;
        if (sc < score) [score, best] = [sc, { x: x1, z: z1, level: lv }];
      }
    }
    return best;
  }

  /** A heading for a hull at (x, z) near `yaw` whose bow and stern are both on open water. */
  function fitHeading(x: number, z: number, lv: number, yaw: number, s: number): number {
    const r = river!;
    const hl = (BOAT_LENGTH / 2) * s * 0.8;
    const room = (a: number) => Math.min(r.bankAt(x + Math.sin(a) * hl, z + Math.cos(a) * hl, lv), r.bankAt(x - Math.sin(a) * hl, z - Math.cos(a) * hl, lv));
    const hb = BOAT_HALF_BEAM * s;
    if (room(yaw) >= hb) return yaw;
    // Along the current (either way, the nearer to `yaw`), else the roomiest of 16.
    r.flowAt(x, z, _flow);
    if (Math.hypot(_flow.x, _flow.z) > 0.05) {
      const a = Math.atan2(_flow.x, _flow.z);
      const b = Math.abs(angleDiff(a, yaw)) < Math.PI / 2 ? a : a + Math.PI;
      if (room(b) >= hb) return b;
    }
    let best = yaw;
    let br = -Infinity;
    for (let i = 0; i < 16; i++) {
      const a = yaw + (i / 16) * Math.PI * 2;
      const v = room(a) - Math.abs(angleDiff(a, yaw)) * 0.05;
      if (v > br) [br, best] = [v, a];
    }
    return best;
  }

  /** Dry ground to step onto beside the boat: the nearest bank, the sides first. */
  function ashore(ctx: RoamCtx, frontOnly = false): { x: number; y: number; z: number; yaw: number } | null {
    const { body, world } = ctx;
    const r = river!;
    const s = body.scale;
    const hb = BOAT_HALF_BEAM * s;
    const turns = frontOnly ? [0, -Math.PI / 4, Math.PI / 4] : [-Math.PI / 2, Math.PI / 2, -Math.PI / 4, Math.PI / 4, 0, (-3 * Math.PI) / 4, (3 * Math.PI) / 4];
    let best: { x: number; y: number; z: number; yaw: number } | null = null;
    let bd = Infinity;
    for (const off of turns) {
      const a = body.yaw + off;
      const dx = Math.sin(a);
      const dz = Math.cos(a);
      const lead = off === 0 ? (BOAT_LENGTH / 2) * s : Math.abs(off) < 1 ? hb * 2 : hb;
      for (const d of [0.9, 1.7, 2.6, 3.4, 4.3]) {
        const x = body.pos.x + dx * (lead + d);
        const z = body.pos.z + dz * (lead + d);
        if (r.levelAt(x, z) !== null || world.waterAt(x, z) !== null) continue;
        if (!world.inBounds(x, z)) break;
        const g = world.groundAt(x, z);
        if (g > level + STEP_UP || g < level - 1.5) break;
        if (lead + d < bd) {
          bd = lead + d;
          best = { x, y: g, z, yaw: a };
        }
        break;
      }
    }
    return best;
  }

  /** Splash where the boat meets the water hard (landing from a fall, appearing). */
  function splash(x: number, y: number, z: number, size: number, s: number): void {
    wake.ring(x, y + 0.05 * s, z, 0.8 * s * size, 4.5 * s * size, 2.4, 0.7);
    wake.ring(x, y + 0.05 * s, z, 0.4 * s * size, 2.6 * s * size, 1.6, 0.5);
    const n = Math.round(6 + 8 * size);
    for (let i = 0; i < n; i++) {
      spawnN++;
      const a = rnd(1) * Math.PI * 2;
      const sp = (1.2 + rnd(2) * 2.2) * s * size;
      wake.drop(x + Math.cos(a) * 0.8 * s, y + 0.2 * s, z + Math.sin(a) * 0.8 * s, Math.cos(a) * sp, (2.5 + rnd(3) * 3.5) * Math.sqrt(size) * s, Math.sin(a) * sp, (0.12 + rnd(4) * 0.12) * s, 1.6, y);
      if (i % 2 === 0)
        wake.foam(x + Math.cos(a) * 1.2 * s * size, y + 0.06 * s, z + Math.sin(a) * 1.2 * s * size, Math.cos(a) * sp * 0.4, Math.sin(a) * sp * 0.4, 0.8 * s, 0.8 * s, 2.4 * s * size, 2.4 * s * size, a, 2.6, 0.6);
    }
  }

  // ── Physics ────────────────────────────────────────────────────────────

  /** One step afloat; a mode to switch to, or null. */
  function float(ctx: RoamCtx, h: number): RoamMode | null {
    const { body, input, world } = ctx;
    const r = river!;
    const s = body.scale;
    const hb = BOAT_HALF_BEAM * s * 1.05;
    const hl = (BOAT_LENGTH / 2) * s * 0.82;
    const fwd = input.move.y;
    const turn = input.move.x;

    if (stroke.update(h, fwd, turn)) {
      const c = stroke.catchAt;
      const cx = body.pos.x + (Math.cos(body.yaw) * c.x + Math.sin(body.yaw) * c.z) * s;
      const cz = body.pos.z + (-Math.sin(body.yaw) * c.x + Math.cos(body.yaw) * c.z) * s;
      ctx.sound('paddle', 0.55 + 0.35 * Math.min(1, Math.abs(fwd) + Math.abs(turn)));
      spawnN++;
      wake.ring(cx, level + 0.05 * s, cz, 0.15 * s, 0.8 * s, 1.2, 0.4);
      wake.drop(cx, level + 0.1 * s, cz, (rnd(1) - 0.5) * s, 1.8 * s, (rnd(2) - 0.5) * s, 0.08 * s, 0.9, level);
    }

    const hx = Math.sin(body.yaw);
    const hz = Math.cos(body.yaw);
    const rx = -hz;
    const rz = hx;
    r.flowAt(body.pos.x, body.pos.z, _flow);
    // Velocity through the water: ahead (vf) and sideways (vl).
    const wx = body.vel.x - _flow.x;
    const wz = body.vel.z - _flow.z;
    let vf = wx * hx + wz * hz;
    let vl = wx * rx + wz * rz;
    const push = (fwd >= 0 ? THRUST : THRUST_BACK) * fwd * (0.65 + 0.55 * stroke.power);
    vf += (push - DRAG * vf - DRAG2 * vf * Math.abs(vf)) * h;
    vl *= Math.exp(-GRIP * h);
    body.vel.x = _flow.x + hx * vf + rx * vl;
    body.vel.z = _flow.z + hz * vf + rz * vl;

    // Turning, and the river turning the boat where bow and stern feel different currents.
    r.flowAt(body.pos.x + hx * hl, body.pos.z + hz * hl, _fb);
    r.flowAt(body.pos.x - hx * hl, body.pos.z - hz * hl, _fs);
    const spin = -(((_fb.x - _fs.x) * rx + (_fb.z - _fs.z) * rz) / (2 * hl));
    const want = -turn * TURN * (1 + 0.2 * Math.min(1, Math.abs(vf) / 3));
    yawRate += (want - yawRate) * (1 - Math.exp(-h * 4)) + spin * h * 1.5;
    body.yaw += yawRate * h;

    // Move; the map's end stops the boat.
    let nx = body.pos.x + body.vel.x * h;
    let nz = body.pos.z + body.vel.z * h;
    if (!world.inBounds(nx, body.pos.z)) {
      nx = body.pos.x;
      body.vel.x = 0;
    }
    if (!world.inBounds(nx, nz)) {
      nz = body.pos.z;
      body.vel.z = 0;
    }
    // At a fall's lip, the bow over the edge and the boat going with the water: over it goes.
    const fall = r.fallNear(nx, nz, 16);
    if (fall && Math.abs(fall.top - level) < 0.5) {
      const [fdx, fdz] = fall.dir;
      const along = (nx - fall.x) * fdx + (nz - fall.z) * fdz;
      const across = Math.abs(-(nx - fall.x) * fdz + (nz - fall.z) * fdx);
      const bowAlong = along + Math.abs(hx * fdx + hz * fdz) * hl;
      if (across < fall.width / 2 + 1.5 && bowAlong > -hb && body.vel.x * fdx + body.vel.z * fdz > 0.3 && startDrop(ctx, fall.bottom, fall.x, fall.z, fall.dir)) return null;
    }
    // Over the edge of a lower reach: a step (or a fall).
    const lv = r.levelAt(nx, nz);
    if (lv !== null && lv < level - 0.5) {
      if (startDrop(ctx, lv, nx, nz, null)) return null;
      // (nowhere to land: the edge holds the boat)
      nx = body.pos.x;
      nz = body.pos.z;
      body.vel.x = body.vel.z = 0;
    }
    // Rocks, piers and low bridges stop it (it slides along them if it can).
    const HL = (BOAT_LENGTH / 2) * s;
    const hit = (x: number, z: number) => HULL.some(([fa]) => blocked(ctx, x + hx * fa * HL, z + hz * fa * HL));
    if (hit(nx, nz) && !hit(body.pos.x, body.pos.z)) {
      if (!hit(nx, body.pos.z)) {
        nz = body.pos.z;
        body.vel.z = 0;
      } else if (!hit(body.pos.x, nz)) {
        nx = body.pos.x;
        body.vel.x = 0;
      } else {
        nx = body.pos.x;
        nz = body.pos.z;
        body.vel.x = body.vel.z = 0;
      }
    }
    body.pos.x = nx;
    body.pos.z = nz;
    collide(ctx, hb, HL);

    // Rocking: small waves (more in fast water), leaning into turns, the stroke.
    const rough = 1 + 1.5 * Math.min(1, Math.max(0, (Math.hypot(_flow.x, _flow.z) - 1.2) / 1.2));
    const t = clock;
    const heaveT = (0.03 * Math.sin(t * 1.7) + 0.02 * Math.sin(t * 2.9 + 1)) * s * rough;
    // (the bow lifts a little while he pulls)
    const pitchT = (0.02 * Math.sin(t * 1.1 + 0.5) + 0.012 * Math.sin(t * 2.3)) * rough - push * 0.006;
    const rollT = (0.03 * Math.sin(t * 1.3) + 0.015 * Math.sin(t * 2.1 + 2)) * rough + yawRate * Math.min(4, Math.abs(vf)) * 0.03 - stroke.side * stroke.power * 0.03;
    const spring = (x: number, v: number, target: number, k: number, c: number) => v + (-(x - target) * k - v * c) * h;
    heaveV = spring(heave, heaveV, heaveT, 40, 7);
    heave += heaveV * h;
    pitchV = spring(pitch, pitchV, pitchT, 60, 9);
    pitch += pitchV * h;
    rollV = spring(roll, rollV, rollT, 45, 7);
    roll += rollV * h;
    rideState.brace = Math.max(0, rideState.brace - h * 1.2);
    // The camera or the phone up: the paddle goes down across his lap (the boat drifts on).
    const a = ctx.body.explorer.currentAction;
    const free = a === 'photo' || a === 'selfie';
    rideState.rest = Math.min(1, Math.max(0, (rideState.rest ?? 0) + h * (free ? 2.5 : -2.5)));
    rideState.look += (yawRate * 0.4 - rideState.look) * (1 - Math.exp(-h * 3));

    // Wake: a V of foam streaks off the stern, ripples at the bow when fast, rings round a still hull.
    const speed = Math.abs(vf);
    wakeRun += speed * h;
    if (wakeRun > 0.25 * s && speed > 0.5) {
      wakeRun = 0;
      spawnN++;
      const a = Math.min(1, speed / 4);
      const back = Math.sign(vf || 1);
      const sx = body.pos.x - hx * hl * back;
      const sz = body.pos.z - hz * hl * back;
      for (const side of [-1, 1]) {
        const out = 0.28 * speed;
        const arm = body.yaw + Math.PI - side * 0.33 * back;
        const jig = (rnd(side + 2) - 0.5) * 0.3 * s;
        wake.foam(sx + rx * side * (hb * 0.6 + jig), level + 0.05 * s, sz + rz * side * (hb * 0.6 + jig), _flow.x + rx * side * out, _flow.z + rz * side * out, 0.15 * s, 0.45 * s, 0.35 * s, 1.1 * s, arm, 2.2, 0.22 * a);
      }
      if (rnd(5) < 0.5) wake.foam(sx, level + 0.05 * s, sz, _flow.x, _flow.z, 0.25 * s, 0.4 * s, 0.6 * s, 1 * s, body.yaw, 1.5, 0.2 * a);
      if (speed > 2.5)
        for (const side of [-1, 1])
          wake.foam(body.pos.x + hx * hl + rx * side * hb * 0.6, level + 0.05 * s, body.pos.z + hz * hl + rz * side * hb * 0.6, _flow.x + rx * side * 0.6, _flow.z + rz * side * 0.6, 0.2 * s, 0.4 * s, 0.45 * s, 1 * s, body.yaw - side * 0.6, 1, 0.3 * a);
    }
    lapT += h;
    if (speed < 0.5 && lapT > 2.6) {
      lapT = 0;
      wake.ring(body.pos.x, level + 0.05 * s, body.pos.z, 1.1 * s, 2.2 * s, 3, 0.16, 2.2, body.yaw);
    }
    ctx.levels.wake = Math.min(1, speed / 5 + Math.hypot(_flow.x, _flow.z) * 0.08);

    // Paddling hard, head on, into a low bank: step out.
    const bx = body.pos.x + hx * hl;
    const bz = body.pos.z + hz * hl;
    const bow = r.bankAt(bx, bz, level);
    const facing = hx * (r.bankAt(bx + 0.5, bz, level) - r.bankAt(bx - 0.5, bz, level)) + hz * (r.bankAt(bx, bz + 0.5, level) - r.bankAt(bx, bz - 0.5, level));
    pushT = fwd > 0.5 && bow < hb + 0.2 && vf < 0.7 && facing < -0.5 ? pushT + h : Math.max(0, pushT - h * 2);
    if (pushT > 1.3) {
      pushT = 0;
      const land = ashore(ctx, true);
      if (land) return stepOut(ctx, land);
    }
    return null;
  }

  /** Something built in the way of the hull at (x, z): a rock or a pier out of the water, a bridge too low to pass under. */
  function blocked(ctx: RoamCtx, x: number, z: number): boolean {
    const { world, body } = ctx;
    const s = body.scale;
    if (world.standAt ? Number.isNaN(world.standAt(x, z, level, 0.2 * s, 0)) : world.groundAt(x, z) > level + 0.2 * s) return true;
    return (world.ceilingAt?.(x, z, level) ?? Infinity) < level + 1.3 * s;
  }

  /** Keep the hull off the banks: push its points (bow to stern) out, turn it away, slide along. */
  function collide(ctx: RoamCtx, hb: number, hl: number): void {
    const { body } = ctx;
    const r = river!;
    const hx = Math.sin(body.yaw);
    const hz = Math.cos(body.yaw);
    const rx = -hz;
    const rz = hx;
    let tx = 0;
    let tz = 0;
    let nx = 0;
    let nz = 0;
    let turn = 0;
    for (const [fa, fr] of HULL) {
      const along = fa * hl;
      const rad = fr * hb;
      const x = body.pos.x + hx * along;
      const z = body.pos.z + hz * along;
      const d = r.bankAt(x, z, level);
      if (d >= rad) continue;
      let gx = r.bankAt(x + 0.5, z, level) - r.bankAt(x - 0.5, z, level);
      let gz = r.bankAt(x, z + 0.5, level) - r.bankAt(x, z - 0.5, level);
      const gl = Math.hypot(gx, gz);
      if (gl < 1e-4) {
        // (flat spot: back towards the middle of the boat, or against the motion)
        gx = along ? -hx * Math.sign(along) : -body.vel.x;
        gz = along ? -hz * Math.sign(along) : -body.vel.z;
      }
      const g = Math.hypot(gx, gz) || 1;
      const p = Math.min(0.6, rad - d);
      const px = (gx / g) * p;
      const pz = (gz / g) * p;
      const w = 1 - 0.5 * Math.abs(fa);
      tx += px * w;
      tz += pz * w;
      nx += px;
      nz += pz;
      turn += (-(px * rx + pz * rz) * along) / (2 * hl * hl);
    }
    if (!nx && !nz) return;
    body.pos.x += tx;
    body.pos.z += tz;
    body.yaw += turn * 0.8;
    yawRate *= 0.9;
    // Slide: take away the part of the velocity into the bank (and a little bounce).
    const nl = Math.hypot(nx, nz);
    const ux = nx / nl;
    const uz = nz / nl;
    const vn = body.vel.x * ux + body.vel.z * uz;
    if (vn < 0) {
      body.vel.x -= ux * vn * 1.15;
      body.vel.z -= uz * vn * 1.15;
    }
    // Still on land after all (a thin spit, a corner): jump to the nearest open water.
    if (r.bankAt(body.pos.x, body.pos.z, level) < -0.3) {
      const w = openWaterNear(body.pos.x, body.pos.z, 12, hb, level);
      if (w && Math.abs(w.level - level) < 0.5) {
        body.pos.x = w.x;
        body.pos.z = w.z;
      }
    }
  }

  /**
   * Going over, down to the `lower` reach from the edge at (x, z) (a fall's
   * lip, with its direction): find where the boat lands below; false if
   * nowhere (then the edge holds it).
   */
  function startDrop(ctx: RoamCtx, lower: number, x: number, z: number, dir: readonly [number, number] | null): boolean {
    const { body } = ctx;
    const r = river!;
    const s = body.scale;
    const hb = BOAT_HALF_BEAM * s * 1.1;
    let [dx, dz] = dir ?? [body.vel.x, body.vel.z];
    const dl = Math.hypot(dx, dz);
    if (dl < 1e-3) {
      dx = Math.sin(body.yaw);
      dz = Math.cos(body.yaw);
    } else {
      dx /= dl;
      dz /= dl;
    }
    // Out along the fall to open water of the lower reach, a boat length clear of the face.
    let lx = NaN;
    let lz = NaN;
    for (let t = 1; t <= 26; t += 0.5) {
      const px = x + dx * t;
      const pz = z + dz * t;
      const lv = r.levelAt(px, pz);
      if (lv === null || Math.abs(lv - lower) > 0.5 || r.bankAt(px, pz, lower) < hb) continue;
      lx = px + dx * Math.min(2 * s, 2);
      lz = pz + dz * Math.min(2 * s, 2);
      if (r.bankAt(lx, lz, lower) < hb) [lx, lz] = [px, pz];
      break;
    }
    if (Number.isNaN(lx)) {
      const w = openWaterNear(x, z, 16, hb, lower);
      if (!w || Math.abs(w.level - lower) > 0.5) return false;
      [lx, lz] = [w.x, w.z];
    }
    const H = level - lower;
    drop.t = 0;
    drop.T = Math.sqrt((2 * (H + 0.2 * s)) / FALL_G);
    drop.x0 = body.pos.x;
    drop.z0 = body.pos.z;
    drop.x1 = lx;
    drop.z1 = lz;
    drop.top = level;
    drop.bottom = lower;
    const len = Math.hypot(lx - drop.x0, lz - drop.z0) || 1;
    drop.dx = (lx - drop.x0) / len;
    drop.dz = (lz - drop.z0) / len;
    phase = 'drop';
    body.grounded = false;
    if (H >= 6) watchFall(ctx);
    else {
      if (!dropCam.on) {
        dropCam.pitch = ctx.cam.pitch;
        dropCam.dist = ctx.cam.distance;
      }
      dropCam.on = true;
      dropCam.watch = false;
      dropCam.after = 0;
    }
    return true;
  }

  function dropStep(ctx: RoamCtx, h: number): void {
    const { body } = ctx;
    const s = body.scale;
    drop.t += h;
    const u = Math.min(1, drop.t / drop.T);
    const H = drop.top - drop.bottom;
    // (out from the lip quickly, then down: the hull clears the cliff's edge)
    const out = 1 - (1 - u) * (1 - u);
    body.pos.x = drop.x0 + (drop.x1 - drop.x0) * out;
    body.pos.z = drop.z0 + (drop.z1 - drop.z0) * out;
    const fallen = Math.min(H, 0.5 * FALL_G * drop.t * drop.t);
    level = drop.top - fallen;
    heave += (0 - heave) * (1 - Math.exp(-h * 6));
    // Tip forward with the water, the bow following the path down.
    const mean = Math.hypot(drop.x1 - drop.x0, drop.z1 - drop.z0) / drop.T;
    const vh = mean * 2 * (1 - u);
    const tipT = Math.min(1.0, Math.atan2(FALL_G * drop.t, Math.max(1.5, vh)) * 0.8) * Math.min(1, H / 6);
    pitch += (tipT - pitch) * (1 - Math.exp(-h * 7));
    pitchV = 0;
    roll *= Math.exp(-h * 3);
    body.yaw += angleDiff(Math.atan2(drop.dx, drop.dz), body.yaw) * (1 - Math.exp(-h * 3));
    rideState.brace = Math.min(1, rideState.brace + h * 5);
    body.vel.set(drop.dx * vh, -FALL_G * drop.t, drop.dz * vh);
    ctx.levels.wind = Math.min(1, (FALL_G * drop.t) / 14);
    if (u < 1) return;
    // Down: splash, the bow slaps down, the hull dips and bobs up.
    level = drop.bottom;
    phase = 'float';
    body.grounded = true;
    heave = -Math.min(0.5, 0.08 * H) * s;
    heaveV = 0;
    pitchV = -pitch * 3;
    body.vel.set(drop.dx * mean * 0.6, 0, drop.dz * mean * 0.6);
    ctx.sound('splash', Math.min(1, 0.35 + H / 14));
    splash(body.pos.x, level, body.pos.z, Math.min(1.6, 0.5 + H / 12), s);
  }

  /** Out onto the bank; the boat stays tied up where he left it. */
  function stepOut(ctx: RoamCtx, land: { x: number; y: number; z: number; yaw: number }): RoamMode {
    const { body } = ctx;
    moored.left = { x: body.pos.x, z: body.pos.z, yaw: body.yaw, level };
    body.pos.set(land.x, land.y, land.z);
    body.yaw = land.yaw;
    body.vel.set(0, 0, 0);
    return 'walk';
  }

  /** Where the boat and the explorer are drawn, the camera's aim. */
  function placeRide(ctx: RoamCtx, dt: number): void {
    const { body, cam } = ctx;
    const s = body.scale;
    const y = level + heave;
    if (phase === 'board') {
      ride.position.set(boardAt.x, y, boardAt.z);
      ride.rotation.copy(_e.set(pitch, boardYaw, roll, 'YXZ'));
    } else {
      body.pos.y = y;
      ride.position.set(body.pos.x, y, body.pos.z);
      ride.rotation.copy(_e.set(pitch, body.yaw, roll, 'YXZ'));
    }
    ride.scale.setScalar(s);
    rideState.pitch = pitch;
    rideState.roll = roll;

    // Camera: at the explorer's chest, steadier than the bobbing hull.
    cam.focus.set(body.pos.x, (phase === 'board' ? body.pos.y : level + heave * 0.3) + 1.15 * s, body.pos.z);
    cam.behindYaw = body.yaw;
    if (!dropCam.on) return;
    // Over a big fall: watch the boat go over from in front and to one side,
    // a moment in the pool below, then swing back behind. Down a small one:
    // look down over the edge from behind.
    const k = 1 - Math.exp(-dt * 3.5);
    if (phase === 'drop' || (dropCam.after += dt) < (dropCam.watch ? 1.4 : 0.6)) {
      if (dropCam.watch) {
        cam.follow = 0;
        cam.yaw += angleDiff(dropCam.yaw, cam.yaw) * k;
        cam.pitch += (0.3 - cam.pitch) * k;
        cam.distance += (Math.max(dropCam.dist, 15) - cam.distance) * k;
      } else {
        cam.pitch += (Math.max(dropCam.pitch, 0.8) - cam.pitch) * k * 2;
        cam.distance += (Math.max(dropCam.dist, 11) - cam.distance) * k;
      }
    } else {
      cam.follow = 0.7;
      cam.pitch += (dropCam.pitch - cam.pitch) * k * 0.5;
      cam.distance += (dropCam.dist - cam.distance) * k * 0.5;
      if (Math.abs(dropCam.pitch - cam.pitch) < 0.01 && Math.abs(dropCam.dist - cam.distance) < 0.1) dropCam.on = false;
    }
  }

  /**
   * Going over a big fall: where the camera watches from: in front of the
   * lip and to the side with the clearer view of where the boat lands.
   */
  function watchFall(ctx: RoamCtx): void {
    const { cam, world } = ctx;
    const heading = Math.atan2(drop.dx, drop.dz);
    const lx = drop.x1;
    const ly = drop.bottom + 2;
    const lz = drop.z1;
    let best = -1;
    for (const side of [1, -1]) {
      const yaw = heading + side * 2.6;
      const cp = Math.cos(0.3) * 15;
      const t = world.clearance ? world.clearance(lx, ly, lz, lx - Math.sin(yaw) * cp, ly + Math.sin(0.3) * 15, lz - Math.cos(yaw) * cp) : side > 0 ? 1 : 0;
      if (t > best) [best, dropCam.yaw] = [t, yaw];
    }
    if (!dropCam.on) {
      dropCam.pitch = cam.pitch;
      dropCam.dist = cam.distance;
    }
    dropCam.on = true;
    dropCam.watch = true;
    dropCam.after = 0;
    // (straight there over the water, not round the orbit through the banks' trees)
    cam.yaw = dropCam.yaw;
    cam.pitch = 0.4;
    cam.distance = Math.max(dropCam.dist, 15);
    cam.follow = 0;
    cam.blendFrom(0.7);
  }

  /** Lantern and light from the time of day (glow above 1 at night, for the bloom). */
  function lanterns(night: number, t: number): void {
    const flick = 1 + night * (0.05 * Math.sin(t * 2.3) + 0.04 * Math.sin(t * 3.7 + 1.1));
    glow.color.setRGB(1, 0.62, 0.3).multiplyScalar((0.55 + 2.2 * night) * flick);
    halo.opacity = 0.9 * night * night * flick;
    light.intensity = night * 3.2 * flick;
    wake.color.copy(FOAM_DAY).lerp(FOAM_NIGHT, night);
  }

  const handler: BoatMode = {
    object,
    get blocks() {
      return blocks;
    },
    enter(ctx, from) {
      const { body, cam } = ctx;
      build(ctx.world.field);
      const r = river!;
      riding = true;
      const s = body.scale;
      const hb = BOAT_HALF_BEAM * s * 1.1;
      cam.follow = 0.7;
      cam.minDistance = 5;
      cam.maxDistance = 30;
      cam.fov = 50;
      if (cam.distance < 7 || cam.distance > 18) cam.distance = 11;
      dropCam.on = false;
      heave = heaveV = pitch = pitchV = roll = rollV = yawRate = 0;
      rideState.brace = 0;
      rideState.look = 0;
      pushT = 0;
      body.grounded = true;
      body.explorer.animator.postureFeet = false;
      body.explorer.rig.setSlotObject('boatPaddle', 'chest', paddle.object);
      ride.visible = true;
      light.removeFromParent();
      ride.add(light);

      const m = from === 'walk' ? mooredBoatNear(body.pos.x, body.pos.z) : null;
      if (m) {
        // Board a moored boat: a hop from the bank onto the seat.
        if (m === moored.dock) {
          dock.visible = false;
          moored.dock = null;
        }
        if (m === moored.left) moored.left = null;
        level = m.level;
        hopFrom.copy(body.pos);
        boardAt.set(m.x, m.level, m.z);
        boardYaw = m.yaw;
        body.yaw = Math.atan2(m.x - body.pos.x, m.z - body.pos.z);
        phase = 'board';
        inT = 0;
        body.explorer.animator.posture = null;
        body.vel.set(0, 0, 0);
        return;
      }
      // A boat under him: where the water is open, along the river if the bank is close.
      moored.left = null;
      const w = openWaterNear(body.pos.x, body.pos.z, 12, hb, body.pos.y) ?? { x: body.pos.x, z: body.pos.z, level: r.levelAt(body.pos.x, body.pos.z) ?? body.pos.y };
      level = w.level;
      body.pos.set(w.x, w.level, w.z);
      body.yaw = fitHeading(w.x, w.z, w.level, body.yaw, s);
      body.vel.set(body.vel.x * 0.4, 0, body.vel.z * 0.4);
      body.explorer.animator.posture = posture;
      if (from === 'overview') {
        phase = 'float';
      } else {
        phase = 'rise';
        inT = 0;
        heave = -0.6 * s;
        ctx.sound('splash', from === 'glide' ? 0.8 : 0.45);
        splash(w.x, w.level, w.z, from === 'glide' ? 1 : 0.6, s);
      }
      ctx.sound('boatIn');
    },
    update(ctx, dt): RoamMode | null {
      const { body, input, cam, world, hud } = ctx;
      build(world.field);
      const s = body.scale;
      clock += dt;
      cam.turn(input.lookYaw, input.lookPitch, input.zoom);

      let next: RoamMode | null = null;
      const n = Math.max(1, Math.ceil(dt / MAX_STEP - 1e-6));
      const h = dt / n;
      for (let i = 0; i < n && !next; i++) {
        if (phase === 'board') {
          // The hop: an arc from the bank to the seat, then he sits.
          inT += h / 0.5;
          const u = Math.min(1, inT);
          body.pos.lerpVectors(hopFrom, boardAt, u);
          body.pos.y += Math.sin(Math.PI * u) * 0.9 * s;
          body.yaw += angleDiff(boardYaw, body.yaw) * (1 - Math.exp(-h * 6));
          body.explorer.setMotion(0, u >= 1, u < 0.5 ? 3 : -3);
          if (u >= 1) {
            phase = 'float';
            body.pos.copy(boardAt);
            body.yaw = boardYaw;
            body.explorer.animator.posture = posture;
            heave = -0.12 * s;
            ctx.sound('boatIn');
            wake.ring(boardAt.x, level + 0.05 * s, boardAt.z, 1 * s, 3 * s, 1.8, 0.3, 2.2, body.yaw);
          }
          continue;
        }
        if (phase === 'rise') {
          // The boat bobs up under him.
          inT += h / 0.4;
          if (inT >= 1) phase = 'float';
        }
        if (phase === 'drop') dropStep(ctx, h);
        else next = float(ctx, h);
      }
      if (phase !== 'board') body.explorer.setMotion(0, true, 0);
      placeRide(ctx, dt);
      wake.update(dt);
      lanterns(ctx.night, clock);
      if (next) return next;

      // What E does here: enter a place, step ashore.
      const spot = world.placeNear(body.pos.x, body.pos.z, level);
      const land = phase === 'float' ? ashore(ctx) : null;
      const text = spot?.href ? `E  Enter ${spot.name}` : land ? 'E  Step ashore' : spot ? `${spot.name} — coming soon` : null;
      if (text !== prompt) hud.prompt((prompt = text));
      if (input.use && phase === 'float') {
        if (spot?.href) ctx.enter(spot);
        else if (land) return stepOut(ctx, land);
        else if (spot) hud.toast(`${spot.name} is not open yet — coming soon`);
        else hud.toast('Paddle closer to the bank');
      }
      return null;
    },
    exit(ctx, to) {
      const { body } = ctx;
      riding = false;
      body.explorer.animator.posture = null;
      body.explorer.animator.postureFeet = true;
      body.explorer.rig.clearSlot('boatPaddle');
      if (prompt) ctx.hud.prompt((prompt = null));
      ctx.sound('boatOut');
      // Back to the map while afloat: the boat stays where it is.
      if (to === 'overview' && (phase === 'float' || phase === 'rise')) moored.left = { x: body.pos.x, z: body.pos.z, yaw: body.yaw, level };
      // Left by the landing: back in its place. Back to the map: a boat waits at the landing again.
      const left = moored.left;
      if (dockAt && left && Math.hypot(left.x - dockAt.x, left.z - dockAt.z) < 10) moored.left = null;
      if (dockAt && !moored.dock && (moored.left === null || to === 'overview')) {
        dock.visible = true;
        moored.dock = { ...dockAt };
      }
      ride.visible = moored.left !== null;
      // The light goes with the boat most in view: the landing's, else the one he left.
      light.removeFromParent();
      (dock.visible ? dock : ride).add(light);
      phase = 'float';
      ctx.levels.wake = 0;
      if (!framed) wake.clear();
    },
    frame(f) {
      framed = true;
      if (!riding) {
        wake.update(f.dt);
        lanterns(f.night, f.t);
      }
      // Moored boats rock gently on the water.
      const bob = (m: Moored | null, hull: Group, seed: number) => {
        if (!m || !hull.visible) return;
        const t = f.t + seed * 7.3;
        placeHull(hull, m, (0.025 * Math.sin(t * 1.4) + 0.015 * Math.sin(t * 2.3 + 1)) * ROAM_SCALE, 0.012 * Math.sin(t * 1.1 + 0.4), 0.02 * Math.sin(t * 1.3));
      };
      bob(moored.dock, dock, 1);
      if (!riding) bob(moored.left, ride, 2);
    },
  };
  return handler;
}

/** The landing by the River Gate: a boat tied up at a far bank near the bridge, where the overview sees it. */
function findLanding(f: HeightField, r: RiverField): Landing | null {
  const gate = PLACES.find((p) => p.id === 'rivergate');
  if (!gate) return null;
  // The bridge: where a road crosses water inside the River Gate's pad.
  let bx = 0;
  let bz = 0;
  let bn = 0;
  for (const p of f.paths)
    for (const s of p.samples)
      if (s.wet && Math.abs(s.x - gate.x) <= gate.pad[0] + 4 && Math.abs(s.z - gate.z) <= gate.pad[1] + 4) {
        bx += s.x;
        bz += s.z;
        bn++;
      }
  if (bn) [bx, bz] = [bx / bn, bz / bn];
  else [bx, bz] = [gate.x, gate.z];
  const view = new PerspectiveCamera(OVERVIEW.fov, 16 / 9, 1, 3000);
  view.position.set(...OVERVIEW.pos);
  view.lookAt(...OVERVIEW.target);
  view.updateMatrixWorld();
  // The nearest spot to the bridge (out of its shadow) that the overview can see.
  let best: Landing | null = null;
  let bd = Infinity;
  for (const rv of f.rivers)
    for (let j = 0; j < rv.samples.length; j += 2) {
      const s = rv.samples[j];
      const d = Math.hypot(s.x - bx, s.z - bz);
      if (d < 14 || d > 70 || d >= bd) continue;
      const spot = landingAt(f, r, s);
      if (spot && seen(f, view, spot.boat)) [bd, best] = [d, spot];
    }
  return best;
}

interface Landing {
  boat: Moored;
  mooring: Parameters<typeof buildMooring>[0];
}

/** A boat tied up at the bank of the river at sample `s`: the far bank from the overview, so the near one does not hide it. */
function landingAt(f: HeightField, r: RiverField, s: RiverSample): Landing | null {
  const S = ROAM_SCALE;
  const hb = BOAT_HALF_BEAM * S;
  const level = r.levelAt(s.x, s.z);
  if (level === null) return null;
  const [dx, dz] = s.dir;
  const away = -dz * (s.x - OVERVIEW.pos[0]) + dx * (s.z - OVERVIEW.pos[2]) > 0 ? 1 : -1;
  const rx = -dz * away;
  const rz = dx * away;
  let e = 0;
  while (e < 12 && r.bankAt(s.x + rx * e, s.z + rz * e, level) > 0) e += 0.25;
  if (e >= 12 || e < hb + 1.2) return null;
  const c = e - hb - 0.35;
  const x = s.x + rx * c;
  const z = s.z + rz * c;
  const hl = (BOAT_LENGTH / 2) * S;
  if (r.bankAt(x - dx * hl * 0.8, z - dz * hl * 0.8, level) < hb * 0.8 || r.bankAt(x + dx * hl * 0.8, z + dz * hl * 0.8, level) < hb * 0.8) return null;
  // Dry, low bank to tie up to and step off onto.
  const l0x = s.x + rx * (e + 1.6);
  const l0z = s.z + rz * (e + 1.6);
  const g = f.heightAt(l0x, l0z);
  if (f.waterAt(l0x, l0z) !== null || g > level + 2.1) return null;
  // Bow upstream: the post on the bank by it, the landing by the middle.
  const px = s.x + rx * (e + 0.7) - dx * hl * 0.55;
  const pz = s.z + rz * (e + 0.7) - dz * hl * 0.55;
  const l1x = s.x + rx * (e - 0.3);
  const l1z = s.z + rz * (e - 0.3);
  return {
    boat: { x, z, yaw: Math.atan2(-dx, -dz), level },
    mooring: {
      post: new Vector3(px, f.heightAt(px, pz), pz),
      height: 1.25 * S,
      bow: new Vector3(x - dx * hl * 0.75, level + 0.45 * S, z - dz * hl * 0.75),
      landing: [new Vector3(l0x, g, l0z), new Vector3(l1x, g, l1z)],
      width: 0.9 * S,
      scale: S,
    },
  };
}

/** Is the boat in the overview's picture: on screen, clear of the foreground ledge (bottom left), not behind the land? */
function seen(f: HeightField, view: PerspectiveCamera, m: Moored): boolean {
  const p = new Vector3(m.x, m.level + 0.6, m.z).project(view);
  if (Math.abs(p.x) > 0.9 || Math.abs(p.y) > 0.9 || p.z > 1) return false;
  if (p.x < -0.28 && p.y < 0.05) return false;
  const [cx, cy, cz] = OVERVIEW.pos;
  const len = Math.hypot(cx - m.x, cy - m.level, cz - m.z);
  for (let t = 3; t < len; t += 2) {
    const u = t / len;
    const y = m.level + 0.6 + (cy - m.level - 0.6) * u;
    if (f.heightAt(m.x + (cx - m.x) * u, m.z + (cz - m.z) * u) > y) return false;
  }
  return true;
}
