import type { VoiceTicket } from '../../net/types';
import { createMicButton, type MicButton } from '../party/mic';
import { partyLink, VOICE_FAR, voiceFade } from '../party/link';
import type { VoiceState } from '../party/panel';
import type { Voice } from '../party/voice';
import { t, type WordKey } from './lang';
import type { JoinNet } from './_joinFake';
import '../party/party.css';

/**
 * The room's voice (AWP-35, the owner, November 2026: "the mic in the room"): everyone in the New Year room who turns
 * the mic button on talks with the players near them.
 *
 * - **The ticket** comes from the live server (`NET.voiceTicket`, server/app.ts `onVoice`): a LiveKit token for the
 *   crowd's voice room (≤ 120 players), its identity the player's server id, so a voice IS the player on the map: no
 *   matching by name, and Mute / Block (the players list) silence exactly that player.
 * - **Who is heard** (5 times a second): the nearest `HEAR_MAX` players within `VOICE_FAR` m, not muted; only their
 *   sound is received at all (`Voice.want`), each at `voiceFade(distance)`: full to ≈ 20 m, silent from ≈ 100 m.
 * - **The speaking mark:** the server ids of those talking go in `partyLink.talking`; the players scene shows the
 *   sound bars over their name tags.
 * - **The mic button** (party/mic.ts, bottom right) shows while online: the first tap asks for the microphone and
 *   joins; then a tap (or Alt / Option) turns the mic on or off. Leaving the room, or the connection lost, ends voice;
 *   a new crowd (the room grew) joins that crowd's voice room.
 */

/** Players heard at once at most (the nearest). */
const HEAR_MAX = 12;
/** How often the volumes and who is heard are set (ms). */
const TICK_MS = 200;

export interface RoomVoice {
  readonly state: VoiceState;
}

const REASONS: Record<string, WordKey> = { off: 'voiceRoomOff', rate: 'voiceRoomSlow', offline: 'voiceLost', timeout: 'voiceRoomOff' };

export function installRoomVoice(net: JoinNet, root: HTMLElement): RoomVoice {
  let voice: Voice | null = null;
  let state: VoiceState = 'off';
  let ticketRoom: string | null = null;
  let crowd = 0;
  let tick = 0;
  let joining = false;
  const sent = new Map<string, number>();

  const mic: MicButton = createMicButton(root, {
    join: () => void on(),
    talk: (v) => void voice?.talk(v),
    tapToHear: () => void voice?.resumeAudio(),
  });

  function set(s: VoiceState): void {
    state = s;
    mic.setState(s);
  }

  function say(key: WordKey): void {
    mic.say(t(key));
  }

  async function on(): Promise<void> {
    if (voice || joining || net.state !== 'online') return;
    joining = true;
    set('connecting');
    try {
      // (the library itself only now: ≈ 150 KB gzipped, which a player who never talks never loads)
      const [{ joinVoice }, ticket] = await Promise.all([import('../party/voice'), net.voiceTicket()]);
      if (net.state !== 'online') throw new Error('offline');
      const v = await joinVoice(ticket as VoiceTicket, {
        speaking: (ids) => talking(ids),
        needsTap: (held) => mic.needsTap(held),
        reconnecting: (r) => set(r ? 'reconnecting' : 'on'),
        ended: () => void off('voiceLost'),
      }, { select: true });
      voice = v;
      ticketRoom = ticket.room;
      crowd = net.crowd;
      sent.clear();
      set('on');
      hear();
      tick = window.setInterval(hear, TICK_MS);
    } catch (e) {
      set('off');
      mic.stop();
      const why = e instanceof DOMException && e.name === 'NotAllowedError' ? 'voiceNoMic' : (REASONS[(e as Error)?.message] ?? 'voiceRoomOff');
      say(why);
    }
    joining = false;
  }

  async function off(why: WordKey | null = null): Promise<void> {
    const was = voice;
    voice = null;
    ticketRoom = null;
    window.clearInterval(tick);
    partyLink.talking.clear();
    mic.stop();
    set('off');
    if (why) say(why);
    await was?.close();
  }

  /** Who is heard now, and how loud: the nearest few within reach, by distance. */
  function hear(): void {
    if (!voice) return;
    const h = net.here;
    const near: { id: string; d: number }[] = [];
    if (h) {
      for (const p of net.peers.values()) {
        if (net.isMuted(p.sid)) continue;
        const d = Math.hypot(p.x - h.x, p.y - h.y, p.z - h.z);
        if (d < VOICE_FAR) near.push({ id: String(p.sid), d });
      }
    }
    near.sort((a, b) => a.d - b.d);
    const want = new Set<string>();
    for (const n of near.slice(0, HEAR_MAX)) {
      want.add(n.id);
      const vol = Math.round(voiceFade(n.d) * 50) / 50;
      if (sent.get(n.id) !== vol) {
        sent.set(n.id, vol);
        voice.setVolume(n.id, vol);
      }
    }
    for (const id of sent.keys()) if (!want.has(id)) sent.delete(id);
    voice.want(want);
  }

  /** The speaking mark: the players talking now (not me, not muted). */
  function talking(ids: Set<string>): void {
    partyLink.talking.clear();
    const mine = net.me ? String(net.me.sid) : '';
    for (const id of ids) {
      const sid = Number(id);
      if (id !== mine && Number.isInteger(sid) && !net.isMuted(sid)) partyLink.talking.add(sid);
    }
  }

  // The button while online; voice ends when the room does, and moves with a new crowd.
  const follow = () => {
    const online = net.state === 'online';
    mic.show(online);
    if (!online && (voice || joining)) void off();
    else if (online && voice && net.crowd !== crowd && ticketRoom) {
      void off().then(() => on());
    }
  };
  net.onChange(follow);
  follow();

  return {
    get state() {
      return state;
    },
  };
}
