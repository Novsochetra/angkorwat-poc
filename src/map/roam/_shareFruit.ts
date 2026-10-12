import { KINDS, type PlantKindId } from '../garden/kinds';
import { GARDEN } from '../garden/state';
import { progress } from '../progress';
import { findShare, SHARE, SHARE_FRIENDS, shareCue, villageAt, type ShareBack, type ShareVillage, type ShareWho } from '../share';
import { TIME } from '../time';
import { lang, num, t } from '../ui/lang';
import { registerAddon, type AddonEnv } from './_addons';
import { GIVING, giftKind, isMonk, stepGift, takeGift } from './_giveFruit';
import { startShare, type ShareSession, type ShareStep } from './_shareFruitSession';
import { againWord, anItem, itemName, planShare, promptWord, snackKept } from './_shareFruitWords';
import { bagNotify } from './_shopBag';
import { CARRY_MAX } from './_shopPurse';
import type { MapFrame } from '../types';
import type { RoamCtx } from './types';

/**
 * Sharing his garden's fruit (add-on `shareFruit`, words `share…`; the guide:
 * docs/map-work/addons.md "Sharing his fruit"). With fruit in his basket
 * (garden/state.ts `GARDEN.basket`: what he picked at home), by a Khmer
 * villager standing or sitting near him (greet.ts' people: the sugar-palm
 * village, the floating village, the hamlet behind Angkor Wat, the markets,
 * the farmers, the grandmother who kept his house's key) — never a monk (that
 * is offering: roam/_offerFruit*.ts, shared rules in _giveFruit.ts), nor a
 * visitor from abroad —:
 *
 * - **E "ចែកផ្លែស្វាយឲ្យគាត់ / Share a mango"** (to an elder "ជូន…", to the
 *   grandmother "ជូន…យាយ"): `,` / `.` change the fruit (_giveFruit.ts
 *   `stepGift`). He steps up and holds it out with both hands, a little bow,
 *   deeper to an elder, down on his haunches to someone sitting
 *   (character/share.ts); they reach out and take it, thank him (a sampeah;
 *   an elder's "អរគុណណាក្មួយ!", a nod and a blessing as he bows to them with
 *   his palms up to his face), and now and then give him something back: a
 *   sweet for his bag, a few seeds of a crop he lacks, an elder's blessing —
 *   never money (_shareFruitWords.ts).
 * - **Children** (playing, flying kites, kicking the sey, in the village street):
 *   **E "ឲ្យផ្លែស្វាយក្មេងៗ / Give the children a mango"**: the nearest child runs
 *   up, takes it with both hands, a happy "អរគុណបង!" and a jump, then runs back
 *   to the others with it. A group: one each, one more for each E while his
 *   basket has fruit.
 * - **Once a person a day** (the map's day, from dawn): someone he gave to today
 *   says so kindly ("ខ្ញុំមានហើយ អរគុណ!") and takes no more.
 * - **Friends**: progress.ts `share.given` (all) and `share.<village>` (east,
 *   floating, back, kulen, other); the people of a place he has given to often
 *   greet him back by his name more often (share.ts `SHARE_FRIENDS`).
 *
 * The people's side: people/_shareBack.ts (they turn, reach, take, thank, give
 * back; a child runs up and back), cued by share.ts `SHARE`. URL (checks):
 * `share=near|give|take|thanks|back|child|again`, `sharekind=<kind>`,
 * `sharewho=kid|elder|gran|<look kind>`, `shareback=snack|seeds|bless|none`;
 * `basket=<kind>:<n>` (the garden's) gives him fruit.
 */

/** Grown-ups this near (m, at his roaming size 1.4) and this far round from his facing (radians) are offered. */
const REACH = 2.5;
const CONE = 0.85;
/** Children: this near in front, or this near any way round. */
const KIDS_FAR = 10;
const KIDS_CONE = 1.25;
const KIDS_NEAR = 3.2;
/** E again on someone who has one already: their words once in this long (s). */
const AGAIN_EVERY = 2;

let env: AddonEnv | null = null;
let session: ShareSession | null = null;
/** Who was offered (a copy of the finder's answer), and since when (s: the `,` / `.` keys are ours only while our prompt shows). */
const cand: ShareWho = { id: -1, x: 0, y: 0, z: 0, yaw: 0, d: 0, kind: '', elder: false, kid: false, gran: false, seated: false, scale: 1 };
const found: ShareWho = { ...cand };
let candToday = false;
let offeredAt = -1e9;
let againAt = -1e9;
/** Whom he gave to, and on which day of the map (the crowd index → the day). */
const given = new Map<number, number>();
/** A check's own: the fruit, whom, what comes back. */
let onlyWho: string | null = null;
let forceBack: ShareBack | null = null;
/** The prompt made last (kept while the same: no new string a step). */
let promptKey = '';
/** (checks) how often the E row asked. */
let asked = 0;
let promptText = '';

/** The map's day (from dawn: the clock passes 0.75 at dawn). */
const today = (): number => Math.floor(TIME.days() + 0.25);
const givenToday = (id: number): boolean => given.get(id) === today();
/** Whom a check names (`sharewho=`): kid, elder, gran, or a look kind. */
const wanted = (w: ShareWho): boolean => {
  if (!onlyWho) return true;
  if (onlyWho === 'kid') return w.kid;
  if (onlyWho === 'elder') return w.elder;
  if (onlyWho === 'gran') return w.gran;
  return w.kind === onlyWho;
};
const skipKid = (id: number): boolean => givenToday(id);

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const VILLAGES: readonly ShareVillage[] = ['east', 'floating', 'back', 'kulen', 'other'];

/** Friends: the share of greetings that say his name, by how much he has given in that place (0.35 ‥ 0.8). */
SHARE_FRIENDS.nameChance = (x, z) => {
  const n = progress.get(`share.${villageAt(x, z)}`, 0, isNum);
  return 0.35 + 0.45 * Math.min(1, n / 12);
};

/** Someone to give to before him now (in `found`), or null. */
function lookFor(ctx: RoamCtx): ShareWho | null {
  const p = ctx.body.pos;
  const k = ctx.body.scale / 1.4;
  // A grown-up (or a child sitting) right before him.
  let who = findShare(p.x, p.y, p.z, ctx.body.yaw, REACH * k, CONE, false, found);
  if (who && wanted(who)) return who;
  // The children about: the nearest who has none yet, else the nearest (who says so).
  who = findShare(p.x, p.y, p.z, ctx.body.yaw, KIDS_FAR * k, KIDS_CONE, true, found, skipKid) ?? findShare(p.x, p.y, p.z, ctx.body.yaw, KIDS_NEAR * k, Math.PI, true, found, skipKid);
  if (who && wanted(who)) return who;
  who = findShare(p.x, p.y, p.z, ctx.body.yaw, KIDS_NEAR * k, Math.PI, true, found);
  return who && wanted(who) ? who : null;
}

/** The prompt for whom, with the fruit he would give. */
function promptFor(who: ShareWho, kind: PlantKindId): string {
  const word = promptWord(who);
  const key = `${word}|${kind}|${lang()}`;
  if (key !== promptKey) {
    promptKey = key;
    promptText = `E  ${t(word, { item: anItem(kind) })}`;
  }
  return promptText;
}

/** He gives to `who` now (`at`: a check's seconds already in). */
function give(ctx: RoamCtx, who: ShareWho, kind: PlantKindId, at: readonly [ShareStep, number] | null = null): void {
  const e = env!;
  const day = today();
  const total = progress.get('share.given', 0, isNum);
  const plan = planShare(who, day, total, e.purse.kept.length >= CARRY_MAX, forceBack);
  const v = villageAt(who.x, who.z);
  const id = who.id;
  GIVING.by = 'shareFruit';
  GIVING.t = ctx.t;
  session = startShare(e, ctx, who, kind, plan, {
    took() {
      if (!takeGift(kind)) return false;
      given.set(id, day);
      progress.set('share.given', progress.get('share.given', 0, isNum) + 1);
      progress.set(`share.${v}`, progress.get(`share.${v}`, 0, isNum) + 1);
      const left = GARDEN.basket(kind);
      ctx.hud.toast(t(left > 0 ? 'shareGaveLeft' : 'shareGaveLast', { item: itemName(kind), n: num(left) }));
      return true;
    },
    got() {
      if (plan.snack) {
        const kept = snackKept(plan.snack);
        if (e.purse.keep(kept)) {
          bagNotify.update('bag');
          ctx.hud.toast(t('shareGotSnack', { item: kept.name[lang()], n: num(e.purse.kept.length), max: num(CARRY_MAX) }));
        }
      } else if (plan.seeds) {
        GARDEN.addSeeds(plan.seeds, plan.seedN);
        const plant = t(KINDS[plan.seeds].name);
        ctx.hud.toast(t('shareGotSeeds', { plant: lang() === 'en' ? plant.toLowerCase() : plant, n: num(plan.seedN) }));
      }
    },
  }, at);
}

/** E: give to whom was offered (or, given one today, they say so). */
function useNow(ctx: RoamCtx): void {
  if (!env || session) return;
  const kind = giftKind();
  if (!kind || cand.id < 0) return;
  // Given one today already: they say so kindly and take no more.
  if (candToday || givenToday(cand.id)) {
    if (ctx.t - againAt < AGAIN_EVERY) return;
    againAt = ctx.t;
    SHARE.id = cand.id;
    SHARE.kid = cand.kid;
    SHARE.word = againWord(cand);
    SHARE.x = ctx.body.pos.x;
    SHARE.y = ctx.body.pos.y;
    SHARE.z = ctx.body.pos.z;
    shareCue('again');
    return;
  }
  give(ctx, cand, kind);
}

/**
 * A check's moment (`share=`). A headless shot steps roaming before the people are out (roam.ts `simulate`): the
 * moment starts in the frames after (`frame`), when they are, and the giving is played there (`shotStep`).
 */
let pending: string | null = null;
let pendingTries = 0;
/** Roaming's context (the same object every step), for the shot's frames. */
let lastCtx: RoamCtx | null = null;
/** The shot's frames after roaming's steps (s): a moment starts this much before it is drawn. */
const SHOT_FRAMES = 0.5;

function startPending(ctx: RoamCtx): void {
  const m = pending!;
  const k = giftKind();
  if (!k) {
    pending = null;
    console.warn('[map] share: no fruit in his basket (add basket=<kind>:<n>)');
    return;
  }
  const who = lookFor(ctx);
  if (!who) {
    if (++pendingTries > 40) {
      pending = null;
      console.warn(`[map] share: nobody to give to by (${ctx.body.pos.x.toFixed(1)}, ${ctx.body.pos.z.toFixed(1)})`);
    }
    return;
  }
  pending = null;
  Object.assign(cand, who);
  console.info(`[map] share: ${m} → ${who.kid ? 'a child' : who.gran ? 'the grandmother' : who.elder ? 'an elder' : who.kind} ${who.d.toFixed(1)} m (${villageAt(who.x, who.z)}), ${itemName(k)} (${GARDEN.basket(k)} in the basket)`);
  if (m === 'near') {
    ctx.hud.prompt(promptFor(who, k));
    return;
  }
  if (m === 'again') {
    given.set(who.id, today());
    candToday = true;
    useNow(ctx);
    return;
  }
  // (the moment drawn: when he holds it out, it is in their hands, their thanks, a child's jump, their gift back)
  const at: [ShareStep, number] | null =
    m === 'give' ? ['hold', 0.85] : m === 'take' ? ['take', 0.2] : m === 'thanks' ? ['thanks', 0.6] : m === 'child' ? ['thanks', 0.45] : m === 'back' ? ['back', 0.5] : null;
  if (!at) return;
  if (env!.shot) at[1] -= SHOT_FRAMES;
  give(ctx, cand, k, at);
}

/** A shot's frames: the giving goes on as the steps would (the body on the explorer, his pose). */
function shotStep(f: MapFrame): void {
  const ctx = lastCtx;
  if (!ctx || !env) return;
  if (pending) startPending(ctx);
  if (!session || f.dt <= 0) return;
  ctx.hud.prompt(null);
  session.hold(ctx, f.dt);
  const ex = env.explorer;
  ex.object.position.copy(ctx.body.pos);
  ex.object.rotation.set(0, ctx.body.yaw, 0);
  ex.update(f.dt);
  if (session.done) {
    session = null;
    GIVING.by = null;
  }
}

registerAddon({
  id: 'shareFruit',
  order: 50,
  get holding() {
    return !!session;
  },
  get handsBusy() {
    return !!session;
  },
  init(e) {
    env = e;
    // (checks: the giving's state; shots and the dev server only)
    if (import.meta.env.DEV || e.shot)
      Object.assign(window, {
        __share: {
          state: () => ({
            session: !!session,
            phase: SHARE.phase,
            id: SHARE.id,
            kid: SHARE.kid,
            arrived: SHARE.arrived,
            them: [+SHARE.px.toFixed(2), +SHARE.py.toFixed(2), +SHARE.pz.toFixed(2)],
            him: [+e.body.pos.x.toFixed(2), +e.body.pos.y.toFixed(2), +e.body.pos.z.toFixed(2), +e.body.yaw.toFixed(3)],
            offered: cand.id >= 0 ? { id: cand.id, kind: cand.kind, kid: cand.kid, elder: cand.elder, gran: cand.gran, today: candToday } : null,
            fruit: giftKind(),
            given: [...given.entries()],
            total: progress.get('share.given', 0, isNum),
            kept: e.purse.kept.map((k) => k.id),
            busy: e.busy(),
            asked,
          }),
        },
      });
  },
  input(ctx, mode, tap) {
    // `,` / `.`: another fruit (only while our prompt shows: the offering add-on reads the same keys at its own)
    if (mode !== 'walk' || session || ctx.t - offeredAt > 0.3) return false;
    const dir = tap('Comma') ? -1 : tap('Period') ? 1 : 0;
    if (!dir) return false;
    const k = stepGift(dir);
    if (k) ctx.hud.toast(t('shareKindNow', { item: itemName(k), n: num(GARDEN.basket(k)) }));
    return false;
  },
  offer(ctx, mode) {
    asked++;
    if (mode !== 'walk' || session || !env || env.busy() || (GIVING.by && GIVING.by !== 'shareFruit')) return null;
    const kind = giftKind();
    if (!kind) return null;
    const who = lookFor(ctx);
    if (!who || isMonk(who.kind)) return null;
    Object.assign(cand, who);
    candToday = givenToday(who.id);
    offeredAt = ctx.t;
    return promptFor(who, kind);
  },
  use(ctx) {
    useNow(ctx);
  },
  hold(ctx, dt) {
    if (!session) return { prompt: null };
    const r = session.hold(ctx, dt);
    if (session.done) {
      session = null;
      GIVING.by = null;
    }
    return r;
  },
  after(ctx, mode) {
    lastCtx = ctx;
    // (live: as soon as the people are about; a headless shot: in its frames, `frame`)
    if (pending && mode === 'walk' && !session && !env?.shot) startPending(ctx);
  },
  frame(f, mode) {
    if (env?.shot && mode === 'walk' && !env.params.has('video')) shotStep(f);
  },
  setMode(next) {
    if (next === 'walk' || !session) return;
    session.stop();
    session = null;
    GIVING.by = null;
  },
  fromUrl(q) {
    const kind = q.get('sharekind');
    if (kind && kind in KINDS) stepTo(kind as PlantKindId);
    onlyWho = q.get('sharewho');
    const fb = q.get('shareback');
    forceBack = fb === 'snack' || fb === 'seeds' || fb === 'bless' || fb === 'none' ? fb : null;
    const m = q.get('share');
    if (m === 'child') onlyWho ??= 'kid';
    if (m && m !== 'near') {
      pending = m;
      pendingTries = 0;
    }
  },
  report() {
    if (!session) return null;
    return { share: 'thanks', sharekind: giftKind() ?? 'mango' };
  },
});

/** A check's `sharekind=`: step the choice to that kind (when he has it). */
function stepTo(k: PlantKindId): void {
  if (GARDEN.basket(k) <= 0) return;
  for (let i = 0; i < 16 && giftKind() !== k; i++) stepGift(1);
}

/** (the villages' list, for the guide and the checks) */
export const SHARE_VILLAGES = VILLAGES;
