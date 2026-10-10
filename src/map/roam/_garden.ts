import '../audio/_garden';
import { homeToWorld } from '../hamlet/_homePlan';
import { TIME } from '../time';
import { GARDEN } from '../garden/state';
import { createGardenView, type GardenView } from '../garden/view';
import type { MapFrame } from '../types';
import { registerAddon, type AddonEnv } from './_addons';

/**
 * His home garden (add-on `garden`; the guide docs/map-work/addons.md "His home
 * garden"). What grows and how: garden/kinds.ts (the plants), garden/state.ts
 * (the saved garden, growth, water, harvest), garden/look.ts + garden/models/
 * (how each looks), garden/view.ts (drawn on the map), garden/actions.ts (the
 * work's timing: poses character/gardenWork.ts, props _gardenProps.ts, sounds
 * audio/_garden.ts).
 *
 * CORE SKELETON: the garden grows and is drawn; the URL's values set it for shots.
 * The interaction's owner adds the rest here (where he may plant: _gardenSpots.ts;
 * the ring at his feet: _gardenRing.ts; the seed card: _gardenCard.ts; the work:
 * _gardenWork.ts; Grandma's seed basket; the walk map's trunks).
 *
 * URL (checks): `garden=lineup` (every kind at every stage, in rows before the
 * house), `garden=demo`, `garden=<kind>:<stage>[:ripe|:green|:dry|:wilt|:dead|:fallen],…`,
 * `garden=0` · `seeds=all|<kind>:<n>,…` · `basket=all|<kind>:<n>,…` · `can=<n>` ·
 * `gardenclock=<days>` (garden/state.ts `fromUrl`).
 */

let env: AddonEnv | null = null;
let view: GardenView | null = null;
/** The map's days of the cycle last frame (NaN: not yet). */
let lastDays = Number.NaN;

/**
 * `n` free places for a shot's lineup (m): in the meadow before the house (its front looks north up to Kulen),
 * crops in rows close by, trees in rows further out. Local to the house (+z out from its front).
 */
function lineupSpots(n: number, trees: boolean): [number, number][] {
  const out: [number, number][] = [];
  const across = trees ? 5 : 6;
  const gap = trees ? 6.5 : 1.8;
  const first = trees ? 20 : 9;
  const rowGap = trees ? 7 : 1.9;
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / across);
    const col = i % across;
    const lx = (col - (across - 1) / 2) * gap + 2;
    const lz = first + row * rowGap;
    out.push(homeToWorld(lx, lz));
  }
  return out;
}

registerAddon({
  id: 'garden',
  order: 45,
  init(e) {
    env = e;
    view = createGardenView(e.world.field);
    e.scene.add(view.object);
    // (a shot's or a check's garden, before the first frame: the overview's shots too)
    GARDEN.fromUrl(e.params, lineupSpots);
  },
  frame(f: MapFrame) {
    if (!view) return;
    // The garden's clock: the map's days as they run (sleep moves them on), else a day each `dayLength` s of play.
    const days = TIME.days();
    let d = 0;
    if (TIME.cycling()) d = Number.isNaN(lastDays) ? 0 : days - lastDays;
    else d = f.dt / TIME.dayLength;
    lastDays = days;
    if (!(env?.shot ?? true) && d > 0) GARDEN.advance(Math.min(d, 2), f.season, f.weather.rain);
    GARDEN.tick(f.dt);
    view.sync(GARDEN.plants);
    view.frame(f.camera, f.t);
  },
});
