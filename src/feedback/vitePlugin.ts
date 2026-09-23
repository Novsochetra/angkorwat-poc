import { mkdir, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Logger, Plugin } from 'vite';

/**
 * Receives reports from the in-game feedback tool (src/feedback/FeedbackTool.ts):
 * `POST /__feedback` writes `feedback/<name>/report.md` + `screenshot.jpg` into
 * the project, where Claude can read them. Works under `npm run dev` and
 * `vite preview`. Anyone who can reach the dev server can add a report, but only
 * as a new folder of those two files under feedback/.
 */
export function feedbackPlugin(dir = 'feedback'): Plugin {
  let root = process.cwd();
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
      await writeFile(join(root, dir, name, 'report.md'), body.markdown);
      if (body.image) await writeFile(join(root, dir, name, 'screenshot.jpg'), Buffer.from(body.image, 'base64'));
      logger.info(`feedback saved → ${dir}/${name}/`, { timestamp: true });
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ dir: `${dir}/${name}` }));
    } catch (err) {
      res.statusCode = 400;
      res.end(String(err));
    }
  };
  return {
    name: 'angkor-feedback',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use('/__feedback', handler(server.config.logger));
    },
    configurePreviewServer(server) {
      server.middlewares.use('/__feedback', handler(server.config.logger));
    },
  };
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
