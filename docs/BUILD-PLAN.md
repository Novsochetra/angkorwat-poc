# Build plan: gather, build, decorate

Written on 2026-10-13 from a design chat. Nothing in this plan is built yet.
Pick it up on your Mac from "Next steps" at the bottom.

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
| Online? | Later. A private plot per player makes "visit a friend's home" a safe first social feature. |

Why not Minecraft-style: the amazing builds come from a small share of players
after many hours. The Khmer look is the game's identity, so the pieces carry it
(this is also how Townscaper keeps every town pretty).

## Steps

### Step 0: push your latest code to `main`
The watering feature and the drop icon above thirsty plants were not in the
copy of the repo used for this chat (only `main` and the working branch exist
there, and a search found no watering code). Fetch it first.

### Step 1: plant clean-up (first, because later steps reuse it)
Problems seen in the code (not rendered, because the screenshot tool did not
work in the cloud session):
- Leaves are flat boxes. `_bhYard.ts` (gourd trellis, about line 362) uses a
  0.7 x 0.14 x 0.7 m box per leaf, `_bhTrees.ts` papaya (about line 168) the same.
- Fruit is one plain box with no taper: mango `_bhTrees.ts` (about line 146),
  jackfruit (about line 152), papaya fruit, and the pumpkin in `_mkGoods.ts`
  (about line 457, three stacked boxes).
- The banana plants in `_psYard.ts` (about line 187) use a rotated thin slab
  (`F.slab`) and probably look better. Compare.

Plan:
1. Read the watering code and copy how the drop above a plant is drawn. It is
   the one style that looked good, and it is a teardrop.
2. Make one shared plant kit in `src/kit/lib`:
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
  5 minutes" from `docs/ideas.md`).

## Ticket system (to discuss; nothing decided yet)

The tracker is https://github.com/Novsochetra/project-tracker (README, `CLAUDE.md`
and `docs/architecture.md` read; the code was not reviewed). The game's board
is the `AWP` project at project-tracker-production-aa4f.up.railway.app/p/AWP.

What fits:
- Built for Claude Code: MCP tools (`claim_next_ticket`, `get_ticket`,
  `add_comment`, `submit_for_review`) and `/mcp__tracker__work` and
  `/mcp__tracker__review`. Agents never move tickets to Done; the owner does.
- Phone capture, image and video attachments, and `tracker watch` runs Claude
  Code on your Mac when you send a ticket from your phone.

Setup, from its README ("Connect Claude Code"):
1. In the app: project menu, Connect Claude Code, API tokens, create a token.
2. `npm run build -w @tracker/agent`, then `node apps/agent/dist/cli.js login --url <tracker url>`.
3. `claude mcp add tracker -s user --env TRACKER_URL=<url> --env TRACKER_AGENT_NAME=Claude -- node "$(pwd)/apps/agent/dist/mcp.js"`.
4. In the game folder: `tracker watch AWP`.

Open ideas, none started:
- **Bug reports into tickets.** The 🐞 button posts `{ name, markdown, image }`
  to `/__feedback` (`src/feedback/vitePlugin.ts`), which writes `feedback/<name>/`.
  Add a step there: upload the screenshot (`POST /api/attachments`), then
  `POST /api/projects/AWP/tickets` with title "Bug: ..." (first line of the
  note), description = `report.md` (limit 50,000 characters), attachment ids,
  and the report name as `clientId` (a repeat makes no duplicate). The token
  lives in `.env` on the dev machine, not `VITE_`-prefixed (the bug button is
  dev only). If the tracker is unreachable, still save the folder as today.
  Then update `CLAUDE.md` and `feedback/README.md`: one inbox, and the commit
  message names the ticket instead of deleting a folder.
- **Reviewer agent.** Weak at taste, strong at checks. Give it: typecheck,
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

## Environment notes (cloud session)

- `npm ci` was run (needs `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` there).
- `npm run shots` timed out waiting for the page, also with a dummy
  `VITE_POSTHOG_KEY`. Most likely no GPU in the container. Unconfirmed.
  Without the key the page logs "VITE_POSTHOG_KEY ... missing"; see `.env.example`.
- The tracker's Railway address did not resolve from the cloud session (DNS).
  Likely the environment's network policy: allow the host under Network access.

## Next steps (on your Mac)

1. Push your latest code to `main`, then `git fetch` and merge it here.
2. `npm install`, copy `.env.example` to `.env` (PostHog key), `npm run dev`.
3. Step 1: find the watering code, build the plant kit, render with
   `npm run shots -- garden="@index.html?shot=1&roam=walk&at=168,-348&yaw=180&graphics=medium"`
   (the back-hamlet garden is at about x 166-172, z -345 to -339), then
   `npm run perf`.
4. Decide on the ticket system after that.
