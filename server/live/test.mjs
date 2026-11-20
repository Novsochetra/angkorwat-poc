// `npm test` in server/live: the party rules and the HTTP routes, with a stand-in
// for the voice server. Tickets are checked by verifying them as LiveKit would.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenVerifier } from 'livekit-server-sdk';
import { Parties, PartyError, checkName, normalizeCode, CODE_ALPHABET, MAX_MEMBERS } from './parties.mjs';
import { createLiveServer } from './server.mjs';

const ids = Array.from({ length: 12 }, (_, i) => `player-${String(i).padStart(4, '0')}`);

test('codes: six letters, no look-alikes, typed loosely', () => {
  const p = new Parties();
  for (let i = 0; i < 200; i++) {
    const { code } = p.make(ids[0], 'Dara');
    assert.equal(code.length, 6);
    for (const ch of code) assert.ok(CODE_ALPHABET.includes(ch));
    assert.ok(!/[0O1IL]/.test(code));
  }
  assert.equal(normalizeCode(' k7q-m2p '.replace('-', '')), 'K7QM2P');
  assert.throws(() => normalizeCode('K7QM2O'), PartyError);
});

test('names: Khmer and Latin pass, links, numbers and staff names do not', () => {
  assert.equal(checkName('  ដារ៉ា  '), 'ដារ៉ា');
  assert.equal(checkName('Sok Dara'), 'Sok Dara');
  for (const bad of ['a', 'x'.repeat(17), 'call 0123456', 'www.site', 'Admin', 'hi<b>', 'a.com']) {
    assert.throws(() => checkName(bad), PartyError, bad);
  }
});

test('a party holds eight; a ninth is refused; the same player again is not a ninth', () => {
  const p = new Parties();
  const { code } = p.make(ids[0], 'Dara');
  for (let i = 1; i < MAX_MEMBERS; i++) p.join(code, ids[i], `Friend ${'ABCDEFGH'[i]}`);
  assert.throws(() => p.join(code, ids[MAX_MEMBERS], 'Late'), { code: 'full' });
  const again = p.join(code, ids[3], 'Friend D');
  assert.equal(p.state(code, ids[3], again.key).members.length, MAX_MEMBERS);
});

test('a key is needed for everything, and an old key stops on rejoining', () => {
  const p = new Parties();
  const { code } = p.make(ids[0], 'Dara');
  const first = p.join(code, ids[1], 'Vanna');
  assert.throws(() => p.state(code, ids[1], 'wrong'), { code: 'not-member' });
  assert.throws(() => p.state(code, ids[2], first.key), { code: 'not-member' });
  const second = p.join(code, ids[1], 'Vanna');
  assert.throws(() => p.state(code, ids[1], first.key), { code: 'not-member' });
  assert.ok(p.state(code, ids[1], second.key));
});

test('the maker removes a member, who cannot come back; others cannot remove', () => {
  const p = new Parties();
  const maker = p.make(ids[0], 'Dara');
  const a = p.join(maker.code, ids[1], 'Vanna');
  p.join(maker.code, ids[2], 'Sophea');
  assert.throws(() => p.remove(maker.code, ids[1], a.key, ids[2]), { code: 'not-maker' });
  p.remove(maker.code, ids[0], maker.key, ids[2]);
  assert.throws(() => p.join(maker.code, ids[2], 'Sophea'), { code: 'removed' });
  assert.equal(p.state(maker.code, ids[0], maker.key).members.length, 2);
});

test('the maker leaves: the longest-standing member becomes the maker; the last one out ends it', () => {
  let t = 1000;
  const p = new Parties({ now: () => t });
  const maker = p.make(ids[0], 'Dara');
  t += 10;
  const a = p.join(maker.code, ids[1], 'Vanna');
  t += 10;
  const b = p.join(maker.code, ids[2], 'Sophea');
  p.leave(maker.code, ids[0], maker.key);
  assert.equal(p.state(maker.code, ids[1], a.key).maker, ids[1]);
  p.leave(maker.code, ids[1], a.key);
  assert.equal(p.leave(maker.code, ids[2], b.key), true);
  assert.throws(() => p.join(maker.code, ids[3], 'Late'), { code: 'no-party' });
});

test('parties unused for hours are forgotten', () => {
  let t = 0;
  const p = new Parties({ now: () => t });
  const { code } = p.make(ids[0], 'Dara');
  t += 7 * 60 * 60 * 1000;
  p.sweep();
  assert.throws(() => p.join(code, ids[1], 'Vanna'), { code: 'no-party' });
});

// --- over HTTP, with a stand-in voice server ---------------------------------

const config = {
  livekitUrl: 'wss://voice.example.test',
  apiKey: 'APItest',
  apiSecret: 'a-test-secret-that-is-long-enough-for-hs256-0123456789',
  origins: ['https://morodokangkor.com'],
  roomPrefix: 'party-',
};

async function withServer(fn) {
  const calls = [];
  const rooms = {
    async createRoom(o) { calls.push(['create', o]); },
    async removeParticipant(room, id) { calls.push(['remove', room, id]); },
  };
  const { server } = createLiveServer({ config, rooms, log: () => {} });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = async (path, body, origin = 'https://morodokangkor.com') => {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: origin },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json(), cors: res.headers.get('access-control-allow-origin') };
  };
  try {
    await fn({ post, calls, base });
  } finally {
    server.close();
  }
}

test('http: make, join, ticket for the party room and the microphone only', () =>
  withServer(async ({ post, calls }) => {
    const made = await post('/party/make', { playerId: ids[0], name: 'Dara' });
    assert.equal(made.status, 200);
    assert.equal(made.cors, 'https://morodokangkor.com');
    const joined = await post('/party/join', { code: made.body.code.toLowerCase(), playerId: ids[1], name: 'Vanna' });
    assert.equal(joined.status, 200);
    assert.equal(joined.body.members.length, 2);

    const t = await post('/voice/ticket', { code: made.body.code, playerId: ids[1], key: joined.body.key });
    assert.equal(t.status, 200);
    assert.equal(t.body.url, config.livekitUrl);
    assert.equal(t.body.room, `party-${made.body.code}`);
    const claims = await new TokenVerifier(config.apiKey, config.apiSecret).verify(t.body.token);
    assert.equal(claims.sub, ids[1]);
    assert.equal(claims.name, 'Vanna');
    assert.equal(claims.video.room, `party-${made.body.code}`);
    assert.equal(claims.video.roomJoin, true);
    assert.equal(claims.video.canPublishData, false);
    assert.deepEqual(claims.video.canPublishSources, ['microphone']);
    assert.ok(!claims.video.roomAdmin && !claims.video.roomCreate && !claims.video.roomRecord);
    assert.ok(claims.exp - claims.nbf <= 600);
    assert.deepEqual(calls[0], ['create', { name: `party-${made.body.code}`, maxParticipants: 8, emptyTimeout: 600 }]);
  }));

test('http: no ticket without the key; a removed member is dropped from voice', () =>
  withServer(async ({ post, calls }) => {
    const made = await post('/party/make', { playerId: ids[0], name: 'Dara' });
    const joined = await post('/party/join', { code: made.body.code, playerId: ids[1], name: 'Vanna' });
    const stranger = await post('/voice/ticket', { code: made.body.code, playerId: ids[2], key: joined.body.key });
    assert.equal(stranger.status, 403);
    const removed = await post('/party/remove', { code: made.body.code, playerId: ids[0], key: made.body.key, target: ids[1] });
    assert.equal(removed.status, 200);
    assert.deepEqual(calls.at(-1), ['remove', `party-${made.body.code}`, ids[1]]);
    const after = await post('/voice/ticket', { code: made.body.code, playerId: ids[1], key: joined.body.key });
    assert.equal(after.status, 403);
  }));

test('http: other sites and floods are refused', () =>
  withServer(async ({ post }) => {
    const other = await post('/party/make', { playerId: ids[0], name: 'Dara' }, 'https://evil.example');
    assert.equal(other.status, 403);
    let last;
    for (let i = 0; i < 8; i++) last = await post('/party/make', { playerId: ids[0], name: 'Dara' });
    assert.equal(last.status, 429);
  }));
