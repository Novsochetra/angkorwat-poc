import { Euler, Group, Matrix4, Quaternion, Vector3 } from 'three';
import type { AngkorExplorer } from '../../character/AngkorExplorer';
import { SHOULDER_PAD, YOKE, YokeRig, type YokePlace } from '../../character/carryPole';
export { yokePlace, type YokePlace } from '../../character/carryPole';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import type { VoxelMaterialKey } from '../../voxel/materials';
import { buildVoxelMesh, disposeVoxelMesh } from '../../voxel/VoxelMesh';

/**
 * The shoulder pole's things (ដងរែក: carrying water, រែកទឹក; the carry add-on roam/_carryPole*.ts uses them):
 *
 * - the **pole**: a length of dry bamboo, smooth and pale with its nodes, a notch and a lashing of cord near each
 *   end where a bucket's rope is tied; it bows a little under two full buckets;
 * - two **buckets** (ធុង): galvanized tin with a rolled rim and a wire bail, as a Cambodian village carries its water
 *   in, each on a rope from the pole's end; the water's surface in them at its level (0 empty ‥ 1 full), tilting as it
 *   slops;
 * - the **dipper** (ផ្ដិល): half a coconut shell on a wooden handle (`dipperBuilder`, in his right fist: the handle
 *   along the fist's grip, the shell at its far end, open side up).
 *
 * `Yoke` puts the pole and its buckets on him (`carry`) or wherever a pose says (`place`, the pole's five actions:
 * character/gardenWork.ts `gardenYoke`), swings the buckets (character/carryPole.ts `YokeRig`), shows how full they are.
 * Built once (the first `Yoke`), a few draws (the pole's two halves, two buckets with their ropes and water).
 * Body units, as his props.
 */

const pick = (xs: readonly number[], r: number) => xs[Math.min(xs.length - 1, Math.floor(r * xs.length))];
const r3 = (i: number, j: number, s: number) => hash3(i, j, 9, s);
const _a = new Vector3();
const _q = new Quaternion();
const Z = new Vector3(0, 0, 1);
function rod(b: VoxelBuilder, a: Vector3, c: Vector3, w: number, h: number, color: number, mat: VoxelMaterialKey): void {
  _a.subVectors(c, a);
  const len = _a.length();
  if (len < 1e-4) return;
  _q.setFromUnitVectors(Z, _a.divideScalar(len));
  _e.setFromQuaternion(_q, 'XYZ');
  b.box((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2, w, h, len, color, mat, { rx: _e.x, ry: _e.y, rz: _e.z });
}
const _e = new Euler();

// ── The pole ────────────────────────────────────────────────────────────────

/** Dry bamboo, its nodes, the cord lashed at the notches. */
const BAMBOO = [0xcdb877, 0xc4ad68, 0xd6c486];
const NODE = 0xa48d50;
const CORD = 0x7a5e3a;

/** Half the pole (from its middle at the origin out along +z to its end), bowed by its group's turn. */
export function poleHalfBuilder(): VoxelBuilder {
  const b = new VoxelBuilder();
  const half = YOKE.length / 2;
  const r = YOKE.r;
  const n = 4;
  for (let i = 0; i < n; i++) {
    const z0 = (i * half) / n;
    const z1 = ((i + 1) * half) / n;
    // (a little flatter on top and bottom where it bears on the shoulder, round elsewhere: its middle wider)
    const t = r * (1 - 0.1 * (i / n));
    b.span(-t, -t * 0.92, z0 - 0.01, t, t * 0.92, z1 + 0.01, pick(BAMBOO, r3(i, 1, 6101)), 'wood');
    if (i > 0) b.span(-t - 0.08, -t - 0.08, z0 - 0.18, t + 0.08, t + 0.08, z0 + 0.18, NODE, 'wood');
  }
  // (the notch near the end, a cord lashed round it, the end cut)
  b.span(-r - 0.1, -r - 0.1, half - 1.3, r + 0.1, r + 0.1, half - 0.75, CORD, 'krama');
  b.span(-r + 0.05, -r + 0.05, half - 0.02, r - 0.05, r - 0.05, half + 0.12, 0xe2d2a0, 'wood');
  return b;
}

// ── A bucket ────────────────────────────────────────────────────────────────

/** Galvanized tin (as the watering can), its rolled rim and seams, the dark inside. */
const TIN = [0xa9afb2, 0xa0a7ab, 0xb7bcbf];
const TIN_SEAM = 0x868e93;
const TIN_IN = 0x6c757a;
const ROPE = 0xb89a68;

/**
 * A tin bucket hung by its bail: its frame's origin at the bail's top (where the rope is tied), +y up; the bucket below
 * it, `YOKE.bail` down to its rim, `YOKE.height` tall, a little narrower at its base.
 */
export function bucketBuilder(): VoxelBuilder {
  const b = new VoxelBuilder();
  const { height: H, radius: R, bail } = YOKE;
  const top = -bail;
  const bottom = top - H;
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const wide = (2 * Math.PI * R) / n + 0.12;
    // (the wall: staves of the sheet, leaning in to the narrower base)
    const rr = R - 0.32;
    b.box(Math.cos(a) * rr, (top + bottom) / 2, Math.sin(a) * rr, 0.22, H, wide, pick(TIN, r3(i, 2, 6111)), 'metal', { ry: -a, rz: 0.06 });
    // (the rolled rim, a seam band)
    b.box(Math.cos(a) * (R - 0.1), top - 0.12, Math.sin(a) * (R - 0.1), 0.34, 0.3, wide + 0.04, TIN_SEAM, 'metal', { ry: -a });
    b.box(Math.cos(a) * (rr - 0.12), bottom + H * 0.42, Math.sin(a) * (rr - 0.12), 0.26, 0.16, wide, TIN_SEAM, 'metal', { ry: -a });
  }
  // (the bottom, the inside's dark)
  b.box(0, bottom + 0.12, 0, R * 1.5, 0.24, R * 1.5, TIN[1], 'metal');
  b.box(0, bottom + 0.27, 0, R * 1.35, 0.06, R * 1.35, TIN_IN, 'metal');
  // (the wire bail: up from its two lugs at the rim to the top, where the rope is knotted)
  for (const s of [-1, 1]) {
    b.box(s * (R - 0.05), top - 0.2, 0, 0.3, 0.5, 0.5, TIN_SEAM, 'metal');
    rod(b, new Vector3(s * (R - 0.02), top - 0.1, 0), new Vector3(s * 0.9, -0.25, 0), 0.16, 0.16, 0x7c8488, 'metal');
  }
  rod(b, new Vector3(-0.95, -0.25, 0), new Vector3(0.95, -0.25, 0), 0.16, 0.16, 0x7c8488, 'metal');
  b.box(0, 0, 0, 0.5, 0.5, 0.5, ROPE, 'krama');
  return b;
}

/** The rope from a pole end down to a bail: 1 BU long along −y (stretched to its length), its knot at the top. */
export function ropeBuilder(): VoxelBuilder {
  const b = new VoxelBuilder();
  b.box(0, -0.5, 0, 0.18, 1, 0.18, ROPE, 'krama');
  return b;
}

/** The water's surface in a bucket: a thin slab, its middle at the origin (the bucket's own turn and the slop tilt it). */
export function waterSlabBuilder(): VoxelBuilder {
  const b = new VoxelBuilder();
  const R = YOKE.radius - 0.42;
  b.box(0, 0, 0, R * 1.9, 0.14, R * 1.5, 0x5f9fae, 'lens');
  b.box(0, 0.01, 0, R * 1.5, 0.15, R * 1.9, 0x6aaebb, 'lens');
  b.box(0.3, 0.05, -0.2, 0.8, 0.06, 0.5, 0xbfe2e8, 'lens', { ry: 0.5 });
  return b;
}

/** The coconut-shell dipper (ផ្ដិល): the handle along the fist's grip (+z, the fist on its end), the shell at its far end, open side up. */
export function dipperBuilder(): VoxelBuilder {
  const b = new VoxelBuilder();
  // (a straight wooden handle through the shell's rim, pegged)
  b.span(-0.3, -0.3, -1.4, 0.3, 0.3, 4.2, 0x8a6a44, 'wood');
  b.span(-0.34, -0.34, -1.6, 0.34, 0.34, -1.2, 0x6e5234, 'wood');
  // (the half shell: dark brown, its hairy outside, the pale cut rim; its middle 5 BU out: gardenWork.ts DIPPER_SHELL)
  const cz = 5.0;
  const R = 1.55;
  b.box(0, -0.5, cz, R * 2, 1.1, R * 1.6, 0x5a3e26, 'hat');
  b.box(0, -0.5, cz, R * 1.6, 1.1, R * 2, 0x63452a, 'hat');
  b.box(0, -1.15, cz, R * 1.3, 0.4, R * 1.3, 0x4e3420, 'hat');
  b.box(0, 0.08, cz, R * 2 - 0.1, 0.12, R * 1.6 - 0.1, 0xd8c8a0, 'hat');
  b.box(0, 0.08, cz, R * 1.6 - 0.1, 0.12, R * 2 - 0.1, 0xd8c8a0, 'hat');
  b.box(0, 0.12, cz, R * 1.5, 0.08, R * 1.5, 0x3e2a18, 'hat');
  return b;
}

// ── On him ──────────────────────────────────────────────────────────────────

const _m = new Matrix4();
const _m2 = new Matrix4();
const _hook = [new Vector3(), new Vector3()];
const _hookW = [new Vector3(), new Vector3()];
const _p = new Vector3();
const _d = new Vector3();
const _up = new Vector3();
const _q2 = new Quaternion();
const _q3 = new Quaternion();
const _s = new Vector3();
const UP = new Vector3(0, 1, 0);
const ONE = new Vector3(1, 1, 1);

/**
 * The pole with its buckets, on him: `carry(explorer)` once (it hangs it on his right shoulder), then each frame after
 * his pose is set (and `applyCarryWalk`): `frame(dt, run)` (on his shoulder as he walks) or `frame(dt, run, place)`
 * (where an action's pose puts it); `setWater(front, back)` (0‥1 each) whenever it changes; `drop()` to take it off
 * him (the add-on then shows its own pole on the ground, or keeps this one where `place` last put it: `keepAt()`).
 * `rig` is the swing: `rig.sway`, `rig.slosh`, `rig.spill`, `rig.spills`, `rig.bounce` after `frame`.
 * No allocation per frame.
 */
export class Yoke {
  readonly rig = new YokeRig();
  /** The pole (its frame: the pole's middle, +z its front end), in his root's space (BU). */
  readonly pole = new Group();
  private readonly halves: [Group, Group];
  private readonly ropes: [Group, Group];
  private readonly buckets: [Group, Group];
  private readonly waters: [Group, Group];
  private readonly water: [number, number] = [0, 0];
  private explorer: AngkorExplorer | null = null;
  private dipper: Group | null = null;
  private dipperOn = false;
  private readonly quality: 'low' | 'medium' | 'high';
  private readonly root = new Group();
  private readonly parts: Group[] = [];

  constructor(quality: 'low' | 'medium' | 'high' = 'high') {
    this.quality = quality;
    const mk = (b: VoxelBuilder, name: string) => {
      const g = buildVoxelMesh(b, { quality, name: `carry:${name}`, castShadow: true });
      this.parts.push(g);
      return g;
    };
    this.root.name = 'carry:yoke';
    this.pole.name = 'carry:pole';
    const hb = poleHalfBuilder();
    const front = new Group();
    front.add(mk(hb, 'poleFront'));
    const back = new Group();
    back.add(mk(hb, 'poleBack'));
    back.rotation.y = Math.PI;
    this.halves = [front, back];
    this.pole.add(front, back);
    this.ropes = [mk(ropeBuilder(), 'ropeF'), mk(ropeBuilder(), 'ropeB')];
    this.buckets = [mk(bucketBuilder(), 'bucketF'), mk(bucketBuilder(), 'bucketB')];
    const slab = waterSlabBuilder();
    this.waters = [mk(slab, 'waterF'), mk(slab, 'waterB')];
    for (let i = 0; i < 2; i++) {
      this.buckets[i].add(this.waters[i]);
      this.waters[i].visible = false;
      this.root.add(this.ropes[i], this.buckets[i]);
    }
    this.cordLine = mk(ropeBuilder(), 'cord');
    this.cordLine.visible = false;
    this.root.add(this.pole, this.cordLine);
  }
  /** A bucket's own cord (let down from a high bank). */
  private readonly cordLine: Group;

  /** How full each bucket is (0‥1): its water's surface. */
  setWater(front: number, back: number): void {
    this.water[0] = Math.max(0, Math.min(1, front));
    this.water[1] = Math.max(0, Math.min(1, back));
  }

  /** Hang it on him (in his root's space: it follows him; `frame` places it each frame). */
  carry(explorer: AngkorExplorer): void {
    if (this.explorer === explorer) return;
    this.drop();
    this.explorer = explorer;
    explorer.rig.joints.root.add(this.root);
    this.rig.reset();
  }

  /** Take it off him. */
  drop(): void {
    this.holdDipper(false);
    this.root.removeFromParent();
    this.explorer = null;
  }

  /** The coconut-shell dipper in his right fist (the handle along its grip), or not. */
  holdDipper(on: boolean): void {
    if (on === this.dipperOn || !this.explorer) {
      if (!this.explorer) this.dipperOn = false;
      return;
    }
    this.dipperOn = on;
    const rig = this.explorer.rig;
    if (on) {
      this.dipper ??= buildVoxelMesh(dipperBuilder(), { quality: this.quality, name: 'carry:dipper', castShadow: true });
      rig.setSlotObject('carryDipper', 'propR', this.dipper);
    } else rig.clearSlot('carryDipper');
  }

  /** Its group (the pole and the buckets, in his root's space while carried): move it elsewhere to leave it lying. */
  get object(): Group {
    return this.root;
  }

  /**
   * Each frame after his pose: the pole on his right shoulder as his chest is now (or where `place` puts it), bowed by
   * the load; the buckets swing from its ends (stand on `place.floor` when they reach it), their water at its level,
   * tilting as it slops.
   */
  frame(dt: number, run: number, place?: YokePlace): void {
    const ex = this.explorer;
    if (!ex) return;
    this.holdDipper(!!place?.dipper);
    this.cordLine.visible = false;
    const J = ex.rig.joints;
    J.root.updateWorldMatrix(true, false);
    // The pole's frame (his root's space): on the shoulder pad of his chest as posed, or the pose's.
    if (place) _m.copy(place.frame);
    else {
      J.chest.updateWorldMatrix(true, false);
      _m.copy(J.root.matrixWorld).invert().multiply(J.chest.matrixWorld).multiply(_m2.makeTranslation(SHOULDER_PAD.x, SHOULDER_PAD.y + YOKE.r + this.rig.bounce * 0.4, SHOULDER_PAD.z));
    }
    _m.decompose(this.pole.position, this.pole.quaternion, _s);
    this.pole.scale.set(1, 1, 1);
    if (!place) {
      // (on his shoulder it keeps level, turned as his chest is: its heavier end a little lower)
      _d.set(0, 0, 1).applyQuaternion(this.pole.quaternion);
      const yaw = Math.atan2(_d.x, _d.z);
      this.pole.quaternion.setFromEuler(_e.set((this.water[0] - this.water[1]) * 0.08, yaw, 0, 'YXZ'));
    }
    // (bowed: each half's end down a little under its bucket's water)
    const half = YOKE.length / 2;
    for (let i = 0; i < 2; i++) {
      const bow = Math.atan2(YOKE.bow * (0.3 + 0.7 * this.water[i]), half);
      this.halves[i].rotation.x = bow;
    }
    this.halves[1].rotation.set(this.halves[1].rotation.x, Math.PI, 0);
    this.pole.updateMatrix();
    // The hooks (the notches near the ends: his root's space, and the world's for the swing).
    for (let i = 0; i < 2; i++) {
      const s = i === 0 ? 1 : -1;
      const along = place ? place.hook[i] : s * (half - 1.0);
      // (bowed: down at the ends, none at its middle)
      const bow = YOKE.bow * (0.3 + 0.7 * this.water[i]) * Math.min(1, Math.abs(along) / (half - 1.0));
      _hook[i].set(0, -bow - YOKE.r, along).applyMatrix4(this.pole.matrix);
      _hookW[i].copy(_hook[i]).applyMatrix4(J.root.matrixWorld);
    }
    this.rig.update(dt, _hookW[0], _hookW[1], this.water, run);
    // The buckets: from each hook, out by its swing (the world's x, z into his root's space), on the floor if it reaches it.
    J.root.getWorldQuaternion(_q2);
    _q3.copy(_q2).invert();
    for (let i = 0; i < 2; i++) {
      const sw = this.rig.swing[i];
      // (the swing's way in the world, then into his root's space)
      _d.set(sw.px, -Math.sqrt(Math.max(0.2, 1 - sw.px * sw.px - sw.pz * sw.pz)), sw.pz).applyQuaternion(_q3).normalize();
      let len = YOKE.rope;
      const floor = place ? place.floor[i] : -Infinity;
      // (the bucket's bottom: rope + bail + height below the hook along the hang)
      const reach = YOKE.rope + YOKE.bail + YOKE.height;
      _p.copy(_hook[i]).addScaledVector(_d, reach);
      const standOn = place ? place.standOn[i] : 0;
      if (place && place.cord === i) {
        // (on its own cord: where the pose has it, its pole rope hidden, the cord from his fist to its bail)
        this.ropes[i].visible = false;
        const bucket = this.buckets[i];
        place.load.decompose(bucket.position, bucket.quaternion, _s);
        bucket.scale.copy(ONE);
        _d.subVectors(bucket.position, place.cordTop);
        const cl = Math.max(0.2, _d.length());
        this.cordLine.visible = true;
        this.cordLine.position.copy(place.cordTop);
        this.cordLine.quaternion.setFromUnitVectors(_up.set(0, -1, 0), _d.divideScalar(cl));
        this.cordLine.scale.set(1, cl, 1);
        const wtr = this.waters[i];
        wtr.visible = this.water[i] > 0.02;
        wtr.position.set(0, -YOKE.bail - YOKE.height + 0.35 + this.water[i] * (YOKE.height - 0.7), 0);
        wtr.quaternion.identity();
        sw.px = sw.pz = sw.vx = sw.vz = 0;
        continue;
      }
      this.ropes[i].visible = true;
      if (standOn > 0.001) {
        // (standing where the pose says (the lean's foot), eased toward under its hook as the pole lifts it)
        _a.copy(place!.stand[i]);
        _s.copy(_hook[i]).addScaledVector(_d, YOKE.rope + YOKE.bail + YOKE.height);
        _s.y = Math.max(_s.y, _a.y);
        _a.lerp(_s, 1 - standOn);
        _p.set(_a.x, _a.y + YOKE.height + YOKE.bail, _a.z);
        _d.subVectors(_p, _hook[i]);
        len = Math.max(0.2, _d.length());
        _d.divideScalar(len);
        // (its swing still: it stands)
        sw.px = sw.pz = sw.vx = sw.vz = 0;
        const rope = this.ropes[i];
        rope.position.copy(_hook[i]);
        rope.quaternion.setFromUnitVectors(_up.set(0, -1, 0), _d);
        rope.scale.set(1, len, 1);
        const bucket = this.buckets[i];
        bucket.position.copy(_p);
        bucket.quaternion.identity();
        const wtr = this.waters[i];
        const f = this.water[i];
        wtr.visible = f > 0.02;
        wtr.position.set(0, -YOKE.bail - YOKE.height + 0.35 + f * (YOKE.height - 0.7), 0);
        wtr.quaternion.identity();
        continue;
      }
      if (_p.y < floor) {
        // (stands on the floor, upright; the rope slack down to its bail)
        _p.set(_hook[i].x + _d.x * 0.3, floor + YOKE.height + YOKE.bail, _hook[i].z + _d.z * 0.3);
        _d.set(0, -1, 0);
        len = Math.max(0.2, _hook[i].y - _p.y);
        sw.px *= 0.8;
        sw.pz *= 0.8;
        sw.vx = sw.vz = 0;
      } else _p.copy(_hook[i]).addScaledVector(_d, YOKE.rope);
      // (the rope from the hook to the bail)
      const rope = this.ropes[i];
      rope.position.copy(_hook[i]);
      rope.quaternion.setFromUnitVectors(_up.set(0, -1, 0), _d);
      rope.scale.set(1, len, 1);
      // (the bucket: its bail at the rope's end, its axis along the hang, tipped about its rim for pouring)
      const bucket = this.buckets[i];
      bucket.position.copy(_p);
      bucket.quaternion.setFromUnitVectors(UP, _up.copy(_d).negate());
      const tip = place ? place.tip[i] : 0;
      if (tip) bucket.quaternion.multiply(_q.setFromAxisAngle(_a.set(1, 0, 0), tip * (i === 0 ? 1 : -1)));
      bucket.scale.copy(ONE);
      // (the water: at its level, level in the world but for its slop)
      const wtr = this.waters[i];
      const f = this.water[i];
      wtr.visible = f > 0.02;
      if (wtr.visible) {
        wtr.position.set(0, -YOKE.bail - YOKE.height + 0.35 + f * (YOKE.height - 0.7), 0);
        // (world up tilted by the slop, into the bucket's frame)
        _up.set(-sw.sx, 1, -sw.sz).normalize().applyQuaternion(_q3);
        _q.setFromUnitVectors(UP, _up);
        wtr.quaternion.copy(bucket.quaternion).invert().multiply(_q);
        wtr.scale.setScalar(tip ? Math.max(0.3, 1 - Math.abs(tip) * 0.5) : 0.97);
      }
    }
  }

  /** Free what it built. */
  dispose(): void {
    this.drop();
    for (const g of this.parts) disposeVoxelMesh(g);
    if (this.dipper) disposeVoxelMesh(this.dipper);
  }
}
