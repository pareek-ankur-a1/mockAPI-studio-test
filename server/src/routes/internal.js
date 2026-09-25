/**
 * @file internal.js
 * @description Internal dashboard API router.
 *
 * Mounted at /api/internal in app.js. Protected by the dashboard's restrictive
 * CORS policy (CLIENT_URL only) — the mock engine's open CORS does NOT apply here.
 *
 * Route map:
 *
 *   Projects
 *   ─────────────────────────────────────────────────────────────────
 *   GET    /api/internal/projects                   → list all projects
 *   POST   /api/internal/projects                   → create a project
 *   GET    /api/internal/projects/:projectId        → get one project
 *   DELETE /api/internal/projects/:projectId        → delete + cascade
 *
 *   Resources
 *   ─────────────────────────────────────────────────────────────────
 *   GET    /api/internal/projects/:projectId/resources  → list resources
 *   POST   /api/internal/projects/:projectId/resources  → create resource
 *   PUT    /api/internal/resources/:resourceId           → update schema
 *   DELETE /api/internal/resources/:resourceId           → delete + cascade
 *
 *   Seeding
 *   ─────────────────────────────────────────────────────────────────
 *   POST   /api/internal/seed                       → bulk faker seeding
 */

import { Router } from 'express';
import {
  listProjects,
  createProject,
  getProject,
  deleteProject,
  listResources,
  createResource,
  updateResource,
  deleteResource,
} from '../controllers/internalController.js';
import { seedMockData } from '../controllers/seedController.js';
import { seedLimiter } from '../middleware/rateLimiter.js';

const internalRouter = Router();

// ─── Projects ─────────────────────────────────────────────────────────────────

internalRouter.get('/projects', listProjects);
internalRouter.post('/projects', createProject);
internalRouter.get('/projects/:projectId', getProject);
internalRouter.delete('/projects/:projectId', deleteProject);

// ─── Resources ────────────────────────────────────────────────────────────────

internalRouter.get('/projects/:projectId/resources', listResources);
internalRouter.post('/projects/:projectId/resources', createResource);
internalRouter.put('/resources/:resourceId', updateResource);
internalRouter.delete('/resources/:resourceId', deleteResource);

// ─── Seeding ──────────────────────────────────────────────────────────────────

/**
 * POST /api/internal/seed
 * Body: { resourceId: string, count: number }
 *
 * Generates `count` fake records using Faker.js, maps them against the
 * resource's stored JSON Schema, and bulk-inserts into MockData.
 */
internalRouter.post('/seed', seedLimiter, seedMockData);

export default internalRouter;
