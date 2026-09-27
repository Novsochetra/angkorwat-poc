// The 15-second promo: the shots scripts/video.mjs records (see there).
// Places and cameras: src/map/layout.ts (m; +X east, −Z north, +Y up).

/** Smooth start and stop (0‥1). */
const ease = (u) => u * u * (3 - 2 * u);
const mix = (a, b, u) => a.map((v, i) => v + (b[i] - v) * u);
/** A straight camera move from `a` to `b` ([x, y, z, tx, ty, tz]), eased or not. */
const move = (a, b, eased = true) => (u) => mix(a, b, eased ? ease(u) : u);
/** Round a centre: radius, height over it, from angle a0 to a1 (degrees; 0 = south of it, 90 = east). */
const orbit = (c, r, h, a0, a1, look = [0, 0, 0]) => (u) => {
  const a = ((a0 + (a1 - a0) * ease(u)) * Math.PI) / 180;
  return [c[0] + r * Math.sin(a), c[1] + h, c[2] + r * Math.cos(a), c[0] + look[0], c[1] + look[1], c[2] + look[2]];
};

// The race's lead pair (festival/_race.ts): at the gun 6 s in, away over 4 s, then about 3.3 m/s east from x = −548.
const RACE_T = 40;
const boatX = (t) => -548 + 0.5 * 3.3 * 4 + 3.3 * (t - 6 - 4);

const TITLE_CSS = `
#video-overlay { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 10px; pointer-events: none; opacity: 0; text-align: center;
  background: radial-gradient(ellipse 60% 45% at 50% 50%, rgba(6, 12, 30, 0.55), rgba(6, 12, 30, 0) 70%); }
#video-overlay .temple { width: 120px; height: 120px; filter: drop-shadow(0 4px 18px rgba(255, 190, 90, 0.45)); }
#video-overlay .km { font-family: Koulen, 'Kantumruy Pro', serif; font-size: 132px; line-height: 1.25; color: #ffd98a;
  text-shadow: 0 0 34px rgba(255, 170, 60, 0.55), 0 4px 0 rgba(60, 30, 0, 0.6); }
#video-overlay .en { font-family: 'Nunito Sans', sans-serif; font-weight: 800; font-size: 46px; letter-spacing: 0.32em;
  color: #fff4dc; text-transform: uppercase; text-shadow: 0 2px 12px rgba(0, 0, 0, 0.6); margin-top: -14px; }
#video-overlay .play { margin-top: 26px; font-family: 'Kantumruy Pro', sans-serif; font-weight: 600; font-size: 34px;
  color: #1b1206; background: linear-gradient(#ffe29a, #f0b24a); padding: 10px 34px; border-radius: 999px;
  box-shadow: 0 6px 24px rgba(255, 180, 60, 0.4); }
`;

export default {
  name: 'promo',
  graphics: 'max',
  /** Cross-fade between shots (s). */
  fade: 0.35,
  shots: [
    {
      // Dawn: low over the river gate, rising towards Angkor Wat.
      name: 'dawn',
      seconds: 2.3,
      query: 'clock=0.82',
      cam: move([-60, 32, 150, -10, 55, -165], [-20, 70, 40, 0, 62, -170]),
    },
    {
      // Angkor Wat, round its towers.
      name: 'temple',
      seconds: 2.3,
      cam: orbit([0, 58, -170], 105, 38, -40, -5, [0, 8, 0]),
    },
    {
      // The explorer on his hang glider over the jungle.
      name: 'glide',
      seconds: 2.2,
      query: 'roam=hang&at=10,105,-70&yaw=10&rcam=170,6,9&easyfly=1',
    },
    {
      // The Water Festival: racing boats (ngo) on the great lake.
      name: 'race',
      seconds: 2.2,
      t0: RACE_T,
      query: 'fest=water',
      cam: (u) => {
        const x = boatX(RACE_T + u * 2.2);
        return [x - 11, 8, 36, x + 5, 5.5, 13];
      },
    },
    {
      // Sunset: the hot air balloon over the jungle.
      name: 'balloon',
      seconds: 2.2,
      query: 'clock=0.22&roam=balloon&at=-70,105,-90&yaw=0&rcam=135,4,24&easyfly=1',
    },
    {
      // Night: gliding to Phnom Kulen under the full moon, slow and calm.
      name: 'nightglide',
      seconds: 3.3,
      query: 'clock=0.5&roam=hang&at=-40,125,20&yaw=150&rcam=0,10,12&easyfly=1',
    },
    {
      // Night: the whole map under the full moon, and the title.
      name: 'title',
      seconds: 2.6,
      query: 'clock=0.5',
      cam: move([0, 111.5, 174, 0, 20, -80], [0, 110, 170, 0, 20, -80]),
      overlay: {
        html: `<img class="temple" src="/favicon.svg"><div class="km">មរតកអង្គរ</div><div class="en">Angkor Heritage</div><div class="play">លេងឥឡូវនេះ · Play now</div>`,
        css: TITLE_CSS,
        show: (u) => ease(Math.min(1, Math.max(0, (u - 0.1) / 0.3))),
      },
    },
  ],
  // The map's own sound: its music and the jungle, the day going to night with the shots.
  audio: {
    seed: 7,
    fadeIn: 1.2,
    volumes: { master: 1, music: 0.9, ambience: 0.55, water: 0, animals: 0, steps: 0, moves: 0, ui: 0.8 },
    nights: [[0, 0], [0.5, 0], [0.6, 0.4], [0.66, 1], [1, 1]],
    // (a gong as the title comes in: the loading screen's "Start")
    cues: [{ at: 12.8, sound: 'begin' }],
  },
};
