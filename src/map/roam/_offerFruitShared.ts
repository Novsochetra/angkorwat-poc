import { Vector3, type Mesh } from 'three';
import { BODY_UNIT_M } from '../../world/scale';
import type { PlantKindId } from '../garden/kinds';
import { progress } from '../progress';
import { num, onLang, t, type WordKey } from '../ui/lang';
import type { AddonEnv } from './_addons';
import { activeJournal } from './_book';
import { giftKind, giftKinds } from './_giveFruit';
import { FRUIT_SIZE, isOfferKind, offerMesh, OFFER_KINDS, setOfferKind, type OfferKind } from './_offerFruitModels';
import type { RoamCtx } from './types';

/**
 * What the offering's two halves share (roam/_offerFruit.ts at the shrines,
 * roam/_offerFruitMonk.ts to the monks): the fruit he would give, its name and
 * the prompts, the merit count, the fruit in his hands (one mesh), and his
 * space ↔ the map. No allocation per call.
 */

export const OFFER_ID = 'offerFruit';
/** Metres per body unit (his own; times his `body.scale` on the map). */
export const BU = BODY_UNIT_M;

/** The roaming things, once roaming is built (roam/_offerFruit.ts `init`). */
export const S = { env: null as AddonEnv | null, hand: null as Mesh | null };

export const smooth = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
export const ramp = (s: number, [a, b]: readonly [number, number]): number => smooth((s - a) / (b - a));
export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The fruit's name in a sentence (ui/lang.ts `offerFruit…`). */
const FRUIT_WORD: Record<OfferKind, WordKey> = {
  banana: 'offerFruitBanana',
  coconut: 'offerFruitCoconut',
  mango: 'offerFruitMango',
  papaya: 'offerFruitPapaya',
  guava: 'offerFruitGuava',
  jackfruit: 'offerFruitJackfruit',
  durian: 'offerFruitDurian',
  sugarPalm: 'offerFruitSugarPalm',
  sugarcane: 'offerFruitSugarcane',
};
export const fruitWord = (k: OfferKind): string => t(FRUIT_WORD[k]);
export const okKind = (k: PlantKindId): boolean => isOfferKind(k);

/** The fruit he would give now (of the kinds that can be offered), or null. */
export function offerKind(): OfferKind | null {
  const k = giftKind(okKind);
  return k && isOfferKind(k) ? k : null;
}

/** The prompt's hint of `,` / `.` goes once he has used them (this visit). */
export const STEP = { stepped: false, shownStep: -1, stepN: 0 };
const _kinds: PlantKindId[] = [];
export type PromptKey = 'offerShrine' | 'offerMonk' | 'offerBowl' | 'offerMonkListen';
/** The prompts made so far (by key, kind, with the hint or not): made once, again when the language changes. */
const PROMPTS = new Map<string, string[]>();
onLang(() => PROMPTS.clear());
/**
 * "E  ថ្វាយចេក ហើយថ្វាយបង្គំ" (and, while he has two kinds or more and has not stepped yet, ",  .  another fruit");
 * `offerMonkListen` is the monk's with "J  Kneel and listen" after it (the blessing monk's dais). No allocation once made.
 */
export function prompt(key: PromptKey, k: OfferKind): string {
  STEP.shownStep = STEP.stepN;
  const hint = !STEP.stepped && giftKinds(_kinds, okKind).length > 1 ? 1 : 0;
  let byKind = PROMPTS.get(key);
  if (!byKind) PROMPTS.set(key, (byKind = []));
  const i = OFFER_KINDS.indexOf(k) * 2 + hint;
  let p = byKind[i];
  if (p === undefined) {
    const words = t(key === 'offerMonkListen' ? 'offerMonk' : key, { fruit: fruitWord(k) });
    p = `E  ${words}${key === 'offerMonkListen' ? `  ·  J  ${t('listenMonk')}` : ''}`;
    if (hint) p += `  ·  , .  ${t('offerStep')}`;
    byKind[i] = p;
  }
  return p;
}

/** Merit toasts at these counts (after the count's own). */
const MILESTONES = [10, 25, 50, 100, 200, 500];
/** A toast a moment later (s from now): `frame` gives it. */
export const LATER = { text: '', in: 0 };

/** Counted: the merit, kept between visits (`monk`: an offering to a monk); the toast's count. */
export function countMerit(monk: boolean): number {
  const n = progress.get('offer.count', 0, isNum) + 1;
  progress.set('offer.count', n);
  if (monk) progress.set('offer.monks', progress.get('offer.monks', 0, isNum) + 1);
  // (the first offering: its stamp in the passport's moments)
  activeJournal()?.award('offering');
  if (MILESTONES.includes(n)) {
    LATER.text = t('offerMilestone', { n: num(n) });
    LATER.in = 3.2;
  }
  return n;
}

/** A point on the map in his space (BU, his feet at the origin, +z the way he faces, +x his left), into `out`. */
export function toBody(ctx: RoamCtx, x: number, y: number, z: number, out: Vector3): Vector3 {
  const b = ctx.body;
  const k = 1 / (BU * b.scale);
  const dx = x - b.pos.x;
  const dz = z - b.pos.z;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return out.set((c * dx - s * dz) * k, (y - b.pos.y) * k, (s * dx + c * dz) * k);
}
/** A point in his space (BU) on the map, into `out`. */
export function toMap(ctx: RoamCtx, p: Vector3, out: Vector3): Vector3 {
  const b = ctx.body;
  const k = BU * b.scale;
  const c = Math.cos(b.yaw);
  const s = Math.sin(b.yaw);
  return out.set(b.pos.x + (c * p.x + s * p.z) * k, b.pos.y + p.y * k, b.pos.z + (-s * p.x + c * p.z) * k);
}

/** The tray's rim over its foot (m, real): the gift's place on a tray is its rim's middle. */
export const RIM = 0.05;

/** The fruit in his hands (or the monk's), its gift place at (x, y, z) on the map facing `yaw`: on its tray or alone, `scale` his size, `size` 0‥1. */
export function showHandAt(kind: OfferKind, x: number, y: number, z: number, yaw: number, onTray: boolean, scale: number, size = 1): void {
  const e = S.env;
  if (!e) return;
  if (!S.hand) {
    S.hand = offerMesh('offer:hand');
    e.scene.add(S.hand);
  }
  const h = S.hand;
  setOfferKind(h, kind, onTray);
  const s = scale * Math.max(0.001, size);
  // (the gift's place is the tray's rim, or the fruit's middle: its foot under it)
  h.position.set(x, y - (onTray ? RIM : FRUIT_SIZE[kind].high * 0.5) * s, z);
  h.rotation.set(0, yaw, 0);
  h.scale.setScalar(s);
  h.visible = size > 0.002;
}
const _w = new Vector3();
/** The same, its place `p` in his space (BU). */
export function showHand(kind: OfferKind, ctx: RoamCtx, p: Vector3, onTray: boolean, size = 1): void {
  toMap(ctx, p, _w);
  showHandAt(kind, _w.x, _w.y, _w.z, ctx.body.yaw, onTray, ctx.body.scale, size);
}
export function hideHand(): void {
  if (S.hand) S.hand.visible = false;
}

/** His hat off for the offering (true: it was on, it goes back on after). */
export function hatOff(): boolean {
  const e = S.env;
  if (!e || !e.explorer.currentOutfit.hat) return false;
  e.explorer.setOutfit({ hat: false });
  e.photo.refreshBody();
  return true;
}
export function hatOn(): void {
  const e = S.env;
  if (!e || e.explorer.currentOutfit.hat) return;
  e.explorer.setOutfit({ hat: true });
  e.photo.refreshBody();
}

/** A card asks something just now ("Back to the map?": ui/ask.ts), or roaming is on its way back: it waits. */
export const asking = (): boolean => (typeof document !== 'undefined' && document.body.classList.contains('mu-asking')) || !(S.env?.controls.enabled ?? true);
