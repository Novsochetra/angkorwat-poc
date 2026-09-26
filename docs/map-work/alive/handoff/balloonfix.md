# Handoff: balloonfix

**Task:** the parked hot air balloon (home field (−32, −64), `src/map/roam/balloon.ts`,
`_balloonModel.ts`) lies deflated on the grass until it is ridden; E at the basket
plays a short inflation (6–10 s) before the ride.

## Done
- Nothing in code yet: the balloon files are unchanged by me. I read the code
  and planned the work (below). The code compiles as it did before.
- Before shots: none taken yet (the shot command failed because `timeout` does
  not exist on macOS; run `npm run shots` without it).

## Not done: the whole change. The plan
The lead's brief (keep it): parked = envelope deflated on the grass (long flat
heap with soft folds, crown ring at the far end), basket tipped on its side at the
mouth, burner frame, a small fan (inflator), ropes and stakes, the sign; no night
burner glow while parked (a small lantern by the sign at night is fine). E at the
basket: basket rights itself, he hops in, fan blows cold air (envelope ripples and
rises off the grass), burner fires (roar, glow), envelope stands up over the
basket, then the ride works as now. W/Space speeds it up, Esc cancels back to
parked. Landing and stepping out as now; a balloon left elsewhere stays inflated
until roaming ends; going home makes it parked (deflated) again.

1. **`_balloonModel.ts`**
   - New mesh `heap`: a voxel strip about 8.5 m long (true size; × `size` 1.4 in
     the world), narrow at the mouth (about 1.2 m) and wider further out (about
     3.5 m), 0.2–0.5 m tall, with lengthwise fold ridges and a few cross wrinkles.
     The flag bands run across it: dark scoop at the mouth, blue, a gold line, red
     (a few white temple fragments), a gold line, blue, then the gold ring round
     the dark blue cap at the far end. Use the same colours as the envelope loop.
   - New `fan`: a small petrol fan (frame, round cage) plus a separate propeller
     mesh that spins, placed by the mouth and facing it.
   - Night lantern by the sign: one `glow` block. Set its instance colour from
     `night`, the way the flame and pilot blocks are set in `Balloon.pose`.
     Copy the ramp beacon in `_rampFlag.ts`. No new lights.
   - `BalloonPose` gets new fields, for example `inflate` (0‥1 or a stage),
     `tip` (how far the basket lies on its side), `fan` (0‥1).
   - Put the basket, burner and rods in a sub-group so they can be tipped
     separately. The tether ropes must then use that sub-group's matrix.
   - Envelope while lying: rotate `this.envelope` about the mouth by −90° round
     x, so the crown points to local −z (behind the basket) and the front temple
     faces up. Scale it before rotating: across ≈ 0.55→1, height ≈ 0.08→1 during
     the fan stage. Put the mouth at (0, R·height, −(hz+1)). During the burner
     stage, swing the angle −90°→0° and move the mouth to (0, throat, 0). I
     checked it: the envelope's lowest point stays above the ground all the way.
   - Hide the heap once the growing envelope covers it (height scale > ~0.1).
     Pilot flame off (scale 0) and the lantern shell black while parked.
2. **`balloon.ts`**
   - New state `inflated` (false at home after `goHome()`).
   - `enter()`: if not inflated → `board` (the basket rights itself, ~0.9 s, then
     he hops in) → new phase `inflate` (fan ~0–3.5 s, then burner to ~8 s; W/Space
     makes it go ×3.5 faster and roars the burner) → `ground` inflated.
   - Keep the inflation progress in a variable that `frame()` also moves, so a
     cancel can deflate it backwards after he has hopped out to `walk`.
   - `cancel(ctx)`: during `board`/`inflate` → he hops out (phase `out`) and the
     progress runs back to parked. Returns true so roam.ts does not stop roaming.
   - Parked and deflated: nothing moves, so pose it once, then only for the night
     lantern (when `night` changes). perfcrowd's `parkedPose` / `posed`
     (≈ lines 683–737) is already in the file: keep it, and use it for an
     inflated balloon left somewhere else.
   - `levels.burner` stays as it is. Add a fan level during inflation.
   - URL: `balloon=parked` (with `roam=balloon`: put him on foot beside the tipped
     basket, phase `out` done so the first step returns `walk`) and
     `balloon=inflate:<s>` (in the basket at home, the inflation run for s
     seconds). `roam=balloon` without it starts in the basket already inflated
     (as now).
   - `reportParams()`: while inflating, return `{ balloon: 'inflate:<s>' }`.
   - Update the header comment and the `BRIEF.md` balloon section (line ~91).
3. **Shared files (targeted edits only):**
   - `roam.ts` `step()`: after `tools.input(...)`:
     `if (controls.state.exit && mode === 'balloon' && balloon.cancel(rctx)) controls.state.exit = false;`
     `report()`: add `...(mode === 'balloon' ? balloon.reportParams() : {})`.
     `update()`: pass `f.roamLevels.fan` like `burner`, and reset it with the other levels.
   - Fan hum, the chain the burner uses: `types.ts` `RoamLevels.fan?`,
     `audio/audio.ts` line ~330, `audio/engine.ts` `roamLevels(…, fan)`, and
     `audio/explorer.ts` `levels(…, fan)` with a `makeFan` lasting sound (soft
     filtered noise with a low hum, on the moves bus like the burner).
   - Esc in shots is `x` in `sim=`.
4. **Compile at load:** the envelope is hidden while parked. For the first ~3
   `frame()` calls, keep the envelope, heap and fan visible at a tiny scale, then
   set their visibility from the state (see the WARM idea in `src/map/cull.ts`).
   Do not use `visible=false` from the start, or its (near-fade) shader compiles
   only on first use.
5. **The lying direction:** HOME_YAW faces the overview camera (+z, south), so
   the heap lies behind the basket (north, toward the summit's cliff). A cold-
   inflated envelope reaches about 15 m (world) behind the basket and is about
   ±6 m wide. The cleared field is ±13 m. Check with a top shot that it does not
   run into the cliff or trees. If it does, lay it along the field's diagonal.

## How to check
```
SHOT_OUT=<dir> SHOT_W=1672 SHOT_H=941 npm run shots -- \
  ov="@map.html?shot=1" ovn="@map.html?shot=1&night=1" \
  top="@map.html?shot=1&ui=0&cam=-32,70,-40,-32,0,-64" \
  close="@map.html?shot=1&ui=0&cam=-10,14,-30,-32,6,-64" \
  closen="@map.html?shot=1&ui=0&night=1&cam=-10,14,-30,-32,6,-64" \
  inf3="@map.html?shot=1&roam=balloon&balloon=inflate:3" \
  inf6="@map.html?shot=1&roam=balloon&balloon=inflate:6" \
  ride="@map.html?shot=1&roam=balloon&sim=w:6,_:3"
```
Also check boarding from walk: `roam=walk&at=-30,-60&sim=e:0.1,_:10`. Check Esc
with `sim=e:0.1,_:3,x:0.1,_:3`. Then `npx tsc --noEmit` and `npm run build`.
The old look is in `scratchpad/alive/review-look/ov_day.png` and
`z_ov_balloon.png` (the balloon in the middle, under the Preah Khan pin).

## Files changed
- None in `src/`. Only this note.

## Know before you start
- perfcrowd edited `balloon.ts` (`frame`, `parkedPose`, `posed`, constants
  `POSE_NEAR` / `POSE_EVERY`, imports of Frustum/Matrix4/Sphere). Keep them.
- The walker finds the basket with `world.balloonNear` → `balloon.near()`, and
  goes round it with `solid()`. Keep both where the basket is.
- The mini-map reads `info.pos` / `home` / `riding` only. It does not need to change.
