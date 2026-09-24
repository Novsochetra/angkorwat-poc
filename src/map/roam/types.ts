import type { Object3D, PerspectiveCamera, Vector3 } from 'three';
import type { AngkorExplorer } from '../../character/AngkorExplorer';
import type { HeightField } from '../heightfield';
import type { PlaceDef } from '../layout';
import type { RoamLevels, RoamMode, RoamSound } from '../types';

/**
 * Roaming the map with the explorer: leap off the ledge, glide down under a
 * parachute, walk, paddle a boat on the rivers, and enter a temple.
 *
 * roam.ts runs one mode at a time (a `RoamModeHandler` each): `leap` and
 * `glide` (parachute.ts), `walk` (walker.ts), `boat` (boat.ts). Every mode
 * moves the same body (`RoamBody`), reads the same input (`RoamInput`) and
 * tells the follow camera (`FollowCam`) what it wants.
 *
 * Scale: the map is real-size (1 unit = 1 m) but seen from far, and built
 * of 1–2 m blocks, so the roaming explorer is `ROAM_SCALE` × his true
 * 1.7 m (2.4 m): easy to follow on the 4 m road, still small next to the
 * lit temple doors, 8–15 m trees and 60 m towers. He hops up a 2 m land
 * step whatever his size (walker.ts).
 */
export type { RoamMode };

/** Size of the roaming explorer over his true 1.7 m (tunable). */
export const ROAM_SCALE = 1.4;
/** Standing height of the roaming explorer (m). */
export const ROAM_HEIGHT = 1.7 * ROAM_SCALE;

/** Player input this frame (keyboard, mouse, touch), already mapped. */
export interface RoamInput {
  /** Move stick: x right, y forward (−1‥1 each), relative to the camera's heading. */
  move: { x: number; y: number };
  /** Shift held (run / dive). */
  run: boolean;
  /** Space pressed this frame / held. */
  jump: boolean;
  jumpHeld: boolean;
  /** E pressed this frame: use (board or leave the boat, enter a place, open the parachute). */
  use: boolean;
  /** Esc pressed this frame: back to the overview. */
  exit: boolean;
  /** Camera orbit from a mouse or touch drag since the last frame (radians; yaw + = turn left, pitch + = look down more). */
  lookYaw: number;
  lookPitch: number;
  /** Wheel / pinch since the last frame (+ = further out). */
  zoom: number;
}

/** What the roaming modes know about the world. */
export interface RoamWorld {
  field: HeightField;
  /**
   * Top of what the explorer can stand on at (x, z), in metres: the land,
   * temple floors, steps and walls, the road with its stairs and bridges,
   * tree trunks (not leaves). Water is not included.
   */
  groundAt(x: number, z: number): number;
  /** Water surface at (x, z), or null where there is none. */
  waterAt(x: number, z: number): number | null;
  /** River current at (x, z) (m/s, map x and z), written to `out`; zero where the water is still or there is none. */
  flowAt(x: number, z: number, out: { x: number; z: number }): { x: number; z: number };
  /** Inside the roaming area (off the land's sinking edges). */
  inBounds(x: number, z: number): boolean;
  /** The place whose entrance is within reach of (x, z) (and of height `y`, when given), if any. */
  placeNear(x: number, z: number, y?: number): PlaceDef | null;
  /** How far (x, z) is inside the roaming area (m; < 0 outside). */
  edgeDistance?(x: number, z: number): number;
  /**
   * Where feet at height `y` would stand at (x, z), stepping up at most `up`
   * metres, with `height` metres of room above: the top of the solid under
   * them there (it may be under a roof or a bridge), or NaN where a wall or
   * a low roof is in the way. (The walk map: roam/walkmap.ts.)
   */
  standAt?(x: number, z: number, y: number, up: number, height: number): number;
  /** Bottom of the first solid above height `y` at (x, z), or Infinity (open sky). */
  ceilingAt?(x: number, z: number, y: number): number;
  /** Part of the segment a → b (0‥1) that is free of solid blocks, from a (1 = nothing in the way). */
  clearance?(ax: number, ay: number, az: number, bx: number, by: number, bz: number): number;
}

/**
 * The follow camera. Each mode sets `focus` every frame and the orbit it
 * wants; the player's drag turns `yaw` / `pitch`, the wheel `distance`.
 */
export interface FollowCam {
  readonly camera: PerspectiveCamera;
  /** Point the camera looks at (m), usually the explorer's chest. */
  readonly focus: Vector3;
  /** Heading of the camera: it sits at `focus` − forward(yaw) × distance (yaw 0 = looking towards +z). */
  yaw: number;
  /** Tilt down (radians, + = from above). */
  pitch: number;
  /** Distance from the focus (m). */
  distance: number;
  /** Range the wheel may zoom between (m), set by the mode. */
  minDistance: number;
  maxDistance: number;
  /** How strongly the camera swings round behind `behindYaw` by itself (0 = not at all, 1 ≈ in a second). */
  follow: number;
  /** Heading to swing behind (the explorer's, the boat's). */
  behindYaw: number;
  /** Vertical field of view (degrees), eased. */
  fov: number;
  /** Start from the camera as it is now and ease into the orbit over `seconds`. */
  blendFrom(seconds: number): void;
  /** The player's orbit input (radians, wheel steps); pauses the auto-follow for a moment. */
  turn(dYaw: number, dPitch: number, zoom: number): void;
  update(dt: number, world: RoamWorld): void;
}

/** The roaming explorer: shared by every mode. */
export interface RoamBody {
  readonly explorer: AngkorExplorer;
  /** Feet (m). */
  readonly pos: Vector3;
  /** Velocity (m/s). */
  readonly vel: Vector3;
  /** Facing (radians, like `Object3D.rotation.y`: 0 = towards +z). */
  yaw: number;
  /** On the ground (walk) / afloat (boat). */
  grounded: boolean;
  /** Size over the true 1.7 m (grows from 1 on the ledge to ROAM_SCALE after the leap). */
  scale: number;
}

/** Everything a mode gets each frame. */
export interface RoamCtx {
  world: RoamWorld;
  body: RoamBody;
  input: RoamInput;
  cam: FollowCam;
  hud: RoamHud;
  /** Play a one-off sound of the explorer (gain 0‥1). */
  sound(s: RoamSound, gain?: number): void;
  /** Lasting sounds, set by the mode every frame (reset to 0 before each update). */
  levels: RoamLevels;
  /** Seconds since start, and the time of day (0 day ‥ 1 night). */
  t: number;
  night: number;
  /** Headless still: no randomness, no real input. */
  shot: boolean;
  /** Where the explorer stood on the ledge (true scale) and which way he faced. */
  ledge: { feet: Vector3; yaw: number };
  /** Enter a place (fade out and open its page). */
  enter(place: PlaceDef): void;
}

export interface RoamModeHandler {
  /** Scene objects of the mode (the parachute, the boat); roam.ts adds them. */
  readonly object?: Object3D;
  enter(ctx: RoamCtx, from: RoamMode): void;
  /** One step; return the mode to switch to, or null to stay. */
  update(ctx: RoamCtx, dt: number): RoamMode | null;
  exit(ctx: RoamCtx, to: RoamMode): void;
}

/** The on-screen help while roaming (hud.ts). */
export interface RoamHud {
  /** Show or hide the roaming interface (and the "Jump in" button of the overview). */
  setMode(mode: RoamMode): void;
  /** A prompt near the bottom ("E  Enter Angkor Wat"), or null. */
  prompt(text: string | null): void;
  /** A short message that fades by itself. */
  toast(text: string): void;
  /** Fade the view to black (1) or back (0) over `seconds`. */
  fade(to: 0 | 1, seconds: number): Promise<void>;
  update(dt: number): void;
}
