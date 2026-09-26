/**
 * The seated Buddha's measures (buddha.ts): where the head, body and throne
 * meet, so each is sculpted on its own (_buddhaHead.ts, _buddhaBody.ts,
 * _buddhaThrone.ts) and they fit.
 *
 * Figure space, metres, for the reference statue (scaled to size later):
 * +y up, he faces +z, his axis is x = 0. He sits on y = 0 — the top of the
 * lotus or of the naga's coils; the throne is below it (y < 0).
 *
 * Proportions follow the classic seated Buddha: one face (F, chin to
 * hairline) from the seat to the navel, one to the chest, one to the chin,
 * one to the hairline; knee to knee as wide as seat to crown (the figure
 * sits in a triangle); broad shoulders, a lion's chest, a slim waist.
 */

/** One face length (m): chin to hairline. */
export const F = 0.14;

export const FIG = {
  /** Where he sits (top of the throne). */
  seat: 0,
  /** The hips' middle (x, y, z) and half-width. */
  hips: [0, 0.06, -0.03] as const,
  hipHalf: 0.16,
  /** The navel on the belly's front. */
  navel: [0, F, 0.085] as const,
  /** Chest height (the nipples' line), its front (z) and half-width. */
  chestY: 2 * F,
  chestZ: 0.09,
  chestHalf: 0.15,
  /** The shoulder joints (x > 0: his left; mirror for the right). */
  shoulder: [0.19, 2.35 * F, -0.03] as const,
  /** The neck's foot (on the axis) and the chin's point. */
  neck: [0, 2.62 * F, -0.02] as const,
  chin: [0, 3 * F, 0.075] as const,
  /** The skull's middle; half-width, height and depth of the head. */
  head: [0, 3.5 * F, 0.0] as const,
  headHalf: [0.078, 0.1, 0.092] as const,
  /** The hairline at the brow's middle (y) and the top of the curls. */
  hairline: 4 * F,
  crown: 4.32 * F,
  /** The knees (his left: +x) and the top of the lap. */
  knee: [0.3, 0.055, 0.17] as const,
  lapY: 0.1,
  /** How far his lap and knees reach forward (z) and sideways (x): the throne must be at least this big. */
  reach: [0.36, 0.26] as const,
  /** The throne's top: width (x), depth (z) half-sizes it should give him to sit on. */
  seatHalf: [0.4, 0.3] as const,
};

/** How he holds his hands. */
export type Mudra =
  /** Calling the earth to witness (Maravijaya): left hand in the lap palm up, right hand over the right knee, fingers down to the throne — the Buddha of most Cambodian pagodas. */
  | 'earth'
  /** Meditation: both hands in the lap, palms up, the right on the left. */
  | 'meditate';

/** The head's style. */
export type HeadStyle =
  /** Pagoda style: tight snail-shell curls, a rounded ushnisha, a tall flame (rasmi) rising from it, arched brows, downcast eyes. */
  | 'pagoda'
  /** Angkor style (the naga Buddha): a diadem band over the brow, a conical ushnisha of curl rows ending in a lotus bud, eyes closed, the Bayon smile. */
  | 'angkor';

/** What he sits on. */
export type Throne =
  /** A double lotus (petals up and down) on a stepped pedestal. */
  | 'lotus'
  /** The naga Muchalinda: three coils of the serpent's body, its seven-headed hood fanned over his head. */
  | 'naga';
