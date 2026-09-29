import { spawn, type ChildProcess } from 'node:child_process';
import { createReadStream } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream';
import type { Plugin, ViteDevServer } from 'vite';
import { safeName, WALLPAPER_DIR, WALLPAPER_ENDPOINT, type VideoCodec, type WallpaperFlight, type WallpaperJob, type WallpaperList, type WallpaperView } from './wallpaperTypes.ts';

/**
 * The free camera's saved views and flights (src/map/dev/freecam.ts), kept in
 * `wallpapers/` in the project, and the render jobs that draw them
 * (scripts/wallpaper.mjs). Dev server only (`apply: 'serve'`): a build or
 * `vite preview` has none of it. It answers this computer only, and only a
 * page of this dev server (a render starts a process).
 *
 *   GET    /__wallpaper/list            saved views and flights, and what is drawn
 *   POST   /__wallpaper/view            save a view (replaces the one of the same name)
 *   POST   /__wallpaper/flight          save a flight
 *   DELETE /__wallpaper/view?name=      forget a view (its picture stays)
 *   DELETE /__wallpaper/flight?name=    forget a flight
 *   POST   /__wallpaper/render          { names, codec? } start drawing them (a video as `hevc` or `h264`): { id }
 *   POST   /__wallpaper/cancel          stop the render that is running
 *   GET    /__wallpaper/job?id=         how far a render is
 *   GET    /__wallpaper/file/<path>     a picture or video under wallpapers/
 *   GET    /__wallpaper/thumb/<name>    a small JPEG of what was drawn (made with ffmpeg, kept in wallpapers/out/.thumbs/)
 *   POST   /__wallpaper/reveal?name=    show what was drawn in the Finder
 */
export function wallpaperPlugin(): Plugin {
  let root = process.cwd();
  return {
    name: 'angkor-wallpaper',
    apply: 'serve',
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      const wallpapers = new Wallpapers(server, () => root);
      server.middlewares.use(WALLPAPER_ENDPOINT, (req, res) => {
        wallpapers.handle(req, res).catch((err: unknown) => reply(res, 500, String(err)));
      });
    },
  };
}

const LOCAL = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
/** The host a page of this computer's dev server is opened at (not a name that points here from another site). */
const LOCAL_HOST = /^(([a-z0-9-]+\.)*localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;

/** Only this computer, asked by a page of this dev server: a page of another site must not start renders or write files. */
function fromHere(req: IncomingMessage): boolean {
  if (!LOCAL.has(req.socket.remoteAddress ?? '') || !LOCAL_HOST.test(req.headers.host ?? '')) return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}
const TYPES: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.json': 'application/json' };
const LIMIT = 24 << 20;
/** Lines of a job's log kept for the panel. */
const LOG_LINES = 40;
/** A thumbnail's width (px: the panel's picture at a 2× screen), and how many ffmpeg makes at once. */
const THUMB_W = 560;
const THUMB_JOBS = 2;

class Wallpapers {
  private job: WallpaperJob | null = null;
  private child: ChildProcess | null = null;
  private jobs = 0;
  /** The last change of views.json: the next waits for it (read, change, write are one step). */
  private lock: Promise<unknown> = Promise.resolve();
  /** Thumbnails being made (name → done), and ffmpeg's turns. */
  private readonly making = new Map<string, Promise<void>>();
  private thumbJobs = 0;
  private readonly thumbWait: (() => void)[] = [];
  private readonly server: ViteDevServer;
  private readonly root: () => string;

  // (plain fields, not parameter properties: Vite's native config loader strips types and cannot read those)
  constructor(server: ViteDevServer, root: () => string) {
    this.server = server;
    this.root = root;
  }

  private get dir(): string {
    return join(this.root(), WALLPAPER_DIR);
  }
  private get viewsFile(): string {
    return join(this.dir, 'views.json');
  }
  private flightFile(name: string): string {
    return join(this.dir, 'paths', `${name}.json`);
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (!fromHere(req)) return reply(res, 403, 'This computer only, from this dev server');
    const url = new URL(req.url ?? '/', 'http://localhost');
    const route = url.pathname;
    const method = req.method ?? 'GET';
    try {
      if (method === 'GET' && route === '/list') return json(res, await this.list());
      if (method === 'POST' && route === '/view') return json(res, await this.saveView(JSON.parse(await body(req))));
      if (method === 'POST' && route === '/flight') return json(res, await this.saveFlight(JSON.parse(await body(req))));
      if (method === 'DELETE' && route === '/view') return json(res, await this.forgetView(safeName(url.searchParams.get('name') ?? '')));
      if (method === 'DELETE' && route === '/flight') return json(res, await this.forgetFlight(safeName(url.searchParams.get('name') ?? '')));
      if (method === 'POST' && route === '/render') return json(res, await this.render(JSON.parse(await body(req))));
      if (method === 'POST' && route === '/cancel') return json(res, this.cancel());
      if (method === 'GET' && route === '/job') {
        const job = this.job;
        return job && job.id === url.searchParams.get('id') ? json(res, job) : reply(res, 404, 'No such job');
      }
      if (method === 'GET' && route.startsWith('/file/')) return await this.file(req, res, decodeURIComponent(route.slice('/file/'.length)));
      if (method === 'GET' && route.startsWith('/thumb/')) return await this.thumb(req, res, safeName(decodeURIComponent(route.slice('/thumb/'.length))));
      if (method === 'POST' && route === '/reveal') return json(res, await this.reveal(safeName(url.searchParams.get('name') ?? '')));
      reply(res, 404, 'Not found');
    } catch (err) {
      reply(res, 400, err instanceof Error ? err.message : String(err));
    }
  }

  // ── Views and flights ──────────────────────────────────────────────────────

  /** The saved views. No file is none; a file that is not a list of views is an error, so that a save never wipes what a typo hides. */
  private async readViews(): Promise<WallpaperView[]> {
    let text: string;
    try {
      text = await readFile(this.viewsFile, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
    let views: unknown;
    try {
      views = JSON.parse(text);
    } catch (err) {
      throw new Error(`${WALLPAPER_DIR}/views.json is not valid JSON (${(err as Error).message}): fix it or delete it. Nothing was changed`);
    }
    if (!Array.isArray(views)) throw new Error(`${WALLPAPER_DIR}/views.json is not a list: fix it or delete it. Nothing was changed`);
    return views as WallpaperView[];
  }

  /** One view a line: short to read, and a change shows as one line in a diff. */
  private async writeViews(views: WallpaperView[]): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    const tmp = `${this.viewsFile}.${process.pid}.tmp`;
    await writeFile(tmp, `[\n${views.map((v) => `  ${JSON.stringify(v)}`).join(',\n')}\n]\n`);
    await rename(tmp, this.viewsFile);
  }

  /** Change the saved views: the change waits for the one before it (two saves at once must not lose a view). */
  private changeViews(change: (views: WallpaperView[]) => WallpaperView[]): Promise<void> {
    const run = this.lock.then(async () => this.writeViews(change(await this.readViews())));
    this.lock = run.catch(() => undefined);
    return run;
  }

  private async flightNames(): Promise<string[]> {
    const files = await readdir(join(this.dir, 'paths')).catch(() => [] as string[]);
    return files.filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5));
  }

  private async list(): Promise<WallpaperList> {
    const views = await this.readViews();
    const flights: WallpaperList['flights'] = [];
    for (const name of await this.flightNames()) {
      try {
        const f = JSON.parse(await readFile(this.flightFile(name), 'utf8')) as WallpaperFlight;
        flights.push({ name: f.name, w: f.w, h: f.h, fps: f.fps, seconds: f.samples.length / f.fps, loop: f.loop === true, saved: f.saved });
      } catch {
        // (a file that is not a flight: left out)
      }
    }
    const out = await this.drawnFiles();
    const drawn: Record<string, number> = {};
    for (const [name, file] of Object.entries(out)) drawn[name] = (await stat(join(this.dir, file)).catch(() => null))?.mtimeMs ?? 0;
    return { views, flights, out, drawn };
  }

  /** What is drawn: name → file under wallpapers/. */
  private async drawnFiles(): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    for (const file of await readdir(join(this.dir, 'out')).catch(() => [] as string[])) {
      const m = /^(.+)\.(png|jpg|mp4)$/.exec(file);
      if (m) out[m[1]] = `out/${file}`;
    }
    return out;
  }

  private async saveView(raw: Partial<WallpaperView>): Promise<WallpaperList> {
    const name = safeName(String(raw.name ?? ''));
    if (!name) throw new Error('A view needs a name');
    if (!Array.isArray(raw.cam) || raw.cam.length !== 7 || !raw.cam.every(Number.isFinite)) throw new Error('cam: seven numbers');
    const [w, h] = [Number(raw.w), Number(raw.h)];
    if (!(w >= 64 && w <= 16384 && h >= 64 && h <= 16384)) throw new Error('size: 64 to 16384 pixels');
    if ((await this.flightNames()).includes(name)) throw new Error(`"${name}" is a flight: pick another name`);
    const view: WallpaperView = {
      name,
      cam: raw.cam.map(Number),
      w: Math.round(w),
      h: Math.round(h),
      shape: String(raw.shape ?? ''),
      query: String(raw.query ?? ''),
      noExplorer: raw.noExplorer !== false,
      ...screenH(raw.screenH),
      saved: new Date().toISOString(),
    };
    await this.changeViews((views) => {
      const at = views.findIndex((v) => v.name === name);
      if (at >= 0) views[at] = view;
      else views.push(view);
      return views;
    });
    this.server.config.logger.info(`wallpaper view saved → ${WALLPAPER_DIR}/views.json (${name})`, { timestamp: true });
    return this.list();
  }

  private async saveFlight(raw: Partial<WallpaperFlight>): Promise<WallpaperList> {
    const name = safeName(String(raw.name ?? ''));
    if (!name) throw new Error('A flight needs a name');
    const rows = raw.samples;
    if (!Array.isArray(rows) || rows.length < 2 || rows.length > 40000 || !rows.every((r) => Array.isArray(r) && r.length === 8 && r.every(Number.isFinite))) throw new Error('samples: rows of eight numbers');
    const [w, h, fps] = [Number(raw.w), Number(raw.h), Number(raw.fps)];
    if (!(w >= 64 && w <= 16384 && h >= 64 && h <= 16384)) throw new Error('size: 64 to 16384 pixels');
    if (!(fps >= 1 && fps <= 120)) throw new Error('fps: 1 to 120');
    if ((await this.readViews()).some((v) => v.name === name)) throw new Error(`"${name}" is a view: pick another name`);
    const even = (v: number) => Math.round(v / 2) * 2;
    const flight: WallpaperFlight = {
      name,
      w: even(w),
      h: even(h),
      fps,
      frozen: raw.frozen === true,
      t0: Number(raw.t0) || 0,
      query: String(raw.query ?? ''),
      noExplorer: raw.noExplorer !== false,
      ...screenH(raw.screenH),
      samples: rows,
      loop: raw.loop === true,
      kind: String(raw.kind ?? '').slice(0, 40),
      saved: new Date().toISOString(),
    };
    await mkdir(join(this.dir, 'paths'), { recursive: true });
    const { samples, ...head } = flight;
    const text = `{\n${Object.entries(head)
      .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join(',\n')},\n  "samples": [\n${samples.map((r) => `    ${JSON.stringify(r)}`).join(',\n')}\n  ]\n}\n`;
    await writeFile(this.flightFile(name), text);
    this.server.config.logger.info(`wallpaper flight saved → ${WALLPAPER_DIR}/paths/${name}.json (${(samples.length / fps).toFixed(1)} s)`, { timestamp: true });
    return this.list();
  }

  private async forgetView(name: string): Promise<WallpaperList> {
    await this.changeViews((views) => views.filter((v) => v.name !== name));
    return this.list();
  }

  private async forgetFlight(name: string): Promise<WallpaperList> {
    if (name) await rm(this.flightFile(name), { force: true });
    return this.list();
  }

  // ── Rendering ──────────────────────────────────────────────────────────────

  /** Draw views and flights with scripts/wallpaper.mjs, on this dev server (one job at a time: the graphics card is shared). */
  private async render(raw: { names?: unknown; codec?: unknown }): Promise<WallpaperJob> {
    const codec: VideoCodec = raw.codec === 'h264' ? 'h264' : 'hevc';
    const names = (Array.isArray(raw.names) ? raw.names : []).map((n) => safeName(String(n))).filter(Boolean);
    if (!names.length) throw new Error('Nothing to render');
    if (this.job?.status === 'running') throw new Error('A render is running: wait for it, or stop it');
    // (claimed now: a second request that comes while the names are checked finds it taken)
    const previous = this.job;
    const job: WallpaperJob = { id: String(++this.jobs), names, status: 'running', log: [], now: null, files: [] };
    this.job = job;
    try {
      const known = new Set([...(await this.readViews()).map((v) => v.name), ...(await this.flightNames())]);
      for (const n of names) if (!known.has(n)) throw new Error(`No view or flight called "${n}"`);
    } catch (err) {
      this.job = previous;
      throw err;
    }
    const addr = this.server.httpServer?.address();
    const port = addr && typeof addr === 'object' ? (addr as AddressInfo).port : 5173;
    const child = spawn(process.execPath, [join(this.root(), 'scripts/wallpaper.mjs'), `only=${names.join(',')}`, `codec=${codec}`, `base=http://127.0.0.1:${port}`], { cwd: this.root(), stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;
    // (a render does not outlive the dev server: a restart, for one, would leave it running with nobody to ask)
    const stop = () => void child.kill();
    this.server.httpServer?.once('close', stop);
    const line = (text: string) => {
      const [tag, name, a, b] = text.split(' ');
      if (tag === '@@progress') job.now = { name, done: Number(a), total: Number(b) };
      else if (tag === '@@done') job.files.push({ name, file: a });
      else if (tag === '@@fail') job.error = text.slice('@@fail '.length);
      job.log.push(text);
      if (job.log.length > LOG_LINES) job.log.shift();
    };
    for (const stream of [child.stdout, child.stderr]) {
      let rest = '';
      stream.on('data', (chunk: Buffer) => {
        const lines = (rest + chunk.toString('utf8')).split('\n');
        rest = lines.pop() ?? '';
        for (const l of lines) if (l.trim()) line(l);
      });
      stream.on('end', () => rest.trim() && line(rest));
    }
    child.on('error', (err) => {
      job.status = 'failed';
      job.error = err.message;
    });
    child.on('close', (code) => {
      this.server.httpServer?.off('close', stop);
      if (this.child === child) this.child = null;
      if (job.status === 'running') job.status = code === 0 && !job.error ? 'done' : 'failed';
      job.now = null;
      this.server.config.logger.info(`wallpaper render ${job.status}: ${names.join(', ')}`, { timestamp: true });
    });
    return job;
  }

  /** Stop the render that is running. */
  private cancel(): { stopped: boolean } {
    const job = this.job;
    if (!job || job.status !== 'running' || !this.child) return { stopped: false };
    job.error = 'Stopped';
    this.child.kill();
    return { stopped: true };
  }

  /** A small JPEG of a drawn picture (a video's first frame), made when it is first asked for or the picture is newer. */
  private async thumb(req: IncomingMessage, res: ServerResponse, name: string): Promise<void> {
    const file = (await this.drawnFiles())[name];
    if (!name || !file) return reply(res, 404, 'Not drawn');
    const thumb = join(this.dir, 'out', '.thumbs', `${name}.jpg`);
    const [src, made] = await Promise.all([stat(join(this.dir, file)), stat(thumb).catch(() => null)]);
    if (!made || made.mtimeMs < src.mtimeMs) {
      let job = this.making.get(name);
      if (!job) {
        job = this.turn(() => makeThumb(join(this.dir, file), thumb)).finally(() => this.making.delete(name));
        this.making.set(name, job);
      }
      await job;
    }
    await this.file(req, res, `out/.thumbs/${name}.jpg`);
  }

  /** Run `make` when ffmpeg has a turn (a gallery asks for many at once). */
  private async turn(make: () => Promise<void>): Promise<void> {
    while (this.thumbJobs >= THUMB_JOBS) await new Promise<void>((r) => this.thumbWait.push(r));
    this.thumbJobs++;
    try {
      await make();
    } finally {
      this.thumbJobs--;
      this.thumbWait.shift()?.();
    }
  }

  /** Show a drawn file in the Finder (another system: its folder). */
  private async reveal(name: string): Promise<{ shown: boolean }> {
    const file = (await this.drawnFiles())[name];
    if (!name || !file) throw new Error('Not drawn yet');
    const full = join(this.dir, file);
    const child = process.platform === 'darwin' ? spawn('open', ['-R', full]) : spawn(process.platform === 'win32' ? 'explorer' : 'xdg-open', [dirname(full)]);
    child.on('error', () => undefined);
    return { shown: true };
  }

  /** A picture or video under `wallpapers/`, with byte ranges (a video seeks by them). */
  private async file(req: IncomingMessage, res: ServerResponse, rel: string): Promise<void> {
    const full = resolve(this.dir, rel);
    const type = TYPES[extname(full).toLowerCase()];
    if (!full.startsWith(this.dir + sep) || !type) return reply(res, 403, 'Not a wallpaper file');
    const size = (await stat(full).catch(() => null))?.size;
    if (size === undefined) return reply(res, 404, 'No such file');
    res.setHeader('Content-Type', type);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Accept-Ranges', 'bytes');
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
    if (range && (range[1] || range[2])) {
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
      if (start > end || start >= size) {
        res.statusCode = 416;
        res.setHeader('Content-Range', `bytes */${size}`);
        return void res.end();
      }
      res.statusCode = 206;
      res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
      res.setHeader('Content-Length', end - start + 1);
      pipeline(createReadStream(full, { start, end }), res, () => undefined);
      return;
    }
    res.setHeader('Content-Length', size);
    pipeline(createReadStream(full), res, () => undefined);
  }
}

/** A saved frame height (px), when it is one. */
function screenH(v: unknown): { screenH?: number } {
  const h = Math.round(Number(v));
  return h >= 16 && h <= 16384 ? { screenH: h } : {};
}

/** A thumbnail with ffmpeg: the first frame, `THUMB_W` wide (written beside, then moved: a half-made one is never served). */
function makeThumb(src: string, out: string): Promise<void> {
  return new Promise((done, fail) => {
    const tmp = `${out}.${process.pid}.tmp.jpg`;
    void mkdir(dirname(out), { recursive: true }).then(() => {
      const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-frames:v', '1', '-vf', `scale=${THUMB_W}:-2`, '-q:v', '4', tmp], { stdio: ['ignore', 'ignore', 'pipe'] });
      let err = '';
      ff.stderr.on('data', (c: Buffer) => (err += c.toString()));
      ff.on('error', (e) => fail(new Error(`ffmpeg: ${e.message} (brew install ffmpeg)`)));
      ff.on('close', (code) => {
        if (code !== 0) return fail(new Error(`ffmpeg: ${err.trim().split('\n').pop() ?? code}`));
        rename(tmp, out).then(done, fail);
      });
    }, fail);
  });
}

function json(res: ServerResponse, value: unknown): void {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
}

function reply(res: ServerResponse, status: number, text: string): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(text);
}

function body(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > LIMIT) {
        reject(new Error('Too much data'));
        req.destroy();
      } else chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
