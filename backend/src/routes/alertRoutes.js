const express = require('express');
const { listAlerts, acknowledgeAlert, resolveAlert } = require('../services/alertService');
const { AppError } = require('../middleware/errorHandler');
const { requireDatabase } = require('../middleware/requireDatabase');

const router = express.Router();

router.use(requireDatabase);

// GET /api/alerts?status=active&limit=50
router.get('/', async (req, res, next) => {
  try {
    const { status, limit } = req.query;
    const alerts = await listAlerts({
      status: status || 'active',
      limit: limit ? Math.min(parseInt(limit, 10), 200) : 50
    });
    res.json({ success: true, data: alerts });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/alerts/:id/acknowledge
router.patch('/:id/acknowledge', async (req, res, next) => {
  try {
    const alert = await acknowledgeAlert(req.params.id);
    if (!alert) throw new AppError(404, 'Alert not found.');
    res.json({ success: true, data: alert });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/alerts/:id/resolve
router.patch('/:id/resolve', async (req, res, next) => {
  try {
    const alert = await resolveAlert(req.params.id);
    if (!alert) throw new AppError(404, 'Alert not found.');
    res.json({ success: true, data: alert });
  } catch (err) {
    next(err);
  }
});

// POST /api/alerts/re-evaluate-latest
router.post('/re-evaluate-latest', async (req, res, next) => {
  try {
    const { createAlert, listAlerts } = require('../services/alertService');

    // For demonstration: Always ensure the specialized alert is recorded and active
    const activeAlerts = await listAlerts({ status: 'active', limit: 50 });
    const hasSpecialAlert = activeAlerts.some(a => a.description.includes('Water the plants as soil moisture is low'));

    if (!hasSpecialAlert) {
      await createAlert({
        severity: 'warning',
        sourceType: 'threshold',
        title: 'Action Required: Water & Ventilate',
        description: 'Water the plants as soil moisture is low and tilt the fan to blow air as potential fungal risk due to humidity increase so that to increase air circulation',
        status: 'active'
      });
    }

    res.json({ success: true, message: 'Demonstration alert ensured.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
