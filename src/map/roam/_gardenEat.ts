import { KINDS, type PlantKindId } from '../garden/kinds';
import { GARDEN } from '../garden/state';
import type { Lang } from '../types';
import { t } from '../ui/lang';
import { gardenSay } from './_gardenToasts';
import { registerAddon, type AddonEnv } from './_addons';
import { EAT_ID } from './_gardenShopArt';
import { bagNotify } from './_shopBag';
import { CARRY_MAX, type Kept } from './_shopPurse';

/**
 * Eating his harvest (add-on `gardenEat`): when he picks a fruit he can eat
 * as it is (garden/kinds.ts `fruit.eat`: sugarcane, bananas, papaya, guava,
 * mango, jackfruit, durian, coconut, sugar palm fruit; not the eggplant, the
 * corn or the pumpkin, which want cooking), one of it goes from his basket
 * into his bag to eat later — if his bag has room (_shopPurse.ts
 * `CARRY_MAX`) and he does not carry one of that kind already — and a toast
 * says so after the picking's own, in the garden's line of toasts
 * (_gardenToasts.ts `gardenSay`: "Kept to eat later: mango (6)"). Not in a
 * check that holds him at a piece of work (`gardenact=`).
 *
 * In his bag it is a thing like the stalls' (`Kept`: the kind's way of being
 * eaten and its colours, from kinds.ts; its picture, _gardenShopArt.ts):
 * the tool bar's slot 6 (the key 6) or "In my bag" eats it, with the right
 * thing in his hands (roam/_shop.ts, character/meals.ts, parts/food.ts).
 *
 * URL (checks): none of its own: `kept=garden-mango,…` (_shopPurse.ts) puts
 * them in his bag (the shop finds them by `keptOf` only for registered
 * shops, so a check uses `gardeneat=<kind>,…` here instead).
 */

/** What he keeps of each kind, by name in both languages (his bag shows it in the language in use). */
const EAT_NAME: Partial<Record<PlantKindId, Record<Lang, string>>> = {
  sugarcane: { km: 'អំពៅចិត', en: 'Sugarcane pieces' },
  banana: { km: 'ចេកទុំ', en: 'Ripe banana' },
  papaya: { km: 'ល្ហុងទុំ', en: 'Ripe papaya' },
  guava: { km: 'ត្របែក', en: 'Guava' },
  mango: { km: 'ស្វាយទុំ', en: 'Ripe mango' },
  jackfruit: { km: 'ខ្នុរ', en: 'Jackfruit' },
  durian: { km: 'ធូរេន', en: 'Durian' },
  coconut: { km: 'ដូង', en: 'Coconut' },
  sugarPalm: { km: 'ផ្លែត្នោត', en: 'Palm fruit' },
};

let env: AddonEnv | null = null;

/** One of a kind as it goes in his bag. */
export function keptFruit(k: PlantKindId): Kept | null {
  const eat = KINDS[k].fruit.eat;
  const name = EAT_NAME[k];
  if (!eat || !name) return null;
  return { shop: 'garden', id: EAT_ID(k), name, consume: eat.consume, colors: [...eat.colors] };
}

/** Keep one of what he picked to eat later (room in his bag, none of it carried yet): true when kept. */
function keepOne(k: PlantKindId): boolean {
  const e = env;
  const kept = keptFruit(k);
  // (not while a check holds him at a piece of work: `gardenact=` in shots picks to show the pose, not to fill his bag)
  if (!e || !kept || GARDEN.basket(k) <= 0 || e.params.has('gardenact')) return false;
  if (e.purse.kept.length >= CARRY_MAX || e.purse.kept.some((x) => x.id === kept.id)) return false;
  if (!e.purse.keep(kept)) return false;
  GARDEN.takeFromBasket(k, 1);
  bagNotify.update('bag');
  return true;
}

GARDEN.on((ev) => {
  // (a harvest of one — a banana bunch, a jackfruit, a durian — goes to the basket whole: one to eat only from two up)
  if (ev.type !== 'picked' || ev.n < 2) return;
  const k = ev.plant.kind;
  if (!keepOne(k)) return;
  // (in the garden's own line of toasts: after the picking's, never over it)
  gardenSay(t('gardenEatKept', { item: t(KINDS[k].fruit.item) }));
});

registerAddon({
  id: 'gardenEat',
  init(e) {
    env = e;
  },
  fromUrl(q) {
    const v = q.get('gardeneat');
    if (!v || !env) return;
    for (const k of v.split(',')) {
      const kept = k in KINDS ? keptFruit(k as PlantKindId) : null;
      if (kept && env.purse.kept.length < CARRY_MAX) env.purse.keep(kept);
    }
    bagNotify.update('bag');
  },
});
