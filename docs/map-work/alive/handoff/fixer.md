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

## Re-checked in the cloud (all done)
- **Kites loop:** a Playwright probe ran `KiteKids.update` at 30 fps from `now` = -30 s to 4000 s: 0 errors, every child stays at its spot (no NaN, none more than 20 m off). The shot `people=kites&t=2` renders (it used to hang): three kites up on their strings, the small one by them.
- **Per-frame garbage in `_sceneKites.fly`:** the string loop's `[px, py, pz] = [qx, qy, qz]` built an array per segment per kite every frame; now plain assignments. Nothing else in `fly` allocates (`handAt`, `segment`, `place`, `lookAt` all write into kept objects).
- **Stepping off the jetty boat:** it put him on the fish traps at the head's end (y 7.18), because `onJetty` only checked the one point under his feet, and a trap's lid there is at deck height ± 0.15. Now `onJetty(x, z, world, room)` also needs bare planks for his radius + 0.15 m all round (8 points, `onJettyAt` is the old single-point test). After: `roam=boat&at=-315.87,47.1&yaw=-135&sim=_:1,e:0.2,_:1` ends in `walk` at y 6.2 (the deck). Board then step out from the deck (`roam=walk&at=-315.92,49.81&sim=_:0.5,e:0.2,_:1.5,e:0.2,_:1.5`) also ends on the deck at 6.2.
- **The E prompt on the jetty head:** the golden hamsa (treasure/_spots.ts) now sits at the jetty's end, and the gold wins E over the boat within 2.3 m: at the old check spot -316.8,49.2 the prompt is "E Pick up the golden hamsa". A little further in, at -315.92,49.81, it is "E Board the boat" (shot `fixer_jetty`: the boat lies alongside the head). Once the hamsa is picked up, the boat prompt comes back. Left as it is (the figure is meant to be found there).
- **Ramps:** the console says `launch spots: 5 (… -283,-108 ↑30m …)` in every full-map shot. The ramp shot shows the glider, the deck, the flag and the lamp post, and "E Fly the hang glider". The big map shows all 5 ramp badges ("You are here" on the new one, "Nearest · 230 m" on the Bayon one). (With `parts=terrain,foreground` only 4 ramps are found: the terrace hills need the landmarks. That is the old behaviour and only in part-limited shots.)
- **Lake tree cube:** `cam=-455,30,-60,-496,8,-163&ui=0` shows no floating crown.
- **Wood footsteps:** sampled along the jetty (every 1 m, centre and ±0.8 m): planks read wood at 6.2 m everywhere, except two single 0.5 m walk-map columns on the centre line (u ≈ 4 and 10 m from the foot) that read the water/bed below (4.0-4.4 m), where the 4 cm seam between two planks falls on a column's middle. He does not fall in (his radius spans it), but a footstep there can sound of water. Not fixed (walk map rasterising, `walkmap.ts`, shared).
- **? key list:** fits in both languages with the "Close by" rows (shots `fixer_keys_en`, `fixer_keys_km`).

## How to check
- Ramp: any full-map shot, then the console line `[map] launch spots: 5 …`, then `roam=walk&at=-283,-105&yaw=0&sim=_:1&rcam=150,22,14&lang=en` and `…&bigmap=1`.
- Cube: `cam=-455,30,-60,-496,8,-163&ui=0`.
- Kites: `people=kites&t=2&cam=-229,13,127,-237,17,104`.
- Wood: walk the jetty `roam=walk&at=-304,63&yaw=225&sim=w:3`. The step sound comes from `stepSound` (walker.ts).
- Boat: `roam=walk&at=-315.92,49.81&yaw=-135&sim=_:0.5&lang=en` should show "E Board the boat" (nearer the head's end the golden hamsa takes E first).
- Keys: `parts=terrain,foreground&roam=walk&at=-240,111&sim=_:0.5&keys=1` (with and without `lang=en`).

## Files changed
- `src/map/roam/launchSpots.ts` (`blocked`, `CROWN_ROOM`, `corridor`)
- `src/map/people/_sceneKites.ts` (`run`, `fly`: no per-frame array)
- `src/map/veg/scatter.ts` (`scatterTrees` `drowned`, `LAKE_LOWLAND`, `LAKES` import)
- `src/map/roam/_woodFloor.ts` (new)
- `src/map/roam/types.ts` (`RoamWorld.woodAt`)
- `src/map/roam/world.ts`
- `src/map/roam/walker.ts` (`stepSound`)
- `src/map/roam/boat.ts` (jetty berth, `jettyBerth`, `onJetty` + `onJettyAt`, `JETTY_BERTH_ALONG`)
- `src/map/roam/tools.ts` (`keyList`)
- `src/map/ui/lang.ts` (`rCloseBy`, `tgPickAny`)

## Must know
- The overview pixel-diff before and after showed changes, but none from these fixes:
  - Another session changed the explorer's hat (now the palm-leaf hat) and the title words.
  - The ramp flags' wave phase shifts a little because the ramp indices are back to 5.
- `onJetty` repeats the head's size (3.2 m long, 2.2 m each side) from `village/_houses.ts` `jetty`. If the jetty's build changes, update it.
- The village skiffs, the ladder and the floating shop were placed around the berth. The berth is clear of them by about 0.4 m at the skiff behind it.
