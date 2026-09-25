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
  /**
   * Where the ears are, for sounds placed on the map (waterfalls, rivers):
   * the camera in the overview, the explorer's head while roaming.
   */
  listener: Vector3;
  /** What the player is doing: looking at the overview, or roaming the map with the explorer. */
  roam: RoamMode;
  /** Lasting sounds of the roaming explorer (all 0 in the overview). */
  roamLevels: RoamLevels;
  /**
   * Animal calls this frame, where they are on the map: parts push them in
   * `update` (a rooster crows, a monkey chatters as it runs off) and main.ts
   * hands them to the sound, then empties the list. Not filled in shots.
   */
  calls: AnimalCall[];
}

/** Kinds of animal call (audio/animals.ts makes them). */
export type AnimalCallKind =
  | 'elephant'
  | 'monkey'
  | 'rooster'
  | 'hen'
  | 'deer'
  | 'buffalo'
  | 'duck'
  | 'egret'
  | 'wings'
  | 'fish'
  | 'bat'
  | 'frog';

/** One animal call at a point of the map (m); `gain` 0‥1 (1 = a full call close by). */
export interface AnimalCall {
  kind: AnimalCallKind;
  x: number;
  y: number;
  z: number;
  gain: number;
}

/**
 * Roaming the map with the explorer (src/map/roam/): `overview` = the
 * picker screen; `leap` = running off the ledge; `glide` = under the
 * parachute; `walk` = on foot; `boat` = paddling a boat on a river;
 * `hang` = flying the hang glider.
 */
export type RoamMode = 'overview' | 'leap' | 'glide' | 'walk' | 'boat' | 'hang';

/**
 * One-off sounds of the roaming explorer (audio/audio.ts makes them).
 * Footsteps by the ground under them: `step` on earth, `stepGrass`,
 * `stepStone` (the road, temple floors, bare rock), `stepSand` (river
 * banks), `stepWater` (wading), `stepWood` (planks: the take-off ramp's
 * deck, stepping off the boat).
 */
export type RoamSound =
  | 'step'
  | 'stepGrass'
  | 'stepStone'
  | 'stepSand'
  | 'stepWater'
  | 'stepWood'
  | 'gliderOpen'
  | 'gliderStow'
  | 'jump'
  | 'land'
  | 'chuteOpen'
  | 'chuteClose'
  | 'splash'
  | 'paddle'
  | 'boatIn'
  | 'boatOut'
  | 'enter';

/** Sounds of the roaming explorer that last (0‥1 each, set every frame). */
export interface RoamLevels {
  /** Rushing air: falling, gliding under the parachute or the hang glider. */
  wind: number;
  /** The hang glider's sail humming and fluttering in the airflow (0‥1). */
  sail?: number;
  /** Water against a moving boat. */
  wake: number;
}

/** Sounds the interface asks for (audio/audio.ts makes them). */
export type UISound = 'hover' | 'select' | 'back' | 'begin' | 'open' | 'close' | 'toggle' | 'tick';

/** The story's words typing in on a typewriter: a word, or the title (a heavy strike). */
export type TypeKey = 'key' | 'title';

/**
 * How much the background (music, ambience, water, animals) steps back:
 * not at all, for the story (a little quieter), while its words type in
 * (quieter still, so the keys are heard).
 */
export type Duck = 'none' | 'story' | 'typing';

/** Player settings (gear button), kept in localStorage. Volumes 0‥1. */
export interface MapSettings {
  /** Everything at once (multiplies the others). */
  master: number;
  music: number;
  /** Wind, birds by day, insects and frogs by night. */
  ambience: number;
  /** Waterfalls and rivers (louder the closer you are). */
  water: number;
  /** Animal calls (birds, monkeys, frogs, the rooster…), where the animals are. */
  animals: number;
  /** The explorer's footsteps. */
  steps: number;
  /** The explorer's other sounds: jump and landing, parachute, hang glider wind and sail, paddle, splash, tools, camera. */
  moves: number;
  /** Interface sounds (hover, clicks, open / close). */
  ui: number;
  /** Time of day: follow the clock of the page (a slow cycle) or stay. */
  time: 'day' | 'night' | 'cycle';
  /** No camera sway, short flights, no drifting clouds. */
  calm: boolean;
  /** Language of the interface (ui/lang.ts): Khmer first. */
  lang: Lang;
  /** Easy flying for the hang glider: it holds its height hands-off, S climbs, W dives, no ceiling to speak of (roam/prefs.ts). Off: the real glider (it sinks, rising air keeps it up). */
  easyFly: boolean;
}

/** Interface languages: Khmer and English. */
export type Lang = 'km' | 'en';

export const DEFAULT_SETTINGS: MapSettings = { master: 1, music: 0.55, ambience: 0.8, water: 0.8, animals: 0.8, steps: 0.45, moves: 0.7, ui: 0.7, time: 'day', calm: false, lang: 'km', easyFly: true };

/** The volume settings (sliders), in panel order. */
export const VOLUME_KEYS = ['master', 'music', 'ambience', 'water', 'animals', 'steps', 'moves', 'ui'] as const;
export type VolumeKey = (typeof VOLUME_KEYS)[number];

/** A built part of the map: main.ts adds `object` to the scene and calls `update` each frame. */
export interface MapPart {
  name: string;
  object: Object3D;
  update?(f: MapFrame): void;
  /** The place whose card is hovered or picked (null: none), for parts that point it out. */
  highlight?(id: PlaceId | null): void;
  /** Voxel blocks in the part (for the stats line and the block budget). */
  blocks?: number;
  /**
   * Called right after each frame is drawn, while the canvas still holds the
   * picture (e.g. to take a photo of it). Not called in headless shots.
   */
  afterRender?(): void;
}
