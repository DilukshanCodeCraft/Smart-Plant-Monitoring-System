const { asyncHandler } = require('../middleware/errorHandler');
const { startSimulation, stopSimulation, getSimulationStatus } = require('../services/simulationService');

/**
 * Controller for managing the real-time simulation showpiece.
 */
const startSimulationHandler = asyncHandler(async (req, res) => {
  const result = startSimulation();
  res.json({ message: 'Simulation task initialized.', ...result });
});

const stopSimulationHandler = asyncHandler(async (req, res) => {
  const result = stopSimulation();
  res.json({ message: 'Simulation task terminated.', ...result });
});

const getSimulationStatusHandler = asyncHandler(async (req, res) => {
  const result = getSimulationStatus();
  res.json(result);
});

module.exports = {
  startSimulationHandler,
  stopSimulationHandler,
  getSimulationStatusHandler
};
