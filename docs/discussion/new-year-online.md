# New Year's Eve online: fireworks at Angkor Wat

A plan for AWP-35, agreed with the owner on 2026-11-20. No code yet: the
owner says when to start. Players meet online on the world map on
31 December 2026, roam together, and watch a fireworks show with a countdown
over Angkor Wat at midnight.

## What we decided

| Question | Decision |
|---|---|
| Which New Year? | The global one: 31 December 2026 → 1 January 2027. (Khmer New Year in April stays the map's own festival, `festival/_newyear.ts`.) |
| Whose midnight? | Cambodia's (UTC+7), one moment for everyone: 1 Jan 2027 00:00 ICT = 31 Dec 17:00 UTC. |
| Public or friends? | Public: anyone who joins sees the others. |
| Games? | None. Players roam the whole map and come to one place for the fireworks. |
| Voice? | Only inside a **party**: a 6-letter code shared with friends. No voice with strangers (we can't check ages, and many players are children). |
| Names? | Each player types a name before joining (see "Names"). |
| Server? | Yes: a small live service on Railway; voice on LiveKit Cloud. |

## The night

- **Where:** the west causeway and the reflecting pools before Angkor Wat. The
  fireworks rise behind the five towers and show in the pools.
- **When:** from 22:30 ICT the map's own time comes to real night by itself (a
  toast says why) and goes back to the player's setting after 00:45. A gold mark
  on the map and in the calendar (9): "Fireworks at Angkor Wat, 23:59".
- **The countdown:** big Khmer numerals ១០ … ១ for the last ten seconds, then
  "សួស្តីឆ្នាំថ្មី ២០២៧" / "Happy New Year 2027" (words in `lang.ts`).
- **The show:** about 8 minutes, bursts in temple gold, lotus pink and saffron,
  with its own sound bus. A budget per graphics level so a phone on low keeps 30.
- **Works with no server:** the show is played from the real clock, so every
  player sees the same rocket at the same second without any network. If the
  live server fails that night, the show still plays for everyone.

## The countdown board and the festival square

The owner's reference (2026-11-20): `assets/new-year-online/plaza-reference.png`.
A square with a big countdown board people gather in front of, lanterns, red
banners, stalls and a glowing ring on the floor.

- **Where:** a festival stage on the open ground west of Angkor Wat, by the
  reflecting pools, facing west. The players face east: the board low on its stage,
  Angkor Wat's towers rising above it, and the fireworks above the towers and in the
  pools, as in the reference (the temple's top over the board). The real temple is
  not changed: the stage is a temporary one built in front of it.
- **The board:** a big screen in a carved wooden stage gate with a Khmer roof.
  Khmer first (numerals ០–៩, ថ្ងៃ ម៉ោង នាទី វិនាទី), English with `lang=en`.
  It changes with the time:
  - from the day it ships: days : hours : minutes : seconds to midnight, and
    "ព្រឹត្តិការណ៍ផ្ទាល់ / LIVE EVENT" (a reason to come back each day);
  - online: how many players are on the square now;
  - the last 10 seconds: one huge numeral at a time;
  - midnight: "សួស្តីឆ្នាំថ្មី ២០២៧" / "Happy New Year 2027";
  - after: "ជួបគ្នាឆ្នាំក្រោយ" / "See you next year" until the night ends.
  It follows `nye=` and the test room like everything else.
  It is drawn on a canvas updated once a second, so it costs almost nothing.
- **The square:** the gathering ring of light on the floor (the meeting point, also
  on the mini-map), a walk lined with lanterns from the roads, string lights in the
  trees, red banners with the white Angkor Wat (the temple of the flag of Cambodia),
  a few stalls (New Year snacks through `shop.ts`). Lamps are glowing blocks, with
  only a few real lights, for phones.
- **Kept Khmer** (the reference was drawn by a tool that mixes styles; the player checks):
  - the curly beasts by the stairs become Khmer naga (cobras with a smooth fan hood,
    as on Angkor Wat's causeway) or Angkor singha lions, never dragons;
  - the stone lanterns become Khmer lamps, not Japanese stone lanterns;
  - the trees are the map's own (string lights in them), not wisteria;
  - the board's name is មរតកអង្គរ in Koulen pixel letters.
- Shots: `nyeboard=<state>` (`days`, `last10`, `midnight`, `after`), with `nye=`.

## Part 1: fireworks and countdown (everyone, offline)

- The show is a script: rocket times, places, colours and sizes. It is seeded and
  played from the real time, corrected by the server's clock when we can reach it.
- A new map part (fireworks): sparks, trails, glow in the pools, light on the towers.
- The countdown overlay and the event's calendar entry (`src/map/calendar.ts`).
- Shots and checks: `fireworks=<s>` (the show at second s), `countdown=<s>`,
  `nye=<time>` or `nye=+2m` (pretend midnight is then); `npm run perf` on
  low, medium and phone with the show at its busiest.

## Part 2: live players (public)

- **Joining is a choice:** a card "Join the New Year online" (also in the
  settings). Playing alone works as today.
- A WebSocket service on Railway. Each player sends their spot, facing, pose, emote
  and ride (walking, bike, glider, boat, balloon) about 5 times a second; the
  others see them smoothly in between.
- **Rooms:** each player gets only the players near them (about 50 at most).
  When the causeway is full, a second crowd ("Crowd 2") opens; a party is always
  in the same crowd.
- Other players are drawn with the crowd's cheap model (`people/_personModel.ts`)
  and their clothes, so phones cope. Their name floats over them when close.
- They are only for show: nobody can touch another player's save, garden, house,
  bike or dog. Nothing new goes into `progress.ts` except the name and settings.
- Together: F greets (sampeah, wave) and the ready-made lines; at midnight
  everyone near cheers.
- Checks: `ghosts=<n>` fills the map with fake players for shots and `npm run perf`;
  a test night with friends with `nye=` set to an hour we pick.

## Part 3: party voice (friends only)

- **Make a party** gives a 6-letter code (no look-alikes like 0 / O); friends type
  it to join. Up to 8 in a party.
- Voice goes through LiveKit Cloud; our server hands out the room's ticket only to
  party members. Proximity voice: a friend far away on the map is quieter.
- Voice is off until the player turns it on; on phones push-to-talk (a button);
  on a computer a key (to pick: not V, the album).
- Each member has Mute; leaving the party ends the voice.

## Names

The player types a name before joining the room.

- **Filled in for them:** the name from the name card (`roam/_nameCard.ts`,
  `name.km`), if they have one. They can change it.
- **Typed in Latin or Khmer letters**, 2–16 letters. A Latin name is shown in Khmer
  letters too (`src/map/khmerName.ts`), as the name card does.
- **Checked twice, on the device and on the server:** a word list of rude words in
  Khmer and English (with look-alike spellings like 4 for a); no links, no runs of
  digits (phone numbers), no "admin" or "moderator" names.
- **Report a name:** the reporter stops seeing that player at once; after a few
  reports from different players, the name is hidden for everyone ("Player") until
  we look. Reports go to the tracker (AWP), like the bug button.
- Names aren't kept on the server after the night.

## Safety

- No typed chat, ever: greetings, emotes and ready-made lines only.
- No voice with strangers: party voice only, with codes given among friends.
- Mute, Block and Report on every player (in a menu when one is near, and in a
  list of the players near you). Block hides them for you for good.
- Server limits: messages a second per player, joins a minute per connection,
  movement checked (no flying across the map in one step), names checked again.
- No personal data: a player is a random id made on their device. No email, no
  phone number, no age.

## Testing: a hidden link into the event, any time

No fixed rehearsal dates (owner, 2026-11-20): whoever has the hidden link (or
its code) can enter the whole event whenever they want, alone or with friends,
as many times as they like. The night coming on, players joining with names,
parties and voice, the board, the countdown, the show, the cheer, and the sky
going back after.

- **The link:** `/?event=<code>`, for example `/?event=K7QM2P`. The same code also
  works typed in the party code box ("Have a code?"), for phones where a link is
  hard to open.
- **The code is checked by the server, never written in the game.** The game is a
  public website, so a code inside its files could be found. The code lives in
  the server's settings on Railway; if it leaks, the owner changes it there and
  the old link stops working, with no new build.
- **A test countdown every 15 minutes.** In the test room midnight comes at
  :00, :15, :30 and :45 of every hour. Whoever opens the link lands a few
  minutes before the next one, and everyone in the room counts down to the same
  second with no one having to set it up. The night comes at once (not 90
  minutes before), the show plays, and the next countdown begins.
- **Kept apart from the public:** test players are in their own room and never
  meet the public, and the board shows "សាកល្បង / TEST" in a corner.
- **Alone, no server:** `nye=+2m` in the address moves midnight for that player's
  own screen only (the show, the board and the countdown, with no live players).
  Harmless for anyone to find: it changes nothing for others.
- **One switch for the date:** nothing in the code reads "31 December" except
  through one place, which the test room and `nye=` move.
- **A staging server:** a second Railway service, to try a change to the server
  before it goes to the real one.
- **Robot players.** `npm run nyeload -- bots=300`: a script (no drawing, only
  connections) whose players join the test room, take names, walk to the
  square, greet and stay through midnight, to see the server and the crowds
  hold up.
- **A headless check.** `npm run nyetest`: two or three browser pages open the
  test link on a local server, see each other, make a party, count down, and
  check they reach zero within 0.2 s of each other.

### What to check in the test room before the night

- Every device reaches "១" and the first rocket at the same second (phones and
  computers, Wi-Fi and 4G, Khmer and English).
- The show keeps 30 fps on a phone on low, with the crowd around.
- Joining late (after midnight) starts the show at the right second; leaving
  and coming back works.
- The server stopped in the middle of the show: the show plays on, players come
  back when it returns.
- A rude name is refused; Report and Block work; party voice works, Mute works,
  far friends sound quieter.
- After the end the sky goes back to the player's own time, and nothing in their
  save has changed.

## Timeline (41 days from 2026-11-20)

| By | What |
|---|---|
| ~10 Dec | Part 1 done: the show, the board, the countdown, calendar entry, phone budget. |
| ~20 Dec | Part 2 done, and the test link working: friends can test from then on. |
| ~27 Dec | Part 3 done, then freeze: fixes only. |
| 31 Dec | The night. If voice isn't solid by the 27th, it waits; the show doesn't need it. |

## Tickets to make (when the owner says go)

1. The fireworks show script and its map part (Part 1).
2. The countdown board and the festival square.
3. The countdown overlay, words, the night-time hold and the calendar entry.
4. The live server on Railway: rooms, crowds, limits, the clock.
5. Other players on the map: drawing, smoothing, names, `ghosts=`.
6. Joining: the card, the name entry and its checks, the setting.
7. Mute, Block, Report (and reports into the tracker).
8. Parties and party voice (LiveKit).
9. Testing: the hidden link and its test room, `nye=`, staging, robot players, `nyetest`.
10. The freeze before the night.
