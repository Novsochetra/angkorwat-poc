import { Color, Euler, Matrix4, Quaternion, Vector3, type InstancedMesh, type Intersection, type Material, type Mesh, type Object3D, type Raycaster } from 'three';
import type { AABB, ColliderWorld } from '../game/world/Colliders';
import type { Area } from './area';
import type { SourceTrace } from './sourceTrace';

/** One thing the user clicked (or drew around) while reporting, described for the report. */
export interface Pick {
  kind: 'block' | 'mesh' | 'collider' | 'sky' | 'area';
  /** Clicked point, world space (metres). */
  point: Vector3;
  /** Short on-screen name, e.g. "gopura · stone block" or "Explorer · hair". */
  label: string;
  /** Report lines, in order. */
  facts: [string, string][];
  /** The code that created the picked block / mesh. */
  trace?: SourceTrace;
  /** World matrix of a unit cube around the picked block (for its outline). */
  block?: Matrix4;
  /** Colliders at the point, or the invisible one that was clicked. */
  colliders: AABB[];
  /** A box or loop drawn around several things (see area.ts). */
  area?: Area;
}

/**
 * What is under the ray: the nearest visible mesh (voxel instances resolve to
 * their block), plus the collider boxes there. A collider the ray meets well in
 * front of any visible surface is reported too, since that is what an
 * "invisible wall" bug looks like.
 */
export function pick(raycaster: Raycaster, roots: Object3D[], colliders?: ColliderWorld, anchor?: Vector3): Pick {
  const hits: Intersection[] = [];
  for (const root of roots)
    root.traverseVisible((o) => {
      if ((o as Mesh).isMesh) o.raycast(raycaster, hits);
    });
  hits.sort((a, b) => a.distance - b.distance);
  const hit = hits[0];
  const { origin: o, direction: d } = raycaster.ray;
  const wall = colliders?.pick(o.x, o.y, o.z, d.x, d.y, d.z, hit ? hit.distance : 3000);

  let p: Pick;
  if (hit) {
    p = meshPick(hit, colliders);
    // (bevels sit a little inside their collider, hence the margin)
    if (wall && wall.t < hit.distance - 0.25 && !p.colliders.includes(wall.box)) {
      p.colliders.unshift(wall.box);
      p.facts.push(['Note', `the click passes through an invisible collider ${(hit.distance - wall.t).toFixed(2)} m in front of this surface`]);
    }
  } else if (wall) {
    p = {
      kind: 'collider',
      point: o.clone().addScaledVector(d, wall.t),
      label: wall.box.noStand ? 'invisible blocker (water / bounds)' : 'invisible collider',
      facts: [],
      colliders: [wall.box],
    };
  } else {
    p = { kind: 'sky', point: o.clone().addScaledVector(d, 60), label: 'sky', facts: [['What', `nothing (sky) — ray direction ${vec(d)}`]], colliders: [] };
  }
  const from = [`${o.distanceTo(p.point).toFixed(1)} m from the camera`];
  if (anchor) from.push(`${anchor.distanceTo(p.point).toFixed(1)} m from the explorer`);
  p.facts.unshift(['Clicked point', `${vec(p.point)} m · ${from.join(' · ')}`]);
  return p;
}

const _local = new Matrix4();
const _pos = new Vector3();
const _rot = new Quaternion();
const _size = new Vector3();
const _euler = new Euler();
const _color = new Color();

function meshPick(hit: Intersection, colliders?: ColliderWorld): Pick {
  const d = describe(hit.object as Mesh, hit.instanceId);
  const p = hit.point;
  return { kind: d.kind, point: p.clone(), label: d.label, facts: d.facts, trace: d.trace, block: d.block, colliders: colliders?.boxesAt(p.x, p.y, p.z) ?? [] };
}

/** A mesh, or one voxel block of an instanced mesh, described for the report. */
export interface Described {
  kind: 'block' | 'mesh';
  label: string;
  facts: [string, string][];
  trace?: SourceTrace;
  block?: Matrix4;
  // Short parts, for area reports that list many blocks at once:
  /** Material family (`sandstone`) or mesh material name. */
  material: string;
  /** Block size, e.g. `0.40 × 0.30 × 0.60 m` ('' for plain meshes). */
  size: string;
  /** Block centre, e.g. `(1.00, 2.00, 3.00) m` ('' for plain meshes). */
  centre: string;
  at?: Vector3;
  /** Unit of `at`: `m`, or body units for the explorer. */
  unit: string;
  /** e.g. ``#12 of `gopura:sandstone` ``. */
  ref: string;
}

export function describe(mesh: Mesh, instanceId?: number): Described {
  const facts: [string, string][] = [];
  let label = mesh.name || mesh.parent?.name || 'mesh';
  const inst = mesh as InstancedMesh;
  if (inst.isInstancedMesh && instanceId !== undefined) {
    // A voxel block: its box lives in the instance matrix, relative to the
    // builder offset the mesh was built with (see buildVoxelMesh).
    const id = instanceId;
    inst.getMatrixAt(id, _local);
    const block = _local.clone().premultiply(inst.matrixWorld);
    _local.decompose(_pos, _rot, _size);
    const offset = inst.parent?.userData.voxelOffset as Vector3 | undefined;
    if (offset) _pos.add(offset);
    inst.getColorAt(id, _color);
    const trace = (inst.userData.voxelSources as (SourceTrace | undefined)[] | undefined)?.[id];
    const mat = (inst.material as Material).name.replace(/^voxel:/, '');
    const part = inst.parent?.name ?? '';
    _euler.setFromQuaternion(_rot);
    const turned = [_euler.x, _euler.y, _euler.z].some((a) => Math.abs(a) > 1e-4) ? ` · rotated ${vec(_euler, 0, 180 / Math.PI)}°` : '';
    const colour = `#${_color.getHexString()} (with baked shading)`;
    let unit = 'm';
    if (ancestor(inst, (a) => a.name === 'AngkorExplorer')) {
      const joint = ancestor(inst, (a) => a.name.startsWith('joint:'))?.name.slice('joint:'.length);
      label = `Explorer · ${part}`;
      unit = 'body units';
      facts.push(['Part', `slot \`${part}\` on joint \`${joint}\``]);
      facts.push(['Block', `${mat} · ${colour} · centre ${vec(_pos)} · size ${dims(_size)} (body units, part space)${turned}`]);
    } else {
      // World chunks are LODs named world:<chunk>:<cell> (WorldBuilder.build).
      const [, chunk, cell] = ancestor(inst, (a) => a.name.startsWith('world:'))?.name.split(':') ?? [];
      label = `${chunk ?? part} · ${mat} block`;
      facts.push(['Block', `${mat} · ${colour} · centre ${vec(_pos)} m · size ${dims(_size)} m${turned}`]);
      if (chunk) facts.push(['Chunk', `\`${chunk}\`, 128 m cell ${cell}`]);
    }
    const ref = `#${id} of \`${inst.name}\``;
    facts.push(['Instance', ref]);
    return { kind: 'block', label, facts, trace, block, material: mat, size: `${dims(_size)} ${unit}`, centre: `${vec(_pos)} ${unit}`, at: _pos.clone(), unit, ref };
  }
  // Plain meshes (ground, water) carry their trace in userData.source.
  const trace = ancestor(mesh, (a) => !!a.userData.source)?.userData.source as SourceTrace | undefined;
  const material = mesh.material as Material;
  const name = material.name || material.type;
  facts.push(['Mesh', `\`${label}\` · material \`${name}\``]);
  return { kind: 'mesh', label, facts, trace, material: name, size: '', centre: '', unit: 'm', ref: `\`${label}\`` };
}

function ancestor(o: Object3D | null, test: (o: Object3D) => boolean): Object3D | null {
  for (; o; o = o.parent) if (test(o)) return o;
  return null;
}

function vec(v: { x: number; y: number; z: number }, digits = 2, scale = 1): string {
  return `(${(v.x * scale).toFixed(digits)}, ${(v.y * scale).toFixed(digits)}, ${(v.z * scale).toFixed(digits)})`;
}

function dims(v: Vector3): string {
  return `${v.x.toFixed(2)} × ${v.y.toFixed(2)} × ${v.z.toFixed(2)}`;
}

/** Collider bounds for the report. */
export function describeBox(b: AABB): string {
  const size = new Vector3(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ);
  return `(${b.minX.toFixed(2)}, ${b.minY.toFixed(2)}, ${b.minZ.toFixed(2)}) → (${b.maxX.toFixed(2)}, ${b.maxY.toFixed(2)}, ${b.maxZ.toFixed(2)}) m, size ${dims(size)} m${b.noStand ? ', blocks but is never stood on' : ''}`;
}
