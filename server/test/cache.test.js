import test from 'node:test';
import assert from 'node:assert/strict';
import { createMockCache } from '../src/services/mockCache.js';
import { FakeRedis } from './helpers/fakeRedis.js';

test('cache shares reads between workers and isolates projects and query variants', async () => {
  const redisClient = new FakeRedis();
  const first = createMockCache({ redisClient });
  const second = createMockCache({ redisClient });
  let calls = 0;
  const load = async () => ({ data: [++calls] });
  assert.equal((await first.remember('a', 'page=1', load)).status, 'MISS');
  assert.deepEqual(await second.remember('a', 'page=1', load), { value: { data: [1] }, status: 'HIT' });
  await second.remember('a', 'page=2', load);
  await second.remember('b', 'page=1', load);
  assert.equal(calls, 3);
  await first.invalidate('a');
  assert.equal((await second.remember('a', 'page=1', load)).status, 'MISS');
  assert.equal((await second.remember('a', 'page=2', load)).status, 'MISS');
  assert.equal((await second.remember('b', 'page=1', load)).status, 'HIT');
});

test('entries expire and an expired generation cannot resurrect old responses', async () => {
  const redisClient = new FakeRedis();
  const cache = createMockCache({ redisClient, ttlSeconds: 2 });
  let calls = 0;
  const load = async () => ++calls;
  await cache.remember('a', 'list', load);
  redisClient.now += 2001;
  assert.equal((await cache.remember('a', 'list', load)).value, 2);
  redisClient.now += 2001;
  assert.equal((await cache.remember('a', 'list', load)).value, 3);
});

test('a slow read cannot repopulate the active cache after a mutation', async () => {
  const redisClient = new FakeRedis();
  const cache = createMockCache({ redisClient });
  const deferred = () => {
    let resolve;
    const promise = new Promise((done) => { resolve = done; });
    return { promise, resolve };
  };
  const started = deferred();
  const release = deferred();
  const slow = cache.remember('a', 'list', async () => {
    started.resolve();
    return release.promise;
  });
  await started.promise;
  await cache.mutate('a', async () => {});
  await cache.remember('a', 'list', async () => 'new');
  release.resolve('old');
  assert.equal((await slow).status, 'BYPASS');
  assert.equal((await cache.remember('a', 'list', async () => 'unexpected')).value, 'new');
});

test('partial mutations still invalidate cached responses', async () => {
  const cache = createMockCache({ redisClient: new FakeRedis() });
  await cache.remember('a', 'list', async () => 'old');
  await assert.rejects(cache.mutate('a', async () => { throw new Error('partial insert'); }), /partial insert/);
  assert.equal((await cache.remember('a', 'list', async () => 'new')).value, 'new');
});

test('disabled/unavailable cache falls back to the loader; invalidation failures return 503', async () => {
  assert.equal((await createMockCache().remember('a', 'list', async () => 1)).status, 'BYPASS');
  const redisClient = new FakeRedis();
  const cache = createMockCache({ redisClient });
  redisClient.isReady = false;
  assert.equal((await cache.remember('a', 'list', async () => 2)).value, 2);
  await assert.rejects(cache.invalidate('a'), { statusCode: 503 });
  redisClient.isReady = true;
  redisClient.get = async () => { throw new Error('command failed'); };
  assert.equal((await cache.remember('a', 'list', async () => 3)).status, 'BYPASS');
});

test('failed loads and oversized responses are not cached', async () => {
  const cache = createMockCache({ redisClient: new FakeRedis() });
  await assert.rejects(cache.remember('a', 'list', async () => { throw new Error('404'); }), /404/);
  assert.equal((await cache.remember('a', 'list', async () => 'found')).status, 'MISS');
  const large = 'x'.repeat(1024 * 1024 + 1);
  assert.equal((await cache.remember('a', 'large', async () => large)).status, 'BYPASS');
  assert.equal((await cache.remember('a', 'large', async () => 'small')).status, 'MISS');
});
