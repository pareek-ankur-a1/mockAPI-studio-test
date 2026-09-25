/**
 * @file validateSchema.js
 * @description Ajv validation middleware for POST and PUT mock requests.
 *
 * This middleware sits between the rate limiter and the controller in the
 * mock engine route chain:
 *
 *   Rate Limiter → validateSchema → mockController.createMockData
 *                  ──────────────
 *                  This file
 *
 * ── What it does ────────────────────────────────────────────────────────────
 * 1. Reads :projectPrefix + :resourceName from req.params (wildcard route)
 * 2. Looks up the Project in MongoDB → 404 if missing
 * 3. Looks up the Resource           → 404 if missing
 * 4. Compiles the stored schemaDefinition with Ajv (cached after first call)
 * 5. Validates req.body against the compiled schema
 * 6. If INVALID → returns 400 with Ajv's structured error array (no next())
 * 7. If VALID   → attaches `resource` to `req` and calls next()
 *
 * ── Why attach `resource` to `req`? ────────────────────────────────────────
 * The downstream controller (createMockData / updateMockData) needs the
 * resource's _id to save the MockData document. By resolving + attaching it
 * here, the controller doesn't need to perform a second DB lookup — we make
 * exactly ONE round-trip to MongoDB per request.
 *
 * ── Ajv schema caching ──────────────────────────────────────────────────────
 * Ajv caches compiled validators internally keyed by schema.$id. We assign
 * the resource's string _id as the $id so the compiled validator is reused
 * on subsequent requests to the same endpoint. This avoids recompiling on
 * every single POST/PUT — important for performance under load.
 */

import Project from '../models/Project.js';
import Resource from '../models/Resource.js';
import ajv from '../utils/ajvInstance.js';

/**
 * Ajv validation middleware factory.
 * Call this directly as a middleware function in the route chain.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function validateSchema(req, res, next) {
  try {
    const { projectPrefix, resourceName } = req.params;

    // ── Step 1: Resolve Project ──────────────────────────────────────────────
    const project = await Project.findOne({ prefix: projectPrefix }).lean();
    if (!project) {
      return res.status(404).json({
        success: false,
        message: `Project with prefix "${projectPrefix}" not found.`,
      });
    }

    // ── Step 2: Resolve Resource ─────────────────────────────────────────────
    const resource = await Resource.findOne({
      projectId: project._id,
      resourceName: resourceName.toLowerCase(),
    }).lean();

    if (!resource) {
      return res.status(404).json({
        success: false,
        message: `Resource "${resourceName}" not found in project "${projectPrefix}".`,
      });
    }

    // ── Step 3: Validate req.body against the stored JSON Schema ─────────────
    const schema = resource.schemaDefinition;

    /**
     * Assign the resource _id as the schema $id for Ajv's internal cache.
     * If this resource's schema was already compiled in a previous request,
     * Ajv returns the cached validator function without recompiling.
     */
    const schemaWithId = {
      ...schema,
      $id: resource._id.toString(),
    };

    // `ajv.getSchema()` returns the cached validator if it exists
    let validate = ajv.getSchema(schemaWithId.$id);
    // Another worker may have updated this schema. Compare the fresh DB definition
    // rather than relying on process-local invalidation alone.
    if (validate && JSON.stringify(validate.schema) !== JSON.stringify(schemaWithId)) {
      ajv.removeSchema(schemaWithId.$id);
      validate = undefined;
    }
    if (!validate) {
      // First time seeing this resource — compile and cache
      validate = ajv.compile(schemaWithId);
    }

    const isValid = validate(req.body);

    if (!isValid) {
      /**
       * Ajv returns a structured error array. Each entry looks like:
       * {
       *   instancePath: "/price",
       *   schemaPath: "#/properties/price/minimum",
       *   keyword: "minimum",
       *   params: { limit: 0 },
       *   message: "must be >= 0"
       * }
       *
       * We surface this directly so the client knows exactly what to fix.
       */
      return res.status(400).json({
        success: false,
        message: 'Request body failed schema validation.',
        errors: validate.errors.map((e) => ({
          field: e.instancePath || '(root)',
          message: e.message,
          keyword: e.keyword,
          params: e.params,
        })),
      });
    }

    // ── Step 4: Pass the resolved resource to the next handler ───────────────
    // Attaching to req avoids a redundant DB lookup in the controller
    req.resource = resource;

    next();
  } catch (err) {
    next(err); // Delegate unexpected errors to the global error handler
  }
}
