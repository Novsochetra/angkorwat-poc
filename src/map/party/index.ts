import { progress } from '../progress';
import type { UISound } from '../types';
import type { WordKey } from '../ui/lang';
import { joinParty, keptParty, leaveParty, makeParty, partyState, playerId, PartyFail, removeMember, voiceTicket, type Party } from './api';
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
 * Until Phase 2 sends players' positions, everyone in the party is heard at
 * full volume; the distance fade (silent from ≈ 100 m) comes with it.
 *
 * Shots: `partydemo=start|in|voice|talk` draw the card or the mic button with
 * made-up friends, no server.
 */

const POLL_MS = 4000;

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
  /** The corner button's look: in a party (how many), voice on. */
  onChange(fn: (inParty: number, voiceOn: boolean) => void): void;
}

function savedName(): string {
  return progress.get<string>('name.latin', '') || progress.get<string>('name.km', '');
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
  const view: PartyView = { party: null, me: playerId(), name: savedName(), busy: false, error: null, voice: 'off', speaking: new Set(), muted: new Set() };
  const listeners: ((n: number, voiceOn: boolean) => void)[] = [];
  let voice: Voice | null = null;
  let poll = 0;

  const panel = createPartyPanel(root, {
    make: (name) => run(async () => setParty(await makeParty(name))),
    join: (code, name) => run(async () => setParty(await joinParty(code, name))),
    leave: () => void leave(),
    remove: (id) => run(async () => setParty(await removeMember(id))),
    mute(id, on) {
      if (on) view.muted.add(id);
      else view.muted.delete(id);
      voice?.setVolume(id, on ? 0 : 1);
      draw();
    },
    voice: (on) => void (on ? voiceOn() : voiceOff()),
    close: () => {
      panel.show(false);
      h.sound?.('close');
    },
  });
  const mic = createMicButton(root, {
    talk: (on) => void voice?.talk(on),
    tapToHear: () => void voice?.resumeAudio(),
  });

  function draw(): void {
    panel.render(view);
    mic.show(view.voice === 'on' || view.voice === 'reconnecting');
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
    clearInterval(poll);
    if (party) poll = window.setInterval(() => void refresh(), POLL_MS);
    else void voiceOff();
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
        speaking: (ids) => ((view.speaking = ids), draw()),
        needsTap: (held) => mic.needsTap(held),
        reconnecting: (on) => ((view.voice = on ? 'reconnecting' : 'on'), draw()),
        ended: () => void voiceOff('voiceLost'),
      });
      for (const id of view.muted) voice.setVolume(id, 0);
      view.voice = 'on';
      h.sound?.('select');
    } catch (e) {
      view.voice = 'off';
      view.error = e instanceof PartyFail ? (REASONS[e.reason] ?? 'partyErr') : e instanceof DOMException && e.name === 'NotAllowedError' ? 'voiceNoMic' : 'partyErr';
    }
    draw();
  }

  async function voiceOff(why: WordKey | null = null): Promise<void> {
    const was = voice;
    voice = null;
    mic.stop();
    view.voice = 'off';
    view.speaking = new Set();
    if (why) view.error = why;
    draw();
    await was?.close();
  }

  const demo = new URLSearchParams(location.search).get('partydemo');
  if (demo) {
    view.party = demo === 'start' ? null : DEMO_PARTY;
    view.me = 'demo-me';
    view.name = 'Dara';
    view.voice = demo === 'voice' || demo === 'talk' ? 'on' : 'off';
    view.speaking = new Set(demo === 'talk' ? ['demo-me', 'demo-2'] : []);
    view.muted = new Set(demo === 'in' ? [] : ['demo-3']);
    panel.show(demo !== 'talk');
    draw();
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
      if (panel.open && view.party) void refresh();
    },
    onChange(fn) {
      listeners.push(fn);
      fn(view.party?.members.length ?? 0, view.voice !== 'off');
    },
  };
}
