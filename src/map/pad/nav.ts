/**
 * Moving the focus with the pad (pad.ts): the controls of a menu or panel,
 * the nearest one in a direction (the map screen's cards do the same with
 * the arrow keys: ui.ts `moveFocus`), and the focus ring.
 *
 * The ring: the page draws it for `:focus-visible`, which a browser gives a
 * focus moved by a script only after a key (not after a click, and a pad
 * press is neither). So every `:focus-visible` in the page's styles also
 * matches `.pad-focus` (`watchFocusRules`: the selectors are rewritten in
 * place to `:is(:focus-visible, .pad-focus)`, styles added later too), and
 * the control the pad moved to has that class until the focus leaves it.
 */

const CONTROLS =
  'button, a[href], input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"]), [role="button"], [role="switch"], [role="tab"], [role="radio"], [role="checkbox"], [role="menuitem"], [role="option"], [role="slider"]';

/** The controls in `scope` a pad can reach now: shown, not disabled, not inert or hidden from screen readers. */
export function focusables(scope: HTMLElement): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (const el of scope.querySelectorAll<HTMLElement>(CONTROLS)) {
    if ((el as HTMLButtonElement).disabled || el.closest('[inert], [aria-hidden="true"], [hidden]')) continue;
    if (el.getAttribute('aria-disabled') === 'true') continue;
    // (an SVG `<a>` or a label wrapping an input: its input is the control)
    if (el.tagName === 'LABEL') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
    // (off the window: only if a scrolling box in the scope can bring it in)
    const inView = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
    if (!inView && !scroller(el, scope)) continue;
    out.push(el);
  }
  return out;
}

/** The first control: the one lit as chosen (a pressed chip, the tab shown), else the top-left one. */
export function focusFirst(scope: HTMLElement): HTMLElement | null {
  const all = focusables(scope);
  if (!all.length) return null;
  const chosen = all.find((el) => el.getAttribute('aria-selected') === 'true' || el.getAttribute('aria-current') === 'true');
  if (chosen) return chosen;
  let best = all[0];
  let bestR = best.getBoundingClientRect();
  for (const el of all) {
    const r = el.getBoundingClientRect();
    // (rows first, a few px either way the same row)
    if (r.top < bestR.top - 6 || (Math.abs(r.top - bestR.top) <= 6 && r.left < bestR.left)) {
      best = el;
      bestR = r;
    }
  }
  return best;
}

/**
 * The nearest control from `from` in a direction: the most straight ahead,
 * a sideways step costing twice a forward one (as the map's cards: ui.ts).
 * Null: none that way.
 */
export function moveFocusIn(scope: HTMLElement, from: HTMLElement, dir: 'up' | 'down' | 'left' | 'right'): HTMLElement | null {
  const [dx, dy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[dir];
  const a = from.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestCost = Infinity;
  for (const el of focusables(scope)) {
    if (el === from || el.contains(from) || from.contains(el)) continue;
    const b = el.getBoundingClientRect();
    // (ahead: past the near edge, measured edge to edge along, centre to centre across)
    const along = dx > 0 ? b.left - a.right : dx < 0 ? a.left - b.right : dy > 0 ? b.top - a.bottom : a.top - b.bottom;
    const centreAlong = dx ? (b.left + b.right - a.left - a.right) * 0.5 * dx : (b.top + b.bottom - a.top - a.bottom) * 0.5 * dy;
    if (centreAlong <= 4 || along < -Math.min(a.width, a.height, b.width, b.height) * 0.5) continue;
    // (across: how far out of line; zero where the two overlap)
    const across = dx
      ? Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom))
      : Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right));
    const centreAcross = dx ? Math.abs((b.top + b.bottom - a.top - a.bottom) * 0.5) : Math.abs((b.left + b.right - a.left - a.right) * 0.5);
    const cost = Math.max(0, along) + across * 2.2 + centreAcross * 0.25;
    if (cost < bestCost) {
      bestCost = cost;
      best = el;
    }
  }
  return best;
}

/** The nearest box between `el` and `scope` that scrolls (up and down). */
function scroller(el: HTMLElement, scope: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p && p !== scope.parentElement; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return null;
}

let marked: HTMLElement | null = null;

/** Focus a control from the pad: its ring shows, and a scrolling box it is in brings it into view (only that box: never the page). */
export function markFocus(el: HTMLElement): void {
  if (marked && marked !== el) marked.classList.remove('pad-focus');
  marked = el;
  el.classList.add('pad-focus');
  el.focus({ preventScroll: true, focusVisible: true } as FocusOptions);
  const box = scroller(el, document.body);
  if (box) {
    const r = el.getBoundingClientRect();
    const b = box.getBoundingClientRect();
    const pad = 12;
    if (r.top < b.top + pad) box.scrollTop -= b.top + pad - r.top;
    else if (r.bottom > b.bottom - pad) box.scrollTop += r.bottom - (b.bottom - pad);
  }
}

/** The pad's ring off (the keys or the mouse are in use again). */
export function clearMark(): void {
  marked?.classList.remove('pad-focus');
  marked = null;
}

addEventListener(
  'focusin',
  (e) => {
    if (marked && e.target !== marked) clearMark();
  },
  true,
);
addEventListener(
  'focusout',
  (e) => {
    if (!marked || e.target !== marked) return;
    if ((e as FocusEvent).relatedTarget) return clearMark();
    // (nowhere: the window lost the focus (the element keeps it, and its ring), or a script's blur() (the body has it: no ring))
    const was = marked;
    setTimeout(() => {
      if (marked === was && document.activeElement !== was) clearMark();
    });
  },
  true,
);

// ── The ring's styles ───────────────────────────────────────────────────────

const doneSheets = new WeakSet<CSSStyleSheet>();
let headWatch: MutationObserver | null = null;

function rewrite(rules: CSSRuleList): void {
  for (const r of Array.from(rules)) {
    if (r instanceof CSSStyleRule) {
      const sel = r.selectorText;
      if (sel.includes(':focus-visible') && !sel.includes('pad-focus')) {
        try {
          r.selectorText = sel.replace(/:focus-visible/g, ':is(:focus-visible, .pad-focus)');
        } catch {
          // (a selector this browser will not take back: leave it)
        }
      }
      if (r.cssRules?.length) rewrite(r.cssRules);
    } else if ('cssRules' in r && (r as CSSGroupingRule).cssRules) rewrite((r as CSSGroupingRule).cssRules);
  }
}

function rewriteSheet(sheet: CSSStyleSheet | null): void {
  if (!sheet || doneSheets.has(sheet)) return;
  let rules: CSSRuleList;
  try {
    rules = sheet.cssRules;
  } catch {
    // (another site's sheet, e.g. the fonts: not ours to read)
    doneSheets.add(sheet);
    return;
  }
  doneSheets.add(sheet);
  rewrite(rules);
}

/** Every `:focus-visible` also for `.pad-focus`, in the styles there are now and those added later (pad.ts, when the pad is first used). */
export function watchFocusRules(): void {
  for (const sheet of Array.from(document.styleSheets)) rewriteSheet(sheet);
  if (headWatch) return;
  headWatch = new MutationObserver((records) => {
    for (const r of records) {
      const t = r.target;
      // (a style's text set again, as the dev server does on an edit: a new sheet)
      if (t instanceof HTMLStyleElement) rewriteSheet(t.sheet);
      for (const n of r.addedNodes) {
        if (n instanceof HTMLStyleElement) rewriteSheet(n.sheet);
        else if (n instanceof HTMLLinkElement && n.rel === 'stylesheet') {
          if (n.sheet) rewriteSheet(n.sheet);
          else n.addEventListener('load', () => rewriteSheet(n.sheet), { once: true });
        }
      }
    }
  });
  headWatch.observe(document.head, { childList: true, subtree: true, characterData: true });
  // (styles some parts add to the body)
  headWatch.observe(document.body, { childList: true });
}
