const mongoose = require('mongoose');

const actuatorLogSchema = new mongoose.Schema(
  {
    actuatorName: {
      type: String,
      enum: ['water', 'fan', 'light', 'nutri', 'pest'],
      required: true,
      index: true
    },
    state: {
      type: String,
      enum: ['on', 'off'],
      required: true
    },
    // 'auto' = fired by rule engine; 'manual' = user-triggered
    trigger: {
      type: String,
      enum: ['auto', 'manual'],
      required: true
    },
    ruleId: {
      type: String,
      default: null,
      trim: true
    },
    // Confidence tier when auto-triggered
    confidenceTier: {
      type: String,
      enum: ['low', 'medium', 'high', null],
      default: null
    },
    // Sensor values that caused the rule to fire
    inputMetrics: {
      type: Object,
      default: null
    },
    // Response payload from ESP32
    espResponse: {
      type: Object,
      default: null
    },
    success: {
      type: Boolean,
      default: true
    },
    errorMessage: {
      type: String,
      default: null
    },
    plantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plant',
      default: null,
      index: true
    }
  },
  {
    timestamps: true
  }
);

actuatorLogSchema.index({ actuatorName: 1, createdAt: -1 });

module.exports = mongoose.model('ActuatorLog', actuatorLogSchema);
