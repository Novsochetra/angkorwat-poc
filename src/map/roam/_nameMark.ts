import { nameIn, onName, playerName } from '../khmerName';
import { lang, onLang, t } from '../ui/lang';

/**
 * His name on his photos: over the maker's mark in the bottom-right corner
 * (src/game/Photos.ts draws the game's name over who made it), a smaller
 * line in the same white with its soft shadow — "ថតដោយ ដារ៉ា" / "Photo by
 * Dara" — the name in Koulen (Khmer) or 'Pixelify Sans' (Latin), sized to
 * the photo as the mark is. Only on photos taken once he has a name.
 */

/** The mark's fonts (Photos.ts), and the name's. */
const LABEL_FONT = (px: number) => `600 ${px}px 'Nunito Sans', 'Kantumruy Pro', system-ui, sans-serif`;
const NAME_FONT = (px: number) => `400 ${px}px Koulen, 'Pixelify Sans', 'Kantumruy Pro', system-ui, sans-serif`;
const NAME_FONT_LATIN = (px: number) => `500 ${px}px 'Pixelify Sans', 'Nunito Sans', system-ui, sans-serif`;

/** The photo `src` with his name over the maker's mark (a copy; `src` itself when he has no name). */
export function signPhoto(src: HTMLCanvasElement): HTMLCanvasElement {
  const n = playerName();
  if (!n) return src;
  const c = Object.assign(document.createElement('canvas'), { width: src.width, height: src.height });
  const g = c.getContext('2d');
  if (!g) return src;
  g.drawImage(src, 0, 0);
  // (the mark's size and corner, Photos.ts `marked`: its title's top is about 66 s up; this line sits over it)
  const s = Math.max(0.6, Math.min(c.width / 1280, c.height / 720));
  const x = c.width - 22 * s;
  const y = c.height - 18 * s - 24 * s - 38 * s;
  const name = nameIn(lang(), n);
  const khmer = name === n.km;
  const [before, after] = t('namePhotoBy', { name: '\u0000' }).split('\u0000');
  g.textAlign = 'right';
  g.textBaseline = 'alphabetic';
  g.fillStyle = 'rgba(255, 255, 255, 0.92)';
  g.shadowColor = 'rgba(0, 0, 0, 0.75)';
  g.shadowBlur = 6 * s;
  g.shadowOffsetY = s;
  // (right to left: what follows the name, the name, what comes before it)
  let at = x;
  if (after) {
    g.font = LABEL_FONT(15 * s);
    g.fillText(after, at, y);
    at -= g.measureText(after).width;
  }
  g.font = khmer ? NAME_FONT(21 * s) : NAME_FONT_LATIN(19 * s);
  g.fillText(name, at, y);
  at -= g.measureText(name).width + 6 * s;
  if (before.trim()) {
    g.font = LABEL_FONT(15 * s);
    g.fillText(before.trim(), at, y);
  }
  return c;
}

/** The name's letters in its fonts, ready before the next photo (a page without them draws the system's). */
function preload(): void {
  const n = playerName();
  if (!n || typeof document === 'undefined' || !document.fonts) return;
  void document.fonts.load(NAME_FONT(30), n.km).catch(() => undefined);
  if (n.latin) void document.fonts.load(NAME_FONT_LATIN(30), n.latin).catch(() => undefined);
  void document.fonts.load(LABEL_FONT(15), t('namePhotoBy', { name: '' })).catch(() => undefined);
}
preload();
onName(preload);
onLang(preload);
