import type { RoomKind } from './protocol';

/**
 * The game's side of the live rooms (phase 2): what the rest of the map uses. The connection itself is
 * src/net/client.ts (`NET`); the other players are drawn by people/_scenePlayers.ts; the join card, the name entry,
 * the players list (Mute, Block, Report) are ui/_join*.ts. Playing alone works as before: nothing connects until the
 * player chooses to join (or opens the test link).
 */

export type NetState = 'off' | 'connecting' | 'online' | 'retrying' | 'refused';

/** Another player as the map draws them: their last two states and when, so the drawing can glide between them. */
export interface NetPeer {
  readonly sid: number;
  /** As shown: the checked name, or "Player" when the server hid it; blocked players are not in `peers` at all. */
  name: string;
  look: number;
  ride: number;
  emote: number;
  /** When the emote began (the page's clock, ms: `performance.now()`), so it plays once. */
  emoteAt: number;
  party: boolean;
  /** Where they are now on this screen (eased between the server's snapshots, about 120 ms behind them). */
  x: number;
  y: number;
  z: number;
  yaw: number;
  /** Seconds since the last snapshot that had them (they fade out after a few). */
  stale: number;
}

export interface JoinOptions {
  name: string;
  look: number;
  room: RoomKind;
  /** The test room's code (`/?event=<code>`, or typed in "Have a code?"). */
  code?: string;
  party?: string;
}

/** A ticket to the crowd's voice room (LiveKit): the server, the token, the room's name. */
export interface VoiceTicket {
  url: string;
  token: string;
  room: string;
}

export interface NetClient {
  readonly state: NetState;
  /** A live server is set for this page (`VITE_NYE_SERVER`, or `?nyeserver=` for checks): joining can work. False: "the event isn't online" (joining refuses with 'offline'). */
  readonly available: boolean;
  /** The test room's code from the hidden link (`/?event=<code>`), or null: the join card joins `room: 'test'` with it once the player has a name. */
  readonly pendingCode: string | null;
  /** This device's look seed (from its random id: the same every night), for `JoinOptions.look`. */
  readonly look: number;
  /** The last error the server sent that did not end the connection ('party', 'moved', 'rate'), for a toast; null when none. */
  readonly lastError?: string | null;
  /** Why the server refused (a name: names.ts's reason key; 'code'; 'full'; 'version'; 'offline': no server set), when `state` is 'refused'. */
  readonly refusal: string | null;
  /** The room and crowd joined, my server id and accepted name, my party's code. */
  readonly room: RoomKind | null;
  readonly crowd: number;
  readonly me: { sid: number; name: string } | null;
  readonly party: { code: string | null; members: number };
  /** Players on each stage's ground and in the room (the boards show `square` / `lake`). */
  readonly count: { square: number; lake: number; online: number };
  /** The other players near me (not blocked), by server id. */
  readonly peers: ReadonlyMap<number, NetPeer>;
  /** Connect and join (the server checks the name and the code again). */
  join(o: JoinOptions): void;
  /** Leave and disconnect (playing alone again). */
  leave(): void;
  /** Each frame (main.ts): send my state (≤ 5 a second, fewer while still), ease the peers. */
  update(dt: number, me: { x: number; y: number; z: number; yaw: number; ride: number } | null): void;
  emote(e: number): void;
  /** Mute hides their emotes' sounds and later their voice; Block hides them for good (saved on this device); Report tells the server. */
  mute(sid: number, on: boolean): void;
  block(sid: number): void;
  report(sid: number, reason: 'name' | 'behaviour'): void;
  isMuted(sid: number): boolean;
  /** A ticket to my crowd's voice room (online only). */
  voiceTicket(): Promise<VoiceTicket>;
  makeParty(): void;
  leaveParty(): void;
  /**
   * The arcade party the player is in (phase 3: map/party/), or null when in none: the server groups the party's
   * players in one crowd and marks them to each other (`NetPeer.party`), now if online, else from the next hello.
   */
  setParty(code: string | null): void;
  /** Where he was last on the map (what `update` was given; the party's voice fades by the distance to a friend). */
  readonly here: { readonly x: number; readonly y: number; readonly z: number } | null;
  /** Something changed (state, peers joined or left, the count, the party): for the interface. */
  onChange(cb: () => void): () => void;
}
