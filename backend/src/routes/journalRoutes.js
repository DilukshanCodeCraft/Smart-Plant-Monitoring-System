const express = require('express');
const JournalEntry = require('../models/JournalEntry');
const { AppError } = require('../middleware/errorHandler');
const { requireDatabase } = require('../middleware/requireDatabase');

const router = express.Router();

router.use(requireDatabase);

// GET /api/journal?plantId=xxx&limit=50
router.get('/', async (req, res, next) => {
  try {
    const { plantId, limit } = req.query;
    const query = {};
    if (plantId) query.plantId = plantId;

    const entries = await JournalEntry.find(query)
      .sort({ createdAt: -1 })
      .limit(limit ? Math.min(parseInt(limit, 10), 200) : 50)
      .lean();

    res.json({ success: true, data: entries });
  } catch (err) {
    next(err);
  }
});

// POST /api/journal
router.post('/', async (req, res, next) => {
  try {
    const { plantId, entryType, note, imageUrls, audioUrls, healthSnapshot } = req.body;

    const VALID_TYPES = [
      'watered', 'fertilized', 'pesticide_applied', 'repotted',
      'pruned', 'moved', 'insect_observation', 'note', 'photo'
    ];

    if (!entryType || !VALID_TYPES.includes(entryType)) {
      throw new AppError(400, `entryType must be one of: ${VALID_TYPES.join(', ')}`);
    }

    const entry = await JournalEntry.create({
      plantId: plantId || null,
      entryType,
      note: note || null,
      imageUrls: Array.isArray(imageUrls) ? imageUrls : [],
      audioUrls: Array.isArray(audioUrls) ? audioUrls : [],
      healthSnapshot: healthSnapshot || {}
    });

    res.status(201).json({ success: true, data: entry });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/journal/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const entry = await JournalEntry.findByIdAndDelete(req.params.id);
    if (!entry) throw new AppError(404, 'Journal entry not found.');
    res.json({ success: true, message: 'Deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
