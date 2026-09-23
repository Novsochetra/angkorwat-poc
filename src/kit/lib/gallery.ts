import { hash3 } from '../../voxel/random';
import type { Surf, VoxelBuilder } from '../../voxel/VoxelBuilder';
import { BlockSet, masonry, type BlockStyle } from '../BlockSet';
import { SANDSTONE } from '../palette';
import { PieceBuilder } from '../PieceBuilder';
import { TEXEL } from '../shapes';
import { STONE_FINISH, type StoneFinish } from '../surface';
import type { KitPiece } from '../types';

/**
 * Angkor gallery façade — the wall of a temple gallery as the sheets draw it:
 * a moulded plinth, courses of 0.5 m sandstone, bays of windows filled with
 * lathe-turned stone balusters, pilasters between the bays, a projecting cornice
 * and a stepped roof. Built facing +Z with its front face at z = 0 and the wall
 * behind (z < 0), running along x from −length/2 to +length/2, standing on y = 0.
 * Used by the §19.1 usage example; a first step towards the §03 / §15 gallery kit.
 */
export interface FacadeOptions {
  length: number;
  finish: StoneFinish;
  seed: number;
  /** Bay width (a window + its piers), default 3 m. */
  bay?: number;
  /** Wall height to the cornice, default 5 m. */
  height?: number;
  /** Doorway instead of windows in the middle bay. */
  door?: boolean;
  /** Skip the pilaster at the left / right end (where the façade meets another). */
  openEnds?: boolean;
  /**
   * Depth of the gallery behind the wall (metres): adds its corbelled roof,
   * stepping up from the cornice to a ridge over the corridor. 0 = wall only.
   */
  gallery?: number;
}

/** Heights of the façade's parts (metres). */
export const FACADE = {
  plinth: 1.0,
  sill: 1.5,
  lintel: 3.25,
  cornice: 5.0,
  depth: 1.0,
  course: 0.25,
  window: 1.5,
} as const;

/** One lathe-turned baluster (⌀ 3 texels, rings of 5), bottom at y0, on the texel grid. */
export function baluster(b: VoxelBuilder, x: number, y0: number, y1: number, z: number, palette: readonly number[], surf: Surf, seed: number): void {
  const g = b.grid({ cell: TEXEL, origin: [x - 2.5 * TEXEL, y0, z - 2.5 * TEXEL], mat: 'sandstone', jitter: 0.03, ao: 0.25, seed, surf });
  const n = Math.round((y1 - y0) / TEXEL);
  // Ring rows: base, capital, and two turned bands between (the sheet's banded shafts).
  const rings = new Set([0, 1, n - 2, n - 1, Math.round(n * 0.33), Math.round(n * 0.33) + 1, Math.round(n * 0.66), Math.round(n * 0.66) + 1]);
  for (let j = 0; j < n; j++) {
    const r = rings.has(j) ? 2 : 1;
    for (let i = -r; i <= r; i++)
      for (let k = -r; k <= r; k++) {
        if (r === 2 && Math.abs(i) === 2 && Math.abs(k) === 2) continue; // round the rings
        g.set(i + 2, j, k + 2, palette[Math.floor(hash3(i, j, k, seed) * palette.length)]);
      }
  }
  g.commit();
}

/** Build one façade segment as a kit piece. */
export function galleryFacade(o: FacadeOptions): KitPiece {
  const p = new PieceBuilder();
  const set = new BlockSet(0.125);
  const f = o.finish;
  const bay = o.bay ?? 3;
  const H = o.height ?? FACADE.cornice;
  const L = o.length;
  const x0 = -L / 2;
  const x1 = L / 2;
  const D = FACADE.depth;
  const style: BlockStyle = { surf: f.surf };
  const lay = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, seed: number, length: [number, number] = [0.5, 1.0]) =>
    masonry(set, ax, ay, az, bx, by, bz, { length, course: FACADE.course * 2, depth: 0.5, axis: 'x', palette: f.palette, style, seed });

  // Plinth: projecting base, recessed band, projecting top course (Khmer base moulding).
  lay(x0, 0, -D, x1, 0.5, 0.25, o.seed);
  lay(x0, 0.5, -D, x1, 0.75, 0.125, o.seed + 1);
  lay(x0, 0.75, -D, x1, FACADE.plinth, 0.25, o.seed + 2);

  // Bays: windows (or a door in the middle bay) between piers.
  const bays = Math.max(1, Math.round(L / bay));
  const bw = L / bays;
  const win = Math.min(FACADE.window, bw - 1.0);
  const doorBay = o.door ? Math.floor(bays / 2) : -1;
  for (let i = 0; i < bays; i++) {
    const bx0 = x0 + i * bw;
    const cx = bx0 + bw / 2;
    const w = i === doorBay ? 1.8 : win;
    const a = cx - w / 2;
    const b = cx + w / 2;
    const top = i === doorBay ? FACADE.plinth + 3.4 : FACADE.lintel;
    const bottom = i === doorBay ? FACADE.plinth : FACADE.sill;
    // Piers either side of the opening, full height.
    lay(bx0, FACADE.plinth, -D, a, H, 0, o.seed + 10 + i);
    lay(b, FACADE.plinth, -D, bx0 + bw, H, 0, o.seed + 20 + i);
    // Under the sill and over the lintel.
    if (bottom > FACADE.plinth) lay(a, FACADE.plinth, -D, b, bottom, 0, o.seed + 30 + i);
    // The lintel: one long block across the opening, its face a little proud, then courses above.
    set.add(a, top, -D, b, top + 0.5, 0.0625, f.palette[i % f.palette.length], style);
    lay(a, top + 0.5, -D, b, H, 0, o.seed + 40 + i);
    if (i === doorBay) {
      // Door jambs standing proud of the wall, a dark passage behind.
      set.add(a - 0.375, FACADE.plinth, 0, a, top + 0.5, 0.125, f.palette[0], style);
      set.add(b, FACADE.plinth, 0, b + 0.375, top + 0.5, 0.125, f.palette[1 % f.palette.length], style);
      p.voxels.span(a, FACADE.plinth, -D, b, top, -D + 0.1, SANDSTONE.cavity[0], 'sandstone', { surf: f.surf });
    } else {
      // Sill ledge, balusters, and the dark gallery behind the window.
      set.add(a - 0.125, bottom - 0.125, 0, b + 0.125, bottom, 0.125, f.palette[(i + 2) % f.palette.length], style);
      const n = Math.max(3, Math.round(w / 0.3));
      for (let k = 0; k < n; k++) {
        const bxk = a + ((k + 0.5) * w) / n;
        baluster(p.voxels, Math.round(bxk / TEXEL) * TEXEL, bottom, top, -0.375, f.palette, f.surf, o.seed + i * 7 + k);
      }
      p.voxels.span(a, bottom, -D, b, top, -D + 0.1, SANDSTONE.cavity[1], 'sandstone', { surf: f.surf });
    }
    // Pilasters on the piers between bays (and at the ends unless the façade continues).
    const px = bx0 + bw;
    if (i < bays - 1) set.add(px - 0.25, FACADE.plinth, 0, px + 0.25, H, 0.125, f.palette[(i + 1) % f.palette.length], style);
  }
  if (!o.openEnds) {
    set.add(x0, FACADE.plinth, 0, x0 + 0.375, H, 0.125, f.palette[0], style);
    set.add(x1 - 0.375, FACADE.plinth, 0, x1, H, 0.125, f.palette[1 % f.palette.length], style);
  }

  // Cornice (two projecting courses) and a stepped roof behind it.
  lay(x0, H, -D, x1, H + 0.25, 0.25, o.seed + 50);
  lay(x0, H + 0.25, -D, x1, H + 0.5, 0.375, o.seed + 51);
  lay(x0, H + 0.5, -D, x1, H + 1.0, -0.25, o.seed + 52);
  lay(x0, H + 1.0, -D, x1, H + 1.5, -0.5, o.seed + 53);

  // The gallery roof behind: corbelled courses stepping in to a ridge (the sheets'
  // "stepped roof (layered tiers)"), over a corridor of the given depth.
  const G = o.gallery ?? 0;
  if (G > 0) {
    const back = -D - G;
    const mid = (back + -0.5) / 2;
    const steps = Math.max(2, Math.round(G / 1.2));
    for (let t = 0; t < steps; t++) {
      const inset = ((mid - back) * t) / steps;
      lay(x0, H + 1.5 + t * 0.5, back + inset, x1, H + 2.0 + t * 0.5, -0.5 - inset, o.seed + 60 + t, [0.75, 1.5]);
    }
    // Ridge course.
    lay(x0, H + 1.5 + steps * 0.5, mid - 0.375, x1, H + 1.875 + steps * 0.5, mid + 0.375, o.seed + 70, [1, 2]);
  }

  if (f.wear > 0) set.erode(f.wear, o.seed + 99);
  set.emit(p.voxels, { seed: o.seed });
  p.collider(x0, 0, -D, x1, H + 1.5, 0);
  p.collider(x0, 0, 0, x1, FACADE.plinth, 0.25);
  return p.done();
}

/** The finish of a §19.1 sample by name. */
export const finish = (name: keyof typeof STONE_FINISH): StoneFinish => STONE_FINISH[name];
