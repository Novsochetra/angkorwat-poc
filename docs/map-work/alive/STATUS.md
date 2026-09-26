# "Make the world map alive": status at the pause

Local work was paused to move the session to the cloud. The commit that holds
this file is a **work-in-progress** snapshot: everything built so far and the
fixes that were running, stopped at a safe point. Each fixer that was
running wrote a note in `handoff/<name>.md`: what is done, what is half
done, and how to finish it. Read those first.

- The team's shared rules: `COMMON.md`. Its scratch paths were local.
- The plan: `ROADMAP.md`.

## What is built (roadmap phases)

| Phase | Built | Where |
|---|---|---|
| 0 Kneel at shrines | Done (commit a324680) | `roam/_pray.ts`, `roam/_worship.ts` (19 spots), character `pray` action |
| 1 Jungle | Trails + 13 sites, ruins, shrines, Buddha, monk hut, woodcutters, rideable swing, bridges, pool; undergrowth, bamboo, leaf sway; jungle animals | `layout.ts`, `heightfield.ts`, `jungle/`, `veg/`, `fauna/jungle.ts` |
| 2 Sky and weather | Dawn, moving sun and moon, moon phases, shooting stars; rain, storm, lightning, thunder, rainbow, wind | `sky/*`, `atmosphere.ts`, `clouds.ts`, `audio/weather.ts` |
| 3 People | Monks, a guide with visitors, fishermen, ox cart, kites, farmers, village life, apsara dancers | `people/` |
| 4 Events | Dawn chant, dusk drum, noon bell, elephant bath, monkeys crossing | `events.ts`, `audio/temple.ts`, `fauna/_land*.ts` |
| 5 Lake | Great lake, floating village and pagoda, rice paddies through the seasons | `village/`, `paddies*` |
| 6 Balloon | A rideable hot air balloon | `roam/balloon.ts` |
| 7 Festivals | Water Festival (boat race, floats, candles), Khmer New Year | `festival/` |
| 8 Goals | Nature book and passport in the album, 15 hidden gold figures | `roam/_book*.ts`, `treasure/` |

**Sky rings:** removed at the user's request. Do not bring them back.

**Explorer's hat:** now the Khmer palm-leaf hat (`character/parts/props.ts`).
Rule from the user: Khmer culture only. Never a conical (Vietnamese) hat.

**Shared frame values:** `MapFrame` has `clock`, `day`, `season` and
`weather`, and optionally `canopy` (`types.ts`, set in `main.ts`). A part
whose `update` throws is now logged and left still; it no longer freezes the
map.

## Fixes finished before the pause

- **Roaming:** prayer hat after mode change, bad saved journal records,
  swing camera turn, Enter/Space in the album, swing in bug reports, village
  pagoda stamp, balloon Shift help.
- **Bug reports:** they now carry clock, day, season and weather.
- **Sound:** drum and bell levels, pinpeat over the map music, no drum on a
  day/night switch, muted loops stop, drum cost, no rain taps in the air,
  cicadas in rain, held flash.
- **Speed:** crowd and flock "only on change" with float32, upload ranges,
  people shadows by distance, per-frame garbage, parked balloon pose gating.
- **Khmer hat** for the explorer.

## Fixers stopped at the pause: where each one got to

Each one's note in `handoff/<name>.md` has the details.

- **fixer: done.** All 5 glider ramps are back. A tree no longer draws a
  dark cube over the lake. Kites no longer crash with `t` < 0. Wood
  footsteps work (`roam/_woodFloor.ts`). A boat waits at the village jetty.
  The ? list has a "Close by" section. Still to do: re-check the kites loop
  and stepping off at the jetty, and retake the after-shots.
- **weatherset: done** and in the code: the Weather row in the settings, the
  season-based schedule, the forced shower removed. Still to do: the live
  switch test, the click/keyboard/touch test, and phone and overview shots.
- **perfworld: done.** New `cull.ts` (`splitByPlace`, `ShadowGate`). Ruins
  and camps are split per site, the undergrowth uses a packed count, raft
  bobbing moved to the shader, the paddies' rice is one mesh per plot.
  Still to do: finish the before/after picture check (a few small diffs are
  probably other fixers').
- **lightfix, ruinsfix, peoplefix, festfix, balloonfix: NOT started.** No
  code was changed. Each note holds the full plan, with file:line and the
  shots to check.

## The original tasks of those fixers

- **fixer:** a missing glider ramp near (−283, −108), a kites crash, a dark
  cube over the lake, wood footsteps, a village jetty boat landing, the ?
  key list.
- **perfworld:** ruins culled per site, undergrowth count, village raft
  bobbing, shadow casters by distance (village, festival, camps, paddies).
- **weatherset:** a Weather choice in settings (Follow the season, Always
  clear, Rainy, Stormy). "Follow the season" gives rain in the wet season
  and dry December–April. This was the user's request.
- **lightfix:** dark forest floor, rain streaks from the overview, south
  lake edge strip, rainbow placement.
- **ruinsfix:** forest Buddha's face (it reads as a skull), blue laterite,
  candle halo too bright.
- **peoplefix:** rice planters clumping, fisherman's krama.
- **festfix:** Khmer ngo boat bow (not a dragon), New Year pennants and near
  fade, Khmer letter-spacing.
- **balloonfix:** the balloon lies deflated until ridden, then inflates.
  This was the lead's decision after the review.

## Still open after those

- **Khmer words the user should check** (asked, no answer yet):
  - giant ibis ត្រយ៉ង (ត្រយ៉ងយក្ស?)
  - hornbill កេងកង (កេងកងធំ?)
  - skink ជីងចក់ស្បែករលោង
  - egret ក្រសាស
  - whip snake ពស់ខៀវ
  - white ox គោ (គោស?)
  - spirit house រានអ្នកតា (ខ្ទមព្រះភូមិ?)
  - waterfall pool ត្រពាំងក្រោមទឹកធ្លាក់ (អន្លង់?)
  - burner line ខ្សែភ្លើង
  - burner បាញ់ភ្លើង
  - swing អង្គុយយោលលេង (លេងទោង?)
- **Speed leftovers:**
  - `launchRamp` flag uploads 12 KB/frame and the boat wake 7.7 KB/frame,
    even in the overview.
  - Crowd buffers need update ranges.
  - Per-frame garbage in `_sceneKites.fly`, `_sceneCart.blocked`,
    `_tour.ts:280` and `fauna/land.ts` (`live`, `calls`).
  - `Math.hypot` on hot paths.
  - Bells run 16 oscillators with long tails.
  - Optional: `renderer.compileAsync` before the first frame.
- **Small review items:**
  - A stale prompt after `goldfound=`.
  - Balloon report during the hop.
  - E enters the temple while he kneels at the Angkor Wat and River Gate
    spots.
  - Water birds on the lake, egrets in flooded paddies.
  - Birds and people should react to `EVENTS.shelter` / `umbrellas` /
    `hurry`.
  - Rain rings on the moat (`RAIN_RINGS_GLSL`).
  - Festival crowd and pool lotus as nature-book subjects.
  - Mini-map paddy colour by season.
  - The monk hut ladder.
  - The album's own words are English only (`src/game/Photos.ts`).
- **Docs:** fold every new part and URL param into `docs/map-work/BRIEF.md`
  and `CLAUDE.md`. Several builders already added their sections; check for
  gaps and the removed rings.
- **Final checks:** `npx tsc --noEmit`, `npm run build`, `npm run playtest`,
  the overview `m="@map.html?shot=1"` at 1672×941 (day, `night=1`,
  `clock=0.75`), a walk at each area. Then commit, only when the user asks.

## Not ours in the working tree

- The world kit work (`src/kit/*`, `docs/kit-work/*`, `scripts/kit-*`).
- The "Angkor Quest → Angkor Heritage (មរតកអង្គរ)" rename (`*.html`,
  `package.json`, `README.md`, `src/game/*`, `src/viewer/main.ts`).
- The story (`src/map/story/`).

Other sessions made these. The user decides what to do with them.
