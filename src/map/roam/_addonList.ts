/**
 * Every roaming add-on (_addons.ts): loading its module registers it. One line
 * each, in the group it belongs to; a new add-on adds its line under its
 * group's comment, never elsewhere.
 *
 * The modules are chunks of their own, not in the code the map needs first:
 * `loadAddons` starts their download as the map's build begins (main.ts), and
 * roaming (roam.ts `buildRoam`) waits for them, so their meshes are in the scene
 * when the map compiles its shaders, before Start (none is compiled in the middle
 * of play). One that fails to load is logged and left out; the others go on.
 */
const MODULES: readonly (() => Promise<unknown>)[] = [
  // ── Knowing what is on (the calendar of events) ──
  () => import('./_calendar'),
  // ── Ways to move: the bicycle, the ox cart, the water buffalo, the zip line, the sugar palm ladder ──
  () => import('./_bike'),
  () => import('./_cartRide'),
  () => import('./_buffaloRide'),
  () => import('./_zip'),
  () => import('./_palmClimb'),
  // ── Village life: the hammock, the alms round (dak bat), the monk's blessing, kneeling to listen to the chanting, lotus, monkeys ──
  () => import('./_hammock'),
  () => import('./_dakBat'),
  () => import('./_blessing'),
  () => import('./_listen'),
  () => import('./_lotus'),
  () => import('./_monkeyThief'),
  // ── Join the fun: the kite, the farmers' work, the boat race, kick the sey ──
  () => import('./_kiteFly'),
  () => import('./_farmWork'),
  () => import('./_raceRow'),
  () => import('./_sey'),
  // ── A friend and a home: the dog, the stilt house, his name ──
  () => import('./_dog'),
  () => import('./_home'),
  () => import('./_name'),
  // ── Small things: the umbrella, the binoculars, smiles for the camera, selling fish, clothes ──
  () => import('./_umbrella'),
  () => import('./_binoculars'),
  () => import('./_smile'),
  () => import('./_fishSell'),
  () => import('./_wardrobe'),
  // ── Festivals and rare moments ──
  () => import('./_pchumBen'),
  () => import('./_visak'),
  () => import('./_equinox'),
];

let loading: Promise<void> | null = null;

/** Load every add-on (once; later calls get the same promise). Settles when all have loaded or failed. */
export function loadAddons(): Promise<void> {
  loading ??= Promise.allSettled(MODULES.map((m) => m())).then((rs) => {
    rs.forEach((r, i) => {
      if (r.status === 'rejected') console.error(`[roam] add-on module ${i} failed to load:`, r.reason);
    });
  });
  return loading;
}
