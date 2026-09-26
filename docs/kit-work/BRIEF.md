# World-kit asset brief (read fully before starting)

You are one of several agents building voxel assets **in parallel** for an Angkor Wat
game (repo `/home/user/angkorwat-poc`, three.js + TypeScript + Vite). The user is
reconstructing Angkor Wat from a component plan
(`/home/user/angkorwat-poc/Angkor Wat Voxel Bavel Reconstruction --- Component Plan.md`).
We are building **sections 18 (landscape / vegetation), 19 (stone / material system) and
20 (small props)** first. The user will inspect every asset in the studio page and
report problems, so **attention to detail matters**: match — or beat — the reference
sheet for your component: silhouette, proportions, colour distribution, the little
details that give it charm. It must look good from every view (iso, front, side, top).

## Reference images
- Your component's reference crop(s) (2× enlarged) are in
  `screenshots/refs/`
  (e.g. `18.1-large-tree.png`, `20-small-shrine.png`). Full sheets: `refs/sheet-18.1.png`,
  `sheet-18.2.png`, `sheet-19.1.png`, `sheet-19.2.png`, `sheet-20.png` (1536×1024 originals).
- Also useful for the overall look: `/home/user/angkorwat-poc/assets/angkor detail/*.png`.
- View images with the Read tool. Study them closely before writing code.
- **The sheets' size labels are estimates and some are wrong** (the user said so). Build to
  real-world sizes (table at the end) and record your decision in the asset's `size`
  field (`real`, `sheet`, `note` = why they differ). Proportions/looks come from the
  sheet; sizes come from reality.

## Units and conventions (all assets)
- 1 unit = 1 metre. The explorer character is 1.70 m tall. Sandstone blocks are 0.5 m
  (`TEMPLE_BLOCK_M`). The pixel-art "texel" is 1/16 m = 6.25 cm (`TEXEL`).
- Piece space: origin at the centre of the footprint, **y = 0 = the ground** the piece
  stands on (ground tiles have their walkable top at y = 0 and extend below), +Y up,
  **front faces +Z**, +X is right.
- Keep block edges on the 1/16 m texel grid where practical (grids with cell sizes that
  are multiples of 1/16 m, origins on multiples of 1/16 m), so the surface texels line up.
- Builds must be deterministic (seeded): same `seed` + `variant` → same piece. Use
  `rng(seed)` / `hash3()` / `valueNoise3()`, never `Math.random()`.

## The kit API (read these files first — they are short)
- `src/kit/types.ts` — `defineKitAsset`, `KitAsset`, `KitPiece`, `KitShot`, `KitView`, `KitBuildOptions` (`variant`, `seed`, optional `height` override).
- `src/kit/registry.ts` — assets are found by file: `src/kit/assets/<section>/<slug>.ts`
  with a **default export** made by `defineKitAsset({...})`. Files starting with `_` are
  helpers (not assets). No registration step — just create the file.
- `src/kit/PieceBuilder.ts` — `const p = new PieceBuilder(); p.voxels.box(...)/grid(...); p.collider(...); return p.done();`
- `src/voxel/VoxelBuilder.ts` — `box(x,y,z, sx,sy,sz, color, mat, {shade, surf, rx,ry,rz, open, merge})`,
  `span(x0,y0,z0,x1,y1,z1, color, mat, extra)`, `grid({cell, origin, mat, jitter, ao, seed, surf})` →
  `VoxelGrid.set(i,j,k,color,mat?,shade?,surf?)`, `put(i,j,k,{...})`, `fill(...)`, `ghost(...)`, `commit()`.
  Grids bake ambient occlusion + colour jitter and drop hidden cells. Rotated free boxes are fine.
- `src/kit/shapes.ts` — `TEXEL`, `snap`, `rng(seed)` (`range`, `int`, `pick`, `chance`), `tone(palette,i,j,k,seed)`,
  `fillEllipsoid`, `fillTube` (tapered Bézier tube: trunks, branches, roots, vines), `fillCylinder`, `scatter`.
- `src/kit/BlockSet.ts` — masonry: `new BlockSet(res)`, `add(x0,y0,z0,x1,y1,z1,color,{surf,mat,shade,broken})`,
  `remove(id)` (missing block), `carve(pred)`, `carveSphere(...)` (bites), `erode(amount, seed)` (chipped
  edges), `find`, `emit(builder)`, and `masonry(set, box…, {length, course, depth, axis, palette, style, seed})`
  for walls/platforms/steps with staggered joints. Intact blocks = 1 box each; carved blocks are
  emitted as merged cells that still read as one stone, broken faces in rough stone colour.
  Sides against another block are masonry joints: neighbouring stones touch, and every stone
  keeps its flat 3 cm edge cut there, darkening a little into the joint, so each stone reads on
  its own with a soft dark line between stones, like the sheet's blocks.
- `src/kit/palette.ts` — calibrated colours: `SANDSTONE` (clean, warm, dark, cracked, weathered, mossy,
  broken, cavity), `SOIL`, `GRASS`, `MOSS`, `LICHEN`, `LEAF`, `FLOWER`, `BARK`, `LITTER`, `WATER`,
  `OFFERING`, and **`fromSheet(hex)`**: give it a colour sampled from a lit face of a reference
  sheet and it returns the albedo that renders like it in the studio. Use it for any colour
  you sample yourself. (Don't edit palette.ts — keep your own constants in your module.)
- `src/kit/surface.ts` — per-block pattern amounts: `stoneSurf({moss, lichen, crack, stain})`,
  `soilSurf({grass, moss, dry, wet})`, `leafSurf({flowers, yellow})`, `barkSurf({moss, lichen, stain})`,
  and `STONE_FINISH` (the six §19.1 sandstone finishes: palette + surf + wear).
- `src/kit/lib/ground.ts` — §18.2 tile base: `soilBody(p, {w, d, depth, color, surf})` (one soil
  block, top at y = 0, pattern draws the pixel texture and grass drips) and `topGrid(p, {...})`
  (texel cells standing on the tile top, soil ghosted beneath).
- Example asset: `src/kit/assets/19.1/_sample.ts` + `19.1/clean.ts` (sandstone finishes).

### Material families (the `mat` argument) and the pixel-art patterns
The world-kit families draw a **pixel-art texture on every face in 1/16 m texels** (speckle,
pores) plus per-block overlays from the block's `surf` (see `src/voxel/materials.ts`):
- `sandstone` — stone pattern in 1/24 m texels: the stone dots cut from the §19.1 sheet's tiles
  (`src/voxel/sheetDots.ts`, made by `docs/kit-work/sheet-dots.py`) on the block's colour;
  surf = [moss, lichen, cracks, stain]. Moss grows on tops and creeps down; stain = dark
  weathering streaks; cracks = one-texel crack lines.
- `soil` — dirt with grit; surf = [grass, moss, dry, wet]. Grass covers the top and hangs 1–4
  texels over the sides **measured from the top of that one block** (so for grass drips use one
  tall soil block, not a stack of tiny ones; paint grass cells yourself on small cells).
- `leaves` — leafy speckle (strong light/dark texels); surf = [flowers, yellowing]. Use for
  canopies, bushes, grass blades, ferns, lily pads, moss clumps.
- `trunk` — bark with vertical ridges; surf = [moss, lichen, 0, stain]. Trunks, branches, roots.
- `water` — translucent, glinting texels (ponds, drains).
- `petal` (flowers, lotus), `wax` (candles), `glow` (unlit: flames, incense embers), `metal`, `wood`, `brass`.
- Don't use the old `stone/darkstone/moss/foliage/bark/ground` families (legacy world blockout).
Colour = the block's albedo; patterns add the texel variation, so per-block colour picks from
a 3–5 tone palette (plus the pattern) is how the sheets' look is reached.

## How to look at your work (studio)
A shared Vite dev server runs at **http://localhost:5173** — the lead starts it with
`node docs/kit-work/devserver.mjs` (no HMR, so agents' edits don't reload each other's pages;
new files are still picked up). Don't stop it or start another on that port. Screenshot the studio headlessly and view the PNG:

```bash
cd /home/user/angkorwat-poc
SHOT_BASE=http://localhost:5173 SHOT_W=1600 SHOT_H=1000 SHOT_FULL=1 SHOT_OUT=screenshots/<yourname> \
  node scripts/screenshots.mjs main="@studio.html?asset=<section>/<slug>&shot=1" \
                               sheet="@studio.html?section=<section>&shot=1"
```
- `?asset=<id>` page: big iso view, **the reference crop beside it**, front/side/top views,
  a scale view (your piece next to the 1.70 m explorer with a metre ruler), all variants,
  block counts. Add `&variant=<id>&seed=<n>` to pick, `&quality=high` for smooth bevels,
  `&height=<m>` to test your height override.
- `?section=<id>` page: the reference-sheet style cards for the whole section.
- `?lineup=<section>`: all assets of the section side by side to scale.
- Console lines starting `[kit]` report build time and block counts per piece; errors show as
  red error cards. If port 5173 doesn't answer, drop `SHOT_BASE` (the script starts its own server).
- Measure colours: `python3 docs/kit-work/measure.py IMAGE x0 y0 x1 y1 [k]`
  prints the median + dominant tones of a box (background ignored); `--crop IMAGE x0 y0 x1 y1 OUT.png 3`
  saves an enlarged crop. Compare render vs reference; if a lit face renders too
  yellow/dark, fix the albedo (fromSheet helps).
- Typecheck: `npx tsc --noEmit` (whole project — other agents' in-progress files may show errors;
  only fix errors in **your** files).

Headless rendering is software GL and ~15 agents share 4 CPUs: a screenshot can take
10–60 s. Batch several shots into one command, and don't re-shoot without a change.

Iterate: build → screenshot → compare with the reference crop side by side → fix. Do several
rounds; look at every view and every variant/seed. Don't stop at "it renders".

## Rules (parallel work)
- **Only create/edit the files you own** (listed in your task). Shared infra
  (`src/voxel/*`, `src/kit/*.ts`, `src/kit/lib/ground.ts`, `src/studio/*`, other agents' assets) is
  read-only for you. If you need an infra change, work around it and describe the needed
  change in your final report.
- **No git commands that change state** (no add/commit/checkout/stash/reset/restore). Don't
  delete files you didn't create. Keep screenshots under `screenshots/<yourname>/`.
- Match the house style: TypeScript strict, 2-space indent, single quotes, short doc comments
  like the existing code (explain *why*, describe what the sheet shows), no unused code.
- Budget (blocks per piece, keep builds < ~150 ms): ground tile ≤ 1.5k, small props ≤ 2.5k,
  statues/shrines ≤ 6k, bush ≤ 2.5k, small tree ≤ 3k, medium tree ≤ 8k, palm ≤ 4k,
  large tree ≤ 22k. Use big boxes for flat areas (the pattern textures them), small cells only
  for silhouette detail. Colliders: simple AABBs for trunks, stones, platforms (none for grass,
  leaves, flowers; `noStand` for water).
- Every asset: `section`, `order` (its number on the sheet), `name` and `caption` (as on the
  sheet), `size` {real, sheet, note}, `variants` (the sheet's sub-items where it shows them, e.g.
  "Clean grass / Patchy grass / Tall grass"), `shots` for the card's small renders (default:
  other variants + a top view), `mainView` if iso isn't best, and `ref` = {sheet, box} with the
  component's box on the original 1536×1024 sheet (path under `assets/angkor detail/`, e.g.
  `'section 18/section 18.1.png'`; boxes are given in your task).

## Final report (your last message)
Files created; what each variant looks like and how it maps to the sheet; block counts and
build times; size decisions (real vs sheet, with reasons); remaining gaps vs the reference;
any infra change you'd want; paths of your final screenshots (asset page + section page).

## Real-world sizes (guidance — refine with good reasons)
| Thing | Build to | Sheet said |
| --- | --- | --- |
| Large tree (strangler fig / banyan with buttress roots, vines) | ~22 m tall (seed 18–26 m), canopy ~18–22 m wide, trunk 2.5–3 m + buttress spread 8–10 m | 12–15 m |
| Medium tree (broadleaf) | ~11 m (9–13 m), canopy 8–10 m | 6–8 m |
| Small tree | ~5 m (4–6.5 m), canopy 3–4 m | 3–4 m |
| Palm | sugar palm (Borassus, Cambodia's national tree) 13–18 m, trunk ⌀ 0.5–0.7 m, crown 6–8 m | 8–10 m |
| Bush | 1–2 m tall, 2–3.5 m wide | 1–2 m |
| Dense jungle cluster | ~16 × 16 m patch, trees 8–22 m | — |
| Ground tile | 1 m × 1 m, soil 0.5 m deep; paving slabs ~0.5 m | — |
| Sandstone block | 0.5 m (real 0.4–0.6 m high, 0.5–1.2 m long) | — |
| Stone fragments | 0.08–0.5 m | — |
| Fallen architectural block | 0.5×0.5×1.0 m blocks; lintel pieces 1.2–2 m; column drums ⌀ 0.5 m | — |
| Broken statue | seated Buddha ~1.2–1.4 m incl. base, head ~0.45 m | — |
| Small shrine (prasat / spirit shrine) | 1.8–2.4 m tall, 1.0–1.4 m wide | — |
| Offering platform | ~1.2 × 0.8 m, 0.5–0.6 m high; incense 0.3 m; candles 0.1–0.15 m | — |
| Stone steps | risers 0.2–0.25 m, treads 0.3–0.35 m, 1.5–2 m wide | — |
| Drainage channel | ~0.5 m wide, 0.35 m deep, 1–2 m segments | — |
| Small pond | 3×3 to 5×4 m, water 0.25–0.4 m below the rim, lily pads 0.2–0.4 m, lotus 0.15–0.25 m | — |
| Fallen leaves | 0.08–0.2 m each | — |
| Roots / stump | stump ⌀ 0.8–1.2 m, roots spreading 2–3 m | — |
| Grass patches | tufts 0.2–0.6 m tall, patches 0.5–1.5 m | — |
