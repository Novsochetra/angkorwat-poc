import {
  BufferAttribute,
  Color,
  Group,
  Mesh,
  MeshLambertMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Object3D,
} from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3, valueNoise3 } from '../../voxel/random';
import type { VoxelQuality } from '../../voxel/VoxelMesh';
import { ANGKOR } from '../../world/scale';
import type { ColliderWorld } from './Colliders';
import { STONE, WorldBuilder } from './WorldBuilder';

/**
 * Real-scale Angkor Wat blockout for checking the explorer against the map
 * (1 unit = 1 m, origin = central tower, +X = east, the temple faces west).
 *
 * Proportions follow the reference sheets: complex ≈ 1.5 km × 1.3 km with a
 * 190 m moat, a 12 m wide western causeway with naga balustrades, the west gopura
 * with 3.4 m doorways, the raised avenue, three terraced galleries and five
 * lotus-bud towers, the central one 65 m high. It is intentionally a blockout —
 * detailed voxel modules from the angkorwat-temple plan can replace each piece.
 */
export interface SpawnPoint {
  name: string;
  x: number;
  y: number;
  z: number;
  /** Facing (radians, 0 = +Z). */
  yaw: number;
}

export interface AngkorWorld {
  root: Group;
  colliders: ColliderWorld;
  spawns: SpawnPoint[];
  /** Ground height with no collider (the island / banks). */
  baseGround: number;
  stats: { instances: number };
  update(t: number): void;
}

// Layout (metres).
const MOAT_OUT = { x: 750, z: 650 };
const MOAT_IN = { x: MOAT_OUT.x - ANGKOR.moatWidth, z: MOAT_OUT.z - ANGKOR.moatWidth };
const ENCLOSURE = { x: 512, z: 400 };
const CAUSEWAY_W = ANGKOR.causewayWidth;
const CAUSEWAY_TOP = 1.0;
const GOPURA_X = -ENCLOSURE.x;
const TERRACE_TOP = 1.5;
const DOOR_H = ANGKOR.doorwayHeight;
const DOOR_W = ANGKOR.doorwayWidth;

export function buildAngkorScaleWorld(quality: VoxelQuality = 'medium'): AngkorWorld {
  const w = new WorldBuilder(quality);
  const root = new Group();
  root.name = 'AngkorScaleWorld';

  // ── Terrain, moat water ────────────────────────────────────────────────
  root.add(makeGround(), makeWater());
  // Moat blocks walking (the causeway passes over it).
  const block = { noStand: true } as const;
  w.colliders.addBox(-MOAT_OUT.x, -5, -MOAT_OUT.z, MOAT_OUT.x, 0.9, -MOAT_IN.z, block);
  w.colliders.addBox(-MOAT_OUT.x, -5, MOAT_IN.z, MOAT_OUT.x, 0.9, MOAT_OUT.z, block);
  w.colliders.addBox(-MOAT_OUT.x, -5, -MOAT_IN.z, -MOAT_IN.x, 0.9, MOAT_IN.z, block);
  w.colliders.addBox(MOAT_IN.x, -5, -MOAT_IN.z, MOAT_OUT.x, 0.9, MOAT_IN.z, block);
  // Stone embankments along the moat edges.
  embankment(w, MOAT_IN.x, MOAT_IN.z, 'bank-in');
  embankment(w, MOAT_OUT.x, MOAT_OUT.z, 'bank-out');
  // World bounds.
  const B = 1100;
  w.colliders.addBox(-B - 5, -5, -B, -B, 50, B, block);
  w.colliders.addBox(B, -5, -B, B + 5, 50, B, block);
  w.colliders.addBox(-B, -5, -B - 5, B, 50, -B, block);
  w.colliders.addBox(-B, -5, B, B, 50, B + 5, block);

  // ── Western approach: cruciform terrace, causeway, nagas, lions ──────
  const cwX0 = -MOAT_OUT.x - 22;
  const cwX1 = GOPURA_X - 18;
  w.block('causeway', cwX0 - 16, 0, -16, cwX0, CAUSEWAY_TOP, 16, { color: STONE.sand, tile: [1.0, 1.0, 0.8], moss: 0.008 });
  w.stairs('causeway', cwX0 - 16, 0, '-x', 10, 0, CAUSEWAY_TOP, 0.25, 0.4);
  w.block('causeway', cwX0, 0, -CAUSEWAY_W / 2, cwX1, CAUSEWAY_TOP, CAUSEWAY_W / 2, { color: STONE.sand, tile: [1.2, 1, 1.0], moss: 0.008 });
  // Causeway sides drop into the moat — darker weathered stone.
  w.block('causeway', cwX0, -1.2, -CAUSEWAY_W / 2 - 0.6, cwX1, CAUSEWAY_TOP - 0.1, -CAUSEWAY_W / 2, { color: STONE.weathered, tile: [3, 1.1, 0.6], solid: false });
  w.block('causeway', cwX0, -1.2, CAUSEWAY_W / 2, cwX1, CAUSEWAY_TOP - 0.1, CAUSEWAY_W / 2 + 0.6, { color: STONE.weathered, tile: [3, 1.1, 0.6], solid: false });
  w.naga('causeway', cwX0 + 1, -CAUSEWAY_W / 2 + 0.4, cwX1 - 2, -CAUSEWAY_W / 2 + 0.4, CAUSEWAY_TOP, 'start');
  w.naga('causeway', cwX0 + 1, CAUSEWAY_W / 2 - 0.4, cwX1 - 2, CAUSEWAY_W / 2 - 0.4, CAUSEWAY_TOP, 'start');
  w.lion('causeway', cwX0 - 13, -7, CAUSEWAY_TOP, '-x');
  w.lion('causeway', cwX0 - 13, 7, CAUSEWAY_TOP, '-x');

  // ── West gopura: terrace, central gate with doorway, galleries ───────
  const gx0 = GOPURA_X - 18;
  const gx1 = GOPURA_X - 8;
  w.block('gopura', gx0, 0, -30, gx1, TERRACE_TOP, 30, { color: STONE.sand, tile: [1.0, 1.5, 0.8], moss: 0.008 });
  w.stairs('gopura', gx0, 0, '-x', 12, CAUSEWAY_TOP, TERRACE_TOP, 0.25, 0.4);
  // Platform the gate halls and galleries stand on.
  w.block('gopura', gx1, 0, -112, GOPURA_X + 8, TERRACE_TOP, 112, { color: STONE.weathered, tile: [2, 1.5, 3], moss: 0.06 });
  gateHall(w, 'gopura', GOPURA_X - 8, GOPURA_X + 8, 0, TERRACE_TOP, 34, 9.5);
  w.tower('gopura', GOPURA_X, 0, TERRACE_TOP + 9.5, TERRACE_TOP + 24, 13, 9);
  for (const s of [-1, 1]) {
    // Galleries linking to the side gates.
    gallery(w, 'gopura', GOPURA_X - 4.5, GOPURA_X + 4.5, s * 17, s * 92, TERRACE_TOP, 6.5);
    gateHall(w, 'gopura', GOPURA_X - 7, GOPURA_X + 7, s * 101, TERRACE_TOP, 18, 8);
    w.tower('gopura', GOPURA_X, s * 101, TERRACE_TOP + 8, TERRACE_TOP + 18, 9, 6);
    // Outer enclosure wall (laterite).
    w.block('enclosure', GOPURA_X - 1, 0, s * 110, GOPURA_X + 1, 4.5, s * ENCLOSURE.z, { color: STONE.laterite, tile: [2, 1.5, 3] });
    w.block('enclosure', -ENCLOSURE.x, 0, s * ENCLOSURE.z - 1, ENCLOSURE.x, 4.5, s * ENCLOSURE.z + 1, { color: STONE.laterite, tile: [3, 1.5, 2] });
  }
  w.block('enclosure', ENCLOSURE.x - 1, 0, -ENCLOSURE.z, ENCLOSURE.x + 1, 4.5, ENCLOSURE.z, { color: STONE.laterite, tile: [2, 1.5, 3] });

  // ── Inner avenue with nagas, libraries and ponds ─────────────────────
  const avX0 = GOPURA_X + 8;
  const avX1 = -118;
  w.block('avenue', avX0, 0, -4.75, avX1, TERRACE_TOP, 4.75, { color: STONE.sand, tile: [1.2, 1.5, 0.95], moss: 0.008 });
  w.naga('avenue', avX0 + 3, -4.4, avX1 - 3, -4.4, TERRACE_TOP, 'none');
  w.naga('avenue', avX0 + 3, 4.4, avX1 - 3, 4.4, TERRACE_TOP, 'none');
  for (const s of [-1, 1]) {
    library(w, 'avenue', -330, s * 52);
    pond(root, w, -235, s * 58, 60, 38);
  }
  // Cruciform terrace in front of the temple.
  w.block('avenue', avX1, 0, -22, -93.5, 2.0, 22, { color: STONE.sand, tile: [1.0, 1.0, 0.8], moss: 0.008 });
  w.stairs('avenue', avX1, 0, '-x', 8, TERRACE_TOP, 2.0, 0.25, 0.4);

  // ── Temple: three terraced gallery levels + five towers ──────────────
  const L1 = { x: 93.5, z: 107.5, y: 3.5 };
  const L2 = { x: 50, z: 57.5, y: 10.5 };
  const L3 = { x: 37.5, z: 37.5, y: 23.5 };
  w.block('temple', -L1.x, 0, -L1.z, L1.x, L1.y, L1.z, { color: STONE.sand, tile: [6, 1.75, 6], moss: 0.08 });
  w.stairs('temple', -L1.x, 0, '-x', 8, 2.0, L1.y, 0.25, 0.35);
  ringGallery(w, 'temple', L1.x, L1.z, L1.y, 7.5, 4.5);
  w.block('temple', -L2.x, L1.y, -L2.z, L2.x, L2.y, L2.z, { color: STONE.sand, tile: [5, 1.75, 5], moss: 0.06 });
  w.stairs('temple', -L2.x, 0, '-x', 7, L1.y, L2.y, 0.25, 0.3);
  ringGallery(w, 'temple', L2.x, L2.z, L2.y, 6, 4);
  w.block('temple', -L3.x, L2.y, -L3.z, L3.x, L3.y, L3.z, { color: STONE.weathered, tile: [5, 2.2, 5], moss: 0.05 });
  // The famously steep Bakan stairs (≈60°, eased from the real ≈70° for play).
  w.stairs('temple', -L3.x, 0, '-x', 5, L2.y, L3.y, 0.3, 0.18);
  ringGallery(w, 'temple', L3.x, L3.z, L3.y, 5.5, 3.5);
  w.tower('temple', 0, 0, L3.y, ANGKOR.centralTowerHeight, 19, 16);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) w.tower('temple', sx * 30, sz * 30, L3.y, L3.y + 29, 12, 13);

  // ── Vegetation ─────────────────────────────────────────────────────────
  let seed = 11;
  for (let i = 0; i < 90; i++) {
    // Palms lining the banks and the avenue.
    const along = hash3(i, 1, 2, 3);
    const side = i % 2 ? 1 : -1;
    if (i < 40) w.palm('trees', -MOAT_OUT.x - 30 - hash3(i, 2, 3, 4) * 60, side * (25 + along * 560), 0, 11 + hash3(i, 3, 3, 3) * 5, seed++);
    else if (i < 70) w.palm('trees', avX0 + 20 + along * (avX1 - avX0 - 40), side * (18 + hash3(i, 4, 4, 4) * 20), 0, 10 + hash3(i, 5, 5, 5) * 5, seed++);
    else w.palm('trees', -MOAT_IN.x + 15 + hash3(i, 6, 6, 6) * 14, side * (40 + along * 330), 0, 11 + hash3(i, 7, 7, 7) * 4, seed++);
  }
  for (let i = 0; i < 160; i++) {
    // Forest outside the moat and in the enclosure corners.
    const a = hash3(i, 9, 1, 1) * Math.PI * 2;
    const r = 820 + hash3(i, 9, 2, 1) * 240;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r * 0.9;
    if (x < -MOAT_OUT.x - 5 && Math.abs(z) < 60) continue; // keep the approach clear
    if (Math.abs(x) < MOAT_OUT.x + 12 && Math.abs(z) < MOAT_OUT.z + 12) continue; // not in the moat
    w.tree('trees', x, z, 0, 9 + hash3(i, 9, 3, 1) * 5, seed++);
  }
  for (let i = 0; i < 70; i++) {
    const sx = i % 2 ? 1 : -1;
    const sz = i % 4 < 2 ? 1 : -1;
    const x = sx * (140 + hash3(i, 8, 1, 2) * 330);
    const z = sz * (140 + hash3(i, 8, 2, 2) * 230);
    if (Math.abs(x) < 130 && Math.abs(z) < 130) continue;
    if (x < -110 && Math.abs(z) < 80) continue; // keep the avenue clear
    w.tree('trees', x, z, 0, 8 + hash3(i, 8, 3, 2) * 5, seed++);
  }

  // Scale ruler at the spawn: a 2 m pole marked every 0.5 m, next to the explorer.
  scaleRuler(w, cwX0 - 12, 3.2, CAUSEWAY_TOP);

  root.add(w.build());
  const spawns: SpawnPoint[] = [
    { name: 'Causeway (west approach)', x: cwX0 - 10, y: CAUSEWAY_TOP, z: 0, yaw: Math.PI / 2 },
    { name: 'West gopura doorway', x: GOPURA_X - 14, y: TERRACE_TOP, z: 0, yaw: Math.PI / 2 },
    { name: 'Temple west stairs', x: -L1.x - 12, y: 2.0, z: 0, yaw: Math.PI / 2 },
    { name: 'Bakan (top terrace)', x: -L3.x + 6, y: L3.y, z: -8, yaw: Math.PI / 2 },
  ];
  return {
    root,
    colliders: w.colliders,
    spawns,
    baseGround: 0,
    stats: { instances: w.instanceCount },
    update: () => {},
  };
}

// ─── Pieces ──────────────────────────────────────────────────────────────

function embankment(w: WorldBuilder, hx: number, hz: number, chunk: string): void {
  const h = 0.6;
  const t = 1.2;
  for (const s of [-1, 1]) {
    // N / S edges, leaving a gap for the causeway on the west side.
    w.block(chunk, -hx, -1.5, s * hz - t / 2, hx, h, s * hz + t / 2, { color: STONE.weathered, tile: [6, 1.05, t], moss: 0.2 });
  }
  for (const s of [-1, 1]) {
    const x = s * hx;
    if (s < 0) {
      w.block(chunk, x - t / 2, -1.5, -hz, x + t / 2, h, -CAUSEWAY_W / 2 - 0.7, { color: STONE.weathered, tile: [t, 1.05, 6], moss: 0.2 });
      w.block(chunk, x - t / 2, -1.5, CAUSEWAY_W / 2 + 0.7, x + t / 2, h, hz, { color: STONE.weathered, tile: [t, 1.05, 6], moss: 0.2 });
    } else w.block(chunk, x - t / 2, -1.5, -hz, x + t / 2, h, hz, { color: STONE.weathered, tile: [t, 1.05, 6], moss: 0.2 });
  }
}

/**
 * Gate hall with a central doorway (DOOR_W × DOOR_H clear opening) running
 * east–west, side doorways, a lintel and a stepped roof.
 */
function gateHall(w: WorldBuilder, chunk: string, x0: number, x1: number, zc: number, floor: number, width: number, height: number): void {
  const hw = width / 2;
  const dw = DOOR_W / 2;
  const wall = { color: STONE.sand, tile: [1.2, 1.2, 1.2] as [number, number, number], moss: 0.03 };
  // Walls either side of the passage.
  w.block(chunk, x0, floor, zc - hw, x1, floor + height, zc - dw - 0.6, wall);
  w.block(chunk, x0, floor, zc + dw + 0.6, x1, floor + height, zc + hw, wall);
  // Door jambs (slightly proud, darker) and the lintel over the opening.
  w.block(chunk, x0 - 0.3, floor, zc - dw - 0.6, x1 + 0.3, floor + DOOR_H, zc - dw, { color: STONE.weathered, tile: [0.8, 0.85, 0.6] });
  w.block(chunk, x0 - 0.3, floor, zc + dw, x1 + 0.3, floor + DOOR_H, zc + dw + 0.6, { color: STONE.weathered, tile: [0.8, 0.85, 0.6] });
  w.block(chunk, x0 - 0.4, floor + DOOR_H, zc - dw - 0.8, x1 + 0.4, floor + DOOR_H + 1.1, zc + dw + 0.8, { color: STONE.sand[2], tile: [0.9, 0.55, 0.9] });
  w.block(chunk, x0, floor + DOOR_H + 1.1, zc - dw - 0.6, x1, floor + height, zc + dw + 0.6, wall);
  // Passage floor + a dark interior so the doorway reads as an opening.
  w.block(chunk, x0, floor - 0.2, zc - dw, x1, floor, zc + dw, { color: STONE.dark, tile: 1, solid: false });
  // Pediment and stepped roof.
  w.block(chunk, x0 - 0.8, floor + height, zc - hw - 0.6, x1 + 0.8, floor + height + 0.9, zc + hw + 0.6, { color: STONE.roof, tile: 1.4 });
  w.block(chunk, x0 + 0.6, floor + height + 0.9, zc - hw * 0.8, x1 - 0.6, floor + height + 2.2, zc + hw * 0.8, { color: STONE.roof, tile: 1.3 });
  // False windows with stone balusters on the facade.
  for (const s of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const z = zc + s * (dw + 3 + k * 3.6);
      if (Math.abs(z - zc) > hw - 1.5) continue;
      for (let b = -2; b <= 2; b++) w.block(chunk, x0 - 0.35, floor + 2.2, z + b * 0.42 - 0.12, x0, floor + 4.4, z + b * 0.42 + 0.12, { color: STONE.sand[2], tile: [0.35, 0.55, 0.24], solid: false });
    }
}

/** Covered gallery (colonnade) running north–south. */
function gallery(w: WorldBuilder, chunk: string, x0: number, x1: number, zA: number, zB: number, floor: number, height: number): void {
  const z0 = Math.min(zA, zB);
  const z1 = Math.max(zA, zB);
  // Back wall + colonnade + roof.
  w.block(chunk, x1 - 1.2, floor, z0, x1, floor + height, z1, { color: STONE.sand, tile: [1.2, 1.3, 2] });
  for (let z = z0 + 1.5; z < z1 - 1; z += 3.2) w.block(chunk, x0, floor, z - 0.45, x0 + 0.9, floor + height - 1.2, z + 0.45, { color: STONE.weathered, tile: [0.9, 1.3, 0.9] });
  w.block(chunk, x0 - 0.4, floor + height - 1.2, z0, x1, floor + height, z1, { color: STONE.roof, tile: [1.6, 1.2, 2] });
  w.block(chunk, x0 + 1, floor + height, z0, x1 - 1, floor + height + 1.3, z1, { color: STONE.roof, tile: [1.6, 1.3, 2.4], solid: false });
}

/** Four-sided gallery ring on a terrace edge with a west doorway. */
function ringGallery(w: WorldBuilder, chunk: string, hx: number, hz: number, floor: number, height: number, depth: number): void {
  const wall = { color: STONE.sand, tile: [3, 1.5, 3] as [number, number, number], moss: 0.04 };
  const roof = { color: STONE.roof, tile: [3, 1.2, 3] as [number, number, number] };
  // North / south / east sides.
  for (const s of [-1, 1]) {
    w.block(chunk, -hx, floor, s * hz - (s > 0 ? depth : 0), hx, floor + height, s * hz + (s < 0 ? depth : 0), wall);
    w.block(chunk, -hx - 0.5, floor + height, s * hz - (s > 0 ? depth + 0.5 : -0.5), hx + 0.5, floor + height + 1.2, s * hz + (s < 0 ? depth + 0.5 : -0.5), roof);
  }
  w.block(chunk, hx - depth, floor, -hz, hx, floor + height, hz, wall);
  // West side with a gate hall in the middle.
  const gw = 10;
  w.block(chunk, -hx, floor, -hz, -hx + depth, floor + height, -gw / 2, wall);
  w.block(chunk, -hx, floor, gw / 2, -hx + depth, floor + height, hz, wall);
  gateHall(w, chunk, -hx - 1, -hx + depth + 1, 0, floor, gw, height + 1);
}

function library(w: WorldBuilder, chunk: string, x: number, z: number): void {
  w.block(chunk, x - 20, 0, z - 9, x + 20, 1.6, z + 9, { color: STONE.sand, tile: 1.6, moss: 0.08 });
  w.block(chunk, x - 16, 1.6, z - 6, x + 16, 7.5, z + 6, { color: STONE.sand, tile: 1.3, moss: 0.03 });
  w.block(chunk, x - 17, 7.5, z - 7, x + 17, 8.6, z + 7, { color: STONE.roof, tile: 1.4 });
  w.block(chunk, x - 14, 8.6, z - 4.5, x + 14, 10.2, z + 4.5, { color: STONE.roof, tile: 1.4 });
  w.stairs(chunk, x - 20, z, '-x', 5, 1.6, 0, 0.27, 0.4);
}

function pond(root: Object3D, w: WorldBuilder, x: number, z: number, lx: number, lz: number): void {
  const h = lx / 2;
  const d = lz / 2;
  w.block('avenue', x - h - 1, 0, z - d - 1, x + h + 1, 0.5, z - d, { color: STONE.weathered, tile: [3, 0.5, 1] });
  w.block('avenue', x - h - 1, 0, z + d, x + h + 1, 0.5, z + d + 1, { color: STONE.weathered, tile: [3, 0.5, 1] });
  w.block('avenue', x - h - 1, 0, z - d, x - h, 0.5, z + d, { color: STONE.weathered, tile: [1, 0.5, 3] });
  w.block('avenue', x + h, 0, z - d, x + h + 1, 0.5, z + d, { color: STONE.weathered, tile: [1, 0.5, 3] });
  w.colliders.addBox(x - h, -3, z - d, x + h, 0.45, z + d, { noStand: true });
  const water = new Mesh(new PlaneGeometry(lx, lz), waterMaterial());
  water.name = 'pond';
  water.userData.source = traceSource();
  water.rotation.x = -Math.PI / 2;
  water.position.set(x, 0.18, z);
  water.receiveShadow = true;
  root.add(water);
}

function scaleRuler(w: WorldBuilder, x: number, z: number, y: number): void {
  // Alternating 0.5 m bands up to 2 m, then a small cap: compare with the explorer.
  for (let i = 0; i < 4; i++)
    w.block('causeway', x - 0.08, y + i * 0.5, z - 0.08, x + 0.08, y + (i + 1) * 0.5, z + 0.08, { color: i % 2 ? 0xf2efe8 : 0xc0392b, mat: 'metal', tile: [0.16, 0.5, 0.16], solid: false });
  w.block('causeway', x - 0.18, y + 1.7 - 0.02, z - 0.18, x + 0.18, y + 1.7 + 0.02, z + 0.18, { color: 0x1d6fb8, mat: 'metal', tile: [0.36, 0.04, 0.36], solid: false });
  w.colliders.addBox(x - 0.1, y, z - 0.1, x + 0.1, y + 2, z + 0.1);
}

// ─── Terrain / water ─────────────────────────────────────────────────────

let _water: MeshStandardMaterial | null = null;
function waterMaterial(): MeshStandardMaterial {
  if (!_water) {
    _water = new MeshStandardMaterial({ color: 0x3f6f73, roughness: 0.18, metalness: 0.05, transparent: true, opacity: 0.93 });
    _water.name = 'moat-water';
  }
  return _water;
}

function makeWater(): Mesh {
  const geo = new PlaneGeometry(MOAT_OUT.x * 2, MOAT_OUT.z * 2, 1, 1);
  const water = new Mesh(geo, waterMaterial());
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.35;
  water.receiveShadow = true;
  water.name = 'moat';
  water.userData.source = traceSource();
  return water;
}

/**
 * Grass ground in four slabs around the moat plus the island, vertex coloured
 * with low-frequency noise so the huge plane doesn't look flat.
 */
function makeGround(): Group {
  const g = new Group();
  g.name = 'ground';
  g.userData.source = traceSource();
  // (matte: no sun sheen on the grass, only water shines)
  const mat = new MeshLambertMaterial({ vertexColors: true });
  const slab = (x0: number, z0: number, x1: number, z1: number, step = 20) => {
    const sx = Math.max(1, Math.round((x1 - x0) / step));
    const sz = Math.max(1, Math.round((z1 - z0) / step));
    const geo = new PlaneGeometry(x1 - x0, z1 - z0, sx, sz);
    geo.rotateX(-Math.PI / 2);
    geo.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const pos = geo.getAttribute('position');
    const colors = new Float32Array(pos.count * 3);
    const c = new Color();
    const grassA = new Color(0x5d7f34);
    const grassB = new Color(0x7a9844);
    const dirt = new Color(0x9c8a62);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const n = valueNoise3(x * 0.012, 0, z * 0.012, 5) * 0.7 + valueNoise3(x * 0.06, 1, z * 0.06, 6) * 0.3;
      c.copy(grassA).lerp(grassB, n);
      // Worn paths near the causeway / avenue axis.
      const path = Math.max(0, 1 - Math.abs(z) / 26) * (x < -MOAT_OUT.x || (x > -ENCLOSURE.x && x < -95) ? 0.55 : 0);
      c.lerp(dirt, path * (0.6 + n * 0.4));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new BufferAttribute(colors, 3));
    const m = new Mesh(geo, mat);
    m.receiveShadow = true;
    g.add(m);
  };
  const E = 1150;
  slab(-E, -E, E, -MOAT_OUT.z);
  slab(-E, MOAT_OUT.z, E, E);
  slab(-E, -MOAT_OUT.z, -MOAT_OUT.x, MOAT_OUT.z);
  slab(MOAT_OUT.x, -MOAT_OUT.z, E, MOAT_OUT.z);
  slab(-MOAT_IN.x, -MOAT_IN.z, MOAT_IN.x, MOAT_IN.z, 12);
  return g;
}
