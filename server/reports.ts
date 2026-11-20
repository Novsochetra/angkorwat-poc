/**
 * Reports (docs/discussion/new-year-online.md "Names" and "Safety"): a player reports another's name or behaviour.
 * Different reporters are counted per target (by the target's device, a salted hash of its random id, in memory only);
 * at `LIMITS.reportsToHide` the target's name shows as "Player" to everyone, and that name stays hidden for whoever
 * uses it, for as long as this server runs (the night). Each report also files a tracker ticket (project AWP, like the
 * bug button: src/feedback/tracker.ts) when TRACKER_TOKEN is set, never more than one per target an hour.
 * Nothing about the players goes into a ticket but the reported name, the room and the counts.
 */
import { createHash } from 'node:crypto';
import { LIMITS } from '../src/net/protocol.ts';
import type { TrackerConfig } from '../src/feedback/tracker.ts';

/** How the tracker's activity names us. */
const ACTOR_NAME = 'NYE server';
/** One ticket per target an hour; and at most this many tickets an hour in all (a flood of reports stays a trickle). */
const TICKET_EVERY_MS = 60 * 60 * 1000;
const TICKETS_PER_HOUR = 30;
/** A reporter's reports an hour (more are ignored). */
const REPORTS_PER_HOUR = 10;
/** Targets kept in memory at most (oldest forgotten first; far more than a night brings). */
const MAX_TARGETS = 50_000;

export interface ReportTarget {
  device: string;
  name: string;
  room: string;
  crowd: number;
}
export interface ReportResult {
  /** Counted (a new reporter for this target). */
  counted: boolean;
  /** Different reporters so far. */
  count: number;
  /** The name became hidden with this report. */
  hiddenNow: boolean;
}

interface Target {
  reporters: Set<string>;
  lastTicket: number;
  name: string;
}

export const nameKey = (name: string): string => name.normalize('NFC').toLowerCase().replace(/\s+/gu, ' ').trim();

export class Reports {
  private targets = new Map<string, Target>();
  private hiddenDevices = new Set<string>();
  private hiddenNames = new Set<string>();
  private byReporter = new Map<string, number[]>();
  private tickets: number[] = [];
  private tracker: TrackerConfig | null;
  private log: (line: string) => void;
  /** Tickets filed (or tried) since start, for /health. */
  filed = 0;
  failed = 0;

  constructor(tracker: TrackerConfig | null, log: (line: string) => void) {
    this.tracker = tracker;
    this.log = log;
  }

  /** Shown as "Player": the device was hidden, or the name was. */
  isHidden(device: string, name: string): boolean {
    return this.hiddenDevices.has(device) || this.hiddenNames.has(nameKey(name));
  }

  get hiddenCount(): number {
    return this.hiddenDevices.size;
  }

  report(reporter: string, target: ReportTarget, reason: 'name' | 'behaviour', now = Date.now()): ReportResult {
    const mine = (this.byReporter.get(reporter) ?? []).filter((t) => now - t < 3600_000);
    if (mine.length >= REPORTS_PER_HOUR || reporter === target.device) {
      this.byReporter.set(reporter, mine);
      return { counted: false, count: this.targets.get(target.device)?.reporters.size ?? 0, hiddenNow: false };
    }
    let t = this.targets.get(target.device);
    if (!t) {
      if (this.targets.size >= MAX_TARGETS) this.targets.delete(this.targets.keys().next().value!);
      t = { reporters: new Set(), lastTicket: -Infinity, name: target.name };
      this.targets.set(target.device, t);
    }
    t.name = target.name;
    const counted = !t.reporters.has(reporter);
    if (counted) {
      t.reporters.add(reporter);
      mine.push(now);
    }
    this.byReporter.set(reporter, mine);
    let hiddenNow = false;
    if (t.reporters.size >= LIMITS.reportsToHide && !this.hiddenDevices.has(target.device)) {
      this.hiddenDevices.add(target.device);
      this.hiddenNames.add(nameKey(target.name));
      hiddenNow = true;
      this.log(`[nye] a name was hidden after ${t.reporters.size} reports (room ${target.room}, crowd ${target.crowd})`);
    }
    if (counted) this.ticket(target, t, reason, hiddenNow, now);
    return { counted, count: t.reporters.size, hiddenNow };
  }

  /** Forget reporters' hourly counts that ran out (called once a minute). */
  prune(now = Date.now()): void {
    for (const [k, list] of this.byReporter) {
      const keep = list.filter((t) => now - t < 3600_000);
      if (keep.length) this.byReporter.set(k, keep);
      else this.byReporter.delete(k);
    }
    this.tickets = this.tickets.filter((t) => now - t < 3600_000);
  }

  private ticket(target: ReportTarget, t: Target, reason: 'name' | 'behaviour', hiddenNow: boolean, now: number): void {
    const cfg = this.tracker;
    if (!cfg) return;
    if (now - t.lastTicket < TICKET_EVERY_MS && !hiddenNow) return;
    this.tickets = this.tickets.filter((x) => now - x < 3600_000);
    if (this.tickets.length >= TICKETS_PER_HOUR) return;
    t.lastTicket = now;
    this.tickets.push(now);
    const hidden = this.hiddenDevices.has(target.device);
    const title = (reason === 'name' ? `Name report: ${target.name}` : `Player report: ${target.name} (behaviour)`).slice(0, 200);
    const description = [
      `A player reported ${reason === 'name' ? 'a name' : "a player's behaviour"} in the New Year's Eve online rooms (the live server, server/).`,
      '',
      `- Name: ${target.name}`,
      `- Reason: ${reason}`,
      `- Room: ${target.room}, crowd ${target.crowd}`,
      `- Different players who reported it tonight: ${t.reporters.size}`,
      `- Hidden for everyone ("Player"): ${hidden ? 'yes' : `no (at ${LIMITS.reportsToHide} reports)`}`,
      `- Server time: ${new Date(now).toISOString()}`,
      '',
      'No personal data is kept: a player is a random id, held in memory for the night only. A hidden name stays hidden',
      'until the server restarts. At most one ticket per player an hour.',
    ].join('\n');
    // The tracker answers a repeat clientId with the ticket the first one made: one ticket per target an hour.
    const clientId = `nye-report-${createHash('sha256').update(target.device).digest('hex').slice(0, 16)}-${Math.floor(now / TICKET_EVERY_MS)}${hiddenNow ? '-h' : ''}`;
    void fetch(`${cfg.url}/api/projects/${encodeURIComponent(cfg.project)}/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.token}`, 'x-actor-kind': 'agent', 'x-actor-name': ACTOR_NAME },
      body: JSON.stringify({ title, description, attachmentIds: [], clientId }),
      signal: AbortSignal.timeout(30_000),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`the tracker answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
        const ticket = (await res.json()) as { key?: string };
        this.filed++;
        this.log(`[nye] report filed as ${ticket.key ?? 'a ticket'}`);
      })
      .catch((err: unknown) => {
        this.failed++;
        this.log(`[nye] report ticket failed: ${(err as Error).message}`);
      });
  }
}
