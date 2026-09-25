/**
 * @file Resource.js
 * @description Mongoose model for a mock resource within a project.
 *
 * A Resource maps to the second path segment in the wildcard URL:
 *
 *   /api/mock/:projectPrefix/:resourceName
 *                             ────────────┘
 *                             This field (e.g., "products", "users", "orders")
 *
 * Each Resource stores a JSON Schema (in `schemaDefinition`) that governs
 * what payloads are valid for POST / PUT requests to this mock endpoint.
 * The schema is validated at request time using Ajv (Phase 2/3).
 *
 * Architecture note — why store the schema in MongoDB?
 * ────────────────────────────────────────────────────
 * Storing the schema alongside the resource (instead of in a static file)
 * allows the dashboard to let users define, update, and version their schemas
 * dynamically without touching the server filesystem. Ajv compiles the schema
 * at runtime from this stored object on every incoming mock request.
 */

import mongoose from 'mongoose';

const resourceSchema = new mongoose.Schema(
  {
    /**
     * Back-reference to the owning Project.
     * Used in queries like: "find all resources for project X".
     */
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Resource must belong to a project'],
    },

    /**
     * The URL-safe name for this resource (e.g., "products", "blog-posts").
     *
     * Constraints:
     * - Lowercase letters, digits, and hyphens only
     * - No leading/trailing hyphens
     * - Max 60 chars (keeps URLs readable)
     *
     * This value appears verbatim in the wildcard URL path, so it must be
     * URL-safe without any encoding.
     */
    resourceName: {
      type: String,
      required: [true, 'Resource name is required'],
      trim: true,
      lowercase: true,
      maxlength: [60, 'Resource name cannot exceed 60 characters'],
      match: [
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        'Resource name must be URL-safe (lowercase letters, digits, hyphens; no leading/trailing hyphens)',
      ],
    },

    /**
     * The JSON Schema definition that governs POST / PUT validation for this resource.
     *
     * Stored as a plain JavaScript object (Mongoose `Mixed` type) because JSON Schema
     * itself has no fixed structure — it's just a nested JSON object. We deliberately
     * avoid modelling it with nested Mongoose schemas, which would constrain valid
     * JSON Schema keywords (e.g., $ref, allOf, oneOf, etc.).
     *
     * Example value:
     * {
     *   "type": "object",
     *   "properties": {
     *     "name": { "type": "string" },
     *     "price": { "type": "number", "minimum": 0 }
     *   },
     *   "required": ["name", "price"]
     * }
     *
     * Validation of the schema itself (i.e., is this valid JSON Schema?) happens
     * in the service layer using Ajv's meta-schema validation before saving.
     */
    schemaDefinition: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Schema definition is required'],
      default: {
        // Sensible default: accept any valid JSON object
        type: 'object',
        properties: {},
        additionalProperties: true,
      },
    },

    /**
     * Optional human-readable description for the dashboard UI.
     */
    description: {
      type: String,
      trim: true,
      maxlength: [500, 'Description cannot exceed 500 characters'],
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// ─── Compound Index ──────────────────────────────────────────────────────────
/**
 * Compound unique index on [projectId, resourceName].
 *
 * WHY: Within a single project, two resources cannot share the same name
 * (that would make the wildcard URL ambiguous). However, the same name
 * (e.g., "products") CAN exist across different projects.
 *
 * This index also massively speeds up the hot path in the mock engine:
 *   Resource.findOne({ projectId: ..., resourceName: ... })
 * which runs on EVERY incoming mock request.
 */
resourceSchema.index({ projectId: 1, resourceName: 1 }, { unique: true });

const Resource = mongoose.model('Resource', resourceSchema);

export default Resource;
