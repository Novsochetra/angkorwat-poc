# Architecture kit brief — sections 15, 16, 17 and 21 (read after BRIEF.md)

This round builds the temple's **architecture kit**: **§15 wall system**, **§16
terrace system**, **§17 moat & water** (17.1 moat, 17.2 water details) and **§21
voxel building kit** (21.1 basic blocks, 21.2 architectural elements, 21.3 large
modules). Read `docs/kit-work/BRIEF.md` first — its conventions, API notes,
studio workflow and rules all apply — then this file, which overrides it where
they differ.

**No environment / usage-example scenes this round.** The sheets' "Example
assemblies", "Combination example", "In-game example" and "Placement examples"
panels are only there to show you how the pieces are used together. Do not
build scenes (`src/kit/scenes/`).

## Local setup (differs from BRIEF.md)

- The repo is `/Users/sochetranov/Documents/workspace/personal/angkorwat-poc`
  (BRIEF.md says `/home/user/angkorwat-poc`: read it as this path).
- A shared dev server (no HMR) already runs on **http://localhost:5173**. Do not
  stop it or start another one on that port.
- Screenshots (the script finds Playwright's Chromium on this Mac by itself):

  ```bash
  cd /Users/sochetranov/Documents/workspace/personal/angkorwat-poc
  SHOT_BASE=http://localhost:5173 SHOT_W=1600 SHOT_H=1000 SHOT_FULL=1 SHOT_OUT=screenshots/<yourname> \
    node scripts/screenshots.mjs main="@studio.html?asset=15/small-wall&shot=1" \
                                 sheet="@studio.html?section=15&shot=1&refs=1"
  ```
- The kit QA script needs the browser path on this Mac:

  ```bash
  CHROMIUM="$HOME/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" \
    SHOT_BASE=http://localhost:5173 node scripts/kit-check.mjs 15
  ```
- Typecheck with `npx tsc --noEmit` and **only look at your own files**
  (`npx tsc --noEmit 2>&1 | grep -E 'src/kit/(assets/15/|lib/wall)'`).
  Another Claude session works in this same checkout on other things
  (`src/map/`, the world-map selection screen): its files may not compile
  mid-work. Never touch them.
- The machine has 10 CPUs shared by ~15 agents. Headless renders are software
  GL: batch several shots into one command, don't re-shoot without a change.
- Scratch files: `/private/tmp/claude-501/-Users-sochetranov-Documents-workspace-personal-angkorwat-poc/98758a7e-202f-48c2-87f8-df72d0bf42d8/scratchpad/<yourname>/`.

## Sections, sheets and reference crops

| Section id | Sheet (under `assets/angkor detail/`) |
| --- | --- |
| `15` | `section 15/ChatGPT Image Sep 22, 2026, 10_38_08 AM.png` |
| `16` | `section 16/51F119C4-CD9A-4DB5-BCFD-840E8D3A151C.PNG` |
| `17.1`, `17.2` | `section 17/9CD32C14-908E-487E-9287-BF45055F93A6.PNG` (sheet A: both 17.1 and 17.2) and `section 17/B65034CE-0DD5-499B-B913-792827EFB323.PNG` (sheet B: 17.1 again, water colour variations, shore detail variations) |
| `21.1` | `section 21/Codex Image Sep 22, 2026, 12_44_48 PM.png` (detailed) |
| `21.2` | `section 21/Codex Image Sep 22, 2026, 12_46_24 PM.png` (detailed) |
| `21.3` | `section 21/Codex Image Sep 22, 2026, 12_48_32 PM.png` (detailed) |
| (21 overview) | `section 21/A0BE3E10-53DB-4C20-B81F-F9F8227B8AAA.PNG` — all 21.x items small, a second opinion on their look |

2× crops of every component are in `screenshots/refs/` (made by
`docs/kit-work/crop-refs.py`, which also lists every crop box):
`15-<slug>.png`, `16-<slug>.png`, `17.1-<slug>.png` (sheet A) and
`17.1-<slug>-b.png` (sheet B), `17.2-<slug>.png`, `21.1-<slug>.png`,
`21.2-<slug>.png`, `21.3-<slug>.png` (detailed sheets) and `…-o.png` (the
overview sheet). Full sheets: `sheet-15.png`, `sheet-16.png`, `sheet-17.png`,
`sheet-17b.png`, `sheet-21.png`, `sheet-21.1.png`, `sheet-21.2.png`,
`sheet-21.3.png`. Your task gives the `ref` box of each of your components.

## Sizes: the sheets are often wrong — finding the right size is your job

The sheets were drawn by an image model. **Their size labels and even their
drawn proportions are often wrong** (a doorway too low for a person, a wall
only two blocks thick, stairs far too steep, a "1 × 2" block drawn 1 × 3,
balusters too few, water depth that makes no sense). Take the **look**
(silhouette, style, colour, details, how pieces combine) from the sheet, and
the **size** from the real Angkor Wat:

1. Read `docs/kit-work/SIZES-ARCH.md` — real Angkor Wat measurements and a
   shared **kit standard** (course heights, wall thickness, door and window
   sizes, terrace and stair heights, naga, lions, moat…), researched with
   sources. It keeps every agent's pieces fitting together.
2. Check it for your own components. If you find better evidence (a measured
   source, a photo with a person or a known block for scale), use it and say
   why. Web search is allowed (load with ToolSearch `select:WebSearch,WebFetch`).
3. Check against the explorer (1.70 m, climbs ledges up to 0.42 m): the
   studio's scale view puts your piece next to them with a metre ruler.
   Doorways must be walkable, ordinary stairs climbable.
4. Record the decision in the asset's `size`: `real` (what you built),
   `sheet` (what the sheet says or implies), `note` (why they differ).

If you change a number of the kit standard, keep the change inside your own
files and report it; don't edit `SIZES-ARCH.md`.

## Architecture look and conventions

- **Stone:** the §19.1 finishes are the temple's stone. Lay walls, terraces and
  modules with `DryMasonry` + `finishLook(STONE_FINISH.<finish>, seed)` from
  `src/kit/lib/gallery.ts` (one box per stone, tight joints drawn by the
  bevels, running bond, knock-outs / cracks / chips), or `BlockSet` +
  `masonry()` when you need carved damage (§19.2). Pick the finish closest to
  your sheet (the §15/§16/§21 sheets read as warm, weathered stone with moss
  on the tops); give finish variants (e.g. Clean / Weathered / Mossy) where
  they make sense. Sample your sheet with `measure.py` and use `fromSheet()`
  only where the finishes clearly don't match (e.g. a carving's shadowed
  recesses). Keep one temple: pieces of different sections must look like the
  same stone.
- **Blocks:** the kit's sandstone block is 0.5 m (`TEMPLE_BLOCK_M`), real
  courses 0.4–0.6 m high and blocks 0.5–1.2 m long. Everything on the 1/16 m
  texel grid; architecture dimensions on 0.125 m (better 0.25 m) where
  practical.
- **Details that make it Khmer:** moulded plinths and cornices (stacked
  projecting courses), pilasters, lintels over openings, lathe-turned balusters
  in windows (`baluster()` in `lib/gallery.ts`), redented corners, lotus-bud
  finials, antefixes. Carvings are shallow reliefs cut a texel or half a texel
  into the face (or proud of it) in a darker recess tone.
- **Modules must fit together.** Piece space as in BRIEF.md: origin at the
  footprint centre, y = 0 at the ground under the piece, front faces +Z, +X
  right. Straight modules (wall segments, terrace walls, parapets, gallery,
  causeway and moat sections) **run along X with their ends at exactly
  x = ±L/2**, so they tile by placing the next one at x + L, and L is a whole
  number of 0.5 m blocks (better a whole bay). Corners and junctions join
  straight modules by quarter turns (`src/kit/place.ts`). The shared libraries
  below define the exact contracts; follow them.
- **Colliders:** solid AABBs for walls, piers, terraces and statues (walkable
  tops at their real height); stairs as one collider per step (risers ≤
  0.42 m, so the explorer can climb them); water `noStand`, the bed walkable.
  A doorway must stay open in the colliders.
- **Variants:** the sheet's sub-items (21.3's Short / Medium / Long, Inner /
  Outer corner, Small / Medium / Large gopura, Base / Mid / Top tier…, 17.1's
  Clear / Blue / Green / Dark / Muddy water and Grassy / Sandy / Rocky /
  Overgrown / Temple embankment shores…) plus finish or wear variants where
  useful. Cards: `shots` for the front, side and top views the sheet shows.
- **Budgets** (blocks per variant; builds < ~300 ms): basic block ≤ 1.5k;
  architectural element ≤ 6k (naga ≤ 10k, lion ≤ 8k); wall / terrace piece ≤
  8–10k; water tile ≤ 5k; large module ≤ 40k. `npm run kitcheck` reports them.
  Use one box per stone and per flat water area; small cells only for
  silhouettes and carvings.

## Shared libraries: who builds what

Some agents own a **shared library** (`src/kit/lib/<name>.ts`) that later
agents build on. If you own one:
- Design its API first and keep it small and stable: typed options with
  real-world defaults from the kit standard, one function per part, returning
  or adding to a `PieceBuilder` (like `galleryFacade`, `waterBody`).
- Document it at the top of the file: what it builds, the placement contract
  (where the piece's faces, ends and walkable tops are), and a short usage
  example.
- Build your own assets with it (they are its test cases).
- Your final report must describe the API precisely: later agents read it.

If you use another agent's library: import it, don't copy or edit it. If it is
missing something, build the extra part in your own files and report what the
library should gain.

| Library | Owner (task) | Builds | Used later by |
| --- | --- | --- | --- |
| `lib/wall.ts` | §15 core walls | wall stack (foundation / main / upper block), straight segments, thickness, corners, end caps, openings cut through | §15 openings and decorative walls, §16, §21.3 |
| `lib/terrace.ts` | §16 core terraces | stepped moulded terrace bodies, paved walkable tops, platforms | §16 edges and stairs, §21.3 terrace / tower |
| `lib/water.ts` | §17.1 core water | moat water tiles (surface, shallow, deep, colour variations), built on `src/kit/assets/20/_pond.ts` (`waterBody`, `pondFlora`…) | §17.1 shore, §17.2, §21.3 moat |
| `lib/openings.ts` | §21.2 pillar / window / door | pillar, baluster window frame, door frame | §15 openings, §16 parapet, §21.3 |
| `lib/stair.ts`, `lib/roof.ts` | §21.2 stair / roof tile / roof tier | stair flights with side walls, roof tiles, stepped roof tiers | §16 stair, §21.3 |
| `lib/carving.ts` | §21.2 cornice / lintel / pediment | mouldings, relief patterns, lintel and pediment builders | §15 decorative wall, §16 decorative blocks, §21.3 |
| `lib/naga.ts` | §21.2 naga | naga balustrade body, posts, seven-headed hood | §21.3 causeway / terrace |
| `lib/lion.ts` | §21.2 lion | guardian lion on its pedestal | §21.3 |
| `lib/tower.ts` | §21.2 tower tier | redented prasat tower tiers, lotus-bud top | §21.3 tower / gopura |

Existing libraries to reuse: `lib/gallery.ts` (`DryMasonry`, `finishLook`,
`baluster`, `coursesOf`, `galleryFacade`, `overgrow` for moss and grass on
ledges), `BlockSet.ts`, `lib/grass.ts`, `lib/leaves.ts`, `lib/rocks.ts`,
`lib/roots.ts`, `src/kit/assets/20/_pond.ts` (water, lily pads, lotus),
`src/kit/assets/20/stone-steps.ts`, `src/kit/assets/20/_shrine.ts` and
`_masonry-props.ts` (moss clumps, pores, tufts), `src/kit/assets/18.1/*` (bushes,
plants).

## Rules (in addition to BRIEF.md's)

- Create or edit **only the files your task lists**. `src/kit/types.ts`,
  `registry.ts`, the studio, the scripts and other agents' files are
  read-only for you.
- No git commands that change anything. No formatters on globs. Don't delete
  files you didn't create.
- Iterate against the sheet: build → screenshot the asset page and the section
  page → compare with the crop → fix, several rounds, every variant and view.
- **Final report** (your last message): files created; each asset and variant
  and how it maps to the sheet; block counts and build times; size decisions
  (real vs sheet, why); your library's API (if you own one); gaps vs the
  sheet; infra changes you'd want; paths of your final screenshots.
