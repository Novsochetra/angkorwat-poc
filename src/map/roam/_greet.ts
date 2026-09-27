import type { AngkorExplorer } from '../../character/AngkorExplorer';
import type { ActionName } from '../../character/clips';
import { greet, nearby, type Greeting, type Nearby } from '../greet';
import { angleDiff } from './followCam';
import type { RoamBody, RoamCtx } from './types';

/**
 * The explorer greets (F on foot, or the explorer menu's Greet and Wave:
 * tools.ts). With someone near in front of him (within `NEAR` m and `CONE`
 * of his facing) he turns to them and greets the Khmer way: the sampeah,
 * palms together at the chest and a small bow (`greet` in
 * character/clips.ts), a soft sound of the palms (`greet`); to a monk or an
 * elder the palms go on up to his face and he bows deeper (`greetHigh`).
 * To a visitor from abroad or a child, or with nobody near, he waves (the
 * `wave` action). Either way the greeting goes out on the map's greeting
 * bus (greet.ts `greet`), and the people who can see him greet him back
 * (people/_greetBack.ts). Who is near comes from the people part
 * (greet.ts `nearby`), asked only when he greets.
 *
 * `how`: `auto` (F: as above), `sampeah` (the menu's Greet: palms together
 * even with nobody near) or `wave` (the menu's Wave).
 */
export type GreetHow = 'auto' | 'sampeah' | 'wave';

export interface Greeter {
  /** Greet now (on foot, hands free: tools.ts checks). `high`: the sampeah raised to the face whoever it is to (`act=greetHigh`). */
  greet(ctx: RoamCtx, how: GreetHow, high?: boolean): void;
  /** Each step on foot, after the walker: the small turn to whom he greets. */
  step(ctx: RoamCtx, dt: number): void;
  /** His sampeah is past its bow (`action` playing): a push of the stick may end it and he walks on (F while walking: he greets first). */
  over(action: ActionName): boolean;
}

/** Someone this near (m) and this far round from his facing (radians, either side) is greeted. */
const NEAR = 7;
const CONE = Math.PI / 3;
/** Who he waves to rather than sampeah: visitors (a wave is their greeting), and children (a grown-up waves to a child). */
const WAVE_TO: ReadonlySet<string> = new Set(['visitor', 'kid']);
/** He turns to whom he greets at this rate (1/s), for at most this long (s). */
const TURN_RATE = 9;
const TURN_FOR = 0.8;
/** A greeting playing: F again starts a new one only this far into it (s), not over and over while held or tapped. */
const AGAIN = 1.4;
/** The sampeah's bow is over this far in (s: `greet`, `greetHigh`): from then a push of the stick ends it. */
const BOWED: Partial<Record<ActionName, number>> = { greet: 1.2, greetHigh: 1.5 };

export function createGreeter(d: { explorer: AngkorExplorer; body: RoamBody }): Greeter {
  const { explorer, body } = d;
  const found: Nearby = { x: 0, y: 0, z: 0, d: 0, kind: '', elder: false };
  /** Where he turns to (radians), and for how much longer (s). */
  let turnTo: number | null = null;
  let turnLeft = 0;

  return {
    greet(ctx, how, high = false) {
      const playing = explorer.currentAction;
      if ((playing === 'greet' || playing === 'greetHigh' || playing === 'wave') && explorer.animator.actionTime < AGAIN) return;
      const p = body.pos;
      const who = nearby(p.x, p.y, p.z, body.yaw, NEAR, CONE, found);
      const kind: Greeting['kind'] = how === 'auto' ? (who && !WAVE_TO.has(who.kind) ? 'sampeah' : 'wave') : how;
      turnTo = who ? Math.atan2(who.x - p.x, who.z - p.z) : null;
      turnLeft = TURN_FOR;
      if (kind === 'wave') explorer.play('wave');
      else {
        // (the higher the hands, the more respect: to a monk, an elder)
        explorer.play(high || (who && (who.kind === 'monk' || who.elder)) ? 'greetHigh' : 'greet');
        ctx.sound('greet', 1);
      }
      // (out on the bus facing the way he turns: the people he greets are in front of him)
      greet(ctx.t, p.x, p.y, p.z, turnTo ?? body.yaw, kind);
    },
    step(ctx, dt) {
      if (turnTo === null) return;
      turnLeft -= dt;
      const left = angleDiff(turnTo, body.yaw);
      // (done, or he walks off: a wave lets him walk)
      if (turnLeft <= 0 || Math.abs(left) < 0.005 || Math.hypot(ctx.input.move.x, ctx.input.move.y) > 0.3) {
        turnTo = null;
        return;
      }
      body.yaw += left * (1 - Math.exp(-dt * TURN_RATE));
    },
    over(action) {
      const bowed = BOWED[action];
      return bowed !== undefined && explorer.animator.actionTime >= bowed;
    },
  };
}
