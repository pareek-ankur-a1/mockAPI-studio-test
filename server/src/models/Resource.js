import mongoose from 'mongoose';

const resourceSchema = new mongoose.Schema(
  {
    // reference to the owning Project, it acts as a foreign key in SQL
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: [true, 'Resource must belong to a project'],
    },

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

    // The JSON Schema definition that governs POST / PUT validation for this resource.
    // Stored as a plain JavaScript object (Mongoose Mixed type) because JSON Schema itself has no fixed structure
    // Validation of the schema happens in the service layer using Ajv's meta-schema validation before saving.
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

    // Optional human-readable description for the dashboard UI.
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

// Compound Index
// Compound unique index on [projectId, resourceName].

resourceSchema.index({ projectId: 1, resourceName: 1 }, { unique: true });

const Resource = mongoose.model('Resource', resourceSchema);

export default Resource;