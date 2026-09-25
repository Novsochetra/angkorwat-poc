import { hash3, valueNoise3 } from '../../voxel/random';
import type { VoxelGrid } from '../../voxel/VoxelBuilder';
import { pick, type Tones } from './_prasat';

/**
 * The giant trees of Ta Prohm (silk-cotton and strangler figs), grown in the
 * temple's own 1 m grid so they can hold on to the stone: a tall trunk with
 * plank buttresses at its foot, roots that creep over whatever is under
 * them, climb low walls and pour down wall faces to the ground, limbs up to
 * a wide crown of big lumpy clumps, bright where the sun lands on top.
 * With a finer grid (half the cell) the roots are drawn in it: flat pale
 * strands pressed to the stone, tapering, branching as they pour down.
 */

/** Grey-brown bark of the silk-cotton trees (mostly in their own shade). */
export const PALE_BARK: Tones = [0x7c766d, 0x736d65, 0x857f75, 0x6b665e];
/** Roots: paler than the bark and the stone, so they read as flows over the walls. */
export const ROOT: Tones = [0x9a9286, 0x908879, 0xa39b8e, 0x877f73];
/** Crowns: dark green bodies… */
export const CANOPY: Tones = [0x3f6a26, 0x48762a, 0x375d21, 0x52802f];
/** …and bright yellow-green tops where the sun lands on a clump, as in the picture. */
export const CANOPY_TOP: Tones = [0x659632, 0x72a338, 0x7eae3e, 0x5c8a2d];

export interface GiantTreeOpts {
  /** Trunk column (its centre, or the cell west-north of it for an even width) and the row it stands on (cells). */
  i: number;
  k: number;
  j: number;
  /** Trunk height (cells), up to where the limbs part. */
  trunk: number;
  /** Trunk width (cells, default 3). */
  width?: number;
  /** Crown radius (cells). */
  crown: number;
  /** Crown centre off the trunk top (cells): lean it away from what it should not cover. */
  lean?: [number, number];
  roots?: number;
  /** Root length (cells). */
  reach?: number;
  /** Highest wall a root climbs over (cells). */
  climb?: number;
  /** Lowest row a root pours down to (the ground). */
  floor?: number;
  seed: number;
  /** May a root run into this column? (keeps them off the road) */
  allowed?: (i: number, k: number) => boolean;
  /** A grid of half the cell for the roots (same x and z origin). */
  fine?: VoxelGrid;
  /** Collects the 1 m cells the fine roots run through (`i,j,k`), so moss and bushes keep out. */
  marks?: Set<string>;
}

export function giantTree(g: VoxelGrid, o: GiantTreeOpts): void {
  const { seed } = o;
  const w = o.width ?? 3;
  const lo = -Math.floor((w - 1) / 2);
  const [li, lk] = o.lean ?? [0, 0];
  const floor = o.floor ?? 0;
  // Wood never replaces stone; leaves give way to it.
  const wood = (i: number, j: number, k: number, list: Tones, shade: number, s: number) => {
    const c = g.get(i, j, k);
    if (c && c.mat !== 'mapLeaf') return;
    g.put(i, j, k, { color: pick(list, hash3(i, j, k, s)), mat: 'mapBark', shade });
  };
  const solid = (i: number, j: number, k: number) => {
    const c = g.get(i, j, k);
    return c !== undefined && c.mat !== 'mapLeaf';
  };

  // Trunk, leaning half way towards the crown as it rises.
  const off = (y: number): [number, number] => {
    const t = (y - o.j) / Math.max(1, o.trunk);
    return [Math.round(li * t * 0.5), Math.round(lk * t * 0.5)];
  };
  for (let y = o.j; y < o.j + o.trunk; y++) {
    const [oi, ok] = off(y);
    const t = (y - o.j) / o.trunk;
    for (let di = lo; di < lo + w; di++)
      for (let dk = lo; dk < lo + w; dk++) {
        // (darker corners: a thick trunk reads round)
        const corner = w >= 3 && (di === lo || di === lo + w - 1) && (dk === lo || dk === lo + w - 1);
        wood(o.i + oi + di, y, o.k + ok + dk, PALE_BARK, (0.9 + 0.12 * t) * (corner ? 0.86 : 1), seed);
      }
  }
  // Plank buttresses: thin fins running out from the foot, lower as they go.
  const fins = 4 + Math.floor(hash3(seed, 1, 2, 3) * 3);
  const bh = Math.min(5, Math.max(2, Math.round(o.trunk * 0.2)));
  for (let n = 0; n < fins; n++) {
    const a = ((n + hash3(n, seed, 4, 3) * 0.5) / fins) * Math.PI * 2;
    const len = 2 + Math.floor(hash3(n, seed, 5, 3) * 3);
    for (let s = 1; s <= len + 1; s++) {
      const i = o.i + Math.round(Math.cos(a) * (w / 2 + s - 0.5));
      const k = o.k + Math.round(Math.sin(a) * (w / 2 + s - 0.5));
      if (o.allowed && !o.allowed(i, k)) break;
      const h = Math.max(1, Math.round(bh * (1 - (s - 1) / (len + 1))));
      // (a fin ends at an edge: the roots go on over it)
      if (o.j > floor && !solid(i, o.j - 1, k)) break;
      for (let y = o.j; y < o.j + h; y++) wood(i, y, k, PALE_BARK, 0.88, seed + 1);
    }
  }

  // Roots: creep outwards, climb low walls, pour down faces, crawl on at the
  // ground. The path is found on the 1 m grid.
  const roots = o.roots ?? 6;
  const reach = o.reach ?? 12;
  const climb = o.climb ?? 2;
  const fine = o.fine;
  // (fine cell of a 1 m cell's low corner: fine = offset + 2 × coarse)
  const [fx, fy, fz] = fine ? [0, 1, 2].map((a) => Math.round((g.origin[a] - fine.origin[a]) / fine.cell[a])) : [0, 0, 0];
  const coarse = (x: number, y: number, z: number) => solid(Math.floor((x - fx) / 2), Math.floor((y - fy) / 2), Math.floor((z - fz) / 2));
  const strand = (x: number, y: number, z: number, shade: number) => {
    if (fine && !fine.has(x, y, z)) fine.put(x, y, z, { color: pick(ROOT, hash3(x, y, z, seed + 13)), mat: 'mapBark', shade });
  };
  /** The face a root hangs on: towards (di, dk), one axis only. */
  const face = (i: number, j: number, k: number, di: number, dk: number): [number, number] => (di !== 0 && (dk === 0 || solid(i + di, j, k)) ? [di, 0] : [0, dk]);
  for (let r = 0; r < roots; r++) {
    const a = ((r + 0.3 + hash3(r, seed, 9, 1) * 0.5) / roots) * Math.PI * 2;
    let dx = Math.cos(a);
    let dz = Math.sin(a);
    let px = o.i + 0.5 + dx * (w / 2 + 0.5);
    let pz = o.k + 0.5 + dz * (w / 2 + 0.5);
    let y = o.j;
    let crawl = 3;
    const side = hash3(r, seed, 21, 1) < 0.5 ? 0 : 1;
    const shade = (s: number) => 0.97 - 0.1 * (s / reach);
    /** One cell of the root; `wall` = the face it hangs on, none when it lies on top of something. */
    const lay = (i: number, j: number, k: number, s: number, wall?: [number, number]) => {
      if (!fine) {
        wood(i, j, k, ROOT, shade(s), seed + 13);
        // Thick near the trunk: a second strand beside it.
        if (s < reach * 0.4) wood(i + Math.round(-dz), j, k + Math.round(dx), ROOT, shade(s) - 0.04, seed + 14);
        return;
      }
      o.marks?.add(`${i},${j},${k}`);
      // A metre wide near the trunk, half that further on.
      const both = s < reach * 0.35;
      const [x, yy, z] = [fx + 2 * i, fy + 2 * j, fz + 2 * k];
      if (!wall) {
        // Lying on top: the lower half of the cell, along the way it runs.
        const alongX = Math.abs(dx) >= Math.abs(dz);
        for (let p = 0; p < 2; p++)
          for (let q = 0; q < 2; q++) if (both || (alongX ? q : p) === side) strand(x + p, yy, z + q, shade(s));
        return;
      }
      // On a face: the half of the cell against it, full height (a thin one sways from side to side).
      const [wi, wk] = wall;
      const [ui, uk] = [Math.abs(wk), Math.abs(wi)];
      const [hi, hk] = [wi > 0 ? 1 : 0, wk > 0 ? 1 : 0];
      for (let t = 0; t < 2; t++) {
        const sway = (side + (valueNoise3(i * 0.7, (j * 2 + t) / 3, k * 0.7, seed + r) > 0.5 ? 1 : 0)) % 2;
        for (let q = 0; q < 2; q++) if (both || q === sway) strand(x + hi + ui * q, yy + t, z + hk + uk * q, shade(s));
      }
      // Now and then a thin branch runs off down the face, slanting.
      if (hash3(i, j, k, seed + 17) < 0.3) {
        const dir = hash3(i, j, k, seed + 18) < 0.5 ? -1 : 1;
        let [bx, by, bz] = [x + hi + ui * (dir > 0 ? 1 : 0), yy, z + hk + uk * (dir > 0 ? 1 : 0)];
        const len = 3 + Math.floor(hash3(i, j, k, seed + 19) * 6);
        for (let t = 0; t < len; t++) {
          // (down, and every other step sideways: always a face to the last one)
          if (t % 2 === 0) by--;
          else [bx, bz] = [bx + ui * dir, bz + uk * dir];
          if (by < fy + 2 * floor || coarse(bx, by, bz) || !coarse(bx + wi, by, bz + wk)) break;
          strand(bx, by, bz, shade(s) - 0.03);
        }
      }
    };
    for (let s = 0; s < reach; s++) {
      // A little wander.
      const wv = (hash3(r, s, seed, 11) - 0.5) * 0.6;
      const ndx = dx - dz * wv;
      const ndz = dz + dx * wv;
      const l = Math.hypot(ndx, ndz);
      dx = ndx / l;
      dz = ndz / l;
      const [ci, ck] = [Math.floor(px), Math.floor(pz)];
      const [ni, nk] = [Math.floor(px + dx), Math.floor(pz + dz)];
      px += dx;
      pz += dz;
      if (ni === ci && nk === ck) continue;
      if (o.allowed && !o.allowed(ni, nk)) break;
      let [ri, rk] = [ni, nk];
      if (solid(ni, y, nk)) {
        // A wall ahead: up its face, then on over the top.
        let h = 1;
        while (h <= climb && solid(ni, y + h, nk)) h++;
        if (h > climb) break;
        for (let yy = y + 1; yy <= y + h; yy++) lay(ci, yy, ck, s, face(ci, yy, ck, ni - ci, nk - ck));
        y += h;
      } else if (!solid(ni, y - 1, nk)) {
        // Over an edge: down the face to whatever is below, wandering a little along it.
        const [bi, bk] = [ci - ni, ck - nk];
        while (y > floor && !solid(ri, y - 1, rk)) {
          y--;
          // (hanging free under an overhang: step back in against the stone)
          if (!solid(ri + 1, y, rk) && !solid(ri - 1, y, rk) && !solid(ri, y, rk + 1) && !solid(ri, y, rk - 1))
            for (const [wi, wk] of [
              [bi, 0],
              [0, bk],
            ])
              if ((wi || wk) && !solid(ri + wi, y, rk + wk) && solid(ri + wi, y + 1, rk + wk)) {
                [ri, rk] = [ri + wi, rk + wk];
                break;
              }
          lay(ri, y, rk, s, face(ri, y, rk, bi, bk));
          const wv2 = hash3(ri, y, rk, seed + 5);
          if (bi * bk !== 0 || wv2 > 0.24) continue;
          const [si, sk] = wv2 < 0.12 ? [bk, -bi] : [-bk, bi];
          if (!solid(ri + si, y, rk + sk) && solid(ri + si + bi, y, rk + sk + bk)) {
            lay(ri, y, rk, s, face(ri, y, rk, bi, bk));
            [ri, rk] = [ri + si, rk + sk];
          }
        }
        [px, pz] = [px + ri - ni, pz + rk - nk];
      }
      lay(ri, y, rk, s);
      // On the ground a root runs on a little, then dives in.
      if (y <= floor && crawl-- <= 0) break;
    }
  }

  // Limbs from the trunk top out to the crown's clumps.
  const [ti, tk] = off(o.j + o.trunk - 1);
  const top: [number, number, number] = [o.i + ti, o.j + o.trunk - 1, o.k + tk];
  const R = o.crown;
  // (the crown swallows the top of the trunk)
  const cc: [number, number, number] = [o.i + li, o.j + o.trunk - 1, o.k + lk];
  const n = 4 + Math.floor(hash3(seed, 7, 7, 3) * 3);
  const clumps: [number, number, number, number][] = [[cc[0], cc[1] + 1, cc[2], R * 0.75]];
  for (let c = 0; c < n; c++) {
    const a = ((c + hash3(c, seed, 17, 3) * 0.6) / n) * Math.PI * 2;
    const d = R * (0.5 + hash3(c, seed, 18, 3) * 0.15);
    clumps.push([cc[0] + Math.cos(a) * d, cc[1] + Math.round((hash3(c, seed, 19, 3) - 0.45) * 5), cc[2] + Math.sin(a) * d, R * (0.45 + hash3(c, seed, 20, 3) * 0.17)]);
  }
  for (const [cx, cy, cz] of clumps.slice(1)) {
    const steps = Math.ceil(Math.max(Math.abs(cx - top[0]), Math.abs(cy - top[1]), Math.abs(cz - top[2])));
    let [lx, ly, lz] = top;
    for (let s = 0; s <= steps * 0.8; s++) {
      const t = s / steps;
      const [x, yy, z] = [Math.round(top[0] + (cx - top[0]) * t), Math.round(top[1] + (cy - 1 - top[1]) * t), Math.round(top[2] + (cz - top[2]) * t)];
      // (a joint where it steps on the slant: the limb stays one piece)
      if (x !== lx && (yy !== ly || z !== lz)) wood(x, ly, lz, PALE_BARK, 0.93, seed + 2);
      if (z !== lz && yy !== ly) wood(x, ly, z, PALE_BARK, 0.93, seed + 2);
      wood(x, yy, z, PALE_BARK, 0.95, seed + 2);
      if (t < 0.5) wood(x, yy - 1, z, PALE_BARK, 0.9, seed + 2);
      [lx, ly, lz] = [x, yy, z];
    }
  }

  // Crown: the union of the clumps, a little flattened and lumpy (only empty
  // cells); bright where a cell is open to the sky, dark below.
  const H = 0.7;
  const span = Math.ceil(R * 1.25) + 1;
  const low = Math.ceil(R * 0.55) + 3;
  const leafy = (x: number, yy: number, z: number) => {
    let q = Infinity;
    for (const [cx, cy, cz, r] of clumps) q = Math.min(q, Math.hypot((x - cx) / r, (yy - cy) / (r * H), (z - cz) / r));
    if (q > 1.3) return false;
    return q + (valueNoise3(x / 2.5, yy / 2, z / 2.5, seed + 19) - 0.5) * 0.5 + (hash3(x, yy, z, seed + 23) - 0.5) * 0.12 < 1;
  };
  for (let di = -span; di <= span; di++)
    for (let dk = -span; dk <= span; dk++)
      for (let dj = -low; dj <= low + 2; dj++) {
        const [x, yy, z] = [cc[0] + di, cc[1] + dj, cc[2] + dk];
        if (!leafy(x, yy, z) || g.has(x, yy, z)) continue;
        const up = Math.max(0, Math.min(1, (dj + low) / (2 * low)));
        // (sunlit in clumps, not all over: the crown keeps its depth)
        const sun = !leafy(x, yy + 1, z) && valueNoise3(x / 3, yy / 2, z / 3, seed + 37) > 0.4;
        const r = hash3(x, yy, z, seed + 29);
        g.put(x, yy, z, { color: pick(sun ? CANOPY_TOP : CANOPY, r), mat: 'mapLeaf', shade: (sun ? 0.95 + 0.1 * up : 0.66 + 0.34 * up) + (hash3(x, yy, z, seed + 31) - 0.5) * 0.08 });
      }
}
