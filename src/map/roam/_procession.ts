import { AdditiveBlending, CanvasTexture, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Vector3, type Camera } from 'three';
import { processionPose, stepPhase, type ProcessionPose } from '../../character/procession';
import { ahead, GAP, LENGTH, MAKE_ROOM, nearestOnPath, pathAt, PAGODA_SPOTS, PROCESSION, slotS, type PathPoint } from '../festival/_circuit';
import { PAGODA } from '../village/_spots';
import type { AddonEnv } from './_addons';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * Walking round the village pagoda's hall in its festival's line
 * (festival/_circuit.ts, _pagodaLine.ts): what Pchum Ben's bay ben
 * (roam/_pchumBen.ts) and Visak Bochea's candle procession (roam/_visak.ts)
 * share. Near the line (or the elder by the naga stair) E joins it: the
 * nearest place in the line is his (never ahead of the monks), the walkers
 * behind him step back to make room, and whoever is beside him (the elder
 * when he is by her) hands him what they carry. He walks in his place at
 * the line's slow pace, the way leading him (no steering: the stick turns
 * nothing; the look drag and the wheel move the camera as on foot). The
 * add-on decides when he steps out (E, the stick pushed away and held, its
 * own end); he steps out to the left, off the way, and turns to the hall,
 * and the line closes up behind him. Esc, a new mode or the festival going
 * away: he is out at once, his hands empty.
 *
 * The camera stays behind him, looking along the way, as when walking.
 */

/** Seconds to step into his place (from where he stood), and back out. */
const JOIN_T = 1.5;
const OUT_T = 1.2;
/** He steps out this far to the left of the way (m), here or this far on along it (m) where a shrine stands beside it. */
const OUT = [1.05, 0.9];
const OUT_ALONG = [0, 1.2, 2.4, -1.2, 3.6];
/**
 * What stands on the terrace beside the way (village/_pagoda.ts; from the hall's axis, m): the seima shrines
 * (round them, a radius), the two stupas and the drum and bell pavilions (boxes, half sizes), the elder by the stair;
 * and the balustrade (he keeps inside it).
 */
const SHRINES = {
  seima: [
    [-3, 93.45],
    [3, 93.45],
    [-7.1, 93.45],
    [7.1, 93.45],
    [-7.1, 104.25],
    [7.1, 104.25],
    [-7.1, 114.9],
    [7.1, 114.9],
    [0, 114.9],
  ] as const,
  seimaR: 1.0,
  boxes: [
    [-9.5, 96, 2.05, 2.05],
    [9.5, 96, 2.05, 2.05],
    [-9.4, 113, 1.75, 1.75],
    [9.4, 113, 1.75, 1.75],
  ] as const,
  giver: { r: 1.0 },
  rail: { x: 11.15, z0: 92.85, z1: 115.15 },
};
/** E offered this near (m): the elder by the stair, the way. */
const NEAR_GIVER = 3.4;
const NEAR_WAY = 2.6;
/** The stick pushed this far, this long (s): he steps out. */
const PUSH = 0.6;
const PUSH_FOR = 0.5;
/** The terrace (and its stair's top), where E is offered. */
const AREA = { x0: -319.5, x1: -292.5, z0: 90.5, z1: 117.5, y: 9.25, dy: 1.1 };

export type Stage = 'off' | 'join' | 'walk' | 'out';

export interface LineWalk {
  /** What he is doing in the line now. */
  readonly stage: Stage;
  /** Seconds in this stage. */
  readonly stageT: number;
  /** His place in the line (−1: none), where it is along the way now (m), and how far he has walked in it (m). */
  readonly slot: number;
  readonly s: number;
  readonly walked: number;
  /** The elder by the stair handed it to him (else a walker beside him). */
  readonly fromGiver: boolean;
  /** The posture's state (the caller sets `hold`, `throwT`). */
  readonly pose: ProcessionPose;
  /** E here would join (the prompt's conditions, cheap; on foot, nothing else busy). */
  canJoin(ctx: RoamCtx): boolean;
  /** Join the line at the nearest place (`instant`: in his place at once, for a shot). */
  join(ctx: RoamCtx, instant?: boolean): void;
  /** One step in the line (join, walk, out); `true` while it still holds him. */
  step(ctx: RoamCtx, dt: number): boolean;
  /** The stick pushed away long enough to step out (call each walking step). */
  pushedOut(ctx: RoamCtx, dt: number): boolean;
  /** Step out to the left of the way (as far as the floor allows), turning to the hall. */
  stepOut(ctx: RoamCtx): void;
  /** Out at once (Esc, a new mode, the festival gone): the line closes up. */
  stop(): void;
  /** Out of the line where he is, the posture kept (the caller walks him on: Visak Bochea's candle to the tray). */
  release(): void;
}

const pt: PathPoint = { x: 0, y: 0, z: 0, yaw: 0 };
const near = { s: 0, d: 0 };

/** (x, z) clear of the shrines on the terrace, inside its balustrade (he stands there after stepping out). */
function clearOfShrines(x: number, z: number): boolean {
  const dx = x - PAGODA.x;
  const S = SHRINES;
  if (Math.abs(dx) > S.rail.x || z < S.rail.z0 || z > S.rail.z1) return false;
  for (const [sx, sz] of S.seima) if (Math.hypot(dx - sx, z - sz) < S.seimaR) return false;
  for (const [bx, bz, hx, hz] of S.boxes) if (Math.abs(dx - bx) < hx && Math.abs(z - bz) < hz) return false;
  const g = PAGODA_SPOTS.giver;
  return Math.hypot(x - g.x, z - g.z) >= S.giver.r;
}

export function createLineWalk(env: AddonEnv, kind: 'pchumben' | 'visak', mode: 'candle' | 'basket'): LineWalk {
  const P = PROCESSION;
  const { body, explorer, cam } = env;
  let stage: Stage = 'off';
  let stageT = 0;
  let slot = -1;
  let s = 0;
  let walked = 0;
  let fromGiver = false;
  let push = 0;
  const from = new Vector3();
  let fromYaw = 0;
  const outTo = new Vector3();
  let outYaw = 0;
  let outFor = OUT_T;
  const pose: ProcessionPose = { mode, walk: 0, phase: 0, hold: 0, throwT: -1, t: 0 };
  const posture = () => processionPose(pose);
  const last = new Vector3();

  const leaveLine = () => {
    if (P.joinAt < 0) return;
    // (the line closes up from as far as it had made room)
    const k = Math.min(1, Math.max(0, (P.t - P.joinedAt) / MAKE_ROOM));
    P.leftAt = P.t - (1 - k) * MAKE_ROOM;
    P.joinAt = -1;
  };

  /** Where he stands when he steps out: left of the way (here, or a little on), clear of the shrines, as the floor allows. */
  const outSpot = (ctx: RoamCtx) => {
    const s0 = s;
    for (const ds of OUT_ALONG)
      for (const d of OUT) {
        pathAt(s0 + ds, pt);
        const left = pt.yaw + Math.PI / 2;
        const x = pt.x + Math.sin(left) * d;
        const z = pt.z + Math.cos(left) * d;
        if (!clearOfShrines(x, z)) continue;
        const y = ctx.world.standAt?.(x, z, pt.y + 0.6, 0.7, 2.2) ?? pt.y;
        if (Number.isNaN(y) || Math.abs(y - pt.y) > 0.7) continue;
        outTo.set(x, y, z);
        return;
      }
    // (nowhere clear: he stays on the way's edge)
    pathAt(s0, pt);
    outTo.set(pt.x, pt.y, pt.z);
  };

  const camera = (ctx: RoamCtx) => {
    const h = 1.7 * body.scale * 0.95;
    cam.focus.set(body.pos.x, body.pos.y + h * 0.86, body.pos.z);
    cam.behindYaw = body.yaw;
    cam.turn(ctx.input.lookYaw, ctx.input.lookPitch, ctx.input.zoom);
  };

  const api: LineWalk = {
    get stage() {
      return stage;
    },
    get stageT() {
      return stageT;
    },
    get slot() {
      return slot;
    },
    get s() {
      return s;
    },
    get walked() {
      return walked;
    },
    get fromGiver() {
      return fromGiver;
    },
    pose,

    canJoin(ctx) {
      if (P.kind !== kind || !P.full || P.joinAt >= 0 || env.busy()) return false;
      const p = ctx.body.pos;
      if (p.x < AREA.x0 || p.x > AREA.x1 || p.z < AREA.z0 || p.z > AREA.z1 || Math.abs(p.y - AREA.y) > AREA.dy) return false;
      const g = PAGODA_SPOTS.giver;
      if (Math.hypot(p.x - g.x, p.z - g.z) < NEAR_GIVER) return true;
      return nearestOnPath(p.x, p.z, near).d < NEAR_WAY;
    },

    join(ctx, instant = false) {
      const p = ctx.body.pos;
      nearestOnPath(p.x, p.z, near);
      // His place: the nearest in the line, never ahead of the monks; the last free one at the end.
      let k = Math.round(ahead(near.s, P.head) / GAP);
      k = Math.max(P.lead, Math.min(P.walkers, k));
      slot = k;
      P.joinAt = k;
      P.joinedAt = instant ? P.t - MAKE_ROOM : P.t;
      const g = PAGODA_SPOTS.giver;
      fromGiver = Math.hypot(p.x - g.x, p.z - g.z) < NEAR_GIVER;
      P.giver = instant ? -1 : fromGiver ? -2 : Math.min(P.walkers - 1, k);
      P.giveUntil = P.t + 1.5;
      from.copy(p);
      fromYaw = body.yaw;
      walked = 0;
      push = 0;
      s = slotS(P, k);
      stage = instant ? 'walk' : 'join';
      stageT = instant ? JOIN_T : 0;
      pose.walk = instant ? 1 : 0;
      pose.hold = instant ? 1 : 0;
      pose.throwT = -1;
      explorer.animator.posture = posture;
      explorer.animator.postureFeet = true;
      body.vel.set(0, 0, 0);
      if (instant) {
        pathAt(s, pt);
        body.pos.set(pt.x, pt.y, pt.z);
        // (the camera keeps its place round him: a shot's `rcam=`)
        cam.yaw += angleDiff(pt.yaw, body.yaw);
        body.yaw = pt.yaw;
      }
      last.copy(body.pos);
    },

    step(ctx, dt) {
      if (stage === 'off') return false;
      // (the festival gone, or its part stopped: out at once)
      if (P.kind !== kind) {
        api.stop();
        return false;
      }
      stageT += dt;
      pose.t += dt;
      const prevS = s;
      if (stage === 'join' || stage === 'walk') {
        s = slotS(P, slot);
        if (stage === 'walk') walked += ahead(prevS, s) < LENGTH / 2 ? ahead(prevS, s) : 0;
        pathAt(s, pt);
      }
      if (stage === 'join') {
        // Into his place: from where he stood to it as it comes along, turning to the way.
        const u = Math.min(1, stageT / JOIN_T);
        const e = u * u * (3 - 2 * u);
        body.pos.set(from.x + (pt.x - from.x) * e, from.y + (pt.y - from.y) * e, from.z + (pt.z - from.z) * e);
        body.yaw = fromYaw + angleDiff(pt.yaw, fromYaw) * e;
        pose.walk = Math.min(1, pose.walk + dt * 1.5);
        if (u >= 1) {
          stage = 'walk';
          stageT = 0;
        }
      } else if (stage === 'walk') {
        body.pos.set(pt.x, pt.y, pt.z);
        body.yaw += angleDiff(pt.yaw, body.yaw) * (1 - Math.exp(-dt * 10));
        pose.walk = Math.min(1, pose.walk + dt * 1.5);
      } else if (stage === 'out') {
        const u = Math.min(1, stageT / outFor);
        const e = u * u * (3 - 2 * u);
        body.pos.set(from.x + (outTo.x - from.x) * e, from.y + (outTo.y - from.y) * e, from.z + (outTo.z - from.z) * e);
        body.yaw = fromYaw + angleDiff(outYaw, fromYaw) * e;
        pose.walk = Math.max(0, 1 - u * 1.4);
        if (u >= 1) {
          stage = 'off';
          explorer.animator.posture = null;
          explorer.animator.postureFeet = true;
          explorer.setMotion(0, true, 0);
          camera(ctx);
          return false;
        }
      }
      body.yaw = Math.atan2(Math.sin(body.yaw), Math.cos(body.yaw));
      // His walk: the cycle at the speed he goes (true m/s), the footsteps on the stone.
      const moved = dt > 0 ? Math.hypot(body.pos.x - last.x, body.pos.z - last.z) / dt : 0;
      last.copy(body.pos);
      const phase0 = pose.phase;
      stepPhase(pose, moved / body.scale, dt);
      if (moved > 0.2 && Math.floor(phase0 * 2) !== Math.floor(pose.phase * 2)) ctx.sound('stepStone', 0.35);
      body.vel.set(0, 0, 0);
      body.grounded = true;
      explorer.setMotion(0, true, 0);
      camera(ctx);
      return true;
    },

    pushedOut(ctx, dt) {
      const m = Math.hypot(ctx.input.move.x, ctx.input.move.y);
      push = m > PUSH ? push + dt : 0;
      return push > PUSH_FOR;
    },

    stepOut(ctx) {
      if (stage !== 'join' && stage !== 'walk') return;
      leaveLine();
      from.copy(body.pos);
      fromYaw = body.yaw;
      pathAt(s, pt);
      outSpot(ctx);
      outYaw = pt.yaw - Math.PI / 2;
      // (a calm step aside: longer when he goes on a little first)
      outFor = Math.max(OUT_T, Math.hypot(outTo.x - from.x, outTo.z - from.z) / 1.1);
      stage = 'out';
      stageT = 0;
    },

    stop() {
      leaveLine();
      if (stage !== 'off') {
        explorer.animator.posture = null;
        explorer.animator.postureFeet = true;
      }
      stage = 'off';
      slot = -1;
      pose.throwT = -1;
    },

    release() {
      leaveLine();
      stage = 'off';
      slot = -1;
    },
  };
  return api;
}

/**
 * A soft round glow for a candle flame (`size` m across): a quad turned to the camera each frame
 * (`faceCamera`), additive, no depth write (a mesh: drawn behind what stands in front of it).
 */
export function candleGlow(size: number): Mesh<PlaneGeometry, MeshBasicMaterial> {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,236,190,1)');
  r.addColorStop(0.18, 'rgba(255,190,110,0.75)');
  r.addColorStop(0.5, 'rgba(255,150,60,0.22)');
  r.addColorStop(1, 'rgba(255,140,50,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const m = new MeshBasicMaterial({ map: tex, blending: AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  m.name = 'roam:candle-glow';
  const mesh = new Mesh(new PlaneGeometry(1, 1), m);
  mesh.name = 'roam:candle-glow';
  mesh.scale.setScalar(size);
  mesh.renderOrder = 2;
  mesh.raycast = () => {};
  mesh.visible = false;
  return mesh;
}

/** Turn a glow quad to face the camera. */
export function faceCamera(m: Mesh, camera: Camera): void {
  m.quaternion.copy(camera.quaternion);
}
