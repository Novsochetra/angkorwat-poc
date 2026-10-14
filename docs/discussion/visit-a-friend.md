# Visit a friend's home (then build together)

A design note for AWP-26, written on 2026-10-14. No code yet: the owner
answers the questions at the end first. It comes after building and
decorating (`build-plan.md`, "Later"). It is about the world map only: the
explorer's stilt house and its plot at the sugar-palm village
(`roam/_home.ts`, `src/map/build/`, `src/map/garden/`, `src/map/cattle/`).

## The idea

Every player has the same stilt house in the same place, with their own
garden, cows and things they built around it. A friend can come and walk
around it. This is a safe first thing to do together: the home is small,
private, and made only of Khmer pieces we drew, so nothing rude can be built.
Building together comes later, once visits work.

## How a home is shared

- The owner presses **Share my home** (in the Explorer menu, Me tab).
- The game makes a **picture of the home as data**: what was built
  (`build.pieces`), the garden (`garden.v1`), the cows' looks (`cattle.herd`),
  the door, the dog's name, the owner's Khmer name. Nothing else: no riel, no
  album, no photos, no place on the map.
- The owner gets an **invite code** (6 letters and numbers, no look-alikes
  like 0 / O) to give to a friend in person or in their own chat app.
- The friend types the code (**Visit a friend** in the same menu). The game
  loads the home into the house's spot; their own home is put away while they
  visit and comes back when they leave (Esc, or the menu).
- A visit shows the home **as it was when shared**, not live. Sharing again
  updates it. Live visits (both players there at once) come with building
  together.
- **Stop sharing** makes the code stop working and removes the copy.

## What a visitor can do

- Walk around, in and under the house; sit on its seats, lie in its hammock.
- Pet the dog, look at the cows and the garden.
- Take photos and selfies (they go in the visitor's own album).
- Leave **one thing a day**: a ready-made greeting in the guest book
  ("សួស្តី!", "ផ្ទះស្អាតណាស់!", a sampeah), and maybe a gift from their own
  basket (a mango, a lotus), which the owner finds on the porch.

## What a visitor cannot do

- Build, take down, move or paint anything.
- Pick, water or harvest the garden; feed, ride or sell the cows.
- Take anything, or see the owner's riel, album, bag or progress.
- Write their own words (no free text: see Safety).
- Find homes by searching or browsing: only a code opens one.

## Safety for young players

Many players are children. The rules, by default:

- **No strangers.** No public list of homes, no search, no random visits. A
  home opens only with a code the owner chose to give.
- **No chat.** Visitors pick from ready-made greetings and emotes (as the game
  already does with sampeah and waves). No typed messages, no voice.
- **No personal data.** No email, phone, age or real name. A player is a
  random id made on their device. Names shown are the in-game Khmer names
  (`name.km`), and a name can be hidden from visitors.
- **Owner in control.** Stop sharing at any time; a new code makes the old one
  stop working; a code can last 7 days or until stopped.
- **Report and block.** Every guest book line and gift has **Report** and
  **Block**. Block: that visitor's lines and gifts disappear and they can't
  open this home again. Report: it goes to the owner of the game to look at
  (the tracker, like the bug button).
- **Safe by design.** Everything visible is made of our own Khmer pieces and
  the Khmer palette, so a home can't show pictures or words we did not draw.
  Names typed by players are the one free text: filter them, or only show
  them to friends.
- **Limits on the server**: a few shares and visits a minute per device, a
  size limit per home, and every home checked on the server against the real
  pieces and plot size (a hacked game can't send something else).

## What is saved where

| What | Today | With visits |
|---|---|---|
| The player's own game (home, garden, cows, riel, album…) | Their browser (`angkor-map-progress-v1`, `src/map/progress.ts`) | The same, unchanged |
| A shared home (the data picture) | – | Server: one copy per player, a few KB |
| Invite codes | – | Server, with the home they open |
| Guest book lines, gifts waiting, blocks, reports | – | Server, per home |
| Homes I visited, gifts I sent today | – | The visitor's browser (in `progress.ts`) |
| The player's id | – | Their browser; lost if they clear it (then they share again) |

If a player clears their browser, their game is gone as today; their shared
copy stays until it expires (for example after 90 days without a visit).

## What server is needed

The game is a static site today (the build, plus PostHog for analytics): no
server of our own. Two ways:

- **A. No server (a first step).** "Share my home" makes a link with the home
  packed inside it (after `#`, which browsers never send to any server). The
  friend opens the link and visits. No accounts, no data kept anywhere, nothing
  to moderate. But: no guest book, no gifts, no "stop sharing" (a link works
  forever), and the link is long (fine in a chat app, too long to type).
- **B. A small server.** A small web service and database (for example on
  Railway, where the owner already runs the tracker): store a home, open one
  by code, guest book, gifts, report, block. Cheap, but it must be looked
  after: backups, abuse limits, someone reading the reports.

Building together needs B, plus live connections (both players moving and
placing pieces at once): a bigger step.

## Steps, in order

1. Building and decorating are done (`build-plan.md` steps 1–4), and the
   saved home format is settled (it is what gets shared).
2. The **visit mode** in the game: load a home from data into the house's
   spot, put the player's own away, and back. Nothing can change while
   visiting. Testable with a shot (`visit=<file>`), no network.
3. **Sharing**: way A (a link) or way B (a code), as the owner decides.
4. If B: the **guest book** (ready-made lines), then **gifts**, then
   **report and block**, each with its server part and limits.
5. Watch how it is used (PostHog), fix what children trip over.
6. Later: **live visits**, then **building together** (the owner invites a
   helper, the helper places pieces from the owner's materials, the owner can
   take any piece down).

## Questions for the owner (before any code)

1. Way A (a link, no server) first, or straight to way B (codes and a small
   server)?
2. Should visitors be able to leave anything (a greeting, a gift), or only look?
3. Show the owner's Khmer name to visitors, or keep homes nameless?
4. How long does a code work: 7 days, or until "Stop sharing"?
5. Who reads reports, and where should they go (the tracker)?
6. Is there an age rule or a parent's OK we need for Cambodia, or for app
   stores later (the native app)?
7. May visitors water a thirsty plant as a kind help, or is the garden
   look-only?
