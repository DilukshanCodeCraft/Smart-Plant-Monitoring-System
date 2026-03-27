const mongoose = require('mongoose');

const journalEntrySchema = new mongoose.Schema(
  {
    plantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plant',
      default: null,
      index: true
    },
    entryType: {
      type: String,
      enum: [
        'watered',
        'fertilized',
        'pesticide_applied',
        'repotted',
        'pruned',
        'moved',
        'insect_observation',
        'note',
        'photo'
      ],
      required: true
    },
    note: {
      type: String,
      trim: true,
      default: null
    },
    imageUrls: {
      type: [String],
      default: []
    },
    audioUrls: {
      type: [String],
      default: []
    },
    // Snapshot of key sensor values at time of entry
    healthSnapshot: {
      airTempC: { type: Number, default: null },
      humidity: { type: Number, default: null },
      lux: { type: Number, default: null },
      soilPercent: { type: Number, default: null },
      weightG: { type: Number, default: null }
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('JournalEntry', journalEntrySchema);
