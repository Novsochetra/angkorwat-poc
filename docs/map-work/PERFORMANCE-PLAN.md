# World map: CPU / GPU / memory plan

**Status: done, in three phases.** Phase 1 (items 1–4), phase 2 (items
5–8b) and phase 3 (item 9: the build in workers, and pictures of the far
trees on a phone) are done and measured: section 7. What is left is under
"Next steps" at the bottom.

## 1. The problem

On https://morodokangkor.com (Chrome, Mac), sitting on the loading screen
without playing:

| Chrome Task Manager | CPU | Memory |
|---|---|---|
| The game's tab | ~48 % | 1.0 GB |
| GPU process | ~67 % | 1.8 GB |

The machine runs hot, and playing costs about the same.

## 2. What we found

### 2a. The loading screen draws the whole map, unseen

`src/map/main.ts`:

1. The build loop (≈ lines 223–252) builds every part while the temple and
   bar fill in. This is expected, one-time work.
2. As soon as the build ends, the frame loop starts
   (`requestAnimationFrame(tick)`, ≈ line 783). Its first frame calls
   `mapReady()`, which shows the "ចាប់ផ្ដើម" button.
3. From then on, every frame simulates people and animals, draws the shadow
   map and draws the whole map through the post effects, **behind the opaque
   `#loading` screen**. The only pause in the loop is `story?.covered`, not
   the loading screen.

Measured headless (production build, 1440×900 at 2×, 10 s waiting on Start;
software GPU, so the absolute numbers are inflated):

- loading screen opacity 1: none of the map is visible
- canvas 2880×1800 (pixel ratio 2)
- main thread busy ≈ 120 %
- ≈ 97 % of frame time is **rendering**; ≈ 3 % is updates (people are most of it)

The loading screen's own CSS animations (stars, fireflies, walking explorer)
only change opacity and transform. They cost almost nothing.

### 2b. Playing is heavy for the same reason: drawing, not game logic

1. **No frame cap on desktop.** `src/map/graphics.ts`:
   `MAX_FPS = PHONE ? 30 : Infinity`. A 120 Hz MacBook Pro draws up to
   120 frames a second, and the GPU never rests.
2. **A big frame.** The notes in `graphics.ts` put the overview at about
   **10 M triangles**, ≈ 30 ms on an M1 Max at "high":
   - ≈ 570 k blocks (terrain 259 k, trees 164 k, …), most with chamfered
     edges (44 triangles each, 12 for a plain box);
   - a 4096² shadow map of the whole map, redrawn every 3rd frame;
   - on Retina, every pixel of 2880×1800 or more goes through haze, mist,
     bloom, grading and multisampling (HalfFloat targets).
3. **It never rests.** Every frame is fully redrawn, even when the camera and
   most of the scene stand still.

### 2c. Why the memory is high

Everything is built before Start:

- ≈ 570 k map blocks as GPU buffers, plus the roaming walk maps
  (≈ 143 k + 116 k + 201 k blocks) in JS memory (measured in phase 2: the
  block indexes are only ≈ 1.5 MB; the rivers' bank distances ≈ 6.8 MB and
  current ≈ 2.4 MB were most of it);
- things that may never show: 24 000 snowflakes and snowmen, the festival
  boats and crowds (≈ 8 k boxes), rain, rainbow, 174 people, hundreds of
  animals;
- full-size render targets at Retina (HalfFloat + MSAA), and two 4096²
  shadow maps (`atmosphere.ts` swaps between them). Together these are a few
  hundred MB of GPU memory;
- JS heap ≈ 180–360 MB; build ≈ 27 s of CPU headless (much less on a real Mac).

## 3. The three.js manual's techniques: what we already do, what's left

| Technique (three.js manual) | Already in the code? | Worth doing? |
|---|---|---|
| [Rendering on demand](https://threejs.org/manual/#rendering-on-demand): draw only when something changes | No: every frame is drawn | **Yes, adapted.** The map always has motion (water, people, animals, clouds), so "draw only on change" in its pure form would freeze the world. Adapted forms: (a) loading screen: draw nothing until Start; (b) idle overview: when nobody touches mouse or keys, drop to ~20–30 fps, and go back to full speed on any input or camera move; (c) window not focused: very low fps. |
| [Optimize lots of objects](https://threejs.org/manual/#optimize-lots-of-objects): merge meshes / instancing | **Yes, heavily**: `InstancedMesh` in ~50 files, "9 343 blocks in 4 draws", ≈ 590 draws for the whole overview on low | Little left. The cost is **triangles and pixels**, not draw calls. Maybe a later `BatchedMesh` pass for small leftovers. |
| [OffscreenCanvas](https://threejs.org/manual/#offscreencanvas): render in a Web Worker | No (workers are used only to sculpt statues: `src/map/sacred/`) | **Not now.** It moves JS off the main thread, but our cost is on the GPU (≈ 97 % rendering), so the GPU would still be 100 % busy. It would mean moving every part, UI hookup, input and audio into a worker: a big rewrite for a small gain. Workers *are* worth it for the **build** (smoother loading), later. |
| Level of detail (LOD) | **Partly**: terrain in 150 m chunks with near/far block sizes (`terrain/lod.ts`); per-place culling (`src/map/cull.ts`); near/far palms and rice; far people with 57 boxes, not 262; `plainFar` plain boxes far away, **on low only** | **Yes, extend it.** Plain boxes far away on **every** level (chamfers can't be seen far off: 44 → 12 triangles); tighter LOD distances for trees (164 k blocks) on the overview; impostors (flat pictures) for far trees. |
| Frustum culling | Yes: per-place and per-chunk bounding spheres; `ShadowGate` for shadow casters | Check the 52 `frustumCulled = false` meshes (clouds, glows, people…): some may be drawn off screen. |
| Pixel ratio / resolution | Partly: medium drops to ratio 1 only when slow; high/max always 2 | **Yes.** A Resolution setting (Auto + a list of exact sizes, see 3b). Post effects and fog run per pixel, so this is one of the biggest wins. |
| Frame cap | Phones only (30 fps) | **Yes.** Cap desktop at 60 and add a "Battery saver: 30 fps" option. |
| Shadows | Low has "still shadows" (redrawn only when the sun moves); medium/high redraw every 3rd frame | **Yes.** Still shadows on medium too; maybe a smaller shadow map on medium. |
| Dispose / lazy build (memory) | Everything built at load | **Yes.** Build snow, festival, rain and the walk maps only when needed (or after Start, in idle time). |

### 3b. A resolution setting: is it good practice?

Yes. Most PC and console games have one ("Render scale" or "Resolution
scale"), next to the quality presets. The preset picks *what* is drawn; the
resolution picks *how many pixels* it's drawn at. Players on a laptop, or on
battery, often keep full detail and lower the resolution.

How to do it here:

**Owner's choice: a list of exact sizes**, like a PC game's menu.

- **Auto first**, then the sizes, biggest first. Auto is today's behaviour
  (medium drops to ratio 1 when slow). A picked size overrides the level's
  own ratio.
- **The list is made from this screen.** Its top is the screen's own pixels
  (`innerWidth × devicePixelRatio`, not capped at 2); below it, the common
  widths that fit, each with the window's shape. Example, a MacBook
  (2880 × 1800, 16:10):

  | Size | Screen dots per game pixel | Pixels to draw |
  |---|---|---|
  | 2880 × 1800 ✦ | 1 × 1 | all |
  | 2560 × 1600 | 1.125 | 79 % |
  | 1920 × 1200 | 1.5 | 44 % |
  | 1680 × 1050 | 1.71 | 34 % |
  | 1440 × 900 ✦ | 2 × 2 | 25 % |
  | 1280 × 800 | 2.25 | 20 % |
  | 960 × 600 ✦ | 3 × 3 | 11 % |
  | 720 × 450 ✦ | 4 × 4 | 6 % |

  ✦ = a whole step: it looks clean. The menu marks these.
- **Stored as a scale, shown as sizes.** The setting keeps the pick as a
  share of the screen's width (e.g. 1440 / 2880 = 0.5), so it survives a
  window resize or a move to another screen; the labels are worked out
  again each time the menu opens.
- **Sizes between whole steps need an upscale pass.** Today the browser
  stretches the canvas, and `main.ts` (above `MAX_RATIO`) found that 1.5
  on a 2× screen blurs the whole map and lays a fine grid over it. So:
  the scene and post effects draw into a smaller target, and a last pass
  scales it up to the full-size canvas with a good filter (bilinear plus a
  light sharpen). Whole steps can skip the filter and use plain
  nearest-pixel scaling (`image-rendering: pixelated`), which keeps the
  blocks crisp.
- **Low sizes help less and less.** Fewer pixels cut the haze, mist, bloom
  and grading; the ≈ 10 M triangles and the shadow map cost the same at
  every size. Measure each step with `npm run perf`; drop sizes that
  gain nothing. Thin things (rice blades, ropes, far people) may flicker
  at the lowest sizes.
- The **menus, cards and text stay sharp** at every size: they are HTML on
  top of the canvas, not drawn in WebGL.

### 3c. The fog: does it cost?

Yes, and **the same on every graphics level, low included** (`graphics.ts`
has no haze or mist switch). It costs *per pixel*, so it grows with the
resolution (3b). There are three kinds:

1. **Haze inside every material** (`src/map/sky/haze.ts`). Three's fog code
   is replaced in *all* materials with distance haze + valley mist banks +
   wisps + cloud shadows + the sea-of-mist edge. That is about **8–10 texture
   reads and several `exp`/`pow` per pixel** (also for pixels hidden later
   behind others). Cheap next to a separate pass, but it runs everywhere.
2. **Five stacked mist planes**, 9000 × 9000 m each (`src/map/clouds.ts`,
   `LAYER_Y = [10, 14, 18, 23, 29]`). They are transparent, so where they
   cover the screen each pixel is shaded up to **5 more times**. Over the
   land they are clear, but the GPU still runs their shader there.
3. **Mist banks**: soft transparent puffs along the edges and far rings (one
   instanced draw). Overlapping puffs → more overdraw.

(Also some smaller local mist and steam: `hamlet/_bhMist.ts`,
`hamlet/_psSteam.ts`, the 213 waterfall mist puffs in `water.ts`.)

**Owner's choice: a Fog setting, Auto / Full / Light / Simple, with no
Off.** Separate from the Graphics level, like the Resolution setting (3b).

| Step | What it keeps | Cost |
|---|---|---|
| Full | All of it: haze, valley mist banks, wisps, cloud shadows, 5 mist planes, all banks | today's |
| Light | The same haze; 2 mist planes instead of 5; fewer banks | less |
| Simple | Distance haze and the edge mist only: no moving valley banks, wisps or cloud shadows (a cheaper haze shader); 2 planes; edge banks only | least |

- **Auto** follows the Graphics level: low → Simple, medium → Light,
  high and max → Full.
- **No Off:** the mist hides the map's cut edges ("so no cut land shows",
  `clouds.ts`) and far things popping in. Every step keeps the edge mist.
- Simple needs a cheaper haze: the fog chunks in `sky/haze.ts` are set
  once, before any material compiles. Add one shared value to `HAZE` (the
  fog step) and skip the banks, wisps and cloud shadows behind an `if` on
  it. Every pixel takes the same branch, so the `if` is cheap, and the
  setting changes live with no recompile (a `#define` would need every
  material recompiled: a pause).
- Also, on every step: clip the mist planes to the area beyond the land
  (a ring, not a full 9000 m square), so they aren't shaded over the land
  at all.
- Check the look at each step with `npm run shots` (overview, roaming, the
  glider high up, night), and the cost with `npm run perf`.

Measure on the Mac: `npm run perf -- ablate=clouds` gives the planes'
and banks' ms per frame. The haze inside materials has no switch yet; a
`haze=0` URL flag would be needed to measure it.

## 4. The plan, in order

| # | Change | Where | Gain | Risk |
|---|---|---|---|---|
| 1 | Loading screen: draw 1 warm-up frame, then no frames until Start | `src/map/main.ts` (`tick`, `mapReady`, `enter`) | Waiting ≈ 100 % → ≈ 0 % | Very low |
| 2 | Desktop frame cap 60 fps (+ "Battery saver 30 fps" setting) | `graphics.ts` `MAX_FPS`, settings UI | Up to ½ the GPU work on 120 Hz screens | Low |
| 3 | Resolution setting: **Auto + a list of exact sizes** made from the screen (e.g. 2880 × 1800 … 720 × 450), whole steps marked, separate from the Graphics level (see 3b) | `main.ts` `MAX_RATIO` / `holdRatio`, `post.ts` (upscale pass), `graphics.ts`, settings UI | 1440 × 900 on a MacBook: ¼ of the pixels; 720 × 450: 1/16 | Medium (the upscale pass; sizes between whole steps are softer) |
| 4 | Idle throttle: no input for a few seconds on the overview → 20–30 fps; any input → full speed. Window blurred → ~10 fps | `main.ts` `tick` | Big when the player only looks | Low |
| 5 | Plain boxes far away on every level, not only low | `graphics.ts` `plainFar` | Fewer triangles | Low–medium (check the look) |
| 6 | Still shadows on medium | `graphics.ts` `GRAPHICS.medium` | No shadow pass most frames | Medium (moving things cast no shadow) |
| 7 | Build snow / festival / rain / walk maps lazily | `main.ts` `BUILDERS`, `roam/` | Less memory, faster load | Medium |
| 8 | Review the 52 `frustumCulled = false` meshes | many files | Small–medium | Low |
| 8b | Fog setting: **Auto / Full / Light / Simple, no Off**, separate from the Graphics level; mist planes only beyond the land (see 3c) | `sky/haze.ts`, `clouds.ts`, `graphics.ts`, settings UI | Small–medium, grows with resolution | Low–medium (check the look) |
| 9 | Later: build parts in workers; impostors for far trees | build pipeline, `vegetation.ts` | Smoother load (workers: done, the land, its blocks, the jungle's planting and the covered sides; Start ≈ 0.45 s sooner, the longest task on the page 0.55–0.7 s → 0.25 s: section 7); fewer triangles (impostors: only on a phone, pictures of the far trees; elsewhere they do not pay: section 7) | High (big change) |

**Recommended first batch: 1, 2, 3, 4.** They are small, safe, and cover
both the loading screen and play.

## 5. How to measure (before and after each change)

- `npm run perf`: the frame cost per view and graphics level on the GPU
  (`scripts/perf.mjs`; `only=`, `levels=low,medium,phone`, `ablate=<part>`).
- Chrome Task Manager on the deployed site: tab CPU, GPU process CPU, memory.
  Check (a) waiting on the loading screen, (b) the overview, hands off,
  (c) walking, (d) the glider.
- `npm run idle` (`scripts/idle.mjs`): the production build in Chromium on
  the GPU, four cases of 10 s: waiting on Start, the overview hands off,
  moving the mouse, and the window without focus. Frames drawn, main-thread
  busy % (CDP `TaskDuration`), the page's and the GPU process's CPU, the
  render / update split. `base=<dir>` measures another checkout (a git
  worktree of the commit before), `vs=<json>` prints the change. Close other
  pages that draw on the GPU first (a dev tab of the map counts).
- macOS's GPU "utilization %" is not a measure of work: the GPU lowers its
  clock under a light load and then shows busy for longer. Compare frames
  drawn and CPU %, not GPU %.

## 6. Next steps

- [x] Owner picked the items: phase 1 = 1–4, phase 2 = 5–8b, phase 3 = 9;
  one commit a phase.
- [x] Phase 1: done and measured (section 7).
- [x] Phase 2: items 5, 6, 7, 8, 8b, measured against the phase 1 commit
  (section 7).
- [x] Phase 3: item 9: the build in workers, and pictures of the far trees
  on a phone (section 7). Far-tree impostors elsewhere were measured and do
  not pay.
- [ ] Later, small: start the build workers from a first module in
  `index.html` (≈ 0.25 s sooner); pack the jungle's meshes in its worker
  (≈ 0.1 s); move the landmarks' block work to workers (≈ 0.7 s of the
  page's work, each part split into a data step and an objects step);
  sort opaque draws front to back (≈ 0.5 ms with the rim copies, item 5).
- [ ] Known: snowmen are not solid any more (item 7); the kit studio's
  `water-fx` shader error and the lily pads over budget were there before
  (`npm run kitcheck`).

## 7. Results

### Phase 1: items 1–4

What changed:

1. **Loading screen:** the frame loop draws one frame under it (shaders,
   buffers), then rests until Start (`wakeLoop`, main.ts). The interface
   under the loading screen holds its CSS animations (`.map-waiting`,
   map.css), and three animations that ran while hidden now stop: the
   "sound held" card's pulse (`mu-wake-pulse`, 23 % of the main thread on
   its own), the big map's rings, the sleeper's "Z z z".
2. **Frame cap:** 60 a second on desktop (a 120 Hz screen drew 120),
   **Battery saver** setting 30 (`frameCap`, graphics.ts; a phone keeps 30,
   and the switch is hidden there). The loop paces evenly: a frame is due
   every 1/fps s, a refresh a few ms early is on time.
3. **Resolution setting:** Auto, or a list of exact sizes made from the
   screen (resolution.ts; the sizes in 3b), whole steps marked with a gold
   sparkle. Whole steps: a smaller canvas, nearest-pixel stretch. Sizes
   between: the scene into smaller targets, scaled up in the grade pass with
   a light sharpen (post.ts). Point sprites follow the scene's size.
4. **Idle:** the overview with no input for 4 s and no camera flight draws
   30 a second (20 on a phone or the saver); a window without focus 10; any
   input brings the full pace back at once. Between slow frames the loop
   sleeps on a timer, not on every refresh. `idle=0` turns it off.

Measured with `npm run idle`, back to back on the same machine (M1 Max,
1440 × 900 at 2×, medium; headless Chromium on Metal gets 120 Hz frames).
Before: 078e0f6. After: phase 1.

| case | frames/s | main thread busy | page CPU | GPU util |
|---|---|---|---|---|
| waiting on Start | 40.5 → **0** | 28.8 % → **5.1 %** | 37 % → **14 %** | 100 % → 37 % |
| overview, hands off | 40 → **30** | 25 % → 28 % | 44 % → 47 % | 100 % → 90 % |
| moving the mouse | 52 → 55 | 36 % → 40 % | 51 % → 61 % | 100 % → 100 % |
| window without focus | 54 → **10** | 36 % → **26 %** | 54 % → 47 % | 100 % → 82 % |

Notes:

- The overview and the mouse case are GPU-bound at 40–55 frames on this
  machine at medium and 2×, so the 60 cap does not show here; on a 120 Hz
  screen with a fast enough GPU it halves the frames.
- With the map drawn less often, the main thread spends more of its time on
  style and compositing (CSS animations run at the screen's refresh, not the
  map's): part of why busy % falls less than frames.
- Before, auto's medium level dropped to ratio 1 behind the loading screen
  (it was measuring frames nobody saw). Now it keeps the screen's ratio
  until the player is on the map.

### Phase 2: items 5–8b

What changed:

5. **Far plain boxes on every level, with a painted rim.** A far voxel mesh
   swaps its chamfered unit block (44 triangles) for a plain box (12) when
   its largest cut edge spans under a pixel (`plainFar`, `PLAIN_PX`:
   medium and high 1 px, max ½ px; terrain and jungle chunks through
   `ChunkSwitch`, terrain/lod.ts). Plain boxes alone lost the bright rim the
   map's blocks paint on their chamfer (the lines between temple stones), so
   they wear a rim copy of their material (`voxelRimMaterial`, voxel/
   materials.ts, `#define VOX_RIM`) that paints the chamfer's strip, weighted
   by its share of the pixel. Near blocks keep their program untouched; the
   rim programs compile at load. `plainpx=<px>`, `rim=0` to compare. Also a
   fix on low: boats sharing one geometry went plain when only one copy was
   far.
6. **Still shadows on medium** (as on low): no shadow pass every third frame
   (9.5 M triangles in the overview, +5 ms on that frame); what moves casts
   none there, and the explorer gets the soft disc. The next still map needs
   a second target: made lean (below).
7. **Built only when needed.** Snow, rain, the rainbow and the festival are
   built when the weather or the calendar wants them (`LateParts`,
   src/map/lazy.ts; a shot builds what its URL asks). The roaming walk
   maps, plank floor and river current are built in idle slices a second
   after Start (at once when "Jump in" opens). The snowmen are no longer
   solid (the explorer walks through them).
8. **Frustum culling:** 25 of the 39 unculled meshes now have bounds that
   hold everything they can draw (glows, halos, smoke, steam, spray, flocks,
   rings, birds, butterflies, fireflies, the balloon's parts, the crowd);
   the 14 others say why they stay unculled. A GPU checker drew each culled
   object alone over 6 480 poses × day, night, dawn: 0 errors.
8b. **Fog setting:** Auto / Full / Light / Simple (sky/fogLevel.ts),
   live, no recompile. Light: the 5 mist planes drawn as 2 stacked planes
   (the same sea), 133 banks of 264. Simple: also an even valley mist in
   every material (one land-map read, not 8–12 texture reads), 65 banks.
   Every step: the mist planes are a ring beyond the land (not shaded over
   it), and the edge banks stay, so the cut edges stay hidden.

Found on the way:

- **Shader warm-up:** `compileAsync` compiled the screen's version of every
  program (tone mapping, sRGB), but the scene draws into post.ts's target:
  the first frame compiled all ~75 again. Compiled for a target now
  (lazy.ts `compileFor`): the first frame under the loading screen 1.3 s →
  0.3 s, programs 201 → 127.
- **Lean shadow maps:** three gives each shadow map an RGBA colour texture
  that PCF never reads (64 MB at 4096²). Made first with one byte a texel
  (graphics.ts `leanShadowMaps`): 16 MB. With medium's second still map,
  that keeps its memory near what one map cost before.


Measured against the phase 1 commit (4ec7081), back to back on the same
M1 Max. `npm run perf`, 1280 × 720 at ratio 1, ms a frame (GPU-bound):

| view | low | medium | high | phone |
|---|---|---|---|---|
| overview | 6.2 → 5.9 | 15.6 → **11.3** | 15.2 → **12.7** | 5.7 → 5.2 |
| night | 6.2 → 5.7 | 15.5 → **12.0** | 15.9 → **12.5** | 5.5 → 5.4 |
| village walk | 4.0 → 3.1 | 6.3 → 5.0 | 6.4 → 5.9 | 3.3 → 3.0 |
| east village | 4.0 → 3.6 | 7.0 → 5.8 | 6.8 → 6.4 | 3.8 → 3.3 |
| hang glider | 5.2 → 4.4 | 11.4 → **7.9** | 11.2 → **8.5** | 5.1 → 4.3 |
| dusk (day turning) | 6.2 → 5.8 | 15.9 → **12.4** | 16.3 → **13.1** | 5.7 → 5.6 |

Triangles in the medium overview 8.81 + 9.50 M (picture + shadow pass
every third frame) → 5.64 M + none while the light stands; draws 8–38
fewer in every view.

`npm run idle` (1440 × 900 at 2×, medium):

- Start shows about 1 s sooner (the shader warm-up): 6.4–6.6 s → 5.3–5.4 s.
- Medium now keeps the screen's full picture (ratio 2) on the overview
  where before it dropped to ratio 1 (it stays over 40 frames a second),
  so it looks sharper; its picture targets take more memory there
  (GL 375 → 640 MB at ratio 2).
- The same picture size on both (`resolution=0.5`): waiting on Start GL
  301 → 251 MB (lean shadow map, lazy parts); on the overview GL 375 →
  405 MB (+30: medium's second still map, 128 MB without the lean maps);
  the GPU process 26 MB less; the tab about the same; moving the mouse
  55 → 59 frames a second.

### Phase 3, item 9 (first half): the build in Web Workers

What changed (`src/map/work/`; the guide: BRIEF.md "How the page is built"):

- **The land** (heightfield.ts) is built from the moment main.ts runs: its
  first shape (`firstShape`: low ground, mesas, benches, the sinking edges,
  each cell on its own) a share of the rows in each of 4 workers (53 ms),
  the rest in the first (150 ms). The page gets a copy, the other workers
  too.
- **The land's blocks** (terrain/lay.ts): each worker lays a share of the
  70 chunks (`shareChunks`, by their columns' walls) and packs them into the
  meshes' arrays (VoxelMesh.ts `packVoxelMesh`: matrices, colours, sides
  shown, bounds: `buildVoxelMesh` is now `packVoxelMesh` + `unpackVoxelMesh`),
  315–340 ms each, while the page builds the atmosphere. Each also sets the
  floor under every column and places all the rocks (each rock takes its
  cells before the next is placed), keeping only its own chunks' blocks. In
  the terrain's place the page only makes the meshes.
- **The jungle**: its prototypes are made early in a worker; it is planted
  there in the vegetation's place, on the land as the page has it then
  (surface and `occupied` sent), and its builders come back as typed arrays
  (transfer.ts). The page waits for it: the planting needs what the
  landmarks, road, sites and reserved spots took, and the meshes are made in
  their place.
- **The covered sides** (cull.ts `cutCovered`, after the build): worked out in
  another worker while the page waits for the jungle (`coverGroups`,
  `coverBoxes`), used if those meshes are unchanged by then.
- **The objects are made on the page in the same order as before**: three
  sorts draws of the same material and depth by object id. Only the ids of
  what comes after the jungle shift, all by 7 (scatter.ts makes 7 cameras
  while planting, now in a worker), which keeps their order.
- **Found on the way:** the statues sculpted in workers (sacred/) were marked
  still (low and medium's still shadows) only if they came before the still
  marking: most did on the live page, none in a shot, and the workers' waits
  let some in first. They are marked as they come now (main.ts).
- Left on the page: the landmarks, road, sites, village, hamlets, water and
  the rest. Their blocks are made between three.js objects (lights, glows,
  sculpted statues, materials) and read the scene and the land as the parts
  before them left it: moving them needs each rewritten into a data step and
  an objects step, for about 0.7 s of the page's work.

Measured on the M1 Max (production build, 1440 × 900 at 2, Chromium on
Metal; before 50d5972, after with the workers; the runs taken in turn, 4 of
each; `npm run idle` twice each gave the same Start and build):

| | before | after |
|---|---|---|
| Start shows after | 5.13–5.38 s (5.24) | 4.62–5.03 s (4.81) |
| the build (the page's time in each part's place) | 3.07–3.21 s | 2.59–2.64 s, of it ≈ 0.7 s waiting for workers |
| main thread busy from the page opening to Start | 89–93 % (4.6–4.9 s of tasks) | 75–79 % (3.5–3.9 s) |
| long tasks (over 50 ms): all, the longest | 3.6–3.8 s, 554–690 ms | 2.2–2.4 s, 223–247 ms |
| frames the loading screen got | 97–136 | 174–225 |
| `phone=1` (low): Start, busy, longest task | 5.10–5.16 s, 88–89 %, 554–558 ms | 4.57–4.74 s, 72–77 %, 208–216 ms |

Per part, the page's time (ms): land 291–299 → 240–268 (waiting), terrain
554–690 → 99–130, vegetation 425–441 → 482–490 (≈ 385 waiting, then its
meshes: the planting is slower in a worker, ≈ 355–380), covered 131–132 → 3.
Waiting on Start, the overview, the mouse and a window without focus: the
same frames and busy % (`npm run idle`); the tab ≈ 10 MB more on the loading
screen (the workers stop after the build). 4 workers (of the 10 cores): 6
were slower each (the land's blocks 360–410 ms), 1 or 2 give the same map.

The same map, proved by `scripts/build-check.mjs` (every part's geometry,
attributes, instance matrices and colours, bounds, names, flags, user data,
each block's code line, the draw order by id rank, the land's arrays and
lists, the blocks line): workers = the page alone (`work=0`) = the phase 2
commit, in shots (twice) and on the live page, on the dev server and in a
production build, at `quality=low`, `phone=1`, `parts=`, with 1, 2 and 6
workers, and with workers missing, failing to start, failing a job or never
answering (built on the page). The shots (overview, night, a walk, the
glider, low, the cards) are pixel for pixel the same; the walk maps' answers
on a 2.3 m grid, the kit studio's 12 sections, and the bug report's code
lines (B) too. What differs from the phase 2 commit: the land's code lines
in columns.ts moved (lines added above them), and the jungle's meshes are
made far before near (the impostors' change, below).

Next: start the workers from a small first module in index.html (they
start 310–520 ms into the page now, once the page's modules are loaded and
run; the land would be ready as the page asks: ≈ 0.25 s sooner here, more
over a slow network); pack the jungle's meshes in its worker too (≈ 0.1 s).

### Phase 3, item 9 (second half): impostors for far trees (only on a phone)

The far trees are the jungle's 2 m and 3 m cells (vegetation.ts's far
meshes: 2 205 trees, ≈ 79 k leaf blocks and 1 278 free leaf boxes in 106
leaf tiles, and their bark). Since phase 2 they are plain boxes with their
covered sides cut (≈ 8 triangles a block drawn), unpainted, and they no
longer cost much. Measured on the M1 Max against the phase 2 commit, each
case in one page with the variants taken in turn (3 rounds, ms a frame):
"not drawn" is the most any impostor could save; "pictures" is a quad per
tree with an alpha-tested picture in their place; "exact" is the impostor
below, against the real blocks.

| view | frame | far trees not drawn | pictures in place | exact impostors |
|---|---|---|---|---|
| overview, medium, 1280 × 720 | 12.3 | −0.91 | −0.82 | +0.30 (slower) |
| overview, medium, 2880 × 1800 | 24.6 | −0.90 | −0.80 | +2.03 |
| the glider's height (`cam=0,160,60,0,110,-240`), medium | 9.1 | −1.01 | −0.81 | −0.11 |
| walk on Kulen, medium | 4.8 | −0.29 | −0.17 | +0.18 |
| overview, high, 1280 × 720 | 12.9 | −0.84 | −0.86 | +0.67 |
| overview, high, 2880 × 1800 | 25.5 | −1.07 | −0.91 | +3.02 |
| overview, low, 1280 × 720 (leaves) | 5.9 | −0.50 | −0.49 | +0.24 |
| phone (low, 844 × 390; leaves) | 5.4 | −0.43 … −0.60 (two runs) | −0.51 | −0.10 |

- **Pictures cannot hold the look where they pay.** A far block is 3–8 px
  across in the overview at 2880 × 1800 (441–927 m away), 4–12 px from the
  glider's height, 1.5–4 px at 1280 × 720: the blocks of a crown read one by
  one, and a picture taken from a few angles slides and changes them as the
  view turns (and lights them, sways them and shades them from each other
  only roughly). Only on a phone are they about a pixel (0.7–2 px: pictures
  of ≈ 8 px trees would pass); there they would save ≈ 0.5 ms here, ≈ 9 %
  of the phone's overview, and only past ≈ 550 m while roaming.
- **Exact impostors cost more than the blocks.** Built and checked (not
  kept): a tile's far leaves cut into bricks of 8³ cells, their colours in a
  3D texture (3.0 MB, 38 ms at load), each brick drawn as the box round its
  cells, each pixel walking its ray cell by cell to the first block and
  shading it with the leaf family's own material (grain, relief, sway, the
  light, shadows, haze, snow), writing its depth. The picture is the blocks'
  own (overview 2×: mean 0.16 of 255; only the MSAA-smoothed edges differ,
  the ray gives one sample a pixel). But a pixel that writes its own depth
  gets no hidden-surface removal: every crown shell a ray crosses is shaded
  and then covered (1280 × 720: ≈ 0.4 ms the walk, ≈ 1.1 ms the shading, for
  ≈ 1 ms of blocks), and it grows with the pixels.
- Also measured: the far leaves without their sway (the cut kept) are no
  faster (±0.1 ms): their cost is the blocks' vertices, not the wind.

So on a computer the far trees stay blocks: ≈ 1 ms of a 12–25 ms frame is
left in them, and every impostor either changes the look or costs more.

**On a phone: pictures of the far trees** (veg/impostors.ts; the low level
on a phone screen, `phone=1`; nothing else changes, nothing is built
elsewhere). Where a leaf tile's far blocks are under 1.5 px across, its far
trees are drawn as one camera-facing quad each, showing a picture of the
tree's leaves:

- **The atlas**, drawn at load from the far prototypes the jungle was
  planted from (74 kinds, 1 776 trees on the low build): 8 directions × 3
  heights over the horizon (3°, 15°, 30°), 24 × 24 texels a picture: the
  leaf's colour as built (baked shade, the family's grain), the side it
  shows and its depth; its bark (trunk, branches) a hole. One RGBA8 texture,
  1776 × 576 (3.9 MB), 24 draws: 22–44 ms on the M1 Max as busy as it was
  (15–25 of it the atlas, most of that its little program compiling; a
  phone's CPU is about this one's, its GPU 5–8 times slower on 24 small
  draws). The planting (in a build
  worker or on the page) passes the far trees on as plain arrays.
- **Drawn** as the blocks are lit: a tree picks the view nearest to how the
  camera sees it (its stamp's quarter turn and mirror undone), and each
  texel is shaded by the leaf family's light on the side it shows (the sun
  or the moon, the sky light, the still shadow map at the texel's point),
  the haze and fog steps and the snow, and writes the leaf's own depth (so
  crowns, trunks and the land sort as the blocks did). The real trunks and
  branches stay blocks.
- **The blocks**: the low level puts a tile's near and far blocks in one
  mesh, the far ones last: while a tile is pictures, the picture pass draws
  only the instances before them (`count`, for the view camera only). No
  draw more; tiles with only far trees draw nothing. The shadow passes, the
  snow's map from above and the bug report's picks still see every block:
  the trees keep casting the still shadows, and a pick on a picture names
  the tree's block and its code (checked: 6 of 6 picks, species.ts).
- **The switch**: per tile (with 6 % hold); a tree whose crown reaches into
  a tile under the limit is a picture, and a tile's blocks are left out
  only once every tree reaching in is one; the pictures fade in over 0.4 s
  (a dither) before the blocks go, and fade out over them when they come
  back.

Look (M1 Max, before | after | ×8 diff): the landscape phone overview
(844 × 390) mean 0.25 of 255, 0.74 % of pixels over 8 levels, single pixels
inside the far crowns (Kulen's slope, the back of the western mesa); by eye
the same, by day, at dusk, by moonlight, at dawn and in rain (every phone
shot is the Simple fog step: Auto → low → Simple). The glider's height:
0.26 % of pixels. Portrait (390 × 844, its pixels smaller: few tiles under
1.5 px): ≤ 16 levels on a pixel, none over 8 in the overview. Walks looking
out past ≈ 550 m: no pixel changes (the far trees there are in the haze or
behind the land). Moving (the glider's height flying toward Kulen, 90
frames, tiles switching both ways): the frame-to-frame change the same as
with blocks (9.09 and 9.09, the worst frame +0.02): no pop. Every other level
and screen, pixel for pixel the same (desktop low, medium, high by night, a
phone on medium; and the blocks' path on a phone, pictures off).

Speed, `npm run perf -- levels=phone,low` before → after, back to back,
twice (ms a frame; other GPU work ran at the same time: ±0.3):

| view | phone (low, 844 × 390) | draws | triangles M |
|---|---|---|---|
| overview | 5.3 / 5.5 → 5.2 / 5.0 | 517 → 462 | 3.38 → 3.11 |
| night | 5.4 / 5.5 → 5.0 / 5.1 | 518 → 463 | 3.39 → 3.12 |
| dusk (day turning) | 5.5 / 5.7 → 5.3 / 5.3 | 520 → 465 | 3.40 → 3.13 |
| hang glider | 4.7 / 4.9 → 4.7 / 4.8 | 457 → 426 | 2.96 → 2.82 |
| Kulen walk, village walk | the same | the same (+1) | the same |

The same page with the pictures switched off and on in turn (5 rounds,
steadier): the overview 0.34 ms, night 0.38, the glider's height 0.22, the
Kulen walk 0. Low on a desktop, medium and high: the same draws and
triangles, ms within the noise.
