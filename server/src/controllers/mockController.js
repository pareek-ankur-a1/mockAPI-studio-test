/**
 * @file mockController.js
 * @description Request handlers for the public wildcard mock engine.
 *
 * Every handler follows the same lookup chain:
 *
 *   1. Find Project by prefix   → 404 if not found
 *   2. Find Resource by name    → 404 if not found
 *   3. Operate on MockData      → the actual read / write / delete
 *
 * This two-step lookup is intentional — it produces precise error messages
 * ("project not found" vs "resource not found") and keeps the permission
 * model clear: a resource only exists in the context of its project.
 *
 * ── Wildcard URL anatomy ────────────────────────────────────────────────────
 *
 *   /api/mock/:projectPrefix/:resourceName
 *             └──────────────────────────┘
 *             Both params come from Express wildcard route params (req.params)
 *
 *   /api/mock/:projectPrefix/:resourceName/:id
 *                                          └──┘
 *             Optional :id param for single-record operations (DELETE by ID)
 */

import Project from '../models/Project.js';
import Resource from '../models/Resource.js';
import MockData from '../models/MockData.js';

// ─── Shared Helper ────────────────────────────────────────────────────────────

/**
 * Resolves a (projectPrefix, resourceName) pair to a Resource document.
 * Throws a structured error (with a `statusCode`) if either is not found,
 * so the global error handler can format a clean response.
 *
 * @param {string} projectPrefix  e.g. "proj_8f72k"
 * @param {string} resourceName   e.g. "products"
 * @returns {Promise<import('../models/Resource.js').default>}
 */
async function resolveResource(projectPrefix, resourceName) {
  // Step 1 — find the project by its unique URL prefix
  const project = await Project.findOne({ prefix: projectPrefix }).lean();
  if (!project) {
    const err = new Error(`Project with prefix "${projectPrefix}" not found.`);
    err.statusCode = 404;
    throw err;
  }

  // Step 2 — find the resource scoped to that project
  // The compound index on [projectId, resourceName] makes this O(log n)
  const resource = await Resource.findOne({
    projectId: project._id,
    resourceName: resourceName.toLowerCase(),
  }).lean();

  if (!resource) {
    const err = new Error(
      `Resource "${resourceName}" not found in project "${projectPrefix}".`
    );
    err.statusCode = 404;
    throw err;
  }

  return resource;
}

// ─── GET /api/mock/:projectPrefix/:resourceName ───────────────────────────────

/**
 * Retrieve all mock records for a resource.
 *
 * Query parameters (all optional):
 *  - `limit`  (number, default 100, max 500) — number of records to return
 *  - `page`   (number, default 1)            — page number for pagination
 *  - `seeded` (boolean)                      — filter by isSeeded flag
 *
 * Returns newest records first (sorted by createdAt DESC), consistent with
 * typical API mock use cases where you want to see the most recent data.
 */
export async function getAllMockData(req, res, next) {
  try {
    const { projectPrefix, resourceName } = req.params;
    const limit = Math.max(1, Math.min(parseInt(req.query.limit, 10) || 100, 500));
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;
    const seeded = req.query.seeded === undefined ? null : req.query.seeded === 'true';
    const variant = JSON.stringify(['list', resourceName, page, limit, seeded]);

    const result = await req.app.locals.mockCache.remember(projectPrefix, variant, async () => {
      const resource = await resolveResource(projectPrefix, resourceName);
      const filter = { resourceId: resource._id };
      if (seeded !== null) filter.isSeeded = seeded;
      const [total, records] = await Promise.all([
        MockData.countDocuments(filter),
        MockData.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      ]);
      return {
        success: true,
        meta: { total, page, limit, totalPages: Math.ceil(total / limit), resource: resourceName, project: projectPrefix },
        data: records.map((r) => ({
          _id: r._id,
          ...r.data,
          _createdAt: r.createdAt,
          _isSeeded: r.isSeeded,
        })),
      };
    });
    res.set({ 'X-Cache': result.status, 'Cache-Control': 'no-store' }).status(200).json(result.value);
  } catch (err) {
    next(err); // Delegate to the global error handler in app.js
  }
}

// ─── GET /api/mock/:projectPrefix/:resourceName/:id ───────────────────────────

/**
 * Retrieve a single mock record by its MongoDB _id.
 */
export async function getSingleMockData(req, res, next) {
  try {
    const { projectPrefix, resourceName, id } = req.params;
    const variant = JSON.stringify(['single', resourceName, id]);
    const result = await req.app.locals.mockCache.remember(projectPrefix, variant, async () => {
      const resource = await resolveResource(projectPrefix, resourceName);
      const record = await MockData.findOne({ _id: id, resourceId: resource._id }).lean();
      if (!record) {
        const error = new Error(`Record with id "${id}" not found.`);
        error.statusCode = 404;
        throw error;
      }
      return {
        success: true,
        data: { _id: record._id, ...record.data, _createdAt: record.createdAt, _isSeeded: record.isSeeded },
      };
    });
    res.set({ 'X-Cache': result.status, 'Cache-Control': 'no-store' }).status(200).json(result.value);
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/mock/:projectPrefix/:resourceName/:id ───────────────────────

/**
 * Delete a single mock record by its MongoDB _id.
 *
 * Scoped to the resource so one user can't delete another project's data by
 * guessing an ObjectId.
 */
export async function deleteSingleMockData(req, res, next) {
  try {
    const { projectPrefix, resourceName, id } = req.params;

    const resource = await resolveResource(projectPrefix, resourceName);

    const result = await req.app.locals.mockCache.mutate(projectPrefix, () => MockData.findOneAndDelete({
      _id: id,
      resourceId: resource._id, // Scoping guard — prevents cross-resource deletes
    }));

    if (!result) {
      return res.status(404).json({
        success: false,
        message: `Record with id "${id}" not found.`,
      });
    }

    res.status(200).json({
      success: true,
      message: `Record "${id}" deleted successfully.`,
    });
  } catch (err) {
    next(err);
  }
}

// ─── DELETE /api/mock/:projectPrefix/:resourceName ───────────────────────────

/**
 * Bulk-delete ALL mock records for a resource.
 *
 * Optional query param:
 *  - `?seeded=true`  → delete only faker-seeded records (leave real ones intact)
 *  - `?seeded=false` → delete only real (non-seeded) records
 *  - (no param)      → delete everything
 *
 * Returns the count of deleted documents so the dashboard can confirm the action.
 */
export async function deleteAllMockData(req, res, next) {
  try {
    const { projectPrefix, resourceName } = req.params;

    const resource = await resolveResource(projectPrefix, resourceName);

    const filter = { resourceId: resource._id };
    if (req.query.seeded !== undefined) {
      filter.isSeeded = req.query.seeded === 'true';
    }

    const result = await req.app.locals.mockCache.mutate(projectPrefix, () => MockData.deleteMany(filter));

    const seededNote = req.query.seeded !== undefined
      ? ` (filter: isSeeded=${req.query.seeded})`
      : '';

    res.status(200).json({
      success: true,
      message: `Deleted ${result.deletedCount} record(s) from "${resourceName}"${seededNote}.`,
      deletedCount: result.deletedCount,
    });
  } catch (err) {
    next(err);
  }
}

// ─── POST /api/mock/:projectPrefix/:resourceName ──────────────────────────────

/**
 * Create a new mock record.
 *
 * By the time this handler runs, `validateSchema` middleware has already:
 *  1. Looked up the Project + Resource from the DB
 *  2. Validated req.body against the resource's JSON Schema
 *  3. Attached the resolved `resource` to `req.resource`
 *
 * So this handler only needs to persist — no extra DB lookups needed.
 *
 * Returns 201 Created with the newly saved document's _id so callers can
 * immediately reference it (e.g., for a subsequent GET /:id or DELETE /:id).
 */
export async function createMockData(req, res, next) {
  try {
    // req.resource is guaranteed to exist — set by validateSchema middleware
    const resource = req.resource;

    const record = await req.app.locals.mockCache.mutate(req.params.projectPrefix, () => MockData.create({
      resourceId: resource._id,
      data:       req.body,   // Already Ajv-validated — safe to persist as-is
      isSeeded:   false,      // User-submitted records are never marked as seeded
    }));

    res.status(201).json({
      success: true,
      message: 'Record created successfully.',
      data: {
        _id:       record._id,
        ...record.data,
        _createdAt: record.createdAt,
        _isSeeded:  record.isSeeded,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ─── PUT /api/mock/:projectPrefix/:resourceName/:id ───────────────────────────

/**
 * Replace an existing mock record's payload (full replacement, not patch).
 *
 * REST PUT semantics: the entire `data` field is replaced with req.body.
 * If the client only sends a subset of fields, the rest are REMOVED from storage.
 *
 * IMPORTANT — Schema.Types.Mixed mutation:
 * Mongoose cannot detect in-place mutations to Mixed fields automatically.
 * After assigning a new value to `record.data`, we MUST call
 * `record.markModified('data')` before `record.save()`, otherwise Mongoose
 * will skip this field in the UPDATE query and the DB will not be updated.
 */
export async function updateMockData(req, res, next) {
  try {
    const { id } = req.params;
    const resource = req.resource; // Resolved by validateSchema middleware

    // Scoped to this resource — prevents cross-resource updates by guessing IDs
    const record = await MockData.findOne({
      _id:        id,
      resourceId: resource._id,
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: `Record with id "${id}" not found.`,
      });
    }

    // Full replacement of the data payload (REST PUT semantics)
    record.data = req.body;

    /**
     * CRITICAL: markModified() for Schema.Types.Mixed
     *
     * Mongoose tracks changes via property setters. For Mixed types, calling
     * markModified() explicitly guarantees the field is included in the
     * $set update operation regardless of Mongoose's change-detection logic.
     */
    record.markModified('data');

    await req.app.locals.mockCache.mutate(req.params.projectPrefix, () => record.save());

    res.status(200).json({
      success: true,
      message: 'Record updated successfully.',
      data: {
        _id:        record._id,
        ...record.data,
        _updatedAt: record.updatedAt,
        _isSeeded:  record.isSeeded,
      },
    });
  } catch (err) {
    next(err);
  }
}
