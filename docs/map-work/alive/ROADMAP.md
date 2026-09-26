# World map: make it alive (roadmap)

## Context
The user wants the world map (`index.html`, `src/map/`) to feel more alive.
The main pain: walking in the jungle shows only trees and a few animals.
The user likes all of these ideas: people, weather, festivals, goals, a hot air
balloon, a lake with a floating village, and temple sounds and events. (No kid guide: the user dropped it.)
The user also wants a group of visitors that walks with one tour guide.
Order agreed: calm life first (things to watch). Goals come last.

**Map size:** we do not make the map bigger. Growing `MAP_BOUNDS` touches about 12
systems (height grid, shadows, mist, clouds, mini-map, walk map, backdrop).
The south-west corner (about x −450…−260, z −80…115) is open lowland. It is in the
roam area (`ROAM_AREA`, `src/map/terrain/views.ts:72`) and outside the picker view.
The new lake goes there. Its water runs west under the edge mist, so it looks
endless (the real Tonle Sap lake is south-west of Angkor too).

**How we work:** one phase at a time. After each phase: screenshots, the user
looks, then we go on. **When this plan is approved, build Phase 0 (kneel) only.**
Phase 1A was started, then stopped. No files were changed.

## Phase 0. The explorer kneels at shrines (character)
**Goal:** when the explorer walks up to a shrine or place of worship and stops,
he kneels to show respect, the Khmer way.

**What he does (about 6 s):**
1. He turns to face the shrine.
2. He takes his hat off (in Cambodia you take the hat off at a temple).
3. He kneels on both knees and sits back on his heels.
4. He puts his palms together at his chest (sampeah).
5. He bows 3 times (thvay bangkum).
6. He puts his hat back on and stands up.

**When it happens (automatic):**
- He is on foot, on the ground, within about 5 m of a worship spot.
- He stands still for about 1 s (no move keys).
- It happens once per visit to the spot. He must walk about 12 m away before it can happen again at that spot.
- Any move key stops it at once, the same way moving stops `peek`.
- For checks: `act=pray` in the URL plays it.

**Where the worship spots are:**
- New list `WORSHIP` in `src/map/layout.ts`: `{ place, x, y, z, facing }`.
- Spots: the Buddha, altar or sanctum door of each temple that has one (Angkor Wat, Bayon, Preah Khan, Ta Prohm, Kulen), and the candle shrines already built (Preah Khan, Bayon).
- The exact points come from each landmark's build. Read them from the landmark code when building (search `CandleGlow`, altar, statue, door in `src/map/landmarks/`).
- The jungle shrines and the lone Buddha from Phase 1A add their spots to the same list later.
- Check that he can walk onto each spot (walk map, `roam/walkmap.ts`). Leave out any spot he cannot reach.

**Files:**
- `src/character/clips.ts`: add `'pray'` to `ActionName` (line 276) and a new `ActionDef`: full body (`FULL_BODY`), `allowLocomotion: false`, not looping, about 6 s. Build the kneel from the existing `crouch` pose (same file), with both knees down. The palms-together arms use the same joints as `wave`/`cheer`.
- `src/character/Animator.ts`: check that the feet planting (line ~623) lets the knees touch the ground. If it lifts the body, the pose sets its own height (like `postureFeet = false`).
- `src/map/roam/world.ts`: add `worshipNear(x, z, y)`, built like `placeNear` (line 36), with its own small reach (5 m) and rise (2 m) limits.
- `src/map/roam/walker.ts`: in the grounded block (line ~380), count still time near a spot, turn him to face it, then play `'pray'` through the same path as the emote keys in `roam/tools.ts` (line ~361). The hat goes off and on the same way **H** does.
- `src/map/roam/types.ts`: add `worshipNear` to `RoamWorld`.
- `src/map/roam/tools.ts`: accept `act=pray`. Add the prayer to the **?** key list as "kneel at a shrine (stand still)".
- Sound: a soft temple bell at the first bow (the existing `'enter'` bell, quieter).
- `src/map/ui/lang.ts`: Khmer and English words for the key list.

**The same pose in the game:** `clips.ts` is shared with `game.html`, so the game can use `'pray'` later too. For now we trigger it on the map only.

**Checks:**
- `npm run typecheck`, `npm run build`, and `npm run playtest` (the character changed).
- Pose: `npm run shots -- k1="@index.html?shot=1&roam=walk&at=<spot x,z>&yaw=<face the shrine>&act=pray&t=3&rcam=90,10,6"`. Take shots at about `t=1`, `t=3` and `t=5` to see kneel, palms together and bow. Also take one from the side (`rcam` yaw 90).
- Trigger: walk up to a spot with `sim=`, then stand still. He should turn and kneel.
- Look for: knees on the ground, no feet in the floor, the hat off, no pop at the start or end.

## How the map code works (to reuse)
- Parts: `BUILDERS` in `src/map/main.ts`. A part is `{name, object, update?, blocks?}` (`src/map/types.ts`).
- Walk map: parts not in `SKIP_PARTS` (`src/map/roam/walkmap.ts:38`) are solid. People, ferns and rain go in `SKIP_PARTS`.
- Animals: `fauna/_kit.ts` (a model made of boxes on bones, colour sets, one InstancedMesh per kind), `_landBrain.ts` (`Agent`/`Habits`: wander, flee, sleep), `_landTrek.ts` (walk the road stations, stop near the explorer), `_waterAirKit.ts` (small things that follow the explorer). Only animals within 250 m think (`fauna/land.ts:45`).
- Roam modes: `RoamModeHandler {enter, update, exit, object}` listed in `roam/roam.ts`. The walker switches mode with E, the way `world.launchNear` starts the hang glider.
- Ruins: `landmarks/_ruin.ts` (`overgrow`, `drapeRoot`, `growTree`, `CandleGlow`), `landmarks/_faces.ts` (`FACE_SMALL`, `FACE_TINY`).
- Sky: `sky/palette.ts updateSky(night)`. Words: `ui/lang.ts` (Khmer first).

## Phases

### 1. Jungle worth walking
- **1A. Trails and hidden places.** Dirt trails lead to about 12 small sites: fallen stone heads, gates covered in roots, a lone Buddha with an orange cloth, small shrines with incense, a monk hut, a woodcutter camp, a swing, a stream with a small waterfall pool and wooden bridges.
  - `layout.ts`: add `TRAILS` and `JUNGLE_SITES`. `main.ts`: add a `jungle` part after `path` and before fauna.
  - `heightfield.ts`: trails are dirt, 2 m wide, and trees keep off them.
  - New: `src/map/jungle/index.ts`, `_ruins.ts`, `_camps.ts`, `_bridges.ts`. Reuse `_ruin.ts` and `_faces.ts`. Do not use `src/kit/lib`, because its blocks are too small for the map.
  - Budget: ≤20k blocks. The part must build in <600 ms.
- **1B. Plants you walk through.** New `veg/undergrowth.ts`: ferns, vines and flowers placed round the explorer while he roams. They are not voxel blocks (the vegetation part is already at its 150k limit). Add bamboo as a kind in `veg/species.ts`.
- **1C. Animals up close.** New part `fauna/jungle.ts`, ≤6 draw calls: wild boar, green peafowl, hornbill, giant ibis, gibbons in the trees, and lizards, snakes and squirrels near the explorer. New calls go in `types.ts` + `audio/animals.ts`. A daytime cicada sound goes in `audio/ambience.ts`.

### 2. Sky and weather
- New `sky/weather.ts`: a seeded plan for wind, rain, storm and rainbow. It writes `f.weather` and `f.clock` (`night` keeps its meaning).
- New `sky/rain.ts` and `sky/stars.ts` (shooting stars).
- A dawn colour set, with the sunrise behind Angkor Wat. Moon phases.
- Lightning makes the existing sky light brighter, with no new light. Leaves sway in the wind.
- The rainbow sits in the west-north-west, over Bayon.

### 3. People
- New `src/map/people/`: one person model with these kinds: monk, visitor, tour guide, kid, fisherman, dancer.
- Routes on `Trek`. Props: broom, umbrella, flag, kite, net, torch, cart.
- Scenes:
  - Monks walk to Angkor Wat and sweep the steps.
  - A visitor group follows one tour guide (flag or umbrella), stops at each temple and listens.
  - A fisherman throws a net from a boat (a copy of `_boatModel.ts`).
  - An ox cart moves on the road (a new white ox, based on the buffalo).
  - Kids fly kites.
  - Apsara dancers perform at night with torches (glow only).

### 4. Temple sounds and events
- New `src/map/events.ts`, driven by `f.clock`:
  - monks chant at sunrise
  - a drum plays at sunset
  - elephants bathe in the river
  - monkeys cross the road
  - storms come in

### 5. Lake, floating village, rice fields (south-west)
- `LAKES` in `layout.ts`. Cut the lake into the land in `heightfield.ts`. The water and the boat work with it as they are now.
- New `src/map/village/`: houses on stilts and on boats (≤20k blocks). New `paddies.ts`: rice fields that change from green to gold with the season.

### 6. Hot air balloon
- Add `'balloon'` to `RoamMode`.
- New `roam/balloon.ts`, `_balloonModel.ts`, `_balloonPoses.ts`. The walker gets `balloonNear`.
- The balloon drifts with the wind. It gets a mini-map badge. The burner flame is glow only.

### 7. Festivals
- Dragon boat race on the lake.
- Lit boats and floating candles on the moat (`_sanctuaryWater.ts`).
- Khmer New Year.

### 8. Goals (later)
- Nature book from photos (`roam/photo.ts`), a temple passport, hidden gold, glider rings.

## Rules for every phase
- The number of lights never changes. Candles, torches, the burner and lightning are glow + bloom only.
- People and jungle animals each get their own part, because land fauna already uses 5 of its 6 draw calls.
- Build new shaders at load time, so the first rain does not stutter.
- Move the sun light only in small steps, because the 4096² shadow map is redrawn when the light moves.
- Seeded builds only, no `Math.random()`.

## Verification (each phase)
- `npm run typecheck` and `npm run build`.
- The `[map] built in …` console line gives the block count and ms for the new part.
- Shots (1672×941, `SHOT_W=1672 SHOT_H=941`):
  - Phase 1: `npm run shots -- j1="@index.html?shot=1&roam=walk&at=-200,-20&yaw=180&sim=w:3&rcam=0,15,8"`, then the same with `night=1` for the incense glow, and `parts=terrain,path,jungle,vegetation` for a fast check.
  - The picker view must look the same: `npm run shots -- m="@index.html?shot=1"`.
  - Later phases add params: `weather=`, `clock=`, `fest=`, `roam=balloon`, `roam=boat&at=-350,20`.
- Update `docs/map-work/BRIEF.md` and `CLAUDE.md` for new parts and params.
