import type { Object3D, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import type { HeightField } from './heightfield';

/**
 * World map screen ("Highland Journey", map.html): a small voxel diorama of
 * the Angkor highlands seen from a high ledge, with a pin for every place the
 * player can travel to. Scale: 1 unit = 1 m, like the game. The map is built
 * of 1–2 m blocks (the game uses 0.5 m and smaller), because it is seen from
 * 200–500 m away.
 *
 * Axes: +X east (screen right), −Z north (away from the camera, up the
 * screen), +Y up. The overview camera stands south of the map, high up.
 */

export type PlaceId = 'sanctuary' | 'kulen' | 'terrace' | 'overlook' | 'shrine' | 'rivergate';

export type MapQuality = 'low' | 'medium' | 'high';

/** Everything a part of the map gets when it is built. */
export interface MapContext {
  scene: Scene;
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  /** Terrain heights, water and surface kinds (built first, read by every part). */
  field: HeightField;
  quality: MapQuality;
  /** Headless still (`?shot=1`): build, pose at time `t`, render once. */
  shot: boolean;
}

/** One frame. */
export interface MapFrame {
  /** Seconds since start (in shots: the `t=` URL value, default 12). */
  t: number;
  /** Seconds since the last frame (0 in shots). */
  dt: number;
  /**
   * Clock for drifting mist and clouds: like `t`, but it stands still while
   * the "reduce motion" setting is on.
   */
  drift: number;
  /** Time of day: 0 = golden-hour afternoon, 1 = moonlit night; blends between. */
  night: number;
  camera: PerspectiveCamera;
  /** Direction towards the sun (day) or the moon (night), normalised; set by the atmosphere. */
  lightDir: Vector3;
}

/** Sounds the interface asks for (audio/audio.ts makes them). */
export type UISound = 'hover' | 'select' | 'back' | 'begin' | 'open' | 'close' | 'toggle' | 'tick';

/** Player settings (gear button), kept in localStorage. Volumes 0‥1. */
export interface MapSettings {
  music: number;
  ambience: number;
  sfx: number;
  /** Time of day: follow the clock of the page (a slow cycle) or stay. */
  time: 'day' | 'night' | 'cycle';
  /** No camera sway, short flights, no drifting clouds. */
  calm: boolean;
}

export const DEFAULT_SETTINGS: MapSettings = { music: 0.55, ambience: 0.8, sfx: 0.7, time: 'day', calm: false };

/** A built part of the map: main.ts adds `object` to the scene and calls `update` each frame. */
export interface MapPart {
  name: string;
  object: Object3D;
  update?(f: MapFrame): void;
  /** The place whose card is hovered or picked (null: none), for parts that point it out. */
  highlight?(id: PlaceId | null): void;
  /** Voxel blocks in the part (for the stats line and the block budget). */
  blocks?: number;
}
