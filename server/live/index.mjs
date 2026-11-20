// Starts the live service (Railway runs `npm start` in server/live).
// Settings come from the environment: see README.md. The secret never goes in git.

import { RoomServiceClient } from 'livekit-server-sdk';
import { createLiveServer } from './server.mjs';

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`[live] ${name} is not set (see server/live/README.md)`);
    process.exit(1);
  }
  return v;
}

const config = {
  livekitUrl: need('LIVEKIT_URL'),
  apiKey: need('LIVEKIT_API_KEY'),
  apiSecret: need('LIVEKIT_API_SECRET'),
  origins: (process.env.ALLOWED_ORIGINS ?? 'https://morodokangkor.com,https://www.morodokangkor.com')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  roomPrefix: process.env.ROOM_PREFIX ?? 'party-',
};

const rooms = new RoomServiceClient(config.livekitUrl.replace(/^ws/, 'http'), config.apiKey, config.apiSecret);
const { server } = createLiveServer({ config, rooms });
const port = Number(process.env.PORT ?? 8787);
server.listen(port, () => {
  console.log(`[live] on :${port}, voice ${config.livekitUrl}, pages from ${config.origins.join(' ')}`);
});
