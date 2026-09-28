# World map: CPU / GPU / memory plan

**Status: investigation done, nothing changed yet.** Waiting for the owner's
"let execute" and which items to do. Pick up from "Next steps" at the bottom.

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
| Pixel ratio / resolution | Partly: medium drops to ratio 1 only when slow; high/max always 2 | **Yes.** On Retina, render at 1.0–1.5 and upscale, or add a "Resolution" setting. Post effects run per pixel, so this is one of the biggest wins. |
| Frame cap | Phones only (30 fps) | **Yes.** Cap desktop at 60 and add a "Battery saver: 30 fps" option. |
| Shadows | Low has "still shadows" (redrawn only when the sun moves); medium/high redraw every 3rd frame | **Yes.** Still shadows on medium too; maybe a smaller shadow map on medium. |
| Dispose / lazy build (memory) | Everything built at load | **Yes.** Build snow, festival, rain and the walk maps only when needed (or after Start, in idle time). |

## 4. The plan, in order

| # | Change | Where | Gain | Risk |
|---|---|---|---|---|
| 1 | Loading screen: draw 1 warm-up frame, then no frames until Start | `src/map/main.ts` (`tick`, `mapReady`, `enter`) | Waiting ≈ 100 % → ≈ 0 % | Very low |
| 2 | Desktop frame cap 60 fps (+ "Battery saver 30 fps" setting) | `graphics.ts` `MAX_FPS`, settings UI | Up to ½ the GPU work on 120 Hz screens | Low |
| 3 | Retina: render at ≤ 1.5 (or a Resolution setting) | `main.ts` `MAX_RATIO` / `holdRatio`, `graphics.ts` | ≈ ½ the pixel cost | Low (a bit softer picture) |
| 4 | Idle throttle: no input for a few seconds on the overview → 20–30 fps; any input → full speed. Window blurred → ~10 fps | `main.ts` `tick` | Big when the player only looks | Low |
| 5 | Plain boxes far away on every level, not only low | `graphics.ts` `plainFar` | Fewer triangles | Low–medium (check the look) |
| 6 | Still shadows on medium | `graphics.ts` `GRAPHICS.medium` | No shadow pass most frames | Medium (moving things cast no shadow) |
| 7 | Build snow / festival / rain / walk maps lazily | `main.ts` `BUILDERS`, `roam/` | Less memory, faster load | Medium |
| 8 | Review the 52 `frustumCulled = false` meshes | many files | Small–medium | Low |
| 9 | Later: build parts in workers; impostors for far trees | build pipeline, `vegetation.ts` | Smoother load; fewer triangles | High (big change) |

**Recommended first batch: 1, 2, 3, 4.** They are small, safe, and cover
both the loading screen and play.

## 5. How to measure (before and after each change)

- `npm run perf`: the frame cost per view and graphics level on the GPU
  (`scripts/perf.mjs`; `only=`, `levels=low,medium,phone`, `ablate=<part>`).
- Chrome Task Manager on the deployed site: tab CPU, GPU process CPU, memory.
  Check (a) waiting on the loading screen, (b) the overview, hands off,
  (c) walking, (d) the glider.
- The idle script used for this investigation measures main-thread busy %,
  frames drawn and render vs update time while waiting on Start: a Playwright
  page on `vite preview` that wraps `window.post.render` and each part's
  `update`. It is easy to rewrite from this description.

## 6. Next steps

- [ ] Owner picks items from section 4 and says "let execute".
- [ ] Take a baseline with `npm run perf` (and Task Manager numbers on the site).
- [ ] Do the chosen items one commit each. Measure after each one.
- [ ] Update this note with the before/after numbers.
