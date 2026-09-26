# peoplefix — handoff

**Task:** (1) rice planters / reapers clump and pass through each other, their
palm-leaf hats overlapping (`src/map/people/_sceneFarm.ts`); (2) the krama
wrapped round the head reads as a plain red cap (`src/map/people/_personModel.ts`
`FEAT.kramaHead`, colours in `_kinds.ts`). Keep `hatPalm` exactly as it is.

## Done (cloud session)

- Farmers (`_sceneFarm.ts`): `ROW` 2.4 m (shrunk only if a plot is too
  narrow); `order()` gives out the row places with the least walking in all
  when the plot or the season's jobs change (so nobody crosses anyone walking over);
  within 2 m of their place the row `shuffle`s along with the sweep
  (`Actor.shuffle`, `_actor.ts`: no turning round for a step).
- Krama on the head (`_personModel.ts`): a white band and folded top with
  crossing stripes in `accent` (gingham), a knot at the back left and a
  short tail with a white fringe (14 boxes, was 3). `kramaNeck` got two
  white stripes. `hatPalm` untouched.
- Rain (`EVENTS.umbrellas` / `hurry`): `RAIN_PACE.hurry` (`_actor.ts`, set
  in index.ts) quickens every walk (`goTo` ≥ 0.5 m/s); the tour walks
  quicker and opens umbrellas (the guide swaps the flag for one, 5 of 7
  visitors); the monks carry their umbrellas in the rain (even mornings).
  Kites already stop in rain. Not done: `EVENTS.shelter` (storm: taking
  cover) for people.

## How to check
- `npx tsc --noEmit`, `npm run build`.
- Krama close-ups (lineup, kinds row: fishermen at (−26.4, 7.0) and (−25.3, 6.0),
  krama villager at (−18.2, 0.5); poses row: krama pole-carrier at (−1.9, −23.5)):
  `SHOT_W=1200 SHOT_H=700 npm run shots -- lk1="@index.html?shot=1&people=lineup&ui=0&cam=-22.5,11.2,7.3,-25.9,10,6.5" lk2="@index.html?shot=1&people=lineup&ui=0&cam=-15.2,11,1.3,-18.2,10,0.5" lp="@index.html?shot=1&people=lineup&ui=0&cam=1.2,11.3,-22.6,-2.6,10,-22.2"`
- Fishers: `fish="@index.html?shot=1&fish=5.3&ui=0&cam=-352,14,78,-366,6,88"`.
- Farmers: `farm="@index.html?shot=1&season=0.2&ui=0&cam=-240,20,50,-250,8,70"`,
  `harvest="@index.html?shot=1&season=0.68&ui=0&cam=-240,20,50,-250,8,70"`.

## Files changed
- `src/map/people/_sceneFarm.ts`, `_actor.ts`, `_personModel.ts`, `_monks.ts`, `_tour.ts`, `index.ts`.

## Know this
- perfcrowd edits the same people files at the same time (`_personModel.ts`
  `Crowd.set`, `_things.ts`, `_routes.ts`, `_actor.ts`, `_sceneFarm.ts` /
  `_sceneApsara.ts` per-step arrays, people shadows): targeted edits only,
  re-read before each edit.
