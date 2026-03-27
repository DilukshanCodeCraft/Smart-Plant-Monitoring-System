const express = require('express');
const {
  getStatusHandler,
  getSecondaryStatusHandler,
  secondaryMonitorHandler,
  secondaryOverrideRoomHandler,
  monitorHandler,
  actuatorHandler,
  sleepHandler
} = require('../controllers/deviceController');

const router = express.Router();

router.get('/status', getStatusHandler);
router.get('/secondary/status', getSecondaryStatusHandler);
router.post('/secondary/override-room', secondaryOverrideRoomHandler);
router.get('/secondary/monitor/:state(on|off)', secondaryMonitorHandler);
router.get('/monitor/:state', monitorHandler);
router.get('/:actuator(light|fan|water|pest|nutri)/:state(on|off)', actuatorHandler);
router.get('/sleep', sleepHandler);

module.exports = router;
