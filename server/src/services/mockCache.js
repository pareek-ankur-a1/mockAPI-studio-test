import { randomUUID } from "node:crypto";
import { redisUnavailable } from "../config/redis.js";

export function createMockCache({
  redisClient = null,
  prefix = "mockapi:",
  ttlSeconds = 30
} = {}) {
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 3600) {
    throw new Error('MOCK_CACHE_TTL_SECONDS must be an integer between 1 and 3600.');
  }

  const projectKey = (project) =>
    `${prefix}cache:${project}`;

  return {
    async remember(project, variant, load) {
      let key;

      if (redisClient?.isReady) {
        try {
          const base = projectKey(project);
          const generationKey = `${base}:generation`;

          // Initialize once without replacing another reader's generation.
          await redisClient.set(
            generationKey,
            randomUUID(),
            { NX: true, EX: ttlSeconds * 2 }
          );

          const generation =
            await redisClient.get(generationKey);

          if (generation) {
            key = `${base}:${generation}:${variant}`;

            const cached = await redisClient.get(key);

            if (cached !== null) {
              return {
                value: JSON.parse(cached),
                status: "HIT"
              };
            }
          }
        } catch {
          key = null;
        }
      }

      const value = await load(); // Failed loads never reach cache storage.
      let status = "BYPASS";

      if (key) {
        try {
          const serialized = JSON.stringify(value);
          if (Buffer.byteLength(serialized) <= 1024 * 1024) {
            // A concurrent invalidation may retire this key's generation.
            // Storing under that old key is harmless: new reads use the new
            // generation, and this unused response expires automatically.
            await redisClient.set(key, serialized, { EX: ttlSeconds });
            status = "MISS";
          }
        } catch {
          // Cache failures must not discard a successful database result.
        }
      }

      return { value, status };
    },

    async invalidate(project) {
      if (!redisClient) return;

      try {
        if (!redisClient.isReady) throw new Error('Redis disconnected');
        await redisClient.set(
          `${projectKey(project)}:generation`,
          randomUUID(),
          { EX: ttlSeconds * 2 }
        );
      } catch {
        throw redisUnavailable('Cache invalidation failed.');
      }
    },

    async mutate(project, mutation) {
      try {
        return await mutation();
      } finally {
        // Invalidate even when a bulk operation only partially succeeds.
        await this.invalidate(project);
      }
    }
  };
}
