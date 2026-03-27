const Reading = require('../models/Reading');
const Plant = require('../models/Plant');
const mongoose = require('mongoose');
const { AppError } = require('../middleware/errorHandler');
const { getUsbLuxStatusSnapshot, getBoard2RoundData, getBoard2DominantLocation } = require('./usbLuxBoardService');

// Post-save pipeline: lazy imports avoid circular dependencies at startup
async function runPostSavePipeline(reading) {
  try {
    // Resolve plant linked to this deviceId (if any)
    let plantId = null;
    try {
      const plant = await Plant.findOne({ deviceId: reading.deviceId, archived: false }).select('_id').lean();
      if (plant) plantId = plant._id;
    } catch (_) { /* no plant linked yet — that is fine */ }

    const serialized = {
      id: reading._id?.toString?.() || null,
      deviceId: reading.deviceId,
      createdAt: reading.createdAt,
      soilPercent: reading.soilPercent,
      weightG: reading.weightG,
      airTempC: reading.airTempC,
      humidity: reading.humidity,
      lux: reading.lux,
      nearestBeacon: reading.nearestBeacon,
      nearestRoom: reading.nearestRoom,
      mqPPM: reading.mqPPM,
      rootTempC: reading.rootTempC,
      weightError: reading.weightError,
      vpd: reading.vpd,
      tempDifferential: reading.tempDifferential
    };

    // Fetch previous weight for nutrient-trend rule
    let previousWeightG = null;
    try {
      const prev = await Reading.findOne(
        { deviceId: reading.deviceId, weightG: { $ne: null }, _id: { $ne: reading._id } },
        { weightG: 1 }
      ).sort({ createdAt: -1 });
      if (prev) previousWeightG = prev.weightG;
    } catch (_) { /* non-fatal */ }

    // Alert generation
    const { generateAlertsFromReading } = require('./alertService');
    const generatedAlerts = await generateAlertsFromReading({
      ...serialized,
      id: reading._id
    }, plantId).catch((e) => {
      console.error('[PostSave] alertService error:', e.message);
      return [];
    });

    // Recommendation generation
    const { generateRecommendationsFromReading } = require('./recommendationService');
    const generatedRecommendations = await generateRecommendationsFromReading(serialized, reading._id, plantId).catch((e) => {
      console.error('[PostSave] recommendationService error:', e.message);
      return [];
    });

    // Rule engine evaluation
    const { evaluateRules } = require('./ruleEngine');
    await evaluateRules(serialized, { plantId, previousWeightG: previousWeightG }).catch((e) =>
      console.error('[PostSave] ruleEngine error:', e.message)
    );

    const { sendTelegramReadingSummary } = require('./telegramNotificationService');
    await sendTelegramReadingSummary({
      reading: serialized,
      plantId,
      alerts: generatedAlerts,
      recommendations: generatedRecommendations
    }).catch((e) =>
      console.error('[PostSave] telegramNotificationService error:', e.message)
    );
  } catch (err) {
    // Post-save pipeline must never crash the reading ingestion
    console.error('[PostSave] pipeline error:', err.message);
  }
}

const NUMERIC_ROUND_FIELDS = [
  'rootTempC',
  'airTempC',
  'humidity',
  'soilPercent',
  'mqRatio',
  'mqPPM',
  'weightG',
  'weightError'
];

const NUMERIC_FIELDS = [
  ...NUMERIC_ROUND_FIELDS,
  'lux'
];

const NON_LUX_NUMERIC_FIELDS = NUMERIC_ROUND_FIELDS; // same set, lux excluded

const REQUIRED_FULL_BATCH_ROUNDS = 10;

function calculateBotanicalMetrics(data) {
  const { airTempC, humidity, rootTempC } = data;
  const metrics = { vpd: null, tempDifferential: null };

  if (airTempC != null && humidity != null) {
    // VPD calculation
    // VP_sat = 0.61078 * exp((17.27 * T) / (T + 237.3)) kPa
    const vpSat = 0.61078 * Math.exp((17.27 * airTempC) / (airTempC + 237.3));
    const vpAir = vpSat * (humidity / 100);
    metrics.vpd = Number(Math.max(0, vpSat - vpAir).toFixed(4));
  }

  if (airTempC != null && rootTempC != null) {
    metrics.tempDifferential = Number((airTempC - rootTempC).toFixed(2));
  }

  return metrics;
}

const RANGE_PRESET_MS = {
  last24h: 24 * 60 * 60 * 1000,
  last7d: 7 * 24 * 60 * 60 * 1000,
  last30d: 30 * 24 * 60 * 60 * 1000
};

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new AppError(400, `${fieldName} is required.`);
  }

  return value.trim();
}

function optionalString(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new AppError(400, 'esp32Ip must be a string when provided.');
  }

  return value.trim();
}

function optionalNonEmptyString(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new AppError(400, 'Expected a string value.');
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseDate(value, fieldName) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new AppError(400, `${fieldName} must be a valid ISO date string.`);
  }

  return parsed;
}

function parseRequiredInteger(value, fieldName, min = 1, max = 200) {
  if (value === undefined || value === null || value === '') {
    throw new AppError(400, `${fieldName} is required.`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new AppError(400, `${fieldName} must be an integer between ${min} and ${max}.`);
  }

  return parsed;
}

function parseRequiredBoolean(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    throw new AppError(400, `${fieldName} is required.`);
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }

  throw new AppError(400, `${fieldName} must be true or false.`);
}

function toNullableNumber(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new AppError(400, `${fieldName} must be a valid number or null.`);
  }

  return parsed;
}

function normalizeBatchType(value) {
  if (value !== 'full') {
    throw new AppError(
      400,
      'Only full finalized batches are accepted. Partial/interrupted sessions are not stored.'
    );
  }

  return value;
}

function normalizeOptionalBatchType(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  return normalizeBatchType(value);
}

function normalizeRoundsUsed(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
    throw new AppError(
      400,
      `roundsUsed must be between 1 and 10. Incomplete/invalid session format.`
    );
  }

  return parsed;
}

/**
 * Given the raw `rounds` array from Board 1's batch payload,
 * validates each round and normalises numeric sensor values.
 * Returns an array of { roundNumber, <sensor fields> } objects.
 */
function normalizeRoundsPayload(rounds) {
  if (!Array.isArray(rounds) || rounds.length === 0) {
    return [];
  }

  return rounds
    .filter((r) => r && typeof r === 'object')
    .map((r) => {
      const roundNumber = Number(r.round ?? r.roundNumber);
      if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > 10) {
        return null;
      }

      const entry = { roundNumber };
      for (const field of NUMERIC_ROUND_FIELDS) {
        const raw = r[field];
        if (raw === null || raw === undefined || raw === '') {
          entry[field] = null;
        } else {
          const parsed = Number(raw);
          entry[field] = Number.isFinite(parsed) ? parsed : null;
        }
      }
      // Board 2 lux will be merged in separately; default to null
      entry.lux = null;
      entry.nearestBeacon = null;
      entry.nearestRoom   = null;

      // Botanical metrics for this round
      const botanical = calculateBotanicalMetrics(entry);
      entry.vpd = botanical.vpd;
      entry.tempDifferential = botanical.tempDifferential;

      return entry;
    })
    .filter(Boolean);
}

/**
 * Computes a batch-level average for a given field across all rounds.
 * Ignores null values.
 */
function avgAcrossRounds(rounds, field) {
  const values = rounds
    .map((r) => r[field])
    .filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function normalizeReadingPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AppError(400, 'Request body must be a JSON object.');
  }

  // Parse and validate the per-round data from Board 1
  const rounds = normalizeRoundsPayload(payload.rounds);

  // Compute batch-level averages from per-round data.
  // If no rounds array was sent (legacy payload), fall back to top-level fields.
  const usesRounds = rounds.length > 0;

  const normalized = {
    deviceId: requireNonEmptyString(payload.deviceId, 'deviceId'),
    esp32Ip: optionalString(payload.esp32Ip),
    monitoringSessionId: requireNonEmptyString(payload.monitoringSessionId, 'monitoringSessionId'),
    batchType: normalizeBatchType(payload.batchType),
    roundsUsed: normalizeRoundsUsed(payload.roundsUsed),
    nearestBeacon: optionalNonEmptyString(payload.nearestBeacon),
    nearestRoom: optionalNonEmptyString(payload.nearestRoom),
    rounds  // stored as-is; lux & location will be merged before save
  };

  for (const fieldName of NUMERIC_ROUND_FIELDS) {
    normalized[fieldName] = usesRounds
      ? avgAcrossRounds(rounds, fieldName)
      : toNullableNumber(payload[fieldName], fieldName);
  }

  // Lux always comes from Board 2 — initialise to null; merged later
  normalized.lux = null;

  // Batch-level botanical metrics
  const batchBotanical = calculateBotanicalMetrics(normalized);
  normalized.vpd = batchBotanical.vpd;
  normalized.tempDifferential = batchBotanical.tempDifferential;

  return normalized;
}

/**
 * Merges Board 2 (USB LuxNode) data into the normalized reading:
 *  - Matches per-round lux averages to each round by round number
 *  - Fills in nearestBeacon/nearestRoom per round from Board 2 BLE scan
 *  - Sets batch-level lux as the average of all Board 2 round lux values
 *  - Sets batch-level nearestBeacon/nearestRoom from dominant Board 2 location
 */
function mergeUsbLuxSnapshotIntoNormalizedReading(normalized) {
  // ── Per-round lux merge ───────────────────────────────────────────────────
  const board2Rounds = getBoard2RoundData(); // [{roundNumber, lux, nearestBeacon, nearestRoom}]
  console.log(`[Reading-Service] Merging Board 2 data. Board 2 has ${board2Rounds.length} finalized rounds.`);
  const board2ByRound = {};
  for (const r of board2Rounds) {
    board2ByRound[r.roundNumber] = r;
  }

  const mergedRounds = (normalized.rounds || []).map((round) => {
    const b2 = board2ByRound[round.roundNumber];
    return {
      ...round,
      lux: (b2 && b2.lux !== null) ? b2.lux : null,
      nearestBeacon: (b2 && b2.nearestBeacon) ? b2.nearestBeacon : null,
      nearestRoom:   (b2 && b2.nearestRoom)   ? b2.nearestRoom   : null
    };
  });
  normalized.rounds = mergedRounds;

  // ── Batch-level lux average from Board 2 round data ───────────────────────
  const luxValues = board2Rounds
    .map((r) => r.lux)
    .filter((v) => typeof v === 'number' && Number.isFinite(v));

  if (luxValues.length > 0) {
    normalized.lux = luxValues.reduce((sum, v) => sum + v, 0) / luxValues.length;
  } else {
    // Fall back to live snapshot lux if no per-round data available
    const snapshot = getUsbLuxStatusSnapshot();
    const snapshotLux = (snapshot?.connected && typeof snapshot.lux === 'number' && Number.isFinite(snapshot.lux))
      ? snapshot.lux
      : null;
    normalized.lux = snapshotLux;
  }

  // ── Batch-level location from Board 2 dominant BLE position ──────────────
  // ── Batch-level location from Board 2's LAST ROUND (not dominant) ───────
  // User requested using only the last value for the location batch-level field.
  const lastRoundObj = board2Rounds.find(r => r.roundNumber === (normalized.roundsUsed || 10));
  const snapshot = getUsbLuxStatusSnapshot();

  if (lastRoundObj && lastRoundObj.nearestBeacon) {
    normalized.nearestBeacon = lastRoundObj.nearestBeacon;
    normalized.nearestRoom   = lastRoundObj.nearestRoom || null;
  } else if (snapshot.nearestBeacon) {
    // Fallback to the current live beacon if the 10th round didn't capture one
    normalized.nearestBeacon = snapshot.nearestBeacon;
    normalized.nearestRoom   = snapshot.nearestRoom || null;
  }

  return normalized;
}

function serializeReading(reading) {
  if (!reading) {
    return null;
  }

  const plainReading = typeof reading.toJSON === 'function' ? reading.toJSON() : reading;
  return {
    ...plainReading,
    isPartialBatch: plainReading.batchType === 'partial'
  };
}

function ensureDatabaseConnected() {
  if (mongoose.connection.readyState !== 1) {
    throw new AppError(503, 'Database unavailable. MongoDB connection is required for readings operations.');
  }
}

function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}

function getReadingsStorageSource() {
  return isDatabaseConnected() ? 'database' : null;
}

function normalizeRangeFilter(rawOptions, { required = false } = {}) {
  const preset = optionalNonEmptyString(rawOptions.rangePreset || rawOptions.preset);
  let fromDate = rawOptions.from ? parseDate(rawOptions.from, 'from') : null;
  let toDate = rawOptions.to ? parseDate(rawOptions.to, 'to') : null;

  if (preset) {
    if (preset === 'custom') {
      if (!fromDate && !toDate) {
        throw new AppError(400, 'Custom range requires from and/or to date.');
      }
    } else if (preset !== 'all') {
      const durationMs = RANGE_PRESET_MS[preset];
      if (!durationMs) {
        throw new AppError(400, 'rangePreset must be one of all, last24h, last7d, last30d, custom.');
      }

      toDate = new Date();
      fromDate = new Date(toDate.getTime() - durationMs);
    }
  }

  if (!preset && !fromDate && !toDate && required) {
    throw new AppError(400, 'A delete range is required when deleteMode is range.');
  }

  if (fromDate && toDate && fromDate > toDate) {
    throw new AppError(400, 'from date must be earlier than or equal to to date.');
  }

  return {
    fromDate,
    toDate,
    rangePreset: preset || (fromDate || toDate ? 'custom' : 'all')
  };
}

function normalizeCommonFilters(rawOptions, { requireRange = false } = {}) {
  const deviceId = optionalNonEmptyString(rawOptions.deviceId);
  const batchType = normalizeOptionalBatchType(rawOptions.batchType);
  const rangeFilter = normalizeRangeFilter(rawOptions, { required: requireRange });

  return {
    deviceId,
    batchType,
    ...rangeFilter
  };
}

function buildMongoQuery(filters) {
  const query = {};

  if (filters.deviceId) {
    query.deviceId = filters.deviceId;
  }

  if (filters.batchType) {
    query.batchType = filters.batchType;
  }

  if (filters.fromDate || filters.toDate) {
    query.createdAt = {};
    if (filters.fromDate) {
      query.createdAt.$gte = filters.fromDate;
    }
    if (filters.toDate) {
      query.createdAt.$lte = filters.toDate;
    }
  }

  return query;
}

async function createReading(payload) {
  console.log(`[Reading-Service] Incoming POST for session: ${payload?.monitoringSessionId} (roundsUsed: ${payload?.roundsUsed})`);
  const normalized = mergeUsbLuxSnapshotIntoNormalizedReading(normalizeReadingPayload(payload));
  ensureDatabaseConnected();

  // Multi-board session merge:
  // If a second ESP32 posts lux-only data with the same monitoringSessionId,
  // merge into the existing finalized batch instead of storing a separate row.
  const existingSessionReading = await Reading.findOne({
    monitoringSessionId: normalized.monitoringSessionId
  })
    .sort({ createdAt: -1 })
    .exec();

  let reading;
  if (existingSessionReading) {
    const incomingHasAnyNonLuxMetric = NON_LUX_NUMERIC_FIELDS.some(
      (field) => normalized[field] !== null
    );

    if (incomingHasAnyNonLuxMetric) {
      // Keep the primary board identity when full non-lux metrics arrive.
      existingSessionReading.deviceId = normalized.deviceId;
      existingSessionReading.esp32Ip = normalized.esp32Ip;
    } else if (!existingSessionReading.esp32Ip && normalized.esp32Ip) {
      existingSessionReading.esp32Ip = normalized.esp32Ip;
    }

    for (const field of NUMERIC_FIELDS) {
      if (normalized[field] !== null) {
        existingSessionReading[field] = normalized[field];
      }
    }

    if (normalized.nearestBeacon !== null) {
      existingSessionReading.nearestBeacon = normalized.nearestBeacon;
    }

    if (normalized.nearestRoom !== null) {
      existingSessionReading.nearestRoom = normalized.nearestRoom;
    }

    existingSessionReading.batchType  = normalized.batchType;
    existingSessionReading.roundsUsed = normalized.roundsUsed;
    // Merge per-round data if the incoming payload has rounds
    if (normalized.rounds && normalized.rounds.length > 0) {
      existingSessionReading.rounds = normalized.rounds;
    }
    reading = await existingSessionReading.save();
  } else {
    reading = await Reading.create(normalized);
  }

  console.log(`[Reading-Service] Finalized 10-round batch STORED in ${getReadingsStorageSource()} (Session: ${normalized.monitoringSessionId})`);

  // Fire-and-forget post-save pipeline (alerts, recommendations, rule engine)
  setImmediate(() => runPostSavePipeline(reading));

  return serializeReading(reading);
}

async function getLatestReading(deviceId) {
  ensureDatabaseConnected();
  const query = deviceId ? { deviceId } : {};
  return Reading.findOne(query).sort({ createdAt: -1 }).exec();
}

function normalizeListOptions(rawOptions = {}) {
  const filters = normalizeCommonFilters(rawOptions);
  const limit = parseRequiredInteger(rawOptions.limit, 'limit', 1, 300);

  if (rawOptions.sort !== 'asc' && rawOptions.sort !== 'desc') {
    throw new AppError(400, 'sort is required and must be either asc or desc.');
  }

  const sortDirection = rawOptions.sort;

  return {
    ...filters,
    limit,
    sortDirection
  };
}

async function listReadings(rawOptions = {}) {
  const options = normalizeListOptions(rawOptions);
  ensureDatabaseConnected();
  const source = getReadingsStorageSource();

  const query = buildMongoQuery(options);
  const sort = options.sortDirection === 'asc' ? 1 : -1;

  const [readings, totalMatched] = await Promise.all([
    Reading.find(query).sort({ createdAt: sort }).limit(options.limit).exec(),
    Reading.countDocuments(query)
  ]);

  return {
    readings: readings.map((reading) => serializeReading(reading)),
    totalMatched,
    limit: options.limit,
    source
  };
}

function normalizeDeleteMode(modeValue) {
  if (modeValue === undefined || modeValue === null || modeValue === '') {
    throw new AppError(400, 'deleteMode is required.');
  }

  const normalized = modeValue.toString().toLowerCase();

  if (normalized !== 'all' && normalized !== 'range') {
    throw new AppError(400, 'deleteMode must be either all or range.');
  }

  return normalized;
}

function normalizeDeleteOptions(rawOptions = {}) {
  const deleteMode = normalizeDeleteMode(rawOptions.deleteMode || rawOptions.mode);
  const dryRun = parseRequiredBoolean(rawOptions.dryRun, 'dryRun');

  const filters = deleteMode === 'range'
    ? normalizeCommonFilters(rawOptions, { requireRange: true })
    : {
        ...normalizeCommonFilters(rawOptions),
        fromDate: null,
        toDate: null,
        rangePreset: 'all'
      };

  return {
    deleteMode,
    dryRun,
    ...filters
  };
}

async function deleteReadings(rawOptions = {}) {
  const options = normalizeDeleteOptions(rawOptions);
  ensureDatabaseConnected();
  const source = getReadingsStorageSource();

  const query = buildMongoQuery(options);
  const matchedCount = await Reading.countDocuments(query);

  if (options.dryRun) {
    return {
      source,
      deleteMode: options.deleteMode,
      dryRun: true,
      matchedCount,
      deletedCount: 0,
      rangePreset: options.rangePreset
    };
  }

  const result = await Reading.deleteMany(query);

  return {
    source,
    deleteMode: options.deleteMode,
    dryRun: false,
    matchedCount,
    deletedCount: result.deletedCount || 0,
    rangePreset: options.rangePreset
  };
}

module.exports = {
  createReading,
  getLatestReading,
  serializeReading,
  listReadings,
  deleteReadings,
  getReadingsStorageSource,
  isDatabaseConnected
};
