import type { PeerState } from './protocol';
import type { NetPeer } from './types';

/**
 * The other players near me (src/net/client.ts): one record per server id, kept for as long as they are seen, with
 * their last two snapshots (server time and place). Each frame they are shown `DELAY` ms behind the server's time:
 * between the two, or past the newer one along their last step's speed while the next is late (at most `AHEAD` ms,
 * then held); the facing by the shorter arc. When a snapshot comes, the difference between where they were drawn and
 * where the new pair puts them is not jumped: it fades in `SETTLE` s (no jitter at 5 snapshots a second, though the
 * gap is longer than the delay), and never back along the way they go (a correction that would, waits). Missing from the snapshots `DROP` s, they go. No allocation per frame.
 */

/**
 * How far behind the server's newest snapshot the peers are shown (ms): one snapshot gap at 5 a second, less a
 * little. A peer whose snapshots come further apart (protocol 2 sends the farther ones under 2 a second) is shown
 * further behind: its gap less `DELAY_UNDER`, eased at most `DELAY_EASE` s a second (so they slow or hurry a little,
 * never jump).
 */
export const DELAY = 120;
const DELAY_UNDER = 80;
const DELAY_MAX = 900;
const DELAY_EASE = 0.25;
/** The usual gap between snapshots (ms) at first. */
const GAP0 = 200;
/** Missing this long (s), a peer is dropped. */
export const DROP = 5;
/** Past the newer snapshot, they glide on along their last step at most this long (ms; then wait). */
const AHEAD = 250;
/** A new snapshot's correction fades with this time constant (s). */
const SETTLE = 0.15;
/** After their last move, steps back are held off this long (ms); then they settle where they stopped. */
const HOLD = 600;

/** A peer and the snapshots it is eased between (the fields past `NetPeer`'s are the client's own). */
export interface PeerRec extends NetPeer {
  /** The two snapshots' server times (ms) and places: `a` older, `b` newer. */
  ta: number;
  ax: number;
  ay: number;
  az: number;
  ayaw: number;
  tb: number;
  bx: number;
  by: number;
  bz: number;
  byaw: number;
  /** The server's `emoteAt` last seen (so a new emote is noticed once). */
  emoteSrv: number;
  /** The server time of the last snapshot that had them. */
  seenAt: number;
  /** What is left of the corrections (drawn − computed), fading. */
  ex: number;
  ey: number;
  ez: number;
  eyaw: number;
  /** The usual gap between their snapshots while they move (ms, eased) and how far behind they are shown (ms). */
  gap: number;
  delay: number;
  /** The way they last went (x, z: the last snapshot pair that moved) and when (server ms). */
  mx: number;
  mz: number;
  movedAt: number;
}

const wrap = (a: number) => a - Math.round(a / (Math.PI * 2)) * Math.PI * 2;

export function newPeer(s: PeerState, at: number, emoteAtPage: number): PeerRec {
  return {
    sid: s.sid,
    name: s.name,
    look: s.look,
    ride: s.ride,
    emote: s.emote,
    emoteAt: emoteAtPage,
    party: !!s.party,
    x: s.x,
    y: s.y,
    z: s.z,
    yaw: s.yaw,
    stale: 0,
    ta: at - 1,
    ax: s.x,
    ay: s.y,
    az: s.z,
    ayaw: s.yaw,
    tb: at,
    bx: s.x,
    by: s.y,
    bz: s.z,
    byaw: s.yaw,
    emoteSrv: s.emoteAt,
    seenAt: at,
    ex: 0,
    ey: 0,
    ez: 0,
    eyaw: 0,
    gap: GAP0,
    delay: DELAY,
    mx: 0,
    mz: 0,
    movedAt: -Infinity,
  };
}

/** Where the pair (a, b) puts them at server time `at`, into `out` (the module's scratch). */
const out = { x: 0, y: 0, z: 0, yaw: 0 };
function placeAt(p: PeerRec, at: number): void {
  const span = p.tb - p.ta;
  let u = span > 0 ? (at - p.ta) / span : 1;
  if (u < 0) u = 0;
  else if (u > 1 && span > 0) u = Math.min(u, 1 + AHEAD / span);
  out.x = p.ax + (p.bx - p.ax) * u;
  out.y = p.ay + (p.by - p.ay) * u;
  out.z = p.az + (p.bz - p.az) * u;
  out.yaw = p.ayaw + wrap(p.byaw - p.ayaw) * u;
}

/** A new snapshot of `p` at server time `at` (the newer becomes the older); `serverNow` the server's time now (ms). */
export function pushSnapshot(p: PeerRec, s: PeerState, at: number, serverNow: number): void {
  if (at <= p.tb) return;
  const renderAt = serverNow - p.delay;
  const dt = at - p.tb;
  // (where they would be drawn now, before the new pair: the correction starts from there)
  placeAt(p, renderAt);
  const x0 = out.x + p.ex;
  const y0 = out.y + p.ey;
  const z0 = out.z + p.ez;
  const yaw0 = out.yaw + p.eyaw;
  // (after a long gap they stood still where the last one had them (protocol 2 sends nothing while still): the step
  // starts from there one usual gap ago, not from the old snapshot's time)
  if (dt <= 1000) p.gap += (dt - p.gap) * 0.3;
  const still = dt > Math.max(1.6 * p.gap, 400);
  p.ta = still ? at - Math.min(p.gap, 1000) : p.tb;
  // (a jump (Jump in, a ramp: tens of metres at once) is not glided across: the step starts where they land)
  const jump = (s.x - p.bx) ** 2 + (s.z - p.bz) ** 2 > 30 * 30;
  p.ax = jump ? s.x : p.bx;
  p.ay = jump ? s.y : p.by;
  p.az = jump ? s.z : p.bz;
  p.ayaw = jump ? s.yaw : p.byaw;
  p.tb = at;
  p.bx = s.x;
  p.by = s.y;
  p.bz = s.z;
  p.byaw = s.yaw;
  p.seenAt = at;
  p.name = s.name;
  p.look = s.look;
  p.ride = s.ride;
  p.party = !!s.party;
  const mx = p.bx - p.ax;
  const mz = p.bz - p.az;
  if (mx * mx + mz * mz > 1e-4) {
    p.mx = mx;
    p.mz = mz;
    p.movedAt = at;
  }
  placeAt(p, renderAt);
  // (a big jump (a teleport, the gap) is not glided across)
  const ex = x0 - out.x;
  const ey = y0 - out.y;
  const ez = z0 - out.z;
  const far = ex * ex + ey * ey + ez * ez > 20 * 20;
  p.ex = far ? 0 : ex;
  p.ey = far ? 0 : ey;
  p.ez = far ? 0 : ez;
  p.eyaw = far ? 0 : wrap(yaw0 - out.yaw);
}

/** A keep-alive: `p` is still there at server time `at`, where it was. */
export function touchPeer(p: PeerRec, at: number): void {
  if (at > p.seenAt) p.seenAt = at;
}

/** Ease `p` to its time (`serverNow` less its delay, ms), `dt` s since the last frame. */
export function easePeer(p: PeerRec, serverNow: number, dt: number): void {
  const want = Math.min(DELAY_MAX, Math.max(DELAY, p.gap - DELAY_UNDER));
  const step = DELAY_EASE * dt * 1000;
  p.delay += Math.max(-step, Math.min(step, want - p.delay));
  const renderAt = serverNow - p.delay;
  placeAt(p, renderAt);
  const k = Math.exp(-dt / SETTLE);
  p.ex *= k;
  p.ey *= k;
  p.ez *= k;
  p.eyaw *= k;
  const x = out.x + p.ex;
  const z = out.z + p.ez;
  // (never a step back along the way they go: a late snapshot's correction waits where they are instead; once they
  // have stood still `HOLD` ms, they settle onto their spot)
  if (renderAt - p.movedAt < HOLD && (x - p.x) * p.mx + (z - p.z) * p.mz < 0) {
    p.ex = p.x - out.x;
    p.ez = p.z - out.z;
  } else {
    p.x = x;
    p.z = z;
  }
  p.y = out.y + p.ey;
  p.yaw = wrap(out.yaw + p.eyaw);
  p.stale = Math.max(0, (serverNow - p.seenAt) / 1000);
}
