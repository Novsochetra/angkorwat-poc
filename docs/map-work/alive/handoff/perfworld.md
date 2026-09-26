# Handoff: perfworld (world map draw-cost fixes)

**Task.** Fix four GPU/CPU costs a perf review measured on the world map: jungle ruins never culled, the undergrowth drawing its whole pool, village rafts rewriting their matrices every frame, and shadow casters that always cast.

## Done (type-checks; `npm run build` passes)

1. **Jungle ruins get one mesh set per site.** `src/map/jungle/ruins.ts` `buildJungleRuins` splits the blocks by site with `splitByPlace`. Sites within `JOIN` = 120 m share a set, which gives 5 groups. Each set has its own bounding sphere, so three culls the sets that are off screen. `skipBackFacets` still works: main.ts traverses the part, and each tighter box skips more facets. The camps are split the same way in `src/map/jungle/camps.ts` `buildCamps`, with 3 groups. The camps' `glow` blocks stay in one mesh (`rest`) because `CampFx.finish` finds them by name and relies on their order.
2. **The undergrowth draws only the boxes it has filled.** `src/map/veg/undergrowth.ts` `Pool` now packs cells one after another instead of giving each a fixed slot of 80 boxes. `drain` fills cells, `pack()` squeezes out cells that were let go once `REPACK` boxes of them pile up, and `upload()` sends ranges to the GPU. `mesh.count = pool.used`.
3. **The raft bob runs in the vertex shader.** In `src/map/village/_floating.ts`, `Bobbing.trackVoxels` adds two per-instance attributes, `aBob` (x, z, phase, heave) and `aBobRock`. It then swaps each family's material and depth material for a "bobbing twin" (`bobbingTwin`: a clone that calls the base's `onBeforeCompile`, then does `#define instanceMatrix voxBobIM`). The twin's cache key follows the base's, so the near-fade that `roam/_nearFade.ts` adds later is still picked up. `Bobbing.clock(t)` sets the time uniform. Only the 16 lit panes on the rafts (`village:glow-floating`) still bob on the CPU, and only within `BOB_NEAR` = 150 m. Hen calls keep their old 330 m distance (`HEAR_NEAR`). The walk map and boat collisions are unchanged: the rafts' instance matrices now stay at rest.
4. **Shadow casters are gated.** The new file `src/map/cull.ts` holds `CastView`, `ShadowGate` and `splitByPlace`.
   - A gated mesh casts only while its shadow can be in view: its world box, swept away from `f.lightDir` by the reach of its top's shadow, padded 12 m plus 12 % of its distance, and tested against the camera frustum. The shadow map covers the whole map (atmosphere.ts), so this rule never hides a shadow that is on screen.
   - For the first 3 frames every gated mesh casts. With `cull` = true it is also drawn wherever the camera looks, so all shaders compile at load.
   - It is used by the jungle, the camps, the village (`village/index.ts`) and the paddy props (`paddies.ts`, box from `aP0`/`aP1`).
   - The festival kit is posed in the shader, so three can't cull it. `src/map/festival/_kit.ts` `Kit.places()` + `KitMesh.inView(view, shadow)` compute spheres: static boxes grouped in 80 m squares, and each rig's sphere moved by its current `uRig` matrix. `festival/index.ts` sets the kit's `castShadow`, and its `visible` (drawn only if the kit or its shadow is in view), after the warm frames.
   - The festival crowd keeps its existing distance rule.
5. **The rice is one mesh per plot.** `src/map/paddies/rice.ts` `buildRice` returns `meshes` (10 meshes, one shared material, so one program). `paddies.ts` warms them and then culls them. Before this, the field's single sphere contained the camera whenever you stood at the village, so it was never culled.

## Numbers
Draw calls / triangles are for one frame that includes a shadow pass. The baseline (a copy of the tree with my files restored) and the new tree were measured at the same time, on an M1 Max with ANGLE Metal.

| scene | before | after |
|---|---|---|
| village walk `roam=walk&at=-285,62&yaw=250` | 556 calls / 17.50 M | 558 / 15.98 M |
| forest Buddha walk `at=-52,-300&yaw=180` | 548 / 17.57 M | 526 / 16.30 M |
| lake walk `at=-380,20&yaw=270` | 535 / 15.29 M | 518 / 13.85 M |
| lake, Water Festival night | 536 / 15.83 M | 517 / 14.34 M |
| overview `index.html` | 738 / 24.70 M | 765 / 24.18 M |

Per part (main pass, then shadow pass):
- **Jungle**
  - village walk: main 10 calls / 377k → 10 / 32k, shadow 9 / 377k → 12 / 109k
  - lake: main 377k → 0, shadow 377k → 32k
  - overview: main 11 / 378k → 21 / 284k, shadow 9 / 377k → 26 / 345k. **The overview gains about 27 calls**, because most sites are in view there. Triangles still go down.
- **Undergrowth**: 46,400 boxes (557k tris) → 6.7k boxes at the village and 24.7k in the forest (296k tris).
- **Village shadow**: 11 calls / 322k → 0 in the overview and in the jungle. Unchanged when the village is in view.
- **Paddies** at the village walk: main 408k → 69k.
- **Rafts**: 1 mesh (1 KB) re-uploaded per frame instead of the whole floating build (the review measured about 98 KB).
- **Update cost**: the village update drops from about 0.055 ms to about 0.02 ms. The gates cost a few µs.
- **Shaders**: 91 → 95 programs at load (the bob twins: shading and depth). No new program compiled after load during a tour of 18 places. The only 2 late programs, `fauna:junglefowl` and `map:light-pools`, are also late in the baseline, so they are not from this work.
- **Frame time**: the GPU timer medians improved about 2–5 % in the roaming views. Frame-time medians on this shared machine are too noisy to trust.

## Not done / to check
- **Picture check is not finished (stopped mid-run).** I compared baseline and new shots at 1672×941 with SwiftShader, using the same parameters.
  - Identical: `camp`, `gate`, `jun`, `junc` (forest Buddha close-up), `ny`, `pad`.
  - Small differences:
    - `m` and `fw`: the title card only (UI).
    - `lfw`: a top-right UI strip.
    - `race` and `raftn`: distant blocks at the horizon, plus one lamp halo.
    - `vil`: 0.02 %.
  - The floating houses themselves are identical in `raftn`.
  - The new shots were taken about 40 min after the baseline copy, while other fixers kept editing, so these differences are most likely theirs. To confirm, rebuild the baseline (the live tree with only my 9 files restored to their state before my edits, minus `cull.ts`) and shoot `race`, `raftn`, `raft`, `vil`, `lfw` on both trees back to back:
    - `raft`: `cam=-295,22,85,-335,5,50`
    - `race`: `fest=water&t=60&cam=-400,18,30,-450,5,10`
- **Rice**: the plots out of view are culled. A distance LOD (drop the tufts past about 300 m, since `ground.ts` already paints the rice colour from afar) would save more, but it would change pictures slightly. Not done.
- **Overview draw calls**: if the extra ~27 calls matter, keep one merged set for the overview and use the per-site sets while roaming, or raise `JOIN`.
- **`docs/map-work/BRIEF.md`**: not updated. A line about `cull.ts` (`ShadowGate`, `splitByPlace`) for spread-out parts would help.

## How to check
- `npx tsc --noEmit`, `npm run build`.
- Shots:
  - `m="@index.html?shot=1"`
  - `vil="@index.html?shot=1&roam=walk&at=-285,62&yaw=250&sim=_:1"`. Roam shots need `sim=_:1`, or the camera comes out upside down.
  - `raftn="@index.html?shot=1&ui=0&night=1&cam=-295,22,85,-335,5,50"`
  - `fw="@index.html?shot=1&fest=water"`
- Draw counts: wrap `renderer.renderBufferDirect` to count calls and triangles per part (walk up to the part's object) and per pass (shadow camera = `parts[0].key.shadow.camera`), like the review's `probe.mjs` (in the old scratchpad).

## Files changed
- `src/map/cull.ts` (new)
- `src/map/jungle/ruins.ts`
- `src/map/jungle/camps.ts`
- `src/map/veg/undergrowth.ts`
- `src/map/village/_floating.ts`
- `src/map/village/index.ts`
- `src/map/festival/_kit.ts`
- `src/map/festival/index.ts`
- `src/map/paddies.ts`
- `src/map/paddies/rice.ts`

## Know
- The bobbing twins are clones of the shared voxel materials. The look panel (**K**) changes the twins' uniforms (they share the same uniform objects), but not the plain material properties set on the base materials (roughness and the like). It only affects the rafts, and only in the dev tool.
- Gated meshes flip `castShadow` every frame. Anything else that sets `castShadow` on these meshes gets overwritten.
- The festival kit's `visible` is now driven by `festival/index.ts`. Its `show()` still controls `instanceCount`.
