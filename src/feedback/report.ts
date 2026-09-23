import { describeBox, type Pick } from './pick';
import { formatFrame, resolveTrace, type SourceFrame } from './sourceTrace';

export interface ReportData {
  kind: 'bug' | 'idea';
  note: string;
  /** Page file, e.g. `index.html`. */
  page: string;
  picks: Pick[];
  /** Page state (explorer, camera, outfit…), label → value. */
  state: Record<string, string>;
  /** Browser, screen, GPU, frame rate. */
  env: Record<string, string>;
  /** Query string that reproduces the view. */
  repro: string;
  /** File name of the screenshot next to the report. */
  image: string;
}

// ── Recent console errors, so a report carries what went wrong before it ────
const errors: string[] = [];
function remember(msg: string): void {
  errors.push(`${new Date().toLocaleTimeString()} ${msg}`.slice(0, 400));
  if (errors.length > 15) errors.shift();
}
addEventListener('error', (e) => remember(`${e.message}${e.filename ? ` (${e.filename.replace(location.origin, '')}:${e.lineno})` : ''}`));
addEventListener('unhandledrejection', (e) => remember(`unhandled rejection: ${String(e.reason)}`));
for (const level of ['error', 'warn'] as const) {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    remember(`${level}: ${args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : String(a))).join(' ')}`);
    original(...args);
  };
}
export const errorCount = (): number => errors.length;

/** First line of the note (or what was picked), as the report title. */
function reportTitle(picks: Pick[], note: string): string {
  const first = note.trim().split('\n')[0].trim();
  const title = first || (picks.length ? picks.map((p) => p.label).join(', ') : 'untitled report');
  return title.length > 80 ? `${title.slice(0, 79)}…` : title;
}

/** ASCII folder-name part (a note in Khmer, say, falls back to what was picked). */
export function reportSlug(picks: Pick[], note: string): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48).replace(/-+$/, '');
  return slug(reportTitle(picks, note)) || slug(picks[0]?.label ?? '') || 'report';
}

const NUMBERS = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳';
const pickNumber = (i: number): string => NUMBERS[i] ?? `(${i + 1})`;

/**
 * The report as Markdown, written for whoever fixes it: the note, a link that
 * reproduces the view, each pick with the code that created it, then state.
 */
export async function reportMarkdown(r: ReportData): Promise<string> {
  const url = new URL(`${r.page}?${r.repro}`, location.href).href;
  const out = [
    `# ${r.kind === 'bug' ? '🐞 Bug' : '💡 Idea'}: ${reportTitle(r.picks, r.note)}`,
    '',
    ...(r.note.trim() ? r.note.trim().split('\n').map((l) => `> ${l}`.trimEnd()) : ['> (no description)']),
    '',
    `- **Page:** \`${r.page}\` · ${new Date().toString()}`,
    `- **Reproduce:** [\`${r.page}?${r.repro}\`](${url})`,
    `- **Headless screenshot:** \`npm run shots -- repro="@${r.page}?shot=1&${r.repro}"\``,
    '',
    `![Screenshot — numbered pins mark the picks](${r.image})`,
    '',
    '## Picked',
  ];
  if (!r.picks.length) out.push('', 'Nothing was picked — see the screenshot and the state below.');
  for (const [i, p] of r.picks.entries()) {
    out.push('', `### ${pickNumber(i)} ${p.label}`, ...p.facts.map(([k, v]) => `- **${k}:** ${v}`));
    const frames = p.trace ? await resolveTrace(p.trace) : [];
    if (frames.length) out.push('- **Code** (innermost call first):', ...frames.map((f) => `  - ${frameText(f)}`));
    for (const box of p.colliders) {
      const where = box.src ? (await resolveTrace(box.src)).slice(0, 3).map(frameText).join(' ← ') : '';
      out.push(`- **Collider:** ${describeBox(box)}${where ? ` — added by ${where}` : ''}`);
    }
  }
  out.push('', '## State', ...Object.entries(r.state).map(([k, v]) => `- **${k}:** ${v}`));
  out.push('', '## Environment', ...Object.entries(r.env).map(([k, v]) => `- **${k}:** ${v}`));
  out.push(`- **Recent console errors:** ${errors.length ? '' : 'none'}`, ...errors.map((e) => `  - ${e}`));
  return `${out.join('\n')}\n`;
}

function frameText(f: SourceFrame): string {
  return `\`${formatFrame(f)}\`${f.fn ? ` ${f.fn}` : ''}`;
}
