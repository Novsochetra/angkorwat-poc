import { NET } from '../../net/client';
import { nyePhase, squareShown } from '../nye/clock';

/**
 * Whether the corner shows the party button (ui.ts), kept apart from the
 * party module so the map doesn't load it to ask.
 *
 * It shows while the New Year event is on offer, as the join card is
 * (ui/_join.ts `joinOffered`: a live server set and the festival square shown,
 * the night not over), and behind the old test switches: `party=1` or the
 * hidden test link (`event=<code>`) in the address, `partydemo=` in shots, or
 * a party this browser is already in.
 *
 * `openParty` opens the party card from elsewhere (the join card's "Play with
 * friends: a party"); ui.ts sets how (`setPartyOpener`) when the button is made.
 */

/** The party this browser is in (api.ts keeps it under this name). */
export const PARTY_KEY = 'angkor-party';

export function partyKept(): boolean {
  try {
    return localStorage.getItem(PARTY_KEY) !== null;
  } catch {
    return false;
  }
}

/** The New Year event is on offer (the join card's conditions): a live server set, the square shown, the night not over. */
function eventOffered(): boolean {
  if (!NET.available || !squareShown()) return false;
  const p = nyePhase();
  return p !== 'over' && p !== 'gone';
}

export function partyShown(): boolean {
  const q = new URLSearchParams(location.search);
  return q.get('party') === '1' || q.has('event') || q.has('partydemo') || partyKept() || eventOffered();
}

let opener: (() => void) | null = null;

/** ui.ts: how the party card opens (its module loaded first). */
export function setPartyOpener(fn: (() => void) | null): void {
  opener = fn;
}

/** The party card can be opened (the corner has its button). */
export const partyCanOpen = (): boolean => opener !== null;

/** Open the party card (nothing when the corner has no party button). */
export function openParty(): void {
  opener?.();
}
