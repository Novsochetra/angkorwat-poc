# The live service (New Year's Eve, AWP-35)

Parties and voice tickets for the party voice (Phase 3); Phase 2's live player
rooms join this same service later. The plan is `docs/discussion/new-year-voice.md`.

- `parties.mjs`: parties (a 6-letter code, up to 8, the maker can remove a member),
  in memory only.
- `server.mjs`: the HTTP routes, limits, and tickets for the voice server.
- `index.mjs`: starts it from the environment's settings.
- `npm test`: the rules and routes, with a stand-in voice server.

## Routes (POST, JSON)

| Route | Send | Answer |
|---|---|---|
| `/party/make` | `playerId`, `name` | `code`, `key`, the party |
| `/party/join` | `code`, `playerId`, `name` | `code`, `key`, the party (`full`, `removed`, `no-party`) |
| `/party/state` | `code`, `playerId`, `key` | the party: `maker`, `members` (`id`, `name`), `max` |
| `/party/leave` | `code`, `playerId`, `key` | `ok` (and drops them from voice) |
| `/party/remove` | `code`, `playerId`, `key`, `target` | the party (the maker only; drops them from voice) |
| `/voice/ticket` | `code`, `playerId`, `key` | `url`, `room`, `token` |

`playerId` is a random id the game makes on the device; `key` is what make or join
answered, kept by the game for that party. Errors are `{ "error": "<word>" }`, a
word the game turns into its own Khmer or English text.

A ticket lets its player into `party-<code>` only, with a microphone only (no
camera, screen or data), and lasts 10 minutes (to join; once in, they stay).
The voice room is made with at most 8 people.

## On Railway

1. In the Railway project: **New → GitHub Repo** → this repository.
2. The new service's **Settings → Source → Root Directory**: `server/live`.
   Railway then runs `npm install` and `npm start` there.
3. **Variables:**

   | Name | Value |
   |---|---|
   | `LIVEKIT_URL` | `wss://voice.morodokangkor.com` |
   | `LIVEKIT_API_KEY` | the key from the Droplet's `/etc/livekit/keys.yaml` (before the `:`) |
   | `LIVEKIT_API_SECRET` | the secret from that file (after `: `). Only here and on the Droplet. |
   | `ALLOWED_ORIGINS` | the game's addresses, comma-separated, e.g. `https://morodokangkor.com,https://www.morodokangkor.com,http://localhost:5173` |

   To read the key and secret on the Droplet: `cat /etc/livekit/keys.yaml`, and
   copy them straight into Railway (never into a chat or a file in git).
4. **Settings → Networking → Generate Domain**: the service's address
   (`….up.railway.app`), which the game is told about (`VITE_LIVE_URL`).
5. Check: opening `https://<that address>/health` shows `{"ok":true,…}`.
