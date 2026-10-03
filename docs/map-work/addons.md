# Roaming add-ons: the new things to do

The ideas picked from `docs/ideas.md` (October 2026): new ways to move, things
to join, a friend and a home, village life, more festivals, small things that
feel good, and a calendar that says when each Khmer event happens. Each is a
**roaming add-on**: a module of its own that plugs into roaming without
editing the walker, the boat, the tools or roam.ts.

This file is the contract every add-on follows, and its notes (one section
per add-on at the end: what it does, its keys, its URL values for shots).

## The contract (`src/map/roam/_addons.ts`)

An add-on module calls `registerAddon({ id, … })` when it is loaded. Its
loader line (`() => import('./_yours')`) goes in `src/map/roam/_addonList.ts`,
under its group's comment. The add-ons are chunks of their own, not in the code
the map needs first: `loadAddons()` starts their download as the map's build
begins (main.ts) and roaming waits for them (roam.ts `buildRoam`), so their
meshes are in the scene when the map compiles its shaders before Start (none is
compiled in the middle of play; one that arrives late anyway is started there
and then: `init`, then `setMode` with the mode he is in). So no other module may
import an add-on's module: what the shared interface needs from
one goes through a small hook object (`MENU_HOOKS` in `_addons.ts`, the add-ons'
own `_…Hook.ts` files). The explorer menu's Look page is an add-on's too
(`MENU_PAGES.look`: a `MenuPage`, its `el`, `shown(on)`, `update()`, `first()`;
the menu holds its tab and its place), with his looks as the tools hold them
(`LOOK_TOOLS`: the four looks, the hat, the face).

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
| `keys()` | read each frame while it holds him | the key help's lines (bottom left) instead of the mode's: `[['W S', 'bikePedal', 'lstick'], ['Space', 'bikeBell', 'south']]` (keys, words, pad glyphs); return the same array while nothing changes |
| `after(ctx, mode, dt)` | each roaming step after the mode's (every mode) | follow-ups (the dog follows, the umbrella's pose) |
| `frame(f, mode)` | every frame, every mode (the overview too) | visuals that move on their own |
| `setMode(next, prev, ctx)` | the mode changed | stop what cannot go on (`next === 'overview'`: back to the map: stop at once, put things back) |
| `fromUrl(q, ctx)` | a shot or a saved view started roaming | your URL values (checks) |
| `report()` | a bug report | URL params that bring your state back in a shot |

Rules:

- **No new roaming modes.** A ride (the bicycle, the cart, the buffalo, the zip
  line, the ladder, the race boat) is a walk-mode add-on that holds him
  (`holding`), as the rope swing does (`_swingRide.ts`: read it first).
- **Touch**: while a ride holds him, say what the touch Jump button does
  (`touchJump('bikeBell')`), or hide it while it does nothing (`touchJump('hide')`);
  `touchJump(null)` as he gets off (roam/_addons.ts).
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

"When is each Khmer event?" while roaming (add-on `calendar`: `roam/_calendar.ts`,
the card `_calendarCard.ts`, the events `_calendarEvents.ts`, the words for
times `_calendarText.ts`, the pictures `_calendarIcons.ts`, the Khmer lunar
calendar `_calendarKhmer.ts`, the bells `audio/_calendar.ts`, the maps
`ui/minimap.ts`; the core `map/calendar.ts`).

- **The events** register with the rule their part plays them by, read from
  that part (tiny exports, no copied numbers): the Water Festival and Khmer
  New Year (`festival/_schedule.ts festivalAt`; `fest=` holds one: `shown`),
  the monks' dawn chant and the pagoda's dusk drum (`events.ts SLOTS`,
  `slotOpensAt`), the alms rounds (`people/_sceneVillage.ts ALMS_ROUND`, the
  forest monk's `_sceneBackFolk.ts MONK_AT`, Angkor Wat's procession walking
  up the valley road with its bowls `people/_monks.ts almsWalkAt`, where it
  takes dak bat; the sugar-palm village's is `_dakBat.ts`'s), the three morning markets
  (`hamlet/_mkPlan.ts BUSY`, `_bhMarketPlan.ts BUSY`, the floating village's
  boats `village/_fvPlan.ts FV_BOATS`), the apsara dance (`_sceneApsara.ts
  SHOW`‥`END`), the elephants' bath and the macaques' crossing (`events.ts`'s
  daylight windows; while the clock is held in the day they run on the held
  day's own 10-minute loop: `heldDay`, `heldLoopsNow`; where: `EVENT_SPOTS`,
  and the bath goes on while the elephants are in the river: `EVENT_LIVE`,
  both set by fauna/land.ts at its build), the khleng ek over the east fields
  (`_sceneKites.ts kitesFlying`), rice planting and the harvest
  (`_sceneFarm.ts farmModeOf`, by day). Kinds: `festival`, `daily`, `season`,
  `rare`. **A new event** (Pchum Ben, Visak Bochea, the equinox, the boat
  race): `registerEvent({ id, kind, name, note, place, begins, where, on,
  real? })` from its own module, a picture line in `_calendarIcons.ts
  EVENT_ART` (else its kind's), its words; the card, the toasts and the maps
  follow. `real(from)` gives its next days in real life (`_calendarKhmer.ts
  nextLunarSpan(from, LUNAR.<month>, <day 0‥29>, before, after)`).
- **The card**: **9**, the button under the mini-map (its line: what is on
  now, a gold dot, or what comes next, "Morning market · in 3 min"; on touch,
  upright, left of the mini-map, clear of the tool bar), or the
  explorer menu's Calendar (I, its Bag page; the pad: △, R1 to Bag). Its title, the map's
  moment (the part of the day, the season by its rains, the moon's Khmer day:
  "ព្រលឹម · រដូវវស្សា · ថ្ងៃ៥កើត"); **Now** (where, "until midnight · 2 min
  left"), **Today** (the next day of the map: "at dawn · in 3 min"),
  **Festivals ahead** ("in 25 days of the map · about 2 h 32 min of play",
  and "In real life: 23–25 November 2026 · Full moon of Kadeuk"), **Seasons**.
  Each row: **Show on map** (the mini-map's target: the gold arrow, "You have
  arrived" within 24 m; the card shuts) and **Wait for it**. ↑ ↓ ← → between
  the buttons, Enter / Space press, 9 or Esc shut it (the roaming keys never
  see them), W A S D or the stick walk away; the pad: a layer (✕ press, ○
  shut); touch: a tap outside shuts it, on a phone a sheet along the bottom
  (the buttons by their pictures). The mini-map steps aside while it is open.
  While the time stands still (Time: Day or Night) the foot says so in one
  line ("… Settings → General → Time of day: Cycle"), the rows say "once time
  runs", and there is no Wait.
- **Wait for it**: a low bell, fade out, `TIME.skipTo` half a day before a
  far event (the festival part builds meanwhile), then 6 s of play before it,
  wait for `TIME.building()` (≤ 12 s), fade in, "About to begin" (and the
  mini-map heads there when it is over 60 m away). He stays where he is; a
  ride goes on. Back to the map meanwhile cancels it.
- **As an event begins** (crossing its start while the time runs; never
  what was on at the start, nor what a jump of the time passed over): a
  banner with its picture ("Now on · The morning market is open · Sugar Palm
  Village") and a soft two-note bell (`whenChime`, ui bus). Festivals and
  rare moments always, a season's first day always; a day's moment (or a
  season's other days) only within 260 m (`NEAR`, the monkeys 160), or the
  first time in a visit (far off: one in 40 s at most, the dawn brings
  many); the one waited for always. One banner at a time (5 s), a day's
  moment that waited over 12 s dropped; a jump of the time clears them.
- **The maps**: a gold badge with its picture where an event is on now
  (`ON_NOW`), a gold ring pinging from it on the mini-map; named on the big
  map ("Now · 240 m"; events in one place share a badge), a target there too.
- **Real-life dates**: the Khmer lunisolar calendar (Chhankitek rules, as the
  momentkh library), checked against the official holidays: the Water
  Festival 2016‥2026 (2026: 23–25 November), Visak Bochea 2024‥2026, Pchum
  Ben 2024‥2026; Khmer New Year: 14–16 April (the map's year turns on
  14 April, main.ts `SEASON0`). The map's own festivals keep the game's rule
  (`festivalAt`: the moon and the map's quick year).
- **URL**: `calendar=1` the card open · `whendate=YYYY-MM-DD` the real day for
  the real-life lines · `whenfocus=<id>:show|wait` the ring on a button ·
  `whentoast=<id>` its banner · `whenskip=<clock>` (live page, time running)
  the time moved on to that clock first · `whenwait=<id>` (live) waits for it ·
  `target=event:<id>` (the mini-map) · `event=elephantBath` shows the bath as
  on · `report()`: `calendar=1`. Checks in a live page: `window.__calendar`
  (`open`, `waiting`, `onNow`, `days()`, `next(id)`, `toggle()`, `wait(id)`,
  `show(id)`).
- **Cost**: twice a second a rule each (no allocation per frame); the next
  times worked out one event a frame, then kept until they pass; the card's
  festivals (a year of the map, 400 days ahead at most) when it opens; the
  Khmer calendar once a day (kept).

### Bicycle

`roam/_bike.ts` (id `bike`, words `bike…`), the places `roam/_bikeSpots.ts`, the
model `roam/_bikeModel.ts`, his posture `character/bike.ts` (`BIKE`: the
bicycle's size in his body units, shared with the model), sounds `audio/_bike.ts`,
a badge on the maps (`ui/_minimapSpots.ts`: `bike-wat`, `bike-market`,
`bike-hamlet`, named "ចំណតកង់ / Bicycles", targets like the villages; the village's
bicycle, 19 m from the market's, shares that badge: on the big map they would sit on
each other).

- **Where**: four black Khmer town bicycles (step-through frame with two curved
  tubes, sprung saddle, upright bars with a brass thumb bell, a woven basket on
  the front with a dynamo lamp under it, a rack with a red reflector, mudguards,
  a chain case, a side stand; each carries something: a krama on the rack, morning
  glory or a coconut in the basket, a sack of rice) stand on their stands: on the
  forecourt's grass east of the head of Angkor Wat's road, by the pad's edge, clear
  of the apsara stage and the equinox crowd (bicycles are hired out by the real
  temple's west entrance), at the end of the morning market's row of parked motos
  and bicycles, at the sugar-palm village's west end in front of its first house
  (which keeps its own bicycles under it), and with the bicycles at the foot of the
  lane by the little market behind Angkor Wat. Sized for him (his legs are short,
  his belly round: a low saddle, short cranks, the grips well forward); all four
  are one `Things` (the people's instanced boxes: one draw, one for the shadows),
  only the one moving is written.
- **Getting on and off**: on foot by one (1.7 m from its middle), E
  "ជិះកង់ / Ride the bicycle": he steps over, the stand flips up, he sits with his
  left foot down (0.6 s). E "ចុះពីកង់ / Get off": it brakes to a stop first, then
  he steps off to his left (else his right, or behind it: wherever he fits) and the
  bicycle stays on its stand where he left it (leaning on it, the bars turned a
  little). Back to the map (Esc), every bicycle goes back to its place.
- **Riding** (a walk-mode add-on that holds him): W pedals (the speed builds up:
  ≈ 5 m/s in 2 s, ≈ 8 at most; a half push of the stick goes slower), Shift (R2,
  the stick past its ring) pedals hard (≈ 11; he rocks over the pedals), S brakes
  (an old rim brake squeals a little from speed), and held once stopped walks it
  back slowly (his left foot stepping); A / D steer the front wheel (a real turning
  circle: 1.6 m at a walk, wide at speed — the sideways pull never past 6.5 m/s²)
  and he leans into the turn with it; stopped, A / D shuffle it round with his foot
  down (out of a corner). Space rings the bell, "kring-kring". The camera or the
  phone up, the album open: he brakes to a stop (no hands on the bars) and the
  camera works as in the boat. A card or a menu that pauses roaming ("Back to the
  map?", the calendar, the explorer menu, the name, clothes or dog cards, the big
  map, the settings: whatever takes the game pad, `pad.inMenu`, or asks,
  `body.mu-asking`) stops it firmly where it is: nobody steers meanwhile. The keys
  show over him ("E  Get off · Space  Ring the bell") for 5 s after getting on and
  whenever he is slow; on a touch screen the jump button says "កណ្ដឹង / Bell" while
  he rides (`touchJump`), "Jump" again once he is off. The key help (bottom left)
  shows his keys while he rides (`keys()`: W S pedal · brake, A D steer, Shift pedal
  hard, Space the bell, E get off, Q R look; the pad's buttons with a pad).
- **The ground** (the walk map, `world.standAt`, probed along the bicycle and his
  shoulders): roads, paths, fields, courtyards; steps up to 0.42 m it bumps over
  (a thud, the basket rattling, he sinks a little), the bicycle pitching between its
  wheels; a stair's riser or a land step (0.65 m, or 1.6–2.4 m) up or a drop over
  0.45 m down: it stops, "ចុះពីកង់សិន ទើបដើរឡើងបាន / Get off the bicycle to climb
  up" (or "…ចុះបាន / …climb down"); deep water (0.38 m): it stops at the bank,
  "ទឹកជ្រៅពេក ជិះកង់កាត់មិនបានទេ / Too deep to ride through". A rise slows it, a fall
  speeds it, each ground rolls as it does (stone and planks best, sand worst). A
  wall, a post, a table or a kerb met at a slant: it turns along it (losing the
  speed that went into it); head on it stops. The roaming area's edge slows it as on
  foot (`rMist`). The people step aside for him as for him on foot (he is in walk
  mode: people/_routes.ts `Traffic`).
- **What hangs at his head's height** (his hat's brim 2.1 m, its crown 2.45 m, and
  its sides: his head is wide) he slows for and stops short of, his foot down,
  "ទាបពេក ជិះកាត់មិនបានទេ / Too low to ride under": a stall's umbrella, an awning,
  cloth on a line, vines hanging from a wall (`roam/_bikeCanopy.ts`: the soft boxes of
  the built parts that hang 1‥2.6 m over the land, indexed when roaming is built,
  before any part's first update; each read as it is now, so a market's umbrellas
  folded away at closing are not there and stop nothing), or a lintel or a beam lower
  than his hat (`world.ceilingAt`). A tarp up over his hat he rides under; the trees'
  low leaves he rides through, as he walks through them. While the children kick the
  sey in the sugar-palm village (`SEY.out`, sey.ts) he stops 4.4 m from the circle's
  middle (its children stand at 2.9 m), "ក្មេងៗកំពុងលេងទាត់សី / The children are
  playing sey"; riding away from it is free.
- **His posture** (`character/bike.ts`, `postureFeet = false`): the sit bones on
  the saddle, the fists on the grips (arm IK, the bars turning with the steering),
  the balls of his boots on the pedals (leg IK in the leg's own plane, the ankles
  working through the stroke: `pedalPitch`), so his legs pedal in time with the
  cranks; stopped, he slides to the saddle's nose and puts his left boot flat on the
  ground, the bicycle leaning 0.23 rad to that side (`STOP_LEAN`), the right pedal
  coming up and forward to push off from. The bicycle's lean and pitch carry the
  whole of him; he looks into a turn. His lantern goes away while he rides
  (`handsBusy`) and comes back as he gets off.
- **The bicycle**: the wheels turn with the way rolled, the cranks with his
  pedalling (coasting they come level; the pedals stay level under his boots), the
  bars, the fork, the front wheel and the basket with the steering, the stand flips.
  At night, rolling, the dynamo lamp glows and lays a soft warm pool of light on the
  road ahead (one additive quad), brighter the faster it turns.
- **Camera**: behind the bicycle (it swings back there more firmly than on foot),
  a little further back and wider at speed (the player's zoom kept under it).
- **Sounds** (`audio/_bike.ts`; under his footsteps, measured offline): `bikeChain`
  (the chain over the sprocket, a soft clack each push, by the cadence) while he
  pedals, `bikeFree` (the freewheel's ticks, faster as it rolls) while it coasts,
  the tyres on the `steps` bus by the ground (`bikeDirt`, `bikeGrass`,
  `bikeStone`), `bikeBump`, `bikeBrake`, `bikeStand`, `bikeBell`.
- **URL**: `bike=ride` puts him on the nearest bicycle at `at=` facing `yaw=`
  (it comes to him), `bike=ride:<m/s>` already rolling; `bikeleft=<spot>:x:z:yaw°,…`
  a bicycle left away from its place (`wat`, `market`, `village`, `hamlet`). The
  bug report gives both. E.g. `roam=walk&at=325,-84&yaw=270&bike=ride&sim=w:2,wa:1`
  (the market's lowland, riding west then turning left), `…&sim=_:1` (stopped,
  his foot down), `…&night=1&sim=w:2` (the lamp), `roam=walk&at=10,-151.3&yaw=180`
  (on foot by the Angkor Wat bicycle: its prompt).
- **Checks**: `(await import('/src/map/roam/_bike.ts')).bikeDebug()` in the
  console (the phase, the speed, the steering, the lean, the lamp, each bicycle); the
  console line `[map] bicycles: 4 · N things hanging at head height … indexed in N ms`.

### Ox cart ride

`roam/_cartRide.ts` (id `cart`, words `cart…`), his pose `character/cartRide.ts`,
sounds `audio/_cart.ts`; the cart is the people's (`people/_sceneCart.ts`), the
two share `people/_cartHook.ts` (`CART`: where the cart is, a point of it on the
map, who rides, the farmer's cues).

- **What**: the ox cart goes round its loop on the village trail (out from the
  village to the valley road's end, a turn, back, a turn round the village's
  tamarind) and waits at both ends (30 s far, 50 s by the village shop). On foot
  just behind its tail, while it stands or rolls at its slow pace (≤ 0.8 m/s), E
  "ជិះរទេះគោ / Ride the ox cart": he turns his back to it, crouches and springs
  up; the farmer has let the tailboard down flat (a hinged part of the cart) and
  he sits on it, legs over the end, fists on the edge, facing back down the
  trail, swaying and bobbing with the cart, swinging his legs, looking round. The
  farmer turns round on his seat and says (a bubble over him) "ឡើងមក ក្មួយ!
  អង្គុយឱ្យជាប់ណា"; leaving a stop with him "តោះ ទៅមុខទៀត!"; standing for the
  night "យប់ហើយ គោត្រូវសម្រាក" (at night he stays out with the cart until the
  explorer is down and gone); "ដើរលេងឱ្យសប្បាយណា ក្មួយ!" as he hops off. The cart
  keeps its own pace and loop. E or Space ("E  ចុះពីរទេះ / Hop off"): a small hop
  off the end (at any speed) onto land only — straight back, or a little to a
  side, or off a side; no water, no wall, not a drop: the prompt waits for land.
  Esc / back to the map: he is off at once, the cart goes on.
- **Camera**: behind the cart and a little to its side (his face, the cart and
  the oxen in one view): it comes round there as he climbs on, and swings back
  there as the cart goes; the drag looks
  round. It never goes into the cart or the oxen: its line to his head stays over
  the load, the farmer and the oxen (and from the front it rises to look down
  over the cart at him).
- **On foot**: he cannot walk into the cart or the oxen (they are not on the walk
  map): eased out to the nearest side, as the cart also eases him aside when it
  swings round at a turn. It stops for him only when he is really in its way (on
  its loop just ahead, within the width of the cart and the oxen: `LANE_HALF`);
  beside the trail (the jungle spirit house's prayer spot, 2.7 m off) it goes by.
  Near its lane it eases aside where the ground is open and dry (≤ 1.5 m, steering
  out and back along the loop, slower meanwhile); in the middle of its way it
  stops, after 4 s the farmer asks "សុំផ្លូវបន្តិចណា ក្មួយ! / Excuse us, may we
  pass?" (again every 15 s), and after 8 s it goes round him if there is room
  (≤ 2.3 m).
- **Key help** while riding: E / Space hop off, Q R look, 4 5 photo (`keys()`); on
  a touch screen the Jump button hides (the E button, with the prompt, hops off).
- **At night** a kerosene lantern hangs from a bamboo pole at the cart's front
  corner (from dusk, `night` > 0.32), swinging on its cord, the flame flickering.
- **Sounds**: the cart's creak (a little softer with him on it) and the oxen's
  bells are the people's, close by on its back; his own (`moves` bus): the wheels
  rolling (`cartRoll`, by the cart's speed), a hub's knock every 1.6 m
  (`cartKnock`), the planks and the straw as he sits down (`cartClimb`).
- **URL**: `cartride=1` puts him on its back at once; `cartride=on` stands him
  behind the tail and climbs on as E would (the farmer's welcome follows). With
  `cart=<m>` (its place on the loop, 462 m round: 0 the village, ≈ 202 the far
  stop, then its turn, ≈ 434 the home stop) and `roam=walk&at=` anywhere near it (the cart is drawn within ≈ 400 m of
  the camera). `rcam=` then turns from behind the cart (0: behind it, looking the
  way it goes; default ≈ 32°, 15°, 9 m). Hop off: `sim=_:0.5,e:0.1,_:0.25`
  (mid-hop), `…,_:1.2` (down). The bug report gives `cartride=1&cart=<m>&rcam=…`.
  E.g. `people=cart&cart=95&roam=walk&at=-180,83&cartride=1&sim=_:1`.
- **Checks**: `window.__cartRide.state()` (phase, the cart's place and speed,
  the landing spot), `.board()`, `.seat()`, `.outside(x, z)` (m outside the cart's
  and the oxen's boxes).

### Water buffalo ride

`roam/_buffaloRide.ts` (id `buffalo`, words `buf…`), his pose
`character/buffaloRide.ts`, sounds `audio/_buffalo.ts`; the buffaloes are the
land animals' (`fauna/_landBuffalo.ts`, `fauna/land.ts`), the two share
`BUFFALO_RIDE` in `_landBuffalo.ts` (the herd, the one ridden and its tilt,
land.ts's clock, whether he comes up calmly).

- **Which**: the two river herds (three each): on the banks and in the shallows
  below the River Gate (≈ −28, 70) and in the valley (≈ 35, 7). They are as big
  as the hamlet's buffaloes and the oxen beside the people (`BUFFALO_SIZE` 1.3,
  each ×0.92‥1.02; they were the model's size, too small under him). Walking up
  to them calmly they let him come (no look-up, no running off); running at them
  (Shift) scares them as before. (The hamlet's two in the lotus pond are the
  people's, not ridden.)
- **What**: by a buffalo standing, grazing or lying (its legs still), within a
  step of its flank, E "ជិះក្របី / Ride the buffalo": he hops up from his side
  (knees tucked, the far leg over its back, hands on its back) and sits astride
  just behind the hump, his thighs spread over its broad back, the shins over its
  flanks, both fists on the nose rope (it uncoils from the ring and comes up into
  his hands). A lying one waits a moment, grunts and heaves itself up hind end
  first with him on it. W walks it on (1.15 m/s × its size, slow to start and to
  stop), Shift a little faster (1.65), S backs it up a step, A / D turn it slowly
  (0.6 rad/s, stepping round on the spot when it stands); the move stick and the
  pad's left stick the same (R2 faster). Every 22–45 s of walking on grass or
  earth it stops 2–3 s to graze (the first time a toast says so; Shift urges it
  on), left standing it nibbles; now and then it lows, low and soft (its head up a
  little), and snorts. It follows the land as the walker does (the walk map:
  `standAt`): up and down the land's 2 m steps (a heave up, its body tilted, a
  grunt), round walls and trunks, never onto stairs, temple terraces, bridges'
  planks, jetties or anything built (a toast: "ក្របីមិនព្រមឡើងទីនោះទេ"; earth
  flush with a bank, like the pond's wallow, is land), nor past the mist. It
  wades into the rivers (1 m), the lotus pond (0.6 m) and the lake's shallows
  (a splash going in, then wading), and stops where its head is out over open
  water with no bank within 8 m ("ទឹកជ្រៅពេក ក្របីមិនព្រមចុះទេ"). Its body rocks
  with its stride (the shader's walk on the ride's clock: the act channel holds
  1 + its step phase, a little more roll, nod and lift under a rider) and he
  sways with it a moment late; he looks into its turns. E "ចុះពីក្របី / Get off":
  it stops, then he slides off on his side (else the other, its rump, its
  shoulders) onto ground no deeper than he wades; none: "ចុះនៅទីនេះមិនបានទេ…".
  It grazes where he left it; back to the map (Esc) he is off at once and every
  buffalo he rode goes home. His lights go away while he rides (his hands are on
  the rope); the camera and the phone work from its back.
- **Keys shown**: while he rides the key help (bottom left) is the ride's (`keys()`:
  W S walk on · back up, A D turn, Shift a little faster, E get off, Q R look;
  with a pad the left stick, R2, □, the right stick). On a touch screen the Jump
  button is hidden while he rides (`touchJump('hide')`: it would do nothing; the
  stick past its ring urges it on, as the first ride's toast says) and back as he
  gets off or leaves (`touchJump(null)`).
- **Camera**: behind it and above (eased back to 9 m and up to 18° if closer or
  lower as he gets on; a zoom stops that), following its heading; its rocking
  eased out of the view.
- **Sounds** (own): hooves on grass, earth, mud (a flooded paddy, the water's
  edge) and the road (`bufHoofGrass|Earth|Mud|Hard`, Steps bus, some 4 dB under
  his footsteps), wading (`bufWade`), the splash going in (`bufSplash`), the low
  "mmmh" (`bufMoo`), the grunt getting up (`bufGrunt`), a snort (`bufSnort`) on
  the Animals bus. The pad ticks as it gets up and on a land step.
- **URL**: `buffalo=ride` takes the buffalo nearest `at=`, brings it there (its
  feet on the land at `at=`, heading `yaw=`) and seats him on it; `buffalo=lie`
  the same with it lying (it gets up a second later: `sim=_:2` half way up);
  `buffalo=graze` riding, it grazes; `buffalo=off` he has just got off beside it;
  `buffalo=near` (or `near:lie`) it stands grazing (or lies) a step in front of
  him, not ridden (the prompt). E.g.
  `roam=walk&at=-31,72&yaw=180&buffalo=ride&rcam=60,12,7` (on the bank below the
  River Gate), `at=89,-352&yaw=90&buffalo=ride&sim=w:4` (into the lotus pond),
  `at=-30.2,72&yaw=-90&buffalo=ride&sim=w:1.45` (heaving itself up a land step). The bug report
  gives `buffalo=ride|graze|lie&at=<its feet>&yaw=<its heading>`.
- **Checks**: `window.__buffaloRide` (`state`, `leaving`, `grazing`, `rising`,
  `speed`, `rope`, `blocked`, `misfit`, `pose`: its place, tilt and channels, `seat`, `herd`); the
  console line `[buf] buffalo=…` says which one a URL brought where.

### Zip line

`roam/_zip.ts` (id `zip`, words `zip…`): where everything is `roam/_zipPlan.ts`, the
walk map's part `roam/_zipWalk.ts`, the ride `roam/_zipRide.ts`, the meshes
`jungle/_zipLine.ts`, his pose and harness `character/zipRide.ts`, sounds
`audio/_zip.ts`, the maps' badge `ui/_minimapSpots.ts` (`zip-line`).

- **Where**: the valley behind Angkor Wat, between its hill and the cliffs of the
  northern mesas, east towards Phnom Kulen (hidden from the overview). Four giant
  trees (the jungle's own emergent, `veg/species.ts`, 22–32 m, seeds whose crowns
  start 6 m or more over the deck), each with an octagonal plank deck round its
  trunk: (−84, −324) 18.5 m up, (128, −388) 13.5 m, (268, −320) 9.1 m, (348, −236)
  8.1 m. Three cables, 217, 151 and 112 m, 5, 4.4 and 3 m of drop, sagging 1.5 %
  of their span. A straight wooden stair (61 steps, two landings, on posts with X
  braces) comes down south-south-west from the first deck to 9 m short of the back
  trail, with a sign at its foot ("ខ្សែរអិល · ៣ ខ្សែ កាត់ព្រៃ", canvas in Koulen);
  another (26 steps) from the last deck to the trail's edge by the Kulen shrine.
  The middle decks have no way down but the next line (or the edge: see below).
  The run was picked on the land and the jungle as built (the same at every
  graphics level): every line clear of leaves and solid blocks round the rider's
  whole body (±0.8 m, cable to 2.75 m under it), at least 2 m over the treetops
  (the shot's console line `[map] zip: …` checks it with `world.softClearance` and
  `clearance`); no line passes over a holy place (the forest Buddha, the monk's
  hut, the hamlet's spirit house and its neak ta, the Kulen shrine: 18 m or more to
  the side), none over the hamlet's houses.
- **What**: on a deck, by the trolley waiting at a line's start (its red lanyard
  hanging to belt height), "E  ជិះខ្សែរអិល / Ride the zip line" (pad □, touch Use;
  not while praying, resting, at a stall, with the camera up). He steps under the
  trolley and turns down the line, his hat comes off (the lanyard runs up past his
  face), a red harness goes on (waist belt with its steel ring, leg loops), he takes
  the lanyard in both fists, clips in (a click; a toast "ខ្សែទី ១ នៃ ៣"), sits back
  in the harness and rolls off. His speed comes from the cable's slope (steep at
  first, then the sag flattens it, a little uphill at the end), less the air and
  the pulleys (`GAIN`, `AIR`, `ROLL`; never under 6 m/s before the brake), about
  13 m/s at most: 21, 14 and 11 s a line. Shift or Space held (pad R2 or ✕; on touch
  the jump button, which says "លឿន / Faster" while he is clipped in: `touchJump`)
  tucks his knees up: less air, faster ("Shift  បង្កើនល្បឿន", not shown on touch).
  The key help (bottom left) gives the line's keys meanwhile (`keys()`: faster, look,
  photo). He swings on the lanyard as it speeds up and slows (a pendulum, 2.4 m),
  sways softly (more in the wind), his legs swing. No letting go: E does nothing on
  the line. In the last 7 m the brake slows
  him; 2.4 m from the end the trolley hits the brake block (a thud, the spring, the
  cable's twang; the pad shakes), the block and its spring are pushed home, he
  swings forward and comes to rest over the next deck: feet down, stands, unclips
  (a click), lets the lanyard go (it swings back under the trolley), steps in and
  turns to the way on (the next line's start, or the stair down); hat back on.
  After the last line: "អស្ចារ្យណាស់!". The camera and the phone work on the line
  (photos, selfies); his lights go away while clipped in (`handsBusy`). Back to the
  map (Esc): he is off at once, every trolley back at its start. A trolley left at a
  line's end goes home once he is 70 m from both its ends.
- **Walking**: the decks, the stairs and their landings are in the walk map
  (`_zipWalk.ts` over `world.standAt`, `groundAt`, `ceilingAt`, `woodAt`, as roam.ts
  lays the ramps' decks; nothing changes away from the trees): wood footsteps, the
  trunks and the posts under the stairs are walls, the rails too (in the walk map
  4 m tall and 0.45 m wide, so no hop or jump tops them and the probes cannot slip
  through). Where a line leaves or arrives a deck has no rail: walking off there he
  falls as off any ledge (18 m from the first: the long fall's "Space parachute · E
  glider"). The follow camera keeps out of the trunks as out of the jungle's
  (`softClearance` over them); the decks, rails and collars dissolve in front of it
  (`installNearFade`).
- **Camera**: on the deck from behind and above; riding, behind him a little to one
  side and a little below (−0.05 rad, 8 m), the view widening with speed; a drag
  or the wheel is the player's for a while, then it eases back.
- **Night**: two lanterns on each deck's posts, one on each landing and one at each
  stair's foot (glow blocks, brighter and flickering after dark, no light).
- **Sounds** (own, Moves bus): the clip (`zipClip`), the brake (`zipBrake`), the
  trolley's whirr (`zipWhirr`, lasting: louder and higher with speed); the wind past
  his ears is the roaming wind (`RoamLevels.wind`).
- **Cost**: the meshes (≈ 2.4 k blocks: the trees 1.2 k) are built in idle time 2 s
  after Start (≈ 20 ms; at once in a shot, a page that starts roaming, or within
  220 m), drawn in about 10 draws (the still blocks one per family, the trees two,
  the cables' lines one, each near trolley and brake five), all hidden 420 m away
  (the overview never shows them), trolleys and brakes past 160 m. The walk map's
  part costs a distance test per question away from the trees.
- **URL**: `zip=<line>` (1‥3) on that line's deck just behind its start (the
  prompt); `zip=<line>:<0‥1>` riding it that far along at the ride's speed there (a
  still shot holds it there while the pose and the camera settle; with `sim=` it
  rides on: `zip=1:0.95&sim=_:4` lands); `zip=<line>:clip` clipping in;
  `zip=<line>:end` touching down at its end. With them `rcam=` turns from the
  line's heading. E.g. `roam=walk&zip=1:0.3&rcam=90,5,6` (beside him, the cliffs
  behind), `zip=1:0.55&rcam=150,-25,9` (from below), `zip=2&sim=e:0.1,_:4` (clips in
  and goes), `roam=walk&at=-97.2,-299.5&yaw=152&sim=w:7` (up the first stair),
  `night=1`. The bug report gives `zip=<line>:<u>|clip|end` while he is on a line.
  The mini-map's target: `target=zip-line`.

### Sugar palm ladder

`roam/_palmClimb.ts` (id `palm`, words `palm…`), his poses `character/palmClimb.ts`,
sounds `audio/_palm.ts`; the yard's ladders are `hamlet/_psPalms.ts` (`psRungs`: the
stubs his feet and fists go on, the same the ladder is built with; `psBarTop`: the
crossbar), its family `people/_scenePalmSugar.ts` with `_scenePalmSugarClimb.ts` (the
cook, the tapper, the child for him). The two sides share `PALM_CLIMB`
(`hamlet/_psPalms.ts`: where he is and what he does; where the cook is, which palm
is the tapper's).

- **What**: in the palm sugar family's yard any of the four yard palms with a ladder
  that the tapper is not up (nor walking to): at its foot E "ឡើងជណ្ដើរ / Climb the
  ladder" (the tapper's: "ពូកំពុងឡើងដើមត្នោតនេះ"; a storm: "ខ្យល់ព្យុះខ្លាំង កុំឡើងដើមត្នោត").
  He takes his hat off (its brim would go through the trunk; it goes back on at the
  foot) and steps onto the first stubs. **W** (the stick forward) climbs, **S**
  comes down, Shift quicker (0.55 / 0.75 m/s); let go, he finishes the step he is
  in. His boots stand on the stubs lashed to the pole, his fists hold the stubs
  higher up (the bare pole above the last), each going up stub by stub with the
  foot under it, by IK, as fast as he climbs; his hips in to the pole, his body
  leaning back from it (his big head clear of the pole), his head up the ladder
  going up, at his feet coming down. The first climb of a visit says the keys
  (a toast: W / S, or "push forward, back" with a pad or on touch). The key help
  (bottom left, `keys()`) shows the ladder's own: W S climb · Shift quicker ·
  Space jump off (the lowest rungs) · E S step off (the bottom) · E swap the tube,
  4 5 photo (the top) · Q R look; with a pad, its buttons. On touch the Jump
  button says "លោតចុះ" on the lowest rungs and is hidden higher up.
- **The top**: his feet on the crossbar under the crown; once he stops, the camera
  pulls back and up (15 m) over the yard — the shed's steam, the house, the other
  palms, the fields — and he looks out where the camera looks (drag to look round);
  the camera (4) and the phone (5) work up there. **E "ប្ដូរបំពង់ / Swap the tube"**:
  his right hand takes the clean tube off his belt, swaps it for the full one under
  the cut flower stalk on his right (smoke-blackened bamboo, the juice foaming at
  its mouth), hooks the full one on his belt and goes back to the pole (3.3 s; a
  bamboo clack and a slosh at each). Only while the family works (by night: "the
  juice drips into the tubes all night: come back in the morning") and once a tube
  is full again (the next work day, or 150 s of play after he changed it: "this
  tube was just changed").
- **Off**: on the lowest stubs **S** (or E: "E  ចុះពីជណ្ដើរ · Space  លោតចុះ") steps
  him off backwards onto the ground; **Space** jumps off from the lowest 1.3 m only
  (higher: "ខ្ពស់ពេក លោតមិនបានទេ"); **Esc** / back to the map takes him off at once
  (hat on, tubes gone).
- **The cook** (the tapper's wife) leaves her woks as he swaps and waits at the
  palm's foot looking up at him. Stepped off with the full tube (turned round to
  her: "អ្នកផ្ទះកំពុងមកយកបំពង់" while she comes) he holds it out in both hands; she
  takes it ("អរគុណណាក្មួយ!", a voice), tucks it in her waist and holds out a cup of
  fresh palm juice ("ទឹកត្នោតស្រស់មួយកែវ សម្រាប់ក្មួយ!"): it goes in his bag (the
  stall's `palmJuice`; 6 drinks it, roam/_shop.ts; the toast says so) — his bag
  full, he drinks it there ("ស្រស់ស្រាយ!"). She carries the tube back at her waist
  and pours it into the first wok (her own `fill`), then stirs again. The camera
  frames the two in profile from the side nothing solid is on. Jumped off with it,
  he waits where he lands; with nobody there (no people part) he walks on after 1.5 s.
- **The tapper**: up his own palm while the explorer climbs another, he calls
  across (a voice; "ប្រយ័ត្នរអិលណាក្មួយ!", at the top "ពីលើនេះមើលឃើញឆ្ងាយណាស់ មែនទេ?"
  in a bubble when he is in view). Coming to the palm the explorer is on (or stands
  at the foot of), he waits a few steps off, looking up, until it is free. His round
  is as it was when nobody climbs. **The child** goes to watch the explorer climb a
  yard palm when father is not up one.
- **Sounds** (`audio/_palm.ts`): `palmStep` (a boot on a stub: the culm's hollow
  knock, the weight's thud, now and then the pole giving in its lashings; steps bus),
  `palmGrip` (a palm on a stub), `palmCreak` (the old bamboo creaking now and then as
  he climbs, louder higher up), `palmSlosh` (the juice in the full tube, as he climbs
  down with it), `palmTube` (a tube knocked on the stalk or his belt). A light pad
  tick on each step.
- **URL**: `palm=<0‥1>` him that far up (0 the lowest stubs, 1 the crossbar; a shot
  without `sim=` settles on the nearest stubs) · `palm=top` at the top, stopped (the
  view) · `palm=swap:<s>` that far into the swap · `palm=full:<0‥1>` climbing with
  the full tube on his belt (the cook waits at the foot) · `palm=wait` stepped off
  with it, the cook before him · `palm=give:<s>` that far into the hand-over (1.0 her
  thanks, 1.9 the cup, 2.9 his, 3.7 into the bag) · `palmtree=g1|g2|g3|g4` the palm
  (by the lane g4, behind the house g1, south of the racks g2, behind the shed g3;
  else the nearest to `at=`). `swap:` and `give:` count the shot's 0.8 s of settling
  in. In `sim=`: `w`, `s`, `e`, `j`. The bug report gives `palm=…&palmtree=…`.
  E.g. `roam=walk&at=394,-16.1&palmtree=g4&palm=top&clock=0.85`,
  `…&palm=give:1.3&people=palmsugar`, `…&palm=0.3&rcam=90,5,4.5` (his pose from
  the side), `…&palm=0.9&sim=w:2&clock=0.4` (night at the top: no swap).
- **Cost**: three small tube meshes (one draw each, shown only while used) and the
  pose's IK (four two-bone limbs, nothing allocated a frame); the ladders' stub
  lists are made once when roaming starts. Dev checks: `window.__palmClimb`
  (`state`, `s`, `pose`, `ladder`) and `window.__palmHook`.

### Hammock

`roam/_hammock.ts` (id `hammock`, words `ham…`), his pose `character/hammock.ts`,
sounds `audio/_hammock.ts`, the list of hammocks and the people's hook
`roam/_hammockSpots.ts`.

- **Where**: every hammock of the map inside the roaming area — under the floating
  village's stilt houses (stilt-3, -6, -9) and its north street's Khmer house
  (fv-n1), under six houses of the sugar-palm village (n2, n5, s2, s4, ny1, e1),
  under the palm sugar family's house, the empty one in a picnic hut at Kulen's
  falls (`hamlet/_knHut.ts` `HAMMOCK_EMPTY`) and the grandfather's under the old
  house behind Angkor Wat (the people's rig). The add-on registers them at init
  from each place's plan (the tie points); the blocks that draw one are found the
  first time he comes near (its part's `petal` blocks between the ties: cloth,
  ropes; not the posts or the knots), and its look is read off them: where the
  cloth starts and ends, its curve, its stripes' colours and widths, the rope's
  colour, ropes along then down (the Khmer houses). Not found (yet): not offered,
  looked for again 3 s later.
- **Whose**: free ones only — nobody in it (or right at it: the people part's
  `greet.ts nearby`, asked from 2 m under it so the people on the floor over it do
  not count). The grandparents' (east village n2 and s4 by day, the palm sugar
  grandfather's midday nap, the back hamlet grandfather's) are his while they are
  elsewhere; while he is in one, or within 12 m after (`AWAY`), its owner keeps out
  of it (`hammockTaken(x, z)`: `people/_sceneEastVillage.ts` skips the act,
  `_scenePalmSugar.ts` skips the nap or gets up, `_sceneBackFolk.ts` skips the nap
  and hides its rig while his is drawn: `hammockHidden`).
- **In** (E "ដេកអង្រឹង / Lie in the hammock", on foot beside it, on the ground or
  deck under it, along its middle): he walks to its middle on his side (the other
  side when his has no room: off a hut's deck, against a post), turns his back to
  it, lowers himself onto its edge (his feet where he stood, his hands on the cloth
  beside him; the cloth sags under him), swings his legs up as he turns a quarter
  round and lies back, his hips 60 % along it from his head, the cloth rising under
  his back and legs, his hands behind his head, the left knee up; his pack goes
  down on the ground beside it by his head, his hat off (its brim), his lantern,
  torch or flashlight away (`handsBusy`). Once it takes his weight the place's own
  hammock is hidden and his own drawn (14 segments of the same stripes, each a
  bottom and two edges that curl up round him, the ropes; one draw), sagging 17 cm
  deeper, lowest under his hips. A toast "ដេកលេងលើអង្រឹង" (with a pad or on touch:
  how the stick swings it).
- **Lying**: it sways gently by itself (never quite still: 2°); **A / D** (the
  stick sideways) push it the way the view's left / right is, along the swing (one
  key held pushes once a swing; in time with it, faster), up to 0.48 rad; it slows
  by itself (half in about 4 s). The ropes creak at each end of a swing as hard as
  it swings (a pad tick on hard ones). The camera comes down low beside him at his
  feet (on the more open side: nothing solid between, open sky over it, not under
  the floor), looking along him, a third of the swing with it, over 3 s; then the
  drag is the player's. The camera (4) and the phone (5) work lying (no keys shown
  meanwhile). Still 10 s he dozes: eyes closed (`AngkorExplorer.asleep`), slow
  breaths, head rolled aside, hands on his belly, the "Z z z" of _rest.ts
  (`createSnore`); any key wakes him ("ភ្ញាក់ហើយ").
- **Up**: **E**, **Space** or the stick forward / back (once let go since he got
  in: held W while pressing E does not throw him out): asleep he wakes first, his
  foot brakes the swing, he sits up the way he came in (hat on, pack on), stands
  and is on his feet beside it; the place's hammock is back, his light too, the
  camera eases back to where it was. E or Space while he is still getting in: back
  up from there. **Esc** / back to the map: out at once, all as it was.
- **Prompt** while lying: "E  ក្រោកឈរ  ·  A/D  យោលអង្រឹង" (pad / touch: "E  ក្រោកឈរ").
  The key help (bottom left, `keys()`) while he is in it: A D swing it (the left
  stick), E Space get up (□ ✕), 4 5 photo (d-pad ← →), Q R look round (the right stick).
- **Sounds** (`audio/_hammock.ts`, moves bus): `hamCreak` (a rope's stick-slip squeak
  on the post with a hollow knock, the other rope answering on a hard swing; gain =
  how hard it swings), `hamRustle` (the cloth: a swish, a few ruffles, a low flump as
  it takes or lets go of his weight), at the sit, the lie, sitting up and standing.
- **Another hammock** (his stilt house's): `addHammock({ id, a, b, part })` from
  `roam/_hammockSpots.ts` — `a`, `b` the tie points (m, world), `part` the map
  part (or `root` an Object3D) whose `petal` blocks draw it: cloth wider than
  22 cm between the ties, its ropes thin along the middle line. A rig (not voxel
  blocks): `blocks` (its boxes in world metres) and hide it while
  `hammockHidden(x, z)`. `ready()` says when it is there.
- **Cost**: nothing until he is within 5 m of one (a distance a step per hammock);
  reading a hammock's blocks once (≈ 1 ms); in it, one draw (his hammock, 46
  blocks, rewritten only while it sags or rises; the swing turns its group), the
  posture's IK (arms) a frame.
- **URL**: `hammock=1` (lying in the nearest one to `at=`, within 40 m), `hammock=sleep`
  (asleep: the "Z z z"), `hammock=in` (getting in from beside it: `sim=_:<s>`),
  `hamswing=<radians>` (swinging that hard, from its far end), `hamside=1|-1` (the side
  he got in from), `hamfeet=a|b` (the end his feet are at: its tie `a` or `b`, as the
  console line names them; else the most open view decides). With `rcam=` the camera stays as given. A shot logs
  `[map] hammocks: …` (each one's middle) and `[map] hammock: in "<id>" …` (where he
  stands, which end his feet go to, the camera's side); a bug report (and the free
  camera's "Go there") gives `hammock`, `hamside`, `hamfeet`, `hamswing`, and `hat=1` while the
  hammock holds his hat (the replay takes it off again and gives it back as he gets
  up). E.g. the sugar-palm village at night swinging:
  `roam=walk&at=437,-66.8&yaw=180&night=1&hammock=1&hamswing=0.48&sim=_:1.25`;
  the floating village asleep: `at=-321,71.3&hammock=sleep&sim=_:3`; Kulen's hut:
  `at=423.7,-298.6&hammock=1&sim=_:3`.
### Binoculars

To watch birds and animals far away (`src/map/roam/_binoculars.ts`; the
prop `src/character/binoculars.ts`; sounds `src/map/audio/_bino.ts`).

- **Up and down**: 7 (the tool bar's slot after the selfie phone, a tap on
  touch, the pad's L2) raises them: both hands bring them to his eyes (arm IK
  in a posture over whatever holds his body: standing, sitting on the ground
  (J), seated in the boat, standing in the balloon's basket; in the boat the
  paddle goes down across his lap) and the view glides into them. 7 again,
  Esc, the pad's ○ or L2, or the touch ✕ lowers them (the follow camera ends
  behind him, looking the way he looked). Any other tool, emote or menu key
  puts them away and does its own thing. Lying on his back, 7 sits him up
  first (a J for him), then raises them.
- **The view**: two overlapping round lenses in a black mask with soft edges
  and a faint coating tint inside the rim (a 2D canvas, drawn again only on a
  resize), a gentle hand sway (more in the boat, less sitting, a third with
  Reduce motion), 6× to 12× (the field 8° to 4°; the wheel, a pinch, R1 / L1;
  a tiny focus whirr), the drag, the right stick, Q / R and (slowly) W A S D
  and the left stick look round, slower the more it magnifies. He does not
  walk; the near fade is off and the near plane goes out to 2.6 m (they cannot
  focus closer: a reed or a leaf at his face is not a wall of colour); his
  body hides while the view is at his eyes. The field is the lenses' height,
  not the screen's (a phone held upright shows the same field in its strip).
  The zoom and the keys are at the bottom; the roaming interface steps aside.
- **What is in the middle** is named at the bottom after half a second
  ("Great egret · 180 m"): the parts' `subjects` (animals, birds, people, then
  plants; in the middle 13 % of the view or within their own size, at least
  2 % of its half-height, nothing but the land or water between, and no
  stone, wall or trunk within 120 m), else a temple (a place's pad as a box), a
  village, holy place or jungle site of the passport where the view lands,
  else Phnom Kulen's slopes, each only when nothing solid is nearer along the
  view's middle (the land and water, and the walk map's blocks within 120 m:
  a floating shop at the jetty fills the view, nothing far is named). Held one more second on an animal or a bird
  the nature book does not have (a gold line fills under the name), it goes
  into the book as seen: `Journal.seen` (_book.ts) with a crop of the drawn
  view (taken in a microtask right after the frame is drawn) and the book's
  own "New in your nature book: …". Its page says "Seen through the
  binoculars" until a photo of it (that photo then gives the page its
  picture); fish he catches, people and plants are photo-only.
- **Where**: on foot, sitting, in the boat (not while fishing: "stop fishing
  first"), in the balloon (it floats on as it would; easy flying holds its
  height, and a balloon is where binoculars are best used). Not on the hang
  glider or under the parachute (a message says why): his hands stay on the
  bar and the lines, and a 4–8° view on a glider moving 10 m/s swings too
  much to find anything. Not while praying, eating, at a stall, on the rope
  swing, or while another add-on holds him or has his hands (the umbrella…:
  "his hands are busy").
- **Order 5**: no E prompt of its own; the low order puts its keys before
  the other add-ons', so while they are up they have the step's input.
- **Limits**: animals are only drawn as far as their parts draw them (e.g.
  macaques 190 m, deer 330 m, elephants 1 km: fauna/land.ts `FAR`).
- **URL**: `bino=1` raises them at once (with `act=sit`, `roam=boat`,
  `roam=balloon` too); `pview=yaw,pitch,fov` where they look (degrees, yaw the
  map's heading as the camera's, fov 4‥8); `sview=0‥1` holds the view there
  (0: the follow camera, to see him hold them). `report()` gives `bino=1` and
  `pview`. `window.__bino` (dev server only): `aim` (yaw, pitch radians, fov degrees: set it to
  look elsewhere), `target`, `up`, `view`, `look()` (the middle looked at now).
  The view's frustum culls the water birds and others: aim from the follow
  camera first when looking for one in a check.
- Shared edits: `lang.ts` (`bino…`), tools.ts (the key list's rows: 7, L2),
  _book.ts (`seen`; a seen page's first photo replaces its crop), _bookUi.ts
  (the page's "Seen through the binoculars"), _boatPoses.ts (`LAP_C`
  exported).

### Umbrella

A plain rain umbrella of the markets (ឆ័ត្រ): one solid colour (deep blue;
black and green for checks), eight panels on eight ribs with small metal
tips, a thin shaft, the runner and its stretchers under the canopy, a dark
curved (J) handle. Not a paper parasol, not a wagasa.

- **Files**: the add-on `roam/_umbrella.ts`; the prop and the arm that holds
  it `character/umbrella.ts` (built once, the first time it opens; voxel
  blocks of the explorer's own families: no new shader); its sounds
  `audio/_umbrella.ts` (`umbOpen`, `umbClose` on moves, the `umbPatter` loop
  on ambience); words `umb…` in `ui/lang.ts`; a row in the key list
  (tools.ts) and a chip "Umbrella 8" on the explorer menu's Bag page
  (`_explorerMenu.ts`: lit while it is his choice), so touch
  and the game pad (△) can open a sun umbrella too.
- **When**: on foot in rain (as the people open theirs: rain over 0.27,
  down again under 0.21, for 0.6 s; dry 2.5 s and it folds) or in the dream's
  snow, he opens it by himself (a toast the first time in a visit, with the
  key on a keyboard). **8** opens or folds it any time (a sun umbrella is
  Cambodian too), and that choice holds for the visit (closed in rain: closed
  until 8 again; open in the sun: open), across going back to the map. While
  a ride holds him, another add-on has his hands, or he prays, sits, eats or
  has the camera up, 8 says "ដៃគាត់កំពុងរវល់ / His hands are busy" and the
  choice stays. Its `order` is 1000 (it offers nothing on E): its keys come
  last, so a card or a ceremony that takes the step's input (the clothes, the
  name, the dog's, the calendar's, the blessing, dak bat) keeps 8 and H.
- **Hands**: in his right hand (the lantern, torch and flashlight are the
  left's: both at once at night); in the left while the right holds
  something to eat or drink (a skewer, a cup: `FOOD_GRIPS`; the light stays
  away meanwhile: `handsBusy`); folded when both are full (noodles, a
  coconut). Moving it from hand to hand folds it and opens it again.
- **It folds away** (and comes back after): at once for the boat, the hang
  glider, the parachute, the balloon and back to the map; folded for praying
  (from E at the shrine until he stands), sitting and lying on the ground (he
  sits with both hands; lying, the rest watches the sky), the camera or the
  phone up, an action of his arms (a greeting, a wave, a cheer: quickly), an
  add-on that holds him or his hands (`holding`, `handsBusy`: at once, its pose
  takes his arms), under a roof
  (all round him within 12 m, for 0.35 s) and where there is no room for it
  (a ceiling under the canopy, walls on both sides, a take-off ramp under its
  glider: at once). Beside one wall it leans away from it.
- **His hat**: the palm-leaf hat's brim is wider than his arm holds the shaft
  out, so the hat comes off while the umbrella is up, and goes back on only
  once it is put away for good (dry, 8) and he is free: never while he prays,
  a posture is on him (sitting, lying, the swing) or another add-on holds him
  or has his hands (the rides take the hat off themselves when it is on and
  put back only what they took: after them, in rain, the umbrella comes back
  and the hat stays off: no hat change from E until he is free); not for a
  moment's fold (a greeting, the camera, an eave). **H** is followed by what
  it did (tools.ts has the key; seen after the step): the hat on puts the
  umbrella away (choice closed); the hat off in rain or snow brings the
  umbrella (choice auto): H never leaves him with neither.
- **Open**: rain does not reach him (nothing wet is drawn on him); a few drops
  gather at the rib tips and drip (14 small streaks at most, one draw, in
  rain); the rain patters on the cloth over his head (levelled with the rain;
  none in snow or under a roof); the wind leans it downwind and rocks it in
  gusts, the cloth breathes; it bobs with his walk and leans forward as he
  runs. The arm is posed over the Animator's (arm IK, the wrist turned so the
  fist grips the shaft; no allocation a frame); ≈ 0.05 ms a frame in all.
- **URL** (checks): `umbrella=1` open (as 8 chose it), `umbrella=0` closed,
  `umbrella=auto` (the default) · `umbhand=L|R` the hand · `umbspread=0‥1`
  the canopy held that far open (the fold) · `umbcolor=blue|black|green`. A
  shot or a saved view starts it as it would be by then (no opening on the
  way). `report()` gives `umbrella=`, `hat=1` when it has the hat off,
  `umbhand=L`. `window.__umbrella.state` (the dev server, so shots too; not in a build): choice, hand, held,
  spread, cover, tight, sheltered, lean, push, run.
- **Shots**: `weather=rain&roam=walk&at=-200,-20&yaw=180&sim=_:1&rcam=0,15,9`
  (from behind), `rcam=180,8,6` (the front); `night=1&tool=lantern` (both
  hands); `kneelat=-200,-22,0,-1&sim=_:1,e:0.1,_:0.25` (folding for the
  prayer); `act=bite&food=skewer` (the left hand); `act=eat&food=noodles`
  (folded, the hat back); `weather=storm`, `weather=snow`; `menu=1&menutab=bag`
  (the chip); `at=-306,10,95&yaw=0&sim=_:0.5,s:1.4` (out of the pagoda's porch: it
  opens).
### Smiles for the camera

People in his picture smile and pose for it. No key of its own: his camera (4)
or his selfie phone (5) up, on foot, in the boat, under the hang glider or in
the balloon's basket.

- **Who**: those in the picture (in its view, the camera's zoom or the phone's
  wide front camera), within 25 m of him, on about his level, who can see it
  (not behind them, unless close by and free to turn round; a monk only what is
  before him), the nearest six. Each notices after a moment of their own
  (0.3–1.2 s), turns to it and poses: **children** a peace sign by the cheek, or
  they jump and wave, or jump with both arms up; **grown-ups** a big smile, some
  sampeah, some wave; **elders** smile and nod (some sampeah); **visitors** wave or
  give a thumbs-up, some take his photo back with their own camera or phone;
  **monks** stand calm, the hands together before them (no grin, no turning
  round); **at work, sitting, riding or walking by** they keep at it and only look
  up and smile (a child walking by waves on the move). In a selfie the people
  behind him photobomb (mostly a wave). Never: the apsara dancers and musicians
  at their show, rowers, a net mid-throw, a cyclist, someone up a ladder, people
  praying, someone handing alms to a monk.
- **How long**: while the camera stays on them; a moment after it is lowered or
  turned away (0.3–0.8 s), or after the shutter (≈ 1–1.5 s), they go back to what
  they did. After a photo nobody new poses for 3 s, and who posed only 5 s later;
  20 s at most on end. A child laughs as it starts to jump, and at the shutter.
- **Where**: `src/map/smile.ts` (the bus `LENS`: where the picture is seen from,
  the way it looks, how wide, where he stands, a count of the photos), written by
  `roam/_smile.ts` (from `env.photo`: the camera's shot and zoom, or the phone's
  lens: `explorer.phoneLens`); read by `people/_smileBack.ts` (index.ts: once a
  frame after the greetings). The poses are the people's own (`POSE.wave`, `cheer`,
  `sampeah`, `photo`, `stand`) held with `Actor.held` as the greetings do; the hand
  gestures and the grin are the people model's (`_personModel.ts`): two carry
  styles (`CARRY.peace`, `CARRY.thumb`: table rows, no new shader code), three
  features (`FEAT.grin`: the open smile with the top teeth and happy eyes,
  `FEAT.vee`, `FEAT.thumb`: 11 boxes of the near model), and `Crowd.strike` /
  `unstrike` (CPU: the pose's features and carry style over their look, their
  scene's carry kept aside until it ends; a scene's `dress` meanwhile goes under).
- **Cost**: nothing while the camera is down and nobody poses; up, one pass over
  the people a frame (a few µs, no allocation).
- **URL**: `smile=1` with `tool=camera&pview=…` (or `tool=selfie`) counts the
  camera up at once, so a shot shows them posed even from the follow camera
  (`sview=0`); `smile=<how>` everyone who can that way (`peace`, `thumb`, `wave`,
  `cheer`, `sampeah`, `smile`, `nod`, `photo`, `look`; monks keep theirs);
  `smile=0` off (the before picture). A shot prints who poses (`[map] smile: …`).
  Checks: `roam=walk&at=9,56.3,-158.5&yaw=-90&tool=camera&pview=-90,-4,50&sim=_:1&people=tour,monks&tour=sanctuary:50&clock=0.98`
  (the visitors at Angkor Wat), `roam=walk&at=344.5,8,-90.5&yaw=-70&tool=camera&pview=-70,-5,55&sim=_:1&people=market&mkmonk=1&clock=0.85`
  (the market and the monk at an alms stop), `roam=walk&at=414,-75.5&yaw=0&tool=camera&pview=0,-6,55&sim=_:1&people=eastvillage&clock=0.98`
  (the east village's children).

### His name in Khmer letters

The player names the explorer and sees the name written in Khmer letters.

- **The name card** (`roam/_nameCard.ts`; the add-on `roam/_name.ts`): from the
  explorer menu's "ឈ្មោះខ្ញុំ / My name" (I, its Me page), or offered by itself the first time
  the passport is opened without a name (once: `name.asked`, set only when it
  really shows). It never comes in over the loading screen or the story: a live
  page's `namecard=`, `album=passport` and the offer wait for Start
  (`_nameCard.ts` `mapShown` / `whenMapShown`; shots at once). Type in Latin
  letters and it is written as you type, big, in Koulen on a palm leaf; or type
  Khmer straight in (a Khmer keyboard, an input method: nothing is taken while it
  composes); or pick one of twelve common Khmer names (Latin under each). When a
  name can be written more than one way, the other spellings are chips under the
  leaf (up to three). Enter or the gold button saves, Esc / "Not now" / × / a click
  beside it shuts it, "Remove my name" forgets it. Its keys are its own while it
  is open (capture listener: Esc shuts the card, never the walk) and he keeps
  still (`input` returns true; the touch ✕ shuts the card). Game pad: a letter
  board (A–Z, space, delete) shows while the pad is in use; the d-pad moves, ✕
  presses, △ saves, ○ shuts. A phone: at the top, three names a row, 44 px chips.
- **Writing** (`map/khmerName.ts`, pure): Khmer names and a few foreign ones by
  their usual spelling (`KNOWN`: Vanna វណ្ណា, Peter ពីទ័រ), else sound by sound into
  syllables, each consonant of the series the vowel needs (ដា, ម៉ា, លី, ស៊ី),
  finals and clusters with the coeng (ស្ត, ព្យ), ហ្វ ហ្គ ហ្ស for f g z, ៍ over a
  second final (ជេមស៍); readings for Khmer romanisation (Sokha សុខា), pinyin
  (Xiao ស៊ាវ), Spanish (José ហូសេ), English (silent e, -er ើ). Checked with a
  table of 113 names in 11 languages.
- **Kept** in `map/progress.ts` (`name.km`, `name.latin`). **API for others**:
  `playerName(): { km, latin } | null`, `onName(fn)` (returns: stop), `nameIn(lang)`
  (Khmer letters in Khmer, the Latin spelling in English), `setPlayerName`.
- **Shown**: on the temple passport under its title (holder's line, Edit:
  `roam/_namePassport.ts`, from `_bookUi.ts`); a gold tag over his head for 2.6 s
  when he greets (F); the nearest who greet him back say it now and then (the
  first greeting with a new name, then about one in three: "សួស្ដី ដារ៉ា!", a
  child "សួស្ដីបងដារ៉ា!", an elder "សុខសប្បាយទេ ចៅដារ៉ា?", a seller
  "អញ្ជើញបងដារ៉ា!"; not visitors or monks: `people/_greetBack.ts`, `Bubble.say`
  takes `vars`); "ថតដោយ ដារ៉ា / Photo by Dara" over the maker's mark of new photos
  (`roam/_nameMark.ts`, `photo.ts`). A soft bell when it is saved (`audio/_name.ts`
  `nameSaved`, ui bus). Words `name…` in `ui/lang.ts`.
- **URL**: `name=<latin>` (or Khmer letters) gives him that name for the page (not
  kept), `namecard=1` opens the card (`namecard=<text>`: with that typed),
  `namealt=<i>` picks spelling i, `nameoffer=1` lets `album=passport` offer the
  card in a shot. `report()` gives `name`, `namecard`. E.g.
  `name=Dara&roam=walk&at=333,-112&yaw=0&clock=0.82&sim=w:1.6,f:0.1,_:1&rcam=0,14,9`
  (the tag and a child's "សួស្ដីបងដារ៉ា!" at the morning market).

### Kick the sey

By day four children of the sugar-palm village kick a sey (ទាត់សី: a shuttlecock of
feathers on a base of rubber discs) in a circle in the yard north of the sala
(`SEY_SPOT` 406.5, −77.5); now and then one misses, another laughs, the nearest runs
for it, bends, picks it up, walks back and tosses it up to start again. At dusk (or
in a downpour) they walk home; in the morning they come out again.

- **Join**: on foot near the circle (within ≈ 6.5 m of its middle), E "លេងសីជាមួយក្មេងៗ"
  (Play sey with the children). The circle opens a place for him where he stands (the
  sey is caught, the children step round to five places, one says "Come and play!");
  he walks into it and stands ready, knees soft.
- **Kick**: the sey comes to him about every other kick. A soft ring on the ground
  shows where it will come down (his kick spot), a gold ring closes on it and meets it
  as the sey gets there: Space (or E; the pad's ✕ / □; touch: the jump button) then.
  Dead on (−0.055 … +0.025 s round the rings meeting) a hop-turn on the foot it came
  to and a back-heel kick with the other, the children cheer; good (−0.13 … +0.11 s) a
  clean kick with the inside of the foot back up to a child; earlier or later his foot
  finds only air, the sey drops and hops off his feet, a child laughs
  ("ហាហា! ធ្លាក់ហើយ!"), runs for it, picks it up and starts again. A press earlier than
  0.45 s before does nothing. His foot meets the sey where it is (leg IK:
  `character/sey.ts`), 0.06 s after the press (the heel: 0.09 s, after the turn). Timed
  by the game's clock (`SEY.t`) at the press (half a frame back), not by frames: checked
  at 120 and 30 frames a second (GPU Chromium, the fake pad's ✕ pressed in-page).
- **Counter** (top middle; on a phone top left): kicks in a row (Khmer digits) and his
  best, kept in progress.ts `sey.best`; a new best is told as the run ends. After every
  good kick a child's arms go up and the children clap; bubbles now and then:
  "ល្អណាស់!", "ពូកែមែន បង!", "ម្ដងទៀត!", "កុំឱ្យធ្លាក់!" at 5, 10, 20…,
  "អស្ចារ្យ! ទាត់កែងជើង!" for the heel (everyone cheers). The children's words show only
  with the camera within 35 m of the child and him playing, or watching within 22 m,
  and never over words showing already (the people share one bubble); their laughter
  and claps are sounds placed on the map, as loud as near they are.
- **Leave**: the move stick (walking away), or E while nothing is coming to him; the
  children close the circle (four places, his spot between two). At dusk (or in a
  downpour) the game ends by itself ("ក្មេងៗត្រឡប់ទៅផ្ទះវិញហើយ", the children walk home);
  at night there is no prompt. Esc's "Back to the map?" card holds the game (the sey
  waits in the air); staying, it goes on.
- **While he plays** the stick, Space and E are the game's (no tools, emotes or
  sitting); the key help (bottom left) lists them (`keys()`); on touch the jump button
  says "ទាត់" (Kick) and kicks (`touchJump`), the Use button "ឈប់លេង" (Stop playing).
- **Camera**: round at his right side (from behind the sey would come down behind his
  back), framed for a moment, then the player's (drag, Q / R). The children leave a
  wider gap on his right, so none stands between it and him.
- **Sounds** (`audio/_sey.ts`): `seyThock` (a kick), `seyFlutter` (the feathers),
  `seyTap` (it lands), `seySwish` (a miss), `seyClap` (children clapping); the
  laughter is the people's `laugh`.
- **Files**: `roam/_sey.ts` (the add-on), `map/sey.ts` (what the circle and the add-on
  share: `SEY`, the flight law), `people/_seyCircle.ts` (the children, the sey's rig in
  the people's things; made in `people/_sceneEastVillage.ts`), `character/sey.ts` (his
  posture and leg IK), `audio/_sey.ts`.
- **URL**: `sey=1` (in the game, the sey on its way down to him, the rings closing),
  `sey=kick` (an inside kick at the touch), `sey=heel` (the heel back-kick at the
  touch), `sey=miss` (the sey on the ground before him, a child bending for it), with
  `roam=walk` (`at=x,z` near the circle: his place is round from there; else its north
  side) and `seystreak=<n>` (the counter). Bug reports bring `sey=` and `seystreak=`.
  `people=eastvillage` keeps the shot light. On a live page `sey=1` joins at once (the
  game plays); `seystill=1` holds the moment there too (to look at a kick from round
  about with `rcam=`).

  `npm run shots -- sey-kick="@index.html?shot=1&roam=walk&at=406.5,-81&sey=kick&seystreak=7&clock=0.95&people=eastvillage&parts=terrain,water,hamlet,vegetation,people,path,foreground"`

### Kite

Flying his own kite (khleng, ខ្លែង): `roam/_kiteFly.ts` (the add-on, id `kite`;
it holds him in walk mode while it flies), `roam/_kiteSky.ts` (his kite, the
line, the wind aloft), `roam/_kiteStall.ts` (the market's kites for sale),
`character/kiteFly.ts` (his pose), `audio/_kiteFly.ts` (its sounds); the kite
model and the people's side are `people/_kite.ts` (`Kite.flyAt`, `Kite.hold`,
the `KITE_HOOK` between the two sides) and `people/_sceneKites.ts`.

- **His kite**: a small khleng ek (the bird of prey with its humming bow on the
  beak and two palm-leaf tails; 1 m true, 1.4 m drawn, as the people's), a red
  paper sail with a cream border, a gold and a blue lozenge; kept for good once
  he has it (progress.ts `kite.have`).
- **Getting it**: (1) the grandfather flying the big khleng ek on the east field
  (in the kite season's afternoons and into the night): within 5.5 m, "E  Ask for
  a kite" (សុំខ្លែងពីលោកតា); he answers in a bubble, his son walks up and holds a
  small kite out, the explorer takes it, holds it up, looks at it and puts it
  away. (2) The morning market's stall of woven things (`baskets`) has a bamboo
  pole with three kites for sale; while it is open, in front of the pole
  "E  Buy a kite — ៨,០០០ ៛" opens a card that asks (ui/ask.ts: Buy / No, thanks);
  the seller looks up and asks (shop.ts `BROWSE`), takes the riel, hands it over
  and thanks him (`SALE`: people/_saleBack.ts). shop.ts is left to food: its flow
  (the menu, eating, the bag) is about eating, a kite is one thing bought once
  and kept, so it has its own small card and only tells the people part.
- **Flying it**: "E  Fly your kite" is offered only where and when it really
  flies — fair weather and the kite season's wind aloft (`_kiteSky.ts
  windAloft`: the people's kites' steady breeze, only in the kite season, the
  north wind from after the Water Festival to March; `people/_kite.ts
  seasonBreeze`), on the kite fields (`people/_sceneKites.ts KITE_FIELDS`: the
  families' east, the children's west) or a dry rice field, away from the
  villages, the markets, the sey circle, a place's entrance and the stalls, with
  nothing over him or down the wind (`clearance`, `hardClearance`,
  `softClearance`; not where a beacon, a moored boat, a ramp or the balloon has
  the E). It is last in the E row (`order` 90, after every other add-on): the dog,
  the sey, the farmers' work in reach win. Out of the season (or in a calm), on
  the families' field, a toast once a visit says kites fly there in the dry
  season (no E; the calendar lists the families' kite flying: `kitesFlying`).
  Then he turns into the wind, the kite held up past his right shoulder, runs a
  few steps and lets go; it climbs behind him; he turns round and it climbs on
  to 24 m of line. **W** lets out line (to 80 m: higher and further, sinking a
  little while it pays out), **S** reels in, **A / D** steer it across the wind
  (lower at the sides), **Shift + move** walks him slowly with it (the kite
  follows; into the wind it climbs; not under trees or roofs: the line would
  catch), **E** brings it in (he reels it all in, folds it, puts it away). Gusts
  make it dance; high up its bow hums (the people's `kiteHum`, its own voice).
  Sunk into a tree it snags, onto the ground it lies: S or E, a tug, it comes in.
  Rain brings it in by itself. A pad: the left stick (↑ out, ↓ in, ← → steer), R2
  walks, □ / X is E; touch: the stick, past its ring walks, the Use button. While
  it flies the key help (bottom left) lists its keys (`keys`: W, S, A D, Shift, E;
  caught: S E), the prompt is "E  Reel it in", and the first flight's toast says
  the keys too (on touch: the stick). The buy card hides the E prompt while it asks.
- The line: one `Line` strip from his right fist, sagging; the bamboo spool in
  his left fist (a rig slot, `kiteSpool`). The camera looks up past him at the
  kite (never down into the terrace behind him); taking the kite it comes round
  to his side, where nothing is in the way.
- Cost: his kite and the market's three are one InstancedMesh of the people's
  things (the same shader) plus the line; made on first need; the market's only
  within 160 m of the camera while the stall is open. Nothing allocated a frame
  in the add-on's own code.

URL values: `kite=have` · `kite=fly` / `kite=fly:<height m>` (flying at once;
`kiteside=<rad>`, + his left) · `kite=gift:<s>` (asked the grandfather: `s` s
after the son holds it out, held still) · `kite=bought:<s>` (the market's
hand-over) · `kite=buy` (the card, at the stall: `at=335.59,-96.15&yaw=90&clock=0.8`)
· `kite=snag:<x,y,z>` · `kite=down` · `kitewind=<0‥1>` (the wind aloft held: 0 a
calm). The east field in the kite season: `season=0.9&clock=0.97`, an open spot
`at=432,90&yaw=250`; the grandfather near `at=428.5,83`. `report()` gives
`kite=` (and `kiteside=`). Shots log `[map] kite: caught in a tree at …`.

### Monkeys steal his snack

The temple troops' long-tailed macaques (fauna/land.ts) come for his snack. No
key of its own: it happens while he eats or drinks on foot near a troop (from
a stall, or from his bag with 6), sitting (J) too.

- **The scene**: one bold macaque of the troop (the old male first; never a
  mother carrying her baby) **watches** him (up on its feet, head high),
  **creeps** closer, low, **dashes** in, leaps up at his hands and **snatches**
  it: his meal stops there (as the stick stops it), the same thing as far eaten
  goes into its hands (parts/food.ts's blocks, sized for it), and he hops back a
  little with the surprised face (1.8 s), a gentle "hey!" and a toast with the
  stall's name for it ("ស្វាឆក់យកចេកណាំវ៉ារបស់អ្នកបាត់ហើយ!" / "A monkey stole
  your bananas!"); he turns to watch it go (sitting, he stays down). It **runs
  off** on three legs, the snack under its chin, to the foot of a wall or a
  ledge near its troop (round what is in the way by a turning point), **leaps
  up**, sits facing him and **eats** it with both hands (12 s, nibbling, a glance
  aside now and then, chattering), scolds him if he comes near, scampers further
  if he climbs up to it; then licks its fingers, hops down and ambles back to
  its troop, whose life goes on. No wall in reach: it sits and eats a little way
  off. His snack gone before it gets there (eaten up, or he stopped and walked
  off): it sits a moment and gives up; walking at it: it **backs off**. **F** at a
  macaque in front of him: it stands up, hops and chatters back (up on its wall,
  a bounce where it sits).
- **When**: not every time. Each meal with a troop within 16 m: chance =
  how tempting (fruit 1, sweets 0.95, skewers 0.9, rice 0.6, noodles 0.5, a
  coconut 0.35, cup and bag drinks 0.3, water 0.2) × (0.3 + 0.045 × the seconds
  he has eaten near them), at most 0.85; it must be able to get there while some
  is left (a macaque within 13 m, a straight way on its ground). At most one
  theft in 3 minutes (40 s after one that came to nothing). Never at night (they
  sleep), in a storm (they huddle), in the boat, on a ride, or where they do not
  go (he must stand on their ground: up a roof, on the swing… no). Never from his
  bag.
- **The camera**: both of them in the picture (within ~70 % of its half width and
  height, standing or sitting), looking at the point between them from near square
  on to the line between them, as far back as that takes (5–14 m, out quickly as the
  monkey runs off). The way it looks from is one with no wall or roof between and
  nobody hiding them: nobody on the lines to him and to it, nobody in the picture
  nearer the lens than they are (people/_greetBack.ts's finder, greet.ts `nearby`);
  it keeps that way while it stays clear (blocked twice running, 0.8 s, it takes the
  clear way least far round). It eases back to him 3 s into the monkey's meal, or as
  soon as he moves or the player turns the camera. Not with the URL's `rcam` (shots
  frame it themselves).
- **Its moves** keep to the troop's own: on their ground (`templeGround`), no
  step higher than they climb (1.3 m), never through a wall; up a wall only with
  a leap (rising first, then over the edge). The wall is looked for while it comes
  (a grid round where it leaps from, a slice a step): a top 1.25–3.6 m up that goes
  on (a wall, a terrace's edge; not a post or a lamp), on the way home, away from him.
- **Where**: `roam/_monkeyThief.ts` (the add-on: chooses, times and drives the
  macaque every roaming step, his reaction, the camera, the URL); the macaque is
  borrowed from its troop and put on the map by the fauna part:
  `fauna/_landMacaque.ts` `THIEF` (`borrow`, `giveBack`, `linkThief`, `thiefHand`,
  the snack's blocks), and two new acts in its pose shader (4 reach up, 5 hold the
  snack: under the chin running on three legs, at the mouth in both hands sitting;
  a troop's own acts 0‥3 look as before); `fauna/land.ts` (its link, and the
  borrowed one skips its own life); `roam/_shop.ts` `meals` (what he eats now, and
  `snatch`: the meal ended as the stick ends it). Sounds: `audio/_monkey.ts`
  (`monkeyChatter`, `monkeyScamper` on the animals bus; `monkeySnatch`, `monkeyHey`
  on his moves; measured against his munch and his "ahh"). Words: `monkeyStole`,
  `monkeySnack`.
- **Cost**: nothing while he is not eating near a troop; eating, one pass over the
  troops' 29 macaques a step; during a theft the search for its wall (≈ 60 grid
  spots a step while it comes), one borrowed macaque and the snack (one small voxel
  group, built at the snatch). No allocation a step.
- **URL**: `monkey=steal` the nearest troop's boldest macaque comes now for what he
  eats (`bought=<item>`, _shop.ts, or `act=eat&food=<kind>`), whatever the odds (not
  at night, by `night=` or `clock=`: they sleep; `sim=_:<s>` that far in) ·
  `monkey=feast:<item>` a macaque up on the wall nearest him eating that (a shop
  item, `shop:item`, or a food kind; a bug report gives this) · `monkey=always` at
  every meal near a troop, no wait · `monkey=0` never. `window.__monkeys.state`.
  Checks (Angkor Wat, the moat's wall): `roam=walk&at=3,-153&yaw=180&bought=chek&monkey=steal&sim=_:1.2`
  (creeping; 3.5 the snatch, 4.6 the run, 7.7 up on the wall, 10 eating) with
  `parts=terrain,sanctuary,path,fauna,foreground,hamlet`; the Bayon
  `at=-283,-198&yaw=254&bought=chekAng` (`parts=…,overlook,…`), Ta Prohm
  `at=194,-115&yaw=269&bought=tukAmpov` (`parts=…,terrace,vegetation,…`); sitting:
  `&act=sit`; walking away / at it: `&yaw=0&rcam=0,20,8&sim=_:1.6,w:1.2` /
  `&yaw=200&rcam=0,20,8&sim=_:1.6,w:0.8`; up close on the wall:
  `monkey=feast:dong&cam=5.2,58.9,-161.6,7,58.35,-163.9,30`.

### Alms round at dawn (dak bat)

Dak bat (ដាក់បាត្រ): giving food to the monks on their morning alms round, as
Cambodians do. Monks walk barefoot in a line in their saffron robes with their
alms bowls; families give rice by the road; the explorer gives too.

- **The village round** (people/_sceneAlms.ts, scene `alms`): three monks (an
  elder in front, a monk, a novice) come up the palm lane into the sugar-palm
  village's street at the sala's corner and walk west along it to the market's
  corner (`ALMS_WAY`, roam/_dakBatHooks.ts; 53 m). Two families wait by the road
  outside their fences, on a woven reed mat with a silver bowl of rice (ផ្តិល) and
  lotus buds: n3's grandmother, daughter and granddaughter, s1's old couple and
  their son, each holding a woven tray of rice and lotus. The line halts before
  them and turns to them, each monk holds his bowl out in both hands and lifts its
  lid (it stands up in his right hand), each giver puts rice in (`give`; a heap of
  rice shows in the bowl), the lids go back on, and the family kneels, palms
  together, while the monks chant a short blessing with heads bowed (the elder's
  hand raised as it ends); then the monks walk on and the family goes back in.
  It sets out as the clock passes 0.74 (dawn: `ALMS_START`, once a morning) and is
  on the way for ≈ 90 s of play (on the calendar over `ALMS_ON`, 0.74‥0.955, event
  `dakbat-village`, "Sugar Palm Village"); a camera that comes back mid-round finds
  it where it would be by now; where the clock stands still in the morning it goes
  round again after a 40 s rest. Hidden past 420 m from the camera.
- **The open bowl**: the person model's bowl is one closed box, so while a monk
  takes alms his own is drawn with the people's things instead (`AlmsBowl`: bowl,
  lid on a hinge, knob, strap, the rice heap; 8 thing boxes) and he holds it out in
  the `give` pose (`Receiving`: out 0.55 s, lid up 0.45 s, open, lid down 0.4 s,
  back 0.55 s), then wears his own again. Used by every line.
- **The rice** (roam/_dakBat.ts): the morning market's flower and offerings stall
  (`market-flowers`, "តូបផ្កា និងគ្រឿងបូជា" / "Flowers and offerings", open while
  its seller is: 0.69‥0.93) sells "បាយដំណើបដាក់បាត្រ" / "Sticky rice for the monks"
  (3 000 ៛; a silver bowl of rice, a spoon, a lotus bud). Bought, it goes straight
  into his bag (no "eat it now"): a **keepsake** (roam/_shopBag.ts `KEEPSAKES`: the
  bag's slot and 6 show and eat the first thing that is food; "In my bag" lists it
  by its name and a pick of it, or 6 when it is all he has, says "keep it for the
  monks' alms round at dawn"; nothing is eaten while it is being given; the bag
  full: "Bag full", nothing paid). The lotus add-on keeps its lotus the same way.
- **Giving** (E): with the rice in his bag, when a line of monks with their bowls
  comes along his way (within 14 m, ahead of them, up to 4.2 m off their way,
  about on his floor), the walker offers "E  ដាក់បាត្រព្រះសង្ឃ" / "E  Offer food to
  the monks"; without the rice, within 7 m: "ទិញបាយដំណើបនៅតូបផ្កា ផ្សារព្រឹក
  ដើម្បីដាក់បាត្រ" / "To offer food to the monks, buy sticky rice at the morning
  market's flower stall" (no E; not for 2 minutes for a line he has just given to).
  E: he turns to face their way (across it at its side, else facing the monk
  coming), takes his hat off and kneels the prayer's way (character/dakBat.ts:
  the prayer's own keys down and up, planted on his knees, shins and feet), sits
  back on his heels with the bowl of rice on his lap (left hand) and the spoon
  (right), looking at the monks coming. The line answers (`DAK`): it walks on until
  the first monk not past him yet is near, who then steps over to stand before him
  (1.45 m, facing him; the others halt), holds his bowl out and lifts the lid. He
  rises on his knees and reaches over the bowl with the spoon (arm IK, never
  touching the monk), tips two spoonfuls in (a spoon's tick and the rice, the heap
  grows), sits back, puts the bowl and spoon away and joins his palms at his face
  (open hands) while the monks chant the blessing (`dakChant`, ≈ 6.5 s), bows once
  to the ground, and gets up (hat back on). The monk steps back into his line and
  they walk on. "បានដាក់បាត្រព្រះសង្ឃ (លើកទី n)" / "You offered food to the monks
  (n)" (`progress` `dak.count`). The camera comes round to his side, a little to
  his front and above (his right, the spoon's side, unless the line comes from
  there), from where nothing stands between (walls, fences, leaves, people),
  between him and the monk; after 3 s it is the player's; back as it was after.
- **Leaving off**: E, Space or the stick while he waits gets him up the way he
  went down (the rice stays in his bag; the monk goes back to his line); once the
  rice is in, it is given (counted) and the monks finish their blessing. A line
  halted at a family's stop answers at once and sends a monk to him once the
  family's blessing is over (he waits kneeling). No line answers within 5.5 s, or
  every monk is past him (or, as a safety, none has come in 90 s):
  "ព្រះសង្ឃនិមន្តហួសទៅហើយ" / "The monks have walked on". Back to the map or another mode: all stops at once (his
  pose, hands and hat back, the monk let go). Tools, emotes and the camera wait
  while he gives (`input` takes them).
- **The other lines**: Angkor Wat's morning procession up the valley road (five
  monks with bowls: people/_monks.ts, line `aw`) and the floating village's monk on
  his alms round below the pagoda (people/_sceneVillage.ts, line `fv`; not while he
  stands at the fruit stall) take his rice the same way; what they do otherwise is
  unchanged (the floating village's monk: pixel-identical at 10, 20, 25, 35 and
  45 s against HEAD).
- **Sounds** (audio/_dakbat.ts): `dakChant` (ambience: the monks' Pali blessing
  "sabbītiyo vivajjantu, sabbarogo vinassatu … sukhī dīghāyuko bhava": a piece of
  the recorded monks, audio/chants.ts, or until it loads low voices in
  near-unison as audio/temple.ts makes the dawn chant; the families' stops play
  it by distance, gone past 48 m), `dakLid` (ambience: the iron lid's soft knock),
  `dakSpoon` and `dakCloth` (moves: the spoon on the rim and the rice; his clothes
  as he kneels and gets up).
- **Where**: roam/_dakBat.ts (the add-on, the stall, the calendar event, the URL),
  roam/_dakBatHooks.ts (`DAK`: the monks' slots and his ask, the round's way and
  hours), people/_sceneAlms.ts (the round, the families, `AlmsBowl`, `OpenBowl`,
  `Receiving`), character/dakBat.ts (his posture, the bowl of rice and the spoon),
  audio/_dakbat.ts; small hooks in people/_monks.ts and _sceneVillage.ts; the
  keepsake in roam/_shopBag.ts and roam/_shop.ts. Words `dak…` in ui/lang.ts.
- **Cost**: the round ≈ 0.004–0.008 ms a frame, 9 people, ≈ 60 thing boxes (no new
  draw); the add-on a look over ≤ 9 slots a step while monks walk; his bowl of rice,
  spoon and open hands built the first time he gives. No allocation a step.
- **URL**: `clock=0.78` (the round in the street; `0.76` coming up the lane);
  `almsstop=0|1` holds the round at n3's / s1's family, giving (`almsstop=0:bless`
  the blessing); `dakbat=1` with `at=` by a line's way (the street:
  `at=381,-68.9&yaw=0`; the valley road: `at=10,-88&yaw=-90`; below the floating
  village's pagoda: `at=-304.2,81&yaw=-90`) puts the rice in his bag and the monks
  ≈ 7 m off, coming (`dakbat=near`: no rice, for the hint); `dakbat=wait` kneeling
  for them; `dakbat=give` (`sim=_:<s>`: that far into the two spoonfuls, ≈ 0.75 the
  spoon over the bowl) and `dakbat=bless` the monk before him at once; the shop:
  `shop=market-flowers`, `shopbuy=dakRice`, `kept=dakRice`. Bug reports give
  `dakbat=wait|give|bless`. `__dak.now()` in the console: his state and the ask.
### A monk's blessing (the red string)

`roam/_blessing.ts` (id `bless`, words `bless…`), his pose `character/blessing.ts`, the
string `character/redString.ts`, sounds `audio/_bless.ts`; the monk is the people's
(`people/_sceneBlessing.ts`, scene `blessing`; his pose `POSE.bless` and the sprig
`FEAT.sprig` in `people/_personModel.ts`); the two sides share `roam/_blessingHooks.ts`
(`BLESS_SEATS`: where he sits and where the explorer kneels; `BLESS`: whether the monk
is there and where his hands tie, the blessing's state and time; `BLESS_SCRIPT`,
`TIE`: when the sprig dips and flicks, when the string goes round; `blessHour`).

- **Where**: in the floating village pagoda's hall, against its east wall (to the
  Buddha's right), over the end of the east mats: a raised dark dais (អាសនៈ, 0.65 m:
  knee high, so the monk's head is always clearly above the explorer's, kneeling or on his
  heels, the tie included) with a wooden step before its south end, a kantel mat, a
  seat cushion and a triangular cushion (ខ្នើយ) behind him; an elder monk cross-legged on
  it, a silver bowl of lustral water (ផ្តិលទឹកមន្ត) on its foot at his right knee (lotus
  petals on the water, a sprig of leaves with a lotus bud in it), a silver plate with a
  ball of red cotton string at his left. Angkor Wat has no monk sitting in a gallery
  (its monks walk and sweep: `people/_monks.ts`), so this is the one seat; a new one is a
  line in `BLESS_SEATS` and a scene.
- **When** (`blessHour`, the clock): from after the dawn chant (0.83) to his meal before
  noon (0.945, the noon bell), from 0.985 to the dusk drum (0.19); not at night; not
  while the pagoda keeps Pchum Ben or Visak Bochea (`festivalNow`: the monks are on the
  porch with the faithful; the festivals' crowds keep the porch and the terrace, the dais
  is inside). Out of sight he simply comes or goes; seen (the camera near, him in its
  view, no wall between) he gets up, steps down by the step and walks out of the door and
  along the porch behind where the festivals' monks sit (z 98.4: never through them), or
  back in, up by the step, and sits; never in a blessing. The calendar lists it
  (`bless-village`, daily, "Blessings with the red string") by the monk's own rule (the
  hour, and the pagoda's festival of that moment: `festivalAt` with the clock).
- **Ask**: on foot before the dais (on its floor, ≈ 1–5 m before him), while he sits
  there: "E  សុំពរពីព្រះសង្ឃ / Ask for a blessing" (the pad's □ / X, the touch Use
  button). By the empty dais the reason, no E: his meal, the night (from 0.62 of the
  clock: he blesses after the morning chant), a festival (`blessMeal`, `blessNight`,
  `blessDawn`, `blessFest`). Beside "E  Ask for a blessing": "J  Kneel and listen" (roam/_listen.ts). He never stands on the dais or its step (not
  on the walk map: put back off them, to the front or a side).
- **Bareheaded in the hall**: his hat comes off as he steps into the pagoda's hall past
  the door (one wears no hat before the Buddha and the monks) and goes back on as he
  steps out (unless he put it back on meanwhile: H), or leaves his feet; the blessing
  leaves it off at its end while he is inside. (His boots stay on.)
- **The blessing** (≈ 28 s): he walks to his place 2.2 m before the monk (the stick,
  Space or E: never mind), turns to him, kneels the prayer's way (hat off), sits back on
  his heels, palms together at his face. The monk chants the Pali blessing
  (`blessChant`, ≈ 7 s of the recorded monks, audio/chants.ts; one old voice synthesized until it loads; bubbles in Khmer letters: "♪ សព្វីតិយោ វិវជ្ជន្តុ
  សព្វរោគោ វិនស្សតុ", "♪ មា តេ ភវត្វន្តរាយោ សុខី ទីឃាយុកោ ភវ"; romanised in English), takes
  the sprig from the bowl, dips it (`blessDip`) and flicks the water over him three
  times: seven drops fly to his face each time (worked out from the time since the
  flick: no state), he shuts his eyes as they land (`blessDrops`); the sprig goes back.
  He comes in on his knees, low and bowed (three small steps on them), to 1.24 m before
  the monk, sits back on his heels, turns his chest and holds out his right hand, the
  shoulder forward, palm up, his left hand under its forearm (giving and taking with
  respect), his eyes lowered to the monk's hands; the monk, sitting up, reaches out and
  takes the hand in both of his, murmuring "♪ អាយុ វណ្ណោ សុខំ ពលំ" (`blessMurmur`): the
  cord goes under the wrist, round it, knotted (`blessTie`, `blessKnot`, a pad tick).
  Their faces stay a hand and more apart, the top of his head ≈ 0.3 m below the monk's
  (never under 0.19 m, moving on his knees; `__bless.heads()`). Back at
  his place on his knees, he raises his hand and looks at the string, then palms
  together again. The monk says "សូមឱ្យញោមសុខសប្បាយ ធ្វើដំណើរដោយសុវត្ថិភាព" (a bubble), he
  smiles, bowed low, bows three times (the prayer's bows, the temple bell at
  the first) and gets up, hat on: "ព្រះសង្ឃបានប្រទានពរដល់អ្នក។ អំបោះក្រហមនឹងការពារអ្នកគ្រប់ដំណើរ /
  A monk blessed you. The red string protects you on your travels." E, Space or the stick
  gets him up at any time (the string stays once it goes round his wrist: the monk ties it
  off); back to the map stops it at once. His lantern and umbrella go away meanwhile. The
  monk's bubbles go with the blessing: cut off, him gone or out of sight, they hide at
  once (never left on the screen).
- **Camera**: from his left side, low, square to the line between them (the hall's
  Buddha behind), for the tie round behind him to his right side, nearer (the string on
  his right wrist; the door behind), then back; a little wider (60°: the hall is narrow).
  Eased in over 3 s at each change, then the drag looks round; his own view after.
- **The string** (`progress` `bless.string`, kept between visits): a red cotton band on
  his right forearm just above the hand, a darker knot on the outside of the wrist, two
  short ends; on the forearm's joint (`elbowR`, rig slot `redString`), so it turns with
  the arm, not the hand: clear of the umbrella's handle, food, the phone, the paddle, the
  glider's bar, a flat hand. Every pose and mode, photos and the selfie (whenever that
  wrist is in the picture), the overview's ledge too.
- **Once a visit** for each monk: a second time he smiles (`FEAT.grin`) and nods, "ញោម
  បានទទួលពររួចហើយ សូមឱ្យសុខសប្បាយណា / You have your blessing already. Be well!", and the
  explorer greets him with the high sampeah.
- **Cost**: the monk is one person of the crowd, his things 48 boxes of the people's
  things (no draw of their own), the drops 7 more; nothing allocated a frame; the add-on
  reads two numbers a step when off. The people's bone shader: tables and one call site
  (`P_BLESS_*`, `pBlessArm` once in `pStateOf`), its compile time as before (≈ 0.3 s on
  ANGLE OpenGL), everyone else's bones unchanged.
- **URL**: `bless=1` (with `at=` before the monk) asks as E would; `bless=<step>[:<s>]`
  that far into a step at once (`kneel`, `chant`, `tie`, `words`, `bow`, `up`, `again`;
  `bless=tie` alone: the cord going round; a still's 0.8 s of settling counted in);
  `redstring=1` (or `0`) the string on him (or off) in any shot; `blessmonk=1|0` the
  monk there (or away) whatever the clock; the monk alone: `blesspose=<state>:<s>`.
  `report()` gives `bless=`, `redstring=1` and `hat=1` while the blessing or the hall has
  his hat. Checks: `__bless.now()`, `__bless.probe()`, `__bless.heads()` (his head's top
  and the monk's, m over the floor).
  E.g. `roam=walk&at=-305.3,10,103.3&yaw=90&clock=0.9&people=blessing` (the prompt),
  `…&bless=chant:3.12` (the drops), `…&bless=tie` (the string going round), `…&bless=tie:4.75`
  (he looks at it), `…&bless=words:1.0`, `…&bless=bow:0.9`, `…&bless=again:1.2`,
  `…&clock=0.5` (night: the empty dais, its hint), `…&fest=pchumben` (`parts=…,festival`).

### Kneeling to listen to the monks' chanting

`roam/_listen.ts` (id `listen`, order 14: before a shrine — the pagoda door's "E  Pray"
reaches into the hall —, words `listen…`, `chant…`), the link `roam/_listenHooks.ts`
(`LISTEN`: the row's state, the listener's; `CHANT_ROW`, `CHANT_SEAT`, `CHANT_FOLK`,
`LISTEN_SPOTS`, `CHANT_VERSES`, `FEST_ROW`), the dawn row `people/_sceneChant.ts` (scene `chant`), the
blessing monk's chanting in `people/_sceneBlessing.ts` (`chantFor`), the monks' pose
`POSE.chant` (people/_personModel.ts: seated as `sit`, palms together at the chest, a
table, `P_CHANT_ROT`), sounds `audio/_listen.ts`; the pagoda's dawn chant follows the row
(audio/temple.ts `pagodaChanting`). His posture is the blessing's (character/blessing.ts
`blessPose`): the prayer's kneel, as at dak bat.

- **The dawn chant's row** (events.ts `dawnChant`, ≈ clock 0.71‥0.83): in the floating
  village pagoda's hall four monks sit cross-legged in a row on their low platform before
  the offering table (`CHANT_SEAT`, 0.55 m: dark lacquer, a gold line, a kantel mat, a
  cushion each; always there, as the blessing monk's dais), at z 104.5, x ± 0.7, ± 2.1 from
  the axis, facing the Buddha, palms together, chanting; three villagers kneel behind them
  on the mats (a lay nun in white, a grandfather, a grandmother). On the platform the
  monks' heads (≈ 2.19 m up) are above the head of one kneeling behind them on his heels
  (≈ 2.02 m): a lay person keeps his head below a monk's. The lead monk (x − 0.7) shows the verses in Khmer letters while the
  explorer is in the hall (romanised in English): the homage (នមោ តស្ស…), the three
  refuges, the praise of the Buddha (ឥតិបិ សោ…), loving-kindness (សព្វេ សត្តា…), round
  every 60 s. As the hour begins they come in by the door (the villagers from the porch's
  west, the monks from its east in single file up the carpet and along the platform's
  front, the outer seats first, stepping up onto it) and sit; when it ends they bow (their
  heads, three times), get up (the monks turn round on the platform and step down) and go
  out the way they came, the monks first. Out of sight they are simply there or gone. One
  standing in their way is walked round: a point they come no nearer to for 1.5 s within
  1.2 m (or for 6 s) counts as reached (the blessing monk's walks too). After the hour the
  row chants on while the explorer is in the hall or kneels with them, up to 75 s. On
  the pagoda's festival days (`FEST_ROW`): Pchum Ben, in the lit hall before dawn
  (0.58‥0.77) while the people walk round it (its own chant is heard: roam/_pchumBen.ts),
  then the monks are the porch's; Visak Bochea, at dawn once the night's procession is
  over (from 0.74). Its sound is the pagoda's dawn chant, from the hall while the row
  chants (by the hour when the row is far off or not built).
- **Kneel and listen to the row**: in the hall (past the door, before the table) while
  the monks sit: "E  លុតជង្គង់ស្ដាប់ព្រះសង្ឃសូត្រមន្ត / Kneel and listen to the monks
  chanting" (J too; while they walk in, "The monks are coming in to chant", and as they end
  and go, "The monks have finished chanting", no E). He walks
  to the nearer of his two places behind the row (`LISTEN_SPOTS`: on the mats, behind the
  gap between two monks, x ∓ 1.4, z 102.8), turns to the Buddha, kneels the prayer's way
  (hat off), sits back on his heels, palms together at his face; his head bowed, a glance
  up now and then (every 17 s). The map's music steps back (`listenHush`). When the row
  ends he bows three times to the floor with them and gets up: "សាធុ! … / Sathu! You
  listened to the monks chanting (n)" (`progress` `listen.count`; it counts after 12 s, or
  at the end if he heard 4 s of it). If the monks stop before he has knelt (walking there,
  kneeling down), he stops, or gets back up. He never stands on the platform (put back off
  its front or an end), and keeps 0.62 m from each villager's place while they are there.
- **Kneel and listen to the blessing monk** (by day, on his dais: roam/_blessing.ts): the
  blessing's prompt is "E  Ask for a blessing  ·  J  Kneel and listen" (on touch and with a
  pad, the explorer menu's Sit is J). He kneels where one kneels for the blessing; the monk
  looks at him and nods, puts his palms together and chants with his eyes down
  (`POSE.chant`; his bubbles: `CHANT_VERSES` by the listening's time) for 58 s: the
  recorded monks, endless and never the same (audio/_listen.ts `listenChant`: chants.ts
  `ChantStream`, fading out over the last 2.6 s; one synthesized voice a verse at a time
  until the recordings load), the music stepping back. Then he bows three times and gets
  up; the monk nods.
- **Getting up**: E, Space, J or a push of the stick (held, it does not skip the bows): the
  three bows, then up (again during the bows: up at once); kneeling down still: back up
  the same way. Walking to his place: the stick, never mind (he walks on); Space, E or J,
  never mind and he stops (J does not sit him down). On a touch screen the Jump button is
  hidden while he kneels. Back to the map, or off his
  feet: all stops at once. Tools, emotes and the camera wait meanwhile (`input` takes
  them); the drag looks round. The key help: "E get up · Q R look".
- **Camera**: the row's from behind him over the carpet (the side toward the hall's
  middle: the villagers are out of its way), a little above: him on his knees, the row
  before him over his shoulder, the Buddha beyond (on a screen held upright: from nearer
  behind, a little higher, so the row and the Buddha stay in); the monk's over his left
  shoulder, the monk facing it. Eased there over 3.2 s, then a slow drift (± 0.09 rad over 46 s) until
  the player drags; back to his own view after.
- **Cost**: 7 people of the crowd (no draw of their own), the row's step ≈ 0.01 ms; the
  people's bone shader: one table and one `if` (`P_CHANT`), like `P_BLESS`.
- **URL**: `listen=1` starts as E or J would (`listenwho=row|monk`; else the monk when he
  stands before the dais, the row in the hall); `listen=<step>[:<s>]` that far into a step
  at once (`kneel`, `listen`, `bow`, `up`). The row: `chantrow=1` there whatever the clock
  (`0` never), `chantrow=in:<s>` that far into coming in, `end:<s>` into the bows,
  `out:<s>` into going out; `chantverse=<s>` the verses' clock (held there in a still).
  Stills show the prompt as it was at their start (before the row is written): check
  prompts live. `report()` gives
  `listen=`, `listenwho=` (and `chantrow=1` for the row). Checks: `__listen.now()`,
  `__listen.probe()`, `__listen.cam()`; `__chant.now()`, `__chant.end()` (the row ends now).
  E.g. `roam=walk&at=-307.4,10,102.8&yaw=0&clock=0.76&chantrow=1&listen=listen:15&listenwho=row&chantverse=13`,
  `roam=walk&at=-305.3,10,103.3&yaw=90&clock=0.9&listen=listen:20&listenwho=monk`
  (`parts=terrain,village,people,foreground&people=blessing,chant` is quicker). A live
  check of the monk needs `fest=0` while the map's calendar keeps Pchum Ben (the monk is
  on the porch then).
### Lotus from the boat

`roam/_lotus.ts` (id `lotus`, words `lotus…`), the bed `roam/_lotusBed.ts`, the lotus
laid at a shrine `roam/_lotusLaid.ts`, the hook for others `roam/_lotusHook.ts`
(`LOTUS_HOOK`, `LOTUS_BED`), his poses and the lotus in his hand
`character/lotus.ts`, sounds `audio/_lotus.ts`, a badge on the maps
(`ui/_minimapSpots.ts`: `lotus-bed`, "វាលផ្កាឈូក / Lotus bed").

- **The bed**: a lotus bed in the great lake off the floating village's south end
  (five clumps round (−377.5, 80.5), r ≈ 11 m), out past the village's own lotus in
  the reed shallows and the fisherman knee deep there, where the lake is a metre
  deep (walking in from the shore gives the boat; the jetty's boat is 35 m off).
  Round leaves floating flat and held up on stalks (cupped, tipped), pink flowers
  open over gold hearts, green seed pods, and 20 closed pink buds standing on tall
  stems: those are picked. Voxel blocks of the map's families (`mapLeaf`, `petal`):
  the plants one mesh, the buds another (1207 blocks, 4 draws, ≈ 3 ms to build in
  idle time once the camera is within 300 m). Whatever stands inside the hull of his
  boat (riding, or left there) shrinks away, so no leaf pokes up through its floor.
- **Picking** (in the boat, slow or still, `holdIn: 'boat'`): beside a bud
  "E  បេះផ្កាឈូក / Pick a lotus" (with "F  Fish" after it; none while fishing, the
  camera or the phone up, the album open, another add-on holding him). The boat
  glides alongside it (≤ 2.4 m, its heading kept), the paddle goes down across his
  lap (level on his thighs, the other hand on it), he leans out over that side (the
  hull dips with him, his head kept nearer level), reaches down, takes the stem and
  snaps it (1.15 s: a ring spreads on the water, drops fall; the hand's bud is where
  the bud was, within ≈ 1 cm), brings it up out to that side and looks at it with a
  smile, and puts it in his bag (3.3 s in all; the camera comes round to that side,
  low, and its pitch and distance go back after). That bud is gone for the visit
  (its stub and the leaves stay). The stick or E while he reaches: he sits back,
  nothing picked. Bag full: "Your bag is full: no room for a lotus". Back to the map
  after the snap: it is in his bag.
- **In his bag**: a keepsake (`_shopBag.ts KEEPSAKES`, as the dak bat rice): never
  eaten (6 eats the first food; picked, or 6 when it is all he carries, it says
  "Offer it at any shrine when you pray"); its button in "In my bag" "Lotus to offer"
  with its own picture (`_shopIcons.ts OWN.lotusBud`); up to the bag's 3, kept
  between visits with the bag.
- **Offering** (any shrine of `_worship.ts`): with a lotus in his bag the walker's
  "E  Pray" is "E  ថ្វាយផ្កាឈូក ហើយថ្វាយបង្គំ / Offer a lotus and pray" (`order` 14,
  before the shrine's own). E: the prayer walks him onto its golden lotus, turns and
  kneels him as ever (`shrine.kneel`); once both knees are down the prayer is held
  there (`prayClock`: the Animator's playing action, its time kept at `LAY_KNEEL`
  2.15, so the hat, the bell, the flat hands and the bows simply wait) while he takes
  the lotus from his bag, bows forward a little to his right and lays it on the floor
  before him (0.46 m ahead, 0.6 m right: his short arms reach it within ≈ 2 cm; the
  bows' hands and head stay clear of it), the bud toward the shrine, his left hand
  under his right forearm; he sits up and the prayer goes on (2.6 s added). The
  camera comes round to the side with room (the right first; else behind, higher)
  and back behind him for the bows. The lotus stays where he laid it for the visit
  (smooth, in the statues' material like the altar offerings: `revolve` and
  `OFFERING_FINISH` of sacred/offerings.ts; one mesh each, 24 at most), the next one
  there beside it. "You offered a lotus at Angkor Wat" (the place, or the pagoda, the
  forest Buddha, the shrine by the lake, the shrine at the foot of Phnom Kulen, the
  spirit house); progress.ts `lotus.offered`. E or the stick before it is down: he
  gets up as from any prayer, the lotus stays in his bag. While "Back to the map?"
  asks (and on the way there) the offering and the picking wait: back to the map
  before it is down, the lotus is still in his bag (not laid, not counted); a bud
  already snapped goes into his bag. Praying without a lotus is
  as before (`_pray.ts` is not changed).
- **Visak Bochea**: at the tray, with a lotus he picked, his own is the one laid with
  the candle (`LOTUS_HOOK.offerWith('visak')`, two lines in `_visak.ts`): out of his
  bag, counted, told after the prayer's own toast.
- **Sounds** (moves bus, under the paddle): `lotusReach` (leaves brushing, drops),
  `lotusSnap` (the soft stem's muffled pop and tear, water off the stub),
  `lotusKeep`, `lotusLay` (a soft tap on stone).
- **URL**: `lotus=` one or more of, in order: `have:<n>` (n in his bag) · `near`
  (`roam=boat&at=` by the bed: the boat beside the nearest bud, its prompt) ·
  `pick` / `pick:<s>` (picking it, s s in: 0.9 reaching, 1.15 the snap, 2 looking at
  it, 2.7 putting it away) · `offer` / `offer:<s>` (on foot at a shrine: `at=` its
  spot, or `kneelat=`; kneeling, s s into laying it: 0.3 it is in his hand, 1.2
  bowing, 1.8 laid) · `laid` (one lying before the shrine nearest `at=`, he stays
  there); `lotuspicked=<i,…>|all` buds gone. Without `sim=` a shot's 0.8 s of
  settling counts into `<s>` (the posture needs ≈ 0.5 s to come in). `report()` gives
  them back (`have:1,pick:1.7`, `have:2,offer:1.1&sim=_:0.6`). E.g.
  `roam=boat&at=-372,70&yaw=180&lotus=near` (the prompt; `sim=e:0.1,_:2` picks it),
  `roam=walk&at=-306,10,96.8&yaw=0&lotus=have:1&sim=e:0.1,_:4` (the floating village
  pagoda), `roam=walk&at=0,58,-166.9&yaw=180&lotus=offer:1.2&sim=_:0.6` (Angkor Wat's
  main gate). Checks: `window.__lotus.state()` (pick, lay, their times, the bud, how
  many he carries, offered), `.bed()`, `.laid()`; the console line `[map] lotus bed: …`.

### Selling fish

He earns riel (៛) with the fish he catches from the boat (add-on `sellfish`).

- **Keep or let go** (_fishing.ts, the catch card `roam/_fishSellChoice.ts`):
  once he holds a catch up, the card at the right of the view (a sheet along
  the bottom on a phone held upright; the picture slides so he stays in view)
  shows the fish (its own voxel model drawn as pixels, `_fishSellArt.ts`), its
  name and size, what a fish seller would pay for it, and asks: **Keep it**
  (into his fish basket: five at most) or **Let it go** (as before). The ring
  starts on Keep (on Let go when the basket is full: Keep is greyed, "your
  basket is full: sell your fish, then you can keep more"). Until he has kept
  a fish once (saved: `sell.told`) it says "fish do not keep: sell them today".
  Keeping: he swings it over his basket — a small woven bamboo fish basket hung
  over the boat's left side behind his hip, its belly in the water (the catch
  keeps fresh; clear of the paddle) — and lowers it in tail first (a splash in
  the basket, `sellBasket`), "Into the basket (2/5)" (and its nature book page,
  or, the first time, where to sell them). The book still fills from every
  catch, kept or let go. Keys: 1 keep, 2 let go, ← → (Tab) the ring, Enter /
  Space / E / F take it, Esc lets it go; a click or a tap; touch's Use (the stick
  and the buttons step aside meanwhile); the pad (a layer: ✕, ○ lets go). A
  push of the stick lets it go and lays the pole down. Nothing is taken in the
  first 0.35 s (a strike key still held).
- **The basket** (`_fishSellBasket.ts`, its model `_fishSellModel.ts`): over the
  boat's side while he fishes or it holds fish; on foot at the back of his left
  hip (the rig's `fishBasket` slot on `hips`, rebuilt only when what is in it
  changes), the tails of the last two fish out of its mouth. The explorer
  menu's "In my bag" lists it (`_shopBag.ts` `BAG_MORE`: the basket, n/5, each
  fish and its size). Fish do not keep: back to the map, it is empty (never
  saved).
- **Who buys** (`_fishSellSpots.ts`, read from the places' plans; all on foot in
  the roaming area): the floating village's fish seller at the landing by the
  jetty's foot (`village-fish`, clock 0.68–0.9), the fish boat tied along the
  jetty (`village-boat-fish`, from the jetty, 0.715–0.88), the grilled fish man
  at his side table (`village-grill`, from midday into the evening, 0.9–0.34: he
  buys for his grill, so someone buys in the afternoon too); the morning
  market's fish stall in the hall (`market-fish`, 0.68–0.96) and the fish seller
  on the ground across the walk (`market-fishG`, 0.69–0.93); the fish seller
  behind Angkor Wat (`back-fish`, 0.69–0.84). `fvopen=`, `mkopen=`, `bhopen=`
  hold them open or shut as their places do.
- **Selling** (`_fishSell.ts`, the card `_fishSellCard.ts`): at a seller with fish,
  "E  Sell your fish (3)" (after a stall in the E row). E turns him to her, holds
  him (`holding`: the walker's step is the sale's), the camera comes round to a
  side from which both he and the seller show (`clearView`: nothing solid on the
  lines to him and to her, no post, tarp or leaves right in front of the lens,
  nobody at the camera or across either line; behind his shoulder first, then
  round both sides, nearer and higher over heads; looked for again a moment in,
  and in a replay: `sellfish=` frames the sale whatever `rcam=` says) and the
  sale card opens in the buy menu's look: her
  words ("Let me weigh them…"), each fish (pixels, name in the language in use,
  size) with her hanging dial scale swinging as she weighs it (one every 0.4 s, a
  tick and the spring's wobble: `sellScale`), then its price; "Sell all" with the
  total; the purse and the basket at the foot. Sell one (1–5, a click or a tap on
  its row) or all (the ring starts there: Enter / Space / E): he crouches and
  holds the fish out (the character's `interact`, the biggest of them in his
  right fist: the `sellFish` slot on `propR`), she takes it (`sellHand`), turns
  to him, holds out the money with a little bow and says "អរគុណបង!" / "Thank
  you!" (people/_saleBack.ts, through shop.ts `SALE`), and he is paid:
  `purse.earn` (the purse at the top glows, `_shopBag.ts` `bagNotify`; the card's
  counts up), `sellCoin` (notes counted, a coin, a small rising chime), "Earned
  6,500 ៛". All sold: "All sold", and the card shuts by itself. Esc, the ×, ○, a
  tap outside on a phone or a push of the stick shuts it (after the fish being
  handed over, which is paid all the same). Saved: `sell.sold`, `sell.earned`.
- **Prices** (`fishPrice`): what a fish seller pays, by kind, more for a bigger one
  by its weight (length cubed), to 100 ៛ under 2 000 and to 500 ៛ above: trey riel
  500–1 500 ៛, climbing perch 1 000–3 500, striped catfish 4 000–8 000, striped
  snakehead 4 000–15 000, clown featherback 5 000–18 000 (a 42 cm snakehead 6 500,
  a 14 cm riel 800).
- **Away**: outside her hours the prompt (no E) says "{name}: not here now · come
  back in the morning" (the grill: "at midday"), and E says it again.
- **Sounds**: `audio/_sell.ts` (`sellBasket`, `sellHand`, `sellCoin` on his moves
  bus, `sellScale` on ambience), under the paddle and the footsteps. Words: `sell…`.
- **Cost**: nothing until he has fish or stands at a seller with some (six
  distances a step on foot); the basket's voxel mesh made only when it changes.
- **URL**: `fishbasket=<kind>:<cm>,…` the basket's fish (e.g.
  `snakehead:42,riel:14`) · `sellfish=1` the sale card open at the seller by `at=`
  · `sellfish=<id>` at that seller's spot facing her, the card open (an unknown id
  lists them; away: the prompt says when) · `sellbuy=all|<i>` sells all (or fish
  i, from 1) as soon as she has weighed them · `sellfocus=<i>` the ring on row i (0
  "Sell all") · the catch card: `fishing=catch:<kind>&sim=_:1.5` (with
  `fishchoice=0|1` the ring on keep / let go; `sim=_:1.5,e:0.1,_:1.2` takes it) ·
  `fishing=keep:<kind>&sim=_:0.6` putting it in the basket. Checks:
  `roam=walk&clock=0.8&sellfish=village-fish&fishbasket=snakehead:42,riel:14,catfish:38&sim=_:2.2`
  with `parts=terrain,water,village,people,foreground` (weighing `sim=_:0.62`; a
  sale `&sellbuy=all&sim=_:2.75`, all sold `_:3.4`; at night `clock=0.45`);
  `market-fish`, `market-fishG` (`parts=…,hamlet,…`, `clock=0.8`), `back-fish`
  (`clock=0.76`), `village-grill` (`clock=0.05`), `village-boat-fish` (`clock=0.8`);
  the catch card `roam=boat&at=-350,15&yaw=200&fishing=catch:snakehead&fishcm=42&sim=_:1.5`
  (`parts=terrain,water,foreground`), full with five in `fishbasket=`.
### Clothes from the market

Buy kramas, shirts, trousers and a hat at the morning market, and dress him part by
part on the explorer menu's Look page (add-on `clothes`, words `wear…`, `look…`):
`roam/_wardrobe.ts` (the add-on: the stall's E, buying, the small turn, the camera, the
Look page's picks, the URL), `_wardrobeCard.ts` (the stall's card), `_wardrobeLook.ts`
(the Look page: `MENU_PAGES.look`), `_wardrobeItems.ts` (what is sold, prices, what he
owns and wears: `Wardrobe`), `_wardrobeIcons.ts`, `_wardrobeLookIcons.ts` (pixel
pictures), `_wardrobeStyle.ts` (the card's and the page's look), sounds `audio/_wear.ts`;
the colours `character/clothes.ts`; the parts `character/AngkorExplorer.ts`
`ExplorerOutfit`.

- **Where**: the morning market's krama stall in the sugar-palm village (its `cloth`
  stall, hamlet/_mkPlan.ts; open from dawn to the late afternoon, `[0.76, 0.2]` of the
  clock, as its seller is there; `mkopen=all|none`). Its look (hamlet/_mkGoods.ts
  `cloth` goods, `cloth()`, `garments()`; _mkStalls.ts's rack): folded kramas in the
  six colours in two rows of stacks (a check's white bands both ways, a plaid's band
  and thread on the top one), folded linen shirts and trousers, a pile of palm-leaf
  hats (the top one with the blue band; never conical); on the back bar the six kramas
  hanging in their weaves between sarongs; on the side bars fisherman trousers and
  shirts on wire hangers. Its seller is the market's (people/_sceneMarket.ts).
- **E "ទិញខោអាវ / Buy clothes"** in front of it on foot (closed: "តូបក្រមាបិទហើយ ·
  បើកវិញពេលព្រឹក", no E): he turns to the seller, the camera comes behind his left
  shoulder (him, the seller and her goods left of the card; the picture slides left of
  it: the buy menu's lens shift), she looks up and asks (`BROWSE`), and the card opens.
  Tabs: **Kramas** (red and white check 5 000 ៛, blue and white check 5 000 ៛, green
  4 000 ៛, purple silk 8 000 ៛, orange 4 000 ៛, the classic red 3 000 ៛), **Shirts**
  (linen, short sleeves: white, indigo, sand; 15 000 ៛), **Trousers** (loose fisherman
  trousers: navy, black; 12 000 ៛), **Hats** (the palm-leaf hat with a blue band;
  6 000 ៛). Everything costs at most a day's pocket money (20 000 ៛).
- **Buying**: the purse pays (the rustle of notes, a pad tick), the seller turns to him
  and hands it over (`SALE`, "អរគុណបង!"), he shakes it out (`wearShake`) and puts it on
  at once with a small turn on the spot, stepping round (1.15 s; the clothes change a
  third of the way round: `wearOn`), she says "ពាក់ទៅស្អាតណាស់ បង!" and a toast
  "កំពុងពាក់៖ …". Short of riel: the row shakes and says so. What he owns says "Wear"
  ("Yours" under it); what he wears "✓ Wearing" — taken again ("Take off" in the ring)
  it comes off (`wearOff`). Bought hat with the hat off: it goes on (not while the
  umbrella is up, nor sitting, lying or praying); a krama: round his neck (the scarf on).
  Trousers bought in the temple clothes wait for the explorer clothes (their row and the
  toast say "ស្លៀកជាមួយខោអាវអ្នករុករក / Worn with the explorer clothes"). After buying
  it is on the Look page, his. **Original look** at the foot: as on the Look page.
- **Keys** (the card's own while open): 1–6 a row, ↑ ↓ (Tab) the ring (down to "Original
  look"), ← → the tabs, Enter or Space take, E or Esc shut; W A S D or the stick walk
  away. Pad: a layer (stick and d-pad move, L1 / R1 the tabs, ✕ takes, ○ shuts). Touch:
  tap a row or a tab; on a phone a sheet along the bottom, a tap beside it shuts it.
- **The Look page** (រូបរាង: the explorer menu's Look tab, I; the pad: △, L1 / R1 to the
  tab; `MENU_PAGES.look`, the menu holds its tab and its place: a side panel at the right,
  on a phone held upright the lower part of the screen). One place for everything he
  wears, like a game's character screen: down the left the parts, each with the picture
  of what he has on now (on a phone on its side, or a page under 240 px: a row of icons
  along the top), beside them the choices of the part picked, what he wears lit gold
  with a ✓:
  - **Outfit** (ឈុត): explorer clothes (the shorts and the camera) or temple clothes (the
    sampot, no camera); the **ready looks** (G's four: explorer gear, day pack, no krama,
    temple clothes; the one he has on lit); **Original look** (as he set out: explorer
    gear, his own clothes, his hat; greyed when he is).
  - **Pack** (កាបូប): big pack (bedroll, canteen), day pack, no pack — with either outfit.
  - **Krama** (ក្រមា): none, his own red krama, the six of the market — with either outfit.
  - **Shirt** (អាវ): his khaki shirt, the market's three.
  - **Legs** (ខោ): his shorts, the market's trousers (with the explorer clothes); the sampot
    comes with the temple clothes. What the outfit he has on cannot show is greyed and
    says why ("ស្លៀកពាក់ខោអាវអ្នករុករក ទើបស្លៀកខោបាន (ឈុត)"); the trousers he chose come
    back with the explorer clothes.
  - **Hat** (មួក, H): none, his palm-leaf hat (red band), the blue band. With the umbrella
    up the hat is off; a hat folds it away (by H's own way: _umbrella.ts sees it).
  - **Face** (ទឹកមុខ, X): the six faces.
  What the market sells shows from the start: not bought yet, dim with a small lock and its
  price; the line under the list says where ("នៅតូបក្រមា ផ្សារព្រឹក ភូមិត្នោត · ៥,០០០ ៛"),
  for the one tapped, hovered or in focus. The part's head counts what he has bought of it.
  A choice is on at once: on foot, standing free, with a small turn on the spot to show it
  (1 s; another pick meanwhile is on at once, the turn goes on); in the boat, on the glider
  or in the balloon, no turn. While the page shows on foot (not among a market's stalls —
  their goods and tarps are not in the walk map — nor while sitting or lying) the camera
  comes round to his front and the picture slides left of the panel (above it on a phone
  held upright); walking off, or the page going, gives the camera back. Meanwhile his light in
  hand is turned low (the lantern's or the torch's point light a hand's width from his clothes,
  seen from the front, blew them out to a red-orange blob) and after dark a soft near-white fill
  lights him from the camera's side: the light his hand does not use (tools.ts `lights`,
  `LOOK_HOOKS.showing`), so no light is added and the map's shaders stay as they are. Keys and the pad
  (the focus in the page): ↑ ↓ along the parts (each shows its choices), → into the
  choices (onto what he wears), ← back; ✕ (Enter, Space) takes it; in a row of parts
  ← → and ↓. The page reads him every step: G, H and X (and the hat a prayer or lying
  down keeps for him) show at once.
- **The parts are the explorer's** (`ExplorerOutfit`: `legs` and `camera` from the
  outfit, `pack`, `scarf`, `hat`; `setClothes` for the market's colours): every part shows
  with every outfit that can show it (a krama or a pack with the sampot too); the four
  looks of G are four sets of them. A set none of the four is fine: G goes on from the look
  before; parts that make one of the four are that look (tools.ts follows: `LOOK_HOOKS`
  in _addons.ts, `changed` and `open`).
- **The explorer** (`AngkorExplorer.setClothes`, tones in `character/clothes.ts`): the
  part builders take the tones in place of the palette's (scarf.ts `KramaLook`: a plaid
  like his own or a gingham check; torso.ts and limbs.ts a shirt's; limbs.ts long loose
  trousers instead of the shorts; props.ts the hat's band); only the parts that change
  are built again, once, on the change (≈ 6–9 ms for four in the headless CPU build).
  With no clothes every builder gives his own blocks, block for block (the viewer, the
  stickers, his default look unchanged). Photos, the selfie and every mode show them
  (the same explorer).
- **Saved**: map/progress.ts `wear.owned`, `wear.on` (item ids); not in shots, nor on a
  page whose URL dresses him. The outfit, the pack, the krama on or off, the hat and the
  face are not (as G, H and X never were: each visit starts in his explorer gear).
- **URL**: `wear=<item>,<item>` dresses him (and he owns them; no saving; `wear=0` his
  own), `wearown=<item>,…|all` owns those too · `clothes=1` stands him at the stall
  facing its seller, the card open · `clothes=wardrobe` the Look page (as `menu=1&menutab=look`) ·
  `lookpart=outfit|pack|krama|shirt|legs|hat|face` its part · `kit=<shorts|sampot>,<explorer|default|none>,<0|1>`
  a look none of G's four (legs, pack, krama; theirs: `look=`) · `clothestab=krama|shirt|trousers|hat` ·
  `clothesfocus=<i>` the ring on row i · `clothesbuy=<item>` buys it there and then
  (`sim=_:0.95` the hand-over, `_:1.5` half way round, `_:2.6` done). Items:
  `kramaRedWhite`, `kramaBlueWhite`, `kramaGreen`, `kramaPurple`, `kramaOrange`,
  `kramaRed`, `shirtWhite`, `shirtIndigo`, `shirtSand`, `trousersNavy`,
  `trousersBlack`, `hatBlue`. `report()` gives `wear`, `wearown`, `clothes`,
  `clothestab`, `lookpart`, `kit`. Checks: `window.__clothes.state()` (dev, shots: the
  page's part, its choices lit, locked or greyed, the line under them; the framing),
  `.part(<part>)`.
  E.g. `roam=walk&at=334,-90&clothes=1&clothesbuy=kramaBlueWhite&sim=_:1.5&people=market&clock=0.85`
  with `parts=terrain,hamlet,people,path,foreground`; `roam=walk&at=333,-112&yaw=0&rcam=180,6,5&wear=kramaRedWhite,shirtWhite,trousersBlack,hatBlue`;
  the Look page `roam=walk&at=30,-205&yaw=0&menu=1&menutab=look&lookpart=krama&clock=0.95&wearown=kramaBlueWhite&wear=kramaBlueWhite`
  (`parts=terrain,water,foreground`; `touch=1&phone=1` a phone).

### Helping the farmers

Planting and cutting the rice with the farmers in the lake paddies (add-on
`farm`, order 60: `roam/_farmWork.ts`; his strip of the field's own hills
`_farmStrip.ts`; his props `_farmProps.ts`; the guide ring, splashes, the cut
floor and his sheaves on the bund `_farmMarks.ts`; the farmers' side through
`_farmLink.ts` `FARM`; his postures `character/farmWork.ts`; the sounds
`audio/_farm.ts`; the farmers `people/_sceneFarm.ts`; words `farm…`).

- **When**: the farmers' own season (`_sceneFarm.ts farmModeOf`: planting
  0.08‥0.3, mid-May to July; harvest 0.59‥0.8, mid-November to January), by
  day while they are out. Near a farmer of the row (4.2 m): "E  Help plant
  rice" / "E  Help with the harvest". Out of those seasons, near any farmer
  (3.2 m), a line with no key says when to come back (growing: the harvest,
  November–January; dry: the planting with the rains, May–July; the harvest
  done where they are: the planting). The calendar lists both (the calendar's
  `_sceneFarm.ts farmModeOf` events).
- **Planting**: the farmer at the row's end turns to him and holds out a
  bundle of seedlings (`POSE.give`); he walks over and takes it in his left
  hand, wades to his place at that end of the row (knee-deep: he sinks 0.2 m
  into the mud, slower, a splash a footfall), faces the planted rows as they
  do and bends right over. **E** (or Space, the pad's □, touch's Use) pushes
  the next clump into the mud where the gold ring shows: two across, then a
  shuffle step back to the next row, 12 in all; the bundle thins as he goes.
  At the last the farmer comes over: "អរគុណ!", a parcel of num ansom (his
  bag: `purse.keep`, 6 eats it; with a full bag 3,000 ៛ instead), and he
  sampeahs her.
- **Harvest**: she lends him her sickle (she gathers by hand meanwhile);
  **E** cuts the next clump (the left hand grips it, the sickle draws through
  under the fist), four across, three rows, to and fro; the sheaf grows in his
  left hand; at the last he ties it, carries it to the plot's nearest bund
  and lays it there (beside the ones he laid before); she comes, takes her
  sickle back, thanks him, the parcel.
- **His clumps are the field's own** (`paddies/rice.ts RICE_HILLS`: their
  planting or cutting day rewritten, those texels uploaded): they stand in the
  rows, grow on (or stand as stubble) with the season, for the visit. While
  he cuts, a patch of cut floor a clump (the plot's floor keeps its gold
  under standing rice) till the plot's own cut comes there. Planting, one
  strip is kept unplanted beside an end of the row, changed (or moved with
  the row) only where the player does not see it; one made in view shrinks
  into the water as she hands over the bundle. The row waits for him while
  he works (`FARM.helper.working`); a plot not planted yet is drawn early
  (`RICE_HILLS.early`) for his clumps.
- **Leaving**: the stick (held away ⅕ s) walks him out of it: he straightens
  and she comes for the bundle or the sickle (the stick again: at once). Esc
  (back to the map), another mode, the night, a meal (6): he stops at once.
  J, L, F, C, U, P, 1–3, O, I do nothing meanwhile; the camera (4, 5) works.
  The key help (bottom left) shows his keys meanwhile (`keys()`: E / Space
  plant or cut, the stick stops, Q R look; on his way only the last two), and
  touch's jump button says "Plant" / "Cut" at the work (hidden on his way).
- **His place**: his strip begins ≈ 1 m further out across the plot than the
  farmers' own spacing (`SPACE`, nearer where the plot's edge is close) and a
  step along the row from their line (`PLANT_AHEAD` behind it, `REAP_AHEAD`
  ahead of it), so he works ≈ 3 m from the nearest farmer and nobody of the row
  stands behind him from the side or the default camera.
- **Camera**: walking, behind him; at the work at his side away from the
  farmers' row, a little in front (reaping higher); handing over, from the
  side; eased there for 2 s, then the player's; back as it was after.
- **URL** (`season=` in the work's time, `at=` near the farmers):
  `farm=plant|reap` at his place with the bundle or sickle · `farm=plant:<n>`,
  `reap:<n>` n clumps done, the next going in · `plant:give`, `reap:give` her
  holding it out · `reap:lay` laying the sheaf on the bund · `plant:thanks`,
  `reap:thanks` her thanks and parcel; `report()` gives `farm=` back. E.g.
  `@index.html?shot=1&season=0.2&roam=walk&at=-249,72&farm=plant:4` (plot 1),
  `season=0.7&at=-200,72&farm=reap:5` (plot 8), `season=0.09&at=-177,72` (a
  plot not planted yet). Shots log `[map] farm: …`.
- **Cost**: nothing until he first helps (props, marks made then); per frame
  a few comparisons; a strip is found by one pass over the rice's ≈ 30 000
  hills (≈ 0.2 ms), at most about once a second near the farmers; the props
  2–3 draws in his hands, the marks one draw each while shown.

### The dog

A village dog that becomes his friend (add-on `dog`, words `dog…`): `roam/_dog.ts` (its
life, petting, following, waiting, calling, the URL, the API), `roam/_dogPath.ts` (where it
may go: the step rules, his trail, the path search), `roam/_dogModel.ts` (the dog and its
pose shader), `roam/_dogCard.ts` (its name: the names and the card), `roam/_dogHook.ts` (the
explorer menu's two buttons), his pose `character/dogPet.ts`, sounds `audio/_dog.ts`.

- **The dog**: a Khmer village dog (សុនខស្រុក): lean, short tan coat (the villages'
  sleeping dogs' colours, village/_kit.ts `dog`), cream muzzle, chest, belly and socks, a
  darker saddle, pricked pointed ears (pink inside), a tail curled up over its back; drawn
  1.2 × a real dog's 0.46 m at the shoulder (beside the explorer drawn 1.4 × his size, with
  his short legs). It walks (lateral steps), trots (diagonal pairs), gallops (the back
  flexing, the ears back, the tail out), sits, lies on its belly (sphinx, the chin on its
  paws asleep), sleeps flat out on its side; it wags (slow and low, or fast and wide), pants
  after a run (the jaw open, the tongue out), sniffs (the nose dipping), barks (the head up,
  the mouth open), blinks, shuts its eyes asleep or at a good scratch, pricks its ears
  watching and lays them back happy or at a gallop, tilts its head, leans into his hand,
  thumps a hind leg while its ears are scratched, hops up and down the land's steps, and
  turns its head to him wherever he is. Its body tilts along stairs and slopes.
- **Where**: by the sugar-palm village's little shop on the street (`HOME` 419, −59.1,
  beside `EV_KIOSK`, off the shop's buy spot), napping flat out on its side. When he comes
  within 9 m on foot it wakes (a yawn), lifts its head, sits up and watches him, its tail
  going; within 3.4 m it stands, wags harder and comes a step to him; it never goes far from
  its spot, and naps again once he has been 17 m off for 8 s.
- **Petting** (on foot, ≤ 2.5 m, facing it within 49°; not while busy or held): E
  "អង្អែលសុនខ / Pet the dog" ("អង្អែល{name} / Pet {name}" once it is his). He turns to it, it
  comes to sit at his front right facing him, he squats (knees out over his belly, leaning a
  little, his face to it: his hat's brim stays clear of his face) and his right hand pats
  its head three times (arm IK to its crown, read off its pose: `dogPoint`), his left fist
  on his knee, a happy face; it wags hard, ears back, leans its head up into his hand, shuts
  its eyes at each pat, a happy whine, a soft pat on its fur at each touch. The camera comes
  round to his right side (both in profile) unless the player turns it. Then he stands, it
  steps back off his feet. E, Space or the stick: up at once. **F** close in front of it:
  instead of a greeting he scratches behind its left ear in small circles; it tilts its
  head into his hand, eyes shut, and its left hind leg thumps (a soft thump each). F with
  nobody near: it looks up at him, a tilt of the head.
- **It comes along**: two pets or scratches (kept in `dog.pets`): the first "សុនខគ្រវីកន្ទុយ
  — វាចូលចិត្តអ្នកហើយ!", the second "សុនខចង់ទៅជាមួយអ្នក!" (a happy bark) and the name card:
  "ដាក់ឈ្មោះឱ្យសុនខរបស់អ្នក / Give your dog a name" (only once the map has started: never over
  the loading screen; the E prompt hides while it is open). **The word for a dog is សុនខ**
  (the polite one), never ឆ្កែ, in every word of the dog. **He writes its name** (as for the
  explorer's, `_nameCard.ts`): a field, typed in Latin letters (khmerName.ts writes it in Khmer:
  Mimi → មីមី; a name that can be written more than one way shows the other spellings as chips
  "ឬសរសេរបែបនេះ") or in Khmer straight away; the big gold name, in Koulen, follows what is typed.
  **There are no names to pick from and no default** (the six village names the first card
  offered, លឿង ខ្មៅ ស ក្រហម តូច សំណាង, are gone; a dog already given one keeps it): the card opens
  empty, the big name says "ឈ្មោះសុនខ / Dog's name" faded, and "យកឈ្មោះនេះ" is dim until
  something is written (Enter with nothing shakes the field). The field has the focus on a desktop
  keyboard (a letter anywhere else would reach the mini-map's M and N first), Enter keeps, Esc
  "ពេលក្រោយ / Not now" shuts (the dog goes with him, unnamed); the pad: a letter board while the pad
  is in use, the spellings, ✕ presses, △ keeps, ○ shuts; on a phone the card stands at the top (the
  keyboard comes up under it). Unnamed it is "សុនខ" / "the dog" in prompts and toasts. Then two hints:
  "{name} ដើរតាមអ្នកហើយ · ចុច 0 ហៅវាមក" (with a pad or on touch: "… call it from the menu"), "នៅក្បែរ
  {name}៖ ចុច F អេះត្រចៀកវា". Kept: progress.ts `dog.adopted`, `dog.name.km` and `dog.name.latin`
  (an older `dog.name` id, one of the six, is still read, and forgotten when a name is kept; nothing
  kept: no name). The explorer menu's "ឈ្មោះសុនខ / Dog's name" (its Me page) opens the card again. In
  prompts and toasts its name is "សុនខ" + the name in Khmer ("អង្អែលសុនខស", "នៅក្បែរសុនខស៖": a
  one-letter name never reads as a word), and in «» where it is named ("សុនខរបស់អ្នកឈ្មោះ «ស»"); in
  English the Latin spelling, or the Khmer letters for a name written in Khmer. (No snack: food in his
  hands is the Animator's carry pose, laid over any posture's arms, so he could not hold it
  out to the dog cleanly; two pets it is.)
- **Following** (on foot): along his trail (`Trail`: his feet every 0.6 m while he walks
  free, a gap after a jump, a fall, a ride), cutting straight where a straight way is free
  (`lineWalk`, 5 times a second, four tries), so it goes where he went: round walls and
  trees, over the bridges (the deck, not the water), up the temple stairs, up a land step
  with a hop (≤ 2.3 m, onto the land only) or a terrace's edge (≤ 1.2 m), over a low wall
  (0.85‥1.2 m high, ≤ 1 m thick: the moat's kerb), down with a jump (≤ 2.7 m); never through
  a wall, never into water deeper than 0.32 m. Up more than a kerb (0.3 m) only onto a stair
  (rising on) or a floor people walk: wide (on ahead and to a side) and, just over the land,
  bigger than 16 m² or with a stair up from it — never a stall's platform among the goods, a
  table, a bench (`goesOn`, `island` in `_dogPath.ts`). It keeps 3.2 m behind (up or down a
  stair counts: the climb × 1.5): walking, trotting at his walk (4.3 m/s), galloping when he
  runs (to 11 m/s). A gap in the trail, a wall, a step it cannot take, or 1.2 s without
  getting on: it looks for a way (`PathSearch`: A* over the walk map's half-metre columns,
  each a floor at its height, 260 columns a step, at most 65 536, 420 m of way) and follows
  that; the search and the dog take each step alike (its checks look from the column's
  middle, and before a step up or down it comes to the column's middle first). Not got on
  for 2.5 s: it takes the way's next step as the search did (a hop), or looks again; still
  stuck: it looks again; then it comes in by him (or waits). Wedged (no floor with room at
  its feet for 0.75 s): out onto the nearest free spot within 3 m. Someone walks up to it
  (a person within 1.5 m, 2.4 lying: the people part's traffic, `window.__people.traffic`,
  four times a second: the monks' line, the market's lanes): it gets up and moves 1.9 m off, away from them (not off out of his reach); he walks
  at it: it trots a step aside. He stops: it turns to him, sits (1.2 s), lies down (14 s),
  sleeps flat out (45 s, or 4 s once he sleeps: J / L); now and then it sniffs about a few
  metres off (never at his feet); by day it barks two or three times at a macaque or a
  junglefowl within 15 m (fauna's `subjects`, every 2.5 s, at most once in 35–70 s, two
  times in three).
- **Halls: it waits outside** (`HALLS` in `_dogPath.ts`): out of respect it never steps into
  the village pagoda's vihara (its plinth, from the porch's front step: porch, hall,
  colonnade) nor up Angkor Wat's upper levels (the middle terrace and the Bakan); it may
  walk out of one it is in. He goes in: it goes to the door — the pagoda's: on the terrace
  before the porch, east of the way in between two front seima, clear of the processions'
  way; else where he went in (his trail's last crumb outside) — and sits there watching for
  him, also while he is held inside (a blessing, Visak Bochea's candle); moved off to let
  someone by, back after a while. He comes out: it comes to him. 0 there: "សុនខមិនចូលទីសក្ការៈ
  ទេ · {name} រង់ចាំអ្នកនៅខាងក្រៅ". A start or a landing in a hall puts it at the door.
- **Waiting**: in the boat, under the glider or the parachute, in the balloon, or while
  another add-on holds him (the bicycle, the cart, the buffalo, the zip line, the hammock,
  the ladder, the kite, the sey, the farm work…): it stops where it is, sits watching him (a
  soft whine as he goes), stands to turn round as he moves round it, lies down after 25 s.
  On foot again it comes (a straight way, or a way found; looked for again every 4 s, and
  after a way was not found only once he has moved 6 m on, or 6, 12, 24, 40 s later). With
  no way within 420 m (he landed far off, across a river): it waits, and says so once a
  landing: "{name} នៅឆ្ងាយ · ចុច 0 ហៅវាមក".
- **0 "ហៅសុនខ / Call the dog"** (the key list's row; the explorer menu's "ហៅសុនខ" on its Moves
  page, for a pad (△) or touch, shown once he has a dog): he whistles first (`dogWhistle`, his own
  recorded whistle, the same whatever the dog's distance; a second call within 0.7 s adds none; none
  in a hall: the call there only says the dog waits outside; none in a shot), then "{name}
  កំពុងរត់មករកអ្នក!" and it comes along the way it finds (a bark as it sets off); with none, or more than 336 m off, it comes out by
  him 5–9 m off, from behind leaves or bark seen from the camera, else out of the camera's
  view (a soft dissolve, 0.7 s: a dither in its shader, its shadow too) and runs to him —
  only onto a floor on his level (within a step of his, never the tier under a terrace's
  edge or the land under his deck, never a hall) from where it can walk to him, and only
  where a dog could come up on foot (below). With no such spot it stays where it is and says
  so: "{name} មិនអាចមកដល់ទីនេះបានទេ · វានៅរង់ចាំអ្នក"; a way that only gets near (him up a
  deck): to its foot, where it waits looking up. Close by (on his level: distances count
  height): "{name} នៅក្បែរអ្នកហើយ". No dog yet: "អ្នកមិនទាន់មានសុនខទេ — មានសុនខស្រុកមួយក្បាលដេក
  ក្បែរហាងលក់ទំនិញ នៅភូមិត្នោត".
- **Back to the map**: it goes home (to its bed when it has one) and is not drawn; the next
  time he is on his feet 1.8 s (landed from the leap, a shot's start) it comes in by where
  he is, as when called with no way — where a dog could come up on foot: on the land, or a
  floor with a way down to it (a search from his floor to the land, `toLand`: a terrace, a
  deck by its stair; a roof has none: it stays home until he is down, and 0 there says it
  cannot get up).
- **For his stilt house** (`_home.ts` uses it): `dogBed({ x, z, y?, yaw? } | null)` where it
  sleeps (its bed: null, the village); `dogHome(true)`: he is home (asleep): it goes to its
  bed (a way, else it is there) and sleeps flat out; `dogHome(false)`: it wakes and comes to
  him (a way; it waits there while there is none). `dogState()` (one object, filled each
  call): `adopted`, `name` (km, latin), `life` (`nap` / `awake`: the village dog; `follow`,
  `come`, `wait`, `door` (at a hall's door): his, roaming; `bed`; `away`), `x, y, z`, `far`
  (m from him), `asleep`.
  Also `dogAdopted()`, `dogNameNow()` (its name in the language in use, or null).
- **Sounds** (`audio/_dog.ts`, measured offline, the loudest 100 ms): `dogBark` (the village
  dogs' own synthesized bark, speech.ts `bark`, one or two "wau"s, its top softened: −29 dBFS
  at 0.75, as soft as the monkey's chatter), `dogWhine` (−35), `dogYawn` (−36), `dogSniff`
  (−40) on the animals bus, `dogPant` (lasting: −38 at its fullest, its nodes gone 3 s after
  it stops), `dogWhistle` (moves, −14: a call is meant to be heard; the recording
  `assets/sound/whistling-to-summon-ra-music-low-2-00-02.mp3` as it was given, its own pitch (no
  jitter), whole, its echo to the end: only the silence after it is cut, 60 dB under its loudest;
  fetched and decoded when `audio/_dog.ts` loads (three tries over a visit), faded 2 ms in and 80 ms
  out and levelled on its loudest 100 ms (`WHISTLE_RMS`; the file itself is at −5); until it has
  loaded, or if it fails, a synthesized two-tone "fweet-fweeoo" — a pure sine sliding 1.5 → 2.3
  kHz, a breath, then 1.9 → 2.7 → 2.1 kHz with a wavering end — stands in; `whistleSource()` says
  which, for checks), `dogPat`
  (moves, −33), `dogThump` (steps, −32); each softer the further the dog is from him (silent
  past 43 m), except his whistle.
- **URL** (checks): `dog=follow` (his dog beside him at `at=`, behind at his left, else the
  nearest spot all round him on his level, else at his feet; at the door when he is in a hall) ·
  `dog=sit|lie|sleep` (settled by him so) · `dog=stand` (held standing) · `dog=pet|scratch`
  (petting it: `sim=_:2.2` well into it) · `dog=adopt` (the village dog awake in front of him,
  petted once: E the second time, `sim=e:0.1,_:4`) · `dog=name` (the name card open;
  `dognametype=<text>` writes `text` in the field) · `dog=nap|wake` (the village dog at home) · `dog=wait` (his dog at
  `dogat=x,z`: it comes if it can) · `dog=call` (called from `dogat=` at once) · `dog=bark`
  (barking at the nearest monkey or junglefowl, else ahead of it) · `dog=away` (gone home: it
  comes in by him once he is on his feet: with `roam=glide`, on landing) · `dog=0` (none
  drawn) · `dogat=x,z` · `dogname=<any name>` (in Latin or Khmer letters; a bug report writes `<Khmer>|<Latin>`; an old village name's id still reads; none: no name) · `dogpets=<n>` · `doggait=1|2|3` (walk,
  trot, gallop on the spot) · `dogfade=0‥1` (the dissolve held). The bug report gives the
  state it is really in: `dog=away` (gone home, or on its bed while he is home), `dog=wait&dogat=`
  (waiting where he left it, or at a hall's door), else `dog=follow|sit|lie|sleep` (and
  `dogat=` when off), with `dogname=`; the village dog `dog=nap|wake|adopt`. A hall:
  `roam=walk&at=-306,10,104&dog=follow` (it sits at the pagoda's door); a roof:
  `roam=walk&at=334,-80&dog=away` (it stays home); the market:
  `roam=walk&at=348,-92&yaw=250&clock=0.78&dog=follow`.
  E.g. `roam=walk&at=418.6,-61.4&yaw=10&dog=adopt&sim=e:0.1,_:2.4` (the pat by the shop),
  `roam=walk&at=392,-63&yaw=270&dog=pet&sim=_:2.3`, `roam=walk&at=400,-65.6&yaw=0&dog=stand&dogat=400,-63&explorer=0&cam=403.3,10.95,-63,400,10.4,-63,32`
  (its side), `roam=walk&at=396,-63&yaw=90&dog=call&dogat=0,-160&sim=_:2.5` (it comes in by
  him), `night=1&tool=lantern` (lit by his lantern).
- **Cost**: one InstancedMesh of one dog (45 boxes, 1 080 vertices: one draw, one for its
  shadow), posed in the vertex shader from the kit's eased channels and three uniforms
  (`DogLook`); its pose is tables of coefficients (no GLSL `if` chains) and the kit's chain
  walk is made a loop the compiler cannot unroll: it compiles in 40 ms on ANGLE OpenGL (the
  other animals 26). CPU ≈ 0.03 ms a frame following (0.2 at most, a path search's slice),
  nothing allocated a step (no `Math.hypot`: fauna/_len.ts); the village dog is not stepped beyond 110 m of him and the
  camera, nor drawn beyond 170 m.
- **Checks** (the dev server and its shots only, not in a build): `window.__dog` (`state()`,
  `life`, `act`, `route`, `search`, `way()` (the way found), `D`, `pose`, `look`, `trail`,
  `debug` (with the stall watch and the door), `call()`, `adopt()`, `home(on)`, `bed(spot)`,
  `jam(s)`: it cannot step for that long, to try the stall watch).
- Shared edits: `ui/lang.ts` (`dog…`), `_addonList.ts`, tools.ts (the key list's 0 row),
  `_explorerMenu.ts` (the two buttons, on Moves and Me, from `_dogHook.ts`).

### His stilt house

His own Khmer house on stilts (add-on `home`, words `home…`): `roam/_home.ts` (the
add-on: the key, the door, the card, the room's camera), `_homeTalk.ts` (the key),
`_homeSleep.ts` (sleeping), `_homeCard.ts` (the card: until when), `_homePoses.ts`
(his stretch), `_homeWalk.ts` (the shut doorway in the walk map); the house
`hamlet/_home.ts` (a hamlet piece: one line in `hamlet/index.ts`), what moves in it
`hamlet/_homeShelf.ts` (the shelf of finds, the sign), where everything is and what
the pieces share `hamlet/_homePlan.ts` (`HOME`, no three.js); the grandmother
`people/_sceneHome.ts` (scene `home`: one line in `people/index.ts`); sounds
`audio/_home.ts`; the badge `ui/_minimapSpots.ts` (`home`, "ផ្ទះខ្ញុំ / My home").

- **Where**: at the sugar-palm village's north-east edge, (424, −107), past the
  mango and the coconut palm behind the north houses: its veranda looks north up the
  Kulen foot meadow to Phnom Kulen and its falls, the Kulen stream a few steps east,
  the Kulen foot trail 12 m west. Clear of the bicycles, the kite stall, the sey
  circle, the dak bat way and the herd's lane (all south of it).
- **The house** (the village's own Khmer forms and kit: `_evKit.ts`, `village/_kit.ts`):
  a rông daol, one steep gable roof of red-brown clay tiles over the rooms and the
  veranda, plain barge boards (no horns), a fan of rays out of a little sun in the
  west gable, a kbach leaf in the east one; the floor 3 m up on dark stilts on footing
  stones; plain old plank walls (lined inside with lighter planks), teal shutters and
  doors; the wooden stair with handrails. Wide double doors (2.1 × 2.6 m: room for
  the roaming explorer) that swing in against the wall; open windows (a wide one by
  his mat over the stream, two at the front looking at the mountain). **Inside**: the
  reed sleeping mat with pillow and krama under a white mosquito net (its front rolled
  up on its bar by day, let down while he sleeps), the altar shelf high on the west
  wall (a small gilt seated Buddha with the lotus-bud ushnisha, incense, lotus and
  jasmine, bananas, a candle; a red cloth with a gold hem), the shelf of his finds
  (every golden figure he has found, `treasure.found()`, in miniature on its lotus
  plinth; his kite, `kite.have`, hung on the wall over it: a khleng ek in his kite's
  red, cream, gold and blue), his palm-leaf hat on a nail, the water jar with its
  dipper by the door, a sitting mat with a teapot, a lantern hung from the ridge, an
  oil lamp on the front window's sill (lit at night once he owns it: glows and halos,
  no light). **Round it**: a mat, teapot, pots and a krama on the veranda; under the
  floor the hammock (the hammock add-on's, `addHammock({ id: 'home' … })`), jars,
  firewood, a rice basket, a hoe; in the yard the jar to wash his feet, the dog's bed
  (a woven basket with an old krama, beside the stair's foot), a spirit house,
  bougainvillea; the grandmother's mat and little oil lamp (lit while she waits).
  Its wood is the `bark` family (solid for the follow camera, not dissolved by the near
  fade: the room stays whole round him); planks underfoot sound of wood. 724 blocks in
  4 draws, glows and halos 2, the moving things (doors, net, shelf, sign) 6‥9 small
  draws drawn only within 140 m and in view; built in ≈ 3 ms.
- **The key**: an old woman of the village (a krama on her head) keeps the empty
  house: by day she sweeps its yard, after dark she sits on her mat by her lamp. The
  first time he comes within 15 m she stops, waves and calls "ចៅ! មកនេះបន្តិចមក!" (a
  voice). By her, **E "និយាយជាមួយយាយ / Talk to Grandma"**: he steps up to her, the
  camera comes round to their side (the open one); "ផ្ទះនេះនៅទំនេរយូរហើយ…", she holds
  the key out in both hands (`POSE.give`, a little brass key on a red cord) —
  "ផ្ទះនេះជារបស់ចៅហើយ។ ស្នាក់នៅប៉ុន្មានក៏បាន" —, he takes it (`interact`, a jingle:
  the toast "You have the key…": progress.ts `home.owned`), thanks her the Khmer way
  (`greetHigh`, palms to his face), she bows back, says "ទៅ ចូលមើលផ្ទះទៅចៅ!" and walks
  home along the trail. Back to the map before the key is in his hand: nothing kept,
  she asks again next time.
- **The door**: on the veranda before the shut doors, **E "បើកទ្វារ / Open the door"**
  (`openDoor`, the hasp, a slow creak): open for good (`home.opened`). Not his yet:
  "ទ្វារចាក់សោ — យាយនៅក្បែរនេះកាន់កូនសោ" (with no people part it opens to him). While
  shut the doorway is a wall in the walk map (`_homeWalk.ts`, over `world.standAt`).
- **In the room**: his hat comes off at the door and goes back on outside; the follow
  camera goes up toward a corner of the room under the roof behind him, looking
  across at him (four places, none over the net; a drag is the player's for 3 s;
  60° view), and back to his own view out on the veranda.
- **Sleep**: at his mat **E "ដេកសម្រាក / Sleep"** opens the card "ដេកដល់ពេលណា? /
  Sleep until…" (the time now under it): **Until dawn**, **Until the afternoon**, and
  **Wake for: <the next event of the calendar>** (the soonest to begin within 1.5 days
  of the cycle, its time and place under it; waking 6 s before it, as the calendar's
  Wait does), soonest first, none more than 0.85 day ahead; **Not now**. Keys 1‥4, ↑ ↓,
  Enter / Space, Esc; the pad's d-pad, ✕, ○ (a layer); touch or a click. Then he
  steps onto the mat, sits and lies back (the rest's poses), his hat off, the net comes
  down, he dozes ("Z z z"), three soft bells, the view fades to black, `TIME.skipTo`,
  what is built late comes (`TIME.building()`, ≤ 8 s), the view fades in on him
  asleep in the new light, two notes, the net goes up, he sits up, stands, steps out
  from under it and stretches (arms up in a V, eyes shut, on his toes: `_homePoses.ts`),
  the toast "អរុណសួស្ដី! ព្រះអាទិត្យរះហើយ" (the afternoon's, or "ភ្ញាក់ទាន់ពេល៖ …" and
  the mini-map heads for the event when it is over 60 m off). Lying down, before the
  dark, E / Space / the stick gets him up again. **While the time stands still**
  (Time: Day or Night) the card says so in one line and offers only **Rest a while**
  (a doze, then up). Back to the map meanwhile: at once, the view back, nothing moved.
  His dog (if he has one) goes to its bed while he sleeps (`dogHome(true)`), and the
  bed is `dogBed(…)` from the day the house is his (`homeDogBed`): it sleeps there
  while he is away.
- **Sounds** (`audio/_home.ts`): `homeKey`, `homeDoor`, `homeMat`, `homeNet` (moves),
  `homeSleep`, `homeWake` (ui); the grandmother's call is the people's `hello`.
- **The sign** over the door: his name in Khmer letters (`playerName()`, again on
  `onName`), with none "ផ្ទះខ្ញុំ": drawn with Koulen at 26 px on a canvas, each
  painted pixel a raised cream block on the dark board (one draw, rebuilt on a change).
- **URL**: `home=1` his, the doors open · `home=shut` his, the doors shut ·
  `home=0` not his (the grandmother waits) · `home=call` she calls to him ·
  `home=key` the grandmother's moment (she holds out the key, her words) ·
  `home=inside` standing in his room (the room's camera) · `home=sleep` asleep on his
  mat under the net · `home=stretch` up, stretching · `homecard=1` the card (as the
  time is; `=cycle` as when it runs) · `homekite=1` his kite on the wall · `gold=all`
  fills the shelf · `name=<name>` the sign. `report()` gives `home=key|sleep|inside|1|shut`.
  `window.__home` (shots, dev): `state()`, `sleep(kind)`, `card(force)`. E.g.
  `roam=walk&at=416,-122&yaw=20&home=key&sim=_:0.3&clock=0.92` ·
  `roam=walk&at=424,13,-106&home=inside&gold=all&homekite=1&night=1&sim=_:1` ·
  `cam=412,19,-127,423,13.5,-108,50&home=1&name=Dara&night=1` (outside, lit).

### The boat race

Paddling in a ngo at the Water Festival (Bon Om Touk): `roam/_raceRow.ts` (the
add-on), `_raceRowGame.ts` (the rules: no page, no three.js), `_raceRowUi.ts` (the
interface), `character/raceRow.ts` (his pose, his paddle, the winner's garland),
`audio/_race.ts` (the sounds), `festival/_race.ts` "the challenge" (where things
are, the `CHALLENGE` hook) and `festival/_water.ts` (draws it).

- **Where**: two more ngo (his crew purple and gold, the other teal) wait at a
  landing on the great lake's north shore, west of the village beach and its
  judges' pavilion (gangway foot ≈ x −396, z −45): a plank gangway down to the
  inshore boat, mooring stakes, the flag of Cambodia and bunting, seven people
  watching; their lanes (z −28.5 and −21.5) run east from a start line out west
  (x −478, yellow buoys) to a finish by the landing (x −375, red buoys, a
  striped pole ashore, the officials' boat with a white awning). North of the
  four crews' way back (z −6, −14): their heats go on as before (before/after
  pictures in the add-on's report). The four crews, the floats and the night are
  as they were; the challenge's crews go home at night like theirs.
- **Join**: by day (`night` < 0.42), the festival on, on foot at the gangway's foot:
  `E  Join a racing boat` (once a visit, within 95 m of the landing, a toast tells
  the way). He walks down the plank and onto a thwart of his own behind the
  last pair, port side, a paddle in his crew's paint across his lap; a fade
  and the two boats lie at the start.
- **The race**: the drummer beats three ("Ready…", 3, 2, 1: tapping along costs
  nothing), the whistle and "Go!" on the fourth, then Space, E, the pad's ✕ or □,
  or a tap on the drum (bottom right) on each beat. Marks: perfect within 60 ms,
  good 120, early or late 200, else off the beat (a beat with no press is
  missed). The crew rows when he does (their stroke clock is pulled onto his
  presses) and as hard as his form; a stroke on the beat surges the boat,
  off the beat drags it. The beat quickens half way ("Faster!") and for the
  last fifth ("Push!"). The other crew keeps a steady pace, a little varied: a
  good player wins by a few boat lengths, a careless one loses (rules and
  numbers: `_raceRowGame.ts`). The course bar (top) shows both boats and the
  metres to go; the gold ring closes on the drum on the beat; marks and the run
  of beats on time over and beside it. The key help (bottom left, `keys()`) shows
  "Space E  paddle as the drum strikes" while racing, "Space  race again · E  step
  ashore" at the result (E only after dusk), and Q R to look round (the pad's ✕ □
  and right stick with a pad).
- **The finish**: the officials raise the flag and blow the long whistle, the
  landing's people and the beach cheer; the boats coast on and the result
  comes up. Won: his crew stands up cheering, the chhing ring, 10 000 ៛ into
  his purse (`purse.earn`) and a garland of marigolds and jasmine round his
  neck for five minutes of roaming. Beaten: heads down, the other crew
  cheering. Space races again (not after dusk: `night` ≥ 0.45), E steps ashore at
  the gangway (a fade). Esc asks "Back to the map?" as ever (the race waits
  while it asks); the festival ending mid-race brings him ashore with a toast.
- **Camera**: low over the water on his side (the shore's), beside him at the
  start, alongside and a little ahead while racing (his face, his paddle, the
  other boat beyond; the afternoon sun stands in the south-east, so it does not
  look down the course), beside him at the result under the card. A drag
  turns it; it comes back by itself after a moment.
- **Timing**: by the race's own clock (seconds), a key's own moment
  (`keydown` timestamp), the drum put on the audio clock where its beat falls
  (`getOutputTimestamp`), 0.2 s ahead, never a whole beat: checked in GPU
  Chromium at 120 and 30 frames a second (`battery=1`), every drum on the clock
  ahead of its moment.
- **Calendar**: event `boatrace` ("The boat races", kind festival): by day during
  the Water Festival, at the landing.
- **URL** (checks; with `fest=water&roam=walk&at=…`): `race=join` (in his boat at
  the start, the count about to begin), `race=row:<0‥1>` (on the course there;
  `racephase=<0‥1>` holds his stroke), `race=win|lose` (the result), `raceauto=<0‥1>`
  (the race plays itself: 1 every beat dead on, 0.3 careless), `racehold=1` (the
  race stands where the URL puts it, on the live page too), `rcam=yaw,pitch,dist`
  round his boat's heading. `report()` gives `fest=water&race=…`.
- **Shared edits**: `people/_personModel.ts` `Crowd.reseed(i, seed)` (a crew's
  stroke seed every frame without dressing them again), `festival/_boats.ts`
  `halfBeam` / `sheer` exported. The challenge's 52 people are the festival
  crowd's last and are drawn only within 300 m of the landing or while he races.

### Pchum Ben and Visak Bochea

Two more festivals at the village pagoda (part `festival`): `festival/_pchumBen.ts`,
`festival/_visak.ts`, what they share in `festival/_circuit.ts` (the way round the
hall, `PROCESSION`: no three.js), `_pagodaLine.ts` (the line of walkers), `_pagodaScene.ts`
(those who sit), `_pagodaFolk.ts` (dressed for the pagoda), `_pagodaDecor.ts`; the
add-ons `roam/_pchumBen.ts` (id `pchumben`, words `pchum…`) and `roam/_visak.ts` (id
`visak`, words `visak…`), what they share `roam/_procession.ts`; his posture and
what he holds `character/procession.ts`; sounds `audio/_pchum.ts`, `audio/_visak.ts`.

- **When** (`festival/_schedule.ts`, the one rule the part, the banner and the
  calendar use): **Pchum Ben** (បុណ្យភ្ជុំបិណ្ឌ) is the moon's waning half whose last
  day (Pchum, the new moon) falls in late September to mid-October at the real pace
  of the moon through the year (`pchumBenAt`, `pchumDay` its last and biggest day);
  **Visak Bochea** (បុណ្យវិសាខបូជា) the days round the full moon of Pisakh, late April
  to May (`visakAt`). On the real days as the map opens (checked against the Khmer
  calendar, roam/_calendarKhmer.ts, 1995‥2060: within a day, but for three years);
  in the map's quick year (24 days of the cycle, the moon 29.5) Pchum Ben about one
  year in two (median gap one map year, 2.4 h of play), Visak Bochea one in five, as
  the Water Festival (it is one full moon: the calendar's "Wait for it" gets there).
  Both go by whole days of the map (afternoon to afternoon: the season the day began
  with, `festivalAt(season, day, clock)`), so a festival day always has its night's
  procession or its walk before dawn. A shot that sets neither `fest=`, `season=` nor
  `day=` shows none (its default moment would be Pchum Ben's first day).
- **The way round the hall** (pradakshina, clockwise, the hall on the right): on the
  terrace round the hall's plinth — east along the front (over the front step,
  between the plinth and the front seima), down the east side (out round the
  middle seima shrine), west along the back, up the west side; 66 m, a round in 60 s.
  Thirty places in the line, 29 walkers, the free one just ahead of the first (the
  monks lead at Visak Bochea). As the line begins (dusk, the small hours) the walkers
  come up the naga stair one by one; as it ends each leaves at the front step on its
  next round and goes down the stair. Already walking when the festival appears, it
  is there whole.
- **Pchum Ben**: before dawn (clock 0.58‥0.77) people in white blouses and dark
  sampot with the white sash (men in white shirts) walk round with lotus, incense
  and a candle between their palms (a halo of candle light on each), now and then
  turning out to the left and throwing a small rice ball (bay ben) into the dark
  (they fall on the terrace or over its wall, lie a while); a grandmother with a
  tray of rice balls stands at the top of the naga stair; the monks' chant for the
  dead comes from the lit hall. Morning to early afternoon: four monks on a red
  carpet on the porch, a family kneeling before each with tiffin carriers (chan
  srak), one holding out the tray; families on mats on the terrace with their
  tiffins (two more mats on Pchum itself), oil lamps on the mats in the evening.
- **Visak Bochea**: the full-moon night (clock 0.23‥0.74): the candle procession,
  three monks leading, the chant moving with them; the candle trays either side of
  the hall's door full of lit candles. By day two monks on the porch, people
  kneeling before the hall with lotus and incense, others on mats.
- **Both**: the flag of Cambodia (three towers) and the Buddhist flag at the
  terrace's front corners, strings of small coloured lights to the porch, oil lamps
  along the front balustrade, the hall lit. The banner (`festival/_banner.ts`): a
  tiffin carrier for Pchum Ben, a lotus and candle under the full moon for Visak
  Bochea (every festival's ribbon and roaming toast now fit phones and tablets: no
  wider than the screen, one line on a short one, and moved below any control they
  would cover); the calendar lists both (`registerEvent` in the add-ons: id `pchumben`,
  `visak`, kind `festival`, at the pagoda; real days: Phatrabot's waning half to the
  1st of Assoch, the full moon of Pisakh).
- **Joining** (`_procession.ts`): near the line (2.6 m from the way) or the elder by
  the stair (3.4 m), on the terrace, while every walker is on the way: Pchum Ben
  "E  បោះបាយបិណ្ឌ / Throw bay ben", Visak Bochea "E  ចូលដង្ហែប្រទក្សិណ / Join the
  procession". His place is the nearest in the line (never ahead of the monks): the
  walkers behind step back to make room, and whoever is beside him (the grandmother
  when he is by her: her words in the toast) hands over what they carry. The way
  leads him in his place at the line's pace (no steering; the look drag and the
  wheel move the camera). The camera keeps to the open side: behind him and out to
  his left, over the terrace's open strip and the balustrade, high enough to look
  over the seima shrines and the stupas (never among the hall's pillars); stepped
  out, straight behind him as he faces the hall. The walkers the camera sees through
  (the near fade) take their candle's halo with them. His meshes (the thrown rice
  balls, his candle's glow, the candle he places) are made the first time they are
  needed: a page that never sees these festivals links none of their programs.
- **Pchum Ben's add-on**: a little basket of five rice balls in his right hand; E or
  Space throws one ("E  Throw a rice ball (n left)"): he takes it from the basket,
  draws back by his ear and casts it out to the left, into the dark (it falls and
  lies a while). After the last he steps out to the left of the way (clear of the
  seima, the stupas and the pavilions), turns to the hall, joins his palms (the
  sampeah): "Sathu! May the ancestors receive this merit".
- **Visak Bochea's add-on**: a candle (lit), three incense sticks and a lotus bud
  held together before his chest, his head a little bowed. Rounds are counted at
  the front step ("Round 2 of 3", the first once he has walked half way round);
  after the third he leaves the line there, goes up onto the porch to the tray east
  of the door, sets the candle in its sand and lays the lotus by it (it stays lit
  there while the festival lasts), kneels and bows three times (the prayer, `pray`:
  the hat comes off, the bell at the first bow), and "Sathu! May you be at peace".
- **Leaving early**: E ("Step out of the line", Visak Bochea) or the stick pushed
  away and held half a second: he steps out to the left, his hands empty. Esc (back
  to the map), a new mode, or the festival going away: out at once.
- **Sounds**: `visakChant` (the homage and the three refuges) and `pchumChant`
  (the verses of impermanence, Aniccā vata saṅkhārā…): the recorded monks
  (audio/chants.ts, near and far blended by distance), or until they load chanted
  in Pali as the dawn chant is synthesized (audio/temple.ts), rendered once off
  the main thread into a loop; heard from where the monks are (Visak Bochea: the line's head; Pchum Ben: the hall
  while they walk, the porch in the morning); `visakGive`, `visakPlace`,
  `pchumGive`, `pchumToss`.
- **Cost**: built with the festival part (lazy, when one is near: main.ts LATER
  `festival`); each its kit (one draw, one for shadows) and glow (one additive draw,
  the walkers' halos moved each frame), the crowd shared with the other festivals
  (56 / 42 people, within the Water Festival's 166), the rice balls one small
  instanced draw; ≈ 0.1 ms a frame of CPU.
- **URL**: `fest=pchumben|visak` holds one (`clock=0.7` before dawn, `clock=0.5`
  the night); `festline=1|0` (checks) the line walking or not at any time of day.
  `procession=1` (or `walk:<rounds done>`) puts him in Visak Bochea's line near
  `at=`, `procession=join` as it is handed over, `procession=place` kneeling at the
  tray; `bayben=1` (or `<n>` left) in Pchum Ben's, `bayben=throw` a ball just away,
  `bayben=thanks` stepped out, palms joined. The bug report gives them back. E.g.
  `fest=visak&clock=0.5&roam=walk&at=-299.4,100&yaw=180&procession=1`,
  `fest=pchumben&clock=0.7&roam=walk&at=-297.8,100.5&yaw=180&bayben=throw`,
  `fest=visak&clock=0.5&roam=walk&at=-309.6,92.95&yaw=270` (by the elder: the prompt).
### The equinox sunrise

Twice a year (about 20 March and 22 September) the sun comes up right behind
Angkor Wat's central tower seen from the causeway in front of it, and people
gather before dawn to watch.

- **The sun follows the year** (`sky/_equinox.ts` `riseBearing`, used by
  `sky/palette.ts`): the dawn sun comes up on the temple's axis (x = 0, its
  east the map's −z) at the equinoxes, up to 24° left of the central tower in
  June and as far right in December (Angkor's 13.4° N: sin = sin(declination) /
  cos(latitude)). Each morning keeps its own rising point (a map day is a
  fortnight of the year, so it steps from morning to morning; the equinox
  morning's is exactly on the axis); the morning path is turned by it from the
  art's (`morning`: none in the afternoon, at dusk and in the night's first
  half, so those keep the art's look), and round the axis it climbs a little
  higher (`ridgeLift`) to clear the far ridges behind the tower. The key
  light, the haze's glow and the sky's disc follow the sun. A still that names
  no time of year (no `season=`: main.ts's stand-in 0.45) keeps the concept
  art's dawn exactly (the sun behind the right-hand towers: mid-October's).
- **The equinox morning** (`equinoxMorning`): the morning whose dawn is within
  half a map day of an equinox (one each, every 12 map days). From `GATHER`
  (clock 0.55) about 25 people come up the road's last stair and wait
  (`people/_sceneEquinox.ts`): a row sitting along the west reflecting pool's
  edge and more standing behind, two photographers at tripods, a few along the
  causeway's balustrades (its middle free), three monks and a Khmer family on a
  mat east of the road. At the first light (0.735) they stand with phones and
  cameras up; as the sun reaches the tower top (0.752) a soft gold halo crowns
  the tower (`roam/_equinox.ts`: a billboard behind the spire, seen wherever
  the sun stands behind it), they go "ooh" and the shutters click
  (`audio/_equinox.ts`: `equiOoh`, `equiShutters`, by how near the crowd is);
  the halo goes by 0.815, they go back down the stair from 0.84 (all gone by 0.99).
- **While roaming**: a toast on the eve (the afternoon, dusk or night before:
  "Tomorrow at dawn…", after midnight "This dawn…"), and at the moment if he
  is within 260 m ("…raise your camera (4)" on the causeway). The follow
  camera cannot see that high from the pad, so his camera raised there from
  `GATHER` until the halo goes comes up aimed at the tower top
  (`aimOnRaise`; not when a check's `pview=` aims it). A photo of it from
  the causeway or the pools' edge (his camera on the tower top, or a selfie
  with his back to it) while the halo is up gives the passport's **Equinox
  sunrise** stamp, in its new section "Rare moments" (`_bookData.ts`
  `moments`, motif `equinox`; given by `Journal.award`, never for walking
  near).
- **Calendar**: event `equinox` (kind `rare`, at the causeway), on from 0.55 to
  0.84 of an equinox morning (`equinoxOn`, the rule the crowd plays by), with
  the real dates in Cambodia (`real`: the equinox day and one either side).
- **Keys**: none of its own (the camera 4, the selfie 5).
- **URL**: `equinox=1` holds an equinox dawn (the sun on the axis, the crowd
  and the halo by `clock=`: 0.7 waiting, 0.76 the moment, 0.8 the sun off the
  tower), `equinox=0` none. On the live page (no `shot=1`) `clock=` holds
  only until Start, then the clock runs on from there (main.ts
  `clockRunsFrom`), so `equinox=1&clock=0.7` plays the morning: the sun
  reaches the tower about 20 s after Start. `season=0.44` / `0.93` are the equinox mornings,
  `season=0.18` (June) and `0.69` (December) put the sun left and right of the
  tower. In a bug report `equinox=1` comes back while it is on. Checks:
  `@index.html?shot=1&ui=0&equinox=1&clock=0.76` (the overview),
  `roam=walk&at=-22,-160&yaw=156&tool=camera&pview=156,42,50&sim=_:1,c:0.1,_:1.5&equinox=1&clock=0.765`
  (his photo of it from the pool's edge, the stamp's toast),
  `people=equinox` (only the crowd); the halo needs `foreground` in `parts=`
  (roaming's group), the crowd `people`, the far ridges `clouds`.
