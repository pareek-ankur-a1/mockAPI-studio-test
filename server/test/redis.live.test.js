import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import express from 'express';
import { createClient } from 'redis';
import { createMockCache } from '../src/services/mockCache.js';
import { createRateLimiters } from '../src/middleware/rateLimiter.js';
import { serve } from './helpers/http.js';

test('live Redis: Lua cache invalidation, expiry, races and shared rate limits', {
  skip: !process.env.REDIS_TEST_URL && 'Set REDIS_TEST_URL to run against a real Redis server.',
}, async (t) => {
  const prefix = `mockapi-test:${randomUUID()}:`;
  const clients = [0, 1].map(() => createClient({
    url: process.env.REDIS_TEST_URL,
    disableOfflineQueue: true,
    commandOptions: { timeout: 2000 },
    socket: { connectTimeout: 2000, reconnectStrategy: false },
  }));
  for (const client of clients) client.on('error', () => {});
  t.after(async () => {
    // Only remove this test's unique namespace, never FLUSHDB or unrelated data.
    if (clients[0].isReady) {
      for await (const keys of clients[0].scanIterator({ MATCH: `${prefix}*`, COUNT: 100 })) {
        if (keys.length) await clients[0].del(keys);
      }
    }
    await Promise.all(clients.map(async (client) => { if (client.isOpen) await client.close(); }));
  });
  await Promise.all(clients.map((client) => client.connect()));
  const caches = clients.map((redisClient) => createMockCache({ redisClient, prefix, ttlSeconds: 1 }));
  assert.equal((await caches[0].remember('a', 'list', async () => 'old')).status, 'MISS');
  assert.deepEqual(await caches[1].remember('a', 'list', async () => 'unexpected'), { value: 'old', status: 'HIT' });
  await caches[0].mutate('a', async () => {});
  assert.equal((await caches[1].remember('a', 'list', async () => 'new')).value, 'new');
  await delay(1100);
  assert.equal((await caches[0].remember('a', 'list', async () => 'expired')).status, 'MISS');

  let start;
  let release;
  const started = new Promise((resolve) => { start = resolve; });
  const blocked = new Promise((resolve) => { release = resolve; });
  const pending = caches[0].remember('a', 'slow', async () => { start(); return blocked; });
  await started;
  await caches[1].invalidate('a');
  release('stale');
  assert.equal((await pending).status, 'BYPASS');
  assert.equal((await caches[1].remember('a', 'slow', async () => 'fresh')).value, 'fresh');

  const requests = [];
  for (const redisClient of clients) {
    const app = express();
    const { register } = createRateLimiters({ redisClient, prefix });
    app.get('/', register, (_req, res) => res.json({ ok: true }));
    requests.push(await serve(t, app));
  }
  const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => requests[i % 2]('/')));
  assert.equal(responses.filter((response) => response.status === 200).length, 5);
  assert.equal(responses.filter((response) => response.status === 429).length, 5);
});
