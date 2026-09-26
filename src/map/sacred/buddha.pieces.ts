import { Mesh } from 'three';
import { buddhaMesh, buddhaStatue, BUDDHA_KINDS, type BuddhaKindName } from './buddha';
import { addBody } from './_buddhaBody';
import { F, FIG } from './_buddhaFrame';
import { addHead } from './_buddhaHead';
import { addThrone } from './_buddhaThrone';
import { dress, PALETTES, statueMaterial } from './finish';
import type { Piece, PieceMaker } from './pieces';
import { meshSculpt, Sculpt } from './sculpt';

/**
 * Buddhas for the preview (sacred.html):
 *
 * - `buddha-<kind>` (gilt), `buddha-<kind>-<look>` (gilt, sandstone, bronze),
 *   `buddha-<kind>-far` (the far mesh); the face: add `&ty=0.8&dist=0.8`.
 * - One part alone, for its sculptor: `buddha-part-head-pagoda`,
 *   `buddha-part-head-angkor`, `buddha-part-body-earth`,
 *   `buddha-part-body-meditate` (+ `-sash`), `buddha-part-throne-lotus`,
 *   `buddha-part-throne-naga`; `&cell=0.006` for a finer mesh (default
 *   0.008 m; the fine zones `&fine=`, default 0.0035 m, as in the map),
 *   `&look=sandstone`.
 */

const q = new URLSearchParams(location.search);
const cell = Number(q.get('cell') ?? 0.008);
const fineCell = Number(q.get('fine') ?? 0.0035);
const look = (q.get('look') ?? 'gilt') as keyof typeof PALETTES;

const statue = (kind: BuddhaKindName, finish: keyof typeof PALETTES, farOnly = false): Piece => {
  const height = 1.2;
  const object = buddhaStatue({ kind, look: finish, height, farOnly, hide: 1e9, near: 1e9, sync: true });
  const m = buddhaMesh(BUDDHA_KINDS[kind], farOnly ? 'far' : 'near');
  const tris = (m.mesh.geometry.getIndex()!.count / 3) | 0;
  return { object, size: [height * 0.8, height], note: `${tris} triangles · sculpt ${m.mesh.ms.toFixed(0)} ms` };
};

const part = (build: (s: Sculpt) => number, size: [number, number]): Piece => {
  const s = new Sculpt();
  const foot = build(s);
  const mesh = meshSculpt(s, { cell, fineCell });
  mesh.geometry.translate(0, foot, 0);
  const object = new Mesh(dress(mesh, PALETTES[look]), statueMaterial());
  const tris = (mesh.geometry.getIndex()!.count / 3) | 0;
  return { object, size, note: `${tris} triangles · sculpt ${mesh.ms.toFixed(0)} ms · cell ${cell} (fine zones ${fineCell}: ${s.fineZones.length})` };
};

export const PIECES: Record<string, PieceMaker> = {};
for (const kind of Object.keys(BUDDHA_KINDS) as BuddhaKindName[]) {
  PIECES[`buddha-${kind}`] = () => statue(kind, 'gilt');
  PIECES[`buddha-${kind}-far`] = () => statue(kind, 'gilt', true);
  for (const finish of ['gilt', 'sandstone', 'bronze'] as const) PIECES[`buddha-${kind}-${finish}`] = () => statue(kind, finish);
}
for (const style of ['pagoda', 'angkor'] as const)
  PIECES[`buddha-part-head-${style}`] = () =>
    part(
      (s) => {
        addHead(s, style);
        return -(FIG.neck[1] - 0.05);
      },
      [0.3, FIG.crown + 0.25 - FIG.neck[1] + 0.05],
    );
for (const mudra of ['earth', 'meditate'] as const)
  for (const sash of [false, true])
    PIECES[`buddha-part-body-${mudra}${sash ? '-sash' : ''}`] = () =>
      part(
        (s) => {
          addBody(s, { mudra, sash });
          return 0.02;
        },
        [0.8, 3 * F + 0.05],
      );
for (const throne of ['lotus', 'naga'] as const)
  PIECES[`buddha-part-throne-${throne}`] = () => part((s) => addThrone(s, throne), [0.9, throne === 'naga' ? 1.2 : 0.4]);
