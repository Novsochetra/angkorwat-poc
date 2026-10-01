# Roaming add-ons: the new things to do

The ideas picked from `docs/ideas.md` (October 2026): new ways to move, things
to join, a friend and a home, village life, more festivals, small things that
feel good, and a calendar that says when each Khmer event happens. Each is a
**roaming add-on**: a module of its own that plugs into roaming without
editing the walker, the boat, the tools or roam.ts.

This file is the contract every add-on follows, and its notes (one section
per add-on at the end: what it does, its keys, its URL values for shots).

## The contract (`src/map/roam/_addons.ts`)

An add-on module calls `registerAddon({ id, … })` when it is imported. Its
import line goes in `src/map/roam/_addonList.ts`, under its group's comment.
Add that line only once the module compiles (`npm run typecheck`): a broken
import breaks the map for everyone.

What roaming does with a `RoamAddon` (all members optional but `id`):

| Member | When | What for |
| --- | --- | --- |
| `init(env)` | once, roaming built | keep `env` (`AddonEnv`: explorer, body, follow camera, world, hud, layer, controls, canvas, parts, `scene` (roaming's group: add your meshes here), photo, purse, params, shot, uiSound, `busy()`) |
| `input(ctx, mode, tap, dt)` | each roaming step, before the mode's | your keys (`tap('Digit7')`); return true to take the step's input (he keeps still) |
| `offer(ctx, 'walk'│'boat')` | each step on foot on the ground / afloat, nothing else busy | the prompt `E  <words>` when E here starts you, else null (cheap: no allocation) |
| `use(ctx, mode)` | E pressed while you offered | start; return a mode to switch to, or nothing |
| `order` | the E row | ≤ 15 (`BEFORE_SHRINE`): right after a golden figure, before a shrine; else after a stall, before a moored boat, a ramp, the balloon, the swing and a place's beacon (default 50) |
| `holding` + `hold(ctx, dt)` | while `holding` is true, instead of the walker's step (`holdIn: 'boat'`: the boat's) | you move the body (`ctx.body.pos/vel/yaw`), set the pose (`explorer.animator.posture`, `explorer.setMotion`), the camera (`ctx.cam.focus`, `behindYaw`, `distance`, `fov`), turn the camera with `ctx.cam.turn(input.lookYaw, input.lookPitch, input.zoom)`; return `{ prompt, mode }` |
| `handsBusy` | read each step | true: the lantern, torch or flashlight is put away |
| `after(ctx, mode, dt)` | each roaming step after the mode's (every mode) | follow-ups (the dog follows, the umbrella's pose) |
| `frame(f, mode)` | every frame, every mode (the overview too) | visuals that move on their own |
| `setMode(next, prev, ctx)` | the mode changed | stop what cannot go on (`next === 'overview'`: back to the map: stop at once, put things back) |
| `fromUrl(q, ctx)` | a shot or a saved view started roaming | your URL values (checks) |
| `report()` | a bug report | URL params that bring your state back in a shot |

Rules:

- **No new roaming modes.** A ride (the bicycle, the cart, the buffalo, the zip
  line, the ladder, the race boat) is a walk-mode add-on that holds him
  (`holding`), as the rope swing does (`_swingRide.ts`: read it first).
- **Prompts** are `` `E  ${t('yourKey')}` `` (the key, two spaces, the words). The
  hud draws E as the pad's □ / X while a pad is in use. Hide your prompt while
  `env.busy()` (praying, resting, at a stall, the camera up, the album).
- **Keys**: prefer what every device has: the move stick (`ctx.input.move`),
  Space (`input.jump`, `jumpHeld`), E (`input.use`), Shift (`input.run`), the
  look drag and wheel. Those work on a keyboard, a game pad and the touch
  controls. Keys reserved for add-ons (already in `input.ts` `TOOL_KEYS`, read
  with `tap`): **7** binoculars, **8** umbrella, **9** calendar, **0** call the
  dog, `,` and `.` spare. Every other letter is taken.
- **Words**: Khmer first, then English, in `src/map/ui/lang.ts` under your own
  comment line near the end ("The new things to do"), keys with your prefix
  (`bike…`, `ham…`). Real, natural Khmer (a Cambodian player reads it). Numbers in
  sentences with `num()`. Use small anchored edits; re-read the file before
  each edit (many add-ons edit it at the same time).
- **Khmer, not Thai** (CLAUDE.md): Angkorian forms, the krama and the palm-leaf
  hat (never a conical hat), the flag with three towers, ngo racing boats
  (never dragon boats), Khmer script on signs (Koulen).
- **Props on him**: `explorer.rig.setSlot(slot, joint, voxelBuilder)` or
  `setSlotObject(slot, joint, group)`; clear it when done (`clearSlot`). Never
  edit `AngkorExplorer.ts`, `clips.ts`, `parts/face.ts` (only the clothes
  add-on owns `AngkorExplorer.ts`). Look at `parts/props.ts`, `parts/food.ts`.
- **Poses**: a posture of your own (`explorer.animator.posture = (t) => Pose`,
  `postureFeet = false` when the posture places the body itself), in a module
  of your own under `src/character/` (see `rest.ts`, `meals.ts`,
  `roam/_boatPoses.ts`, `_balloonPoses.ts`, `_swingRide.ts`). Arms by IK: `solveArm`.
  Put `posture = null` and `postureFeet = true` back when you stop.
- **Saved state** (between visits): `src/map/progress.ts`
  (`progress.get('dog.name', '', isString)`, `progress.set(…)`); keys with your
  prefix. Shots save nothing and start fresh.
- **Riel**: `env.purse.pay(n)`, `env.purse.earn(n)`, `env.purse.riel`. What he
  carries to eat: `env.purse.keep/kept/take` (food only).
- **Sounds**: your own, in `src/map/audio/_<yourid>.ts` (synthesized with `dsp.ts`'s
  helpers, as `audio/explorer.ts` makes his): `registerSfx(name, make, bus)` /
  `registerLoop(name, make, bus)` from `audio/addonSfx.ts`, played with
  `SFX.play('bikeBell')` / `SFX.level('bikeChain', v)` (names with your prefix). Never
  edit `RoamSound`, `audio/explorer.ts` or `engine.ts`. Gentle levels: compare with
  the footsteps and the paddle.
- **Shops**: `registerShop` (src/map/shop.ts) for food and drink stalls.
- **Time**: `src/map/time.ts` (`TIME.days()`, `moment(d)`, `skipTo(d)`,
  `cycling()`); **events**: `src/map/calendar.ts` (`registerEvent`) — anything
  that happens at a time of day or of the year registers itself there, with the
  same rule it plays by, so the calendar can say when.
- **The map's parts**: `env.parts.find((p) => p.name === 'people')`. Hooks
  between parts are plain module objects (see `src/map/greet.ts`,
  `roam/_shop.ts` `stalls`, `treasure/hooks.ts`): no part imports another's
  three.js objects.
- **Cost**: no allocation in per-frame code; few draw calls (merge or instance);
  hide what is far (`f.camera`), build lazily (first use, or in idle time after
  Start), never block the first frame. A part of your own goes in main.ts's
  `BUILDERS` (one line) only if it must; roaming's `env.scene` is simpler.
- **Mini-map**: a new place gets a badge in `ui/_minimapSpots.ts` (anchored
  edit: a `SpotId`, a picture, a `MAP_SPOTS` entry).

## Checking

- `npm run typecheck` (errors in files that are not yours are another add-on's
  work in progress: leave them; yours must have none).
- Pictures: `SHOT_W=960 SHOT_H=600 npm run shots -- <yourid>-<what>="@index.html?shot=1&roam=walk&at=x,z&yaw=<deg>&sim=e:0.1,_:2&rcam=yaw,pitch,dist&<your params>"`,
  then look at `screenshots/<name>.png`. Name every shot with your id first (other
  add-ons shoot at the same time). The shots draw on the CPU (slow, ~1 min):
  one at a time; `parts=terrain,water,people,foreground,…` (only what the
  picture needs; walking needs `foreground`) is quicker. `sim=` keys run before
  the shot (roam/input.ts `parseScript`: `w:2` holds W 2 s, `e:0.1` taps E,
  `_:1` waits). Make your add-on's states reachable from the URL (`fromUrl`).
- Things that need real frames (timing, held keys, 60 fps): GPU Chromium with
  Playwright (`gpuChromium()` in `scripts/video.mjs`; headless; your own Vite
  port), as the notes in CLAUDE.md say.
- The console: a shot prints page errors; there must be none from you.

## Add-on notes

Each add-on adds its section here (what it does, where, its keys, its URL
values for shots), under its own heading, in this order.

### Calendar of events
### Bicycle
### Ox cart ride
### Water buffalo ride
### Zip line
### Sugar palm ladder
### Hammock
### Binoculars
### Umbrella
### Smiles for the camera
### His name in Khmer letters
### Kick the sey
### Kite
### Monkeys steal his snack
### Alms round at dawn (dak bat)
### A monk's blessing (the red string)
### Lotus from the boat
### Selling fish
### Clothes from the market
### Helping the farmers
### The dog
### His stilt house
### The boat race
### Pchum Ben and Visak Bochea
### The equinox sunrise
