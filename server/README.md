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

The service builds from the repository root with `server/railway.json` (Nixpacks, no Dockerfile): it installs only
`server/`'s packages (`ws`), skips the game's build, and starts `node --experimental-strip-types server/main.ts`
(the flag is needed on Node 22 before 22.18 and does nothing after). One replica only: rooms live in memory.

1. **Staging first.** In the Railway project: New → GitHub Repo → this repository. In the new service's
   Settings:
   - Source: Root Directory empty (the repository root: the server imports `src/net/`), branch as you like
     (e.g. a `staging` branch, or `main`).
   - Config-as-code: Railway Config File = `server/railway.json`.
   - Networking: Generate Domain (gives `wss://<name>.up.railway.app`).
   - Variables: `EVENT_CODE` (a new code, e.g. 6 letters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`), and
     `NIXPACKS_NODE_VERSION=22` if the build log shows an older Node. Leave `TRACKER_TOKEN` out on staging (or
     point `TRACKER_URL` at a test tracker), so tests file no real tickets.
   - Deploy, then open `https://<domain>/health`: `"ok": true`, `"testRoom": true`, `"names": "shared"`.
   - Try it with bots from your computer: set `JOIN_LIMIT_EXEMPT` to your address on staging for the run, then
     `npm run nyeload -- bots=300 url=wss://<domain> code=<EVENT_CODE>`; remove `JOIN_LIMIT_EXEMPT` after.
2. **Production:** the same again as a second service (or a second Railway environment of the project), branch
   `main`, its own domain (a custom one like `live.<site>` if wanted), its own `EVENT_CODE` (different from
   staging's), `TRACKER_TOKEN` (a tracker API token), `ALLOWED_ORIGINS` = the game's address(es).
3. Give the game the production address: `VITE_NYE_SERVER=wss://<domain>` in the build's .env (src/net/client.ts); `?nyeserver=wss://<staging domain>` in the address tries staging.

Railway's free/hobby plans sleep or limit services; for the night use a plan where the service stays up, and
keep one replica (a second one would split the rooms). A restart forgets hidden names and parties; pages reconnect
by themselves.
