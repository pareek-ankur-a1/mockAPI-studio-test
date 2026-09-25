import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createRateLimiters } from '../src/middleware/rateLimiter.js';
import { createApp } from '../src/app.js';
import { FakeRedis } from './helpers/fakeRedis.js';
import { serve } from './helpers/http.js';

function limitedApp(redisClient) {
  const app = express();
  const limiters = createRateLimiters({ redisClient });
  app.get('/register', limiters.register, (_req, res) => res.json({ ok: true }));
  app.get('/login', limiters.login, (_req, res) => res.json({ ok: true }));
  app.get('/seed/:user', (req, _res, next) => {
    req.user = { userId: req.params.user };
    next();
  }, limiters.seed, (_req, res) => res.json({ ok: true }));
  app.use((err, _req, res, _next) => res.status(err.statusCode || 500).json({ message: err.message }));
  return app;
}

test('two server instances share counters and policies remain independent', async (t) => {
  const redis = new FakeRedis();
  const first = await serve(t, limitedApp(redis));
  const second = await serve(t, limitedApp(redis));
  for (let i = 0; i < 5; i++) {
    assert.equal((await (i % 2 ? first : second)('/register')).status, 200);
  }
  const rejected = await first('/register');
  assert.equal(rejected.status, 429);
  assert.equal(rejected.headers.get('ratelimit-remaining'), '0');
  assert.ok(Number(rejected.headers.get('retry-after')) > 0);
  assert.equal(rejected.body.retryAfter, Number(rejected.headers.get('retry-after')));
  assert.equal((await second('/login')).status, 200);
  redis.now += 15 * 60_000 + 1;
  assert.equal((await second('/register')).status, 200);
});

test('seeding limits are per user even when users share an IP', async (t) => {
  const request = await serve(t, limitedApp(new FakeRedis()));
  for (let i = 0; i < 5; i++) assert.equal((await request('/seed/a')).status, 200);
  assert.equal((await request('/seed/a')).status, 429);
  assert.equal((await request('/seed/b')).status, 200);
});

test('Redis outage fails closed and recovery restores the existing counters', async (t) => {
  const redis = new FakeRedis();
  const request = await serve(t, limitedApp(redis));
  assert.equal((await request('/register')).status, 200);
  redis.isReady = false;
  assert.equal((await request('/register')).status, 503);
  redis.isReady = true;
  assert.equal((await request('/register')).headers.get('ratelimit-remaining'), '3');
});

test('adapter initialization failure is handled without an unhandled rejection', async (t) => {
  const redis = new FakeRedis();
  redis.isReady = false;
  const request = await serve(t, limitedApp(redis));
  assert.equal((await request('/register')).status, 503);
  redis.isReady = true;
  assert.equal((await request('/register')).status, 200);
});

test('login and registration routes are rate limited even without Redis', async (t) => {
  const request = await serve(t, createApp());
  const empty = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' };
  for (let i = 0; i < 5; i++) assert.equal((await request('/api/auth/register', empty)).status, 400);
  assert.equal((await request('/api/auth/register', empty)).status, 429);
  for (let i = 0; i < 20; i++) assert.equal((await request('/api/auth/login', empty)).status, 400);
  assert.equal((await request('/api/auth/login', empty)).status, 429);
});
