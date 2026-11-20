import type { MapPart, RoamMode } from '../types';
import { joinButton, joinNet, joinOffered, offerOnce, refreshJoinButton, setJoinHere, setJoinSound } from '../ui/_join';
import { closePlayers, openPlayers } from '../ui/_joinPlayers';
import { t } from '../ui/lang';
import type { Minimap } from '../ui/minimap';
import { registerAddon, type AddonEnv } from './_addons';

/**
 * New Year online while roaming (AWP-35 phase 2, tickets 7–8): the roaming side of ui/_join.ts and _joinPlayers.ts.
 *
 * - **The small gold button** "លេងតាមអ៊ីនធឺណិត / Play online" (`joinButton`) under the mini-map beside the
 *   calendar's (ui/minimap.ts `under`; no mini-map: the roaming layer's top right), from the day the square ships to
 *   the night's end; online it says how many play ("Online · 37").
 * - **Once, as roaming starts during the night** (22:30‥00:45 ICT, the night-time hold), the join card (`offerOnce`:
 *   kept, never again; never while in a room, nor when the setting was turned off).
 * - **"E  Player: <name>…"** on foot, a player (`NET.peers`) within `NEAR` m: E opens the players list on them
 *   (Mute, Block, Report: ui/_joinPlayers.ts). A tap does the same on a touch screen (the E row's line, the Use button).
 * - Where he is, for the list's distances (`setJoinHere`).
 *
 * Shots: `nyejoin=list|player` (the pretend room, ui/_joinFake.ts: `nyepeers=<n>`, the first 2 m in front of him)
 * open the list once he stands (`roam=walk&at=x,z`); `nyejoin=button` only the button.
 */

/** A player this near (m, on the ground: x and z; and within `UP` m of his height) is offered in the E row. */
const NEAR = 3;
const UP = 2.5;

let env: AddonEnv | null = null;
let mmPart: Minimap | null = null;
let home: 'minimap' | 'layer' | null = null;
let since = 1;
/** The player E would open (the nearest in reach), by server id. */
let near: number | null = null;

const minimap = (): Minimap | null => (mmPart ??= (env?.parts.find((p: MapPart) => p.name === 'minimap') as Minimap | undefined) ?? null);
const roaming = (mode: RoamMode) => mode !== 'overview' && mode !== 'leap';

/** The button under the mini-map (after the calendar's), else in the roaming layer. */
function place(): void {
  if (!env) return;
  const b = joinButton();
  const mm = minimap();
  const h = mm?.under ? 'minimap' : 'layer';
  if (h !== home || !b.isConnected) {
    home = h;
    (mm?.under ?? env.layer).append(b);
    b.classList.toggle('is-loose', h === 'layer');
  }
  refreshJoinButton();
}

registerAddon({
  id: 'nyePlayers',
  order: 9,
  init(e) {
    env = e;
    setJoinSound(e.uiSound);
    setJoinHere(() => ({ x: e.body.pos.x, y: e.body.pos.y, z: e.body.pos.z, yaw: e.body.yaw }));
    if (joinOffered()) place();
  },
  offer(ctx, mode) {
    near = null;
    if (mode !== 'walk' || !env || env.busy() || !ctx.body.grounded) return null;
    const n = joinNet();
    if (n.state !== 'online' || !n.peers.size) return null;
    const p = ctx.body.pos;
    let best = NEAR * NEAR;
    let name = '';
    for (const o of n.peers.values()) {
      const d = (o.x - p.x) ** 2 + (o.z - p.z) ** 2;
      if (d < best && Math.abs(o.y - p.y) < UP) {
        best = d;
        near = o.sid;
        name = o.name;
      }
    }
    return near === null ? null : `E  ${t('njPlayerE', { name })}`;
  },
  use() {
    if (near !== null) openPlayers(near);
  },
  frame(f) {
    // (once a second: the button's place and line; it shows from the day the square ships)
    since += f.dt;
    if (since < 1) return;
    since = 0;
    if (joinOffered()) place();
    else refreshJoinButton();
  },
  setMode(next, prev) {
    if (next === 'overview') closePlayers();
    // (the night came, and roaming starts: the card once)
    if ((prev === 'overview' || prev === 'leap') && roaming(next)) offerOnce();
  },
  fromUrl(q) {
    const v = q.get('nyejoin');
    if (!env?.shot || !v) return;
    if (v === 'list') openPlayers();
    else if (v === 'player') {
      const first = [...joinNet().peers.keys()][0];
      openPlayers(first);
    }
  },
});
