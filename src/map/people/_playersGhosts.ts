import { mulberry32 } from '../../voxel/random';
import { COMMON_NAMES } from '../khmerName';
import { GATE, LAKE_SHORE, LAKE_STAGE, SQUARE, STAGE, RING } from '../nye/plan';
import { EAST_VILLAGE, KULEN_PICNIC, MARKET } from '../layout';
import { EMOTES, LIMITS, RIDES, type Ride } from '../../net/protocol';
import type { NetPeer } from '../../net/types';
import type { Ground } from './_routes';
import { EMOTE_PLAY } from './_playersLook';

/**
 * Fake players for shots and `npm run perf` (no server): `ghosts=<n>` (at most `LIMITS.near`, as the server sends)
 * walking round the Kulen festival square and up and down its lantern avenue (`ghostsat=square`, the default), the
 * lake's shore terrace (`lake`), or spread over the map (`map`: the square, the avenue, the terrace, the sugar-palm
 * village, the market, the Kulen picnic place); emoting as they stop, a few on bicycles, some sitting or lying, hang
 * gliders, canopies and balloons circling overhead, boats on the lake. Seeded: the same ghosts every run. They are a
 * peer source as the live connection is (`PeerSource`): the players scene reads either the same way.
 */

/** Where the players scene reads other players from: the live connection (`NET`) or the ghosts. */
export interface PeerSource {
  readonly peers: ReadonlyMap<number, NetPeer>;
  /** The clock the peers' `emoteAt` is on (ms). */
  now(): number;
}

export type GhostsAt = 'square' | 'lake' | 'map';

/** An area ghosts walk in: an ellipse (or a strip: `rect`), with places kept clear. */
interface Area {
  x: number;
  z: number;
  rx: number;
  rz: number;
  rect?: boolean;
  /** Not in front of this z (the stage), not within this circle (the lotus ring). */
  zMin?: number;
  hole?: { x: number; z: number; r: number };
}

const SQUARE_AREA: Area = { x: SQUARE.x, z: SQUARE.z + 1, rx: SQUARE.rx - 5, rz: SQUARE.rz - 5, zMin: STAGE.stairTo + 2, hole: { x: RING.x, z: RING.z, r: RING.r + 1.8 } };
const AVENUE: Area = { x: GATE.x, z: GATE.z + 19, rx: 1.6, rz: 16, rect: true };
const TERRACE: Area = { x: LAKE_SHORE.x, z: LAKE_SHORE.z, rx: LAKE_SHORE.rx - 3, rz: LAKE_SHORE.rz - 3 };
/** The shore's paving toward the floating stage (the crowd's view of it). */
const LAKE_FRONT: Area = { x: (LAKE_SHORE.x + LAKE_STAGE.x) / 2 + 4, z: (LAKE_SHORE.z + LAKE_STAGE.z) / 2 - 4, rx: 12, rz: 10 };
const VILLAGE: Area = { x: EAST_VILLAGE.x, z: EAST_VILLAGE.z, rx: 26, rz: 26 };
const MARKET_AREA: Area = { x: MARKET.x, z: MARKET.z, rx: 13, rz: 13 };
const PICNIC: Area = { x: KULEN_PICNIC.x, z: KULEN_PICNIC.z, rx: 9, rz: 9 };

/** Ghost names: a third in Khmer letters, the rest Latin (the name tags write those in Khmer too). */
const LATIN = ['Dara', 'Sophea', 'Emma', 'Lucas', 'Mei', 'Kenji', 'Sokha', 'Ana', 'Tom', 'Linh', 'Rithy', 'Chloé', 'Noah', 'Malis', 'Ines', 'Arjun', 'Yuki', 'Ben', 'Vanna', 'Sara', 'Leo', 'Nita', 'Omar', 'Mia', 'Hugo'];
/** Emotes ghosts play as they stop (every one but 'none'). */
const PLAYS = EMOTES.map((_, k) => k).filter((k) => k > 0);
const R = (r: Ride) => RIDES.indexOf(r);

type Motion = 'walk' | 'stay' | 'air' | 'water';

interface Ghost {
  peer: NetPeer & { sid: number };
  motion: Motion;
  area: Area;
  /** Walking: where to, how fast (m/s), standing still until (s). */
  gx: number;
  gz: number;
  speed: number;
  until: number;
  /** Circling (air, water): the middle, radius, height over the ground there, angle and its rate (rad/s). */
  cx: number;
  cz: number;
  cr: number;
  h: number;
  a: number;
  w: number;
  /** Leaves now and then (`away` until when): the scene's fade out and in. */
  away: number;
  rnd: () => number;
}

export class GhostPeers implements PeerSource {
  readonly peers = new Map<number, NetPeer>();
  private readonly ghosts: Ghost[] = [];
  /** The ghosts' clock (s): their emotes' `emoteAt` is on it (ms). */
  private t = 0;

  constructor(
    n: number,
    at: GhostsAt,
    private readonly ground: Ground,
  ) {
    n = Math.max(0, Math.min(LIMITS.near, Math.floor(n)));
    const field = ground.field;
    const areas: Area[] = at === 'lake' ? [LAKE_FRONT, TERRACE, LAKE_FRONT] : at === 'map' ? [SQUARE_AREA, AVENUE, TERRACE, VILLAGE, MARKET_AREA, PICNIC] : [SQUARE_AREA, SQUARE_AREA, AVENUE];
    // Water for boats: open lake by the floating stage (sampled once).
    const water: { x: number; z: number }[] = [];
    const wr = mulberry32(0x6a7e);
    for (let k = 0; k < 400 && water.length < 6; k++) {
      const x = LAKE_STAGE.x - 40 + wr() * 70;
      const z = LAKE_STAGE.z - 25 + wr() * 50;
      let ok = true;
      for (let j = 0; j < 8 && ok; j++) {
        const a = (j / 8) * Math.PI * 2;
        const w = field.waterAt(x + Math.sin(a) * 10, z + Math.cos(a) * 10);
        if (w === null || w < field.heightAt(x + Math.sin(a) * 10, z + Math.cos(a) * 10) + 0.4) ok = false;
      }
      if (ok && Math.hypot(x - LAKE_STAGE.x, z - LAKE_STAGE.z) > 16) water.push({ x, z });
    }
    for (let k = 0; k < n; k++) {
      const rnd = mulberry32(0x5eed + k * 7919);
      const u = rnd();
      let ride: Ride = 'walk';
      let motion: Motion = 'walk';
      let area = areas[k % areas.length];
      if (at === 'square') {
        if (u < 0.07) {
          ride = 'bike';
          area = AVENUE;
        } else if (u < 0.17) ride = 'sit';
        else if (u < 0.2) ride = 'lie';
        else if (u < 0.26) ride = 'glide';
        else if (u < 0.28) ride = 'parachute';
        else if (u < 0.3) ride = 'balloon';
      } else if (at === 'lake') {
        if (u < 0.16) ride = 'boat';
        else if (u < 0.26) ride = 'sit';
        else if (u < 0.32) ride = 'bike';
        else if (u < 0.36) ride = 'glide';
        else if (u < 0.38) ride = 'balloon';
      } else {
        if (u < 0.08) ride = 'bike';
        else if (u < 0.16) ride = 'boat';
        else if (u < 0.22) ride = 'glide';
        else if (u < 0.25) ride = 'parachute';
        else if (u < 0.28) ride = 'balloon';
        else if (u < 0.36) ride = 'sit';
      }
      if (ride === 'boat' && !water.length) ride = 'walk';
      motion = ride === 'sit' || ride === 'lie' ? 'stay' : ride === 'glide' || ride === 'parachute' || ride === 'balloon' ? 'air' : ride === 'boat' ? 'water' : 'walk';
      const name = k % 3 === 0 ? COMMON_NAMES[(k * 7) % COMMON_NAMES.length].km : LATIN[(k * 5) % LATIN.length];
      const peer = {
        sid: 1000 + k,
        name,
        look: (Math.imul(k + 1, 0x9e3779b1) ^ 0x2027) >>> 1,
        ride: R(ride),
        emote: 0,
        emoteAt: -1e9,
        party: k % 9 === 4 && k < 9 * 8,
        x: 0,
        y: 0,
        z: 0,
        yaw: rnd() * Math.PI * 2,
        stale: 0,
      };
      const g: Ghost = { peer, motion, area, gx: 0, gz: 0, speed: ride === 'bike' ? 3.2 + rnd() * 1.4 : 1.3 + rnd() * 1.1, until: 0, cx: 0, cz: 0, cr: 0, h: 0, a: rnd() * Math.PI * 2, w: 0, away: -1, rnd };
      if (motion === 'air') {
        const c = at === 'lake' ? { x: LAKE_STAGE.x - 30, z: LAKE_STAGE.z + 10 } : at === 'map' ? areaPoint(areas[k % areas.length], rnd) : { x: STAGE.x + 15, z: STAGE.front - 40 };
        g.cx = c.x;
        g.cz = c.z;
        g.cr = ride === 'balloon' ? 20 + rnd() * 30 : 45 + rnd() * 50;
        g.h = ride === 'balloon' ? 40 + rnd() * 50 : 35 + rnd() * 70;
        const v = ride === 'glide' ? 9 : ride === 'parachute' ? 5 : 1.6;
        g.w = (v / g.cr) * (rnd() < 0.5 ? 1 : -1);
      } else if (motion === 'water') {
        const c = water[k % water.length];
        g.cx = c.x;
        g.cz = c.z;
        g.cr = 4 + rnd() * 5;
        g.w = ((0.9 + rnd() * 0.8) / g.cr) * (rnd() < 0.5 ? 1 : -1);
      } else {
        const p = this.spot(area, rnd);
        peer.x = g.gx = p.x;
        peer.z = g.gz = p.z;
        peer.y = this.floor(p.x, p.z);
        // (a still shows some of them mid-greeting)
        if (motion === 'walk' && rnd() < 0.35) this.emote(g, -rnd() * 1.5);
        else g.until = rnd() * 3;
      }
      this.ghosts.push(g);
      this.peers.set(peer.sid, peer);
    }
    this.step(0);
  }

  now(): number {
    return this.t * 1000;
  }

  /** Once a frame (the people's step: dt in s). */
  update(dt: number): void {
    this.t += dt;
    this.step(dt);
  }

  private step(dt: number): void {
    const t = this.t;
    for (let k = 0; k < this.ghosts.length; k++) {
      const g = this.ghosts[k];
      const p = g.peer;
      // (one in eleven leaves for 6 s every 45 s: the scene fades them out and in)
      if (k % 11 === 5 && t > 20) {
        const away = (t + k * 3.1) % 45 < 6;
        if (away && this.peers.has(p.sid)) this.peers.delete(p.sid);
        else if (!away && !this.peers.has(p.sid)) this.peers.set(p.sid, p);
      }
      if (g.motion === 'air' || g.motion === 'water') {
        g.a += g.w * dt;
        p.x = g.cx + Math.sin(g.a) * g.cr;
        p.z = g.cz + Math.cos(g.a) * g.cr;
        // (heading along the circle)
        p.yaw = g.a + (g.w > 0 ? Math.PI / 2 : -Math.PI / 2);
        if (g.motion === 'air') p.y = this.ground.field.heightAt(g.cx, g.cz) + g.h + Math.sin(t * 0.4 + k) * 1.5;
        else p.y = (this.ground.field.waterAt(p.x, p.z) ?? this.ground.field.heightAt(p.x, p.z)) + 0.05;
        continue;
      }
      if (g.motion === 'stay') continue;
      if (t < g.until) continue;
      const dx = g.gx - p.x;
      const dz = g.gz - p.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.2) {
        // At the spot: a pause (often an emote; bikes ride on), then the next spot.
        const bike = p.ride === R('bike');
        if (!bike && g.rnd() < 0.45) this.emote(g, 0);
        else g.until = t + (bike ? 0 : 0.5 + g.rnd() * 3);
        const n = this.spot(g.area, g.rnd, p.x, p.z, bike ? 30 : 12);
        g.gx = n.x;
        g.gz = n.z;
        continue;
      }
      const s = Math.min(d, g.speed * dt);
      p.x += (dx / d) * s;
      p.z += (dz / d) * s;
      const want = Math.atan2(dx, dz);
      let e = want - p.yaw;
      e = Math.atan2(Math.sin(e), Math.cos(e));
      p.yaw += Math.max(-5 * dt, Math.min(5 * dt, e));
      const y = this.ground.at(p.x, p.z, p.y + 0.5);
      if (Number.isFinite(y)) p.y = y;
    }
  }

  /** Start an emote `ago` s ago (≤ 0), standing still through it. */
  private emote(g: Ghost, ago: number): void {
    const e = PLAYS[Math.floor(g.rnd() * PLAYS.length) % PLAYS.length];
    g.peer.emote = e;
    g.peer.emoteAt = (this.t + ago) * 1000;
    g.until = this.t + ago + (EMOTE_PLAY[e]?.dur ?? 2) + 0.4;
  }

  /** The floor at (x, z). */
  private floor(x: number, z: number): number {
    const f = this.ground.field.heightAt(x, z);
    const y = this.ground.at(x, z, f + 0.5);
    return Number.isFinite(y) ? y : f;
  }

  /** A spot in `a` with open floor, dry, reached by a straight walk from (fx, fz) within `reach` m (else where they are). */
  private spot(a: Area, rnd: () => number, fx?: number, fz?: number, reach = 1e9): { x: number; z: number } {
    for (let tries = 0; tries < 12; tries++) {
      const p = areaPoint(a, rnd);
      if (fx !== undefined && fz !== undefined) {
        const dx = p.x - fx;
        const dz = p.z - fz;
        const d = Math.sqrt(dx * dx + dz * dz);
        if (d > reach) {
          p.x = fx + (dx / d) * reach;
          p.z = fz + (dz / d) * reach;
          if (!inArea(a, p.x, p.z)) continue;
        }
        if (!this.clear(fx, fz, p.x, p.z)) continue;
      } else if (!this.clear(p.x, p.z, p.x, p.z)) continue;
      return p;
    }
    return { x: fx ?? a.x, z: fz ?? a.z };
  }

  /** Open, dry floor all the way from (ax, az) to (bx, bz) (no wall, no step over a metre). */
  private clear(ax: number, az: number, bx: number, bz: number): boolean {
    const field = this.ground.field;
    let y = this.floor(ax, az);
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5));
    for (let j = 0; j <= n; j++) {
      const x = ax + ((bx - ax) * j) / n;
      const z = az + ((bz - az) * j) / n;
      const w = field.waterAt(x, z);
      const g = this.ground.at(x, z, y + 0.5);
      if (!Number.isFinite(g) || Math.abs(g - y) > 1 || (w !== null && w > g - 0.05)) return false;
      y = g;
    }
    return true;
  }
}

function inArea(a: Area, x: number, z: number): boolean {
  const u = (x - a.x) / a.rx;
  const v = (z - a.z) / a.rz;
  if (a.rect ? Math.abs(u) > 1 || Math.abs(v) > 1 : u * u + v * v > 1) return false;
  if (a.zMin !== undefined && z < a.zMin) return false;
  if (a.hole && Math.hypot(x - a.hole.x, z - a.hole.z) < a.hole.r) return false;
  return true;
}

function areaPoint(a: Area, rnd: () => number): { x: number; z: number } {
  for (let k = 0; k < 20; k++) {
    const x = a.x + (rnd() * 2 - 1) * a.rx;
    const z = a.z + (rnd() * 2 - 1) * a.rz;
    if (inArea(a, x, z)) return { x, z };
  }
  return { x: a.x, z: a.z };
}
