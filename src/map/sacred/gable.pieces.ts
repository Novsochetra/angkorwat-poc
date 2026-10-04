import { Box3, BoxGeometry, Group, Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, Vector3, type BufferGeometry } from 'three';
import { SKY } from '../sky/palette';
import { statueMaterial } from './finish';
import { gable, type GableSpec } from './gable';
import { FIGURES, figureTextures, gableTextures, type GableFigure } from './kbach';
import { chovea, mergeNaga, nagaBody, nagaFan, nagaStats, rakeBoard, roofNaga, type FanKind, type NagaLook } from './naga';
import type { PieceMaker } from './pieces';
import { doorPediment, PEDIMENT } from '../village/_pagodaArt';

/**
 * Gables for the preview (sacred.html):
 *
 * - `gable`: the village pagoda's gable (`&figure=brahma` its four faces,
 *   the default; `buddha` the niche and relief Buddha, `&buddha=<height>`,
 *   0 for none) under a mock of its stepped roof end (terracotta rows, gold
 *   barge boards in front), as on the map;
 * - `gable-flat`: the painting alone, unlit (`&tex=relief` for the relief
 *   map: red height, green roughness, blue metalness; `&px=2048` sharper);
 *   `gable-figures` the figures' own painting (Brahma, the tep prânâm);
 * - `pediment`: the village pagoda's door pediment (Reahu and the moon);
 * - `naga-stair`, `naga-roof`: the naga of sacred/naga.ts (the stair's fan
 *   and body, `&look=stone|gilt`; a roof end's boards, fans and chovea);
 *   `naga-stair-far`, `naga-stair-coarse`, `naga-roof-far`: as the map
 *   shows them further off (_detail.ts).
 *
 * `&night=1` lights the lamps (the preview has no sky of its own).
 */

const q = new URLSearchParams(location.search);
if (q.has('night')) SKY.night = Number(q.get('night'));
/** The gable's figure (`&figure=buddha|brahma`; default: the village pagoda's). */
const FIGURE = (q.get('figure') ?? 'brahma') as GableFigure;

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

/** The roof's end over the gable, as on the map: terracotta rows (the eaves' row deeper red), the gilt naga (sacred/naga.ts), a beam under it all. */
function mockRoof(): Group {
  const roof = new Group();
  const tile = new MeshStandardMaterial({ color: 0xc8582a, roughness: 0.8 });
  const edge = new MeshStandardMaterial({ color: 0x9a3a22, roughness: 0.8 });
  const gold = new MeshStandardMaterial({ color: 0xd9a93a, roughness: 0.45, metalness: 0.3 });
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: MeshStandardMaterial) => {
    const b = new Mesh(new BoxGeometry(x1 - x0, y1 - y0, z1 - z0), m);
    b.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    roof.add(b);
  };
  // (the panel stands 0.23 m behind the roof's end, as on the map)
  const zEnd = 0.23;
  for (const s of [-1, 1]) box(s < 0 ? -5 : 4.5, 0.15, zEnd - 2, s < 0 ? -4.5 : 5, 0.65, zEnd, edge);
  for (let j = 0; j < ROWS; j++) {
    const outer = UPPER - j * RUN;
    const inner = Math.max(0, outer - RUN);
    const y = 0.35 + j * RISE;
    const spans: [number, number][] = inner <= 1e-6 ? [[-outer, outer]] : [
      [-outer, -inner],
      [inner, outer],
    ];
    for (const [a, b] of spans) box(a, y, zEnd - 2, b, y + RISE + 0.05, zEnd, j === 0 ? edge : tile);
  }
  // The beam and the gold line at the foot.
  box(-UPPER, -0.35, -0.3, UPPER, 0, 0.3, new MeshStandardMaterial({ color: 0xf0e9da, roughness: 0.9 }));
  box(-UPPER, -0.05, -0.03, UPPER, 0.15, 0.37, gold);
  // The naga: barge boards down the slopes, a five-headed hood at each eave, the chovea on the ridge's end.
  const slope = (a: number) => 0.35 + RISE + 0.1 + (UPPER - a) * (RISE / RUN);
  const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const naga = roofNaga({
    rakes: [-1, 1].map((s) => ({ from: V(s * (UPPER + 0.04), slope(UPPER + 0.04), zEnd + 0.02), to: V(0, slope(0), zEnd + 0.02), out: V(0, 0, 1) })),
    fans: [-1, 1].map((s) => ({ at: V(s * (UPPER + 0.18), 0.35 + 0.12, zEnd + 0.12), look: V(s, 0, 0.95).normalize(), height: 1.1 })),
    choveas: [{ at: V(0, slope(0) - 0.06, zEnd + 0.08), out: V(0, 0, 1), height: 1.75 }],
  });
  roof.add(naga);
  return roof;
}

/** A naga piece's geometry as a mesh in the statues' material. */
function nagaMesh(g: BufferGeometry, name: string): Mesh {
  const m = new Mesh(g, statueMaterial());
  m.name = name;
  return m;
}

/** The stair's naga (its fan of `kind`, its body with `radial` sides and a `step` as stairNaga makes its far levels; the near one as sacred/naga.ts makes a body). */
function stairPiece(kind: FanKind, detail?: { radial: number; step: number }) {
  const t0 = performance.now();
  const look = (q.get('look') ?? 'stone') as NagaLook;
  const g = new Group();
  g.add(nagaMesh(nagaFan(kind, look), 'naga fan'));
  const body = nagaBody([new Vector3(0, 0.2, -0.6), new Vector3(0, 0.25, -1.6), new Vector3(0, 0.75, -2.6), new Vector3(0, 1.25, -3.6)], 0.19, 0, look, detail);
  g.add(nagaMesh(body, 'naga body'));
  const ms = performance.now() - t0;
  const tri = nagaStats().map((s) => `${s.key} ${s.triangles} tris ${s.ms.toFixed(0)} ms`).join(', ');
  return { object: g, size: [2.2, 2.6] as [number, number], note: `built ${ms.toFixed(0)} ms · ${tri}` };
}

/** A roof end's naga (its fans of `kind`; `coarse` boards and chovea, as roofNaga's far level). */
function roofPiece(kind: FanKind, coarse: boolean) {
  const t0 = performance.now();
  const g = new Group();
  const s = 0.42;
  const fan = nagaFan(kind).clone().applyMatrix4(new Matrix4().makeRotationY(Math.PI / 2 - 0.5).scale(new Vector3(s, s, s)).setPosition(2.05, 0, 0.1));
  const fan2 = nagaFan(kind).clone().applyMatrix4(new Matrix4().makeRotationY(-Math.PI / 2 + 0.5).scale(new Vector3(s, s, s)).setPosition(-2.05, 0, 0.1));
  const out = new Vector3(0, 0, 1);
  const boards = [rakeBoard(new Vector3(1.95, 0.35, 0), new Vector3(0, 2.1, 0), out, 0.42, 0.12, 0.08, coarse), rakeBoard(new Vector3(-1.95, 0.35, 0), new Vector3(0, 2.1, 0), out, 0.42, 0.12, 0.08, coarse)];
  const ch = chovea(coarse).applyMatrix4(new Matrix4().makeRotationY(0).setPosition(0, 2.1, 0.06));
  g.add(nagaMesh(mergeNaga([fan, fan2, ...boards, ch]), 'roof naga'));
  const ms = performance.now() - t0;
  return { object: g, size: [4.6, 3.8] as [number, number], note: `built ${ms.toFixed(0)} ms · ${nagaStats().map((x) => `${x.key} ${x.triangles} tris ${x.ms.toFixed(0)} ms`).join(', ')}` };
}

export const PIECES: Record<string, PieceMaker> = {
  // The naga of the pagoda's stair (sacred/naga.ts): seven heads in a halo of flame leaves, and a length of its body (`&look=gilt|stone`).
  'naga-stair': () => stairPiece('stair'),
  'naga-stair-far': () => stairPiece('stairFar', { radial: 8, step: 0.25 }),
  'naga-stair-coarse': () => stairPiece('stairCoarse', { radial: 6, step: 0.6 }),
  // A roof's naga: the five-headed fan at a barge board's lower end, the board, the chovea on the ridge's end.
  'naga-roof': () => roofPiece('roof', false),
  'naga-roof-far': () => roofPiece('roofFar', true),
  gable: () => {
    const g = new Group();
    const t0 = performance.now();
    const panel = gable(PAGODA_GABLE, { x: 0, y: 0.6, z: 0, facing: 1 }, { sync: true, figure: FIGURE, ...(q.has('buddha') ? { buddha: Number(q.get('buddha')) } : {}) });
    const ms = performance.now() - t0;
    const roof = mockRoof();
    roof.position.y = 0.6;
    g.add(panel, roof);
    const bud = panel.getObjectByName('buddha');
    const bb = bud ? new Box3().setFromObject(bud) : null;
    return { object: g, size: [10.5, 6], note: `built ${ms.toFixed(0)} ms` + (bb ? ` · Buddha z ${bb.min.z.toFixed(2)}‥${bb.max.z.toFixed(2)} m, ${(bb.max.x - bb.min.x).toFixed(2)} m wide` : '') };
  },
  // The village pagoda's door pediment (village/_pagodaArt.ts): Reahu swallowing the moon.
  'pediment': () => {
    const t0 = performance.now();
    const m = doorPediment();
    m.rotation.y = Math.PI;
    const ms = performance.now() - t0;
    return { object: m, size: [PEDIMENT.w, PEDIMENT.h], note: `built ${ms.toFixed(0)} ms` };
  },
  'gable-figures': () => {
    const t0 = performance.now();
    const art = figureTextures(q.has('px') ? Number(q.get('px')) : 1024);
    const ms = performance.now() - t0;
    const mesh = new Mesh(new PlaneGeometry(FIGURES.w, FIGURES.h), new MeshBasicMaterial({ map: q.get('tex') === 'relief' ? art.relief : art.map, toneMapped: false, transparent: true }));
    mesh.position.y = FIGURES.h / 2;
    return { object: mesh, size: [FIGURES.w, FIGURES.h], note: `paint ${ms.toFixed(0)} ms (first: ${art.ms.toFixed(0)} ms)` };
  },
  'gable-flat': () => {
    const t0 = performance.now();
    const art = gableTextures({ width: 9.6, height: 4.8, half: PAGODA_GABLE.half, foot: PAGODA_GABLE.foot, apex: PAGODA_GABLE.apex, ...(FIGURE === 'buddha' ? {} : { figure: FIGURE }), px: q.has('px') ? Number(q.get('px')) : undefined });
    const ms = performance.now() - t0;
    const mesh = new Mesh(new PlaneGeometry(9.6, 4.8), new MeshBasicMaterial({ map: q.get('tex') === 'relief' ? art.relief : art.map, toneMapped: false }));
    mesh.position.y = 2.4;
    return { object: mesh, size: [9.6, 4.8], note: `paint ${ms.toFixed(0)} ms (first: ${art.ms.toFixed(0)} ms)` };
  },
};
