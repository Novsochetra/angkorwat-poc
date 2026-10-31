// The village-life promo (about 1.5 min): what came to the world map from
// 7 October 2026 — his home garden, the shoulder pole, building at home, his
// own cattle and riding the white cattle, his own bicycle, sharing his fruit
// and offering it to the monks — recorded with scripts/video.mjs:
//
//   VIDEO_CUT=scripts/promo-village-cut.mjs npm run video -- jobs=2   → screenshots/promo-village.mp4
//   VIDEO_CUT=scripts/promo-village-cut.mjs npm run video -- preview  (3 stills a shot)
//
// The shots change on the music's bars (96 BPM: a bar is 2.5 s), each cut's
// middle on a bar line. Places: src/map/layout.ts, his house and yard
// (≈ 424, −112) in the sugar-palm village (m; +X east, −Z north, +Y up).

/** Smooth start and stop (0‥1). */
const ease = (u) => u * u * (3 - 2 * u);
const mix = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
/** A straight camera move from `a` to `b` ([x, y, z, tx, ty, tz, fov?]), eased or not. */
const move = (a, b, eased = true) => (u) => mix(a, b, eased ? ease(u) : u);
/** Round a centre `c`: radius, height over it, from angle a0 to a1 (degrees; 0 = south of it, 90 = east), looking at c + look. */
const orbit = (c, r, h, a0, a1, look = [0, 0, 0], fov = 40) => (u) => {
  const a = ((a0 + (a1 - a0) * ease(u)) * Math.PI) / 180;
  return [c[0] + r * Math.sin(a), c[1] + h, c[2] + r * Math.cos(a), c[0] + look[0], c[1] + look[1], c[2] + look[2], fov];
};

const BAR = 2.5;
/** Cross-fade (s) between the shots of a section, and between sections. */
const CUT = 0.3;
const FADE = 0.9;

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
#video-overlay .temple { width: 116px; height: 116px; filter: drop-shadow(0 4px 18px rgba(255, 190, 90, 0.45)); }
#video-overlay .km { font-family: Koulen, 'Kantumruy Pro', serif; font-size: 128px; line-height: 1.25; color: #ffd98a;
  text-shadow: 0 0 34px rgba(255, 170, 60, 0.55), 0 4px 0 rgba(60, 30, 0, 0.6); }
#video-overlay .en { font-family: 'Nunito Sans', sans-serif; font-weight: 800; font-size: 44px; letter-spacing: 0.32em;
  color: #fff4dc; text-transform: uppercase; text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6); margin-top: -14px; }
#video-overlay .sub { font-family: 'Kantumruy Pro', sans-serif; font-weight: 600; font-size: 30px; color: #fff4dc;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7); margin-top: 6px; letter-spacing: 0.04em; }
#video-overlay .play { margin-top: 24px; font-family: 'Kantumruy Pro', sans-serif; font-weight: 600; font-size: 34px;
  color: #1b1206; background: linear-gradient(#ffe29a, #f0b24a); padding: 10px 34px; border-radius: 999px;
  box-shadow: 0 6px 24px rgba(255, 180, 60, 0.4); }
`;

// ── The shots, a section at a time ──────────────────────────────────────────
// `bars`: how long it holds between the middles of its cuts (a bar is 2.5 s);
// `into`: its transition in (`CUT` within a section, a longer fade into one).
// Video seconds come from these below (`timed`).
/** Clear air: the valley's morning mist and the haze thinned (the far trees in it read as ghosts close up). */
const AIR = 'fogamount=0.35';
const HOME = `home=1&name=Dara&${AIR}`;
/** His garden as the shots after the planting have it (lineup rows before the house, nearest first). */
const GARDEN = 'garden=demo';
/** The yard all built (one of each piece round the house: the build add-on's `build=all`). */
const YARD = 'build=all';

const SHOTS = [
  // ── Morning: the village under Phnom Kulen, then his house ──
  {
    name: 'open',
    bars: 2,
    query: `clock=0.9&fogamount=0.3&${HOME}&${GARDEN}&${YARD}&cattle=calf,young,grown,8&people=eastvillage,home,bikeshop,cattle`,
    // (high over the village, the mountain and its falls ahead; down over his roof to the yard and the garden before it)
    cam: move([424, 44, -52, 424, 30, -260, 45], [437, 23, -97, 424, 9, -124, 48]),
    overlay: {
      html: `<div class="km">ជីវិតនៅភូមិ</div><div class="en">Village Life</div><div class="sub">ថ្មីក្នុង មរតកអង្គរ · New in Angkor Heritage</div>`,
      css: TITLE_CSS,
      show: (u) => Math.min(ease(Math.min(1, Math.max(0, (u - 0.12) / 0.25))), ease(Math.min(1, Math.max(0, (0.97 - u) / 0.15)))),
    },
  },
  {
    // From inside his room: he opens the doors onto the veranda, the garden and the mountain in the morning sun.
    name: 'doors',
    bars: 2,
    into: { type: 'fade', seconds: FADE },
    query: `clock=0.9&${HOME}&homedoor=closed&roam=walk&at=424,13,-107.6&yaw=180&${GARDEN}&${YARD}`,
    input: [[0.45, 'press', 'KeyE'], [2.1, 'down', 'KeyW'], [3.6, 'up', 'KeyW']],
    cam: move([424.7, 14.75, -104.25, 423.8, 13.9, -114, 56], [424.5, 14.6, -105.4, 423.8, 13.8, -114, 52]),
    caption: { km: 'ផ្ទះរបស់ខ្ញុំ', en: 'A home of your own' },
  },
  // ── His garden ──
  {
    name: 'plant',
    bars: 2,
    into: { type: 'fade', seconds: FADE },
    query: `clock=0.88&${HOME}&garden=banana:3,papaya:2,eggplant:2,pumpkin:3&roam=walk&at=420.5,-117.2&yaw=200&gardenring=corn`,
    input: [[0.4, 'press', 'KeyE']],
    // (side on, low: the hoe, the earth thrown, the seed patted in)
    cam: move([424.6, 11.9, -115.6, 420.4, 10.5, -117.8, 40], [424.0, 11.6, -116.4, 420.4, 10.5, -117.8, 38]),
    caption: { km: 'ដាំសួនច្បារ', en: 'Plant your own garden' },
  },
  {
    // A time-lapse: the beds and young trees grow while the sun crosses the sky.
    name: 'grow',
    bars: 2,
    speed: 6,
    query: `${HOME}&garden=corn:0,eggplant:0,pumpkin:0,corn:0,eggplant:0,sugarcane:1,banana:1,papaya:1,guava:1,mango:1,coconut:1&explorer=0`,
    clock: (u) => (0.9 + 0.3 * u) % 1,
    setup: () => {
      window.__growDone = 0;
    },
    each: (u) => {
      // (days grown so far: slow while the crops come up, faster for the trees)
      const want = 2.2 * u + 16 * u ** 3;
      const d = want - window.__growDone;
      if (d > 0) window.__garden?.advance(d, 0.25, 1);
      window.__growDone = want;
    },
    cam: move([423.2, 13.0, -113.4, 420.5, 9.5, -127, 46], [419.4, 13.4, -113.6, 423, 9.5, -127, 46]),
    caption: { km: 'មើលវាដុះលូតលាស់', en: 'Watch it grow' },
  },
  {
    // The shoulder pole, two buckets full, along the path to his jar.
    name: 'carry',
    bars: 2,
    query: `clock=0.9&${HOME}&${GARDEN}&roam=walk&at=431,-116.4&yaw=270&carry=full`,
    input: [[0, 'down', 'KeyW'], [4.6, 'up', 'KeyW']],
    // (the follow camera held ahead of him on his right, out over the beds, his house's front behind him: a tracking shot)
    each: (u) => {
      const c = window.roam.cam;
      c.follow = 0;
      c.yaw = window.roam.body.yaw + 2.25 - 0.35 * u;
      c.pitch = 0.16;
      c.distance = 5.4 - 0.6 * u;
    },
    caption: { km: 'រែកទឹកស្រោចដំណាំ', en: 'Carry water with the shoulder pole' },
  },
  {
    // Picking his mangoes with the bamboo pole.
    name: 'pick',
    bars: 2,
    query: `clock=0.93&${HOME}&garden=mango:4:ripe@424/-129.5/0/0.4,banana:4:ripe@419.5/-126,papaya:4:ripe@428.5/-126.5,sugarcane:4@427/-121.5,eggplant:4:ripe@421/-121.5&roam=walk&at=424,-126.6&yaw=180`,
    input: [[0.3, 'press', 'KeyE']],
    // (low, looking up into the crown against the sky)
    cam: move([428.2, 10.9, -122.6, 424, 13.2, -129.2, 46], [427.4, 10.8, -123.4, 424, 13.4, -129.4, 44]),
    caption: { km: 'ប្រមូលផល', en: 'Harvest your fruit' },
  },
  // ── Building at home ──
  {
    name: 'build',
    bars: 3,
    speed: 2.6,
    into: { type: 'pixelize', seconds: FADE },
    query: `clock=0.96&${HOME}&${GARDEN}&roam=walk&at=430,-134&yaw=180&purse=200000&buildghost=shelter`,
    input: [[0.35, 'press', 'KeyE']],
    // (three-quarters on, wide enough for the whole shelter as it rises)
    cam: move([437.8, 14.1, -130.2, 430, 9.9, -138.3, 46], [436.2, 13.5, -131.6, 430, 10.1, -138.3, 46]),
    caption: { km: 'សាងសង់ដោយខ្លួនឯង', en: 'Build your homestead' },
  },
  {
    // The yard built, at dusk: the lanterns and the spirit house's candle come on.
    name: 'yard',
    bars: 2,
    query: `${HOME}&${GARDEN}&${YARD}&cattle=calf,young,grown,8&explorer=0`,
    clock: (u) => 0.135 + 0.03 * u,
    cam: orbit([428, 10, -132], 21, 9, 160, 200, [0, 1.5, 0], 44),
  },
  // ── His cattle ──
  {
    name: 'cattle',
    bars: 2,
    into: { type: 'fade', seconds: FADE },
    // (by the first stake's hungry cow, E: he fetches his straw and lays it before her; `cattlefeed=` would hold a pose)
    query: `clock=0.9&${HOME}&cattle=young:hungry,grown,calf&cattlestraw=6&roam=walk&at=421,-131.4&yaw=180`,
    input: [[0.4, 'press', 'KeyE']],
    cam: move([425.8, 10.6, -130.4, 421, 9.1, -133.8, 42], [425.2, 10.3, -131.4, 421, 9.1, -133.8, 40]),
    caption: { km: 'ចិញ្ចឹមគោ', en: 'Raise your own cattle' },
  },
  {
    // Riding the white cow across the meadow in the late sun.
    name: 'ride',
    bars: 3,
    query: `clock=0.165&${AIR}&roam=walk&at=464,-93&yaw=200&cow=ride&rcam=100,10,7`,
    input: [[0, 'down', 'KeyW']],
    caption: { km: 'ជិះគោ', en: 'Ride the white cattle' },
  },
  // ── His bicycle ──
  {
    name: 'bikeshop',
    bars: 2,
    into: { type: 'smoothleft', seconds: 0.7 },
    // (he buys a bicycle at the morning market's stall: the mechanic wheels it out to him)
    query: `clock=0.86&${AIR}&people=market,bikeshop&roam=walk&bikeshop=1&bikeshopbuy=town&bikeshopopen=all&purse=200000`,
    cam: move([345.6, 11.6, -76.2, 340.8, 10.1, -68.8, 44], [344.4, 11.2, -74.6, 340.8, 10.0, -68.8, 42]),
    caption: { km: 'កង់ផ្ទាល់ខ្លួន', en: 'Your own bicycle' },
  },
  {
    name: 'bike',
    bars: 2,
    // (down the village street, the houses passing behind him; F rings the bell)
    query: `clock=0.87&${AIR}&people=eastvillage&roam=walk&at=398,-66.6&yaw=270&bike=ride&bikeown=town:red`,
    input: [[0, 'down', 'KeyW'], [1.9, 'press', 'KeyF']],
    each: (u) => {
      const c = window.roam.cam;
      c.follow = 0;
      c.yaw = window.roam.body.yaw - 2.15 + 0.3 * u;
      c.pitch = 0.12;
      c.distance = 5.6;
    },
  },
  // ── Giving ──
  {
    name: 'share',
    bars: 2,
    into: { type: 'fade', seconds: FADE },
    // (by the village's children, E: the nearest runs up, takes the mango in both hands and jumps for joy)
    query: `${AIR}&roam=walk&at=415,-71.5&yaw=0&people=eastvillage&clock=0.98&basket=mango:4&sharewho=kid&share=near&sim=_:1`,
    input: [[0.4, 'press', 'KeyE']],
    cam: move([420.2, 11.7, -68.2, 415, 10.6, -70.2, 42], [419.4, 11.5, -68.9, 415, 10.6, -70.2, 40]),
    caption: { km: 'ចែករំលែក', en: 'Share your harvest' },
  },
  {
    name: 'dakbat',
    bars: 2,
    // (the monk already before him: he lays the mango in the bowl, the monk blesses him; in profile from the west)
    query: `${AIR}&roam=walk&at=381,-68.9&yaw=0&clock=0.78&offer=dakbat:give:0.1&basket=mango:3`,
    cam: move([376.4, 11.3, -67.0, 381.1, 10.5, -68.0, 40], [377.0, 11.1, -67.4, 381.1, 10.5, -68.0, 38]),
    caption: { km: 'ប្រគេនចង្ហាន់ព្រះសង្ឃ', en: 'Offer fruit to the monks' },
  },
  {
    // The bodhi sapling the head monk gave him, planted at the village pagoda: the monk chants and sprinkles water.
    name: 'bodhi',
    bars: 2,
    query: `${AIR}&roam=walk&at=-325,88&clock=0.9&bodhi=plant:3.2`,
    caption: { km: 'ដាំដើមពោធិ៍នៅវត្ត', en: 'Plant a bodhi tree at the pagoda' },
  },
  // ── Evening: his kite, his hammock ──
  {
    name: 'kite',
    bars: 2,
    into: { type: 'fade', seconds: FADE },
    query: `clock=0.165&${AIR}&roam=walk&at=430,-152&yaw=20&kite=fly:24&rcam=165,-4,6.5`,
  },
  {
    name: 'hammock',
    bars: 2,
    query: `clock=0.2&${HOME}&${GARDEN}&${YARD}&roam=walk&at=424,-108&hammock=1&dog=lie&sim=_:1.5`,
    caption: { km: 'សម្រាកនៅផ្ទះ', en: 'Rest at home' },
  },
  // ── Night: home, and the title ──
  {
    name: 'night',
    bars: 2,
    into: { type: 'fadeblack', seconds: 1.2 },
    query: `clock=0.46&${HOME}&${GARDEN}&${YARD}&cattle=calf,young,grown,8&cattlenight=1&explorer=0`,
    cam: move([412, 19, -127, 423, 13.5, -108, 50], [414, 17.5, -124, 423.5, 13.5, -108, 50]),
  },
  {
    name: 'title',
    bars: 3,
    into: { type: 'fade', seconds: FADE },
    query: `clock=0.5`,
    cam: move([0, 111.5, 174, 0, 20, -80], [0, 110, 170, 0, 20, -80]),
    overlay: {
      html: `<img class="temple" src="/favicon.svg"><div class="km">មរតកអង្គរ</div><div class="en">Angkor Heritage</div><div class="play">លេងឥឡូវនេះ · Play now</div>`,
      css: TITLE_CSS,
      show: (u) => ease(Math.min(1, Math.max(0, (u - 0.08) / 0.25))),
    },
  },
];

/** Seconds from bars: each cut's middle on a bar line; the first and last shots run to the ends. */
function timed(shots) {
  const into = shots.map((s, i) => (i === 0 ? 0 : (s.into?.seconds ?? CUT)));
  return shots.map((s, i) => {
    const after = i + 1 < shots.length ? into[i + 1] / 2 : 0;
    const { bars, into: tr, ...rest } = s;
    return { ...rest, seconds: s.bars * BAR + into[i] / 2 + after, transition: i ? { type: tr?.type ?? 'fade', seconds: into[i] } : undefined };
  });
}

/** Where each shot's middle-of-cut starts (s), for the music's sections. */
const starts = [];
SHOTS.reduce((t, s) => (starts.push(t), t + s.bars * BAR), 0);
const at = (name) => starts[SHOTS.findIndex((s) => s.name === name)];
const END = starts.at(-1) + SHOTS.at(-1).bars * BAR;

export default {
  name: 'promo-village',
  graphics: 'high',
  fps: 24,
  fade: CUT,
  fadeIn: 0.8,
  fadeOut: 1.2,
  preroll: 12,
  captionCss: CAPTION_CSS,
  shots: timed(SHOTS),
  // Sound: the score (src/map/video/score.ts) and each shot's own sounds.
  volumes: { master: 1, music: 0, ambience: 0.55, water: 0.45, animals: 0.6, steps: 0.7, moves: 0.85, ui: 0 },
  musicLevel: 0.85,
  loudness: -15,
  music: {
    bpm: 96,
    sections: [
      { from: 0, to: at('doors'), level: 0, tune: 'call' },
      { from: at('doors'), to: at('build'), level: 1, tune: 'call', swell: true },
      { from: at('build'), to: at('cattle'), level: 2, tune: 'answer', swell: true },
      { from: at('cattle'), to: at('bikeshop'), level: 2, tune: 'rise' },
      { from: at('bikeshop'), to: at('share'), level: 3, tune: 'rise', swell: true },
      { from: at('share'), to: at('kite'), level: 2, tune: 'answer' },
      { from: at('kite'), to: at('night'), level: 1, tune: 'home', swell: true },
      { from: at('night'), to: at('title'), level: 1, tune: 'night', night: true },
      { from: at('title'), to: END, level: 0, night: true },
    ],
    gongs: [at('title') + 0.4],
    endAt: END - BAR,
  },
};
