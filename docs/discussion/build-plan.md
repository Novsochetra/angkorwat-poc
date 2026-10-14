# Build plan: gather, build, decorate

Written on 2026-10-13 from a design chat; brought up to date with `main` on
2026-10-14 (AWP-4). Each step below is a ticket in the tracker (project AWP).

## The goal

A relaxing game for free time. Players gather Khmer materials around the map,
then build and decorate their own home on a plot. Everything must look Khmer
(see the Khmer rules in `CLAUDE.md`). Online play with a team comes after this.

## What we decided

| Question | Decision |
|---|---|
| Free single-cube building like Minecraft? | Not first. Most players freeze on an empty field, placing blocks one by one is tiring (especially on a phone), and free colours clash with the Khmer look. |
| How do players build? | Townscaper-style: the player draws a footprint, and posts, floor, walls, roof and ladder fit together automatically. |
| What can they build with? | Curated pieces only: bamboo, timber, thatch, laterite, Khmer roof shapes. |
| Colours? | A limited Khmer palette first (lotus pink, saffron, indigo, temple gold, lacquer red, coconut brown). We look at how it feels before adding a free colour wheel. |
| Where? | A private plot at the stilt house (`src/map/roam/_home.ts`, `hamlet/_homePlan.ts`). |
| Gathering? | A real action per hit (swing the knife), not "press E and wait". Materials come from places on the map. |
| Predefined things (cow shelter, bamboo bed)? | Keep them, but make them work wherever the player builds them: a bed under a roof lets you sleep, a cow is happy in a fenced, roofed area. |
| What does building cost? | Materials. Gathered ones are free; missing ones can be bought with riel (owner, 2026-10-13, AWP-9). |
| Online? | Later. A private plot per player makes "visit a friend's home" a safe first social feature. |

Why not Minecraft-style: the amazing builds come from a small share of players
after many hours. The Khmer look is the game's identity, so the pieces carry it
(this is also how Townscaper keeps every town pretty).

## Steps

### Step 0: watering on `main` (done)
The watering and the drop above thirsty plants are on `main`:
`src/map/garden/_viewThirst.ts` and `src/map/garden/_viewDrop.ts`.

### Step 1: plant clean-up (first, because later steps reuse it)
The garden already has its own kits: `src/map/garden/models/_fruitKit.ts`,
`_treeKit.ts` and `src/map/garden/_viewFruit.ts`. Start the shared plant kit
from them instead of from scratch.

Problems seen in the code of the older branch (not rendered; check the line
numbers again on `main`):
- Leaves are flat boxes. `_bhYard.ts` (gourd trellis, about line 362) uses a
  0.7 x 0.14 x 0.7 m box per leaf, `_bhTrees.ts` papaya (about line 168) the same.
- Fruit is one plain box with no taper: mango `_bhTrees.ts` (about line 146),
  jackfruit (about line 152), papaya fruit, and the pumpkin in `_mkGoods.ts`
  (about line 457, three stacked boxes).
- The banana plants in `_psYard.ts` (about line 187) use a rotated thin slab
  (`F.slab`) and probably look better. Compare.

Plan:
1. Copy how the drop above a plant is drawn (`_viewDrop.ts`). It is the one
   style that looked good, and it is a teardrop.
2. Make one shared plant kit in `src/kit/lib`, grown from the garden's kits:
   - a leaf: one curved slab with a mid-rib, replacing flat box leaves
   - three fruit shapes: teardrop (mango, papaya), round (pumpkin, gourd),
     long (banana, eggplant)
   - a vine
3. Rebuild the garden, orchard and market produce from it: `_bhYard.ts`,
   `_bhTrees.ts`, `_mkGoods.ts`, `_psYard.ts`.
4. Keep the block count low. The world is merged into a few draws per material
   family, so the cost is the number of blocks, not the number of plants.
   Measure with `npm run perf`, look with `npm run shots`.

### Step 2: gathering
- Make the existing bamboo clumps cuttable (they are scenery now: `bamboo` in
  `src/map/vegetation.ts`). They regrow later.
- Logs from the woodcutters' camp (`woodcutters` in `JUNGLE_SITES`, x 402,
  z -216). Thatch from the sugar-palm village. Clay from lake and river shores.
- A carry limit; the ox cart (already in the game) hauls.
- New gathering sites as needed. A proper bamboo forest first.
- Fits the add-on contract in `src/map/roam/_addons.ts` (one loader line in
  `_addonList.ts`, a section in `docs/map-work/addons.md`).

### Step 3: first building
Building at home already exists on `main`: `src/map/build/` (pieces, sizes and
riel prices in `pieces.ts`) and `src/map/roam/_build*.ts` (the card of nine
pieces, the ghost, the hammer work). See `farm-life.md`. This step extends it;
it does not start from zero.
- Private plot at the stilt house.
- Townscaper-style assembly. First pieces: stilt house, fence, shed.
- Needs a player layer separate from the baked world:
  - a sparse block store split into chunks, with its own mesh per chunk,
    rebuilt when a block changes (the world meshes are built in a worker and
    cannot be edited: `src/map/work/build.ts`)
  - a rebuild hook in the walk map (`src/map/roam/walkmap.ts`, built lazily per
    16 m chunk from meshes) so the explorer and camera collide with builds
  - saving through `src/map/progress.ts`, as a compact run-length list
  - a block budget per plot and only the visible faces drawn (phones matter:
    lots of recent commits are phone performance)
  - lights: lamps use a few fixed slots (4 point + 1 spot, `sky/lampSlots.ts`),
    so placeable lights need a glow sprite or emissive material, with only the
    nearest few casting real light

### Step 4: decorating
- Paint with the limited Khmer palette (per-block colour already exists:
  `VoxelBox.color` in `src/voxel/VoxelBuilder.ts`, per-instance colour in
  `VoxelMesh.ts`).
- Furniture and lanterns from the existing kit (`src/kit/assets`).
- Slabs and stairs (half-height blocks) so roofs read as roofs.
- Bed and cow shelter become buildable things with a function.

### Later
- Visiting friends' plots, then co-op building.
- Raw cube building and a free colour wheel only if players ask for them.
- Check player data (watch PostHog recordings, "help new players in the first
  5 minutes" from `ideas.md`).

## Ticket system

The tracker (https://github.com/Novsochetra/project-tracker) is connected: the
game's board is the `AWP` project at
project-tracker-production-aa4f.up.railway.app/p/AWP, and Claude Code reaches it
through the tracker MCP tools (`claim_next_ticket`, `get_ticket`, `add_comment`,
`submit_for_review`). Agents never move tickets to Done; the owner does.

Open ideas, each a ticket now:
- **Bug reports into tickets (AWP-28).** The 🐞 button posts `{ name, markdown, image }`
  to `/__feedback` (`src/feedback/vitePlugin.ts`), which writes `feedback/<name>/`.
  Add a step there: upload the screenshot (`POST /api/attachments`), then
  `POST /api/projects/AWP/tickets` with title "Bug: ..." (first line of the
  note), description = `report.md` (limit 50,000 characters), attachment ids,
  and the report name as `clientId` (a repeat makes no duplicate). The token
  lives in `.env` on the dev machine, not `VITE_`-prefixed (the bug button is
  dev only). If the tracker is unreachable, still save the folder as today.
  Then update `CLAUDE.md` and `feedback/README.md`: one inbox, and the commit
  message names the ticket instead of deleting a folder.
- **Reviewer agent (AWP-29).** Weak at taste, strong at checks. Give it: typecheck,
  build, playtest, kitcheck and perf against the budgets; the Khmer rules from
  `CLAUDE.md`; its own screenshots at several distances, times of day and
  graphics levels (low, medium, phone); a reference image from the ticket;
  "list up to 5 things that look wrong" instead of a 1-5 score; a fresh session.
  It ends with a one-glance summary (before/after images, numbers, concerns)
  and you move the ticket to Done. Keep a short `REVIEW.md` and add a line
  every time you send a ticket back ("fruit must taper", "no flat square leaves").
- **Where to run.** Visual tickets on your Mac (GPU). Logic, saving and tracker
  work can run in a cloud session.
- Acceptance criteria for visual tickets should include a screenshot and a
  `npm run perf` number.

## Environment notes (cloud session, 2026-10-13)

- `npm ci` needs `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` there.
- `npm run shots` timed out waiting for the page, also with a dummy
  `VITE_POSTHOG_KEY`. Most likely no GPU in the container. Unconfirmed.
  Without the key the page logs "VITE_POSTHOG_KEY ... missing"; see `.env.example`.
- The tracker's Railway address did not resolve from the cloud session (DNS).
  Likely the environment's network policy: allow the host under Network access.

## Tickets, in order

1. Plant kit: AWP-5, then AWP-6 (garden and orchard), AWP-7 (market produce),
   AWP-8 (banana leaves). Render the garden with
   `npm run shots -- garden="@index.html?shot=1&roam=walk&at=168,-348&yaw=180&graphics=medium"`
   (about x 166-172, z -345 to -339), then `npm run perf`.
2. Gathering: AWP-9 (bag, carry limit, one action per hit), then AWP-10 to
   AWP-15 (bamboo, logs, thatch, clay, ox cart, bamboo forest).
3. Building: AWP-16 (player block layer), AWP-17 (walk map), AWP-18 (saving),
   AWP-19 (plot and budget), AWP-20 (footprint building), AWP-21 (lights).
4. Decorating: AWP-22 to AWP-25 (palette, furniture, slabs and stairs, things
   that work where you build them).
5. Later: AWP-26 (visit a friend), AWP-27 (PostHog recordings).
