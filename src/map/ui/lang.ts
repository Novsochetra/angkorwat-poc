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
  title: { km: 'មរតកអង្គរ', en: 'Angkor Heritage' },
  tagline: { km: 'ជ្រើសរើសដំណើរផ្សងព្រេងបន្ទាប់របស់អ្នក', en: 'Choose your next expedition' },
  loading: { km: 'កំពុងឈូសឆាយផ្លូវកាត់ព្រៃ…', en: 'Clearing the path through the jungle…' },
  // (the loading screen's button once the map is built: its click also turns the sound on)
  loadGo: { km: 'ចាប់ផ្ដើម', en: 'Start' },
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
  // (the settings' tabs, ui.ts: the sound tab is `sound`; the tab bar's name for a screen reader)
  settingsTabs: { km: 'ផ្នែកនៃការកំណត់', en: 'Settings sections' },
  tabGeneral: { km: 'ទូទៅ', en: 'General' },
  tabGraphics: { km: 'រូបភាព', en: 'Graphics' },
  tabPlay: { km: 'ការលេង', en: 'Play' },
  tabAbout: { km: 'អំពី', en: 'About' },
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
  // (the weather setting: a note under it for the one chosen)
  weather: { km: 'អាកាសធាតុ', en: 'Weather' },
  wSeason: { km: 'តាមរដូវ', en: 'By season' },
  wClear: { km: 'មេឃស្រឡះ', en: 'Clear' },
  wRainy: { km: 'ភ្លៀងញឹកញាប់', en: 'Rainy' },
  wStormy: { km: 'ព្យុះភ្លៀង', en: 'Stormy' },
  wSeasonNote: { km: 'ភ្លៀងនៅរដូវវស្សា ហើយស្ងួតពីខែធ្នូដល់ខែមេសា', en: 'Rain in the wet season, dry from December to April' },
  wClearNote: { km: 'គ្មានភ្លៀងទេ មានតែខ្យល់បក់រំភើយ', en: 'No rain, only a light breeze' },
  wRainyNote: { km: 'ភ្លៀងមួយមេ ប្រហែលរៀងរាល់ ១០ នាទីម្ដង', en: 'A shower every ten minutes or so' },
  wStormyNote: { km: 'ព្យុះផ្គររន្ទះញឹកញាប់ មានភ្លៀងធម្មតាចន្លោះ', en: 'Thunderstorms often, showers in between' },
  // (the moon's path, under the weather: sky/palette.ts `moonPath`; a note under it for the one chosen)
  moonPath: { km: 'ព្រះច័ន្ទ', en: 'Moon' },
  moonHigh: { km: 'ខ្ពស់លើមេឃ', en: 'High' },
  moonLow: { km: 'ទាបលើភ្នំ', en: 'Low' },
  moonHighNote: { km: 'រះពីទិសខាងកើត ឡើងខ្ពស់លើមេឃ ហើយលិចនៅទិសខាងលិច៖ ពន្លឺរបស់វាបំភ្លឺគ្រប់ភូមិ', en: 'It rises in the east, climbs high and sets in the west: its light reaches every village' },
  moonLowNote: { km: 'នៅទាបលើជួរភ្នំខាងជើង ដូចក្នុងគំនូរផែនទី៖ ភ្នំខ្លះអាចបាំងវា', en: "It stays low over the northern hills, as in the map's painting: some hills can hide it" },
  // (the graphics setting: a note under it for the choice, graphics.ts; Auto's names the level in use)
  graphics: { km: 'គុណភាពរូបភាព', en: 'Graphics' },
  gAuto: { km: 'ស្វ័យប្រវត្តិ', en: 'Auto' },
  gLow: { km: 'ទាប', en: 'Low' },
  gMedium: { km: 'មធ្យម', en: 'Medium' },
  gHigh: { km: 'ខ្ពស់', en: 'High' },
  gMax: { km: 'អតិបរមា', en: 'Max' },
  gAutoNote: { km: 'ជ្រើសរើសកម្រិតដែលឧបករណ៍នេះដើររលូន ហើយបន្ថយពេលវាយឺត។ ឥឡូវ៖ {level}', en: 'Picks what runs smoothly on this device, and goes lower if it gets slow. Now: {level}' },
  gLowNote: { km: 'លឿនបំផុត៖ រូបភាពមិនសូវច្បាស់ ប្លុកសាមញ្ញ គ្មានពន្លឺចែងចាំង មានតែស្រមោលរបស់ដែលនៅស្ងៀម', en: 'Fastest: a softer picture, plain blocks, no glow, shadows of still things only' },
  gMediumNote: { km: 'ច្បាស់ តែបន្ថយភាពច្បាស់ពេលផែនទីដើរយឺត', en: 'Sharp, softer only while the map runs slow' },
  gHighNote: { km: 'ច្បាស់ជានិច្ច ទោះផែនទីរលូនតិចជាងមុន', en: 'Always sharp, even if the map runs less smoothly' },
  gMaxNote: { km: 'ច្បាស់ជានិច្ច គែមរលោងជាងមុន ស្រមោលរលូន', en: 'Always sharp, smoother edges and shadows' },
  calm: { km: 'បន្ថយចលនា', en: 'Reduce motion' },
  calmNote: { km: 'កាមេរ៉ានៅស្ងៀម ហោះខ្លីៗ', en: 'Still camera, short flights' },
  easyFly: { km: 'ហោះងាយស្រួល', en: 'Easy flying' },
  // (a key stays with its word: no-break spaces)
  easyFlyNote: { km: 'ខ្លែងហោះ និងបាឡុងរក្សាកម្ពស់៖ S ឡើង W ចុះ', en: 'Glider and balloon hold their height: S climbs, W dives' },
  // (on a touch screen: the stick of the touch controls, roam/touch.ts)
  easyFlyNoteTouch: { km: 'ខ្លែងហោះ និងបាឡុងរក្សាកម្ពស់៖ ទាញដងបញ្ជាមកក្រោយដើម្បីឡើង រុញទៅមុខដើម្បីចុះ', en: 'Glider and balloon hold their height: pull the stick back to climb, push to dive' },
  // (the mini-map while roaming: shown, only its caption, a button for the big map, or hidden: minimap.ts)
  miniMap: { km: 'ផែនទីតូច', en: 'Mini-map' },
  mmShowChoice: { km: 'បង្ហាញ', en: 'Show' },
  mmButtonChoice: { km: 'តែប៊ូតុង', en: 'Button' },
  mmHideChoice: { km: 'លាក់', en: 'Hide' },
  miniMapShowNote: { km: 'ផែនទីតូចនៅជ្រុងខាងលើស្ដាំ ពេលដើរលេង', en: 'The small map in the top right corner while you roam' },
  miniMapButtonNote: { km: 'នៅសល់តែប៊ូតុង «ផែនទី» សម្រាប់បើកផែនទីធំ', en: 'Only the Map button stays, for the big map' },
  miniMapHideNote: { km: 'លាក់ទាំងស្រុង។ ចុច M ដើម្បីបើកផែនទីធំ', en: 'Hidden completely. M still opens the big map' },
  // (the keys of the mode, bottom left while roaming: hud.ts)
  keyHelp: { km: 'ជំនួយគ្រាប់ចុច', en: 'Key help' },
  keyHelpNote: { km: 'គ្រាប់ចុចនៅជ្រុងខាងក្រោមឆ្វេង។ ចុច ? ដើម្បីមើលទាំងអស់', en: 'The keys in the bottom left corner. ? shows them all' },
  // (back on the page, the browser still holds the sound: the card that asks for a tap, ui.ts)
  soundHeld: { km: 'សំឡេងបានផ្អាក', en: 'The sound is paused' },
  soundHeldNote: { km: 'ប៉ះទីនេះដើម្បីបើកសំឡេងវិញ', en: 'Tap here to turn it back on' },
  // (game pad: the held card's note while the pad is in use — a browser may not count a pad's press as the click the
  // sound needs, a key or a click it does —, the Controller group on the Play tab (ui.ts), the story's hint (story.ts))
  soundHeldPadNote: { km: 'ចុចគ្រាប់ចុចណាមួយ ឬចុចទីនេះ ដើម្បីបើកសំឡេង', en: 'Press any key or click here to turn it on' },
  padHead: { km: 'ឧបករណ៍បញ្ជាហ្គេម', en: 'Controller' },
  padRumble: { km: 'ការញ័រ', en: 'Vibration' },
  padRumbleNote: { km: 'ឧបករណ៍បញ្ជាញ័រ៖ ពេលចុះចត ពេលត្រីស៊ីនុយ និងពេលផ្គរលាន់', en: 'The controller shakes: landings, a fish biting, thunder' },
  padNone: { km: 'ឧបករណ៍បញ្ជា PS5 ឬ Xbox ក៏ប្រើបានដែរ៖ ភ្ជាប់វា រួចចុចប៊ូតុងណាមួយ', en: 'A PS5 or Xbox controller works too: connect it and press a button' },
  padOther: { km: 'បានភ្ជាប់', en: 'Connected' },
  padOnMap: { km: 'លើផែនទី', en: 'On the map' },
  padOnFoot: { km: 'ពេលដើរ', en: 'On foot' },
  padPlaces: { km: 'ទីកន្លែង', en: 'Places' },
  padPick: { km: 'ជ្រើសរើស', en: 'Pick' },
  padBack: { km: 'ត្រឡប់ក្រោយ', en: 'Back' },
  padTabs: { km: 'ផ្ទាំង', en: 'Tabs' },
  padWalk: { km: 'ដើរ', en: 'Walk' },
  padRun: { km: 'រត់', en: 'Run' },
  padLook: { km: 'មើលជុំវិញ', en: 'Look around' },
  padZoom: { km: 'ពង្រីក · បង្រួម', en: 'Zoom' },
  padJump: { km: 'លោត', en: 'Jump' },
  padUse: { km: 'ប្រើ', en: 'Use' },
  padMenu: { km: 'ម៉ឺនុយអ្នករុករក', en: 'Explorer menu' },
  padToMap: { km: 'ត្រឡប់ទៅផែនទី', en: 'Back to the map' },
  padTools: { km: 'ភ្លើង កាមេរ៉ា សំពះ', en: 'Light, camera, greet' },
  padBigMap: { km: 'ផែនទីធំ', en: 'Big map' },
  padRamp: { km: 'ជម្រាលខ្លែងហោះ', en: 'Glider ramp' },
  stHintPad: { km: 'ដើម្បីបន្ត', en: 'to continue' },
  language: { km: 'ភាសា', en: 'Language' },
  m: { km: 'ម', en: 'm' },
  km: { km: 'គ.ម', en: 'km' },
  // The credits button by the gear and its page (the names: credits.ts).
  credits: { km: 'អ្នករួមចំណែក', en: 'Credits' },
  // The story before the map (story/story.ts; its own words are in story/beats.ts), and its row in the settings:
  stStory: { km: 'រឿងរ៉ាវរបស់យើង', en: 'Our story' },
  stStoryNote: { km: 'ពាក្យផ្ដាំជូនយុវជនខ្មែរ', en: 'A message to the young people of Cambodia' },
  stWatch: { km: 'មើល', en: 'Watch' },
  support: { km: 'គាំទ្រហ្គេមនេះ', en: 'Support the game' },
  supportNote: { km: 'ចូលចិត្តហ្គេមនេះទេ? ទិញកាហ្វេមួយកែវឱ្យខ្ញុំ ដើម្បីជួយខ្ញុំបន្តកសាងវា', en: 'Enjoying the game? Buy me a coffee to help me keep building it' },
  supportGo: { km: 'ទិញកាហ្វេឱ្យខ្ញុំ', en: 'Buy me a coffee' },
  // (the corner's coffee button asks with a card: ui/_support.ts)
  supportLong: { km: 'បើអ្នកចូលចិត្តមរតកអង្គរ សូមទិញកាហ្វេមួយកែវឱ្យខ្ញុំ។ វាជួយខ្ញុំបន្តកសាងពិភពនេះ។', en: 'If you enjoy Angkor Heritage, buy me a coffee. It helps me keep building this world.' },
  supportLater: { km: 'ពេលក្រោយ', en: 'Maybe later' },
  // (game pad: its press on "Buy me a coffee" cannot open a new tab — a browser opens one only from a click, a tap or a
  // key —, so the card stays and says so: ui/ask.ts, _support.ts)
  supportPadLink: { km: 'កម្មវិធីរុករកបើកទំព័រនេះបាន លុះត្រាតែអ្នកចុចដោយកណ្ដុរ ឬប៉ះលើអេក្រង់៖ សូមចុចប៊ូតុងពណ៌មាស ឬចូលទៅកាន់ {url}', en: 'Your browser opens this page only from a click or a tap: click the gold button, or visit {url}' },
  // (the sound on / off switch, first in the settings' sound part: ui.ts)
  soundOn: { km: 'បើកសំឡេង', en: 'Sound on' },
  stSkip: { km: 'រំលង', en: 'Skip' },
  stPrev: { km: 'មុន', en: 'Back' },
  stNext: { km: 'បន្ទាប់', en: 'Next' },
  stHint: { km: 'ចុចដើម្បីបន្ត', en: 'Click to continue' },
  stHintTouch: { km: 'ប៉ះដើម្បីបន្ត', en: 'Tap to continue' },
  stStart: { km: 'តោះ ទៅមើលទាំងអស់គ្នា …', en: "Let's all go and see …" },
  stBegin: { km: 'ចាប់ផ្ដើម', en: 'Start' },
  stSoundOn: { km: 'សូមបើកសំឡេង', en: 'Turn your sound on' },
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
  mmBalloon: { km: 'បាឡុងខ្យល់ក្ដៅ', en: 'Hot air balloon' },
  mmTheBalloon: { km: 'បាឡុងខ្យល់ក្ដៅ', en: 'the hot air balloon' },
  // Roaming (roam/*). Keys stay as on the keyboard; a key stays with its word (no-break spaces).
  // The keys of each mode, bottom left (hud.ts):
  rDrag: { km: 'អូស', en: 'drag' },
  rLook: { km: 'មើលជុំវិញ', en: 'look' },
  rMove: { km: 'ដើរ', en: 'move' },
  rRun: { km: 'រត់', en: 'run' },
  rJump: { km: 'លោត', en: 'jump' },
  rEnterFly: { km: 'ចូល · ហោះ', en: 'enter · fly' },
  rUseFly: { km: 'ប្រើ · ហោះ', en: 'use · fly' },
  rSitLie: { km: 'អង្គុយ · ដេក', en: 'sit · lie down' },
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
  rBurn: { km: 'បាញ់ភ្លើង · ឡើង', en: 'burner · climb' },
  rVent: { km: 'បើករន្ធខ្យល់ · ចុះ', en: 'vent · sink' },
  rBothBurners: { km: 'បាញ់ភ្លើងទាំងពីរ', en: 'both burners' },
  rLandOut: { km: 'ចុះចត · ចេញ', en: 'land · step out' },
  // Prompts ("E  Enter Angkor Wat": the key, two spaces, what it does) and short messages:
  rEnter: { km: 'ចូល{name}', en: 'Enter {name}' },
  rSoon: { km: '{name} — ឆាប់ៗនេះ', en: '{name} — coming soon' },
  rNotOpen: { km: '{name} មិនទាន់បើកនៅឡើយទេ — ឆាប់ៗនេះ', en: '{name} is not open yet — coming soon' },
  rBoard: { km: 'ឡើងទូក', en: 'Board the boat' },
  rAshore: { km: 'ឡើងគោក', en: 'Step ashore' },
  rFly: { km: 'ជិះខ្លែងហោះ', en: 'Fly the hang glider' },
  rBalloon: { km: 'ជិះបាឡុងខ្យល់ក្ដៅ', en: 'Ride the hot air balloon' },
  // The rope swing on the Bayon's rim (roam/_swingRide.ts): sit on it, and get off.
  rSwing: { km: 'អង្គុយយោលលេង', en: 'Swing' },
  rSwingOff: { km: 'ចុះមកវិញ', en: 'Get off' },
  rLand: { km: 'ចុះចត', en: 'Land' },
  rStepOut: { km: 'ចេញពីកន្ត្រក', en: 'Step out' },
  // The parked balloon filling up before the ride (roam/balloon.ts).
  rInflating: { km: 'កំពុងបំប៉ោងបាឡុង · Space ឲ្យលឿន · Esc ឈប់', en: 'Inflating the balloon · Space faster · Esc stop' },
  // (game pad: the same while the pad is in use, in the prompt's "key  what" form: hud.ts draws Space as ✕, Esc as ○)
  rInflatingPad: { km: 'កំពុងបំប៉ោងបាឡុង  ·  Space  ឲ្យលឿន  ·  Esc  ឈប់', en: 'Inflating the balloon  ·  Space  faster  ·  Esc  stop' },
  rToBank: { km: 'ចែវចូលជិតច្រាំងបន្តិចទៀត', en: 'Paddle closer to the bank' },
  rMist: { km: 'អ័ព្ទក្រាស់ពេក មិនអាចទៅមុខទៀតបានទេ', en: 'The mist is too thick to go further' },
  rWindBack: { km: 'ខ្យល់បក់នាំអ្នកត្រឡប់ទៅរកប្រាសាទវិញ', en: 'The wind turns you back towards the temples' },
  rLetGoLand: { km: 'ហោះត្រឡប់មកលើដីសិន ទើបលែងដៃបាន', en: 'Fly back over the land first, then let go' },
  rThinAir: { km: 'ខ្យល់ស្ដើងណាស់នៅកម្ពស់នេះ', en: 'The air is thin up here' },
  // The hot air balloon (balloon.ts): where it will not come down, the mist at the edge, its keys on the first ride.
  rNoLand: { km: 'មិនអាចចុះនៅទីនេះបានទេ៖ រកដីរាបស្មើ និងទំនេរ', en: 'Not here: find flat, open ground' },
  rNoLandWater: { km: 'មិនអាចចុះលើទឹកបានទេ៖ រកដីរាបស្មើ និងទំនេរ', en: 'Not on the water: find flat, open ground' },
  rNoLandTemple: { km: 'មិនអាចចុះលើប្រាសាទបានទេ៖ រកដីរាបស្មើ និងទំនេរនៅក្បែរនោះ', en: 'Not on the temple: find flat, open ground nearby' },
  rNoLandTrees: { km: 'ដើមឈើច្រើនពេក៖ រកវាលទំនេរ', en: 'Too many trees here: find an open clearing' },
  rBalloonEdge: { km: 'ខ្យល់ស្ងប់នៅមាត់អ័ព្ទ៖ ឡើង ឬចុះ ដើម្បីរកខ្យល់ផ្សេង', en: 'The breeze dies at the mist: climb or sink to find another wind' },
  // (easy flying, as the hang glider; with it off, the real balloon)
  rBalloonKeys: {
    km: 'បាឡុងខ្យល់ក្ដៅ៖ A / D បត់ · S ឬ Space ឡើង (បាញ់ភ្លើង) · W ចុះ (បើករន្ធខ្យល់) · Shift លឿន · វារក្សាកម្ពស់ដោយខ្លួនឯង',
    en: 'Hot air balloon: A / D turn · S or Space climb (the burner) · W descend (the vent) · Shift fast · it holds its height by itself',
  },
  rBalloonTouch: {
    km: 'បាឡុងខ្យល់ក្ដៅ៖ ដងបញ្ជាទៅឆ្វេង ឬស្ដាំ ដើម្បីបត់ · ទាញមកក្រោយ ឬសង្កត់ «លោត» ដើម្បីឡើង រុញទៅមុខដើម្បីចុះ · វារក្សាកម្ពស់ដោយខ្លួនឯង',
    en: 'Hot air balloon: stick left / right turns · pull back or hold Jump to climb, push to descend · it holds its height by itself',
  },
  rBalloonReal: {
    km: 'បាឡុងខ្យល់ក្ដៅ៖ S / Space បាញ់ភ្លើងដើម្បីឡើង (Shift៖ ភ្លើងទាំងពីរ) · W បើករន្ធខ្យល់ដើម្បីចុះ · A / D បត់ · ខ្យល់នាំអ្នកទៅ ហើយប្ដូរទិសតាមកម្ពស់',
    en: 'Hot air balloon: S / Space burner (climb; with Shift both burners) · W vent (sink) · A / D turn · the wind carries you, and turns with height',
  },
  rBalloonRealTouch: {
    km: 'បាឡុងខ្យល់ក្ដៅ៖ ទាញដងបញ្ជាមកក្រោយ ឬសង្កត់ «លោត» ដើម្បីបាញ់ភ្លើង (ទាញហួសរង្វង់៖ ភ្លើងទាំងពីរ) · រុញទៅមុខដើម្បីបើករន្ធខ្យល់ · ទៅឆ្វេង ឬស្ដាំ ដើម្បីបត់ · ខ្យល់នាំអ្នកទៅ',
    en: 'Hot air balloon: pull the stick back or hold Jump for the burner (past its ring: both burners) · push to vent · left / right turns · the wind carries you',
  },
  // (game pad: the same while the pad is in use; the left stick ← → ↓ (pulled back) ↑ (pushed); {jump} ✕ / A,
  // {fast} R2 / RT: the pad's own names, glyphs.ts `padName`)
  rBalloonPad: {
    km: 'បាឡុងខ្យល់ក្ដៅ៖ ដងបញ្ជា ← → បត់ · ↓ ឬ {jump} ឡើង (បាញ់ភ្លើង) · ↑ ចុះ (បើករន្ធខ្យល់) · {fast} លឿន · វារក្សាកម្ពស់ដោយខ្លួនឯង',
    en: 'Hot air balloon: stick ← → turn · ↓ or {jump} climb (the burner) · ↑ descend (the vent) · {fast} fast · it holds its height by itself',
  },
  rBalloonRealPad: {
    km: 'បាឡុងខ្យល់ក្ដៅ៖ ដងបញ្ជា ↓ / {jump} បាញ់ភ្លើងដើម្បីឡើង ({fast}៖ ភ្លើងទាំងពីរ) · ↑ បើករន្ធខ្យល់ដើម្បីចុះ · ← → បត់ · ខ្យល់នាំអ្នកទៅ ហើយប្ដូរទិសតាមកម្ពស់',
    en: 'Hot air balloon: stick ↓ / {jump} burner (climb; with {fast} both burners) · ↑ vent (sink) · ← → turn · the wind carries you, and turns with height',
  },
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
  // (game pad: the same while the pad is in use; the left stick ← → ↓ (pulled back) ↑ (pushed); {jump} ✕ / A,
  // {fast} R2 / RT: the pad's own names, glyphs.ts `padName`)
  rGliderPad: { km: 'ខ្លែងហោះ៖ ដងបញ្ជា ← → បត់ · ↓ ឡើង · ↑ ចុះ · {fast} លឿន · {jump} លែងដៃ', en: 'Hang glider: stick ← → turn · ↓ climb · ↑ dive · {fast} fast · {jump} let go' },
  rGliderRealPad: {
    km: 'ខ្លែងហោះ៖ ដងបញ្ជា ← → បត់ · ↑ បង្កើនល្បឿន · ↓ បន្ថយល្បឿន · ឡើងកម្ពស់តាមច្រាំងថ្មចោទ ឬហោះវិលក្នុងសំឡីពណ៌មាស',
    en: 'Hang glider: stick ← → turn · ↑ faster · ↓ slower · climb along cliffs, or circle in the golden seed fluff',
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
  // (game pad: the explorer menu's button for the list of them while the pad is in use, roam/_explorerMenu.ts; with the keys it says rAllKeys)
  rAllButtons: { km: 'ប៊ូតុងទាំងអស់', en: 'All buttons' },
  rKeys: { km: 'គ្រាប់ចុច', en: 'Keys' },
  rPutAway: { km: 'ទុក{name}វិញ', en: '{name} put away' },
  rHandsPaddle: { km: 'ដៃកំពុងកាន់ច្រវ៉ា (កាមេរ៉ា និងទូរស័ព្ទប្រើបាននៅទីនេះ៖ 4, 5)', en: 'Hands on the paddle (the camera and the phone work here: 4, 5)' },
  rHandsBar: { km: 'ដៃកំពុងកាន់របារ (កាមេរ៉ា និងទូរស័ព្ទប្រើបាននៅទីនេះ៖ 4, 5)', en: 'Hands on the bar (the camera and the phone work here: 4, 5)' },
  rHandsBurner: { km: 'ដៃកំពុងកាន់ខ្សែភ្លើង (កាមេរ៉ា និងទូរស័ព្ទប្រើបាននៅទីនេះ៖ 4, 5)', en: 'Hands on the burner line (the camera and the phone work here: 4, 5)' },
  rBeamOn: { km: 'ពិល · {beam} (O ដើម្បីប្ដូរ)', en: 'Flashlight · {beam} (O to change)' },
  rBeam: { km: 'ពិល៖ {beam}', en: 'Flashlight: {beam}' },
  rBeamAhead: { km: 'ចាំងត្រង់ទៅមុខ', en: 'straight ahead' },
  rBeamMouse: { km: 'ចាំងតាមកណ្ដុរ', en: 'follows the mouse' },
  rStickOn: { km: 'ដងសែលហ្វី៖ បើក (រំកិលដើម្បីពន្លូត)', en: 'Selfie stick: on (wheel slides it out)' },
  rStickOff: { km: 'ដងសែលហ្វី៖ បិទ (កាន់ដោយលាតដៃ)', en: 'Selfie stick: off (at arm’s length)' },
  // (game pad: roaming, roam/tools.ts and _rest.ts; {keys}: the pad's own name for L1, "L1" or "LB")
  rStickOnPad: { km: 'ដងសែលហ្វី៖ បើក (ចុច {keys} ដើម្បីពន្លូត)', en: 'Selfie stick: on ({keys} slides it out)' },
  rAsleepPad: { km: 'លង់លក់បាត់ហើយ… ចុចប៊ូតុងណាក៏បាន ដើម្បីដាស់', en: 'Fast asleep… any button wakes him' },
  rHatOn: { km: 'ពាក់មួក', en: 'Hat on' },
  rHatOff: { km: 'ដោះមួក', en: 'Hat off' },
  // (he kneels to pray at a shrine: roam/_pray.ts; the prompt in front of one, "E  Pray")
  rPray: { km: 'ថ្វាយបង្គំ', en: 'Paying respect' },
  // (J sits him down, L lies him down, watching the sky: roam/_rest.ts)
  rSitting: { km: 'អង្គុយមើលមេឃ', en: 'Sitting, watching the sky' },
  rLying: { km: 'ដេកផ្ងារមើលមេឃ', en: 'Lying back, watching the sky' },
  rAsleep: { km: 'លង់លក់បាត់ហើយ… ចុចអ្វីក៏បាន ដើម្បីដាស់', en: 'Fast asleep… any key wakes him' },
  rAwake: { km: 'ភ្ញាក់ហើយ', en: 'Awake' },
  rGetUp: { km: 'ក្រោកឈរ', en: 'Get up' },
  rLieBack: { km: 'ដេកផ្ងារ', en: 'Lie back' },
  rSitUp: { km: 'ក្រោកអង្គុយ', en: 'Sit up' },
  rRestWater: { km: 'មិនអាចអង្គុយ ឬដេកក្នុងទឹកបានទេ', en: 'Not in the water' },
  rRestSteep: { km: 'ដីនៅទីនេះមិនរាបស្មើល្មមទេ', en: 'The ground is not flat enough here' },
  rRestRoom: { km: 'គ្មានកន្លែងទំនេរល្មមនៅទីនេះទេ', en: 'Not enough room here' },
  rPrayHere: { km: 'ថ្វាយបង្គំ', en: 'Pray' },
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
  rSit: { km: 'អង្គុយ', en: 'sit' },
  rLieDown: { km: 'ដេកផ្ងារ', en: 'lie down' },
  // The explorer menu (I, roam/_explorerMenu.ts): its titles are rMoves, rOutfit, rFace.
  rMoves: { km: 'ចលនា', en: 'Moves' },
  rOnFootOnly: { km: 'បានតែពេលដើរ (ដៃកំពុងជាប់)', en: 'on foot only (hands busy)' },
  rMenuKey: { km: 'ចលនា សម្លៀកបំពាក់ ទឹកមុខ', en: 'moves, outfits, faces' },
  rPrayAt: { km: 'លុតជង្គង់ថ្វាយបង្គំ នៅទីសក្ការបូជា', en: 'kneel and pray at a shrine' },
  rHat: { km: 'មួក', en: 'hat' },
  rOutfit: { km: 'សម្លៀកបំពាក់', en: 'outfit' },
  rFace: { km: 'ទឹកមុខ', en: 'face' },
  rLookRound: { km: 'មើលជុំវិញគាត់', en: 'look round him' },
  rWheel: { km: 'រំកិល', en: 'wheel' },
  rZoom: { km: 'ពង្រីក · បង្រួម', en: 'zoom' },
  rBigMap: { km: 'ផែនទីធំ', en: 'big map' },
  // (what E does close by: the golden figures, the swing, the balloon)
  rCloseBy: { km: 'នៅក្បែរ', en: 'Close by' },
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
  // The festivals (festival/_banner.ts): under the title card, and a toast when roaming starts.
  festKicker: { km: 'ពិធីបុណ្យ', en: 'Festival' },
  festWater: { km: 'បុណ្យអុំទូក', en: 'Water Festival' },
  festWaterNote: { km: 'ប្រណាំងទូកងលើបឹងធំ · បណ្ដែតប្រទីប · សំពះព្រះខែ', en: 'Boat races on the great lake · lit floats · saluting the moon' },
  festNewYear: { km: 'បុណ្យចូលឆ្នាំខ្មែរ', en: 'Khmer New Year' },
  festNewYearNote: { km: 'ភ្នំខ្សាច់ · ទង់ជ័យ · ល្បែងប្រជាប្រិយនៅភូមិ', en: 'Sand stupas · flags · folk games in the village' },
  // The touch controls (touch.ts):
  rtUse: { km: 'ប្រើ', en: 'Use' },
  rtJump: { km: 'លោត', en: 'Jump' },
  rtShutter: { km: 'ថតរូប', en: 'Take a photo' },
  rtClose: { km: 'ទុកកាមេរ៉ាវិញ', en: 'Put the camera away' },
  // The photo album's own words (src/game/Photos.ts `ALBUM_WORDS_EN`; passed in roam/photo.ts):
  alRec: { km: 'ថតរូប', en: 'Photo' },
  alModePhoto: { km: 'រូបថត', en: 'Photo' },
  alModeSelfie: { km: 'សែលហ្វី', en: 'Selfie' },
  alShutter: { km: 'ថតសែលហ្វី', en: 'Take the selfie' },
  alButton: { km: 'អាល់ប៊ុម', en: 'Album' },
  alButtonN: { km: 'អាល់ប៊ុម · {n}', en: 'Album · {n}' },
  alButtonTip: { km: 'រូបថតរបស់អ្នក', en: 'Your photos' },
  alHeading: { km: 'អាល់ប៊ុមរូបថត', en: 'Photo album' },
  alClose: { km: 'បិទ (Esc)', en: 'Close (Esc)' },
  alCountOne: { km: 'រូបថត {n} សន្លឹក', en: '1 photo' },
  alCountN: { km: 'រូបថត {n} សន្លឹក', en: '{n} photos' },
  alEmpty: { km: 'មិនទាន់មានរូបថតនៅឡើយទេ។ ចុច {camera} ដើម្បីលើកកាមេរ៉ា ឬ {selfie} ដើម្បីថតសែលហ្វី។', en: 'No photos yet. Press {camera} to raise the camera, or {selfie} for a selfie.' },
  alPhotoAlt: { km: 'រូបថត {when}', en: 'Photo, {when}' },
  alDownload: { km: 'ទាញយក', en: 'Download' },
  alDelete: { km: 'លុប', en: 'Delete' },
  alAll: { km: 'រូបថតទាំងអស់', en: 'All photos' },
  alSaved: { km: 'បានរក្សាទុកក្នុងអាល់ប៊ុម', en: 'Saved to the album' },
  // (the maker's mark in the corner of every new photo)
  alMarkTitle: { km: 'មរតកអង្គរ', en: 'Angkor Heritage' },
  alMarkBy: { km: 'បង្កើតដោយក្ដីស្រឡាញ់ ❤️ ពី នៅ សុចិត្រា', en: 'Made with ❤️ By Sochetra NOV' },
  // The album's nature book and temple passport (roam/_book.ts, _bookUi.ts; names and facts: roam/_bookData.ts):
  bkTabs: { km: 'ផ្នែកនៃអាល់ប៊ុម', en: 'Album sections' },
  bkPhotos: { km: 'រូបថត', en: 'Photos' },
  bkBook: { km: 'សៀវភៅធម្មជាតិ', en: 'Nature book' },
  bkPassport: { km: 'លិខិតឆ្លងដែន', en: 'Passport' },
  bkPassportTitle: { km: 'លិខិតឆ្លងដែនប្រាសាទ', en: 'Temple passport' },
  bkBookHint: { km: 'ថតរូបសត្វ រុក្ខជាតិ និងមនុស្ស ដើម្បីបំពេញទំព័រ — ចូលទៅជិត ឬពង្រីករូប។', en: 'Photograph animals, plants and people to fill its pages — get close, or zoom in.' },
  bkPassportHint: {
    km: 'ដើរទៅដល់ប្រាសាទ ទីកន្លែងលាក់កំបាំងក្នុងព្រៃ និងភូមិនានា ដើម្បីទទួលបានត្រា។ លុតជង្គង់ថ្វាយបង្គំនៅទីសក្ការៈ ដើម្បីទទួលបានត្រាផ្កាឈូក។',
    en: 'Walk to the temples, the jungle’s hidden places and the villages for their stamps. Kneel and pray at a shrine for a lotus seal.',
  },
  bkNew: { km: 'ថ្មីក្នុងសៀវភៅធម្មជាតិ៖ {name}', en: 'New in your nature book: {name}' },
  bkStamped: { km: 'ត្រាថ្មីក្នុងលិខិតឆ្លងដែន៖ {name}', en: 'Passport stamp: {name}' },
  bkLotus: { km: 'ត្រាផ្កាឈូក៖ {name}', en: 'Lotus seal: {name}' },
  bkLotusLabel: { km: 'ថ្វាយបង្គំ', en: 'Prayed' },
  bkNotYet: { km: 'មិនទាន់ឃើញ', en: 'Not seen yet' },
  bkLook: { km: 'រកមើល៖ {where}', en: 'Look {where}' },
  bkFirstSeen: { km: 'ឃើញលើកដំបូង {date}', en: 'First seen {date}' },
  bkNear: { km: 'ក្បែរ {name}', en: 'near {name}' },
  bkShots: { km: 'រូបថត៖ {n}', en: 'Photos: {n}' },
  bkBack: { km: 'ត្រឡប់ក្រោយ', en: 'Back' },
  bkTemples: { km: 'ប្រាសាទ', en: 'Temples' },
  bkSites: { km: 'ក្នុងព្រៃ', en: 'In the jungle' },
  bkVisited: { km: 'បានទៅដល់ {date}', en: 'Visited {date}' },
  bkPrayedOn: { km: 'បានថ្វាយបង្គំ {date}', en: 'Prayed {date}' },
  bkNotVisited: { km: 'មិនទាន់ទៅដល់', en: 'Not visited yet' },
  bkNoPicture: { km: 'មិនទាន់មានរូប', en: 'No picture yet' },
  // People on the map (people/): what they say to the explorer in a small bubble.
  pplHello: { km: 'ជម្រាបសួរ', en: 'Hello!' },
  // Hidden gold (treasure/): the figures' names (lower case: they go in sentences), the prompt, the messages and the counter.
  tgApsara: { km: 'អប្សរាមាស', en: 'golden apsara' },
  tgNaga: { km: 'នាគមាស', en: 'golden naga' },
  tgGaruda: { km: 'គ្រុឌមាស', en: 'golden garuda' },
  tgBayonFace: { km: 'ព្រះភក្ត្របាយ័នមាស', en: 'golden Bayon face' },
  tgSingha: { km: 'សិង្ហមាស', en: 'golden lion' },
  tgNandi: { km: 'គោនន្ទិមាស', en: 'golden Nandi bull' },
  tgLotus: { km: 'ផ្កាឈូកមាស', en: 'golden lotus' },
  tgKinnari: { km: 'កិន្នរីមាស', en: 'golden kinnari' },
  tgTurtle: { km: 'អណ្ដើកមាស', en: 'golden turtle' },
  tgMakara: { km: 'មករមាស', en: 'golden makara' },
  tgRabbit: { km: 'ទន្សាយមាស', en: 'golden rabbit' },
  tgHanuman: { km: 'ហនុមានមាស', en: 'golden Hanuman' },
  tgElephant: { km: 'ដំរីមាស', en: 'golden elephant' },
  tgPeacock: { km: 'ក្ងោកមាស', en: 'golden peacock' },
  tgHamsa: { km: 'ហង្សមាស', en: 'golden hamsa' },
  tgPick: { km: 'រើស{name}', en: 'Pick up the {name}' },
  // (the key list, roam/tools.ts)
  tgPickAny: { km: 'រើសរូបចម្លាក់មាស', en: 'pick up a golden figure' },
  tgFound: { km: 'រកឃើញ{name} — {n} / {total}', en: '{name} found — {n} / {total}' },
  tgAll: { km: 'អ្នករកឃើញរូបចម្លាក់មាសទាំង {total} ហើយ!', en: 'You found all {total} golden figures!' },
  tgCount: { km: 'រូបចម្លាក់មាសដែលបានរកឃើញ', en: 'Golden figures found' },
  // ── Each new pass adds its words right under its own line here (keys with its prefix), never elsewhere ──
  // Greeting (gr…): roam/_greet.ts, people/_greetBack.ts
  grGreet: { km: 'សំពះ', en: 'greet' },
  // (what people say back, in a bubble over their heads: people/_greetBack.ts)
  grHello: { km: 'ជម្រាបសួរ', en: 'Hello!' },
  grHowAreYou: { km: 'សុខសប្បាយទេ?', en: 'How are you?' },
  grHi: { km: 'សួស្ដី', en: 'Hi!' },
  grElder: { km: 'សុខសប្បាយទេ ចៅ?', en: 'Are you well, dear?' },
  grWelcome: { km: 'អញ្ជើញ!', en: 'Please, come in!' },
  grKid: { km: 'សួស្ដី!', en: 'Hello!' },
  grKidBong: { km: 'សួស្ដីបង!', en: 'Hi there!' },
  grMonk: { km: 'សូមឱ្យសុខសប្បាយ', en: 'May you be well' },
  // (visitors from abroad say it in their own words)
  grVisitor: { km: 'Hello!', en: 'Hello!' },
  grVisitorHi: { km: 'Hi!', en: 'Hi!' },
  // Fishing (fi…): roam/_fishing*.ts
  fiFish: { km: 'ស្ទូចត្រី', en: 'Fish' },
  // (the prompts while he fishes: F again puts the pole away; at a bite F, Space, a click or the touch button strikes)
  fiStop: { km: 'ឈប់ស្ទូច', en: 'Stop fishing' },
  fiStrike: { km: 'ទាញ!', en: 'Strike!' },
  // (the first time in a visit: how it goes)
  fiHowTo: { km: 'ស្ទូចត្រី៖ រង់ចាំកូនបណ្ដែតលិច រួចចុច F ឬ Space ដើម្បីទាញ · W A S D ឬ E ដើម្បីឈប់', en: 'Fishing: wait for the float to go under, then F or Space to strike · W A S D or E to stop' },
  fiHowToTouch: { km: 'ស្ទូចត្រី៖ រង់ចាំកូនបណ្ដែតលិច រួចចុច «ទាញ!» · រុញដងបញ្ជា ដើម្បីឈប់', en: 'Fishing: wait for the float to go under, then tap Strike! · push the stick to stop' },
  // (game pad: the same while the pad is in use; {strike} the d-pad's ↓ (F), {jump} ✕ / A (Space), {use} □ / X (E):
  // the pad's own names, glyphs.ts `padName`)
  fiHowToPad: { km: 'ស្ទូចត្រី៖ រង់ចាំកូនបណ្ដែតលិច រួចចុច {strike} ឬ {jump} ដើម្បីទាញ · រុញដងបញ្ជា ឬចុច {use} ដើម្បីឈប់', en: 'Fishing: wait for the float to go under, then {strike} or {jump} to strike · the stick or {use} to stop' },
  // (why not here: paddling, fast water, a fall ahead, no open water to cast to)
  fiSlowDown: { km: 'ឈប់ចែវសិន ទើបអាចស្ទូចបាន', en: 'Stop paddling first' },
  fiTooFast: { km: 'ទឹកហូរខ្លាំងពេក មិនអាចស្ទូចបានទេ', en: 'The water runs too fast to fish here' },
  fiFalls: { km: 'ជិតទឹកធ្លាក់ពេក', en: 'Too close to the falls' },
  fiNoRoom: { km: 'គ្មានទឹកទំនេរ សម្រាប់បោះសន្ទូចទេ', en: 'No open water to cast into' },
  // (what happens at the float)
  fiGotAway: { km: 'ត្រីរួចបាត់ហើយ', en: 'It got away' },
  fiEarly: { km: 'លឿនពេក — ត្រីភ័យហែលបាត់ហើយ', en: 'Too soon — it swam off' },
  // (the catch: "ត្រីរៀល — Trey riel · 12 cm", then he lets it go)
  fiCaught: { km: '{km} — {say} · {cm} ស.ម.', en: '{km} — {say} · {cm} cm' },
  // (its page in the nature book, filled by a catch: roam/_bookUi.ts)
  fiFirstCaught: { km: 'ស្ទូចបានលើកដំបូង {date}', en: 'First caught {date}' },
  fiCaughtMeta: { km: 'ស្ទូចបាន {n} ដង · ធំជាងគេ {cm} ស.ម.', en: 'Caught: {n} · biggest {cm} cm' },
  // Snow (sn…): sky/snow.ts, sky/weather.ts, the settings' weather choice
  snSnow: { km: 'ព្រិល', en: 'Snow' },
  snSnowNote: { km: 'ក្ដីសុបិន៖ នៅអង្គរ មិនដែលមានព្រិលធ្លាក់ទេ', en: 'A dream: it never snows at Angkor' },
  // The market (mk…): hamlet/_market.ts, people/_sceneMarket.ts
  mkMarket: { km: 'ផ្សារ', en: 'Market' },
  // (the sellers' calls, in their bubbles)
  mkFreshFish: { km: 'ត្រីស្រស់ៗ!', en: 'Fresh fish!' },
  mkCheap: { km: 'ថោកៗ!', en: 'Cheap, cheap!' },
  mkWhatBuy: { km: 'ទិញអីដែរបង?', en: 'What are you buying?' },
  mkLook: { km: 'អញ្ជើញមើលសិនបង!', en: 'Come and have a look!' },
  mkGreens: { km: 'បន្លែស្រស់ៗ!', en: 'Fresh greens!' },
  mkFruit: { km: 'ផ្លែឈើផ្អែមៗ!', en: 'Sweet fruit!' },
  mkNoodles: { km: 'នំបញ្ចុកឆ្ងាញ់ៗ!', en: 'Tasty num banh chok!' },
  mkSugar: { km: 'ស្ករត្នោតថ្មីៗ!', en: 'New palm sugar!' },
  mkCakes: { km: 'នំខ្មែរឆ្ងាញ់ៗ!', en: 'Khmer cakes, tasty!' },
  mkCane: { km: 'ទឹកអំពៅត្រជាក់ៗ!', en: 'Cold sugarcane juice!' },
  mkGrill: { km: 'សាច់អាំងក្ដៅៗ!', en: 'Hot grilled skewers!' },
  mkKrama: { km: 'ក្រមាល្អៗ!', en: 'Fine kramas!' },
  mkFlowers: { km: 'ផ្កាឈូកសម្រាប់វត្ត!', en: 'Lotus for the pagoda!' },
  // (the buyers bargaining)
  mkHowMuch: { km: 'ប៉ុន្មាន?', en: 'How much?' },
  mkLower: { km: 'ចុះថ្លៃបន្តិចបានទេ?', en: 'A little cheaper?' },
  mkThanks: { km: 'អរគុណ!', en: 'Thank you!' },
  // The palm sugar (ps…): hamlet/_palmSugar.ts, people/_scenePalmSugar.ts
  psPalmSugar: { km: 'ស្ករត្នោត', en: 'Palm sugar' },
  psTaste: { km: 'សាកភ្លក់ស្ករត្នោតមើល!', en: 'Have a taste of our palm sugar!' },
  psSell: { km: 'ទិញស្ករត្នោតទេបង? មានទឹកត្នោតស្រស់ផង!', en: 'Palm sugar, bong? Fresh palm juice too!' },
  // The east village (ev…): hamlet/_eastVillage.ts, people/_sceneEastVillage.ts
  evVillage: { km: 'ភូមិត្នោត', en: 'Sugar Palm Village' },
  // (speech bubbles: a grandmother's greeting, the children calling to the explorer, the shopkeeper)
  evEaten: { km: 'ញ៉ាំបាយហើយឬនៅ ចៅ?', en: 'Have you eaten yet, dear?' },
  evKids: { km: 'សួស្ដី! សួស្ដី!', en: 'Hello! Hello!' },
  evShop: { km: 'ត្រូវការអីខ្លះ?', en: 'What can I get you?' },
  // Kulen's people and the picnic place (kn…): hamlet/_kulenPicnic.ts, people/_sceneKulen.ts
  knPicnic: { km: 'កន្លែងកម្សាន្តភ្នំគូលែន', en: 'Kulen picnic place' },
  // (the painted sign where the picnic trail comes in: hamlet/_knSign.ts)
  knSign: { km: 'ទឹកធ្លាក់ភ្នំគូលែន', en: 'Kulen Waterfall' },
  knSignSub: { km: 'សូមស្វាគមន៍', en: 'Welcome' },
  // Behind Angkor Wat (bh…): hamlet/_backHamlet.ts, people/_sceneBack.ts
  bhHamlet: { km: 'ភូមិក្រោយអង្គរវត្ត', en: 'The hamlet behind Angkor Wat' },
  // (the juice seller at the sala, people/_sceneBackFolk.ts)
  bhCoconut: { km: 'ដូងខ្ចីត្រជាក់ៗ! អញ្ជើញ!', en: 'Cold young coconuts! Come, have one!' },
  // (the market's sellers, people/_sceneBackMarket.ts; the others call the east market's mk… words)
  bhBreakfast: { km: 'នំបញ្ចុក បបរក្ដៅៗ!', en: 'Num banh chok, hot rice porridge!' },
  bhKrok: { km: 'នំគ្រក់ក្ដៅៗ!', en: 'Hot num krok!' },
  // The Kulen reclining Buddha (rb…): landmarks/kulen.ts
  rbBuddha: { km: 'ព្រះអង្គធំ', en: 'The reclining Buddha' },
  // (the name board on the gate at the foot of his rock: landmarks/_kulenBuddha.ts)
  rbGate: { km: 'វត្តព្រះអង្គធំ', en: 'Wat Preah Ang Thom' },
  rbGateSub: { km: 'ភ្នំគូលែន', en: 'Phnom Kulen' },
  // Kites (kt…): people/_sceneKites.ts
  ktKite: { km: 'ខ្លែងឯក', en: 'Khleng ek kite' },
  // (speech bubbles: the grandfather flying his khleng ek, the eldest of the children in the west)
  ktHear: { km: 'ឮសំឡេងឯកទេ?', en: 'Can you hear the ek sing?' },
  ktHighest: { km: 'ខ្លែងខ្ញុំហើរខ្ពស់ជាងគេ!', en: 'My kite flies the highest!' },
  // The journal and mini-map for the new places (jn…): roam/_book*.ts, roam/_stamps.ts, ui/minimap.ts
  jnNew: { km: 'ថ្មី', en: 'New' },
  // (the new places on the mini-map and the big map, ui/_minimapSpots.ts: the name, then as said in a sentence; the village's is evVillage)
  jnMarket: { km: 'ផ្សារព្រឹក', en: 'Morning market' },
  jnTheMarket: { km: 'ផ្សារព្រឹក', en: 'the morning market' },
  jnPalmSugar: { km: 'ខ្ទមស្ករត្នោត', en: 'Palm sugar hut' },
  jnThePalmSugar: { km: 'ខ្ទមស្ករត្នោត', en: 'the palm sugar hut' },
  jnFalls: { km: 'ទឹកធ្លាក់ភ្នំគូលែន', en: 'Kulen waterfall' },
  jnTheFalls: { km: 'ទឹកធ្លាក់ភ្នំគូលែន', en: 'the Kulen waterfall' },
  jnBuddha: { km: 'ព្រះអង្គធំ', en: 'Reclining Buddha' },
  jnTheBuddha: { km: 'ព្រះអង្គធំ', en: 'the reclining Buddha' },
  jnHamlet: { km: 'ភូមិក្រោយអង្គរវត្ត', en: 'Hamlet behind Angkor Wat' },
  jnTheHamlet: { km: 'ភូមិក្រោយអង្គរវត្ត', en: 'the hamlet behind Angkor Wat' },
  // (the passport's third section, roam/_bookUi.ts: after the temples and the jungle, bkTemples / bkSites)
  jnVillages: { km: 'ភូមិ និងទីសក្ការៈ', en: 'Villages and holy places' },
  // Perf (pf…) and the world size (ws…)
  pfNote: { km: 'ល្បឿន', en: 'Speed' },
  wsEdge: { km: 'ចុងផែនទី', en: 'Edge of the map' },
  // Leaving roaming asks first (rl…): roam/_leave.ts
  rlTitle: { km: 'ត្រឡប់ទៅផែនទីវិញ?', en: 'Back to the map?' },
  rlNote: { km: 'អ្នករុករកនឹងឈប់ដើរលេង។ ចង់ដើរលេងទៀត ត្រូវលោតចុះម្ដងទៀត។', en: 'Your explorer stops roaming. To come back, you jump in again.' },
  rlStay: { km: 'បន្តរុករក', en: 'Keep exploring' },
  rlGo: { km: 'ត្រឡប់ទៅផែនទី', en: 'Back to the map' },
  // Buying, eating and drinking (by…): roam/_shop*.ts, people/_saleBack.ts, hamlet/_shops.ts
  byBuyAt: { km: 'ទិញ — {name}', en: 'Buy — {name}' },
  byBuy: { km: 'ទិញនៅតូប', en: 'Buy at a stall' },
  byClosed: { km: '{name} បិទហើយ', en: '{name} is closed now' },
  byAsk: { km: 'ទិញអីដែរ បង?', en: 'What would you like?' },
  byClose: { km: 'បិទ', en: 'Close' },
  byPurse: { km: 'កាបូបលុយ', en: 'Purse' },
  byPaid: { km: 'បានបង់ {price}', en: 'Paid {price}' },
  byEatNow: { km: 'ញ៉ាំឥឡូវនេះ', en: 'Eat it now' },
  byDrinkNow: { km: 'ផឹកឥឡូវនេះ', en: 'Drink it now' },
  byKeep: { km: 'ទុកពេលក្រោយ', en: 'Keep for later' },
  byBagFull: { km: 'កាបូបពេញហើយ', en: 'Bag full' },
  byShort: { km: 'លុយមិនគ្រប់ទេ — ព្រលឹមស្អែកមានលុយហោប៉ៅថ្មី', en: 'Not enough riel: more pocket money comes at dawn' },
  byThanks: { km: 'អរគុណបង!', en: 'Thank you!' },
  byYum: { km: 'ឆ្ងាញ់!', en: 'Delicious!' },
  byFresh: { km: 'ស្រស់ស្រាយ!', en: 'So refreshing!' },
  byKept: { km: 'បានទុក {name} ({n}/{max})', en: 'Kept for later: {name} ({n}/{max})' },
  byBag: { km: 'ក្នុងកាបូប', en: 'In my bag' },
  byBagEmpty: { km: 'មិនទាន់មានអ្វីទុកទេ', en: 'Nothing kept yet' },
  byEatThis: { km: 'ញ៉ាំ {name}', en: 'Eat: {name}' },
  byDrinkThis: { km: 'ផឹក {name}', en: 'Drink: {name}' },
  byEatKept: { km: 'ញ៉ាំ ឬផឹកអ្វីដែលបានទុក', en: 'Eat or drink what you kept' },
  byOnFoot: { km: 'ញ៉ាំ និងផឹក ពេលដើរលើដី', en: 'Eat and drink on foot' },
  bySitUp: { km: 'អង្គុយឡើងសិន (J) ទើបញ៉ាំបាន', en: 'Sit up first (J) to eat' },
  byPocket: { km: 'លុយហោប៉ៅថ្មី៖ {n}', en: 'Fresh pocket money: {n}' },
  // The floating village's market (fv…): village/_fvMarket.ts, people/_sceneVillageMarket.ts (the sellers also call the east market's mk… words)
  fvPrahok: { km: 'ប្រហុកឆ្ងាញ់ៗ!', en: 'Good prahok!' },
  fvGrill: { km: 'ត្រីអាំងក្ដៅៗ!', en: 'Hot grilled fish!' },
  fvCoffee: { km: 'កាហ្វេទឹកកក!', en: 'Iced coffee!' },
  fvBoatFruit: { km: 'ចេក ស្វាយ ទិញទេបង?', en: 'Bananas, mangoes — buy some?' },
  fvBoatGreens: { km: 'ត្រកួនស្រស់ៗ!', en: 'Fresh morning glory!' },
  fvBoatFish: { km: 'ត្រីទើបចាប់ថ្មីៗ!', en: 'Fish, just caught!' },
  fvBoatNoodles: { km: 'គុយទាវក្ដៅៗ!', en: 'Hot noodle soup!' },
  // The settings' resolution and battery saver (res…, battery…): ui/ui.ts; the sizes: resolution.ts. Auto's button is gAuto.
  resolution: { km: 'កម្រិតភាពច្បាស់', en: 'Resolution' },
  // (the note under the sizes: Auto's names the size drawn now; a picked size says what it means)
  resAutoNote: { km: 'ទៅតាមកម្រិតគុណភាពរូបភាព។ ឥឡូវ៖ {size}', en: 'Follows the graphics level. Now: {size}' },
  resFullNote: { km: 'គ្រប់ចំណុចនៃអេក្រង់៖ ច្បាស់បំផុត តែធ្ងន់ម៉ាស៊ីនបំផុត', en: 'Every dot of the screen: the sharpest, but the most work' },
  resWholeNote: { km: 'ភីកសែលមួយស្មើ {n} × {n} ចំណុចលើអេក្រង់៖ គែមប្លុកនៅតែមុតច្បាស់', en: 'Each pixel is {n} × {n} screen dots: crisp blocks' },
  resSmoothNote: { km: 'ពង្រីកឱ្យពេញអេក្រង់យ៉ាងរលូន៖ មុតតិចជាងបន្តិច', en: 'Scaled up smoothly: a little softer' },
  // (a size kept from another window size or screen: none of these is pressed)
  resOtherNote: { km: 'ជម្រើសមុនរបស់អ្នក។ ឥឡូវ៖ {size}', en: 'Your earlier pick. Now: {size}' },
  // (the mark on a whole step's size: its tooltip, and the size's name for a screen reader)
  resSharp: { km: 'មុតច្បាស់', en: 'Sharp' },
  resSharpSize: { km: '{size} មុតច្បាស់', en: '{size}, sharp' },
  battery: { km: 'សន្សំថ្ម', en: 'Battery saver' },
  batteryNote: { km: 'យ៉ាងច្រើន ៣០ រូបភាពក្នុងមួយវិនាទី៖ ឧបករណ៍មិនសូវក្ដៅ ហើយថ្មប្រើបានយូរជាង', en: 'At most 30 frames a second: cooler and longer on battery' },
  // The settings' fog: one slider, its thickness 0‥150 (ui/ui.ts; sky/fogLevel.ts `fogNow.amount`); the step follows the graphics level.
  fog: { km: 'អ័ព្ទ', en: 'Fog' },
  fogAmount: { km: 'កម្រាស់', en: 'Thickness' },
  // (under the slider: at 0 the mist still hides the map's cut edges)
  fogNote: { km: 'ទៅឆ្វេង អ័ព្ទស្ដើង ទៅស្ដាំ អ័ព្ទក្រាស់ ១០០ ជាអ័ព្ទធម្មតារបស់ហ្គេម។ គែមផែនទីនៅតែមានអ័ព្ទជានិច្ច', en: "Left thins the fog, right thickens it; 100 is the game's own. The mist always stays at the map's edges" },
  // ── The new things to do (docs/ideas.md): each adds its words right under its own line, keys with its prefix ──
  // The calendar of events (when…): roam/_calendar*.ts, calendar.ts
  // The bicycle (bike…): roam/_bike*.ts
  // Riding the ox cart (cart…): roam/_cartRide.ts
  // Riding a water buffalo (buf…): roam/_buffalo*.ts
  // The zip line (zip…): roam/_zip*.ts, jungle/_zipLine.ts
  // Climbing the sugar palm ladder (palm…): roam/_palmClimb.ts
  // The hammock (ham…): roam/_hammock.ts
  // The alms round at dawn (dak…): roam/_dakBat.ts
  // A monk's blessing, the red string (bless…): roam/_blessing.ts
  // Lotus from the boat, offered at a shrine (lotus…): roam/_lotus.ts
  // Monkeys steal his snack (monkey…): roam/_monkeyThief.ts
  // Flying his own kite (kite…): roam/_kiteFly.ts
  // Helping the farmers (farm…): roam/_farmWork.ts
  // The Water Festival boat race (race…): roam/_raceRow.ts
  // Kick the sey with the children (sey…): roam/_sey.ts
  // The dog (dog…): roam/_dog*.ts
  // His stilt house (home…): roam/_home*.ts
  // His name in Khmer letters (name…): roam/_name*.ts, khmerName.ts
  // The umbrella (umb…): roam/_umbrella.ts
  // The binoculars (bino…): roam/_binoculars.ts
  // Smiles for his camera (smile…): smile.ts, people/_smileBack.ts
  // Selling his fish (sell…): roam/_fishSell.ts
  // Clothes from the market (wear…): roam/_wardrobe*.ts
  // Pchum Ben (pchum…): festival/_pchumBen.ts
  // Visak Bochea (visak…): festival/_visak.ts
  // The equinox sunrise over Angkor Wat (equi…): sky/_equinox.ts
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
