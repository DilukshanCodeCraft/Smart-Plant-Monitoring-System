const mongoose = require('mongoose');

const roundCollectionName = typeof process.env.ROUND_COLLECTION_NAME === 'string'
  ? process.env.ROUND_COLLECTION_NAME.trim()
  : '';

const roundSchemaOptions = {
  timestamps: true,
  versionKey: false,
  toJSON: {
    transform: (_doc, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      return ret;
    }
  }
};

if (roundCollectionName) {
  roundSchemaOptions.collection = roundCollectionName;
}

const roundReadingSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, trim: true, index: true },
    monitoringSessionId: { type: String, required: true, trim: true, index: true },
    roundNumber: { type: Number, required: true, min: 1, max: 10 },
    source: { type: String, enum: ['device'], default: 'device', required: true },
    observedAt: { type: Date, default: Date.now },
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
  roundSchemaOptions
);

roundReadingSchema.index({ deviceId: 1, monitoringSessionId: 1, roundNumber: 1 }, { unique: true });
roundReadingSchema.index({ monitoringSessionId: 1, roundNumber: 1 });
roundReadingSchema.index({ createdAt: -1 });

module.exports = mongoose.model('RoundReading', roundReadingSchema);
