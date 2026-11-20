import { mulberry32 } from '../../voxel/random';
import { folk } from '../festival/_folk';
import { EMOTES, type Emote } from '../../net/protocol';
import { dress } from './_kinds';
import { CARRY, FEAT, POSE, SLOT, type Carry, type Feature, type Look, type Pose } from './_personModel';

/**
 * How another player looks and greets (people/_scenePlayers.ts): their clothes from the look seed they send
 * (`PeerState.look`: the same seed dresses them the same on every screen), and what each emote (`EMOTES`) plays on
 * the crowd's model.
 */

/** What a player may wear: hair, the Khmer palm-leaf hat, a krama, sun hats and caps, a skirt, bags, glasses (no tools, no props). */
const WEAR = new Set<Feature>([
  FEAT.hairShort,
  FEAT.hairLong,
  FEAT.hairBun,
  FEAT.hatSun,
  FEAT.hatCap,
  FEAT.hatPalm,
  FEAT.kramaHead,
  FEAT.kramaNeck,
  FEAT.skirt,
  FEAT.backpack,
  FEAT.glasses,
  FEAT.collar,
  FEAT.bag,
  FEAT.sash,
]);

/**
 * A player's look from their seed: a visitor's travel clothes, a Khmer villager in festival best (silk sampot,
 * white shirt, krama), or in village clothes under the palm-leaf hat; an adult's size. Every prop stripped (they
 * hold only what an emote gives them: the phone, the sparkler), and the sparkler's colours ready in the palette
 * (`wood` its grey wire, `flame` its white-gold tip: worn only while the emote shows it).
 */
export function playerLook(seed: number): Look {
  const s = seed >>> 0;
  const rnd = mulberry32(0x9e37 ^ s);
  const style = rnd();
  const sub = Math.floor(rnd() * 1e6);
  const sex = rnd() < 0.5 ? 'f' : 'm';
  let l: Look;
  if (style < 0.45) l = dress('visitor', sub, { carry: CARRY.none, sex, age: rnd() < 0.12 ? 'old' : 'young' });
  else if (style < 0.8) l = folk(sex === 'f' ? 'woman' : 'man', sub);
  else l = dress('villager', sub, { carry: CARRY.none, hat: rnd() < 0.6 ? 'palm' : 'krama' });
  const feats = l.feats.filter((f) => WEAR.has(f));
  if (!feats.includes(FEAT.hairShort)) feats.push(FEAT.hairShort);
  const colors = l.colors.slice();
  colors[SLOT.wood] = 0x8a8a86;
  colors[SLOT.flame] = 0xffd890;
  colors[SLOT.gear] = 0x26262a;
  return { feats, carry: CARRY.none, colors, height: Math.min(1.04, Math.max(0.93, l.height)), seed: rnd() };
}

/** What an emote plays: the pose (and a second one it swaps with every `beat` s: the clap), its length, what it holds. */
export interface EmotePlay {
  pose: Pose;
  alt: Pose | null;
  beat: number;
  /** Seconds it plays from `emoteAt`. */
  dur: number;
  /** Worn while it plays (`Crowd.strike`), and the carry style held then (null: none). */
  feats: readonly Feature[];
  style: Carry | null;
}

const play = (pose: Pose, dur: number, o: Partial<EmotePlay> = {}): EmotePlay => ({ pose, alt: null, beat: 0, dur, feats: [], style: null, ...o });

/**
 * Each emote on the crowd's model (by `EMOTES` index; 'none' plays nothing):
 * - wave: `POSE.wave`; sampeah and thanks: `POSE.sampeah` with a `bow` in the middle; cheer and "Happy New Year":
 *   `POSE.cheer`; dance: the apsara's `POSE.dance`; follow: `POSE.point`;
 * - clap (no clap pose): the hands meet and part, `sampeah` and `give` in turn twice a second;
 * - photo: `POSE.photo`, the phone in the hands (`FEAT.phone`);
 * - sparkler: a sparkler held up (`FEAT.torch` in its grey and white-gold, `CARRY.torch`).
 */
export const EMOTE_PLAY: readonly (EmotePlay | null)[] = EMOTES.map((e: Emote) => {
  switch (e) {
    case 'wave':
      return play(POSE.wave, 2.6);
    case 'sampeah':
    case 'thanks':
      return play(POSE.sampeah, 2.8, { alt: POSE.bow, beat: -1 });
    case 'cheer':
    case 'happyNewYear':
      return play(POSE.cheer, 3.2);
    case 'clap':
      return play(POSE.sampeah, 3, { alt: POSE.give, beat: 0.45 });
    case 'dance':
      return play(POSE.dance, 7);
    case 'photo':
      return play(POSE.photo, 4, { feats: [FEAT.phone] });
    case 'sparkler':
      return play(POSE.stand, 9, { feats: [FEAT.torch], style: CARRY.torch });
    case 'follow':
      return play(POSE.point, 2.4);
    default:
      return null;
  }
});

/** The pose an emote shows `age` s in (its swap, the sampeah's bow from 0.7 to 1.9 s). */
export function emotePose(p: EmotePlay, age: number): Pose {
  if (!p.alt) return p.pose;
  if (p.beat < 0) return age > 0.7 && age < 1.9 ? p.alt : p.pose;
  return Math.floor(age / p.beat) % 2 ? p.alt : p.pose;
}
