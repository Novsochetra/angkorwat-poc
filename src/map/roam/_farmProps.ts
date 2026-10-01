import { Euler, Group, Matrix4, Quaternion, Vector3 } from 'three';
import type { AngkorExplorer } from '../../character/AngkorExplorer';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh, disposeVoxelMesh } from '../../voxel/VoxelMesh';
import { RICE_COLORS } from '../paddies/ground';

/**
 * What the explorer holds while he helps the farmers (roam/_farmWork.ts), in
 * his blocks and at his props' size (body units; the origin in the middle of
 * the fist, as his lantern and torch are):
 *
 * - the **bundle of seedlings** in his left hand: muddy roots under the
 *   fist, a straw tie, pale stems and the bright young leaves fanning up; it
 *   thins as he plants it out (`BUNDLE_STAGES`);
 * - the farmer's **sickle** (កណ្ដៀវ) in his right: a wooden handle, an iron
 *   blade in a crescent with a bright cutting edge on its inside;
 * - the **sheaf** gathering in his left hand as he cuts, stalk ends down
 *   and the golden heads nodding over the top (`SHEAF_STAGES`; the last one
 *   tied round with a twist of straw), which he lays on the bund;
 * - the **parcel** of num ansom the farmer thanks him with (banana leaf, a
 *   tie), for the moment it is in his hand.
 *
 * Built the first time he takes one (nothing before), kept for the next time.
 * The bundle and the sheaf stand the way they would held in a fist whatever
 * his arm does (`upright`: turned each frame against the hand's turn).
 */

export const BUNDLE_STAGES = 4;
export const SHEAF_STAGES = 4;

/** Seedling greens (sRGB): the rice's own (paddies/ground.ts), a deeper one, the pale stems and the muddy roots. */
const LEAF = [RICE_COLORS.seedling, 0x74b23a, 0x5f9a35];
const STEM = 0xc4dc92;
const ROOTS = [0x6b5034, 0x8a6c48];
const TIE = 0xc9b27a;
/** The sheaf: as the farmers' stooks (paddies/props.ts SHEAF, SHEAF_HEAD, SHEAF_TIE). */
const STALK = [0xc9a95a, 0xd1b062, 0xbf9f52];
const HEAD = [0xd8b04a, 0xdcb656, 0xcfa544];
const SHEAF_TIE = 0x8a6a38;
/** The sickle: the handle's wood, the ferrule, the blade's iron and its bright edge. */
const HANDLE = [0x7a4c2a, 0x8f5d34];
const FERRULE = 0x5c5a56;
const IRON = 0x4c4a47;
const EDGE = 0xc2beb4;
/** The parcel: banana leaf and its tie. */
const BANANA = [0x5a9a3a, 0x4c8a32];
const PARCEL_TIE = 0xd8cc9a;

const pick = (xs: readonly number[], r: number) => xs[Math.min(xs.length - 1, Math.floor(r * xs.length))];

/** The bundle: `blades` young leaves (a full one 12), its stems and roots as thick as they go with them. */
export function bundleBuilder(blades: number): VoxelBuilder {
  const b = new VoxelBuilder();
  const w = 0.55 + 0.6 * (blades / 12);
  // (the roots under the fist, muddy)
  b.box(0, -1.25, 0, w * 1.05, 0.9, w * 1.05, ROOTS[0], 'wood', { shade: 0.95 });
  for (let i = 0; i < 4; i++) {
    const r = (k: number) => hash3(i, k, 3, 8811);
    b.box((r(1) - 0.5) * w, -1.75 - r(2) * 0.4, (r(3) - 0.5) * w, 0.22, 0.6, 0.22, ROOTS[1], 'wood', { rx: (r(4) - 0.5) * 0.5, rz: (r(5) - 0.5) * 0.5 });
  }
  // (the stems through the fist, a tie of straw above it)
  b.box(0, 0.5, 0, w, 2.6, w, STEM, 'foliage');
  b.box(0, 1.1, 0, w + 0.22, 0.32, w + 0.22, TIE, 'hat');
  // (the leaves fanning out above, each its own way: from the top of the stems, its middle half its length along its lean)
  for (let i = 0; i < blades; i++) {
    const r = (k: number) => hash3(i, k, 7, 8813);
    const a = i * 2.39996 + r(1) * 0.4;
    const lean = 0.08 + 0.32 * r(2);
    const len = 2.6 + 1.4 * r(3);
    const rx = Math.cos(a) * lean;
    const rz = Math.sin(a) * lean;
    _v.set(0, len / 2, 0).applyEuler(_e.set(rx, 0, rz, 'XYZ'));
    b.box(_v.x + (r(4) - 0.5) * w * 0.6, 1.6 + _v.y, _v.z + (r(5) - 0.5) * w * 0.6, 0.26, len, 0.1, pick(LEAF, r(6)), 'foliage', { rx, rz });
  }
  return b;
}

/**
 * The sheaf as it grows in his hand (`n` fistfuls of 12) or tied: the stalks
 * (their cut ends down) through the fist, the heads above them nodding over
 * to the front (+z).
 */
export function sheafBuilder(n: number, tied: boolean): VoxelBuilder {
  const b = new VoxelBuilder();
  // (a whole sheaf as the farmers' (paddies/props.ts): ≈ 0.24 m thick, ≈ 0.75 m long; a fistful thinner)
  const k = Math.max(1, n) / 12;
  const w = 0.9 + 2.3 * Math.sqrt(k);
  const stalks = 4 + Math.round(10 * k);
  for (let i = 0; i < stalks; i++) {
    const r = (q: number) => hash3(i, q, 11, 8821);
    const a = (i / stalks) * Math.PI * 2 * 2.618 + r(1) * 0.6;
    const rad = w * 0.36 * Math.sqrt(0.15 + 0.85 * ((i + 0.5) / stalks));
    const ox = Math.cos(a) * rad;
    const oz = Math.sin(a) * rad;
    const len = 7.4 + r(3) * 1.0;
    // (stalk ends a little ragged under the fist, the stalks up through it)
    b.box(ox, -3.0 + len / 2 - r(4) * 0.5, oz, 0.6, len, 0.6, pick(STALK, r(5)), 'hat', { rx: (r(6) - 0.5) * 0.08, rz: (r(7) - 0.5) * 0.08 });
    // (the heads: out of the top, nodding forward and out)
    const tip = -3.0 + len - r(4) * 0.5;
    b.box(ox * 1.2 + (r(8) - 0.5) * 0.4, tip + 0.3, oz * 1.2 + 0.9, 0.62, 0.5, 2.1, pick(HEAD, r(9)), 'hat', { rx: 0.55 + r(10) * 0.25, ry: (r(11) - 0.5) * 0.5 });
  }
  if (tied) {
    // (a twist of straw round it, a hand over the fist)
    b.box(0, 1.4, 0, w * 0.8 + 0.5, 0.42, w * 0.8 + 0.5, SHEAF_TIE, 'hat');
    b.box(w * 0.4 + 0.3, 1.4, 0.2, 0.34, 0.55, 0.55, SHEAF_TIE, 'hat', { ry: 0.6 });
  }
  return b;
}

/** The sickle: the handle along the fist's grip (+z), the blade in a crescent off its end, toward +x. */
export function sickleBuilder(): VoxelBuilder {
  const b = new VoxelBuilder();
  b.span(-0.36, -0.36, -1.2, 0.36, 0.36, 3.0, HANDLE[1], 'wood');
  b.span(-0.4, -0.4, -1.45, 0.4, 0.4, -1.1, HANDLE[0], 'wood');
  b.span(-0.42, -0.42, 2.9, 0.42, 0.42, 3.4, FERRULE, 'metal');
  // (the tang out of the ferrule, then the crescent: thick at its back, a bright edge on its inside)
  b.span(-0.12, -0.2, 3.3, 0.12, 0.2, 4.4, IRON, 'metal');
  const cx = 1.85;
  const cz = 4.4;
  const R = 1.85;
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (i / n) * Math.PI * 1.12;
    const x = cx + Math.cos(a) * R;
    const z = cz + Math.sin(a) * R;
    const ry = -a + Math.PI / 2;
    const thin = 1 - i / (n + 2);
    b.box(x, 0, z, 0.16, 0.42 * thin + 0.12, 0.72, IRON, 'metal', { ry });
    b.box(cx + Math.cos(a) * (R - 0.24), 0, cz + Math.sin(a) * (R - 0.24), 0.12, 0.2 * thin + 0.08, 0.66, EDGE, 'metal', { ry });
  }
  return b;
}

/** The parcel of num ansom: banana leaf folded round sticky rice, tied twice. */
export function parcelBuilder(): VoxelBuilder {
  const b = new VoxelBuilder();
  b.box(0, 0.3, 0.9, 1.5, 1.1, 2.6, BANANA[0], 'foliage');
  b.box(0, 0.88, 0.9, 1.3, 0.12, 2.3, BANANA[1], 'foliage');
  for (const z of [0.3, 1.5]) b.box(0, 0.3, z, 1.62, 1.22, 0.22, PARCEL_TIE, 'hat');
  return b;
}

// ── In his hands ───────────────────────────────────────────────────────────

type Hand = 'L' | 'R';
type Item = 'bundle' | 'sickle' | 'sheaf' | 'parcel';

const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const _m = new Matrix4();
const _v = new Vector3();

/** His props for the work: shown in a hand at a stage, turned upright, put away. */
export class FarmProps {
  private bundle: Group[] | null = null;
  private sheaf: Group[] | null = null;
  private sickle: Group | null = null;
  private parcel: Group | null = null;
  /** What each hand holds now (its group in the slot), and how it is turned: upright, leaning `lean` (rad) toward his front. */
  private readonly held: Record<Hand, { item: Item | null; g: Group | null; upright: boolean; lean: number }> = {
    L: { item: null, g: null, upright: false, lean: 0 },
    R: { item: null, g: null, upright: false, lean: 0 },
  };

  constructor(private readonly explorer: AngkorExplorer) {}

  private mesh(b: VoxelBuilder, name: string): Group {
    return buildVoxelMesh(b, { quality: this.explorer.rig.quality, name: `farm:${name}`, castShadow: true });
  }

  private groupOf(item: Item, stage: number): Group {
    switch (item) {
      case 'bundle':
        this.bundle ??= [12, 9, 6, 3].map((n, i) => this.mesh(bundleBuilder(n), `bundle${i}`));
        return this.bundle[Math.min(BUNDLE_STAGES - 1, Math.max(0, stage))];
      case 'sheaf':
        this.sheaf ??= [2, 5, 8, 12].map((n, i) => this.mesh(sheafBuilder(n, i === SHEAF_STAGES - 1), `sheaf${i}`));
        return this.sheaf[Math.min(SHEAF_STAGES - 1, Math.max(0, stage))];
      case 'sickle':
        return (this.sickle ??= this.mesh(sickleBuilder(), 'sickle'));
      case 'parcel':
        return (this.parcel ??= this.mesh(parcelBuilder(), 'parcel'));
    }
  }

  /** Put `item` (at `stage`) in `hand`, or nothing (null); `upright`: it stands up whatever the hand's turn, leaning `lean` forward. */
  hold(hand: Hand, item: Item | null, stage = 0, upright = false, lean = 0): void {
    const h = this.held[hand];
    const g = item ? this.groupOf(item, stage) : null;
    h.upright = upright;
    h.lean = lean;
    if (h.g === g) return;
    const slot = `farm${hand}`;
    this.explorer.rig.clearSlot(slot);
    h.item = item;
    h.g = g;
    if (g) {
      g.quaternion.identity();
      this.explorer.rig.setSlotObject(slot, hand === 'L' ? 'propL' : 'propR', g);
    }
  }

  /** What `hand` holds. */
  holding(hand: Hand): Item | null {
    return this.held[hand].item;
  }

  /** Every frame after his pose is set (his joints' world matrices up to date): the upright ones turned upright. */
  frame(yaw: number): void {
    for (const hand of ['L', 'R'] as const) {
      const h = this.held[hand];
      const g = h.g;
      if (!g || !h.upright || !g.parent) continue;
      g.parent.updateWorldMatrix(true, false);
      g.parent.getWorldQuaternion(_q);
      _q2.setFromEuler(_e.set(h.lean, yaw, 0, 'YXZ'));
      g.quaternion.copy(_q.invert().multiply(_q2));
    }
  }

  /** Empty hands (the work is over, or broken off). */
  clear(): void {
    this.hold('L', null);
    this.hold('R', null);
  }

  dispose(): void {
    this.clear();
    for (const g of [...(this.bundle ?? []), ...(this.sheaf ?? []), this.sickle, this.parcel]) if (g) disposeVoxelMesh(g);
    this.bundle = this.sheaf = null;
    this.sickle = this.parcel = null;
  }
}

/** A box of a builder turned by `m` (a rotation and a move): its middle and Euler turn (XYZ) written back. */
export function turnBox(b: VoxelBuilder['boxes'][number], m: Matrix4, out: VoxelBuilder): void {
  _v.set(b.x, b.y, b.z).applyMatrix4(m);
  _q.setFromEuler(_e.set(b.rx ?? 0, b.ry ?? 0, b.rz ?? 0, 'XYZ'));
  _m.extractRotation(m);
  _q2.setFromRotationMatrix(_m).multiply(_q);
  _e.setFromQuaternion(_q2, 'XYZ');
  out.box(_v.x, _v.y, _v.z, b.sx, b.sy, b.sz, b.color, b.mat, { shade: b.shade, rx: _e.x, ry: _e.y, rz: _e.z, src: b.src });
}
