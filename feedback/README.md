# Feedback inbox

Bugs and ideas reported from inside the game or the character viewer land here,
one folder per report:

```
feedback/2026-09-23-143205-explorer-walks-through-the-wall/
  report.md       your note, what you picked and the code that made it, how to get back to that view
  screenshot.jpg  the view when you reported, numbered pins on the things you picked
  ticket.json     the report's tracker ticket (world map reports, when the tracker is set up)
```

## One inbox: the tracker

A report from the world map (`index.html`) also becomes a ticket in the
tracker's **AWP** project: "Bug: <the note's first line>" (or "Idea: …"), with
`report.md` as its text and the screenshot attached. The folder is saved first,
always, whatever the tracker answers. The dev server's terminal says the ticket
(`feedback: tracker ticket AWP-31 → …`) or why there is none (no token, the
tracker is down, an error, or a report sent from another device such as a phone
on the Wi-Fi: only this computer's reports become tickets). Sending the same
report again makes no second ticket.

Set it up once, in `.env` (never `VITE_`-prefixed, so the game never sees it):

```
TRACKER_TOKEN=trk_…   # the tracker: Connect Claude Code → API tokens → Create token
TRACKER_URL=https://project-tracker-production-aa4f.up.railway.app
```

Without `TRACKER_TOKEN` only the folder is saved, as before.

## Making a report

1. `npm run dev` and play (`game.html`) or open the viewer (`viewer.html`).
2. Press **B** (or tap **🐞 Report**). The game freezes; you can still drag to look around.
3. Click or tap what's wrong. Pick several things if it's about how they meet. A **✕** removes one.
   Many things at once: choose **▭ Box** or **◯ Loop** and drag around them (on a computer,
   **Shift** + drag draws a box and **Alt/⌥** + drag a loop). Everything you can see inside
   becomes one pick, and the report groups those blocks by the code that made them.
4. Say what's wrong and what you expected, in any language, then **Save report**
   (Ctrl/⌘ + Enter). "Show colliders nearby" draws the invisible collision boxes,
   which helps with "I walk through this" / "I get stuck here" bugs.

## Getting it to Claude

- **Claude Code on this computer:** say "check the feedback".
- **Claude on the web:** push the folder first
  (`git add feedback && git commit -m "Add feedback" && git push`), or press
  **Copy text** after saving and paste it into the chat with the screenshot.

Claude deletes a report's folder in the commit that fixes it and names its
ticket there, so whatever is left here is still open.
