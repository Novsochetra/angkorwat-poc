import { Group } from 'three';
import { traceSource } from '../../feedback/sourceTrace';
import { VoxelBuilder } from '../../voxel/VoxelBuilder';
import { buildVoxelMesh, disposeVoxelMesh } from '../../voxel/VoxelMesh';
import { hash3 } from '../../voxel/random';
import { GROWN, KINDS, stageOf, type Stage } from '../garden/kinds';
import { GARDEN, type Plant } from '../garden/state';
import { progress } from '../progress';
import { t } from '../ui/lang';
import { registerAddon, type AddonEnv } from './_addons';
import { BODHI, BODHI_PLAN, BODHI_SEED, BODHI_TREE, bodhiCue, bodhiToWorld } from './_bodhiHooks';
import { startPlant, type PlantSession } from './_bodhiPlant';
import { startTalk, TALK, type TalkSession } from './_bodhiTalk';
import type { RoamCtx } from './types';

/**
 * The bodhi tree at the village pagoda (add-on `bodhi`; the guide
 * docs/map-work/addons.md "His home garden"; the tree garden/models/bodhi.ts, the
 * head monk people/_sceneBodhiMonk.ts, what they share roam/_bodhiHooks.ts, the
 * words `gardenBodhi…` in ui/lang.ts).
 *
 * - **When**: once his garden at home has given him something — a harvest picked,
 *   or a plant of his fully grown (`GARDEN.on('picked' | 'grown')`; kept:
 *   progress.ts `bodhi.ready`) — the head monk of the village pagoda has a bodhi
 *   sapling for him. He sweeps the grass on the pagoda's rise west of the terrace by
 *   day (at night he sits there in meditation); as the explorer comes near, he stops,
 *   turns to him and nods.
 * - **The sapling** (_bodhiTalk.ts): beside him, E "Talk to the monk": the monk
 *   gives it (`GARDEN.addSeeds('bodhi', 1)`, `GARDEN.setBodhiGiven()`) and points to
 *   the place: a small ring of stones on the grass between the hall and the lake
 *   (`BODHI_TREE`), which shows from then on.
 * - **The planting** (_bodhiPlant.ts): at the ring, E "Plant the bodhi tree": he
 *   plants it (`GARDEN.plant('bodhi', x, z, yaw, seed, 'pagoda')`: the garden's view
 *   draws it), kneels; the monk chants and sprinkles the lustral water over the
 *   sapling and him, blesses it in Khmer; three bows, the toast.
 * - **Growing**: the monks water it (it never dries: garden/state.ts); it grows over
 *   24 game days (a game year) to a great tree of 14 m. Coming back near it, a toast
 *   says it has grown (a stage further than he last saw it), and once when it is
 *   fully grown; at dawn the head monk sits under the grown tree.
 *
 * Keys: E (the pad's □ / X, the touch Use button); E, Space or the stick leave off the
 * blessing (the tree stays planted).
 *
 * URL (checks; shots keep nothing): `bodhi=ready` (the monk has the sapling for him),
 * `bodhi=offer` (ready, the explorer a few steps from the monk, who notices him),
 * `bodhi=talk[:<s>]` (that far into the monk's moment, by default as he holds the
 * sapling out), `bodhi=given` (the sapling his, the ring shown, he stands by it),
 * `bodhi=plant[:<s>]` (that far into the planting and the blessing, by default the monk
 * sprinkling), `bodhi=planted` or `bodhi=<0‥4>` (the tree at that stage, also in the
 * overview's shots); `bodhimonk=<cue>` (the monk alone at a cue). The moments that start
 * roaming put him at their place whatever `at=` says (give one on the pagoda's rise,
 * `at=-325,88`: roaming starts there). `report()` gives `bodhi=`.
 * `window.__bodhi` (checks): `state()`.
 */

/** Near enough the monk to talk (m across, and up or down); he notices him from this far, again once he has gone this far. */
const TALK_R = 3.2;
const TALK_UP = 1.6;
const NOTICE = 13;
const FAR = 30;
/** Near enough the ring to plant (m from his place before it). */
const PLANT_R = 2.4;
/** Near enough the tree for its news (m): it has grown, it is grown. */
const NEWS = 45;

type Session = TalkSession | PlantSession;

let env: AddonEnv | null = null;
let session: Session | null = null;
let offered: 'talk' | 'plant' | null = null;
let noticed = false;
/** The ring of stones (small round the sapling, wide round the great tree's roots), and which is shown. */
const ring = new Group();
ring.name = 'bodhi:ring';
let ringMesh: Group | null = null;
let ringSize: 'small' | 'grown' | null = null;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The pagoda's bodhi (null: not planted yet). */
function tree(): Plant | null {
  for (const p of GARDEN.plants) if (p.kind === 'bodhi' && p.at === 'pagoda') return p;
  return null;
}

const stageNow = (p: Plant): Stage => stageOf(KINDS.bodhi, p.age);

/** His garden has given him something: a harvest picked, or a plant of his grown (kept). */
function markReady(): void {
  if (BODHI.ready) return;
  BODHI.ready = true;
  progress.set('bodhi.ready', true);
}

/** Is it so already (a garden from before this add-on, or a check's)? */
function readyFromGarden(): boolean {
  for (const p of GARDEN.plants) {
    if (p.at !== 'home' || p.dead) continue;
    if (p.picked > 0 || stageOf(KINDS[p.kind], p.age) === GROWN) return true;
  }
  return false;
}

/** The ring of stones round the tree's place: a dozen field stones, set round (seeded: the same every time). */
function buildRing(size: 'small' | 'grown'): void {
  if (!env) return;
  if (ringMesh) {
    ring.remove(ringMesh);
    disposeVoxelMesh(ringMesh);
  }
  const b = new VoxelBuilder();
  const src = traceSource();
  const r = size === 'small' ? BODHI_PLAN.ring : BODHI_PLAN.ringGrown;
  // (close set: a ring that reads as one, small gaps between the stones)
  const n = size === 'small' ? 26 : 50;
  const field = env.world.field;
  // (pale sandstone, as the wat's own; a little whitewash on some)
  const STONE = [0xc9bea6, 0xbdb198, 0xd3c9b2, 0xb3a68c, 0xe6e0d2] as const;
  for (let i = 0; i < n; i++) {
    const h = (k: number) => hash3(i, k, n, 5303);
    const a = (i / n) * Math.PI * 2 + (h(1) - 0.5) * 0.06;
    const rr = r + (h(2) - 0.5) * 0.06;
    const x = BODHI_TREE.x + Math.sin(a) * rr;
    const z = BODHI_TREE.z + Math.cos(a) * rr;
    const y = field.heightAt(x, z);
    const w = (size === 'small' ? 0.24 : 0.3) + h(3) * 0.08;
    const tall = 0.11 + h(4) * 0.06;
    b.box(x, y + tall / 2 - 0.03, z, w, tall, 0.16 + h(5) * 0.05, STONE[Math.floor(h(6) * STONE.length) % STONE.length], 'mapStone', { ry: a + Math.PI / 2 + (h(7) - 0.5) * 0.3, rx: (h(8) - 0.5) * 0.12, src });
  }
  ringMesh = buildVoxelMesh(b, { castShadow: true, receiveShadow: true, name: 'bodhi:ring' });
  ring.add(ringMesh);
  ringSize = size;
}

/** The ring as it should be now: none until the sapling is his; small round the young tree; wide round the great one. */
function syncRing(): void {
  const p = tree();
  const want = p ? (stageNow(p) >= GROWN ? 'grown' : 'small') : GARDEN.bodhiGiven ? 'small' : null;
  ring.visible = want !== null;
  if (want && want !== ringSize) buildRing(want);
}

/** The sapling is his (the monk gave it). */
function given(): void {
  if (GARDEN.bodhiGiven && GARDEN.seeds('bodhi') > 0) return;
  if (!tree() && GARDEN.seeds('bodhi') <= 0) GARDEN.addSeeds('bodhi', 1);
  GARDEN.setBodhiGiven();
  syncRing();
}

/** Plant it at the ring (from his bag; a seed put back first if it went astray). */
function plantIt(): boolean {
  if (tree()) return true;
  if (GARDEN.seeds('bodhi') <= 0) GARDEN.addSeeds('bodhi', 1);
  const p = GARDEN.plant('bodhi', BODHI_TREE.x, BODHI_TREE.z, BODHI_TREE.yaw, BODHI_SEED, 'pagoda');
  if (!p) return false;
  progress.set('bodhi.seen', 0);
  syncRing();
  return true;
}

/** A check's tree at stage `s` (in the middle of the stage's days). */
function plantAt(s: Stage): void {
  if (!tree()) plantIt();
  const p = tree();
  if (!p) return;
  const k = KINDS.bodhi;
  const a = k.stageAt;
  p.age = s === 4 ? k.growDays : s === 0 ? 0 : k.growDays * (a[s - 1] + ((s === 3 ? 1 : a[s]) - a[s - 1]) * 0.5);
  p.wet = 1;
  GARDEN.setBodhiGiven();
  BODHI.grown = s === 4;
  syncRing();
}

function stopSession(): void {
  if (!session) return;
  try {
    session.stop();
  } finally {
    session = null;
  }
}

/** Its news when he comes near: a stage further than he last saw it, and once, fully grown. */
function news(ctx: RoamCtx): void {
  const p = tree();
  if (!p || !env || env.shot) return;
  const s = stageNow(p);
  BODHI.grown = s === GROWN;
  const d = Math.hypot(ctx.body.pos.x - p.x, ctx.body.pos.z - p.z);
  if (d > NEWS) return;
  const seen = progress.get('bodhi.seen', 0, isNum);
  if (s <= seen) return;
  progress.set('bodhi.seen', s);
  ctx.hud.toast(t(s === GROWN ? 'gardenBodhiGrown' : 'gardenBodhiGrew'));
}

registerAddon({
  id: 'bodhi',
  order: 46,
  get holding() {
    return !!session;
  },
  get handsBusy() {
    return !!session;
  },
  init(e) {
    env = e;
    e.scene.add(ring);
    BODHI.ready = progress.get('bodhi.ready', false, isBool) || readyFromGarden();
    GARDEN.on((ev) => {
      if ((ev.type === 'picked' || ev.type === 'grown') && ev.plant.at === 'home') markReady();
      if ((ev.type === 'stage' || ev.type === 'grown') && ev.plant.kind === 'bodhi') syncRing();
    });
    // A check's tree (before the first frame: the overview's shots too).
    const v = e.params.get('bodhi');
    if (v !== null) {
      const [name] = v.split(':');
      if (name === 'ready' || name === 'offer' || name === 'talk') BODHI.ready = true;
      if (name === 'given') {
        BODHI.ready = true;
        given();
      }
      if (name === 'planted') plantAt(0);
      else if (/^[0-4]$/.test(name)) plantAt(Number(name) as Stage);
    }
    const p = tree();
    BODHI.grown = !!p && stageNow(p) === GROWN;
    syncRing();
    if (e.shot || import.meta.env.DEV)
      Object.assign(window, {
        __bodhi: {
          state: () => {
            const p = tree();
            return {
              ready: BODHI.ready,
              given: GARDEN.bodhiGiven,
              seeds: GARDEN.seeds('bodhi'),
              tree: p ? { stage: stageNow(p), age: +p.age.toFixed(3), wet: +p.wet.toFixed(2), x: p.x, z: p.z } : null,
              ring: ring.visible ? ringSize : null,
              monk: { ...BODHI.monk },
              session: session ? { kind: session.kind, step: session.kind === 'plant' ? session.step : null, time: +session.time.toFixed(2) } : null,
              offered,
            };
          },
          /** Grow it on by `days` game days (the garden's own advance; checks of its news). */
          grow: (days: number) => GARDEN.advance(days, 0.5, 0),
        },
      });
  },
  input(ctx, mode) {
    if (!session || mode !== 'walk') return false;
    session.input(ctx);
    return true;
  },
  offer(ctx, mode) {
    offered = null;
    if (mode !== 'walk' || session || !env || env.busy()) return null;
    const pos = ctx.body.pos;
    // (quick out: nowhere near the pagoda's rise)
    if (Math.abs(pos.x - BODHI_TREE.x) > 40 || Math.abs(pos.z - BODHI_TREE.z) > 40) return null;
    const m = BODHI.monk;
    if (BODHI.ready && !GARDEN.bodhiGiven && m.ready && m.shown && (m.cue === 'idle' || m.cue === 'notice')) {
      const dx = pos.x - m.x;
      const dz = pos.z - m.z;
      if (dx * dx + dz * dz < TALK_R * TALK_R && Math.abs(pos.y - m.y) < TALK_UP) {
        offered = 'talk';
        return `E  ${t('gardenBodhiTalk')}`;
      }
    }
    if (GARDEN.bodhiGiven && !tree()) {
      const s = bodhiToWorld(BODHI_PLAN.stand.x, BODHI_PLAN.stand.z, _at);
      const dx = pos.x - s.x;
      const dz = pos.z - s.z;
      const r = Math.hypot(pos.x - BODHI_TREE.x, pos.z - BODHI_TREE.z);
      if ((dx * dx + dz * dz < PLANT_R * PLANT_R || r < PLANT_R) && Math.abs(pos.y - env.world.field.heightAt(BODHI_TREE.x, BODHI_TREE.z)) < 1.2) {
        offered = 'plant';
        return `E  ${t('gardenBodhiPlant')}`;
      }
    }
    return null;
  },
  use(ctx) {
    if (!env || session) return;
    if (offered === 'talk') session = startTalk(env, ctx, given);
    else if (offered === 'plant') session = startPlant(env, ctx, plantIt);
  },
  hold(ctx, dt) {
    if (!session) return { prompt: null };
    const r = session.hold(ctx, dt);
    if (session.done) session = null;
    return r;
  },
  after(ctx, mode) {
    if (mode !== 'walk' || session) return;
    news(ctx);
    // The monk notices him the first time he comes near (and again after he has been far off), while he has the sapling for him.
    const m = BODHI.monk;
    if (!BODHI.ready || GARDEN.bodhiGiven || !m.ready || !m.shown) return;
    const d = Math.hypot(ctx.body.pos.x - m.x, ctx.body.pos.z - m.z);
    if (!noticed && d < NOTICE && m.cue === 'idle') {
      noticed = true;
      bodhiCue('notice', ctx.body.pos);
    } else if (noticed && d > FAR) {
      noticed = false;
      if (m.cue === 'notice') bodhiCue('idle');
    }
  },
  setMode(next) {
    stopSession();
    if (next === 'overview') {
      noticed = false;
      if (BODHI.monk.cue !== 'idle') bodhiCue('idle');
    }
  },
  fromUrl(q, ctx) {
    if (!env) return;
    const body = ctx.body;
    const monkCue = q.get('bodhimonk');
    if (monkCue) bodhiCue(monkCue as Parameters<typeof bodhiCue>[0], body.pos);
    const v = q.get('bodhi');
    if (!v) return;
    const [name, sec] = v.split(':');
    const field = env.world.field;
    const place = (lx: number, lz: number, yawTo: { x: number; z: number }) => {
      const p = bodhiToWorld(lx, lz, { x: 0, z: 0 });
      body.pos.set(p.x, field.heightAt(p.x, p.z), p.z);
      body.yaw = Math.atan2(yawTo.x - p.x, yawTo.z - p.z);
      body.vel.set(0, 0, 0);
      body.grounded = true;
      // (the follow camera behind him, as he faces; a check's own `rcam=` stays)
      if (!q.has('rcam')) ctx.cam.yaw = ctx.cam.behindYaw = body.yaw;
    };
    const sweep = bodhiToWorld(BODHI_PLAN.sweep.x, BODHI_PLAN.sweep.z, { x: 0, z: 0 });
    if (name === 'offer') {
      // (a few steps from the monk on his grass, coming up from the village side)
      place(BODHI_PLAN.sweep.x + 2.4, BODHI_PLAN.sweep.z + 3.2, sweep);
      noticed = true;
      bodhiCue('notice', body.pos);
    } else if (name === 'talk') {
      place(BODHI_PLAN.sweep.x + 0.9, BODHI_PLAN.sweep.z + 1.3, sweep);
      session = startTalk(env, ctx, given, sec !== undefined ? Number(sec) || 0.5 : TALK.give + 0.4);
    } else if (name === 'given') {
      place(BODHI_PLAN.stand.x + 0.6, BODHI_PLAN.stand.z + 2.2, BODHI_TREE);
    } else if (name === 'plant') {
      BODHI.ready = true;
      given();
      session = startPlant(env, ctx, plantIt, sec !== undefined ? Number(sec) || 0.1 : 15.5);
    }
  },
  report() {
    if (session?.kind === 'talk') return { bodhi: `talk:${session.time.toFixed(1)}` };
    if (session?.kind === 'plant') return { bodhi: `plant:${session.time.toFixed(1)}` };
    const p = tree();
    if (p) return { bodhi: String(stageNow(p)) };
    if (GARDEN.bodhiGiven) return { bodhi: 'given' };
    if (BODHI.ready) return { bodhi: 'ready' };
    return null;
  },
});

const _at = { x: 0, z: 0 };
