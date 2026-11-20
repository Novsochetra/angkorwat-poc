/**
 * Whether the corner shows the party button (ui.ts), kept apart from the
 * party module so the map doesn't load it to ask.
 *
 * Until the New Year event opens it to everyone it shows only behind a test
 * switch: `party=1` or the hidden test link (`event=<code>`) in the address,
 * `partydemo=` in shots, or a party this browser is already in.
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

export function partyShown(): boolean {
  const q = new URLSearchParams(location.search);
  return q.get('party') === '1' || q.has('event') || q.has('partydemo') || partyKept();
}
