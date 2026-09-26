import { Group } from 'three';
import { hash3 } from '../../voxel/random';
import { eventsNow, type EventState } from '../events';
import { PLACES } from '../layout';
import { ROAM_HEIGHT } from '../roam/types';
import type { AnimalCallKind, MapContext, MapFrame, MapPart, Subject, SubjectKind } from '../types';
import { CH, Flock, type Species } from './_kit';
import { Agent, Herd, type Ground, type Habits, type Walker } from './_landBrain';
import { BUFFALO, BUFFALO_HABITS } from './_landBuffalo';
import { DEER, MUNTJAC_HABITS, SAMBAR_HABITS } from './_landDeer';
import { ELEPHANT } from './_landElephant';
import { FOWL, FOWL_HABITS } from './_landFowl';
import { findBathSite, sunBlockers } from './_landBath';
import { Crossing, findCrossSite } from './_landCrossing';
import { buildLineup } from './_landLineup';
import { MACAQUE, MACAQUE_HABITS } from './_landMacaque';
import { bankGround, banks, edges, flatStretch, meadows, openGround, roadside, scatter, survey, templeGround, type Spot } from './_landPlaces';
import { Splash } from './_landSplash';
import { COW_SIDE, Trek, type Passer, type TrekWorld } from './_landTrek';

/**
 * Animals on the land, real ones of the Angkor region:
 *
 * - long-tailed macaques in troops round the temples (sitting, grooming,
 *   scratching, eating; babies riding on their mothers);
 * - sambar herds in the open meadows, muntjac pairs at the forest edges;
 * - red junglefowl (a rooster and his hens) by the road;
 * - water buffalo on the river banks and in the shallows;
 * - a cow elephant and her calf walking the valley road — the one animal
 *   the overview shows clearly; in the afternoon they go down to the river
 *   below the River Gate to bathe (_landBath.ts: the cow sprays water over
 *   her back, the calf rolls in the shallows; drops and rings: _landSplash.ts);
 *   they wait for people on the road as they do for the explorer;
 * - a macaque troop at the forest's edge on both sides of the valley road,
 *   that runs across it in a line a few times a day (_landCrossing.ts).
 *
 * The day's events (events.ts: `elephantBath`, `monkeyCrossing`) start the
 * bath and the crossings; in a storm (`shelter`) the macaques and the
 * junglefowl huddle, the elephants stand and wait.
 *
 * They react to the roaming explorer (look up, run off, settle again; the
 * elephants stop for him) and most of them sleep at night. Behaviour:
 * _landBrain.ts (and _landTrek.ts for the elephants); where they live:
 * _landPlaces.ts; the models and their pose shaders: _land<Species>.ts on
 * the kit in _kit.ts.
 *
 * Cost: one InstancedMesh per species (5 draws; buffalo and elephants also
 * cast shadows) and one for the bath's splashes (6), posed in the vertex shader from eased channels, so the CPU
 * only runs the state machines of the animals within `ACTIVE` m of the camera
 * or the explorer, and writes a buffer only when something changed. Animals
 * too far to be more than a pixel or two are hidden.
 *
 * `?fauna=lineup`: every species in every pose in a row on the valley road
 * (checking the models). `?event=elephantBath|monkeyCrossing` (events.ts):
 * that event from the start (a still at `t=` shows it that far in).
 */

/** Animals this near the camera or the explorer think; the others stand still (m). */
const ACTIVE = 250;
/** Hidden past this distance from the camera (m, for a 1 m animal: scaled by size). */
const FAR: Record<string, number> = { macaque: 190, junglefowl: 140, deer: 330, buffalo: 380, elephant: 1000 };
/** Calls are heard this far from the listener (m). */
const HEAR = 150;
/** Seconds of life simulated before a still (shots), and of the explorer's effect on it. */
const PREROLL = 30;
const REACT = 1.5;
/** Length of road the elephants walk up and down (m). */
const TREK_LENGTH = 55;
/** Where the elephants go down to the river to bathe (the nearest good way down wins: just east of the River Gate's tower and its stone bank, out of its shadow). */
const BATH_NEAR = { x: -36, z: 14 };
/** A still of an event held on by the URL simulates it from its start, up to this long (s). */
const EVENT_PREROLL = 600;

interface Member {
  x: number;
  z: number;
  yaw: number;
  variant: number;
  scale: number;
}

interface Plan {
  sp: Species;
  habits: Habits;
  ground: Ground;
  herd: Herd;
  members: Member[];
  /** Call kinds: when bolting, and now and then. */
  alarm?: AnimalCallKind;
}

/** A baby macaque: rides on its mother's back, sits beside her when she sits. */
interface Rider {
  mother: Agent;
  i: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

export function buildLandFauna(ctx: MapContext): MapPart {
  const object = new Group();
  object.name = 'fauna';
  if (new URLSearchParams(location.search).get('fauna') === 'lineup') {
    const flocks = buildLineup(ctx.field);
    object.add(...flocks.map((f) => f.mesh));
    return { name: 'fauna', object, update: (f) => flocks.forEach((fl) => fl.flush(f.t)) };
  }
  const t0 = performance.now();
  const sv = survey(ctx);
  const tSurvey = performance.now() - t0;
  const open = openGround(sv);
  const temple = templeGround(sv);
  const bank = bankGround(sv);
  const plans: Plan[] = [];
  const taken: Spot[] = [];

  // ── Macaques round the temples (and one troop at the River Gate) ──
  const TROOPS: [number, number, number, number][] = [
    // centre x, z, radius, size
    [0, -172, 14, 7],
    [-290, -200, 16, 6],
    [-80, -18, 14, 6],
    [186, -118, 12, 6],
    [-74, 40, 12, 5],
  ];
  TROOPS.forEach(([cx, cz, r, n], t) => {
    const spots = scatter(temple, cx, cz, r, n, 1.2, 100 + t);
    if (spots.length < 3) return;
    const herd = new Herd(`macaques ${t}`);
    plans.push({
      sp: MACAQUE,
      habits: MACAQUE_HABITS,
      ground: temple,
      herd,
      alarm: 'monkey',
      members: spots.map((s, k) => ({ ...s, yaw: hash3(k, t, 3) * Math.PI * 2, variant: k === 0 ? 2 : 0, scale: k === 0 ? 1.1 : 0.88 + 0.14 * hash3(k, t, 4) })),
    });
    taken.push({ x: cx, z: cz });
  });

  // ── Sambar herds in the meadows, muntjac pairs at the forest edges ──
  for (const [h, m] of meadows(sv, 3, 110, taken).entries()) {
    const spots = scatter(open, m.x, m.z, 10, 5, 2.4, 200 + h);
    if (spots.length < 2) continue;
    const yaw = hash3(h, 1, 5) * Math.PI * 2;
    plans.push({
      sp: DEER,
      habits: SAMBAR_HABITS,
      ground: open,
      herd: new Herd(`sambar ${h}`),
      alarm: 'deer',
      members: spots.map((s, k) => ({ ...s, yaw: yaw + (hash3(k, h, 6) - 0.5) * 2, variant: k === 0 ? 1 : 0, scale: k === 0 ? 1.08 : 0.9 + 0.1 * hash3(k, h, 7) })),
    });
    taken.push(m);
  }
  for (const [h, m] of edges(sv, 3, 90, taken).entries()) {
    const spots = scatter(open, m.x, m.z, 4, 2, 1.5, 300 + h);
    if (!spots.length) continue;
    plans.push({
      sp: DEER,
      habits: MUNTJAC_HABITS,
      ground: open,
      herd: new Herd(`muntjac ${h}`),
      alarm: 'deer',
      members: spots.map((s, k) => ({ ...s, yaw: hash3(k, h, 8) * Math.PI * 2, variant: 2, scale: 0.45 + 0.03 * k })),
    });
    taken.push(m);
  }

  // ── Junglefowl by the road, near the ruins and the gate ──
  const anchor = (id: string): Spot => {
    const p = PLACES.find((q) => q.id === id)!;
    return { x: p.anchor[0], z: p.anchor[2] };
  };
  for (const [h, m] of roadside(sv, [anchor('shrine'), { x: -160, z: -88 }, anchor('rivergate'), { x: -20, z: -30 }, { x: 250, z: -190 }], 50, taken).entries()) {
    const spots = scatter(open, m.x, m.z, 4, 4, 0.8, 400 + h);
    if (spots.length < 2) continue;
    plans.push({
      sp: FOWL,
      habits: FOWL_HABITS,
      ground: open,
      herd: new Herd(`junglefowl ${h}`),
      alarm: 'hen',
      members: spots.map((s, k) => ({ ...s, yaw: hash3(k, h, 9) * Math.PI * 2, variant: k === 0 ? 0 : 1, scale: k === 0 ? 1 : 0.85 })),
    });
    taken.push(m);
  }

  // ── Buffalo on the banks: below the River Gate, and in the valley ──
  for (const [h, m] of banks(sv, [{ x: -22, z: 88 }, { x: 40, z: 14 }], taken).entries()) {
    const spots = scatter(bank, m.x, m.z, 7, 3, 3, 500 + h);
    if (!spots.length) continue;
    plans.push({
      sp: BUFFALO,
      habits: BUFFALO_HABITS,
      ground: bank,
      herd: new Herd(`buffalo ${h}`),
      alarm: 'buffalo',
      members: spots.map((s, k) => ({ ...s, yaw: hash3(k, h, 10) * Math.PI * 2, variant: 0, scale: 0.92 + 0.1 * hash3(k, h, 11) })),
    });
  }

  // ── Flocks and animals ──
  const babies = plans.filter((p) => p.sp === MACAQUE && p.members.length >= 5).length;
  const counts = new Map<Species, number>();
  for (const p of plans) counts.set(p.sp, (counts.get(p.sp) ?? 0) + p.members.length);
  counts.set(MACAQUE, (counts.get(MACAQUE) ?? 0) + babies);
  const stretch = flatStretch(sv);
  if (stretch) counts.set(ELEPHANT, 2);
  // (the open part of the stretch, from its River Gate end: further on, the trees hide the road from the overview)
  const trekStations = stretch ? sv.road.roads[stretch.road].stations.slice(stretch.from, Math.min(stretch.to, stretch.from + TREK_LENGTH * 2) + 1) : [];
  const bathSite = stretch ? findBathSite(sv, trekStations, COW_SIDE, BATH_NEAR, sunBlockers(ctx.scene, BATH_NEAR.x - 15, BATH_NEAR.x + 75, BATH_NEAR.z + 5, BATH_NEAR.z + 80, 5)) : null;
  // The troop that crosses the valley road: away from the temples' troops, the elephants and the balloon's field.
  const crossSite = findCrossSite(sv, [...TROOPS.map(([x, z]) => ({ x, z, r: 45 })), ...trekStations.filter((_, i) => i % 20 === 0).map((q) => ({ x: q.x, z: q.z, r: 30 })), { x: -32, z: -64, r: 35 }]);
  if (crossSite) counts.set(MACAQUE, (counts.get(MACAQUE) ?? 0) + Crossing.SIZE);
  const flocks = new Map<Species, Flock>();
  for (const [sp, n] of counts) {
    const fl = new Flock(sp, n);
    flocks.set(sp, fl);
    object.add(fl.mesh);
  }
  const used = new Map<Species, number>();
  const next = (sp: Species) => {
    const i = used.get(sp) ?? 0;
    used.set(sp, i + 1);
    return i;
  };
  const agents: Agent[] = [];
  const far: number[] = [];
  for (const p of plans) {
    const fl = flocks.get(p.sp)!;
    p.members.forEach((m, k) => {
      const i = next(p.sp);
      fl.setup(i, m.variant, hash3(i, k, 12), 0.92 + 0.16 * hash3(i, k, 13));
      agents.push(new Agent(fl, i, p.habits, p.ground, p.herd, m.x, m.z, m.yaw, m.scale, 1000 + agents.length * 7919));
      far.push(FAR[p.sp.name] * Math.sqrt(m.scale));
    });
  }
  // Babies: on a mother in the bigger troops.
  const riders: Rider[] = [];
  for (const p of plans) {
    if (p.sp !== MACAQUE || p.members.length < 5) continue;
    const mother = agents.find((a) => a.herd === p.herd && a.scale < 1)!;
    const i = next(MACAQUE);
    flocks.get(MACAQUE)!.setup(i, 1, hash3(i, 1, 14), 1);
    riders.push({ mother, i, x: mother.x, y: mother.y, z: mother.z, yaw: mother.yaw });
  }
  const splash = bathSite ? new Splash() : null;
  if (splash) object.add(splash.mesh);
  const trek = stretch ? new Trek(flocks.get(ELEPHANT)!, trekStations, 77, bathSite, splash) : null;
  let crossing: Crossing | null = null;
  if (crossSite) {
    const first = next(MACAQUE);
    for (let k = 1; k < Crossing.SIZE; k++) next(MACAQUE);
    crossing = new Crossing(flocks.get(MACAQUE)!, first, crossSite, 4242);
  }
  const plansByHerd = new Map(plans.map((p) => [p.herd, p]));
  Object.assign(window, { __fauna: { plans, agents, riders, trek, crossing, bathSite, crossSite } });

  const buildMs = performance.now() - t0;
  const tally = [...counts].map(([sp, n]) => `${sp.name} ${n}`).join(', ');
  const where = (p: { x: number; z: number } | undefined) => (p ? `(${p.x.toFixed(0)}, ${p.z.toFixed(0)})` : 'none');
  console.info(
    `[map] fauna: ${tally} (${plans.length} herds) · ${flocks.size + (splash ? 1 : 0)} draws · built in ${buildMs.toFixed(0)} ms (survey ${tSurvey.toFixed(0)}) · bath ${where(bathSite?.path.at(-1))} · monkeys cross at ${where(crossSite ?? undefined)}`,
  );

  // ── Frame ──
  const explorer: Walker = { x: 0, y: 0, z: 0 };
  let now = 0;
  let started = false;
  let settled = false;
  /** People on the roads (the people part's traffic, as it was last frame): the elephants wait for them. */
  const people: Passer[] = [];
  const readPeople = () => {
    people.length = 0;
    const list = (window as unknown as { __people?: { traffic?: { list: readonly (Passer & { who: string })[] } } }).__people?.traffic?.list;
    if (list) for (const o of list) if (o.who !== 'animal' && o.who !== 'explorer' && o.who !== 'beacon') people.push(o);
  };
  const world: TrekWorld = { people, bath: false, bathCount: 0, storm: 0 };
  let ev: Readonly<EventState> | null = null;
  /** One step of every animal's life. */
  const live = (dt: number, f: MapFrame, ex: Walker | null) => {
    const cam = f.camera.position;
    const big = trek ? trek.cow : null;
    const shelter = ev?.shelter ?? 0;
    // (in a storm the monkeys and the junglefowl huddle as they do at night)
    const huddle = Math.max(f.night, shelter);
    for (let a = 0; a < agents.length; a++) {
      const ag = agents[a];
      // (sqrt of the squares, not Math.hypot: this runs for every animal every frame)
      const cx = ag.x - cam.x;
      const cy = ag.y - cam.y;
      const cz = ag.z - cam.z;
      const dc = Math.sqrt(cx * cx + cz * cz + cy * cy);
      let de = Infinity;
      if (ex) {
        const ax = ag.x - ex.x;
        const az = ag.z - ex.z;
        de = Math.sqrt(ax * ax + az * az);
      }
      const sp = ag.flock.species;
      if (Math.min(dc, de) < ACTIVE) ag.step(dt, now, ex, big, sp === MACAQUE || sp === FOWL ? huddle : f.night);
      else ag.freeze(now);
      if (dc < far[a]) ag.flock.place(ag.i, ag.x, ag.y, ag.z, ag.yaw, ag.scale);
      else ag.flock.hide(ag.i);
    }
    for (const r of riders) ride(r, dt, now, cam.x, cam.y, cam.z);
    if (trek) {
      world.bath = ev?.on.elephantBath ?? false;
      world.bathCount = ev?.count.elephantBath ?? 0;
      world.storm = shelter;
      trek.step(dt, now, ex, f.night, world);
    }
    crossing?.step(dt, now, ex, f.night, shelter, ev?.on.monkeyCrossing ?? false, ev?.count.monkeyCrossing ?? 0, cam, people);
  };
  const ride = (r: Rider, dt: number, t: number, cx: number, cy: number, cz: number) => {
    const m = r.mother;
    const fl = flocks.get(MACAQUE)!;
    if (!m.flock.isShown(m.i)) return fl.hide(r.i);
    const sitting = m.mode === 'idle' && fl.target(m.i, CH.rest) > 0.5;
    const s = m.scale;
    // Sitting: beside her (her right); else on her back, a little behind the shoulders.
    const side = sitting ? -0.24 * s : 0;
    const back = sitting ? 0.02 : -0.06 * s;
    const tx = m.x + Math.cos(m.yaw) * side + Math.sin(m.yaw) * back;
    const tz = m.z - Math.sin(m.yaw) * side + Math.cos(m.yaw) * back;
    const ty = m.y + (sitting ? 0 : 0.38 * s);
    const k = Math.min(1, dt * 8);
    r.x += (tx - r.x) * k;
    r.y += (ty - r.y) * k;
    r.z += (tz - r.z) * k;
    r.yaw = m.yaw + (sitting ? 0.5 : 0);
    fl.gait(r.i, 0, 2, t);
    fl.set(r.i, CH.rest, sitting ? 1 : 0, t);
    fl.set(r.i, CH.head, sitting ? fl.target(m.i, CH.head) : 0.2, t);
    const dx = r.x - cx;
    const dy = r.y - cy;
    const dz = r.z - cz;
    if (Math.sqrt(dx * dx + dz * dz + dy * dy) < FAR.macaque * 0.6) fl.place(r.i, r.x, r.y, r.z, r.yaw, 0.42);
    else fl.hide(r.i);
  };
  /** Sounds: bolting animals, and now and then a call (not in shots). */
  // (made once, not each frame: `callFrame` is the frame `calls` is sounding)
  let callFrame: MapFrame | null = null;
  const push = (kind: AnimalCallKind, x: number, y: number, z: number, gain: number) => {
    const f = callFrame!;
    const L = f.listener;
    const dx = x - L.x;
    const dy = y - L.y;
    const dz = z - L.z;
    if (Math.sqrt(dx * dx + dy * dy + dz * dz) < HEAR) f.calls.push({ kind, x, y, z, gain });
  };
  const calls = (f: MapFrame) => {
    callFrame = f;
    for (const ag of agents) {
      const ev = ag.event;
      if (!ev) continue;
      ag.event = null;
      const plan = plansByHerd.get(ag.herd)!;
      if (ev === 'flee' && plan.alarm) {
        push(plan.alarm, ag.x, ag.y + 0.5, ag.z, plan.alarm === 'buffalo' ? 0.5 : 0.85);
        if (plan.sp === FOWL) push('wings', ag.x, ag.y + 0.3, ag.z, 0.5);
      }
    }
    for (const p of plans) {
      const h = p.herd;
      h.callIn -= f.dt;
      if (h.callIn > 0) continue;
      const lead = h.members[0];
      h.callIn = 20 + 40 * lead.rnd();
      if (lead.asleep || f.night > 0.6) continue;
      if (p.sp === MACAQUE) push('monkey', lead.x, lead.y + 0.4, lead.z, 0.35);
      else if (p.sp === FOWL) {
        // The rooster crows now and then; the hens cluck in between.
        if (lead.rnd() < 0.35) push('rooster', lead.x, lead.y + 0.5, lead.z, 0.9);
        else {
          const hen = h.members[1 + Math.floor(lead.rnd() * (h.members.length - 1))] ?? lead;
          push('hen', hen.x, hen.y + 0.3, hen.z, 0.3);
          h.callIn = 6 + 12 * lead.rnd();
        }
      } else if (p.sp === BUFFALO && lead.rnd() < 0.4) push('buffalo', lead.x, lead.y + 1, lead.z, 0.5);
    }
    if (crossing?.event) {
      const a = crossing.at;
      push('monkey', a.x, a.y + 0.4, a.z, crossing.event === 'chatter' ? 0.7 : 0.4);
      crossing.event = null;
    }
    if (trek) {
      const c = trek.cow;
      if (trek.event === 'trumpet') push('elephant', c.x, c.y + 2.5, c.z, 1);
      // The bath: the spray coming down, the calf flopping over (a splash), the cow's call as she wades in.
      else if (trek.event === 'splash') push('fish', c.x, c.y + 1, c.z, 0.9);
      else if (trek.event === 'roll') push('fish', c.x, c.y + 0.5, c.z, 0.8);
      else if (trek.event === 'call') push('elephant', c.x, c.y + 2.5, c.z, 0.55);
      trek.event = null;
      trekCallIn -= f.dt;
      if (trekCallIn <= 0) {
        trekCallIn = 30 + 40 * hash3(Math.floor(now), 3, 15);
        if (f.night < 0.6) push('elephant', c.x, c.y + 2, c.z, 0.45);
      }
    }
  };
  let trekCallIn = 20;

  return {
    name: 'fauna',
    object,
    update(f: MapFrame) {
      ev = eventsNow(f);
      readPeople();
      let ex: Walker | null = null;
      if (f.roam !== 'overview') {
        explorer.x = f.listener.x;
        explorer.y = f.listener.y - ROAM_HEIGHT;
        explorer.z = f.listener.z;
        ex = explorer;
      }
      if (!started) {
        started = true;
        // A still shows the animals as they would be after a while (the same every time for a given t);
        // an event held on by the URL, from its start (so `t` is how far into it).
        const pre = ev.forced === 'elephantBath' || ev.forced === 'monkeyCrossing' ? Math.min(EVENT_PREROLL, Math.max(0, f.t)) : PREROLL;
        now = ctx.shot ? f.t - pre : f.t;
        if (ctx.shot) {
          for (let k = 0; k < pre * 10; k++, now += 0.1) live(0.1, f, null);
          if (trek) console.info(`[map] fauna: elephants at (${trek.cow.x.toFixed(1)}, ${trek.cow.y.toFixed(1)}, ${trek.cow.z.toFixed(1)})${trek.bathLog.length ? ` · ${trek.bathLog.join(' · ')}` : ''}`);
          if (crossing?.crossings) console.info(`[map] fauna: monkeys crossing (${crossing.mode}) since ${(now - crossing.startedAt).toFixed(1)} s`);
        }
      } else if (ctx.shot && !settled && f.dt > 0) {
        // (then how they took the explorer's arrival)
        settled = true;
        for (let k = 0; k < REACT * 10; k++, now += 0.1) live(0.1, f, ex);
      }
      now += f.dt;
      live(f.dt, f, ex);
      if (!ctx.shot && f.dt > 0) calls(f);
      else for (const ag of agents) ag.event = null;
      for (const fl of flocks.values()) fl.flush(now);
      splash?.flush(now, f.night);
    },
    // (the nature book, roam/_book.ts: the animals drawn now; read only)
    subjects(out: Subject[]) {
      for (const ag of agents) {
        if (!ag.flock.isShown(ag.i)) continue;
        const p = plansByHerd.get(ag.herd)!;
        const kind: SubjectKind = p.sp === MACAQUE ? 'macaque' : p.sp === FOWL ? 'junglefowl' : p.sp === BUFFALO ? 'buffalo' : p.habits === MUNTJAC_HABITS ? 'muntjac' : 'sambar';
        const r = (p.sp === MACAQUE ? 0.38 : p.sp === FOWL ? 0.32 : p.sp === BUFFALO ? 1.05 : 0.9) * ag.scale;
        out.push({ kind, x: ag.x, y: ag.y + r * 0.9, z: ag.z, r });
      }
      const el = flocks.get(ELEPHANT);
      if (el)
        for (let i = 0; i < el.count; i++) {
          if (!el.isShown(i)) continue;
          const m = el.mesh.instanceMatrix.array;
          const r = i === 0 ? 1.7 : 0.8;
          out.push({ kind: 'elephant', x: m[i * 16 + 12], y: m[i * 16 + 13] + r, z: m[i * 16 + 14], r });
        }
    },
  };
}

