import type { Object3D, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import type { HeightField } from './heightfield';
import type { ResolutionChoice } from './resolution';

/**
 * World map screen ("Angkor Heritage", index.html): a small voxel diorama of
 * the Angkor highlands seen from a high ledge, with a pin for every place the
 * player can travel to. Scale: 1 unit = 1 m, like the game. The map is built
 * of 1–2 m blocks (the game uses 0.5 m and smaller), because it is seen from
 * 200–500 m away.
 *
 * Axes: +X east (screen right), −Z north (away from the camera, up the
 * screen), +Y up. The overview camera stands south of the map, high up.
 */

export type PlaceId = 'sanctuary' | 'kulen' | 'terrace' | 'overlook' | 'shrine' | 'rivergate';

export type MapQuality = 'low' | 'medium' | 'high';

/** Everything a part of the map gets when it is built. */
export interface MapContext {
  scene: Scene;
  renderer: WebGLRenderer;
  camera: PerspectiveCamera;
  /** Terrain heights, water and surface kinds (built first, read by every part). */
  field: HeightField;
  quality: MapQuality;
  /** Headless still (`?shot=1`): build, pose at time `t`, render once. */
  shot: boolean;
  /** A shot that then moves frame by frame (`video=1`, scripts/video.mjs): the explorer roams on in it. */
  video?: boolean;
}

/** One frame. */
export interface MapFrame {
  /** Seconds since start (in shots: the `t=` URL value, default 12). */
  t: number;
  /** Seconds since the last frame (0 in shots). */
  dt: number;
  /**
   * Clock for drifting mist and clouds: like `t`, but it stands still while
   * the "reduce motion" setting is on.
   */
  drift: number;
  /** Time of day: 0 = golden-hour afternoon, 1 = moonlit night; blends between. */
  night: number;
  /**
   * Where the day is in its cycle (0‥1, wraps): 0 = golden-hour afternoon,
   * 0.25 = dusk (the sun going down), 0.5 = the middle of the night,
   * 0.75 = dawn (the sun coming up behind Angkor Wat), back to 0. `night`
   * follows it (0.5 − 0.5·cos 2π·clock); `clock` tells dusk from dawn.
   * URL `clock=0‥1` (else from `night=`, on the dusk side).
   */
  clock: number;
  /** Days gone by since the page opened (whole cycles of `clock`): moon phases, seasons. */
  day: number;
  /**
   * The moon's age held there (0‥1: 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter), else it follows the
   * calendar (`day` and `clock`). URL `moon=0‥1`; the free camera's panel holds it too. Only the sky reads it:
   * the festivals and the daily seeds keep to `day`.
   */
  moonAge?: number;
  /**
   * The moon's path (sky/palette.ts `moonPath`): 0 low over the northern hills (the Moon setting's `low`, the
   * default, as the concept art has it), 1 across the sky (`high`); between, on its way after a change. URL
   * `moonpath=high|low`; the free camera's panel holds it too.
   */
  moonHigh?: number;
  /**
   * Time of the year (0‥1, wraps), from the real date, moving on a year every
   * 24 days of `clock` (so a visit sees the fields change): 0 = mid-April,
   * Khmer New Year (hot, dry; fields bare) · ~0.1 the rains begin, rice is
   * planted · ~0.3–0.55 green rice, the wet season · ~0.58 the Water Festival
   * (November full moon) · ~0.6–0.75 golden rice, harvest · ~0.8–1 dry season,
   * stubble. URL `season=0‥1` holds it (shots: 0.45 unless given).
   */
  season: number;
  /** The weather now (sky/weather.ts); all calm on a clear day. */
  weather: MapWeather;
  camera: PerspectiveCamera;
  /** Direction towards the sun (day) or the moon (night), normalised; set by the atmosphere. */
  lightDir: Vector3;
  /**
   * Where the ears are, for sounds placed on the map (waterfalls, rivers):
   * the camera in the overview, the explorer's head while roaming.
   */
  listener: Vector3;
  /** What the player is doing: looking at the overview, or roaming the map with the explorer. */
  roam: RoamMode;
  /** Lasting sounds of the roaming explorer (all 0 in the overview). */
  roamLevels: RoamLevels;
  /**
   * Animal calls this frame, where they are on the map: parts push them in
   * `update` (a rooster crows, a monkey chatters as it runs off) and main.ts
   * hands them to the sound, then empties the list. Not filled in shots.
   */
  calls: AnimalCall[];
  /**
   * Leaves over the explorer's head while roaming (0 open sky … 1 under the
   * jungle's canopy; 0 in the overview), set by the jungle animals
   * (fauna/jungle.ts) in `update`: the cicadas sing louder in the forest.
   */
  canopy?: number;
}

/**
 * The weather (sky/weather.ts sets it every frame, before the parts'
 * `update`). Everything eases (no jumps), all 0‥1 unless said otherwise.
 */
export interface MapWeather {
  /** Wind strength (0 still air, 1 a strong gust before a storm) and where it blows TO (radians: toward (sin dir, cos dir) in x, z). */
  wind: number;
  windDir: number;
  /** Cloud cover over the sun (0 clear, 1 overcast). */
  cloud: number;
  /** Rain (drops, rings on water, darker light). */
  rain: number;
  /** A storm (thunder, lightning); rain is up too when this is. */
  storm: number;
  /** A lightning flash this frame (0 none; it lights the sky and land for a moment). */
  flash: number;
  /** A rainbow after rain (0 none, 1 full). */
  rainbow: number;
  /** How wet the land is (0 dry … 1 soaked): up in rain, drying over a few minutes after it; the mist lies thicker and lower after rain. */
  wet: number;
  /**
   * The last lightning flash: when it began (s, like `MapFrame.t`; −1e9 before
   * any) and where it struck (m, on the map). Thunder follows it, the later
   * the farther away (sound: ≈ 340 m/s).
   */
  flashAt: number;
  flashX: number;
  flashZ: number;
  /** Snow falling (0 none … 1 thick): only the Weather setting's "snow" (a dream: it never snows at Angkor). */
  snow: number;
  /** How white the land lies under snow (0 bare … 1 covered): up over a minute or two of snowfall, melting after. */
  snowCover: number;
}

/** Calm, clear weather (no wind, no rain). */
export const CALM_WEATHER: Readonly<MapWeather> = { wind: 0, windDir: 0, cloud: 0, rain: 0, storm: 0, flash: 0, rainbow: 0, wet: 0, flashAt: -1e9, flashX: 0, flashZ: 0, snow: 0, snowCover: 0 };

/** Kinds of animal call (audio/animals.ts makes them). */
export type AnimalCallKind =
  | 'elephant'
  | 'monkey'
  | 'rooster'
  | 'hen'
  | 'deer'
  | 'buffalo'
  | 'duck'
  | 'egret'
  | 'wings'
  | 'fish'
  | 'bat'
  | 'frog'
  // The jungle's (fauna/jungle.ts): wild boar grunts and piglet squeals, the green peafowl's "may-awe",
  // the great hornbill's honk and the whoosh of its wings, the giant ibis's honks, the gibbons' morning
  // duet and a short hoot, a squirrel's scolding.
  | 'boar'
  | 'piglet'
  | 'peafowl'
  | 'hornbill'
  | 'whoosh'
  | 'ibis'
  | 'gibbon'
  | 'gibbonHoot'
  | 'squirrel'
  | PeopleCallKind;

/**
 * The people's sounds (people/), sent like the animal calls but made by
 * audio/people.ts: the ox's bronze bell as it walks, the cart's wooden
 * creak, a cast net slapping the water, children laughing far off, a phrase
 * of pinpeat music from the apsara dancers' ensemble at night.
 */
export type PeopleCallKind =
  | 'oxBell'
  | 'cartCreak'
  | 'netSplash'
  | 'laugh'
  | 'pinpeat'
  // The new life (made by audio/people.ts; a kind whose level there is 0 is not made yet): the khleng
  // ek's humming bow, the market's murmur and a seller's call, a knife chopping, a wok sizzling, palm
  // syrup bubbling, a cooking fire crackling, bamboo knocks (the palm tapper's tubes and ladder), a
  // bicycle bell, a moto going by, a greeting ("ជម្រាបសួរ", an adult; "សួស្ដី!", a child), a cow's
  // bell, children splashing in water.
  | 'kiteHum'
  | 'market'
  | 'vendorCall'
  | 'chop'
  | 'sizzle'
  | 'bubble'
  | 'crackle'
  | 'knock'
  | 'bikeBell'
  | 'moto'
  | 'hello'
  | 'kidHello'
  | 'cowBell'
  | 'splashPlay';

/** One animal call at a point of the map (m); `gain` 0‥1 (1 = a full call close by). */
export interface AnimalCall {
  kind: AnimalCallKind;
  x: number;
  y: number;
  z: number;
  gain: number;
  /** The caller's size (m), for the sounds it changes (optional): a khleng ek's height — the bigger the kite, the lower its ek hums (`kiteHum`); a greeter's height — a woman's or a man's voice, a small child's (`hello`, `kidHello`). */
  size?: number;
}

/**
 * Roaming the map with the explorer (src/map/roam/): `overview` = the
 * picker screen; `leap` = running off the ledge; `glide` = under the
 * parachute; `walk` = on foot; `boat` = paddling a boat on a river;
 * `hang` = flying the hang glider; `balloon` = riding the hot air balloon.
 */
export type RoamMode = 'overview' | 'leap' | 'glide' | 'walk' | 'boat' | 'hang' | 'balloon';

/**
 * One-off sounds of the roaming explorer (audio/audio.ts makes them).
 * Footsteps by the ground under them: `step` on earth, `stepGrass`,
 * `stepStone` (the road, temple floors, bare rock), `stepSand` (river
 * banks), `stepWater` (wading), `stepWood` (planks: the take-off ramp's
 * deck, stepping off the boat).
 */
export type RoamSound =
  | 'step'
  | 'stepGrass'
  | 'stepStone'
  | 'stepSand'
  | 'stepWater'
  | 'stepWood'
  | 'gliderOpen'
  | 'gliderStow'
  | 'jump'
  | 'land'
  | 'chuteOpen'
  | 'chuteClose'
  | 'splash'
  | 'paddle'
  | 'boatIn'
  | 'boatOut'
  | 'enter'
  // The treasure part's (treasure/): a golden figure goes into his bag.
  | 'gold'
  // Fishing from the boat (roam/): the cast's swish, the reel, a bite on the float, a fish landed, one let go.
  | 'cast'
  | 'reel'
  | 'bite'
  | 'catch'
  | 'release'
  // His own greeting (a sampeah to the people near him), and a footstep in snow.
  | 'greet'
  | 'stepSnow'
  // Buying at a stall (roam/_shop.ts): paying (riel notes counted out), a sip through a straw, a bite chewed, a satisfied breath after a drink.
  | 'coin'
  | 'sip'
  | 'munch'
  | 'ahh';

/** Sounds of the roaming explorer that last (0‥1 each, set every frame). */
export interface RoamLevels {
  /** Rushing air: falling, gliding under the parachute or the hang glider. */
  wind: number;
  /** The hang glider's sail humming and fluttering in the airflow (0‥1). */
  sail?: number;
  /** The hot air balloon's burner roaring (0‥1). */
  burner?: number;
  /** The hot air balloon's inflation fan blowing (0‥1). */
  fan?: number;
  /** Water against a moving boat. */
  wake: number;
}

/** Sounds the interface asks for (audio/audio.ts makes them). */
export type UISound = 'hover' | 'select' | 'back' | 'begin' | 'open' | 'close' | 'toggle' | 'tick';

/** The story's words typing in on a typewriter: a word, or the title (a heavy strike). */
export type TypeKey = 'key' | 'title';

/**
 * How much the background (music, ambience, water, animals) steps back:
 * not at all, for the story (a little quieter), while its words type in
 * (quieter still, so the keys are heard).
 */
export type Duck = 'none' | 'story' | 'typing';

/** Player settings (gear button), kept in localStorage. Volumes 0‥1. */
export interface MapSettings {
  /** Everything at once (multiplies the others). */
  master: number;
  music: number;
  /** Wind, birds by day, insects and frogs by night. */
  ambience: number;
  /** Waterfalls and rivers (louder the closer you are). */
  water: number;
  /** Animal calls (birds, monkeys, frogs, the rooster…), where the animals are. */
  animals: number;
  /** The explorer's footsteps. */
  steps: number;
  /** The explorer's other sounds: jump and landing, parachute, hang glider wind and sail, paddle, splash, tools, camera. */
  moves: number;
  /** Interface sounds (hover, clicks, open / close). */
  ui: number;
  /** Time of day: follow the clock of the page (a slow cycle) or stay. */
  time: 'day' | 'night' | 'cycle';
  /** Weather (sky/weather.ts): follow the season (rain in the wet season, dry December–April), never rain, showers often, storms often, or snow (a dream: it never snows at Angkor). */
  weather: WeatherSetting;
  /** The moon's path (sky/palette.ts `moonPath`): across the sky (up in the east, high over the south, down in the west), or low over the northern hills as the concept art has it. */
  moonPath: MoonPath;
  /** No camera sway, short flights, no drifting clouds. */
  calm: boolean;
  /** Language of the interface (ui/lang.ts): Khmer first. */
  lang: Lang;
  /** Easy flying for the hang glider: it holds its height hands-off, S climbs, W dives, no ceiling to speak of (roam/prefs.ts). Off: the real glider (it sinks, rising air keeps it up). */
  easyFly: boolean;
  /** The mini-map while roaming (roam/prefs.ts, ui/minimap.ts): shown; `button`, only its caption (the map button, the target's distance); `hide`, nothing (M still opens the big map). */
  miniMap: MiniMapChoice;
  /** The keys of the mode, bottom left while roaming (roam/hud.ts); off, hidden (? still lists them all). */
  keyHelp: boolean;
  /** Graphics (graphics.ts): `auto` (the level this device can keep smooth), or a level, from the fastest to the finest. */
  graphics: GraphicsChoice;
  /** Resolution (resolution.ts): `auto` (the graphics level's own), or a share of the screen's own width (1 every dot, 0.5 half across). */
  resolution: ResolutionChoice;
  /** Battery saver: at most 30 frames a second (graphics.ts `frameCap`; a phone always). */
  battery: boolean;
  /** The fog's thickness (sky/fogLevel.ts `fogNow.amount`): 0 clear air … 1 the game's own … 1.5 thick; the edges keep their mist. */
  fogAmount: number;
}

/** The fog steps, from the finest to the cheapest (sky/fogLevel.ts says what each keeps). */
export const FOG_STEPS = ['full', 'light', 'simple'] as const;
export type FogStep = (typeof FOG_STEPS)[number];
/** The fog steps for `fog=` in the URL (checks: `npm run perf -- url=fog=simple`): auto (the graphics level's step, as the map always has it), then the steps. */
export const FOG_CHOICES = ['auto', ...FOG_STEPS] as const;
export type FogChoice = (typeof FOG_CHOICES)[number];

/** Graphics levels, fastest first (graphics.ts says what each one draws). */
export const GRAPHICS_LEVELS = ['low', 'medium', 'high', 'max'] as const;
export type GraphicsLevel = (typeof GRAPHICS_LEVELS)[number];
/** The graphics setting's choices, in panel order: auto (graphics.ts picks and watches the level), then the levels. */
export const GRAPHICS_CHOICES = ['auto', ...GRAPHICS_LEVELS] as const;
export type GraphicsChoice = (typeof GRAPHICS_CHOICES)[number];

/** Interface languages: Khmer and English. */
export type Lang = 'km' | 'en';

/** The weather setting's choices, in panel order. */
/** The mini-map choices, in panel order. */
export const MINIMAP_CHOICES = ['show', 'button', 'hide'] as const;
export type MiniMapChoice = (typeof MINIMAP_CHOICES)[number];

export const WEATHER_SETTINGS = ['season', 'clear', 'rainy', 'stormy', 'snow'] as const;
export type WeatherSetting = (typeof WEATHER_SETTINGS)[number];

/** The moon's paths, in panel order: low over the hills (the default), across the sky. */
export const MOON_PATHS = ['low', 'high'] as const;
export type MoonPath = (typeof MOON_PATHS)[number];

export const DEFAULT_SETTINGS: MapSettings = { master: 1, music: 0.55, ambience: 0.8, water: 0.8, animals: 0.8, steps: 0.45, moves: 0.7, ui: 1, time: 'cycle', weather: 'clear', moonPath: 'low', calm: false, lang: 'km', easyFly: true, miniMap: 'show', keyHelp: true, graphics: 'auto', resolution: 'auto', battery: false, fogAmount: 1 };

/** The volume settings (sliders), in panel order. */
export const VOLUME_KEYS = ['master', 'music', 'ambience', 'water', 'animals', 'steps', 'moves', 'ui'] as const;
export type VolumeKey = (typeof VOLUME_KEYS)[number];

/** A built part of the map: main.ts adds `object` to the scene and calls `update` each frame. */
export interface MapPart {
  name: string;
  object: Object3D;
  update?(f: MapFrame): void;
  /** The place whose card is hovered or picked (null: none), for parts that point it out. */
  highlight?(id: PlaceId | null): void;
  /** Voxel blocks in the part (for the stats line and the block budget). */
  blocks?: number;
  /**
   * Called right after each frame is drawn, while the canvas still holds the
   * picture (e.g. to take a photo of it). Not called in headless shots.
   */
  afterRender?(): void;
  /**
   * The living things this part shows now (drawn this frame: animals, people,
   * special plants), for the nature book (roam/_book.ts): push one `Subject`
   * each into `out`. Read-only and cheap (called when a photo is taken).
   */
  subjects?(out: Subject[]): void;
}

/**
 * Kinds of living thing the nature book knows (roam/_bookData.ts has their
 * names and facts): land, water and air, jungle animals, people, plants.
 */
export type SubjectKind =
  | 'macaque'
  | 'sambar'
  | 'muntjac'
  | 'junglefowl'
  | 'buffalo'
  | 'elephant'
  | 'ox'
  | 'duck'
  | 'egret'
  | 'heron'
  | 'bat'
  | 'fish'
  | 'dragonfly'
  | 'frog'
  | 'boar'
  | 'peafowl'
  | 'gibbon'
  | 'hornbill'
  | 'ibis'
  | 'squirrel'
  | 'monitor'
  | 'snake'
  | 'skink'
  | 'monk'
  | 'guide'
  | 'visitor'
  | 'kid'
  | 'fisherman'
  | 'dancer'
  | 'villager'
  | 'bamboo'
  | 'lotus'
  | 'festival'
  // The east side and the new life round the map: the sugar palm, its tapper (the palm sugar family),
  // the market's sellers and its crowd, the pilgrims on Phnom Kulen; the fish the explorer catches.
  | 'sugarPalm'
  | 'tapper'
  | 'vendor'
  | 'market'
  | 'pilgrim'
  | 'riel'
  | 'snakehead'
  | 'catfish'
  | 'perch'
  | 'featherback'
  // A flying khleng ek, the humming kite (people/_sceneKites.ts).
  | 'khlengEk';

/** One living thing on the map as a part shows it now: its middle (m) and rough radius (m: how big it is). */
export interface Subject {
  kind: SubjectKind;
  x: number;
  y: number;
  z: number;
  r: number;
}
