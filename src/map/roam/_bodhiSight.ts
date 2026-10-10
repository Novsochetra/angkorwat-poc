import { Group, Raycaster, Vector3, type Object3D } from 'three';
import { buildLantern } from '../../character/parts/props';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { BODY_UNIT_M } from '../../world/scale';
import { addLamp, type Lamp } from '../sky/lampSlots';
import type { AddonEnv } from './_addons';

/**
 * What the bodhi's moments (roam/_bodhiTalk.ts, _bodhiPlant.ts) need round them:
 *
 * - **A clear view** (`clearSight`): the follow camera's place for the monk's moment and the blessing is picked
 *   among a few, the first with nothing between it and what it looks at — not the plants of the undergrowth (a big
 *   wild leaf right before the lens), a tree, a house (a ray against those parts' meshes; once, as the moment
 *   begins: the undergrowth holds only the plants near the camera, so it is quick).
 * - **His lantern set down** (`groundLantern`): after dark his lantern goes from his hand (his hands are for the
 *   sampeah) to the ground beside him, lit (a lamp of the map's slots, sky/lampSlots.ts: no new light), so the two
 *   of them and the sapling are not black shapes; he takes it up again after.
 */

/**
 * The parts whose meshes block the camera's view and that the walk map's solids do not hold (the follow camera's
 * `hardClearance` sees walls, houses, terraces): the plants, the trees, the foreground's leaves.
 */
const BLOCKERS = ['undergrowth', 'vegetation', 'foreground'] as const;

const ray = new Raycaster();
const _d = new Vector3();
const hits: import('three').Intersection[] = [];

/** The plants near the lens (quick to test: the undergrowth holds only those near the camera). */
const NEAR_BLOCKERS = ['undergrowth', 'foreground'] as const;

/** Nothing of the blocking parts (`which`) between `from` and `to` (up to `keep` m short of `to`). */
export function clearSight(env: AddonEnv, from: Vector3, to: Vector3, keep = 0.3, which: readonly string[] = BLOCKERS): boolean {
  _d.subVectors(to, from);
  const len = _d.length();
  if (len < 0.5) return true;
  ray.set(from, _d.divideScalar(len));
  ray.near = 0.4;
  ray.far = Math.max(0.5, len - keep);
  for (const p of env.parts) {
    if (!which.includes(p.name) || !p.object.visible) continue;
    hits.length = 0;
    ray.intersectObject(p.object as Object3D, true, hits);
    if (hits.length) return false;
  }
  return true;
}

const _a = new Vector3();
const _b = new Vector3();
const _r = new Vector3();

/**
 * Nothing in the way of a camera at `cam` looking at `focus` (m): not only on the line between them but across the
 * lower half of the picture, where a plant near the lens would stand — a ray from the focus to the camera against
 * every blocker, and three from a metre under the focus to low points at the lens (its lower middle and corners)
 * against the plants.
 */
export function clearView(env: AddonEnv, focus: Vector3, cam: Vector3): boolean {
  // (the trees on the line itself; the plants across the picture's lower half: every tree a ray costs, the plants little)
  if (!clearSight(env, focus, cam, 0.1)) return false;
  _r.subVectors(cam, focus).setY(0);
  if (_r.lengthSq() < 1e-6) _r.set(1, 0, 0);
  _r.normalize().set(-_r.z, 0, _r.x);
  // (three rays, from a metre under the focus: ≈ 0.7 ms each against the plants near the camera)
  _a.copy(focus).y -= 1;
  // (to the lens's lower middle and corners, low: about a metre over the ground at the camera, where a plant's leaves
  // would fill the bottom of the picture)
  for (const [side, down] of [[0, 2.0], [1.4, 2.0], [-1.4, 2.0]] as const) {
    _b.copy(cam).addScaledVector(_r, side);
    _b.y -= down;
    if (!clearSight(env, _a, _b, 0.1, NEAR_BLOCKERS)) return false;
  }
  return true;
}

/** His lantern on the ground, lit after dark (one for the page; shown while a bodhi moment needs it). */
export interface GroundLantern {
  /** Set down at (x, y, z) (feet: its foot on the ground), lit for the night (0 day ‥ 1 night); hidden in the day. */
  set(x: number, y: number, z: number, night: number, scale: number): void;
  hide(): void;
}

let made: GroundLantern | null = null;

/** The lantern, made the first time it is asked for (added to roaming's group). */
export function groundLantern(env: AddonEnv): GroundLantern {
  if (made) return made;
  const g = new Group();
  g.name = 'bodhi:lantern';
  const { frame, glass } = buildLantern();
  // (its frame's lowest point is 5.05 body units under the bail: it stands on that)
  g.add(buildVoxelMesh(frame, { castShadow: true, name: 'bodhi:lantern-frame' }));
  g.add(buildVoxelMesh(glass, { castShadow: false, name: 'bodhi:lantern-glass' }));
  g.visible = false;
  env.scene.add(g);
  const lamp: Lamp = addLamp({ kind: 'point', name: 'bodhi lantern', color: 0xffb347, distance: 14 });
  made = {
    set(x, y, z, night, scale) {
      if (night < 0.3) {
        this.hide();
        return;
      }
      const k = BODY_UNIT_M * scale;
      g.scale.setScalar(k);
      g.position.set(x, y + 5.05 * k, z);
      g.visible = true;
      lamp.position.set(x, y + 2.0 * k, z);
      // (a little under his lantern in hand at night, tools.ts LANTERN_CD × size² × (1 + 5 · night): it lights from below)
      lamp.intensity = 0.65 * scale * scale * (1 + 5 * night) * Math.min(1, (night - 0.3) / 0.25);
    },
    hide() {
      g.visible = false;
      lamp.intensity = 0;
    },
  };
  return made;
}
