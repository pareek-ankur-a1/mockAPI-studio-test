import { createClient } from 'redis';

export async function connectRedis() {
  const url = process.env.REDIS_URL?.trim();
  if (!url) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('REDIS_URL is required in production.');
    }
    console.warn('Redis disabled: using local rate limits and uncached mock reads.');
    return null;
  }

  let connectedOnce = false;
  const client = createClient({
    url,
    disableOfflineQueue: true,
    commandOptions: { timeout: 2000 },
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries) => connectedOnce || retries < 5
        ? Math.min(100 * 2 ** retries, 2000)
        : new Error('Redis reconnect attempts exhausted.'),
    },
  });
  // Never log the connection URL: it may contain a password.
  client.on('error', () => console.error('Redis connection error.'));
  client.on('ready', () => { connectedOnce = true; });
  try {
    await client.connect();
    console.log('Redis connected.');
    return client;
  } catch (error) {
    if (client.isOpen) client.destroy();
    throw new Error('Unable to connect to Redis. Check REDIS_URL and server availability.', { cause: error });
  }
}

export function redisUnavailable(message = 'Rate limiting is temporarily unavailable. Please retry later.') {
  const error = new Error(message);
  error.statusCode = 503;
  return error;
}
