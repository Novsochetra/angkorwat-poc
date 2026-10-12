import { progress } from '../progress';
import type { WordKey } from '../ui/lang';
import { SHOP_DELIVER, shopToWorld, shopYaw } from './_bikeShopPlan';

/**
 * His own bicycle (bought at the morning market's bicycle shop: roam/_bikeShop.ts),
 * with no three.js: the kinds the shop sells, which one he has and where he
 * last left it. The bicycle add-on (roam/_bike.ts) draws and rides it, the
 * shop sells it, the maps (ui/_minimapSpots.ts) put "My bicycle" where it is.
 *
 * Saved (map/progress.ts): `bike.own` (`{ kind, colour }`), `bike.ownAt`
 * (`{ x, z, yaw }`: where he got off it last, yaw in degrees), so it stands
 * there between visits and across Esc back to the map; and how many he has
 * bought (`bike.bought`). Shots save nothing; a URL's `bikeown=` / `bikeownat=`
 * (`fromUrl`) sets them for that page alone.
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

/** Buying another, the one he has goes back to the shop for this share of its price (rounded to 1 000 ៛). */
export const TRADE_IN = 0.5;
export const tradeIn = (k: BikeKindId): number => Math.round((kindOf(k).price * TRADE_IN) / 1000) * 1000;

/** What one of `kind` costs him now: its price, less the trade-in of the one he has (none: 0; the same: 0, he has it). */
export function costFor(kind: BikeKindId): number {
  if (BIKE_OWN.kind === kind) return 0;
  return kindOf(kind).price - (BIKE_OWN.kind ? tradeIn(BIKE_OWN.kind) : 0);
}

/** Hiring one of the bicycles by Angkor Wat's road (riel, paid once a hire). */
export const HIRE_PRICE = 2_000;

/**
 * His bicycle now: its kind and colour (`kind` null: none), where it stands (m; `yaw` its heading, radians), whether
 * he is riding it (the maps' badge goes while he does: he is on it), and a count that goes up with every change (`n`:
 * the bicycle add-on and the maps redo theirs).
 */
export const BIKE_OWN = {
  kind: null as BikeKindId | null,
  colour: 'black' as BikeColourId,
  x: 0,
  z: 0,
  yaw: 0,
  riding: false,
  n: 0,
};

/** He got on his bicycle (true) or off it (the bicycle add-on: roam/_bike.ts). */
export function ridingBike(on: boolean): void {
  if (BIKE_OWN.riding === on) return;
  BIKE_OWN.riding = on;
  BIKE_OWN.n++;
}

/** Its place before he first rides it: on its stand before the bicycle shop. */
export function deliverySpot(): { x: number; z: number; yaw: number } {
  const [x, z] = shopToWorld(SHOP_DELIVER.x, SHOP_DELIVER.z);
  return { x, z, yaw: shopYaw(SHOP_DELIVER.turn) };
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

type Own = { kind: string; colour: string };
type At = { x: number; z: number; yaw: number };
const isOwn = (v: unknown): v is Own => typeof v === 'object' && v !== null && isKind((v as Own).kind) && isColour((v as Own).colour);
const isAt = (v: unknown): v is At =>
  typeof v === 'object' && v !== null && [(v as At).x, (v as At).z, (v as At).yaw].every((n) => typeof n === 'number' && Number.isFinite(n));

/** The saved bicycle (once, at the start): what he has and where it stands. */
function load(): void {
  const own = progress.get<Own | null>('bike.own', null, (v): v is Own => isOwn(v));
  if (!own) return;
  BIKE_OWN.kind = own.kind as BikeKindId;
  BIKE_OWN.colour = own.colour as BikeColourId;
  const at = progress.get<At | null>('bike.ownAt', null, (v): v is At => isAt(v));
  const d = deliverySpot();
  BIKE_OWN.x = at ? at.x : d.x;
  BIKE_OWN.z = at ? at.z : d.z;
  BIKE_OWN.yaw = at ? (at.yaw * Math.PI) / 180 : d.yaw;
  BIKE_OWN.n++;
}
load();

function save(): void {
  if (fromUrl) return;
  progress.set('bike.own', BIKE_OWN.kind ? { kind: BIKE_OWN.kind, colour: BIKE_OWN.colour } : null);
  progress.set('bike.ownAt', BIKE_OWN.kind ? { x: +BIKE_OWN.x.toFixed(2), z: +BIKE_OWN.z.toFixed(2), yaw: +((BIKE_OWN.yaw * 180) / Math.PI).toFixed(1) } : null);
}

/** He bought one of `kind`: it is his (the one he had traded in), on its stand before the shop. */
export function buyBike(kind: BikeKindId): void {
  BIKE_OWN.kind = kind;
  BIKE_OWN.colour = kindOf(kind).colour;
  const d = deliverySpot();
  BIKE_OWN.x = d.x;
  BIKE_OWN.z = d.z;
  BIKE_OWN.yaw = d.yaw;
  progress.set('bike.bought', progress.get('bike.bought', 0) + 1);
  save();
  changed();
}

/** He got off it (or went back to the map on it): it stands there now (saved; the add-on has it there already). */
export function leaveBike(x: number, z: number, yaw: number): void {
  BIKE_OWN.riding = false;
  if (!BIKE_OWN.kind) return;
  BIKE_OWN.x = x;
  BIKE_OWN.z = z;
  BIKE_OWN.yaw = yaw;
  BIKE_OWN.n++;
  save();
}

/**
 * The URL's values (a check, a bug report's shot): `bikeown=<kind>[:<colour>]` (`0`: none) he has that bicycle,
 * `bikeownat=x:z:yaw°` it stands there (else before the shop). Nothing is saved from them. True if they changed it.
 */
export function bikeOwnFromUrl(q: URLSearchParams): boolean {
  if (!q.has('bikeown') && !q.has('bikeownat')) return false;
  fromUrl = true;
  const spec = q.get('bikeown');
  if (spec !== null) {
    const [k, c] = spec.split(':');
    if (isKind(k)) {
      BIKE_OWN.kind = k;
      BIKE_OWN.colour = isColour(c) ? c : kindOf(k).colour;
    } else BIKE_OWN.kind = null;
  }
  const at = (q.get('bikeownat') ?? '').split(':').map(Number);
  const d = deliverySpot();
  if (at.length >= 2 && at.slice(0, 2).every(Number.isFinite)) {
    BIKE_OWN.x = at[0];
    BIKE_OWN.z = at[1];
    BIKE_OWN.yaw = Number.isFinite(at[2]) ? (at[2] * Math.PI) / 180 : d.yaw;
  } else if (spec !== null) {
    BIKE_OWN.x = d.x;
    BIKE_OWN.z = d.z;
    BIKE_OWN.yaw = d.yaw;
  }
  changed();
  return true;
}
