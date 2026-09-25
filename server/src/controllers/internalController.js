/**
 * @file internalController.js
 * @description CRUD controllers for the dashboard's internal API.
 *
 * All routes are protected by verifyJWT middleware (mounted in app.js).
 * Every controller reads `req.user.userId` (set by verifyJWT) to scope
 * all database queries to the authenticated user's own data.
 *
 * OWNERSHIP MODEL:
 *   User → owns many Projects → each Project has many Resources
 *   All queries are filtered by `owner: req.user.userId` to enforce multi-tenancy.
 *   A user cannot see, modify, or delete another user's projects or resources.
 */

import mongoose from 'mongoose';
import Project from '../models/Project.js';
import Resource from '../models/Resource.js';
import MockData from '../models/MockData.js';
import ajv from '../utils/ajvInstance.js';

// ── Ownership helper ──────────────────────────────────────────────────────────

/**
 * Verifies that a project exists AND belongs to the requesting user.
 * Throws a structured error (with statusCode) if either check fails.
 *
 * @param {string} projectId  MongoDB ObjectId string
 * @param {string} userId     From req.user.userId (JWT payload)
 * @returns {Promise<object>} Lean project document
 */
async function requireOwnedProject(projectId, userId) {
  if (!mongoose.Types.ObjectId.isValid(projectId)) {
    const err = new Error('Invalid project ID.');
    err.statusCode = 400; throw err;
  }
  const project = await Project.findOne({ _id: projectId, owner: userId }).lean();
  if (!project) {
    // Return 404 whether the project doesn't exist OR belongs to someone else.
    // Never reveal "this project exists but you don't own it" — that leaks info.
    const err = new Error('Project not found.');
    err.statusCode = 404; throw err;
  }
  return project;
}

// ═══════════════════════════════════════════════════════════════════════════
//  PROJECT CONTROLLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/internal/projects
 * List all projects owned by the currently authenticated user.
 */
export async function listProjects(req, res, next) {
  try {
    const projects = await Project
      .find({ owner: req.user.userId })  // ← scoped to this user only
      .sort({ createdAt: -1 })
      .lean();
    res.status(200).json({ success: true, data: projects });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/internal/projects
 * Create a new project owned by the authenticated user.
 *
 * Body: { name, description? }
 */
export async function createProject(req, res, next) {
  try {
    const { name, description } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Project name is required.' });
    }

    const project = await Project.create({
      name: name.trim(),
      description: description?.trim() || '',
      owner: req.user.userId, // ← real user ID from JWT, not a placeholder
    });

    res.status(201).json({
      success: true,
      message: `Project "${project.name}" created with prefix "${project.prefix}".`,
      data: project,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/internal/projects/:projectId
 * Get a single project — only if it belongs to the authenticated user.
 */
export async function getProject(req, res, next) {
  try {
    const project = await requireOwnedProject(req.params.projectId, req.user.userId);
    res.status(200).json({ success: true, data: project });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/internal/projects/:projectId
 * Delete a project (ownership verified) and cascade-delete all its resources + mock data.
 */
export async function deleteProject(req, res, next) {
  try {
    const { projectId } = req.params;
    const project = await requireOwnedProject(projectId, req.user.userId);

    const resources = await Resource.find({ projectId }).lean();
    const resourceIds = resources.map((r) => r._id);

    // Cascade: MockData → Resources → Project
    await req.app.locals.mockCache.mutate(project.prefix, async () => {
      await MockData.deleteMany({ resourceId: { $in: resourceIds } });
      await Resource.deleteMany({ projectId });
      await Project.findByIdAndDelete(projectId);
    });

    res.status(200).json({
      success: true,
      message: `Project "${project.name}" and all its data deleted.`,
      deletedResources: resources.length,
    });
  } catch (err) {
    next(err);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  RESOURCE CONTROLLERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/internal/projects/:projectId/resources
 * List all resources for a project (ownership of the project is verified first).
 */
export async function listResources(req, res, next) {
  try {
    const { projectId } = req.params;
    await requireOwnedProject(projectId, req.user.userId); // ownership check

    const resources = await Resource.find({ projectId }).sort({ createdAt: -1 }).lean();

    const resourcesWithCounts = await Promise.all(
      resources.map(async (r) => ({
        ...r,
        recordCount: await MockData.countDocuments({ resourceId: r._id }),
      }))
    );

    res.status(200).json({ success: true, data: resourcesWithCounts });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/internal/projects/:projectId/resources
 * Create a resource under a project — only if the user owns the project.
 *
 * Body: { resourceName, schemaDefinition, description? }
 */
export async function createResource(req, res, next) {
  try {
    const { projectId } = req.params;
    const { resourceName, schemaDefinition, description } = req.body;

    if (!resourceName || !schemaDefinition) {
      return res.status(400).json({
        success: false,
        message: 'resourceName and schemaDefinition are required.',
      });
    }

    const project = await requireOwnedProject(projectId, req.user.userId);

    // Validate the schema definition itself (meta-schema check)
    const isValidSchema = ajv.validateSchema(schemaDefinition);
    if (!isValidSchema) {
      return res.status(400).json({
        success: false,
        message: 'schemaDefinition is not valid JSON Schema.',
        errors: ajv.errors,
      });
    }

    const resource = await req.app.locals.mockCache.mutate(project.prefix, () => Resource.create({
      projectId,
      resourceName,
      schemaDefinition,
      description: description?.trim() || '',
    }));

    res.status(201).json({
      success: true,
      message: `Resource "${resource.resourceName}" created.`,
      data: {
        ...resource.toObject(),
        mockUrl: `/api/mock/${project.prefix}/${resource.resourceName}`,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/internal/resources/:resourceId
 * Update a resource's schema — only if the user owns the parent project.
 *
 * Body: { schemaDefinition?, description? }
 */
export async function updateResource(req, res, next) {
  try {
    const { resourceId } = req.params;
    const { schemaDefinition, description } = req.body;

    const resource = await Resource.findById(resourceId);
    if (!resource) {
      return res.status(404).json({ success: false, message: 'Resource not found.' });
    }

    // Verify the parent project belongs to this user before allowing any edit
    const project = await requireOwnedProject(resource.projectId.toString(), req.user.userId);

    if (schemaDefinition) {
      const isValidSchema = ajv.validateSchema(schemaDefinition);
      if (!isValidSchema) {
        return res.status(400).json({
          success: false,
          message: 'schemaDefinition is not valid JSON Schema.',
          errors: ajv.errors,
        });
      }
      // Invalidate the Ajv cache so the next mock request recompiles
      if (ajv.getSchema(resourceId)) ajv.removeSchema(resourceId);

      resource.schemaDefinition = schemaDefinition;
      resource.markModified('schemaDefinition');
    }

    if (description !== undefined) {
      resource.description = description.trim();
    }

    await req.app.locals.mockCache.mutate(project.prefix, () => resource.save());

    res.status(200).json({
      success: true,
      message: 'Resource updated. Ajv cache invalidated — next request recompiles.',
      data: resource,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/internal/resources/:resourceId
 * Delete a resource — only if the user owns the parent project.
 */
export async function deleteResource(req, res, next) {
  try {
    const { resourceId } = req.params;

    const resource = await Resource.findById(resourceId);
    if (!resource) {
      return res.status(404).json({ success: false, message: 'Resource not found.' });
    }

    // Ownership check on the parent project
    const project = await requireOwnedProject(resource.projectId.toString(), req.user.userId);

    const { deletedCount } = await req.app.locals.mockCache.mutate(project.prefix, async () => {
      const result = await MockData.deleteMany({ resourceId });
      if (ajv.getSchema(resourceId)) ajv.removeSchema(resourceId);
      await Resource.findByIdAndDelete(resourceId);
      return result;
    });

    res.status(200).json({
      success: true,
      message: `Resource "${resource.resourceName}" deleted (${deletedCount} mock records removed).`,
    });
  } catch (err) {
    next(err);
  }
}
