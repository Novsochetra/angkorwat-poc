import { BoxGeometry, DynamicDrawUsage, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3, type InstancedBufferAttribute } from 'three';
import { hash3 } from '../../voxel/random';
import { POSE, type Crowd, type Pose } from '../people/_personModel';
import { NEAR_FADE } from '../roam/_nearFade';
import { GROUND, PAGODA } from '../village/_spots';
import { BALL_SIZE, GAP, LENGTH, pathAt, PAGODA_SPOTS, PROCESSION, roomMade, SPEED, wrapS, type PathPoint } from './_circuit';

/**
 * The line of people walking round the pagoda's hall (festival/_circuit.ts):
 * Visak Bochea's candle procession at night, the monks leading; Pchum Ben's
 * walk before dawn, rice balls (bay ben) thrown out into the dark for the
 * ancestors' spirits. Every walker holds lotus buds, incense and a candle
 * between the palms (the sampeah pose walking, `FEAT.offering`); a halo of
 * candle light over the hands (the festival's glow: its first quads, moved
 * here every frame).
 *
 * As the line begins (dusk, the small hours) the walkers come up the naga
 * stair one by one and step onto the way at the front step; as it ends each
 * leaves the way there on its next round and goes down the stair. A line
 * already walking when the festival appears (the page opens, the clock
 * jumps) is there at once, whole.
 *
 * The explorer in the line (`PROCESSION.joinAt`, roam/_procession.ts): the
 * walkers behind him step back a place, and close up after he leaves; the
 * walker beside him (or the elder by the stair: `giver`) hands him what he
 * carries (`PROCESSION.giver`).
 */

const X = PAGODA.x;
/** Up the naga stair to the front step (where the way begins), from across the village square below (world m: they come and go out of sight among the houses, not at the stair's foot). */
const ARRIVE: readonly [number, number, number][] = [
  [X - 1.4, GROUND, 74.5],
  [X - 0.6, GROUND, 83.6],
  [X - 0.6, GROUND, 86.0],
  [X - 0.5, 9.0, 92.1],
  [X - 0.25, 9.0, 93.1],
  [X, 9.5, 94.02],
];
const ARRIVE_LEN = (() => {
  let l = 0;
  for (let i = 1; i < ARRIVE.length; i++) l += Math.hypot(ARRIVE[i][0] - ARRIVE[i - 1][0], ARRIVE[i][1] - ARRIVE[i - 1][1], ARRIVE[i][2] - ARRIVE[i - 1][2]);
  return l;
})();
/** Seconds up (or down) the stair. */
const ARRIVE_T = ARRIVE_LEN / SPEED;
/** Seconds between two walkers setting off. */
const EVERY = GAP / SPEED;
/** The candle's flame over the joined palms, from the feet in the person's own frame (model m, times their size). */
const CANDLE = { y: 1.16, z: 0.31 };
/**
 * Pchum Ben: a walker throws every this many seconds (each at its own moment); the throw (s); the turn out from the
 * way meanwhile, and the ball's heading from the way (radians, + to the left: away from the hall).
 */
const THROW_EVERY = 8.5;
const THROW_FOR = 1.0;
const THROW_TURN = 0.9;
const THROW_OUT = 1.25;
/** Rice balls in the air or lying where they fell; how long one lies there (s); its size (m). */
const BALLS = 28;
const BALL_LIE = 3.5;
const G = 9.8;
/** The terrace's walls (a ball that falls outside lands a metre lower). */
const TERRACE = PAGODA.terrace;

export interface LineDef {
  /** The walkers' indices in the crowd (place order: the monks first), how many lead (monks). */
  first: number;
  count: number;
  lead: number;
  /** The elder by the stair who hands things out (her index in the crowd). */
  giver: number;
  /** The first of the walkers' halos in the festival's glow. */
  glowFirst: number;
  /** Rice balls thrown (Pchum Ben). */
  throws: boolean;
}

export interface PagodaLine {
  /** The thrown rice balls (Pchum Ben; null at Visak Bochea): add it to the part. */
  readonly balls: InstancedMesh | null;
  /** The glow's position and colour buffers, once it is built (the halos move with the walkers). */
  bindGlow(pos: InstancedBufferAttribute, col: InstancedBufferAttribute): void;
  /** Every frame while the festival is on: `want` the line walking now; `snap` the scene just appeared or the clock jumped (no stair); `eye` the camera. */
  update(now: number, want: boolean, snap: boolean, crowd: Crowd, first: boolean, eye: { x: number; y: number; z: number }): void;
  /** The festival went away: everyone off, no halo, no ball. */
  clear(crowd: Crowd): void;
}

export function createPagodaLine(d: LineDef): PagodaLine {
  const P = PROCESSION;
  const pt: PathPoint = { x: 0, y: 0, z: 0, yaw: 0 };
  /** The line: off; coming up the stair from `t0`; walking; leaving (each at its next pass of the front step). */
  let phase: 'off' | 'enter' | 'on' | 'leave' = 'off';
  let t0 = 0;
  /** Leaving: each walker's way position last frame (a wrap past the front step: off the way, `exitAt`). */
  const lastS = new Float64Array(d.count);
  const exitAt = new Float64Array(d.count);
  const posed = new Int8Array(d.count).fill(-1);
  let giverPose = -1;
  /** The place he took last (the line closes up after him). */
  let lastJoin = -1;
  let gPos: InstancedBufferAttribute | null = null;
  let gCol: InstancedBufferAttribute | null = null;
  const sizes = new Float32Array(d.count).fill(-1);
  const chant = { x: 0, y: 0, z: 0 };

  // The rice balls (Pchum Ben): a pool, used round and round.
  const balls = d.throws ? makeBalls() : null;
  const ball = Array.from({ length: d.throws ? BALLS : 0 }, () => ({ t: -1e9, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, land: 0, lie: 0 }));
  let nextBall = 0;
  const thrown = new Int32Array(d.count).fill(-1);
  const m4 = new Matrix4();
  const q = new Quaternion();
  const v3 = new Vector3();
  const s3 = new Vector3();

  /** The point `l` m up the stair path (from the square to the front step), into `pt`. */
  const stairAt = (l: number) => {
    let left = Math.max(0, Math.min(ARRIVE_LEN, l));
    for (let i = 1; i < ARRIVE.length; i++) {
      const a = ARRIVE[i - 1];
      const b = ARRIVE[i];
      const seg = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (left <= seg || i === ARRIVE.length - 1) {
        const u = Math.min(1, left / seg);
        pt.x = a[0] + (b[0] - a[0]) * u;
        pt.y = a[1] + (b[1] - a[1]) * u;
        pt.z = a[2] + (b[2] - a[2]) * u;
        pt.yaw = Math.atan2(b[0] - a[0], b[2] - a[2]);
        return;
      }
      left -= seg;
    }
  };

  const halo = (k: number, size: number) => {
    if (!gCol || sizes[k] === size) return;
    sizes[k] = size;
    (gCol.array as Float32Array)[(d.glowFirst + k) * 4 + 3] = size;
    gCol.needsUpdate = true;
  };

  const throwBall = (x: number, y: number, z: number, yaw: number, now: number, seed: number) => {
    const b = ball[nextBall];
    nextBall = (nextBall + 1) % BALLS;
    const sp = 2.6 + 1.2 * hash3(seed, 3, 1, 41);
    b.t = now;
    b.x = x;
    b.y = y;
    b.z = z;
    b.vx = Math.sin(yaw) * sp;
    b.vz = Math.cos(yaw) * sp;
    b.vy = 2.2 + 0.8 * hash3(seed, 4, 1, 41);
    // (it comes down on the terrace inside its walls, on the ground a metre lower outside)
    const flight = (lieY: number) => (b.vy + Math.sqrt(Math.max(0, b.vy * b.vy + 2 * G * (y - lieY)))) / G;
    let tf = flight(TERRACE.y + 0.02);
    const fx = x + b.vx * tf;
    const fz = z + b.vz * tf;
    if (fx < TERRACE.x0 || fx > TERRACE.x1 || fz < TERRACE.z0 || fz > TERRACE.z1) tf = flight(TERRACE.y - 0.98);
    b.land = tf;
    b.lie = BALL_LIE + hash3(seed, 5, 1, 41);
  };

  const drawBalls = (now: number) => {
    if (!balls) return;
    let n = 0;
    for (const b of ball) {
      const age = now - b.t;
      if (age < 0 || age > b.land + b.lie) continue;
      const tau = Math.min(age, b.land);
      const k = age > b.land + b.lie - 0.6 ? Math.max(0.01, (b.land + b.lie - age) / 0.6) : 1;
      v3.set(b.x + b.vx * tau, b.y + b.vy * tau - 0.5 * G * tau * tau + (age >= b.land ? BALL_SIZE * 0.4 : 0), b.z + b.vz * tau);
      s3.setScalar(BALL_SIZE * k);
      m4.compose(v3, q, s3);
      balls.setMatrixAt(n++, m4);
    }
    if (n || balls.count) balls.instanceMatrix.needsUpdate = true;
    balls.count = n;
  };

  return {
    balls,
    bindGlow(pos, col) {
      gPos = pos;
      gCol = col;
      pos.setUsage(DynamicDrawUsage);
      col.setUsage(DynamicDrawUsage);
      for (let k = 0; k < d.count; k++) halo(k, 0);
    },

    update(now, want, snap, crowd, first, eye) {
      const joined = P.joinAt;
      if (joined >= 0) lastJoin = joined;
      const run = want || joined >= 0;
      // The line's state.
      if (run && (phase === 'off' || phase === 'leave')) {
        if (snap || first || phase === 'leave') {
          // (whole at once: the walkers all on the way, set off long ago)
          phase = 'on';
          if (snap || first) t0 = now - ARRIVE_T - d.count * EVERY - 1;
        } else {
          phase = 'enter';
          t0 = now;
        }
      } else if (!run && (phase === 'on' || phase === 'enter')) {
        if (snap) phase = 'off';
        else {
          phase = 'leave';
          exitAt.fill(Infinity);
          lastS.fill(-1);
        }
      }
      if (phase === 'enter' && now - t0 > d.count * EVERY + 0.5) phase = 'on';
      const head = wrapS(SPEED * (now - t0));
      P.head = head;
      P.walkers = d.count;
      P.lead = d.lead;
      P.running = phase === 'on' || phase === 'enter';
      P.full = phase === 'on';
      const room = lastJoin >= 0 ? roomMade(P, now) : 0;
      let anyone = false;
      for (let i = 0; i < d.count; i++) {
        const c = d.first + i;
        let onWay = phase !== 'off';
        let stair = -1;
        let s = 0;
        if (onWay) s = wrapS(head - (i + (lastJoin >= 0 && i >= lastJoin ? room : 0)) * GAP);
        if (phase === 'enter') {
          const at = now - t0 - i * EVERY;
          if (at < 0) {
            // (not on the way yet: coming up the stair, or not set off)
            onWay = false;
            if (at > -ARRIVE_T) stair = ARRIVE_LEN + at * SPEED;
          }
        } else if (phase === 'leave') {
          // (off the way once it comes round past the front step again, then down the stair)
          if (exitAt[i] === Infinity && lastS[i] >= 0 && lastS[i] - s > LENGTH / 2) exitAt[i] = now;
          lastS[i] = s;
          const past = now - exitAt[i];
          if (past >= 0) {
            onWay = false;
            if (past < ARRIVE_T) stair = ARRIVE_LEN - past * SPEED;
          }
        }
        if (!onWay && stair < 0) {
          if (crowd.isShown(c)) crowd.hide(c);
          posed[i] = -1;
          halo(i, 0);
          continue;
        }
        anyone = true;
        let yaw: number;
        if (onWay) {
          pathAt(s, pt);
          yaw = pt.yaw;
        } else {
          stairAt(stair);
          yaw = phase === 'leave' ? pt.yaw + Math.PI : pt.yaw;
        }
        // Pchum Ben: now and then a rice ball, thrown out to the left (away from the hall), the walker turning to it.
        let pose: Pose = POSE.sampeah;
        let turn = 0;
        if (d.throws && onWay && i >= d.lead) {
          const cyc = (now + hash3(i, 7, 1, 43) * THROW_EVERY) / THROW_EVERY;
          const n = Math.floor(cyc);
          const u = (cyc - n) * THROW_EVERY;
          if (u < THROW_FOR) {
            pose = POSE.point;
            turn = THROW_TURN * Math.sin((Math.PI * u) / THROW_FOR);
            if (u > THROW_FOR * 0.5 && thrown[i] !== n) {
              thrown[i] = n;
              const sc = crowd.scale(c);
              // (from the raised right hand, model (−0.35, 1.5, 0.4) as the walker faces now, out to the left)
              const fy = yaw + turn;
              const hx = -0.35 * sc;
              const hz = 0.4 * sc;
              throwBall(pt.x + Math.cos(fy) * hx + Math.sin(fy) * hz, pt.y + 1.5 * sc, pt.z - Math.sin(fy) * hx + Math.cos(fy) * hz, yaw + THROW_OUT, now, i * 131 + n);
            }
          }
        }
        // (the walker beside him hands it over: arms out)
        if (P.giver === i && now < P.giveUntil) pose = POSE.give;
        crowd.place(c, pt.x, pt.y, pt.z, yaw + turn);
        if (posed[i] !== pose || first) {
          const at = posed[i] === -1 || first;
          posed[i] = pose;
          crowd.pose(c, pose, now, at);
          crowd.gait(c, 1, crowd.stepRate(c, SPEED), now);
        }
        // The candle's halo over the joined palms (smaller while the hands are apart).
        if (gPos) {
          const sc = crowd.scale(c);
          const o = (d.glowFirst + i) * 4;
          const a = gPos.array as Float32Array;
          a[o] = pt.x + Math.sin(yaw + turn) * CANDLE.z * sc;
          a[o + 1] = pt.y + CANDLE.y * sc;
          a[o + 2] = pt.z + Math.cos(yaw + turn) * CANDLE.z * sc;
          // (a walker the follow camera sees through, between it and the explorer: its candle goes with it)
          halo(i, (pose === POSE.sampeah ? 1.3 : 0.6) * (1 - nearFaded(a[o], a[o + 1], a[o + 2], eye)));
        }
        if (i === 0) {
          chant.x = pt.x;
          chant.y = pt.y + 1.6;
          chant.z = pt.z;
        }
      }
      if (gPos) gPos.needsUpdate = true;
      if (phase === 'leave' && !anyone) phase = 'off';
      // (the chant walks with the monks at the head; without monks the scene says where it comes from)
      P.chant = anyone && d.lead > 0 ? chant : null;
      // The elder by the stair while the line walks: her tray held before her, held out to him when she gives.
      const giving = P.giver === -2 && now < P.giveUntil;
      if (P.running || giving) {
        const gp: Pose = giving ? POSE.give : POSE.stand;
        const g = PAGODA_SPOTS.giver;
        crowd.place(d.giver, g.x, g.y, g.z, g.yaw);
        if (gp !== giverPose || first) {
          const at = giverPose === -1 || first;
          giverPose = gp;
          crowd.pose(d.giver, gp, now, at);
          crowd.carry(d.giver, 1, now, at);
        }
      } else if (giverPose !== -1) {
        crowd.hide(d.giver);
        giverPose = -1;
      }
      drawBalls(now);
    },

    clear(crowd) {
      for (let i = 0; i < d.count; i++) {
        if (crowd.isShown(d.first + i)) crowd.hide(d.first + i);
        posed[i] = -1;
        halo(i, 0);
      }
      if (crowd.isShown(d.giver)) crowd.hide(d.giver);
      giverPose = -1;
      phase = 'off';
      lastJoin = -1;
      if (balls) balls.count = 0;
      for (const b of ball) b.t = -1e9;
      P.running = false;
      P.full = false;
      P.chant = null;
    },
  };
}

/**
 * How far the follow camera's near fade (roam/_nearFade.ts) clears a point now (0‥1): the tube from the camera to
 * the explorer, as its shader works it out per pixel. The halos are not lit materials: they fade with their walkers.
 */
function nearFaded(x: number, y: number, z: number, eye: { x: number; y: number; z: number }): number {
  const u = NEAR_FADE.uniforms;
  const amount = u.uNearFade.value;
  if (amount <= 0) return 0;
  const T = NEAR_FADE.tube;
  const f = u.uNearFocus.value;
  const tx = f.x - eye.x;
  const ty = f.y - eye.y;
  const tz = f.z - eye.z;
  const len = Math.max(Math.hypot(tx, ty, tz), 1e-3);
  const px = x - eye.x;
  const py = y - eye.y;
  const pz = z - eye.z;
  const along = (px * tx + py * ty + pz * tz) / len;
  if (along <= 0) return 0;
  const off = Math.hypot(px - (tx / len) * along, py - (ty / len) * along, pz - (tz / len) * along);
  const r = T.camera + (T.him - T.camera) * Math.min(1, along / len);
  const smooth = (a: number, b: number, v: number) => {
    const k = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  return amount * (1 - smooth(r - T.soft, r, off)) * (1 - smooth(len - (T.end + T.endSoft), len - T.end, along));
}

/** The rice balls: small white lumps (one instanced draw). */
function makeBalls(): InstancedMesh {
  const geo = new BoxGeometry(1, 0.85, 1);
  const mat = new MeshStandardMaterial({ color: 0xf4f0e4, roughness: 0.95 });
  mat.name = 'festival:bayben';
  const mesh = new InstancedMesh(geo, mat, BALLS);
  mesh.name = 'festival:bayben';
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.count = 0;
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.raycast = () => {};
  return mesh;
}
