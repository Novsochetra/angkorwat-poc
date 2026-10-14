import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * The bug button's tracker ticket (dev server only: imported by vitePlugin.ts,
 * never by the game, so the build has none of it). After a report's folder is
 * saved, its screenshot goes up (`POST /api/attachments`) and a ticket is made
 * (`POST /api/projects/<project>/tickets`) with report.md as its text. The
 * report's name is the ticket's `clientId`: the tracker answers a repeat with
 * the ticket the first one made. The ticket's key is kept beside the report in
 * `ticket.json`; a repeat reuses the screenshot uploaded the first time, so it
 * adds no second copy to the ticket.
 *
 * Settings (.env, never VITE_-prefixed): TRACKER_TOKEN (an API token made in
 * the tracker), TRACKER_URL (default below), TRACKER_PROJECT (default AWP).
 * The shell's own values win over .env, so a script that sends a test report
 * from the map runs with `TRACKER_TOKEN=` (empty: no ticket) or a local tracker
 * in TRACKER_URL, never the real one.
 */

export const DEFAULT_TRACKER_URL = 'https://project-tracker-production-aa4f.up.railway.app';
const DEFAULT_PROJECT = 'AWP';
/** The tracker's limits (its packages/shared: ticket title 300, description 50,000, clientId 64). */
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 50_000;
const CLIENT_ID_MAX = 64;
const REQUEST_TIMEOUT_MS = 30_000;
/** The name the tracker's activity shows ("Bug button created the ticket"). */
const ACTOR_NAME = 'Bug button';
const RECORD = 'ticket.json';

export interface TrackerConfig {
  url: string;
  token: string;
  project: string;
}

/** The settings, or why no ticket can be made. */
export function trackerConfig(env: Record<string, string | undefined>): TrackerConfig | string {
  const token = env.TRACKER_TOKEN?.trim();
  if (!token) return 'TRACKER_TOKEN is not set in .env';
  const url = (env.TRACKER_URL?.trim() || DEFAULT_TRACKER_URL).replace(/\/+$/, '');
  if (!/^https?:\/\//.test(url)) return `TRACKER_URL is not an http(s) address: ${url}`;
  return { url, token, project: env.TRACKER_PROJECT?.trim() || DEFAULT_PROJECT };
}

export interface ReportToFile {
  /** The name the report was sent with (its folder's name, before any "-2"). */
  name: string;
  /** The folder it was saved in, relative to the project (e.g. feedback/2026-10-14-…). */
  folder: string;
  /** That folder on disk. */
  path: string;
  /** The feedback folder on disk, holding every report's folder. */
  inbox: string;
  markdown: string;
  image: Buffer | null;
}

export interface FiledTicket {
  key: string;
  url: string;
  /** The tracker already had it (the same report sent again). */
  repeat: boolean;
}

interface TicketRecord {
  key: string;
  url: string;
  clientId: string;
  attachmentIds: string[];
}

/** Uploads the screenshot and makes (or finds) the report's ticket; throws an Error saying why not. */
export async function fileTicket(cfg: TrackerConfig, report: ReportToFile): Promise<FiledTicket> {
  const startedAt = Date.now();
  const clientId = clientIdOf(report.name);
  const earlier = await findRecord(report.inbox, clientId);
  let attachmentIds = earlier?.attachmentIds ?? (report.image ? [await upload(cfg, report)] : []);
  const body = (ids: string[]) => ({
    title: ticketTitle(report.markdown),
    description: cutDescription(report.markdown, report.folder),
    attachmentIds: ids,
    clientId,
  });
  let ticket: { key: string; createdAt: number; updatedAt: number };
  try {
    ticket = await call(cfg, `/api/projects/${encodeURIComponent(cfg.project)}/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body(attachmentIds)),
    });
  } catch (err) {
    // The earlier screenshot is gone (its ticket was deleted in the tracker): upload it again.
    if (!earlier || !report.image || !(err instanceof TrackerAnswer) || err.status !== 400) throw err;
    attachmentIds = [await upload(cfg, report)];
    ticket = await call(cfg, `/api/projects/${encodeURIComponent(cfg.project)}/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body(attachmentIds)),
    });
  }
  const num = ticket.key.slice(ticket.key.lastIndexOf('-') + 1);
  const url = `${cfg.url}/p/${encodeURIComponent(cfg.project)}/${num}`;
  const record: TicketRecord = { key: ticket.key, url, clientId, attachmentIds };
  await writeFile(join(report.path, RECORD), `${JSON.stringify(record, null, 2)}\n`);
  // Without a record the tracker still knows a repeat: it gives back the first ticket, changed
  // since (the screenshot just uploaded was added to it) or made before this call.
  const repeat = Boolean(earlier) || ticket.updatedAt !== ticket.createdAt || ticket.createdAt < startedAt - 60_000;
  return { key: ticket.key, url, repeat };
}

/** The report's name as the tracker's clientId (at most 64 characters; a longer name keeps a hash of the rest). */
export function clientIdOf(name: string): string {
  if (name.length <= CLIENT_ID_MAX) return name;
  const hash = createHash('sha256').update(name).digest('hex').slice(0, 16);
  return `${name.slice(0, CLIENT_ID_MAX - 17)}-${hash}`;
}

/** "Bug: <first line of the note>" ("Idea: …" for an idea), from report.md's heading and quoted note. */
export function ticketTitle(markdown: string): string {
  const lines = markdown.split('\n');
  const heading = /^#\s+\S+\s+(Bug|Idea):\s*(.*)$/u.exec(lines[0] ?? '');
  const kind = heading?.[1] ?? 'Bug';
  const note = lines
    .slice(1)
    .find((l) => /^>\s*\S/.test(l))
    ?.replace(/^>\s*/, '')
    .trim();
  const line = (note && note !== '(no description)' ? note : heading?.[2]?.trim()) || 'report from the bug button';
  const title = `${kind}: ${line}`;
  return title.length <= TITLE_MAX ? title : `${title.slice(0, TITLE_MAX - 1).trimEnd()}…`;
}

/** report.md as the ticket's text, cut to the tracker's 50,000 characters (the folder keeps it whole). */
export function cutDescription(markdown: string, folder: string): string {
  if (markdown.length <= DESCRIPTION_MAX) return markdown;
  const tail = `\n\n… (cut: the whole report is ${folder}/report.md)\n`;
  let cut = markdown.slice(0, DESCRIPTION_MAX - tail.length);
  if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  return cut + tail;
}

/** The record a report sent earlier with the same name left beside it, if any. */
async function findRecord(inbox: string, clientId: string): Promise<TicketRecord | null> {
  const folders = await readdir(inbox, { withFileTypes: true }).catch(() => []);
  for (const f of folders) {
    if (!f.isDirectory()) continue;
    try {
      const r = JSON.parse(await readFile(join(inbox, f.name, RECORD), 'utf8')) as Partial<TicketRecord>;
      if (r.clientId === clientId && typeof r.key === 'string' && Array.isArray(r.attachmentIds)) return r as TicketRecord;
    } catch {
      // no record here
    }
  }
  return null;
}

async function upload(cfg: TrackerConfig, report: ReportToFile): Promise<string> {
  const file = await call<{ id: string }>(cfg, '/api/attachments', {
    method: 'POST',
    headers: { 'Content-Type': 'image/jpeg', 'x-file-name': encodeURIComponent(`${report.name}.jpg`) },
    body: new Uint8Array(report.image!),
  });
  return file.id;
}

/** The tracker answered with an error. */
class TrackerAnswer extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function call<T>(cfg: TrackerConfig, path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(cfg.url + path, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${cfg.token}`, 'x-actor-kind': 'agent', 'x-actor-name': ACTOR_NAME },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    const cause = (err as { cause?: { code?: string; message?: string } }).cause;
    const why = (err as Error).name === 'TimeoutError' ? `no answer in ${REQUEST_TIMEOUT_MS / 1000} s` : (cause?.code ?? cause?.message ?? String(err));
    throw new Error(`could not reach the tracker at ${cfg.url} (${why})`);
  }
  const text = await res.text();
  if (!res.ok) {
    let message = text.slice(0, 300);
    try {
      message = (JSON.parse(text) as { error?: { message?: string } }).error?.message ?? message;
    } catch {
      // not JSON
    }
    throw new TrackerAnswer(res.status, `the tracker answered ${res.status} to ${init.method} ${path}: ${message}`);
  }
  return JSON.parse(text) as T;
}
