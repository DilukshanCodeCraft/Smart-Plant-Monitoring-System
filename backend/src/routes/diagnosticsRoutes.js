const express = require('express');
const { requestDeviceCommand } = require('../services/deviceService');
const ActuatorLog = require('../models/ActuatorLog');
const Reading = require('../models/Reading');
const { isDatabaseConnected } = require('../middleware/requireDatabase');

const router = express.Router();

// GET /api/diagnostics
router.get('/', async (req, res, next) => {
  try {
    // Device status (live ping with timeout fallback)
    let deviceStatus = null;
    let deviceError = null;
    try {
      deviceStatus = await requestDeviceCommand('status');
    } catch (err) {
      deviceError = err.message;
    }

    const databaseAvailable = isDatabaseConnected();
    let recentCommands = [];
    let latestReading = null;
    let recentFailCount = null;

    if (databaseAvailable) {
      recentCommands = await ActuatorLog.find()
        .sort({ createdAt: -1 })
        .limit(5)
        .lean();

      latestReading = await Reading.findOne()
        .sort({ createdAt: -1 })
        .select('createdAt deviceId')
        .lean();

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      recentFailCount = await ActuatorLog.countDocuments({
        success: false,
        createdAt: { $gte: oneHourAgo }
      });
    }

    res.json({
      success: true,
      data: {
        deviceStatus,
        deviceError,
        databaseAvailable,
        lastSensorReadingAt: latestReading?.createdAt || null,
        lastSensorDeviceId: latestReading?.deviceId || null,
        recentCommands,
        recentFailCount
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
