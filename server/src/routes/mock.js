/**
 * @file mock.js
 * @description Wildcard mock engine router.
 *
 * This router handles ALL public-facing mock API traffic. It is mounted at
 * `/api/mock` in app.js and exposes the following endpoints:
 *
 *   GET    /api/mock/:projectPrefix/:resourceName          → all records (paginated)
 *   GET    /api/mock/:projectPrefix/:resourceName/:id      → single record
 *   DELETE /api/mock/:projectPrefix/:resourceName          → bulk delete (all / by filter)
 *   DELETE /api/mock/:projectPrefix/:resourceName/:id      → delete single record
 *
 *   POST   /api/mock/:projectPrefix/:resourceName          → Ajv validation
 *   PUT    /api/mock/:projectPrefix/:resourceName/:id      → Ajv validation
 *
 * Wildcard parameter routing:
 * Express captures path segments as named params via `:paramName`.
 * The route `/api/mock/:projectPrefix/:resourceName` does NOT use actual
 * regex wildcards — instead, Express extracts the two path segments and
 * makes them available on `req.params`. This is the "wildcard" architectural
 * pattern: one route definition handles an infinite number of unique URLs.
 */

import { Router } from 'express';
import cors from 'cors';
import { mockReadLimiter, mockWriteLimiter } from '../middleware/rateLimiter.js';
import { validateSchema } from '../middleware/validateSchema.js';
import {
  getAllMockData,
  getSingleMockData,
  deleteSingleMockData,
  deleteAllMockData,
  createMockData,
  updateMockData,
} from '../controllers/mockController.js';

const mockRouter = Router();

const openCors = cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  exposedHeaders: ['X-Cache', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
});

mockRouter.use(openCors);
mockRouter.options('*', openCors);

// Routes

mockRouter.get(
  '/:projectPrefix/:resourceName',
  mockReadLimiter,
  getAllMockData
);

mockRouter.get(
  '/:projectPrefix/:resourceName/:id',
  mockReadLimiter,
  getSingleMockData
);

mockRouter.delete(
  '/:projectPrefix/:resourceName/:id',
  mockWriteLimiter,
  deleteSingleMockData
);

mockRouter.delete(
  '/:projectPrefix/:resourceName',
  mockWriteLimiter,
  deleteAllMockData
);

mockRouter.post(
  '/:projectPrefix/:resourceName',
  mockWriteLimiter,
  validateSchema,
  createMockData
);

mockRouter.put(
  '/:projectPrefix/:resourceName/:id',
  mockWriteLimiter,
  validateSchema,
  updateMockData
);

export default mockRouter;