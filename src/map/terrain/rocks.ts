import { traceSource } from '../../feedback/sourceTrace';
import { hash3 } from '../../voxel/random';
import { CELL, SURFACE, type HeightField } from '../heightfield';
import type { Sink } from './columns';
import * as P from './palette';
import { FACE_X_MAX, FACE_X_MIN } from './views';

/**
 * Loose rock on the 2 m land: buttresses (rock masses standing against a
 * tall cliff, so its face is not one flat wall), boulders at the foot of the
 * cliffs, and a few outcrops on the slopes. Only on plain ground with
 * nothing built or flowing there; the cells they take are marked occupied,
 * so no tree grows through them.
 */
export function placeRocks(f: HeightField, sink: Sink, wet: Uint8Array): void {
  const srcButtress = traceSource();
  const srcBoulder = traceSource();
  const { nx, nz, height: H } = f;
  const plain = (c: number) => {
    const s = f.surface[c];
    return (s === SURFACE.grass || s === SURFACE.dirt || s === SURFACE.rock) && !f.occupied[c] && f.water[c] < -1000 && !wet[c] && f.lod[c] === 0;
  };
  const boulder = (x: number, y: number, z: number, i: number, k: number, seed: number, big: number) => {
    const b = sink(x, z, 0);
    const r = (n: number) => hash3(i, n, k, seed);
    const sx = (1.2 + r(1) * 1.3) * big;
    const sz = (1.2 + r(2) * 1.3) * big;
    const sy = (1 + r(3) * 1.2) * big;
    const ox = (r(4) - 0.5) * Math.max(0, CELL - sx * 0.5);
    const oz = (r(5) - 0.5) * Math.max(0, CELL - sz * 0.5);
    const mossy = r(6) < 0.35;
    b.box(x + ox, y + sy / 2 - 0.2, z + oz, sx, sy, sz, mossy ? P.pick(P.MOSS_ROCK, r(7)) : P.pick(P.BOULDER, r(7)), 'mapRock', { shade: 0.92 + r(8) * 0.12, src: srcBoulder });
    if (r(9) < 0.5) {
      // A smaller stone leaning on it.
      const s2 = 0.5 + r(10) * 0.3;
      b.box(x + ox + (r(11) - 0.5) * sx, y + sy * s2 * 0.5 - 0.1, z + oz + sz * 0.5, sx * s2, sy * s2, sz * s2, P.pick(P.BOULDER, r(12)), 'mapRock', { shade: 0.9 + r(13) * 0.1, src: srcBoulder });
    }
  };

  for (let k = 1; k < nz - 1; k++)
    for (let i = 1; i < nx - 1; i++) {
      const c = i + k * nx;
      if (!plain(c)) continue;
      const h = H[c];
      const [x, z] = f.cellCenter(i, k);
      // The cliff behind this cell, on a side some camera sees: north (its
      // south face), west (east face), east (west face).
      const riseN = H[c - nx] - h;
      const riseW = x - CELL / 2 < FACE_X_MAX ? H[c - 1] - h : 0;
      const riseE = x + CELL / 2 > FACE_X_MIN ? H[c + 1] - h : 0;
      const rise = Math.max(riseN, riseW, riseE);
      const r = hash3(i, h, k, 61);
      if (rise >= 5 * CELL && r < 0.075) {
        // Buttress: 1–3 cells along the face, a third to two thirds of its height.
        const alongX = riseN === rise;
        const dir = alongX ? [0, -1] : riseW === rise ? [-1, 0] : [1, 0];
        const n = 1 + Math.floor(hash3(i, 1, k, 62) * 3);
        let cells = 0;
        for (; cells < n; cells++) {
          const cc = alongX ? c + cells : c + cells * nx;
          const back = cc + dir[0] + dir[1] * nx;
          if ((alongX ? i + cells : k + cells) >= (alongX ? nx - 1 : nz - 1) || !plain(cc) || H[cc] !== h || H[back] - h < 3 * CELL) break;
        }
        if (cells === 0) continue;
        const b = sink(x, z, 0);
        const len = cells * CELL - 0.4;
        const d = 1.4 + hash3(i, 2, k, 62) * 1.6;
        const top = h + Math.round(rise * (0.3 + hash3(i, 3, k, 62) * 0.4));
        const mid = Math.min(top, h + 2 + Math.floor(hash3(i, 4, k, 62) * 3));
        // Footprint: against the face behind (dir), running along it from this cell.
        const [fx0, fx1, fz0, fz1] = alongX
          ? [x - CELL / 2 + 0.2, x - CELL / 2 + 0.2 + len, z - CELL / 2, z - CELL / 2 + d]
          : dir[0] < 0
            ? [x - CELL / 2, x - CELL / 2 + d, z - CELL / 2 + 0.2, z - CELL / 2 + 0.2 + len]
            : [x + CELL / 2 - d, x + CELL / 2, z - CELL / 2 + 0.2, z - CELL / 2 + 0.2 + len];
        b.span(fx0, h - 0.6, fz0, fx1, mid, fz1, P.pick(hash3(i, 5, k, 62) < 0.5 ? P.MOSS_ROCK : P.FOOT, hash3(i, 6, k, 62)), 'mapRock', { shade: 0.88, open: 1 | 2 | 16, src: srcButtress });
        if (top > mid) {
          const kind = [P.STRATA_KINDS.ochre, P.STRATA_KINDS.rust, P.STRATA_KINDS.pale][Math.floor(hash3(i, 7, k, 62) * 3)];
          // (a little narrower than the base, so the step between them shows)
          const inset = 0.25;
          const [ix0, ix1, iz0, iz1] = alongX ? [fx0 + inset, fx1 - inset, fz0, fz1 - inset] : dir[0] < 0 ? [fx0, fx1 - inset, fz0 + inset, fz1 - inset] : [fx0 + inset, fx1, fz0 + inset, fz1 - inset];
          b.span(ix0, mid, iz0, ix1, top, iz1, P.pick(kind, hash3(i, 8, k, 62)), 'mapRock', { shade: 0.96, open: 1 | 2 | 4 | 16, src: srcButtress });
          // Moss or grass on some tops.
          if (hash3(i, 9, k, 62) < 0.45)
            b.span(ix0 - 0.1, top, iz0, ix1 + 0.1, top + 0.5, iz1 + 0.1, P.pick(P.VINE, hash3(i, 10, k, 62)), 'mapGrass', { shade: 1, open: 1 | 2 | 4 | 16, src: srcButtress });
        }
        for (let a = 0; a < cells; a++) f.occupied[alongX ? c + a : c + a * nx] = 1;
      } else if (rise >= 3 * CELL && r > 0.86) {
        boulder(x, h, z, i, k, 63, 1.1);
        f.occupied[c] = 1;
      } else if (rise <= 0 && r > 0.985) {
        // An outcrop on a slope (the lip of a low step).
        const drop = h - Math.min(H[c + nx], H[c - 1], H[c + 1]);
        if (drop > 0 && drop <= 2 * CELL) {
          boulder(x, h, z, i, k, 64, 1.4);
          f.occupied[c] = 1;
        }
      }
    }
}
