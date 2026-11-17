import mongoose from 'mongoose';

const mockDataSchema = new mongoose.Schema(
  {
    // Back-reference to the Resource this record belongs to.
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resource',
      required: [true, 'MockData must reference a Resource'],
      index: true,
    },

    // The actual mock payload the user posted (after Ajv validation).
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'Mock payload (data) is required'],
    },

    // Optional tag to distinguish seeded (faker-generated) records from real ones.
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

mockDataSchema.index({ resourceId: 1, createdAt: -1 });

const MockData = mongoose.model('MockData', mockDataSchema);

export default MockData;