# Feedback inbox

Bugs and ideas reported from inside the game or the character viewer land here,
one folder per report:

```
feedback/2026-09-23-143205-explorer-walks-through-the-wall/
  report.md       your note, what you picked and the code that made it, how to get back to that view
  screenshot.jpg  the view when you reported, numbered pins on the things you picked
```

## Making a report

1. `npm run dev` and play (`index.html`) or open the viewer (`viewer.html`).
2. Press **B** (or tap **🐞 Report**). The game freezes; you can still drag to look around.
3. Click or tap what's wrong. Pick several things if it's about how they meet. A **✕** removes one.
4. Say what's wrong and what you expected, in any language, then **Save report**
   (Ctrl/⌘ + Enter). "Show colliders nearby" draws the invisible collision boxes,
   which helps with "I walk through this" / "I get stuck here" bugs.

## Getting it to Claude

- **Claude Code on this computer:** say "check the feedback".
- **Claude on the web:** push the folder first
  (`git add feedback && git commit -m "Add feedback" && git push`), or press
  **Copy text** after saving and paste it into the chat with the screenshot.

Claude deletes a report's folder in the commit that fixes it, so whatever is
left here is still open.
