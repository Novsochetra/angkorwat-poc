# Reviewing a ticket

How a reviewer checks work on a tracker ticket (project `AWP`). The reviewer is
weak at taste and strong at checks: run every check, look with your own shots,
and say plainly what looks wrong. The owner moves a ticket to Done, never an agent.

## Before you start

- **A fresh session.** The reviewer is never the agent that did the work. Read
  the ticket in full (`get_ticket`): the description, the acceptance list, the
  work report, every comment, and any reference image.
- **The world map only** (owner rule, 2026-10-14): work and shots are for
  `index.html` and `src/map/`; `game.html`, `studio.html`, `viewer.html` and the
  kit level are on hold. Shoot with `index.html?shot=1&…`, never a studio page.
- **Where it runs.** Visual tickets (anything drawn: models, places, effects,
  menus) run on the Mac, on the GPU. Logic, saving and tracker work can also
  run in a cloud session.
- **Before and after.** Make the "before" in a separate git worktree at the
  commit the work started from (`git worktree add <dir> <base>`, link
  `node_modules`). Never copy old files over the working tree for a picture.
- **The base.** Read the diff (`git diff <base>...<branch>`). Every changed
  file must belong to the ticket.

## The checks (all of them, every review)

1. `npm run typecheck`
2. `npm run build`
3. `npm run playtest`
4. `npm run kitcheck`: no new problems against the base (run it in the before
   worktree too; the base already has 3: §17.2 lily pads ×2 over budget and one
   WebGLProgram VALIDATE_STATUS; `src/kit` is on hold, so only new ones count).
5. `npm run perf -- levels=low,medium,phone` (add `only=<views>` for the views
   that see the change), before and after (`out=` and `base=`). Compare with the
   budgets in `docs/map-work/BRIEF.md` "Budgets": a phone's overview ≤ 2.6 M
   triangles and ≤ 520 draws, a walk ≤ 1.5 M and ≤ 350, a new part ≤ 30 draws,
   ≤ 0.15 M triangles and ≤ 0.2 ms CPU where it stands and nothing where it
   does not. Perf numbers move a few percent between runs: run twice when a
   change is near the line.
6. `npm run padtest` when the ticket touches keys, menus or roaming actions.
7. Shots of your own (`npm run shots -- name="@index.html?shot=1&…"`):
   - at least two distances (close: a walk shot with `roam=walk&at=…`; far: the
     overview or `focus=<place>`),
   - day and night (`night=1`, or `clock=` / `t=`),
   - graphics `low`, `medium`, and `phone=1` (`touch=1` when it has buttons),
   - Khmer and English words (`lang=en`) when it shows text.
   Look at every picture. Read the console of a shot for errors.
   Under heavy load `npm run shots` can hit its 180 s ready limit: add `parts=`
   (only the parts in view) for close-ups, and retry when the machine is quieter.
8. **Khmer, not Thai** (`CLAUDE.md`): stupas, Buddhas, naga, flags, spirit
   houses, roofs (no Thai gable horns), hats (palm-leaf hat or krama, never a
   conical hat), signs in Khmer script, Khmer words first.
9. **The reference image** on the ticket, if any: put your shot beside it and
   say where they differ.
10. **Saving:** `progress=0` and shots save nothing; a normal run keeps what it
    should after a reload; an old or broken save does not crash the map.
11. **Shaders:** no new chains of `if` in people or animal shaders, no new
    shader program per count of something (CLAUDE.md, commit b250279).
12. **The acceptance list:** go through each line of the ticket and say met or
    not met, with the proof (a shot, a number, a command's output).

## What to write

Up to **5 things that look wrong or are missing**, most important first, each
with where (file, shot) and what to do. A score alone is not a review.

Then a **one-glance summary**:

- before / after shots (attached to the ticket with `attach_file`),
- the numbers (perf before → after, block counts, build times, save sizes),
- concerns the owner should know, in one line each.

Verdict (`review_ticket`): approve only when every acceptance line is met and
every check passed. Rating 5 fully met with good quality; 4 met with minor
nits; 3 works with notable issues; 2 partly met; 1 not met. When you send a
ticket back, say exactly what to fix, and add one line to "Lessons" below.

## Lessons

One line each time a ticket is sent back, so the next worker avoids it.

- Fruit must taper (no plain box fruit).
- No flat square leaves.
- URL test values that fill game state (`pblocks=`, `build=`, `bag=` …) are read only in shots and on the dev server (`ctx.shot || import.meta.env.DEV`), never on the live site (AWP-16). That includes an add-on's `fromUrl`: open the
  built site with `npm run preview` and the shot URL, and check nothing changes or
  saves (AWP-9).
- Prices shown on a card add up to what he pays; nothing hidden (AWP-9).
- Built roofs, not only walls: walk him into a roofed gallery (roof 2.5–4 m) and
  check the follow camera stays under the roof and he stays in view (AWP-17).
- Built rooms: also turn the camera (Q / R) and walk back towards it inside a 3 m
  wide built room; the camera must never end inside a player's wall (AWP-17).
- A camera that refuses to turn into a wall holds still, never swings back and
  forth: hold Q / R into a built wall and count heading reversals (AWP-17).
- A stall's produce includes what its people's rig puts on the counter
  (`people/_scene*Kit.ts`): grep every stall's goods, not one file (AWP-7).
- Kill only your own processes: never `pkill -f` a shared script name.
- A new pad combo uses a button no other roaming action takes (L2 is the
  binoculars): check `pad.ts`'s button map and every add-on that reads the pad (AWP-30).
- A saved time is never rounded past the saved clock: act, reload at once, and
  check nothing comes back (AWP-10).
- Anything he can move and leave (a cart, a bicycle) blocks the build ghost and
  planting, and a saved place passes the same "can it stand here" check as play (AWP-14).
- A collision check samples finer than the thinnest thing it must stop at (a
  fence is 0.25 m), or tests boxes exactly: drive into one fence head-on (AWP-14).
- Grep every rig that carries goods (stalls, people's rigs, boats), not only
  stall files (AWP-7).
- A low or lite form keeps the plant's silhouette (a banana's leaves arch out
  and down) (AWP-7).
- A panel hidden by a class must really hide under the HUD's own rules
  (`.rh > .mu-frame` sets display): check its computed display after every way
  out of the mode (AWP-20).
- Things he owns and leaves (his cow, his bicycle, his cart) block building (AWP-20).
- Anything that moves and stays in the world (the cart) is in every other
  mover's collision (bicycle, ridden cow, cattle, dog), never stops where its own
  saved-place check refuses it, and always has a way back when stuck (integration test).
- A new cost in riel meets every way riel comes in (the purse's top-up): check
  nothing becomes free money (integration test).
- Anything that holds up another piece (a roof a lantern hangs from, a floor)
  refuses to come down while it holds one: test every piece that can (AWP-23).
- A placing aid makes the straight continuation the default (take the existing
  piece's own angle when close) and shows its angle on the phone too: touch
  hides the prompt line (AWP-30).
- "Bigger" means bigger in total, not only in one place: measure the whole
  area before and after (AWP-31).
