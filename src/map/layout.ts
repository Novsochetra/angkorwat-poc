import type { PlaceId } from './types';

/**
 * Where everything is on the world map (metres; +X east, −Z north, +Y up).
 * The numbers come from the concept art (assets/world-map-selection-screen/):
 * spots of the 1672 × 941 picture were un-projected through the overview
 * camera below at the height each thing stands, so the render keeps the
 * picture's composition. Sizes are real-world: the summit temple is about
 * 120 m wide with a 60 m central tower, cliffs are 10–50 m, trees 8–15 m.
 */

/** Overview camera: south of the map, high up, looking north and down. */
export const OVERVIEW = {
  pos: [0, 110, 170] as [number, number, number],
  target: [0, 20, -80] as [number, number, number],
  /** Vertical field of view (degrees). */
  fov: 55,
};

export interface PlaceDef {
  id: PlaceId;
  name: string;
  subtitle: string;
  /** Two or three sentences for the info panel. */
  blurb: string;
  /** Short facts under the blurb. */
  facts: string[];
  /** Centre of the landmark's flat pad (m); `y` is the pad's ground height. */
  x: number;
  y: number;
  z: number;
  /** Half size of the flat pad the terrain keeps for the landmark (m, x and z). */
  pad: [number, number];
  /**
   * The place's beacon: a glowing lamp on the road in front of the landmark
   * (the road pass builds it here). The pin card is placed from this point.
   */
  anchor: [number, number, number];
  /**
   * Card centre relative to the anchor on screen, in CSS px for a 1280 px
   * wide view (scale with the window width), as in the concept art.
   */
  card: [number, number];
  /** Camera when the place is selected. */
  focus: { pos: [number, number, number]; target: [number, number, number] };
  /** Page to open on "Begin expedition" (none = not built yet: "coming soon"). */
  href?: string;
}

export const PLACES: PlaceDef[] = [
  {
    id: 'sanctuary',
    name: 'Angkor Wat',
    subtitle: 'The Sacred Summit',
    blurb: 'The greatest temple of Angkor crowns the highest mesa: five lotus towers above three galleries, facing the setting sun. Pilgrims have climbed its long stairs for nine hundred years.',
    facts: ['Main expedition', 'Real-scale Angkor Wat'],
    x: 0,
    y: 56,
    z: -205,
    pad: [62, 44],
    anchor: [0, 58, -165],
    card: [4, -161],
    focus: { pos: [70, 150, -30], target: [0, 80, -200] },
    href: './index.html?spawn=2',
  },
  {
    id: 'kulen',
    name: 'Phnom Kulen',
    subtitle: 'The Mountain Temple',
    blurb: 'A lone temple on the holy mountain, above the clouds. The kings of Angkor were crowned here, and the rivers of the highlands begin on its slopes.',
    facts: ['Long climb', 'Above the clouds'],
    x: 370,
    y: 150,
    z: -440,
    pad: [18, 16],
    anchor: [352, 115, -380],
    card: [86, 49],
    focus: { pos: [330, 230, -220], target: [370, 150, -440] },
  },
  {
    id: 'terrace',
    name: 'Ta Prohm',
    subtitle: 'The Lost Gardens',
    blurb: 'Giant silk-cotton and fig trees grow over the towers of Ta Prohm, their roots pouring over the stones. Water runs from terrace to terrace down to the valley.',
    facts: ['Tree temple', 'Waterfalls'],
    x: 200,
    y: 34,
    z: -140,
    pad: [24, 20],
    anchor: [180, 36, -112],
    card: [114, 38],
    focus: { pos: [240, 110, 10], target: [190, 34, -125] },
  },
  {
    id: 'overlook',
    name: 'Bayon',
    subtitle: 'The Stone Faces',
    blurb: 'Calm stone faces smile from every tower of Bayon, high on the western cliffs. From its terrace you can see every temple of the highlands.',
    facts: ['Viewpoint', 'Face towers'],
    x: -300,
    y: 40,
    z: -230,
    pad: [30, 26],
    anchor: [-232, 41, -142],
    card: [77, -42],
    focus: { pos: [-200, 120, -60], target: [-300, 50, -230] },
  },
  {
    id: 'shrine',
    name: 'Preah Khan',
    subtitle: 'The Silent Ruins',
    blurb: 'Once a city of monks and scholars, now the jungle holds its long broken galleries. Roots hold the stones together, and birds nest in the fallen towers.',
    facts: ['Ruins', 'Short walk'],
    x: -88,
    y: 24,
    z: -30,
    pad: [18, 15],
    anchor: [-70, 26, -12],
    card: [108, -114],
    focus: { pos: [-25, 85, 55], target: [-80, 30, -45] },
    href: './index.html?level=kit',
  },
  {
    id: 'rivergate',
    name: 'River Gate',
    subtitle: 'The Eastern Crossing',
    blurb: 'An old stone bridge and its gate towers, where the valley road crosses the river. Every journey into the highlands starts here.',
    facts: ['Start of the road', 'Stone bridge'],
    x: -60,
    y: 8,
    z: 30,
    pad: [34, 22],
    anchor: [-82, 10, 45],
    card: [64, -106],
    focus: { pos: [-10, 55, 120], target: [-60, 10, 30] },
    href: './index.html?spawn=0',
  },
];

export const placeById = (id: PlaceId): PlaceDef => PLACES.find((p) => p.id === id)!;

/**
 * A flat-topped block of land with cliff sides (a mesa): an ellipse whose
 * edge is roughened with noise. `ledges` step the outer ring down, like the
 * layered cliffs of the concept art.
 */
export interface Plateau {
  name: string;
  x: number;
  z: number;
  rx: number;
  rz: number;
  /** Turn of the ellipse (radians). */
  rot?: number;
  /** Top height (m). */
  top: number;
  /** Edge noise, 0 = clean ellipse, 0.3 = very ragged. */
  rough?: number;
  /** Outer rings stepped down: `at` = ellipse radius (0‥1) where the step starts, `drop` in metres. */
  ledges?: { at: number; drop: number }[];
  /** A stepped cone (a mountain) instead of a flat top: terraces this many metres high. */
  cone?: number;
}

export const PLATEAUS: Plateau[] = [
  // The sacred summit: three tiers, the temple on the top one.
  { name: 'summit low tier', x: 0, z: -175, rx: 118, rz: 100, top: 32, rough: 0.12 },
  { name: 'summit mid tier', x: 0, z: -195, rx: 98, rz: 75, top: 44, rough: 0.1 },
  { name: 'summit top', x: 0, z: -205, rx: 80, rz: 55, top: 56, rough: 0.06 },
  // East ledge under the summit's waterfalls.
  { name: 'east ledge', x: 82, z: -30, rx: 34, rz: 32, top: 16, rough: 0.18 },
  // The western cliffs (stone faces).
  { name: 'western cliffs', x: -300, z: -220, rx: 140, rz: 125, top: 40, rough: 0.14, ledges: [{ at: 0.85, drop: 10 }] },
  // The shrine's mesa.
  { name: 'shrine mesa', x: -85, z: -28, rx: 52, rz: 40, top: 24, rough: 0.16 },
  // The eastern hills: stepped garden terraces.
  { name: 'terrace hills', x: 190, z: -120, rx: 100, rz: 100, top: 34, rough: 0.08, ledges: [{ at: 0.6, drop: 4 }, { at: 0.72, drop: 8 }, { at: 0.84, drop: 12 }] },
  // Front right table land.
  { name: 'front east mesa', x: 110, z: 35, rx: 55, rz: 30, top: 16, rough: 0.2 },
  // West lowland hill (left of the road, under the explorer's ledge).
  { name: 'west hill', x: -190, z: 10, rx: 70, rz: 45, top: 14, rough: 0.22 },
  // Holy mountain.
  { name: 'Phnom Kulen', x: 380, z: -460, rx: 190, rz: 170, top: 150, rough: 0.1, cone: 8 },
  // Hills behind the summit (fill the back of the view).
  { name: 'north hills', x: -100, z: -420, rx: 160, rz: 80, top: 36, rough: 0.2 },
  { name: 'north-east hills', x: 150, z: -480, rx: 140, rz: 80, top: 48, rough: 0.2 },
  { name: 'far west hills', x: -480, z: -520, rx: 160, rz: 110, top: 70, rough: 0.18, cone: 8 },
];

/**
 * Rivers, drawn downstream as points on the map (m). The water level follows
 * the land: it only goes down, and where the land drops at a cliff the river
 * falls (see heightfield.ts). `w` is the width in metres.
 */
export interface River {
  name: string;
  w: number;
  points: [number, number][];
}

export const RIVERS: River[] = [
  {
    // A spring on the summit's mid tier, east of the temple; down in three
    // falls, across the valley, under the River Gate bridge and off the front.
    name: 'Summit river',
    w: 10,
    points: [
      [70, -238],
      [73, -200],
      [78, -145],
      [72, -84],
      [76, -40],
      [76, -12],
      [66, 2],
      [40, 14],
      [13, 20],
      [-25, 30],
      [-49, 38],
      [-40, 52],
      [-24, 62],
      [-18, 90],
      [-14, 118],
    ],
  },
  {
    // A spring on the mid tier west of the temple; off the summit's west
    // side into the gorge by the western cliffs.
    name: 'West fall',
    w: 7,
    points: [
      [-72, -232],
      [-70, -190],
      [-84, -150],
      [-99, -125],
      [-112, -100],
      [-125, -70],
      [-140, -30],
      [-150, 10],
      [-120, 40],
      [-80, 50],
      [-49, 45],
    ],
  },
  {
    // From the garden terraces.
    name: 'Terrace stream',
    w: 6,
    points: [
      [175, -95],
      [150, -70],
      [134, -47],
      [120, -35],
      [118, -5],
      [100, 12],
      [70, 8],
    ],
  },
];

/**
 * The glowing road between the places, as points on the map (m); heights
 * come from the land. Stairs are built where it climbs a cliff, bridges
 * where it crosses water.
 */
export const PATHS: { name: string; points: [number, number][] }[] = [
  {
    name: 'valley road',
    points: [
      [-100, 72],
      [-82, 45],
      [-39, 16],
      [-30, 5],
      [-10, -10],
      [5, -40],
      [8, -75],
      [6, -100],
      [5, -122],
      [3, -140],
      [2, -152],
      [0, -167],
    ],
  },
  {
    name: 'shrine and cliffs road',
    points: [
      [-10, -10],
      [-40, -15],
      [-70, -14],
      [-100, -35],
      [-125, -55],
      [-150, -80],
      [-190, -104],
      [-230, -140],
      [-280, -190],
      [-300, -208],
    ],
  },
  {
    name: 'garden and mountain road',
    points: [
      [55, -205],
      [90, -190],
      [110, -170],
      [150, -150],
      [180, -112],
      [230, -160],
      [280, -230],
      [320, -300],
      [352, -380],
      [370, -424],
    ],
  },
];

/** Where the explorer stands in the foreground: a rock ledge near the camera, bottom left. */
export const EXPLORER_SPOT = {
  /** Screen point of the feet (0‥1 from the top-left) and distance from the camera (m). */
  screen: [0.105, 0.86] as [number, number],
  distance: 9,
  /** Facing: towards this map point. */
  facing: [0, 56, -205] as [number, number, number],
};

/** Edges of the built land (m); beyond it: sea of mist and far silhouettes. */
export const MAP_BOUNDS = { x0: -600, x1: 600, z0: -660, z1: 120 };
