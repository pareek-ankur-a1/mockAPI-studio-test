/**
 * @file MockData.js
 * @description Mongoose model for storing arbitrary mock payloads.
 *
 * This is the "leaf" of the data hierarchy:
 *   User → Project → Resource → MockData (many records)
 *
 * The `data` field uses `Schema.Types.Mixed`, which tells Mongoose to store
 * the value as a raw BSON document without any structural validation at the
 * ORM level. ALL validation is done upstream by Ajv against the Resource's
 * `schemaDefinition` before a MockData document is ever created.
 *
 * Why Mixed here and not in Resource.schemaDefinition only?
 * ──────────────────────────────────────────────────────────
 * `schemaDefinition` stores the *rules* (a fixed JSON Schema object — relatively
 * predictable shape). `data` stores the *arbitrary payloads* that users POST to
 * their mock endpoints — these can look like anything: nested arrays, deep objects,
 * primitive values. Mongoose's Mixed type maps to MongoDB's BSON "document" type
 * and stores whatever JavaScript object you hand it, giving us a true schemaless
 * experience inside a schema-validated ORM.
 */

import mongoose from 'mongoose';

const mockDataSchema = new mongoose.Schema(
  {
    /**
     * Back-reference to the Resource this record belongs to.
     *
     * Used in every mock engine query:
     *   MockData.find({ resourceId: resource._id })
     *
     * The index on this field is critical — without it, fetching all records for a
     * resource would do a full collection scan as the dataset grows.
     */
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resource',
      required: [true, 'MockData must reference a Resource'],
      index: true, // Index for O(log n) lookups instead of O(n) collection scans
    },

    /**
     * The actual mock payload — whatever the user POSTed (after Ajv validation).
     *
     * Schema.Types.Mixed → Mongoose will not cast, validate, or strip any fields.
     * The raw object is passed through directly to MongoDB's storage layer.
     *
     * IMPORTANT: Because Mongoose cannot detect in-place mutations on Mixed fields
     * (e.g., doc.data.someField = newValue), callers MUST call doc.markModified('data')
     * before doc.save() when performing partial updates (PUT). This is documented
     * in the service layer.
     */
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Mock payload (data) is required'],
    },

    /**
     * Optional tag to distinguish seeded (faker-generated) records from real ones.
     * Useful for dashboard filtering: "Show only seeded data" or "Clear seeded data".
     */
    isSeeded: {
      type: Boolean,
      default: false,
      index: true, // Allow efficient bulk-delete of seeded records
    },
  },
  {
    timestamps: true, // createdAt lets consumers sort by insertion order
  }
);

// ─── Compound Index for Scoped Queries ──────────────────────────────────────
/**
 * Compound index on [resourceId, createdAt].
 *
 * Optimises the most common dashboard query: "give me the last N records for
 * this resource, newest first":
 *   MockData.find({ resourceId }).sort({ createdAt: -1 }).limit(N)
 */
mockDataSchema.index({ resourceId: 1, createdAt: -1 });

const MockData = mongoose.model('MockData', mockDataSchema);

export default MockData;
