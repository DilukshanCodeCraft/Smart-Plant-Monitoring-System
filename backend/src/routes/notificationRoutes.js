const express = require('express');
const { requireDatabase } = require('../middleware/requireDatabase');
const { getLatestReadingNotificationBundle } = require('../services/liveNotificationService');
const {
  getTelegramNotificationStatus,
  sendLatestReadingSummaryFromDatabase
} = require('../services/telegramNotificationService');

const router = express.Router();

router.get('/live', requireDatabase, async (req, res, next) => {
  try {
    const payload = await getLatestReadingNotificationBundle();
    res.json(payload);
  } catch (error) {
    next(error);
  }
});

router.get('/telegram/status', async (req, res, next) => {
  try {
    const status = await getTelegramNotificationStatus();
    res.json(status);
  } catch (error) {
    next(error);
  }
});

router.post('/telegram/send-latest', requireDatabase, async (req, res, next) => {
  try {
    const result = await sendLatestReadingSummaryFromDatabase();
    res.json(result);
  } catch (error) {
    next(error);
  }
});

module.exports = router;