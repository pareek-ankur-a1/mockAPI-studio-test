import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redisUnavailable } from '../config/redis.js';

const MINUTE = 60_000;
const policies = {
  mockRead: { windowMs: MINUTE, max: 200 },
  mockWrite: { windowMs: MINUTE, max: 60 },
  login: { windowMs: 15 * MINUTE, max: 20 },
  register: { windowMs: 15 * MINUTE, max: 5 },
  otpVerify: { windowMs: 15 * MINUTE, max: 10 },
  otpResend: { windowMs: 15 * MINUTE, max: 3 },
  seed: { windowMs: MINUTE, max: 5, keyGenerator: (req) => req.user.userId },
};

export function createRateLimiters({ redisClient = null, prefix = 'mockapi:' } = {}) {
  return Object.fromEntries(Object.entries(policies).map(([name, policy]) => {
    const store = redisClient ? new RedisStore({
      prefix: `${prefix}ratelimit:${name}:`,
      sendCommand: async (...args) => {
        try {
          if (!redisClient.isReady) throw new Error('Redis disconnected');
          return await redisClient.sendCommand(args);
        } catch {
          throw redisUnavailable();
        }
      },
    }) : undefined;

    // The adapter loads Lua scripts in its constructor. Handle initial failures
    // here; increment() retries loading them and forwards a 503 on each request.
    store?.incrementScriptSha.catch(() => {});
    store?.getScriptSha.catch(() => {});

    return [name, rateLimit({
      ...policy,
      store,
      standardHeaders: true,
      legacyHeaders: false,
      passOnStoreError: false,
      handler: (_req, res) => res.status(429).json({
        success: false,
        message: 'Too many requests. Please slow down and try again later.',
        retryAfter: Number(res.getHeader('Retry-After')),
      }),
    })];
  }));
}

const limiter = (name) => (req, res, next) => req.app.locals.rateLimiters[name](req, res, next);
export const mockReadLimiter = limiter('mockRead');
export const mockWriteLimiter = limiter('mockWrite');
export const loginLimiter = limiter('login');
export const registerLimiter = limiter('register');
export const otpVerifyLimiter = limiter('otpVerify');
export const otpResendLimiter = limiter('otpResend');
export const seedLimiter = limiter('seed');
