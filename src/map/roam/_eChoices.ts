import type { RoamCtx, RoamMode } from './types';

/**
 * The E row as a short list (AWP-33): every E choice at his spot, not only the
 * first. On foot (walker.ts) and afloat (boat.ts) the mode gathers them each
 * step in the row's order (a golden figure, the add-ons up to `BEFORE_SHRINE`,
 * a shrine, an open stall, the other add-ons, a moored boat, a glider ramp,
 * the balloon, the swing, a place's beacon: _addons.ts), so the top line is
 * what E did before there was a list.
 *
 * - **One choice** (one line with an "E  …" part): the prompt as before, the
 *   lines with no key after it ("E  Build…  ·  You have no seeds yet…").
 * - **Two or more**: a short list over him (the HUD's prompt, `.is-list`: up
 *   to `ROWS` lines, "▸" the picked one, the lines with no key greyed and never
 *   picked). Tab / Shift+Tab, the pad's R3 (input.ts: while the list is open
 *   it is the list's; the nearest ramp is the big map's R3 then — the d-pad
 *   stays the lights', the greeting's, fishing's), a tap or a click on a line
 *   change the pick; E (□, the touch Use button) does it.
 * - The pick stays while the same choices stay (by who offers them: `id`); it
 *   goes back to the top as soon as the set changes (he walked away, something
 *   came or went).
 * - With no line that has a key, E does what the first line's offer does (a
 *   closed stall's toast, a place not open yet), as before.
 *
 * Two lines with the same words (the build add-on's "Build…" near the house and
 * its late half's; the dog's early and late "Pet the dog") are one. A line with
 * no key is as before, when the first offer won: first in the row it is the
 * row, alone (he is busy: walking to his place to listen; the palm's tapper is
 * up; a stall is closed); after a line with E it is left out (the sey's "Play
 * sey" hides the garden's "You have no seeds yet…"). An offer may carry one in
 * its own line ("E  Build…  ·  You have no seeds yet…": _build.ts).
 *
 * URL (shots and the dev server only): `echoice=<n>` starts the pick on choice
 * n (1 the top) the first time a list shows; `echoices=1` shows the row as the
 * list even with one choice (to look at it) and logs each change of it
 * (`[map] E choices: …`; `echoices=log`: the log only). Checks read
 * `window.__echoices` (the lines, the pick, whether the list is open).
 */

/** One E choice of the row. */
export interface EChoice {
  /** Who offers it (the pick follows it): 'gold', 'addon:<id>', 'shrine', 'stall', 'boat', 'ramp', 'balloon', 'swing', 'place', 'ashore'. */
  readonly id: string;
  /** Its line: "E  Lie in the hammock" (parts joined by "  ·  "); with no "E  …" part, a line with no key (never picked). */
  readonly text: string;
  /** What E does on it: a mode to switch to, or nothing. */
  readonly run: (() => RoamMode | null | void) | null;
}

/** The lines the list shows at most (the pick always among them). */
export const ROWS = 4;

/** The line has an "E  …" part (it can be picked): at its start or after a "  ·  ". */
export const hasE = (text: string): boolean => /(?:^|·\s+)E\s{2,}\S/.test(text);

/**
 * The HUD's prompt text for a list (hud.ts `prompt`): `LIST` first, then a line each, led by its kind — `PICK` the
 * picked one, `CHOICE` another one that can be picked, `NOTE` a line with no key.
 */
export const LIST = '⁣list\n';
export const PICK = '>';
export const CHOICE = '+';
export const NOTE = '-';

/** What the list's input and the HUD share: it is open (2+ choices: Tab, the d-pad's ↑ ↓ are its), and a line tapped. */
export const E_LIST = {
  /** Two or more choices show: Tab and the pad's R3 pick (input.ts; ui/minimap.ts leaves R3 to it then). */
  open: false,
  /** A line tapped or clicked (its index among the choices), for the next step; −1 none. */
  tapped: -1,
  /** The id of the line E would do now (null: none), as of the last step (`picked`). */
  pickId: null as string | null,
};

/** Is the line E would do now this add-on's (its id)? True also when its line is the only one. */
export const ePicked = (addonId: string): boolean => E_LIST.pickId === `addon:${addonId}`;

/** What `ERow.end` gives the mode: the prompt to show (or null), and the choice E does (null: none). */
export interface ERowView {
  readonly text: string | null;
  readonly use: EChoice | null;
}

const urlParams = typeof location === 'undefined' ? new URLSearchParams() : new URLSearchParams(location.search);
const checks = urlParams.get('shot') === '1' || !!import.meta.env.DEV;
/** `echoices=1`: the list even with one choice, and the log; `echoices=log`: the log (checks). */
const SHOW_ALL = checks && urlParams.get('echoices') === '1';
const LOG = SHOW_ALL || (checks && urlParams.get('echoices') === 'log');
/** `echoice=<n>`: the pick starts on choice n (1 the top) the first time a list shows (checks). */
let urlPick = checks ? Math.max(0, Math.round(Number(urlParams.get('echoice'))) - 1) || 0 : 0;

/**
 * The E row of a step: `begin`, `add` each choice in the row's order (`ended`: an add-on in a mode of its own —
 * build mode's "Build here", planting's "Dig here" — took the rest of the row), `end` for the view.
 */
export class ERow {
  private readonly lines: EChoice[] = [];
  /** An add-on in a mode of its own ended the row: nothing after it. */
  ended = false;
  /** The pick (an index among the choices) and the set it was made in (their ids). */
  private pick = 0;
  private set = '';
  private logged = '';

  begin(): this {
    this.lines.length = 0;
    this.ended = false;
    return this;
  }

  /** Lines in the row so far (the dog asks: nothing before it wants the E, _addons.ts `eRowBefore`). */
  get count(): number {
    return this.lines.length;
  }

  add(id: string, text: string | null, run: EChoice['run']): void {
    if (this.ended || !text) return;
    // A line with no key, as before when the first offer won: first in the row, it is the row (he is busy — walking to
    // his place to listen, the tapper up the palm — or it says why not here); after a line with E, it is left out.
    if (!hasE(text)) {
      if (this.lines.length) return;
      this.lines.push({ id, text, run });
      this.ended = true;
      return;
    }
    // (the same words twice: one line)
    for (const l of this.lines) if (l.text === text) return;
    this.lines.push({ id, text, run });
  }

  /** The row is gathered: the pick moved by `input.pick` and a tap, the prompt to show, what E does. */
  end(ctx: RoamCtx): ERowView {
    const lines = this.lines;
    let n = 0;
    let ids = '';
    for (const l of lines)
      if (hasE(l.text)) {
        n++;
        ids += `${l.id}|`;
      }
    if (ids !== this.set) {
      this.set = ids;
      this.pick = 0;
      if (urlPick > 0 && n >= 2) {
        this.pick = Math.min(urlPick, n - 1);
        urlPick = 0;
      }
    }
    if (n >= 2) {
      const d = ctx.input.pick ?? 0;
      if (d) this.pick = (((this.pick + d) % n) + n) % n;
      if (E_LIST.tapped >= 0 && E_LIST.tapped < n) this.pick = E_LIST.tapped;
    } else this.pick = 0;
    E_LIST.tapped = -1;
    E_LIST.open = n >= 2;
    // What E does: the picked choice; with none that has a key, the first line's offer (a closed stall's word).
    let use: EChoice | null = null;
    let k = 0;
    for (const l of lines)
      if (hasE(l.text) && k++ === this.pick) {
        use = l;
        break;
      }
    if (!use && n === 0) use = lines[0] ?? null;
    E_LIST.pickId = use?.id ?? null;
    const text = this.view(n);
    if (checks) this.log(text);
    return { text, use };
  }

  /** Nothing offered (he is busy, in the air): the list is shut. */
  clear(): void {
    this.lines.length = 0;
    this.set = '';
    this.pick = 0;
    E_LIST.open = false;
    E_LIST.tapped = -1;
    E_LIST.pickId = null;
    if (checks) this.log(null);
  }

  private view(n: number): string | null {
    const lines = this.lines;
    if (!lines.length) return null;
    const notes = lines.length - n;
    // One choice (and a line with no key at most), or only lines with no key: the prompt as before.
    if (!SHOW_ALL && ((n === 1 && notes <= 1) || (n === 0 && lines.length === 1))) {
      if (n === 0) return lines[0].text;
      const first = lines.find((l) => hasE(l.text))!;
      const note = lines.find((l) => l !== first);
      return note ? `${first.text}  ·  ${note.text}` : first.text;
    }
    let k = 0;
    let out = LIST;
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].text;
      const kind = hasE(t) ? (k++ === this.pick ? PICK : CHOICE) : NOTE;
      out += `${i ? '\n' : ''}${kind}${t}`;
    }
    return out;
  }

  /** (checks) `window.__echoices` and the log, when the row changes. */
  private log(text: string | null): void {
    const s = `${text ?? ''}|${E_LIST.pickId}`;
    if (s === this.logged) return;
    this.logged = s;
    const lines = this.lines.map((l) => ({ id: l.id, text: l.text, key: hasE(l.text) }));
    if (typeof window !== 'undefined') Object.assign(window, { __echoices: { lines, pick: this.pick, open: E_LIST.open, pickId: E_LIST.pickId, text } });
    if (LOG && lines.length) console.info(`[map] E choices: ${lines.map((l) => `${l.key ? (l.id === E_LIST.pickId ? '▸' : '·') : '–'} ${l.text.replace(/\s+/g, ' ')}`).join(' | ')}`);
  }
}

/** The one E row (only one mode steps at a time: on foot or afloat). */
export const eRow = new ERow();
