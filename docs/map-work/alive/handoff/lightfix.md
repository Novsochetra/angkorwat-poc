# Handoff: lightfix (light and weather look fixes on the world map)

Task: 4 look fixes from the visual review: (1) the forest floor is too dark when roaming under trees by day, (2) the far rain in the overview looks like long bright scratches on the lens, (3) a streaky "barcode" strip shows on the horizon across the great lake, south side, (4) the rainbow sits mostly behind the title card in the overview.

## Done
- Nothing in the code yet. I stopped during the investigation. **No file was changed by lightfix.** The diffs in palette.ts, atmosphere.ts, species.ts, heightfield.ts, mist.ts, rain.ts and rainbow.ts are from earlier builders.
- I stopped my "before" shot run. Its pictures were in the scratch folder, which does not move to the cloud.

## Not done: how I would finish each fix

### 1. Dark forest floor (`src/map/atmosphere.ts` `update`, `src/map/veg/species.ts`)
- The review measured a lower-screen brightness of about 35 under the canopy and 99–108 in the open. Target: 60–75, still shady.
- `f.canopy` (0‥1) is set by `src/map/fauna/jungle.ts` `cover` (about line 310). It is only non-zero for `f.roam` walk or boat, and it is already eased (1.5 s). The atmosphere updates first in each frame, so it reads the previous frame's value. That is fine. In shots, `dt` = 0 snaps it.
- Plan: in `atmosphere.ts` `update`, just after `key.shadow.intensity = s.shadow` (line 141), keep a second eased value `c` (time constant about 2.5 s; snap when `dt` = 0) of `f.canopy ?? 0`. Then:
  - `key.shadow.intensity = s.shadow * (1 - 0.4 * c)`
  - `fill.intensity = s.fillIntensity * (1 + 0.5 * c)`
  - Maybe use about half of this at night (scale `c` by `1 - 0.5 * s.night`).
  This adds no light. The overview is not affected, because canopy is 0 there. My estimate is that this alone gives about 50, not 60–75. If so, also add a small eye-adaptation exposure lift under leaves: `SKY.exposure *= 1 + 0.1 * c`. Exposure is read by post.ts, so set it on `SKY` after `updateSky`.
- Bark: `trunk()` in species.ts (line 44) darkens down to `shade 1.02 - 0.25·t`. The tones come from `BARK_TONES` in `src/kit/palette.ts`, which is shared with the kit, so do not edit it there. Lift them on the map only: for example `shade` 1.12 − 0.2·t in `trunk()` and 1.05 in `roots()`, so trunks read as brown wood. Check `vegetation` blocks in the `[map]` line (≤ 150k). The block count does not change.
- Optional light patches under crown gaps: skipped. It is not cheap without a new shader.

### 2. Far rain in the overview (`src/map/sky/rain.ts` `LAYERS`, line 35)
- The far layer is `{ box: 1100, len: 15, width: 0.12, alpha: 0.4, share: 0.3 }`. The shader keeps a drop at least 1 px wide and 3 px long, so the far streaks become long 1-px lines (the "scratches").
- Plan: far layer `len` about 5, `width` about 0.06, `alpha` about 0.2, `share` about 0.45. Take the extra share from the middle layer (0.28 → about 0.13) and keep the near layer (0.42) as it is. For a softer veil, the fragment could also fade the far layer by distance. Check `w_storm`, `ov_rain` and `w_rainwalk`: the near rain on foot must look the same.

### 3. Barcode strip south of the great lake (`src/map/heightfield.ts` `edgeFall`, line 247)
- `LAKES[0]` is at (−490, 22) with rz 78, so the water ends at z ≈ 100. `MAP_BOUNDS.z1` = 120. That leaves a 20 m strip of land at the south (front) edge, and `edgeFall` never sinks the front edge. From the lake shrine you see it edge-on through the haze as the strip.
- Plan: in `edgeFall`, also count the south edge (`MAP_BOUNDS.z1 - z`), but only west of the village and paddies (fade it in for x < about −345, fully by −380). The village shore starts near x −290…−352 and z 30–85, the paddies are at x −290…−180, and the kites are at (−240, 112): keep all of these. Use a short fall (about 60 m) so only the strip past the lake sinks. The haze swallow in `src/map/sky/haze.ts` `hazeInside` and the fog chunk "Where the land sinks away…" only know the west, east and north edges. If the sunken strip still shows, extend `hazeInside` to the south edge for x < −345 (haze.ts belongs to no other fixer, as far as I know). The other choice is to extend the lake south to the edge, the way it runs off the west edge.
- Check: the `[map] launch spots: 5 (…)` line (5 ramps), `v_village`, the `j_lakeshrine` shot and the overview (the south edge is under the overview camera, so check it pixel-wise).

### 4. Rainbow behind the title card (`src/map/sky/rainbow.ts` `update`, line 152)
- The bow is centred opposite `SKY.keyDir`. That is the key-light cheat: from the east-south-east, 25° up. So its top stands about 17° up, and only its right leg crosses the overview's thin band of sky (about 8° above the horizon), mostly behind the card.
- Plan (still physically plausible): centre it opposite the key light's bearing, but at the real sun's low height (about 2°, `SUN_E` in palette.ts) instead of the key's 25°. A low sun makes a tall, almost upright bow. Its right leg moves about 7–14° to the right into the open sky between the title card and the Angkor Wat card. Build `anti` from `bearingOf(keyDir)` + 180° and elevation −max(sunEl, 2°). The overview camera never sees the apex. The visible sun disc in the overview is in front of the camera, so no real bow could be in that view: the key light is the reference that matches the shading.

## How to check
- Overview (must stay the same except the rain and rainbow shots): `SHOT_W=1672 SHOT_H=941 npm run shots -- m="@map.html?shot=1"`. Compare it pixel-wise before and after.
- Forest: `j_spirit=@map.html?shot=1&roam=walk&sim=_:1&at=-124.6,82&yaw=6&rcam=20,8,7`, `j_wall=…&at=-132,-236.9&yaw=84&rcam=0,12,9`, `j_bridge=…&at=-390,-168&yaw=50&rcam=0,14,10`, `w_rainwalk=@map.html?shot=1&weather=rain&roam=walk&at=-200,-20&yaw=180&sim=_:1&rcam=0,10,8`. Measure the mean grey of the lower screen (rows 50–88 %, away from the HUD).
- Rain: `w_storm=@map.html?shot=1&weather=storm&flash=1`, `ov_rain=@map.html?shot=1&weather=rain`.
- Rainbow: `w_rainbow=@map.html?shot=1&weather=rainbow`.
- Edge: `j_lakeshrine=@map.html?shot=1&roam=walk&sim=_:1&at=-437.1,-72.7&yaw=341&rcam=20,10,8`.
- Animals under trees: find the sounders with `window.__jungle.agents` (fauna/jungle.ts line 176) and take roam=walk shots there. `fauna=jungle` with a fixed `cam` is overview mode, so there is no canopy lift in it.

## Files changed
- None, apart from this note.

## Must know
- Other fixers are working now on: jungle/ruins.ts, veg/undergrowth.ts, village, the festival kit, paddies culling (perfworld) and sky/weather.ts (weatherset, soundfix). None of the fixes above needs their files.
- Do not change the number of lights (shader recompiles). All of fix 1 is intensity and uniform changes.
