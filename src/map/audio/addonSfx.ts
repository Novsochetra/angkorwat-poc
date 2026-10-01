import type { BusName, SoundEngine } from './engine';

/**
 * The roaming add-ons' sounds (roam/_addons.ts): each add-on makes its own in a
 * module of its own (with dsp.ts's helpers, like explorer.ts does) and registers
 * them here by name, so no add-on edits the shared sound files. Played on the
 * buses (sliders) of the settings: `moves` (the explorer's own: the default),
 * `steps`, `animals`, `ambience`, `ui`.
 *
 * - `registerSfx(name, make, bus)`: a one-off sound (the bicycle's bell, a kick of
 *   the sey); `SFX.play(name, gain)` plays it now.
 * - `registerLoop(name, make, bus)`: a lasting sound made once (the chain
 *   ticking, the zip line's whirr, the hammock's creak); `SFX.level(name, v)`
 *   sets how loud it is (0‥1: 0 silent), every frame or when it changes.
 *
 * Nothing plays before the sound is on (the browser's first click) or while the
 * bus or the master is off: then `play` does nothing and `level` is only kept.
 */

/** Where a sound goes: the bus's dry and reverb sends, the context, the engine's random numbers. */
export interface SfxOut {
  ctx: BaseAudioContext;
  dry: AudioNode;
  wet: AudioNode;
  rnd: () => number;
  engine: SoundEngine;
}

/** A one-off sound: build its nodes and start them at `t` (context time), at `gain` 0‥1. */
export type SfxMaker = (o: SfxOut, gain: number, t: number) => void;
/** A lasting sound: build it once; `level(v, t)` is how loud it is from `t` (0 silent ‥ 1). */
export type LoopMaker = (o: SfxOut) => { level(v: number, t: number): void };

const SHOTS = new Map<string, { bus: BusName; make: SfxMaker }>();
const LOOPS = new Map<string, { bus: BusName; make: LoopMaker; inst: { level(v: number, t: number): void } | null; want: number; set: number }>();

let engine: SoundEngine | null = null;
let live: () => boolean = () => false;

const out = (e: SoundEngine, bus: BusName): SfxOut => ({ ctx: e.ctx, dry: e.bus[bus].dry, wet: e.bus[bus].wet, rnd: e.rnd, engine: e });

export function registerSfx(name: string, make: SfxMaker, bus: BusName = 'moves'): void {
  SHOTS.set(name, { bus, make });
}

export function registerLoop(name: string, make: LoopMaker, bus: BusName = 'moves'): void {
  LOOPS.set(name, { bus, make, inst: null, want: 0, set: -1 });
}

export const SFX = {
  /** Play a one-off sound now (`gain` 0‥1). */
  play(name: string, gain = 1): void {
    const s = SHOTS.get(name);
    if (!s || !engine || !live() || !engine.heard(s.bus)) return;
    try {
      s.make(out(engine, s.bus), Math.min(1, Math.max(0, gain)), engine.ctx.currentTime);
    } catch (e) {
      console.warn(`[map] sound "${name}" failed:`, e);
    }
  },
  /** How loud a lasting sound is now (0‥1). */
  level(name: string, v: number): void {
    const l = LOOPS.get(name);
    if (!l) return;
    l.want = Math.min(1, Math.max(0, v));
    apply(name);
  },
};

function apply(name: string): void {
  const l = LOOPS.get(name);
  if (!l || !engine || !live()) return;
  // (a change of a hundredth or less is not worth a new ramp; nothing is built until it is first heard)
  if (Math.abs(l.want - l.set) < 0.01 && l.inst) return;
  if (!l.inst) {
    if (l.want <= 0) return;
    try {
      l.inst = l.make(out(engine, l.bus));
    } catch (e) {
      console.warn(`[map] sound "${name}" failed:`, e);
      LOOPS.delete(name);
      return;
    }
  }
  l.set = l.want;
  l.inst.level(engine.heard(l.bus) ? l.want : 0, engine.ctx.currentTime);
}

/** audio.ts: the engine once the sound is on (null: none), and whether it runs now. */
export function attachSfx(e: SoundEngine | null, running: () => boolean): void {
  engine = e;
  live = running;
  for (const l of LOOPS.values()) {
    l.inst = null;
    l.set = -1;
  }
}

/** audio.ts, every frame: the lasting sounds at their levels (a slider moved, the sound came on). */
export function tickSfx(): void {
  for (const name of LOOPS.keys()) apply(name);
}
