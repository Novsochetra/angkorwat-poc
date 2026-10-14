# Why players come back

A plan for the one thing the game is missing: a reason to play again tomorrow.
Written for ticket AWP-3 (October 2026). The list of every idea is
`docs/discussion/ideas.md`; this file picks the few that change how often people play,
in the order to build them.

## What the game has already

A lot to do. Almost nothing that calls the player back.

- Things to do: 27 roaming add-ons (`src/map/roam/_addonList.ts`), the
  festivals, the jungle sites, the shops, the dog, the house.
- Things to collect: 
  - the nature book and the temple passport (`roam/_book.ts`,
    `angkor-map-journal-v1`),
  - the gold figures (`src/map/treasure/`),
  - the photo album (V).
- Things that are kept: the explorer's own things
  (`src/map/progress.ts`, `angkor-map-progress-v1`), the purse
  (`roam/_shopPurse.ts`), the journal, the settings.
- Time that moves: the map's clock (`src/map/time.ts`) and the calendar of
  events with real Cambodian dates (`src/map/calendar.ts`).

## What is missing

Five holes. Each one loses players.

1. **No first steps.** A new player presses Start and stands in a huge map
   with no goal. Every place still says "coming soon" (`SCENES_OPEN` is off
   in `src/map/layout.ts`). Nothing points at the photo button, the gold
   figures or the passport.
2. **No reason to return tomorrow.** Nothing in the game changes while the
   player is away, and nothing waits for them. The pocket money tops up each
   dawn, but the player never hears about it.
3. **No way back in.** There is no web app manifest and no icon set, so a
   phone player cannot put the game on the home screen. They must remember
   the address.
4. **Progress is trapped.** Everything is kept in one browser, under four
   separate `localStorage` keys. A cleared browser, a new phone or a private
   window loses the dog, the house and every stamp. There is no save code.
5. **No growth loop.** Photos stay on the player's own screen. A photo that
   can be shared brings the next player in and gives the camera a purpose.

## The plan, in order

### 1. The first five minutes (small)

A card after Start with three first steps, ticked as they happen:

- Take one photo of a living thing (it fills a nature book page).
- Greet one person with **F**.
- Walk to one beacon and get the passport stamp.

Then the card says what to try next (the dog, the calendar, the gold
figures) and goes away for good. Build it as an add-on
(`roam/_firstSteps.ts`), reading the journal's own events, so nothing else
changes.

Why first: it is the cheapest change, and every later feature needs the
player to still be here.

### 2. The task journal and the streak (medium)

Three small tasks a day, from a pool, in the calendar card (key **9**):
"sell two fish", "find the gold turtle", "pray at the village pagoda",
"photograph a kingfisher". Each pays a little riel. All three done marks the
day. Days in a row show as a small count of lotus flowers.

It needs no new world: the tasks read what the add-ons already record
(`progress`, the purse's `tasted`, the journal's pages and stamps).
New files: `roam/_tasks.ts` (the pool and the checking) and the card's page.

Why: this is the come-back feature. A visible day count and a short, finishable
list is what makes a player open the game tomorrow.

### 3. The home garden (medium, already agreed)

The plan is already decided: plants near the house that grow over game days,
can die without water, round one is 12 plants and a bodhi tree. It is the
quiet version of the streak: something alive that waits for the player.

Build it after the task journal, so watering the garden can be one of the
daily tasks.

### 4. Put the game on the phone (small)

A web app manifest, the icon set, and a one-line hint ("Add to Home Screen")
shown once on iOS Safari. Serve them from `src/seo/vitePlugin.ts`, beside the
share picture that is there now.

Why: a tapped icon is the only easy way back on a phone. Without it, points
1–3 still lose most phone players.

### 5. A save code (small)

One button in the settings' About page: **Copy my save code**, and a box to
paste one in. The code is the four `localStorage` keys packed into one string.
No server, no account.

Why: it protects the streak and the garden, and it lets a player move to a new
phone. A lost save is a player who never comes back.

### 6. Photo postcards (medium)

A photo in the album can be saved or shared as a postcard: the picture, a thin
gold frame, the place name in Khmer, the date, and a small "angkor" mark. On a
phone it goes through the share sheet.

Why: it is the only idea here that brings new players, and it makes every photo
worth taking.

## Measure it before and after

Watch 10 PostHog recordings first (the project records every session). Note:

- how long a new player stays before leaving,
- whether they ever press the photo button, **9**, or **I**,
- where they stop moving.

Then the same after points 1 and 2. Without this, we are guessing.

## Not now

Good ideas, but they do not change how often people play: more temples, VR,
a new map, more languages, going back 800 years, playing together. Keep them
in `docs/discussion/ideas.md`.
