import {
  AdditiveBlending,
  Color,
  Euler,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  Sphere,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
  type Material,
  type Object3D,
  type Points,
} from 'three';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { hazeUniforms } from '../sky/haze';

/**
 * The New Year venues seen from far off, on the low graphics level (AWP-35; a phone's overview at the finale must stay
 * within the budget for a phone, BRIEF "Budgets": 520 draws): past `FAR_ON` m from a venue its many meshes (blocks by
 * family, kits, glows, lamps, the board, the naga…) give way to two things built from them once, here:
 *
 * - **its blocks**, one voxel mesh of one family: every block of the venue's voxel meshes and every box of its kits
 *   (cloth, blossom, flags) at least `MIN_BLOCK` m in some way, turned and coloured as built (one draw a venue);
 * - **its lights**, in one additive draw for every venue (`FarLights`): a soft glowing point for every flame, lamp,
 *   bulb, lantern, gilt edge and halo (read back from the built meshes), never smaller than ≈ 2 px nor bigger than ≈ 12,
 *   and what a caller adds (the ring of light, the board's frame and figures: `FarCollector.light`).
 *
 * The searchlights and the fireworks stay as they are (the event's look from afar). Back within `FAR_OFF` m the venue's
 * own meshes come back. Built only on low (memory: a second copy of the blocks); never by day's light alone: the lights
 * shine only at night.
 */

/**
 * A venue goes to its far look past this distance (m), and back within `FAR_OFF`: past it the board's figures are a
 * few pixels (the overview is ≈ 590 m from Kulen's square, ≈ 430 m from the lake's).
 */
export const FAR_ON = 340;
export const FAR_OFF = 310;
/** The smallest block the far look keeps (its largest side, m): balusters, bulbs and small things go. */
const MIN_BLOCK = 0.3;
/** A light's size on the screen (as NDC: 2 is the picture's height): at least, at most. */
const LIGHT_MIN = 0.0065;
const LIGHT_MAX = 0.034;

const _m = new Matrix4();
const _w = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3();
const _e = new Euler();
const _c = new Color();
const _c2 = new Color();

/** What a venue's far look is made of, gathered from its built meshes. */
export class FarCollector {
  readonly blocks = new VoxelBuilder();
  /** x, y, z, size (m), r, g, b (linear), venue + 2 × kind (0 a point, 1 a soft dome). */
  readonly lights: number[] = [];

  constructor(readonly venue: number) {}

  /** A light at (x, y, z), `size` m across, colour (sRGB) × `level`. */
  light(x: number, y: number, z: number, size: number, color: number, level = 1): void {
    _c.setHex(color).multiplyScalar(level);
    this.lights.push(x, y, z, size, _c.r, _c.g, _c.b, this.venue);
  }

  /** A large soft glow of lit air (not limited on the screen). */
  dome(x: number, y: number, z: number, size: number, color: number, level: number): void {
    _c.setHex(color).multiplyScalar(level);
    this.lights.push(x, y, z, size, _c.r, _c.g, _c.b, this.venue + 2);
  }

  private linear(x: number, y: number, z: number, size: number, r: number, g: number, b: number): void {
    this.lights.push(x, y, z, size, r, g, b, this.venue);
  }

  /**
   * Everything under `object` (its world matrices updated): voxel meshes and kit boxes → blocks; unlit glowing boxes,
   * kits' glowing boxes, halos → lights. `skip`: objects left out (the searchlights, which stay).
   */
  gather(object: Object3D, skip: readonly Object3D[] = []): void {
    object.updateMatrixWorld(true);
    const skipped = new Set(skip);
    const walk = (o: Object3D) => {
      if (skipped.has(o)) return;
      this.one(o);
      for (const c of o.children) walk(c);
    };
    walk(object);
  }

  private one(o: Object3D): void {
    const mesh = o as InstancedMesh;
    const geo = (o as Mesh).geometry as BufferGeometry | undefined;
    if (!geo) return;
    if (mesh.isInstancedMesh && o.userData.voxelShape) return this.voxels(mesh);
    if (mesh.isInstancedMesh && (mesh.material as Material).type === 'MeshBasicMaterial') return this.glowing(mesh);
    if (geo.getAttribute('iPos')) return this.kit(geo as InstancedBufferGeometry);
    if (geo.getAttribute('gPos')) return this.halos(geo, 'gPos', 'gCol', (i, a) => a[i * 4 + 0] < 0.5 && geo.getAttribute('gPos').array[i * 4 + 3] === 0, 0.45);
    if (geo.getAttribute('sPos')) return this.halos(geo, 'sPos', 'sCol', (i, a) => a[i * 4 + 3] < 0.5, 0.45);
    if ((o as Points).isPoints && geo.getAttribute('aSize')) {
      const p = geo.getAttribute('position').array;
      const s = geo.getAttribute('aSize').array;
      for (let i = 0; i < s.length; i++) this.light(p[i * 3], p[i * 3 + 1], p[i * 3 + 2], s[i] * 0.45, 0xffa050, 0.9);
    }
  }

  /** A voxel mesh's blocks (instance matrices in the world, colours as drawn). */
  private voxels(mesh: InstancedMesh): void {
    const col = mesh.instanceColor?.array;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, _m);
      _w.multiplyMatrices(mesh.matrixWorld, _m).decompose(_p, _q, _s);
      if (Math.max(_s.x, _s.y, _s.z) < MIN_BLOCK) continue;
      _e.setFromQuaternion(_q, 'XYZ');
      if (col) _c.setRGB(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]);
      else _c.setRGB(0.5, 0.45, 0.4);
      this.blocks.box(_p.x, _p.y, _p.z, _s.x, _s.y, _s.z, _c.getHex(), 'mapStone', { rx: _e.x || undefined, ry: _e.y || undefined, rz: _e.z || undefined });
    }
  }

  /** Unlit glowing boxes (flames, bulbs, lanterns, gilt edges): a light each, long edges a row of them. */
  private glowing(mesh: InstancedMesh): void {
    const col = mesh.instanceColor?.array;
    const tint = (mesh.material as MeshBasicMaterial).color;
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, _m);
      _w.multiplyMatrices(mesh.matrixWorld, _m).decompose(_p, _q, _s);
      if (col) _c.setRGB(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]);
      else _c.setRGB(1, 1, 1);
      _c.multiply(tint);
      // (the hue, at a lamp's brightness: what the night makes of it is the far look's own level)
      const peak = Math.max(_c.r, _c.g, _c.b, 1e-4);
      _c.multiplyScalar(1.6 / peak);
      const big = Math.max(_s.x, _s.y, _s.z);
      const small = Math.min(_s.x, _s.y, _s.z);
      if (big > 1.2 && small < 0.35) {
        // (a gilt edge or a glow strip: points along it)
        const along = new Vector3(_s.x === big ? 1 : 0, _s.y === big ? 1 : 0, _s.z === big ? 1 : 0).applyQuaternion(_q);
        const n = Math.ceil(big / 0.9);
        for (let k = 0; k < n; k++) {
          const t = ((k + 0.5) / n - 0.5) * big;
          this.linear(_p.x + along.x * t, _p.y + along.y * t, _p.z + along.z * t, 0.5, _c.r * 0.7, _c.g * 0.7, _c.b * 0.7);
        }
      } else this.linear(_p.x, _p.y, _p.z, big < 0.2 ? 0.45 : Math.min(2.4, big * 2.4), _c.r, _c.g, _c.b);
    }
  }

  /** A festival kit's boxes (rig 0, not day-only): glowing ones → lights, the rest (cloth, blossom, flags) → blocks. */
  private kit(geo: InstancedBufferGeometry): void {
    const n = geo.instanceCount > 0 ? geo.instanceCount : (geo.getAttribute('iPos').count as number);
    const pos = geo.getAttribute('iPos').array;
    const size = geo.getAttribute('iSize').array;
    const rot = geo.getAttribute('iRot').array;
    const col = geo.getAttribute('iCol').array;
    for (let i = 0; i < n; i++) {
      if (Math.round(pos[i * 4 + 3]) !== 0 || Math.round(rot[i * 4 + 3]) === 2) continue;
      const [x, y, z] = [pos[i * 4], pos[i * 4 + 1], pos[i * 4 + 2]];
      const [sx, sy, sz, yaw] = [size[i * 4], size[i * 4 + 1], size[i * 4 + 2], size[i * 4 + 3]];
      const glow = rot[i * 4 + 2];
      _c.setRGB(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]);
      if (glow >= 0.15) {
        const peak = Math.max(_c.r, _c.g, _c.b, 1e-4);
        _c2.copy(_c).multiplyScalar(1.5 / peak);
        this.linear(x, y + sy * 0.3, z, Math.max(0.6, Math.max(sx, sy, sz) * 1.8), _c2.r, _c2.g, _c2.b);
        continue;
      }
      // (small things go, and the string lights' wires: two sides of a hair each)
      const sides = [sx, sy, sz].sort((p, q) => p - q);
      if (sides[2] < MIN_BLOCK * 0.8 || sides[1] < 0.06) continue;
      this.blocks.box(x, y, z, sx, sy, sz, _c.getHex(), 'mapStone', { ry: yaw || undefined, rz: rot[i * 4 + 1] || undefined, rx: rot[i * 4] || undefined });
    }
  }

  /** Halos of an instanced glow draw: position (xyz, w the size or rig), colour (rgb, w the size or kind). */
  private halos(geo: BufferGeometry, posName: string, colName: string, keep: (i: number, a: ArrayLike<number>) => boolean, k: number): void {
    const pos = geo.getAttribute(posName).array;
    const col = geo.getAttribute(colName).array;
    const opt = (geo.getAttribute('gMode') ?? geo.getAttribute('sCol')).array;
    const n = pos.length / 4;
    const kitGlow = posName === 'gPos';
    for (let i = 0; i < n; i++) {
      if (!keep(i, opt)) continue;
      const s = kitGlow ? col[i * 4 + 3] : pos[i * 4 + 3];
      this.linear(pos[i * 4], pos[i * 4 + 1], pos[i * 4 + 2], Math.min(3, s * k), col[i * 4] * 1.4, col[i * 4 + 1] * 1.4, col[i * 4 + 2] * 1.4);
    }
  }

  /** The venue's blocks as one mesh (one family, no shadow cast), or null when there are none. */
  buildBlocks(name: string): Object3D | null {
    if (!this.blocks.boxes.length) return null;
    const g = buildVoxelMesh(this.blocks, { quality: 'low', name, castShadow: false });
    g.traverse((o) => {
      o.userData.noWalk = true;
      o.raycast = () => {};
    });
    return g;
  }
}

/** Every venue's far lights: one additive draw of camera-facing quads, each shown while its venue looks far. */
export interface FarLights {
  mesh: Mesh;
  /** Which venues look far (0 or 1 each), and the night's level. */
  update(far: readonly boolean[], level: number): void;
}

export function buildFarLights(collectors: readonly FarCollector[]): FarLights | null {
  const data = collectors.flatMap((c) => c.lights);
  const n = data.length / 8;
  if (!n) return null;
  const quad = new PlaneGeometry(1, 1);
  const geo = new InstancedBufferGeometry();
  geo.setIndex(quad.getIndex());
  geo.setAttribute('position', quad.getAttribute('position'));
  const a = new Float32Array(n * 4);
  const b = new Float32Array(n * 4);
  const pts: Vector3[][] = [[], []];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) {
      a[i * 4 + k] = data[i * 8 + k];
      b[i * 4 + k] = data[i * 8 + 4 + k];
    }
    pts[Math.round(data[i * 8 + 7]) % 2].push(new Vector3(data[i * 8], data[i * 8 + 1], data[i * 8 + 2]));
  }
  geo.setAttribute('fPos', new InstancedBufferAttribute(a, 4));
  geo.setAttribute('fCol', new InstancedBufferAttribute(b, 4));
  geo.instanceCount = n;
  // (culled on the venues that look far now: from one venue the other's lights cost a draw only when in view)
  const ball = (p: Vector3[]) => {
    if (!p.length) return new Sphere(new Vector3(), -1);
    const s = new Sphere().setFromPoints(p);
    s.radius += 30;
    return s;
  };
  const spheres = [ball(pts[0]), ball(pts[1])];
  const both = ball([...pts[0], ...pts[1]]);
  geo.boundingSphere = both;
  const u = { ...hazeUniforms(), uLevel: { value: 0 }, uShow: { value: [0, 0] as number[] } };
  const material = new ShaderMaterial({
    name: 'nye:far:lights',
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: true,
    uniforms: u,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute vec4 fPos;
      attribute vec4 fCol;
      uniform float uLevel;
      uniform float uShow[2];
      varying vec2 vUv;
      varying vec3 vCol;
      varying float vDome;
      void main() {
        float venue = mod(fCol.w, 2.0);
        float dome = step(1.5, fCol.w);
        float show = mix(uShow[0], uShow[1], step(0.5, venue));
        vec4 mvPosition = viewMatrix * vec4(fPos.xyz, 1.0);
        // (a light: as big as it is, but never under ≈ 2 px nor over ≈ 12 px on the screen; a dome as it is)
        float ndc = fPos.w * projectionMatrix[1][1] / max(-mvPosition.z, 0.1);
        float s = mix(clamp(ndc, ${LIGHT_MIN.toFixed(4)}, ${LIGHT_MAX.toFixed(4)}) / max(ndc, 1e-6), 1.0, dome) * fPos.w;
        // (pulled toward the camera a little: the blocks round a flame do not cut its glow)
        mvPosition.xyz += normalize(-mvPosition.xyz) * min(1.5, fPos.w);
        mvPosition.xy += position.xy * s;
        vUv = position.xy * 2.0;
        vCol = fCol.rgb * uLevel * show;
        vDome = dome;
        gl_Position = projectionMatrix * mvPosition;
        if (show < 0.5 || uLevel < 0.001) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      varying vec2 vUv;
      varying vec3 vCol;
      varying float vDome;
      void main() {
        float r2 = dot(vUv, vUv);
        // (a light: a bright heart and a soft halo, as the bloom would make it — there is none on low; a dome: soft)
        float a = mix(exp(-r2 * 18.0) * 1.1 + exp(-r2 * 4.0) * 0.35, exp(-r2 * 3.0) - 0.05, vDome) * (1.0 - smoothstep(0.8, 1.0, r2));
        vec3 col = vCol * max(a, 0.0);
        #ifdef USE_FOG
          vec3 hzRay = vFogWorld - cameraPosition;
          float hzDist = length(hzRay);
          col *= 1.0 - 0.7 * hazeDistance(hzDist);
        #endif
        if (max(col.r, max(col.g, col.b)) < 0.002) discard;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new Mesh(geo, material);
  mesh.name = 'nye:far:lights';
  mesh.frustumCulled = true;
  mesh.renderOrder = 12;
  mesh.raycast = () => {};
  mesh.userData.noWalk = true;
  return {
    mesh,
    update(far, level) {
      u.uShow.value[0] = far[0] ? 1 : 0;
      u.uShow.value[1] = far[1] ? 1 : 0;
      u.uLevel.value = level;
      geo.boundingSphere = far[0] && far[1] ? both : far[0] ? spheres[0] : far[1] ? spheres[1] : both;
      mesh.visible = (far[0] || far[1]) && level > 0.001;
    },
  };
}

/** A board's far look: gold points round its frame and two rows across its middle (its figures, seen from afar). */
export function boardLights(c: FarCollector, b: { x: number; y: number; z: number; w: number; h: number; yaw?: number }): void {
  const yaw = b.yaw ?? 0;
  const ax = Math.cos(yaw);
  const az = -Math.sin(yaw);
  // (a hair in front of the screen, toward where it faces)
  const fx = Math.sin(yaw) * 0.25;
  const fz = Math.cos(yaw) * 0.25;
  const at = (u: number, v: number, size: number, level: number) => c.light(b.x + ax * u + fx, b.y + v, b.z + az * u + fz, size, 0xffc860, level);
  const step = 0.8;
  for (let u = -b.w / 2; u <= b.w / 2 + 1e-6; u += step) {
    at(u, b.h / 2 - 0.15, 0.5, 0.9);
    at(u, -b.h / 2 + 0.15, 0.5, 0.9);
  }
  for (let v = -b.h / 2 + step; v < b.h / 2 - 0.1; v += step) {
    at(-b.w / 2 + 0.15, v, 0.5, 0.9);
    at(b.w / 2 - 0.15, v, 0.5, 0.9);
  }
  // (the figures: a bright band of gold dots across the middle, as the lit numerals read from afar)
  for (const v of [-0.7, -0.1, 0.5]) for (let k = 0; k < 24; k++) at(-b.w * 0.34 + (k * b.w * 0.68) / 23, v, 0.95, 1.8);
}

/** A ring of light's far look: gold points round its rim (and an inner ring), at its floor's height. */
export function ringLights(c: FarCollector, x: number, y: number, z: number, radii: readonly number[]): void {
  for (const r of radii) {
    const n = Math.max(16, Math.round((2 * Math.PI * r) / 1.3));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      c.light(x + Math.cos(a) * r, y + 0.15, z + Math.sin(a) * r, 0.8, 0xffb848, 0.9);
    }
  }
}
