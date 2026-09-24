import { DEFAULT_SETTINGS, type MapFrame, type PlaceId, type UISound } from '../types';
import { warmUp } from './dsp';
import { SoundEngine, type Mix, type Volumes } from './engine';

/**
 * Sound of the map: ambience (wind, water, birds by day, insects and frogs by
 * night), calm generative music, and the interface sounds. All made with the
 * Web Audio API, no sound files.
 *
 * The graph lives in `engine.ts` (it also runs on an `OfflineAudioContext`,
 * which is how its levels are measured). This file is the live side: the
 * `AudioContext`, the scheduling timer, and pausing while the tab is hidden.
 */
export interface MapAudio {
  /** Start (call from a user gesture: browsers keep sound off until one). */
  start(): Promise<void>;
  readonly started: boolean;
  /** Volumes 0‥1. */
  setVolumes(v: { music: number; ambience: number; sfx: number }): void;
  play(s: UISound): void;
  /** A camera flight of this many seconds begins (a soft whoosh). */
  flight(seconds: number): void;
  /** Every frame: time of day and the place in focus (e.g. louder water near falls). */
  update(f: MapFrame, focus: PlaceId | null): void;
}

/** Places with waterfalls close by: the water comes up when the camera is there. */
const WATERFALLS: ReadonlySet<PlaceId> = new Set<PlaceId>(['terrace', 'rivergate', 'sanctuary']);
/** How far ahead voices are scheduled (s), and how often the scheduler runs (ms). */
const AHEAD = 1.2;
const EVERY = 250;
/** Fade-in of music and ambience on start (s). */
const FADE_IN = 3;

/** Make the noise and insect buffers in idle moments, a millisecond at a time, so starting never stalls a frame. */
function warmInIdleTime(): void {
  type Idle = (cb: (d: { timeRemaining(): number }) => void, o?: { timeout: number }) => number;
  const ric = (window as unknown as { requestIdleCallback?: Idle }).requestIdleCallback;
  const later: Idle = ric ? (cb) => ric(cb, { timeout: 3000 }) : (cb) => window.setTimeout(() => cb({ timeRemaining: () => 4 }), 60);
  const step = (d: { timeRemaining(): number }) => {
    try {
      if (!warmUp(() => Math.min(d.timeRemaining(), 6))) later(step);
    } catch (e) {
      console.warn('[map] audio warm-up failed:', e);
    }
  };
  later(step);
}

export function createMapAudio(): MapAudio {
  // Headless stills never play sound: no need to make buffers there.
  if (new URLSearchParams(location.search).get('shot') !== '1') warmInIdleTime();
  let ctx: AudioContext | null = null;
  let engine: SoundEngine | null = null;
  let starting: Promise<void> | null = null;
  let suspendTimer = 0;
  /** Sound is running (not before start, not while the tab is hidden). */
  const live = (): boolean => !!engine && !!ctx && ctx.state === 'running';
  const volumes: Volumes = { music: DEFAULT_SETTINGS.music, ambience: DEFAULT_SETTINGS.ambience, sfx: DEFAULT_SETTINGS.sfx };
  const mix: Mix = { night: 0, water: 0 };

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
          engine.fadeIn(FADE_IN);
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
      volumes.music = v.music;
      volumes.ambience = v.ambience;
      volumes.sfx = v.sfx;
      engine?.setVolumes(volumes);
    },

    play(s) {
      if (!engine || !live()) return;
      try {
        engine.play(s);
      } catch (e) {
        console.warn('[map] audio play failed:', e);
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

    update(f, focus) {
      mix.night = f.night;
      mix.water = focus && WATERFALLS.has(focus) ? 1 : 0;
      engine?.setMix(mix);
    },
  };
}
