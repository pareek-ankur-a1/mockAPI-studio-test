import Resource from '../models/Resource.js';
import MockData from '../models/MockData.js';
import Project from '../models/Project.js';
import { generateFakeRecord } from '../utils/fakerMapper.js';

const MAX_SEED_COUNT = 500; // Hard cap to prevent accidental DB flooding

export async function seedMockData(req, res, next) {
  try {
    const { resourceId, count: rawCount } = req.body;

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

    const resource = await Resource.findById(resourceId).lean();
    if (!resource) {
      return res.status(404).json({
        success: false,
        message: `Resource with id "${resourceId}" not found.`,
      });
    }

    const project = await Project.findOne({ _id: resource.projectId, owner: req.user.userId }).lean();
    if (!project) {
      return res.status(403).json({
        success: false,
        message: 'Forbidden. You do not own this resource.',
      });
    }

    const schema = resource.schemaDefinition;

    const startTime = Date.now();

    const documents = Array.from({ length: count }, () => ({
      resourceId: resource._id,
      data: generateFakeRecord(schema),
      isSeeded: true,
    }));

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