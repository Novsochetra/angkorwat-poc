import type { NetPeer } from '../../net/types';
import { LIMITS, RIDES, type Ride } from '../../net/protocol';
import type { MapFrame } from '../types';
import type { Actor } from './_actor';
import { Bicycle, BIKE_WHEEL } from './_bicycle';
import { partyLink } from '../party/link';
import { NameTags, NAME_NEAR } from './_playersNames';
import { GhostPeers, type PeerSource } from './_playersGhosts';
import { EMOTE_PLAY, emotePose, playerLook } from './_playersLook';
import { BALLOON_FLAME, GLIDE_PITCH, partyMarkDef, playerBalloonDef, playerBoatDef, playerChuteDef, playerGliderDef } from './_playersRigs';
import { FIT, POSE, type Pose } from './_personModel';
import type { Obstacle, Traffic } from './_routes';
import type { PeopleEnv, PeopleScene } from './_scene';
import { Rig, type RigDef } from './_things';

/**
 * Other players on the map (New Year's Eve online, phase 2: docs/discussion/new-year-online.md): each frame the
 * players the live connection knows (src/net/client.ts `NET.peers`, eased there between the server's snapshots) are
 * drawn with the crowd's model (`_personModel.ts`) and the clothes their look seed gives (`_playersLook.ts`: the same
 * on every screen), up to `LIMITS.near` (the server sends no more). Only for show: they are not actors of the people
 * part (nobody greets them back, keeps them apart or poses for them; the people walking round step out of their way:
 * `report`).
 *
 * - **Where:** at the peer's x, y, z (their feet) and facing; the stride from how fast they move.
 * - **How they move** (`RIDES`): walking or standing; `sit` (cross-legged), `lie` (the hammock's lying pose, flat on
 *   the ground); `bike` on the village bicycle (`_bicycle.ts`, pedalling with their speed); `boat` rowing in a wooden
 *   boat; `glide` lying face down under a hang glider; `parachute` hanging upright under a canopy; `balloon` standing
 *   in the basket (cheap box rigs: `_playersRigs.ts`). A pool of each (`POOL`): a player past it, or farther than
 *   `PROP_FAR` on a bicycle or in a boat, rides without one (a few pixels by then).
 * - **Emotes** (`EMOTES`, played once from `emoteAt`, on foot): `_playersLook.ts` `EMOTE_PLAY`.
 * - A party member has a small gold diamond turning over the head (`partyMarkDef`), and a gold name. A friend
 *   talking in the party's voice (party/link.ts `partyLink.talking`) gets the speaking mark: the diamond bobs and
 *   swells as a voice does, and their name tag shows three sound bars.
 * - **Joining and leaving:** they grow in from nothing and shrink away (`FADE` s; the crowd has no transparency),
 *   and go the same way when the connection has not heard of them for `STALE` s; a still shows them at full size.
 * - **Names** (`_playersNames.ts`): the nearest `NAME_TAGS` within `NAME_NEAR` m of the camera.
 * - Far ones: past `HIDE` m nothing is drawn (and the crowd draws everyone small with its far model, and on low
 *   leaves out who is out of view).
 *
 * `ghosts=<n>&ghostsat=square|lake|map` fills it with fake players for shots and `npm run perf` (no server:
 * `_playersGhosts.ts`); then the connection is not read.
 */

/** Grow in / shrink away (s). */
const FADE = 0.6;
/** No news of a player for this long (s): they fade out (and back in if they come back). */
const STALE = 4;
/** Nothing drawn past this distance from the camera (m). */
const HIDE = 1400;
/** A bicycle or a boat only this near the camera (m). */
const PROP_FAR = 380;
/** Props kept ready (boxes of the people's things, made once). */
const POOL = { bike: 12, boat: 8, glide: 10, parachute: 6, balloon: 6, mark: 8 } as const;
/** A teleport (m in a frame): placed there with no stride. */
const JUMP = 25;

type PropKind = 'bike' | 'boat' | 'glide' | 'parachute' | 'balloon';
const RIDE_PROP: readonly (PropKind | null)[] = RIDES.map((r: Ride) => (r === 'bike' || r === 'boat' || r === 'glide' || r === 'parachute' || r === 'balloon' ? r : null));
const WALK = RIDES.indexOf('walk');
/** The top of the head over the feet point by ride (m, the drawn adult): the name and the party mark go over it. */
const HEAD: Record<Ride, number> = { walk: 2.45, bike: 2.6, glide: 0.9, boat: 1.6, balloon: 2.45, parachute: 2.45, sit: 1.55, lie: 0.6 };
const HEAD_BY = RIDES.map((r) => HEAD[r]);

/** A prop of the pool: a bicycle, or a box rig. */
interface Prop {
  kind: PropKind;
  rig: Rig | null;
  bike: Bicycle | null;
}

class Body {
  sid = -1;
  peer: NetPeer | null = null;
  /** Size now (0‥1: growing in, shrinking away) and wanted. */
  grow = 0;
  /** The frame this body last saw its peer. */
  seen = -1;
  /** The look seed dressed (−1: none yet). */
  look = -1;
  // Where it was last frame, its speed (m/s, eased), the distance its wheels rolled.
  px = 0;
  pz = 0;
  speed = 0;
  rolled = 0;
  prop: Prop | null = null;
  mark: Rig | null = null;
  /** The emote worn now (`Crowd.strike`: its things), 0 none. */
  striking = 0;
  /** Distance to the camera this frame (m). */
  d = 0;
  shown = false;
  constructor(readonly i: number) {}
}

export class Players implements PeopleScene {
  readonly name = 'players';
  /** (none: players are not the people part's actors) */
  readonly actors: readonly Actor[] = [];
  private readonly bodies: Body[] = [];
  private readonly free: Body[] = [];
  private readonly bySid = new Map<number, Body>();
  private readonly pools: Record<PropKind, Prop[]> = { bike: [], boat: [], glide: [], parachute: [], balloon: [] };
  private readonly marks: Rig[] = [];
  private readonly names = new NameTags();
  private readonly ghosts: GhostPeers | null = null;
  private source: PeerSource | null = null;
  private frame = 0;
  private active = 0;
  // (this frame's step: the visit callback reads them; no closure a frame)
  private now = 0;
  // (the nearest players for the names: indices into `bodies`, sorted by distance)
  private readonly near: Body[] = [];
  // (a shot's measured frames: the ghosts' own step apart, the names)
  private ghostMs = 0;
  private namesMs = 0;
  private measured = 0;

  constructor(private readonly env: PeopleEnv) {
    const crowd = env.crowd;
    for (let k = 0; k < LIMITS.near; k++) {
      const b = new Body(crowd.add(playerLook(k)));
      this.bodies.push(b);
      this.free.push(b);
    }
    this.free.reverse();
    const things = env.things;
    const before = things.used;
    const rigs: Record<Exclude<PropKind, 'bike'>, () => RigDef> = { boat: playerBoatDef, glide: playerGliderDef, parachute: playerChuteDef, balloon: playerBalloonDef };
    for (let k = 0; k < POOL.bike; k++) this.pools.bike.push({ kind: 'bike', rig: null, bike: new Bicycle(things, 300 + k, { load: 'none' }) });
    for (const kind of ['boat', 'glide', 'parachute', 'balloon'] as const) {
      const def = rigs[kind]();
      for (let k = 0; k < POOL[kind]; k++) this.pools[kind].push({ kind, rig: new Rig(things, def), bike: null });
    }
    const mark = partyMarkDef();
    for (let k = 0; k < POOL.mark; k++) this.marks.push(new Rig(things, mark));
    const ghosts = Number(env.params.get('ghosts') ?? 0);
    if (ghosts > 0) {
      const at = env.params.get('ghostsat');
      this.ghosts = new GhostPeers(ghosts, at === 'lake' || at === 'map' || at === 'lineup' ? at : 'square', env.ground);
      this.source = this.ghosts;
      // (the party card's shots find their friends among the ghosts)
      partyLink.ghosts = this.ghosts.peers;
    } else {
      // (the live connection, loaded on its own: playing alone it never connects)
      import('../../net/client')
        .then((m) => {
          const net = m.NET;
          this.source = { get peers() { return net.peers; }, now: () => performance.now(), muted: (sid) => net.isMuted(sid) };
        })
        .catch((e) => console.warn('[map] players: no live connection', e));
    }
    console.info(`[map] players: room for ${LIMITS.near} · ${things.used - before} thing boxes (${POOL.bike} bicycles, ${POOL.boat} boats, ${POOL.glide} gliders, ${POOL.parachute} canopies, ${POOL.balloon} balloons, ${POOL.mark} party marks)${this.ghosts ? ` · ${this.ghosts.peers.size} ghosts` : ''}`);
  }

  update(dt: number, now: number, f: MapFrame, _ex: Obstacle | null): void {
    const src = this.source;
    // (nobody, and nobody to see off: nothing to do)
    if (!src || (src.peers.size === 0 && this.active === 0)) return;
    const measure = this.env.shot && dt > 0 && this.measured < 24;
    let t0 = measure ? performance.now() : 0;
    if (this.ghosts) {
      // (the people's clock: a still's preroll walks them too)
      this.ghosts.update(dt);
      // (the live connection's peers move on the page's own; the ghosts' are part of the measured cost apart)
      if (measure) {
        const t1 = performance.now();
        this.ghostMs += t1 - t0;
        t0 = t1;
      }
    }
    this.frame++;
    this.now = now;
    src.peers.forEach(this.visit);
    const cam = f.camera.position;
    const clock = src.now();
    this.near.length = 0;
    for (const b of this.bodies) {
      if (b.sid < 0) continue;
      const p = b.peer!;
      const here = b.seen === this.frame && p.stale < STALE;
      const want = here ? 1 : 0;
      b.grow = this.env.shot && dt === 0 ? want : Math.max(0, Math.min(1, b.grow + (want ? dt : -dt) / FADE));
      if (!here && b.grow <= 0) {
        this.release(b, now);
        continue;
      }
      const dx = p.x - cam.x;
      const dy = p.y - cam.y;
      const dz = p.z - cam.z;
      b.d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (b.d > HIDE || b.grow <= 0) {
        this.conceal(b, now);
        continue;
      }
      this.body(b, p, dt, now, clock);
      if (b.d < NAME_NEAR && b.grow > 0.5) this.near.push(b);
    }
    if (measure) t0 = performance.now();
    this.nameTags(f);
    if (measure) {
      this.namesMs += performance.now() - t0;
      if (++this.measured === 24) {
        const shown = this.bodies.filter((b) => b.shown).length;
        console.info(`[map] players: ${shown} shown of ${this.active}${this.ghosts ? ` (ghosts=${this.ghosts.peers.size})` : ''} · ghosts' own step ${(this.ghostMs / 24).toFixed(3)} ms a frame · names ${(this.namesMs / 24).toFixed(3)} ms (in the people CPU line's "players")`);
      }
    }
  }

  /** (each peer this frame: its body, taken from the free ones when new) */
  private readonly visit = (p: NetPeer, sid: number): void => {
    let b = this.bySid.get(sid);
    if (!b) {
      b = this.free.pop();
      if (!b) return;
      b.sid = sid;
      b.grow = this.env.shot ? 1 : 0;
      b.px = p.x;
      b.pz = p.z;
      b.speed = 0;
      this.bySid.set(sid, b);
      this.active++;
    }
    b.peer = p;
    b.seen = this.frame;
    if (b.look !== p.look) {
      if (b.striking) this.env.crowd.unstrike(b.i, this.now);
      b.striking = 0;
      b.look = p.look;
      this.env.crowd.dress(b.i, playerLook(p.look));
    }
  };

  /** Pose and place one player. */
  private body(b: Body, p: NetPeer, dt: number, now: number, clock: number): void {
    const crowd = this.env.crowd;
    const i = b.i;
    // How fast they move (their eased positions: no stride from a jump).
    if (dt > 0) {
      const mx = p.x - b.px;
      const mz = p.z - b.pz;
      const m = Math.sqrt(mx * mx + mz * mz);
      const v = m > JUMP ? 0 : m / dt;
      b.speed += (v - b.speed) * Math.min(1, dt * 8);
    }
    b.px = p.x;
    b.pz = p.z;
    const ride = p.ride >= 0 && p.ride < RIDES.length ? p.ride : WALK;
    const kind = RIDE_PROP[ride];
    const r = RIDES[ride];
    // The emote (on foot only), from when it began.
    // (a player he muted: no emotes, no name tag)
    const play = r === 'walk' && !this.source?.muted?.(b.sid) ? EMOTE_PLAY[p.emote] : null;
    const age = (clock - p.emoteAt) / 1000;
    const emoting = !!play && age >= 0 && age < play.dur;
    const wear = emoting && play.feats.length ? p.emote : 0;
    if (wear !== b.striking) {
      if (b.striking) crowd.unstrike(i, now);
      if (wear) crowd.strike(i, play!.feats, play!.style, 1, now);
      b.striking = wear;
    }
    // Their prop: the pool's, while it lasts (a bicycle and a boat only near).
    if (b.prop && b.prop.kind !== kind) this.giveProp(b);
    if (kind && !b.prop && (kind === 'glide' || kind === 'parachute' || kind === 'balloon' || b.d < PROP_FAR)) b.prop = this.pools[kind].pop() ?? null;
    else if (b.prop && (kind === 'bike' || kind === 'boat') && b.d > PROP_FAR * 1.1) this.giveProp(b);
    const k = crowd.scale(i);
    let pose: Pose = POSE.stand;
    let pitch = 0;
    const s = b.speed;
    switch (r) {
      case 'walk': {
        pose = emoting ? emotePose(play!, age) : POSE.stand;
        const walk = s > 0.05 ? Math.min(1, 0.35 + s * 0.7) : 0;
        crowd.gait(i, walk, s > 0.05 ? crowd.stepRate(i, s, walk) : 0.9, now);
        break;
      }
      case 'sit':
        pose = POSE.sit;
        crowd.gait(i, 0, 0.9, now);
        break;
      case 'lie':
        pose = POSE.hammock;
        crowd.gait(i, 0, 0.9, now);
        break;
      case 'bike':
        pose = POSE.ride;
        crowd.gait(i, 1, s > 0.2 ? Math.round((s / (FIT.bike.gear * k)) * 50) / 50 : 0, now);
        b.rolled += s * dt;
        break;
      case 'boat':
        // (rowing as they move: the stroke's strength from the speed)
        pose = POSE.row;
        crowd.gait(i, s > 0.3 ? Math.min(1, s / 2) : 0, 0, now);
        break;
      case 'glide':
        pitch = GLIDE_PITCH;
        crowd.gait(i, 0, 0.9, now);
        break;
      default:
        // (the canopy, the balloon: hanging, standing in the basket)
        crowd.gait(i, 0, 0.9, now);
    }
    crowd.pose(i, pose, now);
    crowd.look(i, 0, 0, now);
    crowd.place(i, p.x, p.y, p.z, p.yaw, pitch, b.grow);
    b.shown = true;
    const g = b.grow;
    const pr = b.prop;
    if (pr?.bike) pr.bike.put(p.x, p.y, p.z, p.yaw, k * g, crowd.phaseOf(i, now), b.rolled / (BIKE_WHEEL * k));
    else if (pr?.rig) {
      // (the boat's floor under the seated rower; the balloon's flame lit while climbing)
      pr.rig.place(p.x, p.y, p.z, p.yaw, 0, 0, g);
      if (pr.kind === 'balloon') pr.rig.paint(BALLOON_FLAME, 0xffb050, 0.4 + (Math.sin(now * 3 + i) > 0.6 ? 0.8 : 0));
      pr.rig.write();
    }
    // The party's mark.
    if (p.party && !b.mark) b.mark = this.marks.pop() ?? null;
    else if (!p.party && b.mark) this.giveMark(b);
    if (b.mark) {
      // (talking: it bobs and swells, as a voice does, and turns faster)
      const talk = partyLink.talking.has(b.sid);
      const beat = talk ? Math.abs(Math.sin(now * 9 + i)) : 0;
      b.mark.place(p.x, p.y + (HEAD_BY[ride] + 0.35 + beat * 0.18) * g, p.z, now * (talk ? 4 : 1.6), 0, 0, g * (talk ? 1.3 + beat * 0.45 : 1)).write();
    }
  }

  /** The nearest players' names (the bodies within `NAME_NEAR`, gathered by `update`). */
  private nameTags(f: MapFrame): void {
    const near = this.near;
    // (a few dozen at most: an insertion sort, nothing made)
    for (let a = 1; a < near.length; a++) {
      const b = near[a];
      let j = a - 1;
      while (j >= 0 && near[j].d > b.d) {
        near[j + 1] = near[j];
        j--;
      }
      near[j + 1] = b;
    }
    this.names.begin();
    for (let k = 0; k < near.length; k++) {
      const b = near[k];
      const p = b.peer!;
      const ride = p.ride >= 0 && p.ride < RIDES.length ? p.ride : WALK;
      if (this.source?.muted?.(b.sid)) continue;
      this.names.add(f.camera, b.sid, p.name, !!p.party, p.x, p.y + HEAD_BY[ride] + 0.3, p.z, b.d, partyLink.talking.has(b.sid));
    }
    this.names.end();
  }

  private giveProp(b: Body): void {
    const pr = b.prop;
    if (!pr) return;
    if (pr.bike) pr.bike.hide();
    else pr.rig?.hide();
    this.pools[pr.kind].push(pr);
    b.prop = null;
  }

  private giveMark(b: Body): void {
    if (!b.mark) return;
    b.mark.hide();
    this.marks.push(b.mark);
    b.mark = null;
  }

  /** Not drawn this frame (too far, or not grown in yet): the person, the prop and the mark folded away. */
  private conceal(b: Body, now: number): void {
    if (b.shown) this.env.crowd.hide(b.i);
    b.shown = false;
    this.giveProp(b);
    this.giveMark(b);
    if (b.striking) this.env.crowd.unstrike(b.i, now);
    b.striking = 0;
  }

  /** Gone: the body back to the free ones. */
  private release(b: Body, now: number): void {
    this.conceal(b, now);
    this.bySid.delete(b.sid);
    b.sid = -1;
    b.peer = null;
    b.grow = 0;
    this.free.push(b);
    this.active--;
  }

  report(traffic: Traffic): void {
    if (this.active === 0) return;
    for (const b of this.bodies) {
      if (!b.shown || !b.peer) continue;
      const r = b.peer.ride;
      if (r === WALK || RIDES[r] === 'sit' || RIDES[r] === 'lie' || RIDES[r] === 'bike') traffic.add(this.name, b.peer.x, b.peer.y, b.peer.z);
    }
  }
}
