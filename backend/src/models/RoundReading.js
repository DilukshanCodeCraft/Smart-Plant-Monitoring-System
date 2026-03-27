const mongoose = require('mongoose');

const roundReadingSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    monitoringSessionId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    roundNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 10
    },
    source: {
      type: String,
      enum: ['device', 'batch', 'synthetic'],
      default: 'batch',
      description: 'device = from ESP32 per-round endpoint, batch = extracted from batch posting, synthetic = derived from latest batch'
    },
    rootTempC: {
      type: Number,
      default: null
    },
    airTempC: {
      type: Number,
      default: null
    },
    humidity: {
      type: Number,
      default: null
    },
    lux: {
      type: Number,
      default: null
    },
    soilPercent: {
      type: Number,
      default: null
    },
    mqRatio: {
      type: Number,
      default: null
    },
    mqPPM: {
      type: Number,
      default: null
    },
    weightG: {
      type: Number,
      default: null
    },
    weightError: {
      type: Number,
      default: null
    },
    vpd: {
      type: Number,
      default: null
    },
    tempDifferential: {
      type: Number,
      default: null
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

roundReadingSchema.index({ monitoringSessionId: 1, roundNumber: 1 });
roundReadingSchema.index({ deviceId: 1, createdAt: -1 });
roundReadingSchema.index({ createdAt: -1 });

module.exports = mongoose.model('RoundReading', roundReadingSchema);
