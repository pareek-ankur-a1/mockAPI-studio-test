import { createHash, randomUUID } from 'node:crypto';
import { redisUnavailable } from '../config/redis.js';

// Unique generations avoid stale-key reuse even if a generation expires or is evicted.
const GET_GENERATION = `
local version = redis.call('GET', KEYS[1])
if not version then
  version = ARGV[1]
  redis.call('SET', KEYS[1], version, 'EX', ARGV[2])
end
return version
`;

// A read started before a write must not repopulate the current cache afterward.
const STORE_RESPONSE = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
  return 1
end
return 0
`;

const hash = (value) => createHash('sha256').update(value).digest('hex');

export function createMockCache({ redisClient = null, prefix = 'mockapi:', ttlSeconds = 30 } = {}) {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 3600) {
    throw new Error('MOCK_CACHE_TTL_SECONDS must be an integer between 1 and 3600.');
  }
  const projectKey = (projectPrefix) => `${prefix}cache:{${hash(projectPrefix)}}`;

  return {
    async remember(projectPrefix, variant, load) {
      let generation;
      let base;
      let key;
      if (redisClient?.isReady) {
        try {
          base = projectKey(projectPrefix);
          generation = await redisClient.eval(GET_GENERATION, {
            keys: [`${base}:generation`],
            arguments: [randomUUID(), String(ttlSeconds * 2)],
          });
          key = `${base}:${generation}:${hash(variant)}`;
          const cached = await redisClient.get(key);
          if (cached !== null) return { value: JSON.parse(cached), status: 'HIT' };
        } catch {
          // Cache failures must not prevent a database read.
          generation = null;
        }
      }

      const value = await load(); // Failed/404 responses are never cached.
      let status = 'BYPASS';
      if (generation) {
        try {
          const serialized = JSON.stringify(value);
          if (Buffer.byteLength(serialized) <= 1024 * 1024) {
            const stored = await redisClient.eval(STORE_RESPONSE, {
              keys: [`${base}:generation`, key],
              arguments: [generation, serialized, String(ttlSeconds)],
            });
            if (stored === 1) status = 'MISS';
          }
        } catch {
          // The database result is still usable when Redis cannot cache it.
        }
      }
      return { value, status };
    },

    async invalidate(projectPrefix) {
      if (!redisClient) return;
      try {
        if (!redisClient.isReady) throw new Error('Redis disconnected');
        await redisClient.set(`${projectKey(projectPrefix)}:generation`, randomUUID(), {
          EX: ttlSeconds * 2,
        });
      } catch {
        throw redisUnavailable('Cache invalidation failed. Data may have changed; read it before retrying the write.');
      }
    },

    async mutate(projectPrefix, mutation) {
      try {
        return await mutation();
      } finally {
        // Also covers partial bulk inserts and partially completed cascade deletes.
        await this.invalidate(projectPrefix);
      }
    },
  };
}
