const mongoose = require('mongoose');

const kbaArticleSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    category: {
      type: String,
      enum: [
        'plant_care',
        'sensor_guide',
        'troubleshooting',
        'actuator_guide',
        'insect_guide',
        'seasonal_care'
      ],
      required: true,
      index: true
    },
    tags: {
      type: [String],
      default: []
    },
    summary: {
      type: String,
      required: true,
      trim: true
    },
    content: {
      type: String,
      required: true,
      trim: true
    },
    status: {
      type: String,
      enum: ['published', 'draft'],
      default: 'published',
      index: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('KBAArticle', kbaArticleSchema);
