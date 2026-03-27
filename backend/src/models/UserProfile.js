const mongoose = require('mongoose');

const userProfileSchema = new mongoose.Schema(
  {
    experienceLevel: {
      type: String,
      enum: ['beginner', 'intermediate', 'expert'],
      default: 'beginner'
    },
    environmentType: {
      type: String,
      enum: ['indoor', 'outdoor', 'greenhouse'],
      default: 'indoor'
    },
    notificationPreference: {
      type: String,
      enum: ['morning', 'evening', 'urgent_only'],
      default: 'urgent_only'
    },
    onboardingComplete: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('UserProfile', userProfileSchema);
