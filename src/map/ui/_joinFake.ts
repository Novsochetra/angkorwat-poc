import type { RoomKind } from '../../net/protocol';
import type { JoinOptions, NetClient, NetPeer, NetState } from '../../net/types';

/**
 * A pretend live room for shots (ui/_join.ts `joinNet`, only with `shot=1` and `nyejoin=`): the join card, the
 * button, the setting and the players list drawn in each state with no server. Nothing connects.
 *
 * - `nyejoin=card|connecting|online|retrying|offline|refused:<reason>|code|list|player|button` (ui/_join.ts says
 *   what each opens); the state here: `connecting`, `retrying`, `offline` (no server: refused 'offline'),
 *   `refused:<reason>` (a names.ts reason, `name`, `code`, `full`…), `online` / `list` / `player` online, the others off.
 * - `nyepeers=<n>`: players round him (default 6 online; 0 none), the first 2 m in front of him (the E choice).
 * - `nyecrowd=<n>` (default 1), `nyeonline=<n>` players in the room (default 37); `nyetest=1` the test room.
 */

/** The fake's extras, as the real client's (net/client.ts): a server is set, the test link's code, the look seed. */
export interface JoinNetExtras {
  readonly available?: boolean;
  readonly pendingCode?: string | null;
  readonly look?: number;
}
export type JoinNet = NetClient & JoinNetExtras;

const NAMES = ['Sophia', 'ដារ៉ា', 'Minh', 'Sokha', 'Lucas', 'ស្រីនាង', 'Aiko', 'Vannak', 'Chloé', 'វណ្ណៈ', 'Ravi', 'Bopha'];

export function makeFakeNet(q: URLSearchParams, here: () => { x: number; y: number; z: number; yaw: number } | null): JoinNet {
  const v = q.get('nyejoin') ?? 'card';
  const [kind, why] = v.split(':');
  const onlineKinds = ['online', 'list', 'player'];
  let state: NetState = onlineKinds.includes(kind) ? 'online' : kind === 'connecting' ? 'connecting' : kind === 'retrying' ? 'retrying' : kind === 'refused' || kind === 'offline' ? 'refused' : 'off';
  let refusal: string | null = kind === 'offline' ? 'offline' : kind === 'refused' ? (why ?? 'name') : null;
  const test = q.get('nyetest') === '1';
  let room: RoomKind | null = state === 'off' || state === 'refused' ? null : test ? 'test' : 'public';
  const crowd = Number(q.get('nyecrowd') ?? 1) || 1;
  const online = Number(q.get('nyeonline') ?? 37) || 0;
  const want = Number(q.get('nyepeers') ?? (state === 'online' ? 6 : 0));
  const peers = new Map<number, NetPeer>();
  const muted = new Set<number>();
  const listeners = new Set<() => void>();
  let made = false;
  const emit = () => listeners.forEach((f) => f());

  /** The players round him (made the first time asked, where he stands then). */
  const fill = () => {
    if (made) return;
    const h = here();
    if (!h) return;
    made = true;
    for (let i = 0; i < want; i++) {
      // (the first in front of him, 2 m off; the others round about, farther each)
      const a = i === 0 ? h.yaw : h.yaw + 1.1 + i * 2.39;
      const d = i === 0 ? 2 : 4 + i * 5.5;
      const x = h.x + Math.sin(a) * d;
      const z = h.z + Math.cos(a) * d;
      peers.set(100 + i, { sid: 100 + i, name: NAMES[i % NAMES.length], look: i * 7919, ride: 0, emote: 0, emoteAt: 0, party: false, x, y: h.y, z, yaw: a + Math.PI, stale: 0 });
    }
  };

  const fake: JoinNet = {
    get state() {
      return state;
    },
    get refusal() {
      return refusal;
    },
    get room() {
      return room;
    },
    get crowd() {
      return state === 'online' ? crowd : 0;
    },
    get me() {
      return state === 'online' ? { sid: 1, name: q.get('name') ?? 'Dara' } : null;
    },
    party: { code: null, members: 0 },
    get count() {
      return { square: 0, lake: 0, online: state === 'online' ? online : 0 };
    },
    get peers() {
      if (state === 'online') fill();
      return peers;
    },
    available: kind !== 'offline',
    pendingCode: q.get('event'),
    look: 1,
    join(o: JoinOptions) {
      state = 'online';
      refusal = null;
      room = o.room;
      emit();
    },
    leave() {
      state = 'off';
      room = null;
      emit();
    },
    update() {},
    emote() {},
    mute(sid, on) {
      if (on) muted.add(sid);
      else muted.delete(sid);
      emit();
    },
    block(sid) {
      peers.delete(sid);
      emit();
    },
    report(sid) {
      peers.delete(sid);
      emit();
    },
    isMuted: (sid) => muted.has(sid),
    voiceTicket() {
      return Promise.reject(new Error('off'));
    },
    makeParty() {},
    leaveParty() {},
    setParty() {},
    get here() {
      return here();
    },
    onChange(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
  return fake;
}
