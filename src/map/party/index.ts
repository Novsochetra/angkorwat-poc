import { NET } from '../../net/client';
import { pad } from '../pad/pad';
import { progress } from '../progress';
import type { UISound } from '../types';
import { t, type WordKey } from '../ui/lang';
import { blockMember, partyBlocked } from './_blocked';
import { joinParty, keptParty, leaveParty, makeParty, partyState, playerId, PartyFail, removeMember, voiceTicket, type Party } from './api';
import { matchFriends, partyLink, voiceFade, VOICE_FAR } from './link';
import { createMicButton } from './mic';
import { createPartyPanel, type PartyView } from './panel';
import type { Voice } from './voice';
import './party.css';

/**
 * Parties and their voice on the world map (AWP-35 Phase 3; the plan
 * docs/discussion/new-year-voice.md). Loaded only when the corner's party
 * button is first pressed (ui.ts), and LiveKit's library only when voice is
 * turned on (voice.ts).
 *
 * One system with the live rooms (phase 2, link.ts): the arcade party's code
 * goes to the live server (`NET.setParty`), so its players share a crowd and
 * see each other's gold mark; five times a second (`FADE_MS`) each friend found
 * on the map (`matchFriends`) is heard by distance (`voiceFade`: full to ≈ 20 m,
 * silent from ≈ 100 m; Mute, Block and the map's own Mute make it 0), the others
 * at full volume, and the friends talking get the speaking mark over their
 * heads (`partyLink.talking`). Block and Report reach the map's player too
 * (`NET.block`, `NET.report`) when the friend is found there.
 *
 * A game pad: the card's □, or the DualSense's touchpad while no menu is open,
 * is the mic switch (Xbox has no free button outside the card).
 *
 * Shots: `partydemo=start|in|voice|talk` draw the card or the mic button with
 * made-up friends, no server (`voice`: ស្រីនាង talking; with `ghosts=` they are
 * matched to the ghosts' party players, who are named as these friends:
 * people/_playersGhosts.ts); `partyask=block|report` ស្រីនាង's row asks.
 */

const POLL_MS = 4000;
/** How often the friends' volumes follow the distance (ms: 5 times a second). */
const FADE_MS = 200;

const REASONS: Record<string, WordKey> = {
  full: 'partyErrFull',
  removed: 'partyErrRemoved',
  'no-party': 'partyErrNoParty',
  'bad-name': 'partyErrName',
  'bad-code': 'partyErrCode',
  offline: 'partyErrOffline',
  'slow-down': 'partyErrSlow',
  'not-member': 'partyErrGone',
};

export interface PartyUI {
  toggle(): void;
  open(): void;
  /** The corner button's look: in a party (how many), voice on. */
  onChange(fn: (inParty: number, voiceOn: boolean) => void): void;
}

/** The name to start with: the one the live rooms show (so friends are found on the map by it), else the name card's. */
function savedName(): string {
  return NET.me?.name || progress.get<string>('nye.name', '') || progress.get<string>('name.latin', '') || progress.get<string>('name.km', '');
}

const DEMO_PARTY: Party = {
  code: 'K7QM2P',
  maker: 'demo-me',
  max: 8,
  members: [
    { id: 'demo-me', name: 'Dara' },
    { id: 'demo-2', name: 'ស្រីនាង' },
    { id: 'demo-3', name: 'Vanna' },
  ],
};

export function mountParty(root: HTMLElement, h: { sound?(s: UISound): void }): PartyUI {
  const demo = new URLSearchParams(location.search).get('partydemo');
  const view: PartyView = { party: null, me: playerId(), name: savedName(), busy: false, error: null, voice: 'off', speaking: new Set(), muted: new Set(), blocked: new Set(), dist: new Map(), note: null };
  const listeners: ((n: number, voiceOn: boolean) => void)[] = [];
  let voice: Voice | null = null;
  let poll = 0;
  let fadeTimer = 0;
  /** The volume each friend was last given (only changes are sent to LiveKit). */
  const volumes = new Map<string, number>();
  /** Each friend found on the map this tick (member id → server id). */
  let found = new Map<string, number>();

  const panel = createPartyPanel(root, {
    make: (name) => run(async () => setParty(await makeParty(name))),
    join: (code, name) => run(async () => setParty(await joinParty(code, name))),
    leave: () => void leave(),
    remove: (id) => run(async () => setParty(await removeMember(id))),
    mute(id, on) {
      if (on) view.muted.add(id);
      else view.muted.delete(id);
      fade();
      draw();
    },
    block(id) {
      const name = view.party?.members.find((m) => m.id === id)?.name ?? '';
      blockMember(id, name);
      view.blocked.add(id);
      fade();
      h.sound?.('close');
      note(t('njBlocked', { name }), true);
    },
    report(id, reason) {
      const name = view.party?.members.find((m) => m.id === id)?.name ?? '';
      const sid = found.get(id);
      if (sid === undefined || demo) {
        h.sound?.('tick');
        return note(t('partyReportNo', { name }), false);
      }
      NET.report(sid, reason);
      // (as on the map: gone from your screen, and not heard either for this visit)
      view.muted.add(id);
      fade();
      h.sound?.('close');
      note(t('partyReported', { name }), true);
    },
    mic() {
      if (!view.party) return false;
      mic.press();
      return true;
    },
    close: () => {
      panel.show(false);
      h.sound?.('close');
    },
  }, { far: VOICE_FAR });
  const mic = createMicButton(root, {
    join: () => void voiceOn(),
    talk: (on) => void voice?.talk(on),
    tapToHear: () => void voice?.resumeAudio(),
  });

  let noteTimer = 0;
  /** A line under the card for a few seconds (a report sent, or not; a block). */
  function note(text: string, ok: boolean): void {
    view.note = { text, ok };
    view.error = null;
    draw();
    clearTimeout(noteTimer);
    if (!demo) noteTimer = window.setTimeout(() => ((view.note = null), draw()), 6000);
  }

  /**
   * Five times a second (link.ts): each friend found on the map heard by distance, the rest at full volume; Mute,
   * Block and the map's own Mute are silent; the friends talking get the speaking mark; the card's distances.
   */
  function fade(): void {
    const party = view.party;
    const talking = partyLink.talking;
    talking.clear();
    view.dist.clear();
    found = new Map();
    if (!party) return;
    const peers = partyLink.ghosts ?? (NET.state === 'online' ? NET.peers : null);
    const match = peers ? matchFriends(party.members, view.me, peers.values(), view.blocked) : null;
    const here = NET.here;
    for (const m of party.members) {
      if (m.id === view.me) continue;
      const p = match?.get(m.id);
      const blocked = view.blocked.has(m.id);
      let vol = 1;
      if (p) {
        found.set(m.id, p.sid);
        if (blocked && !partyLink.ghosts) NET.block(p.sid);
        if (here) {
          const d = Math.hypot(p.x - here.x, p.y - here.y, p.z - here.z);
          view.dist.set(m.id, d);
          vol = voiceFade(d);
        }
      }
      const silent = blocked || view.muted.has(m.id) || (!!p && !partyLink.ghosts && NET.isMuted(p.sid));
      if (silent) vol = 0;
      if (p && !silent && view.voice === 'on' && view.speaking.has(m.id)) talking.add(p.sid);
      if (voice && volumes.get(m.id) !== vol) {
        volumes.set(m.id, vol);
        voice.setVolume(m.id, vol);
      }
    }
    panel.distances(view);
    // (shots: where the made-up friends were found, once, to aim a camera at them)
    if (demo && !demoLogged && match?.size) {
      demoLogged = true;
      console.info(`[map] party: friends on the map: ${[...match].map(([id, p]) => `${party.members.find((m) => m.id === id)?.name} ${p.x.toFixed(1)},${p.y.toFixed(1)},${p.z.toFixed(1)} (${view.dist.has(id) ? Math.round(view.dist.get(id)!) + ' m' : '?'})`).join(' · ')}`);
    }
  }
  let demoLogged = false;

  /** The DualSense's touchpad is the mic switch while in a party (taken again whenever the pad changes: it then comes before the big map's). */
  let stopTouch: (() => void) | null = null;
  const claimTouchpad = (): void => {
    stopTouch?.();
    stopTouch = pad.onPress('touchpad', () => {
      if (!view.party) return false;
      mic.press();
      return true;
    });
  };
  pad.onChange(claimTouchpad);
  claimTouchpad();

  function draw(): void {
    panel.render(view);
    mic.show(view.party !== null);
    mic.setState(view.voice);
    for (const fn of listeners) fn(view.party?.members.length ?? 0, view.voice !== 'off');
  }

  function fail(e: unknown): void {
    view.error = e instanceof PartyFail ? (REASONS[e.reason] ?? 'partyErr') : 'partyErr';
    h.sound?.('tick');
  }

  async function run(job: () => Promise<void>): Promise<void> {
    view.busy = true;
    view.error = null;
    draw();
    try {
      await job();
    } catch (e) {
      fail(e);
    }
    view.busy = false;
    draw();
  }

  function setParty(party: Party | null): void {
    view.party = party;
    if (party) view.name = party.members.find((m) => m.id === view.me)?.name ?? view.name;
    for (const m of party?.members ?? []) if (partyBlocked(m.id)) view.blocked.add(m.id);
    // (one party: the live rooms group and mark its players too)
    if (!demo) NET.setParty(party?.code ?? null);
    clearInterval(poll);
    clearInterval(fadeTimer);
    if (party) {
      if (!demo) poll = window.setInterval(() => void refresh(), POLL_MS);
      fadeTimer = window.setInterval(fade, FADE_MS);
    } else {
      void voiceOff();
      fade();
    }
  }

  async function refresh(): Promise<void> {
    if (document.hidden) return;
    try {
      setParty(await partyState());
    } catch (e) {
      if (e instanceof PartyFail && e.reason !== 'offline') {
        setParty(null);
        fail(e);
      }
    }
    draw();
  }

  async function leave(): Promise<void> {
    await voiceOff();
    setParty(null);
    view.error = null;
    draw();
    await leaveParty();
  }

  async function voiceOn(): Promise<void> {
    if (voice || !view.party) return;
    view.voice = 'connecting';
    view.error = null;
    draw();
    try {
      // (the library itself only now: ≈ 150 KB gzipped, which a player who never talks never loads)
      const [{ joinVoice }, ticket] = await Promise.all([import('./voice'), voiceTicket()]);
      voice = await joinVoice(ticket, {
        speaking: (ids) => ((view.speaking = ids), fade(), draw()),
        needsTap: (held) => mic.needsTap(held),
        reconnecting: (on) => ((view.voice = on ? 'reconnecting' : 'on'), draw()),
        ended: () => void voiceOff('voiceLost'),
      });
      volumes.clear();
      view.voice = 'on';
      fade();
      h.sound?.('select');
    } catch (e) {
      view.voice = 'off';
      view.error = e instanceof PartyFail ? (REASONS[e.reason] ?? 'partyErr') : e instanceof DOMException && e.name === 'NotAllowedError' ? 'voiceNoMic' : 'partyErr';
      mic.say(t(view.error));
    }
    draw();
  }

  async function voiceOff(why: WordKey | null = null): Promise<void> {
    const was = voice;
    voice = null;
    mic.stop();
    view.voice = 'off';
    view.speaking = new Set();
    volumes.clear();
    partyLink.talking.clear();
    if (why) {
      view.error = why;
      mic.say(t(why));
    }
    draw();
    await was?.close();
  }

  if (demo) {
    view.me = 'demo-me';
    view.name = 'Dara';
    view.voice = demo === 'voice' || demo === 'talk' ? 'on' : 'off';
    view.speaking = new Set(demo === 'talk' ? ['demo-me', 'demo-2'] : demo === 'voice' ? ['demo-2'] : []);
    view.muted = new Set(demo === 'in' ? [] : ['demo-3']);
    setParty(demo === 'start' ? null : DEMO_PARTY);
    panel.show(demo !== 'talk');
    draw();
    const ask = new URLSearchParams(location.search).get('partyask');
    if (ask === 'block' || ask === 'report') panel.ask('demo-2', ask);
    if (demo === 'talk') mic.demoTalking();
  } else if (keptParty()) {
    void refresh();
  } else {
    draw();
  }

  return {
    toggle() {
      panel.show(!panel.open);
      h.sound?.(panel.open ? 'open' : 'close');
      if (panel.open && view.party && !demo) void refresh();
    },
    open() {
      if (panel.open) return;
      panel.show(true);
      h.sound?.('open');
      if (view.party && !demo) void refresh();
    },
    onChange(fn) {
      listeners.push(fn);
      fn(view.party?.members.length ?? 0, view.voice !== 'off');
    },
  };
}
