const express = require('express');
const AutomationRule = require('../models/AutomationRule');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();

// GET /api/automation-rules
router.get('/', async (req, res, next) => {
  try {
    const rules = await AutomationRule.find().sort({ createdAt: -1 });
    res.json({ success: true, data: rules });
  } catch (err) {
    next(err);
  }
});

// POST /api/automation-rules
router.post('/', async (req, res, next) => {
  try {
    const rule = await AutomationRule.create(req.body);
    res.json({ success: true, data: rule });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/automation-rules/:id
router.patch('/:id', async (req, res, next) => {
  try {
    const rule = await AutomationRule.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!rule) throw new AppError(404, 'Rule not found.');
    res.json({ success: true, data: rule });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/automation-rules/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const rule = await AutomationRule.findByIdAndDelete(req.params.id);
    if (!rule) throw new AppError(404, 'Rule not found.');
    res.json({ success: true, message: 'Rule deleted.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
