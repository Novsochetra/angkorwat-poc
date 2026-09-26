# festfix: handoff

**Task:** fix three festival review findings: (1) the racing boat's bow looks like a Chinese dragon, (2) New Year pennants are T-shapes at head height and fill the view near the follow camera, (3) Khmer festival heading and book labels have letter spacing.

## Done

- Nothing is changed in the repo yet. I stopped before the first edit, so there is nothing to undo.
- One "before" shot was taken; it shows the dragon-like bow clearly:
  `fest=water&t=3&ui=0&parts=terrain,water,festival&cam=-527,8,0,-538,6,8`
  (at `t=3`, boats 0 and 1 wait at the start, x = -548, z = 8 and 18, bows toward +x).

## Not done: the plan for each fix

### 1. Boat bow: `src/map/festival/_boats.ts` `dragonBoat` (called once in `_water.ts:96`)
- Remove the naga head (neck, head, jaw, tongue, whiskers, crest: lines ~69-99) and the stern tail (~101-110).
- **Prow:** a quadratic Bezier centre line in the y-z plane from P0 (z HALF-0.5, y 0.35) through the control point P1 (HALF+1.7, 0.55) to P2 (HALF+2.0, 3.0). Use about 10 boxes along it, each long in local y, with `pitch = atan2(dz, dy)` (kRotX turns local y to (0, cos a, sin a)).
  - Taper the thickness across the curve from 1.1 to 0.18 m, and the width (x) from 0.7 to 0.14 m.
  - Colours: `crew.hull`, a gold rim on the upper edge, `crew.band` on the lower edge, and small gold lozenges (pitch a+pi/4) on both sides of every other segment.
- **Eyes:** painted on the prow's sides near the waterline, at about z HALF-0.1, y 0.42, x = +/-(width/2 + 0.012). Each eye is a white 0.34 x 0.18 box, a dark 0.14 iris and a red or gold lid line.
- **Tip:** a gold kbach flame finial: a collar, a bulb, a tongue that curls back, and small side flames in both the y-z plane and the x plane, with a red inset.
  - Below the tip: scarves tied round the post (2 colours, 2 short hanging tails), and the marigold garland moved onto the post.
- **Stern:** the same curve mirrored, lower: P0 (-HALF+0.5, 0.35), P1 (-HALF-1.3, 0.5), P2 (-HALF-1.6, 2.3). It gets a smaller flame.
- **Hull bands:** add a thin `crew.dots` stripe at top-0.17 and a contrast waterline band at y about 0.06 on both sides of each slice. You could also add a `line` colour field to `CREWS`.
- Keep the paddles, crew seats, drum, oar, flags and wake as they are.
  - Optionally narrow `halfBeam` from 1.15 to about 1.05. First check that the rowers at ROW_X 0.55 (people are drawn at 1.4x scale) do not clip the hull.
- Rename `dragonBoat` to `raceBoat` (and fix its import and call in `_water.ts`), and change "dragon boat" in the comments to "racing boat (ngo)". No on-screen words say "dragon".

### 2. Bunting: `src/map/festival/_decor.ts` `bunting`, and the near fade
- **Pennant shape:** make each pennant a real triangle: 4 or 5 stacked boxes narrowing downward (for example widths 0.34, 0.26, 0.18, 0.10, 0.04, each 0.08 tall). Keep the `ANIM.wave` sway.
- **Height:**
  - Clamp the sag so the lowest point of the string stays at 3.5 m or more above its ends' ground. Pass a `minLow` or ground-at function; the callers in `_newyear.ts` (lines 84, 117, 120, 320) and `_water.ts` (lines 157, 370) pass heights of 3.9-4.6 m with sag 0.5-0.8.
  - Check the ground between the poles. The review shot `f_newyear` (`fest=newyear&roam=walk&at=-306,84&yaw=0&sim=_:1&rcam=0,16,12`) shows the pennants at head height, so the ground under the string may rise or the ends may be low. Sample the ground in between (for example with `g(x, z)` in `_newyear.ts`) and raise the ends.
- **Near fade:** export `addFade` from `src/map/roam/_nearFade.ts` (for example as `fadeNearMaterial(m)`), then call it on:
  - `wMesh.mesh.material` and `nMesh.mesh.material` (the kit's MeshStandardMaterial; its program key 'festival-kit' becomes 'festival-kit|near-fade');
  - `crowd.mesh.material` (the Crowd builds its own MeshStandardMaterial with key `people:festival`).

  Both have `vViewPosition` and `clipping_planes_fragment`, so the fade shader fits them. Make the call in `festival/index.ts` right after the meshes are built. **perfworld edits `index.ts` and `_kit.ts`**: re-read them before editing, and make targeted edits only. The festival part stays in `SKIP_PARTS` (walkmap.ts), so the camera never collides with it; the fade is what clears the view.

### 3. Khmer letter spacing
- `src/map/festival/_banner.ts` STYLE: add `:lang(km) .mu-fest .mu-fest-kick { letter-spacing: 0; text-transform: none; }`.
- `src/map/ui/map.css`:
  - add `:lang(km) .bk-page-group { letter-spacing: 0; }` (the rule near line 2000);
  - line ~1864 `:lang(km) :is(.bk-group h3, .bk-pass-h)` has `letter-spacing: 0.01em`: set it to 0;
  - `:lang(km) .bk-pass-intro h3` (~2062) inherits 0.03em: add `letter-spacing: 0`;
  - add `.mu-title h1` (0.01em, line 167) and minimap's `.mm-toast-text b` and `.mm-head h2` (0.01em, minimap.ts 1174 and 1191) to the `:lang(km) :is(...)` list at ~1622.
- `src/map/treasure/_hud.ts:68`: the `.tg-count` counter shows Khmer digits with 0.02em spacing. Add `:lang(km) .rh > .tg-count { letter-spacing: 0; }`.
- Not in my files, only reported: `src/map/story/story.css` has 0.06em on `.st-map figcaption span` (~314) and 0.02em on the start button (~569), with no Khmer override. The story belongs to the other session.

## How to check
- Type check and build: `npx tsc --noEmit`, `npm run build`.
- The bow up close: `@map.html?shot=1&ui=0&fest=water&t=3&parts=terrain,water,festival&cam=-527,8,0,-538,6,8`
- The race from the air: `@map.html?shot=1&ui=0&fest=water&t=52&cam=-362,34,52,-418,5,12`
- The race from the shore: `@map.html?shot=1&fest=water&t=60&roam=walk&at=-291,4&yaw=270&sim=_:1&rcam=30,10,9`
- The New Year village: `@map.html?shot=1&fest=newyear&roam=walk&at=-306,84&yaw=0&sim=_:1&rcam=0,16,12`
- The night crowd in front of the camera: `@map.html?shot=1&fest=water&night=1&roam=walk&at=-291,1&yaw=0&sim=_:1&rcam=160,14,9`
- The banner in Khmer: crop the top middle of any festival roam shot.

## Files changed
None.

## Notes
- perfworld edits `festival/_kit.ts` and `festival/index.ts` at the same time.
- `map.css` and `_nearFade.ts` are shared files: make targeted edits only.
