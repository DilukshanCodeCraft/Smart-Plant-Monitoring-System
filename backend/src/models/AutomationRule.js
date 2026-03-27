const mongoose = require('mongoose');

const conditionSchema = new mongoose.Schema({
  sensor: {
    type: String,
    enum: ['soilPercent', 'airTempC', 'rootTempC', 'humidity', 'lux', 'mqPPM', 'weightG', 'vpd', 'time'],
    required: true
  },
  operator: {
    type: String,
    enum: ['>', '<', '==', '!=', '>=', '<='],
    required: true
  },
  value: {
    type: Number,
    required: true
  }
});

const automationRuleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: String,
    conditions: [conditionSchema],
    conditionLogic: {
      type: String,
      enum: ['AND', 'OR'],
      default: 'AND'
    },
    action: {
      actuator: {
        type: String,
        enum: ['water', 'fan', 'light', 'pest', 'nutri'],
        required: true
      },
      command: {
        type: String,
        enum: ['on', 'off'],
        required: true
      }
    },
    durationMinutes: {
      type: Number,
      default: 0 // 0 means indefinite until condition changes
    },
    cooldownMinutes: {
      type: Number,
      default: 30
    },
    status: {
      type: String,
      enum: ['active', 'paused'],
      default: 'active'
    },
    isDefault: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('AutomationRule', automationRuleSchema);
