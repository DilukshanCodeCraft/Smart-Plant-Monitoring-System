const { asyncHandler } = require('../middleware/errorHandler');
const {
  getLatestReading,
  serializeReading,
  getReadingsStorageSource,
  isDatabaseConnected
} = require('../services/readingService');
const { requestDeviceCommand } = require('../services/deviceService');
const {
  syncWithDeviceStatus,
  getRoundProgressSnapshot,
  getMasterCurrentReading
} = require('../services/monitoringProgressService');
const { getUsbLuxStatusSnapshot, getBoard2StatusSnapshot } = require('../services/usbLuxBoardService');
const { countActiveAlerts } = require('../services/alertService');
const { getTopRecommendation } = require('../services/recommendationService');
const Plant = require('../models/Plant');

const DASHBOARD_DEVICE_STATUS_TIMEOUT_MS = 1800;

function toFiniteNumberOrNull(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return value;
}

function inRangeOrNull(value, min, max) {
  const numeric = toFiniteNumberOrNull(value);
  if (numeric === null) {
    return null;
  }

  return numeric >= min && numeric <= max ? numeric : null;
}

function sanitizeLiveRoundReading(round) {
  if (!round || typeof round !== 'object' || Array.isArray(round)) {
    return null;
  }

  const roundNumber = Number.isInteger(round.round) && round.round >= 1 && round.round <= 10
    ? round.round
    : null;

  const sanitized = {
    round: roundNumber,
    rootTempC: inRangeOrNull(round.rootTempC, -20, 80),
    airTempC: inRangeOrNull(round.airTempC, -20, 80),
    humidity: inRangeOrNull(round.humidity, 0, 100),
    lux: inRangeOrNull(round.lux, 0, 200000),
    soilPercent: inRangeOrNull(round.soilPercent, 0, 100),
    mqRatio: inRangeOrNull(round.mqRatio, 0, 1000),
    mqPPM: inRangeOrNull(round.mqPPM, 0, 1000000),
    // Allow slight negative drift from tare/calibration and keep it visible.
    weightG: inRangeOrNull(round.weightG, -5000, 200000),
    weightError: inRangeOrNull(round.weightError, 0, 100000)
  };

  const hasAnyMetric = (
    sanitized.rootTempC !== null ||
    sanitized.airTempC !== null ||
    sanitized.humidity !== null ||
    sanitized.lux !== null ||
    sanitized.soilPercent !== null ||
    sanitized.mqRatio !== null ||
    sanitized.mqPPM !== null ||
    sanitized.weightG !== null ||
    sanitized.weightError !== null
  );

  if (!hasAnyMetric && sanitized.round === null) {
    return null;
  }

  return sanitized;
}

const getDashboardOverviewHandler = asyncHandler(async (req, res) => {
  let latestReading = null;
  let serializedReading = null;
  let latestReadingError = null;
  const source = getReadingsStorageSource();

  if (isDatabaseConnected()) {
    latestReading = await getLatestReading(req.query.deviceId);
    serializedReading = serializeReading(latestReading);
    
    // Do not fetch database fallback for live readings to ensure fresh per-round display
  } else {
    latestReadingError = 'Database unavailable. MongoDB connection is required for readings operations.';
  }

  let deviceStatus = null;
  let deviceError = null;
  let deviceStatusObservedAt = null;
  const usbLuxBoard = getBoard2StatusSnapshot();

  try {
    // Keep dashboard responsive even if Board 1 is temporarily slow/offline.
    deviceStatus = await requestDeviceCommand('status', {
      timeoutMs: DASHBOARD_DEVICE_STATUS_TIMEOUT_MS,
      retries: 0,
      retryDelayMs: 0
    });
    deviceStatusObservedAt = new Date().toISOString();
    syncWithDeviceStatus(deviceStatus, deviceStatusObservedAt);
  } catch (error) {
    deviceError = error.message;
  }

  // Use persistent cache to avoid dashboard "flickering" during device timeouts
  const persistentReading = getMasterCurrentReading();
  const displayRoundReading = sanitizeLiveRoundReading(persistentReading || deviceStatus?.latestRound);

  // Enrichment: active alert count and top recommendation
  let activeAlertCount = 0;
  let topRecommendation = null;
  let plant = null;
  if (isDatabaseConnected()) {
    [activeAlertCount, topRecommendation, plant] = await Promise.all([
      countActiveAlerts(),
      getTopRecommendation(null),
      Plant.findOne({ archived: false }).select('name species roomOrArea deviceId').lean()
    ]);
  }

  res.json({
    monitoringState: getRoundProgressSnapshot().monitoringActive,
    deviceReachable: Boolean(deviceStatus),
    deviceStatusObservedAt,
    deviceError,
    deviceStatus,
    roundProgress: getRoundProgressSnapshot(),
    currentRoundReading: displayRoundReading,
    latestReadingSource: source,
    latestReadingError,
    latestReading: serializedReading,
    latestBatchType: serializedReading?.batchType ?? null,
    roundsUsed: typeof serializedReading?.roundsUsed === 'number' ? serializedReading.roundsUsed : null,
    monitoringSessionId: deviceStatus?.monitoringSessionId ?? getRoundProgressSnapshot().sessionId,
    usbLuxBoard,
    activeAlertCount,
    topRecommendation,
    plant
  });
});

module.exports = {
  getDashboardOverviewHandler
};
