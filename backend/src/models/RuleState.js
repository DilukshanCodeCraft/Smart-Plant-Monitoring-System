const mongoose = require('mongoose');

// Tracks anti-flapping state for each rule across reading evaluations.
// One document per rule (upserted by ruleId).
const ruleStateSchema = new mongoose.Schema(
  {
    ruleId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    // Current logical state of the controlled actuator: 'on' | 'off' | 'unknown'
    currentState: {
      type: String,
      enum: ['on', 'off', 'unknown'],
      default: 'unknown'
    },
    // Timestamp of the last time this rule fired a command
    lastFiredAt: {
      type: Date,
      default: null
    },
    // Timestamp until which the rule is in cooldown (no new commands allowed)
    cooldownUntil: {
      type: Date,
      default: null
    },
    // Rolling count of commands in the last 24 h window
    dailyCommandCount: {
      type: Number,
      default: 0
    },
    // Start of the current 24-hour window for dailyCommandCount
    dailyWindowStart: {
      type: Date,
      default: null
    },
    // How many consecutive readings have satisfied the ON condition (for confidence gating)
    consecutiveTriggers: {
      type: Number,
      default: 0
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('RuleState', ruleStateSchema);
