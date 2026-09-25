import { RUN_SPEED, WALK_SPEED } from '../../world/scale';
import { SURFACE } from '../heightfield';
import type { PlaceDef } from '../layout';
import type { RoamSound } from '../types';
import { placeText, t } from '../ui/lang';
import { mooredBoatNear } from './boat';
import { angleDiff } from './followCam';
import type { RoamCtx, RoamMode, RoamModeHandler, RoamWorld } from './types';

/** Gravity (m/s²): a little over the real one, for a lively jump. */
const GRAVITY = 24;
/** Stronger while hopping up a step: a quick hop, not a leap. */
const HOP_GRAVITY = 40;
/** Jump height over the feet (m). */
const JUMP = 1.9;
/** Highest step he hops up without a jump (m): one 2 m land block. */
const HOP_UP = 2.2;
/** Steps up to this he climbs smoothly (stairs); higher ones he hops. */
const STAIR = 1.1;
/** Steps down to this he walks down; deeper ones he drops. */
const DROP = 1.1;
/** In the air, a ledge this far above the feet is still caught (m). */
const AIR_UP = 0.9;
/** Walk and run pace over the true-size speeds (the map is big). */
const PACE = 1.6;
/** A jump pressed this long before landing still happens; after walking off an edge it still works this long (s). */
const JUMP_BUFFER = 0.15;
const COYOTE = 0.12;
/** A fall this high (m) is long enough for the parachute. */
const LONG_FALL = 10;
/** The roaming area's edge slows him from this far in (m). */
const EDGE_SOFT = 8;
/** Longest horizontal move per collision step (m). */
const SUBSTEP = 0.2;

/** Probe points round the body (unit circle). */
const RING = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)] as const);

/**
 * On foot: walk and run relative to the camera, turn smoothly, climb stairs,
 * hop up one land step (2 m), slide along walls, jump (Space), drop off
 * ledges and cliffs (in a long fall Space opens the parachute, E the hang
 * glider), wade into deep water and take a boat, fly the hang glider from
 * a cliff-top ramp (E), and enter a place with E at its beacon.
 *
 * Collisions use the walk map (world.standAt): the body is a circle of
 * probes; each must have ground within a step of the feet and room above
 * it. Where he stands is the highest ground under the middle of the circle,
 * so he steps onto a stair as his foot reaches it.
 */
export function createWalker(): RoamModeHandler {
  let airTime = 0;
  /** Seconds since he was last on the ground (for the late jump). */
  let offGround = 0;
  /** A jump pressed in the air, waiting for the landing (s left). */
  let jumpWait = 0;
  let hopping = false;
  /** Slowed after a hard landing (s left). */
  let recover = 0;
  /** The walk cycle's phase last step (footfalls at 0.25 and 0.75). */
  let lastPhase = 0;
  let prompt: string | null = null;
  let edgeToast = 0;
  let stuck = 0;
  /** A camera distance to ease to after entering, or null. */
  let settle: number | null = null;

  /** Size of the body now (grows with `body.scale`). */
  const radius = (s: number) => 0.3 * s;
  const height = (s: number) => 1.7 * s * 0.95;

  /** Where feet at `y` would stand at (x, z) with `up` of step, or NaN (walls; the land only without a walk map). */
  const standAt = (w: RoamWorld, x: number, z: number, y: number, up: number, h: number): number => {
    if (w.standAt) return w.standAt(x, z, y, up, h);
    const g = w.groundAt(x, z);
    return g > y + up ? NaN : g;
  };

  /**
   * Can the body stand at (x, z) with its feet at y (stepping up `up`)?
   * Returns where it would stand (the highest ground under the middle of
   * the circle), or NaN when a probe hits a wall.
   * `loose`: only the middle counts (he is already inside something).
   */
  const fit = (w: RoamWorld, x: number, z: number, y: number, up: number, s: number, loose = false): number => {
    const r = radius(s);
    const h = height(s);
    let best = standAt(w, x, z, y, up, h);
    if (Number.isNaN(best)) return NaN;
    for (const [cx, cz] of RING) {
      const g = standAt(w, x + cx * r, z + cz * r, y, up, h);
      if (Number.isNaN(g)) {
        if (!loose) return NaN;
        continue;
      }
      // (the inner half of the circle carries him; the rim only has to be clear)
      if (g > best) {
        const gi = standAt(w, x + cx * r * 0.5, z + cz * r * 0.5, y, up, h);
        if (!Number.isNaN(gi) && gi > best) best = gi;
      }
    }
    return best;
  };

  /** Which way the walls touching the body at (x, z) are (unit x, z; zero when none). */
  const wallAround = (w: RoamWorld, x: number, z: number, y: number, up: number, s: number): [number, number] => {
    const r = radius(s);
    const h = height(s);
    let ox = 0;
    let oz = 0;
    for (const [cx, cz] of RING)
      if (Number.isNaN(standAt(w, x + cx * r, z + cz * r, y, up, h))) {
        ox += cx;
        oz += cz;
      }
    const l = Math.hypot(ox, oz);
    return l > 1e-6 ? [ox / l, oz / l] : [0, 0];
  };

  /** The nearest spot round (x, z) where he fits, or null (for getting unstuck). */
  const freeSpot = (w: RoamWorld, x: number, z: number, y: number, s: number): [number, number, number] | null => {
    for (let d = 0.5; d <= 10; d += 0.5)
      for (let a = 0; a < 16; a++) {
        const px = x + Math.cos((a * Math.PI) / 8) * d;
        const pz = z + Math.sin((a * Math.PI) / 8) * d;
        // (from well above: on top of whatever is there)
        const g = fit(w, px, pz, Math.max(y, w.groundAt(px, pz)) + 0.1, HOP_UP, s);
        if (!Number.isNaN(g)) return [px, pz, g];
      }
    return null;
  };

  return {
    enter(ctx, from) {
      const { cam, body } = ctx;
      cam.minDistance = 3.5;
      cam.maxDistance = 30;
      cam.follow = 0.6;
      cam.fov = 50;
      // Ease to about 9 m back (he fills a sixth of the view's height) when
      // the camera comes in from much further or nearer (a landing).
      settle = cam.distance > 16 ? 12 : cam.distance < 5 ? 6.2 * body.scale : null;
      body.explorer.animator.posture = null;
      body.vel.y = 0;
      if (from !== 'glide' && from !== 'leap' && from !== 'hang') body.vel.set(0, 0, 0);
      airTime = offGround = jumpWait = recover = stuck = 0;
      hopping = false;
      prompt = null;
      lastPhase = body.explorer.animator.phase;
    },

    update(ctx, dt): RoamMode | null {
      const { body, input, world, cam } = ctx;
      const s = body.scale;
      const pos = body.pos;
      const vel = body.vel;
      cam.turn(input.lookYaw, input.lookPitch, input.zoom);
      if (settle !== null) {
        cam.distance += (settle - cam.distance) * (1 - Math.exp(-dt * 1.5));
        if (input.zoom || Math.abs(settle - cam.distance) < 0.05) settle = null;
      }

      // ── Where he wants to go: relative to the camera's heading ─────────────
      const fx = Math.sin(cam.yaw);
      const fz = Math.cos(cam.yaw);
      const amount = Math.min(1, Math.hypot(input.move.x, input.move.y));
      let wx = fx * input.move.y - fz * input.move.x;
      let wz = fz * input.move.y + fx * input.move.x;
      if (amount > 0) {
        const l = Math.hypot(wx, wz) || 1;
        wx /= l;
        wz /= l;
      }
      let want = amount > 0.05 ? (input.run ? RUN_SPEED : WALK_SPEED) * s * PACE * amount : 0;
      if (recover > 0) {
        recover -= dt;
        want *= 0.35;
      }
      const water = world.waterAt(pos.x, pos.z);
      if (water !== null && water > pos.y + 0.2) want *= 0.65;
      const grounded = body.grounded && !hopping;
      // Quick to start and stop on the ground, little steering in the air.
      const k = 1 - Math.exp(-dt * (grounded ? (want > 0 ? 10 : 14) : 2.5));
      vel.x += (wx * want - vel.x) * k;
      vel.z += (wz * want - vel.z) * k;
      if (want > 0) body.yaw += angleDiff(Math.atan2(wx, wz), body.yaw) * (1 - Math.exp(-dt * 11));

      // ── Move, sliding along walls ─────────────────────────────────────────
      const x0 = pos.x;
      const z0 = pos.z;
      const up = body.grounded ? HOP_UP : AIR_UP;
      // Already inside something (a landing on a wall's edge, the ground rose): only the middle must be free.
      const loose = Number.isNaN(fit(world, pos.x, pos.z, pos.y, up, s));
      // (outside the area, e.g. put there by a URL: any way back in is fine)
      const inside = world.inBounds(pos.x, pos.z);
      const ok = (x: number, z: number) => (!inside || world.inBounds(x, z)) && !Number.isNaN(fit(world, x, z, pos.y, up, s, loose));
      /**
       * Square against the end of a wall or the edge of a doorway: if the
       * way on is free a little to one side, step that way (he slips round
       * corners and into doors instead of sticking on them).
       */
      const nudge = (mx: number, mz: number): boolean => {
        const l = Math.hypot(mx, mz);
        if (l < 1e-5) return false;
        const px = -mz / l;
        const pz = mx / l;
        const r = radius(s);
        for (const o of [0.35, 0.7, 1.1, 1.6, 2.2])
          for (const side of [1, -1]) {
            const ox = px * o * r * side;
            const oz = pz * o * r * side;
            // (sideways no faster than he walks)
            const k = Math.min(1, l / (o * r));
            if (ok(pos.x + ox + mx, pos.z + oz + mz) && ok(pos.x + ox * k, pos.z + oz * k)) {
              pos.x += ox * k;
              pos.z += oz * k;
              return true;
            }
          }
        return false;
      };
      const steps = Math.max(1, Math.ceil((Math.hypot(vel.x, vel.z) * dt) / SUBSTEP));
      for (let i = 0; i < steps; i++) {
        let dx = (vel.x * dt) / steps;
        let dz = (vel.z * dt) / steps;
        // Soft edge of the roaming area: slower and slower towards it.
        if (world.edgeDistance) {
          const d0 = world.edgeDistance(pos.x, pos.z);
          const d1 = world.edgeDistance(pos.x + dx, pos.z + dz);
          if (d1 < EDGE_SOFT && d1 < d0) {
            const slow = Math.max(0, d1 / EDGE_SOFT) ** 1.5;
            dx *= slow;
            dz *= slow;
            if (slow < 0.1 && ctx.t > edgeToast) {
              ctx.hud.toast(t('rMist'));
              edgeToast = ctx.t + 8;
            }
          }
        }
        if (ok(pos.x + dx, pos.z + dz)) {
          pos.x += dx;
          pos.z += dz;
          continue;
        }
        // Blocked: slide along the wall (along x, along z, or with the part of
        // the move into the wall taken out), whichever goes furthest.
        const [ox, oz] = wallAround(world, pos.x + dx, pos.z + dz, pos.y, up, s);
        const into = Math.max(0, dx * ox + dz * oz);
        const tries: [number, number][] = [
          [dx, 0],
          [0, dz],
          [dx - into * ox, dz - into * oz],
        ];
        let bx = 0;
        let bz = 0;
        let best = Math.hypot(dx, dz) * 0.05;
        for (const [tx, tz] of tries) {
          const l = Math.hypot(tx, tz);
          if (l > best && ok(pos.x + tx, pos.z + tz)) {
            best = l;
            bx = tx;
            bz = tz;
          }
        }
        if (bx || bz) {
          pos.x += bx;
          pos.z += bz;
          if (!bx) vel.x *= 0.9;
          if (!bz) vel.z *= 0.9;
        } else if (!nudge(dx, dz)) break;
      }
      const moved = Math.hypot(pos.x - x0, pos.z - z0);
      // (walking into a wall: his legs stop too)
      const hspeed = dt > 0 ? moved / dt : 0;
      if (dt > 0 && hspeed < Math.hypot(vel.x, vel.z) * 0.5 && moved < 1e-3) {
        vel.x *= 0.5;
        vel.z *= 0.5;
      }

      // ── Up and down ─────────────────────────────────────────────────────────
      if (input.jump) jumpWait = JUMP_BUFFER;
      else jumpWait = Math.max(0, jumpWait - dt);
      const h = height(s);
      let under = fit(world, pos.x, pos.z, pos.y, body.grounded ? HOP_UP : AIR_UP, s, true);
      if (Number.isNaN(under)) {
        // Inside a wall: out to the nearest free spot (after a moment, so a hop can finish).
        stuck += dt;
        if (stuck > 0.25) {
          const spot = freeSpot(world, pos.x, pos.z, pos.y, s);
          if (spot) {
            pos.set(spot[0], spot[2], spot[1]);
            vel.set(0, 0, 0);
            body.grounded = true;
            hopping = false;
          }
          stuck = 0;
        }
        under = pos.y;
      } else stuck = 0;

      if (body.grounded && !hopping) {
        offGround = 0;
        airTime = 0;
        const dh = under - pos.y;
        if (jumpWait > 0) {
          jumpWait = 0;
          vel.y = Math.sqrt(2 * GRAVITY * JUMP);
          body.grounded = false;
          ctx.sound('jump', 0.8);
        } else if (dh > STAIR) {
          // One land block up: a small hop.
          vel.y = Math.sqrt(2 * HOP_GRAVITY * (dh + 0.35));
          body.grounded = false;
          hopping = true;
          ctx.sound('jump', 0.35);
        } else if (dh >= -DROP) {
          // Stairs and small steps: glide up or down (as fast as the stair needs, no faster).
          const rate = 2.5 + 1.4 * hspeed;
          pos.y += Math.sign(dh) * Math.min(Math.abs(dh), rate * dt);
          vel.y = 0;
        } else {
          // Off an edge.
          body.grounded = false;
          vel.y = Math.min(0, vel.y);
        }
      }
      if (!body.grounded) {
        airTime += dt;
        offGround += dt;
        // A late jump, just after walking off an edge.
        if (jumpWait > 0 && offGround < COYOTE && !hopping && vel.y <= 0) {
          jumpWait = 0;
          vel.y = Math.sqrt(2 * GRAVITY * JUMP);
          ctx.sound('jump', 0.8);
        }
        vel.y = Math.max(-45, vel.y - (hopping ? HOP_GRAVITY : GRAVITY) * dt);
        pos.y += vel.y * dt;
        // Head against a roof.
        if (vel.y > 0 && world.ceilingAt) {
          const roof = world.ceilingAt(pos.x, pos.z, pos.y + 0.1);
          if (pos.y + h > roof) {
            pos.y = roof - h;
            vel.y = 0;
          }
        }
        const floor = fit(world, pos.x, pos.z, pos.y, AIR_UP, s, true);
        const land = Number.isNaN(floor) ? -Infinity : floor;
        if (vel.y <= 0 && pos.y <= land) {
          const impact = -vel.y;
          pos.y = land;
          body.grounded = true;
          vel.y = 0;
          if (!hopping && impact > 4) ctx.sound('land', Math.min(1, impact / 22));
          if (!hopping && impact > 15) recover = Math.min(0.5, impact * 0.018);
          hopping = false;
        }
        // A long fall: Space opens the parachute.
        const drop = pos.y - (Number.isNaN(floor) ? world.groundAt(pos.x, pos.z) : land);
        const long = !body.grounded && airTime > 0.3 && vel.y < -5 && drop > LONG_FALL;
        if (long && input.jump) {
          setPrompt(ctx, null);
          return 'glide';
        }
        // …and E unfolds the hang glider.
        if (long && input.use) {
          setPrompt(ctx, null);
          return 'hang';
        }
        if (long) setPrompt(ctx, fallPrompt());
        else if (prompt === fallPrompt()) setPrompt(ctx, null);
      }

      // ── Deep water: into a boat ───────────────────────────────────────────
      const wet = world.waterAt(pos.x, pos.z);
      if (wet !== null && wet - under > 0.9 && pos.y < wet + 0.3) {
        if (!body.grounded) ctx.sound('splash', 0.7);
        setPrompt(ctx, null);
        return 'boat';
      }

      // ── A boat tied up by the bank, a place's beacon ──────────────────────
      if (body.grounded) {
        const boat = mooredBoatNear(pos.x, pos.z);
        if (boat && Math.abs(boat.level - pos.y) < 4) {
          setPrompt(ctx, `E  ${t('rBoard')}`);
          if (input.use) {
            setPrompt(ctx, null);
            return 'boat';
          }
        } else if (world.launchNear?.(pos.x, pos.z, pos.y)) {
          // A take-off ramp on a cliff top.
          setPrompt(ctx, `E  ${t('rFly')}`);
          if (input.use) {
            setPrompt(ctx, null);
            return 'hang';
          }
        } else {
          const place = world.placeNear(pos.x, pos.z, pos.y);
          setPrompt(ctx, place ? placePrompt(place) : null);
          if (place && input.use) {
            if (place.href) ctx.enter(place);
            else ctx.hud.toast(t('rNotOpen', { name: placeText(place).name }));
          }
        }
      }

      // ── Footsteps, pose, camera ───────────────────────────────────────────
      const phase = body.explorer.animator.phase;
      if (body.grounded && hspeed > 0.4) {
        const crossed = (p: number) => (lastPhase < p && phase >= p) || (phase < lastPhase && (lastPhase < p || phase >= p));
        if (crossed(0.25) || crossed(0.75)) ctx.sound(stepSound(world, pos.x, pos.y, pos.z), Math.min(1, 0.35 + hspeed / (RUN_SPEED * s * PACE)));
      }
      lastPhase = phase;
      body.explorer.setMotion(hspeed / s, body.grounded, vel.y / s);
      cam.focus.set(pos.x, pos.y + h * 0.86, pos.z);
      // (behind the way he really goes: along a wall he slides by, not into it)
      cam.behindYaw = hspeed > 1 ? Math.atan2(pos.x - x0, pos.z - z0) : body.yaw;
      cam.fov = input.run && hspeed > WALK_SPEED * s * PACE * 1.2 ? 54 : 50;
      return null;
    },

    exit(ctx) {
      setPrompt(ctx, null);
      hopping = false;
    },
  };

  /** Show a prompt (only when it changes). */
  function setPrompt(ctx: RoamCtx, text: string | null): void {
    if (text === prompt) return;
    prompt = text;
    ctx.hud.prompt(text);
  }
}

/** The prompt in a long fall (the words in the language in use: ui/lang.ts). */
const fallPrompt = () => `Space  ${t('jumpChute')}  ·  E  ${t('jumpGlider')}`;

/**
 * The footstep for the ground at the feet (x, y, z): wading in water over
 * the ankles; on a take-off ramp's deck (up on it, not on the land round
 * it) wood; on something built above the land (the road's stairs and
 * bridges, temple floors, walls) stone; else the land's surface.
 */
export function stepSound(w: RoamWorld, x: number, y: number, z: number): RoamSound {
  const water = w.waterAt(x, z);
  if (water !== null && water > y + 0.08) return 'stepWater';
  const f = w.field;
  const land = f.heightAt(x, z);
  if (y > land + 0.05 && w.launchNear?.(x, z, y)) return 'stepWood';
  if (y > land + 0.4) return 'stepStone';
  switch (f.surfaceAt(x, z)) {
    case SURFACE.grass:
      return 'stepGrass';
    case SURFACE.sand:
      return 'stepSand';
    case SURFACE.bed:
      // (wet at the water's edge; a dry bed well over the water is sand)
      return water !== null && water > y - 0.3 ? 'stepWater' : 'stepSand';
    case SURFACE.rock:
    case SURFACE.path:
    case SURFACE.pad:
      return 'stepStone';
    default:
      return 'step';
  }
}

/** The prompt at a place's beacon. */
function placePrompt(place: PlaceDef): string {
  const name = placeText(place).name;
  return place.href ? `E  ${t('rEnter', { name })}` : t('rSoon', { name });
}
