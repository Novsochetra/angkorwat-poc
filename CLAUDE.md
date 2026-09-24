# Angkor Quest — notes for Claude

- Checks: `npm run typecheck`, `npm run build`, `npm run playtest` (headless play test).
- `npm run shots -- name="@index.html?shot=1&…"` renders a page headlessly into
  `screenshots/<name>.png`; view the PNG to check visual changes.
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
  scenes). Walk it at true scale with `index.html?level=kit`.
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
   slot, joint and block position in body units (part space).
3. Reproduce with the report's headless command
   (`npm run shots -- repro="@index.html?shot=1&at=…&cam=…"`), fix, and re-run it
   to compare. Then run the checks.
4. Delete the report's folder in the commit that fixes it, and name the report
   in the commit message.
