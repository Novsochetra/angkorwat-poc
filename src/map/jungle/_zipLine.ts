import { BufferAttribute, BufferGeometry, CanvasTexture, Color, Group, LineBasicMaterial, LineSegments, Mesh, MeshStandardMaterial, PlaneGeometry, Quaternion, SRGBColorSpace, Vector3, type InstancedMesh } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { markStill } from '../graphics';
import type { HeightField } from '../heightfield';
import type { MapFrame } from '../types';
import { lang, onLang, t } from '../ui/lang';
import { swayLeaves } from '../veg/sway';
import { installNearFade } from '../roam/_nearFade';
import { zipTree } from '../roam/_zipWalk';
import {
  cableAt,
  cableSlope,
  DECK_R,
  LANDING,
  RAIL_H,
  SIDE,
  STAIR_W,
  stairPosts,
  stairTop,
  STEP_RISE,
  STEP_RUN,
  STRAP,
  TROLLEY_DROP,
  TRUNK_HALF,
  type ZipLineDef,
  type ZipPlan,
  type ZipStation,
} from '../roam/_zipPlan';
import { beamWorld, CUT, PLANK, POST, ROCK, pickTone, Site, type P3 } from './_campKit';

/**
 * The zip line's meshes (where everything is: roam/_zipPlan.ts): four giant
 * trees (the jungle's own emergent, veg/species.ts, their crowns high over
 * the platforms), an octagonal deck of planks round each trunk on radial
 * joists and diagonal struts, with rails where no line or stair meets it,
 * steel collars and the cables' anchors round the trunks, the straight
 * wooden stairs on posts (landings, handrails, cross braces, footing stones),
 * the cables (thin steel blocks along their sag), hanging lanterns that glow
 * after dark, and a sign at the foot of the first stair ("ខ្សែរអិល").
 *
 * Moving: each line's trolley (two pulleys between red side plates) with
 * its lanyard and carabiner hanging under it (the ride swings it), and the
 * brake block on its spring at the line's end (the trolley pushes it home).
 * A trolley waits at the start of its line, its lanyard hanging to belt
 * height; after a ride it stays at the end until he is far away.
 *
 * Draws: the still blocks one mesh per family (wood, metal, stone, glow,
 * leather), the trees two (leaves, bark), each trolley three and each brake
 * two, only near; everything hidden past `VIEW` m.
 */

/** Shown within this far of a tree (m, across the land); trolleys and brakes, the sign's words. */
const VIEW = 420;
const NEAR = 160;
const SIGN_NEAR = 70;

/** Steel cable, the trolley's plates, the lanyard's webbing, the brake's rubber. */
const STEEL = 0x8e9398;
const STEEL_DARK = 0x767b80;
const PLATE = 0xc8432c;
const WEBBING = 0xd2552a;
const RUBBER = 0x2b2a28;
const BRASS = 0xc59a4a;
/** The lanterns' flame (linear), brighter after dark. */
const LAMP = new Color(1, 0.62, 0.28);

/** The trolley's rig for a line, and the brake block's. */
interface Rig {
  line: ZipLineDef;
  trolley: Group;
  hanger: Group;
  brake: Group;
  spring: Group;
  /** Where the trolley is (0‥1 along the ridden span) and how its lanyard hangs (fore-aft, side, radians). */
  u: number;
  swing: number;
  roll: number;
  /** The brake block's face (m along the span). */
  block: number;
  /** Ridden or moved since it was parked. */
  away: boolean;
}

export interface ZipLineMeshes {
  readonly object: Group;
  readonly blocks: number;
  /** Line `i`'s trolley at `u` along its span, its lanyard swung `swing` (+ forward) and `roll` (+ to its left). */
  setTrolley(i: number, u: number, swing: number, roll: number): void;
  /** Line `i`'s brake block's face at `s` m along the span (its rest: `brakeRest`). */
  setBrake(i: number, s: number): void;
  /** Where line `i`'s brake block rests (m along the span), and how far the spring lets it go. */
  brakeRest(i: number): number;
  /** Line `i`'s trolley back at its start (parked). */
  park(i: number): void;
  /** Where line `i`'s trolley is (0‥1). */
  trolleyAt(i: number): number;
  frame(f: MapFrame, at: Vector3): void;
}

const _v = new Vector3();
const _w = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _q3 = new Quaternion();
const _q4 = new Quaternion();
const _v2 = new Vector3();
const X = new Vector3(1, 0, 0);
const Y = new Vector3(0, 1, 0);
const Z = new Vector3(0, 0, 1);
const _p = { x: 0, y: 0, z: 0 };
const _c = new Color();

/** Line `l`'s trolley at `u`: where the pin its lanyard hangs from is (world). */
export function trolleyPin(l: ZipLineDef, u: number, out: Vector3): Vector3 {
  cableAt(l, u, _p);
  const pitch = Math.atan(cableSlope(l, Math.min(1, Math.max(0, u))));
  _q4.setFromAxisAngle(Y, l.yaw).multiply(_q3.setFromAxisAngle(X, -pitch));
  return out.set(0, -TROLLEY_DROP, 0).applyQuaternion(_q4).add(_v2.set(_p.x, _p.y, _p.z));
}

/** How a lanyard hangs on a line heading `yaw`: its lower end swung `swing` forward and `roll` to the left (radians). */
export function hangerQuat(yaw: number, swing: number, roll: number, out: Quaternion): Quaternion {
  return out.setFromAxisAngle(Y, yaw).multiply(_q2.setFromAxisAngle(X, -swing)).multiply(_q3.setFromAxisAngle(Z, roll));
}

/** The deck's corner `k` (between sides k and k + 1), `inset` m in from the edge: world (x, z). */
function corner(s: ZipStation, k: number, inset = 0): [number, number] {
  const a = s.yaw + ((k + 0.5) * Math.PI) / 4;
  const r = (DECK_R - inset) / Math.cos(Math.PI / 8);
  return [s.x + Math.sin(a) * r, s.z + Math.cos(a) * r];
}

export function buildZipLine(field: HeightField, plan: ZipPlan, soft?: (x: number, y: number, z: number) => boolean): ZipLineMeshes {
  const t0 = performance.now();
  const object = new Group();
  object.name = 'zipLine';
  const still = new VoxelBuilder();
  const src = traceSource();

  // ── The trees ──────────────────────────────────────────────────────────
  const treeB = new VoxelBuilder();
  let dropped = 0;
  for (const s of plan.stations) {
    const tree = zipTree(field, s);
    const p = tree.proto;
    const bi = Math.floor(tree.px);
    const bk = Math.floor(tree.pz);
    const bj = Math.round(tree.y);
    const key = (i: number, j: number, k: number) => `${i},${j},${k}`;
    const has = new Set<string>();
    for (let c = 0; c < p.n; c++) has.add(key(bi + p.ci[c], bj + p.cj[c], bk + p.ck[c]));
    for (let c = 0; c < p.n; c++) {
      if (!p.shell[c]) continue;
      const i = bi + p.ci[c];
      const j = bj + p.cj[c];
      const k = bk + p.ck[c];
      // (every open side drawn, the undersides too: from the platform he looks up into the crown)
      const open = (has.has(key(i + 1, j, k)) ? 0 : 1) | (has.has(key(i - 1, j, k)) ? 0 : 2) | (has.has(key(i, j + 1, k)) ? 0 : 4) | (has.has(key(i, j - 1, k)) ? 0 : 8) | (has.has(key(i, j, k + 1)) ? 0 : 16) | (has.has(key(i, j, k - 1)) ? 0 : 32);
      if (!open) continue;
      const x = i + 0.5;
      const y = j + 0.5;
      const z = k + 0.5;
      // (where the jungle's own leaves are already: theirs stay, no two blocks in one place)
      if (soft?.(x, y, z)) {
        dropped++;
        continue;
      }
      const mat = p.mat[c] ? 'mapBark' : 'mapLeaf';
      treeB.box(x, y, z, 1, 1, 1, p.color[c], mat, { shade: p.shade[c], open, src: p.src });
    }
    for (const b of p.boxes) treeB.box(tree.px + b.x, tree.y + b.y, tree.pz + b.z, b.sx, b.sy, b.sz, b.color, b.leaf ? 'mapLeaf' : 'mapBark', { shade: b.shade, src: p.src });
  }

  // ── The platforms ────────────────────────────────────────────────────────
  for (const s of plan.stations) deck(still, field, s, src);
  // ── The stairs ───────────────────────────────────────────────────────────
  for (const s of plan.stations) if (s.stair) stair(still, field, s, src);
  // ── The cables and their anchors ────────────────────────────────────────
  for (const l of plan.lines) cable(still, l, src);
  // ── The sign at the first stair's foot ──────────────────────────────────
  const first = plan.stations[0];
  const sign = first.stair ? signAt(still, field, first, src) : null;

  // The cables again as thin lines: a pixel wide however far (the steel blocks are under a pixel from a few dozen metres).
  const wires = cableLines(plan);
  const stillGroup = buildVoxelMesh(still, { quality: 'medium', name: 'zipLine' });
  const glow = stillGroup.children.find((o) => o.name === 'zipLine:glow') as InstancedMesh | undefined;
  for (const m of stillGroup.children as InstancedMesh[]) if (m.name === 'zipLine:glow') m.castShadow = false;
  const treeGroup = buildVoxelMesh(treeB, { quality: 'medium', name: 'zipLine:trees' });
  swayLeaves(treeGroup, field, true);
  markStill(stillGroup);
  markStill(treeGroup);
  // (the decks, rails, stairs and collars dissolve in front of the follow camera as the trees do: _nearFade.ts)
  installNearFade(stillGroup);
  object.add(stillGroup, treeGroup, wires);
  if (sign) object.add(sign.mesh);

  // ── The trolleys and brakes ─────────────────────────────────────────────
  const rigs: Rig[] = plan.lines.map((line) => {
    const trolley = buildVoxelMesh(trolleyBlocks(), { quality: 'medium', name: `zipLine:trolley${line.n}` });
    const hanger = buildVoxelMesh(lanyardBlocks(), { quality: 'medium', name: `zipLine:lanyard${line.n}` });
    const brake = buildVoxelMesh(brakeBlocks(), { quality: 'medium', name: `zipLine:brake${line.n}` });
    const spring = buildVoxelMesh(springBlocks(), { quality: 'medium', name: `zipLine:spring${line.n}` });
    // (the brake and its spring sit over a deck's edge: they dissolve in front of the follow camera too)
    installNearFade(brake);
    installNearFade(spring);
    object.add(trolley, hanger, brake, spring);
    const r: Rig = { line, trolley, hanger, brake, spring, u: 0, swing: 0, roll: 0, block: line.length - BRAKE_TRAVEL, away: false };
    return r;
  });
  const blocks = still.boxes.length + treeB.boxes.length;

  /** Put a rig where its numbers say. */
  const place = (r: Rig) => {
    const l = r.line;
    cableAt(l, r.u, _p);
    const pitch = Math.atan(cableSlope(l, Math.min(1, Math.max(0, r.u))));
    // (the trolley along the cable: its heading, nosed down the slope)
    _q.setFromAxisAngle(Y, l.yaw).multiply(_q2.setFromAxisAngle(X, -pitch));
    r.trolley.position.set(_p.x, _p.y, _p.z);
    r.trolley.quaternion.copy(_q);
    // (the lanyard from the trolley's pin, hanging by its own weight, swung)
    _v.set(0, -TROLLEY_DROP, 0).applyQuaternion(_q);
    r.hanger.position.set(_p.x + _v.x, _p.y + _v.y, _p.z + _v.z);
    // (+ swing: its lower end forward, + roll: to the left; `hangerQuat`)
    hangerQuat(l.yaw, r.swing, r.roll, _q);
    r.hanger.quaternion.copy(_q);
    r.trolley.updateMatrixWorld(true);
    r.hanger.updateMatrixWorld(true);
  };
  const placeBrake = (r: Rig) => {
    const l = r.line;
    const u = r.block / l.length;
    cableAt(l, u, _p);
    const pitch = Math.atan(cableSlope(l, Math.min(1, u)));
    _q.setFromAxisAngle(Y, l.yaw).multiply(_q2.setFromAxisAngle(X, -pitch));
    r.brake.position.set(_p.x, _p.y, _p.z);
    r.brake.quaternion.copy(_q);
    // (the spring from the block's back to its stop over the deck: squeezed as the block comes home)
    const stop = l.length + BRAKE_STOP;
    const len = Math.max(0.15, stop - r.block - BLOCK_LEN);
    cableAt(l, (r.block + BLOCK_LEN) / l.length, _p);
    r.spring.position.set(_p.x, _p.y, _p.z);
    r.spring.quaternion.copy(_q);
    r.spring.scale.set(1, 1, len / SPRING_LEN);
    r.brake.updateMatrixWorld(true);
    r.spring.updateMatrixWorld(true);
  };
  for (const r of rigs) {
    place(r);
    placeBrake(r);
  }

  let night = -1;
  let flick = 0;
  if (new URLSearchParams(location.search).has('shot'))
    console.info(`[map] zip line built in ${(performance.now() - t0).toFixed(0)} ms: ${blocks} blocks (trees ${treeB.boxes.length}${dropped ? `, ${dropped} left to the jungle's own leaves` : ''})`);

  return {
    object,
    blocks,
    setTrolley(i, u, swing, roll) {
      const r = rigs[i];
      r.u = u;
      r.swing = swing;
      r.roll = roll;
      r.away = u > 0.002;
      place(r);
    },
    setBrake(i, s) {
      const r = rigs[i];
      r.block = Math.max(r.line.length - BRAKE_TRAVEL, Math.min(r.line.length + BRAKE_STOP - BLOCK_LEN - 0.15, s));
      placeBrake(r);
    },
    brakeRest: (i) => rigs[i].line.length - BRAKE_TRAVEL,
    park(i) {
      const r = rigs[i];
      r.u = 0;
      r.swing = 0;
      r.roll = 0;
      r.away = false;
      r.block = r.line.length - BRAKE_TRAVEL;
      place(r);
      placeBrake(r);
    },
    trolleyAt: (i) => rigs[i].u,
    frame(f, at) {
      const c = f.camera.position;
      let near = Infinity;
      for (const s of plan.stations) near = Math.min(near, Math.hypot(c.x - s.x, c.z - s.z));
      // (a line's own: its trolley and brake are near the camera or the explorer)
      const show = near < VIEW;
      stillGroup.visible = show;
      treeGroup.visible = show;
      wires.visible = show;
      for (const r of rigs) {
        const close = (x: number, z: number) => Math.min(Math.hypot(c.x - x, c.z - z), Math.hypot(at.x - x, at.z - z)) < NEAR;
        r.trolley.visible = r.hanger.visible = show && close(r.trolley.position.x, r.trolley.position.z);
        r.brake.visible = r.spring.visible = show && close(r.brake.position.x, r.brake.position.z);
      }
      if (sign) sign.mesh.visible = show && Math.hypot(c.x - sign.mesh.position.x, c.z - sign.mesh.position.z) < SIGN_NEAR;
      // The lanterns: a soft glow by day, warm and flickering after dark (the bloom picks them up).
      if (!show || !glow) return;
      const k = Math.max(0, Math.min(1, f.night));
      flick += f.dt;
      if (Math.abs(k - night) < 0.01 && (k < 0.3 || flick < 0.12)) return;
      night = k;
      flick = 0;
      wires.material.color.copy(WIRE_DAY).lerp(WIRE_NIGHT, k);
      for (let i = 0; i < glow.count; i++) {
        const w = 0.92 + 0.08 * Math.sin(f.t * (5.1 + (i % 3)) + i * 1.7) * Math.sin(f.t * 2.3 + i);
        glow.setColorAt(i, _c.copy(LAMP).multiplyScalar((0.55 + 3.2 * k * k) * (k > 0.3 ? w : 1)));
      }
      if (glow.instanceColor) glow.instanceColor.needsUpdate = true;
    },
  };
}

// ── The brake ───────────────────────────────────────────────────────────────

/** How far the brake block is pushed home (m), how far past the landing point its stop is, the block's length, the spring's rest length. */
const BRAKE_TRAVEL = 2.4;
const BRAKE_STOP = 0.55;
const BLOCK_LEN = 0.36;
const SPRING_LEN = BRAKE_TRAVEL + BRAKE_STOP - BLOCK_LEN;

/** The rubber block round the cable (its back face at z = 0, the trolley meets its front at −len). */
function brakeBlocks(): VoxelBuilder {
  const b = new VoxelBuilder();
  const src = traceSource();
  b.box(0, 0, BLOCK_LEN / 2, 0.16, 0.16, BLOCK_LEN, RUBBER, 'leather', { src });
  b.box(0, 0, 0.03, 0.19, 0.19, 0.06, STEEL_DARK, 'metal', { src });
  b.box(0, 0, BLOCK_LEN - 0.03, 0.19, 0.19, 0.06, STEEL_DARK, 'metal', { src });
  // (a yellow band: seen from the platform as the rider comes in)
  b.box(0, 0, BLOCK_LEN / 2, 0.17, 0.17, 0.1, 0xe8b530, 'leather', { src });
  return b;
}

/** The spring along the cable from the block to its stop: coils along z (scaled to its length). */
function springBlocks(): VoxelBuilder {
  const b = new VoxelBuilder();
  const src = traceSource();
  // (a coil: thin turns round the cable, light and dark in turn as the wire catches the light)
  const n = Math.round(SPRING_LEN / 0.09);
  for (let i = 0; i < n; i++) b.box(0, 0, (i + 0.5) * (SPRING_LEN / n), 0.1, 0.1, (SPRING_LEN / n) * 0.62, i % 2 ? 0x83888c : 0x9ba0a4, 'metal', { src });
  return b;
}

// ── The trolley ─────────────────────────────────────────────────────────────

/** Two pulleys on the cable between red side plates, the pin under them (its local z along the line, the cable through y = 0). */
function trolleyBlocks(): VoxelBuilder {
  const b = new VoxelBuilder();
  const src = traceSource();
  for (const z of [-0.12, 0.12]) {
    b.box(0, 0.075, z, 0.06, 0.15, 0.15, STEEL_DARK, 'metal', { src });
    b.box(0, 0.075, z, 0.07, 0.06, 0.06, 0xb9bec2, 'metal', { src });
  }
  for (const x of [-0.06, 0.06]) b.box(x, 0.02, 0, 0.035, 0.24, 0.42, PLATE, 'metal', { src });
  // (the plates' lower lug, the pin through it)
  b.box(0, -0.12, 0, 0.16, 0.1, 0.12, PLATE, 'metal', { src });
  b.box(0, -TROLLEY_DROP + 0.02, 0, 0.18, 0.04, 0.04, 0xb9bec2, 'metal', { src });
  return b;
}

/** The lanyard from the trolley's pin (y = 0) down to its carabiner (at −STRAP), a steel ring at its top. */
function lanyardBlocks(): VoxelBuilder {
  const b = new VoxelBuilder();
  const src = traceSource();
  b.box(0, -0.04, 0, 0.05, 0.08, 0.08, STEEL, 'metal', { src });
  const n = 6;
  for (let i = 0; i < n; i++) {
    const y0 = -0.08 - (i * (STRAP - 0.2)) / n;
    const y1 = -0.08 - ((i + 1) * (STRAP - 0.2)) / n;
    b.box(0, (y0 + y1) / 2, 0, 0.11, y0 - y1 - 0.01, 0.025, i % 2 ? WEBBING : 0xbe4a24, 'leather', { src });
  }
  // (the stitched loop and the carabiner: a steel D)
  b.box(0, -STRAP + 0.1, 0, 0.12, 0.06, 0.04, 0x9c3a1c, 'leather', { src });
  b.box(0, -STRAP + 0.02, 0, 0.1, 0.03, 0.03, 0xc9ced2, 'metal', { src });
  b.box(0, -STRAP - 0.08, 0, 0.1, 0.03, 0.03, 0xc9ced2, 'metal', { src });
  b.box(-0.045, -STRAP - 0.03, 0, 0.025, 0.12, 0.03, 0xc9ced2, 'metal', { src });
  b.box(0.045, -STRAP - 0.03, 0, 0.025, 0.12, 0.03, 0xb0b5b9, 'metal', { src });
  return b;
}

// ── A platform ─────────────────────────────────────────────────────────────

function deck(b: VoxelBuilder, field: HeightField, s: ZipStation, src: ReturnType<typeof traceSource>): void {
  const site = new Site(b, field, s.x, 0, s.z, s.yaw, src, 70 + s.index);
  const y = s.deck;
  const R = DECK_R;
  // Planks across, edge to edge of the octagon (round the trunk).
  const n = Math.round((2 * R) / 0.3);
  for (let i = 0; i < n; i++) {
    const lz = -R + (i + 0.5) * ((2 * R) / n);
    const w = Math.min(R, R * Math.SQRT2 - Math.abs(lz)) - 0.04;
    const tone = (p: number) => pickTone(PLANK, i, p, s.index, 31);
    const sh = 0.94 + 0.12 * hash3(i, s.index, 3, 33);
    if (Math.abs(lz) < TRUNK_HALF + 0.12) {
      for (const sg of [1, -1]) {
        const a = TRUNK_HALF + 0.03;
        site.box((sg * (a + w)) / 2, y - 0.05, lz, w - a, 0.1, 0.28, tone(sg), 'wood', { shade: sh });
      }
    } else site.box(0, y - 0.05, lz, 2 * w, 0.1, 0.28, tone(0), 'wood', { shade: sh });
  }
  // The fascia round its edge, the joists to the corners, the struts from the trunk.
  for (let k = 0; k < 8; k++) {
    const [ax, az] = corner(s, k - 1, 0.07);
    const [bx, bz] = corner(s, k, 0.07);
    beamWorld(b, _v.set(ax, y - 0.15, az), _w.set(bx, y - 0.15, bz), 0.14, 0.22, pickTone(POST, k, 1, s.index, 34), 'wood', 0, undefined, src);
    const a = s.yaw + ((k + 0.5) * Math.PI) / 4;
    const sx = Math.sin(a);
    const sz = Math.cos(a);
    const rc = R / Math.cos(Math.PI / 8) - 0.12;
    beamWorld(b, _v.set(s.x + sx * 1.05, y - 0.2, s.z + sz * 1.05), _w.set(s.x + sx * rc, y - 0.2, s.z + sz * rc), 0.12, 0.16, pickTone(POST, k, 2, s.index, 35), 'wood', 0, undefined, src);
    beamWorld(b, _v.set(s.x + sx * 1.05, y - 2.5, s.z + sz * 1.05), _w.set(s.x + sx * 2.5, y - 0.27, s.z + sz * 2.5), 0.14, 0.14, pickTone(POST, k, 3, s.index, 36), 'wood', 0, 0.92, src);
  }
  // Steel collars round the trunk where the struts and the joists bear on it.
  for (const cy of [y - 2.48, y - 0.24]) collar(b, s, cy, src);
  // The rails: corner posts, a handrail and a mid rail along each side no line or stair meets.
  const railed = (k: number) => !s.open.includes(((k % 8) + 8) % 8);
  const stairSide = s.stair ? Math.round((((s.stair.yaw - s.yaw) / (Math.PI / 4)) % 8) + 8) % 8 : -1;
  for (let k = 0; k < 8; k++) {
    // (corner k stands between sides k and k + 1)
    if (!railed(k) && !railed(k + 1) && k !== stairSide && (k + 1) % 8 !== stairSide) continue;
    const [px, pz] = corner(s, k, 0.08);
    b.box(px, y + RAIL_H / 2 - 0.08, pz, 0.13, RAIL_H + 0.18, 0.13, pickTone(POST, k, 4, s.index, 37), 'wood', { src, ry: s.yaw + ((k + 0.5) * Math.PI) / 4 });
  }
  for (let k = 0; k < 8; k++) {
    const [ax, az] = corner(s, k - 1, 0.08);
    const [bx, bz] = corner(s, k, 0.08);
    if (k === stairSide) {
      // (beside the stair: from each corner to the stair's rail)
      const mx = (ax + bx) / 2;
      const mz = (az + bz) / 2;
      const tx = (bx - ax) / SIDE;
      const tz = (bz - az) / SIDE;
      const w = STAIR_W / 2 + 0.06;
      for (const [cx, cz, sg] of [
        [ax, az, -1],
        [bx, bz, 1],
      ] as const) {
        const ex = mx + tx * w * sg;
        const ez = mz + tz * w * sg;
        rail(b, cx, cz, ex, ez, y, k, s.index, src);
        b.box(ex, y + RAIL_H / 2 - 0.08, ez, 0.11, RAIL_H + 0.18, 0.11, pickTone(POST, k, 5, s.index, 38), 'wood', { src, ry: s.yaw });
      }
      continue;
    }
    if (!railed(k)) continue;
    rail(b, ax, az, bx, bz, y, k, s.index, src);
  }
  // Two lanterns on arms out from corner posts on railed sides, away from the lines.
  let lit = 0;
  for (const k of [3, 4, 2, 5, 1, 6]) {
    if (lit >= 2) break;
    if (!railed(k) || !railed(k + 1)) continue;
    const [px, pz] = corner(s, k, 0.08);
    const a = s.yaw + ((k + 0.5) * Math.PI) / 4;
    lantern(b, px, y + RAIL_H + 0.1, pz, a, src);
    lit++;
  }
}

/** A steel band round the trunk (its four faces) at height `y`. */
function collar(b: VoxelBuilder, s: ZipStation, y: number, src: ReturnType<typeof traceSource>): void {
  const h = TRUNK_HALF + 0.03;
  b.box(s.x + h, y, s.z, 0.06, 0.16, 2 * h + 0.06, STEEL_DARK, 'metal', { src });
  b.box(s.x - h, y, s.z, 0.06, 0.16, 2 * h + 0.06, STEEL_DARK, 'metal', { src });
  b.box(s.x, y, s.z + h, 2 * h + 0.06, 0.16, 0.06, STEEL_DARK, 'metal', { src });
  b.box(s.x, y, s.z - h, 2 * h + 0.06, 0.16, 0.06, STEEL_DARK, 'metal', { src });
}

/** A rail from (ax, az) to (bx, bz) on a deck at `y`: a handrail on top, a mid rail. */
function rail(b: VoxelBuilder, ax: number, az: number, bx: number, bz: number, y: number, k: number, i: number, src: ReturnType<typeof traceSource>): void {
  beamWorld(b, _v.set(ax, y + RAIL_H, az), _w.set(bx, y + RAIL_H, bz), 0.12, 0.1, pickTone(PLANK, k, 6, i, 39), 'wood', 0, 1.04, src);
  beamWorld(b, _v.set(ax, y + RAIL_H * 0.5, az), _w.set(bx, y + RAIL_H * 0.5, bz), 0.07, 0.09, pickTone(PLANK, k, 7, i, 40), 'wood', 0, 0.96, src);
}

/** A lantern hung from an arm reaching out from a post's top at (x, y, z), heading `a`: a brass cage round a glowing glass. */
function lantern(b: VoxelBuilder, x: number, y: number, z: number, a: number, src: ReturnType<typeof traceSource>): void {
  const sx = Math.sin(a);
  const sz = Math.cos(a);
  beamWorld(b, _v.set(x, y, z), _w.set(x + sx * 0.5, y, z + sz * 0.5), 0.07, 0.07, 0x6b5a48, 'wood', 0, undefined, src);
  const lx = x + sx * 0.44;
  const lz = z + sz * 0.44;
  const ly = y - 0.34;
  b.box(lx, y - 0.1, lz, 0.02, 0.16, 0.02, BRASS, 'brass', { src });
  b.box(lx, ly + 0.13, lz, 0.2, 0.04, 0.2, BRASS, 'brass', { src });
  b.box(lx, ly + 0.17, lz, 0.09, 0.04, 0.09, BRASS, 'brass', { src });
  b.box(lx, ly - 0.12, lz, 0.17, 0.03, 0.17, BRASS, 'brass', { src });
  for (const [dx, dz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ])
    b.box(lx + dx * 0.075, ly, lz + dz * 0.075, 0.025, 0.24, 0.025, BRASS, 'brass', { src });
  b.box(lx, ly, lz, 0.13, 0.19, 0.13, 0xffffff, 'glow', { src });
}

// ── A stair ─────────────────────────────────────────────────────────────────

function stair(b: VoxelBuilder, field: HeightField, s: ZipStation, src: ReturnType<typeof traceSource>): void {
  const st = s.stair!;
  const site = new Site(b, field, st.x, 0, st.z, st.yaw, src, 80 + s.index);
  const w = STAIR_W / 2;
  const ground = (lx: number, lz: number) => site.ground(lx, lz);
  // Treads, flight by flight, the landings between; the stringers under each flight's sides.
  let at = 0;
  let y = st.top;
  let step = 0;
  const posts: number[] = [];
  for (let f = 0; f < st.flights.length; f++) {
    const n = st.flights[f];
    const a0 = at;
    for (let i = 0; i < n; i++) {
      const a = at + (i + 0.5) * STEP_RUN;
      const top = y - (i + 1) * STEP_RISE;
      site.box(0, top - 0.05, a, STAIR_W, 0.1, STEP_RUN + 0.04, pickTone(PLANK, step, f, s.index, 41), 'wood', { shade: 0.95 + 0.1 * hash3(step, s.index, 4, 42) });
      step++;
      if (i % 4 === 0) posts.push(a);
    }
    const a1 = at + n * STEP_RUN;
    const yTop = y - STEP_RISE;
    const yEnd = y - n * STEP_RISE;
    for (const sg of [1, -1]) {
      const p0: P3 = [sg * (w + 0.06), yTop - 0.16, a0 - 0.1];
      const p1: P3 = [sg * (w + 0.06), yEnd - 0.16, a1 - STEP_RUN * 0.5];
      site.beam(p0, p1, 0.12, 0.34, pickTone(POST, f, sg, s.index, 43), 'wood');
    }
    at = a1;
    y = yEnd;
    if (f < st.flights.length - 1) {
      site.box(0, y - 0.06, at + LANDING / 2, STAIR_W + 0.12, 0.12, LANDING, pickTone(PLANK, f, 9, s.index, 44), 'wood');
      for (const sg of [1, -1]) site.beam([sg * (w + 0.06), y - 0.2, at], [sg * (w + 0.06), y - 0.2, at + LANDING], 0.12, 0.26, pickTone(POST, f, 10, s.index, 45), 'wood');
      posts.push(at + 0.1, at + LANDING - 0.1);
      at += LANDING;
    }
  }
  posts.push(st.length - 0.15);
  // Handrails: posts along both sides, a handrail and a mid rail between their tops.
  const tread = (a: number) => {
    const top = stairTop(st, Math.min(st.length - 0.01, a));
    return Number.isNaN(top) ? st.ground : top;
  };
  posts.sort((p, q) => p - q);
  for (const sg of [1, -1]) {
    let prev: P3 | null = null;
    let prevMid: P3 | null = null;
    for (const a of posts) {
      const ty = tread(a);
      const x = sg * (w + 0.07);
      site.box(x, ty + 0.5, a, 0.1, 1.08, 0.1, pickTone(POST, Math.round(a * 3), sg, s.index, 46), 'wood');
      const top: P3 = [x, ty + 1.02, a];
      const mid: P3 = [x, ty + 0.52, a];
      if (prev) site.beam(prev, top, 0.09, 0.09, pickTone(PLANK, Math.round(a * 3), 11, s.index, 47), 'wood', 0, 1.04);
      if (prevMid) site.beam(prevMid, mid, 0.06, 0.07, pickTone(PLANK, Math.round(a * 3), 12, s.index, 48), 'wood', 0, 0.95);
      prev = top;
      prevMid = mid;
    }
  }
  // Posts down to the ground under its sides, a cross beam on each pair, braces between them, a stone under each.
  const sp = stairPosts(st);
  for (let i = 0; i < sp.length; i += 2) {
    const p = sp[i];
    const yb = p.y - 0.34;
    for (const c of [p.c, -p.c]) {
      const g = ground(c, p.a);
      site.box(c, (g - 0.2 + yb) / 2, p.a, 0.18, yb - g + 0.2, 0.18, pickTone(POST, i, c > 0 ? 1 : 2, s.index, 49), 'wood');
      site.box(c, g + 0.06, p.a, 0.4, 0.2, 0.4, pickTone(ROCK, i, c > 0 ? 3 : 4, s.index, 50), 'mapStone', { ry: 0.3 * hash3(i, s.index, 5, 51) });
    }
    site.box(0, yb - 0.06, p.a, STAIR_W + 0.42, 0.16, 0.16, pickTone(POST, i, 5, s.index, 52), 'wood');
    // (an X brace down to the next pair: on each side)
    const q = sp[i + 2];
    if (q)
      for (const c of [p.c + 0.1, -p.c - 0.1]) {
        const gq = ground(c, q.a);
        const g = ground(c, p.a);
        if (yb - g > 2.2 && q.y - 0.34 - gq > 2.2) {
          site.beam([c, g + 0.5, p.a], [c, q.y - 0.7, q.a], 0.08, 0.1, pickTone(POST, i, 6, s.index, 53), 'wood', 0, 0.9);
          site.beam([c, gq + 0.5, q.a], [c, yb - 0.3, p.a], 0.08, 0.1, pickTone(POST, i, 7, s.index, 54), 'wood', 0, 0.9);
        }
      }
  }
  // Lanterns: on the landings' outer posts, and a post with one at the foot (a light to find it by after dark).
  at = 0;
  for (let f = 0; f < st.flights.length - 1; f++) {
    at += st.flights[f] * STEP_RUN;
    const ly = tread(at + LANDING - 0.1);
    site.box(w + 0.07, ly + 1.32, at + LANDING - 0.1, 0.1, 0.5, 0.1, pickTone(POST, f, 13, s.index, 55), 'wood');
    const p = site.world(w + 0.07, ly + 1.5, at + LANDING - 0.1, _v);
    lantern(b, p.x, p.y, p.z, st.yaw - Math.PI / 2, src);
    at += LANDING;
  }
  const fa = st.length + 0.5;
  const fx = -(w + 0.45);
  const fg = ground(fx, fa);
  site.box(fx, fg + 1.05, fa, 0.14, 2.1, 0.14, pickTone(POST, 3, 14, s.index, 56), 'wood');
  site.box(fx, fg + 0.06, fa, 0.42, 0.22, 0.42, pickTone(ROCK, 3, 15, s.index, 57), 'mapStone');
  const fp = site.world(fx, fg + 2.0, fa, _v);
  lantern(b, fp.x, fp.y, fp.z, st.yaw, src);
  // (cut ends of the bottom stringers on the ground: a block under the last step)
  site.box(0, fg + 0.05, st.length - 0.2, STAIR_W + 0.3, 0.16, 0.3, pickTone(CUT, 1, 1, s.index, 58), 'wood', { shade: 0.85 });
}

// ── A cable ─────────────────────────────────────────────────────────────────

/** Line `l`'s cable: from its anchor on the first trunk, along its sag, to its anchor on the next; collars and shackles at both ends. */
function cable(b: VoxelBuilder, l: ZipLineDef, src: ReturnType<typeof traceSource>): void {
  const T = 0.045;
  // (straight from the anchor to where he clips in)
  beamWorld(b, _v.set(l.ax, l.ay, l.az), _w.set(l.x0, l.y0, l.z0), T, T, STEEL, 'metal', 0, undefined, src);
  const n = Math.ceil(l.length / 1.6);
  for (let i = 0; i < n; i++) {
    cableAt(l, i / n, _p);
    _v.set(_p.x, _p.y, _p.z);
    cableAt(l, (i + 1) / n, _p);
    _w.set(_p.x, _p.y, _p.z);
    beamWorld(b, _v, _w, T, T, i % 7 === 3 ? 0x989da2 : STEEL, 'metal', 0, undefined, src);
  }
  beamWorld(b, _v.set(l.x1, l.y1, l.z1), _w.set(l.bx, l.by, l.bz), T, T, STEEL, 'metal', 0, undefined, src);
  // Both ends: a collar round the trunk, a shackle and a turnbuckle where the cable meets it.
  for (const [x, y, z, sg] of [
    [l.ax, l.ay, l.az, 1],
    [l.bx, l.by, l.bz, -1],
  ] as const) {
    const s = sg > 0 ? l.from : l.to;
    collar(b, s, y, src);
    const dx = l.dx * sg;
    const dz = l.dz * sg;
    b.box(x + dx * 0.12, y, z + dz * 0.12, 0.12, 0.12, 0.12, STEEL_DARK, 'metal', { src, ry: l.yaw });
    beamWorld(b, _v.set(x + dx * 0.18, y, z + dz * 0.18), _w.set(x + dx * 0.55, y, z + dz * 0.55), 0.08, 0.08, 0x777c80, 'metal', 0, undefined, src);
  }
  // The brake's stop on the cable over the arrival deck (the spring rests against it).
  cableAt(l, (l.length + BRAKE_STOP) / l.length, _p);
  b.box(_p.x, _p.y, _p.z, 0.22, 0.22, 0.1, STEEL_DARK, 'metal', { src, ry: l.yaw });
}

/** The cables as lines (by day a dark steel grey; darker after dark). */
const WIRE_DAY = new Color(0x7a8188);
const WIRE_NIGHT = new Color(0x15181c);

function cableLines(plan: ZipPlan): LineSegments<BufferGeometry, LineBasicMaterial> {
  const pts: number[] = [];
  const seg = (ax: number, ay: number, az: number, bx: number, by: number, bz: number) => pts.push(ax, ay, az, bx, by, bz);
  for (const l of plan.lines) {
    seg(l.ax, l.ay, l.az, l.x0, l.y0, l.z0);
    const n = Math.ceil(l.length / 1.6);
    for (let i = 0; i < n; i++) {
      cableAt(l, i / n, _p);
      const x = _p.x;
      const y = _p.y;
      const z = _p.z;
      cableAt(l, (i + 1) / n, _p);
      seg(x, y, z, _p.x, _p.y, _p.z);
    }
    seg(l.x1, l.y1, l.z1, l.bx, l.by, l.bz);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(pts), 3));
  geo.computeBoundingSphere();
  const lines = new LineSegments(geo, new LineBasicMaterial({ color: WIRE_DAY.clone(), transparent: true, opacity: 0.9, depthWrite: false, fog: true }));
  lines.name = 'zipLine:wires';
  lines.castShadow = false;
  return lines;
}

// ── The sign ────────────────────────────────────────────────────────────────

/** A board on two posts beside the first stair's foot, facing the way down it (to the trail): its words on a canvas. */
function signAt(b: VoxelBuilder, field: HeightField, s: ZipStation, src: ReturnType<typeof traceSource>): { mesh: Mesh } {
  const st = s.stair!;
  const site = new Site(b, field, st.x, 0, st.z, st.yaw, src, 90);
  const W = 1.5;
  const H = 0.78;
  const a = st.length + 0.9;
  const lx = STAIR_W / 2 + 1.25;
  const g = site.ground(lx, a);
  const top = g + 2.25;
  for (const dx of [-W / 2 + 0.1, W / 2 - 0.1]) {
    site.box(lx + dx, g + (top - g) / 2 - 0.1, a, 0.12, top - g + 0.1, 0.12, pickTone(POST, 2, dx > 0 ? 1 : 2, 0, 60), 'wood');
    site.box(lx + dx, g + 0.06, a, 0.34, 0.2, 0.34, pickTone(ROCK, 2, dx > 0 ? 3 : 4, 0, 61), 'mapStone');
  }
  site.box(lx, top - H / 2, a - 0.02, W + 0.12, H + 0.12, 0.08, 0x5d4a38, 'wood');
  site.box(lx, top + 0.1, a - 0.02, W + 0.3, 0.08, 0.24, 0x4f3d2e, 'wood');
  // The words: a canvas on a thin plane just in front of the board (toward +a: down the stair, to the trail).
  const px = 220;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * px);
  canvas.height = Math.round(H * px);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const material = new MeshStandardMaterial({ map: texture, roughness: 0.85, metalness: 0 });
  material.name = 'zipLine:sign';
  const mesh = new Mesh(new PlaneGeometry(W, H), material);
  mesh.name = 'zipLine:sign';
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  site.world(lx, top - H / 2, a + 0.03, mesh.position);
  mesh.rotation.y = st.yaw;
  const paint = () => {
    const c = canvas.getContext('2d');
    if (!c) return;
    const w = canvas.width;
    const h = canvas.height;
    const km = lang() === 'km';
    c.fillStyle = '#2f5a3a';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = '#efe6cf';
    c.lineWidth = h * 0.035;
    c.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
    // A little picture: a cable from a tree down to the right, a rider hanging from it.
    c.strokeStyle = '#e8c050';
    c.lineWidth = h * 0.035;
    c.beginPath();
    c.moveTo(w * 0.1, h * 0.2);
    c.lineTo(w * 0.9, h * 0.34);
    c.stroke();
    c.fillStyle = '#e8c050';
    const rx = w * 0.74;
    const ry = h * 0.31;
    c.fillRect(rx - h * 0.012, ry, h * 0.024, h * 0.1);
    c.beginPath();
    c.arc(rx, ry + h * 0.15, h * 0.05, 0, Math.PI * 2);
    c.fill();
    c.fillRect(rx - h * 0.04, ry + h * 0.19, h * 0.08, h * 0.1);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const face = km ? `'Koulen', 'Kantumruy Pro', 'Khmer Sangam MN', 'Khmer MN', sans-serif` : `'Nunito Sans', 'Kantumruy Pro', system-ui, sans-serif`;
    c.fillStyle = '#f6f2e6';
    c.font = `${km ? 400 : 800} ${Math.round(h * (km ? 0.3 : 0.26))}px ${face}`;
    fit(c, t('zipSign'), w * 0.84);
    c.fillText(t('zipSign'), w / 2, h * 0.56);
    c.fillStyle = '#e8c050';
    c.font = `${km ? 400 : 700} ${Math.round(h * 0.15)}px ${km ? `'Kantumruy Pro', 'Khmer Sangam MN', sans-serif` : `'Nunito Sans', system-ui, sans-serif`}`;
    fit(c, t('zipSignSub'), w * 0.84);
    c.fillText(t('zipSignSub'), w / 2, h * 0.8);
    texture.needsUpdate = true;
  };
  paint();
  document.fonts?.ready.then(paint).catch(() => undefined);
  onLang(paint);
  return { mesh };
}

/** Shrink the canvas's font until `text` fits in `max` px. */
function fit(c: CanvasRenderingContext2D, text: string, max: number): void {
  const w = c.measureText(text).width;
  if (w <= max) return;
  const m = /(\d+)px/.exec(c.font);
  if (!m) return;
  c.font = c.font.replace(/\d+px/, `${Math.floor((Number(m[1]) * max) / w)}px`);
}
