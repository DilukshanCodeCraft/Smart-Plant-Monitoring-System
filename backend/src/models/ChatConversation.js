const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  image: {
    type: String, // Base64 data if any
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const chatConversationSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      default: 'default-user' // For MVP, or link to UserProfile
    },
    plantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plant',
      default: null
    },
    title: {
      type: String,
      default: 'New Conversation'
    },
    messages: [messageSchema],
    status: {
      type: String,
      enum: ['active', 'archived'],
      default: 'active'
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('ChatConversation', chatConversationSchema);
