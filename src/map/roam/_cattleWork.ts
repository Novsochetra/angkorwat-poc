import { Euler, Group, Quaternion } from 'three';
import { farmBody, farmPose } from '../../character/farmWork';
import { applyHugCarry, HUG_BUNDLE } from '../../character/cattleCarry';
import { hash3 } from '../../voxel/random';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh } from '../../voxel/VoxelMesh';
import { WALK_SPEED } from '../../world/scale';
import { SFX } from '../audio/addonSfx';
import { STAKES } from '../cattle/plan';
import { CATTLE, type Cow } from '../cattle/state';
import { SURFACE } from '../heightfield';
import { HOME_AT } from '../hamlet/_homePlan';
import { pad } from '../pad/pad';
import { t } from '../ui/lang';
import type { AddonEnv, AddonHold, AddonKey } from './_addons';
import type { Beast, CattleHerd } from './_cattleHerd';
import { FarmProps } from './_farmProps';
import { angleDiff } from './followCam';
import type { RoamCtx, RoamWorld } from './types';

/**
 * His work for his cattle (roam/_cattle.ts holds him through it): cutting grass
 * on the meadow, carrying the bundle, laying food before a hungry cow.
 *
 * - **Cutting** (hold E on the meadow near home when a cow of his is hungry): he
 *   bends right over as the farmers reap (character/farmWork.ts `reap`), the
 *   farmer's sickle (កណ្ដៀវ: _farmProps.ts) in his right hand; his left grips a
 *   fistful of grass, the sickle draws through it under the fist (a swish and a
 *   rip: `cattleCut`), and the fistful comes back to the bunch in his left hand,
 *   bigger each time; four fistfuls make a bundle: he straightens, twists it
 *   round (`cattleBundle`) and takes it up in both arms against his chest. Let
 *   go of E (or push the stick) and he stands up; what he cut stays in his hand
 *   until he cuts on, or goes.
 * - **Carrying** the bundle: in both arms as he walks (character/cattleCarry.ts
 *   `applyHugCarry`; his lights are away); by a hungry cow, E feeds it. Another
 *   ride or rest, or back to the map: he puts it down (it is gone).
 * - **Feeding** (E by a hungry cow's head: grass he carries, or a bundle of straw
 *   from his stock under the house): he steps before its nose, facing it, bends
 *   and lays the bundle down there (farmWork's `lay`, the bundle in his left
 *   hand: `cattleLay`), straightens; the cow lowers its head and eats from the
 *   heap (the herd: roam/_cattleHerd.ts `feed`) — fed for the day.
 *
 * Props: the sickle is the farm's; the bundles (grass, straw) and the fistfuls
 * are made here, once each, in his blocks (BU: the fist's middle, or his chest).
 */

/** Fistfuls to a bundle; a cut's time (s); bending down, straightening (s). */
export const CUTS = 4;
const CUT_S = 1.05;
const BEND_S = 0.45;
const UP_S = 0.55;
/** Laying a bundle down (s), when it leaves his hand (share of it). */
const LAY_S = 1.5;
const LAY_DROP = 0.5;
/** He stands this far before the heap (m), facing the cow; walks there at most this long (s). */
const BEFORE = 1.0;
const GO_MAX = 3;
/** The stick held over this far stops him. */
const PUSH = 0.5;
/** The camera at the work: round to his right side and a little before him, above, nearer; eased for this long (s). */
const FRAME = { side: 1.25, pitch: 0.36, distance: 6.4, rate: 2.4 };
const FRAME_FOR = 2.6;

const GRASS = [0x5e9a36, 0x4c8a2c, 0x6eaa40, 0x58923a, 0x7ab84a];
const STRAW = [0xd6b866, 0xc9a854, 0xe2c878, 0xbf9d4a, 0xe8d090];
const GRASS_TIE = 0x3f6a24;
const STRAW_TIE = 0x8a6430;

/** A bundle lying across (along x), its middle at (cx, cy, cz) (BU), its blades fanning at its ends, a twist tied round it. */
function bundleBuilder(what: 'grass' | 'straw', cx: number, cy: number, cz: number, len: number): VoxelBuilder {
  const b = new VoxelBuilder();
  const cols = what === 'grass' ? GRASS : STRAW;
  const thick = what === 'grass' ? 2.5 : 2.2;
  for (let i = 0; i < 18; i++) {
    const r = (k: number) => hash3(i, k, what === 'grass' ? 3 : 4, 7301);
    const a = i * 2.39996;
    const rad = thick * 0.42 * Math.sqrt((i + 0.5) / 18);
    const oy = Math.sin(a) * rad;
    const oz = Math.cos(a) * rad;
    const l = len * (0.86 + 0.18 * r(1));
    // (each blade a little askew, the ends fanning out)
    b.box(cx + (r(2) - 0.5) * 0.8, cy + oy, cz + oz, l, 0.42, 0.42, cols[Math.floor(r(3) * cols.length)], 'foliage', { ry: (r(4) - 0.5) * 0.12, rz: (r(5) - 0.5) * 0.12 });
  }
  for (const e of [-1, 1]) {
    for (let k = 0; k < 5; k++) {
      const r = (q: number) => hash3(k, q, e + 9, 7302);
      b.box(cx + e * (len * 0.48), cy + (r(1) - 0.5) * thick * 1.4, cz + (r(2) - 0.5) * thick * 1.3, 1.3, 0.36, 0.36, cols[Math.floor(r(3) * cols.length)], 'foliage', { rz: e * (r(4) - 0.5) * 0.9, ry: (r(5) - 0.5) * 0.6 });
    }
  }
  b.box(cx, cy, cz, 0.9, thick + 0.35, thick + 0.35, what === 'grass' ? GRASS_TIE : STRAW_TIE, 'hat');
  b.box(cx + 0.4, cy + thick * 0.45, cz, 0.5, 0.5, 0.5, what === 'grass' ? GRASS_TIE : STRAW_TIE, 'hat', { rz: 0.6 });
  return b;
}

/** The fistful of cut grass in his left hand (`n` of `CUTS`): the cut ends down under the fist, the blades up and leaning out. */
function fistBuilder(n: number): VoxelBuilder {
  const b = new VoxelBuilder();
  const k = n / CUTS;
  const w = 0.8 + 1.8 * Math.sqrt(k);
  const blades = 4 + Math.round(12 * k);
  for (let i = 0; i < blades; i++) {
    const r = (q: number) => hash3(i, q, n, 7303);
    const a = (i / blades) * Math.PI * 2 * 2.618 + r(1);
    const rad = w * 0.38 * Math.sqrt((i + 0.5) / blades);
    const len = 6 + r(2) * 2;
    const lean = 0.1 + 0.3 * r(3);
    b.box(Math.cos(a) * rad, -1.6 + len / 2, Math.sin(a) * rad, 0.36, len, 0.36, GRASS[Math.floor(r(4) * GRASS.length)], 'foliage', { rx: Math.sin(a) * lean, rz: -Math.cos(a) * lean });
  }
  return b;
}

type Phase = 'bend' | 'cut' | 'up' | 'go' | 'lay' | 'done';

interface Work {
  kind: 'cut' | 'feed';
  phase: Phase;
  t: number;
  /** Cutting: this cut's time; E is still held. */
  ct: number;
  /** Feeding: the cow (its beast), what he lays (grass he carries, straw from his stock), where he stands, the heap's place. */
  beast: Beast | null;
  cow: Cow | null;
  what: 'grass' | 'straw';
  sx: number;
  sz: number;
  hx: number;
  hy: number;
  hz: number;
  dropped: boolean;
  /** A check's still: time stands at `t`. */
  frozen: boolean;
}

const _q = new Quaternion();
const _q2 = new Quaternion();
const _e = new Euler();
const _nose = { x: 0, y: 0, z: 0 };

const damp = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

export class CattleWork {
  /** The work under way (it holds him), or null. */
  w: Work | null = null;
  /** He carries a bundle of grass in his arms. */
  carrying = false;
  /** Fistfuls cut so far toward the next bundle (kept while he stands about the meadow). */
  cutN = 0;
  private cutAt = { x: 0, z: 0 };
  private readonly body = farmBody('reap');
  private readonly posture = () => farmPose(this.body);
  private props: FarmProps | null = null;
  /** The bundles (grass, straw) on his chest or in his hand, the fistfuls: made once each. */
  private hug: Record<'grass' | 'straw', Group | null> = { grass: null, straw: null };
  private inHand: Record<'grass' | 'straw', Group | null> = { grass: null, straw: null };
  private fists: (Group | null)[] = [null, null, null, null, null];
  /** What hangs where now (so a slot is set only on a change). */
  private chestHas: 'grass' | 'straw' | null = null;
  private handHas: string | null = null;
  /** The hug's weight (eased). */
  private hugW = 0;
  /** The camera: how long it has eased to the work's side; a check's still keeps its own view (`rcam=`). */
  private framed = 0;
  keepView = false;
  /** E held (the keyboard's E or Enter, the pad's □, the touch Use button). */
  private readonly keys = { key: false, touch: false };
  private wired = false;
  private readonly keysHelp: readonly AddonKey[] = [
    ['E', 'cattleCutHold', 'west'],
    ['W A S D', 'cattleKeyStop', 'lstick'],
  ];

  constructor(
    private readonly env: AddonEnv,
    private readonly herd: CattleHerd,
  ) {}

  get active(): boolean {
    return this.w !== null;
  }

  /** E held now. */
  held(): boolean {
    return this.keys.key || this.keys.touch || pad.held('west');
  }

  wire(): void {
    if (this.wired || typeof window === 'undefined') return;
    this.wired = true;
    addEventListener('keydown', (e) => {
      if ((e.code === 'KeyE' || e.code === 'Enter') && !e.repeat) this.keys.key = true;
    });
    addEventListener('keyup', (e) => {
      if (e.code === 'KeyE' || e.code === 'Enter') this.keys.key = false;
    });
    addEventListener('blur', () => (this.keys.key = this.keys.touch = false));
    addEventListener(
      'pointerdown',
      (e) => {
        if ((e.target as HTMLElement | null)?.closest?.('.rt-use')) this.keys.touch = true;
      },
      true,
    );
    const up = () => (this.keys.touch = false);
    addEventListener('pointerup', up, true);
    addEventListener('pointercancel', up, true);
  }

  // ── Where he may cut ────────────────────────────────────────────────────────

  /** He may cut grass here (feet at x, z): the meadow within 14 m of his stakes, on grass, off paths, water, plants and what is built. */
  static canCut(world: RoamWorld, x: number, y: number, z: number, plantNear: (x: number, z: number, r: number) => boolean): boolean {
    const f = world.field;
    const home = Math.hypot(x - HOME_AT.x, z - HOME_AT.z);
    let stake = Infinity;
    for (const s of STAKES) stake = Math.min(stake, Math.hypot(x - s[0], z - s[1]));
    // (the meadow round his stakes: by his cows, where the grass is theirs; elsewhere E is the garden's or building's)
    if (stake > 14 || home < 9) return false;
    const c = f.index(x, z);
    if (c < 0 || f.trail[c] || f.surface[c] !== SURFACE.grass) return false;
    if (Math.abs(y - f.heightAt(x, z)) > 0.35) return false;
    // (the grass before him: off paths and water, his plants, anything built)
    for (let k = 0; k < 4; k++) {
      const px = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const pz = z + (k === 2 ? 1 : k === 3 ? -1 : 0);
      const cc = f.index(px, pz);
      if (cc < 0 || f.trail[cc] || f.surface[cc] === SURFACE.path || f.waterAt(px, pz) !== null || world.waterAt(px, pz) !== null) return false;
    }
    if (world.groundAt(x, z) - f.heightAt(x, z) > 0.3) return false;
    return !plantNear(x, z, 0.9);
  }

  // ── Starting ───────────────────────────────────────────────────────────────

  /** Start cutting where he stands (E held). */
  startCut(ctx: RoamCtx): void {
    const b = ctx.body;
    if (Math.hypot(b.pos.x - this.cutAt.x, b.pos.z - this.cutAt.z) > 6) this.cutN = 0;
    this.cutAt.x = b.pos.x;
    this.cutAt.z = b.pos.z;
    this.wire();
    this.framed = 0;
    this.w = { kind: 'cut', phase: 'bend', t: 0, ct: 0, beast: null, cow: null, what: 'grass', sx: 0, sz: 0, hx: 0, hy: 0, hz: 0, dropped: false, frozen: false };
    const ex = this.env.explorer;
    this.body.kind = 'reap';
    this.body.bend = 0;
    this.body.act = -1;
    this.body.lay = 0;
    this.body.offer = 0;
    this.body.step = -1;
    this.body.spot.set(0.6, 0, 7);
    // (the clump of grass before him: a fresh one where he starts, or the one he was cutting)
    const c = this.herd.clump;
    if (this.cutN === 0 || !c.on) {
      const f = b.yaw;
      c.x = b.pos.x + Math.sin(f) * 0.55;
      c.z = b.pos.z + Math.cos(f) * 0.55;
      c.y = this.env.world.field.heightAt(c.x, c.z);
      c.yaw = f;
      c.cut = this.cutN;
      c.on = true;
    }
    c.since = this.herd.time;
    ex.animator.posture = this.posture;
    ex.animator.postureFeet = false;
    b.vel.set(0, 0, 0);
  }

  /** Start feeding cow `beast` (grass he carries, or straw from his stock). */
  startFeed(ctx: RoamCtx, beast: Beast, what: 'grass' | 'straw'): void {
    const cow = beast.cow;
    if (!cow) return;
    this.herd.nose(beast, _nose);
    const fx = Math.sin(beast.yaw);
    const fz = Math.cos(beast.yaw);
    let sx = _nose.x + fx * BEFORE;
    let sz = _nose.z + fz * BEFORE;
    // (no room before its nose — a wall, the trough's rail —: from where he is)
    const g = ctx.world.standAt?.(sx, sz, ctx.body.pos.y + 0.5, 0.9, 2.2);
    if (g === undefined || Number.isNaN(g) || Math.abs(g - ctx.body.pos.y) > 0.9) {
      sx = ctx.body.pos.x;
      sz = ctx.body.pos.z;
    }
    this.framed = 0;
    this.w = { kind: 'feed', phase: 'go', t: 0, ct: 0, beast, cow, what, sx, sz, hx: _nose.x, hy: _nose.y, hz: _nose.z, dropped: false, frozen: false };
    this.body.kind = 'reap';
    this.body.bend = 0;
    this.body.act = -1;
    this.body.lay = 0;
    this.body.offer = 0;
    this.body.step = -1;
    ctx.body.vel.set(0, 0, 0);
  }

  // ── Each step while it holds him ───────────────────────────────────────────

  hold(ctx: RoamCtx, dt: number): AddonHold {
    const w = this.w;
    if (!w) return { prompt: null };
    const { body, input, cam } = ctx;
    const ex = body.explorer;
    if (!w.frozen) w.t += dt;
    this.body.t += dt;
    cam.turn(input.lookYaw, input.lookPitch, input.zoom);
    body.vel.set(0, 0, 0);
    body.grounded = true;
    const h = 1.7 * body.scale * 0.95;
    const low = w.kind === 'cut' || w.phase === 'lay';
    cam.focus.x = body.pos.x;
    cam.focus.z = body.pos.z;
    cam.focus.y += (body.pos.y + (low ? 1.0 : h * 0.86) - cam.focus.y) * damp(6, dt);
    this.frameCam(ctx, w, dt);
    const push = Math.hypot(input.move.x, input.move.y) > PUSH;
    if (w.kind === 'cut') this.cutStep(w, dt, push);
    else this.feedStep(ctx, w, dt, push);
    if (!this.w) {
      ex.setMotion(0, true, 0);
      return { prompt: null };
    }
    if (w.phase !== 'go') ex.setMotion(0, true, 0);
    return { prompt: null };
  }

  private cutStep(w: Work, dt: number, push: boolean): void {
    const b = this.body;
    const stop = push || (!this.held() && !w.frozen);
    switch (w.phase) {
      case 'bend':
        b.bend = Math.min(1, w.t / BEND_S);
        if (w.t > 0.1) this.holdSickle(true);
        this.holdFist(this.cutN);
        if (w.t >= BEND_S) {
          w.phase = 'cut';
          w.ct = 0;
          if (stop) w.phase = 'up';
        }
        break;
      case 'cut': {
        b.bend = 1;
        const was = w.ct;
        if (!w.frozen) w.ct += dt;
        b.act = Math.min(1, w.ct / CUT_S);
        // (the next fistful a little to one side, then the other)
        b.spot.x += ((this.cutN % 2 === 0 ? 0.9 : -0.3) - b.spot.x) * damp(6, dt);
        // The sickle through the stalks: a fistful more in his left hand.
        if (was < CUT_S * 0.45 && w.ct >= CUT_S * 0.45) {
          this.cutN = Math.min(CUTS, this.cutN + 1);
          this.herd.clump.cut = this.cutN;
          this.herd.clump.since = this.herd.time;
          SFX.play('cattleCut', 0.8);
          pad.rumble('tick', 0.5);
          this.holdFist(this.cutN);
        }
        if (w.ct >= CUT_S) {
          b.act = -1;
          w.ct = 0;
          if (this.cutN >= CUTS) {
            w.phase = 'up';
            w.t = 0;
          } else if (stop) {
            w.phase = 'up';
            w.t = 0;
          }
        }
        break;
      }
      case 'up': {
        b.act = -1;
        b.bend = Math.max(0, 1 - w.t / UP_S);
        if (w.t >= UP_S * 0.5 && this.cutN >= CUTS && !this.carrying) {
          // Four fistfuls: twisted into a bundle and taken up in his arms.
          SFX.play('cattleBundle', 0.8);
          this.holdSickle(false);
          this.holdFist(0);
          this.cutN = 0;
          this.carrying = true;
          this.env.hud.toast(t('cattleCut'));
        }
        if (w.t >= UP_S) this.finish();
        break;
      }
      default:
        this.finish();
    }
  }

  private feedStep(ctx: RoamCtx, w: Work, dt: number, push: boolean): void {
    const { body } = ctx;
    const b = this.body;
    const ex = body.explorer;
    const beast = w.beast;
    // (the cow sold or gone, ridden off meanwhile: he stops)
    if (!beast || !w.cow || !CATTLE.herd.includes(w.cow) || beast.ride?.ridden) {
      this.finish();
      return;
    }
    if (w.phase === 'go') {
      const dx = w.sx - body.pos.x;
      const dz = w.sz - body.pos.z;
      const d = Math.hypot(dx, dz);
      if (push) {
        this.finish();
        return;
      }
      if (d > 0.05 && w.t < GO_MAX) {
        const v = Math.min(WALK_SPEED * body.scale * 0.9, 0.4 + d * 3);
        const k = Math.min(d, v * dt) / d;
        body.pos.x += dx * k;
        body.pos.z += dz * k;
        body.yaw += angleDiff(Math.atan2(dx, dz), body.yaw) * damp(10, dt);
        const y = ctx.world.standAt?.(body.pos.x, body.pos.z, body.pos.y + 0.5, 0.9, 2.2) ?? ctx.world.field.heightAt(body.pos.x, body.pos.z);
        if (Number.isFinite(y)) body.pos.y += (y - body.pos.y) * damp(14, dt);
        ex.setMotion(v / body.scale, true, 0);
        return;
      }
      // There: turned to the heap's place, he bends to lay it down.
      ex.setMotion(0, true, 0);
      body.yaw += angleDiff(Math.atan2(w.hx - body.pos.x, w.hz - body.pos.z), body.yaw) * damp(12, dt);
      if (Math.abs(angleDiff(Math.atan2(w.hx - body.pos.x, w.hz - body.pos.z), body.yaw)) < 0.15 || w.t > GO_MAX + 0.6) {
        w.phase = 'lay';
        w.t = 0;
        ex.animator.posture = this.posture;
        ex.animator.postureFeet = false;
        if (w.what === 'straw') SFX.play('cattleBundle', 0.55);
      }
      return;
    }
    if (w.phase === 'lay') {
      body.yaw += angleDiff(Math.atan2(w.hx - body.pos.x, w.hz - body.pos.z), body.yaw) * damp(8, dt);
      b.bend = 0;
      b.act = -1;
      b.lay = Math.min(1, w.t / LAY_S);
      // (the bundle out of his arms into his left hand, low before him; at the bottom it is laid down)
      if (w.t > 0.12) {
        this.hugOn(null);
        this.handOn(w.what);
      } else if (w.what === 'grass') this.hugOn('grass');
      if (!w.dropped && b.lay >= LAY_DROP) {
        w.dropped = true;
        this.handOn(null);
        if (w.what === 'grass') this.carrying = false;
        SFX.play('cattleLay', 0.8);
        pad.rumble('tick', 0.5);
        if (CATTLE.feed(w.cow, w.what)) this.herd.feed(beast, w.what);
      }
      if (w.t >= LAY_S) this.finish();
    }
  }

  /**
   * The camera at the work: round to his side (his right, a little in front), a little above, nearer (eased in over
   * `FRAME_FOR` s, then the player's; a drag or the wheel at once). A check's still with `rcam=` keeps its own view.
   */
  private frameCam(ctx: RoamCtx, w: Work, dt: number): void {
    const { cam, body, input } = ctx;
    if (this.keepView) {
      cam.behindYaw = cam.yaw;
      return;
    }
    const at = w.kind === 'cut' || w.phase === 'lay';
    if (!at) {
      cam.behindYaw = body.yaw;
      return;
    }
    if (input.lookYaw || input.lookPitch || input.zoom) this.framed = FRAME_FOR;
    const want = body.yaw + FRAME.side;
    cam.behindYaw = want;
    if (this.framed >= FRAME_FOR) return;
    this.framed += dt;
    const k = this.env.shot && !this.env.params.has('video') ? 1 : damp(FRAME.rate, dt);
    cam.yaw += angleDiff(want, cam.yaw) * k;
    cam.pitch += (FRAME.pitch - cam.pitch) * k;
    cam.distance += (Math.min(Math.max(FRAME.distance, cam.minDistance), cam.maxDistance) - cam.distance) * k;
  }

  /** The work over: his posture back, his hands empty (a bundle he carries stays in his arms). */
  finish(): void {
    const ex = this.env.explorer;
    if (ex.animator.posture === this.posture) {
      ex.animator.posture = null;
      ex.animator.postureFeet = true;
    }
    this.holdSickle(false);
    this.holdFist(0);
    this.handOn(null);
    this.body.bend = 0;
    this.body.lay = 0;
    this.body.act = -1;
    this.w = null;
  }

  /** Stop at once (another mode, back to the map): no work, nothing carried (`drop`: the grass put down too). */
  stop(drop: boolean): void {
    if (this.w) this.finish();
    if (drop) {
      this.carrying = false;
      this.cutN = 0;
      this.hugOn(null);
      this.hugW = 0;
    }
  }

  keyHelp(): readonly AddonKey[] | null {
    return this.w?.kind === 'cut' ? this.keysHelp : null;
  }

  // ── Props ──────────────────────────────────────────────────────────────────

  private holdSickle(on: boolean): void {
    this.props ??= new FarmProps(this.env.explorer);
    if (on && this.props.holding('R') !== 'sickle') this.props.hold('R', 'sickle');
    if (!on && this.props.holding('R')) this.props.hold('R', null);
  }

  /** The fistful in his left hand (`n` fistfuls; 0: none). */
  private holdFist(n: number): void {
    const key = n > 0 ? `fist${n}` : null;
    if (this.handHas === key) return;
    const rig = this.env.explorer.rig;
    rig.clearSlot('cattleHand');
    this.handHas = key;
    if (!n) return;
    const g = (this.fists[n] ??= buildVoxelMesh(fistBuilder(n), { quality: rig.quality, name: `cattle:fist${n}`, castShadow: true }));
    rig.setSlotObject('cattleHand', 'propL', g);
  }

  /** A bundle (grass, straw) in his left hand, lying across his fist; or none. */
  private handOn(what: 'grass' | 'straw' | null): void {
    if (this.handHas === what) return;
    const rig = this.env.explorer.rig;
    rig.clearSlot('cattleHand');
    this.handHas = what;
    if (!what) return;
    const g = (this.inHand[what] ??= buildVoxelMesh(bundleBuilder(what, 0, 0.6, 0.4, HUG_BUNDLE.len), { quality: rig.quality, name: `cattle:hand:${what}`, castShadow: true }));
    rig.setSlotObject('cattleHand', 'propL', g);
  }

  /** The bundle against his chest (in his arms), or none. */
  private hugOn(what: 'grass' | 'straw' | null): void {
    if (this.chestHas === what) return;
    const rig = this.env.explorer.rig;
    rig.clearSlot('cattleHug');
    this.chestHas = what;
    if (!what) return;
    const g = (this.hug[what] ??= buildVoxelMesh(bundleBuilder(what, HUG_BUNDLE.x, HUG_BUNDLE.y, HUG_BUNDLE.z, HUG_BUNDLE.len), { quality: rig.quality, name: `cattle:hug:${what}`, castShadow: true }));
    rig.setSlotObject('cattleHug', 'chest', g);
  }

  /**
   * Every frame after his animation: the bundle in his arms while he carries it (the hug over his walk's arms, eased),
   * the fistful and the bundle in his hand kept upright, the sickle's (the farm's props).
   */
  frame(dt: number, mode: string): void {
    const ex = this.env.explorer;
    const carryNow = this.carrying && !this.w && mode === 'walk';
    const want = carryNow ? 1 : 0;
    this.hugW += (want - this.hugW) * (dt > 0 ? damp(8, dt) : 1);
    if (this.carrying && (!this.w || this.w.kind === 'cut' || this.w.phase === 'go')) this.hugOn('grass');
    else if (!this.carrying && !(this.w?.kind === 'feed' && this.w.phase === 'lay' && this.w.t <= 0.12)) this.hugOn(null);
    if (this.hugW > 0.001 && !this.w) applyHugCarry(ex.rig, this.hugW);
    // (what is in his left hand stands as a hand holds it: the fistful upright, a bundle level)
    const g = ex.rig.getSlot('cattleHand');
    if (g && g.parent) {
      g.parent.updateWorldMatrix(true, false);
      g.parent.getWorldQuaternion(_q);
      _q2.setFromEuler(_e.set(this.handHas?.startsWith('fist') ? 0.15 : 0, this.env.body.yaw + (this.handHas?.startsWith('fist') ? 0 : Math.PI / 2), 0, 'YXZ'));
      g.quaternion.copy(_q.invert().multiply(_q2));
    }
    this.props?.frame(this.env.body.yaw);
  }

  // ── Checks: a moment of the work held still ────────────────────────────────

  /** Cutting, `t` s in (a still: time stands there). */
  freezeCut(ctx: RoamCtx, t: number): void {
    this.startCut(ctx);
    const w = this.w!;
    const n = Math.min(CUTS - 1, Math.floor(Math.max(0, t - BEND_S) / CUT_S));
    this.cutN = n;
    w.phase = t < BEND_S ? 'bend' : 'cut';
    w.t = t;
    w.ct = Math.max(0, t - BEND_S - n * CUT_S);
    this.body.bend = Math.min(1, t / BEND_S);
    this.body.act = w.phase === 'cut' ? Math.min(1, w.ct / CUT_S) : -1;
    this.body.spot.x = n % 2 === 0 ? 0.9 : -0.3;
    this.holdSickle(t > 0.1);
    this.holdFist(n + (w.ct >= CUT_S * 0.45 ? 1 : 0));
    this.herd.clump.cut = n + (w.ct >= CUT_S * 0.45 ? 1 : 0);
    w.frozen = true;
  }

  /** Feeding `beast`, `t` s into laying the bundle down (a still). */
  freezeFeed(ctx: RoamCtx, beast: Beast, what: 'grass' | 'straw', t: number): void {
    this.startFeed(ctx, beast, what);
    const w = this.w!;
    ctx.body.pos.x = w.sx;
    ctx.body.pos.z = w.sz;
    ctx.body.yaw = Math.atan2(w.hx - w.sx, w.hz - w.sz);
    w.phase = 'lay';
    w.t = t;
    this.body.lay = Math.min(1, t / LAY_S);
    this.env.explorer.animator.posture = this.posture;
    this.env.explorer.animator.postureFeet = false;
    if (t > 0.12 && this.body.lay < LAY_DROP) this.handOn(what);
    w.frozen = true;
  }

  /** For checks. */
  state(): object {
    const w = this.w;
    return { work: w ? { kind: w.kind, phase: w.phase, t: +w.t.toFixed(2), what: w.what, cow: w.cow?.id ?? null } : null, carrying: this.carrying, cutN: this.cutN, hug: +this.hugW.toFixed(2), chest: this.chestHas, hand: this.handHas };
  }
}

