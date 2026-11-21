import { progress } from '../progress';
import type { WordKey } from '../ui/lang';
import { SHOP_DELIVER, shopToWorld, shopYaw } from './_bikeShopPlan';

/**
 * His own bicycles (bought at the morning market's bicycle shop: roam/_bikeShop.ts),
 * with no three.js: the kinds the shop sells, which ones he has (one of each kind at
 * most: he keeps every one he buys) and where he last left each. The bicycle add-on
 * (roam/_bike.ts) draws and rides them, the shop sells them, the maps
 * (ui/_minimapSpots.ts) put "My bicycle" where each is.
 *
 * Saved (map/progress.ts): `bike.owned`, a list of `{ kind, colour, x, z, yaw, y }`
 * (where he got off it last, yaw in degrees, `y` the floor it stands on: a terrace, a
 * deck or a bridge over the land keeps it, where only `x, z` stood it on the land
 * under them, inside a terrace's stone; saves from before `y` stand it on the land as
 * before), so each stands there between visits and across Esc back to the map; and
 * how many he has bought (`bike.bought`). Saves from when he had one bicycle
 * (`bike.own`, `bike.ownAt`) are read into the list. Shots save nothing; a URL's
 * `bikeown=` / `bikeownat=` (`fromUrl`) sets them for that page alone.
 *
 * Nothing per frame.
 */

export type BikeKindId = 'town' | 'lady' | 'carrier';
export type BikeColourId = 'black' | 'sky' | 'red';

export interface BikeKind {
  readonly id: BikeKindId;
  /** The colour it is sold in. */
  readonly colour: BikeColourId;
  /** Riel (៛): a goal to save up for (pocket money is 20 000 a day; fish 500–18 000 each, garden fruit 200–15 000). */
  readonly price: number;
  readonly name: WordKey;
  readonly note: WordKey;
}

/**
 * What the shop sells, in its row's order: the black Khmer town bicycle (as the neighbours' and the hire ones, a
 * cane basket and a lamp), the sky-blue lady's bicycle (a white basket, a cream saddle), the red one with a padded
 * seat on its rack (to carry a friend). All step-through, sized for him (character/bike.ts `BIKE`).
 */
export const BIKE_KINDS: readonly BikeKind[] = [
  { id: 'town', colour: 'black', price: 60_000, name: 'bikeShopTown', note: 'bikeShopTownNote' },
  { id: 'lady', colour: 'sky', price: 85_000, name: 'bikeShopLady', note: 'bikeShopLadyNote' },
  { id: 'carrier', colour: 'red', price: 120_000, name: 'bikeShopCarrier', note: 'bikeShopCarrierNote' },
];

export const kindOf = (id: BikeKindId): BikeKind => BIKE_KINDS.find((k) => k.id === id)!;
const KIND_IDS: readonly string[] = BIKE_KINDS.map((k) => k.id);
const COLOUR_IDS: readonly string[] = ['black', 'sky', 'red'];
export const isKind = (v: unknown): v is BikeKindId => typeof v === 'string' && KIND_IDS.includes(v);
export const isColour = (v: unknown): v is BikeColourId => typeof v === 'string' && COLOUR_IDS.includes(v);

/** What one of `kind` costs him now: its price (one he has already: 0, it is his). He keeps every one he buys. */
export function costFor(kind: BikeKindId): number {
  return hasBike(kind) ? 0 : kindOf(kind).price;
}

/** Hiring one of the bicycles by Angkor Wat's road (riel, paid once a hire). */
export const HIRE_PRICE = 2_000;

/**
 * One bicycle of his: its kind and colour, where it stands (m; `yaw` its heading, radians; `y` the floor it was left
 * on, NaN: not known, the bicycle add-on stands it on the ground there), and whether he is riding it (the maps' badge
 * goes while he does: he is on it).
 */
export interface OwnBike {
  kind: BikeKindId;
  colour: BikeColourId;
  x: number;
  y: number;
  z: number;
  yaw: number;
  riding: boolean;
}

/**
 * His bicycles now (one of each kind at most, in the order bought: none, he has none), and a count that goes up with
 * every change (`n`: the bicycle add-on and the maps redo theirs). He keeps every one he buys (no trade-in).
 */
export const BIKE_OWN = {
  bikes: [] as OwnBike[],
  n: 0,
};

/** His bicycle of `kind`, or undefined. */
export const ownBike = (kind: BikeKindId): OwnBike | undefined => BIKE_OWN.bikes.find((b) => b.kind === kind);
export const hasBike = (kind: BikeKindId): boolean => ownBike(kind) !== undefined;
/** He has at least one. */
export const hasAnyBike = (): boolean => BIKE_OWN.bikes.length > 0;

/** He got on his bicycle of `kind` (true) or off it (the bicycle add-on: roam/_bike.ts). */
export function ridingBike(kind: BikeKindId, on: boolean): void {
  const b = ownBike(kind);
  if (!b || b.riding === on) return;
  b.riding = on;
  BIKE_OWN.n++;
}

/** The stand before the bicycle shop for the `i`-th bicycle there (side by side, a metre apart, out to the street). */
function deliverySlot(i: number): { x: number; z: number; yaw: number } {
  const [x, z] = shopToWorld(SHOP_DELIVER.x, SHOP_DELIVER.z + i * DELIVER_GAP);
  return { x, z, yaw: shopYaw(SHOP_DELIVER.turn) };
}
/** Between two bicycles delivered side by side (m). */
const DELIVER_GAP = 1.0;

/** Its place before he first rides it: on its stand before the bicycle shop (the first stand no bicycle of his is at). */
export function deliverySpot(): { x: number; z: number; yaw: number } {
  for (let i = 0; i < BIKE_KINDS.length; i++) {
    const d = deliverySlot(i);
    if (!BIKE_OWN.bikes.some((b) => !b.riding && Math.hypot(b.x - d.x, b.z - d.z) < 0.7)) return d;
  }
  return deliverySlot(0);
}

const listeners: (() => void)[] = [];
/** Something changed (bought, traded, moved by a URL). Not where he leaves it (`leaveBike`: the add-on moved it itself). */
export function onBikeOwn(fn: () => void): void {
  listeners.push(fn);
}
function changed(): void {
  BIKE_OWN.n++;
  for (const fn of listeners) fn();
}

/** A URL set it (`bikeown=`, `bikeownat=`): kept for this page alone, never saved over what the player has. */
let fromUrl = false;
/** The URL's values last applied (`bikeOwnFromUrl`). */
let urlSaid = '';

type Own = { kind: string; colour: string };
type At = { x: number; z: number; yaw: number; y?: number };
type Saved = Own & At;
const isOwn = (v: unknown): v is Own => typeof v === 'object' && v !== null && isKind((v as Own).kind) && isColour((v as Own).colour);
const isAt = (v: unknown): v is At =>
  typeof v === 'object' &&
  v !== null &&
  [(v as At).x, (v as At).z, (v as At).yaw].every((n) => typeof n === 'number' && Number.isFinite(n)) &&
  ((v as At).y === undefined || (typeof (v as At).y === 'number' && Number.isFinite((v as At).y)));
const isSaved = (v: unknown): v is Saved[] => Array.isArray(v) && v.every((b) => isOwn(b) && isAt(b));

/** One bicycle from what was saved (no place: before the shop). */
function fromSave(own: Own, at: At | null): OwnBike {
  const d = deliverySpot();
  return {
    kind: own.kind as BikeKindId,
    colour: own.colour as BikeColourId,
    x: at ? at.x : d.x,
    y: at?.y ?? NaN,
    z: at ? at.z : d.z,
    yaw: at ? (at.yaw * Math.PI) / 180 : d.yaw,
    riding: false,
  };
}

/**
 * The saved bicycles (once, at the start): `bike.owned`, a list of `{ kind, colour, x, z, yaw, y? }` (yaw in degrees).
 * Saves from before it had one bicycle (`bike.own`, `bike.ownAt`): that one.
 */
function load(): void {
  const list = progress.get<Saved[] | null>('bike.owned', null, (v): v is Saved[] => isSaved(v));
  if (list) {
    for (const b of list) if (!hasBike(b.kind as BikeKindId)) BIKE_OWN.bikes.push(fromSave(b, b));
  } else {
    const own = progress.get<Own | null>('bike.own', null, (v): v is Own => isOwn(v));
    if (!own) return;
    const at = progress.get<At | null>('bike.ownAt', null, (v): v is At => isAt(v));
    BIKE_OWN.bikes.push(fromSave(own, at));
  }
  BIKE_OWN.n++;
}
load();

function save(): void {
  if (fromUrl) return;
  const list = BIKE_OWN.bikes.map((b) => {
    const o: { [k: string]: string | number } = { kind: b.kind, colour: b.colour, x: +b.x.toFixed(2), z: +b.z.toFixed(2), yaw: +((b.yaw * 180) / Math.PI).toFixed(1) };
    if (Number.isFinite(b.y)) o.y = +b.y.toFixed(2);
    return o;
  });
  progress.set('bike.owned', list.length ? list : null);
  // (the old one-bicycle keys: read once, now in the list)
  progress.set('bike.own', null);
  progress.set('bike.ownAt', null);
}

/** He bought one of `kind`: it is his too (the ones he had stay his), on its stand before the shop. */
export function buyBike(kind: BikeKindId): void {
  if (hasBike(kind)) return;
  const d = deliverySpot();
  BIKE_OWN.bikes.push({ kind, colour: kindOf(kind).colour, x: d.x, y: NaN, z: d.z, yaw: d.yaw, riding: false });
  progress.set('bike.bought', progress.get('bike.bought', 0) + 1);
  save();
  changed();
}

/** He got off his bicycle of `kind` (or went back to the map on it): it stands there now, on the floor at `y` (saved; the add-on has it there already). */
export function leaveBike(kind: BikeKindId, x: number, z: number, yaw: number, y = NaN): void {
  const b = ownBike(kind);
  if (!b) return;
  b.riding = false;
  b.x = x;
  b.y = y;
  b.z = z;
  b.yaw = yaw;
  BIKE_OWN.n++;
  save();
}

/**
 * The URL's values (a check, a bug report's shot): `bikeown=<kind>[:<colour>][,<kind>[:<colour>]…]` (`0`: none) he has
 * those bicycles, `bikeownat=x:z:yaw°[:y][,…]` they stand there, in the same order, on the floor at `y` (else on the
 * ground there; no place: before the shop). Nothing is saved from them. True if they changed it.
 */
export function bikeOwnFromUrl(q: URLSearchParams): boolean {
  if (!q.has('bikeown') && !q.has('bikeownat')) return false;
  // (the same values again — the add-on's `init` and `fromUrl` both pass the page's — leave what happened since: a purchase)
  const said = `${q.get('bikeown')}|${q.get('bikeownat')}`;
  if (said === urlSaid) return false;
  urlSaid = said;
  fromUrl = true;
  const spec = q.get('bikeown');
  if (spec !== null) {
    BIKE_OWN.bikes.length = 0;
    for (const one of spec.split(',')) {
      const [k, c] = one.split(':');
      if (!isKind(k) || hasBike(k)) continue;
      const d = deliverySpot();
      BIKE_OWN.bikes.push({ kind: k, colour: isColour(c) ? c : kindOf(k).colour, x: d.x, y: NaN, z: d.z, yaw: d.yaw, riding: false });
    }
  }
  (q.get('bikeownat') ?? '').split(',').forEach((one, i) => {
    const b = BIKE_OWN.bikes[i];
    const at = one.split(':').map(Number);
    if (!b || at.length < 2 || !at.slice(0, 2).every(Number.isFinite)) return;
    b.x = at[0];
    b.z = at[1];
    if (Number.isFinite(at[2])) b.yaw = (at[2] * Math.PI) / 180;
    b.y = Number.isFinite(at[3]) ? at[3] : NaN;
  });
  changed();
  return true;
}
