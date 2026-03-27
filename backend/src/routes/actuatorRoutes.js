const express = require('express');
const ActuatorLog = require('../models/ActuatorLog');
const { requestDeviceCommand } = require('../services/deviceService');
const { AppError } = require('../middleware/errorHandler');
const { isDatabaseConnected, requireDatabase } = require('../middleware/requireDatabase');

const router = express.Router();

const VALID_ACTUATORS = ['water', 'fan', 'light', 'nutri', 'pest'];
const ACTUATOR_COMMANDS = {
  water: { on: 'waterOn', off: 'waterOff' },
  fan: { on: 'fanOn', off: 'fanOff' },
  light: { on: 'lightOn', off: 'lightOff' },
  nutri: { on: 'nutriOn', off: 'nutriOff' },
  pest: { on: 'pestOn', off: 'pestOff' }
};

// GET /api/actuators/logs?actuator=water&limit=50
router.get('/logs', requireDatabase, async (req, res, next) => {
  try {
    const { actuator, limit } = req.query;
    const query = {};
    if (actuator) query.actuatorName = actuator;

    const logs = await ActuatorLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit ? Math.min(parseInt(limit, 10), 200) : 50)
      .lean();

    res.json({ success: true, data: logs });
  } catch (err) {
    next(err);
  }
});

// POST /api/actuators/:actuator — manual trigger
// Body: { state: 'on' | 'off', plantId? }
router.post('/:actuator', async (req, res, next) => {
  try {
    const { actuator } = req.params;
    const { state, plantId } = req.body;

    if (!VALID_ACTUATORS.includes(actuator)) {
      throw new AppError(400, `Unknown actuator. Valid options: ${VALID_ACTUATORS.join(', ')}`);
    }
    if (state !== 'on' && state !== 'off') {
      throw new AppError(400, 'state must be "on" or "off".');
    }

    const commandName = ACTUATOR_COMMANDS[actuator][state];
    let espResponse = null;
    let success = true;
    let errorMessage = null;

    try {
      espResponse = await requestDeviceCommand(commandName);
    } catch (err) {
      success = false;
      errorMessage = err.message;
    }

    let logStored = false;
    if (isDatabaseConnected()) {
      await ActuatorLog.create({
        actuatorName: actuator,
        state,
        trigger: 'manual',
        espResponse,
        success,
        errorMessage,
        plantId: plantId || null
      });
      logStored = true;
    }

    if (!success) {
      throw new AppError(502, `Actuator command failed: ${errorMessage}`);
    }

    res.json({
      success: true,
      data: {
        actuator,
        state,
        espResponse,
        logStored,
        warning: logStored ? null : 'Database unavailable, so this command was not written to actuator history.'
      }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
