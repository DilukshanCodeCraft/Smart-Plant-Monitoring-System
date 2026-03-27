const express = require('express');
const ChatConversation = require('../models/ChatConversation');

const router = express.Router();

// GET /api/chat/conversations
router.get('/conversations', async (req, res, next) => {
  try {
    const list = await ChatConversation.find({ status: 'active' }).sort({ createdAt: -1 }).limit(10);
    res.json({ success: true, data: list });
  } catch (err) {
    next(err);
  }
});

// GET /api/chat/latest
router.get('/latest', async (req, res, next) => {
  try {
    const latest = await ChatConversation.findOne({ status: 'active' }).sort({ createdAt: -1 });
    res.json({ success: true, data: latest });
  } catch (err) {
    next(err);
  }
});

// POST /api/chat/conversations
router.post('/conversations', async (req, res, next) => {
  try {
    const conv = await ChatConversation.create(req.body);
    res.json({ success: true, data: conv });
  } catch (err) {
    next(err);
  }
});

// POST /api/chat/conversations/:id/messages
router.post('/conversations/:id/messages', async (req, res, next) => {
  try {
    const conv = await ChatConversation.findByIdAndUpdate(
      req.params.id,
      { $push: { messages: req.body } },
      { new: true }
    );
    res.json({ success: true, data: conv });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
