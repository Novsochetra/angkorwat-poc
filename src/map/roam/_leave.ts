import type { UISound } from '../types';
import { createAskCard, type AskCard } from '../ui/ask';
import { ICON } from '../ui/icons';
import { t } from '../ui/lang';

/**
 * "Back to the map?" — a small card that asks before roaming ends. Esc (or
 * the touch close button, or the "Back to the map" button) no longer drops
 * the player straight back to the picker, where he would have to jump in
 * again: the card asks first. **Enter** (or Y, or its gold button) leaves
 * (Enter on "Keep exploring", reached with Tab, stays); **Esc** again (or N,
 * or "Keep exploring") stays, as a stray second Esc must never leave. While
 * it is open the explorer stands still (roam.ts reads `open`). The card and
 * its keys are ui/ask.ts, with the title card's temple beside the question.
 *
 * Shots: `leave=1` shows it (roaming).
 */
export type LeaveConfirm = AskCard;

export function createLeaveConfirm(root: HTMLElement, h: { onLeave(): void; sound?(s: UISound): void }): LeaveConfirm {
  const card = createAskCard(root, {
    cls: 'rl',
    icon: ICON.temple,
    words: () => ({ title: t('rlTitle'), note: t('rlNote'), stay: t('rlStay'), go: t('rlGo') }),
    onGo: () => h.onLeave(),
    sound: h.sound,
  });
  // (a check: `leave=1` shows the card)
  if (new URLSearchParams(location.search).get('leave') === '1') setTimeout(() => card.ask(), 0);
  return card;
}
