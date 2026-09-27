import { Mesh } from 'three';
import { buddhaMesh, buddhaStatue, BUDDHA_KINDS, KULEN_STONE, type BuddhaKindName } from './buddha';
import { addBody } from './_buddhaBody';
import { F, FIG } from './_buddhaFrame';
import { addHead } from './_buddhaHead';
import { addReclining, RECLINE } from './_buddhaReclining';
import { addThrone } from './_buddhaThrone';
import { dress, PALETTES, statueMaterial, type Palette } from './finish';
import type { Piece, PieceMaker } from './pieces';
import { meshSculpt, Sculpt } from './sculpt';

/**
 * Buddhas for the preview (sacred.html):
 *
 * - `buddha-<kind>` (gilt), `buddha-<kind>-<look>` (gilt, sandstone, bronze),
 *   `buddha-<kind>-far` (the far mesh); the face: add `&ty=0.8&dist=0.8`.
 * - The reclining Buddha of Phnom Kulen: `buddha-reclining` (as on the map:
 *   sandstone, gold leaf on the soles, the saffron sash), `-far`,
 *   `-gilt` / `-sandstone` / `-bronze`; 1.6 m long. Up close:
 *   `buddha-reclining-head`, `buddha-reclining-middle` and
 *   `buddha-reclining-feet` (the same statue moved so the head, his waist
 *   and hips, or the feet, is in the middle of the view).
 * - One part alone, for its sculptor: `buddha-part-head-pagoda`,
 *   `buddha-part-head-angkor`, `buddha-part-body-earth`,
 *   `buddha-part-body-meditate` (+ `-sash`), `buddha-part-throne-lotus`,
 *   `buddha-part-throne-naga`, `buddha-part-reclining`; `&cell=0.006` for a
 *   finer mesh (default 0.008 m; the fine zones `&fine=`, default 0.0035 m,
 *   as in the map), `&look=sandstone`.
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

/** The reclining Buddha, 1.6 m long (the map's is 10 m). */
const reclining = (finish: Palette, farOnly = false): Piece => {
  const length = 1.6;
  const object = buddhaStatue({ kind: 'reclining', look: finish, length, farOnly, hide: 1e9, near: 1e9, sync: true });
  const m = buddhaMesh(BUDDHA_KINDS.reclining, farOnly ? 'far' : 'near');
  const tris = (m.mesh.geometry.getIndex()!.count / 3) | 0;
  const bb = m.mesh.geometry.boundingBox!;
  const k = length / m.length;
  const dims = `x ${(bb.min.x * k).toFixed(2)}‥${(bb.max.x * k).toFixed(2)} · y ‥${(bb.max.y * k).toFixed(2)} · z ${(bb.min.z * k).toFixed(2)}‥${(bb.max.z * k).toFixed(2)} m (ref length ${m.length.toFixed(3)}, planned ${RECLINE.length.toFixed(3)})`;
  return { object, size: [length, m.height * k], note: `${tris} triangles · sculpt ${m.mesh.ms.toFixed(0)} ms · ${dims}` };
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
  if (kind === 'reclining') continue;
  PIECES[`buddha-${kind}`] = () => statue(kind, 'gilt');
  PIECES[`buddha-${kind}-far`] = () => statue(kind, 'gilt', true);
  for (const finish of ['gilt', 'sandstone', 'bronze'] as const) PIECES[`buddha-${kind}-${finish}`] = () => statue(kind, finish);
}
PIECES['buddha-reclining'] = () => reclining(KULEN_STONE);
PIECES['buddha-reclining-far'] = () => reclining(KULEN_STONE, true);
for (const [end, at] of [
  ['head', RECLINE.head],
  ['middle', RECLINE.hips - 0.1],
  ['feet', RECLINE.soles - 0.08],
] as const)
  PIECES[`buddha-reclining-${end}`] = () => {
    const p = reclining(KULEN_STONE);
    const k = 1.6 / RECLINE.length;
    p.object.position.x = -at * k;
    return { ...p, size: [0.45, 0.45] };
  };
for (const finish of ['gilt', 'sandstone', 'bronze'] as const) PIECES[`buddha-reclining-${finish}`] = () => reclining(PALETTES[finish]);
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
PIECES['buddha-part-reclining'] = () =>
  part(
    (s) => {
      addReclining(s, { head: 'pagoda', sash: true, leaf: true });
      return 0;
    },
    [RECLINE.length, 0.5],
  );
