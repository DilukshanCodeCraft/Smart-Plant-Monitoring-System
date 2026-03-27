const mongoose = require('mongoose');

const BATCH_COLLECTION_NAME = typeof process.env.BATCH_COLLECTION_NAME === 'string'
  ? process.env.BATCH_COLLECTION_NAME.trim() || 'readings'
  : 'readings';

const batchReadingSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, trim: true, index: true },
    monitoringSessionId: { type: String, required: true, trim: true, index: true },
    esp32Ip: { type: String, default: null, trim: true },
    batchType: { type: String, enum: ['full'], required: true },
    roundsUsed: { type: Number, required: true, min: 10, max: 10 },
    latestRoundIncluded: { type: Boolean, default: false },
    rootTempC: { type: Number, default: null },
    airTempC: { type: Number, default: null },
    humidity: { type: Number, default: null },
    lux: { type: Number, default: null },
    soilPercent: { type: Number, default: null },
    mqRatio: { type: Number, default: null },
    mqPPM: { type: Number, default: null },
    weightG: { type: Number, default: null },
    weightError: { type: Number, default: null }
  },
  {
    timestamps: true,
    versionKey: false,
    collection: BATCH_COLLECTION_NAME,
    toJSON: {
      transform: (_doc, ret) => {
        ret.id = ret._id.toString();
        delete ret._id;
        return ret;
      }
    }
  }
);

batchReadingSchema.index({ createdAt: -1 });
batchReadingSchema.index({ deviceId: 1, createdAt: -1 });
batchReadingSchema.index({ monitoringSessionId: 1, createdAt: -1 });

module.exports = mongoose.model('BatchReading', batchReadingSchema);
