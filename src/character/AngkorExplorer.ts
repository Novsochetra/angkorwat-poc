import {
  AdditiveBlending,
  ConeGeometry,
  DoubleSide,
  Euler,
  Group,
  Matrix4,
  Mesh,
  type Object3D,
  PointLight,
  Quaternion,
  ShaderMaterial,
  SpotLight,
  Vector3,
} from 'three';
import { BODY_UNIT_M } from '../world/scale';
import type { VoxelQuality } from '../voxel/VoxelMesh';
import { buildVoxelMesh, disposeVoxelMesh } from '../voxel/VoxelMesh';
import { Animator, clampSelfieAim, type HoldKind, type SelfieGesture } from './Animator';
import type { ActionName } from './clips';
import { Pendulum } from './Dynamics';
import { buildFace, EXPRESSIONS, type ExpressionName } from './parts/face';
import { buildBackpack, buildCamera, buildCameraStraps, type PackStyle } from './parts/gear';
import { buildHair, hairCovers } from './parts/hair';
import { buildHead, buildNeck } from './parts/head';
import { buildFoot, buildForearm, buildHand, buildPelvis, buildShin, buildThigh, buildUpperArm, type HandPose, type LegStyle, type Side } from './parts/limbs';
import { buildFlame, buildFlashlight, buildHat, buildLantern, buildPhone, buildSelfieStick, buildTorchHandle, HAT_CLIP_Y, PHONE_LENS, STICK_JOINT } from './parts/props';
import { buildScarfCollar, buildScarfTail } from './parts/scarf';
import { buildBelt, buildTorso } from './parts/torso';
import { Rig } from './Rig';
import { JOINTS } from './skeleton';

/** Prop light strengths (candela). Tuned so they light a dark temple interior
 *  within a few metres without blowing out the explorer holding them. */
const LANTERN_CANDELA = 0.55;
const TORCH_CANDELA = 0.9;
/** Flashlight: a narrow, bright beam that reaches across a gallery. */
const FLASHLIGHT_CANDELA = 18;
const FLASHLIGHT_ANGLE = 0.36;
const FLASHLIGHT_RANGE = 32;
/** "Straight ahead" tips the beam a little down, onto the path in front. */
const AHEAD_PITCH = -0.12;
/** Longest the visible beam gets (m). */
const BEAM_MAX = 9;

const _a = new Vector3();
const _s = new Vector3();
const _up = new Vector3();
const _face = new Vector3();
const _lens = new Vector3();
const _cu = new Vector3();
const _joint = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _m = new Matrix4();
const _e = new Euler(0, 0, 0, 'YXZ');

/** Head space (BU): where the selfie phone and its lens look, the middle of the face. */
const SELFIE_LOOK = new Vector3(0, 4.2, 2.0);
/** The lens point, a hair in front of the phone's glass. */
const LENS_POINT = new Vector3(PHONE_LENS[0], PHONE_LENS[1], PHONE_LENS[2] + 0.1);
/** The glowing part of each held prop, in the prop's frame (BU). */
const GLOW_AT = { lantern: new Vector3(0, -3.05, 0), torch: new Vector3(0, 1.6, 0), flashlight: new Vector3(0, 0, 4.0) };
/** Slots of the arm holding the phone (hidden with `hidePhone`). */
const PHONE_ARM = ['upperArmR', 'forearmR', 'handR'] as const;
/** The free hand's shape for each selfie gesture. */
const GESTURE_HAND: Record<SelfieGesture, HandPose> = { peace: 'peace', wave: 'open', thumbsUp: 'thumbsUp', none: 'relaxed' };

/**
 * Where the selfie phone is, round the head: `yaw` (radians, + = toward his
 * left, 0 = straight in front), `pitch` (+ = above the eyes) and `reach` 0‥1
 * (how far the arm is stretched; 1 = the full arm).
 */
export interface SelfieAim {
  yaw: number;
  pitch: number;
  reach: number;
}

export type { HoldKind, SelfieGesture } from './Animator';

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
  withFlashlight: { hat: false, scarf: true, camera: true, pack: 'default', legs: 'shorts', held: 'flashlight' },
} as const satisfies Record<string, ExplorerOutfit>;
export type OutfitName = keyof typeof OUTFITS;

export interface ExplorerOptions {
  quality?: VoxelQuality;
  outfit?: OutfitName | Partial<ExplorerOutfit>;
  expression?: ExpressionName;
  /** Point lights for lantern / torch, spot light for the flashlight (turn off for thumbnails). */
  propLights?: boolean;
  /** The flashlight's visible beam cone (default: with `propLights`). */
  beam?: boolean;
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
  /**
   * Where the flashlight points: a world point, or null for straight ahead of
   * the explorer. The arm, chest and head turn toward it.
   */
  aimPoint: Vector3 | null = null;
  /** How far the beam goes before it hits something (m); the game sets it from a ray. */
  beamReach = BEAM_MAX;
  /**
   * Where the selfie phone goes round the head (see `SelfieAim`). Kept in
   * what the arm can do: `update` clamps it in place. Eased like the flashlight.
   */
  readonly selfieAim: SelfieAim = { yaw: -0.75, pitch: 0.1, reach: 1 };
  private phoneHidden = false;
  private readonly selfieEased: SelfieAim = { ...this.selfieAim };
  /** The selfie stick (built on first use): its handle and pole under the right fist, its clamp on the phone. */
  private stick: { grip: Group; shaft: Group; clamp: Group } | null = null;
  private readonly scaler = new Group();
  private outfit: ExplorerOutfit = { ...OUTFITS.default };
  private expression: ExpressionName = 'neutral';
  private readonly faces = new Map<string, Group>();
  private blinkIn = 2.5;
  private blinkLeft = 0;
  private pendulums: Pendulum[] = [];
  /** The held prop (lantern, torch or flashlight), under the left fist. */
  private propRoot: Group | null = null;
  private flame: Group | null = null;
  private light: PointLight | SpotLight | null = null;
  private beam: Mesh<ConeGeometry, ShaderMaterial> | null = null;
  private aimYaw = 0;
  private aimPitch = AHEAD_PITCH;
  private readonly propLights: boolean;
  private readonly beamOn: boolean;
  private readonly handPose: Record<Side, HandPose> = { L: 'relaxed', R: 'relaxed' };
  private readonly castShadow: boolean;
  /** The selfie phone in the right fist (built on the first selfie, then shown / hidden). */
  private phone: Group | null = null;
  /** The face from before the selfie, put back after it (null once the caller picks another). */
  private faceBeforeSelfie: ExpressionName | null = null;
  private selfieUp = false;

  constructor(opts: ExplorerOptions = {}) {
    this.object.name = 'AngkorExplorer';
    this.scaler.name = 'explorer:bodyUnits';
    this.scaler.scale.setScalar(BODY_UNIT_M);
    this.object.add(this.scaler);
    this.rig = new Rig(this.scaler, opts.quality ?? 'high');
    this.animator = new Animator(this.rig);
    this.propLights = opts.propLights ?? true;
    this.beamOn = opts.beam ?? this.propLights;
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
    this.faceBeforeSelfie = null;
    this.showExpression(name);
  }

  /**
   * Hide the phone and the arm holding it (still "out": `phoneLens` works),
   * e.g. while the view is a selfie camera behind the phone: his arm is too
   * short to reach out of that picture, so it would end in mid-air.
   */
  get hidePhone(): boolean {
    return this.phoneHidden;
  }

  set hidePhone(hidden: boolean) {
    this.phoneHidden = hidden;
    this.showPhoneMeshes(!!this.phone?.visible);
  }

  /** Which gesture the free (left) hand makes in a selfie. */
  get selfieGesture(): SelfieGesture {
    return this.animator.selfieGesture;
  }

  set selfieGesture(g: SelfieGesture) {
    this.animator.selfieGesture = g;
  }

  /**
   * The selfie phone is on a telescopic stick: it goes much further out
   * (`selfieAim.reach` slides the pole out) and further round him, high
   * over him or low; the fist holds the stick's handle near his body.
   */
  get selfieStick(): boolean {
    return this.animator.selfieStick;
  }

  set selfieStick(on: boolean) {
    this.animator.selfieStick = on;
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
    if (action === 'photo') {
      this.setHandPose('R', 'holding');
      if (this.outfit.held === 'none') this.setHandPose('L', 'holding');
    }
    if (action === 'selfie' && !this.selfieUp) {
      this.selfieUp = true;
      this.setHandPose('R', 'holding');
      clampSelfieAim(this.selfieAim, this.selfieStick);
      Object.assign(this.selfieEased, this.selfieAim);
      // Smile for the selfie (the old face comes back after, unless someone picks another).
      const before = this.expression;
      this.showExpression('happy');
      this.faceBeforeSelfie = before;
    }
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

  /**
   * The phone's front camera (world) and an orientation for a three.js camera
   * there looking back at the face (cameras look down −Z). False when no
   * phone is out.
   */
  phoneLens(pos: Vector3, quat: Quaternion): boolean {
    const phone = this.phone;
    if (!phone?.visible) return false;
    phone.updateWorldMatrix(true, false);
    phone.localToWorld(pos.copy(LENS_POINT));
    const head = this.rig.joints.head;
    head.updateWorldMatrix(true, false);
    head.localToWorld(_face.copy(SELFIE_LOOK));
    // (not the phone's own up, which rolls as it comes up: a level picture)
    quat.setFromRotationMatrix(_m.lookAt(pos, _face, this.pictureUp(pos, _face, _up)));
    return true;
  }

  /**
   * "Up" of the selfie picture seen from `from` looking at `to` (world): the
   * world's up, so the horizon stays level however he stands, sits or lies
   * (face down under the hang glider); only looking almost straight up or
   * down does it turn to his chest's up.
   */
  private pictureUp(from: Vector3, to: Vector3, out: Vector3): Vector3 {
    const steep = Math.abs(to.y - from.y) / Math.max(1e-6, from.distanceTo(to));
    const k = Math.min(1, Math.max(0, (steep - 0.85) / 0.12));
    _cu.set(0, 1, 0).transformDirection(this.rig.joints.chest.matrixWorld);
    return out.set(0, 1, 0).lerp(_cu, k).normalize();
  }

  /**
   * Where the held prop glows (world): the lantern glass, the torch flame, the
   * flashlight lens. Returns what is held; for 'none' `out` is left as it is.
   */
  propGlowPoint(out: Vector3): HoldKind {
    const held = this.outfit.held;
    const node = held === 'torch' ? this.flame : this.propRoot;
    if (held === 'none' || !node) return held;
    node.updateWorldMatrix(true, false);
    node.localToWorld(out.copy(GLOW_AT[held]));
    return held;
  }

  /** Where the flashlight beam starts and which way it points (world). */
  flashlightRay(origin: Vector3, dir: Vector3): boolean {
    if (!this.propRoot || this.outfit.held !== 'flashlight') return false;
    this.propRoot.getWorldPosition(origin);
    dir.set(0, 0, 1).applyQuaternion(this.propRoot.getWorldQuaternion(_q));
    return true;
  }

  /** Show or hide the explorer's blocks (not his lights), e.g. while the view is through his camera. */
  setBodyVisible(visible: boolean): void {
    this.object.traverse((o) => {
      if ((o as Mesh).isMesh) o.visible = visible;
    });
  }

  update(dt: number): void {
    dt = Math.min(dt, 0.1);
    const photo = this.animator.currentAction === 'photo';
    if (this.outfit.held === 'flashlight' || photo) this.steerAim(dt);
    const selfie = this.animator.currentAction === 'selfie';
    if (selfie || this.animator.selfieWeight > 0) this.steerSelfie(dt);
    if (selfie && this.outfit.held === 'none' && this.handPose.L !== GESTURE_HAND[this.selfieGesture]) this.setHandPose('L', GESTURE_HAND[this.selfieGesture]);
    if (this.selfieUp && !selfie) {
      // The selfie is over: back to the face from before it.
      this.selfieUp = false;
      if (this.faceBeforeSelfie) this.showExpression(this.faceBeforeSelfie);
      this.faceBeforeSelfie = null;
    }
    this.animator.update(dt);
    if (!this.animator.currentAction && this.animator.photoHold.weight === 0 && this.animator.selfieWeight === 0) {
      if (this.handPose.R !== 'relaxed') this.setHandPose('R', 'relaxed');
      if (this.outfit.held === 'none' && this.handPose.L !== 'relaxed') this.setHandPose('L', 'relaxed');
    }

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
    this.raiseCamera();
    this.placePhone();

    if (this.flame) {
      // Keep the flame upright in world space and let it flicker.
      const t = this.animator.time;
      this.flame.parent!.getWorldQuaternion(this.flame.quaternion).invert();
      const f = 1 + Math.sin(t * 23) * 0.08 + Math.sin(t * 37 + 1.3) * 0.06;
      this.flame.scale.set(1 + Math.sin(t * 29) * 0.06, f, 1 + Math.cos(t * 31) * 0.06);
    }
    if (this.outfit.held === 'flashlight') this.pointFlashlight();
    else if (this.light) {
      const t = this.animator.time;
      const base = this.outfit.held === 'torch' ? TORCH_CANDELA : LANTERN_CANDELA;
      this.light.intensity = base * this.propLightBoost * (0.88 + Math.sin(t * 17.3) * 0.06 + Math.sin(t * 29.7 + 2) * 0.05);
    }
  }

  dispose(): void {
    this.rig.dispose();
    if (this.phone) disposeVoxelMesh(this.phone);
    if (this.stick) for (const g of [this.stick.grip, this.stick.shaft]) disposeVoxelMesh(g);
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

  private showExpression(name: ExpressionName): void {
    this.expression = name;
    this.refreshFace();
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
    if (changed('camera')) {
      r.setSlot('camera', 'camera', next.camera ? buildCamera() : null);
      r.setSlot('cameraStrap', 'camera', next.camera ? buildCameraStraps() : null);
    }
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
      if (next.held === 'flashlight') this.attachFlashlight();
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
    this.propRoot = pivot;
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
    this.propRoot = holder;
  }

  private attachFlashlight(): void {
    const holder = new Group();
    holder.name = 'flashlight:hold';
    const { body, lens } = buildFlashlight();
    holder.add(buildVoxelMesh(body, { quality: this.rig.quality, name: 'flashlight:body' }));
    holder.add(buildVoxelMesh(lens, { quality: this.rig.quality, name: 'flashlight:glass', castShadow: false }));
    if (this.beamOn) {
      this.beam = buildBeam();
      this.beam.position.set(0, 0, 4.1);
      holder.add(this.beam);
    }
    if (this.propLights) {
      const light = new SpotLight(0xfff1dc, FLASHLIGHT_CANDELA, FLASHLIGHT_RANGE, FLASHLIGHT_ANGLE, 0.5, 2);
      light.name = 'flashlight';
      light.position.set(0, 0, 4.2);
      light.target.position.set(0, 0, 40);
      light.castShadow = true;
      light.shadow.mapSize.set(1024, 1024);
      light.shadow.camera.near = 0.15;
      light.shadow.camera.far = FLASHLIGHT_RANGE;
      light.shadow.bias = -0.0004;
      light.shadow.normalBias = 0.02;
      holder.add(light, light.target);
      this.light = light;
    }
    this.rig.joints.propL.add(holder);
    this.propRoot = holder;
  }

  private clearProp(): void {
    if (this.propRoot) {
      disposeVoxelMesh(this.propRoot);
      this.propRoot.removeFromParent();
      (this.light as SpotLight | null)?.shadow?.dispose();
    }
    if (this.beam) {
      this.beam.geometry.dispose();
      this.beam.material.dispose();
    }
    this.propRoot = null;
    this.flame = null;
    this.light = null;
    this.beam = null;
  }

  /**
   * Photo pose: bring the neck camera up to the eye (where the animator put
   * the hands), swinging out in front of the chin on the way. The straps hide
   * while it's up.
   */
  private raiseCamera(): void {
    const hold = this.animator.photoHold;
    const strap = this.rig.getSlot('cameraStrap');
    if (strap) strap.visible = hold.weight < 0.02;
    if (hold.weight <= 0 || !this.outfit.camera) return;
    const j = this.rig.joints.camera;
    const w = hold.weight * hold.weight * (3 - 2 * hold.weight);
    hold.matrix.decompose(_a, _q, _s);
    j.position.lerp(_a, w);
    j.position.z += Math.sin(Math.PI * w) * 1.6;
    j.quaternion.slerp(_q, w);
  }

  /**
   * Selfie: show the phone in the right fist while it's up, turned so the
   * screen faces the face (from the fist's own frame as the arm comes up).
   */
  private placePhone(): void {
    const w = this.animator.selfieWeight;
    if (w <= 0) {
      if (this.phone?.visible) {
        this.phone.visible = false;
        this.showPhoneMeshes(false);
      }
      return;
    }
    const phone = (this.phone ??= this.buildPhoneProp());
    phone.visible = true;
    this.showPhoneMeshes(true);
    const fist = phone.parent!;
    this.rig.joints.head.localToWorld(_face.copy(SELFIE_LOOK));
    const k = w * w * (3 - 2 * w);
    if (this.selfieStick) {
      this.placeOnStick(fist, k);
      return;
    }
    // Aim from the grip, then again from the lens it gives.
    phone.position.set(0, 0, 0);
    fist.getWorldPosition(_a);
    this.pictureUp(_a, _face, _up);
    for (let i = 0; i < 2; i++) {
      _q.setFromRotationMatrix(_m.lookAt(_face, _a, _up));
      _q.premultiply(fist.getWorldQuaternion(_q2).invert());
      phone.quaternion.identity().slerp(_q, k);
      phone.updateMatrixWorld(true);
      phone.localToWorld(_a.copy(LENS_POINT));
    }
  }

  /**
   * The phone at the end of the stick: its lens where the animator put it
   * (`stickLens`, eased out of the fist as the selfie comes up), turned to
   * the face and level with the world; the pole from the fist to the clamp.
   * Written in the fist's frame (BU), from world points.
   */
  private placeOnStick(fist: Object3D, k: number): void {
    const phone = this.phone!;
    const stick = (this.stick ??= this.buildStick());
    const chest = this.rig.joints.chest;
    // (the lens eases out from the fist as the phone comes up)
    fist.getWorldPosition(_a);
    chest.localToWorld(_lens.copy(this.animator.stickLens)).lerp(_a, 1 - k);
    this.pictureUp(_lens, _face, _up);
    // Everything in the fist's frame.
    fist.updateWorldMatrix(true, false);
    _m.copy(fist.matrixWorld).invert();
    _lens.applyMatrix4(_m);
    _face.applyMatrix4(_m);
    fist.getWorldQuaternion(_q2).invert();
    _up.applyQuaternion(_q2);
    // Phone +Z to the face, then its origin back from the lens.
    phone.quaternion.setFromRotationMatrix(_m.lookAt(_face, _lens, _up));
    phone.position.copy(_lens).sub(_a.copy(LENS_POINT).applyQuaternion(phone.quaternion));
    phone.updateMatrixWorld(true);
    // The pole: from the fist (the origin here) to the clamp's joint.
    _joint.set(...STICK_JOINT).applyQuaternion(phone.quaternion).add(phone.position);
    const len = Math.max(0.5, _joint.length());
    _q.setFromUnitVectors(_a.set(0, 1, 0), _s.copy(_joint).divideScalar(len));
    stick.shaft.quaternion.copy(_q);
    stick.shaft.scale.set(1, len, 1);
    stick.grip.quaternion.copy(_q);
    for (const g of [stick.shaft, stick.grip]) g.updateMatrixWorld(true);
  }

  /** Phone and the arm holding it: shown with the phone out unless `hidePhone` (on a stick the arm stays: it is in the picture). */
  private showPhoneMeshes(out: boolean): void {
    if (this.phone) for (const c of this.phone.children) c.visible = c.name === 'stick:clamp' ? this.selfieStick && !this.phoneHidden : !this.phoneHidden;
    const onStick = out && this.selfieStick;
    for (const slot of PHONE_ARM) {
      const g = this.rig.getSlot(slot);
      if (g) g.visible = !(out && this.phoneHidden && !onStick);
    }
    if (this.stick) this.stick.grip.visible = this.stick.shaft.visible = onStick;
  }

  private buildStick(): { grip: Group; shaft: Group; clamp: Group } {
    const { grip, shaft, clamp } = buildSelfieStick();
    const q = this.rig.quality;
    const make = (b: typeof grip, name: string) => {
      const g = new Group();
      g.name = name;
      g.add(buildVoxelMesh(b, { quality: q, name, castShadow: this.castShadow }));
      return g;
    };
    const s = { grip: make(grip, 'stick:grip'), shaft: make(shaft, 'stick:shaft'), clamp: make(clamp, 'stick:clamp') };
    this.rig.joints.propR.add(s.grip, s.shaft);
    this.phone!.add(s.clamp);
    this.showPhoneMeshes(true);
    return s;
  }

  private buildPhoneProp(): Group {
    const holder = new Group();
    holder.name = 'phone';
    const { body, screen } = buildPhone();
    holder.add(buildVoxelMesh(body, { quality: this.rig.quality, name: 'phone:body', castShadow: this.castShadow }));
    holder.add(buildVoxelMesh(screen, { quality: this.rig.quality, name: 'phone:screen', castShadow: false }));
    this.rig.joints.propR.add(holder);
    holder.updateMatrixWorld(true);
    return holder;
  }

  /** Ease the selfie phone's place toward `selfieAim` (kept within the arm's reach). */
  private steerSelfie(dt: number): void {
    clampSelfieAim(this.selfieAim, this.selfieStick);
    const k = 1 - Math.exp(-dt * 10);
    const a = this.selfieAim;
    const e = this.selfieEased;
    e.yaw += (a.yaw - e.yaw) * k;
    e.pitch += (a.pitch - e.pitch) * k;
    e.reach += (a.reach - e.reach) * k;
    this.animator.setSelfie(e.yaw, e.pitch, e.reach);
  }

  /** Ease the flashlight's aim toward `aimPoint` (or straight ahead), within the arm's reach. */
  private steerAim(dt: number): void {
    let yaw = 0;
    let pitch = AHEAD_PITCH;
    if (this.aimPoint) {
      // From the beam's start, in the explorer's own frame.
      (this.propRoot ?? this.rig.joints.shoulderL).getWorldPosition(_a);
      _a.subVectors(this.aimPoint, _a).applyQuaternion(this.object.getWorldQuaternion(_q).invert());
      yaw = Math.atan2(_a.x, _a.z);
      pitch = Math.atan2(_a.y, Math.hypot(_a.x, _a.z));
    }
    yaw = Math.min(1.45, Math.max(-1.2, yaw));
    pitch = Math.min(1.25, Math.max(-1.0, pitch));
    const k = 1 - Math.exp(-dt * 12);
    this.aimYaw += (yaw - this.aimYaw) * k;
    this.aimPitch += (pitch - this.aimPitch) * k;
    this.animator.setAim(this.aimYaw, this.aimPitch);
  }

  /**
   * Turn the flashlight in the fist so the beam points exactly along the aim,
   * whatever the arm swing is doing — the beam stays steady while he walks.
   */
  private pointFlashlight(): void {
    const holder = this.propRoot;
    if (!holder) return;
    this.object.getWorldQuaternion(_q).multiply(_q2.setFromEuler(_e.set(-this.aimPitch, this.aimYaw, 0)));
    holder.parent!.getWorldQuaternion(_q2).invert();
    holder.quaternion.copy(_q2.multiply(_q));
    holder.updateMatrixWorld(true);
    if (this.light) this.light.intensity = FLASHLIGHT_CANDELA * (1 + (this.propLightBoost - 1) * 0.5);
    if (this.beam) {
      const len = Math.max(0.3, Math.min(BEAM_MAX, this.beamReach)) / BODY_UNIT_M;
      const r = len * Math.tan(FLASHLIGHT_ANGLE * 0.8);
      this.beam.scale.set(r, r, len);
      this.beam.material.uniforms.strength.value = Math.min(0.14, 0.02 * this.propLightBoost);
    }
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
    if (this.outfit.held === 'lantern' && this.propRoot)
      this.pendulums.push(new Pendulum(this.propRoot, { length: 3.1 * m, damping: 0.95, stiffness: 0, worldDown: true, maxAngle: 1.1 }));
  }

  private applyShadowFlags(): void {
    this.object.traverse((o) => {
      if ((o as { isMesh?: boolean }).isMesh) {
        const glow = /glass|flame|beam|screen/.test(o.name);
        o.castShadow = this.castShadow && !glow;
        o.receiveShadow = !o.name.includes('beam');
      }
    });
  }
}

/**
 * Faint cone of light in front of the lens (1 long, 1 wide at the end; scaled
 * to the beam). Added on top of the scene, brightest near the lens and down the
 * middle, fading out toward the far end and the sides.
 */
function buildBeam(): Mesh<ConeGeometry, ShaderMaterial> {
  const geo = new ConeGeometry(1, 1, 24, 1, true);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, 0, 0.5);
  const mat = new ShaderMaterial({
    uniforms: { strength: { value: 0.02 }, color: { value: [1, 0.93, 0.8] } },
    vertexShader: /* glsl */ `varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){ vT = position.z; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `uniform float strength; uniform vec3 color; varying float vT; varying vec3 vN; varying vec3 vV;
      void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.5);
        float fade = pow(1.0 - vT, 1.8) * smoothstep(0.0, 0.08, vT);
        gl_FragColor = vec4(color * strength * edge * fade, 1.0); }`,
    transparent: true,
    blending: AdditiveBlending,
    depthWrite: false,
    side: DoubleSide,
  });
  const cone = new Mesh(geo, mat);
  cone.name = 'flashlight:beam';
  cone.castShadow = false;
  cone.receiveShadow = false;
  cone.renderOrder = 10;
  return cone;
}
