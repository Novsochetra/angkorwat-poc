import { Vector3 } from 'three';
import type { Area, AreaItem } from './area';
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
    if (p.area) out.push(...(await areaLines(p.area)));
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

const AREA_GROUPS = 15;

/**
 * What a drawn area covers, grouped by the code that made it (same call
 * stack, same group): one fix usually covers a group. The group that fills
 * most of the area comes first, since that is what was drawn around; far
 * things behind it are many small blocks.
 */
async function areaLines(a: Area): Promise<string[]> {
  const byStack = new Map<string, SourceFrame[]>();
  const groups = new Map<string, { frames: SourceFrame[]; items: AreaItem[] }>();
  for (const it of a.items) {
    const stack = it.trace?.stack ?? '';
    let frames = byStack.get(stack);
    if (!frames) byStack.set(stack, (frames = it.trace ? await resolveTrace(it.trace) : []));
    const key = frames.length ? frames.map(formatFrame).join(' < ') : `no trace: ${it.label}`;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = { frames, items: [] }));
    g.items.push(it);
  }
  const share = (g: { items: AreaItem[] }) => g.items.reduce((n, i) => n + i.pixels, 0);
  const sorted = [...groups.values()].sort((x, y) => share(y) - share(x));
  if (!sorted.length) return [];
  const out = ['', `Grouped by the code that made them: ${sorted.length} group${sorted.length === 1 ? '' : 's'}, the one filling most of the area first.`];
  for (const g of sorted.slice(0, AREA_GROUPS)) {
    const blocks = g.items.filter((i) => i.kind === 'block');
    const meshes = g.items.filter((i) => i.kind === 'mesh');
    const pct = a.pixels ? Math.round((100 * share(g)) / a.pixels) : 0;
    out.push('', `#### ${g.items.length} × ${mostly(g.items.map((i) => i.label))} · ${pct < 1 ? '< 1' : pct} % of the area`);
    if (blocks.length) {
      out.push(`- **Blocks:** ${tally(blocks.map((i) => i.material))} · sizes ${tally(blocks.map((i) => i.size), 3)}`);
      if (blocks.length <= 6) out.push(`- **Where:** ${blocks.map((i) => `${i.ref} at ${i.centre}`).join('; ')}`);
      else {
        const lo = new Vector3(Infinity, Infinity, Infinity);
        const hi = new Vector3(-Infinity, -Infinity, -Infinity);
        for (const i of blocks) {
          if (!i.at) continue;
          lo.min(i.at);
          hi.max(i.at);
        }
        out.push(`- **Where:** centres from ${vec(lo)} to ${vec(hi)} ${blocks[0].unit} · most visible: ${blocks.slice(0, 3).map((i) => `${i.ref} at ${i.centre}`).join('; ')}`);
      }
    }
    if (meshes.length) out.push(`- **Mesh:** ${tally(meshes.map((i) => `${i.ref} · material \`${i.material}\``))}`);
    if (g.frames.length) out.push('- **Code** (innermost call first):', ...g.frames.map((f) => `  - ${frameText(f)}`));
    else out.push('- **Code:** no trace (a production build, or made outside the builders)');
  }
  const rest = sorted.slice(AREA_GROUPS);
  if (rest.length) out.push('', `…and ${rest.length} smaller groups with ${rest.reduce((n, g) => n + g.items.length, 0)} things between them.`);
  if (a.more) out.push('', `(${a.more} more things show inside the area, too many to list.)`);
  return out;
}

/** Distinct values with their counts, most common first. */
function counted(values: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]);
}

/** "sandstone ×120, laterite ×30, +2 more". */
function tally(values: string[], limit = 4): string {
  const top = counted(values);
  const shown = top.slice(0, limit).map(([v, n]) => (n > 1 ? `${v} ×${n}` : v));
  return top.length > limit ? `${shown.join(', ')}, +${top.length - limit} more` : shown.join(', ');
}

/** "gopura · stone block (+1 other kind)". */
function mostly(values: string[]): string {
  const top = counted(values);
  const others = top.length - 1;
  return `${top[0][0]}${others ? ` (+${others} other kind${others > 1 ? 's' : ''})` : ''}`;
}

function vec(v: Vector3): string {
  return `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`;
}

function frameText(f: SourceFrame): string {
  return `\`${formatFrame(f)}\`${f.fn ? ` ${f.fn}` : ''}`;
}
