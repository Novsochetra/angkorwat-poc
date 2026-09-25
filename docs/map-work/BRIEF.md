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
**J**) makes the explorer leap off his ledge, glide down under a parachute,
then walk the map, paddle a boat on the rivers, fly a hang glider from a
cliff-top ramp and enter a temple at its beacon (**E**). **Esc** or "Back to map" returns to the overview. Code in
`src/map/roam/`:

- `types.ts`: the modes (`leap`, `glide`, `walk`, `boat`, `hang`), `RoamBody`,
  `RoamInput`, `RoamWorld` (ground to stand on, water, river current, the
  roaming area, places' entrances), `FollowCam`, `RoamHud`. `ROAM_SCALE`: the
  roaming explorer is 1.6 × his true 1.7 m, so he can hop up a 2 m land step.
- `roam.ts` runs one mode at a time and hands the camera between the
  overview rig and the follow camera; `main.ts` builds it after the parts.
- `walker.ts`, `followCam.ts`, `input.ts`, `world.ts`, `hud.ts`: on foot,
  the camera, keys / mouse / touch, the walkable world, the roaming interface.
- `parachute.ts` (leap + glide), `boat.ts` + `flow.ts` (boat, river current).
- `hangGlider.ts` (mode `hang`): E on a take-off ramp (`launchSpots.ts`:
  found on the land, the best cliff tops near a road; walkable decks; a
  wing mark on the mini-map) lifts the glider, runs down the ramp and
  flies; E in a long fall unfolds it in the air. A / D bank, W / S bar in /
  out (speed ↔ height), Shift fast, Space high up lets go. Rising air
  (`_lift.ts`): along cliffs, and in warm columns marked by golden seed
  fluff. Model `_gliderModel.ts`, ramp `_launchRamp.ts`, poses
  `_gliderPoses.ts` (upright with it, prone in the harness, the flare).
- Poses for vehicles use the animator's `posture` hook
  (`src/character/Animator.ts`).
- `tools.ts` + `photo.ts`: on foot the explorer has a tool bar (bottom
  centre): **1** lantern, **2** torch, **3** flashlight (**O** beam ahead ↔
  follows the mouse), **4**/**Z** camera, **5**/**Y** selfie phone (**T**
  selfie stick: on by default, the wheel slides it out); emotes
  **F** wave, **C** cheer, **U** look up, **P** peek; **H** hat, **G** outfit
  (in a selfie: gesture), **X** face, **V** photo album, **?** all keys.
  The camera and the phone also work in the boat (the paddle goes down
  on his lap) and on the hang glider (it flies on straight): the
  Animator's posture keeps the body, the device's arms go on top.
  Photos go to the game's album (`src/game/Photos.ts`, IndexedDB). The
  explorer is made with `propLights: false`: the tools own one PointLight and
  one SpotLight (no shadow) that are always in the scene (intensity 0 when
  unused), so the light count never changes (no shader recompiles).
- Mini-map (`src/map/ui/minimap.ts`): top right while roaming, turns with
  the view; **M** or a click opens the big map, where a click on a place
  sets it as the target (a gold arrow on the mini-map points the way).
  The land picture is drawn once, in small slices over several frames.
- Footsteps (`walker.ts stepSound` picks the ground): recordings in
  `assets/sound/`, cut into single steps when they load
  (`audio/footsteps.ts`) and played one per footfall (`audio/explorer.ts`);
  synthesized steps while they load or if they fail.

Because of roaming, the map is also seen from the ground and from every
direction: land, trees, mist and sky must hold up from there too (no
missing faces, no mist planes seen edge-on).

Check with URL params (in roaming shots always pass `sim=` and usually
`rcam=`, or the follow camera is not placed): `roam=leap|glide|walk|boat|hang` · `at=x,z` or `x,y,z` ·
`yaw=<deg>` (0 = facing south, 180 = north) · `sim=<keys:seconds,…>` a
scripted input run before the shot (`input.ts parseScript`, e.g.
`sim=w:2,wr:3,j:0.5`) · `rcam=yaw,pitch,dist` the follow camera's orbit ·
`tool=lantern|torch|flashlight|camera|selfie` (also in `boat` and `hang`) ·
`stick=0|1` the selfie stick · `sview=0‥1` hold the selfie view part way from the follow camera to the phone (see him holding the stick) · `act=wave|cheer|lookUp|peek` ·
`bigmap=1` · `target=<place id>` · `fauna=lineup` (every land animal in every
pose on the valley road) · `wildlife=<s>` (run the water animals' reactions).

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
  hides others' work in progress) · `cam=x,y,z,tx,ty,tz` (any fixed camera).
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
| land animals | `src/map/fauna/land.ts`, `src/map/fauna/_kit.ts`, `src/map/fauna/_land*.ts` |
| water and air animals | `src/map/fauna/waterAir.ts`, `src/map/fauna/_water*.ts`, `src/map/fauna/_air*.ts` |
| mini-map | `src/map/ui/minimap.ts`, `src/map/ui/_minimap*.ts` |
| interface | `src/map/ui/*` |
| sound | `src/map/audio/*` |
| roaming | `src/map/roam/*` (`roam.ts` and `types.ts` belong to the lead) |

`main.ts`, `camera.ts`, `foreground.ts`, `layout.ts`, `types.ts` belong to the
lead. If you need a change there, say it in your report.

## Report

End with a short report: what you built, files, block count and build time,
the last screenshot path(s), and anything you need from others or the lead.
