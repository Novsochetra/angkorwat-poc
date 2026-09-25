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
  jumpInAria: { km: 'លោតចុះ៖ ដើររុករកផែនទី (J)', en: 'Jump in: roam the map (J)' },
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
  sfx: { km: 'បែបផែន', en: 'Effects' },
  sfxTip: { km: 'ប៊ូតុង ជំហាន ឆ័ត្រយោង និងការចែវទូក', en: "The interface and the explorer's steps, parachute and paddle" },
  percent: { km: '{n} ភាគរយ', en: '{n} percent' },
  time: { km: 'ពេលវេលា', en: 'Time of day' },
  day: { km: 'ថ្ងៃ', en: 'Day' },
  night: { km: 'យប់', en: 'Night' },
  cycle: { km: 'វដ្ដ', en: 'Cycle' },
  calm: { km: 'បន្ថយចលនា', en: 'Reduce motion' },
  calmNote: { km: 'កាមេរ៉ានៅស្ងៀម ហោះខ្លីៗ', en: 'Still camera, short flights' },
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
