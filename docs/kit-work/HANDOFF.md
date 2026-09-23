# World kit (sections 18–20): status and resume notes

Sections 18, 19 and 20 of the component plan are built as a voxel kit: every
numbered component of the five reference sheets and every environment / usage
panel. The user is inspecting them and will report what to change. To pick up
again, tell Claude **"continue the world kit from docs/kit-work/HANDOFF.md"**,
along with any feedback reports in `feedback/`.

## What exists

- **41 asset modules** in `src/kit/assets/` (see the size table in
  `docs/world-kit.md`):
  - §18.1: large, medium and small tree, palm, bush, dense jungle cluster, leaf and trunk variations, ground foliage
  - §18.2: grass, dirt, sandstone path, moss, lichen, fallen leaves, roots, small rocks, combination tiles
  - §19.1: six sandstone finishes
  - §19.2: six damage types
  - §20: eleven props
- **12 scenes** in `src/kit/scenes/`, one per example panel on the sheets.
  They are shown under each section's cards in the studio and laid out in
  `index.html?level=kit`.
- **Shared builders** in `src/kit/lib/`: ground, grass, leaves, roots, rocks
  and gallery façades.
- **Checks:**
  - `npm run kitcheck`: every variant builds, within budget.
  - `npm run typecheck`, `npm run build`, `npm run playtest`.

## Known gaps (candidates for the next round)

These come from the agents' final reports and the lead's review. The user's
reports take priority.

- **18.1:**
  - The bush clumps are more cube-like than the sheet's fluffy ones.
  - The jungle cluster has fewer, bigger crowns than the sheet (about 6 against about 10); its top view is a flat square.
  - Trunks from the shared broadleaf builder are straight, with the forks hidden in the crowns.
- **18.2:**
  - The sheet's root tiles have rounder, softer roots than ours.
  - The combination tiles' roots are thinner than the sheet's.
- **19.2:** the stone is cleaner and less mottled than the sheet's fine pit mosaic. A per-block pit amount in the stone pattern would help; the surface `vec4` is full.
- **20:**
  - The statue is blockier than the sheet's sculpture.
  - The altar uses slabs where the sheet builds it from cube blocks.
  - The lotus is real size, smaller than drawn.
- **Scenes:**
  - The paving tends to orange where the sheets are pale beige-grey.
  - Towers and galleries are stand-ins for later sections.
  - There is no per-scene light (the golden hour of the sheets).
  - `tree-roots-ground` has pale orange roots and trunk.
- **Infrastructure asked for by agents:**
  - a typed-array `VoxelGrid` (tree builds spend about 60% in its Map cells);
  - a "build without own ground" option for assets placed in scenes;
  - tint and collider options on the tree builders;
  - an off-grid warning in `BlockSet`;
  - a per-scene light preset;
  - spawn by name in the kit level.

## Size decisions

The sheets' size notes are estimates. The kit uses real sizes; each asset's
`size` field records `real`, `sheet` and `note`, and `docs/world-kit.md` lists
them all. The main ones:

| Asset | Built to | Sheet said |
| --- | --- | --- |
| Large tree | ≈ 22 m | 12–15 m |
| Medium tree | ≈ 11 m | 6–8 m |
| Small tree | ≈ 5 m | 3–4 m |
| Palm | 13–18 m | 8–10 m |
| Bush | 1.65 m tall, 3.2 m wide | |
| Jungle cluster | 16 × 16 m | |

Tiles are 1 m (combinations 2 m), sandstone blocks 0.5 m, and the props follow
the table in `BRIEF.md`.

## Working with agents

```bash
npm ci
pip install pillow numpy                      # reference crops / colour sampling
python3 docs/kit-work/crop-refs.py            # → screenshots/refs/<component>.png (2× crops of the sheets)
node docs/kit-work/devserver.mjs &            # shared no-HMR dev server on :5173 for parallel agents
npm run kitcheck                              # build every asset, report errors / budgets
python3 docs/kit-work/readme-images.py        # re-render the README's kit pictures
```

- `BRIEF.md` is the brief every asset agent reads: conventions, API,
  workflow, rules and the real-world size table. `BRIEF-SCENES.md` is the
  addendum for scene agents.
- `measure.py` samples colours from renders or sheets.
- The machine has 4 CPUs. Fourteen agents at once pushed the load to 40–55, and
  each took about 2 hours. Six to eight agents at a time is the sweet spot.
- Agents own disjoint files, never run formatters on globs, never run git, and
  keep their scratch files in their own subfolder of the shared scratchpad.
