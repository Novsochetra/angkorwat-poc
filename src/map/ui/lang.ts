import type { PlaceDef, PlaceText } from '../layout';
import type { Lang } from '../types';

/**
 * The map screen's words in Khmer (first) and English. The ខ្មែរ / EN switch
 * (top right, ui.ts) sets the language; it is kept with the settings
 * (`MapSettings.lang`). Shots: `lang=en|km`.
 *
 * - `t(key, vars)`: a word in the current language; `{x}` in it is filled from `vars.x`.
 * - `placeText(p)`: a place's name, subtitle, blurb and facts (layout.ts `km`).
 * - `num(s)`: Khmer digits in Khmer.
 * - `onLang(fn)`: parts that show words fill them again when it changes.
 *
 * Khmer glyphs come from 'Kantumruy Pro' (text) and 'Koulen' (titles),
 * after the Latin fonts in map.css (the browser picks per letter).
 */
const WORDS = {
  title: { km: 'ដំណើរលើខ្ពង់រាប', en: 'Highland Journey' },
  tagline: { km: 'ជ្រើសរើសដំណើរផ្សងព្រេងបន្ទាប់របស់អ្នក', en: 'Choose your next expedition' },
  loading: { km: 'កំពុងឈូសឆាយផ្លូវកាត់ព្រៃ…', en: 'Clearing the path through the jungle…' },
  hint: { km: 'រុករកតំបន់ខ្ពង់រាបបុរាណនៃអង្គរ', en: 'Explore the ancient highlands of Angkor' },
  jumpIn: { km: 'លោតចុះ', en: 'Jump in' },
  jumpInAria: { km: 'លោតចុះ៖ ជ្រើសរើសឆ័ត្រយោង ឬខ្លែងហោះ (J)', en: 'Jump in: choose a parachute or a hang glider (J)' },
  jumpChute: { km: 'ឆ័ត្រយោង', en: 'Parachute' },
  jumpChuteNote: { km: 'អណ្ដែតចុះថ្នមៗ', en: 'Float down gently' },
  jumpGlider: { km: 'ខ្លែងហោះ', en: 'Hang glider' },
  jumpGliderNote: { km: 'ហោះហើរពីលើប្រាសាទ', en: 'Soar over the temples' },
  jumpClose: { km: 'បិទ (Esc)', en: 'Close (Esc)' },
  places: { km: 'ទីកន្លែងលើផែនទី', en: 'Places on the map' },
  pinSoon: { km: ' (ឆាប់ៗនេះ)', en: ' (coming soon)' },
  map: { km: 'ផែនទី', en: 'Map' },
  backToMap: { km: 'ត្រឡប់ទៅផែនទីវិញ', en: 'Back to the map' },
  destination: { km: 'គោលដៅ', en: 'Destination' },
  begin: { km: 'ចាប់ផ្ដើមដំណើរ', en: 'Begin expedition' },
  soon: { km: 'ឆាប់ៗនេះ', en: 'Coming soon' },
  soonNote: { km: 'ផ្លូវនេះកំពុងឈូសឆាយនៅឡើយ។', en: 'This path is still being cleared.' },
  settingOut: { km: 'កំពុងចេញដំណើរទៅ {name}', en: 'Setting out for {name}' },
  ready: { km: 'រួចរាល់ហើយ។', en: 'Ready to begin.' },
  soonLive: { km: 'ឆាប់ៗនេះ។', en: 'Coming soon.' },
  backLive: { km: 'ត្រឡប់ទៅផែនទីវិញ។', en: 'Back to the map.' },
  exploring: { km: 'កំពុងរុករកផែនទី។', en: 'Exploring the map.' },
  settings: { km: 'ការកំណត់', en: 'Settings' },
  closeSettings: { km: 'បិទការកំណត់', en: 'Close settings' },
  sound: { km: 'សំឡេង', en: 'Sound' },
  master: { km: 'សំឡេងរួម', en: 'Master' },
  masterTip: { km: 'គ្រប់សំឡេង', en: 'All sound' },
  music: { km: 'តន្ត្រី', en: 'Music' },
  musicTip: { km: 'តន្ត្រីស្ងប់ៗ', en: 'The calm music' },
  ambience: { km: 'បរិយាកាស', en: 'Ambience' },
  ambienceTip: { km: 'ខ្យល់ សត្វស្លាប សត្វល្អិត និងកង្កែប', en: 'Wind, birds, insects and frogs' },
  water: { km: 'ទឹក', en: 'Water' },
  waterTip: { km: 'ទឹកធ្លាក់ និងទន្លេ កាន់តែជិតកាន់តែឮខ្លាំង', en: 'Waterfalls and rivers, louder the closer you are' },
  animals: { km: 'សត្វ', en: 'Animals' },
  animalsTip: { km: 'សំឡេងសត្វនៅជិតៗ៖ ដំរី ស្វា មាន់…', en: 'Calls of the animals nearby: elephants, monkeys, the rooster…' },
  steps: { km: 'ជំហាន', en: 'Footsteps' },
  stepsTip: { km: 'ជំហានរបស់អ្នករុករក លើស្មៅ ថ្ម ខ្សាច់ និងទឹក', en: "The explorer's steps on grass, stone, sand and water" },
  moves: { km: 'សកម្មភាព', en: 'Actions' },
  movesTip: { km: 'លោត ចុះចត ឆ័ត្រយោង ខ្លែងហោះ ការចែវទូក និងកាមេរ៉ា', en: 'Jumps and landings, parachute, hang glider, paddle and camera' },
  ui: { km: 'ប៊ូតុង', en: 'Interface' },
  uiTip: { km: 'សំឡេងចុចប៊ូតុង និងបើកបិទផ្ទាំង', en: 'Clicks of the buttons and panels' },
  soundAround: { km: 'ជុំវិញអ្នក', en: 'Around you' },
  soundYours: { km: 'សំឡេងរបស់អ្នក', en: 'Your sounds' },
  percent: { km: '{n} ភាគរយ', en: '{n} percent' },
  time: { km: 'ពេលវេលា', en: 'Time of day' },
  day: { km: 'ថ្ងៃ', en: 'Day' },
  night: { km: 'យប់', en: 'Night' },
  cycle: { km: 'វដ្ដ', en: 'Cycle' },
  calm: { km: 'បន្ថយចលនា', en: 'Reduce motion' },
  calmNote: { km: 'កាមេរ៉ានៅស្ងៀម ហោះខ្លីៗ', en: 'Still camera, short flights' },
  easyFly: { km: 'ហោះងាយស្រួល', en: 'Easy flying' },
  // (a key stays with its word: no-break spaces)
  easyFlyNote: { km: 'ខ្លែងហោះរក្សាកម្ពស់៖ S ឡើង W ចុះ', en: 'Glider holds its height: S climbs, W dives' },
  // (on a touch screen: the stick of the touch controls, roam/touch.ts)
  easyFlyNoteTouch: { km: 'ខ្លែងហោះរក្សាកម្ពស់៖ ទាញដងបញ្ជាមកក្រោយដើម្បីឡើង រុញទៅមុខដើម្បីចុះ', en: 'Glider holds its height: pull the stick back to climb, push to dive' },
  mute: { km: 'បិទសំឡេង', en: 'Mute sound' },
  language: { km: 'ភាសា', en: 'Language' },
  m: { km: 'ម', en: 'm' },
  km: { km: 'គ.ម', en: 'km' },
  // The story before the map (story/story.ts; its own words are in story/beats.ts), and its row in the settings:
  stStory: { km: 'រឿងរ៉ាវរបស់យើង', en: 'Our story' },
  stStoryNote: { km: 'ពាក្យផ្ដាំជូនយុវជនខ្មែរ', en: 'A message to the young people of Cambodia' },
  stWatch: { km: 'មើល', en: 'Watch' },
  stSkip: { km: 'រំលង', en: 'Skip' },
  stPrev: { km: 'មុន', en: 'Back' },
  stNext: { km: 'បន្ទាប់', en: 'Next' },
  stHint: { km: 'ចុចដើម្បីបន្ត', en: 'Click to continue' },
  stHintTouch: { km: 'ប៉ះដើម្បីបន្ត', en: 'Tap to continue' },
  stStart: { km: 'ចាប់ផ្ដើមលេង', en: 'Start playing' },
  stEmpire: { km: 'អាណាចក្រខ្មែរ', en: 'Khmer Empire' },
  stAngkor: { km: 'អង្គរ', en: 'Angkor' },
  stYear: { km: 'ប្រហែលឆ្នាំ ៩០០ គ.ស.', en: 'Around 900 CE' },
  stCredit: { km: 'ផែនទី៖ Jembezmamy, Wikimedia Commons (CC0)', en: 'Map: Jembezmamy, Wikimedia Commons (CC0)' },
  // Mini-map and the big map (M) while roaming: minimap.ts.
  mmOpen: { km: 'បើកផែនទី (M)', en: 'Open the map (M)' },
  mmClose: { km: 'បិទផែនទី (M)', en: 'Close the map (M)' },
  mmTitle: { km: 'ផែនទីខ្ពង់រាប', en: 'Highland Map' },
  mmSub: { km: 'ជ្រើសរើសទីកន្លែងមួយ ផែនទីតូចនឹងបង្ហាញផ្លូវទៅ', en: 'Pick a place, and your mini-map shows the way' },
  mmHere: { km: 'អ្នកនៅទីនេះ', en: 'You are here' },
  mmYou: { km: 'អ្នក', en: 'You' },
  mmTemple: { km: 'ប្រាសាទ', en: 'Temple' },
  mmRoad: { km: 'ផ្លូវ', en: 'Road' },
  mmRiver: { km: 'ទន្លេ', en: 'River' },
  mmNorth: { km: 'ជ', en: 'N' },
  mmArrived: { km: 'អ្នកបានមកដល់ហើយ', en: 'You have arrived' },
  mmTarget: { km: 'គោលដៅ', en: 'Target' },
  mmPick: { km: 'ជ្រើសរើសទីកន្លែងមួយ ដើម្បីកំណត់ជាគោលដៅរបស់អ្នក។', en: 'Pick a place to set it as your target.' },
  mmHeading: { km: 'កំពុងទៅ{name} ចម្ងាយ {d}៖ តាមព្រួញមាសលើផែនទីតូចរបស់អ្នក។', en: 'Heading for {name}, {d} away: follow the gold arrow on your mini-map.' },
  mmHeadFor: { km: 'ទៅ{name}', en: 'Head for {name}' },
  mmIsTarget: { km: '{name}៖ គោលដៅរបស់អ្នក (ចុចម្ដងទៀតដើម្បីលុប)', en: '{name}: your target (click to clear)' },
  mmRamp: { km: 'ជម្រាលខ្លែងហោះ', en: 'Glider ramp' },
  mmTheRamp: { km: 'ជម្រាលខ្លែងហោះ', en: 'the glider ramp' },
  mmNearest: { km: 'ជម្រាលខ្លែងហោះជិតបំផុត', en: 'Nearest glider ramp' },
  mmNear: { km: 'ជិតបំផុត', en: 'Nearest' },
  // Roaming (roam/*). Keys stay as on the keyboard; a key stays with its word (no-break spaces).
  // The keys of each mode, bottom left (hud.ts):
  rDrag: { km: 'អូស', en: 'drag' },
  rLook: { km: 'មើលជុំវិញ', en: 'look' },
  rMove: { km: 'ដើរ', en: 'move' },
  rRun: { km: 'រត់', en: 'run' },
  rJump: { km: 'លោត', en: 'jump' },
  rEnterFly: { km: 'ចូល · ហោះ', en: 'enter · fly' },
  rRamp: { km: 'ជម្រាលខ្លែងហោះ', en: 'glider ramp' },
  rEmotes: { km: 'កាយវិការ', en: 'emotes' },
  rSteer: { km: 'បត់', en: 'steer' },
  rTurn: { km: 'បត់', en: 'turn' },
  rDive: { km: 'ចុះ', en: 'dive' },
  rChuteDive: { km: 'ចុះលឿន', en: 'dive' },
  rBrake: { km: 'បន្ថយល្បឿន', en: 'brake' },
  rClimb: { km: 'ឡើង', en: 'climb' },
  rFast: { km: 'លឿន', en: 'fast' },
  rFaster: { km: 'បង្កើនល្បឿន', en: 'faster' },
  rSlowerClimb: { km: 'បន្ថយល្បឿន · ឡើង', en: 'slower · climb' },
  rLetGo: { km: 'លែងដៃ', en: 'let go' },
  rPaddle: { km: 'ចែវ', en: 'paddle' },
  rPhoto: { km: 'ថតរូប', en: 'photo' },
  // Prompts ("E  Enter Angkor Wat": the key, two spaces, what it does) and short messages:
  rEnter: { km: 'ចូល{name}', en: 'Enter {name}' },
  rSoon: { km: '{name} — ឆាប់ៗនេះ', en: '{name} — coming soon' },
  rNotOpen: { km: '{name} មិនទាន់បើកនៅឡើយទេ — ឆាប់ៗនេះ', en: '{name} is not open yet — coming soon' },
  rBoard: { km: 'ឡើងទូក', en: 'Board the boat' },
  rAshore: { km: 'ឡើងគោក', en: 'Step ashore' },
  rFly: { km: 'ជិះខ្លែងហោះ', en: 'Fly the hang glider' },
  rToBank: { km: 'ចែវចូលជិតច្រាំងបន្តិចទៀត', en: 'Paddle closer to the bank' },
  rMist: { km: 'អ័ព្ទក្រាស់ពេក មិនអាចទៅមុខទៀតបានទេ', en: 'The mist is too thick to go further' },
  rWindBack: { km: 'ខ្យល់បក់នាំអ្នកត្រឡប់ទៅរកប្រាសាទវិញ', en: 'The wind turns you back towards the temples' },
  rThinAir: { km: 'ខ្យល់ស្ដើងណាស់នៅកម្ពស់នេះ', en: 'The air is thin up here' },
  // The hang glider's keys on the first flight (hangGlider.ts): easy flying, the real glider; on touch the stick and Jump.
  rGliderKeys: { km: 'ខ្លែងហោះ៖ A / D បត់ · S ឡើង · W ចុះ · Shift លឿន · Space លែងដៃ', en: 'Hang glider: A / D turn · S climb · W dive · Shift fast · Space let go' },
  rGliderTouch: { km: 'ខ្លែងហោះ៖ ដងបញ្ជាទៅឆ្វេង ឬស្ដាំ ដើម្បីបត់ · ទាញមកក្រោយដើម្បីឡើង រុញទៅមុខដើម្បីចុះ · «លោត» ដើម្បីលែងដៃ', en: 'Hang glider: stick left / right turns · pull back to climb, push to dive · Jump lets go' },
  rGliderReal: {
    km: 'ខ្លែងហោះ៖ A / D បត់ · W បង្កើនល្បឿន · S បន្ថយល្បឿន · ឡើងកម្ពស់តាមច្រាំងថ្មចោទ ឬហោះវិលក្នុងសំឡីពណ៌មាស',
    en: 'Hang glider: A / D turn · W faster · S slower · climb along cliffs, or circle in the golden seed fluff',
  },
  rGliderRealTouch: {
    km: 'ខ្លែងហោះ៖ ដងបញ្ជាទៅឆ្វេង ឬស្ដាំ ដើម្បីបត់ · រុញទៅមុខឱ្យលឿន ទាញមកក្រោយឱ្យយឺត · ឡើងកម្ពស់តាមច្រាំងថ្មចោទ ឬហោះវិលក្នុងសំឡីពណ៌មាស',
    en: 'Hang glider: stick left / right turns · push faster, pull back slower · climb along cliffs, or circle in the golden seed fluff',
  },
  // The explorer's tools (tools.ts; the list's words are these in lower case):
  rTools: { km: 'ឧបករណ៍', en: 'Tools' },
  rToolsAria: { km: 'ឧបករណ៍របស់អ្នករុករក', en: "The explorer's tools" },
  rLantern: { km: 'ចង្កៀងគោម', en: 'Lantern' },
  rTorch: { km: 'ចន្លុះ', en: 'Torch' },
  rFlashlight: { km: 'ពិល', en: 'Flashlight' },
  rCamera: { km: 'កាមេរ៉ា', en: 'Camera' },
  rSelfie: { km: 'ទូរស័ព្ទសែលហ្វី', en: 'Selfie phone' },
  rAlbum: { km: 'អាល់ប៊ុមរូបថត', en: 'Photo album' },
  rAllKeys: { km: 'គ្រាប់ចុចទាំងអស់', en: 'All keys' },
  rKeys: { km: 'គ្រាប់ចុច', en: 'Keys' },
  rPutAway: { km: 'ទុក{name}វិញ', en: '{name} put away' },
  rHandsPaddle: { km: 'ដៃកំពុងកាន់ច្រវ៉ា (កាមេរ៉ា និងទូរស័ព្ទប្រើបាននៅទីនេះ៖ 4, 5)', en: 'Hands on the paddle (the camera and the phone work here: 4, 5)' },
  rHandsBar: { km: 'ដៃកំពុងកាន់របារ (កាមេរ៉ា និងទូរស័ព្ទប្រើបាននៅទីនេះ៖ 4, 5)', en: 'Hands on the bar (the camera and the phone work here: 4, 5)' },
  rBeamOn: { km: 'ពិល · {beam} (O ដើម្បីប្ដូរ)', en: 'Flashlight · {beam} (O to change)' },
  rBeam: { km: 'ពិល៖ {beam}', en: 'Flashlight: {beam}' },
  rBeamAhead: { km: 'ចាំងត្រង់ទៅមុខ', en: 'straight ahead' },
  rBeamMouse: { km: 'ចាំងតាមកណ្ដុរ', en: 'follows the mouse' },
  rStickOn: { km: 'ដងសែលហ្វី៖ បើក (រំកិលដើម្បីពន្លូត)', en: 'Selfie stick: on (wheel slides it out)' },
  rStickOff: { km: 'ដងសែលហ្វី៖ បិទ (កាន់ដោយលាតដៃ)', en: 'Selfie stick: off (at arm’s length)' },
  rHatOn: { km: 'ពាក់មួក', en: 'Hat on' },
  rHatOff: { km: 'ដោះមួក', en: 'Hat off' },
  rOutfitIs: { km: 'សម្លៀកបំពាក់៖ {name}', en: 'Outfit: {name}' },
  rFaceIs: { km: 'ទឹកមុខ៖ {name}', en: 'Face: {name}' },
  rGestureIs: { km: 'សញ្ញាដៃ៖ {name}', en: 'Gesture: {name}' },
  rNoCamera: { km: 'ឈុតនេះគ្មានកាមេរ៉ាទេ (G ប្ដូរសម្លៀកបំពាក់)', en: 'No camera with this outfit (G changes the outfit)' },
  rLookGear: { km: 'ឈុតអ្នករុករក', en: 'explorer gear' },
  rLookPack: { km: 'កាបូបស្ពាយ', en: 'day pack' },
  rLookNoScarf: { km: 'គ្មានក្រមា', en: 'no scarf' },
  rLookTemple: { km: 'ឈុតប្រពៃណី', en: 'temple clothes' },
  rFaceNeutral: { km: 'ធម្មតា', en: 'neutral' },
  rFaceHappy: { km: 'សប្បាយចិត្ត', en: 'happy' },
  rFaceDetermined: { km: 'ម៉ឺងម៉ាត់', en: 'determined' },
  rFaceSurprised: { km: 'ភ្ញាក់ផ្អើល', en: 'surprised' },
  rFaceCurious: { km: 'ចង់ដឹងចង់ឃើញ', en: 'curious' },
  rFaceFocused: { km: 'ផ្ចិតផ្ចង់', en: 'focused' },
  rPeace: { km: 'សញ្ញាសន្តិភាព', en: 'peace sign' },
  rThumbsUp: { km: 'លើកមេដៃ', en: 'thumbs up' },
  rNoGesture: { km: 'គ្មានសញ្ញាដៃ', en: 'no gesture' },
  // All the keys (?, tools.ts) and the camera's and the phone's key lines (photo.ts):
  rExplorer: { km: 'អ្នករុករក', en: 'Explorer' },
  rView: { km: 'ទិដ្ឋភាព', en: 'View' },
  rSelfieHead: { km: 'សែលហ្វី', en: 'Selfie' },
  rBeamKeys: { km: 'ចាំងទៅមុខ / តាមកណ្ដុរ', en: 'beam ahead / mouse' },
  rWave: { km: 'គ្រវីដៃ', en: 'wave' },
  rCheer: { km: 'អបអរ', en: 'cheer' },
  rLookUp: { km: 'ងើយមើល', en: 'look up' },
  rPeek: { km: 'លបមើល', en: 'peek' },
  rHat: { km: 'មួក', en: 'hat' },
  rOutfit: { km: 'សម្លៀកបំពាក់', en: 'outfit' },
  rFace: { km: 'ទឹកមុខ', en: 'face' },
  rLookRound: { km: 'មើលជុំវិញគាត់', en: 'look round him' },
  rWheel: { km: 'រំកិល', en: 'wheel' },
  rZoom: { km: 'ពង្រីក · បង្រួម', en: 'zoom' },
  rBigMap: { km: 'ផែនទីធំ', en: 'big map' },
  rClick: { km: 'ចុច', en: 'click' },
  rTake: { km: 'ថត', en: 'take' },
  rTakePhoto: { km: 'ថតរូប', en: 'take a photo' },
  rStow: { km: 'ទុកវិញ', en: 'put away' },
  rDragLook: { km: 'អូសដើម្បីមើល', en: 'drag to look' },
  rWheelZoom: { km: 'រំកិលដើម្បីពង្រីក', en: 'wheel to zoom' },
  rMovePhone: { km: 'ផ្លាស់ទីទូរស័ព្ទ', en: 'move the phone' },
  rDragPhone: { km: 'អូសដើម្បីផ្លាស់ទីទូរស័ព្ទ', en: 'drag to move the phone' },
  rReach: { km: 'ជិត / ឆ្ងាយ', en: 'closer / further' },
  rStick: { km: 'ដងសែលហ្វី', en: 'selfie stick' },
  rGesture: { km: 'សញ្ញាដៃ', en: 'gesture' },
  rHolding: { km: 'កាន់{name}', en: 'holding the {name}' },
  // The touch controls (touch.ts):
  rtUse: { km: 'ប្រើ', en: 'Use' },
  rtJump: { km: 'លោត', en: 'Jump' },
  rtShutter: { km: 'ថតរូប', en: 'Take a photo' },
  rtClose: { km: 'ទុកកាមេរ៉ាវិញ', en: 'Put the camera away' },
} satisfies Record<string, Record<Lang, string>>;
export type WordKey = keyof typeof WORDS;

let current: Lang = 'km';
const listeners: ((l: Lang) => void)[] = [];

export const lang = (): Lang => current;

/** Change the language: the page's `lang` (for the Khmer styles in map.css), then everyone showing words. */
export function setLang(l: Lang): void {
  document.documentElement.lang = l;
  if (l === current) return;
  current = l;
  for (const fn of listeners) fn(l);
}

export function onLang(fn: (l: Lang) => void): void {
  listeners.push(fn);
}

export function t(key: WordKey, vars: Record<string, string> = {}): string {
  return WORDS[key][current].replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}

export const placeText = (p: PlaceDef): PlaceText => (current === 'km' ? p.km : p);

const KHMER_DIGITS = '០១២៣៤៥៦៧៨៩';
export const num = (s: string | number): string => (current === 'km' ? String(s).replace(/[0-9]/g, (d) => KHMER_DIGITS[+d]) : String(s));
