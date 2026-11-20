// New Year's Eve at Phnom Kulen (AWP-35, phase 1): a 30-second film of the night, for the owner to watch without a
// GPU of his own. `VIDEO_CUT=scripts/promo-nye-cut.mjs npm run video` → screenshots/promo-nye.mp4 (on a machine with
// no GPU: `VIDEO_SCALE=0.5 VIDEO_GRAPHICS=low`, ≈ 1‥4 s a frame; `-- preview` first).
// Each shot's `query` holds the night's moment (nye/clock.ts: `countdown=<s>` before midnight, `fireworks=<s>` into
// the show), and the night moves on with the video from there (clock.ts `nyeVideoTime`): the board, the overlay, the
// crowd and the show all play. Its sound: the map's night ambience, and each shot's fireworks and crowd at its second
// (`nye: { at }`, scripts/video.mjs) heard from the square.
// Places: src/map/nye/plan.ts (the square round (383, −262), the stage north of it facing south, the gate south).

const ease = (u) => u * u * (3 - 2 * u);
const mix = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
const move = (a, b, eased = true) => (u) => mix(a, b, eased ? ease(u) : u);

const CAPTION_CSS = `
#video-caption { position: fixed; left: 92px; bottom: 84px; display: flex; flex-direction: column; align-items: flex-start;
  gap: 8px; pointer-events: none; opacity: 0; }
#video-caption::before { content: ''; position: absolute; left: -92px; bottom: -84px; width: 980px; height: 300px; z-index: -1;
  background: radial-gradient(ellipse 70% 80% at 18% 100%, rgba(8, 10, 22, 0.55), rgba(8, 10, 22, 0) 70%); }
#video-caption .km { font-family: Koulen, 'Kantumruy Pro', serif; font-size: 66px; line-height: 1.2; color: #ffdf98;
  text-shadow: 0 0 26px rgba(255, 170, 60, 0.35), 0 3px 0 rgba(60, 30, 0, 0.55), 0 4px 18px rgba(0, 0, 0, 0.5); }
#video-caption .rule { width: 132px; height: 3px; border-radius: 2px; margin: -2px 0 2px;
  background: linear-gradient(90deg, #f0b24a, rgba(240, 178, 74, 0)); }
#video-caption .en { font-family: 'Nunito Sans', sans-serif; font-weight: 800; font-size: 25px; letter-spacing: 0.3em;
  text-transform: uppercase; color: #fff4dc; text-shadow: 0 2px 12px rgba(0, 0, 0, 0.65); }
`;

const TITLE_CSS = `
#video-overlay { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; pointer-events: none; opacity: 0; text-align: center;
  background: radial-gradient(ellipse 60% 45% at 50% 50%, rgba(6, 12, 30, 0.55), rgba(6, 12, 30, 0) 70%); }
#video-overlay .km { font-family: Koulen, 'Kantumruy Pro', serif; font-size: 112px; line-height: 1.25; color: #ffd98a;
  text-shadow: 0 0 34px rgba(255, 170, 60, 0.55), 0 4px 0 rgba(60, 30, 0, 0.6); }
#video-overlay .en { font-family: 'Nunito Sans', sans-serif; font-weight: 800; font-size: 40px; letter-spacing: 0.3em;
  color: #fff4dc; text-transform: uppercase; text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6); margin-top: -10px; }
#video-overlay .when { margin-top: 18px; font-family: 'Kantumruy Pro', sans-serif; font-weight: 600; font-size: 30px;
  color: #1b1206; background: linear-gradient(#ffe29a, #f0b24a); padding: 8px 30px; border-radius: 999px; }
`;

/** Show the countdown overlay only (the video hides the interface, `ui=0`): the chip, the numerals, the greeting. */
function overlayOnly() {
  const ui = document.getElementById('ui');
  if (!ui) return;
  ui.style.display = '';
  for (const el of ui.children) if (!el.classList.contains('nye-ov')) el.style.display = 'none';
}

export default {
  name: 'promo-nye',
  graphics: 'medium',
  fps: 24,
  fade: 0.5,
  fadeIn: 0.8,
  fadeOut: 1.4,
  captionCss: CAPTION_CSS,
  shots: [
    {
      // 23:30: up the lantern walk from the village to the Bayon-face gate, the families arriving.
      name: 'arrive',
      seconds: 5,
      query: 'countdown=1800',
      cam: move([404, 13, -200, 386, 14, -240], [388, 11, -226, 384, 15, -262]),
      caption: { km: 'ឆ្នាំថ្មី ២០២៧ · ភ្នំគូលែន', en: "New Year's Eve at Phnom Kulen", at: [0.6, 4.6] },
    },
    {
      // In through the gate: the lotus ring, the crowd, the apsara dancing before the board.
      name: 'square',
      seconds: 5,
      query: 'countdown=1500',
      cam: move([384, 11, -246, 384, 12, -292], [383, 9.6, -264, 383, 13.5, -292]),
      caption: { km: 'មរតកអង្គរ · ការរាប់ថយក្រោយ', en: 'The countdown stage', at: [0.5, 4.6] },
    },
    {
      // The last seconds: the count, midnight, the greeting and the first gold chrysanthemums over the falls.
      name: 'count',
      seconds: 9,
      query: 'countdown=6',
      setup: overlayOnly,
      cam: move([383, 9.6, -257, 383, 13.5, -291], [384, 10.5, -250, 404, 34, -330]),
      nye: { at: -6 },
    },
    {
      // The show in layers over Kulen's flank, the falls lit.
      name: 'show',
      seconds: 5,
      query: 'fireworks=338',
      cam: move([384, 11, -248, 404, 38, -335], [386, 12, -252, 412, 44, -340]),
      nye: { at: 338 },
    },
    {
      // Low over the Kulen stream: the bursts in the water.
      name: 'stream',
      seconds: 4,
      query: 'fireworks=392',
      cam: move([440, 11, -246, 445, 55, -380], [441, 12, -258, 446, 62, -380]),
      nye: { at: 392, ears: [440, 11, -250] },
    },
    {
      // The gold-willow finale, the whole night lit, and the title.
      name: 'finale',
      seconds: 7,
      query: 'fireworks=450',
      cam: move([330, 62, -172, 398, 70, -360], [322, 70, -160, 395, 80, -360]),
      nye: { at: 450, ears: [384, 11, -248] },
      overlay: {
        html: `<div class="km">សួស្តីឆ្នាំថ្មី ២០២៧</div><div class="en">Happy New Year</div><div class="when">មរតកអង្គរ · ភ្នំគូលែន</div>`,
        css: TITLE_CSS,
        show: (u) => ease(Math.min(1, Math.max(0, (u - 0.45) / 0.25))),
      },
    },
  ],
  // The map's night: its ambience (crickets, the falls far off), quiet music; the fireworks and the crowd from each shot.
  audio: {
    seed: 2027,
    fadeIn: 1.0,
    volumes: { master: 1, music: 0.35, ambience: 0.5, water: 0, animals: 0, steps: 0, moves: 0, ui: 0, fireworks: 1 },
    nights: [[0, 1], [1, 1]],
    cues: [],
  },
};
