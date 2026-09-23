import { Group, LOD, Vector3 } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelMaterialKey } from '../../voxel/materials';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh, type VoxelQuality } from '../../voxel/VoxelMesh';
import { ColliderWorld } from './Colliders';

/** Sandstone / laterite / vegetation colours from the Angkor Wat reference sheets. */
export const STONE = {
  sand: [0xab9a7c, 0xa08f72, 0xb6a586, 0x968669, 0xa39479],
  weathered: [0x8a7c66, 0x7f725e, 0x938470],
  dark: [0x6f6555, 0x655c4d, 0x5c5446],
  moss: [0x5c6a3a, 0x525f34, 0x66723f],
  laterite: [0x8e5c3f, 0x86563a, 0x9a6545],
  roof: [0x7d7361, 0x857a66, 0x736a59],
} as const;

export const GREEN = {
  leaf: [0x3f7a2e, 0x4a8a34, 0x356a27, 0x5a9a3a, 0x2f5f23],
  palm: [0x5f8f33, 0x6f9f3a, 0x4f7f2b],
  bark: [0x6b4a2e, 0x5a3e27, 0x7a5636],
  palmTrunk: [0x7d6a52, 0x6f5e48, 0x8a765c],
} as const;

export type Dir = '+x' | '-x' | '+z' | '-z';

export interface BlockOptions {
  /** Fixed colour, a palette to pick from, or a per-tile function. */
  color: number | readonly number[] | ((i: number, j: number, k: number, top: boolean) => number);
  mat?: VoxelMaterialKey;
  /** Approximate tile size (m) — the box is split into whole tiles of about this size. */
  tile?: number | [number, number, number];
  /** Add a collider (default true). */
  solid?: boolean;
  /** Moss / weathering on top tiles (0‥1 chance). */
  moss?: number;
  seed?: number;
  jitter?: number;
}

/**
 * Accumulates the test world into a few voxel chunks + a collider set.
 * Units are metres; visual tiles are rounded blocks like the character's so the
 * whole scene shares one look.
 */
export class WorldBuilder {
  readonly colliders = new ColliderWorld();
  private readonly chunks = new Map<string, VoxelBuilder>();
  private seed = 1;

  constructor(private readonly quality: VoxelQuality = 'medium') {}

  chunk(name: string): VoxelBuilder {
    let c = this.chunks.get(name);
    if (!c) this.chunks.set(name, (c = new VoxelBuilder()));
    return c;
  }

  /** A box made of stone tiles (only surface tiles are emitted). */
  block(chunk: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, o: BlockOptions): void {
    const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)];
    const [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
    const [az, bz] = [Math.min(z0, z1), Math.max(z0, z1)];
    if (bx - ax < 1e-3 || by - ay < 1e-3 || bz - az < 1e-3) return;
    const t = typeof o.tile === 'number' ? [o.tile, o.tile, o.tile] : (o.tile ?? [1, 1, 1]);
    const nx = Math.max(1, Math.round((bx - ax) / t[0]));
    const ny = Math.max(1, Math.round((by - ay) / t[1]));
    const nz = Math.max(1, Math.round((bz - az) / t[2]));
    const seed = o.seed ?? this.seed++;
    const g = this.chunk(chunk).grid({
      cell: [(bx - ax) / nx, (by - ay) / ny, (bz - az) / nz],
      origin: [ax, ay, az],
      mat: o.mat ?? 'stone',
      jitter: o.jitter ?? 0.05,
      ao: 0.18,
      seed,
    });
    const col = o.color;
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < ny; j++)
        for (let k = 0; k < nz; k++) {
          // Interior cells are only needed as occluders; surface ones get colours.
          const surface = i === 0 || j === 0 || k === 0 || i === nx - 1 || j === ny - 1 || k === nz - 1;
          if (!surface) {
            g.ghost(i, j, k);
            continue;
          }
          const top = j === ny - 1;
          let c: number;
          if (typeof col === 'number') c = col;
          else if (typeof col === 'function') c = col(i, j, k, top);
          else c = col[Math.floor(hash3(i, j, k, seed) * col.length)];
          if (top && o.moss && hash3(i, k, j, seed + 7) < o.moss) c = STONE.moss[Math.floor(hash3(k, i, j, seed) * 3)];
          g.set(i, j, k, c);
        }
    g.commit();
    if (o.solid ?? true) this.colliders.addBox(ax, ay, az, bx, by, bz);
  }

  /**
   * Flight of steps down from a platform edge. (x, z) is the middle of the top
   * edge, `dir` the direction the stairs descend, from `yHigh` to `yLow`. Each
   * step is its own collider so the controller can climb it. Returns its length.
   */
  stairs(chunk: string, x: number, z: number, dir: Dir, width: number, yLow: number, yHigh: number, rise = 0.25, run = 0.35, color: BlockOptions['color'] = STONE.sand): number {
    const n = Math.max(1, Math.round((yHigh - yLow) / rise));
    const h = (yHigh - yLow) / n;
    const sx = dir === '+x' ? 1 : dir === '-x' ? -1 : 0;
    const sz = dir === '+z' ? 1 : dir === '-z' ? -1 : 0;
    for (let k = 1; k <= n; k++) {
      // Step k has its top at yLow + k·h; the highest one touches the platform.
      const a = (n - k) * run;
      const b = (n - k + 1) * run;
      const top = yLow + k * h;
      if (sx !== 0) this.block(chunk, x + sx * a, yLow, z - width / 2, x + sx * b, top, z + width / 2, { color, tile: [run, Math.min(1.5, top - yLow), 1] });
      else this.block(chunk, x - width / 2, yLow, z + sz * a, x + width / 2, top, z + sz * b, { color, tile: [1, Math.min(1.5, top - yLow), run] });
    }
    return n * run;
  }

  /** Naga balustrade: serpent body on short posts with a fanned multi-headed end. */
  naga(chunk: string, x0: number, z0: number, x1: number, z1: number, y: number, heads: 'start' | 'end' | 'both' | 'none' = 'start'): void {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const ux = (x1 - x0) / len;
    const uz = (z1 - z0) / len;
    const along = Math.abs(ux) > Math.abs(uz);
    const w = 0.7;
    // body rail
    const n = Math.max(1, Math.round(len / 1.5));
    for (let s = 0; s < n; s++) {
      const a = (s / n) * len;
      const b = ((s + 1) / n) * len;
      const xa = x0 + ux * a;
      const za = z0 + uz * a;
      const xb = x0 + ux * b;
      const zb = z0 + uz * b;
      const c = s % 2 ? STONE.sand[1] : STONE.sand[3];
      if (along) this.block(chunk, xa, y + 0.45, za - w / 2, xb, y + 1.05, za + w / 2, { color: c, tile: [1.5, 0.6, w], solid: false });
      else this.block(chunk, xa - w / 2, y + 0.45, za, xa + w / 2, y + 1.05, zb, { color: c, tile: [w, 0.6, 1.5], solid: false });
      if (s % 2 === 0) {
        const px = xa + ux * 0.75;
        const pz = za + uz * 0.75;
        this.block(chunk, px - 0.3, y, pz - 0.3, px + 0.3, y + 0.45, pz + 0.3, { color: STONE.weathered, tile: 0.6, solid: false });
      }
    }
    this.colliders.addBox(Math.min(x0, x1) - w / 2, y, Math.min(z0, z1) - w / 2, Math.max(x0, x1) + w / 2, y + 1.05, Math.max(z0, z1) + w / 2);
    const head = (hx: number, hz: number, sign: number) => {
      // Seven-headed naga: necks fanning out from the raised end of the body,
      // each topped by a flared hood, the centre head tallest.
      const b = this.chunk(chunk);
      const bx = hx + (along ? sign * 0.3 : 0);
      const bz = hz + (along ? 0 : sign * 0.3);
      this.block(chunk, bx - 0.7, y, bz - 0.7, bx + 0.7, y + 1.1, bz + 0.7, { color: STONE.weathered, tile: 0.7, solid: false });
      for (let h = -3; h <= 3; h++) {
        const ang = h * 0.3;
        const len = 2.4 - Math.abs(h) * 0.16;
        const ox = along ? 0 : Math.sin(ang);
        const oz = along ? Math.sin(ang) : 0;
        const rot = along ? { rx: ang } : { rz: -ang };
        const c = Math.cos(ang);
        b.box(bx + (ox * len) / 2, y + 1.0 + (c * len) / 2, bz + (oz * len) / 2, 0.32, len, 0.32, STONE.sand[3], 'stone', rot);
        const tx = bx + ox * len;
        const tz = bz + oz * len;
        const ty = y + 1.0 + c * len;
        b.box(tx, ty, tz, along ? 0.45 : 0.62, 0.66, along ? 0.62 : 0.45, STONE.sand[2], 'stone', rot);
        b.box(tx + (along ? sign * 0.24 : 0), ty + 0.05, tz + (along ? 0 : sign * 0.24), 0.18, 0.18, 0.18, STONE.dark[0], 'stone', rot);
      }
      this.colliders.addBox(bx - 1.2, y, bz - 1.2, bx + 1.2, y + 3.4, bz + 1.2);
    };
    if (heads === 'start' || heads === 'both') head(x0, z0, -1);
    if (heads === 'end' || heads === 'both') head(x1, z1, 1);
  }

  /** Seated guardian lion (sheet: "Lion Statue") on a pedestal, facing `dir`. */
  lion(chunk: string, x: number, z: number, y: number, dir: Dir): void {
    const s = dir === '-x' || dir === '-z' ? -1 : 1;
    const alongX = dir === '+x' || dir === '-x';
    // Local frame: f = forward (facing), l = lateral, u = up. Boxes are [f0,u0,l0,f1,u1,l1].
    const put = (f0: number, u0: number, l0: number, f1: number, u1: number, l1: number, c: number | readonly number[], tile = 0.3) => {
      const fa = x + (alongX ? f0 * s : 0) + (alongX ? 0 : l0);
      const fb = x + (alongX ? f1 * s : 0) + (alongX ? 0 : l1);
      const za = z + (alongX ? l0 : f0 * s);
      const zb = z + (alongX ? l1 : f1 * s);
      this.block(chunk, fa, y + u0, za, fb, y + u1, zb, { color: c, tile, solid: false });
    };
    const S = STONE.sand;
    put(-1.1, 0, -0.75, 1.1, 0.5, 0.75, STONE.weathered, 0.5); // pedestal
    put(-0.95, 0.5, -0.55, 0.05, 1.35, 0.55, S); // haunches
    put(-0.6, 1.35, -0.45, 0.35, 2.05, 0.45, S); // back / torso
    put(-0.15, 0.5, -0.5, 0.55, 2.25, 0.5, S); // chest
    put(0.35, 0.5, -0.45, 0.85, 1.25, -0.12, S[3]); // front legs
    put(0.35, 0.5, 0.12, 0.85, 1.25, 0.45, S[3]);
    put(0.55, 0.5, -0.5, 0.95, 0.72, -0.08, S[1]); // paws
    put(0.55, 0.5, 0.08, 0.95, 0.72, 0.5, S[1]);
    put(-0.1, 2.0, -0.62, 0.7, 3.0, 0.62, STONE.weathered); // mane
    put(0.5, 2.15, -0.42, 1.05, 2.85, 0.42, S[2]); // face
    put(1.0, 2.2, -0.24, 1.22, 2.55, 0.24, S[0], 0.2); // muzzle
    put(0.9, 2.55, -0.32, 1.1, 2.75, -0.1, STONE.dark, 0.2); // brows
    put(0.9, 2.55, 0.1, 1.1, 2.75, 0.32, STONE.dark, 0.2);
    put(-1.05, 0.5, -0.12, -0.85, 1.6, 0.12, S[3], 0.2); // tail
    const r = 1.2;
    this.colliders.addBox(x - r, y, z - r, x + r, y + 3, z + r);
  }

  /**
   * Lotus-bud tower (prasat): redented cruciform tiers tapering in a bud profile,
   * each tier capped by a cornice, a finial on top.
   */
  tower(chunk: string, cx: number, cz: number, baseY: number, topY: number, baseW: number, tiers = 14): void {
    const H = topY - baseY;
    // Solid lower body (sanctuary) ~30% of the height.
    const bodyH = H * 0.28;
    const bw = baseW;
    this.cruciform(chunk, cx, cz, baseY, baseY + bodyH, bw, 1.5);
    // Door openings (dark recesses) on the four sides of the body.
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = cx + (dx * bw) / 2;
      const z = cz + (dz * bw) / 2;
      const w = 1.2;
      this.block(chunk, x - (dz ? w : 0.3), baseY + 0.3, z - (dx ? w : 0.3), x + (dz ? w : 0.3), baseY + Math.min(4.2, bodyH * 0.6), z + (dx ? w : 0.3), { color: STONE.dark, tile: 0.6, solid: false });
    }
    const tierH = (H - bodyH) / tiers;
    for (let t = 0; t < tiers; t++) {
      const u = (t + 0.5) / tiers;
      const prof = Math.pow(1 - Math.pow(u, 1.9), 0.62); // bud: full, then curving in
      const w = Math.max(1.0, bw * 0.92 * prof);
      const y0 = baseY + bodyH + t * tierH;
      this.cruciform(chunk, cx, cz, y0, y0 + tierH * 0.78, w, 1.5, false);
      this.cruciform(chunk, cx, cz, y0 + tierH * 0.78, y0 + tierH, w * 1.06, 1.5, false, STONE.roof);
    }
    // Finial.
    this.block(chunk, cx - 0.6, topY - 0.2, cz - 0.6, cx + 0.6, topY + 1.4, cz + 0.6, { color: STONE.sand[2], tile: 0.6, solid: false });
  }

  /** Redented (cross-shaped) block, as used for tower tiers and sanctuaries. */
  cruciform(chunk: string, cx: number, cz: number, y0: number, y1: number, w: number, tile: number, solid = true, color: BlockOptions['color'] = STONE.sand): void {
    const a = w / 2;
    const b = w * 0.32;
    this.block(chunk, cx - a, y0, cz - b, cx + a, y1, cz + b, { color, tile, solid });
    this.block(chunk, cx - b, y0, cz - a, cx + b, y1, cz - b, { color, tile, solid });
    this.block(chunk, cx - b, y0, cz + b, cx + b, y1, cz + a, { color, tile, solid });
    const c = w * 0.42;
    this.block(chunk, cx - c, y0, cz - c, cx - b, y1, cz - b, { color, tile, solid: false });
    this.block(chunk, cx + b, y0, cz - c, cx + c, y1, cz - b, { color, tile, solid: false });
    this.block(chunk, cx - c, y0, cz + b, cx - b, y1, cz + c, { color, tile, solid: false });
    this.block(chunk, cx + b, y0, cz + b, cx + c, y1, cz + c, { color, tile, solid: false });
    if (solid) this.colliders.addBox(cx - c, y0, cz - c, cx + c, y1, cz + c);
  }

  /** Broad-leaf tree: voxel trunk + lumpy canopy. */
  tree(chunk: string, x: number, z: number, y: number, height: number, seed: number): void {
    const b = this.chunk(chunk);
    const src = traceSource(); // one trace for the whole tree, not one per canopy block
    const trunkH = height * 0.55;
    const tw = 0.7 + height * 0.03;
    const bark = GREEN.bark[seed % GREEN.bark.length];
    for (let s = 0; s < Math.ceil(trunkH / 1.2); s++)
      b.box(x, y + s * 1.2 + 0.6, z, tw, 1.2, tw, bark, 'bark', { shade: 0.95 + hash3(s, seed, 1, 3) * 0.1, src });
    const R = height * 0.33;
    const cy = y + trunkH + R * 0.55;
    const cell = Math.max(1.1, R / 3.2);
    const n = Math.ceil(R / cell) + 1;
    for (let i = -n; i <= n; i++)
      for (let j = -n; j <= n; j++)
        for (let k = -n; k <= n; k++) {
          const px = i * cell;
          const py = j * cell * 0.8;
          const pz = k * cell;
          const r = Math.hypot(px, py * 1.25, pz) / R + (hash3(i, j, k, seed) - 0.5) * 0.35;
          if (r > 1) continue;
          if (r < 0.62 && Math.abs(i) < n && Math.abs(j) < n && Math.abs(k) < n) continue; // hollow core
          const c = GREEN.leaf[Math.floor(hash3(k, i, j, seed + 1) * GREEN.leaf.length)];
          b.box(x + px, cy + py, z + pz, cell, cell * 0.8, cell, c, 'foliage', { shade: 0.85 + (j + n) / (2 * n) * 0.3, src });
        }
    this.colliders.addBox(x - tw / 2, y, z - tw / 2, x + tw / 2, y + trunkH, z + tw / 2, { src });
  }

  /** Sugar palm: tall thin trunk and a star of fronds. */
  palm(chunk: string, x: number, z: number, y: number, height: number, seed: number): void {
    const b = this.chunk(chunk);
    const src = traceSource();
    const tw = 0.45;
    const segs = Math.ceil(height / 0.9);
    const lean = (hash3(seed, 2, 3, 4) - 0.5) * 0.08;
    for (let s = 0; s < segs; s++) {
      const c = GREEN.palmTrunk[(s + seed) % GREEN.palmTrunk.length];
      b.box(x + lean * s * 0.9, y + s * 0.9 + 0.45, z, tw, 0.9, tw, c, 'bark', { src });
    }
    const topX = x + lean * segs * 0.9;
    const topY = y + segs * 0.9;
    b.box(topX, topY + 0.3, z, 1.1, 0.9, 1.1, GREEN.palm[2], 'foliage', { src });
    const fronds = 9;
    for (let f = 0; f < fronds; f++) {
      const a = (f / fronds) * Math.PI * 2 + hash3(f, seed, 1, 1);
      for (let s = 1; s <= 4; s++) {
        const d = s * 0.85;
        const droop = -0.12 * s * s;
        const c = GREEN.palm[(f + s) % GREEN.palm.length];
        b.box(topX + Math.cos(a) * d, topY + 0.5 + droop, z + Math.sin(a) * d, 0.95, 0.28, 0.95, c, 'foliage', { ry: a, src });
      }
    }
    this.colliders.addBox(x - tw / 2, y, z - tw / 2, x + tw / 2, y + height, z + tw / 2, { src });
  }

  /**
   * Mesh every chunk, split into 128 m cells with two LOD levels (chamfered
   * blocks nearby, plain boxes beyond ~170 m) so a 1.5 km site stays cheap.
   */
  build(): Group {
    const root = new Group();
    root.name = 'angkor-world';
    const CELL = 128;
    for (const [name, b] of this.chunks) {
      const cells = new Map<string, VoxelBuilder>();
      for (const box of b.boxes) {
        const k = `${Math.floor(box.x / CELL)},${Math.floor(box.z / CELL)}`;
        let c = cells.get(k);
        if (!c) cells.set(k, (c = new VoxelBuilder()));
        c.boxes.push(box);
      }
      for (const [k, c] of cells) {
        const { min, max } = c.bounds();
        const centre = new Vector3((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
        const lod = new LOD();
        lod.name = `world:${name}:${k}`;
        lod.position.copy(centre);
        lod.addLevel(buildVoxelMesh(c, { quality: this.quality, offset: centre, name: `${name}:near` }), 0);
        lod.addLevel(buildVoxelMesh(c, { quality: 'low', offset: centre, name: `${name}:far`, castShadow: false }), 170);
        root.add(lod);
      }
    }
    return root;
  }

  get instanceCount(): number {
    let n = 0;
    for (const b of this.chunks.values()) n += b.boxes.length;
    return n;
  }
}
