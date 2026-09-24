import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  Quaternion,
  Vector3,
} from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { SURFACE, type HeightField } from '../heightfield';
import { GRASS, pick } from './_prasat';

/**
 * Plumbing shared by the River Gate, Ta Prohm and Phnom Kulen:
 * turned frames (build square to a road, then turn into place), lamps that
 * bloom at night, still pools, and grass over the parts of a pad left open.
 */

// ── Frames ──────────────────────────────────────────────────────────────────

/**
 * A local frame on the map: origin (ox, oy, oz), local +x turned by `theta`
 * about +y (three.js convention: local +x → (cos θ, 0, −sin θ)). Pieces are
 * built square in it and turned into place with {@link Frame.place}.
 */
export class Frame {
  readonly c: number;
  readonly s: number;

  constructor(
    readonly ox: number,
    readonly oy: number,
    readonly oz: number,
    readonly theta: number,
  ) {
    this.c = Math.cos(theta);
    this.s = Math.sin(theta);
  }

  /** Frame whose +x runs along the map direction (dx, dz). */
  static along(ox: number, oy: number, oz: number, dx: number, dz: number): Frame {
    return new Frame(ox, oy, oz, Math.atan2(-dz, dx));
  }

  wx(lx: number, lz: number): number {
    return this.ox + lx * this.c + lz * this.s;
  }

  wz(lx: number, lz: number): number {
    return this.oz - lx * this.s + lz * this.c;
  }

  world(lx: number, ly: number, lz: number): [number, number, number] {
    return [this.wx(lx, lz), this.oy + ly, this.wz(lx, lz)];
  }

  /** Map point → local (lx, lz). */
  local(x: number, z: number): [number, number] {
    const dx = x - this.ox;
    const dz = z - this.oz;
    return [dx * this.c - dz * this.s, dx * this.s + dz * this.c];
  }

  /** Copy every box of a local builder into the world builder, turned and moved. */
  place(src: VoxelBuilder, dst: VoxelBuilder): void {
    for (const b of src.boxes) {
      dst.boxes.push({ ...b, x: this.wx(b.x, b.z), y: this.oy + b.y, z: this.wz(b.x, b.z), ry: (b.ry ?? 0) + this.theta });
    }
  }
}

// ── Lamps ───────────────────────────────────────────────────────────────────

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Lamp flames of one landmark: small glowing boxes in one instanced mesh.
 * Unlit; by day a dim ember, at night the colour goes well above 1.0 in
 * linear light so the bloom picks it up. `update` also drives the part's one
 * PointLight, if it has one.
 */
export class Lamps {
  private readonly items: { p: [number, number, number]; s: [number, number, number]; ry: number; k: number }[] = [];
  readonly material = new MeshBasicMaterial({ color: 0xffffff });
  /** Flame colour (linear) at intensity 1. */
  readonly base = new Color(0xffa24a);
  /** Colour at night, if it changes (else `base`). */
  nightBase: Color | null = null;
  light: PointLight | null = null;
  private lightPower = 0;

  constructor(
    /** Intensity by day and at night (multiplies the base colour). */
    readonly day = 0.55,
    readonly night = 4.2,
  ) {}

  /** A lamp (world m); `k` scales its brightness. */
  add(p: [number, number, number], size = 0.5, k = 1): this {
    this.items.push({ p, s: [size, size * 1.2, size], ry: 0, k });
    return this;
  }

  /** A glowing strip (world m) of length `len` along `ry`. */
  strip(p: [number, number, number], len: number, width: number, height: number, ry: number, k = 1): this {
    this.items.push({ p, s: [len, height, width], ry, k });
    return this;
  }

  get count(): number {
    return this.items.length;
  }

  /** One warm PointLight for the whole landmark (only at night). */
  addLight(p: [number, number, number], power: number, distance: number): PointLight {
    const l = new PointLight(0xffa860, 0, distance, 2);
    l.position.set(...p);
    l.name = 'landmark lamp light';
    this.light = l;
    this.lightPower = power;
    return l;
  }

  build(name: string): InstancedMesh | null {
    if (!this.items.length) return null;
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), this.material, this.items.length);
    mesh.name = name;
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
      mesh.setColorAt(i, c.setScalar(it.k));
    });
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.update(0, 0);
    return mesh;
  }

  update(night: number, t: number): void {
    const n = smooth(0.1, 0.85, night);
    // A slow, soft breathing, never a flicker.
    const breathe = 1 + 0.05 * Math.sin(t * 0.9) * n;
    const k = (this.day + (this.night - this.day) * n) * breathe;
    this.material.color.copy(this.base);
    if (this.nightBase) this.material.color.lerp(this.nightBase, n);
    this.material.color.multiplyScalar(k);
    if (this.light) this.light.intensity = this.lightPower * n * breathe;
  }
}

// ── Pools ───────────────────────────────────────────────────────────────────

/** Still garden water and little falls: flat quads (world m), one mesh each. */
export class Pools {
  private readonly pos: number[] = [];
  private readonly falls: number[] = [];

  /** An axis-aligned pool surface at height y. */
  add(x0: number, z0: number, x1: number, z1: number, y: number): this {
    this.pos.push(x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0);
    return this;
  }

  /** A sheet of falling water facing +z at `z`, from `y1` down to `y0`. */
  fall(x0: number, x1: number, z: number, y0: number, y1: number): this {
    this.falls.push(x0, y1, z, x0, y0, z, x1, y0, z, x0, y1, z, x1, y0, z, x1, y1, z);
    return this;
  }

  build(name: string): Group | null {
    if (!this.pos.length && !this.falls.length) return null;
    const group = new Group();
    group.name = name;
    const quads = (pos: number[], color: number, roughness: number) => {
      if (!pos.length) return;
      const geo = new BufferGeometry();
      geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
      geo.computeVertexNormals();
      const mesh = new Mesh(geo, new MeshStandardMaterial({ color, roughness, metalness: 0 }));
      mesh.receiveShadow = true;
      group.add(mesh);
    };
    quads(this.pos, 0x3d8a8c, 0.14);
    quads(this.falls, 0xcfe6e0, 0.5);
    return group;
  }
}

// ── Grass over open pad ─────────────────────────────────────────────────────

/**
 * Cover the pad cells (2 m columns at the pad height) inside the rectangle
 * with a thin layer of grass, except where `built(x, z)` says something
 * stands. With `trees`, the covered cells also turn back into open grass
 * for the vegetation pass (surface grass, not occupied), so the jungle comes
 * up to the landmark instead of stopping at the pad's edge.
 */
export function grassOverPad(
  f: HeightField,
  b: VoxelBuilder,
  rect: { x0: number; z0: number; x1: number; z1: number; y: number },
  built: (x: number, z: number) => boolean,
  trees: (x: number, z: number) => boolean = () => false,
): number {
  const src = traceSource();
  let n = 0;
  for (let z = Math.floor(rect.z0 / 2) * 2; z < rect.z1; z += 2)
    for (let x = Math.floor(rect.x0 / 2) * 2; x < rect.x1; x += 2) {
      const cx = x + 1;
      const cz = z + 1;
      const c = f.index(cx, cz);
      if (c < 0 || f.surface[c] !== SURFACE.pad || f.height[c] !== rect.y || f.water[c] > -1000) continue;
      if (built(cx, cz)) continue;
      const r = hash3(x, 3, z, 71);
      b.box(cx, rect.y + 0.15, cz, 2, 0.3, 2, pick(GRASS, r), 'mapGrass', { src, shade: 0.94 + r * 0.1, open: 4 | 1 | 2 | 16 | 32 });
      n++;
      if (trees(cx, cz)) {
        f.surface[c] = SURFACE.grass;
        f.occupied[c] = 0;
      }
    }
  return n;
}
