import { BoxGeometry, Color, DynamicDrawUsage, Euler, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3, type Object3D } from 'three';
import { HANG } from '../build/furniture';
import { PIECES, type PieceId } from '../build/pieces';
import { pieceLook } from '../build/view';
import type { RoamWorld } from './types';

/**
 * Build mode's preview (roam/_build.ts): the piece he is about to build, where
 * it would stand, see-through, as a placement preview is in a building game.
 *
 * - **It can stand there**: the piece's own blocks (its model, build/view.ts
 *   `pieceLook`) tinted a soft green, and its footprint outlined on the ground
 *   in pale green.
 * - **It cannot**: the same in red, drawn over whatever stands there (never
 *   invisible: a wall, the house); the reason is the prompt's line.
 *
 * It sits before him and follows him as he walks and turns (the piece's front
 * to him, on his land's lines in 15° steps, turned more with `,` / `.`); a
 * fence shows its guide on along its run; it breathes slowly. One instanced draw of
 * blocks in a plain colour each (a basic material: no lights; the garden
 * ghost's program), made with roaming so its shader is compiled before Start;
 * no allocation per frame.
 */

/** Most blocks a ghost has (the pen's ≤ 600, the outline). */
const MAX = 760;
/** Tints: the share toward green (it can stand) or red (not), the outline's colours. */
const OK = new Color(0x9cff8a);
const NO = new Color(0xff5a48);
const TINT = { ok: 0.55, no: 0.7 };
const EDGE_OK = new Color(0xd8ffc8);
const EDGE_NO = new Color(0xffb0a4);
/**
 * Move mode's highlight (roam/_buildMove.ts `look: 'pick'`): the piece aimed at, over itself, gold where it can be picked
 * up and red where not (the reason in the prompt), a hair bigger than its blocks and drawn over everything: never
 * fighting the piece's own faces for the same depth.
 */
const PICK = { ok: new Color(0xffd27a), tint: 0.8, alpha: 0.42, grow: 0.03 };
/** Opacity where it can stand and where not; its breath (rad/s, swell). */
const ALPHA = { ok: 0.5, no: 0.6 };
const PULSE = 1.6;
const SWELL = 0.1;
/** The outline: its width, height over the ground (m), the most a side is split into (it follows the ground). */
const EDGE_W = 0.09;
const EDGE_UP = 0.04;
const EDGE_STEP = 0.8;
/**
 * A fence's guide (AWP-30): pale dashes on the ground on along its run past both ends, where the next runs would go
 * in line — from `from` m past its end to `to`, a dash `dash` long every `every` m, narrowing (`w0` → `w1`) as they go.
 */
const GUIDE = { from: 0.5, to: 9, dash: 0.45, every: 0.9, w0: 0.08, w1: 0.03 };
const GUIDE_OK = new Color(0xf4f0d8);
const GUIDE_NO = new Color(0xffc8bc);

interface GhostBox {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  q: Quaternion;
  ok: Color;
  no: Color;
  /** On the ground under it (the outline), else on the piece's ground (its middle's). */
  flat: boolean;
}

const _m = new Matrix4();
const _q = new Quaternion();
const _qy = new Quaternion();
const _p = new Vector3();
const _s = new Vector3();
const _up = new Vector3(0, 1, 0);
const _e = new Euler();

export class BuildGhost {
  readonly mesh: InstancedMesh;
  private readonly mat: MeshBasicMaterial;
  private boxes: GhostBox[] = [];
  private id: PieceId | null = null;
  /** A fence run's own length (m: one that closes a gap), else undefined. */
  private len: number | undefined = undefined;
  /** Its look's seed (a piece's own, highlighted: its blocks as they stand). */
  private seed = 0.37;
  private want = false;
  private x = 0;
  private z = 0;
  private yaw = 0;
  private ok = true;
  /** Its floor (m: furniture on a floor, AWP-23), else the land under its middle (null); a hanging lantern's roof (m). */
  private y: number | null = null;
  private ceil = Infinity;
  private shownOk: boolean | null = null;
  private on = 0;
  private clock = 0;

  /** `look`: 'place' build mode's ghost (green / red), 'pick' move mode's highlight (gold / red, `PICK`). */
  constructor(
    parent: Object3D,
    private readonly world: RoamWorld,
    private readonly look: 'place' | 'pick' = 'place',
  ) {
    this.mat = new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: true });
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), this.mat, MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX * 3).fill(1), 3);
    this.mesh.name = look === 'pick' ? 'build:pick' : 'build:ghost';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    // (one tiny block far under the land on the first frames: its shader is compiled with the map's)
    this.mesh.setMatrixAt(0, _m.makeScale(0.001, 0.001, 0.001).setPosition(0, -500, 0));
    this.mesh.count = 1;
    // (hidden until it shows: no draw anywhere else on the map; three compiles a hidden mesh's program with the map's)
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  /**
   * The piece it shows (its blocks made once per piece), a fence run of its own length (`len`, m: one that closes a gap),
   * its look's seed (`seed`: a piece's own, as it stands).
   */
  setPiece(id: PieceId, len?: number, seed = 0.37): void {
    if (id === this.id && len === this.len && seed === this.seed) return;
    this.id = id;
    this.len = len;
    this.seed = seed;
    this.shownOk = null;
    const out: GhostBox[] = [];
    const look = pieceLook(id, seed, len);
    const pick = this.look === 'pick';
    const grow = pick ? PICK.grow : 0;
    for (const b of look.boxes) {
      if (out.length >= MAX - 48) break;
      const c = new Color(b.color);
      out.push({
        x: b.x,
        y: b.y,
        z: b.z,
        sx: b.sx + grow,
        sy: b.sy + grow,
        sz: b.sz + grow,
        q: new Quaternion().setFromEuler(_e.set(b.rx ?? 0, b.ry ?? 0, b.rz ?? 0)),
        ok: pick ? c.clone().lerp(PICK.ok, PICK.tint) : c.clone().lerp(OK, TINT.ok),
        no: c.clone().lerp(NO, TINT.no),
        flat: false,
      });
    }
    // The footprint's outline on the ground, each side in short lengths (they follow the ground).
    const p = PIECES[id];
    const pw = len ?? p.w;
    const hw = pw / 2 + 0.05;
    const hd = p.d / 2 + 0.05;
    const edgeOk = pick ? PICK.ok : EDGE_OK;
    for (const [len, along, at] of [
      [pw, 'x', -hd],
      [pw, 'x', hd],
      [p.d, 'z', -hw],
      [p.d, 'z', hw],
    ] as const) {
      const n = Math.max(1, Math.ceil((len + 0.1) / EDGE_STEP));
      const seg = (len + 0.1) / n;
      for (let i = 0; i < n; i++) {
        const u = -(len + 0.1) / 2 + (i + 0.5) * seg;
        const x = along === 'x' ? u : at;
        const z = along === 'x' ? at : u;
        out.push({
          x,
          y: EDGE_UP,
          z,
          sx: along === 'x' ? seg * 0.96 : EDGE_W,
          sy: 0.04,
          sz: along === 'x' ? EDGE_W : seg * 0.96,
          q: new Quaternion(),
          ok: edgeOk,
          no: EDGE_NO,
          flat: true,
        });
      }
    }
    // A fence's guide: on along its run, both ways (not on a run that closes a gap: fence stands at both its ends; not
    // on the highlight: it marks what stands, not where the next goes).
    if (id === 'fence' && len === undefined && !pick)
      for (let side = -1; side <= 1; side += 2)
        for (let u = GUIDE.from; u + GUIDE.dash <= GUIDE.to; u += GUIDE.every) {
          const k = u / GUIDE.to;
          out.push({
            x: side * (p.w / 2 + u + GUIDE.dash / 2),
            y: EDGE_UP,
            z: 0,
            sx: GUIDE.dash,
            sy: 0.03,
            sz: GUIDE.w0 + (GUIDE.w1 - GUIDE.w0) * k,
            q: new Quaternion(),
            ok: GUIDE_OK,
            no: GUIDE_NO,
            flat: true,
          });
        }
    this.boxes = out;
  }

  /**
   * Show it with its middle at (x, z) turned `yaw`, where it can stand (`ok`) or not; or hide it (null). `y`: its floor
   * (furniture, AWP-23: the land's height under its middle when left out); `ceil`: the roof a hanging lantern's cord
   * goes up to (m).
   */
  show(x: number | null, z = 0, yaw = 0, ok = true, y?: number, ceil = Infinity): void {
    if (x === null || !this.id) {
      this.want = false;
      return;
    }
    this.want = true;
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.ok = ok;
    this.y = y ?? null;
    this.ceil = ceil;
  }

  get shown(): boolean {
    return this.want;
  }

  /** Each frame: fade, breath, its blocks on the land. */
  frame(dt: number): void {
    this.clock += dt;
    const k = dt > 0 ? Math.min(1, dt * 8) : 1;
    this.on += ((this.want ? 1 : 0) - this.on) * k;
    if (this.on < 0.02 && !this.want) {
      this.on = 0;
      this.mesh.visible = false;
      if (this.mesh.count !== 1 || this.mat.opacity !== 0) {
        this.mesh.count = 1;
        this.mesh.setMatrixAt(0, _m.makeScale(0.001, 0.001, 0.001).setPosition(0, -500, 0));
        this.mesh.instanceMatrix.needsUpdate = true;
        this.mat.opacity = 0;
      }
      return;
    }
    this.mesh.visible = true;
    const breath = 1 + SWELL * Math.sin(this.clock * PULSE);
    const pick = this.look === 'pick';
    this.mat.opacity = this.on * (this.ok ? (pick ? PICK.alpha : ALPHA.ok) : ALPHA.no) * breath;
    // (where it cannot stand it is drawn over what stands there: never invisible; the highlight always, over its piece)
    const depth = this.ok && !pick;
    if (this.mat.depthTest !== depth) this.mat.depthTest = depth;
    const recolour = this.shownOk !== this.ok;
    this.shownOk = this.ok;
    const f = this.world.field;
    const y0 = this.y ?? f.heightAt(this.x, this.z);
    _qy.setFromAxisAngle(_up, this.yaw);
    const c = Math.cos(this.yaw);
    const s = Math.sin(this.yaw);
    const boxes = this.boxes;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      _p.set(this.x + b.x * c + b.z * s, 0, this.z - b.x * s + b.z * c);
      _p.y = (b.flat && this.y === null ? f.heightAt(_p.x, _p.z) : y0) + b.y;
      _q.copy(_qy).multiply(b.q);
      this.mesh.setMatrixAt(i, _m.compose(_p, _q, _s.set(b.sx, b.sy, b.sz)));
      if (recolour) this.mesh.setColorAt(i, this.ok ? b.ok : b.no);
    }
    // (a hanging lantern's cord up to the roof over it, AWP-23)
    let n = boxes.length;
    if (this.id === 'hanglamp' && Number.isFinite(this.ceil) && this.ceil > y0 + HANG.hook) {
      const top = this.ceil;
      _p.set(this.x, (y0 + HANG.hook + top) / 2, this.z);
      this.mesh.setMatrixAt(n, _m.compose(_p, _q.identity(), _s.set(0.035, top - y0 - HANG.hook, 0.035)));
      this.mesh.setColorAt(n, this.ok ? EDGE_OK : EDGE_NO);
      n++;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
    if (recolour && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
