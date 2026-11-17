import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redisUnavailable } from '../config/redis.js';

const MINUTE = 60000;

const policies = {
  mockRead: { windowMs: MINUTE, max: 100 },
  mockWrite: { windowMs: MINUTE, max: 60 },
  login: { windowMs: 15 * MINUTE, max: 20 },
  register: { windowMs: 15 * MINUTE, max: 5 },
  otpVerify: { windowMs: 15 * MINUTE, max: 10 },
  otpResend: { windowMs: 15 * MINUTE, max: 3 },
  seed: {
    windowMs: MINUTE,
    max: 5,
    keyGenerator: (req) => req.user.userId
  }
};

export function createRateLimiters({
  redisClient = null,
  prefix = 'mockapi:'
} = {}) {

  const limiters = {};

  for (const [name, policy] of Object.entries(policies)) {

    let store;

    if (redisClient) {
      store = new RedisStore({
        prefix: `${prefix}ratelimit:${name}:`,

        sendCommand: async function (...args) {
          try {
            if (!redisClient.isReady) {
              throw new Error('Redis disconnected');
            }

            return await redisClient.sendCommand(args);
          } catch {
            throw redisUnavailable();
          }
        }
      });

      // Script loading starts in the constructor. Requests retry loading and
      // report 503 on failure; handle these initial promises as well.
      store.incrementScriptSha?.catch(() => {});
      store.getScriptSha?.catch(() => {});
    }

    limiters[name] = rateLimit({
      ...policy,
      store: store,
      standardHeaders: true, //Adds standard rate-limiting information to the HTTP response headers.
      legacyHeaders: false,
      passOnStoreError: false, //block request if redis is down

      handler: function (_req, res) { //function to execute on blocking the request
        return res.status(429).json({
          success: false,
          message: 'Too many requests. Please slow down and try again later.',
          retryAfter: Number(res.getHeader('Retry-After'))
        });
      }
      //on allowing the request express calls next() and moves to next middleware
    });
  }

  return limiters;
}

function limiter(name) {

  return function (req, res, next) {

    const rateLimiter = req.app.locals.rateLimiters[name];

    return rateLimiter(req, res, next);
  };
}

export const mockReadLimiter = limiter('mockRead');
export const mockWriteLimiter = limiter('mockWrite');
export const loginLimiter = limiter('login');
export const registerLimiter = limiter('register');
export const otpVerifyLimiter = limiter('otpVerify');
export const otpResendLimiter = limiter('otpResend');
export const seedLimiter = limiter('seed');
