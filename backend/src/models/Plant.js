const mongoose = require('mongoose');

const plantSchema = new mongoose.Schema(
  {
    deviceId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    species: {
      type: String,
      trim: true,
      default: null
    },
    scientificName: {
      type: String,
      trim: true,
      default: null
    },
    roomOrArea: {
      type: String,
      trim: true,
      default: null
    },
    notes: {
      type: String,
      trim: true,
      default: null
    },
    potMaterial: {
      type: String,
      trim: true,
      default: null
    },
    potSize: {
      type: String,
      trim: true,
      default: null
    },
    toxicityFlag: {
      type: Boolean,
      default: false
    },
    archived: {
      type: Boolean,
      default: false,
      index: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Plant', plantSchema);
