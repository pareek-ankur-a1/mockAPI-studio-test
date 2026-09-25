/**
 * @file app.js
 * @description Express application factory.
 *
 * Separating the Express `app` from the HTTP `server` (in index.js) is a
 * best practice because it makes the app easily importable in integration
 * tests without actually binding to a port.
 *
 * Middleware order matters in Express — each middleware is a function in a
 * pipeline. The order here is intentional:
 *   1. Security / CORS headers (must come before routes handle the request)
 *   2. Body parsing    (routes need req.body populated)
 *   3. Request logging (dev convenience)
 *   4. Routes          (actual business logic)
 *   5. 404 handler     (catch unmatched routes)
 *   6. Error handler   (catch errors thrown by routes/middleware)
 */

import express from 'express';
import cors from 'cors';

// ─── Routes & Middleware ──────────────────────────────────────────────────────
import mockRouter from './routes/mock.js';      // Phase 2 – wildcard engine
import internalRouter from './routes/internal.js';  // Phase 3 – seed + dashboard API
import authRouter from './routes/auth.js';      // Auth – register / login / me
import { verifyJWT, requireVerified } from './middleware/auth.js'; // JWT + email-verified guards
import { createRateLimiters } from './middleware/rateLimiter.js';
import { createMockCache } from './services/mockCache.js';

/**
 * Creates and configures the Express application.
 *
 * @returns {import('express').Application}
 */
export function createApp({
  redisClient = null,
  redisPrefix = process.env.REDIS_KEY_PREFIX || 'mockapi:',
  cacheTtlSeconds = Number(process.env.MOCK_CACHE_TTL_SECONDS || 30),
} = {}) {
  const app = express();
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(proxyHops) || proxyHops < 0) {
    throw new Error('TRUST_PROXY_HOPS must be a non-negative integer.');
  }
  if (proxyHops > 0) app.set('trust proxy', proxyHops);
  app.locals.mockCache = createMockCache({ redisClient, prefix: redisPrefix, ttlSeconds: cacheTtlSeconds });
  app.locals.rateLimiters = createRateLimiters({ redisClient, prefix: redisPrefix });

  // ── 1. CORS ─────────────────────────────────────────────────────────────
  /**
   * Two CORS policies run side-by-side:
   *
   * a) Dashboard API (/api/internal/*):
   *    Restricted to CLIENT_URL (the React frontend). Only our own dashboard
   *    should be able to create/update/delete projects and resources.
   *
   * b) Mock engine (/api/mock/*):
   *    Open to ALL origins. This is the entire point of the service — users
   *    build their own frontends on different ports / domains and need to call
   *    their mock endpoints without CORS errors. Phase 2 applies this
   *    per-router with cors({ origin: '*' }).
   */
  const dashboardCorsOptions = {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
    credentials: true, // Allow cookies / auth headers from the dashboard
  };

  // Dashboard preflights must not intercept the public mock router's CORS policy.
  app.use('/api/auth', cors(dashboardCorsOptions));
  app.use('/api/internal', cors(dashboardCorsOptions));

  // ── 2. Body Parsing ──────────────────────────────────────────────────────
  app.use(express.json({ limit: '1mb' }));        // Parse JSON bodies
  app.use(express.urlencoded({ extended: true })); // Parse form-encoded bodies

  // ── 3. Dev Request Logger ────────────────────────────────────────────────
  if (process.env.NODE_ENV === 'development') {
    app.use((req, _res, next) => {
      console.log(`→ ${req.method} ${req.originalUrl}`);
      next();
    });
  }

  // ── 4. Health Check ──────────────────────────────────────────────────────
  /**
   * Simple liveness probe. Returns 200 immediately without touching the DB.
   * Useful for load balancers, health checks, and uptime monitors.
   */
  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // ── 5. Routes ────────────────────────────────────────────────────────────
  /**
   * Mount the mock engine router.
   *
   * The mock router applies its OWN open-CORS policy internally (cors({ origin: '*' })).
   * We do NOT need to pass cors() here because the router handles it.
   * This prevents the dashboard's restrictive CORS from leaking onto mock routes.
   */
  app.use('/api/mock', mockRouter);

  /**
   * Auth routes — public (no JWT required).
   * register + login return a token; /me verifies an existing one.
   */
  app.use('/api/auth', authRouter);

  /**
   * Internal dashboard API — JWT protected + email-verified required.
   * verifyJWT validates the token; requireVerified blocks unverified users.
   */
  app.use('/api/internal', verifyJWT, requireVerified, internalRouter);

  // ── 6. 404 Handler ───────────────────────────────────────────────────────
  /**
   * Catches any request that didn't match a route above.
   * Returns JSON (not HTML) so API clients get a parseable error.
   */
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
  });

  // ── 7. Global Error Handler ──────────────────────────────────────────────
  /**
   * Express identifies a 4-argument middleware as an error handler.
   * Any `next(err)` call or thrown error in async routes lands here.
   *
   * Mongoose validation errors (code 11000 = duplicate key) get mapped to 409.
   * All other errors default to 500.
   */
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error('🔥 Unhandled error:', err);

    // MongoDB duplicate key error (e.g., duplicate project prefix or email)
    if (err.code === 11000) {
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      return res.status(409).json({
        success: false,
        message: `Duplicate value: a document with this ${field} already exists.`,
        field,
      });
    }

    // Mongoose validation error (schema constraints violated)
    if (err.name === 'ValidationError') {
      const messages = Object.values(err.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: messages,
      });
    }

    // Generic fallback
    const statusCode = err.statusCode || err.status || 500;
    res.status(statusCode).json({
      success: false,
      message: err.message || 'Internal server error',
      // Only expose stack trace during development
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  });

  return app;
}
