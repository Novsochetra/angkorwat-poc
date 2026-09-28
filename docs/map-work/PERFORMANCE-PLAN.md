# World map: CPU / GPU / memory plan

**Status: in three phases.** Phase 1 (items 1–4) is done: results in
section 7. Phase 2 is items 5–8b, phase 3 is item 9. Pick up from "Next
steps" at the bottom.

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
  (≈ 143 k + 116 k + 201 k blocks) in JS memory;
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
| 9 | Later: build parts in workers; impostors for far trees | build pipeline, `vegetation.ts` | Smoother load; fewer triangles | High (big change) |

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
- [ ] Phase 2: items 5, 6, 7, 8, 8b. Baseline with `npm run perf` on the
  phase 1 commit first.
- [ ] Phase 3: item 9.

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
