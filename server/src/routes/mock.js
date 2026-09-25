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
 *   POST   /api/mock/:projectPrefix/:resourceName          → (Phase 3 — Ajv validation)
 *   PUT    /api/mock/:projectPrefix/:resourceName/:id      → (Phase 3 — Ajv validation)
 *
 * ── Why a separate router file? ─────────────────────────────────────────────
 * The mock engine runs under DIFFERENT middleware than the dashboard API:
 *
 *   Mock engine:    cors({ origin: '*' })  +  rate limiter   (no auth)
 *   Dashboard API:  cors({ origin: CLIENT_URL }) + JWT auth  (restricted)
 *
 * Keeping them in separate routers lets us apply these policies cleanly via
 * router-level middleware, without complex conditional logic inside app.js.
 *
 * ── Wildcard parameter routing ───────────────────────────────────────────────
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

// ─── Router-level CORS ────────────────────────────────────────────────────────
/**
 * The mock engine must accept requests from ANY origin.
 *
 * This is the product's core value: a user builds a React app on port 3000,
 * another builds a Vue app on port 8080 — both should be able to call
 * /api/mock/proj_XXXXX/products without CORS errors.
 *
 * This open-CORS policy is scoped ONLY to this router (not the whole app).
 * The dashboard /api/internal/* routes retain the restrictive CLIENT_URL policy
 * configured in app.js.
 */
const openCors = cors({
  origin: '*',                        // Accept from any domain
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],   // No auth headers needed on public mock routes
  exposedHeaders: ['X-Cache', 'RateLimit-Limit', 'RateLimit-Remaining', 'RateLimit-Reset', 'Retry-After'],
});

// Apply open CORS + pre-flight handling to the entire mock router
mockRouter.use(openCors);
mockRouter.options('*', openCors); // Explicitly handle pre-flight OPTIONS for all paths

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/mock/:projectPrefix/:resourceName
 *
 * Returns all mock records for the resource (paginated, newest first).
 * Query params: ?limit=N &page=N &seeded=true|false
 *
 * Rate limit: 200 req/min per IP (read limiter — lenient)
 */
mockRouter.get(
  '/:projectPrefix/:resourceName',
  mockReadLimiter,
  getAllMockData
);

/**
 * GET /api/mock/:projectPrefix/:resourceName/:id
 *
 * Returns a single mock record by MongoDB ObjectId.
 * Returns 404 if the id doesn't belong to this resource (scoping guard).
 *
 * Rate limit: 200 req/min per IP (read limiter)
 */
mockRouter.get(
  '/:projectPrefix/:resourceName/:id',
  mockReadLimiter,
  getSingleMockData
);

/**
 * DELETE /api/mock/:projectPrefix/:resourceName/:id
 *
 * Deletes a single mock record by id.
 * Scoped to the resource — can't delete records from another resource by guessing IDs.
 *
 * Rate limit: 60 req/min per IP (write limiter — strict)
 */
mockRouter.delete(
  '/:projectPrefix/:resourceName/:id',
  mockWriteLimiter,
  deleteSingleMockData
);

/**
 * DELETE /api/mock/:projectPrefix/:resourceName
 *
 * Bulk-deletes ALL records for the resource.
 * Optional: ?seeded=true  → only delete faker-seeded records
 *           ?seeded=false → only delete user-created records
 *
 * Rate limit: 60 req/min per IP (write limiter)
 */
mockRouter.delete(
  '/:projectPrefix/:resourceName',
  mockWriteLimiter,
  deleteAllMockData
);

// ─── Phase 3: Validated Write Routes ─────────────────────────────────────────

/**
 * POST /api/mock/:projectPrefix/:resourceName
 *
 * Creates a new mock record after validating the request body against the
 * resource's stored JSON Schema using Ajv.
 *
 * Middleware chain:
 *   mockWriteLimiter → validateSchema → createMockData
 *
 * validateSchema will:
 *   - Resolve the Project + Resource from DB
 *   - Compile + run Ajv validation on req.body
 *   - Return 400 with structured error array if invalid
 *   - Attach `req.resource` and call next() if valid
 *
 * Rate limit: 60 req/min per IP (write limiter)
 */
mockRouter.post(
  '/:projectPrefix/:resourceName',
  mockWriteLimiter,
  validateSchema,
  createMockData
);

/**
 * PUT /api/mock/:projectPrefix/:resourceName/:id
 *
 * Full replacement of an existing mock record's data payload.
 * The entire body is validated against the schema before persisting.
 *
 * Middleware chain:
 *   mockWriteLimiter → validateSchema → updateMockData
 *
 * Rate limit: 60 req/min per IP (write limiter)
 */
mockRouter.put(
  '/:projectPrefix/:resourceName/:id',
  mockWriteLimiter,
  validateSchema,
  updateMockData
);

export default mockRouter;
