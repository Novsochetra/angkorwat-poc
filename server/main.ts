/**
 * The live server's service (Railway runs `node server/main.ts`): settings from the environment, then app.ts.
 * See server/README.md for the settings and how to run and deploy it.
 */
import { trackerConfig } from '../src/feedback/tracker.ts';
import { startServer } from './app.ts';
import { NAMES_SOURCE, NAMES_STUB_WHY } from './names.ts';

const env = process.env;
const list = (v: string | undefined): string[] => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

const tracker = trackerConfig(env);
const onRailway = Boolean(env.RAILWAY_ENVIRONMENT || env.RAILWAY_ENVIRONMENT_NAME || env.RAILWAY_SERVICE_ID);

const server = await startServer({
  port: Number(env.PORT) || 8787,
  eventCode: env.EVENT_CODE,
  roomCode: env.ROOM_CODE,
  joinExempt: list(env.JOIN_LIMIT_EXEMPT),
  trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true' : onRailway,
  allowedOrigins: list(env.ALLOWED_ORIGINS),
  maxPlayers: Number(env.MAX_PLAYERS) || 5000,
  tracker: typeof tracker === 'string' ? null : tracker,
});

console.log(
  `[nye] live server on port ${server.port} · test room ${env.EVENT_CODE?.trim() ? 'open (EVENT_CODE set)' : 'closed (no EVENT_CODE)'} · event room ${env.ROOM_CODE?.trim() ? 'by code (ROOM_CODE set)' : 'open to all'} · ` +
    `reports ${typeof tracker === 'string' ? `not filed (${tracker})` : `filed to ${tracker.url} (${tracker.project})`} · ` +
    `names ${NAMES_SOURCE === 'shared' ? 'src/net/names.ts' : `STUB (src/net/names.ts: ${NAMES_STUB_WHY})`}`,
);

const stop = (sig: string): void => {
  console.log(`[nye] ${sig}: closing`);
  void server.close().then(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
};
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
