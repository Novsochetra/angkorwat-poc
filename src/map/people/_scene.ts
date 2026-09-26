import type { Object3D } from 'three';
import type { MapFrame, Subject } from '../types';
import type { Actor } from './_actor';
import type { Bubble } from './_bubble';
import type { Crowd } from './_personModel';
import type { Ground, Obstacle, RoadGraph, Traffic } from './_routes';
import type { Things } from './_things';

/**
 * What every people scene gets (index.ts makes one and hands it round), and
 * the shape of a scene: `update` once a frame with the scene's own clock.
 */
export interface PeopleEnv {
  crowd: Crowd;
  graph: RoadGraph;
  ground: Ground;
  traffic: Traffic;
  bubble: Bubble;
  /** Headless still: no speech (it would be random), fixed starts. */
  shot: boolean;
  params: URLSearchParams;
  /** The people's things (boats, the cart, kites, torches…: `_things.ts`). */
  things: Things;
}

export interface PeopleScene {
  readonly name: string;
  /** Everyone in it (kept apart from each other and from the animals after each step). */
  readonly actors: readonly Actor[];
  /** One step: `now` is the people's clock (s), `f` the frame (time of day, the explorer, the camera). */
  update(dt: number, now: number, f: MapFrame, explorer: Obstacle | null): void;
  /** Put this scene's people into the traffic (after they moved), so other groups keep out of their way. */
  report(traffic: Traffic): void;
  /** Meshes of its own (the oxen), added to the part's group. */
  readonly object?: Object3D;
  /** Its animals as the nature book sees them (roam/_book.ts; its people come from `actors`). */
  subjects?(out: Subject[]): void;
}

/**
 * How far a spot is from what is seen (m): the camera in the overview and
 * while roaming (the follow camera is by the explorer). Scenes far off step
 * less often, or hide.
 */
export function viewDist(f: MapFrame, x: number, z: number): number {
  const c = f.camera.position;
  return Math.hypot(x - c.x, z - c.z);
}

/**
 * A scene's pace by distance: every frame near, every few frames farther
 * (their `dt` summed), not at all beyond `hide` (the scene hides its people).
 */
export class Pace {
  private acc = 0;
  private n = 0;
  constructor(
    readonly near: number,
    readonly hide: number,
  ) {}

  /** The step to take this frame (0: skip it), or −1: hidden (too far). */
  step(dt: number, d: number): number {
    if (d > this.hide) {
      this.acc = 0;
      return -1;
    }
    this.acc += dt;
    const every = d < this.near ? 1 : d < (this.near + this.hide) / 2 ? 3 : 6;
    if (++this.n < every) return 0;
    this.n = 0;
    const s = this.acc;
    this.acc = 0;
    // (a long pause, e.g. a hidden tab: no leap)
    return Math.min(s, 0.5);
  }
}

/** Speed people back off along the road before an elephant coming at them (m/s). */
export const BACK_OFF = 1.2;

/** Seconds a group waits for other people in its way before it walks on anyway (squeezing past: no stand-offs). */
export const STANDOFF = 5;
/** …and for anything else but the explorer (an elephant resting on the road): then they squeeze past too. */
export const STANDOFF_LONG = 25;

/**
 * Deep night (`night`): anyone still out on the roads has got home (they
 * vanish; only the fast day cycle of the settings brings the night on
 * before a group reaches its door).
 */
export const GONE = 0.86;

/** Morning: from dawn (the sun coming up behind Angkor Wat) to mid-morning (`clock` 0.7‥0.97). */
export function isMorning(clock: number): boolean {
  return clock >= 0.7 && clock < 0.97;
}

/** Dusk side of the day (the sun going down, then the night's first half). */
export function isEvening(clock: number): boolean {
  return clock >= 0.1 && clock < 0.5;
}
