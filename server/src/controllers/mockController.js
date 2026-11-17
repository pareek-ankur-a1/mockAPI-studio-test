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
 * /api/mock/:projectPrefix/:resourceName
 * Both params come from Express wildcard route params (req.params)
 *
 * /api/mock/:projectPrefix/:resourceName/:id
 * Optional :id param for single-record operations (DELETE by ID)
 */

import Project from '../models/Project.js';
import Resource from '../models/Resource.js';
import MockData from '../models/MockData.js';

async function resolveResource(projectPrefix, resourceName) {
  const project = await Project.findOne({ prefix: projectPrefix }).lean();
  if (!project) {
    const err = new Error(`Project with prefix "${projectPrefix}" not found.`);
    err.statusCode = 404;
    throw err;
  }

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
    next(err);
  }
}

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

export async function createMockData(req, res, next) {
  try {
    // req.resource is guaranteed to exist — set by validateSchema middleware
    const resource = req.resource;

    const record = await req.app.locals.mockCache.mutate(req.params.projectPrefix, () => MockData.create({
      resourceId: resource._id,
      data: req.body,   // Already Ajv-validated — safe to persist as-is
      isSeeded: false,      // User-submitted records are never marked as seeded
    }));

    res.status(201).json({
      success: true,
      message: 'Record created successfully.',
      data: {
        _id: record._id,
        ...record.data,
        _createdAt: record.createdAt,
        _isSeeded: record.isSeeded,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateMockData(req, res, next) {
  try {
    const { id } = req.params;
    const resource = req.resource; // Resolved by validateSchema middleware

    // Scoped to this resource: prevents cross-resource updates by guessing IDs
    const record = await MockData.findOne({
      _id: id,
      resourceId: resource._id,
    });

    if (!record) {
      return res.status(404).json({
        success: false,
        message: `Record with id "${id}" not found.`,
      });
    }

    record.data = req.body;

    record.markModified('data');

    await req.app.locals.mockCache.mutate(req.params.projectPrefix, () => record.save());

    res.status(200).json({
      success: true,
      message: 'Record updated successfully.',
      data: {
        _id: record._id,
        ...record.data,
        _updatedAt: record.updatedAt,
        _isSeeded: record.isSeeded,
      },
    });
  } catch (err) {
    next(err);
  }
}
