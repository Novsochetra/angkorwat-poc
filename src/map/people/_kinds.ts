import { mulberry32 } from '../../voxel/random';
import { CARRY, FEAT, SLOT, SLOTS, type Carry, type Feature, type Look, type SlotName } from './_personModel';

/**
 * How each kind of person on the map is dressed (Angkor today):
 *
 * - **monk**: shaven head (and eyebrows), a saffron robe over the left
 *   shoulder with the right shoulder bare, the lower robe to the shins,
 *   barefoot or in sandals; an alms bowl, a saffron umbrella or a broom.
 *   `young`: a novice (a boy monk).
 * - **visitor**: people from everywhere, men and women, young and old: a
 *   T-shirt or a shirt (shoulders covered: it is a temple), trousers, knee
 *   shorts or a long skirt, trainers; sun hats and caps, backpacks and
 *   shoulder bags, cameras and phones, sunglasses, now and then a parasol.
 * - **guide**: a Khmer guide in a neat collared shirt and dark trousers,
 *   holding up a small flag of Cambodia (or an umbrella).
 * - **kid**: a Khmer child, in the white-and-navy school uniform or a
 *   bright T-shirt, barefoot or in flip-flops (a kite reel with `props`).
 * - **fisherman**: a faded long-sleeved shirt, trousers rolled up, a krama
 *   round the head or neck, often the Khmer palm-leaf hat, the cast net.
 * - **dancer**: an apsara: the gold mokot headdress, a gold collar and
 *   bands, a fitted bodice, a long sampot with a gold belt, barefoot; her
 *   hands (fingers curved back) show in the dance.
 * - **villager**: the people of the village and the rice fields: women in a
 *   blouse (long sleeves against the sun, often) and a long sarong, a krama
 *   round the head or the Khmer palm-leaf hat (flat-topped crown, wide brim,
 *   red binding: never the pointed conical hat, which is not Khmer); men in a work shirt and dark
 *   trousers or a sarong, a krama; flip-flops or barefoot. Their work
 *   things (`props`: the shoulder pole, seedlings, a sickle) take the
 *   straw-gold `prop`, a bamboo `wood` and a steel `gear` colour.
 *
 * `dress(kind, seed, opts)` picks a look with a seeded random, so the same
 * seed gives the same person every run.
 */

export type PersonKind = 'monk' | 'visitor' | 'guide' | 'kid' | 'fisherman' | 'dancer' | 'villager';

export interface DressOptions {
  /** What the hands hold the carry way (else the kind's usual). */
  carry?: Carry;
  /** Extra features (props) on top of the kind's own. */
  props?: Feature[];
  /** A novice monk, a younger dancer. */
  young?: boolean;
  /** Visitors: 'f' or 'm' (else picked). */
  sex?: 'f' | 'm';
  /** Visitors: 'old' for grey hair and a bit smaller. */
  age?: 'young' | 'old';
  /** Villagers: the Khmer palm-leaf hat, a krama round the head, or nothing on the head (else picked). */
  hat?: 'palm' | 'krama' | 'none';
}

// ── Colours (sRGB) ──
const KHMER_SKIN = [0xb07a52, 0xa06a45, 0xba8660, 0x946040, 0xa87450];
const MONK_SKIN = [0x94603c, 0x8a5838, 0x9e6a44, 0x80522f];
const WORLD_SKIN = [0xf2cdb0, 0xe8bc98, 0xdcaa84, 0xc08a60, 0x9a6844, 0x70482e];
const HAIR_DARK = [0x1c1612, 0x2a1d14, 0x3a2618];
const HAIR_FAIR = [0xc9a060, 0x8a5a30, 0x5c3a22, 0x7a3a1c, 0x3a2618];
const HAIR_OLD = [0x9a948c, 0xc8c4bc, 0xdcd8d0, 0x7a746c];
const ROBE = [0xe8800c, 0xe2740a, 0xee8e18, 0xdc6c08];
const SHIRTS = [0xeeeae0, 0x7fb2d8, 0x2c3e5c, 0xc4453a, 0xe8c24a, 0x6a9a58, 0xe89aa8, 0x3a9a9a, 0xc8b48a, 0xe07a3a, 0xa08cc8, 0xf4f0e6, 0x4a6a9a];
const TROUSERS = [0xb8a07a, 0xd6c6a4, 0x46607e, 0x3a3a42, 0x6e6e4a, 0xe6e2d8, 0x5a4a3a];
const SKIRTS = [0x7a4a8a, 0x2c6a6a, 0xc88a3a, 0xa83a3a, 0x3a4a7a, 0xe8d8b8];
const SHOES = [0xf0f0ea, 0x8a8a8a, 0x3a3a3a, 0x6a5040, 0x3a5a8a];
const HATS = [0xd8c08a, 0xf0ece0, 0xc0aa7e, 0xe4d2a0];
const CAPS = [0x2c3a5a, 0xb03a30, 0xe8e4d8, 0x4a6a3a, 0x1e1e22];
const BAGS = [0x3a5a7a, 0x8a3a30, 0x4a4a4a, 0x6a7a3a, 0xd08a2a, 0x2a2a30, 0x7a5a3a];
const PARASOLS = [0xe8a0b0, 0x7ab0d8, 0xf0d060, 0xe86a4a, 0x8ac08a];
const DARK_EYE = 0x1a1410;
const BLOUSES = [0xe8d8e8, 0xf2e6cc, 0xd88a9a, 0x8ab0d0, 0xe0c060, 0xf4f2ec, 0xa06080, 0x70a888, 0xc8603a];
const SARONGS = [0x6a2a4a, 0x2a4a6a, 0x8a3a2a, 0x3a5a3a, 0x5a3a6a, 0x7a5a2a, 0x2a2a3a];
const WORK_SHIRTS = [0x8a8a80, 0x5a7a9a, 0xe8e4d8, 0x6a5a4a, 0x4a6a6a, 0xa8a080, 0x3a4a6a];
const SARONGS_M = [0x3a4a6a, 0x5a3a3a, 0x3a5a4a, 0x4a4a4a];
/** The palm-leaf hat's straw, and its red (or maroon) binding. */
const PALM_HATS = [0xd9c08a, 0xcdb07a, 0xe0c896, 0xd2b884];
const HAT_TRIMS = [0xa02a24, 0x8a1e2a, 0xb03428];

/** Put the Khmer palm-leaf hat on (`FEAT.hatPalm`), in its straw and red binding. */
function palmHat(feats: Set<Feature>, colors: number[], rnd: () => number): void {
  feats.add(FEAT.hatPalm);
  const straw = PALM_HATS[Math.floor(rnd() * PALM_HATS.length) % PALM_HATS.length];
  colors[SLOT.hat] = straw;
  colors[SLOT.straw] = shade(straw, 0.8);
  colors[SLOT.trim] = HAT_TRIMS[Math.floor(rnd() * HAT_TRIMS.length) % HAT_TRIMS.length];
}

/** A colour a bit darker (k < 1) or lighter (k > 1). */
export function shade(hex: number, k: number): number {
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((hex >> s) & 255) * k)));
  return (c(16) << 16) | (c(8) << 8) | c(0);
}

export function dress(kind: PersonKind, seed: number, opts: DressOptions = {}): Look {
  const rnd = mulberry32(0x5eed + seed * 7919);
  const pick = <T>(a: readonly T[]) => a[Math.floor(rnd() * a.length) % a.length];
  const colors: number[] = new Array(SLOTS).fill(0x808080);
  const set = (slots: SlotName[], hex: number) => {
    for (const s of slots) colors[SLOT[s]] = hex;
  };
  const feats = new Set<Feature>();
  let carry: Carry = CARRY.none;
  let height = 1;
  set(['eye'], DARK_EYE);
  set(['white'], 0xf2efe8);
  set(['flame'], 0xffb050);
  set(['gold'], 0xe0b048);
  set(['gear'], 0x2a2a2e);
  set(['wood'], 0x7a5a3a);
  set(['sole'], 0x3a3230);

  if (kind === 'monk') {
    const skin = pick(MONK_SKIN);
    const robe = pick(ROBE);
    set(['skin', 'sleeveR', 'foreR', 'foot'], skin);
    // (monks shave their eyebrows too)
    set(['hair'], shade(skin, 0.86));
    set(['top', 'sleeveL', 'foreL', 'hips', 'thigh', 'shin'], robe);
    set(['accent'], shade(robe, 0.8));
    set(['sole'], rnd() < 0.5 ? skin : 0x4a3426);
    set(['gear'], 0x1e1a18);
    set(['prop'], pick([0xe07a24, 0xd8701a, 0x8a2e22]));
    colors[SLOT.prop2] = shade(colors[SLOT.prop], 0.82);
    set(['wood'], 0x5a3e28);
    feats.add(FEAT.robe).add(FEAT.skirt);
    height = opts.young ? 0.8 + 0.06 * rnd() : 0.96 + 0.05 * rnd();
  } else if (kind === 'visitor') {
    const sex = opts.sex ?? (rnd() < 0.5 ? 'f' : 'm');
    const old = opts.age === 'old' || (opts.age === undefined && rnd() < 0.2);
    const skin = pick(WORLD_SKIN);
    const fair = WORLD_SKIN.indexOf(skin) < 3;
    const hair = old ? pick(HAIR_OLD) : fair ? pick(HAIR_FAIR) : pick(HAIR_DARK);
    set(['skin'], skin);
    set(['hair'], hair);
    feats.add(FEAT.hairShort);
    if (sex === 'f') feats.add(rnd() < 0.55 ? FEAT.hairLong : FEAT.hairBun);
    // Top: short sleeves mostly, sometimes long.
    const shirt = pick(SHIRTS);
    set(['top', 'sleeveL', 'sleeveR'], shirt);
    set(['foreL', 'foreR'], rnd() < 0.72 ? skin : shirt);
    // Bottom: trousers, knee shorts or (women) a long skirt.
    const r = rnd();
    if (sex === 'f' && r < 0.35) {
      const skirt = pick(SKIRTS);
      set(['hips', 'thigh', 'shin'], skirt);
      feats.add(FEAT.skirt);
    } else if (r < 0.62) {
      const pants = pick(TROUSERS);
      set(['hips', 'thigh', 'shin'], pants);
    } else {
      const pants = pick(TROUSERS);
      set(['hips', 'thigh'], pants);
      set(['shin'], skin);
    }
    const shoe = pick(SHOES);
    set(['foot'], shoe);
    set(['sole'], shade(shoe, shoe > 0x808080 ? 0.85 : 1.4));
    // Hats, bags, cameras.
    const h = rnd();
    if (h < 0.45) {
      feats.add(FEAT.hatSun);
      set(['hat'], pick(HATS));
      set(['accent'], pick([0x3a3a3a, 0x8a3a30, 0x2c3e5c, 0x6a4a2a]));
    } else if (h < 0.6) {
      feats.add(FEAT.hatCap);
      set(['hat'], pick(CAPS));
    }
    const b = rnd();
    if (b < 0.35) feats.add(FEAT.backpack);
    else if (b < 0.5) feats.add(FEAT.bag);
    set(['bag'], pick(BAGS));
    set(['accent2'], shade(colors[SLOT.bag], 0.75));
    const c = rnd();
    if (c < 0.32) feats.add(FEAT.camera);
    else if (c < 0.72) feats.add(FEAT.phone);
    if (rnd() < 0.14) feats.add(FEAT.glasses);
    if (sex === 'f' && !feats.has(FEAT.hatSun) && rnd() < 0.25) {
      feats.add(FEAT.umbrella);
      carry = CARRY.umbrella;
      const p = pick(PARASOLS);
      set(['prop'], p);
      set(['prop2'], shade(p, 1.12));
      set(['wood'], 0xe8e4dc);
    }
    height = (sex === 'f' ? 0.95 : 1.0) * (old ? 0.96 : 1) + 0.05 * (rnd() - 0.5);
  } else if (kind === 'guide') {
    const skin = pick(KHMER_SKIN);
    set(['skin'], skin);
    set(['hair'], pick(HAIR_DARK));
    feats.add(FEAT.hairShort).add(FEAT.collar);
    const shirt = pick([0xf4f2ec, 0xa8c8e8, 0xf0e8d0]);
    set(['top', 'sleeveL', 'sleeveR'], shirt);
    set(['foreL', 'foreR'], rnd() < 0.5 ? skin : shirt);
    set(['accent'], shade(shirt, 1.05));
    set(['hips', 'thigh', 'shin'], pick([0x2a3448, 0x3a3a3e, 0x4a4234]));
    set(['foot'], 0x2a2220);
    set(['sole'], 0x1a1614);
    if (rnd() < 0.5) {
      feats.add(FEAT.hatCap);
      set(['hat'], pick([0x2c3a5a, 0xe8e4d8, 0x3a5a3a]));
    }
    if (opts.carry === CARRY.umbrella) {
      feats.add(FEAT.umbrella);
      set(['prop'], pick([0xe8c040, 0xd84a3a, 0x3a7ac0]));
      set(['prop2'], 0xf4f0e6);
      carry = CARRY.umbrella;
    } else {
      // The flag of Cambodia: blue, red, and the white temple.
      feats.add(FEAT.flag);
      set(['prop'], 0x1a3a9a);
      set(['prop2'], 0xd02030);
      set(['wood'], 0xd8d0c0);
      carry = CARRY.flag;
    }
    height = 0.98 + 0.04 * rnd();
  } else if (kind === 'kid') {
    const skin = pick(KHMER_SKIN);
    set(['skin'], skin);
    set(['hair'], pick(HAIR_DARK));
    const girl = rnd() < 0.5;
    feats.add(FEAT.hairShort);
    if (girl) feats.add(rnd() < 0.5 ? FEAT.hairBun : FEAT.hairLong);
    else if (rnd() < 0.5) feats.add(FEAT.tuft);
    if (rnd() < 0.5) {
      // School uniform: white shirt, navy shorts or skirt.
      set(['top', 'sleeveL', 'sleeveR'], 0xf4f2ec);
      set(['foreL', 'foreR'], skin);
      set(['hips', 'thigh'], 0x22305a);
      set(['shin'], girl ? 0x22305a : skin);
      if (girl) feats.add(FEAT.skirt);
      feats.add(FEAT.collar);
      set(['accent'], 0xf8f6f0);
    } else {
      const shirt = pick(SHIRTS);
      set(['top', 'sleeveL', 'sleeveR'], shirt);
      set(['foreL', 'foreR'], skin);
      set(['hips', 'thigh'], pick(TROUSERS));
      set(['shin'], skin);
    }
    // (barefoot, or in flip-flops)
    set(['foot'], skin);
    set(['sole'], rnd() < 0.5 ? skin : pick([0x3a6ac0, 0xd04a4a, 0x2a2a2a]));
    set(['prop'], 0xf0e8d0);
    set(['wood'], 0x9a6a3a);
    height = (opts.young ? 0.66 : 0.74) + 0.07 * rnd();
  } else if (kind === 'fisherman') {
    const skin = pick([0x946040, 0x8a5838, 0xa06a45]);
    set(['skin'], skin);
    set(['hair'], pick(HAIR_DARK));
    feats.add(FEAT.hairShort);
    const shirt = pick([0x5a7a9a, 0x8a8a80, 0x6a5a4a, 0x4a6a6a]);
    set(['top', 'sleeveL', 'sleeveR', 'foreL', 'foreR'], shirt);
    set(['hips', 'thigh'], pick([0x3a3a3a, 0x4a4a5a, 0x5a4a3a]));
    set(['shin', 'foot', 'sole'], skin);
    // The krama: red and white checks.
    set(['accent'], 0xb8322c);
    set(['accent2'], 0xf0ece0);
    if (rnd() < 0.6) {
      palmHat(feats, colors, rnd);
      feats.add(FEAT.kramaNeck);
    } else feats.add(FEAT.kramaHead);
    feats.add(FEAT.net);
    set(['prop'], 0xcac2aa);
    set(['prop2'], 0x6a6a6a);
    carry = CARRY.net;
    height = 0.96 + 0.05 * rnd();
  } else if (kind === 'villager') {
    const sex = opts.sex ?? (rnd() < 0.5 ? 'f' : 'm');
    const old = opts.age === 'old' || (opts.age === undefined && rnd() < 0.2);
    const skin = pick(KHMER_SKIN);
    set(['skin', 'foot'], skin);
    set(['hair'], old ? pick([0x8a847c, 0xb8b4ac, 0x5a544c]) : pick(HAIR_DARK));
    feats.add(FEAT.hairShort);
    if (sex === 'f') {
      feats.add(FEAT.hairBun);
      const blouse = pick(BLOUSES);
      set(['top', 'sleeveL', 'sleeveR'], blouse);
      set(['foreL', 'foreR'], rnd() < 0.6 ? blouse : skin);
      set(['hips', 'thigh', 'shin'], pick(SARONGS));
      feats.add(FEAT.skirt);
    } else {
      const shirt = pick(WORK_SHIRTS);
      set(['top', 'sleeveL', 'sleeveR'], shirt);
      set(['foreL', 'foreR'], rnd() < 0.5 ? shirt : skin);
      if (rnd() < 0.4) {
        set(['hips', 'thigh', 'shin'], pick(SARONGS_M));
        feats.add(FEAT.skirt);
      } else {
        const pants = pick([0x3a3a3a, 0x4a4a5a, 0x5a4a3a, 0x2c3448]);
        set(['hips', 'thigh'], pants);
        set(['shin'], rnd() < 0.5 ? skin : pants);
      }
    }
    // (flip-flops, or barefoot)
    set(['sole'], rnd() < 0.6 ? pick([0x3a3a3a, 0xc04a3a, 0x3a6ac0]) : skin);
    // The krama (red and white checks, or blue, or green), the palm-leaf hat for the fields.
    set(['accent'], pick([0xb8322c, 0xb8322c, 0x2c5a9a, 0x3a7a4a]));
    set(['accent2'], 0xf0ece0);
    const h = opts.hat ?? (rnd() < 0.35 ? 'palm' : rnd() < 0.55 ? 'krama' : 'none');
    if (h === 'palm') {
      palmHat(feats, colors, rnd);
      if (rnd() < 0.5) feats.add(FEAT.kramaNeck);
    } else if (h === 'krama') feats.add(FEAT.kramaHead);
    else if (sex === 'm' && rnd() < 0.5) feats.add(FEAT.kramaNeck);
    // Work things: straw-gold sheaves, bamboo, a steel blade.
    set(['prop'], 0xd8b860);
    set(['prop2'], 0x7a5a30);
    set(['wood'], 0xb89a5a);
    set(['gear'], 0x9a9a96);
    height = (sex === 'f' ? 0.93 : 0.98) * (old ? 0.96 : 1) + 0.04 * (rnd() - 0.5);
  } else {
    // Apsara dancer.
    const skin = pick([0xc08a60, 0xb88058, 0xc89468]);
    set(['skin', 'sleeveL', 'sleeveR', 'foreL', 'foreR', 'foot', 'sole'], skin);
    set(['hair'], 0x1c1612);
    feats.add(FEAT.hairShort).add(FEAT.headdress).add(FEAT.jewels).add(FEAT.sampot).add(FEAT.fingers);
    const cloth = pick([0xb02838, 0x2a6a4a, 0x6a2a8a, 0xc8702a]);
    set(['top'], pick([0xd8a040, shade(cloth, 1.1)]));
    set(['hips', 'thigh', 'shin'], cloth);
    set(['accent'], pick([0xe0b048, 0xa01828]));
    set(['gold'], 0xe8b84a);
    height = (opts.young ? 0.86 : 0.95) + 0.03 * rnd();
  }
  colors[SLOT.mouth] = shade(colors[SLOT.skin], 0.66);
  if (opts.carry !== undefined && kind !== 'guide') carry = opts.carry;
  for (const p of opts.props ?? []) feats.add(p);
  // A prop that comes with its carry.
  const PROP: Partial<Record<Carry, Feature>> = { [CARRY.umbrella]: FEAT.umbrella, [CARRY.flag]: FEAT.flag, [CARRY.torch]: FEAT.torch, [CARRY.broom]: FEAT.broom, [CARRY.bowl]: FEAT.bowl, [CARRY.net]: FEAT.net, [CARRY.kite]: FEAT.kite, [CARRY.phone]: FEAT.phone, [CARRY.pole]: FEAT.pole };
  const prop = PROP[carry];
  // (a stick in the right hand only with its carry: the grip holds it at that carry's tilt)
  for (const stick of [FEAT.umbrella, FEAT.flag, FEAT.torch, FEAT.broom, FEAT.kite, FEAT.pole]) if (stick !== prop && !opts.props?.includes(stick)) feats.delete(stick);
  if (prop) feats.add(prop);
  // (one thing in the right hand at a time)
  if (carry !== CARRY.none && carry !== CARRY.phone && carry !== CARRY.net && carry !== CARRY.bowl) feats.delete(FEAT.phone);
  if (feats.has(FEAT.umbrella) || feats.has(FEAT.flag)) feats.delete(FEAT.phone);
  return { feats: [...feats], carry, colors, height, seed: rnd(), kind };
}
