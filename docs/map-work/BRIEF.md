# World map screen — brief for every part

The world map screen (`index.html`, code in `src/map/`) is where the player picks
the next expedition. Target look: the concept art in
`assets/world-map-selection-screen/` — `…01_48_18 PM.png` (golden hour) and
`…01_51_11 PM.png` (moonlit night). Look at both pictures before you start,
and again before you finish. The feeling to hit: **calm, warm, slow, deep**.
Nothing moves fast. Light is soft. Mist lies between the mesas. Far hills fade
into haze. The screen should be nice to just watch.

The places are real Angkor temples: **Angkor Wat** (the summit), **Bayon**
(the stone faces, west cliffs), **Preah Khan** (the silent ruins), **Ta Prohm**
(the lost gardens, east hills), **Phnom Kulen** (the mountain temple) and the
**River Gate**. How each temple should look: `assets/2B06F1FD-531A-4ED7-9C2E-7044E141F122.PNG`
(Angkor Wat ≈ (560, 210, 960, 470) px, Bayon ≈ (180, 230, 460, 430), Ta Prohm
≈ (1050, 250, 1390, 440), Preah Khan ≈ (590, 670, 990, 900), Phnom Bakheng —
the look for Phnom Kulen — ≈ (1150, 570, 1400, 760)).

## How the page is built

- `src/map/main.ts` builds the parts in order and runs the frame loop. Each part
  is its own module, loaded with a dynamic import: a part that fails is logged
  (`[map] part "x" failed`) and left out, the rest still runs.
- `src/map/types.ts`: `MapContext` (scene, renderer, camera, `field`, quality,
  `shot`), `MapFrame` (`t`, `dt`, `night` 0‥1, `clock`, `day`, `season`,
  `weather`, `camera`, `lightDir`, `listener`, `roam` mode, `roamLevels`,
  `calls`, optional `canopy`), `MapPart` (`name`, `object`, optional
  `update(f)`, `blocks`, `highlight`, `afterRender`, `subjects` for the
  nature book). A part whose `update` throws is logged and left still; the
  map runs on.
- `src/map/layout.ts`: where everything is — places (`PLACES`: pad centre, pad
  size, `anchor` beacon point, card offset, focus camera), mesas (`PLATEAUS`;
  a `bench` is cut into the land), `RIVERS` (a point's third number: the width
  there), road `PATHS`, the explorer's ledge, the overview camera, the map's
  size (`MAP_BOUNDS`, see "The map's size and the Kulen falls").
  **Do not change `layout.ts`**; if you need a change, say it in your report.
- `src/map/heightfield.ts`: the land as 2 m columns (`CELL = 2`). Use
  `ctx.field`: `heightAt(x, z)` (ground top), `waterAt(x, z)`, `standY`,
  `surfaceAt` (`SURFACE.grass/rock/dirt/sand/path/pad/bed`), `dropAt` (cliff
  lip), `isFree(x, z)` (open ground for trees), `occupy(x0, z0, x1, z1)` (mark
  ground you built on), `falls` (every waterfall: lip point, top/bottom level,
  width, flow dir), `rivers` (samples every metre with level, width, dir),
  `paths` (road samples every metre with ground `y` and `wet` over water).
  Only the terrain pass may edit `heightfield.ts`.
- Build order (`BUILDERS` in main.ts): atmosphere → terrain → the six
  landmarks → path → jungle → camps → water → village → paddies → hamlet
  (the settled places, each piece loaded on its own) → vegetation →
  undergrowth → clouds → rain → snow → rainbow → life → fauna → wildlife →
  jungleFauna → people → festival → treasure → foreground.
  Landmarks, the road and the sites call `field.occupy(...)` for what they
  cover, so trees keep off; the glider ramps and the balloon's field are
  reserved just before the vegetation.
- **Build workers** (`src/map/work/`: `build.ts` on the page, `build.worker.ts`
  in each worker): the heavy pure-data work runs in Web Workers, a few at
  once (the cores less two, at most 4; `workers=<n>` in the URL), and the
  page's thread makes only the three.js objects, in the same order as before:
  - the land (heightfield.ts), from the moment the page opens: its first
    shape (`firstShape`: the low ground, mesas, benches, the sinking edges,
    each cell on its own) a share of the rows in every worker, the rest in
    the first; the others get a copy;
  - the land's blocks (terrain/lay.ts `layTerrain`): each worker lays a share
    of the 150 m chunks (`shareChunks`: about the same work each) and packs
    them into their meshes' arrays (VoxelMesh.ts `packVoxelMesh`: matrices,
    colours, sides shown, bounds). Each also sets the floor under every
    column (`fineFloor`, `coarseFloor`: its blocks' sides are tested against
    their neighbours') and places all the rocks (each takes its cells before
    the next is placed), keeping only its chunks' blocks. This runs while
    the page builds the atmosphere; in the terrain's place the page makes the
    meshes (`unpackVoxelMesh`) and marks the cells the rocks took;
  - the jungle's prototypes early (vegetation.ts `makeKits`), and in the
    vegetation's place the jungle planted (`plantJungle`) on the land as the
    page has it then (its surface and `occupied` are sent: what the
    landmarks, the road and the sites took, the reserved spots); the builders
    come back as typed arrays (transfer.ts);
  - while the page waits for the jungle, another worker works out the sides
    `cutCovered` (cull.ts) leaves out after the build (`coverGroups`,
    `coverBoxes`), used only if those meshes are still the same by then.
  The same code runs in a worker as on the page, on a copy of the land: the
  same blocks, colours, instance order, bounds and block counts, and the
  objects made in the same order (three sorts draws by id);
  `node scripts/build-check.mjs work=".|" main=".|work=0"` hashes every part,
  the land and the draw order both ways (`before="<checkout>|"` against
  another commit, `live=1`, `prod=1`, `url=`). Blocks keep their code line
  for the bug report (B): a worker sends each trace's stack as text, one
  trace a line of code. A module a worker runs must not touch the DOM as it
  loads, and reads the worker's URL, not the page's: send what a job needs
  (protocol.ts). `work=0` builds all on the page; if a worker cannot start,
  or a job fails or takes over 30 s, the rest is built on the page (logged
  once: `[work] the build workers failed (…)`). The console's `[work] …` line
  gives the workers, each job's ms in them, how long the page waited for each
  part and when it asked (`__mapStats.work`); `land` in the `[map] built in`
  line is now the page's wait for it. The statues sculpted in workers
  (sacred/) are marked still (`markStill`) whenever they come, as the other
  blocks of their part.
- **Built only when wanted** (`src/map/lazy.ts`, main.ts `LATER`): `rain`,
  `snow`, `rainbow` and `festival` may never show on a visit. They are built
  in their place above only when the page opens wanting them: the URL holds
  that weather or festival, the saved Weather setting is snow, the calendar
  has a festival on (`weatherAtLoad` in sky/weather.ts, `festivalNow`); a
  shot builds what its URL asks (a schedule that can rain builds the rain),
  so shots look as before. Otherwise they wait: twice a second the live page
  asks each (`Weather.wants`: rain and the rainbow once a shower's clouds
  begin to build, a minute or more before the first drops; snow the moment
  the setting is picked; `festivalSoon`: a festival within about a day of
  the map's time), and a wanted one is built in the background, one at a
  time: its module loaded, built in idle time, its shaders compiled off the
  frame (`compileFor`: into a render target, as post.ts draws the scene, so
  the programs are the ones drawn), then it joins the scene and `parts`
  (main.ts `arrive`: the blocks line, the graphics level's block shapes; a
  still part would be marked still and the still shadows drawn again). At
  the snow's place the build still puts the white cover into the materials,
  and a hidden stand-in with the flakes' material and the (hidden, small)
  snowmen into the scene (`prepareSnow`; the part takes them over): they
  compile at load, and picking snow costs no shader compile (a program's
  first use was up to ≈ 0.1 s on an M1 Max). The console says
  `[map] built only when wanted: …` and, for each built later, `[map] part
  "x" built when wanted …`; `__mapStats.late` holds their states. The walk
  maps are made once, as roaming is set up: a late part has nothing to stand
  on (the snowmen are never solid, `noWalk`).
- After the build, every shader is compiled side by side before the first
  frame (at most 6 s; lazy.ts `compileFor`, three's `compileAsync` with a
  render target set: the map is drawn into the post effects' target, with no
  tone mapping and linear colour, and a program compiled for the screen is
  another one: the first frame compiled all ~75 again, 1.3 s on an M1 Max
  before the Start button showed, now 0.3); the console says `[map] shaders
  compiled in N ms`.
  `window.__frame` is the live `MapFrame`, `window.__mapStats` the build
  times, blocks and failed parts (also `scene`, `parts`, `roam`, `audio`…).
- `src/map/cull.ts`, for parts spread over the map: `splitByPlace` cuts a
  part's blocks into one builder per place (near sites share one), so
  three leaves out the places off screen; `ShadowGate` lets a mesh cast
  shadows only while the ground its shadow can fall on is in view (every
  gated mesh casts for the first frames, so its shaders compile at load).
  Used by the jungle ruins, the camps, the village and the
  paddies. `fauna/_len.ts` (`len2`, `len3`) replaces `Math.hypot` in
  per-frame code (it allocates).
- Culling what moves: three leaves out a mesh whose bounding sphere is off
  screen (and out of the light's view for its shadow). The sphere is made
  once from the geometry (an `InstancedMesh`: from its instances), so a
  mesh moved in the shader (puffs, halos, a quad per instance), posed or
  rewritten each frame keeps culling on with a sphere that holds all it can
  draw: set by hand, grown by the most the shader moves a vertex plus half
  a point's size (smoke, steam, mist, spray, halos, the balloon's flames),
  or worked out again when the CPU writes it (`Flock.bound`, the crowd's
  lists, water rings, the elephants' splash, the birds, the tether). A
  sphere that holds nothing yet is `Infinity` (drawn: a shader still to
  compile). `frustumCulled = false` only where a sphere would be in view
  anyway or cannot hold it, with a comment saying why: the undergrowth pool
  round the camera, what he flies or holds (glider, parachute, fishing
  gear, boat wake), the thermals, the people's things and the golden
  figures (one draw all over the map), herds already picked in view one by
  one (`View.sees`), the crowd's bone pass (not the map), the paddies' warm
  frames.
- `MapPart.afterRender()` runs right after each frame is drawn (the canvas
  still holds the picture: photos). `MapFrame.calls` is a list of animal
  calls (`{ kind, x, y, z, gain }`) parts push in `update`; main.ts hands them
  to the sound (`audio/animals.ts`), which pans and fades them by distance.

## Roaming the map

The player can leave the picker: **Jump in** (button by the explorer, or
**J**) opens a small card with two ways down (`hud.ts`): **1** Parachute or
**2** Hang glider (the last pick is kept for the visit). The explorer leaps
off his ledge and the parachute, or the hang glider, opens over him at the
end of the fall (`roam.start(kind)`); then he can walk the map, paddle a boat on the rivers, fly a hang glider from a
cliff-top ramp and enter a temple at its beacon (**E**). **Esc** or "Back to map" returns to the overview. Code in
`src/map/roam/`:

- `types.ts`: the modes (`leap`, `glide`, `walk`, `boat`, `hang`, `balloon`), `RoamBody`,
  `RoamInput`, `RoamWorld` (ground to stand on, water, river current, the
  roaming area, places' entrances), `FollowCam`, `RoamHud`. `ROAM_SCALE`: the
  roaming explorer is 1.4 × his true 1.7 m, so he can hop up a 2 m land step.
- `roam.ts` runs one mode at a time and hands the camera between the
  overview rig and the follow camera; `main.ts` builds it after the parts.
- `walker.ts`, `followCam.ts`, `input.ts`, `world.ts`, `hud.ts`: on foot,
  the camera, keys / mouse / touch, the walkable world, the roaming interface.
  Every word shown while roaming (key help, prompts, messages, the tools,
  the touch buttons) is in `ui/lang.ts` (`r…`, `rt…`): keys stay keys,
  place names come from `placeText(p)`; prompts are made with `t()` each
  step, so a change of language (settings) shows at once.
  A drag, or holding **Q** / **R**, orbits the camera round him in every mode
  (as on `game.html`: 1.8 rad/s); the follow camera eases back behind him
  after a pause. It keeps him in view: walls, stone and land pull it in
  (`world.hardClearance`); tree leaves and bark, the parked gliders and the
  ramps dissolve in a dithered tube from the camera to him (`_nearFade.ts`,
  `world.softClearance`), off in the overview and in photos.
  The walk map (`walkmap.ts`: 0.5 m columns of solid spans) takes a block
  into the columns whose middles it covers, and a long, thin one (a plank
  wall, a rail) also into every column along its middle line, so walls
  turned off the grid have no holes (`thinwalk=0` leaves that out, to
  compare). He is 0.42 m round (the probes of `walker.ts`): a stair he
  climbs needs about 1.8 m between its handrails (the village, hamlet and
  east village stairs are that wide), a lantern or a beam over a stair's
  head closer than 2.26 m over the floor stops him — so does a handrail's
  top under the eaves (the floating village's and the back hamlet's stairs
  have their handrails just outside the treads, from the second step down:
  the top step lies under the roof), and the end of a veranda's railing
  (its 0.5 m column reaches into the opening: the railings of those houses
  and the east village's stop 0.35‥0.4 m wide of the stair, so he comes
  down a little off its middle too). He hops up a land step (2 m) only where it carries his
  front too (`carried`: three probes of his rim, and it goes on past his
  rim the way they lie — one 0.5 m column can hold three probes), and he
  steps up more than 0.35 m (`PERCH`) only onto what carries him the same
  way, and only onto what is ahead of him (`AHEAD`): a stair, a terrace, a
  sala's floor, not a pot, a jar, a shutter, a sill, a rail, a parapet or a
  handrail beside him (under his middle those are in his way; Space still
  jumps onto them). So he no longer perches on a window's shutter or climbs
  a parapet to a low roof (the `walls` walk test, 135 runs: none; `perch=0`
  leaves the rule out, to compare). Caught inside something he steps out
  beside it at his own level first, never onto the roof over it; a bump of
  his head only stops a hop, never pushes him down through the floor.
  When the roaming world is made (`world.ts`): the walk map with the map
  (the take-off ramps and the balloon's field are put on it, and the
  overview shows them); the follow camera's two walk maps (`hard`, `soft`),
  the planks underfoot (`_woodFloor.ts`) and the rivers' current and bank
  distances (`flow.ts`, in 64 m tiles: the boat's landing by the River Gate
  asks for a few as the map is built) wait. Their meshes are noted as they
  are at the build (a part may draw fewer of its blocks later:
  `terrain/seen.ts`), and `roam.ts` makes them after Start in idle time (a
  second in, `requestIdleCallback` slices of 2–8 ms, ≈ 80 ms of work in
  all on an M1 Max), hurried when the "Jump in" card opens (10 ms slices
  back to back), the rest at once as he leaps. A question before that
  makes what it needs at once, so nothing is ever missing, and every answer
  is the same as when all was made with the map (≈ 9 MB less held before
  Start, ≈ 3.5 MB less after: the bank tiles far from water are one shared
  tile). Headless shots and a page that starts roaming (`roam=`) make it
  all with the map, as before. Console: `[map] roam walk map: …` at the
  build, `[map] roam walk maps made in idle time: …` after.
- `parachute.ts` (leap + glide), `boat.ts` + `flow.ts` (boat, river current;
  boats wait at the River Gate landing and at the village jetty's head;
  the wake `_wake.ts`). Every boat carries a bamboo fishing pole laid along
  its right side, resting on the gunwale, its tip out past the bow
  (`_boatModel.ts STOWED_ROD`: the last blocks of the hull's wood mesh,
  shrunk away while he holds it: `stowedRod`).
- Fishing from the boat (`_fishing.ts`; the pole, float, line and fish drawn
  by `_fishGear.ts`; his body `_fishPoses.ts` over the paddler's posture, the
  `RideState.fish` hook; the fish `_fishKinds.ts`). Slow or still, **F** (or
  the touch Fish button, `touch.ts setTouchFish`) lays the paddle across his
  lap; he reaches for the pole and takes it up (one hand: his arms are
  short), swings it back and flicks: the float flies 6–10 m out over open
  water (never onto a raft or the jetty: the walk map) and lands with a plop
  (sound `bite`, softer) and rings (the boat's wake marks). The boat drifts with 0.3 of the current;
  the follow camera eases to a low view from the side, him on one side and
  the float on the other, looking between them (for 3 s after each change,
  then it is the player's, as sitting does). A bite comes in 5–25 s, sooner
  at dawn and dusk (`night` near 0.5) and in a light rain, later in a storm:
  a nibble or two dips the float (the prompt goes quiet), then it goes under
  (sound `bite`, rings, "F  Strike!"). F, Space, a click or the button within
  1.2 s: the pole bends towards the line, the line goes taut, the fish runs
  this way and that (foam, a thrash or two, sound `reel`), then he lifts it
  out and swings it in to his left hand; he lays the pole down along the
  boat and holds the fish up by its lip at his side, smiling at the camera
  (which comes round close to his front; sound `catch`; "ត្រីរៀល — Trey riel
  · 12 cm"; its page in the nature book), leans over the left side and lets
  it go (sound `release`, a splash, foam as it swims off), takes the pole up
  and casts again. Too late: "It got away"; too soon (nibbles): it swims
  off; Space or a click while waiting twitches the float. W A S D, E, or F
  while waiting lays the pole down again. Not while paddling, in a current
  over 1.6 m/s or within 30 m of a fall's lip. The camera or the phone up:
  the pole rests on the gunwale and no fish bites. Five fish of the Tonle
  Sap and its rivers (`_fishKinds.ts`: names, true lengths, where they bite,
  how hard they fight, voxel models from profile curves): ត្រីរៀល riel,
  ត្រីរ៉ស់ striped snakehead, ត្រីប្រា striped catfish, ត្រីក្រាញ់ climbing
  perch, ត្រីក្រាយ clown featherback; the water decides who bites (the great
  lake: all five; the rivers and the Kulen stream: riel, perch and catfish
  mostly; a pond or moat: perch and snakehead). A catch fills the fish's
  page of the nature book (`Journal.record`: caught how often, the biggest;
  the page's picture is drawn, `_fishPlate.ts`, until a photo gives one).
  Seeded randomness (by the time while playing, fixed in shots). Cost:
  nothing when not fishing; 2 draws while fishing (the gear's instanced
  boxes, the line), ≈ 0.02 ms a step waiting, 0.05 ms with a fish out. The
  float's tip glows at night. Words `fi…` in `ui/lang.ts`.
- `hangGlider.ts` (mode `hang`): E on a take-off ramp (`launchSpots.ts`:
  found on the land, the best cliff tops near a road; a hill with a temple
  and no flat cliff edge (Phnom Kulen, the terrace hills) gets a built-up
  ramp on a trestle with steps; walkable decks; every ramp has a mast with
  a waving flag and a beacon lamp that glows at night (`_rampFlag.ts`); a
  glider badge on both maps) lifts the glider, runs down the ramp and
  flies; E in a long fall unfolds it in the air. A / D bank, Shift fast,
  Space high up lets go. **Easy flying** (the settings panel, on by
  default; `roam/prefs.ts`, `easyfly=0|1` in the URL): hands-off it holds
  its height as long as you like, S climbs and W dives (faster the higher
  he is), up to 700 m over the land. Off: the real glider, W / S bar in /
  out (speed ↔ height), it sinks about 1 in 12. At the roaming area's edge
  the wind turns him back towards Angkor Wat the way the area's outline
  goes (views.ts `roamHeading`: round its inner corner at (230, −510), never
  across the gap outside it; the canopy and the balloon too). Rising air (`_lift.ts`):
  along cliffs, and in warm columns marked by golden seed fluff. Model
  `_gliderModel.ts`, ramp `_launchRamp.ts`, poses `_gliderPoses.ts`
  (upright with it, prone in the harness, the flare). The five ramps and
  their parked gliders are drawn together, 16 draws for all (80 when each
  had its own): `_rampBatch.ts` puts every spot's blocks of a family into
  one mesh (`LaunchRamps`: the still blocks, the windsocks with the prayer
  flags; `_parkedGliders.ts`: one glider posed once, placed on every ramp,
  its wires and flags one mesh each), and leaves out a spot out of view
  (60 m beyond it: a mast's shadow is long) and a glider he took off with.
  The ramps' still blocks are marked still (they cast the low and medium levels' still
  shadows; their planks, runner and brass stay bare in snow, as before);
  the flags, windsocks, prayer flags and gliders are not.
- `balloon.ts` (mode `balloon`): a hot air balloon in the flag of Cambodia
  (Angkor Wat in white on the red band) lies deflated on its field in the
  valley below Angkor Wat (`BALLOON_HOME`, west of the road's stairs;
  `reserveBalloonHome` keeps the trees off it and a lane to the valley road,
  main.ts, before the jungle is planted): the envelope a flat heap behind
  the basket (tipped on its side), the inflation fan, tether stakes, a small
  sign by the lane with a lantern lit after dark (a glow block, no light).
  E at the basket: it rights itself, he climbs in and stands at the burner
  line (`_balloonPoses.ts`), the fan fills the envelope with cold air, then
  the burner stands it up (8 s; **Space**, **S** or **W** faster; **Esc** stops: he
  hops out, it lies down again; the fan hum is `RoamLevels.fan`). Landed
  back home it stands inflated, the burner breathing now and then; leaving
  roaming lays it down again. Shots: `roam=balloon&balloon=parked` (on foot
  by the parked basket), `balloon=inflate:<s>` (inflating for s seconds),
  `roam=walk&balloon=up` (standing inflated at home). A bug report taken
  mid-hop or while inflating replays it (`reportParams`). **Easy flying**
  (the glider's setting, on by default) flies it like the glider: it
  cruises forward where the basket faces (8 m/s, **Shift** 15), **A** /
  **D** turn it (the envelope leans into the turn, the camera swings
  behind), **S** / **Space** climb (the burner roars), **W** descends (the
  vent; it rounds out softly near the ground), both easing in and out and
  quicker higher up, up to 700 m over the land; hands off it holds its
  height (the burner breathing now and then) and climbs over land rising
  ahead by itself; the day's wind only nudges it (at most 2.5 m/s), and at
  the roaming area's edge turns it back towards the temples (round the
  area's inner corner, as the hang glider and the canopy: views.ts
  `roamHeading`). Off: the real
  balloon, **S** / **Space** burner (heats the envelope: lift off, climb;
  Shift both burners), **W** vent (sink), hands off it cools and sinks
  slowly, **A** / **D** turn the basket and it edges forward (2.5 m/s);
  the breeze carries it (low along the valley to the east, higher up to
  the north over Angkor Wat) plus `MapWeather.wind`, stronger and turning
  with height; up to 420 m over the land. **E** low
  down lands it on fairly flat, dry, open ground (not water, temples or
  trees), **E** on the ground steps out; left away from home it stands
  there until roaming ends. The camera and the phone work in the basket.
  Model `_balloonModel.ts` (voxels, a glow flame and an additive "lantern"
  shell for the envelope lit from inside: no light), the burner's roar
  (`RoamLevels.burner`, audio/explorer.ts). A balloon badge on both maps
  (a target on the big map, `target=balloon`).
- The rope swing on the Bayon's rim (the `camps` part, `jungle/_swing.ts`;
  the ride `_swingRide.ts`, no mode of its own: part of the walk): on foot
  at the spot behind the seat, **E** sits him on it (the prompt "E Swing");
  it swings out over the drop toward the lake and back, slowly higher, he
  pumps with his legs (the posture hook, fists on the ropes by arm IK);
  **E**, a move key or Space brakes it and he steps back off where he got
  on. The seat and ropes are left out of the walk map (`userData.noWalk`).
  Check: `roam=walk&at=-376,-142&yaw=-43&sim=e:0.2,_:8&rcam=150,15,6`
  (the console line `[map] camps: …` gives the stand spot).
- The flag of Cambodia (`_flag.ts`: `flagColor`, `flagCell` for voxel
  grids, `flagTexture` / `flagMaterial` for flat panels, one texture for
  the page) flies on the hang glider (a panel on each wing half, and under
  it), on top of the parachute's middle cell and on a pole at every ramp.
- Poses for vehicles use the animator's `posture` hook
  (`src/character/Animator.ts`).
- `tools.ts` + `photo.ts`: on foot the explorer has a tool bar (bottom
  centre): **1** lantern, **2** torch, **3** flashlight (**O** beam ahead ↔
  follows the mouse), **4**/**Z** camera, **5**/**Y** selfie phone (**T**
  selfie stick: on by default, the wheel slides it out); **F** greet (below),
  emotes **C** cheer, **U** look up, **P** peek, **J** sit, **L** lie
  down; **H** hat, **G** outfit (in a selfie: gesture), **X** face, **V**
  photo album, **?** all keys.
  **Greeting** (`_greet.ts`; the map's greeting bus `src/map/greet.ts`): F
  with someone within 7 m in front of him (±60°) turns him to them and he
  greets the Khmer way, the sampeah: palms together at the chest, fingers
  up, a small bow and a smile (the `greet` action in `character/clips.ts`,
  the prayer's sampeah arms standing; flat hands `GREET_PALMS`), with a
  soft palms sound (`greet`); to a monk or an elder (grey hair) the palms go
  up to his face and he bows deeper (`greetHigh`: the higher the hands, the
  more respect). To a visitor from abroad or a child, or with nobody near,
  he waves. A light in his left hand stays there: the right hand alone
  comes up, flat. He stands still for the sampeah (F while walking: he
  stops for it); once its bow is over a push of the stick walks him on. F
  again only 1.4 s into a greeting. The people who see him greet him back
  (see People). Who is near comes from the people part (`greet.ts
  nearby`, asked only when he greets). The menu's Greet is always the
  sampeah, its Wave always a wave.
  **I** (or the button with his face on the bar) opens the Explorer menu
  (`_explorerMenu.ts`), the viewer's options for a mouse or a finger, over
  the bar where the key list opens (one of the two at a time; Esc shuts it):
  Moves (greet — the sampeah —, wave, cheer, look up, peek, sit, lie down:
  each goes in as its key, `RoamControls.press`, Greet and Wave both as F
  saying which, and the menu shuts so the move shows; greyed off foot), Outfit (the four looks and the hat) and Face (the six faces), what
  he wears and shows lit gold. It shuts with the camera or the phone up and
  with the album open. On touch it stands left of the bar (under it with
  the phone on its side), scrolls when it is too tall, a tap outside shuts
  it, and the mini-map steps aside while it is open.
  At a shrine he pays respect (`_pray.ts`): a golden lotus in pixel art
  glows on the floor where he would kneel (`_prayMark.ts`: one flat
  square, no light; it fades in from 16 m, breathes, glows over the bloom
  at night, and goes while he kneels or has the camera up); within 5 m of
  the worship spot and in front of it (`_worship.ts`: one or more per
  temple, where he kneels and the point he faces) the walker offers
  "E  Pray" (`rPrayHere`; on touch the Use button), after a golden figure
  and before a boat, ramp, balloon, swing or beacon. E walks him onto the
  lotus (`lead` steers him before the walker's step), he turns to the
  shrine, puts away his tool, takes his hat off, kneels, sampeah and bows
  three times (the `pray` action; `PRAY` times in
  `src/character/clips.ts`), a soft bell at the first bow, then hat on
  and up. E again, the stick, Space or a tool / emote key gets him up (or
  stops his walk to the lotus). He no longer kneels by himself when he
  stands still (he would kneel just as the player went to press E).
  Watching the sky (`_rest.ts`; the poses in `src/character/rest.ts`, a
  posture with `postureFeet = false`, also the viewer's `anim=sit|lie|sleep`):
  **J** sits him down where he stands (turning to the nearest way with
  room), upright, his legs out in front, his hands resting on them, looking
  ahead; **L** lies him on his back, hands behind his head
  (J / L again: up; the other one lies him back or sits him up). One value
  `u` (0 standing, 1 sitting, 2 lying) runs through the shapes (stand,
  crouch, sit, half back, lie), the legs and arms by IK so the seat, the
  soles, the hands and the back of his hair rest on the ground; going down
  he puts his pack on the ground on his right (his arms are short and the
  pack deep: it goes back on as he gets up), lying his hat comes off (its
  brim). Not in water, on stairs or steep ground, or with a wall in the
  way (a short message: `rRestWater` / `rRestSteep` / `rRestRoom`). The
  follow camera comes down low at his left side and looks up
  (`FollowCam.pitchMin` lets a drag look up further): he is small in the
  lower right, the sky fills the view; it goes back when he gets up. A
  prompt shows the keys ("J  Get up · L  Lie back"). Lying still 12 s he
  falls asleep (`AngkorExplorer.asleep`: the `asleep` face in
  `parts/face.ts`, not in the X cycle; slow breaths, the head rolled aside),
  a pixel "Z z z" rises over his head (a DOM overlay in the roaming layer);
  any key wakes him. The stick, Space or E gets him up, a light or an emote
  key too (the light comes out once he stands: his hands are on the ground
  meanwhile). The camera and the phone work sitting and lying (the camera
  looks up at the sky).
  The camera and the phone also work in the boat (the paddle goes down
  on his lap) and on the hang glider (it flies on straight): the
  Animator's posture keeps the body, the device's arms go on top.
  Photos go to the game's album (`src/game/Photos.ts`, IndexedDB), each
  new one with the maker's mark in its bottom-right corner (the game's name
  over "Made with ❤️ By Sochetra NOV": `markTitle` / `markBy`, on the map
  `alMarkTitle` / `alMarkBy` in `ui/lang.ts`), captioned with where it was
  taken (`photo.ts placeName`: a place, else the passport's village, holy
  place or jungle site he is at — "At the morning market" —, a road, a
  river, a hill). The
  explorer is made with `propLights: false`: the tools own one PointLight and
  one SpotLight (no shadow) that are always in the scene (intensity 0 when
  unused), so the light count never changes (no shader recompiles).
- Mini-map (`src/map/ui/minimap.ts`): top right while roaming, turns with
  the view; **M** or a click opens the big map, where a click on a place
  or a hang glider ramp sets it as the target (a gold arrow on the
  mini-map points the way, the distance shows under it). **N** (or
  "Nearest glider ramp" on the big map) heads for the nearest ramp. The
  ramps (read live from `roam.launchSpots`) show as a glider on a round
  badge on both maps. The land picture is drawn once, in small slices
  over several frames. Its words are in `ui/lang.ts` (`mm…`). The rice
  paddies are drawn over it in the colour of their stage of the year
  (`ui/_minimapPaddies.ts`, from `f.season` and `paddies/stages.ts`: dry
  earth, mud, flooded sky-blue, green, gold, stubble; the east paddies
  too). The villages and holy places (`ui/_minimapSpots.ts` `MAP_SPOTS`,
  from layout.ts: the sugar-palm village, its morning market, the palm
  sugar hut, the Kulen waterfall, the reclining Buddha once his worship
  spot `kulen-buddha` exists, the hamlet behind Angkor Wat) show as a
  pixel picture on a round badge on both maps (a stilt house by a sugar
  palm, a market parasol, a palm with the tapper's ladder, a waterfall,
  the golden Buddha, a hut by the lotus pond), named on the big map
  (`jn…` words; the village's `evVillage`), and are targets like the
  temples: reached within `arrive` on foot or by boat (the banner shows
  its picture). Check with `target=<id>` (`east-village`, `market`,
  `palm-grove`, `kulen-picnic`, `kulen-buddha`, `back-hamlet`). No name on
  the big map goes under "You are here" (`placeLabels`): its tag goes under
  his arrow (`is-below`) where over it would cover an icon or a badge, a
  name that would meet it takes its other side, and they are placed again
  as he moves on under the open map (`bigmap=1`).
- Hidden gold (part `treasure`, `src/map/treasure/`; the
  roaming modes reach it through `treasure/hooks.ts`): fifteen small
  golden figures, each a Khmer motif (`_models.ts`: apsara, naga, garuda,
  a Bayon face, singha, Nandi, lotus, kinnari, turtle, makara, Judge
  Rabbit, Hanuman, elephant, peacock, hamsa; the apsara and the kinnari
  wear the dancers' three-spiked mokot, the garuda and Hanuman Angkor's
  short conical crown — never the Thai chada's single spire —, the garuda
  grips a naga in each fist as on Preah Khan's walls, the naga's seven
  heads are smooth cobra heads, no crests), hidden in a corner of every
  temple, at the jungle sites and on the village jetty (`_spots.ts`, all
  reachable on foot, none by a worship spot). They turn slowly and glint
  (a small star, a faint glow at night, no light); E by one picks it up
  (the walker's first prompt; the `interact` action, it flies into his
  bag, a chime, "Golden naga found — 4 / 15"); found ones are kept
  (`angkor-map-treasure-v1` in localStorage) and marked on the big map.
  A gold counter under "Back to map" while roaming (`_hud.ts`). Hidden in
  the overview. Two draw calls; words `tg…` in `ui/lang.ts`; sound `gold`.
- The journal (`_book.ts`, data `_bookData.ts`, pages `_bookUi.ts`, stamps
  `_stamps.ts`): two more sections of the photo album (**V**: Photos ·
  Nature book · Passport). **Nature book**: a photo fills the page of each
  living thing in it — what the parts list in `subjects(out)` (animals,
  people, bamboo, the lotus, a festival crowd: subject kind `'festival'`),
  in frame, big enough, not hidden behind stone or land; the first photo
  gives the page its picture. Chapters land, jungle, water, plants,
  people; each page has Khmer and English names, one true fact and where
  to look. New with the east side: the sugar palm (`sugarPalm`, plants),
  the palm sugar tapper (`tapper`), the market seller (`vendor`), the
  market crowd (`market`, a crowd like `festival`) and the pilgrims to
  Phnom Kulen (`pilgrim`) — a part fills them by pushing those kinds in
  `subjects(out)` (people: `look.kind`). **Temple passport**, in three
  sections: the temples (an ink stamp for each of the six places,
  reaching its beacon on foot), the jungle (each site, walking into its
  clearing), the villages and holy places (walking into them: the village
  pagoda, the sugar-palm village, its morning market, the palm sugar hut,
  the Kulen falls, the reclining Buddha — from his worship spot
  `kulen-buddha`, else the Kulen temple's pad — and the hamlet behind
  Angkor Wat; where from and how near: `STAMPS` in `_bookData.ts`), dated,
  with a lotus seal where he prayed (on the stamp that names his worship
  spot, `StampDef.spot`, else the spot's place's, else the nearest). The
  stamps' motifs are Khmer forms: a shrine's stupa is a chetdei (a
  lotus-bud tower like Angkor Wat's on a redented, stepped square base —
  never a Thai bell with a ring spire), a spirit house a little Angkor
  tower on its post, a Buddha's ushnisha a cone with a lotus bud (never a
  flame).
  Kept in localStorage (`angkor-map-journal-v1`). Words `bk…` / `jn…` /
  `al…` in `ui/lang.ts` (the album's own words are Khmer too). Checks:
  `album=book:<kind>` a page, `album=book:<chapter>` (e.g. `plants`) and
  `album=passport:<section>` (`temples`, `jungle`, `villages`) scrolled
  there; with `stamps=all` the lotus seal shows where there is a shrine.
- Buying food and drink, and eating and drinking it (`_shop.ts`; the menu
  `_shopMenu.ts`, the purse and his bag `_shopPurse.ts`, `_shopBag.ts`,
  pixel pictures `_shopIcons.ts`; the shops `src/map/shop.ts`: each place
  registers its stalls when it is built, `registerShop`; the east side's:
  `hamlet/_shops.ts`). In front of an open stall the walker offers
  "E  ទិញ — តូបនំបញ្ចុក" / "E  Buy — Num banh chok stall" (after a golden
  figure and a shrine, before a boat; on touch the Use button); a closed
  one only says so ("… បិទហើយ", when nothing else is in reach). E turns him
  to the seller, the camera comes round behind his shoulder to a side from
  which nothing — stone, a tarp, leaves, a person (greet.ts `nearby`) —
  stands between it and him, the seller looks up and asks "ទិញអីដែរ បង?"
  (people/_saleBack.ts), and the buy menu opens at the right (a sheet
  along the bottom on a phone held upright, the camera looking a little
  lower so he stands above it; at the right edge on one on its side): the
  stall's name, each thing's pixel picture, name and price in riel
  (`៤,០០០ ៛`: Khmer digits in Khmer), the purse and what he carries at its
  foot. 1–9, a click or a tap buys (↑ ↓ Enter too; E again or Esc steps
  away; a push of the stick walks away); what he cannot pay for is dimmed
  and says more pocket money comes at dawn. Paid (sound `coin`: riel notes
  counted out, a small chime), the sale goes out (`shop.ts SALE`: the
  seller turns to him, holds it out with both hands, `POSE.give`, and
  thanks him, "អរគុណបង!"), it is in his hands a moment later
  (`AngkorExplorer.holdFood`), and the menu asks: eat (drink) it now — the
  default — or keep it for later (he carries up to three). Eating at the
  stall he turns from the counter first and eats standing beside it, as
  at a street stall (the noodle stall's low stools want a posture the
  character has not: he does not sit on them), the camera comes round to
  his front (sitting on the ground, J, too: closer and low, not the rest's
  sky view), and the character's `eat`, `bite` or `drink` plays
  (src/character/meals.ts; a `munch` or a `sip` on each bite, `MEAL`
  times), then "ឆ្ងាញ់!" / "Delicious!" (a drink: "ស្រស់ស្រាយ!" / "So
  refreshing!") in a bubble over his head; after the meal's first moment
  the stick, Space, E or a tool key stops it. What he keeps shows on the
  tool bar's slot 6 (the first thing, how many): 6, a click or a tap eats
  or drinks it; the explorer menu's "In my bag" (the purse, each thing: a
  tap) is the touch player's way to any of them. On foot, standing or
  sitting on the ground (J: he eats sitting); not lying down, not in the
  boat, on the glider or in the balloon. **The purse** (riel only, a
  small line under the gold counter while roaming): every visit starts
  with at least 20 000 ៛, topped up again to that at each dawn of the
  map's day (and every 6 minutes where the time of day stands still),
  never taken away; kept with the bag and the dishes tasted in
  localStorage (`angkor-map-purse-v1`). The east side's shops: the
  morning market's noodles (num banh chok 4 000 ៛), grill, drinks, fruit,
  fruit seller, Khmer cakes and palm sugar (each while its stall is open,
  `mkopen` too), the sugar-palm village's shop, Kulen's food stall and the
  road-foot sugarcane juice stall; real prices. Cost: nothing while he is
  not buying or eating but the walker's look for a stall in reach (a
  handful of distances a step); the menu is made the first time it
  opens. Words `by…` in `ui/lang.ts`. Checks: `shop=<id>` (at that shop,
  its menu open: `market-noodles`, `market-grill`, `market-drinks`,
  `market-fruit`, `market-fruitG`, `market-cakes`, `market-sugar`,
  `eastvillage-shop`, `kulen-stall`, `kulen-road`; the other places' own:
  `palm-sugar-stall`, `back-breakfast`, `back-produce`, `back-fruit`,
  `back-krok`, `back-coconut`, the floating village's `village-…`) · `shopbuy=<item>` just bought it (the seller hands it over; with
  `sim=_:1.1,e:0.1,_:<s>` eaten, with `shopfocus=1` first: kept) ·
  `bought=<item>` or `<shop>:<item>` eating it now (`sim=_:<s>`) ·
  `purse=<riel>` · `kept=<item>,…` · `buy=0` (start clean, save nothing) ·
  in `sim=`, `6` taps 6 (e.g. `act=sit&kept=numKrok&sim=_:2,6:0.1,_:2`).
  Shots log `[map] sale: …` (who serves, how far).
- Eating and drinking, the character's side (`src/character/meals.ts`,
  the food `parts/food.ts`, shared with game.html and the viewer):
  `AngkorExplorer.holdFood(kind, colors?)` puts the food in his hands (it
  pops in; a lantern, torch or flashlight goes away meanwhile and comes
  back after; tools.ts `wantHeld` keeps it away while `foodHeld`), and
  `play('eat' | 'bite' | 'drink')` (or `consume(kind)`: both) eats it:
  `eat` ≈ 4.9 s (noodles in a white bowl with a blue band and chopsticks,
  bai sach chrouk in an open foam box with a spoon, green mango in a clear
  bag with a stick: the container flat on his left palm under his chin,
  three portions up to his mouth from his right, his head bowing to them,
  the bowl emptying), `bite` ≈ 4.2 s (a skewer, a rice cake: a bite from
  the side, a tug, he chews and looks at it turning it, a second bite),
  `drink` ≈ 4.4 s (a coconut in both hands with a bendy straw, a cup of
  juice with a lid and straw, iced coffee in a tied bag, a small bottle
  tipped up with his head turned to it: three sips, the level dropping,
  then "ahh", head back). His faces go with it (`bite`, `chew`, `look`,
  `sip`, `ahh`, `yum` in `parts/face.ts`, not in the X cycle), the empty
  things shrink away in his hands at the end (`MEAL[action].gone`) and he
  lets go. The hands by arm IK to where each kind's item goes (`PLACES`,
  `KEYS`: in his chest's frame, "this point on his mouth", or over the
  bowl), the wrists turned to hold it: the same standing and sitting (J:
  the rest posture keeps his body; not lying). The items are chibi-sized
  in his blocks (≤ 34 blocks shown: ≈ 3.1 k triangles at high, 1.5 k at
  medium, ≤ 7 draws), built on first use, off the rig once eaten; the
  faces built on the first meal. A shop item's `colors` recolour it, the
  most visible first (`FOOD_COLORS`). Checks (the character alone, no
  shop): `act=eat|bite|drink` (its default food), `food=<kind>`
  (`foodcolors=hex,…`), `act=sit&food=<kind>` eats once he is down, with
  `sim=_:<s>`; the viewer `viewer.html?anim=eat&food=noodles&t=1.1&sit=1`.
- Footsteps (`walker.ts stepSound` picks the ground): recordings in
  `assets/sound/`, cut into single steps when they load
  (`audio/footsteps.ts`) and played one per footfall (`audio/explorer.ts`);
  synthesized steps while they load or if they fail. On the planks of the
  village (verandas, stairs, jetty, rafts) and the camps (bridges, the
  monk's hut) they sound of wood (`_woodFloor.ts`, `RoamWorld.woodAt`, read
  from the wooden blocks when the roaming world is built). In snow
  (`stepSnow`) the grass recording slowed, its crisp top over it, the
  weight muffled, a softer start (the snow packing down).
- Sound settings: one slider per bus (`VOLUME_KEYS` in `types.ts`): master,
  music, ambience, water, animals, steps (footsteps), moves (the explorer's
  other sounds: jump, parachute, glider wind and sail, paddle, splash,
  fishing, his sampeah) and ui. `explorer.ts roamBus` says which roaming
  sound goes to which bus. The people's sounds and the hamlets' beds are on
  ambience (the pinpeat on music): **Sound of the new life** below.
  `audio.debug()` in the console shows the buses and whether the recorded
  steps are loaded.
- The story's typing (`audio/typing.ts`, on the ui bus): an old typewriter,
  one strike per word as it shows (Khmer words: `Intl.Segmenter`), cut from
  the recording in `assets/sound/` (`audio/typewriter.ts`; synthesized until
  it loads); the title is a heavy strike. Panned by where the word is on
  screen.
  While the story is open every bus but ui (music, ambience, water,
  animals, steps, moves) ducks to 0.3, and to 0.2 while words type in
  (`DUCK` in `audio/engine.ts`); they come back to their sliders when it
  closes. `audio.debug().duckLevel` shows the level now.

Because of roaming, the map is also seen from the ground and from every
direction: land, trees, mist and sky must hold up from there too (no
missing faces, no mist planes seen edge-on).

Check with URL params (in roaming shots always pass `sim=` and usually
`rcam=`, or the follow camera is not placed): `roam=leap|glide|walk|boat|hang|balloon` (the balloon: at home without `at`; with `at=x,y,z` high up it flies) · `at=x,z` or `x,y,z` ·
`yaw=<deg>` (0 = facing south, 180 = north) · `sim=<keys:seconds,…>` a
scripted input run before the shot (`input.ts parseScript`, e.g.
`sim=w:2,wr:3,j:0.5`; `<` / `>` alone hold Q / R; `f` taps F: the greeting) · `rcam=yaw,pitch,dist` the follow camera's orbit ·
`tool=lantern|torch|flashlight|camera|selfie` (camera and selfie also in `boat`, `hang` and `balloon`) ·
`stick=0|1` the selfie stick · `sview=0‥1` hold the selfie view part way from the follow camera to the phone (see him holding the stick) · `act=wave|cheer|lookUp|peek` ·
`act=greet|greetHigh` (the sampeah, out on the greeting bus: the people near greet him back; `sim=f:0.1,_:1` greets as F does, turning to whom he greets) ·
`bigmap=1` · `target=<place id>|ramp:<i>|ramp|balloon|<village id>` (a place, a ramp, the nearest ramp, the balloon, a village or holy place: `market`, …) ·
`jumpmenu=1` the Jump in card open (`=key` with the focus ring) · `start=glider`
with `roam=leap` the hang glider opens at the end of the leap · `easyfly=0|1` · `fauna=lineup` (every land animal in every
pose on the valley road) · `wildlife=<s>` (run the water animals' reactions) ·
`act=pray` (kneel and pray; with `sim=_:<s>` that far in) · `act=sit|lie|sleep`
(down on the ground there, asleep once lying: `sim=_:3`, sleep `sim=_:5.5`;
with `rcam=` the camera stays put) · `kneelat=x,z,fx,fz`
or `x,y,z,fx,fz` (a worship spot of its own there, facing (fx, fz); `sim=e:0.1,_:5` walks him onto its lotus and he kneels) ·
`gold=all|none|<n>|<id>,…` which golden figures are found (shots start
with none) · `gold=lineup` every figure in a row on the valley road ·
`goldfound=<id>` as if it was just found (the message) ·
`balloon=parked|inflate:<s>|up` (see the balloon) ·
`fishing=1|cast|wait|bite|fight|catch|release` with `roam=boat` and a `sim=`
(fishing: from the start, or straight into that moment; `fight`, `catch` and
`release` take `:<riel|snakehead|catfish|perch|featherback>`, and `fishcm=<n>`
its length; e.g. `fishing=wait&sim=_:3`, `fishing=catch:featherback&sim=_:1.5`) ·
`album=photos|book|passport` the album open there (`album=book:<kind>` that
page, `album=book:<chapter>` / `album=passport:<section>` scrolled to it) · `book=all` / `stamps=all` the nature book / passport filled for the
visit (not saved) · `journal=0` start empty, save nothing ·
`fest=water|newyear|0` hold a festival or none (else the calendar) ·
`fauna=jungle` every jungle animal in every pose on the valley road ·
`people=lineup` (`lineupturn=0‥1` turns them) · `touch=1` the touch
buttons · `quality=low|medium|high` · `story=<n>` open the story at page
n (`story=0` never) · `vegstats` the vegetation's counts in the console.
The explorer in shots: `look=<outfit>`, `hat=0|1`, `face=<expression>`,
`keys=1` (the ? key list open), `menu=1` (the Explorer menu open; with
`touch=1` as on a phone), `beam=mouse` with `mouse=x,y` (0‥1 of
the screen), the selfie's `gesture=peace|wave|thumbsUp|none` and
`saim=yaw,pitch,reach`, the camera's `pview=yaw,pitch,fov`.

## Time of day and the sky

`f.clock` (0 golden afternoon, 0.25 dusk, 0.5 midnight, 0.75 dawn) drives
the sky (`sky/palette.ts`): four keys — day, dusk (warm red and orange),
night, dawn (cool blue and pink, pale gold low behind Angkor Wat, glowing
mist, soft shadows) — dusk on the way into the night, dawn on the way out.
Clock 0 is the concept art's look. The sun and moon move on paths low over
the northern hills (`SUN_PATH`, `MOON_PATH`), left to right as the picker
sees them: the sun comes up behind Angkor Wat's right-hand towers (right of
its card) at dawn, stands where the art has it at clock 0 and sets behind
the right-hand hills by ≈ 0.16; the moon rises after dusk (≈ 0.33), is
where the art has it at midnight and sets before dawn (≈ 0.68). The key
light swings and drops a little with them, and turns only on the frames the
shadow map is drawn anyway (every third), so it costs no extra shadow pass
(on low and medium, whose shadows are still, it turns in 0.3° steps, each
drawn over 10–12 frames: "Phones" below).
The moon shows its phase from `f.day` (29.53-day month, day 0 = new moon):
lit side and soft ragged terminator, the dark side hidden (only the sky);
its glow spreads from the lit part, all round it (`moonLitDist`), so a half
moon shines too; a full-moon night is a little brighter. Shooting stars on clear
nights, one every 20–60 s (`sky/stars.ts`; never in the first 40 s, so not
in a default still: `t=224.3` shows one). Weather on the light
(`f.weather`): clouds dim and hide the sun and moon and soften the shadows,
rain greys, cools and darkens the sky, haze and light, a lightning `flash`
brightens the sky light and haze for a moment (no light is added).
The weather itself (`sky/weather.ts`, closed-form and seeded) follows the
player's **Weather** setting (settings panel, `MapSettings.weather`):
*by season* (default) is real Cambodia by `f.season` — no rain and a still,
hazy air in the dry season (December–March), a rare light shower round
Khmer New Year (the mango rains), a shower every 7–15 min of play in the wet
season (late May–October, first 3–8 min in) with a storm now and then, most
often as the rains set in; *clear* never rains; *rainy* a shower every
7–13 min (first ≈ 2½ min in); *stormy* a storm every 7–11 min (first ≈ 2
min in), showers between; *snow* is a dream (it never snows at Angkor: only
this choice brings snow, never the season) — a pale grey-white overcast and
light flurries all along, snowfalls of 2½–5 min with pauses of 1½–3 min, a
soft low wind, no rain, storm or rainbow; picked, the first flakes come
within seconds and the land is white ≈ 2½ min in (`MapWeather.snow`, the
snow falling; `snowCover`, the white on the land: up over ≈ 1½ min of a
snowfall, hardly melting in the pauses); a page that opens with it is
already snowing on white land. A change starts the new schedule from then; a
switch to clear or to snow fades the rain out over 30 s, a switch away from
snow stops it over 30 s and melts the white off over 2–3 min (the land runs
wet, then dries). Rainbows follow rain by day.
Parts `rain` (`sky/rain.ts`: streaks in three boxes round the camera, one
draw, hidden while dry) and `rainbow` (`sky/rainbow.ts`: one draw, only
while there is one). Drops ring the water (`RAIN_RINGS_GLSL`: the rivers,
the lake, the flooded paddies and Angkor Wat's moat and pools).
Snow (the part `snow`, `sky/snow.ts`): soft round flakes drifting and
fluttering down in three boxes round the camera (24 m, 150 m, 800 m; one
draw, hidden while it does not snow; big soft out-of-focus ones right by the
lens on foot; fewer on low), catching the lamps and the explorer's lantern by
night; the sky pales and the haze draws in while it falls, the light goes
cooler and the white land lights the air from below (`sky/palette.ts`).
The flakes and snowmen are built only when wanted (the snow setting saved or
picked, or the URL's snow: "How the page is built"); the white cover is a
shader patch put once, at the snow's place in the build whether or not the
part is built then, into the lit
materials of every part built before `snow` and into the world's block
families (`coverMaterial` for a part's own still things;
`userData.noSnow` keeps one bare), driven by one shared uniform: no shader
compiles again when the weather changes, and with no snow it costs one
uniform test a pixel. What looks up whitens (flat tops first, drifts from
the tiling noise, a lip of snow on a side just under its top edge, so
stepped roofs and terraces read white), never water or anything shiny,
never under a roof, a bridge or a tree (a depth map of the still layer
seen from straight above, drawn once the first time it snows, ≈ 14 MB,
freed two minutes after the snow is gone), less on the roads and trails
(`field.surface` path, `field.trail`). The explorer, people, animals and the
sculpted Buddhas stay bare (the families his things share with the world,
wood and metal, get a covered copy for the world's blocks). While it lies
thick, a snowman in a red krama stands in the floating village and one in
the sugar-palm village (never solid to walk into). People carry on (no umbrellas: `events.ts` reads
only rain), footsteps crunch (`stepSnow`, roam/walker.ts: under open sky),
the sound hushes (audio/engine.ts reads `snow`, `snowCover`).
Checks: `clock=0‥1`, `day=0‥29` (7 first quarter, 15 full, 22 last quarter),
`moon=0‥1` (the moon's age held, whatever the day: 0 new, 0.25 first quarter,
0.5 full, 0.75 last quarter; only the sky reads it, the festivals keep to `day`),
`night=` still works (dusk side), `weather=rain|storm|rainbow|snow|clear`
(held; `snow`: snowing on white land), `weather=season|rainy|stormy|snowy`
(that setting's schedule at `t=`, with `season=`; `snowy` is the snow
setting's), `flash=1`, `snow=`, `snowCover=` (0‥1), `snowtop=0` (no map from
above: snow under roofs too), `snowmen=0`, `uistate=settings,weather:snow`
(the panel with snow chosen).

## The jungle

Dirt trails (layout.ts `TRAILS`, graded into the land: `field.trail`,
`field.trails`) lead off the roads to 13 hidden sites (`JUNGLE_SITES`),
each in its clearing. Part `jungle` (`jungle/ruins.ts`, `_ruin*.ts`,
`_incense.ts`): the fallen face, the root gate (the back trail runs
through it), the carved lintel, the forest Buddha, the spirit house, the
lake shrine and the Kulen shrine, with offerings, incense smoke and
candles (glow only, no light) and a worship spot at each shrine. The
spirit house is a Khmer rean tevoda: a tiny Angkor sanctuary on its post
(a pointed flame-arch pediment with naga hoods at its feet, a lotus-bud
tower of redented tiers), a krama tied round the post, a young coconut
among the offerings — not the Thai spirit house's crossed gables, chofa
horns, spire of rings and red soda. Shots log `[map] jungle: …` with a
`cam=` for each site (7 m out before it, 3 m up). Part
`camps` (`jungle/camps.ts`, `_camp*.ts`, `_bridges.ts`, `_swing.ts`): the
forest monk's hut on stilts (with its ladder), the woodcutters' camp and
its fire, the rope swing, two foot bridges over the Bayon stream and the
pool at the foot of its fall. Both are cut per site (`cull.ts`). Part
`undergrowth` (`veg/undergrowth.ts`): ferns, elephant ears, grass, flowers,
reeds, leaf litter, logs and vines, streamed in 4 m cells round the
explorer (32–44 m out; 24–32 m on the low level), one draw,
walk-through, off in the overview; with the jungle's leaves they sway in
the wind (`veg/sway.ts`). Part
`jungleFauna` (`fauna/jungle.ts`, where they live read from the built trees
by `_jungleSurvey.ts`): wild boar with piglets, green peafowl, great
hornbills, a giant ibis pair, pileated gibbons, and small life (squirrel,
water monitor, whip snake, skinks); cicadas in the ambience. Checks:
`fauna=jungle`, `parts=terrain,jungle,camps`, a walk at a site from the
console line `[map] camps: …`.

## Rice paddies and the year

The paddies part (`src/map/paddies.ts`, `src/map/paddies/*`; the plots are
layout.ts `PADDIES`: ten south-west by the great lake, off the picker's
frame, and five on the east lowland by the sugar-palm village) follows
`f.season`: every plot runs the rice year of `paddies/stages.ts` (a little
out of step with its neighbours, cut on its own day): cracked
dry clay, first rains and furrows, a nursery bed, flooded plots mirroring
the sky, seedlings planted in rows, lush green, heads turning gold and
bending, a harvest sweep with sheaves in stooks, straw stacks, stubble
that greys and is grazed away. Three kinds of draw: the plots' floor
(`ground.ts`: earth, mud, water mirroring `SKY` with clouds, the sun's or
moon's glitter, ripples downwind, rain rings), the rice (`rice.ts`, below)
and the props (`props.ts`: bamboo fences, two ting mong, stooks, straw stacks;
they cast shadows), and the sugar palms on the dikes (veg/palms.ts, see
"Palms": their own two draws, children of the props' mesh; `buildProps`
returns them as `palms`). Every change is a smooth function of the
season (nothing pops); per frame uniforms, the rice's cells in view and
the palms' far leaves. Walk-through (not in the walk map); a footstep in a
flooded plot is `stepWater` (`stages.ts paddyFlooded`, walker.ts
`stepSound`). Check with `season=`
(0 dry · 0.12 flooded · 0.25 young · 0.45 lush · 0.62 turning · 0.7
harvest · 0.8 stubble · 0.95 dry), e.g.
`cam=-150,26,112,-232,7,80` or `roam=walk&at=-196,83&yaw=270`.
Great egrets stand in a plot while it holds water, and egrets, grey
herons and two duck families live on the great lake
(`fauna/_waterLake.ts`, in the wildlife part's wader and duck herds).

The rice is thin like real rice: a hill (29.6 k of them, rows 55 cm apart,
hills 42 cm) is drawn three ways by its distance from the camera, each
blending into the next over a few metres (`rice.ts` `NEAR`, by graphics
level). Near: a clump of 8 thin leaf blades (flat strips 2–3 cm wide, 3
segments, each arching out its own way: inner ones upright, outer ones
curling over) and 3 thin heads that come out above the leaves (≈ 0.5),
arch over as the grain fills and go gold (beaded grain up close). Farther:
a fan of three broad blades from one foot. Far off the hills thin out:
every other one (a checkerboard) goes and the rest broaden, and on low
every other one of the rest again (picked at random) farther still.
Shapes follow the stage: heads only while out (61 / 40 triangles a clump
with / without), one triangle a straw stub after the cut (8), fans 6 → 3.
Reaches: low 5 blades, 2 heads to 16 m, thinning from 40 m and again from
70 m; medium and high 24 m / 60 m; max 36 m / 90 m.
Two draws for all the rice, the near clumps and the fans of every plot:
every hill's numbers are one float texture (`uRcHills`, three texels a
hill, grouped by 3.5 m cells), and each draw is a list of hill numbers
(`aHill`): the hills of the cells in view and in season (a cell far off
lists only the hills it keeps there), written again only when the cells
change (a camera standing still: nothing; a plot wholly in view and past
the clumps is taken whole). The fans have their own program (`RC_FAN`: no
leaf or head code, no `discard`), so the GPU shades only the blade in front
and none of the floor behind it; the clumps keep the dither up close and
the beaded grain. Blades are at least a pixel wide (no sparkle), lit as
thin leaves (the face toward the sun or moon). The floor takes the rice's
colour where the canopy closes and from a few metres off, and hides the
water's glints and the sun's highlight under the rice (`ground.ts`), so
from afar the field is one soft carpet; it works out its earth (cracks,
grain) only where that shows through the rice, its ripples only on water
and its mirror (sky, clouds, glints) only on open water.
Rice triangles (main pass, 1672 × 941, medium → low): overview 0 (off
frame); above the paddies (`cam=-150,26,112,-232,7,80`) 75 k → 45 k (was
136 k → 112 k); on the dike (`roam=walk&at=-196,83&yaw=270`) 173 k → 89 k
(was 280 k → 190 k); low over a plot edge 111 k lush, 164 k with heads,
25 k stubble (was 184 k, 237 k, 48 k); low 53 k, 75 k, 15 k (was 121 k,
143 k, 35 k). The phone's paddies walk (low, 844 × 390): the paddies part
6 draws (was 15), 145 k triangles (was 244 k; rice 94 k, was 193 k, and
147 k vertices, was 311 k); its GPU time on the M1 Max ≈ 0.45–0.8 ms (was
≈ 0.6–1.2 ms; four paired runs of the main pass drawn again and again with
the part shown and hidden, the fastest fifth of the batches: other GPU work
on the machine only adds), the whole main pass 0.1–0.6 ms less; its CPU
≈ 0.02–0.04 ms a frame (the cells picked; 9 draws fewer to send).
Check it close with `cam=-205,9.6,82.6,-205,8.2,90&season=0.62`, the
parting with `roam=walk&at=-212,92&yaw=270&rcam=90,15,4.5`, the east plots
with `cam=396,16,12,396,8,50` or `roam=walk&at=396,10&yaw=0` (`npm run perf
-- only=eastpaddies`).

## Palms

`src/map/veg/palms.ts`: the real sugar palm (ត្នោត thnot, Borassus
flabellifer, Cambodia's tree) and coconut palm (Cocos nucifera), for every
part that plants them: the paddies' dikes (`paddies/props.ts`), the
floating village's shore (`village/_kit.ts` `palm`, built by
`villagePalms`), the hamlets (the palm sugar grove, the sugar-palm
village, the hamlet behind Angkor Wat). The sugar palm: a very straight
dark grey trunk (0.6 m across over its swollen foot, 0.45 m at the crown's
base; its rings in the shader), the old leaf bases under the crown, a
round crown of 35–40 pleated fans on stiff stalks (the young ones up, the
old ones out and drooping), dead fans hanging under it, dark fruit or
flower stalks; `tapped`: no dead fans, the lowest cut away, bamboo tubes
under the flower stalks on the `ladder` side (`tubes: false` leaves that
gear to the caller). The coconut palm: a pale ringed trunk leaning out and
curving back up (`lean`), 18–22 feather fronds (4–5 m, their leaflets
hanging in a V) arching over, coconuts, a dead frond. API: `new
Palms().add({ kind, x, y, z, h, seed, … }).build({ name })` →
`{ object, update(f), subjects(out), palms, pieces }` (add `object` to
the part's; `update` stops drawing the leaves while every palm is far;
`subjects` gives the sugar palms to the nature book, `sugarPalm`). For the
tappers: `sugarPalmCrownBase(h)` (`h − 1.6` over the foot: the flower
stalks, the ladder's top), `sugarPalmTrunkRadius(h, above)`,
`sugarPalmWork(spec)` (where the tubes hang), `PALM_FLEX` and `palmBend`
(the wind's bend of a trunk, for what is lashed to it). Instanced and
posed in the vertex shader: at most three draws a part (blocks, fans,
fronds) and their shadows; the trunks are also bark blocks nobody sees
(`<name>:trunks:mapBark`), solid in the walk map (he cannot walk through a
trunk; the follow camera looks past it). The trunk bends with `f.weather.wind`
(`veg/sway.ts`: the top most, the foot not at all), the leaves flutter and
stream downwind, glow a little with the low sun behind them, and dissolve
in the follow camera's near fade. Two levels of detail per palm, from the
drawing camera: near to 110 m (60 on low, 160 on max; a sugar palm ≈ 85
pieces and 1.8 k triangles, a coconut ≈ 46 and 4 k) and far (≈ 25 blocks
that keep the silhouette), one dissolving into the other over 6 m (a
dither). A hundred palms build in ≈ 10–20 ms. The jungle's palms are the
vegetation's prototypes (`palmProto`, from veg/species.ts `palm()`): the
same two palms as upright blocks and slabs on its lattice (≤ 36 blocks on
1 m cells ‥ 10 on 3 m, as before), two sugar palms to a coconut
(`isSugarPalmProto` tells them apart). Checks: `palms=near|far` (holds
one level), `palmstats` (a console line per planting: palms, pieces,
draws), `cam=-176,15,88,-189,21,75` (a dike palm),
`cam=384,19,-4,371.5,20,-13.5` (the grove's tapped palms), `cam=-285,22,95,-325,8,55`
(the village's coconuts), `cam=10,24,78,-12,12,57` (jungle palms by the
summit river), with `night=1` or `weather=storm&t=30`.

## The floating village

The `village` part (`src/map/village/`, built right after the water so its
stilts and rafts get no rock foam; off the picker's frame) is a Tonle Sap
village on the great lake's east shore (layout.ts `VILLAGE`). Where things
stand is `_spots.ts` (no three.js): nine stilt houses astride the shore
line, their verandas and front stairs facing the village, their backs over
the shallows with a small deck and a ladder down to a moored boat — not one
even row: some stand further out over the water, some turn a little, their
floors step between 9.5 and 11 m, so the roofs step along the shore
(`STILT`: arc length, out, turn, look); a shop where the trails meet; the
jetty (`JETTY`) out to the floating houses (`FLOATING`: a floating shop by
the jetty's head, a fish farm, a floating garden); the pagoda (`PAGODA`) on
the rise to the south, facing north. `VILLAGE_SPOTS` (pagoda door and stair
foot, jetty foot and head, every home's door and stair foot, the floating
homes) is for people and festivals. Worship spot `village-pagoda-door`
(roam/_worship.ts): the porch, facing the Buddha.

**Its heart and its market** (the player: "this village needs better
composition — and we don't have a market here"). Where it all stands is
`_fvPlan.ts` (no three.js; the build and the people read it); a Tonle Sap
village's middle, as at Kampong Khleang or Kampong Phluk, where the road
meets the landing:

- **The arrival**: the village trail comes off the paddies' dike through
  the village gate (ខ្លោងទ្វារភូមិ, `FV_GATE`, `_fvVillage.ts` `gate`): two
  whitewashed pillars under stepped ochre and red capitals and lotus-bud
  tops, the name board "ភូមិបណ្ដែតទឹក" (the floating village, raised cream
  letters on blue with a gold border: Koulen pixels, `_fvSign.ts`) facing the
  dike, a stepped crest; wide and tall enough for the ox cart. Beyond it the
  **village tree** (a tamarind, `FV_TREE`) on the open earth where the trails
  meet: a fluted trunk forking into level limbs, a wide low crown of leaf
  clumps (no grid shows), cloth tied round the trunk, the **neak ta**'s
  humble wooden shrine at its foot (spirit stones in cloth, incense, bay sei,
  candles lit at night), a bench. The ox cart (people/_sceneCart.ts) turns
  round it: nothing solid stands in its ring.
- **The market** (ផ្សារ, `_fvMarket.ts`, the east market's kit:
  hamlet/_mkKit.ts, _mkGoods.ts, _mkSteam.ts, _mkToggles.ts, imported) fills
  the wedge between the east shore trail's last leg (its aisle: `AISLE`) and
  the lane from the trails' end to the jetty's foot (`LANE`), under the
  painted sign arch "ផ្សារ" over the lane (both faces): prahok and dried fish
  on a raised bamboo platform (big prahok jars beside it), greens, fruit,
  Khmer sweets (fronts to the aisle or the lane, under faded tarps and market
  parasols); the fish seller squatting at the landing south of the jetty's
  foot under an umbrella (an LED tube on a pole for the dark before dawn;
  the spirit house stands on the north side); the grill (split fish clamped
  in bamboo, grilled bananas; its smoke drifts over the square); the noodle
  stall (num banh chok, its sign, the pot of gravy steaming, stools) at the
  shop's side, lit under a bare bulb and a string of small coloured bulbs
  from dusk (a pool of lamplight on the ground); the drinks cart (a cooler of
  ice, iced coffee, sugarcane, coconuts, bags with straws on a rail) by the
  shop's side just inside the gate. **Boats** (`FV_BOATS`): four women sell
  from teak boats tied along the jetty's first ten metres in the morning —
  fruit, greens, fish, and the noodle boat with its pot steaming — paddling
  in over the lake at dawn and away at mid-morning (people/_sceneVillageMarket.ts).
- **The day** (`clock`; a day is 6 minutes in the cycle): each stall opens
  over its own window (`FvStall.open`): the boats and the fish before and at
  dawn, the square busiest in the morning (0.72‥0.93), the fish gone first,
  half the stalls packed up by the afternoon (tarps rolled, parasols
  folded), the grill from noon into the evening, the noodle stall lit till
  late (≈ 0.46). What changes is shown and hidden by the market's toggles:
  its boxes are instances of the village's own meshes (one per family: the
  market adds no voxel draw), folded away or put back only when the clock
  has moved (`followMarket`); all soft families, so the walk map never keeps
  what has gone. Its lamps are the village's glows made switchable
  (`VillageLights.switchable`, groups `fv:dawn`, `fv:noodle`, `fv:grill`).
- **Shops** (src/map/shop.ts, registered by `_fvMarket.ts`): `village-fruit`
  (green mango with chili salt 2 000 ៛, bananas 1 500, rambutans 3 000),
  `village-sweets` (num kom 1 500, num ansom 2 000, num lot 1 500),
  `village-grill` (grilled fish on a stick 3 000, grilled banana 1 000),
  `village-noodles` (num banh chok 4 000, kuy teav 5 000), `village-drinks`
  (iced coffee 3 000, sugarcane juice 2 500, green coconut 4 000),
  `village-grocery` on the shop's veranda before its counter (water 1 000,
  iced tea 1 500, sponge cake 1 000), and from the boats, the buyer on the
  jetty: `village-boat-fruit` (bananas 1 500, ripe mango 2 000),
  `village-boat-noodles` (kuy teav 4 000); each open while its stall (boat)
  is. The fish, greens and prahok are not for eating on the spot: no shop.
- **The north street**: a second row of houses on the land side of the east
  shore trail, their fronts to the stilt houses across it (`FV_HOMES`, built
  by the sugar-palm village's `evHouse`, hamlet/_evHouse.ts: kantaing, pet,
  rông daol; a spirit house, hens, washing, a dog), papayas, bananas and
  kitchen beds round them, split fish drying on bamboo racks in front, small
  fish on a blue sheet (`FV_RACKS`).
- **Trodden earth** where people walk (thin slabs on the land's cells): the
  market's floor, the square round the tree and before the shop, the cart's
  ring, the path from the square to the pagoda's naga stair, the lane along
  the stilt houses' stair feet.

People (`people/_sceneVillageMarket.ts`, scene `villagemarket`): a seller
(kind `vendor`) at each open stall (squatting, on her platform, on a stool,
standing; the noodle cook stirs her pot now and then; the fruit seller gives
and kneels when the monk comes on his alms round: people/_sceneVillage.ts
`ALMS`), the grocer behind the counter, the four boat women (rowing in and
out, sitting among their goods facing the jetty while tied up), three buyers
on their rounds (a neighbour with a basket on her head, a woman who buys
fruit from the boat at the jetty, a man with an iced coffee), people eating
on the noodle stall's stools at breakfast and supper; calls (`market`
murmur, `vendorCall`, `sizzle`) and bubbles (the `mk…` words and the
village's `fv…`). Both village scenes share one walk map (`villageGround`).
Cost: the village part ≈ 10.6 k blocks (was 7.6 k: the market and the heart
≈ 1.6 k, the three north street houses ≈ 1.5 k), built in ≈ 20‥60 ms; three
draws more near the market (the steam, the grill's smoke, the pool of
lamplight at night; hidden beyond 330 m); 19 people (≈ 0.01‥0.03 ms a
frame, hidden beyond 300 m, every third or sixth frame past 70 m) and ≈ 110
thing boxes (the boats). Checks: `fvopen=all|none` (every stall open or
shut); the arrival `roam=walk&at=-240,83&yaw=250&sim=_:0.5&rcam=0,14,12`
and `roam=walk&at=-272,83&yaw=262&sim=_:0.5&rcam=0,12,10`; the market from
the trails' end `cam=-293,8.5,79,-303,7,64`, from the jetty
`cam=-322,11,44,-298,6,70`, from the pagoda's stair
`cam=-306,14,91,-300,6,62`, the north street `cam=-281,8,18,-291,7,58`; with
`clock=0.84` (the morning), `0.1` (quieter), `0.3` (the noodle stall lit),
`0.708` (the boats coming in); buying `roam=walk&shop=village-boat-fruit&shopbuy=bananas`
(any shop id above), `people=village,villagemarket`.

The pagoda (`_pagoda.ts`) is **Khmer, never Thai** (the player's rule,
KHMER-STYLE): a naga stair like Angkor Wat's causeway (the balustrades the
serpents' smooth grey-green stone bodies on short posts, each rearing at
the foot into seven cobra heads under one smooth hood in a halo of kbach
flame leaves); the hall on its plinth in a colonnade of white pillars with
gilt lotus capitals, ochre-yellow walls, red shutters; the roof in two
tiers of red-orange terracotta (the eaves' row deeper red — no green edge,
no glazed checker), the porch's part lower; on every gable end gilt barge
boards (the naga's body) ending at each eave in a five-headed hood, a
slender hooked chovea on each ridge's end; the gables painted with Brahma's
four faces under a broad tiered crown between two kneeling tep prânâm, in
kbach (sacred/gable.ts `figure: 'brahma'`); over the door a gilt pediment
with Reahu swallowing the moon (`_pagodaArt.ts` `doorPediment`); eight seima
stones round the hall in little tiled shrines (the front one a pair either
side of the way in); two Khmer chedei (sacred/stupa.ts); the festive,
multicoloured crocodile flag (ទង់ក្រពើ; the white one is for funerals) on a
tall pole with a golden hamsa; a skor drum pavilion and a bell pavilion
under small tiered roofs with lotus-bud spires. Inside, the altar and the
painted walls, ceiling and shutters (gold kbach with bosses, no glass
mosaic). Its console line `[map] village pagoda: N blocks` (≈ 1.2 k); the
naga (sacred/naga.ts, sculpted in a worker: `_nagaWorker.ts`), gables,
Buddhas and offerings come just after the build. Checks:
`cam=-294,22,66,-306,13,104` (from the village), `cam=-306,15.5,84,-306,16.5,95`
(the porch gable), `cam=-306,12.2,93.5,-306,13.2,99` (the door pediment),
`cam=-311,9,78,-306,8,87` (the stair's naga), and on `sacred.html`:
`piece=gable|gable-figures|gable-flat|pediment|naga-stair|naga-roof`.

Files: `_house.ts` (walls, roof, windows of any house; `gable: 'rays' |
'kbach'` adds a Khmer gable: plain barge boards over the roof's stepped
ends and a fan of rays out of a little sun, or a kbach flame leaf — the
village's houses use them), `_houses.ts` (stilt houses, jetty, shore life),
`_floating.ts` (rafts; `Bobbing` turns their instance matrices about each
raft's middle, only while the camera is within 330 m), `_pagoda.ts`,
`_pagodaArt.ts` (the pagoda's painted surfaces), `_lights.ts` (window,
lantern and candle glows with halos, no lights), `_smoke.ts` (kitchen smoke:
points moved in the vertex shader; more at dawn and supper time, leaning
with the wind), `_kit.ts` (plank walls, stepped roofs, props; the Khmer
spirit house `spiritHouse`: a tiny Angkor tower on a post, never the Thai
san phra phum; `khmerGable`, `bargeBoards` for any house, and `Local.tilt`
/ `board` for boards tilted in a frame's own x: a `Local` made with its
frame's heading, `new Local(b, src, seed, theta)`), `_fvPlan.ts` (where the
heart and the market stand), `_fvVillage.ts` (the gate, the village tree
and its neak ta, the north street, fish racks, trodden earth), `_fvMarket.ts`
(the stalls, the sign arch, the shops, `followMarket`), `_fvSign.ts` (the
gate's word in pixels). Everything is
solid in the walk map (verandas, stairs, jetty, rafts: the boat goes round
them) but plants and cloth. Roosters crow at dawn, hens cluck by day
(`f.calls`). Checks: `cam=-285,22,95,-325,8,55` (over the village),
`roam=walk&at=-304,63&yaw=225&sim=w:3&rcam=0,16,9` (the jetty),
`roam=walk&at=-306,82&yaw=0&sim=w:3.2&rcam=0,20,10` (up the naga stair),
`roam=walk&at=-306,10,95&yaw=0&sim=w:0.3,e:0.1,_:4.5` (he kneels at the pagoda),
`roam=boat&at=-360,40&yaw=90&sim=w:2&rcam=0,12,10`, with `night=1` or
`clock=0.75`.

## The sugar-palm village

The sugar-palm village (ភូមិត្នោត: hamlet piece `eastVillage`,
`src/map/hamlet/_eastVillage.ts` and its `_ev*.ts`; its people
`people/_sceneEastVillage.ts`, scene `eastvillage`) is a Khmer land village on
the east lowland at the foot of Phnom Kulen, "the other side" from the
floating village (layout.ts `EAST_VILLAGE`; off the picker's frame), strung
along the `east village road` from the market square east over the Kulen
stream. Where everything stands is `_evSpots.ts` (no three.js; `EV_SPOTS` for
the people; `EV_BUILT`, `EV_BRIDGE_AT` and `EV_WASH_AT` are filled in by the
build, which reads the land and the stream). Fourteen houses on stilts
(`_evHouse.ts`: five each side of the street, one round each back yard, two
over the stream) in the Khmer forms (`form`): rông daol (one steep gable over
the rooms and the veranda), kantaing (a steep gable over the rooms and a
lower roof skirt all round, deep over the veranda, on struts at the sides),
pet (a little gabled porch roof on two posts over the head of the stair). The
floor 3 m up on dark stilts on footing stones or whitewashed concrete ones;
plank walls plain or painted (whitewash, pastel blue, green, yellow, pink);
red-brown tiles, palm thatch, grey or rusting tin; plain barge boards (no
horns: those are Thai), a fan of rays out of a little sun in the gables that
face the street, a kbach leaf in the others; barred windows with open
shutters; wooden or solid concrete stairs; under the floor a hammock, the kre,
a loom, bicycles, a moto, jars, firewood, a hen coop, the rice mortar, fish
traps (an ox cart beside one); a kitchen hut behind with its clay stove or
wok; spirit houses (the floating village's own, village/_kit.ts `spiritHouse`:
a little Angkor tower on its post, cella, white and ochre tiers, a gilt lotus
bud), flowers, hens, kramas on the lines and railings, fences and gates
between whitewashed pillars. Round them (`_evYard.ts`): two rice
granaries (rat guards), the cattle pen (rails, a thatched shelter, a log
trough), the hand pump and basin, the sala at the Kulen trail's corner (a
water jar for passers-by), the village spirit house and the old tamarind with
the neak ta's humble shrine (statues, bay sei, incense), the little shop by
the street with its signs in Khmer (`_evSign.ts`: "ហាងលក់ទំនិញ", and "សាំង"
over the petrol bottles, in pixels like the market's), straw stacks, gardens:
sugar and coconut palms (veg/palms.ts), mango, papaya, banana, bamboo,
kitchen beds, hedges (no tree in the palm lane's view from the street down
to the palm sugar yard). The stream (`_evStream.ts`): the foot bridge on the
street's crossing (a gentle arch 4 m over the water, its posts out of the
boat's channel), laterite washing steps down the bank face to a plank landing,
a boat on the sand, a fish trap. It marks its ground (`field.occupy`: the
forest keeps off) and is solid in the walk map but plants and cloth (the
stair sides are straight boxes: a tilted box's bounds would close the
stairway). Night: lit windows and doorways, lanterns and tube lights, the
shop, the shrines' candles (village/_lights.ts); kitchen smoke at dawn and
supper (village/_smoke.ts); roosters at dawn, hens by day. People: cooks
squatting at their stoves at dawn and stirring woks at supper (`chop`,
`crackle`), a weaver at her loom, a grandmother sweeping and a grandfather at
the sala early, both in hammocks by day and on the verandas under the lamps in
the evening, a woman washing at the landing in the morning, a man at his
cart's wheel, another mending a net, the shopkeeper on her stool; children at
tag in the south yard (down the steps to splash on the sand late in the
afternoon, `splashPlay`) and kicking a ball under the tamarind, calling
"សួស្ដី!" to the explorer (`kidHello`), laughing; a woman and a boy on
bicycles (people/_bicycle.ts) along the street and over the bridge all day,
slowing for him and the cattle, ringing their bells (`bikeBell`); the herd boy
and three white cattle out over the bridge to graze on the far bank in the
morning, home along the street at dusk into the pen (`cowBell`); the
grandmother asks "ញ៉ាំបាយហើយឬនៅ ចៅ?" when he comes by, the shopkeeper
"ត្រូវការអីខ្លះ?" (bubbles, the `ev…` words). Cost: ≈ 9.3 k blocks in four
draws, the palms' own (21 palms), one draw each for the glows, halos and smoke
(hidden while the village is out of view); built in ≈ 15–30 ms; ≈ 0.01 ms a
frame; 15 people, ≈ 0.02 ms a frame near, less farther (the settled are not
stepped), hidden beyond 380 m. Checks:
`roam=walk&at=361,-71&yaw=100&sim=_:0.5&rcam=0,12,9` (down the street from
the market), `roam=walk&at=450,-60.2&yaw=270&sim=_:0.5&rcam=0,13,9` (from the
bridge), `cam=352,62,-2,414,8,-66` (from above), `cam=433,15,-51,447,9.5,-60&clock=0.2`
(the herd on the bridge), `cam=452,13,-88,440,8,-76&clock=0.8` (the washing),
with `clock=0.8|0.25|0.5` or `night=1`; `people=eastvillage`; `evherd=<m>`
(the herd held that far along its way home from the meadow).

## The morning market

The morning market (ផ្សារព្រឹក: hamlet piece `market`, `src/map/hamlet/_market.ts`
and its `_mk*.ts`; its people `people/_sceneMarket.ts`, scene `market`) fills
the square where the `east village road` comes down from Ta Prohm's hills and
turns east along the sugar-palm village's street (layout.ts `MARKET`; off the
picker's frame). Where everything stands is `_mkPlan.ts` (no three.js: the
people read it too). The road is the main aisle: under the painted sign arch
"ផ្សារ" (`_mkSign.ts`: the word as Koulen draws it, in pixels, raised on both
faces) two rows of stalls face each other across its north leg under faded
blue, orange and striped tarps on bamboo poles and big market parasols
(flowers and offerings, fruit, kramas and sarongs; greens on a raised bamboo
platform, baskets, mats and palm-leaf hats); the noodle stall (num banh chok)
at the inner corner, its low tables and plastic stools under the big shade
tree, a neak ta shrine at the tree's foot (cloth tied round the trunk); the
grill and a ground seller along the village street; the covered hall (a long
roof of rusty corrugated tin on wooden posts) on the outer side of the bend:
fish, dried fish and prahok, palm sugar and rice facing the square, meat and
vegetables on the far side of its aisle, ground sellers under small umbrellas
in front of it; the sugarcane cart and the motos and bicycles parked south of
the street; trodden earth where people walk. Goods are colourful clusters that
read from a few metres (`_mkGoods.ts`); `_mkStalls.ts` builds each stall in its
own frame, `_mkKit.ts` has the box writer and the poles, tarps, parasols,
tables, platforms, stools and wheels. Sizes are the people's (1.4 × true).
The day: each stall is open over its own window of `clock` (`STALLS` `open`):
the fish before dawn under LED tubes, the square busiest 0.72‥0.95, half the
stalls packed up by the afternoon (tarps rolled, parasols folded, the ground
sellers gone with their umbrellas), the grill smoking at dusk, at night only
the noodle stall under its bare bulbs and string of small bulbs, pools of
lamplight faked on the ground (`_mkLights.ts`: glows and halos, no light).
What changes is shown and hidden by `_mkToggles.ts` (the tagged boxes'
instances folded away or put back, a few times a day; all soft families, so
the walk map never keeps what has gone). Steam off the noodle pots
(`_mkSteam.ts`), the grill's smoke (village/_smoke.ts), the shrine's candles
and incense (jungle/_incense.ts). People: a seller (kind `vendor`) for each
stall, there when it opens (walking in with her basket on her head while the
explorer is near): she squats, sits on her stool or platform or stands at her
table, calls out (a bubble when he is close: the `mk…` words), bargains and
hands the goods over (`give`); the noodle cook steps over to stir her pot;
buyers (seven in the morning, fewer later) look, ask the price, pay and walk
on with a basket on the head or a bag (lotus and incense for the pagoda in
the hand: `offering`), or sit down to eat (`eat`; at night they come only to
eat); the monk's alms round at dawn (the sellers give and
kneel, he blesses: `nod`); a girl squatting by her mother's basket stall
(she waves when he comes close); a child on a bicycle ringing her bell; a moto
passing along the road (people step round it; it waits for the explorer).
Sounds: `market` (the murmur, by how many are there), `vendorCall`, `chop`,
`sizzle`, `moto`, `bikeBell`. Nature book: the sellers are `vendor`s; while
it is busy its buyers are the `market` crowd. Cost: ≈ 2.5 k blocks in four
voxel draws (wood, tin, goods, leaves), the glows (blocks, halos, the night's
pool), steam, smoke and the shrine's lights (two); built in ≈ 10 ms; beyond
330 m only the voxels (culled off screen, shadows gated); its people 28 in
the crowd, ≈ 0.03 ms a frame among them, next to nothing from afar (every
third or sixth frame past 60 m, the seated sellers still), hidden beyond
260 m. Checks:
`roam=walk&at=333,-112&yaw=0&sim=w:1,_:0.5&clock=0.8` (walking in under the
sign), `roam=walk&at=357,-72&yaw=-119&sim=w:0.6,_:0.5&clock=0.82` (from the
village street), `cam=318,30,-104,338,8,-84` (from above) with
`clock=0.85|0.05|0.4`, `cam=351,11,-80,343,8.5,-89&clock=0.4` (the noodle stall
at night), `people=market`, `mkopen=all|none`, `mkmonk=0|1|2` (the alms
round's stops), `mkmoto=<m>`, `mkbike=<m>` (along the road from the north).

## The palm sugar grove

The palm sugar yard (ចំការត្នោត, the passport's ខ្ទមស្ករត្នោត: hamlet piece
`palmSugar`, `src/map/hamlet/_palmSugar.ts` and its `_ps*.ts`; its people
`people/_scenePalmSugar.ts`, scene `palmsugar`, their cows and hens
`_scenePalmSugarYard.ts`, their ways round the yard `_scenePalmSugarWays.ts`)
lies between the sugar-palm village and the east paddies (layout.ts
`PALM_GROVE`), by the `palm lane`; off the picker's frame. Palm sugar as
Cambodia makes it (Kampong Speu's has the EU's protected name; the same
family yards line the road to Banteay Srei at Kulen's foot; the facts are in
`_palmSugar.ts`'s comment). Where everything stands is `_psPlan.ts` (the
build and the people both read it). **The composition**, as a player comes
down the lane from the village street: the family's stall at the lane's
edge in the gap of a bamboo rail fence, its painted sign over its roof;
behind it the swept yard, the open cooking shed with the steam pouring out
of its ridge vent and a tapped palm right behind it (the lane lines them
up); to the right the family's own palm-leaf house on its posts, jars, a
straw stack, a cow; the drying racks of golden cakes in the sun south of
the shed; the palms in clumps and singles round it (16: 4 tapped in the
yard — one by the lane with its ladder on the lane's side, one behind the
house, one behind the shed, one south of the racks —, 4 tapped on the dike
junctions and wide dikes of the east paddies, 8 not, two of them young), a
second cow tied across the lane. The shed's local frame is `HUT` (+x east
to its open front, facing the lane); the house (`HOME`), stall (`STALL`),
racks (`RACKS`) and the rest (`YARD`) are world metres.

- **Ladders** (`_psPalms.ts`): one bamboo pole lashed to the trunk about
  every metre, its foot out round the swollen base, stubs alternately left
  and right every `RUNG` — half a climbing cycle of `POSE.climb` — and a
  crossbar to stand on under the crown; they bend with their palms in the
  wind (`_psBend.ts`: the bark mesh's blocks carry their palm's foot and
  height, the palm shader's own sums); the palm's tubes hang on the
  ladder's side.
- **The shed** (`_psHut.ts`): thatch laid like shingles (`_psKit.ts`
  `thatchSlope`: each course a thick mat along the slope, its lower edge
  lifted over the one below and shaggy with leaf tips, one long band of its
  own tone with patches of older and newer leaf — not planks), silver-brown,
  blackened round the long raised vent along the ridge (a little thatched
  roof of its own on posts), on the west the thatch sweeping lower over a
  woven palm-leaf wall, the gables woven (the south one with a smoke hole);
  the long clay stove with three iron woks and three fire mouths facing the
  lane (frond stalks being fed in), a chimney; the juice jars (a filter
  cloth on one), the mat of palm-leaf rings (empty, freshly poured, set), a
  low bench and the child's stool, a lantern on the front beam, bundles of
  rings, leaf-wrapped cakes and a krama on the wall, the paddles on the tie
  beam; fronds and firewood north, a rack and a basket of clean tubes. The
  stove (woks, chimney) and the juice jars are solid to the roaming explorer
  up to 4 m (hidden blocks in the walk map, `palmSugar-solid`, never drawn
  or picked; bark, so the camera passes softly; the steam is not): he walks
  round them, never over the woks.
- **The house** (`_psHome.ts`, ផ្ទះស្លឹក): hardwood posts from stones up to
  the roof, the floor 2.6 m up, woven palm-leaf walls between bamboo
  battens (door open, shutters propped out on dark rooms), a steep thatched
  gable roof (woven gables, a plain bamboo barge board: no horns), the open
  veranda with its rail, a krama over it, the lamp by the door, a steep
  wooden stair; under it a striped nylon hammock, the kre with its mat and
  pillow, the hens' basket, water jars under the south eave.
- **The yard** (`_psYard.ts`): swept earth round the house and under the
  racks; two knee-high bamboo racks with flat woven trays of round cakes
  (4 × 4, a tray half taken in); the fence; fronds on an A-frame; the
  tapper's old bicycle with its tube holders; a rice straw stack; the cows'
  stakes; a banana clump; pots of bougainvillea and basil by the veranda;
  the dog asleep in the stall's shade.
- **The stall** (`_psStall.ts`): a thatched roof on four bamboo posts over
  a slatted table — baskets heaped with cakes, a tray of single cakes, the
  cakes wrapped in dry palm leaf in tied rolls (ស្ករត្នោតខ្ចប់) —, a shelf of
  more, fresh juice in bamboo tubes standing in a blue ice box, small bags
  of juice tied to the front beam, the seller's low stool; the sign
  (`_psSign.ts`: "ស្ករត្នោត" in red over "ទឹកត្នោតស្រស់" in blue, Koulen in
  pixels like the other signs, raised on a whitewashed board) on two tall
  posts over the roof's north-east corner, turned to the lane: read coming
  down it, the seller seen under it. **A shop** (shop.ts `registerShop`,
  `palm-sugar-stall`, "តូបស្ករត្នោត", open while the family works, not in
  a storm; the buyer stands on the lane facing west): palm sugar cakes, a
  bundle wrapped in leaf 3 000 ៛ (`sweet`), one cake 500 ៛ (`sweet`), fresh
  palm juice in a bamboo cup 2 000 ៛ (`cupDrink`), young palm fruit
  (ផ្លែត្នោតខ្ចី) 2 000 ៛ (`fruit`).
- **Syrup, steam, fire, lamps**: the syrup (`_psSyrup.ts`) a disc per wok,
  lit like the land, boiling in the fragment shader — pale fresh juice
  under froth, amber, thick dark caramel with big slow bubbles that pop into
  rings; glossy. Steam, wood smoke and sparks (`_psSteam.ts`, one cloud of
  points: most of the steam pours out of the ridge vent in one plume ≈ 10 m
  high, some out of the open side; coloured like the valley mist, glowing
  against the low sun). The fire: glow blocks in the mouths (coals and
  flames flickering, above 1.0 at night; after dusk only the coals), halos
  and a warm pool on the floor at night (no light). The lamps (their own
  glow blocks and halos, one draw while one is lit; `psLamps`): the house's
  by its door, in its doorway and window in the evening (`clock` 0.19‥0.42)
  and before dawn, the shed's lantern while they work in the dark (the blue
  hour, dusk).

The day (`psWorking`, `psCooking`): in the blue hour before dawn (`clock`
≈ 0.69) the family comes out of the house one after another and down its
stair (walked on the stair's height: `ride`), lights the fire; the steam is
thickest in the cool morning; at dusk (≈ 0.23) they walk round to the stair,
up and in at the door; the embers glow through the night. Everyone walks
round the shed's wall, the stove, the house's stair, jars and hammock, the
racks, the stall's table and the frond stack (`_scenePalmSugarWays.ts`: a
walk that would cut through one goes by its corners; planned once per
walk). The tapper (kind `tapper`: tubes and knife) goes round two or three
palms at a time (`ROUNDS`: the yard's; south of the racks and down the wide
dike; down the lane and along the north dike; a different round each day,
one after another while the clock is held in the day): to the ladder's
foot, up (`climb` at `climbRate`), at work under the crown (the knife at the
flower stalks: `chop`; tubes swapped: `knock`), down, on to the next; then
the full tubes home on a shoulder pole, poured into the jars, a rest on the
bench. Never up a palm in a storm; at dusk he finishes and pours first. His
wife stirs the woks (`stir`, `paddle`) and ladles fresh juice in; the
grandmother squats at the mat pouring cakes and goes out between the racks
to turn the cakes (and offers the explorer a taste: `psTaste`); the
grandfather feeds the fire mouths, fetches fronds and naps in the hammock
in the midday heat (`POSE.hammock`, rocking); their daughter (kind
`vendor`, a palm-leaf hat) keeps the stall on her low stool, up now and
then to set it straight, calls to the explorer passing ("ទិញស្ករត្នោតទេបង?
មានទឹកត្នោតស្រស់ផង!": `psSell`) and hands over what he buys
(people/_saleBack.ts); the child helps, eats a snack on its stool, runs
round the yard after the hens and goes to watch father climb. Two white
cows graze on their ropes (bells: `cowBell`; they doze at night), a rooster
and four hens peck, rake and scurry from the explorer, and sit under the
house at night (fauna/_kit.ts flocks: `OX`, `FOWL`). Sounds: `bubble`,
`crackle` (the shed, heard within 60 m), `knock`, `chop` (the tapper),
`cowBell`. Nature book: the palms are `sugarPalm`s, the tapper a `tapper`,
the cows `ox`.

Cost: ≈ 2.3 k blocks (the shed ≈ 780, the house ≈ 360, the yard ≈ 310, the
stall and sign ≈ 270, the ladders ≈ 620) in four draws (bark with the bend,
stone, cloth, leaf) and the palms' two, the syrup, the fire's glow, the
steam (+ the lamps' glow while lit, halos and the pool at night); ≈ 130 k
triangles near with shadows (56 k on low), ≈ 44 k past 140 m, where the
small blocks (props, rims, cords, stubs, cakes, leaf tips and patches,
letters: ≈ 1.6 k of them, last in each mesh's list) are left out
(`NEAR_DETAIL`); the blocks and palms cast only while their shadows can be
seen; built in ≈ 5–12 ms; its update ≈ 0.01 ms; the family and animals
≈ 0.005 ms a step, two flock draws (people part), hidden beyond 380 m.
Checks: `roam=walk&at=397.5,-19&yaw=-10&sim=_:0.5&clock=0.9` (the yard from
the lane), `cam=398.2,10.3,-24,386,14,4&clock=0.88&tap=0:225` (the lane's
view: stall, shed, steam, the tapper up the palm behind it),
`roam=walk&shop=palm-sugar-stall&clock=0.85` (at the stall, the buy menu
open; `shopbuy=palmJuice`), `people=palmsugar&clock=0.85&tap=30&cam=397,9.5,-12.5,392.3,12.5,-15.8`
(the tapper up the first palm; `tap=45` at work under the crown,
`tap=<round>:<s>` another round), `cam=391,9.5,27,389,14,5&clock=0.76&tap=1:40`
(from the paddies' dike at dawn), `cam=401,12,-10,388,11,-1&clock=0.9` (the
steam), `cam=382,10.3,4,376.5,11,-7.5&clock=0.92` (the house),
`cam=393.5,10.6,12,387,8.6,5.5&clock=0.95` (the racks),
`cam=397,10.4,-4.5,379,11.2,-8.5&clock=0.33` (evening: the house's lamp,
the embers), `cam=394.8,9.6,0.5,389,8.6,-1.3&clock=0.4` (the embers at
night), `clock=0.19` (dusk), `weather=storm` (he stays under the roof).

## Behind Angkor Wat

The little hamlet behind the temple (ភូមិក្រោយអង្គរវត្ត: hamlet piece
`backHamlet`, `src/map/hamlet/_backHamlet.ts` and its `_bh*.ts`; its people
`people/_sceneBack.ts` and its `_sceneBack*.ts`, scene `back`), round the
back of Angkor Wat where villagers live among the trees (layout.ts
`BACK_HAMLET`, on the 8 m rise north of the back trail; the `Lotus pond`
west of it; the `hamlet lane` up from the trail). Where everything stands is
`_bhSpots.ts` (houses, pen, sala and cart, the pond's jetty, steps and wallow
read from the land, the routes; the people read it too, and stand on the
built hamlet through its own walk map: `BACK_BUILT`), the market's
`_bhMarketPlan.ts`. The build: four Khmer stilt houses round a swept dirt
yard (`_bhHouses.ts`: the village's house body on posts with footing stones,
a fan of boards in every gable; three Khmer forms — the old family house a
*phteah kantaing* with its skirt of roof all round under old clay tiles, the
weaver's a *phteah pet* with a little gabled porch roof on two posts over its
stair, the others plain gables of tin and thatch; under the floors a kre bed
and the grandfather's hammock, a moto, the hen coop, the weaver's loom; a
kitchen stove and its smoke by three of them; the rice granary on posts with
rat guards); the yard (`_bhYard.ts`: the cattle pen with a thatched lean-to
and a log trough, rice straw stacked round poles beside it — low loaves with
rounded tops, never a stepped cone with a finial that would read as a stupa
under Angkor Wat's towers —, the spirit house — a tiny Angkor tower on a
white post, bay sei, incense and a candle that glow at night —, the well and
wash slab, the vegetable garden in its bamboo fence, washing, paddy drying on
a tarp by the granary, a dog asleep; earth steps where the lane and the back
trail step up a whole land block, so the cattle, the bicycles and the people
walk up them; footpaths trodden bare through the grass — the children's from
the jetty round their house, to the well, the pen's gate, the garden); the
pond (`_bhPond.ts`: lotus clumps — pads, leaves on stalks, flowers and buds
—, reeds, the children's plank jetty with a bamboo ladder, stones up out of
the water, the buffalo wallow's mud); down by the trail (`_bhSala.ts`) the
sala (a plank platform under a plain tiled gable with its fan of boards, jars
of drinking water; its step up in the middle of the east bay, between the
posts, toward the lane and the cart) and the coconut and sugarcane juice cart under an old
tamarind (green coconuts, the cane press, the ice box, a machete in the
stump, plastic stools, the painted sign "ទឹកដូង": `_bhSign.ts`, Koulen in
pixels), the neak ta shrine at the tamarind's foot, cloth round its trunk;
fruit trees (`_bhTrees.ts`: mango, jackfruit, bamboo, jungle trees round the
edges, stamped from the jungle's prototypes; coconut and sugar palms from
veg/palms.ts; bananas, papayas, bougainvillea); the pond's mist
(`_bhMist.ts`: thick at dawn, a veil at night, nothing by day). Lamps in the
windows, the stoves' embers and the candles are glows and halos
(village/_lights.ts), no light; smoke at dawn and supper time
(village/_smoke.ts); roosters at dawn, hens by day.

The morning market (ផ្សារភូមិ: `_bhMarket.ts`, where it stands:
`_bhMarketPlan.ts`, its people `people/_sceneBackMarket.ts`) is the hamlet's
heart and the first thing a traveller on the back trail sees: round the
crossroads where the lane comes down off the rise, by the sala and the cart,
under a big old tamarind that stands across the trail from the lane (the
way down from the hamlet ends on it; a bamboo kre in its shade). In its own
frame (`s` along the trail from the junction, + east; `t` across it, +
north) the trail's band (`|t| < 2.2`: walkers, the cattle, bicycles) and the
lane's stay clear. North of the trail: the breakfast stall under a faded blue
tarp — num banh chok and rice porridge (bobor) in aluminium pots on clay
charcoal stoves, steaming (hamlet/_mkSteam.ts), noodle nests and herbs, bags
of iced coffee on a cooler, the painted sign "នំបញ្ចុក" (_mkSign.ts) hung
from its front pole, a low table and plastic stools beside it toward the
lane, an LED tube lit before sunrise —; east of the lane the hamlet's own
produce on a raised bamboo platform under a green parasol (palm sugar, rice,
duck eggs, fresh palm juice). South of the trail, along the tree's shade:
the fruit table under a red parasol with hands of bananas hung from a
bamboo rail, the vegetable seller on the ground under her umbrella, the
fish seller with her basins, the baskets and shoulder pole she carried them
in, the num krok seller at her clay griddle (its cups of batter, embers
under it, trays of num ansom and num kom, a battery lamp on a stick). Bicycles
and a moto parked east of the lane's foot, banana leaves dropped while it is
busy, trodden earth round the stalls. Built with the east market's kit
(`_mkKit.ts` tarps, parasols, tables, platform; `_mkGoods.ts` goods), into
a builder of its own whose boxes are tagged; the hamlet appends them after
its own (the same four voxel meshes) and shows and hides the tagged ones as
the day goes (`_bhToggles.ts` `BackToggles`: goods, sheets, spread tarps,
open parasols; rolled tarps, folded parasols; the busy morning's bicycles —
all soft, so the walk maps never keep what has gone); its lamps are among
the hamlet's glows, switched on and off (`LampSwitch`: the breakfast LED
before sunrise, the stoves' embers while their stalls are open, the num krok
lamp in the evening). The day (`clock`): the sellers come in the blue hour
(0.69‥0.72, the fish first), the busy morning is 0.72‥0.9, they pack up
toward noon (the fish 0.84, the vegetables 0.88, breakfast 0.9, the rest by
0.93), in the afternoon only the juice cart, and from the golden hour into
the evening (0.05‥0.31) the num krok seller again, her lamp lit after dusk.
Shops (shop.ts `registerShop`, `registerBackShops`, real riel): `back-breakfast`
(num banh chok 4 000, bobor 3 000, iced coffee 3 000), `back-produce` (a
bundle of palm sugar cakes 2 500, fresh palm juice 1 500), `back-fruit`
(green mango with chili salt 2 000, bananas 1 500, rambutan 3 000),
`back-krok` (num krok 2 000, num ansom 1 500), `back-coconut` at the cart
(green coconut 3 000, sugarcane juice 2 000, water 1 000; open with the
seller, 0.8‥0.27, not in a storm); the vegetables and raw fish are for
cooking at home, not shops. The buyer's spot is in front of each stall's
goods (at the breakfast stall its serving table, under the tarp; the
explorer's a little further out than the market's own buyers stand,
`BUYER_ROOM` in `_bhMarket.ts`, and at the cart the counter's east end, clear
of its sign, the low table and the stools, so no block stands at the edge of
his body); the seller there hands it over (people/_saleBack.ts).

People (`_sceneBackKids.ts`, `_sceneBackAnimals.ts`, `_sceneBackFolk.ts`,
`_sceneBackMarket.ts`, `_sceneBackSchool.ts`): four children at the pond on
hot afternoons (`clock` 0.9‥0.18, not in a storm nor in snow: run down the
jetty and jump in, arms up — `splashPlay`, a splash of foam and drops —,
swim, splash each other, climb out by the ladder or the stones; the little
one sits on the jetty and cheers; home at dusk); two water buffalo
(fauna/_landBuffalo.ts) lying in the wallow by day, on the mud of the bank at
night, lifting their heads at the explorer (`buffalo`); four white cows
(people/_ox.ts) grazing in the meadow south of the trail with their old
herder under the big tree, walked home in a line along the trail, through
the market's crossroads and up the lane into the pen from `clock` 0.05
(`cowBell`), out again from 0.78; the forest monk riding his bicycle
(people/_bicycle.ts) from his hut at dawn (0.76‥), stopping at the market
(the breakfast cook and the fruit seller kneel and give, he blesses them:
`nod`), then up the lane to the yard, where two women kneel and give rice
wrapped in banana leaf (`give`), and home; a villager in a palm-leaf hat
riding out east in the morning and back in the afternoon, stopping at the
cart (`bikeBell` for the explorer in the way); two schoolchildren in white
shirts and navy on their bicycles down the lane and east along the trail at
0.86, home at 0.06; the juice seller on his low stool, calling out when the
explorer comes up (a bubble: `bhCoconut`), getting up to chop a coconut
(`chop`) for the villager or when the explorer opens his buy menu; the
market: a seller (kind `vendor`) a stall, walking in with her basket on her
head while the explorer is near (else simply there), round to her place
behind her goods (squatting, on her stool, on the platform, standing at the
counter), calling now and then (`vendorCall`; the bubbles `bhBreakfast`,
`bhKrok` and the east market's `mk…` words), talking the price, the breakfast
cook turning to stir her pots (`stir`), the num krok seller bent over her
griddle (`sizzle`), packing up and walking off with her basket; buyers
(four in the busy morning, one at quieter times and one at dusk for num
krok) down the lane or along the trail, one to three stalls (`talk`: "ប៉ុន្មាន?",
`give`: "អរគុណ!"), home with a basket on the head or a bag; an old man and a
boy eating num banh chok at the low table (`eat`); the grandfather in his
hammock through the hot hours, on the veranda in the evening; a woman
sweeping the yard morning and late afternoon (not in the rain), cooking at
her stove at dusk (`crackle`); the weaver at her loom all day (the shuttle
across the warp, `knock`); evenings on the verandas; home at night. In the
rain the herder, the buyers and the breakfast eaters walking put umbrellas up
(`_sceneBackKit.ts` `raining`, `withUmbrella`). Sounds of the market: the
murmur (`market`, soft), the calls, the griddle. Nature book: the lotus,
the sugar palms, the `buffalo`, the cows (`ox`), the villagers, the monk, the
children, the sellers (`vendor`).

Cost: ≈ 6.1 k blocks (the market ≈ 1.1 k of them) in four voxel draws
(bark, leaves, cloth, stone; the palms' three, glows, halos, smoke, steam,
mist), built in ≈ 30 ms (the market ≈ 2 ms); hidden past 430 m (the overview:
nothing drawn), blocks cast only while their shadows can be seen; the
toggles write only the instances that change, a few times a day; its people
26 in the crowd (12 of them the market's, 2 the schoolchildren), 220 thing
boxes, the animals two instanced draws (+ shadows, near), ≈ 0.05–0.08 ms a
frame near, ≈ 0.01 ms far, nothing past 360 m. Checks:
`cam=136,12.4,-328,104,19,-270&clock=0.8` (the market at the foot of the
rise, Angkor Wat's towers over it: the hamlet's picture),
`roam=walk&at=165,-283&yaw=-121&sim=w:2,_:0.5&rcam=0,12,9&clock=0.8`
(coming along the back trail from the east: the market under its tree),
`roam=walk&at=96,-323&yaw=69&sim=w:2,_:0.5&rcam=0,12,9&clock=0.8` (from the
west, past the sala), `roam=walk&at=127,-304&yaw=150&sim=w:1,_:0.5&rcam=0,12,9&clock=0.85`
(at the crossroads, up the lane), `cam=133,9.2,-289,125,7.2,-312` with
`clock=0.7|0.8|0.95|0.26` (the blue hour, the busy morning, noon packed up,
num krok at dusk), `cam=118,8.8,-305,126,7.8,-313&clock=0.7` (breakfast at
dawn), `cam=127.8,8.4,-305.6,123.2,7.2,-309.6&clock=0.78&bhmonk=19` (the
monk blessing at the market; `bhmonk=15` the gifts; the yard's alms
`cam=150,11,-353,145,9,-345&clock=0.85&bhmonk=47`),
`cam=127,8.6,-301,133,8.4,-316&clock=0.87&bhschool=3` (the schoolchildren
down the lane), `roam=walk&shop=back-breakfast&clock=0.87` (at a stall's buy
menu; `back-coconut`, `back-fruit`, `back-krok`, `back-produce`),
`cam=150,11,-350,60,40,-260` (Angkor Wat's towers over the yard),
`cam=108,9.6,-343,110,8.2,-352` (the jetty: a boy in the air),
`cam=92,10.5,-340,110,7.5,-356&clock=0.78` (dawn mist on the pond),
`cam=116,9.5,-310,140,8,-298&clock=0.12` (the herd on the trail),
`cam=154,11.5,-338,166,10,-331&clock=0.95` (the weaver's porch),
`cam=150,12,-328,146,9,-352&clock=0.5` (night), with `people=back`,
`bhkids=<s>`, `bhherd=<s>`, `bhmonk=<s>`, `bhbike=<s>`, `bhschool=<s>`,
`bhopen=all|none`, `pondmist=1`, `weather=rain`.

## Preah Ang Thom, the reclining Buddha of Phnom Kulen

On the summit plateau east of the Kulen temple (`landmarks/_kulenBuddha.ts`,
built by `kulen.ts`; `RECLINING` there: the boulder's middle (409, −445), its
floor at 150, level with the temple's pad), as at the real Wat Preah Ang Thom:
a great sandstone boulder (1 m blocks, swelling a third of the way up, its
layers banded, moss and ferns on its rim and ledges), the reclining Buddha
(sacred `reclining`, 10 m long) on a carved bed along its top, facing south,
his head to the west; a two-tier Khmer roof on white posts over him (terracotta
tiles, gold bargeboards ending in three-headed naga hoods at the eaves,
slender hooked chovea at the ridge's ends, a gilded gable at each end:
`sacred/gable.ts`), lanterns under the eaves; before his chest an altar under
a red cloth (incense, candles, lotus, bay sei, fruit, a marigold garland),
white parasols at his head and feet, a donation box, Buddhist flags. A stair
climbs the rock's south face between naga balustrades (the naga's smooth
body down the cheeks, a fan of seven heads under one hood with a gilded
flame-leaf halo at the foot) from a gate: white posts, a lintel with a name
board painted in Khmer (`rbGate`, `rbGateSub`), a small Angkor tower with a
lotus bud on it, a stone elephant either side. A paved way leads to the gate
from the foot of the temple's grand stair (`RECLINING.way`, for pilgrims:
the way, the stair, the kneeling place). Worship spot `kulen-buddha` on the
rock's floor before the altar (roam/_worship.ts). Hidden blocks keep the
explorer off the Buddha and the parasols. About 1 700 blocks in the Kulen
landmark, built in ≈ 100 ms (most of it the first bay sei and fruit plate
sculpts; the gables 11 ms); the Buddha's meshes: far ≈ 36 k triangles (up to
420 m), near ≈ 111 k (within 40 m), each sculpted in the worker in ≈ 0.65 s
and ≈ 2 s. Checks: `cam=386,168,-412,408,150,-445` (from the air),
`roam=walk&at=406.5,150,-440.5&yaw=180&sim=_:0.5&rcam=0,14,9` (on the rock),
`roam=walk&at=406.5,150,-441.5&yaw=180&sim=e:0.1,_:5` (he kneels and prays),
add `clock=0.27` for dusk (candles, lanterns).

## Phnom Kulen's people

Cambodians go up Phnom Kulen on weekends and holy days: families picnic by
the Kulen waterfall, pilgrims climb to pray. Hamlet piece `kulenPicnic`
(`src/map/hamlet/_kulenPicnic.ts` and its `_kn*.ts`) and the people's scene
`kulen` (`people/_sceneKulen.ts`, `_sceneKulenPilgrims.ts`,
`_sceneKulenKit.ts`). Where everything stands is found in the land at build
time (`_knSite.ts`, no three.js, the same answer for the piece and the
people: `kulenSite(field)`, `roadStall(field)`), so it follows the world
pass's shaping of the stream: the Kulen stream's lowest big fall near
`KULEN_PICNIC` (`field.falls`: now the 18 m curtain into the Kulen pool)
and where its water lands, the pool's level, two levels of land — the
levelled terrace (10 m) and the beach by the water (8 m; the same level
where no step comes between) — and how far the water is from every metre
of them; 4–6 picnic huts facing the pool, turned toward the fall (first on
the beach with their fronts out over the shallow water, then along the
terrace's edge, then a row behind; clear of the picnic trail and of each
other), flights of laterite steps from the terrace's edge down to the
beach (one by the trail's end, one by the children's way to the water),
the food stall on the terrace, motos parked by the trail's end on its
level, the sign where the trail comes in, the children's rock, the water
they wade in and where they go in (`bank`), stepping stones out to the
rock, the seller's round; and a walk grid over both levels and the steps
(`terracePath`: A* round the huts and the stall, from one level to the
other only by the steps, remembered). The people stand on the built place
through its own walk map (`KN_BUILT`: the steps, the decks, the rocks).
The build: the huts (`_knHut.ts`: a split-bamboo deck on bamboo posts, open
all round, a plain gable of dried palm thatch — no horns at the ridge: those
are Thai —, a bright woven plastic mat, Khmer triangular pillows, a tin
lantern on the front beam in four of them, the ropes of a hammock on the
back posts; one hangs empty), the food stall (`_knStall.ts`: bamboo under a
faded blue tarp, the counter, a long charcoal grill low on its legs beside
it, the red cooler, crates of drinks, bananas and snacks hanging, a chalk
board, a low table with low plastic stools at the people's `FIT.stool`
height), dark boulders at the fall's foot, the children's big rock, the
steps, ferns, bananas and stones round the rim, the sign (a board on posts,
its words painted on a canvas in Khmer — "ទឹកធ្លាក់ភ្នំគូលែន", "សូមស្វាគមន៍",
English on the switch: `knSign`, `knSignSub`; `_knSign.ts`), the place's
neak ta at the foot of a big shade tree (`_knShrine.ts`: a little stone
shrine shaped like an Angkor tower on a laterite plinth, bay sei, incense,
candles, marigolds, bright cloth round the trunk); and at the mountain
road's foot, where its long stair leaves the land, the pilgrims' drinks
stall (the sugarcane-juice cart with its green press, water in crates, the
cooler under a striped parasol, low stools facing the road). The huts'
lanterns and the shrine's candles are glows with halos, lit at dusk while
the last families linger (`_knFx.ts` `lanternsLit`, clock ≈ 0.18‥0.33), the
grill smokes while the stall is open (`grillBusy`): no light is added.
Solid in the walk map (decks, steps, rocks, stones: the explorer walks on
them; cloth is soft); the terrace, the huts, the steps, the stall, the
shrine's tree and the road stall are kept clear of trees (`field.occupy`).
People (scene `kulen`): three families come by moto (it stands by the
trail's end while they are there; `moto`), walk in along the beach and up
the steps to their huts and climb onto the decks: they sit round their food
on the mat (rice, grilled chicken, fish, fruit: the people's things), look
at each other and at the fall, a father stands at the deck's edge to point
it out; in two huts someone lies in a hammock between the back posts
(`POSE.hammock`, its seat at the sag's lowest point: `FIT.hammock`),
swinging (a rig of the people's things, swung only within 70 m); by day
(`clock` 0.86‥0.16, not in rain) their children play in the pool: one climbs
the big rock and jumps in (a splash of foam and drops, `splashPlay`), the
others wade and splash, laughing (`laugh`), out of the water by the bank at
the day's end; a fruit seller walks round the huts where a family is, her
basket on her head (`CARRY.head`), stopping to hold out her fruit (`give`,
`vendorCall`); the cook works over the grill (`POSE.stir` at `FIT.wok`) and
sells at the counter, a young man eats noodles on a low stool at the table
(`eat`: over the stool itself, his feet out under the table's edge; held
there on the terrace with `ride`, else the walk map would stand him on the
stool's top or the table's); soft
chatter from the huts (`market`), the grill's `sizzle`. Each family on its
own hours (0.78‥0.2, 0.81‥0.25, 0.84‥0.29); home at night. Everyone moves by
a small plan (walk a path, hop up onto a deck, into the pool, onto the
rock, stay). The pilgrims (`_sceneKulenPilgrims.ts`): three groups on loops
of their own — a family (a grandmother in white with her sash, the parents
in their best, a child), three yeay chi (old lay nuns: shaved heads, all in
white), a monk and a novice under saffron umbrellas — climb the road's long
stair in pairs, keeping right (they stop at the side for the explorer as
the monks do), kneel in a row at the stair-foot shrine (`kulen-stair-foot`)
with lotus buds and incense raised between their palms (`FEAT.offering`),
bowing the head low over their hands now and then, then walk down the grand
stair and along the paved way to the reclining Buddha in single file
(`RECLINING.way`, up the rock's 2 m stair; the walk stops 2.2 m short of
the explorer's kneeling place) and kneel before him (`kulen-buddha`); back
down the road, a rest on the stall's low stools (`stool`, `eat`), home, and
again. The kneeling rows (`KneelRow`) are shared by the groups: nobody
within 1.2 m of the explorer's own place or right behind it (his view), the
monks nearest it (their umbrellas put down), the laity to either side, rows
behind (at the stair's head, where the floor steps down behind, beside the
offerings ahead); the rock's floor before the Buddha takes them 2.6 m to
either side. At the summit by day an old woman kneels and bows, an old man
lights incense at the altar, a young woman sits on the parapet looking out
over the land in the afternoon and golden hour; the drinks stall's seller
on her stool and an old man resting there. Umbrellas in the rain; after a
night at home each group starts the morning where its own loop has it (the
fast day cycle is shorter than a visit to the top); a page opens (and a
still is taken) on the family kneeling at the shrine, the yeay chi halfway
up the stair and the monks before the Buddha. Nature book: `pilgrim` by
kind (monks as monks), the picnickers as villagers, children, sellers
(`vendor`). Cost: ≈ 1.55 k blocks, built in ≈ 20 ms (the site ≈ 15 ms:
`[map] kulenPicnic: …` names the levels, the steps, the fall, the rock and
the stalls it found); 4 voxel draws a place (the picnic place and the road
stall built apart, each culled on its own; shadows only while they can be
seen), the glass, halos and smoke (hidden past 480 m), the sign's words
(past 110 m); 27 people in the crowd (fewer, a group at a time, if the
crowd is full), ≈ 230 thing boxes; the scene's own step ≈ 0.014 ms a frame
at the picnic, ≈ 0.01 on the road or the summit, ≈ 0.001 from Angkor Wat,
nothing in the overview (hidden past 420 m, the pilgrims past 360 m, each
group by its own distance; seated people stepped every third frame; no
allocation a frame). Checks (with `people=kulen` and
`parts=terrain,path,kulen,water,hamlet,vegetation,people,foreground` to go
faster): `roam=walk&at=460,-300&yaw=-100&sim=_:0.5&rcam=10,8,9` (from the
far bank: the huts, the pool, the fall, Angkor Wat far off),
`cam=426.9,11.9,-293.0,441,11.5,-310` (from a hut, looking at the fall),
`cam=453,13,-292,433,8.5,-305` (the pool and the beach hut; `clock=0.25`
dusk: the lanterns), `kulen=0.3` (the child on the rock 0.3 s before he
jumps), `pilgrims=up|shrine|toBuddha|buddha|fromBuddha|down|rest` (every
group in that part of its loop), e.g. `pilgrims=up&cam=350,90,-338,339,83,-351`
(the yeay chi on the stair), `cam=312,122,-317,341,84,-352` (the stair from
the air), `clock=0.06&cam=379.5,157,-411,369.5,151.8,-425` (the summit at
golden hour), `cam=406.5,153.2,-437.2,406.5,151.8,-447` (the monks before
the Buddha), `pilgrims=toBuddha&cam=372,162,-404,395,146,-424` (on the paved
way).

## People

The `people` part (`src/map/people/`, index.ts has the map of it): one
blocky person model for everyone (`_personModel.ts`: boxes on 15 bones,
poses, props and colours per person, posed in the vertex shader; kinds in
`_kinds.ts`: monk, visitor, guide, kid, fisherman, dancer, villager,
vendor, tapper, pilgrim — hats are the Khmer palm-leaf hat `hatPalm` or a
krama, never a conical hat; the apsara wears the Khmer crown with three
spikes, never the Thai chada),
`Actor` (`_actor.ts`, `ride` for boats and carts), roads and traffic
(`_routes.ts`), and scenes (`PeopleScene`, `_scene.ts`; far off they step
less often or hide, `Pace`): the monks and the sweeper (`_monks.ts`), the
tour group (`_tour.ts`), fishermen with cast nets on the great lake, the
valley river and the shallows (`_sceneFish.ts`), the ox cart on the village
trail (`_sceneCart.ts`, white oxen in the fauna kit's style `_ox.ts`; it
stops for the explorer and people step round it), kite flyers (`_sceneKites.ts`,
**Kites** below: children south of the west paddies, families flying big
khleng ek south of the east paddies in the dry season), farmers by the season
(`_sceneFarm.ts`: planting ≈ 0.08‥0.3, weeding, reaping and carrying
sheaves ≈ 0.6‥0.8, resting under a sugar palm), village life
(`_sceneVillage.ts`: verandas, the jetty, children playing, the monk's
alms round; on the village's own walk map), the floating village's market
(`_sceneVillageMarket.ts`: its sellers, the women selling from boats at the
jetty, buyers and eaters), apsara dancers
with torch bearers, standing torches and a pinpeat ensemble in front of
Angkor Wat's gate at night (`_sceneApsara.ts`, `clock` 0.22‥0.51), and the
new life: the morning market (`_sceneMarket.ts`), the palm sugar family
(`_scenePalmSugar.ts`), the east village (`_sceneEastVillage.ts`), Kulen's
pilgrims and picnickers (`_sceneKulen.ts`), the hamlet behind Angkor Wat
(`_sceneBack.ts`). Each scene's module loads on its own (index.ts
`SCENES`): one that fails to load or build is logged (`[map] people scene
"x" failed`) and left out. Their things (boats, cart, kites and strings,
the thrown net and its foam ring, torch stands, the stall, bicycles:
`_bicycle.ts`) are boxes of one InstancedMesh written from the CPU
(`_things.ts`: `Rig`, `RigDef`). Sounds
(`PeopleCallKind` into `f.calls`, made by `audio/people.ts`): ox bells, the
cart's creak, a net's splash, children laughing (ambience bus), the pinpeat
(music bus); the new life's (kites, market, voices, work): **Sound of the
new life** below. Checks: `people=lineup`, `people=<scene>,…` (only those),
`monks=`, `tour=`, `fish=<s>` (a throw: 5 the net flying, 6 the splash),
`cart=<m>` (along its loop: ≈ 100 on the dikes), with `season=0.2|0.68`,
`clock=0.35|night=1`; e.g. `people=apsara&clock=0.35&cam=-16.5,61,-146,-16.5,57,-158`,
`people=farm&season=0.2&cam=-238,12,77,-246,8.3,70`,
`people=kites&cam=-215,12,128,-255,26,106`,
`people=cart&cart=95&roam=walk&at=-180,83&yaw=-90&sim=_:3&rcam=0,14,10`.

**The person model** (`_personModel.ts`; the people-core pass). Boxes on 15
bones (the feet can stay level: `pFlat`), ≈ 260 boxes for the near model
and ≈ 60 for the far one (`buildFarModel`: the body's big blocks, eyes,
hair, hats, skirts, big props), both posed by the same shader. Poses
(`POSE`, eased in the shader): stand, look, point, photo, sweep, sit,
sampeah, bow, talk, wave, dance, cast, kneel, plant, reap, row, cheer, and
for the new life `climb` (a pole ladder: the gait drives it —
`gait(i, 1, crowd.climbRate(i, speed))` while the scene raises the person
`speed` m/s, a negative speed climbs down; `gait(i, 0, 0)` holds on, the
right hand working at the crown, the knife slicing), `squat` (the Khmer
squat, heels down, forearms on the knees), `stir` (a long paddle in a big
wok, a slow round stroke), `stool` and `eat` (on a low stool; the bowl in
the left hand, a bite every few seconds), `give` (both hands held out, a
little bow), `ride` (a bicycle: the pedals turn with the gait's phase,
`phaseOf` for the crank; `_bicycle.ts` builds a bicycle that fits),
`hammock` (lying back along the heading, a knee up, hands on the belly)
and `nod` (a monk's greeting: one slow nod as the pose begins, the right
hand raised in blessing). Where the body meets the scenes' things is
`FIT` (model metres × `crowd.scale(i)`): the climber's pole `reach` ahead
and `rise` a cycle, the stool's seat, the wok's middle, the bicycle's
saddle, bars, crank and `gear`, the hammock's head and feet. Carries
(`CARRY`): … `head` (a basket on the head: held, the right hand reaches up
and steadies it; let go, it rides balanced and both arms swing) and `tray`
(a woven tray at the belly in both hands: it shows only while held, or
offered in `give`). New features (`FEAT`): `tubes` (bamboo juice tubes at
the tapper's back), `knife` (in the hand, blade down; in its holder at the
hip while climbing), `paddle` (shows in `stir`), `smallBowl` (and
chopsticks), `headBasket`, `tray`, `parcel` (held out in `give`), `pouch`
(the seller's money pouch), `sash` (the sbai, white for the pagoda),
`offering` (lotus buds and incense with glowing tips: between the palms in
the sampeah, bow and kneel poses, else in the left hand). Kinds
(`_kinds.ts`): … `vendor` (a bright blouse and sarong, a krama or the
palm-leaf hat, the pouch; `goods`: fruit, greens, fish, sweets), `tapper`
(bare-chested or a faded shirt, a krama round the head, shorts or a rolled
sarong, barefoot, tubes and knife), `pilgrim` (`elder` in white with the
sash, `yeaychi` — an old lay nun: head and eyebrows shaved, all in white —
or `best`, a family's silk colours; `props: [FEAT.offering]`). The apsara
wears the Khmer crown (mokot) with three tall spikes and jasmine strands
at the sides — never the Thai chada.

**Cost.** The people part's crowd is packed each frame (`new Crowd(n,
name, { lod: true })`): the people shown go into two lists, near (the full
model) and far (the far model, once smaller than `LOD_SHARE` of the
screen's height: an adult ≈ 45 m away on low, 70 m on medium and high,
100 m on max; back near at 12 % bigger), each an InstancedMesh of that
many instances (one material: one shader); hidden people are in neither
and cost nothing, an empty list is not drawn. Only what changed is copied
into its slot and sent up. 6 draws (near, far, things: each + its shadow),
and the oxen's 2. The shader folds a box that is not worn before any
posing. The festival's crowd keeps instance = person (`mesh.count` its own).
On the level of still shadows (low: people cast none) a person out of the
camera's view is in neither list (`pack`: a sphere round them, reaching a
raised flag, a kite's string, the pole's loads); on medium and up, where
their shadows are drawn, only while the people part has turned them off.
**The bone pass** (the perf-people pass; `BONE_VERTEX` in
`_personModel.ts`): posing in the vertex shader ran the pose's whole chain
for each of a person's ≈ 6 300 vertices (262 boxes; ≈ 1 400 far), folded
boxes aside. Now once a frame a quad for each person shown is drawn into
a small float texture (a row a person: 46 texels, three a bone — its turn
and shift after the whole chain — and the show rules), and a vertex only
reads its bone's three texels. Two textures take turns: the crowd reads
the one drawn the frame before, posed a frame ahead (the frame's geometry
then never waits on the pass, which would wait on the last frame's
pixels: in the overview that stall cost ≈ 1.5 ms); a person just shown is
drawn from the next frame; a still (`shot=1`) draws and reads one. The
festival's crowd too. A renderer that cannot draw into float textures
(nor half floats) poses every vertex as before; `pbones=0` in the URL does
that (to compare: the same picture, a few edge pixels). Measured (M1 Max,
the crowd alone on the GPU, phone = low at 844 × 390; `market` = walking
into the market's stalls): overview 0.15 → 0.03 ms + 0.03 the bone pass;
the market walk (perf's `east`, facing away) 0.42‥0.5 → 0.02‥0.04 + 0.03;
the market's stalls 0.44 → 0.05 + 0.03; Kulen 0.4 → 0.03‥0.06 + 0.03; the
floating village 0.3 → 0.03‥0.08 + 0.03; medium, the market 0.48 → 0.09 +
0.03 (and its shadow pass the same again). Triangles in a walk on low:
0.12 → 0.04‥0.06 M (out of view left out). CPU: the bone pass is one
more small draw and render target (≈ 0.05‥0.09 ms a frame, most of it
binding the target), the crowd and things ≈ 0.1 ms, the people part
0.25‥0.37 ms in all, most of it the scenes' own steps (a shot prints
`[map] people CPU by step`). `keepApart` sweeps the people sorted by x;
`Traffic.dodge` looks only at the animals and the explorer.
Checks: `people=lineup` (three rows along the valley road, each on dry
ground — a row that water came to moves on up the road: kinds, poses, and
the new life with what each fits: a pole, a stool, the stove and wok, a
bicycle, a hammock; the console gives a camera in front of and beside each one),
`lineupone=new:8` (only that one, to look from any side),
`lineupturn=<rad>`, `lod=near|far` (everyone in that model; the far one up
close to check it), `pbones=0` (no bone pass). The shot's console:
`[map] people: … drawn N near + M far of P (T k triangles)` and the CPU
(`the crowd and things` apart).

**Greeting back** (`_greetBack.ts`, one call in index.ts `live()` after the
scenes' steps; the explorer's side: Roaming, Greeting). When he greets
(`greet.ts GREET`), those who can see him answer, each after 0.2‥0.9 s (the
nearer first), and hold it ≈ 2 s. His sampeah: up to six within 8 m in
front of him (close by, 4 m, whoever can turn round notices him from
behind too); grown-ups (villagers, sellers, the tapper, fishermen,
pilgrims, the guide, the dancers before their show) turn to him and sampeah back — an elder
(grey hair) nods low over the palms, someone sitting on the floor comes up
on the knees (`POSE.kneel`); children wave, some hop; monks never sampeah
lay people: they nod (`POSE.nod`), and now and then bless him; visitors
wave. His wave: up to four who see him within 20 m wave back, children
first, then visitors. Busy people keep at it (rowing, the dance, a net
mid-throw, bent over the paddy, up a ladder, a load on the head or the
pole, a kite's string or a torch in the hands, a show: `Actor.performing`,
the apsara dancers and the seated pinpeat players, who never stop playing
or kneel up) and only turn the head to him, a little nod;
walking people answer on the move (a nod, a child's wave); riders and
people sitting do not turn round. The three nearest say it in a bubble of
their own (`Bubble`, words `gr…` in `ui/lang.ts`: "ជម្រាបសួរ",
"សុខសប្បាយទេ?", "សួស្ដី", a seller "អញ្ជើញ!", an elder "សុខសប្បាយទេ ចៅ?",
a child "សួស្ដី!", a monk "សូមឱ្យសុខសប្បាយ", a visitor "Hello!") with a
voice (`hello`, `kidHello`; a child may `laugh` after). While they answer
`Actor.held` keeps the scene's own pose waiting (`release` puts it back)
and holds the head on him; the scene turns them back its way after. Not
again for 8 s each; nothing runs between greetings. Shots log
`[map] greet: …` (who answers, how, how far). Checks: `sim=f:0.1,_:1`
greets as F does, e.g. the fruit stall
`people=village&roam=walk&at=-296.5,74.5&yaw=148&sim=f:0.1,_:0.9&rcam=20,12,8`.

**Selling to him** (`_saleBack.ts`, one call in index.ts `live()` after the
greetings back; the explorer's side: Roaming, Buying). Whoever sells at a
shop he is at (a `vendor` first, else the grown-up nearest behind its
counter: `shop.ts BROWSE` says where he stands and faces; looked for again
now and then while he waits, as she may still be walking in): when he opens
its menu she looks up at him and asks "ទិញអីដែរ បង?" (a bubble, a voice),
her eyes on him while he chooses; when he pays (`SALE`) she turns to him,
holds it out in both hands with a little bow (`POSE.give` and the
`parcel`, worn for the moment by whoever has none) and says "អរគុណបង!";
≈ 2.4 s later the scene's own pose comes back (`Actor.held` / `release`).
Someone the greetings hold is waited for. Nothing runs between sales.

**Kites** (`_sceneKites.ts`, the kites `_kite.ts`; the kites pass). The
ខ្លែងឯក **khleng ek** as Cambodians describe it: a bird of prey seen from
below, a little taller than wide (2.2 × 2.4 m, 1.04 × 1.39 m) — the
**mother** (មេ: the big upper wings on one bent bamboo, painted along it;
pointed tips on a "male" kite, which sings deep, rounded on a "female",
which sings high), the narrow **waist** (ចង្កេះ), the **child** (កូន: a
smaller pair of wings), the **duck's foot** (ជើងទា: two splayed toes) with
two long tails of dried sugar-palm leaf; on its beak the **ek** (ឯក), an
arched bow of old bamboo as wide as the mother strung with a paper-thin
ribbon of rattan that hums (the ribbon shimmers: a fast twist). The
children's own is the tail-less **khleng kandaung** (ខ្លែងកណ្ដូង), a
diamond they dart about (the old "crow kite" is gone: there is no such
Khmer kite; ខ្លែងអែក is another spelling of khleng ek). A kite is a `Rig`
of the people's things plus loose boxes for its line (8) and its tails
(2 × 4): a khleng ek 44 boxes, a kandaung 12. `Kite.fly` puts it downwind
of a hand or a stake at the line angle the wind holds, its face down the
line (from the flyer it shows its whole outline) and its nose into the
wind, bobbing, the tails waving; by day a faint glow through the paper
(`light`), none at night. The wind: `f.weather.windDir`, followed over
8 s, strength `0.55 + 0.8 · wind` aloft. **The children** (south of the
west paddies; any season but rain, `clock` 0.86‥0.2, home before dark): two
kandaung, the eldest's small khleng ek, the small one running between
them. **The families** (the grass south of the east paddies, x 405‥430, z
78‥106), in the kite season (`season` 0.6‥0.97: after the Water Festival,
through the harvest, to March; each kite its own weeks) from the early
afternoon (0.93) into the night (≈ 0.3): the grandfather's big male kite
(his son, a grandchild running between the families), a family's female
kite (the father; the mother and a daughter on a woven mat), two young
men's (brought in at dusk). They come round the paddies from (404, 73),
launch (30 s) and fly; at nightfall the grandfather and the father tie
their lines to bamboo stakes (bent over them, `POSE.plant`) and walk home,
and the two kites hum over the empty fields through the night and the
morning, until the families come back and untie them. Rain, a storm or
snow brings every kite in. Each flying khleng ek sends a `kiteHum` every
3.2‥5.6 s while the listener is within 240 m (`gain` from the wind and its
size; `size` the size its bow sings for: its own, × 0.62 for a female:
≈ 150, 175 and 250 Hz in the east, 450 Hz the child's). The grandfather
asks the explorer "ឮសំឡេងឯកទេ?" (`ktHear`), the eldest child boasts
(`ktHighest`). Nature book subject `khlengEk` (a flying khleng ek). Cost:
12 people, 204 thing boxes (< 0.1 ms a frame); people hide past 480 m,
kites past 900 m, and step every 3rd or 6th frame from 220 m (`Pace`). Console: `[map] kites:
…` (spots, boxes) and in shots `[map] kites up: …` (each kite's middle,
for close cameras). Checks: `people=kites&cam=-215,12,128,-255,26,106`
(the children), `people=kites&season=0.9&cam=440,11,112,405,30,84` (the
families; `clock=0.25` dusk, `clock=0.4` the tied kites at night), a kite
from along its line `people=kites&season=0.9&cam=391.2,57.4,86.7,384,69.2,85.6`.
Sources: windmusik.com/html/ek.htm (the parts, the bow, flown at night),
drachenkite.com (Cambodian kitemakers: tied to a stake over the fields at
night; the kandaung), cambodianess.com (Khlaeng Ek … sings above the rice
fields: sizes, rattan tongue), khmercivilization.ams.com.kh (ខ្លែងឯក: parts,
tails 10‥20 m, flown by grown men and elders), yosothor.org (flown at
dawn in the north wind), soniccambodia.org, Google Arts & Culture (Soeung
Vannara's khleng ek, 104 × 139 cm).

## Sound of the new life

The update's sounds (`src/map/audio/`, the sound pass), all made in the
page (no new recordings), gentle, and placed like the animals' calls:
louder and brighter close by, panned, a little late far off, more of the
valley's echo.

- **The people's calls** (`PeopleCallKind` into `f.calls`, placed by
  `audio/people.ts`, ambience bus; at most eight at once, two of a kind):
  `kiteHum` (`kite.ts` `KiteVoice`: the khleng ek's ribbon buzzing like a
  reed, with a rattle; each kite one lasting voice that steps through its
  notes — 1, 9/8, 5/4, 3/2, 5/3 of its own, one every 0.6–1.2 s — entering
  each with a quick rise and sagging slower after it, the "miaow", deeper
  in a gust, a dive now and then; a call keeps it singing 6 s more: push
  one per kite every 3–5 s while it flies near; five kites at once; `size`
  the kite's, m: ≈ 440 Hz for a 1 m kite down to 150 Hz for a 3.5 m one,
  the big ones steadier; heard 250 m), `market` (a knot of people talking,
  2.5–4 s; `gain` how busy), `vendorCall` (a seller calling out,
  sing-song), `hello` and `kidHello` (`size`, if sent, the
  greeter's height: a woman's voice under 1.63 m, a man's over; the
  smallest child's under 1.2 m), `chop` (a knife on a board, a machete into
  a coconut; high over the ears the tapper's knife in the flower stalk),
  `sizzle`, `bubble`, `crackle` (phrases of 3–5 s: push one every ~3 s
  while it goes on), `knock` (bamboo tubes clonking, a ladder rung),
  `bikeBell`, `moto` (a lasting voice that follows its calls: push one
  every ~2–3 s as it rides — its speed, engine note and Doppler come from
  how far it went —; it dies away 3.5 s after the last; two at once),
  `cowBell` (a call a step), `splashPlay` (`gain` ≥ 0.7 a jump landing,
  less a splash fight; a child laughs now and then). The village's work
  and play are `life.ts`.
- **Voices** (`speech.ts`): a small formant synthesizer (a glottal pulse
  with its jitter and breath, five resonances of the vocal tract, a hiss
  and the stops' bursts) says the greetings ("ជម្រាបសួរ" in four adult
  voices, "សួស្ដី!" in three children's), six sellers' calls ("ទិញអីបង?",
  "ថោកៗ!", "ញ៉ាំអីបង?", "ចូលមើលសិន", "ត្រីស្រស់!", "នំបញ្ចុក!"), village
  dogs' barks, and made-up Khmer-like talk (heard as talk, never as words)
  for the chatter (three people with "បាទ" / "ចាស" answers and laughs, 10 s)
  and the market's crowd (six talkers, 9 s, stereo). Made once in idle time
  after the footsteps (`warmSpeech`: ≈ 0.2 s of work in slices of a few
  ms; ≈ 5 MB of buffers), at once if wanted before.
- **Beds** (`hamlets.ts`, ambience bus): the morning market (a crowd's
  murmur near and farther, sellers calling, bowls and spoons clinking;
  busy at clock ≈ 0.7‥0.95, thin in the afternoon, at night one stall's
  quiet talk), the east village (voices from the houses, dogs, the hand
  pump squeaking and gushing — mostly in the morning —, a carpenter's
  hammer, children; families on the verandas at dusk), the Kulen picnic
  (families talking and laughing by day), the hamlet behind Angkor Wat
  (quiet voices, a dog). Each from its place (`MARKET`, `EAST_VILLAGE`,
  `KULEN_PICNIC`, `BACK_HAMLET`), by the clock (`Mix.clock` from
  `f.clock`), faded from its edge (full within 8 m, −30 dB at 260 m); its
  loops run only near, its one-off sounds only while heard; quieter in
  rain, hushed in snow (people stay in).
- **The explorer** (`explorer.ts`, moves bus): `cast` (the rod's swish,
  the line running off the reel while the float flies; its plop on landing
  is `roam/_fishing.ts`'s), `reel` (the pawl clicking), `bite` (plips on
  the float), `catch` (a fish breaking out, flapping, dripping), `release`
  (a soft "shloop"), `greet` (his sleeves' rustle and his palms meeting,
  subtle); `stepSnow` on the steps bus (the footsteps above).
- **Snow** (a dream): the world hushed — the ambience, the animals and,
  less, the water muffled (a low-pass closing to ≈ 2.4 kHz on their buses,
  less echo, a little quieter: `engine.ts Bus.muffle`), the breeze softer,
  hardly a bird, no cicadas, crickets or frogs (`ambience.ts setSnow`), a
  fine hiss of the air and a slow low breath of wind (`weather.ts`); from
  `weather.snow`, and 70 % of `snowCover` once it has stopped.
- **Water** (`water.ts`): falls one after another down a river (the next
  lip within 14 m) are one cascade, from its first lip to its last pool:
  however the land steps the Kulen stream down, it stays four fall voices
  and one bed at most.

Levels (momentary, K-weighted, default volumes, measured offline; for
reference the ox bell at 6 m ≈ −31 LUFS, the paddle −31, the explorer's
steps −31, the day's ambience with the music ≈ −24 integrated): a kite at
20 m −28 (60 m −35; four singing 40 m off −27), a busy market knot at
12 m −36, a seller at 8 m −35, a greeting at 5 m −37, a child's at 6 m
−35, chopping at 4 m −33, the wok −34, the syrup at 3 m −38, the fire −33,
the tubes −34, a bicycle bell at 6 m −33, a moto passing 10 m off −31,
the cow bell −33, a jump into the water at 8 m −34; the market's bed at
its edge ≈ −30 integrated in the morning (−35 in the afternoon, −41 at
night), the village by day −35, the picnic −33; the cast −34, the reel
−35, a bite −38, a catch −30, letting go −33, his sampeah −36, a step in
snow as loud as on grass (−30); snow takes ≈ 4 dB and the top off the
day's ambience (10 dB at night).

## The day's events

`src/map/events.ts` is the event clock: `eventsNow(f)` (once per frame,
any part may call it; `EVENTS` is the same object) says which windows are
open (`on`), how often each began (`count`, `began`) and the weather's
effect on life (`shelter` 0‥1 in a storm, `umbrellas`, `hurry`, `storm`),
plus `festival` (`'water'` or `'newyear'`: the festival part's own
`festivalNow`, from `season` and the moon, `fest=`) for later parts. Hours on the clock:
`dawnChant` 0.71‥0.81, `duskDrum` ≈ 0.22 (±, seeded by `day`). In the
daylight (0.8‥0.2 of the clock; while the clock is held in the day, on a
loop of its own every 10 min): `noonBell`, `elephantBath`, `monkeyCrossing`
(3×); none start in a storm. In rain people open umbrellas and walk
faster (`umbrellas`, `hurry`: the monks, the tour group, every `Actor`);
birds stay on their perches, hunched (`fauna/_waterAirKit.ts
birdShelter`: waders, jungle birds, the flocks over the road); only the
explorer puts them up. (People do not yet go under cover in a storm.) Sound: `audio/temple.ts` (ambience bus) — the
monks' Pali chanting at dawn, the skor drum and the bronze bell at dusk, a
bell before noon, from the village pagoda and Angkor Wat, placed and faded
like the water. Animals (land fauna): the elephants' bath below the River
Gate (`_landBath.ts`: a sunlit way down found at build; the cow sprays
water over her back, the calf rolls in the shallows; drops and rings
`_landSplash.ts`), they wait for people on the road (`_landTrek.ts`, turn
back after 18 s), a macaque troop crossing the valley road at (−3, −23)
(`_landCrossing.ts`); in a storm macaques and junglefowl huddle, the
elephants stand. Checks: `event=elephantBath&t=115` (a still that far into
it; ≈ 20 s walk, 45 s down, then ≈ 60 s bathing),
`event=monkeyCrossing&t=4|6.2`, `events=1` (daylight events in a still),
`window.__events.log`, `cam=-28,8.5,41,-37.5,5.8,30.5` (the bath).

## Festivals

Part `festival` (`src/map/festival/`), when the calendar says so
(`_schedule.ts festivalNow`: `season` and the moon; `EVENTS.festival` is the
same) or `fest=water|newyear` holds one: **Bon Om Touk**, the Water
Festival (`_water.ts`, `_race.ts`: Khmer ngo racing boats — never a dragon
boat — race on the great lake by day, the village cheering on the beach;
lit floats and floating lotus candles on the lake and Angkor Wat's moat at
night — Bandaet Pratip —, families saluting the full moon), `season` ≈
0.52‥0.63 within 2.5 days of the full moon; **Chaul Chnam Thmey**, Khmer
New Year (`_newyear.ts`: sand stupas, flags and bunting, the New Year games
— Bos Angkunh, two teams of children throwing a seed to knock down the
other team's row of angkunh seeds, and Chol Chhoung —, blessings of the
elders, musicians; no water-pistol fights: that is Thailand's Songkran),
`season` ≥ 0.98 or < 0.03. The part is built only for a visit that can see
one: as the page opens when one is on or held, else in the background once
`festivalSoon` says one is within about a day of the map's time. One draw for its kit
(`_kit.ts`), one for its crowd (the people part's model), one additive glow
(`_glow.ts`); nothing drawn without a festival. Its name shows under the
title card and as a toast when roaming starts (`_banner.ts`); sound
`audio/festival.ts`. The crowd is a nature-book subject. Checks:
`fest=water&season=0.57&day=15` (add `clock=0.35` for the night),
`fest=newyear`.

## World and scale

- 1 unit = 1 m. +X east (right), −Z north (away from the camera), +Y up.
- The map is real-size: summit temple ≈ 120 m wide with a ≈ 60 m central tower,
  cliffs 10–50 m, trees 8–15 m. Overview camera at (0, 110, 170) looking at
  (0, 20, −80), 55° field of view; most of the map is 150–500 m away. The
  map: x −600‥760, z −800‥120 (`MAP_BOUNDS`), the roaming area inside it
  (below).
- Blocks: the land is 2 m blocks, landmarks mostly 1 m (0.5 m for fine
  detail), trees 1 m leaf blocks. At 300 m a 1 m block is about 3 px, so
  shape and colour of groups of blocks matter more than tiny detail.

## The map's size and the Kulen falls

The map grew east and north round Phnom Kulen: `MAP_BOUNDS` x −600‥760,
z −800‥120 (first x −600‥600, z −660‥120). The **roaming area** is two
boxes that overlap (terrain/views.ts `ROAM_BOXES`): the highlands of the six
places as before (x −450‥450, z −510‥120), and the land round Phnom Kulen
and east of it (x 230‥600, z −650‥120): walkable all round the holy
mountain, over the Kulen stream to the east lowland and its hills. Ask it
with `inRoam`, `roamInside` (metres inside, minus outside; the walker's soft
edge and the balloon's turn-back use it through roam/world.ts), `roamHeading`
(where the wind at the edge turns the hang glider, the canopy and the balloon:
home to Angkor Wat when the straight way there stays inside, else first to a
point 60 m inside the boxes' overlap — round the area's inner corner at
(230, −510), never across the gap outside it), `roamDistance`
and `pastLand` (metres past the land's end); `ROAM_AREA` is only the box
round both (the big map shows it; past the boxes the land fades into the
mist there). Past the roaming area the land sinks into the mist over
`EDGE_BAND` (150 m, square corners: heightfield.ts `edgeFall`); behind the
north hills that is from z −510 as it always was, so the overview's back is
unchanged. The sea of mist (sky/mist.ts: the land map's b is `pastLand`), the
edge mist (sky/haze.ts `hazeInside`) and the edge banks (clouds.ts) follow
that outline (the mist planes' hole too: clouds.ts `mistPlaneShape`, built
from `ROAM_BOXES`); land sunk 40 m past its end draws no blocks. New land: the
east lowland past the stream (≈ 8 m) and two mesas east of it (`east hills`,
`south-east hills`), the `Kulen east shoulder` (a lesser stepped hill over a
saddle east of the mountain) and the `north ridge` behind it, stepping down
into the mist; all behind the mountain or off the overview's frame. The
glider ramps are found in the first box, as before (launchSpots.ts
`HIGHLANDS`): the same five ramps. Land animals pick their places inside the
roaming area (fauna/_landPlaces.ts, _jungleSurvey.ts).

**The Kulen falls.** Benches cut into the mountain's south-east flank
(`bench` plateaus: inside the outline the land is set to their top), one
under the other. The Kulen stream (`RIVERS`, a width per point) rises at
the back of the high one (54 m, a spring at the foot of the flank's rock),
falls 12 m, then 16 m, then 18 m (lip ≈ (443, −314), a 14 m wide curtain:
the Kulen waterfall), into the Kulen pool (`LAKES`: (445, −302), rx 11, rz 9,
level 7 m, 0.6 m deep all over, a beach at 8 m round it) on the pool's own
floor bench; the picnic terrace (`KULEN_PICNIC`) is a bench at 10 m beside
it, the mountain's foot behind. Below the pool the stream runs on south,
6 m wide, its water at 5 m past the village. The falls face south-west, to
the overview: it sees them at its right edge, where the old stepped
cascade was. Three falls instead of eighteen: 14 falls on the map (were 29),
17 steps, 213 mist puffs (were 322); the water's sound follows `field.falls`.
The summit (x 370‥415, z −452‥−412: the temple and the reclining Buddha) is
untouched. Rocks keep out of the settled spots (`HAMLETS`, 8 m round them;
terrain/rocks.ts), and each spot's dirt reaches its own share
(`HAMLETS[].dirt`: most of the market square).

**The overview looks as it did.** The land's random picks by cell (block
tones, rocks) take the row as `k − field.row0` (`row0`: the rows the map grew
north of its first back edge, `FIRST_Z0`), the coarse tiles and the chunk
grids (terrain/lod.ts `ChunkGrid`) keep to the first rows; so with the
jungle's rows kept too (veg/scatter.ts, veg/cliffs.ts: `row0`), the overview
is the same picture but for the new falls (checked pixel by pixel).

**Cost.** Terrain 259 k blocks (218 k before): 2 m columns in the roaming
area and, past it, as far as the follow camera goes where a map camera sees
the land (12 m where none does), then 4 m and 8 m; far out a lake's bed
under water is coarse too. While the camera rests on the overview (within
3 m of it, not flying, not roaming) the land draws only what that camera
can see (terrain/seen.ts: a viewshed from it over the height field, grown by
two cells; those blocks come first in every mesh and `mesh.count` draws
just them; a mesh with none is hidden): 151 k of the 216 k land blocks in
its frame, 111 draws, fewer triangles than before the map grew, the same
picture (`landcull=0` draws all, to compare). The shadow map covers what the
overview and the places' views see (the first map: as sharp as before) and,
roaming, the roaming area (atmosphere.ts `SHADOW_BOX`). Build: land ≈ 300 ms
(a faster `fbm`, the same numbers), terrain ≈ 580 ms (were ≈ 350 and 460).
Checks: `cam=414,30,-266,447,28,-330` (the falls from above the picnic
terrace), `roam=walk&at=431,-291&yaw=152&sim=_:0.5&rcam=0,14,11` (on the
terrace by the pool), `roam=walk&at=444,-96&yaw=0&sim=_:0.5&rcam=0,18,14`
(the stream by the village), `roam=hang&at=560,160,-180&yaw=180&sim=_:1.5`
(the new land from a glider), `bigmap=1`.

## Voxels

- Build with `VoxelBuilder` (`src/voxel/VoxelBuilder.ts`): `box`, `span`, or
  `grid({ cell, origin, mat })` → `set/put/fill` → `commit()` (hides buried
  cells, bakes soft AO). Then `buildVoxelMesh(builder, { quality: 'medium', name })`
  (one `InstancedMesh` per family; casts and gets shadows; in two steps:
  `packVoxelMesh`, plain arrays a build worker can make, then
  `unpackVoxelMesh`, the meshes).
- Families for the map (`src/voxel/materials.ts`, end of `VOXEL_MATERIALS`):
  `mapRock`, `mapGrass`, `mapLeaf`, `mapBark`, `mapStone` — plain faces, a
  soft rim that catches the low sun. Other families work too (`glow` is unlit;
  `stone`, `darkstone`, `moss`, `foliage`, `bark`, `ground`), but kit families
  with a pixel pattern (`sandstone`, `soil`, `leaves`, `trunk`, `water`) are
  too fine for the map (their texels are smaller than a pixel there).
  Do not edit `materials.ts`; ask in your report if a family needs changing.
- Per block: `color` (sRGB hex) and `shade` (brightness multiplier). Use 3–5
  close tones per material, picked with the seeded `hash3` from
  `src/voxel/random.ts` — no `Math.random()`: builds must be the same every run.
- **Source traces are slow**: `VoxelBuilder.box` records a stack trace per block
  in dev. For big loops take one `const src = traceSource()` (from
  `src/feedback/sourceTrace.ts`) per builder function and pass `{ src }`.
- Glowing things (lamps, windows, beacons, the road light) should bloom: give
  them a material whose colour goes **above 1.0 in linear light** at night
  (e.g. `MeshBasicMaterial` with its colour scaled by an intensity you set in
  `update(f)` from `f.night`), and stay soft by day.
- At most one `PointLight` per part (they cost on every surface). Most light
  at night should come from glow + bloom.
- Custom `ShaderMaterial`s: set `fog: true` and include three's fog chunks
  (`fog_pars_vertex`, `fog_vertex`, `fog_pars_fragment`, `fog_fragment`), so the
  haze reaches them too.

## Sacred pieces (sculpted, not blocks)

Buddhas, stupas, offerings and the pagoda's gables are smooth sculpted
meshes (`src/map/sacred/`), so they look real up close; the temples round
them stay voxels.

- `buddhaStatue({ kind, look, height })` (`buddha.ts`): an Object3D on y = 0
  facing +z. Kinds `pagoda` (calling the earth to witness), `meditate`,
  `shrine` (+ saffron cloth), `naga` / `nagaSash` (the Angkor naga Buddha),
  `reclining` (Preah Ang Thom of Phnom Kulen, `_buddhaReclining.ts`: on his
  right side, his head propped on his right hand, the elbow on a cushion,
  the left arm along the top of his body to the hand on his thigh, the legs
  one on the other; calm, smooth volumes, no muscles; the robe over the
  whole body with bold hems at the neck, both wrists and the ankles (the
  ankle hem flaring a little over the feet, hollow), its edge thrown over
  the left shoulder and down his back, one cloth over both legs in long
  soft folds, tucked under him and spread on the bed in pleats; a saffron
  sash across his chest, gold leaf in patches on his soles; he lies along
  x, head at −x, his middle at the origin: size him by `length`, not
  `height`; look `KULEN_STONE`, sandstone, the robe a shade darker than the
  skin and its hems darker still). Every head is Khmer (`_buddhaHead.ts`): the broad
  Angkorian face, the brows one raised line, full lips with the Angkor
  smile, small curls, a conical ushnisha ending in a lotus bud — never the
  Thai flame; `pagoda` has the eyes lowered and a cord at the hairline,
  `angkor` (the naga Buddhas) the eyes closed, a diadem and ear jewels.
  Looks `gilt`, `sandstone`, `bronze` (`finish.ts` `PALETTES`). Its meshes are
  sculpted in a worker (`sculptWorker.ts`): the far one at once, the near one
  when the camera first comes close; shots wait for them (`pending.ts`).
  Preview: `sacred.html?piece=buddha-<kind>` (`-far`, `-sandstone`…),
  `buddha-reclining` (as on the map), `buddha-reclining-head|middle|feet` (up close).
- `offering(kind, opts)` (`offerings.ts`: candle, incense, lotus vase, bay
  sei, fruit, marigold garland, parasol, alms bowl). The parasol (chhatr) is
  white with gold trims by default (`look: 'gold'` for gold cloth, as in the
  Bayon's sanctum: a stack of gold tiers reads from afar as the Thai gold
  ring spire), its valances' hems cut
  in kbach flame points that lean one way — not the plain teeth of the Thai
  royal white umbrella. Candle lamps light the statues:
  `SACRED_LAMPS.push(candleLamp(worldPos))` (the four nearest the camera).
- `stupa({ height, look, form, niche })` (`stupa.ts`): a Khmer chetdei
  (ចេតិយ), never the Thai / Sri Lankan round bell under a spire of rings.
  A tall base stepped in three on the redented plan with bands of lotus
  petals, the cella with a false door on each side (or `niche`: a pointed
  arch on the front, `stupaNiche` says where a Buddha sits), then form
  `tower` (default: Angkor Wat's lotus-bud tower, seven tiers drawing in
  like a corn cob, leaf-shaped antefixes at every corner and along the
  sides, a pediment on each side) or `faces` (four Bayon faces looking to
  the four directions under four tiers: the village pagoda's pair, Ta
  Prohm's by the road), and the lotus crown and bud, a short gold tip.
  Looks `white` (whitewash, gold trim, antefixes with gilt points, gilt
  faces, ochre doors), `gold`, `stone` (grey-green sandstone on laterite,
  moss and lichen, an antefix fallen here and there, no tip). The shape
  (`_stupaShape.ts`, faces `_stupaFace.ts`) is sculpted in its own worker
  (`_stupaWorker.ts`): the far mesh at once, the near one (within 7 ×
  height) when the camera first comes near; the small sharp parts
  (antefixes, pediments, the crown's petals, the tip) are plain plaques
  merged in. One draw call a stupa: near ≈ 34 k triangles (`tower`),
  46 k (`faces`), far ≈ 8–10 k; ~0 main-thread time. Preview:
  `sacred.html?piece=stupa-<look>[-faces]` (`-far`), `stupa-niche[-look]`,
  `stupa-niche-faces`, `stupa-niche[-faces]-buddha`, `stupas-all`.
- Khmer ornament on canvas (`kbach.ts`: flame leaves, fleshy kbach phni tes
  scrolls, lotus bands, flame arches, gold bosses — carved and gilded, never
  the Thai glass mosaic; `reahu` the demon mask swallowing the moon). The
  pagoda gable is `gable.ts`: `figure: 'buddha'` (default) a niche with a
  sculpted relief Buddha, `'brahma'` Brahma's four faces under a broad
  tiered crown between two kneeling tep prânâm, painted on a sharper
  cut-out panel before it (`paintFigures`, `figureTextures`).
- The Khmer naga (`naga.ts`): `nagaFan('stair' | 'roof', 'stone' | 'gilt')`
  (seven cobra heads under a smooth hood in a kbach halo; five heads, no
  halo), `nagaBody(path, r)`, `chovea()`, `rakeBoard(...)`; whole pieces
  `roofNaga({ rakes, fans, choveas })` (a Khmer roof end's gilt naga: the
  pagoda's, the Kulen Buddha's shelter) and `stairNaga({ fans, bodies })`,
  each one mesh hidden far off (the stair's coarser from 55 m: `stairFar`).
  Fans are sculpted once per kind, in a worker with `nagaFanReady(kind)`
  (the stair's ≈ 23 k triangles, its far look ≈ 6 k, the roof's ≈ 2.6 k).
- A part adds its pieces to a `SacredSet` (`set.ts`) and calls its
  `update(f)`. Landmarks use `Shrines` (`landmarks/_prasatKit.ts`) or
  `landmarks/_sanctuaryShrine.ts`.
- Sculpted meshes are not solid: stand them on voxel plinths, or add hidden
  voxel blocks, so the explorer cannot walk through them. A Buddha always
  sits raised, facing the kneeling spot (`roam/_worship.ts`), with the spot
  and 1.5 m in front of it clear.
- Make a new sculpt with `Sculpt` (`add`, `carve`, `paint`, `fine` for the
  small details) from the shapes in `sdf.ts`; look at it alone on
  `sacred.html?piece=<name>` (register it in a `*.pieces.ts`; params in
  `preview.ts`).

## Khmer, not Thai

Everything must read Khmer (the player is Cambodian): where a form exists in
both cultures, use the Khmer one, best the Angkorian one. The quick tells:
stupas with a square stepped, redented base and a prasat or Bayon-face body
(not the round bell with a stack of rings); Buddhas with a lotus bud on the
ushnisha (not the flame); naga with a smooth fan hood of cobra heads (no
crests, no dragon jaws); the apsara's three-spiked mokot (not the chada's one
spire); spirit houses shaped as a little Angkor sanctuary (not crossed gables
with chofa); gables with Reahu, Brahma's faces or kbach (not gilt kranok and
glass over everything); Khmer New Year's sand stupas and folk games (not
water-gun fights); ngo boats; Khmer script; the palm-leaf hat or a krama.
The flag of Cambodia shows Angkor Wat with **three** towers (five was the
1979–89 flag). When unsure, look at Angkor Wat's towers and carvings, the
Bayon, Banteay Srei and Cambodian pagodas (Wat Bo, Wat Preah Prom Rath,
Wat Ounalom, the Silver Pagoda, Oudong's stupas).

## Budgets (blocks = voxel instances)

terrain ≤ 260 k · vegetation ≤ 170 k (the low level plants 0.7 of it) · sanctuary ≤ 60 k · each other
landmark ≤ 20 k · road ≤ 20 k · foreground ≈ 3 k. Animals (fauna, wildlife):
≤ 6 draw calls and < 1 ms CPU a frame each; one `InstancedMesh` per species
posed in the vertex shader, only animals near the camera or the explorer
are updated, far ones hidden. Keep each part's build
under ~600 ms. The page must stay smooth (60 fps) on a MacBook (M1 Max).
The frame is bound by triangles more than pixels (at a quarter of the
pixels it takes 14 ms of 17 on low). The land draws only the block sides
that can be seen (`buildVoxelMesh(…, { hideCovered: { ground } })`,
VoxelMesh.ts): a side its builder marks covered is left out only where
everything just outside it is solid, another block or the hollow under the
columns (`floor` in terrain/columns.ts); 3 in 4 blocks then show only their
top. While the camera rests on the overview, the land draws only the blocks
that camera can see (terrain/seen.ts, see "The map's size and the Kulen
falls"). The land's triangles on low: 0.7 M instead of 1.35 M (the whole frame
−15 %, the shadow pass −21 %), and about 115 ms more to build. For parts that
never move only (a swaying leaf would show what it covered).
The player picks a **Graphics** level in the settings (`graphics.ts`,
`settings.graphics`, `graphics=auto|low|medium|high|max` in the URL). Auto
(the default) starts on low on a phone and medium elsewhere, steps down a
level when frames stay under 30 a second, and keeps that level for the
device (`AutoGraphics`; shots use medium). The map draws at most 60 frames
a second, and 30 on a phone or with the **Battery saver** setting, evenly
(`frameCap`, `setBatterySaver` in graphics.ts; `phone=1` acts as a phone,
`battery=1` turns the saver on). The frame loop (main.ts `tick`) rests while
the loading screen's button waits (one frame is drawn under it, then none
until Start), and slows while idle: the overview with no input for 4 s and
no camera flight draws 30 a second (20 on a phone or the saver), a window
without focus 10; any input brings the full pace back at once (`idle=0`
turns this off; `window.__loop` counts the frames drawn and names the pace).
The **Resolution** setting (resolution.ts, `settings.resolution`,
`resolution=auto|<share>` in the URL) picks the pixels apart from the level:
Auto is the level's own (below); a size is a share of the screen's own width,
shown in the menu as exact sizes (`resolutionSizes()`), whole steps marked.
A whole step draws a smaller canvas stretched by the browser with nearest
pixels (crisp 2 × 2, 3 × 3 … squares); a size between keeps the canvas at
the screen's size and draws the scene into smaller targets that the grade
pass scales up with a smooth filter and a light sharpen (post.ts). Point
sprites (lamp halos, fireflies, smoke, rain, snow) size themselves by the
scene's height (`view.scene`), not the canvas's. Low draws
half the pixels, the map's blocks as plain boxes, no MSAA, no glow, and
still shadows: only parts marked with `markStill` (main.ts) cast, and the
shadow map is drawn again only when the key light turns, never every third
frame, and then a part a frame (no slow frame while the light stands, nor
when it turns; a part that moves must not be marked). Medium's shadows are
still too (4096², a part ≈ 0.8–0.9 M triangles): its shadow pass every
third frame was 2.5–5 ms of that frame on an M1 Max (the medium overview
16.0 → 14.9 ms a frame, the slowest frames ≈ 33 → 29 ms). What moves
casts none on low and medium (people, animals, boats, parked gliders, the
roaming explorer and what he rides): a soft disc lies under his feet.
Medium drops to half the pixels while frames stay under ~40 a second
(`adaptResolution` in `main.ts`: the screen's ratio or 1, never a step
between, which blurs and lays a grid over the map); high always keeps the
screen's pixels and draws the shadow map every third frame, what moves
casting too; max adds MSAA ×4, a 8192² shadow map drawn every frame.
Far blocks can be plain boxes on every level (graphics.ts `plainFar`,
`PLAIN_PX`; "Far plain boxes" below): on medium and up with the rim a plain
box stands in for painted (`RIM_PAINTED`, materials.ts `voxelRimMaterial`).
All of it changes live; the built detail (`ctx.quality`: tree density,
spray) follows the next time the map opens. A blurry map on a 2× screen on
medium means the frame is over budget: `__mapResolution.ratio` shows it,
`graphicsNow` the level's values.
The **Fog** setting (sky/fogLevel.ts, `settings.fog`, `fog=auto|full|light|simple`
in the URL; no "off": the mist hides the map's cut edges) picks how much
mist is drawn, apart from the level; Auto follows it (low simple, medium
light, high and max full). Full is all of it. Light keeps the haze in every
material as it is and draws the sea of mist with 2 planes, not 5: each draws
a stack of the layers at its point (sky/mist.ts `MIST_STACK`, clouds.ts
`PLANES`), as thick a sea, only the parallax between the layers of a stack
lost; of the far banks it keeps the two nearer rings (`BANKS_FOR`: 133 banks
of 264; from the ground it looks the same). Simple also lays the valley mist even (as much as
the banks make on the whole, `hazeEvenBank`), with an even veil where the
wisps drift, and no cloud shadows: an `if` on one shared uniform
(`HAZE.fog`, sky/haze.ts), one read of the land map a pixel instead of
8–12; only the edge and front banks (65). On every step the edge mist, the sea
reaching in over the front edge from high up and the edge banks stay, and
the mist planes are a ring round the land (clouds.ts `mistPlaneShape`: the
roaming boxes grown to where the sea starts, less 8 m; the strip over the
front edge drawn only while the eye is high enough for it), so no pixel over
the land runs their shader (the picture is the same). A change shows at
once: no shader compiles again. On this Mac (M1 Max, 2560 × 1440, high,
ms a frame): the overview 24.0 full (as before) → 23.8 light → 21.7 simple;
the sea of mist from the glider's height (`cam=0,420,-300,0,0,160`) 20.3 →
19.8 → 18.0 (full within ±0.3 of before). At 1280 × 720 the frame is bound by
triangles: the overview's simple ≈ 1 ms quicker, the walks the same
(`npm run perf -- url=fog=simple`).

### Phones: what a frame costs (the perf pass)

`npm run perf` (`scripts/perf.mjs`) draws views × levels on this Mac's GPU
(Playwright's full Chromium, Metal; `index.html?shot=1&video=1`, frame by
frame) and prints per case: **frame** (ms a frame, frames drawn back to back
as the live page draws them: the larger of CPU and GPU), **cpu** (the parts'
updates and three's draw calls), wall and its p95 (one frame then the GPU
done; `shadow +` the extra of the frames that draw the shadow map), draws and
triangles (the picture + the shadow pass), programs, build ms. `only=` views
(overview, night, village, paddies, east = the market walk, kulen, hang =
the hang glider high over the map, and snow, snowwalk, eastpaddies, market
= walking into the market's stalls (`east` faces away from them), and
dusk, duskwalk: the overview and the village walk with the day turning four
times as fast as live from clock 0.26, where the key light turns fastest,
the shadow map drawn when the live page draws it, `shadows=live`), `levels=` (low,
medium, high, max, phone = `graphics=low&phone=1` at 844 × 390, a phone on
its side), `parts=1` each part's draws, triangles and CPU, `meshes=40` the
costliest meshes, `ablate=a,b` each part's ms (the frames again with it
hidden), `out=` JSON, `base=` the change against an earlier JSON. The shadow
map is drawn as the live page draws it (still on low). `max` is the worst
frame; in the dusk views `shadow +` is the extra of the frames that draw
(some of) the shadow map, out of how many, and the worst of them against
the worst of the others. Other GPU work on the
machine (shots) makes ms noisy (±0.3 ms): compare runs made one after the
other; draws and triangles are exact.

Reading it for a phone: this Mac's GPU is about 5–8 times an iPhone's (15–30
times a mid Android's), its CPU about an iPhone's. On low the walks are
CPU-bound here (frame ≈ cpu) and GPU-bound on a phone: count triangles and
draws there, and take ms from the overview (GPU-bound here too). Triangles
cost as they are sent (the GPU sets them up), drawn on screen or not; pixels
little (a third of the pixels: −0.5 ms). Per triangle the people's crowd
(when every vertex posed itself: 0.1 M ≈ 1 ms; with the bone pass ≈ 0.1 ms)
and the rice (0.24 M ≈ 1 ms) cost the most; the land and the
jungle about 1.3 ms per M. The sky dome is cheap: a whole screen of it takes
≈ 0.02 ms at 844 × 390 (0.09 ms at 2560 × 1440; its clouds half of it), and
hiding it changes the frame by less than the noise (≈ 0.1 ms). The 0.8 ms once
put on it was the whole `atmosphere` part hidden (`ablate=atmosphere`): its
key light and the shadow lookup every lit pixel makes, 0.6–0.8 ms of the
overview on low by day, 1.4 ms at night (the moon's softer shadows).

What the low level does for phones (and what it saves; the same map, the same
moment, before → after, M1 Max):

| view (phone: low, 844 × 390) | frame ms | draws | triangles M |
|---|---|---|---|
| overview | 7.1 → 6.9 | 511 → 587 | 3.95 → 3.39 |
| village walk | 4.1 → 3.9 | 265 → 279 | 1.95 → 1.60 |
| paddies walk | 4.3 → 4.5 | 243 → 245 | 2.19 → 1.73 |
| market walk | 4.0 → 4.1 | 307 → 348 | 2.57 → 2.07 |
| Kulen picnic | 4.1 → 3.8 | 213 → 223 | 1.69 → 1.25 |
| hang glider | 6.9 → 5.3 | 458 → 539 | 3.65 → 3.06 |
| overview, low at 1280 × 720 | 7.9 → 6.8 | 471 → 541 | 3.81 → 3.45 |
| overview, medium | 16.5 → 14.9 | 485 + 424 → 575 + 523 | 9.53 + 9.50 → 8.79 + 9.23 |
| hang glider, medium | 14.7 → 11.1 | 434 + 482 → 507 + 517 | 9.14 + 9.19 → 7.54 + 8.47 |
| village walk, medium | 7.5 → 6.4 (shadow frames +4.9 → +3.5) | 261 + 504 → 277 + 344 | 3.96 + 8.48 → 3.56 + 4.60 |

- **Still shadows are still** (graphics.ts `stillCasters`): three picks what
  casts into a shadow map by the layers of the camera the picture is drawn
  with, not the light's, so the shadow camera's layer never chose anything:
  every caster drew into the "still" map (people, animals, boats, gliders:
  their shadows stood where they were at the last redraw), and every redraw
  drew them all. Now the view camera sees only the still layer while the
  shadow map is drawn. The explorer casts while he stands on his ledge (the
  overview), not while he roams (a redraw as he leaves it and comes back:
  main.ts `explorerStill`); the paddies' props are marked still.
- **The jungle in tiles** (vegetation.ts): leaves in 100 m tiles, the rest
  (trunks, cliff moss) in 300 m chunks, one plain mesh a tile on low; a tile
  near the camera draws its edges, plain from 170 m roaming (300 m in the
  overview), and casts only while its shadow can be seen (medium and up).
  Roaming, the camera draws a third to a tenth of the jungle's triangles of
  the 300 m chunks (it stood in one, and drew it whole); the overview draws
  the jungle in ≈ 130 draws (was 40). `LEAF_GRID` is the knob: 150 m tiles
  halve those draws for about a third more triangles roaming. The far trees
  (2 m and 3 m cells, the `:far` meshes) cost ≈ 0.9–1.1 ms of the overview
  on medium and high, ≈ 0.5 on low and the phone (not drawn at all); their
  sway costs nothing measurable. On a computer impostors for them do not pay
  (PERFORMANCE-PLAN.md, section 7, phase 3): pictures change the look where
  the blocks are over a pixel, and exact ones (a ray walked through the
  blocks' cells) cost more than the blocks.
- **Pictures of the far trees on a phone** (veg/impostors.ts: the low level
  on a phone screen only; `imp=0` off, `imppx=<px>` another limit): where a
  leaf tile's far blocks are under 1.5 px, its far trees are one
  camera-facing quad each, a picture of the tree's leaves from an atlas drawn
  at load (74 far prototypes × 8 directions × 3 heights, 24² texels:
  1776 × 576, 3.9 MB, 22–44 ms on the M1 Max), lit as the leaf blocks are
  (colour, side, depth per texel: the sun or moon, the sky light, the still
  shadow map at the leaf's point, haze, fog steps, snow) and writing the
  leaf's depth; trunks and branches stay blocks. The tile's far blocks (the
  last instances of its low-level leaf mesh) are left out of the picture
  pass only (`count` for the view camera): they still cast the still
  shadows, the snow's map sees them, and the bug report's picks name them.
  A tile switches with a 0.4 s dither fade, blocks first kept until every
  tree reaching in is a picture. The phone overview: −55 draws,
  −0.27 M triangles, ≈ 0.3–0.4 ms here (the glider ≈ 0.1–0.2, walks 0);
  the same look by eye (single pixels inside far crowns differ). Every other
  level and screen draws exactly as before.
- **Covered sides left out** on plain boxes, block by block (they lie against
  the next block; the GPU drops them before it sets them up): the leaves by
  the lattice's own open sides (veg/sway.ts `cut`), the land, temples,
  jungle sites, camps, village and hamlets by `voxShown` (VoxelMesh.ts keeps
  `shownSides` per instance with `hideCovered`; cull.ts `cutCovered` works it
  out after the build for the rest, ≈ 150 ms). The medium overview −2 ms
  (its far land); on low this Mac's GPU drops covered pixels anyway (≈ 0).
  Not on chamfered blocks (the groove between two neighbours' cut edges
  would open), not in the shadow pass (a second depth program there cost
  more than it saved).
- **Other families' blocks** (the explorer, parked gliders, ramps, boats, the
  balloon, houses) on low: one rounding step near (the explorer 92 → 44
  triangles a block, −0.16 M), plain boxes from 80 m (graphics.ts
  `plainFar`, every frame: the ramps, parked gliders, boats and balloon
  0.28 → 0.08 M triangles in the overview; the ramps and gliders spot by
  spot, launchSpots.ts, as they share their meshes).
- **The glider ramps in 16 draws, not 80** (roam/_rampBatch.ts,
  `LaunchRamps`, `_parkedGliders.ts`; see "Roaming the map"): one mesh per
  block family for all five ramps and one for all five parked gliders, the
  flags one mesh, a spot out of view (and 60 m past it) left out of them.
  The overview 586 → 522 draws on a phone (540 → 486 on low, 574 + 523 →
  522 + 475 on medium), the hang glider 452 → 418, a walk by a ramp 231 →
  212 (1.68 → 1.65 M triangles), the village walk 281 → 257 (the parked
  gliders were drawn wherever he was); the same triangles in the overview.
  The ramps cast the still shadows of low and medium again (marked still); the
  ramps' frame 0.11 → 0.08 ms of CPU (the flags worked out in place, their
  normals from their strips).
- **The undergrowth** reaches 24–32 m on low (32–44 m: half the boxes).
- **One full-screen pass less** on every level: the grade pass tone maps and
  writes sRGB itself (post.ts; the OutputPass is gone).
- **Shadows while roaming** (medium and up): the land (`ShadowGate.addLive`:
  its plain twins join as they are made), temples, road and ledge cast only
  while their shadows can be in view (main.ts `castGate`): in the walks the
  shadow pass draws a third to two thirds of what it did, the slow shadow
  frame (every third) 1.5–2.5 ms shorter.
- **Still shadows drawn a part a frame** (the second perf pass;
  atmosphere.ts, graphics.ts `dealStillParts`). With the day's cycle (the
  default, 360 s a day) the key light turns 75° a day: the still map was
  drawn again 240 times a day (every 1.1 s typically, 0.8 s at the
  quickest, from dusk into the night and at dawn), the whole map in one frame
  (2.8 M triangles and 450 draws in the overview, 3.5 M and 515 roaming:
  ≈ +4–6 ms on this Mac, 20–45 ms on a phone, a hitch each time). Now the
  next map is drawn into a second target while the one shown stays: the
  still casters are dealt into 10–12 parts of ≈ 0.3 M triangles (a layer
  each, the biggest meshes first; the view camera sees one part's layer
  while the pass runs), one part a frame with the picture (not with other
  views of the scene), the target cleared before the first only; then the
  key light takes the new map and turns to where it was drawn from. A
  redraw asked for from elsewhere (`shadowMap.needsUpdate`: the explorer
  leaving his ledge, the land's cull) starts a new one the same way. The
  picture is the same as the whole map drawn at once (checked pixel by
  pixel). It needs a second map of the same size (low 2048², medium 4096²:
  depth and three's colour target, ≈ 32 and 128 MB), 0.2 ms to deal
  (a walk over ≈ 2,700 objects) and ≈ 0.4 ms of CPU a part (three walks
  the scene each pass). `shadowsteps=1` draws it in one frame as before;
  shots draw the map every frame unless `shadows=live`.

  | the day turning (dusk ×4), M1 Max | redraw frame: extra ms | shadow pass in one frame |
  |---|---|---|
  | overview, low | +3.4 → +0.3‥0.5 | 2.88 M, 453 draws → 0.35 M, 47 |
  | village walk, low | +5.4‥5.9 → +0.5 | 3.47 M, 515 draws → 0.35 M, 45 |
  | overview, phone | +3.5‥4.2 → ≈ 0‥0.8 | 2.88 M → 0.35 M |
  | village walk, phone | +4.9 → +0.1‥0.8 | 3.47 M → 0.34 M |

  (one frame, `shadowsteps=1`, → parts; runs made one after the other,
  ±0.5 ms of noise from the other work on the machine.)
- **The roaming explorer on low** (and medium): a soft dark disc under his feet
  (foreground.ts `footShadow`; he casts nothing into the still map): on the
  floor under him (the walk map: floors, steps, bridges, roofs), drawn out
  away from the light as a low sun would (up to 1.8 × its width), as dark as
  the key light's shadows are (paler under cloud, at dawn and by moonlight),
  fading as he goes up in the air; none in the boat, in the balloon or over
  water. One draw of two triangles; `foot=0` leaves it out. He is built with
  one rounding step on low (`quality: 'medium'`, what that level draws of
  him anyway): the outfits, tools and faces made while he roams stay at 44
  triangles a block (at 'high' they came at 92: 0.15 → 0.22 M triangles after
  a few outfit changes), ≈ 0.5 ms quicker to change.
- **The plain twins** of the land and trees (terrain/lod.ts `lowTwin`, medium
  and up, from 170 m roaming, 300 m in the overview) take the original's
  `voxShown` and its layers: they cast still shadows too once auto steps a
  map opened on medium down to low (they did not: made after the build,
  they were not on the still layer). The covered sides they now leave out
  gain nothing measurable: the land's meshes are already cut by the sides
  their blocks show (`hideCovered`).
- **Far plain boxes** (graphics.ts `plainFar`, `plainFrom`, `PLAIN_PX`,
  `RIM_PAINTED`, `paintRim`; terrain/lod.ts `ChunkSwitch` for the land's and
  the jungle's chunks; materials.ts `voxelRimMaterial`): a mesh of blocks is
  drawn plain once its largest cut edge (its smallest side × the family's
  `bevel`) spans under `PLAIN_PX` pixels where it comes nearest the camera
  (medium and high 1, max ½): d = edge · √2 / (px · pixel), a pixel being
  2 tan(fov / 2) / the scene's height in pixels a metre away (a zoomed photo
  or a sharper resolution keeps the edges further). At 1 px in the overview
  on a 2× screen (1800–1880 pixels high, 55–60°): a temple stone of 1 m
  (edge 8 cm) 175–205 m, a leaf cell of 1 m (12 cm) 265–305 m, a 2 m block of
  land (14 cm) 310–360 m, a road slab 0.3 m thick 55–60 m; roaming (50°)
  1.1–1.25 × as far; half as far on a 1× screen. Under a pixel is not unseen
  here: the map's families give every block a bright cut rim (`edgeTint`),
  and unpainted plain boxes lose Angkor Wat's lines between the stones (rims
  ≈ 0.6 px in the 2× overview), pop the temple smooth at the switch, and at
  1672 × 941 soften the Bayon's faces from ¼ px. So a mesh drawn plain wears
  its material's **rim variant** (`voxelRimMaterial`, `VOX_RIM`: a program of
  its own, so the blocks that keep their edges, the game, the studio and the
  sacred pieces draw exactly as before), which paints each cut edge's slanted
  strip where the block would show it, by its share of the pixel: the band of
  the cut's width along each edge of a face (a 45° strip is as wide, seen from
  anywhere, as its two bands), its share of the pixel's part on the face
  (MSAA splits a pixel between faces), the rim tint with the strip's own
  facing, and the light of the strip (the normal leaning toward the edge by
  that share: three's diffuse light is then the straight mean of the face's
  and the strip's). The block's axes come per pixel from how its position and
  the view position change across the pixel, the derivatives taken where
  every pixel of the quad takes them (inside a branch they gave dark dots
  along the edges); in a groove between two blocks, the strip leaning toward
  the camera shows wider than its band, the other narrower. The plain box's
  face axis and half size come in one flat value (`vVoxBox`); a chamfered
  shape wearing the variant paints nothing. Its programs compile at load with
  the rest (hidden meshes wearing each, `rimPrograms`: 30 on the map, none
  compiled in a frame after Start). Checked on the GPU against every block
  cut: the 2× and 1× overviews, the switch point, dusk, night, max at ½ px,
  the hang glider and walks: the same by eye, a few levels apart pixel by
  pixel along the blocks' edges (Angkor Wat 2× mean 2.0 of 255, 7 % of pixels
  over 8; unpainted 3.8, 17 %); forced to 6 px up close the strips land
  within a pixel of the cut ones. The gain (M1 Max, 1280 × 720, back to back,
  twice): the medium overview 8.8 → 5.7 M triangles (shadow pass 9.5 → 5.2),
  16.0–16.2 → 12.9 ms a frame; the hang glider 11.0–11.1 → 8.6–8.7; dusk
  16.1–16.2 → 12.6–12.8; the village walk 6.3 → 5.9–6.0; high about the same;
  max (½ px) overview 18.4–18.8 → 16.9–17.1, hang glider 13.7–13.8 →
  12.1–12.3, village 7.8 → 7.4. Unpainted plain boxes would be ≈ 1.1 ms
  quicker in the overview: about half of it three sorting the rim variants'
  draws after all the others (grouped by material), half the shader.
  `plainpx=<px>` tries a limit (0: never), `rim=0` leaves them unpainted.
  Low as before (all map blocks plain, unpainted); a chunk past `PLAIN_FROM`
  unpainted as before; copies of a model sharing a geometry (the boats) go
  plain only when every shown copy is far; the explorer keeps his edges.
- **People posed once a bone** (the perf-people pass; People, "Cost"): a
  bone pass poses each person shown into a small float texture once a
  frame (two textures in turn, read a frame later, so nothing waits on it),
  and the crowd's vertices only read it; on low people out of view are
  left out. The crowd alone on the GPU (M1 Max, phone): the overview 0.15 →
  0.06 ms (0.03 + 0.03 the pass), the market walk 0.42‥0.5 → 0.05‥0.07,
  walking into the market's stalls 0.44 → 0.08, Kulen 0.4 → 0.06‥0.09, the
  floating village 0.3 → 0.06‥0.11; on medium the market 0.48 → 0.11 (the
  shadow pass saves as much again). The same picture (a few edge pixels);
  +1 draw and ≈ 0.05‥0.09 ms of CPU (the pass's render target).

Budgets for a phone (low): the overview ≈ 7 ms here now (≈ 30 fps on an
iPhone 13–15, whose GPU is about a fifth of this one): keep it there, ≤ 600
draws, ≤ 3.6 M triangles; a walk ≤ 2 M triangles and ≤ 350 draws;
a new part ≤ 30 draws, ≤ 0.15 M triangles and ≤ 0.2 ms CPU in a view where
it stands, and nothing (0 draws, ~0 CPU) where it does not; people: the crowd
≤ 0.1 M triangles in view and ≤ 0.15 ms of GPU here with its bone pass
(the crowd drawn alone; ≈ 0.05‥0.09 now). On low the still shadow map is drawn again each
time the key light turns 0.3° (with the day's cycle, every 1–3 s), a part
of ≈ 0.3 M triangles a frame over 10–12 frames: what is marked still adds
to those frames (on a phone at 30 frames a second, about a third of them
while the light turns fastest), so keep the still parts' triangles as low
as the picture's; a part that moves must not be marked still.

## Checking your work

- Types: `npx tsc --noEmit 2>&1 | grep src/map/<your files>` (others work at
  the same time: ignore their errors, fix yours).
- Pictures (about 15 s each):
  `SHOT_W=1672 SHOT_H=941 SHOT_OUT=<your scratch dir> npm run shots -- name="@index.html?shot=1&<params>"`
  then view the PNG. Useful params: `night=1` · `t=<s>` (time for moving
  things) · `focus=<place id>` (closer camera on a place) · `ui=0` (no
  interface) · `parts=terrain,sanctuary` (build only these parts — faster, and
  hides others' work in progress) · `cam=x,y,z,tx,ty,tz` (any fixed camera) ·
  `lang=en` (English words; Khmer is the default). Walk shots
  (`roam=walk&at=…`) need `foreground` in `parts=`, and `at=x,y,z` with the
  floor's height indoors (with two values he stands on whatever is highest).
  The console line `[map] built in … · blocks {…}` shows build times and block
  counts; `FAILED: …` names parts that broke.
- Put screenshots and scratch files in your scratch dir, not in the repo.
- Do not start dev servers or use the in-app browser; `npm run shots` starts
  its own server.
- Do not commit. Do not touch files owned by other parts.

## Parts and owners

| Part | Files |
|---|---|
| terrain | `src/map/terrain.ts`, `src/map/heightfield.ts` (surface rules only), `src/map/terrain/*` |
| vegetation | `src/map/vegetation.ts`, `src/map/veg/*` |
| sanctuary | `src/map/landmarks/sanctuary.ts`, `src/map/landmarks/_sanctuary*.ts` |
| overlook + shrine | `src/map/landmarks/overlook.ts`, `shrine.ts`, `_faces*.ts`, `_ruin*.ts` |
| rivergate + terrace + kulen | `src/map/landmarks/rivergate.ts`, `terrace.ts`, `kulen.ts`, `_prasat*.ts` |
| water | `src/map/water.ts`, `src/map/water/*` |
| atmosphere | `src/map/atmosphere.ts`, `src/map/post.ts`, `src/map/clouds.ts`, `src/map/sky/*` |
| road + life | `src/map/path.ts`, `src/map/life.ts`, `src/map/road/*` |
| jungle (ruins and shrines at the sites) | `src/map/jungle/ruins.ts`, `_ruin*.ts`, `_incense.ts` |
| undergrowth | `src/map/veg/undergrowth.ts` (sway: `veg/sway.ts`) |
| palms (sugar and coconut, for every part) | `src/map/veg/palms.ts`; `palm()` in `veg/species.ts`, `sugarPalm()` in `paddies/props.ts`, `palm()` in `village/_kit.ts` |
| jungle animals | `src/map/fauna/jungle.ts`, `src/map/fauna/_jungle*.ts` |
| camps (jungle sites people use: monk's hut, woodcutters, swing, bridges, pool) | `src/map/jungle/camps.ts`, `_camp*.ts`, `_bridges.ts`, `_swing.ts`; the ride `src/map/roam/_swingRide.ts` |
| land animals | `src/map/fauna/land.ts`, `src/map/fauna/_kit.ts`, `src/map/fauna/_land*.ts` |
| water and air animals | `src/map/fauna/waterAir.ts`, `src/map/fauna/_water*.ts`, `src/map/fauna/_air*.ts` |
| mini-map | `src/map/ui/minimap.ts`, `src/map/ui/_minimap*.ts` |
| interface | `src/map/ui/*` |
| sound | `src/map/audio/*` |
| day's events | `src/map/events.ts` (sound: `audio/temple.ts`; animals: `fauna/_landBath.ts`, `_landCrossing.ts`, `_landSplash.ts`) |
| roaming | `src/map/roam/*` (`roam.ts` and `types.ts` belong to the lead) |
| paddies | `src/map/paddies.ts`, `src/map/paddies/*` |
| village (stilt houses, floating houses, jetty, pagoda) | `src/map/village/*` |
| people (and their sounds) | `src/map/people/*`, `src/map/audio/people.ts` |
| festival | `src/map/festival/*`, `src/map/audio/festival.ts` |
| treasure (hidden gold) | `src/map/treasure/*` |
| journal (nature book, passport) | `src/map/roam/_book*.ts`, `_stamps.ts` |
| rain, rainbow, snow, weather | `src/map/sky/rain.ts`, `rainbow.ts`, `snow.ts`, `weather.ts`, `src/map/audio/weather.ts` |
| sacred pieces (sculpted Buddhas, stupas, offerings, gables) | `src/map/sacred/*`, `sacred.html` |
| the settled places (east village, its market, the palm sugar yard, the Kulen picnic place, the hamlet behind Angkor Wat) | `src/map/hamlet/index.ts` (lead), `_ev*.ts`, `_mk*.ts`, `_ps*.ts`, `_kn*.ts`, `_bh*.ts`, `_shops.ts`; their people `src/map/people/_sceneEastVillage.ts`, `_sceneMarket.ts`, `_scenePalmSugar*.ts`, `_sceneKulen*.ts`, `_sceneBack*.ts` |
| the floating village's heart and market | `src/map/village/_fv*.ts`; people `src/map/people/_sceneVillageMarket.ts` |
| the reclining Buddha of Kulen | `src/map/landmarks/_kulenBuddha.ts`, `src/map/sacred/_buddhaReclining.ts`; worship spot `kulen-buddha` |
| greeting | `src/map/greet.ts`, `src/map/roam/_greet.ts`, `src/map/people/_greetBack.ts`; the sampeah `src/character/clips.ts` |
| fishing | `src/map/roam/_fishing.ts`, `_fishGear.ts`, `_fishKinds.ts`, `_fishPoses.ts`, `_fishPlate.ts` |
| buying, eating and drinking | `src/map/shop.ts` (lead), `src/map/roam/_shop*.ts`, `src/map/people/_saleBack.ts`; `src/character/meals.ts`, `parts/food.ts` |
| leaving roaming asks first | `src/map/roam/_leave.ts` (lead) |
| kites (khleng ek) | `src/map/people/_sceneKites.ts`, `_kite.ts`; the hum `src/map/audio/kite.ts` |
| speed checks | `scripts/perf.mjs` (`npm run perf`) |

`main.ts`, `camera.ts`, `cull.ts`, `foreground.ts`, `layout.ts`, `types.ts` belong to the
lead. If you need a change there, say it in your report.

## Report

End with a short report: what you built, files, block count and build time,
the last screenshot path(s), and anything you need from others or the lead.
