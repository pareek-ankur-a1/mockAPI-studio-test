import mongoose from 'mongoose';
import { generatePrefix } from '../utils/generatePrefix.js';

const projectSchema = new mongoose.Schema(
  {
    // project name given by user
    name: {
      type: String,
      required: [true, 'Project name is required'],
      trim: true,
      maxlength: [120, 'Project name cannot exceed 120 characters'],
    },

    /**
     * unique: true: guaranteed collision-free at the DB level via index
     * immutable: true: prevents accidental mutation via Mongoose
     * default: auto-populated before the first save (pre-save hook)
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

    // Reference to the User who owns this project.
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Project must have an owner'],
      index: true, // Speed up "projects by owner" dashboard queries
    },

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

// if prefix is not yet generated (new project) then generate one. 36^5 possible prefixes
// low collision probabilitiy and index on prefix acts as a safety net.
projectSchema.pre('save', function (next) {
  if (!this.prefix) {
    this.prefix = generatePrefix();
  }
  next();
});

const Project = mongoose.model('Project', projectSchema);

export default Project;