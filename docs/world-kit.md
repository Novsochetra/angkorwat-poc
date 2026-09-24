# World kit — sections 18, 19 and 20

The first components of the Angkor Wat reconstruction plan
(`Angkor Wat Voxel Bavel Reconstruction --- Component Plan.md`), built as a
reusable voxel kit: **§18 landscape / vegetation**, **§19 stone / material
system** and **§20 small props**. Every component is a module you can inspect
next to its reference sheet, walk around at true scale, and reuse to build the
temple.

## Inspecting it

```bash
npm install
npm run dev
```

| Page | What it shows |
| --- | --- |
| `studio.html` | The asset studio (index of sections and scenes). |
| `studio.html?section=18.1` (`18.2`, `19.1`, `19.2`, `20`) | A section laid out like its reference sheet: numbered cards, main render, variants, top view, real vs sheet size, and the section's scenes as its environment examples. `&refs=1` puts each card's sheet panel under it. |
| `studio.html?asset=18.1/large-tree` | One asset: big orbitable render **beside the crop of its reference sheet**, front / side / top views, a scale view next to the 1.70 m explorer with a metre ruler, every variant, block counts and the file that builds it. Add `&seed=3`, `&variant=…`, `&quality=high`, `&height=15` (assets sized by height). |
| `studio.html?lineup=18.1` | Every asset of a section side by side, to scale, with the explorer. |
| `studio.html?scene=tree-temple-wall` | A diorama that assembles the kit like one of the sheets' environment / usage examples (orbit it; `&az=&el=&dist=` tries another framing). `studio.html?scenes=1` lists them all. |
| `index.html?level=kit` | Walk the explorer through a specimen garden of every asset and the dioramas at true scale. Keys `1`–`9` and `[` `]` jump between garden rows and scenes; the HUD names the asset you are standing next to and its size. |

Report anything with **B** (or 🐞) on any of these pages: click the blocks that
are wrong, write what you expected, save. The report lands in `feedback/` and
names the exact line of the asset module that made each block.

## How it's built

- **Pixel-art surfaces (§19)** — the kit's material families (`sandstone`,
  `soil`, `leaves`, `trunk`, `water`…) draw a texture of 1/16 m texels on every
  face in the shader: a 3–4 tone speckle and pores, then per-block amounts of
  moss (on tops, creeping down), lichen, crack lines and dark weathering streaks
  for stone; grass cover with drips over the edges for soil; flowers and
  yellowing for leaves. One block per stone gets the sheets' textured look, so
  walls stay cheap. See `src/voxel/materials.ts` and `src/kit/surface.ts`.
- **Damage (§19.2)** — `src/kit/BlockSet.ts` lays masonry (staggered joints)
  and damages it: `remove` (missing block), `carve` / `carveSphere` (broken
  corners, bites), `erode` (worn edges). Damaged blocks are emitted as merged
  cells that still read as one stone, the broken faces in rougher stone.
  Sandstone blocks have flat-cut (chamfered) edges, 10 % of the block, and a
  chiselled, matte surface (`chamfer`, `relief` and `specular` in
  `src/voxel/materials.ts`; every world family shares them);
  neighbouring stones touch, and the cells of a damaged block keep the chamfer
  of the whole stone.
- **Colours** — `src/kit/palette.ts`, sampled from the sheets and corrected in
  linear light so the studio render matches the sheets (`fromSheet()` does the
  correction for any colour sampled off a sheet).
- **Assets** — one module per numbered component,
  `src/kit/assets/<section>/<slug>.ts`, default export `defineKitAsset({…})`.
  The registry finds them by file; helpers start with `_`. Shared builders live
  in `src/kit/lib/` (ground tiles, grass, leaves, roots, rocks, gallery walls).
- **Scenes** — `src/kit/scenes/<slug>.ts` compose assets (`defineKitScene`),
  shown by the studio and laid out in the kit level.
- **Placing** — `src/kit/place.ts` moves / quarter-turns pieces (voxels,
  colliders, extras) into a bigger build.

Conventions: 1 unit = 1 m; the piece's origin is the centre of its footprint
on the ground (ground tiles: walkable top at y = 0); the front faces +Z; blocks
sit on the 1/16 m texel grid; builds are deterministic from `seed`.

## Sizes: real world vs the sheets

The reference sheets' size notes are estimates, and several are off. The kit
builds to real-world sizes (1.70 m explorer, 0.5 m sandstone blocks, 65 m
central tower) and keeps the sheets' proportions and look. Each asset records
both in its `size` field; the studio shows them on every card.

<!-- SIZE TABLE -->
| § | Asset | Built to (real world) | Sheet said | Why |
| --- | --- | --- | --- | --- |
| 18.1 1 | Large tree | ≈ 22 m tall (18–26 m by seed), canopy ≈ 20 m, fluted trunk ≈ 4.5 m across, buttress roots spreading ≈ 12 m (surface roots to ≈ 16 m) over 0.5 m sandstone blocks | 12–15 m | Angkor’s giant trees — Tetrameles nudiflora at Ta Prohm, strangler figs, Dipterocarpus alatus — reach 25–45 m; 12–15 m would barely clear the temple galleries, so the tree is built at 22 m with the sheet’s proportions (hence the massive trunk and wide root plate). The blocks at its foot keep their real 0.5 m courses, so they look smaller than on the sheet. |
| 18.1 2 | Medium tree | ≈ 11 m tall (9.5–12 m by seed), canopy ≈ 9–10 m, trunk 1.5 m flaring to ≈ 2.5 m | 6–8 m | Mid-size tropical trees around Angkor (tamarind, mango, young dipterocarps) grow 10–15 m tall on 1–1.5 m trunks; a 6–8 m tree would barely top a gallery roof. Shape and proportions follow the sheet, its stout flared trunk included. |
| 18.1 3 | Small tree | ≈ 5 m tall (4–6.5 m by seed), canopy ≈ 4–4.5 m, trunk 0.75 m | 3–4 m | A young tree that already shades the explorer stands 4–6.5 m; at 3–4 m it would be a large shrub. The sheet draws the canopy as wide as the tree is tall; here it is ≈ 0.8 × the height, its hanging side clumps held clear of the trunk so the limbs show. |
| 18.1 4 | Palm tree | 13–18 m tall (≈15 m, by seed), trunk ⌀ 0.55–0.7 m; crown 8–10 m (4–5 m fronds), sugar palm ≈6.5 m | 8–10 m | Mature palms are taller than the sheet says: coconut-type palms reach 15–25 m with 4–6 m fronds, and Angkor’s sugar palms (Borassus flabellifer, Cambodia’s national tree) stand 15–20 m, up to 30 m; an 8–10 m palm would look like a sapling beside the temple. The sheet’s look is kept at real size: ringed trunk on a stepped foot, a full crown of arching fronds, dead fronds and fruit under it. |
| 18.1 5 | Bush | ≈1.65 m tall, ≈3.2 × 2.5 m; the shrub ≈1.15 m (bushes 1–2 m tall, 2–3.5 m wide) | 1–2 m | The sheet’s height is right; the clumps spread about twice as wide as they are tall, like the drawing. The stones are 0.2–0.5 m fallen blocks. `height` scales the whole bush, stones included. |
| 18.1 6 | Dense jungle cluster | ≈ 16 × 16 m patch (edge strip 16 × 7 m), crowns overhanging to ≈ 19 m; big trees 9.5–19 m (the tallest 17–21 m by seed), young ones 6–8 m, a 15 m palm, shrubs and bushes 1.4–3 m, blocks 0.5–0.6 m high and up to 1.75 m long | not given | The sheet gives no size. Angkor’s forest has a canopy at 15–25 m under emergents of 30 m and more; a 16 m patch holding five big trunks, two young trees, a palm and the undergrowth keeps the crowns touching, as drawn. The sheet draws the cluster a little wider than tall, so the tallest tree stands 19 m by default rather than 22. `height` sets the tallest tree; the others scale with it. |
| 18.1 7 | Leaf variations | 1 m sample cube of 1/8 m leaf clusters (proud ones stand a texel out) | not given | A sample of canopy, big enough for about three clusters across a face, like the sheet’s cubes; the trees and the bush skin their crowns with the same plus-shaped clusters. |
| 18.1 8 | Trunk variations | 1.7–1.9 m lengths, 0.5–0.95 m thick above the flare (0.75–1.4 m at the foot); roots spread ≈ 1.6–1.8 m | not given | Cut lengths of the trees’ trunks: a medium tree’s 0.6 m trunk, a large tree’s ≈1 m trunk and its buttress roots, a sugar palm’s 0.5 m trunk on its swollen foot. |
| 18.1 9 | Ground foliage | grass tuft 0.5 m on a 0.6 m mat, small plant 0.55 m, fern ≈ 0.8 m across × 0.5 m, leaf pile ⌀ 0.6 m × 0.3 m, root mound ≈ 1.2 × 0.5 m, mossy rock ≈ 0.6 × 0.5 m | not given | Built to the real plants and stones of the forest floor: grass clumps 0.3–0.6 m, a half-metre sapling, a sword fern’s arching fronds, a heap of fig and dipterocarp leaves (12–20 cm), a stump broken off low with its buttress roots, a knee-high boulder. Blades, leaflets and leaves are one 1/16 m texel wide like every kit surface (the sapling’s cells half that, so its leaves keep the sheet’s stepped outline). |
| 18.2 1 | Grass | 1 × 1 m tile, 0.5 m of soil; tufts 19 cm, tall grass to 60 cm | not given | Ground tiles are 1 m squares on the 1/16 m texel grid (the sheet’s top view counts 16 × 16 texels); 0.5 m of soil like the other §18.2 tiles, the walkable top at y = 0. |
| 18.2 2 | Dirt | 1 m × 1 m tile, 0.5 m of soil | cube ≈ 1 × 0.7 m | The kit’s ground grid: 1 m tiles, walkable top at y = 0 and 0.5 m of soil, so every ground tile lines up; the sheet draws its cubes a little deeper. |
| 18.2 3 | Sandstone path | 1 m × 1 m tile, slabs 0.2–0.5 m, 0.25 m thick | cube ≈ 1 × 0.7 m | Causeway paving at Angkor Wat is sandstone slabs of roughly 0.3–0.6 m; the tile keeps the kit’s 1 m grid, walkable top at y = 0, 0.5 m deep. |
| 18.2 4 | Moss | 1 m × 1 m tile, 0.5 m deep; cushions up to 12 cm | cube ≈ 1 × 0.7 m | The kit’s ground grid: 1 m tiles, walkable top at y = 0 (moss cushions stand 6–12 cm proud), 0.5 m deep so every ground tile lines up. |
| 18.2 5 | Lichen | 1 m × 1 m tile, 0.5 m deep; rosettes 25–40 cm | cube ≈ 1 × 0.7 m | The kit’s ground grid: 1 m tiles, walkable top at y = 0 (the lichen crust stands one texel proud), 0.5 m deep so every ground tile lines up. Crustose lichen rosettes on Angkor’s sandstone grow a few cm to ~0.4 m across. |
| 18.2 6 | Fallen leaves | 1 m × 1 m tile, 0.5 m of soil; leaves 0.09–0.26 m | not given (leaves ≈ ¼ of the tile) | The kit’s ground grid: 1 m tiles, walkable top at y = 0 and 0.5 m of soil. The sheet’s big leaves span about a quarter of the tile, i.e. 0.25 m — the size of real dipterocarp and fig leaves (15–25 cm) — so they are built at that size, small ones down to 9 cm. |
| 18.2 7 | Roots | 1 m × 1 m tile, 0.5 m of soil; roots 6–18 cm thick, a stump ⌀ 30 cm | — | The kit’s ground grid: 1 m tiles, walkable top at 0. The stump is a small one so it fits a tile. |
| 18.2 8 | Small rocks | 1 m × 1 m tile, 0.5 m of soil; stones 6–31 cm across, up to 19 cm above the soil (the cluster’s big stone 38 cm across, 31 cm high) | not given | Ground tiles are 1 m squares with 0.5 m of soil like the other §18.2 tiles (the sheet draws its cube deeper). Stones follow the sheet’s top view on the 1/16 m texel grid, rebalanced so no stone dominates: six of 19–31 cm, the rest 6–13 cm, all a texel clear of the tile’s edge so neighbouring tiles join cleanly. |
| 18.2 9 | Combination examples | 2 m × 2 m tiles, 0.5 m of ground; grass patches ≈ 0.4–0.5 m, 12 cm proud; slabs ≈ 0.5 m; leaves 0.1–0.36 m; root 0.36 m thick where it enters, its limbs 0.2–0.3 m; rocks 0.2–0.38 m | not given (drawn as 2 × 2 tile blocks) | Four of the kit’s 1 m ground tiles side by side, painted as one surface: the same 1/16 m texels, 0.5 m of ground and walkable top at y = 0 as the §18.2 tiles, so they sit in a field of them. |
| 19.1 1 | Clean sandstone | 0.5 m blocks (1.5 m sample cube) | not given | Angkor Wat’s sandstone blocks run 0.4–0.6 m high and 0.5–1.2 m long; the kit lays 0.5 m blocks (TEMPLE_BLOCK_M). |
| 19.1 2 | Warm sandstone | 0.5 m blocks (1.5 m sample cube) | not given | Angkor Wat’s sandstone blocks run 0.4–0.6 m high and 0.5–1.2 m long; the kit lays 0.5 m blocks (TEMPLE_BLOCK_M). |
| 19.1 3 | Dark sandstone | 0.5 m blocks (1.5 m sample cube) | not given | Angkor Wat’s sandstone blocks run 0.4–0.6 m high and 0.5–1.2 m long; the kit lays 0.5 m blocks (TEMPLE_BLOCK_M). |
| 19.1 4 | Cracked sandstone | 0.5 m blocks (1.5 m sample cube) | not given | Angkor Wat’s sandstone blocks run 0.4–0.6 m high and 0.5–1.2 m long; the kit lays 0.5 m blocks (TEMPLE_BLOCK_M). |
| 19.1 5 | Weathered sandstone | 0.5 m blocks (1.5 m sample cube) | not given | Angkor Wat’s sandstone blocks run 0.4–0.6 m high and 0.5–1.2 m long; the kit lays 0.5 m blocks (TEMPLE_BLOCK_M). |
| 19.1 6 | Moss-covered sandstone | 0.5 m blocks (1.5 m sample cube) | not given | Angkor Wat’s sandstone blocks run 0.4–0.6 m high and 0.5–1.2 m long; the kit lays 0.5 m blocks (TEMPLE_BLOCK_M). |
| 19.2 1 | Broken corner | 1.0 × 1.0 m, 1.0 m high (0.5 m blocks) | not given | Angkor Wat’s sandstone blocks run 0.4–0.6 m high and 0.5–1.2 m long; the sheet’s neat two-by-two-by-two stack of the kit’s 0.5 m blocks (TEMPLE_BLOCK_M) is a 1 m cube. Its top front-right stone has lost its top in 1/8 m terraces, its outer corner down to 0.44 m. |
| 19.2 2 | Missing block | 1.75 × 0.875 m, 1.25 m high (0.5 m blocks on a 0.25 m footing) | not given | Built from real 0.5 m sandstone blocks (TEMPLE_BLOCK_M): two courses of 0.5 m face stones backed by 0.375 m ones, on a footing course that gives the hole its sill, so the gap of the missing 0.75 × 0.5 × 0.5 m face stone reads as a deep recess with the stone behind it in shadow, as on the sheet. |
| 19.2 3 | Cracked block | 1.75 × 1.0 m, 1.0 m high (0.5–0.75 m blocks) | not given | Real sandstone blocks (0.5 m courses, 0.44–0.75 m long); cracks are one texel (6 cm) gaps so they read at game distance like the sheet’s dark lines. |
| 19.2 4 | Eroded edge | 0.5 m blocks; wall 1.75 × 1 m, 1.5 m high | not given | Built from the kit’s 0.5 m sandstone blocks (Angkor’s run 0.4–0.6 m high); the wear notches are 1/8 m terraces with 1/16 m chips, like the sheet. |
| 19.2 5 | Collapsed decorative piece | frieze 1.75 × 0.375 m, 0.94 m high; lintel 1.5 m long, 1 m high; pediment corner 1.25 m | not given | Laid in the kit’s sandstone courses — a 0.5 m storey, a 0.19 m band projecting 1/16 m, a 0.25 m crest of 0.375–0.5 m stones — 0.375 m deep like a lintel; Angkor’s lintels run 1.2–2 m. Reliefs are cut on the 1/16 m texel grid, one to two texels deep (the niche three), in bold motifs five to seven texels wide so they read at card size. |
| 19.2 6 | Dark weathering | 0.5 m blocks; block 1.5 × 1 m, 1 m high; pillar 1.75 m | not given | Built from the kit’s 0.5 m sandstone blocks (Angkor’s run 0.4–0.6 m high); the pillar is a half-block shaft on a base, like the sheet’s. |
| 20 1 | Stone fragments | pieces 19–50 cm (chips from 6 cm), the group ≈ 2.4 × 2.4 m | not given | Debris broken off 0.5 m temple blocks: the sheet’s biggest chunk is about one block wide, the smallest under half that. The sheet groups them closely, so they lie 12–25 cm apart in a 2.4 m square. |
| 20 2 | Fallen architectural blocks | blocks 0.5 × 0.5 × 1.0 m, lintels 1.25–1.9 m, drums ⌀ 0.5 m; a heap about 3 × 1.4 m, 1 m high | not given | Sized from Angkor Wat’s masonry: 0.4–0.6 m courses, blocks up to about a metre long, lintels spanning 1.2–2 m doorways, colonnettes about half a metre across. |
| 20 3 | Broken statue | seated Buddha 1.28 m with its 0.19 m pedestal (head 0.44 m chin to topknot, lap 1.12 m wide); guardian torso 0.9 m | not given | Khmer seated Buddhas of the Angkor Wat period are about life size, 1.2–1.4 m with the pedestal; a dvarapala guardian is ~1.8 m whole, so its torso fragment is ~0.9 m. |
| 20 4 | Small shrine | 2.3 m tall on a 1.25 m plinth (1.8–2.4 m tall, 1.0–1.4 m wide) | not given | Wayside prasat shrines and neak ta spirit shrines at Angkor stand about head height to a little above; the sheet’s tall proportions (about twice as tall as wide) are kept. |
| 20 5 | Offering platform | 1.25 × 0.75 m, 0.5–0.56 m high; joss sticks 0.3 m, candles 0.1–0.15 m | not given | Altars in front of Angkor’s shrines and Buddhas are knee to thigh high, about a stride long; offerings are at their real size. |
| 20 6 | Stone steps | risers 0.25 m, treads 0.31 m; flights 1.5–2 m wide (2.25 m with cheek walls), 4–5 steps, 1–1.25 m high | not given (drawn as cube blocks, riser = tread) | Khmer stairs are steep but still stairs: 0.2–0.25 m risers and 0.3–0.35 m treads. The sheet draws each step as a row of cube blocks; built to real risers so the 1.70 m explorer climbs them (0.42 m step-up), with half-metre blocks three or four to a step like the sheet’s. |
| 20 7 | Drainage channel | 0.63 m wide, 0.31 m deep (lip 0.375 m); segments 1–2 m | not given (drawn with 0.5 m blocks) | Temple drains run about half a metre across and 0.35 m deep, so the walls are small 0.19 m blocks, not the 0.5 m wall blocks the sheet draws; the lip stays under the explorer’s 0.42 m step-up. |
| 20 8 | Small pond | 4.5 × 3.5 m basin (small 2.25 m, round 4 × 3.5 m), 0.5 m blocks, water 0.31 m below the rim | not given (≈ 4 × 3.5 m by its blocks) | Small temple basins and garden ponds run 3–5 m; the sheet’s rim reads as one course of 0.5 m blocks, which fixes its scale. Lily pads 0.25–0.4 m; the lotus is built to real size (0.22–0.28 m, where the sheet draws it ~0.45 m) in half-texel cells. |
| 20 9 | Fallen leaves | leaves 0.1–0.21 m; rosettes 0.35–0.5 m across; litter patch ≈ 1.3 × 1 m | not given | Built to real leaf size: Angkor’s trees (dipterocarps, figs) drop leaves 15–25 cm long, the small ones less. The sheet’s stylised lobed leaves keep their outline at that size; a rosette of 6–12 of them spans about half a metre. |
| 20 10 | Roots | stump ⌀ 0.9 m (1.2 m over the flare), 1.2–1.3 m tall, roots reaching ~1.5 m from its axis (≈ 3 m across); clusters ~2 m long, up to 0.65 m high | not given | A big rainforest tree broken off above its root flare, as tall as the sheet’s stump is to its width; the clusters are root masses a person steps around. |
| 20 11 | Grass patches | tufts 0.3–0.7 m tall, patches 0.7–1.6 m across | not given | Blades are one 1/16 m texel wide like every kit surface, so a tuft is 5–11 texels tall — knee-high tropical grass beside the 1.70 m explorer (the sheet draws its tufts with 10–13 rows). |
<!-- /SIZE TABLE -->

## Scenes

Each environment / usage panel of the sheets is a scene: kit assets placed on
their own ground, with stand-ins for architecture that belongs to later
sections (towers, galleries, terraces). Each scene is also walkable in the kit
level.

<!-- SCENE TABLE -->
| Scene | Recreates | Size | Page |
| --- | --- | --- | --- |
| Dense jungle | 18.1 Trees · Environment examples · Dense jungle vegetation | 30 × 24 m | `studio.html?scene=dense-jungle` |
| Palm trees along causeway | 18.1 Trees · Environment examples · Palm trees along causeway | 40 × 50 m | `studio.html?scene=palm-causeway` |
| Tree near temple wall | 18.1 Trees · Environment examples · Tree near temple wall | 32 × 22 m | `studio.html?scene=tree-temple-wall` |
| Ground near trees | 18.2 Ground · In-game usage examples · Natural ground detail near trees | 20 × 20 m | `studio.html?scene=tree-roots-ground` |
| Temple path | 18.2 Ground · In-game usage examples · Temple path with moss and grass | 20 × 30 m | `studio.html?scene=temple-path` |
| Sandstone gallery | 19.1 Sandstone · Usage examples | 40 × 24 m | `studio.html?scene=sandstone-gallery` |
| Damaged wall | 19.2 Stone damage · Combination examples · Multiple damage types combined | 22 × 12 m | `studio.html?scene=damaged-wall` |
| Aged temple | 19.2 Stone damage · In-game usage examples · Aged temple structure with various damage | 18 × 16 m | `studio.html?scene=aged-temple` |
| Weathered gallery wall | 19.2 Stone damage · In-game usage examples · Weathered gallery wall | 30 × 14 m | `studio.html?scene=weathered-gallery` |
| Fragments and vegetation | 20 Small props · Environment examples · Fragments and vegetation | 16 × 14 m | `studio.html?scene=fragments-vegetation` |
| Small shrine with offerings | 20 Small props · Environment examples · Small shrine with offerings | 14 × 12 m | `studio.html?scene=shrine-offerings` |
| Steps, drainage and pond | 20 Small props · Environment examples · Steps, drainage and pond | 20 × 16 m | `studio.html?scene=steps-drainage-pond` |
<!-- /SCENE TABLE -->

## Adding to the kit

1. Read `docs/kit-work/BRIEF.md`, the brief every asset follows. It covers
   conventions, the API, the workflow and the real-world size table. For
   scenes, also read `BRIEF-SCENES.md`.
2. Create `src/kit/assets/<section>/<slug>.ts` (or `src/kit/scenes/<slug>.ts`).
   It shows up in the studio, the kit level and `npm run kitcheck` with no
   registration.
3. Compare it with its sheet crop (`studio.html?asset=…`) and iterate. Sample
   colours with `docs/kit-work/measure.py` and wrap them in `fromSheet()`.
4. Run `npm run kitcheck` and `npm run typecheck`, then refresh these tables
   with `node scripts/kit-sizes.mjs --write`.

`docs/kit-work/` also holds the tooling for building assets with parallel
agents: the shared dev server, reference crops and the handoff notes.
