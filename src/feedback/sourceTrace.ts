/**
 * "Which line of code made this?" — voxel blocks and colliders remember the call
 * stack that created them (dev builds only, ≈ 1.5 µs per capture, formatted
 * lazily). When something is picked in the feedback tool, the stack is mapped
 * back through Vite's inline source maps to `src/…/File.ts:line` frames, so a
 * bug report points straight at the code to change.
 */
export type SourceTrace = Error;

export interface SourceFrame {
  /** Repository-relative path, e.g. `src/game/world/AngkorScaleWorld.ts`. */
  file: string;
  line: number;
  column: number;
  /** Function name as the stack shows it (`gateHall`, `WorldBuilder.block`, '' at module level). */
  fn: string;
}

/** Capture the current call stack (undefined in production builds). */
export function traceSource(): SourceTrace | undefined {
  return import.meta.env.DEV ? new Error('source trace') : undefined;
}

/** Plumbing every trace passes through; reports skip these frames. */
const PLUMBING = /^src\/(feedback|voxel)\/|^src\/game\/world\/Colliders\.ts$/;

/** Project frames of a trace, innermost first, at their original `.ts` positions. */
export async function resolveTrace(trace: SourceTrace): Promise<SourceFrame[]> {
  const frames: SourceFrame[] = [];
  for (const text of (trace.stack ?? '').split('\n')) {
    // V8: "    at fn (http://host/src/a.ts?t=1:12:5)"; Firefox / Safari: "fn@http://host/src/a.ts:12:5".
    const m = /((?:https?|file):\/\/\S+?):(\d+):(\d+)\)?\s*$/.exec(text);
    if (!m) continue;
    const file = decodeURIComponent(new URL(m[1]).pathname).replace(/^\/+/, '');
    if (!file.startsWith('src/') || PLUMBING.test(file)) continue;
    const fn = (/^\s*at\s+((?:new\s+)?[^\s(]+)\s+\(/.exec(text) ?? /^([^@\s]*)@/.exec(text))?.[1] ?? '';
    const pos = await originalPosition(m[1], Number(m[2]), Number(m[3]));
    frames.push({ file, fn, line: pos?.line ?? Number(m[2]), column: pos?.column ?? Number(m[3]) });
  }
  return frames;
}

/** `file:line` for display. */
export function formatFrame(f: SourceFrame): string {
  return `${f.file}:${f.line}`;
}

// ── Source maps ──────────────────────────────────────────────────────────────
// Vite reprints every module (types stripped), so stack positions are in the
// served JS, not the .ts file. Each dev module ends with an inline source map.

/** Per generated line: [generated column, original line, original column] (0-based). */
type LineMap = [number, number, number][];
const maps = new Map<string, Promise<LineMap[] | null>>();

async function originalPosition(url: string, line: number, column: number): Promise<{ line: number; column: number } | null> {
  let map = maps.get(url);
  if (!map) {
    map = fetch(url)
      .then((r) => (r.ok ? r.text() : ''))
      .then(inlineMap)
      .catch(() => null);
    maps.set(url, map);
  }
  const segments = (await map)?.[line - 1];
  if (!segments?.length) return null;
  // Last segment starting at or before the (1-based) column.
  let best = segments[0];
  for (const s of segments) {
    if (s[0] > column - 1) break;
    best = s;
  }
  return { line: best[1] + 1, column: best[2] + 1 };
}

function inlineMap(code: string): LineMap[] | null {
  const m = /\/\/# sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,([A-Za-z0-9+/=]+)\s*$/.exec(code);
  if (!m) return null;
  const bytes = Uint8Array.from(atob(m[1]), (c) => c.charCodeAt(0));
  const { mappings } = JSON.parse(new TextDecoder().decode(bytes)) as { mappings: string };
  return decodeMappings(mappings);
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decode source map v3 "mappings" (base64 VLQ; source fields are cumulative across lines). */
function decodeMappings(mappings: string): LineMap[] {
  const lines: LineMap[] = [];
  let srcLine = 0;
  let srcCol = 0;
  for (const text of mappings.split(';')) {
    const segments: LineMap = [];
    let genCol = 0;
    for (const seg of text.split(',')) {
      if (!seg) continue;
      const v = vlq(seg);
      genCol += v[0];
      if (v.length < 4) continue;
      srcLine += v[2];
      srcCol += v[3];
      segments.push([genCol, srcLine, srcCol]);
    }
    lines.push(segments);
  }
  return lines;
}

function vlq(segment: string): number[] {
  const out: number[] = [];
  let value = 0;
  let shift = 0;
  for (const ch of segment) {
    const digit = B64.indexOf(ch);
    value += (digit & 31) << shift;
    if (digit & 32) shift += 5;
    else {
      out.push(value & 1 ? -(value >>> 1) : value >>> 1);
      value = shift = 0;
    }
  }
  return out;
}
