import '../audio/_zip';
import { buildZipLine, type ZipLineMeshes } from '../jungle/_zipLine';
import { t } from '../ui/lang';
import { registerAddon, type AddonEnv } from './_addons';
import type { RoamCtx } from './types';
import { HANG, SAG, ZIP_LINES, zipPlan, type ZipPlan } from './_zipPlan';
import { createZipRide, type ZipRide } from './_zipRide';
import { createZipWalk, type ZipWalk } from './_zipWalk';

/**
 * The zip line through the jungle behind Angkor Wat (a roaming add-on:
 * _addons.ts). Its trees, platforms, stairs and cables: _zipPlan.ts (where),
 * jungle/_zipLine.ts (the meshes), _zipWalk.ts (in the walk map); the ride:
 * _zipRide.ts; his pose: character/zipRide.ts; its sounds: audio/_zip.ts; its
 * badge on the maps: ui/_minimapSpots.ts (`zip-line`, at the first stair's
 * foot).
 *
 * On a platform, by the trolley waiting at a line's start: "E  Ride the zip
 * line" (on a pad □, on touch the Use button). He clips in, rides to the next
 * tree, lands and unclips; the next line starts across the same deck. Three
 * lines; the stair at the first tree comes up from the back trail, the one at
 * the last goes down to it. Shift while riding: tuck up, faster.
 *
 * The meshes are built in idle time a few seconds after Start (at once when
 * a shot or a page starts roaming, or when he comes near first); the walk
 * map's part is plain numbers, there from the start.
 *
 * URL (checks): `zip=<line>` on line 1‥3's platform at its start (the prompt);
 * `zip=<line>:<0‥1>` riding it that far along (at the speed the ride has
 * there; a still shot holds it there while the pose and camera settle, with
 * `sim=` it rides on); `zip=<line>:clip` clipping in, `zip=<line>:end`
 * touching down at its end. Bug reports give the same.
 */

/** Near enough the spot under a line's trolley to clip in (m, across). */
const REACH = 1.7;
/** Feet this far behind the spot under the trolley when clipped in (m: the lanyard slants up past his face). */
const BEHIND = 0.52;
/** Seconds after Start (frames drawn, the loading screen gone) before the meshes are built in idle time; built at once within this far (m). */
const BUILD_AFTER = 2;
const BUILD_NEAR = 220;

let env: AddonEnv | null = null;
let plan: ZipPlan | null = null;
let walk: ZipWalk | null = null;
let ride: ZipRide | null = null;
let meshes: ZipLineMeshes | null = null;
/** The line E would start (from the last `offer`). */
let offered = -1;
let since = -1;
let queued = false;

/** Build the meshes now (once). */
function build(): void {
  if (meshes || !env || !plan) return;
  const w = env.world;
  // (no two blocks in one place: where the jungle's own leaves are, its own stay)
  const soft = w.softClearance ? (x: number, y: number, z: number) => w.softClearance!(x, y + 0.45, z, x, y - 0.45, z) < 1 : undefined;
  try {
    meshes = buildZipLine(w.field, plan, soft);
    env.scene.add(meshes.object);
  } catch (e) {
    console.error('[map] zip line failed:', e);
    plan = null;
  }
}

/** Where his feet go to clip in on line `i` (plan). */
function clipSpot(i: number): { x: number; z: number } {
  const l = plan!.lines[i];
  return { x: l.x0 - l.dx * BEHIND, z: l.z0 - l.dz * BEHIND };
}

/** The URL's `rcam=yaw,pitch,dist` again, its yaw from the line's heading (roam.ts read it before he was put on the line). */
function urlCam(q: URLSearchParams, ctx: RoamCtx, yaw: number): void {
  const rc = q.get('rcam')?.split(',').map(Number);
  if (!rc || !Number.isFinite(rc[0])) return;
  ctx.cam.yaw = yaw + (rc[0] * Math.PI) / 180;
}

/** Shots: each line's run checked against the walk maps (leaves, solid blocks) round the rider's whole body. */
function check(): void {
  if (!env || !plan) return;
  const w = env.world;
  const out: string[] = [];
  for (const l of plan.lines) {
    let hits = 0;
    let gap = Infinity;
    for (let s = 3; s <= l.length - 3; s += 0.5) {
      const u = s / l.length;
      const x = l.x0 + (l.x1 - l.x0) * u;
      const z = l.z0 + (l.z1 - l.z0) * u;
      const y = l.y0 + (l.y1 - l.y0) * u - SAG * l.length * 4 * u * (1 - u);
      for (const off of [-0.8, 0, 0.8]) {
        const ox = x - l.dz * off;
        const oz = z + l.dx * off;
        if ((w.softClearance?.(ox, y + 0.3, oz, ox, y - HANG, oz) ?? 1) < 1 || (w.clearance?.(ox, y + 0.3, oz, ox, y - HANG, oz) ?? 1) < 1) hits++;
      }
      const feet = y - HANG;
      const c = Math.min(w.softClearance?.(x, feet, z, x, feet - 40, z) ?? 1, w.clearance?.(x, feet, z, x, feet - 40, z) ?? 1);
      gap = Math.min(gap, 40 * c);
    }
    out.push(`line ${l.n} ${l.length.toFixed(0)} m, ${(l.y0 - l.y1).toFixed(1)} m down: ${hits ? `${hits} samples hit` : 'clear'}, ${gap.toFixed(1)} m over the treetops at least`);
  }
  const s0 = plan.stations[0];
  console.info(`[map] zip: ${out.join(' · ')} · the first tree at ${s0.x},${s0.z}, its deck ${(s0.deck - s0.ground).toFixed(1)} m up`);
}

registerAddon({
  id: 'zip',
  get holding() {
    return !!ride && ride.phase !== 'idle';
  },
  get handsBusy() {
    return !!ride && ride.phase !== 'idle';
  },
  init(e) {
    env = e;
    plan = zipPlan(e.world.field);
    walk = createZipWalk(e.world.field, plan);
    walk.install(e.world);
    ride = createZipRide(e, plan, () => meshes);
    // (a shot or a page that starts roaming: built with the map)
    if (e.shot || e.params.has('roam')) {
      build();
      if (e.shot) check();
    }
  },
  offer(ctx, mode) {
    offered = -1;
    if (mode !== 'walk' || !walk || !plan || !ride || ride.phase !== 'idle' || env?.busy()) return null;
    const p = ctx.body.pos;
    const i = walk.onDeck(p.x, p.z, p.y);
    if (i < 0 || i >= ZIP_LINES) return null;
    const c = clipSpot(i);
    if (Math.hypot(p.x - c.x, p.z - c.z) > REACH) return null;
    offered = i;
    return `E  ${t('zipRide')}`;
  },
  use(ctx) {
    if (offered < 0 || !ride) return;
    build();
    ride.start(ctx, offered);
  },
  hold(ctx, dt) {
    return { prompt: ride ? ride.update(ctx, dt) : null };
  },
  after(ctx) {
    if (!ride || !plan) return;
    ride.tidy(ctx.body.pos);
    // (coming near before the idle build: now)
    if (!meshes) {
      const p = ctx.body.pos;
      for (const s of plan.stations)
        if (Math.hypot(p.x - s.x, p.z - s.z) < BUILD_NEAR) {
          build();
          break;
        }
    }
  },
  frame(f) {
    if (meshes && env) {
      meshes.frame(f, env.body.pos);
      return;
    }
    // A moment after Start, in idle time.
    if (queued || !plan || typeof document === 'undefined' || document.body.classList.contains('map-waiting')) return;
    if (since < 0) since = f.t;
    if (f.t - since < BUILD_AFTER) return;
    queued = true;
    if (typeof requestIdleCallback === 'function') requestIdleCallback(() => build(), { timeout: 3000 });
    else setTimeout(build, 50);
  },
  setMode(next, _prev, ctx) {
    if (ride && ride.phase !== 'idle') ride.stop(ctx);
    if (next === 'overview' && meshes && plan) for (let i = 0; i < plan.lines.length; i++) meshes.park(i);
  },
  fromUrl(q, ctx) {
    const v = q.get('zip');
    if (!v || !ride || !plan) return;
    build();
    const [a, b] = v.split(':');
    const n = Math.round(Number(a));
    if (!(n >= 1 && n <= ZIP_LINES)) return;
    const i = n - 1;
    const still = q.has('sim') ? 0 : 0.85;
    if (b === undefined) {
      // On its platform, just behind the spot under the trolley (its lanyard hangs there), facing down the line.
      const c = clipSpot(i);
      const l = plan.lines[i];
      ctx.body.pos.set(c.x - l.dx * 0.4, l.from.deck, c.z - l.dz * 0.4);
      ctx.body.yaw = l.yaw;
      ctx.body.vel.set(0, 0, 0);
      ctx.body.grounded = true;
      if (!q.has('rcam')) {
        ctx.cam.yaw = l.yaw + 0.5;
        ctx.cam.pitch = 0.3;
        ctx.cam.distance = 7;
      }
      urlCam(q, ctx, l.yaw);
      return;
    }
    const at = b === 'clip' || b === 'end' ? b : Number(b);
    if (typeof at === 'number' && !Number.isFinite(at)) return;
    ride.place(ctx, i, at, still);
    urlCam(q, ctx, plan.lines[i].yaw);
  },
  report() {
    if (!ride || ride.phase === 'idle') return null;
    const n = ride.line + 1;
    // (his hat is only off for the ride: the shot puts it on, the ride takes it off again)
    return { zip: `${n}:${ride.phase === 'clip' ? 'clip' : ride.phase === 'land' ? 'end' : ride.u.toFixed(3)}`, ...(ride.hatTaken ? { hat: '1' } : {}) };
  },
});
