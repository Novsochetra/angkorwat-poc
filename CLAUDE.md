# Angkor Quest — notes for Claude

- Checks: `npm run typecheck`, `npm run build`, `npm run playtest` (headless play test).
- `npm run shots -- name="@index.html?shot=1&…"` renders a page headlessly into
  `screenshots/<name>.png`; view the PNG to check visual changes.
- Scale: 1 unit = 1 m; shared sizes live in `src/world/scale.ts`.

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
