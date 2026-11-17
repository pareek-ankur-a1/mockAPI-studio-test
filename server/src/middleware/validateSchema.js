import Project from '../models/Project.js';
import Resource from '../models/Resource.js';
import ajv from '../utils/ajvInstance.js';

export async function validateSchema(req, res, next) {
  try {
    const { projectPrefix, resourceName } = req.params;

    // Resolve Project
    const project = await Project.findOne({ prefix: projectPrefix }).lean();
    if (!project) {
      return res.status(404).json({
        success: false,
        message: `Project with prefix "${projectPrefix}" not found.`,
      });
    }

    // Resolve Resource
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

    // Validate req.body against the stored JSON schema
    const schema = resource.schemaDefinition;

    //Assign the resource _id as the schema $id for Ajv's internal cache.
    //If this resource's schema was already compiled in a previous request, Ajv returns the cached validator function without recompiling.
    const schemaWithId = {
      ...schema,
      $id: resource._id.toString(),
    };

    // `ajv.getSchema()` returns the cached validator if it exists
    let validate = ajv.getSchema(schemaWithId.$id);
    // Another worker may have updated this schema. Compare the fresh DB definition
    if (validate && JSON.stringify(validate.schema) !== JSON.stringify(schemaWithId)) {
      ajv.removeSchema(schemaWithId.$id);
      validate = undefined;
    }
    if (!validate) {
      // First time seeing this resource: compile and cache
      validate = ajv.compile(schemaWithId);
    }

    const isValid = validate(req.body);

    if (!isValid) {
      // Ajv returns a structured error array. Each entry looks like:
      // We surface this directly so the client knows exactly what to fix.
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

    // Attaching to req avoids a redundant DB lookup in the controller
    req.resource = resource;

    next();
  } catch (err) {
    next(err); // Delegate unexpected errors to the global error handler
  }
}