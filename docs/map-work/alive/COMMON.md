> Copied from the local session. Scratch paths below (/private/tmp/…/scratchpad/alive/<name>/) were local and are NOT in the repo: in the cloud use your own scratch folder. Screenshots from the local run are not kept.

# Make the world map alive — common brief for every builder

Project: `/Users/sochetranov/Documents/workspace/personal/angkorwat-poc`.
We are adding life to the world map screen (`map.html`, code in `src/map/`).
The full roadmap (phases 1–8) is `ROADMAP.md` next to this file. You build ONE
piece of it (your prompt says which). Several builders work AT THE SAME TIME,
each on their own files, and another Claude session may also edit map files.

## Read first
1. `CLAUDE.md` (project notes) and `docs/map-work/BRIEF.md` (how the map is built:
   parts, budgets, voxels, checks, roaming). Follow it.
2. The target look: `assets/world-map-selection-screen/*.png` (golden hour and
   moonlit night). The feeling: **calm, warm, slow, deep**. Nothing moves fast;
   light is soft; things belong in real Cambodia (Angkor, Khmer life, real
   animals and plants). Be culturally accurate and respectful (monks, Buddha,
   apsara, festivals). Look at the pictures before you start and before you finish.
3. The code your piece touches, and the patterns it should reuse (named in your prompt).
4. **Khmer, not neighbours** (the user checks this): hats are the Khmer palm-leaf hat
   (មួកស្លឹកត្នោត: flat-topped round crown with straight sides, wide flat brim, natural
   straw colour, red binding on the brim edge and a red band round the crown) or a krama —
   NEVER the pointed conical hat (that is Vietnamese). Likewise use Khmer dress, script,
   architecture, boats, music and customs, not Thai/Vietnamese/Chinese look-alikes.

## Contracts already in the code (use them, do not rename)
- `MapFrame` (`src/map/types.ts`) now has:
  - `clock` 0‥1 wraps: 0 golden afternoon, 0.25 dusk, 0.5 middle of the night,
    0.75 dawn. `night` = 0.5 − 0.5·cos(2π·clock). URL `clock=0‥1` holds it
    (else from `night=`, on the dusk side). Default page: `settings.time` day.
  - `day`: days since a new moon (real date on the page; `day=` in shots, default 0).
  - `weather: MapWeather` = `{ wind, windDir, cloud, rain, storm, flash, rainbow }`,
    all 0‥1 (windDir radians: blows toward (sin, cos) in x, z). `CALM_WEATHER`.
    Set every frame by `src/map/sky/weather.ts` before the parts' `update`.
    URL `weather=clear|rain|storm|rainbow`, `wind=0‥1` hold it.
  - `season` 0‥1 = time of the year (0 mid-April Khmer New Year, ~0.1 rains start /
    planting, 0.3–0.55 green rice, ~0.58 Water Festival, 0.6–0.75 golden rice and
    harvest, 0.8–1 dry stubble). Real date, moving a year per 24 clock-days. URL `season=`;
    shots default 0.45.
  - `weather` also has `wet` (land wetness) and `flashAt/flashX/flashZ` (last lightning).
- A part: `MapPart { name, object, update?(f), blocks?, highlight?, afterRender? }`.
- Roaming: `src/map/roam/*` (walker, tools, hangGlider as patterns).
- Animal calls: push `{ kind, x, y, z, gain }` into `f.calls` in `update`
  (`AnimalCallKind` in types.ts; sounds in `src/map/audio/animals.ts`).
- Words on screen: `src/map/ui/lang.ts`, Khmer first, English second (every key both).

## Layout from wave 1 (read `src/map/layout.ts`)
`TRAILS` (5 dirt trails; samples in `field.trails`), `JUNGLE_SITES` (13 sites: id, kind,
x, z, facing, r — cleared, flattened, occupied), `LAKES` (great lake at (−490, 22), level 5),
`VILLAGE` (shore line + floating-house water), `PADDIES` (10 plots, `SURFACE.paddy`),
`RACE_COURSE`. Plan picture: `scratchpad/alive/layout/final_plan.png`. The hot air balloon
home field is at (−32, −64) (roam/balloon.ts) — keep off it.

## Adding a new part
- Add ONE line to `BUILDERS` in `src/map/main.ts` at the place your prompt says
  (re-read the list right before the edit; others add lines too).
- If your part is not solid ground to walk on (people, animals, plants you walk
  through, rain, particles, glows), add its name to `SKIP_PARTS` in
  `src/map/roam/walkmap.ts`. Solid voxel builds (ruins, huts, houses) stay solid.
- Static voxel parts (never move) may be added to the `skipBackFacets` list in
  main.ts only if the prompt says so.
- Landmarks and roads call `field.occupy(...)` for ground they cover so trees keep
  off; parts built before `vegetation` can do the same.

## Rules (from the brief — they matter)
- Budgets: terrain ≤ 260k blocks, vegetation ≤ 150k, each landmark-like part
  ≤ 20k, road ≤ 20k. Animal/people parts: ≤ 6 draw calls, < 1 ms CPU a frame,
  one InstancedMesh per kind posed in the vertex shader, only near ones updated.
  Each part builds in < ~600 ms. 60 fps on an M1 Max.
- The number of lights in the scene must NEVER change (shader recompiles): no
  new PointLight/SpotLight unless your prompt allows exactly one, always in
  the scene. Night lights = glow materials above 1.0 + bloom.
- Seeded builds: `hash3` etc. from `src/voxel/random.ts`, never `Math.random()`.
- `VoxelBuilder` loops: one `traceSource()` per builder function (see brief).
- Custom ShaderMaterials: `fog: true` + three's fog chunks. Compile new shaders at
  load (keep the mesh in the scene, hidden via uniform/opacity 0, not `visible=false`
  that skips compile) so nothing stutters the first time it shows.
- Kit families with pixel patterns are too fine for the map (see brief).
- Do not edit `src/voxel/materials.ts`.

## Working in a shared tree (IMPORTANT)
- Edit only the files your prompt gives you. For files you share (main.ts,
  types.ts, walkmap.ts, lang.ts, audio/*, roam.ts…): targeted `Edit`s only,
  re-read the region right before each edit, never rewrite a whole existing file,
  never revert or reformat code you did not write.
- No git commands that change anything (no add/commit/stash/checkout/reset).
  `git diff`/`status`/`log` are fine.
- Type check: `npx tsc --noEmit 2>&1 | grep -E "<your paths>"`. Others' files may
  show errors while they work: ignore those, fix yours. Do not "fix" others' code.
- Scratch files and screenshots ONLY in your own scratch folder:
  `/private/tmp/claude-501/-Users-sochetranov-Documents-workspace-personal-angkorwat-poc/03e8c571-14a6-4013-add3-46c1a80f0437/scratchpad/alive/<your-name>/`
  Never leave debug files or console logs in the repo.

## Seeing your work (do it often; judge the pictures honestly)
`SHOT_OUT=<your scratch folder> SHOT_W=1672 SHOT_H=941 npm run shots -- a="@map.html?shot=1&<params>" b="@map.html?…"`
(several name="@…" pairs in one run are faster; one run ≈ 20–40 s; the machine is
shared by many builders, so batch shots and do not re-run needlessly). View every
PNG with the Read tool.
- Overview: `m="@map.html?shot=1"` — take it before you start and at the end:
  the picker view must stay beautiful and uncluttered (compare with the concept art).
- Params: `night=1`, `clock=0.75` (dawn), `t=<s>`, `focus=<place>`, `ui=0`,
  `parts=terrain,<yours>` (only those parts: fast), `cam=x,y,z,tx,ty,tz`, `lang=en`,
  `weather=rain|storm|rainbow`, `wind=`, `day=`.
- Roaming: `roam=walk|boat|hang&at=x,z(or x,y,z)&yaw=<deg, 0=south>&sim=<keys:s,…>&rcam=yaw,pitch,dist`
  (`sim=_:3` = stand still 3 s; `w:2` walk 2 s; see `parseScript` in roam/input.ts).
- The console line `[map] built in … · blocks {…}` (printed by the shots) gives
  your part's build time and blocks; `FAILED:` names broken parts.
- For logic you cannot see in a still, write a throwaway Playwright script in your
  scratch folder (see `scripts/screenshots.mjs`); a live page renders < 1 fps on this
  machine, so drive logic by calling `window.roam.update(frame)` / part updates in a
  loop from `page.evaluate` instead of waiting on real frames.

## Finish
- `npx tsc --noEmit` clean for your files; `npm run build` passes (if it fails only
  in someone else's file, say so).
- Before/after overview shots; your best 4–8 shots of your piece (day, night, close).
- Report (short): what you built, files (new / changed, with the functions), blocks,
  build ms, draw calls, new URL params and words, anything you could not do or that
  another piece must do, and your screenshot paths.

## Tips from the other session (they own the story and earlier roaming work)
- `roam/_nearFade.ts`: the follow camera dissolves leaves, bark and parked gliders
  near it (installed from roam.ts). The camera has walk maps too:
  `world.hardClearance` / `softClearance` (built in world.ts from walkmap.ts `kind`).
  A new tree-like / see-through part belongs in the SOFT map.
- Sound buses: master, music, ambience, water, animals, steps, moves, ui
  (`VOLUME_KEYS` in types.ts). New explorer sounds go through `roamBus` in
  audio/explorer.ts; new animal calls go on the animals bus.
- Roaming words: lang.ts `r…` keys. The Jump-in card: roam/hud.ts, `roam.start(kind)`.
- `roam/prefs.ts` (easyFly), `roam/_flag.ts` (flag texture helpers).

## Built in waves 1–2 (read the code before you use it)
- People (`src/map/people/`): one InstancedMesh crowd posed in the vertex shader.
  `_personModel.ts` / `_kinds.ts` / `_actor.ts` (header comments explain: `dress(kind, seed)`
  for monk, visitor, guide, kid, fisherman, dancer; `POSE` stand/look/point/photo/sweep/sit/
  sampeah/bow/talk/wave/dance/cast/kneel + gait; `CARRY` umbrella/flag/torch/broom/bowl/net/
  kite/phone; `FEAT`; `crowd.add/place/gait/pose/carry/flush`, `handAt`, `castPhase`;
  `Actor.warp/goTo/face/pose/lookAt/avoid/step`, `keepApart`). Routes: `_routes.ts`
  (`RoadGraph.route/road/beacon`, `Route.at/extend`, `Ground`, `Traffic.lane/dodge`).
  A scene implements `PeopleScene` in `people/index.ts`. People are drawn at `ROAM_SCALE` 1.4.
  URL: `people=lineup|0`, `monks=<m>`, `tour=<place>[:<s>]`.
- Jungle animals: part `jungleFauna` (`src/map/fauna/jungle.ts`, `_jungle*.ts`), `fauna=jungle`
  lineup, `MapFrame.canopy` (leaf cover over the explorer).
- Plants: part `undergrowth` (`veg/undergrowth.ts`), bamboo species, leaf sway (`veg/sway.ts`).
- Sky: DAWN palette, moving sun/moon, moon phases (`day`), shooting stars (`sky/stars.ts`).
- Weather: `sky/weather.ts` schedule (first shower ~2.5 min, then every 9–12 min; storms
  later; rainbows), parts `rain` + `rainbow`, `audio/weather.ts`; `RAIN_RINGS_GLSL` in
  `sky/rain.ts` for water shaders. URL: `weather=clear|rain|storm|rainbow|auto`, `wind=`,
  `cloud=`, `rain=`, `storm=`, `rainbow=`, `wet=`, `flash=1`.
- Hot air balloon: mode `balloon` (`roam/balloon.ts`), home (−32, −64).
- Being built now (re-read before relying on them): part `jungle` (ruins, shrines, Buddha:
  `src/map/jungle/ruins.ts`), part `camps` (monk hut, woodcutters, swing, bridges, pool:
  `src/map/jungle/camps.ts`), part `village` (stilt + floating houses, pagoda:
  `src/map/village/`, exported spots), part `paddies` (`src/map/paddies.ts`).
