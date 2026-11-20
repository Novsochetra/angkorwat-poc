import type { PeerState, RoomKind } from './protocol';

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

export interface NetClient {
  readonly state: NetState;
  /** Why the server refused (a name: names.ts's reason key; 'code'; 'full'…), when `state` is 'refused'. */
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
  makeParty(): void;
  leaveParty(): void;
  /** Something changed (state, peers joined or left, the count, the party): for the interface. */
  onChange(cb: () => void): () => void;
}
