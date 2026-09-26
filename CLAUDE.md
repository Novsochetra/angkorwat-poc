# Angkor Heritage — notes for Claude

- Checks: `npm run typecheck`, `npm run build`, `npm run playtest` (headless play test).
- `npm run shots -- name="@index.html?shot=1&…"` renders a page headlessly into
  `screenshots/<name>.png`; view the PNG to check visual changes.
- Scale: 1 unit = 1 m; shared sizes live in `src/world/scale.ts`.

## World kit (component plan sections 18–20)

Voxel assets for the temple environment: one module per numbered component of
the reference sheets in `assets/angkor detail/`. The guide is `docs/world-kit.md`,
and the asset brief (conventions, API, real-world sizes) is `docs/kit-work/BRIEF.md`.

- Assets: `src/kit/assets/<section>/<slug>.ts`, default export
  `defineKitAsset({…})`. Files starting with `_` are helpers. Shared builders
  live in `src/kit/lib/`. Dioramas are in `src/kit/scenes/<slug>.ts`.
- Look at an asset beside its sheet crop with
  `npm run shots -- a="@studio.html?asset=18.1/large-tree&shot=1"`, and a whole
  section with `@studio.html?section=20&shot=1&refs=1` (add `&examples=1` for its
  scenes). Walk it at true scale with `index.html?level=kit`.
- Colours: sample the sheet (`python3 docs/kit-work/measure.py`) and wrap the
  colour in `fromSheet()`. Sizes are real-world; record the sheet's estimate in
  the asset's `size` field. Refresh the docs table with
  `node scripts/kit-sizes.mjs --write`.
- Checks: `npm run kitcheck` builds every variant and reports errors, block
  budgets and build times.
- Studio bug reports (**B**) name the asset line that made each block, the same
  way world blocks name their `WorldBuilder` caller.
- The block look panel (**K**, `src/voxel/LookPanel.ts`) tweaks block families
  live. A pasted "Block look changes" snippet lists new values per family:
  write them into `VOXEL_MATERIALS` in `src/voxel/materials.ts`. A "Lights"
  snippet names lights by their `name` (set in `src/game/main.ts` and
  `src/studio/Stage.ts`).

## Bug reports in `feedback/`

The user reports bugs and ideas from inside the game or viewer (**B** / 🐞 button).
Each report is a folder `feedback/<date>-<slug>/` with `report.md` and
`screenshot.jpg`. When asked to "check the feedback", or when a report is pasted
into the chat:

1. Read `report.md` and view `screenshot.jpg`; numbered pins mark the picks.
   Notes can be in any language.
2. Each pick lists the **Code** that created it, innermost call first. For world
   blocks that is `WorldBuilder.block` → the line that called it (e.g.
   `gateHall` in `AngkorScaleWorld.ts`). The report also lists the **Collider**
   boxes at the point and who added them. Start there. Explorer picks give the
   slot, joint and block position in body units (part space). A **box** / **loop**
   pick covers every block seen inside it, grouped by the code that made them,
   the group filling most of the area first.
3. Reproduce with the report's headless command
   (`npm run shots -- repro="@index.html?shot=1&at=…&cam=…"`), fix, and re-run it
   to compare. Then run the checks.
4. Delete the report's folder in the commit that fixes it, and name the report
   in the commit message.

## World map screen (`map.html`)

The expedition picker: a voxel diorama of the Angkor highlands (Angkor Wat,
Bayon, Preah Khan, Ta Prohm, Phnom Kulen, River Gate) with pin cards, sound
and day/night. Code in `src/map/`; the guide for its parts (API, budgets,
checks, which file does what) is `docs/map-work/BRIEF.md`. Target look:
`assets/world-map-selection-screen/` and `assets/2B06F1FD-531A-4ED7-9C2E-7044E141F122.PNG`.

- Where things are (places, mesas, rivers, roads, cameras): `src/map/layout.ts`.
- Words: Khmer first, English on the ខ្មែរ / EN switch (top right, kept with
  the settings). The word list is `src/map/ui/lang.ts`; place texts are in
  `layout.ts` (`km`). Add `lang=en` to a shot for English.
- Look at it: `npm run shots -- m="@map.html?shot=1"` (1672×941 with
  `SHOT_W=1672 SHOT_H=941`); add `night=1`, `focus=<place>`, `ui=0`,
  `parts=terrain,water` (only those parts), `uistate=hover:<place>`,
  `loading=0‥1` (hold the loading screen there: Angkor Wat `ui/_loadTemple.ts`,
  the explorer below the bar `ui/_loadHero.ts`; nothing is built).
- The console line `[map] built in …` lists build times and blocks per part,
  and names any part that failed (the rest of the map still loads);
  `[map] shaders compiled in N ms` follows. `window.__frame` is the live
  frame. Parts spread over the map cull per place (`src/map/cull.ts`).
- Roaming (Jump in: pick parachute or hang glider, then walk, boat, hang
  glider from cliff-top ramps; Q / R or a drag orbits the camera):
  `src/map/roam/`. Easy flying (glider holds its height, S climbs, W dives)
  is a setting (`roam/prefs.ts`); the Cambodian flag helper is `roam/_flag.ts`.
  A hot air balloon lies deflated on its field below Angkor Wat
  (`roam/balloon.ts`: E rides it, the fan fills it, then the burner stands
  it up; W / Space burner, S vent, E lands and steps out;
  `balloon=parked|inflate:<s>|up` in shots).
  Check it with `roam=leap|glide|walk|boat|hang|balloon&at=x,z&yaw=<deg>&sim=w:2,wr:3`
  (scripted keys run before the shot) and `rcam=yaw,pitch,dist`.
  On foot he has tools (1–5: lantern, torch, flashlight, camera, selfie with
  a selfie stick (T); `tool=`, `stick=` in shots; camera and selfie also in
  the boat and on the glider), emotes and photos (`roam/tools.ts`, `roam/photo.ts`),
  kneels to pray when he stands still at a shrine (`roam/_pray.ts`, spots in
  `roam/_worship.ts`; `act=pray`, `kneelat=x,z,fx,fz` in shots),
  and a mini-map (`src/map/ui/minimap.ts`, M for the big map, N the nearest
  glider ramp).
- Sound: one volume per bus in the settings (`VOLUME_KEYS` in `src/map/types.ts`);
  footsteps are the recordings in `assets/sound/` (`src/map/audio/footsteps.ts`).
- Graphics is a setting (low, medium, high, max: what each draws is in
  `src/map/graphics.ts`; it changes live); add `graphics=<level>` to a shot.
- Weather is a setting too (by season — dry December–April —, clear, rainy,
  stormy): the schedule is `src/map/sky/weather.ts`. Shots are calm; add
  `weather=season|rainy|stormy&t=<s>` (with `season=`) for a schedule, or
  `weather=rain|storm|rainbow` to hold one.
- Animals: land (`src/map/fauna/land.ts`) and water / air
  (`src/map/fauna/waterAir.ts`, lake and paddy birds `_waterLake.ts`); their
  calls go through `MapFrame.calls` to `src/map/audio/animals.ts`. In rain
  birds stay perched and people open umbrellas and hurry (`src/map/events.ts`).
- Rice paddies by the great lake follow the year (`season=0‥1`, also their
  colour on the mini-map): the stages are in `src/map/paddies/stages.ts`,
  the part in `src/map/paddies.ts`.
- The jungle: trails to 13 hidden sites (`JUNGLE_SITES` in `layout.ts`):
  ruins and shrines (`src/map/jungle/ruins.ts`), the monk's hut,
  woodcutters, swing, bridges, pool (`jungle/camps.ts`), undergrowth
  (`veg/undergrowth.ts`) and jungle animals (`fauna/jungle.ts`,
  `fauna=jungle` lines them up).
- Festivals (`src/map/festival/`, when `festival/_schedule.ts` says, or
  `fest=water|newyear`): the Water Festival with Khmer ngo racing boats
  (never dragon boats), and Khmer New Year.
- The album (V) also holds the nature book and the temple passport
  (`roam/_book*.ts`; `album=book|passport`, `book=all`, `stamps=all`);
  hidden gold figures are in `src/map/treasure/`.
- The floating village on the great lake (stilt houses, floating houses, the
  jetty, the pagoda): `src/map/village/`; where everything stands (and
  `VILLAGE_SPOTS` for people and festivals) is `src/map/village/_spots.ts`.
- People (`src/map/people/`): monks, a tour group, fishermen, an ox cart,
  kite-flying children, farmers by the season, village life, apsara dancers
  at night; `people=lineup|0|<scene>,…`, `fish=`, `cart=` in shots. Hats are
  the Khmer palm-leaf hat or a krama (never a conical hat).
