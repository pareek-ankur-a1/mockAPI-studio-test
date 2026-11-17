import express from 'express';
import cors from 'cors';

import mockRouter from './routes/mock.js';
import internalRouter from './routes/internal.js';
import authRouter from './routes/auth.js';
import { verifyJWT, requireVerified } from './middleware/auth.js';
import { createRateLimiters } from './middleware/rateLimiter.js';
import { createMockCache } from './services/mockCache.js';

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
  //setup mockCache and rateLimiters in the app.locals so we can access it in any http req
  app.locals.mockCache = createMockCache({ redisClient, prefix: redisPrefix, ttlSeconds: cacheTtlSeconds });
  app.locals.rateLimiters = createRateLimiters({ redisClient, prefix: redisPrefix });

  //enable CORS between frontend and backend
  const dashboardCorsOptions = {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
    credentials: true, // Allow cookies / auth headers from the dashboard
  };

  app.use('/api/auth', cors(dashboardCorsOptions));
  app.use('/api/internal', cors(dashboardCorsOptions));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  if (process.env.NODE_ENV === 'development') {
    app.use((req, _res, next) => {
      console.log(`${req.method} ${req.originalUrl}`);
      next();
    });
  }

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });


  //The mock router applies its own open-CORS policy internally (cors({ origin: '*' })).
  app.use('/api/mock', mockRouter);

  app.use('/api/auth', authRouter);

  app.use('/api/internal', verifyJWT, requireVerified, internalRouter);

  //Catches any request that didn't match a route above.
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    });
  });

  //Global Error Handler
  app.use((err, _req, res, _next) => {
    console.error('🔥 Unhandled error:', err);

    // MongoDB duplicate key error on duplicate project key or email
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
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  });

  return app;
}