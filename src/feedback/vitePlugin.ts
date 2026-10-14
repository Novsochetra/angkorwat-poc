import { mkdir, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { loadEnv, type Logger, type Plugin } from 'vite';
import { fileTicket, trackerConfig, type ReportToFile, type TrackerConfig } from './tracker.ts';

/**
 * Receives reports from the in-game feedback tool (src/feedback/FeedbackTool.ts):
 * `POST /__feedback` writes `feedback/<name>/report.md` + `screenshot.jpg` into
 * the project, where Claude can read them. Works under `npm run dev` and
 * `vite preview`. Anyone who can reach the dev server can add a report, but only
 * as a new folder of those two files under feedback/.
 *
 * Once the folder is saved, a world map report also becomes a ticket in the
 * tracker (src/feedback/tracker.ts, which adds `ticket.json` with its key to
 * the folder; TRACKER_TOKEN in .env). The folder stays whatever the tracker
 * answers; without a token only the folder is saved. The terminal says how it
 * went, or why no ticket was made.
 */
export function feedbackPlugin(dir = 'feedback'): Plugin {
  let root = process.cwd();
  let tracker: TrackerConfig | string = 'TRACKER_TOKEN is not set in .env';
  const handler = (logger: Logger) => async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end('POST a report');
      return;
    }
    try {
      const body = JSON.parse(await readBody(req, 32 << 20)) as { name?: string; markdown?: string; image?: string };
      if (typeof body.markdown !== 'string') throw new Error('missing markdown');
      const base = String(body.name ?? '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80) || 'report';
      await mkdir(join(root, dir), { recursive: true });
      let name = base;
      for (let n = 2; !(await createDir(join(root, dir, name))); n++) name = `${base}-${n}`;
      const image = body.image ? Buffer.from(body.image, 'base64') : null;
      await writeFile(join(root, dir, name, 'report.md'), body.markdown);
      if (image) await writeFile(join(root, dir, name, 'screenshot.jpg'), image);
      const folder = `${dir}/${name}`;
      logger.info(`feedback saved → ${folder}/`, { timestamp: true });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ dir: folder }));
      // After the answer, so saving is as quick as before; the terminal says how it went.
      void makeTicket(tracker, logger, { name: base, folder, path: join(root, dir, name), inbox: join(root, dir), markdown: body.markdown, image });
    } catch (err) {
      res.statusCode = 400;
      res.end(String(err));
    }
  };
  return {
    name: 'angkor-feedback',
    configResolved(config) {
      root = config.root;
      // Not VITE_-prefixed, so the game never sees them; read here on the dev machine only.
      tracker = trackerConfig(loadEnv(config.mode, config.envDir, 'TRACKER_'));
    },
    configureServer(server) {
      server.middlewares.use('/__feedback', handler(server.config.logger));
    },
    configurePreviewServer(server) {
      server.middlewares.use('/__feedback', handler(server.config.logger));
    },
  };
}

/** The world map's reports (index.html) become tickets; the other pages are postponed and only save their folder. */
const TICKET_PAGES = new Set(['index.html']);

/** Makes a world map report's tracker ticket, or says in the terminal why there is none. Never throws. */
async function makeTicket(tracker: TrackerConfig | string, logger: Logger, report: ReportToFile): Promise<void> {
  const page = /^- \*\*Page:\*\* `([^`]+)`/m.exec(report.markdown)?.[1] ?? '';
  const none = (why: string) => logger.warn(`feedback: no tracker ticket for ${report.folder}/ (${why}); the folder is saved`, { timestamp: true });
  if (!TICKET_PAGES.has(page)) return;
  if (typeof tracker === 'string') return none(tracker);
  try {
    const t = await fileTicket(tracker, report);
    logger.info(`feedback: ${t.repeat ? 'already the tracker ticket' : 'tracker ticket'} ${t.key} → ${t.url}`, { timestamp: true });
  } catch (err) {
    none(err instanceof Error ? err.message : String(err));
  }
}

/** mkdir that reports whether it created the folder (false if it already exists). */
async function createDir(path: string): Promise<boolean> {
  try {
    await mkdir(path);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  }
}

function readBody(req: IncomingMessage, limit: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('report too large'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
