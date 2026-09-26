import test from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import ajv from '../src/utils/ajvInstance.js';
import { FakeRedis } from './helpers/fakeRedis.js';
import { serve } from './helpers/http.js';
import { mockDatabase, ownerId, projectId, resourceId } from './helpers/database.js';

const endpoint = '/api/mock/proj_test/products';

async function setup(t) {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'test-only-secret';
  t.after(() => {
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
    ajv.removeSchema(resourceId);
  });
  const db = mockDatabase(t);
  const redis = new FakeRedis();
  const app = createApp({ redisClient: redis });
  const request = await serve(t, app);
  const token = jwt.sign({ userId: ownerId, isVerified: true }, process.env.JWT_SECRET);
  const send = (path, method, body, authenticated = false) => request(path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { db, redis, app, request, send };
}

test('HTTP cache hits skip MongoDB; mutations invalidate lists, details and filters', async (t) => {
  const { request, send, db } = await setup(t);
  assert.equal((await request(endpoint)).headers.get('x-cache'), 'MISS');
  const reads = db.reads;
  assert.equal((await request(endpoint)).headers.get('x-cache'), 'HIT');
  assert.equal(db.reads, reads);
  const created = await send(endpoint, 'POST', { title: 'First' });
  assert.equal(created.status, 201);
  const id = created.body.data._id;
  assert.equal((await request(endpoint)).body.meta.total, 1);
  assert.equal((await request(`${endpoint}/${id}`)).body.data.title, 'First');
  assert.equal((await request(`${endpoint}/${id}`)).headers.get('x-cache'), 'HIT');
  assert.equal((await send(`${endpoint}/${id}`, 'PUT', { title: 'Updated' })).status, 200);
  assert.equal((await request(`${endpoint}/${id}`)).body.data.title, 'Updated');
  assert.equal((await request(`${endpoint}?seeded=true`)).body.meta.total, 0);
  const seeded = await send('/api/internal/seed', 'POST', { resourceId, count: 2 }, true);
  assert.equal(seeded.status, 201);
  assert.equal((await request(`${endpoint}?seeded=true`)).body.meta.total, 2);
  assert.equal((await request(`${endpoint}?seeded=false`)).body.meta.total, 1);
  assert.equal((await request(`${endpoint}?limit=1&page=2`)).body.data.length, 1);
  assert.equal((await request(`${endpoint}?page=2&limit=1`)).headers.get('x-cache'), 'HIT');
  assert.equal((await send(`${endpoint}/${id}`, 'DELETE')).status, 200);
  assert.equal((await request(`${endpoint}/${id}`)).status, 404);
  assert.equal((await request(endpoint)).body.meta.total, 2);
  assert.equal((await send(endpoint, 'DELETE')).status, 200);
  assert.equal((await request(endpoint)).body.meta.total, 0);
});

test('schema updates invalidate responses and remotely changed schemas replace compiled validators', async (t) => {
  const { request, send, db } = await setup(t);
  await send(endpoint, 'POST', { title: 'Valid' });
  await request(endpoint);
  const schema = { type: 'object', properties: { count: { type: 'integer' } }, required: ['count'] };
  // Simulate a schema update by another worker, without local ajv.removeSchema().
  db.resource.schemaDefinition = schema;
  assert.equal((await send(endpoint, 'POST', { title: 'Now invalid' })).status, 400);
  assert.equal((await send(endpoint, 'POST', { count: 1 })).status, 201);
  await request(endpoint);
  assert.equal((await send(`/api/internal/resources/${resourceId}`, 'PUT', { schemaDefinition: schema }, true)).status, 200);
  assert.equal((await request(endpoint)).headers.get('x-cache'), 'MISS');
});

test('partial seeding invalidates data and seeding requests enforce the user limit', async (t) => {
  const { request, send, db } = await setup(t);
  await request(endpoint);
  db.partialSeed = true;
  assert.equal((await send('/api/internal/seed', 'POST', { resourceId, count: 2 }, true)).status, 207);
  assert.equal((await request(endpoint)).body.meta.total, 1);
  db.partialSeed = false;
  for (let i = 0; i < 4; i++) assert.equal((await send('/api/internal/seed', 'POST', { resourceId, count: 1 }, true)).status, 201);
  assert.equal((await send('/api/internal/seed', 'POST', { resourceId, count: 1 }, true)).status, 429);
});

for (const [name, path] of [['resource', `/api/internal/resources/${resourceId}`], ['project', `/api/internal/projects/${projectId}`]]) {
  test(`${name} deletion invalidates cached responses`, async (t) => {
    const { request, send } = await setup(t);
    await request(endpoint);
    assert.equal((await request(endpoint)).headers.get('x-cache'), 'HIT');
    assert.equal((await send(path, 'DELETE', undefined, true)).status, 200);
    assert.equal((await request(endpoint)).status, 404);
  });
}

test('cache hits still consume the shared mock read limit', async (t) => {
  const { request } = await setup(t);
  for (let i = 0; i < 100; i++) assert.equal((await request(endpoint)).status, 200);
  assert.equal((await request(endpoint)).status, 429);
});
