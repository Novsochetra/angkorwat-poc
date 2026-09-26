import { Box3, BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry } from 'three';
import { SKY } from '../sky/palette';
import { gable, type GableSpec } from './gable';
import { gableTextures } from './kbach';
import type { PieceMaker } from './pieces';

/**
 * Gables for the preview (sacred.html):
 *
 * - `gable`: the village pagoda's gable (the panel and the relief Buddha,
 *   `&buddha=<height>`, 0 for none) under a mock of its stepped roof end
 *   (orange rows, gold barge boards in front), as on the map;
 * - `gable-flat`: the painting alone, unlit (`&tex=relief` for the relief
 *   map: red height, green roughness, blue metalness).
 *
 * `&night=1` lights the lamps (the preview has no sky of its own).
 */

const q = new URLSearchParams(location.search);
if (q.has('night')) SKY.night = Number(q.get('night'));

/** The pagoda's roof steps: 0.5 m in, 0.45 m up; the gable's foot 0.35 m under the upper roof's first row. */
const RUN = 0.5;
const RISE = 0.45;
const UPPER = 4.8;
const ROWS = 10;

/** The village pagoda's gable (as `_pagoda.ts` builds it): its foot at y = 0. */
export const PAGODA_GABLE: GableSpec = {
  steps: [[UPPER, 0.15], [4.5, 0.35], ...Array.from({ length: ROWS - 1 }, (_, j) => [UPPER - RUN * (j + 1), 0.35 + RISE * (j + 1)] as [number, number])],
  half: 4.3 + 0.2 / 0.9,
  foot: 0.15,
  apex: 0.35 + 0.9 * 4.3,
};

function mockRoof(): Group {
  const roof = new Group();
  const tile = new MeshStandardMaterial({ color: 0xd4632c, roughness: 0.8 });
  const green = new MeshStandardMaterial({ color: 0x2f7050, roughness: 0.8 });
  const gold = new MeshStandardMaterial({ color: 0xd9a93a, roughness: 0.45, metalness: 0.3 });
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: MeshStandardMaterial) => {
    const b = new Mesh(new BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
    b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    roof.add(b);
  };
  // (the panel stands 0.23 m behind the roof's end, as on the map)
  const zEnd = 0.23;
  for (const s of [-1, 1]) {
    // The skirt's last row under the upper roof's edge.
    box(s < 0 ? -5 : 4.5, 0.15, zEnd - 2, s < 0 ? -4.5 : 5, 0.65, zEnd, tile);
    box(s < 0 ? -5 : 4.5, 0.25, zEnd, s < 0 ? -4.5 : 5, 0.8, zEnd + 0.3, gold);
  }
  for (let j = 0; j < ROWS; j++) {
    const outer = UPPER - j * RUN;
    const inner = Math.max(0, outer - RUN);
    const y = 0.35 + j * RISE;
    const ridge = inner <= 1e-6;
    const spans: [number, number][] = ridge
      ? [[-outer, outer]]
      : [
          [-outer, -inner],
          [inner, outer],
        ];
    for (const [a, b] of spans) {
      box(a, y, zEnd - 2, b, y + RISE + 0.05, zEnd, j === 0 ? green : tile);
      box(a, y + 0.1, zEnd, b, y + RISE + 0.2, zEnd + 0.3, gold);
    }
  }
  // The beam and the gold line at the foot.
  box(-UPPER, -0.35, -0.3, UPPER, 0, 0.3, new MeshStandardMaterial({ color: 0xf0e9da, roughness: 0.9 }));
  box(-UPPER, -0.05, -0.03, UPPER, 0.15, 0.37, gold);
  return roof;
}

export const PIECES: Record<string, PieceMaker> = {
  gable: () => {
    const g = new Group();
    const t0 = performance.now();
    const panel = gable(PAGODA_GABLE, { x: 0, y: 0.6, z: 0, facing: 1 }, { sync: true, ...(q.has('buddha') ? { buddha: Number(q.get('buddha')) } : {}) });
    const ms = performance.now() - t0;
    const roof = mockRoof();
    roof.position.y = 0.6;
    g.add(panel, roof);
    const bud = panel.getObjectByName('buddha');
    const bb = bud ? new Box3().setFromObject(bud) : null;
    return { object: g, size: [10.5, 6], note: `built ${ms.toFixed(0)} ms` + (bb ? ` · Buddha z ${bb.min.z.toFixed(2)}‥${bb.max.z.toFixed(2)} m, ${(bb.max.x - bb.min.x).toFixed(2)} m wide` : '') };
  },
  'gable-flat': () => {
    const t0 = performance.now();
    const art = gableTextures({ width: 9.6, height: 4.8, half: PAGODA_GABLE.half, foot: PAGODA_GABLE.foot, apex: PAGODA_GABLE.apex });
    const ms = performance.now() - t0;
    const mesh = new Mesh(new PlaneGeometry(9.6, 4.8), new MeshBasicMaterial({ map: q.get('tex') === 'relief' ? art.relief : art.map, toneMapped: false }));
    mesh.position.y = 2.4;
    return { object: mesh, size: [9.6, 4.8], note: `paint ${ms.toFixed(0)} ms (first: ${art.ms.toFixed(0)} ms)` };
  },
};
