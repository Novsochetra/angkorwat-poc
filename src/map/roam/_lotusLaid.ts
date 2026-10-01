import { CylinderGeometry, Group, Mesh, type BufferGeometry, type Camera } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LOTUS_BUD, LOTUS_STEM, LOTUS_TAIL } from '../../character/lotus';
import { BODY_UNIT_M } from '../../world/scale';
import { statueMaterial } from '../sacred/finish';
import { finishGeometry, OFFERING_FINISH as F, plainAttributes, revolve, type RevolvePoint } from '../sacred/offerings';
import { ROAM_SCALE } from './types';

/**
 * The lotus he laid before a shrine (roam/_lotus.ts): a closed pink bud on
 * its stem lying on the floor, the bud toward the shrine, made as the altar
 * offerings are (sacred/offerings.ts: smooth, in the statues' material, the
 * petals pale at the foot, pink, deep pink at the tip). As big as the one in
 * his hand (character/lotus.ts at his size on the map). Each stays where he
 * laid it for the visit; one mesh each (`MAX`, the oldest goes first).
 *
 * Its frame: the fist's middle (where he held it) at the origin, the stem
 * along +z to the bud, lying on y = 0 (the bud's belly on the floor, the
 * stem's end too: tipped up a little toward the bud).
 */

/** At most this many laid at once (the oldest is taken up again first). */
const MAX = 24;
/** Hidden past this far from the camera (m). */
const SEEN = 90;
/** Metres per body unit of him on the map. */
const M = BODY_UNIT_M * ROAM_SCALE;
/** The bud's widest radius and the stem's (m). */
const BUD_R = 0.6 * M;
const STEM_R = 0.21 * M;

let geometry: BufferGeometry | null = null;

/** The lotus's geometry (made once): the bud turned from its profile, the green cup, the stem. */
function lotusGeometry(): BufferGeometry {
  if (geometry) return geometry;
  const L = LOTUS_BUD * M;
  // (r, y) up the bud from its foot, each with its finish: the green cup, the pale foot, pink, the deep pink tip
  const prof: RevolvePoint[] = [
    { r: 0, y: 0, f: F.stem },
    { r: 0.34 * M, y: 0, f: F.stem },
    { r: 0.42 * M, y: 0.1 * L, f: F.stem, occ: 0.8 },
    { r: 0.46 * M, y: 0.13 * L, f: F.petalBase, occ: 0.75 },
    { r: 0.58 * M, y: 0.27 * L, f: F.petalBase },
    { r: BUD_R, y: 0.42 * L, f: F.petal },
    { r: 0.55 * M, y: 0.58 * L, f: F.petal },
    { r: 0.42 * M, y: 0.74 * L, f: F.petal },
    { r: 0.24 * M, y: 0.88 * L, f: F.petalTip },
    { r: 0.06 * M, y: 0.98 * L, f: F.petalTip },
    { r: 0, y: L, f: F.petalTip },
  ];
  // (a soft ridge where each of five outer petals' edges lie: the rim waved round the turn)
  const bud = revolve(prof, 20);
  bud.rotateX(Math.PI / 2);
  bud.translate(0, 0, LOTUS_STEM * M);
  const len = (LOTUS_STEM + LOTUS_TAIL) * M;
  const stem = finishGeometry(new CylinderGeometry(STEM_R, STEM_R * 1.1, len, 8, 1), F.stem);
  stem.rotateX(Math.PI / 2);
  stem.translate(0, 0, (LOTUS_STEM - LOTUS_TAIL) * M * 0.5);
  geometry = mergeGeometries([plainAttributes(bud), plainAttributes(stem)]);
  geometry.computeBoundingSphere();
  return geometry;
}

export interface LaidLotus {
  readonly object: Group;
  /** Lay one: the fist's middle at (x, z) on the floor `y`, the bud toward `yaw` (radians: toward (sin, cos)). */
  lay(x: number, y: number, z: number, yaw: number): void;
  /** How many lie within `r` m of (x, z) (the next goes beside them). */
  near(x: number, z: number, r: number): number;
  /** Take them all up (checks). */
  clear(): void;
  /** Each frame: hidden far off. */
  frame(camera: Camera): void;
  /** Where each lies (x, y, z, yaw), for checks. */
  readonly list: readonly { x: number; y: number; z: number; yaw: number }[];
}

export function createLaidLotus(): LaidLotus {
  const object = new Group();
  object.name = 'roam:lotus-laid';
  const meshes: Mesh[] = [];
  const list: { x: number; y: number; z: number; yaw: number }[] = [];
  let next = 0;
  return {
    object,
    list,
    lay(x, y, z, yaw) {
      let m = meshes[next];
      if (!m) {
        m = new Mesh(lotusGeometry(), statueMaterial());
        m.name = `lotus:laid-${next}`;
        m.castShadow = true;
        m.receiveShadow = true;
        meshes[next] = m;
        object.add(m);
      }
      // (lying on the floor: the bud's belly and the stem's end touch it, so it tips up a little toward the bud)
      const tip = Math.atan2(BUD_R - STEM_R, (LOTUS_STEM * 1.0 + LOTUS_TAIL) * M);
      m.position.set(x, y + STEM_R + Math.sin(tip) * LOTUS_TAIL * M, z);
      m.rotation.set(-tip, yaw, 0, 'YXZ');
      m.visible = true;
      list[next] = { x, y, z, yaw };
      next = (next + 1) % MAX;
    },
    near(x, z, r) {
      let n = 0;
      for (let i = 0; i < meshes.length; i++) if (meshes[i]?.visible && Math.hypot(list[i].x - x, list[i].z - z) < r) n++;
      return n;
    },
    clear() {
      for (const m of meshes) m.visible = false;
      list.length = 0;
      next = 0;
    },
    frame(camera) {
      const c = camera.position;
      for (let i = 0; i < meshes.length; i++) {
        const m = meshes[i];
        const l = list[i];
        if (!m || !l) continue;
        m.visible = Math.abs(l.x - c.x) + Math.abs(l.z - c.z) < SEEN * 1.4 && Math.hypot(l.x - c.x, l.y - c.y, l.z - c.z) < SEEN;
      }
    },
  };
}
