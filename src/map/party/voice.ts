import { ConnectionState, Room, RoomEvent, Track, type RemoteParticipant, type RemoteTrack } from 'livekit-client';
import type { Ticket } from './api';

/**
 * The party's voice room on our LiveKit server (voice.morodokangkor.com).
 * Loaded only when a player turns voice on (index.ts imports it lazily: the
 * library is ≈ 150 KB gzipped).
 *
 * The microphone is opened once, when voice turns on (the browser asks then,
 * from that tap), and stays published but muted: talking unmutes it, so the
 * first word isn't cut off while the browser opens the microphone again.
 * Friends' voices play through hidden audio elements, each with its own
 * volume (Mute is 0; the map's distance will set it once Phase 2 knows where
 * friends are).
 */

export interface VoiceHooks {
  /** Who is talking now (player ids; this player's own id too). */
  speaking(ids: Set<string>): void;
  /** The browser holds the friends' sound until a tap (iOS Safari): call `resumeAudio` from the next tap. */
  needsTap(held: boolean): void;
  /** Lost and not coming back (the server gone, removed from the room). */
  ended(): void;
  /** Lost for a moment, trying again. */
  reconnecting(on: boolean): void;
}

export interface Voice {
  talk(on: boolean): Promise<void>;
  setVolume(id: string, volume: number): void;
  resumeAudio(): Promise<void>;
  close(): Promise<void>;
}

export async function joinVoice(ticket: Ticket, hooks: VoiceHooks): Promise<Voice> {
  const room = new Room({
    adaptiveStream: false,
    dynacast: false,
    audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  const volumes = new Map<string, number>();
  const audioOf = new Map<string, HTMLMediaElement[]>();

  function attach(track: RemoteTrack, who: RemoteParticipant): void {
    if (track.kind !== Track.Kind.Audio) return;
    const el = track.attach();
    el.style.display = 'none';
    document.body.append(el);
    audioOf.set(who.identity, [...(audioOf.get(who.identity) ?? []), el]);
    who.setVolume(volumes.get(who.identity) ?? 1);
  }

  function detach(track: RemoteTrack, who: RemoteParticipant): void {
    for (const el of track.detach()) el.remove();
    audioOf.delete(who.identity);
  }

  room
    .on(RoomEvent.TrackSubscribed, (track, _pub, who) => attach(track, who))
    .on(RoomEvent.TrackUnsubscribed, (track, _pub, who) => detach(track, who))
    .on(RoomEvent.ActiveSpeakersChanged, (who) => hooks.speaking(new Set(who.map((p) => p.identity))))
    .on(RoomEvent.AudioPlaybackStatusChanged, () => hooks.needsTap(!room.canPlaybackAudio))
    .on(RoomEvent.Reconnecting, () => hooks.reconnecting(true))
    .on(RoomEvent.Reconnected, () => hooks.reconnecting(false))
    .on(RoomEvent.Disconnected, () => hooks.ended());

  await room.connect(ticket.url, ticket.token, { autoSubscribe: true });
  // (this runs inside the tap that turned voice on: the browser lets sound start, and asks for the microphone, from it)
  await room.startAudio().catch(() => undefined);
  hooks.needsTap(!room.canPlaybackAudio);
  try {
    await room.localParticipant.setMicrophoneEnabled(true);
    await room.localParticipant.setMicrophoneEnabled(false);
  } catch (e) {
    await room.disconnect();
    throw e;
  }

  return {
    async talk(on) {
      if (room.state !== ConnectionState.Connected) return;
      await room.localParticipant.setMicrophoneEnabled(on);
    },
    setVolume(id, volume) {
      volumes.set(id, volume);
      room.remoteParticipants.get(id)?.setVolume(volume);
    },
    async resumeAudio() {
      await room.startAudio();
      hooks.needsTap(!room.canPlaybackAudio);
    },
    async close() {
      room.removeAllListeners();
      for (const els of audioOf.values()) for (const el of els) el.remove();
      audioOf.clear();
      await room.disconnect();
    },
  };
}
