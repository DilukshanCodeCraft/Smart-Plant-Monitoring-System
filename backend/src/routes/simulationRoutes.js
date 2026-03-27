const express = require('express');
const {
  startSimulationHandler,
  stopSimulationHandler,
  getSimulationStatusHandler
} = require('../controllers/simulationController');

const router = express.Router();

router.post('/start', startSimulationHandler);
router.post('/stop', stopSimulationHandler);
router.get('/status', getSimulationStatusHandler);

module.exports = router;
