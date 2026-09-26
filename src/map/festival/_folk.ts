import { mulberry32 } from '../../voxel/random';
import { dress, shade } from '../people/_kinds';
import { CARRY, FEAT, SLOT, SLOTS, type Carry, type Feature, type Look, type SlotName } from '../people/_personModel';

/**
 * How the festival's people dress (the people part's model and kinds,
 * `people/_personModel.ts`, `_kinds.ts`): Khmer villagers in their best for
 * the festival (bright blouses and silk sampots, white shirts, a krama),
 * the rowers of a racing boat (ngo) in their crew's colour with a headband,
 * elders in white for the pagoda, children, monks.
 */

const SKIN = [0xb07a52, 0xa06a45, 0xba8660, 0x946040, 0xa87450, 0x8a5838];
const HAIR = [0x1c1612, 0x2a1d14, 0x3a2618];
const GREY = [0x9a948c, 0xc8c4bc, 0xdcd8d0];
const BLOUSE = [0xf2a0b8, 0x9ac8f0, 0xf4f0e6, 0xf6d468, 0xc8a0e0, 0xf08a6a, 0x8ad0b8, 0xffffff];
const SAMPOT = [0x6a2a8a, 0x2a6a4a, 0xa82838, 0x1f4a8a, 0xc8702a, 0x7a1f3a, 0x3a3a7a];
const SHIRT = [0xf4f2ec, 0xe8e4d8, 0x9ac8f0, 0x5a7a9a, 0xd8d0c0, 0x7fb2d8, 0xc4453a];
const TROUSERS = [0x2a3448, 0x3a3a3e, 0x4a4234, 0x5a4a3a, 0x46607e];
/** Krama: red / blue checks with white. */
const KRAMA = [0xb8322c, 0x2a4a9a, 0xc8702a];

type Role = 'woman' | 'man' | 'kid' | 'elder' | 'monk';

function base(seed: number): { rnd: () => number; pick: <T>(a: readonly T[]) => T; colors: number[]; set: (s: SlotName[], hex: number) => void } {
  const rnd = mulberry32(0xfe57 + seed * 7919);
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length) % a.length];
  const colors = new Array<number>(SLOTS).fill(0x808080);
  const set = (slots: SlotName[], hex: number) => {
    for (const s of slots) colors[SLOT[s]] = hex;
  };
  set(['eye'], 0x1a1410);
  set(['white'], 0xf2efe8);
  set(['flame'], 0xffb050);
  set(['gold'], 0xe0b048);
  set(['gear'], 0x2a2a2e);
  set(['wood'], 0x7a5a3a);
  set(['sole'], 0x3a3230);
  return { rnd, pick, colors, set };
}

/** A Khmer villager in festival clothes. `carry` / `props` as in `_kinds.ts`. */
export function folk(role: Role, seed: number, opts: { carry?: Carry; props?: Feature[]; gear?: number } = {}): Look {
  if (role === 'monk') return dress('monk', seed);
  if (role === 'kid') {
    const l = dress('kid', seed, { carry: opts.carry, props: opts.props });
    // (a bright toy: the "phone" in the fist is a water pistol)
    if (opts.gear !== undefined) l.colors[SLOT.gear] = opts.gear;
    return l;
  }
  const { rnd, pick, colors, set } = base(seed);
  const feats = new Set<Feature>([FEAT.hairShort]);
  const skin = pick(SKIN);
  set(['skin', 'foot'], skin);
  set(['hair'], role === 'elder' ? pick(GREY) : pick(HAIR));
  set(['sole'], rnd() < 0.5 ? skin : pick([0x3a3230, 0x6a4a2a, 0xd8d0c0]));
  let height = 0.95 + 0.06 * rnd();
  const woman = role === 'woman' || (role === 'elder' && rnd() < 0.6);
  if (woman) {
    feats.add(rnd() < 0.6 ? FEAT.hairBun : FEAT.hairLong);
    const top = role === 'elder' ? 0xf6f4ee : pick(BLOUSE);
    set(['top', 'sleeveL', 'sleeveR'], top);
    set(['foreL', 'foreR'], rnd() < 0.5 ? skin : top);
    const s = role === 'elder' ? pick([0x2a2a30, 0x3a2a4a, 0x2a3a3a]) : pick(SAMPOT);
    set(['hips', 'thigh', 'shin'], s);
    feats.add(FEAT.skirt);
    set(['accent'], shade(s, 1.3));
    height *= 0.95;
    if (role === 'elder') {
      // (a white sash over the shoulder, for the pagoda)
      feats.add(FEAT.kramaNeck);
      set(['accent'], 0xf8f6f0);
      set(['accent2'], 0xe8e4dc);
      height *= 0.96;
    }
  } else {
    const top = role === 'elder' ? 0xf6f4ee : pick(SHIRT);
    set(['top', 'sleeveL', 'sleeveR'], top);
    set(['foreL', 'foreR'], rnd() < 0.6 ? skin : top);
    set(['hips', 'thigh'], pick(TROUSERS));
    set(['shin'], rnd() < 0.5 ? skin : colors[SLOT.thigh]);
    if (rnd() < 0.5) {
      feats.add(FEAT.kramaNeck);
      set(['accent'], pick(KRAMA));
      set(['accent2'], 0xf0ece0);
    } else if (rnd() < 0.3) feats.add(FEAT.collar);
    if (role === 'elder') height *= 0.96;
  }
  let carry: Carry = opts.carry ?? CARRY.none;
  if (carry === CARRY.umbrella) {
    feats.add(FEAT.umbrella);
    const p = pick([0xe8a0b0, 0x7ab0d8, 0xf0d060, 0xe86a4a, 0x8ac08a]);
    set(['prop'], p);
    set(['prop2'], shade(p, 1.12));
    set(['wood'], 0xe8e4dc);
  } else if (carry === CARRY.flag) {
    feats.add(FEAT.flag);
    set(['prop'], 0x1a3a9a);
    set(['prop2'], 0xd02030);
    set(['wood'], 0xd8d0c0);
  } else if (carry === CARRY.bowl) feats.add(FEAT.bowl);
  else if (carry !== CARRY.none) carry = CARRY.none;
  for (const p of opts.props ?? []) feats.add(p);
  colors[SLOT.mouth] = shade(colors[SLOT.skin], 0.66);
  return { feats: [...feats], carry, colors, height, seed: rnd() };
}

/** A rower of a racing boat (ngo): the crew's shirt, dark shorts, a headband in the crew's colour (seed = the boat's stroke phase: set by the caller). */
export function rower(crew: number, seed: number, stroke: number): Look {
  const { rnd, pick, colors, set } = base(seed + 5000);
  const skin = pick(SKIN);
  set(['skin', 'foot', 'sole', 'shin'], skin);
  set(['hair'], pick(HAIR));
  set(['top', 'sleeveL', 'sleeveR'], crew);
  set(['foreL', 'foreR'], skin);
  set(['hips', 'thigh'], pick([0x1e2230, 0x2a2a2e, 0x2a3448]));
  const band = shade(crew, 1.35);
  set(['accent'], band);
  set(['accent2'], 0xf4f0e6);
  colors[SLOT.mouth] = shade(skin, 0.66);
  return { feats: [FEAT.hairShort, FEAT.kramaHead], carry: CARRY.none, colors, height: 0.96 + 0.06 * rnd(), seed: stroke };
}
