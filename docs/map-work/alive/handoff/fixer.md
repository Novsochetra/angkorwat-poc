# Handoff: fixer (integration bugs of the "alive map")

Task: fix 6 known integration bugs (a missing glider ramp, a kites crash, a dark cube over the great lake, wooden footsteps in the village and camps, a boat berth at the village jetty, E rows in the `?` key list).

## Done and checked
1. **Missing glider ramp (-283,-108).** Cause: the ramp was always found at -279,-108 and slid 4 m west in `settle`, because a moss cushion sits on the cliff lip at -279. The village's first stilt houses (near -290,33) now stand under the left wing-tip lane 131 m out, 0.6 m inside the required clearance, so the only slide that fit was refused ("launch spot -279,-108 left out"). Fix: in `src/map/roam/launchSpots.ts` `blocked`, the flight lane now needs only the treetops' room (`CROWN_ROOM` = 2 m, the same as the crowns check in `corridor`) over things that stand on the land (roofs, trunks). The bare land still needs `MIN_CLEAR`. Proof: in a full-map shot the console line says `[map] launch spots: 5 (… -283,-108 ↑30m yaw 0° …)`. The other 4 ramps are unchanged. The flag, lamp and minimap badge come back with it (they come from the ramp list).
2. **Kites crash ("reads target.x of undefined").** Cause: `Math.floor(now / 14) % n` is negative when `now < 0`. That happens in a shot with `t` < 8 (the run-up) and in a live page whose first frame is stamped before its start. It indexed `flyers[-1]`. Fix: a positive modulo in `src/map/people/_sceneKites.ts` `run`. Proof: a Playwright loop over clocks, weathers, cameras and `now` from -3 to 60 gave 195 errors before (all with `now` < 0) and needs one re-run to show 0 after (see "Not done").
3. **Dark cube over the great lake.** Cause: the `vegetation` part (bisected with `parts=`; the mesh is `vegetation:4:far:mapLeaf`). One lone tree (an orange-flowering far crown at -496,-163) stands on land that has sunk to 2 m, lower than the lake's water, at the map's sinking west edge. The valley mist hides its ground and trunk, so the crown floats like a box. Fix: in `src/map/veg/scatter.ts` `scatterTrees`, the new `drowned` check (with `LAKE_LOWLAND` = 2.6 lake radii) plants no tree on land lower than a lake's level, outside the roaming area, near that lake. Proof: the shot `cam=-455,30,-60,-496,8,-163` shows the cube before and not after. Vegetation blocks went from 142639 to 142412. The overview did not change from my work (see "Must know").
4. **Planks sound like stone.** Fix: new `src/map/roam/_woodFloor.ts` `buildWoodFloor`. It collects the tops of the wooden blocks (`mapBark`, `wood`, `bark`) of the `village` and `camps` parts in 0.5 m columns. It is wired as `RoamWorld.woodAt` (`types.ts`, `world.ts`; the log line now ends with `· planks: N columns`, 4197 in the full map). `walker.ts` `stepSound` now returns `stepWood` when `woodAt` is true. Proof (a Playwright probe calling `stepSound`): the jetty, all verandas, the stair treads, the rafts, both bridges and the monk's hut went from stone (or sand) to wood. The pagoda door and the village ground did not change.
5. **Boarding a boat at the village jetty.** Fix in `src/map/roam/boat.ts`:
   - a third moored hull, `boat:jetty`, and `moored.jetty`, with `jettyBerth()` placing it alongside the jetty head on its north-east side, bow out. It is at (-316, 47): `[map] boat: … and jetty berth at (-316, 47)`.
   - `mooredBoatNear` includes the jetty boat.
   - `enter` and `exit` put the boat back at its berth, as the River Gate landing does.
   - `frame` makes it bob.
   - `ashore` also accepts the jetty's plank floor over the water (`onJetty`: on the deck footprint, at deck height, so not on a bench or a trap).

   Proof (the probe, `lang=en`): on the jetty head at -316.8,49.2 the prompt is "E Board the boat". After E he is in the boat at the berth and the prompt is "E Step ashore". `roam=boat&at=-315.87,47.1&yaw=-135` shows "E Step ashore", and after E he is walking.
6. **`?` key list.** `src/map/roam/tools.ts` `keyList`: a new "Close by" sub-section under the Tools column (it had room), with three E rows: pick up a golden figure, swing (`rSwing`), ride the hot air balloon (`rBalloon`). New words in `src/map/ui/lang.ts`: `rCloseBy` (នៅក្បែរ / Close by) and `tgPickAny` (រើសរូបចម្លាក់មាស / pick up a golden figure). tsc is clean.

## Not done or half done
- Screenshots taken but **not looked at** (the stop came first): `ramp_after`, `bigmap_after`, `jetty_after`, `keys_en_after` and `keys_km_after`. They were in the scratch folder, which does not move to the cloud. Retake them (below) and check them: the flag and lamp on the ramp, the badge on the big map, the boat at the jetty, and that the key list still fits (it has 4 more lines in the Tools column).
- Re-run the kites probe after the fix (it should show 0 errors), or take a shot with `people=kites&t=2`. Before the fix, that shot hung.
- The step-out from the jetty boat after the `onJetty` change was not re-checked by the probe. Re-run: `roam=boat&at=-315.87,47.1&yaw=-135&sim=_:1,e:0.2,_:1&lang=en`. It should end in `walk` with y ≈ 6.2 (the deck), not 7.1 (a fish trap).
- `npm run build` not run yet. `npx tsc --noEmit` is clean for every file above.

## How to check
- Ramp: any full-map shot, then the console line `[map] launch spots: 5 …`, then `roam=walk&at=-283,-105&yaw=0&sim=_:1&rcam=150,22,14&lang=en` and `…&bigmap=1`.
- Cube: `cam=-455,30,-60,-496,8,-163&ui=0`.
- Kites: `people=kites&t=2&cam=-229,13,127,-237,17,104`.
- Wood: walk the jetty `roam=walk&at=-304,63&yaw=225&sim=w:3`. The step sound comes from `stepSound` (walker.ts).
- Boat: `roam=walk&at=-316.8,49.2&yaw=-135&sim=_:0.5&lang=en` should show "E Board the boat".
- Keys: `parts=terrain,foreground&roam=walk&at=-240,111&sim=_:0.5&keys=1` (with and without `lang=en`).

## Files changed
- `src/map/roam/launchSpots.ts` (`blocked`, `CROWN_ROOM`, `corridor`)
- `src/map/people/_sceneKites.ts` (`run`)
- `src/map/veg/scatter.ts` (`scatterTrees` `drowned`, `LAKE_LOWLAND`, `LAKES` import)
- `src/map/roam/_woodFloor.ts` (new)
- `src/map/roam/types.ts` (`RoamWorld.woodAt`)
- `src/map/roam/world.ts`
- `src/map/roam/walker.ts` (`stepSound`)
- `src/map/roam/boat.ts` (jetty berth, `jettyBerth`, `onJetty`, `JETTY_BERTH_ALONG`)
- `src/map/roam/tools.ts` (`keyList`)
- `src/map/ui/lang.ts` (`rCloseBy`, `tgPickAny`)

## Must know
- The overview pixel-diff before and after showed changes, but none from these fixes:
  - Another session changed the explorer's hat (now the palm-leaf hat) and the title words.
  - The ramp flags' wave phase shifts a little because the ramp indices are back to 5.
- `onJetty` repeats the head's size (3.2 m long, 2.2 m each side) from `village/_houses.ts` `jetty`. If the jetty's build changes, update it.
- The village skiffs, the ladder and the floating shop were placed around the berth. The berth is clear of them by about 0.4 m at the skiff behind it.
