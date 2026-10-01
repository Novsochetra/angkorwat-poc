import type { Object3D } from 'three';
import type { AngkorExplorer } from '../../character/AngkorExplorer';
import type { MapFrame, MapPart, RoamMode, UISound } from '../types';
import type { RoamControls } from './input';
import type { RoamPhoto } from './photo';
import type { Purse } from './_shopPurse';
import type { FollowCam, RoamBody, RoamCtx, RoamHud, RoamWorld } from './types';

/**
 * Roaming add-ons: the things to do round the map that came after the modes
 * (a bicycle, the ox cart, a hammock, the zip line, the kite, the dog…). Each is
 * a module of its own that registers a `RoamAddon` here when it is imported
 * (its import line is in `_addonList.ts`), so no add-on edits the walker, the
 * boat, the tools or roam.ts.
 *
 * What roaming does with them:
 * - `init` once, when roaming is built (roam.ts), with the shared things (`AddonEnv`).
 * - `input` each roaming step, before the mode's (tools.ts, after the album, the
 *   buy menu and eating): its keys. True takes the step's input (he keeps still).
 * - The E row (walker.ts on foot, boat.ts afloat): `offer` says what E would do
 *   here ("E  Lie in the hammock"), `use` does it. On foot, an add-on with
 *   `order` ≤ `BEFORE_SHRINE` comes right after a golden figure (before a shrine);
 *   the others after a stall, before a moored boat, a ramp, the balloon, the swing
 *   and a place's beacon, lowest `order` first. Afloat, before stepping ashore.
 * - `holding`: it holds him (on the bicycle, in the hammock, on the zip line):
 *   the mode named by `holdIn` ('walk' by default, or 'boat') hands its whole step
 *   to `hold` (the add-on moves the body, sets the camera's focus and the pose).
 * - `after` each roaming step after the mode's (every mode), `frame` every frame
 *   (the overview too), `setMode` when the mode changes (stop what cannot go on;
 *   `next === 'overview'` is back to the map), `fromUrl` once a shot or a saved
 *   view has started roaming, `report` for bug reports (URL params of a shot).
 *
 * Words go in ui/lang.ts under the add-on's own line; saved state in
 * map/progress.ts; riel in the purse (`AddonEnv.purse`).
 */

/** Add-ons with an `order` up to this are offered on foot before a shrine (right after a golden figure). */
export const BEFORE_SHRINE = 15;

/** What every add-on gets once (roam.ts). */
export interface AddonEnv {
  explorer: AngkorExplorer;
  body: RoamBody;
  cam: FollowCam;
  world: RoamWorld;
  hud: RoamHud;
  /** The roaming interface's layer (it follows the picker's size and time of day): an add-on's own cards and buttons go in here. */
  layer: HTMLElement;
  controls: RoamControls;
  canvas: HTMLCanvasElement;
  /** The map's parts (to find another: `parts.find((p) => p.name === 'people')`). */
  parts: readonly MapPart[];
  /** Roaming's own group in the scene (shown in every mode, the overview too): an add-on's meshes go in here. */
  scene: Object3D;
  /** His camera and selfie phone (`photo.kind` is up, `photo.albumOpen`). */
  photo: RoamPhoto;
  /** His riel and his bag (_shopPurse.ts): `pay`, `earn`, `keep`. */
  purse: Purse;
  /** The page's URL values (checks). */
  params: URLSearchParams;
  /** Headless still: no randomness, no saving. */
  shot: boolean;
  uiSound(s: UISound): void;
  /**
   * Something else has him now: kneeling in prayer, sitting or lying on the ground, at a stall or eating, a posture
   * (the rope swing, an add-on holding him), the camera or the phone up, the album open. An add-on offers nothing then.
   */
  busy(): boolean;
}

export type AddonTap = (...codes: string[]) => boolean;

/** What `hold` returns: the prompt to show over him (or null), and a mode to switch to (or null to stay). */
export interface AddonHold {
  prompt: string | null;
  mode?: RoamMode | null;
}

export interface RoamAddon {
  /** Unique, e.g. `hammock`. */
  readonly id: string;
  /** Its place in the E row (lower first; ≤ `BEFORE_SHRINE`: before a shrine). Default 50. */
  readonly order?: number;
  init?(env: AddonEnv): void;
  /** Before the mode's step: its keys (`tap('KeyB')`). True: it took the step's input (he keeps still this step). */
  input?(ctx: RoamCtx, mode: RoamMode, tap: AddonTap, dt: number): boolean;
  /** In the E row (on foot on the ground, or afloat): the prompt ("E  Lie in the hammock") when E here starts it, else null. */
  offer?(ctx: RoamCtx, mode: 'walk' | 'boat'): string | null;
  /** E pressed while `offer` said so: start. A mode to switch to, or nothing. */
  use?(ctx: RoamCtx, mode: 'walk' | 'boat'): RoamMode | null | void;
  /** It holds him now: `holdIn`'s step is `hold`'s. */
  readonly holding?: boolean;
  /** The mode whose step it takes over while holding (default 'walk'). */
  readonly holdIn?: 'walk' | 'boat';
  /** While holding, instead of the mode's step. */
  hold?(ctx: RoamCtx, dt: number): AddonHold;
  /** His hands are its (the lantern, the torch, the flashlight go away). */
  readonly handsBusy?: boolean;
  /** After the mode's step, every roaming mode. */
  after?(ctx: RoamCtx, mode: RoamMode, dt: number): void;
  /** Every frame, every mode (the overview too). */
  frame?(f: MapFrame, mode: RoamMode): void;
  /** The roaming mode changed (`next === 'overview'`: back to the map; stop at once, quietly). */
  setMode?(next: RoamMode, prev: RoamMode, ctx: RoamCtx): void;
  /** A shot or a saved view started roaming (after the mode is entered and the tools' `fromUrl`): its URL values. */
  fromUrl?(q: URLSearchParams, ctx: RoamCtx): void;
  /** URL params that bring it back in a shot (bug reports), or null. */
  report?(): Record<string, string> | null;
}

/** Every add-on, in E-row order. */
export const ADDONS: RoamAddon[] = [];

/** Roaming's shared things once it is built (`initAddons`), and what roaming does with an add-on that comes later. */
let envNow: AddonEnv | null = null;
let lateHook: ((a: RoamAddon) => void) | null = null;

/**
 * An add-on module registers itself when imported (one with the same id replaces the old one). The modules load
 * after the map (_addonList.ts `loadAddons`): one that comes once roaming is built is started there and then
 * (`init`, and roaming tells it the mode it is in).
 */
export function registerAddon(a: RoamAddon): void {
  const i = ADDONS.findIndex((o) => o.id === a.id);
  if (i >= 0) ADDONS[i] = a;
  else ADDONS.push(a);
  ADDONS.sort((p, q) => (p.order ?? 50) - (q.order ?? 50));
  if (!envNow) return;
  try {
    a.init?.(envNow);
    lateHook?.(a);
  } catch (e) {
    console.error(`[roam] add-on "${a.id}" init failed:`, e);
  }
}

/** roam.ts, once: the shared things, every add-on registered so far started, and what to do with a late one. */
export function initAddons(env: AddonEnv, late: (a: RoamAddon) => void): void {
  envNow = env;
  lateHook = late;
  eachAddon('init', (a) => a.init?.(env));
}

/**
 * What the explorer menu (_explorerMenu.ts) asks of the add-ons, so it does not load them with it: each add-on fills
 * its own when its module loads (the umbrella, the clothes, the name card); until then these do nothing.
 */
export const MENU_HOOKS = {
  /** The umbrella is his choice now (_umbrella.ts). */
  umbrellaUp: (): boolean => false,
  /** Open the wardrobe (_wardrobe.ts). */
  openWardrobe: (): void => undefined,
  /** Open the name card (_nameCard.ts). */
  openNameCard: (): void => undefined,
};

/** The add-on holding him in `mode`, or null. */
export function addonHolding(mode: 'walk' | 'boat'): RoamAddon | null {
  for (const a of ADDONS) if (a.holding && (a.holdIn ?? 'walk') === mode) return a;
  return null;
}

/** Any add-on holds him (in any mode). */
export const addonBusy = (): boolean => ADDONS.some((a) => a.holding);

/** An add-on has his hands. */
export const addonHands = (): boolean => ADDONS.some((a) => a.handsBusy);

/** The first add-on (in `order`, within `[lo, hi]`) offering E here, with its prompt; or null. */
export function addonOffer(ctx: RoamCtx, mode: 'walk' | 'boat', lo = -Infinity, hi = Infinity): { addon: RoamAddon; prompt: string } | null {
  for (const a of ADDONS) {
    const o = a.order ?? 50;
    if (o < lo || o > hi || !a.offer) continue;
    let p: string | null = null;
    try {
      p = a.offer(ctx, mode);
    } catch (e) {
      console.error(`[roam] add-on "${a.id}" offer failed:`, e);
    }
    if (p) return { addon: a, prompt: p };
  }
  return null;
}

/** Call `fn` on every add-on, an error in one logged and the rest going on. */
export function eachAddon(what: string, fn: (a: RoamAddon) => void): void {
  for (const a of ADDONS)
    try {
      fn(a);
    } catch (e) {
      console.error(`[roam] add-on "${a.id}" ${what} failed:`, e);
    }
}
