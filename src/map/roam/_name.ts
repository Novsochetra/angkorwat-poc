import { Vector3 } from 'three';
import { SFX } from '../audio/addonSfx';
import '../audio/_name';
import { GREET } from '../greet';
import { nameIn, onName, playerName } from '../khmerName';
import { lang, t } from '../ui/lang';
import { registerAddon, type AddonEnv } from './_addons';
import { closeNameCard, nameCardOpen, openNameCard, pickNameAlt, setNameCardDeps } from './_nameCard';

/**
 * His name in Khmer letters (the roaming add-on): the player gives the
 * explorer a name in the name card (_nameCard.ts: from the explorer menu's
 * "My name", or offered the first time the passport is opened), and it shows:
 *
 * - on the temple passport's first page (_namePassport.ts, _bookUi.ts);
 * - over his head for a moment when he greets (F): a small tag with his name
 *   in Khmer letters (its Latin spelling beside it in English), rising in and fading;
 * - in the people's answers now and then ("សួស្ដី ដារ៉ា!": people/_greetBack.ts);
 * - on his photos, over the maker's mark (_nameMark.ts, roam/photo.ts).
 *
 * While the card is open he keeps still (its keys are its own). The name
 * itself and its spelling: map/khmerName.ts (`playerName`, `onName` for the
 * others: the stilt house's door sign).
 *
 * Shots: `name=<latin>` (or Khmer letters) gives him a name for that page
 * (not kept); `namecard=1` opens the card, `namecard=<text>` with that typed,
 * `namealt=<i>` picks that spelling; `nameoffer=1` lets the passport offer it.
 * A greeting with a name (`sim=f:0.1,_:1`) shows the tag.
 */

/** How long the tag shows after a greeting (s), and its height over his feet (m, at the roaming size 1.4). */
const TAG_TIME = 2.6;
const TAG_UP = 2.85;

let env: AddonEnv | null = null;
let tag: HTMLElement | null = null;
/** Seconds the tag has left, how shown it is (0‥1, eased), the greeting last seen. */
let tagLeft = 0;
let tagShown = 0;
let seen = GREET.n;
const at = new Vector3();

/** The tag over his head (made the first time he greets with a name). */
function makeTag(layer: HTMLElement): HTMLElement {
  const style = document.createElement('style');
  style.textContent = `
    .rh > .nm-tag { position: absolute; left: 0; top: 0; display: flex; align-items: baseline; gap: calc(8 * var(--px)); padding: calc(3 * var(--px)) calc(14 * var(--px)) calc(5 * var(--px));
      pointer-events: none; opacity: 0; visibility: hidden; will-change: transform, opacity; --mu-edge: rgba(255, 208, 112, 0.7); }
    .nm-tag > .mu-bg { background: var(--mu-panel-strong); }
    .nm-tag b { font: 400 calc(22 * var(--px)) / 1.45 Koulen, 'Kantumruy Pro', serif; color: var(--mu-gold-hi); letter-spacing: 0; white-space: nowrap;
      text-shadow: 0 calc(1 * var(--px)) 0 rgba(0, 0, 0, 0.4); }
    .nm-tag small { font: 600 calc(12 * var(--px)) / 1.2 var(--mu-display); color: var(--mu-sand); letter-spacing: 0.04em; white-space: nowrap; }
    .nm-tag small:empty { display: none; }
    .nm-tag::after { content: ''; position: absolute; left: 50%; bottom: calc(-6 * var(--px)); width: calc(10 * var(--px)); height: calc(6 * var(--px));
      transform: translateX(-50%); background: rgba(255, 208, 112, 0.7); clip-path: polygon(0 0, 100% 0, 50% 100%); }`;
  document.head.append(style);
  const el = document.createElement('div');
  el.className = 'nm-tag mu-frame mu-xs';
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<span class="mu-bg"></span><b lang="km"></b><small></small>';
  layer.append(el);
  return el;
}

/** The tag's words: the name in Khmer letters; in English its Latin spelling under it. */
function fillTag(): void {
  const n = playerName();
  if (!tag || !n) return;
  tag.querySelector('b')!.textContent = n.km;
  tag.querySelector('small')!.textContent = lang() === 'en' && n.latin ? n.latin : '';
}

registerAddon({
  id: 'name',
  init(e) {
    env = e;
    setNameCardDeps({
      sound: e.uiSound,
      onSaved(km) {
        if (km) {
          SFX.play('nameSaved');
          e.hud.toast(t('nameSaved', { name: nameIn(lang()) }));
        } else {
          e.uiSound('back');
          e.hud.toast(t('nameCleared'));
        }
      },
    });
    onName(fillTag);
  },

  input(ctx) {
    if (!nameCardOpen()) return false;
    // (the card has the keys; the touch ✕ shuts it, it does not leave the walk)
    if (ctx.input.exit) closeNameCard();
    ctx.input.exit = false;
    return true;
  },

  after(_ctx, mode, dt) {
    // A greeting (F, or the menu's Greet and Wave: greet.ts): his name tag over him a moment.
    if (GREET.n !== seen) {
      seen = GREET.n;
      if (mode === 'walk' && playerName() && env) {
        tag ??= makeTag(env.layer);
        fillTag();
        tagLeft = TAG_TIME;
      }
    }
    if (tagLeft > 0) tagLeft = Math.max(0, tagLeft - dt);
  },

  frame(f, mode) {
    if (!tag || (tagLeft <= 0 && tagShown <= 0)) return;
    const e = env!;
    // (gone through the lens, into the album, off his feet: away at once)
    const hide = mode !== 'walk' || e.photo.view > 0.3 || e.photo.albumOpen;
    const want = !hide && tagLeft > 0.3 ? 1 : 0;
    tagShown = hide ? 0 : tagShown + (want - tagShown) * (f.dt > 0 ? Math.min(1, f.dt * 7) : 1);
    if (tagShown < 0.01) {
      tagShown = 0;
      tag.style.visibility = 'hidden';
      return;
    }
    const b = e.body;
    at.set(b.pos.x, b.pos.y + (TAG_UP * b.scale) / 1.4, b.pos.z).project(f.camera);
    if (at.z > 1 || Math.abs(at.x) > 1.1 || Math.abs(at.y) > 1.1) {
      tag.style.visibility = 'hidden';
      return;
    }
    const x = ((at.x + 1) / 2) * innerWidth;
    const y = ((1 - at.y) / 2) * innerHeight;
    // (it rises a little as it comes in)
    const rise = 10 * (1 - tagShown);
    tag.style.visibility = 'visible';
    tag.style.opacity = tagShown.toFixed(3);
    tag.style.transform = `translate(${x.toFixed(1)}px, ${(y + rise).toFixed(1)}px) translate(-50%, -100%)`;
  },

  setMode(next) {
    // (back to the map: the card and the tag go)
    if (next === 'overview') {
      closeNameCard();
      tagLeft = tagShown = 0;
      if (tag) tag.style.visibility = 'hidden';
    }
  },

  fromUrl(q) {
    const card = q.get('namecard');
    if (card !== null && card !== '0') openNameCard(card === '1' ? undefined : card, 'url');
    const alt = Number(q.get('namealt'));
    if (alt > 0) pickNameAlt(alt);
  },

  report() {
    const n = playerName();
    const out: Record<string, string> = {};
    if (n) out.name = n.latin || n.km;
    if (nameCardOpen()) out.namecard = '1';
    return Object.keys(out).length ? out : null;
  },
});
