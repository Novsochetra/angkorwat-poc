# peoplefix — handoff

**Task:** (1) rice planters / reapers clump and pass through each other, their
palm-leaf hats overlapping (`src/map/people/_sceneFarm.ts`); (2) the krama
wrapped round the head reads as a plain red cap (`src/map/people/_personModel.ts`
`FEAT.kramaHead`, colours in `_kinds.ts`). Keep `hatPalm` exactly as it is.

## Done

- Nothing in the code yet: no file changed. Only reading and "before" shots
  (the shots were in the scratchpad; retake them with the commands below).

## Not done (the whole task) — how I would finish it

### 1. Farmers (`_sceneFarm.ts`)
- `ROW` (line ~35) is 1.7 m between people in the working row. The palm hat
  brim is 1.12 m wide × `PEOPLE_SCALE` 1.4 × height ≈ 1.5 m, so at 1.7 m the
  brims nearly touch and any drift makes them overlap. Set `ROW` ≈ 2.4 m.
- `keepApart` (`_actor.ts`) only keeps bodies 0.22 × scale apart (≈ 0.6 m),
  so it does not stop hats overlapping: the row spacing must do that.
- Probable causes of the clump to check with a probe:
  - `inPlot` clamps `v` (across the plot) to the plot's half-width minus a
    1.4 m margin: in a narrow plot all four collapse to one edge. Fix: if
    `(n−1)·ROW` does not fit, shrink the spacing, or put the row along the
    longer side.
  - In `farmer()`, row people `goTo` their slot at 0.3 m/s when close, and
    `Actor.step` turns them towards the goal first; as `front` drifts with
    `dir` flipping, each re-walks and they can cross. Better: move the row
    together: step each one's place straight back (planting: walking
    backwards, bent over, facing the planted rows) and do not turn them
    (use `warp`-like small moves along the sweep, or `goTo` + `face` with
    a speed low enough that `step` never turns them round).
  - `a.avoid(env.traffic, 'farm')` dodges: check that `Traffic.dodge` does
    not push farmers of the same group into each other.
- Check with a Playwright loop (a copy of the scratch `probe.mjs` pattern:
  open `map.html?shot=1&people=farm&season=0.2`, then in `page.evaluate` call
  the `people` part's `update(frame)` for a few thousand steps of 0.1 s,
  reading `window.__people.scenes` → `farm.farmers[k].a.x/z`) and assert the
  min distance between row farmers stays ≥ ~2.2 m at `season` 0.15, 0.2, 0.25
  and for the reapers at 0.68.

### 2. Krama on the head (`_personModel.ts`, `buildModel`, "Hats and head cloths")
- Now: one box 0.62×0.12×0.51 in `S.accent` sitting on top of the head
  (top at 1.66, head top at 1.5975) plus one thin `S.accent2` stripe and a
  small side lump: from above it is a flat red lid.
- Plan (cheap, few boxes; `169 boxes a person` now, perfcrowd is watching the
  count): a band round the head just above the brows (≈ y 1.47‥1.63, a little
  wider than the head 0.58 × 0.47) in `S.accent2` (white) as the base, then a
  gingham check made of crossing stripes in `S.accent` (red/blue):
  2 horizontal ring stripes (full boxes a hair bigger than the band), 3‥4
  vertical stripes through front-to-back and 3 through side-to-side (each a
  full box: shows on both faces and on the top). Same colour on crossings, so
  no visible z-fight. Then a knot at the side/back (`S.accent`, ~0.09 cube)
  and a short tail or two hanging from it (~0.04×0.16×0.09) with a white
  fringe (`S.accent2`) at the end. Check `kramaNeck` (lines ~450) gets the
  same stripes (one or two vertical `S.accent2` stripes on the loop and tail).
- Colours are already right in `_kinds.ts`: fisherman `accent` 0xb8322c,
  `accent2` 0xf0ece0; villagers red / blue / green with white.

## How to check
- `npx tsc --noEmit`, `npm run build`.
- Krama close-ups (lineup, kinds row: fishermen at (−26.4, 7.0) and (−25.3, 6.0),
  krama villager at (−18.2, 0.5); poses row: krama pole-carrier at (−1.9, −23.5)):
  `SHOT_W=1200 SHOT_H=700 npm run shots -- lk1="@map.html?shot=1&people=lineup&ui=0&cam=-22.5,11.2,7.3,-25.9,10,6.5" lk2="@map.html?shot=1&people=lineup&ui=0&cam=-15.2,11,1.3,-18.2,10,0.5" lp="@map.html?shot=1&people=lineup&ui=0&cam=1.2,11.3,-22.6,-2.6,10,-22.2"`
- Fishers: `fish="@map.html?shot=1&fish=5.3&ui=0&cam=-352,14,78,-366,6,88"`.
- Farmers: `farm="@map.html?shot=1&season=0.2&ui=0&cam=-240,20,50,-250,8,70"`,
  `harvest="@map.html?shot=1&season=0.68&ui=0&cam=-240,20,50,-250,8,70"`.

## Files changed
- None (this note only).

## Know this
- perfcrowd edits the same people files at the same time (`_personModel.ts`
  `Crowd.set`, `_things.ts`, `_routes.ts`, `_actor.ts`, `_sceneFarm.ts` /
  `_sceneApsara.ts` per-step arrays, people shadows): targeted edits only,
  re-read before each edit.
