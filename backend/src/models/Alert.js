const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema(
  {
    readingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reading',
      default: null,
      index: true
    },
    plantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plant',
      default: null,
      index: true
    },
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      required: true,
      index: true
    },
    sourceType: {
      type: String,
      enum: [
        'threshold',
        'rule_engine',
        'prediction',
        'device',
        'insect_inspection',
        'maintenance'
      ],
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      required: true,
      trim: true
    },
    linkedKBA: {
      type: String,
      default: null,
      trim: true
    },
    linkedMetrics: {
      type: Object,
      default: null
    },
    status: {
      type: String,
      enum: ['active', 'acknowledged', 'resolved'],
      default: 'active',
      index: true
    },
    resolvedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

// Compound index for fast active-alert queries
alertSchema.index({ status: 1, createdAt: -1 });
alertSchema.index({ readingId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Alert', alertSchema);
