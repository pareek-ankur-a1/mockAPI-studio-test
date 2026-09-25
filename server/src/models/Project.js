/**
 * @file Project.js
 * @description Mongoose model for a user's API mocking project.
 *
 * A Project is the top-level container. Each project gets a unique, human-readable
 * `prefix` (e.g., "proj_8f72k") that forms the first path segment of every
 * wildcard mock URL:
 *
 *   /api/mock/:projectPrefix/:resourceName
 *              ─────────────┘
 *              This field
 *
 * The prefix is generated once at creation time and is IMMUTABLE afterwards,
 * because changing it would break any consumer already calling that URL.
 */

import mongoose from 'mongoose';
import { generatePrefix } from '../utils/generatePrefix.js';

const projectSchema = new mongoose.Schema(
  {
    /**
     * Human-readable project name (e.g., "E-commerce Demo").
     */
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      maxlength: [120, 'Project name cannot exceed 120 characters'],
    },

    /**
     * Auto-generated unique slug used in all wildcard mock URLs.
     * Format: "proj_" followed by 5 random alphanumeric characters.
     *
     * Example: "proj_8f72k"
     *
     * - `unique: true`  → guaranteed collision-free at the DB level via index
     * - `immutable: true` → prevents accidental mutation via Mongoose
     * - `default`       → auto-populated before the first save (see pre-save hook)
     */
    prefix: {
      type: String,
      unique: true,
      immutable: true, // Once set, cannot be changed — URL stability guarantee
      match: [
        /^proj_[a-z0-9]{5}$/,
        'Prefix must match the pattern proj_XXXXX',
      ],
    },

    /**
     * Reference to the User who owns this project.
     * Used to scope dashboard queries: "find all projects owned by me".
     */
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Project must have an owner'],
      index: true, // Speed up "projects by owner" dashboard queries
    },

    /**
     * Optional description visible in the dashboard.
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

// ─── Pre-save Hook: Auto-generate the prefix ────────────────────────────────
/**
 * If `prefix` hasn't been set yet (i.e., this is a new document), generate one.
 *
 * We use `generatePrefix()` from a shared utility so the format stays consistent
 * across the codebase. The uniqueness index on `prefix` acts as the final safety
 * net — if there's a collision (astronomically unlikely with 5 alphanumeric chars
 * = 36^5 ≈ 60M possibilities), MongoDB will throw a duplicate-key error and the
 * caller can retry.
 */
projectSchema.pre('save', function (next) {
  if (!this.prefix) {
    this.prefix = generatePrefix(); // e.g., "proj_8f72k"
  }
  next();
});

const Project = mongoose.model('Project', projectSchema);

export default Project;
