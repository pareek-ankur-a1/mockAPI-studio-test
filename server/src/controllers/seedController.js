/**
 * @file seedController.js
 * @description Faker-powered bulk seeding controller for the internal API.
 *
 * Route: POST /api/internal/seed
 *
 * Accepts:
 *   { resourceId: string, count: number (1–500) }
 *
 * Flow:
 *   1. Look up the Resource by resourceId
 *   2. Pass its schemaDefinition to fakerMapper.generateFakeRecord()
 *   3. Bulk-insert `count` fake records into MockData (marked isSeeded: true)
 *   4. Return the inserted records + performance stats
 *
 * Why bulk insert (insertMany) instead of a loop of create()?
 * ──────────────────────────────────────────────────────────
 * `MockData.insertMany()` sends a SINGLE MongoDB wire command with all documents.
 * A loop of `create()` calls would send N separate round-trips to MongoDB.
 * For count=100, insertMany is ~50-100x faster.
 *
 * The `ordered: false` option tells MongoDB to continue inserting remaining
 * documents even if one fails (e.g., a validation error), maximising the
 * number of records successfully seeded.
 */

import Resource from '../models/Resource.js';
import MockData from '../models/MockData.js';
import Project from '../models/Project.js';
import { generateFakeRecord } from '../utils/fakerMapper.js';

const MAX_SEED_COUNT = 500; // Hard cap to prevent accidental DB flooding

/**
 * POST /api/internal/seed
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function seedMockData(req, res, next) {
  try {
    const { resourceId, count: rawCount } = req.body;

    // ── Input Validation ────────────────────────────────────────────────────
    if (!resourceId) {
      return res.status(400).json({
        success: false,
        message: '`resourceId` is required.',
      });
    }

    const count = parseInt(rawCount, 10);
    if (isNaN(count) || count < 1) {
      return res.status(400).json({
        success: false,
        message: '`count` must be a positive integer.',
      });
    }

    if (count > MAX_SEED_COUNT) {
      return res.status(400).json({
        success: false,
        message: `Cannot seed more than ${MAX_SEED_COUNT} records at once. Requested: ${count}.`,
      });
    }

    // ── Resolve the Resource ─────────────────────────────────────────────────
    const resource = await Resource.findById(resourceId).lean();
    if (!resource) {
      return res.status(404).json({
        success: false,
        message: `Resource with id "${resourceId}" not found.`,
      });
    }

    // ── Ownership check — user may only seed their own resources ─────────────
    const project = await Project.findOne({ _id: resource.projectId, owner: req.user.userId }).lean();
    if (!project) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not own this resource.',
      });
    }

    const schema = resource.schemaDefinition;

    // ── Generate Fake Records ────────────────────────────────────────────────
    const startTime = Date.now();

    /**
     * Generate `count` fake payloads by calling generateFakeRecord() for each.
     * Each call produces a unique record because Faker uses random values.
     *
     * Then wrap each payload in the MockData document shape:
     *   { resourceId, data: <fake payload>, isSeeded: true }
     */
    const documents = Array.from({ length: count }, () => ({
      resourceId: resource._id,
      data: generateFakeRecord(schema),
      isSeeded: true, // Tag so these can be filtered/cleared separately from real data
    }));

    // ── Bulk Insert ──────────────────────────────────────────────────────────
    /**
     * insertMany with `ordered: false`:
     * - ordered: false → on partial failure, MongoDB inserts as many as possible
     *   and returns an error listing only the failed ones. Without this flag,
     *   a single failure aborts ALL remaining inserts.
     * - rawResult: true → returns the raw MongoDB result object with
     *   `insertedCount` and `insertedIds`, which we surface in the response.
     */
    const result = await req.app.locals.mockCache.mutate(project.prefix, () => MockData.insertMany(documents, {
      ordered: false,
      rawResult: true,
    }));

    const elapsed = Date.now() - startTime;

    res.status(201).json({
      success: true,
      message: `Successfully seeded ${result.insertedCount} fake records into "${resource.resourceName}".`,
      stats: {
        requested: count,
        inserted: result.insertedCount,
        resourceId: resource._id,
        resourceName: resource.resourceName,
        elapsedMs: elapsed,
      },
      // Return a preview of the first 5 records so the dashboard can show a sample
      preview: documents.slice(0, 5).map((d) => d.data),
    });
  } catch (err) {
    /**
     * insertMany with ordered:false throws a BulkWriteError when SOME inserts fail.
     * The error still contains `result.insertedCount` for partial success info.
     */
    if (err.name === 'MongoBulkWriteError') {
      return res.status(207).json({ // 207 Multi-Status — partial success
        success: false,
        message: 'Partial seed: some records failed to insert.',
        inserted: err.result?.insertedCount ?? 0,
        errors: err.writeErrors?.map((e) => e.errmsg) ?? [],
      });
    }
    next(err);
  }
}
