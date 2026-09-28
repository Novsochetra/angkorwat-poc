/**
 * Roaming choices from the settings panel, read by the roaming modes each
 * frame. main.ts keeps them in step with `MapSettings` (and the URL:
 * `easyfly=0|1`, `minimap=show|button|hide`, `keyhelp=0|1`).
 */
import type { MiniMapChoice } from '../types';

export const roamPrefs = {
  /**
   * Easy flying (hang glider): hands-off it holds its height, S climbs and W
   * dives as long as they are held, and it flies on as long as you like.
   * Off: the real glider (it sinks about 1 in 12; rising air keeps it up).
   * The hot air balloon too (balloon.ts): on, it cruises forward and flies
   * like the glider; off, the real balloon (burner, vent, the wind).
   */
  easyFly: true,
  /**
   * The mini-map (ui/minimap.ts): `show`, its land; `button`, only its caption
   * ("M  Map", or the target and how far it is), a button for the big map;
   * `hide`, nothing (M still opens the big map).
   */
  miniMap: 'show' as MiniMapChoice,
  /** The keys of the mode, bottom left (hud.ts `.rh-help`); off, hidden. */
  keyHelp: true,
};
