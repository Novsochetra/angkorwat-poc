/**
 * The sound of a video (scripts/video.mjs), made after its pictures.
 *
 * A video's frames are drawn one by one, far slower than they play, so the
 * map's sound cannot play along. Instead each shot's page notes what the map
 * asked of its sound (`captureSound`): every frame's ears, time of day,
 * weather and the explorer's lasting sounds, and each one-off sound (his
 * steps and moves, the add-ons' sounds, the animals' and people's calls, the
 * interface) at the shot's second it came. Then one page plays them all back
 * on the map's own sound engine in an OfflineAudioContext, shot after shot on
 * the video's timeline, with the cut's music under them (`renderSoundtrack`,
 * the music from video/score.ts).
 */
import type { AnimalCall, MapFrame, MapWeather, RoamSound, UISound } from '../types';
import type { Ears } from '../audio/water';
import type { MapAudio } from '../audio/audio';
import type { HeightField } from '../heightfield';
import { SoundEngine, type Volumes } from '../audio/engine';
import { SFX, attachSfx, tickSfx } from '../audio/addonSfx';
import { loadFootsteps } from '../audio/footsteps';
import { loadChants } from '../audio/chants';
import { playScore, type ScorePlan } from './score';

/** One frame of the map's sound: what `MapAudio.update` hands the engine. */
export interface SoundFrame {
  s: number;
  night: number;
  clock: number;
  canopy: number;
  ears: Ears;
  weather: MapWeather;
  roaming: boolean;
  walking: boolean;
  t: number;
  levels: [number, number, number, number, number];
}

/** A one-off sound, at a shot's second. */
export type SoundEvent =
  | { s: number; kind: 'roam'; sound: RoamSound; gain: number }
  | { s: number; kind: 'sfx'; name: string; gain: number }
  | { s: number; kind: 'level'; name: string; v: number }
  | { s: number; kind: 'call'; call: AnimalCall }
  | { s: number; kind: 'ui'; sound: UISound };

export interface ShotSound {
  frames: SoundFrame[];
  events: SoundEvent[];
}

/** Start noting the map's sound in this page; `at(s)` before each frame says which second of the shot it is. */
export function captureSound(audio: MapAudio): { at(s: number): void; take(): ShotSound } {
  let now = 0;
  const frames: SoundFrame[] = [];
  const events: SoundEvent[] = [];
  const update = audio.update.bind(audio);
  audio.update = (f: MapFrame, focus) => {
    update(f, focus);
    const at = f.roam === 'overview' ? f.camera.position : f.listener;
    const m = f.camera.matrixWorld.elements;
    frames.push({
      s: now,
      night: f.night,
      clock: f.clock,
      canopy: f.canopy ?? 0,
      ears: { x: at.x, y: at.y, z: at.z, right: [m[0], m[1], m[2]], forward: [-m[8], -m[9], -m[10]] },
      weather: JSON.parse(JSON.stringify(f.weather)) as MapWeather,
      roaming: f.roam !== 'overview',
      walking: f.roam === 'walk',
      t: f.t,
      levels: [f.roamLevels.wind, f.roamLevels.wake, f.roamLevels.sail ?? 0, f.roamLevels.burner ?? 0, f.roamLevels.fan ?? 0],
    });
  };
  audio.roam = (sound: RoamSound, gain = 1) => void events.push({ s: now, kind: 'roam', sound, gain });
  audio.call = (call: AnimalCall) => void events.push({ s: now, kind: 'call', call: { ...call } });
  audio.play = (sound: UISound) => void events.push({ s: now, kind: 'ui', sound });
  SFX.play = (name: string, gain = 1) => void events.push({ s: now, kind: 'sfx', name, gain });
  SFX.level = (name: string, v: number) => {
    // (only changes: a loop's level is set every frame)
    const last = lastLevel.get(name);
    if (last !== undefined && Math.abs(last - v) < 0.01) return;
    lastLevel.set(name, v);
    events.push({ s: now, kind: 'level', name, v });
  };
  const lastLevel = new Map<string, number>();
  return {
    at(s) {
      now = s;
    },
    take() {
      return { frames: frames.splice(0), events: events.splice(0) };
    },
  };
}

/** A shot on the video's timeline: its sound from `from` s of it, placed at `offset`; its world heard from `hear` to `until` (s, the timeline's). */
export interface SoundSegment {
  offset: number;
  hear: number;
  until: number;
  /** Its one-off sounds this loud (0‥1, the cut's per shot). */
  gain?: number;
  sound: ShotSound;
}

export interface SoundtrackPlan {
  total: number;
  segments: SoundSegment[];
  volumes: Volumes;
  music?: ScorePlan;
  /** The music's level (0‥1). */
  musicLevel?: number;
  seed?: number;
  /** Fade in and out (s). */
  fadeIn?: number;
  fadeOut?: number;
}

const RATE = 48000;
const STEP = 1 / 30;

/** Play the shots' sound back offline, with the music, and return the two channels. */
export async function renderSoundtrack(plan: SoundtrackPlan, field: HeightField | null): Promise<[Float32Array, Float32Array]> {
  const ctx = new OfflineAudioContext(2, Math.ceil(plan.total * RATE), RATE);
  const engine = new SoundEngine(ctx, { seed: plan.seed ?? 7 });
  engine.setVolumes({ ...plan.volumes, music: 0 }, true);
  if (field) engine.setWorld(field);
  engine.setFootsteps(await loadFootsteps(ctx));
  await loadChants(ctx);
  attachSfx(engine, () => true);
  if (plan.music) {
    const g = ctx.createGain();
    g.gain.value = plan.musicLevel ?? 0.8;
    g.connect(engine.sum);
    playScore(ctx, g, plan.music);
  }
  // (fades over everything)
  const fade = engine.out.gain;
  fade.setValueAtTime(0, 0);
  fade.linearRampToValueAtTime(1, plan.fadeIn ?? 0.6);
  fade.setValueAtTime(1, Math.max(0, plan.total - (plan.fadeOut ?? 1.5)));
  fade.linearRampToValueAtTime(0, plan.total);
  engine.fadeIn(plan.fadeIn ?? 0.6);

  // Everything on one timeline: a world state for each frame (the shot heard then), and the one-off sounds.
  type Tick = { at: number; frame?: SoundFrame; jump?: boolean; events: SoundEvent[]; gain: number };
  const ticks = new Map<number, Tick>();
  const tick = (at: number, gain: number): Tick => {
    const k = Math.max(1, Math.round(at / STEP));
    let t = ticks.get(k);
    if (!t) ticks.set(k, (t = { at: k * STEP, events: [], gain }));
    return t;
  };
  for (const seg of plan.segments) {
    let first = true;
    for (const f of seg.sound.frames) {
      const at = seg.offset + f.s;
      if (at < seg.hear || at >= seg.until || at >= plan.total) continue;
      const t = tick(at, seg.gain ?? 1);
      t.frame = f;
      t.jump = first;
      first = false;
    }
    for (const e of seg.sound.events) {
      const at = seg.offset + e.s;
      if (at >= plan.total) continue;
      const t = tick(at, seg.gain ?? 1);
      t.events.push(e);
      t.gain = seg.gain ?? 1;
    }
  }
  const order = [...ticks.keys()].sort((a, b) => a - b);
  engine.schedule(0.75);
  for (const k of order) {
    const t = ticks.get(k)!;
    if (t.at >= plan.total - 0.01) continue;
    ctx.suspend(t.at).then(() => {
      try {
        const f = t.frame;
        if (f) {
          engine.setMix({ night: f.night, clock: f.clock, canopy: f.canopy }, !!t.jump);
          engine.listen(f.ears, !!t.jump);
          engine.weather(f.weather, f.ears, f.roaming, f.t, f.walking ? f.canopy : 0);
          engine.roamLevels(...f.levels);
        }
        for (const e of t.events) {
          if (e.kind === 'roam') engine.roam(e.sound, e.gain * t.gain);
          else if (e.kind === 'sfx') SFX.play(e.name, e.gain * t.gain);
          else if (e.kind === 'level') SFX.level(e.name, e.v * t.gain);
          else if (e.kind === 'call') engine.call({ ...e.call, gain: e.call.gain * t.gain });
          else engine.play(e.sound);
        }
        tickSfx();
        engine.schedule(t.at + 0.75);
      } catch (err) {
        console.warn('[video] sound at', t.at.toFixed(2), err);
      }
      void ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  attachSfx(null, () => false);
  return [buf.getChannelData(0), buf.getChannelData(1)];
}
