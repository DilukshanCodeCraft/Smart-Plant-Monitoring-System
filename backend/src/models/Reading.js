const mongoose = require('mongoose');

// Per-round sub-document (Board 1 sensors + Board 2 lux merged)
const roundDataSchema = new mongoose.Schema(
  {
    roundNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 10
    },
    // Board 1 sensor averages for this round
    rootTempC:   { type: Number, default: null },
    airTempC:    { type: Number, default: null },
    humidity:    { type: Number, default: null },
    soilPercent: { type: Number, default: null },
    mqRatio:     { type: Number, default: null },
    mqPPM:       { type: Number, default: null },
    weightG:     { type: Number, default: null },
    weightError: { type: Number, default: null },
    // Board 2 lux average for this round (merged from usbLuxBoardService)
    lux:         { type: Number, default: null },
    // Location at time of this round (from Board 2 BLE)
    nearestBeacon: { type: String, default: null, trim: true },
    nearestRoom:   { type: String, default: null, trim: true },
    vpd:           { type: Number, default: null },
    tempDifferential: { type: Number, default: null }
  },
  { _id: false }
);

const readingSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────────────────────────────────
    deviceId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    esp32Ip: {
      type: String,
      default: null,
      trim: true
    },
    monitoringSessionId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    batchType: {
      type: String,
      required: true,
      enum: ['full']
    },
    roundsUsed: {
      type: Number,
      required: true,
      min: 1,
      max: 10
    },

    // ── Batch-level averaged values (across all 10 rounds) ───────────────────
    rootTempC:   { type: Number, default: null },
    airTempC:    { type: Number, default: null },
    humidity:    { type: Number, default: null },
    lux:         { type: Number, default: null },  // averaged from Board 2 rounds
    soilPercent: { type: Number, default: null },
    mqRatio:     { type: Number, default: null },
    mqPPM:       { type: Number, default: null },
    weightG:     { type: Number, default: null },
    weightError: { type: Number, default: null },
    vpd:         { type: Number, default: null },
    tempDifferential: { type: Number, default: null },

    // ── Location (from Board 2 BLE — dominant across batch) ─────────────────
    nearestBeacon: { type: String, default: null, trim: true },
    nearestRoom:   { type: String, default: null, trim: true },

    // ── Per-round breakdown (up to 10 entries) ───────────────────────────────
    // Each entry contains Board 1 sensor averages + Board 2 lux for that round.
    rounds: {
      type: [roundDataSchema],
      default: []
    }
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        return ret;
      }
    }
  }
);

readingSchema.index({ createdAt: -1 });
readingSchema.index({ deviceId: 1, createdAt: -1 });

module.exports = mongoose.model('Reading', readingSchema);
