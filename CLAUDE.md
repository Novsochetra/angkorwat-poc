# Angkor Heritage — notes for Claude

- Checks: `npm run typecheck`, `npm run build`, `npm run playtest` (headless play test),
  `npm run perf` (the world map's frame cost per view and graphics level, on the
  GPU: `scripts/perf.mjs`; `only=`, `levels=low,medium,phone`, `ablate=<part>`, `out=`).
- `npm run shots -- name="@game.html?shot=1&…"` renders a page headlessly into
  `screenshots/<name>.png`; view the PNG to check visual changes.
- `npm run video` records the 15 s promo of the world map (`scripts/promo-cut.mjs`:
  its shots, cameras, title, sound) into `screenshots/promo.mp4`, on the GPU,
  frame by frame (`__videoFrame`, `video=1`). `npm run video -- preview` makes
  3 stills a shot; `only=<shot>,…` redoes those shots. Promo words say the
  game is playable now (never "coming soon").
- `npm run wallpaper` draws the saved views and flights of the free camera
  (dev server only: see "Free camera and wallpapers" below) into `wallpapers/out/`.
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
  scenes). Walk it at true scale with `game.html?level=kit`.
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
   (`npm run shots -- repro="@game.html?shot=1&at=…&cam=…"`), fix, and re-run it
   to compare. Then run the checks.
4. Delete the report's folder in the commit that fixes it, and name the report
   in the commit message.

## World map screen (`index.html`)

The entry page: `/` opens it (the real-scale test level is `game.html`, not
linked from the map while `SCENES_OPEN` in `src/map/layout.ts` is off: every
place is "coming soon", no "Begin expedition", no "E  Enter …").

The expedition picker: a voxel diorama of the Angkor highlands (Angkor Wat,
Bayon, Preah Khan, Ta Prohm, Phnom Kulen, River Gate) with pin cards, sound
and day/night. Code in `src/map/`; the guide for its parts (API, budgets,
checks, which file does what) is `docs/map-work/BRIEF.md`. Target look:
`assets/world-map-selection-screen/` and `assets/2B06F1FD-531A-4ED7-9C2E-7044E141F122.PNG`.

- Search and share: the words are in `index.html`'s head; the address
  (`SITE_URL` in `.env`), share picture, JSON-LD, `robots.txt` and
  `sitemap.xml` come from `src/seo/vitePlugin.ts`. The share picture
  `public/og-night.jpg` is the map at night with its pin cards: a JPEG,
  1200×630, under 600 KB (WhatsApp shows no bigger picture), with no dev
  buttons. A new night shot without the cards: `SHOT_W=1200 SHOT_H=630 SHOT_OUT=public npm run shots -- og-night="@index.html?shot=1&night=1&ui=0&graphics=high"`,
  then `sips -s format jpeg -s formatOptions 82 public/og-night.png --out public/og-night.jpg`
  and delete the PNG. The tab icon `public/favicon.svg` is the loading screen's temple.
  The map's bug report (B) and block look panel (K) are on the dev server
  only: a build shows neither.
- The corner (top right) has three buttons: the coffee, the heart, the gear.
  The coffee asks "Support the game" (`ui/_support.ts`, `uistate=support`):
  its gold "Buy me a coffee" opens `SUPPORT_URL` (`src/map/ui/credits.ts`)
  in a new tab; the same button tops the About page. Credits: the heart
  opens the settings panel on its About tab; the names are `credits.ts`
  (`uistate=credits` in shots). Cards that ask ("Back to the map?", the
  coffee) are `ui/ask.ts`, their look `.mu-ask` in `ui/map.css`.
- Settings panel (the gear): five tabs, one page each, so it is only as tall
  as the page you are on and the map stays in view. **General** (language,
  time of day, weather, moon), **Sound**, **Graphics** (graphics level, resolution,
  fog: one slider, its thickness, battery saver), **Play** (mini-map, key help, easy flying, reduce
  motion), **About** (support the game, our story, the credits). The bar is
  `ui/_tabs.ts` (a `tablist`: ← → Home End, one gold thumb that slides); the
  pages are `#mu-set-page-<id>` in `ui.ts` (`TABS`), and the body's height
  follows the page (`--mu-page-h`, eased in `map.css`). The gear opens the tab
  last used, the heart opens About. A choice with an automatic mode has it as
  a chip by its heading (`.mu-auto`: time's Cycle, weather's By season, Auto
  for graphics and resolution), the fixed choices under it. A new
  setting goes on the page it belongs to (markup in `ui.ts`, words in
  `lang.ts`). Shots: `uistate=settings,tab:<id>` (`general`, `sound`,
  `graphics`, `play`, `about`); `scroll:<group>` shows that group's tab;
  `fog:<0‥150>` puts the fog slider there (the map's own fog: `fogamount=0‥1.5`).
- Where things are (places, mesas, rivers, roads, cameras): `src/map/layout.ts`.
- Words: Khmer first, English on the language choice at the top of the
  settings (the story has its own ខ្មែរ / EN). The word list is
  `src/map/ui/lang.ts`; place texts are in `layout.ts` (`km`). Add `lang=en`
  to a shot for English.
- **Khmer, not Thai**: everything must read Khmer (the player checks). Stupas are
  Khmer chetdei (a stepped square base and an Angkor lotus-bud tower, or four Bayon
  faces: `sacred/stupa.ts` `form: 'tower'|'faces'`), never a round bell with a ring
  spire; Buddhas have a lotus-bud ushnisha, never a flame; naga are cobras with a
  smooth fan hood; the flag of Cambodia has three towers (five is the 1979–89
  flag); spirit houses are tiny Angkor towers; houses have no Thai gable horns;
  apsara wear the three-spiked mokot; signs in Khmer script (Koulen pixels).
- Esc while roaming asks first ("ត្រឡប់ទៅផែនទីវិញ?": `roam/_leave.ts`; Enter
  leaves, Esc again stays; `leave=1` in shots). The walker's walk-map rules
  (stairs, thin walls, no perching on sills) are in BRIEF.md "Roaming";
  `thinwalk=0` / `perch=0` turn the newer rules off to compare.
- Look at it: `npm run shots -- m="@index.html?shot=1"` (1672×941 with
  `SHOT_W=1672 SHOT_H=941`); add `night=1`, `focus=<place>`, `ui=0`,
  `parts=terrain,water` (only those parts), `uistate=hover:<place>`,
  `loading=0‥1` (hold the loading screen there: Angkor Wat `ui/_loadTemple.ts`,
  the explorer below the bar `ui/_loadHero.ts`; nothing is built; at 1 its
  gold button shows).
- Built, the loading screen stays until its button ("ចាប់ផ្ដើម" / "Start",
  `loadGo` in `lang.ts`) is pressed: that click turns the sound on (browsers
  play none before a click), then the story (first visit) or the map shows
  (`mapReady` / `enter` in `src/map/main.ts`).
- The console line `[map] built in …` lists build times and blocks per part,
  and names any part that failed (the rest of the map still loads);
  `[map] shaders compiled in N ms` follows. `window.__frame` is the live
  frame. Parts spread over the map cull per place (`src/map/cull.ts`).
- Roaming (Jump in: pick parachute or hang glider, then walk, boat, hang
  glider from cliff-top ramps; Q / R or a drag orbits the camera):
  `src/map/roam/`. Easy flying (glider and balloon hold their height, S climbs,
  W dives) is a setting (`roam/prefs.ts`); the Cambodian flag helper is `roam/_flag.ts`.
  A hot air balloon lies deflated on its field below Angkor Wat
  (`roam/balloon.ts`: E rides it, the fan fills it, then the burner stands
  it up; with easy flying it flies like the glider: cruises forward, A / D
  turn, S / Space climb (the burner), W descends (the vent), Shift fast,
  hands-off it holds its height; easy flying off: the real balloon, burner,
  vent and wind; E lands and steps out; `balloon=parked|inflate:<s>|up` in shots).
  Check it with `roam=leap|glide|walk|boat|hang|balloon&at=x,z&yaw=<deg>&sim=w:2,wr:3`
  (scripted keys run before the shot) and `rcam=yaw,pitch,dist`.
  On foot he has tools (1–5: lantern, torch, flashlight, camera, selfie with
  a selfie stick (T); `tool=`, `stick=` in shots; camera and selfie also in
  the boat and on the glider), emotes and photos (`roam/tools.ts`, `roam/photo.ts`),
  the Explorer menu (I, or the face button on the tool bar: moves, outfits
  and faces for a mouse or a finger; `roam/_explorerMenu.ts`, `menu=1` in shots,
  `touch=1` for the touch layout),
  sits (J) or lies down (L) to watch the sky (`roam/_rest.ts`, poses in
  `src/character/rest.ts`: he puts his pack down beside him; the camera comes
  down low and looks up; lying still 12 s he falls asleep, eyes closed and
  a "Z z z"; J / L again, the stick or Space gets him up; `act=sit|lie|sleep`
  in shots, viewer `anim=sit|lie|sleep`),
  kneels to pray at a shrine with E ("E  Pray" in front of one; a golden
  lotus glows on the floor where he kneels, `roam/_prayMark.ts`; he walks
  onto it, turns and kneels: `roam/_pray.ts`, spots in `roam/_worship.ts`;
  `act=pray`, `kneelat=x,z,fx,fz` in shots),
  and a mini-map (`src/map/ui/minimap.ts`, M for the big map, N the nearest
  glider ramp; the Mini-map setting: show, only its "Map" button, or hide,
  `minimap=show|button|hide` in shots). The key help bottom left has a
  setting too (Key help; `keyhelp=0` in shots; ? still lists every key).
- Sound: a Sound on switch and one volume per bus in the settings (`VOLUME_KEYS` in `src/map/types.ts`);
  footsteps are the recordings in `assets/sound/` (`src/map/audio/footsteps.ts`).
  Back on the page, a phone may hold the sound until a tap: a card in the
  middle asks for it (`onHeld` in `audio/audio.ts`; `uistate=held` in shots).
- Game pads (a PS5 DualSense, Xbox, most others) play the whole map:
  `src/map/pad/` (the core `pad.ts`, the button pictures `glyphs.ts`, focus
  moving `nav.ts`); the guide is BRIEF.md "Game pads". A menu that opens
  takes the pad with `pad.openLayer`; a key shown as `<kbd data-pad="west">E</kbd>`
  shows the pad's button while the pad is in use. `pad=ps|xbox` in a shot
  draws the pad's buttons; `npm run padtest` plays it with a fake DualSense.
- Graphics is a setting (auto, low, medium, high, max: what each draws is in
  `src/map/graphics.ts`; it changes live); add `graphics=<level>` to a shot
  (auto is medium in shots), `phone=1` to act as a phone (auto starts on
  low, 30 frames a second).
- Weather is a setting too (by season — dry December–April —, clear, rainy,
  stormy, and snow: a dream, only when picked; flakes and the white cover in
  `src/map/sky/snow.ts`, snowmen in both villages): the schedule is
  `src/map/sky/weather.ts`. Shots are calm; add
  `weather=season|rainy|stormy|snowy&t=<s>` (with `season=`) for a schedule, or
  `weather=rain|storm|rainbow|snow` to hold one (`snowtop=0`, `snowmen=0`).
- The moon's path is a setting too (General → Moon, under the weather):
  low over the northern hills (the default, the concept art's: hills can
  hide it) or high, across the sky (up in the east as night falls, high over
  the south at midnight, down in the west; its light comes from where it is,
  so no hill hides it for long). Paths and key light: `src/map/sky/palette.ts` `moonPath`;
  `moonpath=high|low` in shots, `uistate=settings,scroll:moon`.
- Animals: land (`src/map/fauna/land.ts`) and water / air
  (`src/map/fauna/waterAir.ts`, lake and paddy birds `_waterLake.ts`); their
  calls go through `MapFrame.calls` to `src/map/audio/animals.ts`. In rain
  birds stay perched and people open umbrellas and hurry (`src/map/events.ts`).
- Rice paddies by the great lake and by the sugar-palm village follow the year
  (`season=0‥1`, also their colour on the mini-map): the stages are in
  `src/map/paddies/stages.ts`, the part in `src/map/paddies.ts`; the rice is
  clumps of thin blades near, fans farther (`paddies/rice.ts`, two draws).
- Palms: real sugar palms (thnot) and coconut palms from one module,
  `src/map/veg/palms.ts` (`palms=near|far`, `palmstats`).
- The jungle: trails to 13 hidden sites (`JUNGLE_SITES` in `layout.ts`):
  ruins and shrines (`src/map/jungle/ruins.ts`), the monk's hut,
  woodcutters, swing, bridges, pool (`jungle/camps.ts`), undergrowth
  (`veg/undergrowth.ts`) and jungle animals (`fauna/jungle.ts`,
  `fauna=jungle` lines them up).
- Festivals (`src/map/festival/`, when `festival/_schedule.ts` says, or
  `fest=water|newyear|pchumben|visak`): the Water Festival with Khmer ngo racing
  boats (never dragon boats), Khmer New Year, and Pchum Ben and Visak Bochea at the
  village pagoda. A shot with none of `fest=`, `season=`, `day=` shows no festival.
- The album (V) also holds the nature book and the temple passport
  (`roam/_book*.ts`; `album=book|passport`, `book=all`, `stamps=all`);
  hidden gold figures are in `src/map/treasure/`.
- The floating village on the great lake (stilt houses, floating houses, the
  jetty, the pagoda): `src/map/village/`; where everything stands (and
  `VILLAGE_SPOTS` for people and festivals) is `src/map/village/_spots.ts`.
- Sacred things (Buddhas, stupas, offerings, the pagoda's gables) are
  sculpted smooth meshes, not blocks: `src/map/sacred/` (distance shapes
  `sdf.ts` → mesh `sculpt.ts`; Buddhas `buddha.ts` from `_buddhaHead/Body/Throne.ts`,
  sculpted in a worker; gold, stone and cloth `finish.ts`; Khmer ornament
  painted on canvas `kbach.ts`). Look at one alone:
  `npm run shots -- b="@sacred.html?piece=buddha-pagoda"` (names in `*.pieces.ts`).
  Worship spots are `roam/_worship.ts`; kneeling brings the camera down
  behind him (`roam/_pray.ts`). Walk shots need `foreground` in `parts=`,
  and `at=x,y,z` indoors (two values stand him on the roof).
- People (`src/map/people/`): monks, a tour group, fishermen, an ox cart,
  kites (children, and families flying khleng ek that hum over the east
  fields: `_sceneKites.ts`, `_kite.ts`; `people=kites&season=0.9`), farmers by
  the season, village life, apsara dancers at night, and the new places'
  people (below); `people=lineup|0|<scene>,…`, `fish=`, `cart=` in shots. Hats are
  the Khmer palm-leaf hat or a krama (never a conical hat). One crowd for all,
  posed by a bone pass once a frame (`_personModel.ts`; `pbones=0` the old way).
- The map is x −600‥760, z −800‥120 (`MAP_BOUNDS`); the roaming area is two boxes
  (`terrain/views.ts` `inRoam`). The Kulen stream falls in three falls into a
  pool by the picnic place.
- New places (`src/map/hamlet/`, one piece each, spots in `layout.ts`): the
  sugar-palm village on the east (`_ev*`), its morning market (`_mk*`), the palm
  sugar family's yard with the tapper on his bamboo ladder (`_ps*`, `tap=<s>`),
  the Kulen falls picnic place (`_kn*`), the hamlet behind Angkor Wat with its
  market (`_bh*`), and the floating village's heart and Tonle Sap market
  (`village/_fv*`). The reclining Buddha on Kulen is `landmarks/_kulenBuddha.ts`
  (`sacred.html?piece=buddha-reclining`). Their people are `people/_scene*.ts`.
- F greets: a sampeah (to a monk or an elder, palms to the face), or a wave to
  visitors and children; people who see him greet back, monks nod
  (`roam/_greet.ts`, `people/_greetBack.ts`; `act=greet`, `sim=f:0.1,_:1`).
- F in a calm boat fishes (`roam/_fishing.ts`; five Khmer fish fill book pages;
  `fishing=wait|bite|catch:<kind>` in shots).
- Buying: E at a stall opens the buy menu (riel; a purse topped up each dawn):
  shops register in `src/map/shop.ts`; the flow is `roam/_shop*.ts`, the seller
  hands it over (`people/_saleBack.ts`), he eats or drinks it
  (`src/character/meals.ts`, key 6 for what he keeps). Shots: `shop=<id>`,
  `shopbuy=<item>`, `bought=<item>`, `kept=<items>`, `purse=<riel>`,
  `act=eat|bite|drink&food=<kind>`.

## Things to do while roaming (add-ons)

The ideas picked from `docs/ideas.md` (October 2026) are roaming add-ons: the
contract is `src/map/roam/_addons.ts`, one loader line each in
`roam/_addonList.ts` (they load after Start in chunks of their own; shots and
`roam=` pages load them first; nothing else may import an add-on's module). The
guide, with every add-on's keys and URL values for shots, is
`docs/map-work/addons.md`: read its section before changing one.

- Shared with them: saved progress `src/map/progress.ts` (`angkor-map-progress-v1`;
  shots and `progress=0` save nothing), riel (`purse.earn` / `pay`), the map's
  time `src/map/time.ts` (`TIME.skipTo`: "Wait for it", sleeping), the calendar
  of events `src/map/calendar.ts` (whatever happens at a time registers there
  with the rule it plays by), their sounds `audio/addonSfx.ts`, keys 7
  binoculars, 8 umbrella, 9 calendar, 0 call the dog.
- The calendar (9, the button under the mini-map): now, today, festivals ahead
  with their real-life dates (the Khmer lunar calendar: `roam/_calendarKhmer.ts`),
  "Wait for it", a toast as each begins, gold marks on the maps (`calendar=1`).
- Ways to move: bicycles (`bike=ride`), the ox cart (`cartride=1`), the water
  buffaloes (`buffalo=ride`), the jungle zip line (`zip=<n>:<0‥1>`), the sugar
  palm ladder (`palm=top`).
- Village life: hammocks (`hammock=1`), dak bat at dawn (`dakbat=1`), a monk's
  blessing and the red string in the village pagoda (`bless=1`, `redstring=1`),
  a lotus picked from the boat and offered at a shrine (`lotus=pick|offer`),
  monkeys stealing his snack (`monkey=steal`).
- Fun: his own kite (`kite=fly`), helping the farmers (`farm=plant|reap`), the
  Water Festival boat race (`fest=water&race=join`), kick the sey (`sey=1`).
- A friend and a home: the dog (`dog=follow`), his stilt house at the
  sugar-palm village's north-east edge (`home=1|sleep`), his name in Khmer
  letters (`name=<latin>`; `src/map/khmerName.ts`).
- Small things: the umbrella (`umbrella=1`), binoculars (`bino=1`), people
  posing for his camera (`smile=1`), selling his fish (`fishbasket=`,
  `sellfish=1`), clothes from the market (`wear=`, `clothes=1`).
- Rare moments: the equinox sunrise over Angkor Wat's central tower
  (`equinox=1`); the dawn sun's rising point swings with the season
  (`sky/_equinox.ts`).
- Shaders of people and animals stay quick to compile on slow drivers: tables
  and one call site, never chains of `if` (commit b250279).

## Free camera and wallpapers (dev server only)

`` ` `` (or the 📷 button beside 🐞 Report) opens a camera that depends on
nothing (`src/map/dev/freecam.ts`): the interface goes, the explorer's keys stop,
and it flies anywhere over the map, from the overview or while roaming (the
explorer stays where he is). Drag looks, W A S D fly along the view, Q / E (or
Space) go down / up, Shift is fast, the wheel sets the speed, a trackpad pinch
zooms, F freezes the scene's time, H hides the panel, ? shows the keys (they show for
the first 15 s), Esc leaves.

The panel is at the right; the frame (the picture's shape: a desktop, 5K, 8K, an
ultrawide, a phone, an iPad, custom; a thirds grid) fills the room left of it, so
the panel never covers the picture (the camera's centre is the frame's: a view
offset, `placed()` after roaming, which clears one). From the top: **📸 Take
picture (V)**, **● Record video (R)**, **🔁 Loop video**, the name (empty: made
from the place in the frame and the time, "angkor-wat-night"; a typed name that is
saved already is replaced: the button says so), the status with a progress bar;
Frame (size, zoom, speed); Moment (time chips Game / Afternoon / Sunset / Moonrise /
Night / Moonset / Dawn and a slider, the moon's phase, the moon's path chips Game /
Low / High, fog chips Game / None / Light / Normal / Thick
and a slider, weather chips, freeze, explorer: shown while roaming unless unticked); Video settings (folded); the gallery: every picture and
video with its thumbnail (ffmpeg, `wallpapers/out/.thumbs/`), newest first; a
click picks one (Go there, Draw again, Open, Finder, Forget), a double-click goes
there. Go there puts back the camera, the moment, the frame and the explorer
where the picture has him (roam.ts `placeFrom`: his mode, at `at=`, posed), and a
picture's time stands still. Checks: a Playwright script in GPU Chromium (headless) with the saving
endpoints stubbed (the user's `wallpapers/` is theirs), controls by role and name
(`getByRole('button', { name: 'Night' })`, `.fc-tile`).

- **V** saves the view into `wallpapers/views.json` and draws it at once; **R** records a
  flight (`wallpapers/paths/<name>.json`), drawn when it stops. One draw at a time, the
  next waits its turn. `npm run wallpaper` (`-- flights` adds the videos, `-- only=a,b`,
  `-- list`; `scripts/wallpaper.mjs`) draws them headless on the GPU: a picture
  `wallpapers/out/<name>.png` (4K in about 11 s, 8K in about 15 s), a flight `<name>.mp4` (frame by frame
  into ffmpeg, as `npm run video`). What is drawn is not kept in git.
- The picture looks like the frame did: `screenH` (the frame's height in drawn pixels,
  saved with it) gives `pxscale=` (the picture's height over it: the glow and the
  fireflies are drawn as big for it), and the explorer is where he was: a shot that
  starts him roaming without `sim=` lets his mode settle first (on the hang glider, the
  wing over him), ending at `at=`; a video's warm-up frames move him on, so it passes
  `lead=1.5` (roam.ts).
- **Video for a live wallpaper.** By default **R** flies a recorded flight back to its start, so it is a
  loop; the panel's "Video" folder also makes a loop from the view (orbit round what you look at, sway, push
  in and out, day and night) and picks the format (HEVC, 10-bit `hvc1`: about 40 MB for 20 s at 4K; H.264 plays
  everywhere) and whether it is drawn as soon as it is saved. A loop (`loop: true` in its path file) repeats
  with no jump: the camera comes round to where it began, but the world (clouds, mist, water) moves on, so
  `scripts/wallpaper.mjs` draws it 1.2 s longer and cross-fades the same view at two times over the seam
  (`seam=0` shows it without). Frames are JPEG (`frames=png` keeps every pixel: about nine times slower at 4K),
  the colours are tagged BT.709, `codec=hevc|h264` and `crf=` are its options. 4K at 30 fps draws about five
  frames a second (20 s in 2 minutes). Any video-wallpaper app plays the MP4 on repeat.
- A saved view is `index.html?shot=1&cam=x,y,z,tx,ty,tz,fov&…` at its size, with the moment
  (`t`, `clock`, `day`, `season`, weather, `moon` when the panel holds the moon's age
  (0 new, 0.5 full; only the sky reads it, `moon=` in any shot), `moonpath` (the moon's path:
  a view saved without one has the low moon), `fogamount` when the fog is
  not the game's own (0 clear air … 1 … 1.5 thick, `fogamount=` in any shot); the explorer's spot when he
  is in it): what the free camera showed is what `cam=` draws. `cam=` takes a seventh value (the vertical
  field of view, degrees) and `explorer=0` leaves him out of any shot. `?freecam=1` opens
  the camera on the first frames (with `cam=`, at that camera).
- The free camera is the overview's, wherever it is: main.ts `step` puts the camera
  (`freeCam`, `videoCam`, `fixedCam`) after the roaming and gives the parts
  `frame.roam = 'overview'`, so the rain, shadows and detail are those of a shot.
- The land is built with big blocks past the roaming area (terrain/views.ts, where no
  camera of the map goes): the notes under the camera say so when it is out there.
- Dev server only: `import.meta.env.DEV && !shot`, the module loaded by `import()`; its
  plugin (`src/map/dev/wallpaperPlugin.ts`, `apply: 'serve'`, this computer's own pages
  only) keeps the views and runs the render jobs. A build has none of it.

## Native app (`native/`)

Swift + SwiftUI (+ a Metal sky shader) for iPhone, iPad and Mac: only the
loading screen so far, ported cell for cell from `ui/_loadTemple.ts` and
`ui/_loadHero.ts`. Guide: `native/README.md`. Make the project with
`cd native && xcodegen`; build with `xcodebuild -project native/AngkorHeritage.xcodeproj
-scheme AngkorHeritage -destination 'platform=macOS' -derivedDataPath native/build build`.
