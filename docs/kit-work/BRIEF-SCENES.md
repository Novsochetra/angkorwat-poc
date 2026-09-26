# Scenes addendum (read after BRIEF.md)

Scenes are dioramas that assemble kit assets into the sheets' "Environment /
usage examples". They are shown in the studio (`studio.html?scene=<slug>`, a
perspective orbit view over a sky, warm studio light) and laid out at true
scale in the walkable level (`game.html?level=kit`, where the explorer walks
through them — so they need colliders and a sensible spawn).

## API
- `src/kit/scene.ts`: `defineKitScene({ name, caption, source, size: [w, d], camera: {az, el, dist, target}, spawn: {x, z, yaw}, async build(ctx, p) {…} })`.
  One module per scene: `src/kit/scenes/<slug>.ts` (default export). Helpers go in
  `src/kit/scenes/_<name>.ts` or your own `src/kit/lib/<name>.ts` if you were told to create one.
- `ctx.get('18.1/large-tree', { variant, seed, height })` → `Promise<KitPiece | null>` builds an
  asset (null if it doesn't exist / fails — skip it gracefully).
- Put pieces in with `placePiece({ voxels: p.voxels, collider: (c) => p.colliders.push(c), extra: (o) => p.extras.push(o) }, piece, { x, y, z, turn })`
  from `src/kit/place.ts` (turn = quarter turns; 1 turns the piece's front +Z to face +X).
  `footprint(piece, turn)` gives its footprint.
- You may also import assets' exported builder functions / lib builders directly
  (e.g. `src/kit/lib/gallery.ts` `galleryFacade({length, finish, seed, gallery, door, openEnds})` for
  temple gallery walls with baluster windows; `BlockSet` + `masonry` + `STONE_FINISH` for
  walls, terraces, paving; lib/grass, lib/leaves, lib/roots, lib/rocks, lib/ground).
- Scene space: origin at the centre of `size` (w along x, d along z), ground at y = 0,
  the viewer / camera side is +Z. Give the scene its own ground (paving, soil tiles or a
  big `soil` block with grass) covering `size`, top at y = 0, with a collider.
- `source` must start with the section number and a space, e.g. `'18.2 Ground · In-game usage examples · Temple path with moss and grass'`:
  the studio's section page (`studio.html?section=18.2`) shows the section's scenes under its cards,
  like the sheet's example panels, by that prefix (screenshots include them with `&examples=1`).
- `camera`: azimuth / elevation in degrees (azimuth 0 = looking from +Z), distance in metres,
  target in scene space — frame it like the sheet's panel.
- `spawn`: where the explorer should arrive (scene space) and which way it faces
  (degrees, 0 = facing +Z, 180 = facing −Z into the scene).
- Budget: ≤ 60k blocks per scene; build < 1.5 s.

## Look
Match the sheet panel's composition and mood: which assets, how they overlap, the
density of vegetation, moss and debris, the warm late-afternoon light. Architecture
that belongs to later sections (towers, nagas, lions) isn't built yet — use simple
stand-ins (gallery façades, masonry walls, stepped terraces, tiered blocks) or leave it
out; don't spend long on it. The kit assets are the stars.

## Checking
`SHOT_BASE=http://localhost:5173 SHOT_W=1600 SHOT_H=1000 SHOT_OUT=screenshots/<you> node scripts/screenshots.mjs s1="@studio.html?scene=<slug>&shot=1"`
and walk-level views: `k1="@game.html?level=kit&shot=1&at=X,Y,Z,YAW&cam=YAW,PITCH,DIST"` (at = explorer
position + facing in degrees; cam = camera yaw offset / pitch in degrees / distance — try `cam=20,15,9`).
The level places scenes west of the avenue, turned a quarter; its console prints `[kit]` lines and
the spawn list is in `world.spawns` (you can find your scene's spawn by name in the HUD /
`window.world.spawns` — or use `&spawn=N`).
