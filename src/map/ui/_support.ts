import posthog, { isPostHogConfigured } from '../../posthog';
import type { UISound } from '../types';
import { createAskCard, type AskCard } from './ask';
import { SUPPORT_URL } from './credits';
import { ICON } from './icons';
import { t } from './lang';

/**
 * "Support the game": the corner's coffee button asks with this card
 * (ui/ask.ts): a line on why, "Maybe later", and the gold "Buy me a coffee"
 * that opens the support page (credits.ts `SUPPORT_URL`) in a new tab. With
 * a game pad, ✕ on it cannot open the tab (browsers open one only from a
 * click, a tap or a key): the card stays, the gold button in focus, and says
 * to click it or gives the address (ask.ts `padLink`).
 *
 * Shots: `uistate=support` shows it.
 */
export function createSupportCard(root: HTMLElement, h: { sound?(s: UISound): void }): AskCard {
  return createAskCard(root, {
    cls: 'mu-sup',
    icon: ICON.coffee,
    // (padLink: the pad pressed the gold button, which a browser opens only from a click or a tap: ui/ask.ts)
    words: () => ({ title: t('support'), note: t('supportLong'), stay: t('supportLater'), go: t('supportGo'), padLink: t('supportPadLink', { url: SUPPORT_URL.replace(/^https?:\/\//, '') }) }),
    href: SUPPORT_URL,
    goIcon: ICON.coffee,
    onGo: () => {
      h.sound?.('select');
      if (isPostHogConfigured) posthog.capture('support_clicked', { from: 'popup' });
    },
    sound: h.sound,
  });
}
