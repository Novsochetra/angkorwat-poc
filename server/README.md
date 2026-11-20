# The live server (New Year's Eve online, phase 2)

The WebSocket service behind "Join the New Year online" (AWP-35, ticket 5; the plan is
`docs/discussion/new-year-online.md`). It speaks `src/net/protocol.ts` exactly and checks names with
`src/net/names.ts`, the same module the game uses, so it runs from the repository's root folder (it imports
`../src/…`). Node 22 runs the TypeScript as it is (type stripping): no build step.

- `app.ts`: rooms (`public`, and `test` behind the hidden link's code), crowds of at most 120 (a party stays in one),
  the state checks (numbers, map bounds, speed with slack for lag; a jump like Jump in is taken after 3 steady
  states, at most 6 a minute), message, join, emote and report limits, the nearest 50 players of the crowd (a 40 m
  grid; protocol 2: names once, then only what moved, quantized, the nearest 15 at 5 Hz and the rest at 1.7 Hz,
  a still player only a keep-alive every 2 s; a version 1 page still gets the old full snapshots), the counts on the square and the lake terrace once a second, idle pages closed after 30 s.
- `reports.ts`: reports, a name hidden ("Player") for everyone after 3 different reporters, tracker tickets.
- `names.ts`: loads `src/net/names.ts` (a stub stands in if it cannot load; the start line and `/health` say which).
- `main.ts`: the service (settings below). `test.ts`: the checks.

Nothing is written to disk and nothing personal is kept: a player is a salted hash of the page's random id, in
memory only; names, reports and hidden names are gone when the server stops. One log line a minute with the counts.

## Settings (environment variables)

| Variable | What | Default |
| --- | --- | --- |
| `PORT` | The port (Railway sets it). | 8787 |
| `EVENT_CODE` | The hidden test room's code (`/?event=<code>`; letters, any case; dashes and spaces ignored). Not set: the test room is closed. Change it to retire a leaked link (no new build). | (none) |
| `ROOM_CODE` | The event room's code (e.g. `NYE2027`): set, the public room (the real midnight) takes only players who type it on the join card or bring it in the link (`/?event=NYE2027`); the test room keeps its own `EVENT_CODE`. `-`: the public room is open to all. | `NYE2027` |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | The room's voice: the LiveKit server the arcade's parties use (the same three values as `@arcade/live`'s). Set, a player in a room gets a ticket to their crowd's voice room (`angkor-nye-<room>-<crowd>`; `LIVEKIT_ROOM_PREFIX` changes `angkor-`), signed here with node:crypto, identity the player's server id. Not set: no voice (the mic button says so). | (none) |
| `TRACKER_TOKEN` | API token for the tracker: each report also files a ticket in AWP ("Name report: …"), at most one per player an hour, 30 an hour in all. Not set: no tickets. | (none) |
| `TRACKER_URL`, `TRACKER_PROJECT` | As for the bug button (`src/feedback/tracker.ts`). | the tracker, `AWP` |
| `ALLOWED_ORIGINS` | Comma-separated page origins allowed to connect (e.g. `https://angkor.example`); pages from other sites are refused. Empty: any. | (any) |
| `MAX_PLAYERS` | Players on this server at most (more get `full`). | 5000 |
| `JOIN_LIMIT_EXEMPT` | Comma-separated addresses that skip the 6-joins-a-minute limit (the load bots' machine). Never set it on production. | (none) |
| `TRUST_PROXY` | Read the player's address from `X-Real-IP` / `X-Forwarded-For` (`1` / `0`). On by itself on Railway. | auto |

## Run it here

```sh
cd server && npm install && cd ..        # once: ws
EVENT_CODE=K7QM2P npm run server         # ws://localhost:8787, health at http://localhost:8787/health
npm run server:test                      # the checks (starts its own server on a free port)
```

The game connects to it from `npm run dev` with `?nyeserver=ws://localhost:8787` in the address (or `VITE_NYE_SERVER` in .env; src/net/client.ts). Robot players:

```sh
EVENT_CODE=K7QM2P JOIN_LIMIT_EXEMPT=127.0.0.1,::1 npm run server
npm run nyeload -- bots=300 url=ws://localhost:8787 code=K7QM2P     # through the next test midnight
```

`GET /health` answers JSON: `rooms`, `crowds`, `players`, `uptime` (s), and `byRoom` (players, crowd sizes,
parties, the test room's midnight), `rates` (messages a second over the last minute), `cpuPct` (last 10 s),
`memoryMB`, `names` (`shared` or `stub`), `testRoom`, `hiddenNames`.

## Deploy on Railway (the owner)

A second service in the Morodok Angkor project, from this same repository, built with `server/Dockerfile`
(Railway's config-as-code file `server/railway.json` is deprecated: services made after 28 August 2026 cannot
use it and old ones stop reading it on 1 December 2026, so the settings live in the dashboard). The Dockerfile
builds from the repository root (the server imports `src/net/`), installs only `ws`, runs Node 22. One replica:
rooms live in memory. The game's website service never sets the Dockerfile variable, so it builds as before.

1. In the project: Add → GitHub Repo → this repository (a second box beside the website's). In its settings:
   - Source: branch `main`, Root Directory empty. Config-as-code: empty.
   - Variables: `RAILWAY_DOCKERFILE_PATH=server/Dockerfile`, `PORT=8787`, `EVENT_CODE` (a new code, e.g. 6 letters
     from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`); for the real night also `ALLOWED_ORIGINS` (the game's addresses) and
     `TRACKER_TOKEN` (name reports as tickets).
   - Build → Watch Paths: `/server/**`, `/src/net/**`, `/src/map/nye/plan.ts`, `/src/feedback/tracker.ts` (a push
     that changes only the map never restarts the rooms).
   - Deploy → Healthcheck Path `/health`. Scale: Singapore, 1 replica. Serverless (sleeping) off.
   - Networking: Generate Domain on port 8787.
2. Deploy, then open `https://<domain>/health`: `"ok": true`, `"testRoom": true`, `"names": "shared"` (the game's
   page there means the Dockerfile variable is missing: Railway built the website).
3. Test link: `https://morodokangkor.com/?event=<EVENT_CODE>&nyeserver=wss://<domain>&party=1`. For the night,
   `VITE_NYE_SERVER=wss://<domain>` in the website's build variables (src/net/client.ts).
4. Robot players from your computer: `JOIN_LIMIT_EXEMPT` = your address for the run, then
   `npm run nyeload -- bots=300 url=wss://<domain> code=<EVENT_CODE>`; remove `JOIN_LIMIT_EXEMPT` after.

Check the image here: `docker build -f server/Dockerfile -t nye-live . && docker run -e EVENT_CODE=TEST -p 8787:8787 nye-live`.

Railway's free/hobby plans sleep or limit services; for the night use a plan where the service stays up, and
keep one replica (a second one would split the rooms). A restart forgets hidden names and parties; pages reconnect
by themselves.
