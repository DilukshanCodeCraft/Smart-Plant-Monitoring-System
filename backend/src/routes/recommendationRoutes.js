const express = require('express');
const { listRecommendations, dismissRecommendation } = require('../services/recommendationService');
const { AppError } = require('../middleware/errorHandler');
const { requireDatabase } = require('../middleware/requireDatabase');

const router = express.Router();

router.use(requireDatabase);

// GET /api/recommendations?status=active&limit=20
router.get('/', async (req, res, next) => {
  try {
    const { status, limit, plantId } = req.query;
    const recs = await listRecommendations({
      status: status || 'active',
      limit: limit ? Math.min(parseInt(limit, 10), 100) : 20,
      plantId: plantId || undefined
    });
    res.json({ success: true, data: recs });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/recommendations/:id/dismiss
router.patch('/:id/dismiss', async (req, res, next) => {
  try {
    const rec = await dismissRecommendation(req.params.id);
    if (!rec) throw new AppError(404, 'Recommendation not found.');
    res.json({ success: true, data: rec });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
