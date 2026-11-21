import { Group, Sphere, Vector3, type WebGLRenderer } from 'three';
import type { SourceTrace } from '../../feedback/sourceTrace';
import type { VoxelMaterialKey } from '../../voxel/materials';
import { hash3 } from '../../voxel/random';
import type { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { ANIM, Kit, kitUniforms, PERIOD, perPeriod } from '../festival/_kit';
import { GlowBlocks, glowMaterial, haloPoints, pointScale, type Halo } from '../road/glow';
import { trackSacred } from '../sacred/pending';
import type { MapFrame } from '../types';
import { kitFire } from './_sqKit';

/**
 * The stage's small kit (AWP-35, stage.ts): stone courses round a terrace, fire bowls, Khmer lamps (a small
 * Angkor tower over a lantern, as the spirit houses), and the glow they share — live fires in the fire bowls and
 * lamps' light that flickers, both in a festival kit of the stage's own (the square's `kitFire`: tongues that leap,
 * narrow and sway, `ANIM.flame`), gold edges that read as gilt by day and glow at night, soft halos. No light is
 * added here: the stage's one or two real lights are stage.ts's.
 */

export type Tones = readonly number[];
export const pick = (t: Tones, r: number): number => t[Math.min(t.length - 1, Math.floor(r * t.length))];

/** Flame colours (sRGB): the heart, the tongue. */
export const FLAME = { heart: 0xffa040, tongue: 0xff6a1c, lamp: 0xffa64a } as const;
/** Gilt edges (sRGB). */
export const GILT = 0xffc35a;

/** A lamp's light flickers at about 2 rad/s (whole turns in the kit's period). */
const FLICK = perPeriod(2.1);

/** What glows on the stage: flames and lamps' light (the stage's kit), gilt edges, halos. */
export class StageGlow {
  /** The fires and the lamps' light: a festival kit of the stage's own (one draw, as the flames' boxes were). */
  readonly kit = new Kit();
  readonly gold = new GlowBlocks();
  readonly halos: Halo[] = [];
  private readonly spots: Vector3[] = [];

  /** A lamp's glowing light (a box, world m): still, its glow flickering softly. */
  flame(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, phase: number): void {
    this.kit.box(x, y, z, sx, sy, sz, color, { glow: 0.42, anim: ANIM.flame, a: [0, phase, FLICK] });
    this.spots.push(new Vector3(x, y, z));
  }

  /** A live fire in a bowl whose rim is at (x, y, z), `s` its size (`kitFire`). */
  fire(x: number, y: number, z: number, s: number, seed: number): void {
    kitFire(this.kit, x, y, z, s, seed);
    this.spots.push(new Vector3(x, y + 0.5 * s, z));
  }

  halo(x: number, y: number, z: number, size: number, phase = 0): void {
    this.halos.push({ x, y, z, size, kind: 0, phase });
  }

  /** A gilt edge: a box by its corners (world m). */
  edge(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
    this.gold.add((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), 0, GILT, 0);
  }

  /** The meshes (the kit of fires and lamps, gilt, halos: three draws) and their brightness from the night. */
  build(renderer: WebGLRenderer, name: string): { object: Group; update(f: MapFrame): void } {
    const object = new Group();
    object.name = `${name}:glow`;
    const u = kitUniforms();
    const km = this.kit.build(`${name}:fires`, u);
    km.show(true);
    // (no shadow: it moves, and a fire casts none; culled on the sphere round all it holds, as it is posed in its shader)
    km.mesh.castShadow = false;
    const sphere = new Sphere().setFromPoints(this.spots.length ? this.spots : [new Vector3()]);
    sphere.radius += 2;
    km.mesh.geometry.boundingSphere = sphere;
    km.mesh.frustumCulled = true;
    // (gilt: no flicker, softer near the camera at night so a close look still shows the gold)
    const gilt = glowMaterial('lamp');
    gilt.material.name = `${name}:gilt`;
    gilt.uniforms.uPulse.value = 0;
    const gm = this.gold.mesh(gilt.material, `${name}:gilt`);
    const halo = haloPoints(this.halos);
    halo.points.name = `${name}:halos`;
    halo.uniforms.uColor.value.setRGB(1, 0.6, 0.28);
    object.add(km.mesh, gm, halo.points);
    let now = 0;
    let started = false;
    return {
      object,
      update(f) {
        if (!started) {
          started = true;
          now = f.t;
        } else now += f.dt;
        const n = f.night;
        const k = n * n * (3 - 2 * n);
        // (the kit's clock wraps at its period; its glow as the square's: a little over 1.0 at night, gold and orange)
        u.uTime.value = ((now % PERIOD) + PERIOD) % PERIOD;
        u.uNight.value = n;
        u.uGlow.value = 0.3 + 3.2 * n * n;
        gilt.uniforms.uTime.value = f.t;
        // (gilt lines that read as gold at night, a soft bloom, never a white-hot rim round the board)
        gilt.uniforms.uLevel.value = 0.62 + k * 0.75;
        gilt.uniforms.uNearLevel.value = 1;
        halo.uniforms.uTime.value = f.t;
        halo.uniforms.uScale.value = pointScale(renderer, f.camera);
        halo.uniforms.uLamp.value = k * k * 1.2;
      },
    };
  }
}

/** Boxes in world metres with one trace (`traceSource` once per builder function: BRIEF "Voxels"). */
export class Mason2 {
  constructor(
    readonly b: VoxelBuilder,
    readonly src: SourceTrace | undefined,
  ) {}
  span(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: number, mat: VoxelMaterialKey = 'mapStone', shade = 1): void {
    this.b.span(x0, y0, z0, x1, y1, z1, color, mat, { src: this.src, shade });
  }
}

/**
 * One course of stones round a rectangle (a terrace's moulding): from `y0` to `y1`, its face `out` m outside the
 * rectangle's edges, `deep` m into it, stones about `len` m long in close tones.
 */
export function course(m: Mason2, r: { x0: number; x1: number; z0: number; z1: number }, y0: number, y1: number, out: number, tones: Tones, len: number, seed: number, deep = 0.6, shade = 1): void {
  const X0 = r.x0 - out;
  const X1 = r.x1 + out;
  const Z0 = r.z0 - out;
  const Z1 = r.z1 + out;
  const run = (a0: number, a1: number, place: (p: number, q: number, c: number) => void, s: number) => {
    const n = Math.max(1, Math.round((a1 - a0) / len));
    for (let i = 0; i < n; i++) {
      const p = a0 + ((a1 - a0) * i) / n;
      const q = a0 + ((a1 - a0) * (i + 1)) / n;
      place(p, q, pick(tones, hash3(i, s, Math.round(y0 * 10), seed)));
    }
  };
  run(X0, X1, (p, q, c) => m.span(p, y0, Z1 - deep, q, y1, Z1, c, 'mapStone', shade), 1);
  run(X0, X1, (p, q, c) => m.span(p, y0, Z0, q, y1, Z0 + deep, c, 'mapStone', shade), 2);
  run(Z0 + deep, Z1 - deep, (p, q, c) => m.span(X0, y0, p, X0 + deep, y1, q, c, 'mapStone', shade), 3);
  run(Z0 + deep, Z1 - deep, (p, q, c) => m.span(X1 - deep, y0, p, X1, y1, q, c, 'mapStone', shade), 4);
}

const BRONZE: Tones = [0x5c4430, 0x523c2a, 0x664c36];

/**
 * A fire bowl on a short stone stem (y: the floor it stands on): a bronze bowl with a live fire in it (tongues that
 * leap and sway, in the stage's kit). `big`: the braziers before the board.
 */
export function fireBowl(m: Mason2, glow: StageGlow, x: number, y: number, z: number, stone: Tones, big = false, phase = 0): void {
  const s = big ? 1.35 : 1;
  m.span(x - 0.26 * s, y, z - 0.26 * s, x + 0.26 * s, y + 0.12 * s, z + 0.26 * s, pick(stone, 0.7), 'mapStone', 0.95);
  m.span(x - 0.13 * s, y + 0.12 * s, z - 0.13 * s, x + 0.13 * s, y + 0.62 * s, z + 0.13 * s, pick(stone, 0.2));
  m.span(x - 0.2 * s, y + 0.62 * s, z - 0.2 * s, x + 0.2 * s, y + 0.7 * s, z + 0.2 * s, pick(stone, 0.5), 'mapStone', 1.05);
  m.span(x - 0.3 * s, y + 0.7 * s, z - 0.3 * s, x + 0.3 * s, y + 0.86 * s, z + 0.3 * s, pick(BRONZE, 0.3), 'mapStone', 0.9);
  m.span(x - 0.36 * s, y + 0.86 * s, z - 0.36 * s, x + 0.36 * s, y + 0.96 * s, z + 0.36 * s, pick(BRONZE, 0.8), 'mapStone', 0.95);
  const fy = y + 0.96 * s;
  // (a live fire: tongues leaping out of the bowl, `kitFire`)
  glow.fire(x, fy - 0.02 * s, z, 1.05 * s, Math.round(phase * 100));
  glow.halo(x, fy + 0.45 * s, z, big ? 3.6 : 2.6, phase);
}

/**
 * A Khmer lamp (y: its floor): a stone post with a lantern chamber (its light seen between four slim posts)
 * under a small Angkor tower — a cross-plan base, tiers drawing in, a lotus bud and a gilt tip (as the map's
 * spirit houses: hamlet/village `spiritHouse`), never a Japanese stone lantern. About 3.4 m tall.
 */
export function khmerLamp(m: Mason2, glow: StageGlow, x: number, y: number, z: number, stone: Tones, light: Tones, phase = 0): void {
  const cross = (w: number, y0: number, y1: number, c: number, mat: VoxelMaterialKey = 'mapStone', sh = 1) => {
    m.span(x - w / 2, y0, z - w * 0.36, x + w / 2, y1, z + w * 0.36, c, mat, sh);
    m.span(x - w * 0.36, y0, z - w / 2, x + w * 0.36, y1, z + w / 2, c, mat, sh);
  };
  cross(0.8, y, y + 0.3, pick(stone, 0.6), 'mapStone', 0.95);
  cross(0.62, y + 0.3, y + 0.42, pick(light, 0.3));
  m.span(x - 0.18, y + 0.42, z - 0.18, x + 0.18, y + 1.55, z + 0.18, pick(stone, 0.3));
  cross(0.7, y + 1.55, y + 1.68, pick(light, 0.6), 'mapStone', 1.04);
  // The chamber: four posts round the light.
  for (const [dx, dz] of [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ])
    m.span(x + dx * 0.26 - 0.06, y + 1.68, z + dz * 0.26 - 0.06, x + dx * 0.26 + 0.06, y + 2.28, z + dz * 0.26 + 0.06, pick(stone, 0.5));
  glow.flame(x, y + 1.98, z, 0.4, 0.52, 0.4, FLAME.lamp, phase);
  glow.halo(x, y + 1.98, z, 2.4, phase);
  cross(0.78, y + 2.28, y + 2.4, pick(light, 0.2), 'mapStone', 1.05);
  // The tower: tiers drawing in, antefixes at the lower ones' corners, the lotus bud, a gilt tip.
  let ty = y + 2.4;
  const tiers: [number, number][] = [
    [0.62, 0.2],
    [0.5, 0.18],
    [0.38, 0.17],
    [0.27, 0.15],
  ];
  tiers.forEach(([w, h], k) => {
    cross(w, ty, ty + h, pick(k % 2 ? light : stone, 0.4), 'mapStone', 1 + k * 0.03);
    if (k < 2)
      for (const [dx, dz] of [
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
      ])
        m.span(x + dx * w * 0.42 - 0.04, ty + h, z + dz * w * 0.42 - 0.04, x + dx * w * 0.42 + 0.04, ty + h + 0.12, z + dz * w * 0.42 + 0.04, pick(light, 0.8));
    ty += h;
  });
  m.span(x - 0.1, ty, z - 0.1, x + 0.1, ty + 0.2, z + 0.1, pick(light, 0.5));
  m.span(x - 0.05, ty + 0.2, z - 0.05, x + 0.05, ty + 0.36, z + 0.05, 0xe0b040, 'brass', 1.05);
}

/**
 * Work that can wait until after the build (painting the carved kbach: ≈ 0.1–0.2 s of canvas work), off the
 * build's own time; shots wait for it (sacred/pending.ts).
 */
export function later(fn: () => void): void {
  void trackSacred(
    new Promise<void>((done) =>
      setTimeout(() => {
        try {
          fn();
        } catch (e) {
          console.error('[map] nye stage: painting failed', e);
        }
        done();
      }, 30),
    ),
  );
}
