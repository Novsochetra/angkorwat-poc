import { Group, PointLight } from 'three';
import { BODY_UNIT_M } from '../world/scale';
import type { VoxelQuality } from '../voxel/VoxelMesh';
import { buildVoxelMesh, disposeVoxelMesh } from '../voxel/VoxelMesh';
import { Animator, type HoldKind } from './Animator';
import type { ActionName } from './clips';
import { Pendulum } from './Dynamics';
import { buildFace, EXPRESSIONS, type ExpressionName } from './parts/face';
import { buildBackpack, buildCamera, type PackStyle } from './parts/gear';
import { buildHair, hairCovers } from './parts/hair';
import { buildHead, buildNeck } from './parts/head';
import { buildFoot, buildForearm, buildHand, buildPelvis, buildShin, buildThigh, buildUpperArm, type HandPose, type LegStyle, type Side } from './parts/limbs';
import { buildFlame, buildHat, buildLantern, buildTorchHandle, HAT_CLIP_Y } from './parts/props';
import { buildScarfCollar, buildScarfTail } from './parts/scarf';
import { buildBelt, buildTorso } from './parts/torso';
import { Rig } from './Rig';
import { JOINTS } from './skeleton';

/** Prop light strengths (candela). Tuned so they light a dark temple interior
 *  within a few metres without blowing out the explorer holding them. */
const LANTERN_CANDELA = 0.55;
const TORCH_CANDELA = 0.9;

export interface ExplorerOutfit {
  hat: boolean;
  scarf: boolean;
  camera: boolean;
  pack: PackStyle | 'none';
  legs: LegStyle;
  held: HoldKind;
}

/** The six variations of sheet 3.5 (+ the torch from the hero shot). */
export const OUTFITS = {
  default: { hat: false, scarf: true, camera: true, pack: 'default', legs: 'shorts', held: 'none' },
  withHat: { hat: true, scarf: true, camera: true, pack: 'default', legs: 'shorts', held: 'none' },
  withLantern: { hat: false, scarf: true, camera: true, pack: 'default', legs: 'shorts', held: 'lantern' },
  withoutScarf: { hat: false, scarf: false, camera: true, pack: 'default', legs: 'shorts', held: 'none' },
  explorerGear: { hat: false, scarf: true, camera: true, pack: 'explorer', legs: 'shorts', held: 'none' },
  templeOutfit: { hat: false, scarf: false, camera: false, pack: 'none', legs: 'sampot', held: 'none' },
  torchBearer: { hat: false, scarf: true, camera: true, pack: 'default', legs: 'shorts', held: 'torch' },
} as const satisfies Record<string, ExplorerOutfit>;
export type OutfitName = keyof typeof OUTFITS;

export interface ExplorerOptions {
  quality?: VoxelQuality;
  outfit?: OutfitName | Partial<ExplorerOutfit>;
  expression?: ExpressionName;
  /** Point lights for lantern / torch (turn off for thumbnails). */
  propLights?: boolean;
  castShadow?: boolean;
}

/**
 * The Angkor Quest explorer. Add `explorer.object` to the scene — it is in
 * metres with the feet on y = 0, facing +Z — then call `update(dt)` each frame
 * and feed it movement with `setMotion()`.
 */
export class AngkorExplorer {
  /** World-space handle (metres). Position/rotate this from your controller. */
  readonly object = new Group();
  readonly rig: Rig;
  readonly animator: Animator;
  /** Random blinking (disable for deterministic screenshots). */
  blinking = true;
  /** Multiplier for the lantern / torch light (raise it at night). */
  propLightBoost = 1;
  private readonly scaler = new Group();
  private outfit: ExplorerOutfit = { ...OUTFITS.default };
  private expression: ExpressionName = 'neutral';
  private readonly faces = new Map<string, Group>();
  private blinkIn = 2.5;
  private blinkLeft = 0;
  private pendulums: Pendulum[] = [];
  private lanternPivot: Group | null = null;
  private flame: Group | null = null;
  private light: PointLight | null = null;
  private readonly propLights: boolean;
  private readonly handPose: Record<Side, HandPose> = { L: 'relaxed', R: 'relaxed' };
  private readonly castShadow: boolean;

  constructor(opts: ExplorerOptions = {}) {
    this.object.name = 'AngkorExplorer';
    this.scaler.name = 'explorer:bodyUnits';
    this.scaler.scale.setScalar(BODY_UNIT_M);
    this.object.add(this.scaler);
    this.rig = new Rig(this.scaler, opts.quality ?? 'high');
    this.animator = new Animator(this.rig);
    this.propLights = opts.propLights ?? true;
    this.castShadow = opts.castShadow ?? true;

    const r = this.rig;
    r.setSlot('head', 'head', buildHead(hairCovers));
    r.setSlot('neck', 'neck', buildNeck());
    for (const s of ['L', 'R'] as Side[]) {
      r.setSlot(`upperArm${s}`, `shoulder${s}`, buildUpperArm(s));
      r.setSlot(`forearm${s}`, `elbow${s}`, buildForearm(s));
      r.setSlot(`foot${s}`, `ankle${s}`, buildFoot(s));
    }
    this.buildFaces();
    const outfit = typeof opts.outfit === 'string' ? OUTFITS[opts.outfit] : { ...OUTFITS.default, ...opts.outfit };
    this.applyOutfit(outfit, true);
    this.setExpression(opts.expression ?? 'neutral');
    this.applyShadowFlags();
  }

  // ── Appearance ───────────────────────────────────────────────────────────

  get currentOutfit(): Readonly<ExplorerOutfit> {
    return this.outfit;
  }

  get currentExpression(): ExpressionName {
    return this.expression;
  }

  setOutfit(outfit: OutfitName | Partial<ExplorerOutfit>): void {
    const next = typeof outfit === 'string' ? { ...OUTFITS[outfit] } : { ...this.outfit, ...outfit };
    this.applyOutfit(next, false);
    this.applyShadowFlags();
  }

  setExpression(name: ExpressionName): void {
    this.expression = name;
    this.refreshFace();
  }

  /** Swap a hand shape (the held-prop hand is managed automatically). */
  setHandPose(side: Side, pose: HandPose): void {
    this.handPose[side] = pose;
    this.rig.setSlot(`hand${side}`, `wrist${side}`, buildHand(side, pose));
    this.applyShadowFlags();
  }

  // ── Motion ───────────────────────────────────────────────────────────────

  /** Horizontal speed (m/s), grounded flag and vertical speed (m/s) from the controller. */
  setMotion(speed: number, grounded = true, verticalSpeed = 0): void {
    this.animator.setMotion(speed, grounded, verticalSpeed);
  }

  play(action: ActionName): void {
    this.animator.play(action);
    if (action === 'interact') this.setHandPose('R', 'pointing');
  }

  stop(action?: ActionName): void {
    this.animator.stop(action);
  }

  get busy(): boolean {
    return this.animator.isBusy;
  }

  /** The action currently playing (not fading out), if any. */
  get currentAction(): ActionName | null {
    return this.animator.currentAction;
  }

  update(dt: number): void {
    dt = Math.min(dt, 0.1);
    this.animator.update(dt);
    if (!this.animator.currentAction && this.handPose.R === 'pointing') this.setHandPose('R', 'relaxed');

    // Blinking.
    if (this.blinking) this.blinkIn -= dt;
    if (this.blinkIn <= 0) {
      this.blinkLeft = 0.13;
      this.blinkIn = 2 + Math.random() * 3.5;
    }
    const wasBlinking = this.blinkLeft > 0;
    this.blinkLeft = Math.max(0, this.blinkLeft - dt);
    if (wasBlinking !== this.blinkLeft > 0 || wasBlinking) this.refreshFace();

    this.object.updateMatrixWorld(true);
    for (const p of this.pendulums) p.update(dt);

    if (this.flame) {
      // Keep the flame upright in world space and let it flicker.
      const t = this.animator.time;
      this.flame.parent!.getWorldQuaternion(this.flame.quaternion).invert();
      const f = 1 + Math.sin(t * 23) * 0.08 + Math.sin(t * 37 + 1.3) * 0.06;
      this.flame.scale.set(1 + Math.sin(t * 29) * 0.06, f, 1 + Math.cos(t * 31) * 0.06);
    }
    if (this.light) {
      const t = this.animator.time;
      const base = this.outfit.held === 'torch' ? TORCH_CANDELA : LANTERN_CANDELA;
      this.light.intensity = base * this.propLightBoost * (0.88 + Math.sin(t * 17.3) * 0.06 + Math.sin(t * 29.7 + 2) * 0.05);
    }
  }

  dispose(): void {
    this.rig.dispose();
    for (const g of this.faces.values()) disposeVoxelMesh(g);
    this.faces.clear();
    this.clearProp();
    this.object.removeFromParent();
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private buildFaces(): void {
    const pivot = JOINTS.head.pivot;
    for (const e of EXPRESSIONS)
      for (const blink of [false, true]) {
        const g = buildVoxelMesh(buildFace(e, blink), {
          quality: this.rig.quality,
          name: `face:${e}${blink ? ':blink' : ''}`,
        });
        g.position.set(-pivot[0], -pivot[1], -pivot[2]);
        g.visible = false;
        this.rig.joints.head.add(g);
        this.faces.set(`${e}|${blink}`, g);
      }
  }

  private refreshFace(): void {
    const key = `${this.expression}|${this.blinkLeft > 0}`;
    for (const [k, g] of this.faces) g.visible = k === key;
  }

  private applyOutfit(next: ExplorerOutfit, first: boolean): void {
    const prev = this.outfit;
    const r = this.rig;
    const changed = (k: keyof ExplorerOutfit) => first || prev[k] !== next[k];
    this.outfit = next;

    if (changed('hat')) {
      r.setSlot('hair', 'head', buildHair(next.hat ? { clipAboveY: HAT_CLIP_Y } : {}));
      r.setSlot('hat', 'head', next.hat ? buildHat() : null);
    }
    if (changed('pack') || changed('legs') || changed('camera')) {
      r.setSlot('torso', 'chest', buildTorso({ packStraps: next.pack !== 'none', satchelStrap: true }));
      r.setSlot('pack', 'backpack', next.pack === 'none' ? null : buildBackpack(next.pack));
    }
    if (changed('camera')) r.setSlot('camera', 'camera', next.camera ? buildCamera() : null);
    if (changed('scarf')) {
      r.setSlot('scarfCollar', 'chest', next.scarf ? buildScarfCollar() : null);
      r.setSlot('scarf1', 'scarf1', next.scarf ? buildScarfTail(1) : null);
      r.setSlot('scarf2', 'scarf2', next.scarf ? buildScarfTail(2) : null);
      r.setSlot('scarf3', 'scarf3', next.scarf ? buildScarfTail(3) : null);
    }
    if (changed('legs')) {
      r.setSlot('pelvis', 'hips', buildPelvis(next.legs));
      r.setSlot('belt', 'hips', buildBelt({ pouches: true, sheath: next.legs === 'shorts' }));
      for (const s of ['L', 'R'] as Side[]) {
        r.setSlot(`thigh${s}`, `hip${s}`, buildThigh(s, next.legs));
        r.setSlot(`shin${s}`, `knee${s}`, buildShin(s, next.legs));
      }
    }
    if (changed('held')) {
      this.animator.setHold(next.held);
      this.clearProp();
      this.handPose.L = next.held === 'none' ? 'relaxed' : 'holding';
      r.setSlot('handL', 'wristL', buildHand('L', this.handPose.L));
      if (first) r.setSlot('handR', 'wristR', buildHand('R', this.handPose.R));
      if (next.held === 'lantern') this.attachLantern();
      if (next.held === 'torch') this.attachTorch();
    }
    this.rebuildPendulums();
  }

  private attachLantern(): void {
    const pivot = new Group();
    pivot.name = 'lantern:hang';
    const { frame, glass } = buildLantern();
    pivot.add(buildVoxelMesh(frame, { quality: this.rig.quality, name: 'lantern:frame' }));
    const glow = buildVoxelMesh(glass, { quality: this.rig.quality, name: 'lantern:glass', castShadow: false });
    pivot.add(glow);
    if (this.propLights) {
      this.light = new PointLight(0xffb347, LANTERN_CANDELA, 9, 2);
      this.light.position.set(0, -3.1, 1.6);
      pivot.add(this.light);
    }
    this.rig.joints.propL.add(pivot);
    this.lanternPivot = pivot;
  }

  private attachTorch(): void {
    const holder = new Group();
    holder.name = 'torch';
    holder.add(buildVoxelMesh(buildTorchHandle(), { quality: this.rig.quality, name: 'torch:handle' }));
    const flameAnchor = new Group();
    flameAnchor.position.set(0, 0, 6.4);
    const flame = buildVoxelMesh(buildFlame(), { quality: this.rig.quality, name: 'torch:flame', castShadow: false });
    flameAnchor.add(flame);
    holder.add(flameAnchor);
    if (this.propLights) {
      this.light = new PointLight(0xff9a3c, TORCH_CANDELA, 12, 2);
      this.light.position.set(0, 2.5, 0);
      flame.add(this.light);
    }
    this.rig.joints.propL.add(holder);
    this.flame = flame;
    this.lanternPivot = holder;
  }

  private clearProp(): void {
    if (this.lanternPivot) {
      disposeVoxelMesh(this.lanternPivot);
      this.lanternPivot.removeFromParent();
    }
    this.lanternPivot = null;
    this.flame = null;
    this.light = null;
  }

  private rebuildPendulums(): void {
    const j = this.rig.joints;
    const m = BODY_UNIT_M;
    this.pendulums = [];
    if (this.outfit.scarf) {
      this.pendulums.push(
        new Pendulum(j.scarf1, { length: 2.35 * m, damping: 0.93, stiffness: 0.06, maxAngle: 0.9, minForward: -0.04, limitFrame: j.chest }),
        new Pendulum(j.scarf2, { length: 2.15 * m, damping: 0.93, stiffness: 0.04, maxAngle: 0.7, minForward: -0.04, limitFrame: j.chest }),
        new Pendulum(j.scarf3, { length: 2.4 * m, damping: 0.92, stiffness: 0.03, maxAngle: 0.7, minForward: -0.04, limitFrame: j.chest }),
      );
    }
    if (this.outfit.camera)
      this.pendulums.push(new Pendulum(j.camera, { length: 5.8 * m, damping: 0.9, stiffness: 0.08, maxAngle: 0.6, minForward: 0.0, limitFrame: j.chest }));
    if (this.outfit.held === 'lantern' && this.lanternPivot)
      this.pendulums.push(new Pendulum(this.lanternPivot, { length: 3.1 * m, damping: 0.95, stiffness: 0, worldDown: true, maxAngle: 1.1 }));
  }

  private applyShadowFlags(): void {
    this.object.traverse((o) => {
      if ((o as { isMesh?: boolean }).isMesh) {
        o.castShadow = this.castShadow && !o.name.includes('glass') && !o.name.includes('flame');
        o.receiveShadow = true;
      }
    });
  }
}
