# New Year's Eve: party voice on our own LiveKit server

Phase 3 of AWP-35 (the plan: `new-year-online.md`), talked over with the owner on
2026-11-20. The voice server is up and a first call worked (Mac and phone,
the phone on 4G: "it work perfectly"). No game code yet: the owner says when.
Lines marked **(to confirm)** are proposals waiting for the owner.

## Where it stands (2026-11-20)

- **Voice server:** LiveKit on the Droplet at `voice.morodokangkor.com`; a first call (Mac and a
  phone on 4G) worked.
- **Live service:** parties and voice tickets in the arcade repo (`apps/live`, on `main`), the
  Railway service `@arcade/live` at `arcadelive-production.up.railway.app`. Checked: a party
  made, a ticket written (so Railway's key and secret match the Droplet's), another site refused.
  It serves any game in `LIVE_GAMES`, so other arcade games can use parties later.
- **In the game:** `src/map/party/` (CLAUDE.md "Parties and party voice"): the party card, the
  mic button, Mute and Remove.
- **One system with Phase 2** (`party/link.ts`, 2026-11-20): the arcade party is the party. Its
  code goes to our WebSocket server (the hello's `party`, and `ClientParty.code` when it changes:
  no protocol bump, older pages and servers ignore it); the server groups any code of the party
  letters in one crowd (a full crowd still takes a member; joining later moves him into the
  party's crowd), so friends land together and see each other's gold mark. The arcade service
  stays the authority on who is in the party.
- **Distance fade:** done as planned below ("Proximity volume"): 5 times a second each friend is
  found among the map's party players by name (one left over on each side paired) and heard by
  distance, full to 20 m, silent from 100 m (`voicenear=`, `voicefar=`); not found, or not online:
  full volume. The card shows each friend's distance ("too far to hear" past the fade).
- **Speaking mark:** a friend talking shows three sound bars over their name tag and their gold
  diamond bobs; in the party list, a green dot.
- **Safety:** Mute (this visit), Block (for good on this device, by their arcade player id; also
  hidden on the map), Report (sent as the map's report when the friend is found on the map, else
  the card says it couldn't be sent). Not yet: a blocked player kept out of a party you're in
  (that is the arcade service's to do).
- **Open:** the party button shows while the New Year event is on offer (the join card's
  conditions), and the join card links to the party card. A pad: □ on the party card, and the
  DualSense touchpad, are the mic switch (Xbox: only from the card: every other button is taken).
- Not yet: the Voice volume in the Sound settings, ducking the music, the stereo pan, the "About
  voice" text for parents.

## What we decided

| Question | Decision |
|---|---|
| What carries the voice? | **LiveKit**, the open-source server (Apache 2.0), run by us. Voice only: no camera, no video, no screen sharing, no recording. |
| Why not Railway? | Voice needs UDP ports; Railway passes only web traffic. Our token server (who may talk) stays on Railway. |
| Why not LiveKit Cloud? | It works, but the owner's budget: Cloud's Ship plan is $50 a month and stops at 1,000 people at once; the free plan stops at 100 at once and 5,000 minutes a month. The game code is the same for both, so Cloud stays the spare. |
| Where? | A DigitalOcean Droplet in Singapore (`sgp1`), the nearest big data centre to Cambodia. |
| How big? | Small first: the $6 Droplet (1 CPU, 1 GB, 1 TB transfer) for setup and tests. Bigger only for the load test (a few hours) and the night (30 Dec → 1 Jan), at the size the load test says. Billed by the hour. |
| Docker? | No: `livekit-server` (one program) and Caddy (HTTPS) run straight on Ubuntu as system services. |
| Address | `wss://voice.morodokangkor.com` (an A record at Namecheap, where the domain's DNS is; "DNS only", nothing in front of it). |
| Cost | December ≈ $9–12: $6 for the small Droplet, under $1 for the load test, ≈ $2.50–5 for the night's size. |

The Droplet's IP and the keys are not written here (the repo may be public): the
IP is in DigitalOcean and Namecheap, the secret only in the Droplet's
`/etc/livekit/keys.yaml` and, later, in the token server's settings on Railway.
Never paste the secret into a chat or a file in git.

## How it works

Three pieces:

1. **The voice server** (`voice.morodokangkor.com`): LiveKit receives each
   player's voice and sends it on to the others in the same room (a party is one
   room). It knows nothing about the game; it only lets in someone with a
   valid ticket.
2. **Our token server** on Railway (the Phase 2 live service, or beside it): it
   knows the parties. It writes a ticket (a token signed with the LiveKit
   secret) only for a member of the party, for that party's room only, and only
   for a microphone (no camera, no screen, no data). Tickets live 15 minutes and
   the game asks for a new one while voice is on. **(to confirm)**
3. **The game in the browser**: LiveKit's browser library (`livekit-client`),
   downloaded only when a player turns voice on.

What happens:

- **Make a party:** the live service makes a 6-letter code (no 0 / O look-alikes)
  and a LiveKit room `party-<code>` with at most 8 people (set by the token
  server when it makes the room, so a 9th ticket is refused by LiveKit too).
- **Join a party:** a friend types the code; the live service puts them in the
  party (and in the same crowd).
- **Turn voice on:** the first tap on the mic button (the browser needs a tap):
  1. the game downloads the voice library (once);
  2. the browser asks for the microphone (the party card has already said who
     hears you and that voice isn't recorded);
  3. the game asks the token server for a ticket, the server checks the party and
     answers with the ticket and the address;
  4. the game joins the room with the mic on: it hears the friends, and they hear
     it until a tap turns the mic off.
- **Leave the party, close the page:** the game leaves the room.
  A player with voice off is not connected to the voice server at all (costs
  nothing).

## The voice server (how it was set up)

On the Droplet (Ubuntu 24.04, as root), the steps that worked on 2026-11-20:

- System: `apt update && apt upgrade -y`; 1 GB of swap (`/swapfile`).
- Firewall (`ufw`): OpenSSH, 80/tcp and 443/tcp (Caddy and its certificate),
  7881/tcp (voice over TCP when UDP is blocked), 3478/udp (the relay, TURN),
  50000–60000/udp (the voice itself).
- `livekit-server` from `https://get.livekit.io`, run as the user `livekit` by
  `/etc/systemd/system/livekit.service` (starts after a reboot, restarts if it
  falls over; logs: `journalctl -u livekit`).
- `/etc/livekit/livekit.yaml`:

  ```yaml
  port: 7880
  rtc:
    tcp_port: 7881
    port_range_start: 50000
    port_range_end: 60000
    use_external_ip: true
  turn:
    enabled: true
    domain: voice.morodokangkor.com
    udp_port: 3478
  key_file: /etc/livekit/keys.yaml
  logging:
    level: info
  ```

- `/etc/livekit/keys.yaml`: one line `<key>: <secret>`, made on the server with
  `openssl rand`, owner `livekit`, mode 600 (LiveKit refuses a key file others can read).
- Caddy (`apt install caddy`), `/etc/caddy/Caddyfile`:
  `voice.morodokangkor.com { reverse_proxy 127.0.0.1:7880 }`. Caddy gets and
  renews the certificate. `curl https://voice.morodokangkor.com` answers `OK`.
- The `lk` tool (`https://get.livekit.io/cli`) makes test tickets:
  `lk token create --api-key … --api-secret … --join --room test --identity mac --valid-for 2h`
  (read from `keys.yaml`; without keys it asks for a LiveKit Cloud login: Ctrl+C).
- The first call: `https://meet.livekit.io` → Custom, the server URL and a ticket.

To do before the night:

- Write these steps as one script in the repo (no secrets in it), so a new
  Droplet is ready in minutes: the spare, or after a crash.
- The relay over TLS on port 443 (TURN/TLS), for school and office networks
  that block everything but websites. **(to confirm: worth it for the night)**
- DigitalOcean's Monitoring graphs on, and an alert when the CPU stays high.

## The load test

Around 15 December, one afternoon:

- Resize the Droplet ("CPU and RAM only", so it can shrink back) to the size we
  think the night needs.
- From the owner's Mac (never from the server itself): `lk load-test`, many
  rooms of 8 at once, voices talking, more and more until the voice breaks;
  watch the CPU and the network in DigitalOcean.
- The answer: how many players with voice on one Droplet carries. Then pick the
  night's size, resize back to $6.
- Also measured that day: what the night costs in data (each player hears
  about 1–2 voices at a time, ≈ 30 kbps each; 2,000 players for 2 hours ≈ 100 GB,
  well inside 1 TB).

## The night's spare

From 30 December: a second Droplet, the same, built from the script, under a
second name (`voice2.morodokangkor.com`). The token server hands out the first
address, and the second if the first doesn't answer. If both fail, voice is off
and the night goes on: the show never needs it.

## The size it adds to the game

`livekit-client` 2.24.1, measured: 580 KB minified, **≈ 150 KB gzipped**
(some of it video code we won't use). It is loaded with `import()` only when a
player turns voice on, in a chunk of its own; the map's own load doesn't change.

## Phones: the hard parts

Check each on a real iPhone (Safari) and a real Android (Chrome) in the first
days, before the rest is built.

- **Microphone permission:** asked only when the player turns voice on, after our
  card explains why. If refused, a card says how to allow it (iPhone: Settings →
  Safari → Microphone, or "aA" in the address bar → Website Settings; Android:
  the lock by the address → Permissions). Safari may ask again on each visit.
- **Sound only after a tap:** turning voice on is a tap, and the game starts
  LiveKit's audio inside it (`room.startAudio()`). If the browser still holds it,
  the card we already have for held sound (`onHeld` in `audio/audio.ts`) asks for
  a tap.
- **The phone locks or the player leaves the page:** iOS stops the microphone and
  the sound. The party list shows the friend as "away"; when the page comes back,
  LiveKit reconnects by itself (seen in the first test). No voice with the
  screen off: we don't promise it.
- **The game's sound and music while people talk:** on iPhone, opening the
  microphone switches the page's sound to "call" mode (quieter, sometimes from
  the earpiece). Safari's `navigator.audioSession.type = 'play-and-record'`
  keeps it on the speaker. While a friend talks, the music and the fireworks dip
  a little (ducking). A **Voice** volume joins the other buses in the Sound
  settings (`VOLUME_KEYS`).
- **Echo:** the browser's echo cancelling, noise suppression and auto gain stay
  on (LiveKit's defaults). The mic is a switch, so it stays open
  while on: the card says headphones stop echo, and the mic turns itself off
  when the page is hidden.
  Chrome doesn't always cancel sound played through Web Audio: check it early
  with the proximity volume on.
- **4G:** voice is ≈ 30 kbps each way, fine on 4G. The first test, a phone on 4G
  in Cambodia to Singapore, sounded right. If a network blocks UDP, voice goes
  over TCP 7881, or the relay.

## Proximity volume

The game already knows where the party's members are (Phase 2: a party is
always in the same crowd). Five times a second, each friend's voice volume is
set from the distance between them on the map (LiveKit's
`participant.setVolume`):

- close (up to ≈ 20 m, about half the festival square): full volume;
- then quieter with distance;
- far (≈ 100 m and more): **silent** (owner, 2026-11-20). For a feel of the
  size (1 unit = 1 m): the festival square is ≈ 45 m across, so 100 m is about
  two squares away; the whole map is ≈ 1.4 km by 0.9 km.
- These are first numbers: tuned by ear in the test room (`voicenear=`,
  `voicefar=` in the address).
- In a boat, on the glider, in the balloon: the same rule.
- Later, if there is time: left / right from where the friend stands (a stereo
  pan, not full 3D: cheap on phones).

A friend who talks shows a small speaking mark over their head and in the
party list.

## The mic switch

At first push-to-talk (hold to talk, slide up to lock); after testing, the owner
(2026-11-20): one button, a switch, no holding.

- **One control:** a round microphone button at the bottom right, there while
  in a party, over the party card too. No voice button in the card.
- **First tap:** joins voice and turns the mic on (gold). **Then a tap** turns
  the mic off (white, crossed out) or on again. Friends are heard either way.
- **Computer:** Left Alt / Option does the same as a tap (almost every letter is
  taken, and V is the album); the hint under the button names it.
- **The page hidden** (another tab or app, the phone locked) turns the mic off;
  a tap turns it on again.
- The microphone track is opened once when voice turns on and only muted and
  unmuted after, so the first word isn't cut off.
- All of it is the game's own: its buttons, its party list, its cards, in its
  look and words (Khmer first). `meet.livekit.io` was only to try the server;
  players never see a LiveKit page.
- **Mute** per member (in the party list): you stop hearing them; your own mic
  is the microphone button, crossed out when off.

## Phase 2 on LiveKit too?

LiveKit could also carry the players' positions (its data messages). **No:**

- Phase 2 is for everyone, voice or not, and public; voice is only for parties.
  Positions through LiveKit would put every player on the voice server and
  make its load, and its failure, everyone's.
- The show and the crowds must work if voice is down.
- The rooms, crowds, limits, movement checks and name checks are our own rules
  anyway, in our own WebSocket service on Railway.

So: Phase 2 on our WebSocket service; LiveKit for party voice only.

## Safety

- **No recording:** no recording part (LiveKit's Egress) is installed, and the
  tickets allow a microphone only. The voice card says "Voice isn't recorded".
- **Who can hear you:** only people in your party, who got the code from a friend.
  Never strangers. Off until you turn it on; you talk only while holding the
  button.
- **Mute** a member (only for you), **Block** (mute for good, and they can't join
  a party you're in again), **Report** (into the tracker, as names are). A report
  carries no sound: nothing is kept.
- **The party's maker can remove a member:** the token server takes them out of
  the room and gives them no new ticket (owner, 2026-11-20).
- **No personal data:** the voice server sees a random player id and the checked
  name; it keeps no logs of what was said (it never has it).
- **For parents** (a short "About voice" text in the settings): voice works only
  between friends who share a party code, up to 8; it is off by default; the
  microphone is on only while the button is held; nothing is recorded; the
  server is in Singapore. No extra parents' switch (owner, 2026-11-20): voice
  is already off until it is turned on.

## Testing with the hidden link

- The hidden test link (`/?event=<code>`) works for voice too: parties in the
  test room get rooms `test-party-<code>` on the same voice server, kept apart
  from the public ones.
- Alone, no game: `lk token create` and `meet.livekit.io` (as on 2026-11-20).
- In the game, with friends: two phones and a computer in a party; 4G and Wi-Fi;
  lock and come back; Mute; a far friend quieter; a 9th player refused; a
  ticket refused for someone not in the party; the music dipping.
- Headless: `npm run nyetest` opens pages in Chromium with a fake microphone
  (`--use-fake-device-for-media-stream`), joins voice and checks each page sees
  the others' audio.
- The load test above, then the night's size.

## Timeline

| By | What |
|---|---|
| 20 Nov | Voice server up at `voice.morodokangkor.com`; first call works. |
| ~15 Dec | The load test; the night's size picked. |
| ~20 Dec | Phase 2 and the test link (the plan); the token server with it. |
| ~27 Dec | Party voice in the game; freeze. |
| 30 Dec | The Droplet resized, the spare built. |
| 1–2 Jan | Back to $6, the spare deleted. |

If voice isn't solid by the 27th, the night goes on without it.

## Questions for the owner

1. ~~A far friend: a quiet floor or silent?~~ Silent (≈ 100 m, tuned in the test room).
2. ~~The computer's key?~~ Left Alt / Option, and the mic is a switch, not held.
3. ~~Can the party's maker remove a member?~~ Yes.
4. ~~A switch for parents that keeps voice off on the device?~~ Not needed.
5. The relay on port 443 (TURN/TLS) for strict networks: worth it for the night?
