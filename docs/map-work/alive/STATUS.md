# "Make the world map alive": status

The work paused locally (commit e3bfb96) and was finished in the cloud: the
fixers that had stopped, the speed leftovers and the small review items are
all done. The notes in `handoff/<name>.md` are kept as history (their "not
started" wording is from the pause: every one of them is done now).

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

## Done

**Before the pause:**

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

**In the cloud (the fixers, `handoff/`):**

- **fixer:** all 5 glider ramps are back, no dark cube over the lake, no
  kites crash with `t` < 0, wood footsteps (`roam/_woodFloor.ts`), a boat
  waits at the village jetty, the ? list has a "Close by" section.
- **perfworld:** `cull.ts` (`splitByPlace`, `ShadowGate`): ruins and camps
  per site, packed undergrowth, raft bobbing in the shader, one rice mesh
  per plot.
- **weatherset:** the Weather row in the settings, the season-based
  schedule, no forced shower. The last live-switch / touch / phone check is
  the lead's final check.
- **lightfix:** forest floor, rain streaks from the overview, the south lake
  edge, the rainbow's place.
- **ruinsfix:** the forest Buddha's face, the laterite colour, the candle
  halo.
- **peoplefix:** rice planters spread out, the fisherman's krama.
- **festfix:** Khmer ngo racing boats (never a dragon), New Year pennants and
  near fade, Khmer letter-spacing.
- **balloonfix:** the balloon lies deflated until ridden; the fan fills it,
  then the burner stands it up (`balloon=parked|inflate:<s>|up`).

**Speed leftovers:**

- Ramp flags: off-screen and far flags are throttled (a near, visible flag
  still uploads each frame).
- The boat wake, crowd buffer update ranges, per-frame garbage
  (`_sceneKites`, `_sceneCart`, `_tour`, `fauna/land.ts`), `Math.hypot` on
  hot paths (`fauna/_len.ts`), fewer bell oscillators.
- `renderer.compileAsync` before the first frame (`[map] shaders compiled
  in N ms`).

**Small review items:**

- No stale prompt after `goldfound=`; the balloon hop replays in a bug
  report; E no longer enters the temple while he kneels.
- Water birds on the lake and egrets in flooded paddies
  (`fauna/_waterLake.ts`).
- In rain birds stay perched (`birdShelter`) and people open umbrellas and
  hurry; `EVENTS.festival` comes from `festival/_schedule.ts festivalNow`.
- Rain rings on Angkor Wat's moat.
- The festival crowd and the lotus in the nature book.
- The mini-map's paddies take their colour from `season=`
  (`ui/_minimapPaddies.ts`).
- The monk hut's ladder; the album's own words in Khmer (`al…` in
  `ui/lang.ts`).
- Docs: `docs/map-work/BRIEF.md` and `CLAUDE.md` cover every part and URL
  param; the sky rings are gone and not mentioned as present.

## Still open

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
  - balloon inflating (`rInflating`) កំពុងបំប៉ោងបាឡុង · W ឲ្យលឿន · Esc ឈប់
  - lotus ផ្កាឈូក
  - festival crowd អ្នកចូលរួមពិធីបុណ្យ
  - the album's words (`al…` keys in `ui/lang.ts`)
- People do not yet go under cover in a storm (`EVENTS.shelter`).
- Album photos keep their place names in English only.
- The main game's viewfinder hints are English only.
- `story.css` letter-spacing on Khmer (the story is another session's file).
- `audio/water.ts` `listenFalls` sorts every frame.
- Within 2.3 m of the jetty boat the golden hamsa takes E first.
- A jetty plank seam reads as water in the walk map.
- `roam=walk&at=-236,45` gives an upside-down camera (was there before;
  only at that spot).
- The vegetation build is ≈ 720 ms, over the 600 ms budget; people CPU
  against its budget to re-measure on real hardware.
- **Final checks:** `npx tsc --noEmit`, `npm run build`, `npm run playtest`,
  the overview `m="@index.html?shot=1"` at 1672×941 (day, `night=1`,
  `clock=0.75`), a walk at each area. Then commit, only when the user asks.

## Not ours in the working tree

- The world kit work (`src/kit/*`, `docs/kit-work/*`, `scripts/kit-*`).
- The "Angkor Quest → Angkor Heritage (មរតកអង្គរ)" rename (`*.html`,
  `package.json`, `README.md`, `src/game/*`, `src/viewer/main.ts`).
- The story (`src/map/story/`).

Other sessions made these. The user decides what to do with them.
