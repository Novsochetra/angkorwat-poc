import { registerSfx, type SfxOut } from './addonSfx';
import { chantLines, chantVoice } from './_bless';
import { ChantStream, chantsReady, loadChants } from './chants';
import type { SoundEngine } from './engine';

/**
 * The sounds of kneeling to listen to the monks' chanting (roam/_listen.ts):
 *
 * - `listenChant` (ambience bus; played about once a second while he listens to
 *   the blessing monk): the monk's chanting, endless, from the recorded monks
 *   (chants.ts `ChantStream`: pieces of the temple hall's recording strung breath
 *   to breath, never the same twice), fading in as he starts; until the recordings
 *   are loaded, one old voice synthesized (_bless.ts), a verse at a time. The
 *   map's music steps back meanwhile (`yieldMusic`), so the chant is heard.
 * - `listenHush` (ambience; about once a second while he kneels behind the dawn
 *   chant's row): only the music steps back (the row's chant is the pagoda's own,
 *   audio/temple.ts).
 * - `stopListenChant()`: the monk's chanting fades out (the end of his chant, or
 *   he got up).
 */

/** The chant's level (him kneeling two metres before the monk: as the blessing's chant, _bless.ts), its reverb share. */
const LEVEL = 0.45;
const WET = 0.15;
/** Fading in and out (time constants, s). */
const FADE_IN = 1.2;
const FADE_OUT = 0.9;
/** Each call holds the music back this long (s): the next comes before it ends. */
const HOLD = 2.5;
/** The verses the synthesized voice chants until the recordings load (syllables split with `-`): the homage, the refuges. */
const VERSES = [
  chantLines(['na-mo tas-sa bha-ga-va-to a-ra-ha-to sam-mā-sam-bud-dhas-sa']),
  chantLines(['bud-dhaṃ sa-ra-ṇaṃ gac-chā-mi', 'dham-maṃ sa-ra-ṇaṃ gac-chā-mi']),
  chantLines(['saṅ-ghaṃ sa-ra-ṇaṃ gac-chā-mi', 'sab-be sat-tā su-khi-tā hon-tu']),
];

/** The stream now (on the engine it was made for), and when the synthesized voice may chant its next verse. */
let run: { engine: SoundEngine; out: GainNode; send: GainNode; stream: ChantStream } | null = null;
let nextVerse = 0;
let verse = 0;

function hush(o: SfxOut, t: number): void {
  o.engine.yieldMusic(1, t, t + HOLD);
}

registerSfx(
  'listenChant',
  (o, gain, t) => {
    hush(o, t);
    if (run && run.engine !== o.engine) run = null;
    if (!chantsReady()) {
      // (not loaded yet: ask for them, and meanwhile one voice, a verse at a time)
      void loadChants(o.ctx);
      if (t < nextVerse) return;
      chantVoice(o, gain, t, VERSES[verse++ % VERSES.length], 0.14, 1.0, 0.1);
      nextVerse = t + 7.5;
      return;
    }
    if (run?.stream.running) return;
    if (!run) {
      const out = o.ctx.createGain();
      out.gain.value = LEVEL * gain;
      const send = o.ctx.createGain();
      send.gain.value = WET;
      out.connect(o.dry);
      out.connect(send).connect(o.wet);
      run = { engine: o.engine, out, send, stream: new ChantStream(o.ctx, out, 'near', o.rnd) };
    }
    run.out.gain.setTargetAtTime(LEVEL * gain, t, 0.3);
    run.stream.start(t, FADE_IN);
  },
  'ambience',
);

registerSfx('listenHush', (o, _gain, t) => hush(o, t), 'ambience');

/** The monk's chanting fades out (the end of his chant, or he got up): called directly, so it stops even with the bus off. */
export function stopListenChant(): void {
  nextVerse = 0;
  if (run?.stream.running) run.stream.stop(run.engine.ctx.currentTime, FADE_OUT);
}
