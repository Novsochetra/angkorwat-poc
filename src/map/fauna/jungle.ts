import { Group } from 'three';
import { hash3 } from '../../voxel/random';
import { ROAM_HEIGHT } from '../roam/types';
import type { AnimalCallKind, MapContext, MapFrame, MapPart, Subject } from '../types';
import { Flock } from './_kit';
import { Agent, Herd, type Habits, type Walker } from './_landBrain';
import { scatter } from './_landPlaces';
import { View } from './_waterAirKit';
import { BIG_BIRDS_MAX, buildJungleLineup } from './_jungleLineup';
import { BigBirds, BIRD, BIRDS, flapping } from './_jungleBirds';
import { BOAR, PIGLET_HABITS, SOW_HABITS } from './_jungleBoar';
import { Family, FAMILY_MAX, GIBBON, territory } from './_jungleGibbons';
import { PEACOCK_HABITS, PEAFOWL, PEAHEN_HABITS } from './_junglePeafowl';
import { CRITTERS, SmallLife } from './_jungleSmall';
import { canopyTop, clearings, forestFloors, groves, lowBanks, marshGround, readCanopy, sites, tallCrowns, type Spot } from './_jungleSurvey';

/**
 * Animals you meet up close in the jungle (roaming on foot), real ones of
 * Cambodia's forests:
 *
 * - wild boar: a sow and her striped piglets rooting on the forest floor
 *   under the trees; they trot off when the explorer comes close;
 * - green peafowl in the clearings (a male and his hens): pecking, looking
 *   about, now and then the male fans his train; calls at dusk and dawn;
 * - great hornbills: pairs on the tallest crowns, flying over the canopy
 *   between them with heavy whooshing wingbeats (a pair crossing the
 *   forest is seen from the picker too);
 * - giant ibis, Cambodia's national bird: a pair on a lowland river bank,
 *   off low and honking when he comes near;
 * - pileated gibbon families high in the crowns, swinging from tree to tree;
 *   the pair's duet in the morning;
 * - small life round him: a squirrel on a trunk, a water monitor by the
 *   water, a green whip snake on a bush, skinks on the floor.
 *
 * They notice him, move off, settle again; at night the boar lie together,
 * the gibbons and hornbills sleep on their crowns, the peafowl have gone up
 * into the trees and the small ones are hidden. Where they live is read from
 * the built jungle (_jungleSurvey.ts); behaviour: _landBrain.ts (boar,
 * peafowl), _jungleGibbons.ts, _jungleBirds.ts, _jungleSmall.ts.
 *
 * Cost: five draws (one InstancedMesh each: boar, peafowl, gibbons, big
 * birds, small life), posed in the vertex shader from eased channels; only
 * animals within `ACTIVE` m of the camera or the explorer think, far ones
 * are hidden. `f.canopy` (the leaves over his head) is set here for the
 * cicadas (audio/ambience.ts).
 *
 * `?fauna=jungle`: every species in every pose in a row on the valley road.
 */

/** Animals this near the camera or the explorer think; the others stand still (m). */
const ACTIVE = 250;
/** Hidden past this distance from the camera (m). */
const FAR = { boar: 200, peafowl: 190, gibbon: 230, hornbill: 900, ibis: 460 };
/** Calls are heard this far from the listener (m); the gibbons' song and the hornbills carry. */
const HEAR = 150;
const HEAR_FAR = 380;
/** Seconds of life simulated before a still (shots), and of the explorer's effect on it. */
const PREROLL = 30;
const REACT = 1.5;

interface Plan {
  habits: Habits;
  herd: Herd;
  kind: 'boar' | 'peafowl';
  members: { x: number; z: number; yaw: number; variant: number; scale: number; habits: Habits }[];
}

export function buildJungleFauna(ctx: MapContext): MapPart {
  const object = new Group();
  object.name = 'jungleFauna';
  if (new URLSearchParams(location.search).get('fauna') === 'jungle') {
    const flocks = buildJungleLineup(ctx.field);
    object.add(...flocks.map((f) => f.mesh));
    return { name: 'jungleFauna', object, update: (f) => flocks.forEach((fl) => fl.flush(f.t)) };
  }
  const t0 = performance.now();
  const cn = readCanopy(ctx);
  const tRead = performance.now() - t0;
  const s = sites(cn);
  const floor = s.floor;

  // ── Boar on the forest floor, peafowl in the clearings ──
  const plans: Plan[] = [];
  const taken: Spot[] = [];
  forestFloors(s, 3, 120, taken).forEach((m, h) => {
    const spots = scatter(floor, m.x, m.z, 5, 5, 1, 600 + h);
    if (spots.length < 2) return;
    const yaw = hash3(h, 2, 5) * Math.PI * 2;
    plans.push({
      kind: 'boar',
      habits: SOW_HABITS,
      herd: new Herd(`boar ${h}`),
      members: spots.map((p, k) => ({
        ...p,
        yaw: yaw + (hash3(k, h, 6) - 0.5) * 2,
        variant: k === 0 ? 0 : 1,
        scale: k === 0 ? 1.05 + 0.1 * hash3(h, 3, 7) : 0.34 + 0.06 * hash3(k, h, 8),
        habits: k === 0 ? SOW_HABITS : PIGLET_HABITS,
      })),
    });
    taken.push(m);
  });
  clearings(s, 2, 150, taken).forEach((m, h) => {
    const spots = scatter(floor, m.x, m.z, 6, 3, 2, 700 + h);
    if (!spots.length) return;
    plans.push({
      kind: 'peafowl',
      habits: PEACOCK_HABITS,
      herd: new Herd(`peafowl ${h}`),
      members: spots.map((p, k) => ({ ...p, yaw: hash3(k, h, 9) * Math.PI * 2, variant: k === 0 ? 0 : 1, scale: k === 0 ? 1.15 : 1.05, habits: k === 0 ? PEACOCK_HABITS : PEAHEN_HABITS })),
    });
    taken.push(m);
  });
  const count = (kind: Plan['kind']) => plans.filter((p) => p.kind === kind).reduce((a, p) => a + p.members.length, 0);
  const boar = new Flock(BOAR, Math.max(1, count('boar')));
  const peafowl = new Flock(PEAFOWL, Math.max(1, count('peafowl')));
  const agents: Agent[] = [];
  const farOf: number[] = [];
  const planOf = new Map<Herd, Plan>();
  const used = { boar: 0, peafowl: 0 };
  for (const p of plans) {
    planOf.set(p.herd, p);
    const fl = p.kind === 'boar' ? boar : peafowl;
    for (const m of p.members) {
      const i = used[p.kind]++;
      fl.setup(i, m.variant, hash3(i, 7, 12), 0.92 + 0.16 * hash3(i, 7, 13));
      agents.push(new Agent(fl, i, m.habits, floor, p.herd, m.x, m.z, m.yaw, m.scale, 5000 + agents.length * 7919));
      farOf.push(FAR[p.kind] * Math.sqrt(m.scale));
    }
  }

  // ── Gibbon families in the groves of tall crowns ──
  const families: Family[] = [];
  const grove = groves(cn, 4, 170, []);
  const gibbons = new Flock(GIBBON, Math.max(1, grove.length * FAMILY_MAX));
  let ape = 0;
  for (const [k, g] of grove.entries()) {
    const crowns = territory(cn, g);
    if (!crowns.length) continue;
    const fam = new Family(gibbons, cn, crowns, ape, 900 + k * 31);
    ape += fam.apes.length;
    families.push(fam);
  }

  // ── Hornbill pairs on the tallest crowns, giant ibis on the lowland banks ──
  const SEEN = 5;
  const perches = tallCrowns(cn, 12, 45, SEEN);
  const banks = lowBanks(cn, 4, 110);
  const birdsFlock = new Flock(BIRDS, BIG_BIRDS_MAX);
  const perchY = (x: number, z: number, y: number) => {
    const top = canopyTop(cn, x, z);
    return Math.abs(top - y) < 1.6 ? top : y;
  };
  const birds = new BigBirds(birdsFlock, perches, Math.min(SEEN, perches.length), banks, marshGround(cn), perchY);
  let bird = 0;
  if (perches.length >= 3) {
    birds.addHornbills(bird, 0);
    bird += 2;
  }
  if (perches.length >= 6) {
    birds.addHornbills(bird, Math.min(perches.length - 1, SEEN));
    bird += 2;
  }
  for (const b of [0, 2]) {
    if (b >= banks.length) break;
    birds.addIbises(bird, b);
    bird += 2;
  }
  for (let i = bird; i < BIG_BIRDS_MAX; i++) birdsFlock.hide(i);

  // ── Small life round the explorer ──
  const small = new SmallLife(new Flock(CRITTERS, SmallLife.count), cn, floor, ctx.shot);

  const flocks = [boar, peafowl, gibbons, birdsFlock, small.flock];
  object.add(...flocks.map((f) => f.mesh));
  Object.assign(window, { __jungle: { cn, plans, agents, families, birds, small, perches, banks } });

  const buildMs = performance.now() - t0;
  console.info(
    `[map] jungleFauna: ${count('boar')} boar in ${plans.filter((p) => p.kind === 'boar').length} sounders, ${count('peafowl')} peafowl, ` +
      `${ape} gibbons in ${families.length} families, ${birds.birds.filter((b) => b.kind === BIRD.hornbill).length} hornbills, ` +
      `${birds.birds.filter((b) => b.kind === BIRD.ibis).length} giant ibis, ${SmallLife.count} small · ${cn.crowns.length} crowns, ${cn.trunks.length} trunks · ` +
      `${flocks.length} draws · built in ${buildMs.toFixed(0)} ms (canopy ${tRead.toFixed(0)})`,
  );

  // ── Frame ──
  const view = new View();
  const explorer: Walker = { x: 0, y: 0, z: 0 };
  let now = 0;
  let started = false;
  let settled = false;
  let frames = 0;
  let spent = 0;
  let canopy = 0;
  /** Peafowl gone up to roost (hidden) per herd. */
  const roosting = new Set<Herd>();
  const seen = (x: number, y: number, z: number) => view.sees(x, y, z, 0.3, 80);

  /** One step of every animal's life; `ex` on foot, `exAny` on foot or by boat. */
  const live = (dt: number, f: MapFrame, ex: Walker | null, exAny: Walker | null) => {
    const cam = f.camera.position;
    // Boar and peafowl.
    for (let a = 0; a < agents.length; a++) {
      const ag = agents[a];
      const dc = Math.hypot(ag.x - cam.x, ag.z - cam.z, ag.y - cam.y);
      const de = ex ? Math.hypot(ag.x - ex.x, ag.z - ex.z) : Infinity;
      const plan = planOf.get(ag.herd)!;
      // (the piglets keep round their mother)
      const mother = ag.herd.members[0];
      if (plan.kind === 'boar' && ag !== mother) {
        ag.homeX = mother.x;
        ag.homeZ = mother.z;
      }
      if (Math.min(dc, de) < ACTIVE) ag.step(dt, now, ex, null, f.night);
      else ag.freeze(now);
      let show = dc < farOf[a];
      if (plan.kind === 'peafowl') {
        // Up into the trees at night (out of sight), down in the morning.
        const r = roosting.has(ag.herd);
        if (!r && f.night > 0.65 && (dc > 60 || !view.sees(ag.x, ag.y + 0.6, ag.z, 1.5, 400))) roosting.add(ag.herd);
        else if (r && f.night < 0.55) roosting.delete(ag.herd);
        show &&= !roosting.has(ag.herd);
      }
      if (show) ag.flock.place(ag.i, ag.x, ag.y, ag.z, ag.yaw, ag.scale);
      else ag.flock.hide(ag.i);
    }
    // Gibbons.
    for (const fam of families) {
      const dc = Math.hypot(fam.x - cam.x, fam.z - cam.z, fam.y - cam.y);
      const de = ex ? Math.hypot(fam.x - ex.x, fam.z - ex.z) : Infinity;
      if (Math.min(dc, de) < ACTIVE) fam.step(dt, now, ex, f.night, f.clock);
      else fam.freeze(now);
      fam.show(cam.x, cam.y, cam.z, FAR.gibbon);
    }
    // Big birds (always: a few, and they are seen from far).
    birds.step(dt, now, exAny, f.night, f.roam === 'overview');
    birds.show(cam.x, cam.y, cam.z, (b) => (b.kind === BIRD.hornbill ? FAR.hornbill : FAR.ibis));
    // Small life round the explorer (by day, on foot).
    const m = f.camera.matrixWorld.elements;
    small.now = now;
    small.step(dt, now, ex, -m[8], -m[10], seen, f.night < 0.45);
    small.show();
  };

  /** Sounds: bolting and calling animals (not in shots). */
  const calls = (f: MapFrame) => {
    const L = f.listener;
    const push = (kind: AnimalCallKind, x: number, y: number, z: number, gain: number, hear = HEAR) => {
      if (Math.hypot(x - L.x, y - L.y, z - L.z) < hear) f.calls.push({ kind, x, y, z, gain });
    };
    const day = f.night < 0.55;
    const dusk = (f.clock > 0.17 && f.clock < 0.33) || (f.clock > 0.68 && f.clock < 0.84);
    for (const ag of agents) {
      const ev = ag.event;
      ag.event = null;
      const plan = planOf.get(ag.herd)!;
      if (ev === 'flee') {
        if (plan.kind === 'boar') push(ag === ag.herd.members[0] ? 'boar' : 'piglet', ag.x, ag.y + 0.4, ag.z, ag === ag.herd.members[0] ? 0.9 : 0.6);
        else push('peafowl', ag.x, ag.y + 0.8, ag.z, 0.55);
      }
    }
    for (const p of plans) {
      const h = p.herd;
      h.callIn -= f.dt;
      if (h.callIn > 0) continue;
      const lead = h.members[0];
      if (p.kind === 'boar') {
        h.callIn = 7 + 14 * lead.rnd();
        if (lead.asleep || lead.mode !== 'idle') continue;
        // The sow grunts as she roots; now and then a piglet squeaks.
        if (lead.rnd() < 0.7) push('boar', lead.x, lead.y + 0.4, lead.z, 0.35);
        else {
          const pig = h.members[1 + Math.floor(lead.rnd() * (h.members.length - 1))] ?? lead;
          push('piglet', pig.x, pig.y + 0.2, pig.z, 0.3);
        }
      } else {
        // The male's "may-awe": at dusk and dawn, now and then by day.
        h.callIn = dusk ? 18 + 30 * lead.rnd() : 80 + 120 * lead.rnd();
        if (!roosting.has(h) && (day || dusk) && !lead.asleep) push('peafowl', lead.x, lead.y + 1, lead.z, 0.8, HEAR_FAR * 0.6);
        else if (dusk && roosting.has(h)) push('peafowl', lead.x, lead.y + 8, lead.z, 0.7, HEAR_FAR * 0.6);
      }
    }
    for (const fam of families) {
      if (fam.event === 'song') push('gibbon', fam.x, fam.y + 1, fam.z, 1, HEAR_FAR);
      else if (fam.event === 'hoot') push('gibbonHoot', fam.x, fam.y + 1, fam.z, 0.7, HEAR_FAR);
      fam.event = null;
    }
    for (const b of birds.birds) {
      const ev = b.event;
      b.event = null;
      const hornbill = b.kind === BIRD.hornbill;
      if (ev === 'off') {
        push(hornbill ? 'hornbill' : 'ibis', b.x, b.y + 0.6, b.z, 0.85, hornbill ? HEAR_FAR * 0.7 : HEAR);
        if (!hornbill) push('wings', b.x, b.y + 0.5, b.z, 0.6);
      } else if (ev === 'call' && day) push(hornbill ? 'hornbill' : 'ibis', b.x, b.y + 0.6, b.z, hornbill ? 0.6 : dusk ? 0.6 : 0.35, hornbill ? HEAR_FAR * 0.7 : HEAR);
      // The hornbill's wings: a whoosh at each run of beats, heard some way off.
      if (hornbill && b.flight) {
        const on = b.act > 0 || flapping(BIRD.hornbill, now, b.seed);
        if (on && !b.burst) push('whoosh', b.x, b.y, b.z, 0.9, 90);
        b.burst = on;
      } else b.burst = false;
    }
    for (const c of small.critters) {
      if (c.event === 'scold' && c.on) push('squirrel', c.x, c.y, c.z, 0.6, 60);
      c.event = null;
    }
  };

  /** Leaves over the explorer's head (0‥1): the cicadas are louder in the forest. */
  const cover = (f: MapFrame) => {
    let want = 0;
    if (f.roam === 'walk' || f.roam === 'boat') {
      const L = f.listener;
      let n = 0;
      let over = 0;
      for (let dz = -6; dz <= 6; dz += 3)
        for (let dx = -6; dx <= 6; dx += 3) {
          const c = cn.field.index(L.x + dx, L.z + dz);
          if (c < 0) continue;
          n++;
          if (cn.top[c] > L.y) over++;
        }
      want = n ? over / n : 0;
    }
    canopy += (want - canopy) * (f.dt > 0 ? 1 - Math.exp(-f.dt / 1.5) : 1);
    f.canopy = canopy;
  };

  return {
    name: 'jungleFauna',
    object,
    update(f: MapFrame) {
      const a0 = performance.now();
      view.set(f.camera);
      let ex: Walker | null = null;
      let exAny: Walker | null = null;
      if (f.roam === 'walk' || f.roam === 'boat') {
        explorer.x = f.listener.x;
        explorer.y = f.listener.y - ROAM_HEIGHT;
        explorer.z = f.listener.z;
        exAny = explorer;
        if (f.roam === 'walk') ex = explorer;
      }
      if (!started) {
        started = true;
        // A still shows the animals as they would be after a while (the same every time for a given t).
        now = ctx.shot ? f.t - PREROLL : f.t;
        if (ctx.shot) for (let k = 0; k < PREROLL * 10; k++, now += 0.1) live(0.1, f, null, null);
      } else if (ctx.shot && !settled && f.dt > 0) {
        // (then how they took the explorer's arrival)
        settled = true;
        for (let k = 0; k < REACT * 10; k++, now += 0.1) live(0.1, f, ex, exAny);
      }
      now += f.dt;
      live(f.dt, f, ex, exAny);
      if (!ctx.shot && f.dt > 0) calls(f);
      else {
        for (const ag of agents) ag.event = null;
        for (const fam of families) fam.event = null;
        for (const b of birds.birds) b.event = null;
        for (const c of small.critters) c.event = null;
      }
      cover(f);
      for (const fl of flocks) fl.flush(now);
      // (every mesh drawn in the first frames, so its shaders compile at load)
      if (frames < 3) for (const fl of flocks) fl.mesh.visible = true;
      spent += performance.now() - a0;
      if (++frames === 64 && !ctx.shot) console.info(`[map] jungleFauna: ${(spent / frames).toFixed(3)} ms a frame (CPU, average of ${frames})`);
    },
    // (the nature book, roam/_book.ts: the animals drawn now; read only)
    subjects(out: Subject[]) {
      for (const ag of agents) {
        if (!ag.flock.isShown(ag.i)) continue;
        const boar = planOf.get(ag.herd)!.kind === 'boar';
        const r = (boar ? 0.6 : 0.5) * ag.scale;
        out.push({ kind: boar ? 'boar' : 'peafowl', x: ag.x, y: ag.y + r * 0.9, z: ag.z, r });
      }
      for (const fam of families) for (const a of fam.apes) if (gibbons.isShown(a.i)) out.push({ kind: 'gibbon', x: a.x, y: a.y + 0.3 * a.scale, z: a.z, r: 0.35 * a.scale });
      for (const b of birds.birds) {
        if (!birdsFlock.isShown(b.i)) continue;
        const r = (b.kind === BIRD.hornbill ? 0.6 : 0.5) * b.scale;
        out.push({ kind: b.kind === BIRD.hornbill ? 'hornbill' : 'ibis', x: b.x, y: b.y + r * 0.8, z: b.z, r });
      }
      const SMALL_R = { squirrel: 0.15, monitor: 0.55, snake: 0.35, skink: 0.1 };
      for (const c of small.critters) if (c.on && small.flock.isShown(c.i)) out.push({ kind: c.kind, x: c.x, y: c.y + SMALL_R[c.kind] * 0.5, z: c.z, r: SMALL_R[c.kind] * c.scale });
    },
  };
}
