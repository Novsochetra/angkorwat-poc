import { dress } from '../people/_kinds';
import { CARRY, FEAT, SLOT, type Feature, type Look } from '../people/_personModel';

/**
 * How people dress for the pagoda at Pchum Ben and Visak Bochea (the people
 * part's `pilgrim` kind, people/_kinds.ts): women in a white blouse and a
 * dark sampot with the white sash (sbai) over the shoulder, grandmothers
 * grey-haired, the old lay nuns (yeay chi) all in white with shaven heads;
 * men in a white shirt and dark trousers, a krama round the neck; children
 * in white shirts. What they carry: lotus buds and incense sticks (raised
 * between the palms as they walk round the hall: `FEAT.offering`), or a
 * woven tray (`CARRY.tray`) of food for the monks, of rice balls (bay ben),
 * of candles and lotus. Monks in their saffron robes, with lotus and
 * incense too.
 */

export type PagodaRole = 'woman' | 'grandma' | 'nun' | 'man' | 'grandpa' | 'kid';

/** What a tray holds (`prop`, `prop2`): food for the monks, rice balls in banana leaf, candles and lotus. */
const TRAY = {
  food: [0xd8dde2, 0xe8a24a],
  rice: [0xf6f2e6, 0x4f9a3a],
  candles: [0xf8f2dc, 0xf0a0b8],
} as const;

/** Lotus buds (pink or white), their green stems, red incense sticks with glowing tips. */
const LOTUS = [0xf2a8c0, 0xf6d4dc, 0xe888a8, 0xf4ecdc];

export interface PagodaOpts {
  /** Lotus and incense in the hands (`FEAT.offering`). */
  offering?: boolean;
  /** A tray in both hands (`CARRY.tray`) and what is on it. */
  tray?: keyof typeof TRAY;
}

/** A Khmer villager dressed for the pagoda. */
export function pagodaLook(role: PagodaRole, seed: number, o: PagodaOpts = {}): Look {
  const props: Feature[] = o.offering ? [FEAT.offering] : [];
  if (o.tray) props.push(FEAT.tray);
  const carry = o.tray ? CARRY.tray : CARRY.none;
  let look: Look;
  if (role === 'kid') {
    look = dress('kid', seed, { carry, props });
    const c = look.colors;
    // (a white shirt for the pagoda, dark shorts or skirt)
    c[SLOT.top] = c[SLOT.sleeveL] = c[SLOT.sleeveR] = 0xf4f2ec;
    c[SLOT.hips] = c[SLOT.thigh] = 0x22283a;
  } else {
    const sex = role === 'man' || role === 'grandpa' ? 'm' : 'f';
    const old = role === 'grandma' || role === 'grandpa' || role === 'nun';
    look = dress('pilgrim', seed, { sex, age: old ? 'old' : 'young', pilgrim: role === 'nun' ? 'yeaychi' : 'elder', carry, props });
    const c = look.colors;
    // (the young keep their dark hair: the pilgrims' "elder" style greys it)
    if (!old) c[SLOT.hair] = [0x1c1612, 0x2a1d14, 0x3a2618][seed % 3];
    // (women: a dark sampot under the white blouse; a few in deep plum or navy)
    if (sex === 'f' && role !== 'nun') c[SLOT.hips] = c[SLOT.thigh] = c[SLOT.shin] = [0x1e1c20, 0x2a2420, 0x1e2434, 0x3a1e2e][seed % 4];
  }
  const c = look.colors;
  if (o.offering) {
    c[SLOT.prop] = LOTUS[seed % LOTUS.length];
    c[SLOT.prop2] = 0x4a8a3a;
    c[SLOT.wood] = 0xa8322a;
    c[SLOT.flame] = 0xff9a48;
  }
  if (o.tray) {
    const [a, b] = TRAY[o.tray];
    c[SLOT.prop] = a;
    c[SLOT.prop2] = b;
    c[SLOT.wood] = 0xc8a46a;
  }
  return look;
}

/** A monk (saffron robe), with lotus and incense (`offering`) for the walk round the hall. */
export function monkLook(seed: number, offering = false): Look {
  const look = dress('monk', seed);
  if (offering) {
    look.feats = [...look.feats, FEAT.offering];
    const c = look.colors;
    c[SLOT.prop] = LOTUS[(seed + 1) % LOTUS.length];
    c[SLOT.prop2] = 0x4a8a3a;
    c[SLOT.wood] = 0xa8322a;
    c[SLOT.flame] = 0xff9a48;
  }
  return look;
}
