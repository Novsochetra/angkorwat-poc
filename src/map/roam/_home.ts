import '../audio/_home';
import { SFX } from '../audio/addonSfx';
import { CALENDAR, nextOf } from '../calendar';
import { granCue, HOME, HOME_AT, HOME_GRAN, HOME_IN, HOME_Z, homeDogBed, homeFloor, homeHammock, homeLocal, homeToWorld, homeYaw, inRooms, onHomeFloor, type GranCue } from '../hamlet/_homePlan';
import { progress } from '../progress';
import { TIME } from '../time';
import { t } from '../ui/lang';
import { registerAddon, type AddonEnv, type AddonHold } from './_addons';
import { atWords } from './_calendarText';
import { dogBed, dogHome } from './_dog';
import { addHammock } from './_hammockSpots';
import { createHomeCard, type HomeCard, type HomeChoice } from './_homeCard';
import { startSleep, type SleepPlan, type SleepSession } from './_homeSleep';
import { startTalk, TALK, type TalkSession } from './_homeTalk';
import { installHomeWalk } from './_homeWalk';
import { angleDiff } from './followCam';
import type { RoamCtx } from './types';

/**
 * His own stilt house (add-on `home`; the house hamlet/_home.ts, where
 * everything is hamlet/_homePlan.ts, its grandmother people/_sceneHome.ts,
 * the words `home…` in ui/lang.ts, the sounds audio/_home.ts, the badge on
 * the maps ui/_minimapSpots.ts `home`).
 *
 * - **The key**: the first time he comes near (15 m), the grandmother who
 *   keeps it, sweeping the empty house's yard (by night sitting on her mat by
 *   her little lamp), stops, waves and calls to him ("ចៅ! មកនេះបន្តិចមក!").
 *   Beside her, E "Talk to Grandma": she gives him the key (_homeTalk.ts);
 *   the house is his (progress.ts `home.owned`), and she walks home.
 * - **The door**: on the veranda before the shut double doors, E "Open the
 *   door": he unlocks and pushes them (the `openDoor` action), they swing in
 *   with a creak and stay open from then on (`home.opened`). Not his yet: the
 *   prompt says the grandmother nearby has the key (with no grandmother — the
 *   people part left out — the door opens to him at once).
 * - **Inside**: he walks up the stair, over the veranda and in (the walk map
 *   is the house's own; the doorway is walled while the doors are shut:
 *   _homeWalk.ts); the follow camera stays in the room (its walls and floor
 *   are solid to it: hamlet/_home.ts).
 * - **Sleep**: at his mat, E "Sleep": the card (_homeCard.ts) asks until when
 *   — dawn, the afternoon, or the next event of the calendar (calendar.ts:
 *   the soonest to begin within a day and a half: "Wake for: the morning
 *   market"); while the time stands still only a short rest, and the card
 *   says why — then he sleeps (_homeSleep.ts).
 * - **The hammock** under the house is the hammock add-on's (`addHammock`,
 *   id `home`); **the dog's bed** at the stair's foot is for the dog
 *   (_homePlan.ts `homeDogBed`, `HOME.inside`: he is at home).
 *
 * Keys: E (the pad's □ / X, the touch Use button) for all of it; the card's
 * own keys (1‥4, ↑ ↓, Enter, Esc; the pad's d-pad, ✕, ○; a tap).
 *
 * URL (checks): `home=1` his (the doors open), `home=shut` his, the doors
 * shut (E opens them), `home=0` not his (the grandmother waits) · `home=call`
 * she calls to him now · `home=key` the grandmother's moment (she holds out
 * the key, her words; he stands before her) · `home=inside` (standing in his
 * room) · `home=sleep` (asleep on his mat under the net) · `home=stretch`
 * (stretching, just up) · `homecard=1` the card open (`=cycle`: as when the
 * time runs) · `homekite=1` his kite on the wall · `gold=all` (the treasure's)
 * fills the shelf · `name=<name>` the sign. `report()` gives `home=`.
 * `window.__home` (shots, the dev server): `state()`, `sleep(kind)`, `card()`.
 */

/** Near enough the house to look at anything (m from its middle). */
const NEAR = 30;
/** She calls to him from this far (m); he must go this far before she calls again (m). */
const CALL = 15;
const FAR = 40;
/** Near enough to talk to her (m across, and up or down). */
const TALK_R = 3.2;
const TALK_UP = 1.6;
/** In front of the doors (local: across, how far out on the veranda, m). */
const DOOR_ACROSS = 1.3;
const DOOR_OUT = 1.9;
/** Near enough the mat to lie down (m round its edge, local). */
const MAT_R = 0.9;
/** Days of the cycle ahead to look for an event to wake for, and the least time ahead it must be (≈ 10 s of play). */
const AHEAD = 1.5;
const SOONEST = 0.03;
/** A choice further ahead than this (days of the cycle) is left out: its moment is now. */
const MOST = 0.85;
/** Seconds of play to wake before the event (as the calendar's "Wait for it"). */
const LEAD = 6;
/** Wake at these clocks: first light, and the golden afternoon. */
const DAWN = 0.775;
const AFTERNOON = 0.0;

/**
 * In his room the follow camera stands up toward a corner of it under the roof, looking across the room at him (the
 * room is small for a camera behind his shoulder: his walls are solid to it, hamlet/_home.ts): of four places by
 * the corners (local x, z; none over the mosquito net, which is not solid to it), the one behind him and far from
 * him, kept until another is clearly better; at this height over the
 * floor (m), eased at `rate` (1/s). A drag looks round as anywhere, for `drag` s. Back as it was out on the veranda.
 */
const INDOOR = { corners: [[2.35, -2.4], [-2.4, -0.95], [-2.35, 0.3], [2.35, 0.3]] as readonly [number, number][], y: 3.65, fov: 60, behind: 3.5, rate: 3.5, out: 2, drag: 3, keep: 1.2, enter: 0.45 };

type Offer = 'talk' | 'door' | 'locked' | 'sleep' | null;

/** A short hold of his own: E at the door (he unlocks and pushes it open). */
interface DoorSession {
  readonly kind: 'door';
  readonly done: boolean;
  hold(ctx: RoamCtx, dt: number): AddonHold;
  stop(): void;
}
type Session = TalkSession | SleepSession | DoorSession;

let env: AddonEnv | null = null;
let floor = 0;
let session: Session | null = null;
let card: HomeCard | null = null;
let offered: Offer = null;
let lastCtx: RoamCtx | null = null;
/** She has called to him this time round (again once he has been far off). */
let called = false;
/** The follow camera as it was before he came in (null: he is not in, or it is back), the corner it is in, until when a drag holds it. */
let indoor: { pitch: number; distance: number; min: number; max: number } | null = null;
let corner = -1;
let dragUntil = 0;
/** He is in the room for the camera (in well past the doorway; out once past it again). */
let inRoom = false;
/** His hat taken off as he came in (a Khmer house: the hat comes off at the door), to put back on as he goes out. */
let hatOff = false;

/** The hat off coming in, on again going out (unless the player put it back on meanwhile: H). */
function houseHat(inside: boolean): void {
  if (!env) return;
  const ex = env.explorer;
  if (inside) {
    if (!hatOff && ex.currentOutfit.hat && !ex.animator.posture) {
      ex.setOutfit({ hat: false });
      env.photo.refreshBody();
      hatOff = true;
    }
    return;
  }
  if (!hatOff) return;
  hatOff = false;
  if (!ex.currentOutfit.hat) {
    ex.setOutfit({ hat: true });
    env.photo.refreshBody();
  }
}

/** The follow camera in the room (see `INDOOR`), and back out. */
function roomCamera(ctx: RoamCtx, inside: boolean, dt: number): void {
  const cam = ctx.cam;
  const body = ctx.body;
  if (inside) {
    indoor ??= { pitch: cam.pitch, distance: cam.distance, min: cam.minDistance, max: cam.maxDistance };
    cam.minDistance = 1.6;
    cam.maxDistance = 9;
    const i = ctx.input;
    if (i.lookYaw || i.lookPitch || i.zoom) dragUntil = ctx.t + INDOOR.drag;
    if (ctx.t < dragUntil) return;
    // The corner behind him and far from him (his chest: what the camera looks at).
    const fx = body.pos.x;
    const fy = body.pos.y + 1.7 * body.scale * 0.86;
    const fz = body.pos.z;
    const hx = Math.sin(body.yaw);
    const hz = Math.cos(body.yaw);
    let best = -1;
    let bestScore = -Infinity;
    let curScore = -Infinity;
    for (let k = 0; k < INDOOR.corners.length; k++) {
      const [cx, cz] = homeToWorld(INDOOR.corners[k][0], INDOOR.corners[k][1]);
      const dx = fx - cx;
      const dz = fz - cz;
      const d = Math.hypot(dx, dz);
      const score = d + INDOOR.behind * ((dx * hx + dz * hz) / Math.max(0.01, d));
      if (k === corner) curScore = score;
      if (score > bestScore) {
        bestScore = score;
        best = k;
      }
    }
    if (corner < 0 || bestScore > curScore + INDOOR.keep) corner = best;
    const [cx, cz] = homeToWorld(INDOOR.corners[corner][0], INDOOR.corners[corner][1]);
    const cy = floor + INDOOR.y;
    const h = Math.hypot(fx - cx, fz - cz);
    const yaw = Math.atan2(fx - cx, fz - cz);
    const pitch = Math.atan2(cy - fy, h);
    const dist = Math.hypot(h, cy - fy);
    const k = 1 - Math.exp(-INDOOR.rate * dt);
    cam.yaw += angleDiff(yaw, cam.yaw) * k;
    cam.pitch += (pitch - cam.pitch) * k;
    cam.distance += (dist - cam.distance) * k;
    cam.behindYaw = cam.yaw;
    return;
  }
  corner = -1;
  if (!indoor) return;
  cam.minDistance = indoor.min;
  cam.maxDistance = indoor.max;
  const k = 1 - Math.exp(-INDOOR.out * dt);
  cam.pitch += (indoor.pitch - cam.pitch) * k;
  cam.distance += (indoor.distance - cam.distance) * k;
  if (Math.abs(indoor.pitch - cam.pitch) < 0.01 && Math.abs(indoor.distance - cam.distance) < 0.05) indoor = null;
}

/** The house is his (kept between visits; a shot keeps nothing). */
function ownIt(): void {
  HOME.owned = true;
  progress.set('home.owned', true);
  bedForDog();
}

/** His dog's bed is the basket at his stair's foot once the house is his (roam/_dog.ts `dogBed`: it sleeps there while he is away). */
function bedForDog(): void {
  if (!env || !HOME.owned) return;
  const b = homeDogBed(env.world.field);
  // (on the basket's floor)
  dogBed({ x: b.x, y: b.y + 0.08, z: b.z, yaw: b.yaw });
}

/** The dog sent to its bed while he sleeps at home (and called back as he gets up). */
let dogAsleep = false;
function dogSleeps(on: boolean): void {
  if (on === dogAsleep) return;
  dogAsleep = on;
  dogHome(on);
}

function openDoors(): void {
  HOME.opened = true;
  progress.set('home.opened', true);
}

/** On the veranda before the doors (feet at the floor). */
function atDoor(x: number, y: number, z: number): boolean {
  if (Math.abs(y - floor) > 0.35) return false;
  const [lx, lz] = homeLocal(x, z);
  return Math.abs(lx) < DOOR_ACROSS && lz > HOME_Z.wall - 0.1 && lz < HOME_Z.wall + DOOR_OUT;
}

/** In the room near his mat. */
function atMat(x: number, y: number, z: number): boolean {
  if (Math.abs(y - floor) > 0.35 || !inRooms(x, z)) return false;
  const [lx, lz] = homeLocal(x, z);
  const M = HOME_IN.mat;
  const dx = Math.max(M.x0 - lx, 0, lx - M.x1);
  const dz = Math.max(M.z0 - lz, 0, lz - M.z1);
  return Math.hypot(dx, dz) < MAT_R;
}

/** The next time (days of the cycle) the clock reads `clock`, at least `SOONEST` from now. */
function nextClock(now: number, clock: number): number {
  let d = Math.floor(now) + clock;
  while (d < now + SOONEST) d += 1;
  return d;
}

/** The choices of the card (worked out once when it opens: the targets stay; the words follow the language). */
function plans(cycling: boolean): { plan: SleepPlan; words: () => HomeChoice }[] {
  if (!cycling) return [{ plan: { kind: 'rest' }, words: () => ({ id: 'rest', label: t('homeRest'), sub: '' }) }];
  const now = TIME.days();
  const out: { plan: SleepPlan; words: () => HomeChoice }[] = [
    { plan: { kind: 'dawn', to: nextClock(now, DAWN) }, words: () => ({ id: 'dawn', label: t('homeTilDawn'), sub: '' }) },
    { plan: { kind: 'afternoon', to: nextClock(now, AFTERNOON) }, words: () => ({ id: 'afternoon', label: t('homeTilAfternoon'), sub: '' }) },
  ];
  // The soonest event of the calendar to begin within a day and a half (not on now).
  let best: { id: string; start: number } | null = null;
  for (const e of CALENDAR) {
    let tt;
    try {
      tt = nextOf(e, now, AHEAD);
    } catch {
      continue;
    }
    if (tt.now || !Number.isFinite(tt.start) || tt.start - now < SOONEST) continue;
    if (!best || tt.start < best.start) best = { id: e.id, start: tt.start };
  }
  if (best) {
    const b = best;
    const e = CALENDAR.find((x) => x.id === b.id)!;
    const clock = ((b.start % 1) + 1) % 1;
    out.push({
      plan: { kind: 'event', event: e.id, to: Math.max(now, b.start - LEAD / TIME.dayLength) },
      words: () => ({ id: 'event', label: t('homeTilEvent', { event: t(e.name) }), sub: `${atWords(clock)}${e.place ? ` · ${t(e.place)}` : ''}` }),
    });
  }
  // (soonest first; not a moment of the day that is now — "until dawn" at dawn would be a whole day — unless it is all there is)
  const near = out.filter((c) => (c.plan.to ?? now) - now < MOST);
  return (near.length ? near : out).sort((p, q) => (p.plan.to ?? 0) - (q.plan.to ?? 0));
}

/** The card: until when he sleeps (or, while the time stands still, a short rest). `force`: as when the time runs (a check's picture). */
function openCard(ctx: RoamCtx, force = false): void {
  if (!env) return;
  const e = env;
  lastCtx = ctx;
  card ??= createHomeCard(e.uiSound);
  const cycling = force || TIME.cycling();
  const list = plans(cycling);
  const now = ((TIME.days() % 1) + 1) % 1;
  const path = `${t('settings')} → ${t('tabGeneral')} → ${t('time')}: ${t('cycle')}`;
  card.ask(
    () => ({
      title: t('homeAsk'),
      note: cycling ? t('homeNow', { when: atWords(now) }) : t('homeHeld', { path }),
      cancel: t('homeCancel'),
      choices: list.map((c) => c.words()),
    }),
    (id) => {
      const c = list.find((x) => x.words().id === id);
      if (!c || session || !lastCtx) return;
      session = startSleep(e, lastCtx, c.plan);
    },
  );
}

/** He unlocks the doors and pushes them open (turned to them; the `openDoor` action; they swing in, a creak). */
function doorSession(ctx: RoamCtx): DoorSession {
  const e = env!;
  const body = ctx.body;
  const [dx, dz] = homeToWorld(0, HOME_Z.wall);
  const face = Math.atan2(dx - body.pos.x, dz - body.pos.z);
  let time = 0;
  let done = false;
  let opened = false;
  e.explorer.play('openDoor');
  return {
    kind: 'door',
    get done() {
      return done;
    },
    hold(c, dt) {
      time += dt;
      c.cam.turn(c.input.lookYaw, c.input.lookPitch, c.input.zoom);
      body.vel.set(0, 0, 0);
      body.yaw += angleDiff(face, body.yaw) * Math.min(1, dt * 8);
      e.explorer.setMotion(0, true, 0);
      const h = 1.7 * body.scale * 0.95;
      c.cam.focus.set(body.pos.x, body.pos.y + h * 0.86, body.pos.z);
      if (!opened && time > 0.45) {
        opened = true;
        if (!HOME.owned) ownIt();
        openDoors();
        SFX.play('homeDoor');
      }
      if (time > 1.5) done = true;
      return { prompt: null };
    },
    stop() {
      if (!opened) {
        if (!HOME.owned) ownIt();
        openDoors();
      }
      done = true;
    },
  };
}

/** End the session at once (a new mode, back to the map). */
function stopSession(): void {
  if (!session) return;
  try {
    session.stop();
  } finally {
    session = null;
  }
}

registerAddon({
  id: 'home',
  order: 42,
  get holding() {
    return !!session;
  },
  get handsBusy() {
    return !!session;
  },
  init(e) {
    env = e;
    floor = homeFloor(e.world.field).floor;
    installHomeWalk(e.world, floor);
    // The hammock under the house (the hammock add-on's: its cloth and ropes are the house's petal blocks).
    const hm = homeHammock();
    const [ax, az] = homeToWorld(hm.x0, hm.z);
    const [bx, bz] = homeToWorld(hm.x1, hm.z);
    const y = floor - hm.down;
    addHammock({ id: 'home', a: [ax, y, az], b: [bx, y, bz], part: 'hamlet', ready: () => e.parts.some((p) => p.name === 'hamlet') });
    bedForDog();
    if (e.shot || import.meta.env.DEV)
      Object.assign(window, {
        __home: {
          state: () => ({ owned: HOME.owned, opened: HOME.opened, door: +HOME.door.toFixed(2), net: +HOME.net.toFixed(2), inside: HOME.inside, gran: { ...HOME.gran }, session: session?.kind ?? null, phase: session?.kind === 'sleep' ? session.phase : null, card: !!card?.open, offered, days: TIME.days(), clock: ((TIME.days() % 1) + 1) % 1, cycling: TIME.cycling() }),
          sleep: (kind: 'dawn' | 'afternoon' | 'event' | 'rest' = 'dawn') => {
            if (!lastCtx || session) return false;
            const list = plans(TIME.cycling());
            const c = list.find((x) => x.plan.kind === kind) ?? list[0];
            session = startSleep(e, lastCtx, c.plan);
            return c.plan;
          },
          card: (force = false) => lastCtx && openCard(lastCtx, force),
        },
      });
  },
  input(ctx) {
    if (card?.open) return true;
    if (!session) return false;
    const i = ctx.input;
    // (his session has the step: the camera still turns, E / Space / the stick reach it, the tools wait)
    if (session.kind === 'sleep') {
      if (!session.dark) ctx.cam.turn(i.lookYaw, i.lookPitch, i.zoom);
      session.poke(i.use || i.jump, Math.hypot(i.move.x, i.move.y));
    } else ctx.cam.turn(i.lookYaw, i.lookPitch, i.zoom);
    return true;
  },
  offer(ctx, mode) {
    offered = null;
    lastCtx = ctx;
    if (mode !== 'walk' || session || card?.open || !env || env.busy()) return null;
    const p = ctx.body.pos;
    const dx = p.x - HOME_AT.x;
    const dz = p.z - HOME_AT.z;
    if (dx * dx + dz * dz > NEAR * NEAR) return null;
    const g = HOME.gran;
    if (!HOME.owned && g.ready && g.shown && (g.cue === 'idle' || g.cue === 'call')) {
      const gx = p.x - g.x;
      const gz = p.z - g.z;
      if (gx * gx + gz * gz < TALK_R * TALK_R && Math.abs(p.y - g.y) < TALK_UP) {
        offered = 'talk';
        return `E  ${t('homeTalk')}`;
      }
    }
    if (!HOME.opened && atDoor(p.x, p.y, p.z)) {
      // (not his yet: the grandmother nearby has the key; with nobody to give it, the door opens to him)
      if (!HOME.owned && g.ready) {
        offered = 'locked';
        return t('homeLocked');
      }
      offered = 'door';
      return `E  ${t('homeOpen')}`;
    }
    if (HOME.owned && HOME.opened && atMat(p.x, p.y, p.z)) {
      offered = 'sleep';
      return `E  ${t('homeSleep')}`;
    }
    return null;
  },
  use(ctx) {
    if (!env || session) return;
    if (offered === 'talk') session = startTalk(env, ctx, ownIt);
    else if (offered === 'door') session = doorSession(ctx);
    else if (offered === 'sleep') openCard(ctx);
  },
  hold(ctx, dt) {
    if (!session) return { prompt: null };
    const r = session.hold(ctx, dt);
    if (session.done) session = null;
    return r;
  },
  after(ctx, mode, dt) {
    lastCtx = ctx;
    const p = ctx.body.pos;
    const onFloor = mode === 'walk' && HOME.owned && Math.abs(p.y - floor) < 0.6;
    const was = inRoom;
    inRoom = onFloor && inRooms(p.x, p.z, inRoom ? 0 : INDOOR.enter);
    if (!session) roomCamera(ctx, inRoom, dt);
    if (inRoom) {
      // (a wider view in the small room)
      if (!session) ctx.cam.fov = INDOOR.fov;
      if (!was) houseHat(true);
    } else if (was || hatOff) houseHat(false);
    HOME.inside = HOME.owned && mode === 'walk' && (session?.kind === 'sleep' || onHomeFloor(p.x, p.y, p.z, floor));
    // (his dog sleeps on its bed while he sleeps: from lying down until he gets up)
    const ph = session?.kind === 'sleep' ? session.phase : null;
    dogSleeps(ph === 'down' || ph === 'doze' || ph === 'dark' || ph === 'wake');
    // The grandmother calls to him the first time he comes near (and again after he has been far off).
    const g = HOME.gran;
    if (HOME.owned || !g.ready || !g.shown || session) return;
    const d = Math.hypot(p.x - g.x, p.z - g.z);
    if (!called && mode === 'walk' && d < CALL && g.cue === 'idle') {
      called = true;
      granCue('call', p);
    } else if (called && d > FAR) {
      called = false;
      if (g.cue === 'call') granCue('idle');
    }
  },
  frame(f) {
    if (session?.kind === 'sleep' && env) session.frame(f.camera, env.photo.view);
  },
  setMode(next, _prev, ctx) {
    card?.close();
    stopSession();
    dogSleeps(false);
    // (out of the room's camera at once: the new mode sets its own; his hat back on)
    inRoom = false;
    houseHat(false);
    if (indoor) {
      ctx.cam.minDistance = indoor.min;
      ctx.cam.maxDistance = indoor.max;
      indoor = null;
    }
    if (next === 'overview') {
      HOME.inside = false;
      called = false;
      if (HOME.gran.cue === 'call') granCue('idle');
    }
  },
  fromUrl(q, ctx) {
    if (!env) return;
    const v = q.get('home');
    const body = ctx.body;
    // (a saved view's or a check's own: his or not, the doors open or shut; not kept)
    if (v === '0' || v === 'key' || v === 'call') HOME.owned = HOME.opened = false;
    else if (v) {
      HOME.owned = true;
      HOME.opened = v !== 'shut';
      if (HOME.opened) HOME.door = 1;
      bedForDog();
    }
    const place = (lx: number, lz: number, yawLocal: number) => {
      const [x, z] = homeToWorld(lx, lz);
      body.pos.set(x, floor, z);
      body.yaw = homeYaw(yawLocal);
      body.vel.set(0, 0, 0);
      body.grounded = true;
      if (!q.has('rcam')) {
        ctx.cam.yaw = body.yaw;
        ctx.cam.pitch = 0.32;
        ctx.cam.distance = 5;
      }
    };
    if (v === 'inside') {
      // (in the middle of the room, turned to the shelf of what he found; the camera in the corner behind him)
      place(1.2, -1.2, Math.PI);
      inRoom = true;
      houseHat(true);
      if (!q.has('rcam')) roomCamera(ctx, true, 10);
    }
    else if (v === 'sleep' || v === 'stretch') {
      // (in his room: his hat off at the door, as when he walks in)
      inRoom = true;
      houseHat(true);
      session = startSleep(env, ctx, { kind: env.shot ? 'still' : 'rest' }, v === 'sleep' ? 'lying' : 'stretch');
    } else if (v === 'call') {
      called = true;
      granCue('call' as GranCue, body.pos);
    } else if (v === 'key') {
      // Before her in her yard, toward the stair (she holds the key out: her words over her).
      const [gx, gz] = homeToWorld(HOME_GRAN.sweep.x, HOME_GRAN.sweep.z);
      const [fx, fz] = homeToWorld(HOME_GRAN.sweep.x, HOME_GRAN.sweep.z + 1.6);
      body.pos.set(fx, env.world.groundAt(fx, fz), fz);
      body.yaw = Math.atan2(gx - fx, gz - fz);
      session = startTalk(env, ctx, ownIt, TALK.give + 0.9);
    }
    const c = q.get('homecard');
    if (c) {
      if (!session && !q.has('at')) place(HOME_IN.lie.x + 0.6, HOME_IN.lie.z + 1.1, Math.PI);
      lastCtx = ctx;
      openCard(ctx, c === 'cycle');
    }
  },
  report() {
    // (his hat is only off while the house or the sleep has it: a replay puts it on, and they take it off again; up and
    // out, it is on — as roam/_zip.ts does)
    const hat: Record<string, string> = hatOff || (session?.kind === 'sleep' && session.hatTaken) ? { hat: '1' } : {};
    if (session?.kind === 'talk') return { home: 'key' };
    if (session?.kind === 'sleep') return { home: 'sleep', ...hat };
    if (!HOME.owned) return Object.keys(hat).length ? hat : null;
    return { home: HOME.inside && lastCtx && inRooms(lastCtx.body.pos.x, lastCtx.body.pos.z) ? 'inside' : HOME.opened ? '1' : 'shut', ...hat };
  },
});
