const mongoose = require('mongoose');

const recommendationSchema = new mongoose.Schema(
  {
    plantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plant',
      default: null,
      index: true
    },
    type: {
      type: String,
      enum: [
        'watering',
        'temperature',
        'humidity',
        'light',
        'nutrition',
        'pest',
        'air_quality',
        'general'
      ],
      required: true
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high', 'urgent'],
      required: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    explanation: {
      type: String,
      required: true,
      trim: true
    },
    suggestedAction: {
      type: String,
      trim: true,
      default: null
    },
    linkedMetrics: {
      type: Object,
      default: null
    },
    linkedKBA: {
      type: String,
      default: null,
      trim: true
    },
    status: {
      type: String,
      enum: ['active', 'dismissed', 'acted'],
      default: 'active',
      index: true
    },
    readingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reading',
      default: null
    }
  },
  {
    timestamps: true
  }
);

recommendationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Recommendation', recommendationSchema);
