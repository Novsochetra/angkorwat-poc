# World map screen — brief for every part

The world map screen (`map.html`, code in `src/map/`) is where the player picks
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
  `shot`), `MapFrame` (`t`, `dt`, `night` 0‥1, `camera`, `lightDir`), `MapPart`
  (`name`, `object`, optional `update(f)` and `blocks`).
- `src/map/layout.ts`: where everything is — places (`PLACES`: pad centre, pad
  size, `anchor` beacon point, card offset, focus camera), mesas (`PLATEAUS`),
  `RIVERS`, road `PATHS`, the explorer's ledge, the overview camera.
  **Do not change `layout.ts`**; if you need a change, say it in your report.
- `src/map/heightfield.ts`: the land as 2 m columns (`CELL = 2`). Use
  `ctx.field`: `heightAt(x, z)` (ground top), `waterAt(x, z)`, `standY`,
  `surfaceAt` (`SURFACE.grass/rock/dirt/sand/path/pad/bed`), `dropAt` (cliff
  lip), `isFree(x, z)` (open ground for trees), `occupy(x0, z0, x1, z1)` (mark
  ground you built on), `falls` (every waterfall: lip point, top/bottom level,
  width, flow dir), `rivers` (samples every metre with level, width, dir),
  `paths` (road samples every metre with ground `y` and `wet` over water).
  Only the terrain pass may edit `heightfield.ts`.
- Build order: atmosphere → terrain → the six landmarks → path → water →
  vegetation → clouds → life → fauna → wildlife → foreground. Landmarks and
  the road call `field.occupy(...)` for what they cover, so trees keep off.
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
  step, so the ខ្មែរ / EN switch shows at once.
  A drag, or holding **Q** / **R**, orbits the camera round him in every mode
  (as on `index.html`: 1.8 rad/s); the follow camera eases back behind him
  after a pause. It keeps him in view: walls, stone and land pull it in
  (`world.hardClearance`); tree leaves and bark, the parked gliders and the
  ramps dissolve in a dithered tube from the camera to him (`_nearFade.ts`,
  `world.softClearance`), off in the overview and in photos.
- `parachute.ts` (leap + glide), `boat.ts` + `flow.ts` (boat, river current).
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
  out (speed ↔ height), it sinks about 1 in 12. Rising air (`_lift.ts`):
  along cliffs, and in warm columns marked by golden seed fluff. Model
  `_gliderModel.ts`, ramp `_launchRamp.ts`, poses `_gliderPoses.ts`
  (upright with it, prone in the harness, the flare).
- `balloon.ts` (mode `balloon`): a hot air balloon in the flag of Cambodia
  (Angkor Wat in white on the red band) stands tethered on its field in the
  valley below Angkor Wat (`BALLOON_HOME`, west of the road's stairs;
  `reserveBalloonHome` keeps the trees off it and a lane to the valley road,
  main.ts, before the jungle is planted), a small sign by the lane, the
  burner breathing now and then (a glow at night). E at the basket: he
  climbs in and stands at the burner line (`_balloonPoses.ts`). **W** /
  **Space** burner (heats the envelope: lift off, climb; Shift both
  burners), **S** vent (sink), hands off it cools and sinks slowly, **A** /
  **D** turn the basket; the breeze carries it (low along the valley to the
  east, higher up to the north over Angkor Wat) plus `MapWeather.wind`,
  stronger and turning with height; up to 420 m over the land. **E** low
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
  selfie stick: on by default, the wheel slides it out); emotes
  **F** wave, **C** cheer, **U** look up, **P** peek; **H** hat, **G** outfit
  (in a selfie: gesture), **X** face, **V** photo album, **?** all keys.
  At a shrine he pays respect (`_pray.ts`): standing still for 1 s within
  5 m of a worship spot, in front of it (`_worship.ts`: one or more per
  temple, where he kneels and the point he faces), he turns to it, puts
  away his tool, takes his hat off, kneels, sampeah and bows three times
  (the `pray` action; `PRAY` times in `src/character/clips.ts`), a soft
  bell at the first bow, then hat on and up. Once per spot until he has
  been 12 m away; the stick, Space or a tool / emote key gets him up.
  The camera and the phone also work in the boat (the paddle goes down
  on his lap) and on the hang glider (it flies on straight): the
  Animator's posture keeps the body, the device's arms go on top.
  Photos go to the game's album (`src/game/Photos.ts`, IndexedDB). The
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
  over several frames. Its words are in `ui/lang.ts` (`mm…`).
- Hidden gold (part `treasure`, `src/map/treasure/`; the
  roaming modes reach it through `treasure/hooks.ts`): fifteen small
  golden figures, each a Khmer motif (`_models.ts`: apsara, naga, garuda,
  a Bayon face, singha, Nandi, lotus, kinnari, turtle, makara, Judge
  Rabbit, Hanuman, elephant, peacock, hamsa), hidden in a corner of every
  temple, at the jungle sites and on the village jetty (`_spots.ts`, all
  reachable on foot, none by a worship spot). They turn slowly and glint
  (a small star, a faint glow at night, no light); E by one picks it up
  (the walker's first prompt; the `interact` action, it flies into his
  bag, a chime, "Golden naga found — 4 / 15"); found ones are kept
  (`angkor-map-treasure-v1` in localStorage) and marked on the big map.
  A gold counter under "Back to map" while roaming (`_hud.ts`). Hidden in
  the overview. Two draw calls; words `tg…` in `ui/lang.ts`; sound `gold`.
- Footsteps (`walker.ts stepSound` picks the ground): recordings in
  `assets/sound/`, cut into single steps when they load
  (`audio/footsteps.ts`) and played one per footfall (`audio/explorer.ts`);
  synthesized steps while they load or if they fail.
- Sound settings: one slider per bus (`VOLUME_KEYS` in `types.ts`): master,
  music, ambience, water, animals, steps (footsteps), moves (the explorer's
  other sounds: jump, parachute, glider wind and sail, paddle, splash) and
  ui. `explorer.ts roamBus` says which roaming sound goes to which bus.
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
`sim=w:2,wr:3,j:0.5`; `<` / `>` alone hold Q / R) · `rcam=yaw,pitch,dist` the follow camera's orbit ·
`tool=lantern|torch|flashlight|camera|selfie` (camera and selfie also in `boat`, `hang` and `balloon`) ·
`stick=0|1` the selfie stick · `sview=0‥1` hold the selfie view part way from the follow camera to the phone (see him holding the stick) · `act=wave|cheer|lookUp|peek` ·
`bigmap=1` · `target=<place id>|ramp:<i>|ramp|balloon` (a place, a ramp, the nearest ramp, the balloon) ·
`jumpmenu=1` the Jump in card open (`=key` with the focus ring) · `start=glider`
with `roam=leap` the hang glider opens at the end of the leap · `easyfly=0|1` · `fauna=lineup` (every land animal in every
pose on the valley road) · `wildlife=<s>` (run the water animals' reactions) ·
`act=pray` (kneel and pray; with `sim=_:<s>` that far in) · `kneelat=x,z,fx,fz`
or `x,y,z,fx,fz` (a worship spot of its own there, facing (fx, fz)) ·
`gold=all|none|<n>|<id>,…` which golden figures are found (shots start
with none) · `gold=lineup` every figure in a row on the valley road ·
`goldfound=<id>` as if it was just found (the message).

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
shadow map is drawn anyway (every third), so it costs no extra shadow pass.
The moon shows its phase from `f.day` (29.53-day month, day 0 = new moon):
lit side and soft ragged terminator, its face asleep in earthshine on the
dark side; a full-moon night is a little brighter. Shooting stars on clear
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
min in), showers between. A change starts the new schedule from then; a
switch to clear fades the rain out over 30 s. Rainbows follow rain by day.
Checks: `clock=0‥1`, `day=0‥29` (7 first quarter, 15 full, 22 last quarter),
`night=` still works (dusk side), `weather=rain|storm|rainbow|clear` (held),
`weather=season|rainy|stormy` (that setting's schedule at `t=`, with
`season=`), `flash=1`.

## Rice paddies and the year

The paddies part (`src/map/paddies.ts`, `src/map/paddies/*`; the plots are
layout.ts `PADDIES`, south-west by the great lake, off the picker's frame)
follows `f.season`: every plot runs the rice year of `paddies/stages.ts`
(a little out of step with its neighbours, cut on its own day): cracked
dry clay, first rains and furrows, a nursery bed, flooded plots mirroring
the sky, seedlings planted in rows, lush green, heads turning gold and
bending, a harvest sweep with sheaves in stooks, straw stacks, stubble
that greys and is grazed away. Three draw calls: the plots' floor
(`ground.ts`: earth, mud, water mirroring `SKY` with clouds, the sun's or
moon's glitter, ripples downwind, rain rings), the rice tufts (`rice.ts`:
posed in the vertex shader; the jungle's sway plus waves running across
the field with `f.weather.wind`; parted round the explorer's legs) and the
props (`props.ts`: bamboo fences, two ting mong, stooks, straw stacks,
sugar palms; they cast shadows). Every change is a smooth function of the
season (nothing pops); per frame only uniforms. Walk-through (not in the
walk map); a footstep in a flooded plot is `stepWater`
(`stages.ts paddyFlooded`, walker.ts `stepSound`). Check with `season=`
(0 dry · 0.12 flooded · 0.25 young · 0.45 lush · 0.62 turning · 0.7
harvest · 0.8 stubble · 0.95 dry), e.g.
`cam=-150,26,112,-232,7,80` or `roam=walk&at=-196,83&yaw=270`.

## The floating village

The `village` part (`src/map/village/`, built right after the water so its
stilts and rafts get no rock foam; off the picker's frame) is a Tonle Sap
village on the great lake's east shore (layout.ts `VILLAGE`). Where things
stand is `_spots.ts` (no three.js): nine stilt houses astride the shore
line, their verandas and front stairs facing the village, their backs over
the shallows with a small deck and a ladder down to a moored boat; a shop
where the trails meet; the jetty (`JETTY`) out to the floating houses
(`FLOATING`: a floating shop by the jetty's head, a fish farm, a floating
garden); the pagoda (`PAGODA`) on the rise to the south, facing north, with
a naga stair, a colonnaded hall, a golden Buddha inside, two stupas, a bell
and a drum pavilion. `VILLAGE_SPOTS` (pagoda door and stair foot, jetty
foot and head, every home's door and stair foot, the floating homes) is for
people and festivals. Worship spot `village-pagoda-door` (roam/_worship.ts):
the porch, facing the Buddha. Files: `_house.ts` (walls, roof, windows of
any house), `_houses.ts` (stilt houses, jetty, shore life), `_floating.ts`
(rafts; `Bobbing` turns their instance matrices about each raft's middle,
only while the camera is within 330 m), `_pagoda.ts`, `_lights.ts` (window,
lantern and candle glows with halos, no lights), `_smoke.ts` (kitchen smoke:
points moved in the vertex shader; more at dawn and supper time, leaning
with the wind), `_kit.ts` (plank walls, stepped roofs, props). Everything is
solid in the walk map (verandas, stairs, jetty, rafts: the boat goes round
them) but plants and cloth. Roosters crow at dawn, hens cluck by day
(`f.calls`). Checks: `cam=-285,22,95,-325,8,55` (over the village),
`roam=walk&at=-304,63&yaw=225&sim=w:3&rcam=0,16,9` (the jetty),
`roam=walk&at=-306,82&yaw=0&sim=w:3.2&rcam=0,20,10` (up the naga stair),
`roam=walk&at=-306,10,95&yaw=0&sim=w:0.3,_:4.5` (he kneels at the pagoda),
`roam=boat&at=-360,40&yaw=90&sim=w:2&rcam=0,12,10`, with `night=1` or
`clock=0.75`.

## People

The `people` part (`src/map/people/`, index.ts has the map of it): one
blocky person model for everyone (`_personModel.ts`: boxes on 13 bones,
poses, props and colours per person, posed in the vertex shader; kinds in
`_kinds.ts`: monk, visitor, guide, kid, fisherman, dancer, villager — hats
are the Khmer palm-leaf hat `hatPalm` or a krama, never a conical hat),
`Actor` (`_actor.ts`, `ride` for boats and carts), roads and traffic
(`_routes.ts`), and scenes (`PeopleScene`, `_scene.ts`; far off they step
less often or hide, `Pace`): the monks and the sweeper (`_monks.ts`), the
tour group (`_tour.ts`), fishermen with cast nets on the great lake, the
valley river and the shallows (`_sceneFish.ts`), the ox cart on the village
trail (`_sceneCart.ts`, white oxen in the fauna kit's style `_ox.ts`; it
stops for the explorer and people step round it), children flying khleng
kites south of the paddies (`_sceneKites.ts`), farmers by the season
(`_sceneFarm.ts`: planting ≈ 0.08‥0.3, weeding, reaping and carrying
sheaves ≈ 0.6‥0.8, resting under a sugar palm), village life
(`_sceneVillage.ts`: verandas, the jetty, a fruit stall, children playing,
the monk's alms round; on the village's own walk map) and apsara dancers
with torch bearers, standing torches and a pinpeat ensemble in front of
Angkor Wat's gate at night (`_sceneApsara.ts`, `clock` 0.22‥0.51). Their
things (boats, cart, kites and strings, the thrown net and its foam ring,
torch stands, the stall) are boxes of one InstancedMesh written from the
CPU (`_things.ts`: `Rig`, `RigDef`). 6 draws, < 0.1 ms a frame. Sounds
(`PeopleCallKind` into `f.calls`, made by `audio/people.ts`): ox bells, the
cart's creak, a net's splash, children laughing (ambience bus), the pinpeat
(music bus). Checks: `people=lineup`, `people=<scene>,…` (only those),
`monks=`, `tour=`, `fish=<s>` (a throw: 5 the net flying, 6 the splash),
`cart=<m>` (along its loop: ≈ 100 on the dikes), with `season=0.2|0.68`,
`clock=0.35|night=1`; e.g. `people=apsara&clock=0.35&cam=-16.5,61,-146,-16.5,57,-158`,
`people=farm&season=0.2&cam=-238,12,77,-246,8.3,70`,
`people=kites&cam=-229,13,127,-237,17,104`,
`people=cart&cart=95&roam=walk&at=-180,83&yaw=-90&sim=_:3&rcam=0,14,10`.

## The day's events

`src/map/events.ts` is the event clock: `eventsNow(f)` (once per frame,
any part may call it; `EVENTS` is the same object) says which windows are
open (`on`), how often each began (`count`, `began`) and the weather's
effect on life (`shelter` 0‥1 in a storm, `umbrellas`, `hurry`, `storm`),
plus `festival` (Khmer New Year, Visak Bochea, Pchum Ben, the Water
Festival, from `season` and the moon) for later parts. Hours on the clock:
`dawnChant` 0.71‥0.81, `duskDrum` ≈ 0.22 (±, seeded by `day`). In the
daylight (0.8‥0.2 of the clock; while the clock is held in the day, on a
loop of its own every 10 min): `noonBell`, `elephantBath`, `monkeyCrossing`
(3×); none start in a storm. Sound: `audio/temple.ts` (ambience bus) — the
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

## World and scale

- 1 unit = 1 m. +X east (right), −Z north (away from the camera), +Y up.
- The map is real-size: summit temple ≈ 120 m wide with a ≈ 60 m central tower,
  cliffs 10–50 m, trees 8–15 m. Overview camera at (0, 110, 170) looking at
  (0, 20, −80), 55° field of view; most of the map is 150–500 m away.
- Blocks: the land is 2 m blocks, landmarks mostly 1 m (0.5 m for fine
  detail), trees 1 m leaf blocks. At 300 m a 1 m block is about 3 px, so
  shape and colour of groups of blocks matter more than tiny detail.

## Voxels

- Build with `VoxelBuilder` (`src/voxel/VoxelBuilder.ts`): `box`, `span`, or
  `grid({ cell, origin, mat })` → `set/put/fill` → `commit()` (hides buried
  cells, bakes soft AO). Then `buildVoxelMesh(builder, { quality: 'medium', name })`
  (one `InstancedMesh` per family; casts and gets shadows).
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

## Budgets (blocks = voxel instances)

terrain ≤ 260 k · vegetation ≤ 150 k · sanctuary ≤ 60 k · each other
landmark ≤ 20 k · road ≤ 20 k · foreground ≈ 3 k. Animals (fauna, wildlife):
≤ 6 draw calls and < 1 ms CPU a frame each; one `InstancedMesh` per species
posed in the vertex shader, only animals near the camera or the explorer
are updated, far ones hidden. Keep each part's build
under ~600 ms. The page must stay smooth (60 fps) on a MacBook (M1 Max).

## Checking your work

- Types: `npx tsc --noEmit 2>&1 | grep src/map/<your files>` (others work at
  the same time: ignore their errors, fix yours).
- Pictures (about 15 s each):
  `SHOT_W=1672 SHOT_H=941 SHOT_OUT=<your scratch dir> npm run shots -- name="@map.html?shot=1&<params>"`
  then view the PNG. Useful params: `night=1` · `t=<s>` (time for moving
  things) · `focus=<place id>` (closer camera on a place) · `ui=0` (no
  interface) · `parts=terrain,sanctuary` (build only these parts — faster, and
  hides others' work in progress) · `cam=x,y,z,tx,ty,tz` (any fixed camera) ·
  `lang=en` (English words; Khmer is the default).
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

`main.ts`, `camera.ts`, `foreground.ts`, `layout.ts`, `types.ts` belong to the
lead. If you need a change there, say it in your report.

## Report

End with a short report: what you built, files, block count and build time,
the last screenshot path(s), and anything you need from others or the lead.
