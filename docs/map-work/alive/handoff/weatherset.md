# weatherset — handoff

**Task:** a Weather choice in the map's settings panel (by season / clear / rainy / stormy),
because the old weather rained every 9–12 min all year.

## Done (type-checks; `npm run build` passes)
- `src/map/types.ts`: `WEATHER_SETTINGS`, `WeatherSetting`, `MapSettings.weather`,
  `DEFAULT_SETTINGS.weather = 'season'`. Old saved settings get the default through the
  `{...DEFAULT_SETTINGS, ...saved}` spread in main.ts `loadSettings`, so it needed no change.
- `src/map/sky/weather.ts`:
  - `YEAR` + `rainsOf(season)`: how likely rain and storms are through the year, how light the
    showers are, how still the air is.
  - `passing()` makes one shower or storm.
  - `Schedule`: one schedule per setting. It starts at a given time, is seeded, and advances
    in slots: `reach(t, season)`, then `sample(t, until, fade, …)`.
  - `Skies`: the breeze (lighter in the dry season), and the "stretches" of play under each
    setting. When the setting changes, a shower already under way runs its course and the new
    schedule starts from that moment. Switching to clear fades the rain out over `FADE` = 30 s.
    A shower building after a switch hides the last shower's rainbow.
  - `createWeather(params, setting)`: `schedule(until, mode?, season?)`. The held branch
    (soundfix's `flash=` code) is untouched.
- Timelines (rain start, checked over 60 min, days 0–2):
  - season 0.3 (wet): 4–6 showers an hour, first at 3½–8 min, 1–2 storms.
  - season 0.8 (dry): none.
  - season 0.02 (April, mango rains): 0–2 light showers an hour.
  - season 0.07 (May) and 0.6 (Nov): 1–3 an hour.
  - rainy: 6 an hour, first at 2:37–2:59, about 2 storms.
  - stormy: first storm at 2:10–2:22, then a storm every 8–10 min, with a shower between now and then.
  - clear: never.
- Live switch, checked by stepping frames in node: from mid-shower or mid-storm to clear, rain
  goes to 0 in about 30 s. The largest change between frames was ≤ 0.005.
- `src/map/main.ts`: `createWeather(params, () => settings.weather)`.
- `src/map/ui/ui.ts`:
  - `WEATHER_CHOICE`: a "Weather" group under Time of day, 2×2 `.mu-seg.is-pairs` buttons,
    and the note `#mu-weather-note`.
  - `syncSettings` sets `aria-pressed` and the note.
  - The click handler plays the toggle sound.
  - The time buttons are now picked by `[data-time]`.
- `src/map/ui/icons.ts`: `CLOUD`, `ICON.season` (sun behind a cloud, using a mask),
  `ICON.rain`, `ICON.storm`. Clear uses `ICON.sun`.
- `src/map/ui/map.css`: `.mu-seg.is-pairs`, `.mu-set-note`, plus the Khmer size rule for the note.
- `src/map/ui/lang.ts`: `weather`, `wSeason/wClear/wRainy/wStormy` and their `…Note` words.
  **A native speaker should check:**
  - ព្យុះភ្លៀង (Stormy)
  - ភ្លៀងញឹកញាប់ (Rainy)
  - the notes: ភ្លៀងនៅរដូវវស្សា ហើយស្ងួតពីខែធ្នូដល់ខែមេសា · គ្មានភ្លៀងទេ មានតែខ្យល់បក់រំភើយ ·
    ភ្លៀងមួយមេ ប្រហែលរៀងរាល់ ១០ នាទីម្ដង · ព្យុះផ្គររន្ទះញឹកញាប់ មានភ្លៀងធម្មតាចន្លោះ
- Docs: the weather paragraph in `docs/map-work/BRIEF.md` (Time of day and the sky), and one
  bullet in `CLAUDE.md` (map section).
- Shots seen at desktop 1672×941, Khmer and English: the row matches the Time of day look.
  The panel body now scrolls slightly on desktop, and "Our story" sits under the soft edge.

## Checked (second pass)
- Live switch, in the page (Playwright, `parts=rain,rainbow`, saved setting rainy): the first shower
  came at ~3 min; clicking Clear saved `weather: "clear"` at once, and rain and cloud went to 0 in
  32 s. After a reload the setting was still Clear (the button pressed, the Clear note shown).
- Fixed: after a switch to Clear, a shower still building kept building under the fade (rain
  0.42 → 0.69 in 4 s before falling). `Schedule.sample` now holds the build-up ramps (cloud, rain,
  storm, gust front) at the moment of the switch (`tu = min(t, fade)`), so Clear only brings the rain
  down (what is left is the rain's own pulse, ≤ 0.07). Nothing changes while no fade runs.
  Node check (season 0.3): rainy / stormy switched at 140–200 s all clear in 30.0 s, largest step
  between frames ≤ 0.0033.
- Click, keyboard, touch: click sets `aria-pressed`, the note and the saved setting; Tab moves
  season → clear → rainy → stormy → Reduce motion; Enter and Space choose; the focus ring shows
  (2 px light outline). On a phone (390×844, touch) tapping Stormy and Rainy works; no page
  sideways scroll.
- Phone shots (390×844, Khmer and English): the whole panel, weather row and note included, fits
  without scrolling. The buttons are 27 px tall there, the same as the Time of day row.
- Desktop panel shot (1672×941, English): the enlarged rain and storm icons read well.

## Left
- The overview shot (`map.html?shot=1`, full map) showed only the loading screen twice during
  this pass (1672×941, both at ~64 s). A probe of the same URL found the page fine: `__ready`
  set, `#loading` removed, no errors, so it looks like the headless compositor not painting
  the full map under load (20 helpers on 4 CPUs), not the weather code (shots hold
  `weather=clear`). Take it again when the machine is quiet.

## How to check
- Shots:
  - `m="@map.html?shot=1&parts=terrain&uistate=settings"`, and again with `&lang=en`.
  - Weather in shots: `weather=season&season=0.3&t=270` (first wet-season shower, day 0),
    `weather=stormy&t=170`, `weather=season&season=0.8&t=270` (dry, clear).
  - `weather=rain|storm|rainbow|clear` still holds a weather.
- Schedule print in node (no browser):
  - `createServer({ server: { middlewareMode: true }, appType: 'custom' })`
  - `ssrLoadModule('/src/map/sky/weather.ts')`
  - `createWeather(new URLSearchParams(''), () => mode)`
  - `update({ t: 0, dt: 0, night: 0, day, season, weather: { ...CALM_WEATHER } })`
  - `schedule(3600, mode, season)`

  For a live switch, step `update` at dt = 1/30 and change what the getter returns part way.

## Files changed
`src/map/sky/weather.ts`, `src/map/types.ts`, `src/map/main.ts` (one line),
`src/map/ui/ui.ts`, `src/map/ui/icons.ts`, `src/map/ui/map.css`, `src/map/ui/lang.ts`,
`docs/map-work/BRIEF.md`, `CLAUDE.md`.

## Know
- soundfix was editing the held `flash=` part of `createWeather` at the same time. I left that
  block as it was.
- `weather=season|rainy|stormy` in the URL forces that schedule. `weather=auto` follows the
  setting. In shots the setting is the default: by season.
- The season is read as each shower begins. With Time of day set to "cycle", the season moves
  1/24 per 6-minute day.
- Nothing is committed.
