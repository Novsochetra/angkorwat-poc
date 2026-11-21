import { Group } from 'three';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh, disposeVoxelMesh } from '../../voxel/VoxelMesh';
import { SURFACE, type HeightField } from '../heightfield';
import { PLOT_CORNERS } from './plot';

/**
 * His land's edge on the ground (build/plot.ts `PLOT_CORNERS`), shown while he
 * builds (roam/_build.ts: build mode, the build card): the way a Khmer builder
 * lays out a yard before the fence goes up — split-bamboo pegs knee high every
 * two metres or so, a coconut-fibre cord along them, the earth under it scraped
 * bare (a narrow brown line that reads from above and on the maps), and at each
 * corner a squared hardwood boundary post (បង្គោលព្រំ) with a strip of red krama
 * tied round its head. No bright line: wood, cord and cloth, lit as the land.
 *
 * Built once (≈ 900 blocks: the map's own `mapBark`, `mapRock` and `petal`
 * families, so no new shader; 3 draws while it shows, none hidden), the cord in short
 * lengths that follow the ground's steps. It rises out of the ground when it
 * shows and sinks back when it goes (`frame`).
 */

/** Pegs at most this far apart along a side (m). */
const PEG_EVERY = 2.2;
/** A peg: across, its top over the ground (m); the cord's height and thickness (m), its lengths at most (m). */
const PEG = { w: 0.1, h: 0.8 };
const CORD = { y: 0.55, t: 0.05, step: 1.1 };
/** The trodden line under the cord: its width, its top over the ground's (m; half of it sunk in the land). */
const TROD = { w: 0.3, up: 0.03 };
/** A corner post: across, its top (m); its cloth: how high under the top, how deep (m). */
const POST = { w: 0.2, h: 1.3, cloth: 0.2, clothH: 0.12 };
/** Colours: split bamboo (two tones, peg to peg), the cord, the hardwood post, the krama's red. */
const BAMBOO = [0xc9b07a, 0xb89a62] as const;
const CORD_C = 0x7a5a38;
/** Bare earth where the line was trodden and scraped (a warm brown, two tones). */
const TROD_C = [0x9a7448, 0x8e6a40] as const;
const POST_C = 0x4e3624;
const KRAMA = 0xb0342a;
/** How long it takes to rise or sink (s), how deep it starts (m). */
const RISE = { s: 0.45, depth: 1.0 };

export interface PlotEdge {
  readonly object: Group;
  /** Its blocks (checks). */
  readonly blocks: number;
  /** Show it (it rises) or not (it sinks, then hides). */
  show(on: boolean): void;
  readonly shown: boolean;
  /** Each frame: rising or sinking. */
  frame(dt: number): void;
}

/** A side of the cord: from (x0, z0) to (x1, z1). */
export interface EdgeSide {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
  /** The side his land is on (−1, 0, 1 along x and z): the cord's ground is read there, on the upper step. */
  readonly inX?: number;
  readonly inZ?: number;
}

/**
 * `quality`: the blocks' cut now (graphics.ts: plain on the low level); its meshes are made again when it changes.
 * `sides`: the cord's straight runs (roam/_buildLand.ts: the land map's outline, where a fence fits); none: his land's
 * corners (`PLOT_CORNERS`) as before.
 */
export function createPlotEdge(field: HeightField, quality: () => 'low' | 'medium', sides?: readonly EdgeSide[]): PlotEdge {
  const b = new VoxelBuilder();
  const ground = (x: number, z: number) => field.heightAt(x, z);
  // (nothing on the trail or in the stream that run through his land: the edge stops at their sides)
  const open = (x: number, z: number): boolean => {
    const c = field.index(x, z);
    if (c < 0 || field.trail[c] || field.water[c] > -1000) return false;
    const s = field.surface[c];
    return s !== SURFACE.path && s !== SURFACE.pad && s !== SURFACE.sand && s !== SURFACE.bed;
  };
  const n = PLOT_CORNERS.length;
  const list: readonly EdgeSide[] =
    sides ??
    PLOT_CORNERS.map(([x0, z0], i) => {
      const [x1, z1] = PLOT_CORNERS[(i + 1) % n];
      return { x0, z0, x1, z1 };
    });
  // The corner posts with their cloth: at each side's ends (once where two meet).
  const posts = new Map<string, [number, number]>();
  for (const sd of list)
    for (const [x, z] of [
      [sd.x0, sd.z0],
      [sd.x1, sd.z1],
    ] as const)
      posts.set(`${x.toFixed(2)},${z.toFixed(2)}`, [x, z]);
  // (the land map's runs lie beside ground a fence takes: no trail or stream under them)
  const given = !!sides;
  for (const [x, z] of posts.values()) {
    if (!given && !open(x, z)) continue;
    const g = ground(x, z);
    b.box(x, g + POST.h / 2 - 0.1, z, POST.w, POST.h + 0.2, POST.w, POST_C, 'mapBark');
    b.box(x, g + POST.h - POST.cloth, z, POST.w + 0.04, POST.clothH, POST.w + 0.04, KRAMA, 'petal');
    // (its loose end hanging down one side)
    b.box(x + POST.w / 2 + 0.02, g + POST.h - POST.cloth - 0.12, z, 0.02, 0.2, 0.06, KRAMA, 'petal');
  }
  // Each side: pegs between the corners, the cord from post to post.
  for (const sd of list) {
    const ax = sd.x0;
    const az = sd.z0;
    const bx = sd.x1;
    const bz = sd.z1;
    const len = Math.hypot(bx - ax, bz - az);
    const ry = Math.atan2(bx - ax, bz - az);
    const ix = (sd.inX ?? 0) * 0.13;
    const iz = (sd.inZ ?? 0) * 0.13;
    const pegs = Math.max(1, Math.ceil(len / PEG_EVERY));
    for (let k = 1; k < pegs; k++) {
      const u = k / pegs;
      const x = ax + (bx - ax) * u;
      const z = az + (bz - az) * u;
      if (!given && !open(x, z)) continue;
      b.box(x, ground(x + ix, z + iz) + PEG.h / 2 - 0.1, z, PEG.w, PEG.h + 0.2, PEG.w, BAMBOO[k % 2], 'mapBark', { ry });
    }
    const cords = Math.max(1, Math.ceil(len / CORD.step));
    const seg = len / cords;
    for (let k = 0; k < cords; k++) {
      const u = (k + 0.5) / cords;
      const x = ax + (bx - ax) * u;
      const z = az + (bz - az) * u;
      // (along the side: its length along the block's local z, turned to the side's way)
      if (!given && !open(x, z)) continue;
      const g = ground(x + ix, z + iz);
      b.box(x, g + CORD.y, z, CORD.t, CORD.t, seg + 0.02, CORD_C, 'mapBark', { ry });
      b.box(x, g, z, TROD.w, TROD.up * 2, seg + 0.02, TROD_C[k % 2], 'mapRock', { ry });
    }
  }
  const object = new Group();
  object.name = 'build:plotEdge';
  object.visible = false;
  let made: Group | null = null;
  let madeQ = '';
  const make = () => {
    const q = quality();
    if (q === madeQ) return;
    madeQ = q;
    if (made) {
      made.removeFromParent();
      disposeVoxelMesh(made);
    }
    made = buildVoxelMesh(b, { quality: q, name: 'build:plotEdge', castShadow: false, receiveShadow: true });
    object.add(made);
  };
  make();
  let want = false;
  let k = 0;
  return {
    object,
    blocks: b.boxes.length,
    show(on) {
      if (on && !want) make();
      want = on;
    },
    get shown() {
      return want;
    },
    frame(dt) {
      const to = want ? 1 : 0;
      if (k === to && object.visible === want) return;
      k = dt > 0 ? (to > k ? Math.min(1, k + dt / RISE.s) : Math.max(0, k - dt / RISE.s)) : to;
      object.visible = k > 0;
      // (eased: out of the ground quickly, settling)
      const e = 1 - (1 - k) * (1 - k);
      object.position.y = -RISE.depth * (1 - e);
    },
  };
}
