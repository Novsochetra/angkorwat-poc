import type { HeightField } from '../heightfield';
import { DEFAULT_SETTINGS, VOLUME_KEYS, type AnimalCall, type Duck, type MapFrame, type MapSettings, type PlaceId, type RoamSound, type TypeKey, type UISound, type VolumeKey } from '../types';
import { warmUp } from './dsp';
import { BUSES, SoundEngine, type Mix, type Volumes } from './engine';
import { footstepsState, loadFootsteps, prefetchFootsteps, type FootstepsState, type StepSet } from './footsteps';
import { loadTypewriter, prefetchTypewriter, typewriterState, type TypewriterState } from './typewriter';
import type { Ears } from './water';

/**
 * Sound of the map: ambience (wind, birds by day, insects and frogs by
 * night), the waterfalls and rivers where they are on the map, the animals'
 * calls where the animals are, calm generative music, the interface sounds
 * and the roaming explorer's. All made with the Web Audio API, except the
 * explorer's footsteps and the story's typewriter strikes: recordings from
 * `assets/sound/`, cut into single steps / strikes when they load
 * (`footsteps.ts`, `typewriter.ts`; synthesized until then).
 *
 * The graph lives in `engine.ts` (it also runs on an `OfflineAudioContext`,
 * which is how its levels are measured). This file is the live side: the
 * `AudioContext`, the scheduling timer, the ears following the camera or the
 * explorer, and pausing while the tab is hidden.
 *
 * Every slider has its own bus (`engine.ts`): Master, Music, Ambience,
 * Water, Animals, Steps, Moves (the explorer's other sounds), Interface.
 * The story's typing is on Interface; while the story is open the
 * background buses duck (`duck`), so its keys are heard.
 *
 * Checking: `audio.debug()` in the console (main.ts puts `audio` on
 * `window`), or in a headless script, tells whether the sound runs, each
 * bus's gain, and whether the recorded footsteps are loaded and played
 * (see `AudioDebug`).
 */
export interface MapAudio {
  /** Start (call from a user gesture: browsers keep sound off until one). */
  start(): Promise<void>;
  readonly started: boolean;
  /** Volumes 0‥1, one per slider (master multiplies the others). */
  setVolumes(v: Pick<MapSettings, VolumeKey>): void;
  play(s: UISound): void;
  /** A key of the story's typing as a word comes in (`delay` s from now), panned −1‥1 by where the word is (`typing.ts`). */
  type(k: TypeKey, pan?: number, delay?: number): void;
  /** The background (music, ambience, water, animals) steps back for the story and its typing, or comes back (`none`). */
  duck(d: Duck): void;
  /** A sound of the roaming explorer (steps, the parachute, the paddle…), gain 0‥1. */
  roam(s: RoamSound, gain?: number): void;
  /** An animal call where the animal is (quieter and panned by where the ears are). */
  call(c: AnimalCall): void;
  /** The land, once built: where the waterfalls and rivers are (`field.falls`, `field.rivers`). */
  setWorld(field: HeightField): void;
  /** A camera flight of this many seconds begins (a soft whoosh). */
  flight(seconds: number): void;
  /**
   * Every frame: time of day, where the ears are (`f.listener` while
   * roaming, else the camera: the water is placed, so a close-up on a place
   * by the falls is louder by itself; `focus` is not needed for it) and the
   * roaming explorer's lasting sounds (`f.roamLevels`).
   */
  update(f: MapFrame, focus: PlaceId | null): void;
  /** What the sound is doing, for checks (`audio.debug()` in the console). */
  debug?(): AudioDebug;
}

/** `debug()`: the state of the sound. */
export interface AudioDebug {
  /** The context's state (`none`: not started yet, or no Web Audio). */
  state: AudioContextState | 'none';
  /** Each slider's gain now (the slider squared; 0: muted), Master's too. */
  gains: Record<VolumeKey, number>;
  /** The recorded footsteps: `idle` (not asked for yet), `loading`, `ready`, `partial` or `failed` (synthesized steps on the grounds without their recording). */
  footsteps: FootstepsState;
  /** Steps cut from each recording (empty until loaded). */
  recordings: Partial<Record<StepSet, number>>;
  /** Footsteps played so far on each ground: [recorded, synthesized]. */
  played: Record<string, [number, number]>;
  /** How far the background steps back now (the story, its typing). */
  duck: Duck;
  /** The typewriter recording (`typewriter.ts`), and the strikes cut from it. */
  typewriter: TypewriterState;
  strikes: number;
}

/** How far ahead voices are scheduled (s), and how often the scheduler runs (ms). */
const AHEAD = 1.2;
const EVERY = 250;
/** Fade-in of music, ambience, water and the animals on start (s). */
const FADE_IN = 3;
/** Recordings that failed to load are tried again after these waits (s): the network may be back. */
const RETRY = [5, 20, 60];

/**
 * Make the noise and insect buffers in idle moments, a millisecond at a
 * time, so starting never stalls a frame; then decode and cut the footstep
 * recordings (their slow part runs off the page's thread, the cutting in
 * slices), so they are ready before the first step.
 */
function warmInIdleTime(): void {
  type Idle = (cb: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number;
  const ric = (window as unknown as { requestIdleCallback?: Idle }).requestIdleCallback;
  const later: Idle = ric ? (cb) => ric(cb, { timeout: 3000 }) : (cb) => window.setTimeout(() => cb({ timeRemaining: () => 4 }), 60);
  const step = (d: { timeRemaining(): number }) => {
    try {
      if (!warmUp(() => Math.min(d.timeRemaining(), 6))) later(step);
      else {
        void loadFootsteps();
        void loadTypewriter();
      }
    } catch (e) {
      console.warn('[map] audio warm-up failed:', e);
    }
  };
  later(step);
}

export function createMapAudio(): MapAudio {
  // Headless stills never play sound: no need to make buffers (or fetch the footsteps) there.
  const still = new URLSearchParams(location.search).get('shot') === '1';
  if (!still) {
    // (the recordings download while the buffers are made)
    prefetchFootsteps();
    prefetchTypewriter();
    warmInIdleTime();
  }
  let ctx: AudioContext | null = null;
  let engine: SoundEngine | null = null;
  let starting: Promise<void> | null = null;
  let suspendTimer = 0;
  /** Sound is running (not before start, not while the tab is hidden). */
  const live = (): boolean => !!engine && !!ctx && ctx.state === 'running';
  const volumes = Object.fromEntries(VOLUME_KEYS.map((k) => [k, DEFAULT_SETTINGS[k]])) as Volumes;
  const mix: Mix = { night: 0 };
  let world: HeightField | null = null;
  const ears: Ears & { right: [number, number, number]; forward: [number, number, number] } = { x: 0, y: 0, z: 0, right: [1, 0, 0], forward: [0, 0, -1] };
  /** The ears were placed at least once (the first placing jumps, later ones glide). */
  let heard = false;
  /** The background's duck (kept for when the sound starts). */
  let ducked: Duck = 'none';

  const hidden = () => typeof document !== 'undefined' && document.hidden;

  /** Fill the schedule ahead (skipped while the tab is hidden or the context is not running). */
  function pump(): void {
    if (!engine || !ctx || !live() || hidden()) return;
    try {
      engine.schedule(ctx.currentTime + AHEAD);
    } catch (e) {
      console.warn('[map] audio schedule failed:', e);
    }
  }

  function onVisibility(): void {
    if (!engine || !ctx) return;
    clearTimeout(suspendTimer);
    if (hidden()) {
      engine.hush(true);
      const c = ctx;
      suspendTimer = window.setTimeout(() => void c.suspend().catch(() => {}), 400);
    } else {
      void ctx.resume().then(() => {
        engine?.hush(false);
        pump();
      }, () => {});
    }
  }

  /** If the browser still holds the sound back, try again on the next gesture. */
  function resumeOnGesture(): void {
    const again = () => {
      if (!ctx || ctx.state === 'running') return;
      void ctx.resume().then(pump, () => {});
    };
    for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) addEventListener(ev, again, { once: true, capture: true });
  }

  /** Hand the typewriter's strikes to the engine once cut; tried again a few times if it failed (`RETRY`). */
  function loadStrikes(e: SoundEngine, c: AudioContext, tries = 0): void {
    void loadTypewriter(c).then((s) => {
      e.setTypewriter(s);
      if (!s && tries < RETRY.length) window.setTimeout(() => loadStrikes(e, c, tries + 1), RETRY[tries] * 1000);
    });
  }

  /** Hand the recorded footsteps to the engine once cut; a recording that failed is tried again a few times (`RETRY`). */
  function loadSteps(e: SoundEngine, c: AudioContext, tries = 0): void {
    void loadFootsteps(c).then((steps) => {
      e.setFootsteps(steps);
      if (footstepsState().state !== 'ready' && tries < RETRY.length) window.setTimeout(() => loadSteps(e, c, tries + 1), RETRY[tries] * 1000);
    });
  }

  return {
    get started() {
      return live();
    },

    start() {
      if (starting) return starting;
      starting = (async () => {
        try {
          // Made synchronously, inside the user's gesture.
          const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AC) return;
          ctx = new AC({ latencyHint: 'balanced' });
          engine = new SoundEngine(ctx);
          engine.setVolumes(volumes, true);
          engine.setMix(mix, true);
          engine.duck(ducked, true);
          if (world) engine.setWorld(world);
          if (heard) engine.listen(ears, true);
          engine.fadeIn(FADE_IN);
          // The recorded footsteps (most often cut already, in idle time; synthesized steps until they are ready).
          if (!still) {
            loadSteps(engine, ctx);
            loadStrikes(engine, ctx);
          }
          window.setInterval(pump, EVERY);
          document.addEventListener('visibilitychange', onVisibility);
          if (ctx.state !== 'running') {
            resumeOnGesture();
            await ctx.resume();
          }
          pump();
        } catch (e) {
          console.warn('[map] audio unavailable:', e);
        }
      })();
      return starting;
    },

    setVolumes(v) {
      for (const k of VOLUME_KEYS) volumes[k] = v[k];
      engine?.setVolumes(volumes);
    },

    roam(s, gain = 1) {
      if (!engine || !live()) return;
      try {
        engine.roam(s, gain);
      } catch (e) {
        console.warn('[map] audio roam failed:', e);
      }
    },

    call(c) {
      // (not before the ears are placed, nor while the tab is hidden)
      if (!engine || !live() || !heard || hidden()) return;
      try {
        engine.call(c);
      } catch (e) {
        console.warn('[map] audio call failed:', e);
      }
    },

    setWorld(field) {
      world = field;
      engine?.setWorld(field);
    },

    play(s) {
      if (!engine || !live()) return;
      try {
        engine.play(s);
      } catch (e) {
        console.warn('[map] audio play failed:', e);
      }
    },

    type(k, pan = 0, delay = 0) {
      // (not while the tab is hidden: the story's clock waits then too)
      if (!engine || !ctx || !live() || hidden()) return;
      try {
        engine.type(k, pan, ctx.currentTime + delay);
      } catch (e) {
        console.warn('[map] audio type failed:', e);
      }
    },

    duck(d) {
      if (d === ducked) return;
      ducked = d;
      if (!engine) return;
      try {
        engine.duck(d);
      } catch (e) {
        console.warn('[map] audio duck failed:', e);
      }
    },

    flight(seconds) {
      if (!engine || !live()) return;
      try {
        engine.flight(seconds);
      } catch (e) {
        console.warn('[map] audio flight failed:', e);
      }
    },

    update(f) {
      mix.night = f.night;
      // The ears: the camera in the overview (also if roaming failed to load), the explorer's head while roaming;
      // left and right are the camera's.
      const at = f.roam === 'overview' ? f.camera.position : f.listener;
      const m = f.camera.matrixWorld.elements;
      ears.x = at.x;
      ears.y = at.y;
      ears.z = at.z;
      ears.right[0] = m[0];
      ears.right[1] = m[1];
      ears.right[2] = m[2];
      ears.forward[0] = -m[8];
      ears.forward[1] = -m[9];
      ears.forward[2] = -m[10];
      heard = true;
      if (!engine || !live()) return;
      try {
        engine.setMix(mix);
        engine.listen(ears);
        engine.roamLevels(f.roamLevels.wind, f.roamLevels.wake, f.roamLevels.sail ?? 0);
      } catch (e) {
        console.warn('[map] audio update failed:', e);
      }
    },

    debug() {
      const round = (g: number) => Math.round(g * 1000) / 1000;
      const gains = { master: round(engine ? engine.master.gain.value : volumes.master ** 2) } as Record<VolumeKey, number>;
      for (const b of BUSES) gains[b] = round(engine ? engine.bus[b].dry.gain.value : volumes[b] ** 2);
      const steps = footstepsState();
      return { state: ctx?.state ?? 'none', gains, footsteps: steps.state, recordings: steps.counts, played: { ...(engine?.stepsPlayed ?? {}) }, duck: ducked, typewriter: typewriterState().state, strikes: typewriterState().strikes };
    },
  };
}
