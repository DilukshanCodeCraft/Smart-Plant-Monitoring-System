const express = require('express');
const BatchReading = require('../models/BatchReading');
const RoundReading = require('../models/RoundReading');
const { fetchDeviceStatus, sendDeviceCommand } = require('../services/deviceClient');

const router = express.Router();

const SENSOR_KEYS = [
  'rootTempC',
  'airTempC',
  'humidity',
  'lux',
  'soilPercent',
  'mqRatio',
  'mqPPM',
  'weightG',
  'weightError'
];

const EXPECTED_FULL_ROUNDS = 10;
const DEFAULT_LIST_LIMIT = 20;
const MAX_LIST_LIMIT = 200;
const CONFIGURED_DEVICE_ID = typeof process.env.ESP32_DEVICE_ID === 'string'
  ? process.env.ESP32_DEVICE_ID.trim() || null
  : null;

const BATCH_COLUMNS = [
  'createdAt',
  'deviceId',
  'monitoringSessionId',
  'batchType',
  'roundsUsed',
  ...SENSOR_KEYS
];

const ROUND_COLUMNS = [
  'createdAt',
  'observedAt',
  'deviceId',
  'monitoringSessionId',
  'roundNumber',
  'source',
  ...SENSOR_KEYS
];

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function toNullableNumber(value, fieldName) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw httpError(400, `${fieldName} must be a valid number when provided.`);
  }

  return parsed;
}

function requiredText(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw httpError(400, `${fieldName} is required.`);
  }

  return value.trim();
}

function requiredBatchType(value) {
  if (value !== 'full') {
    throw httpError(400, 'Only full finalized 10-round batches are accepted.');
  }

  return value;
}

function requiredInteger(value, fieldName, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw httpError(400, `${fieldName} must be an integer between ${min} and ${max}.`);
  }

  return parsed;
}

function parseSort(value, fieldName = 'sort') {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : 'desc';
  if (normalized !== 'asc' && normalized !== 'desc') {
    throw httpError(400, `${fieldName} must be asc or desc.`);
  }

  return normalized;
}

function parseLimit(value, fieldName = 'limit') {
  if (value === undefined || value === null || value === '') {
    return DEFAULT_LIST_LIMIT;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIST_LIMIT) {
    throw httpError(400, `${fieldName} must be an integer between 1 and ${MAX_LIST_LIMIT}.`);
  }

  return parsed;
}

function optionalText(value) {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw httpError(400, 'Expected text value.');
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function safeDeviceText(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBatchPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw httpError(400, 'Request body must be a JSON object.');
  }

  const normalized = {
    deviceId: requiredText(payload.deviceId || CONFIGURED_DEVICE_ID, 'deviceId'),
    monitoringSessionId: requiredText(payload.monitoringSessionId, 'monitoringSessionId'),
    esp32Ip: typeof payload.esp32Ip === 'string' ? payload.esp32Ip.trim() : null,
    batchType: requiredBatchType(payload.batchType),
    roundsUsed: requiredInteger(payload.roundsUsed, 'roundsUsed', EXPECTED_FULL_ROUNDS, EXPECTED_FULL_ROUNDS)
  };

  for (const key of SENSOR_KEYS) {
    normalized[key] = toNullableNumber(payload[key], key);
  }

  const latestRound = normalizeDeviceRoundPayloadSafe(payload.latestRound);

  return {
    batch: normalized,
    latestRound
  };
}

function normalizeDeviceRoundPayload(rawRound) {
  if (!rawRound || typeof rawRound !== 'object') {
    return null;
  }

  const roundNumber = requiredInteger(rawRound.round, 'latestRound.round', 1, EXPECTED_FULL_ROUNDS);
  const round = {
    roundNumber
  };

  for (const key of SENSOR_KEYS) {
    round[key] = toNullableNumber(rawRound[key], `latestRound.${key}`);
  }

  return round;
}

function normalizeDeviceRoundPayloadSafe(rawRound) {
  try {
    return normalizeDeviceRoundPayload(rawRound);
  } catch (_error) {
    return null;
  }
}

function toRoundView(roundDoc) {
  if (!roundDoc) {
    return null;
  }

  const plain = typeof roundDoc.toJSON === 'function' ? roundDoc.toJSON() : roundDoc;
  return {
    ...plain,
    round: plain.roundNumber
  };
}

async function upsertRoundFromDeviceStatus(deviceStatus, latestRound, observedAtIso) {
  if (!deviceStatus || !latestRound) {
    return null;
  }

  const monitoringSessionId = safeDeviceText(deviceStatus.monitoringSessionId);
  const deviceId = safeDeviceText(deviceStatus.deviceId) || CONFIGURED_DEVICE_ID;

  if (!monitoringSessionId || !deviceId) {
    return null;
  }

  const roundDoc = await RoundReading.findOneAndUpdate(
    {
      deviceId,
      monitoringSessionId,
      roundNumber: latestRound.roundNumber
    },
    {
      $set: {
        source: 'device',
        observedAt: observedAtIso ? new Date(observedAtIso) : new Date(),
        rootTempC: latestRound.rootTempC,
        airTempC: latestRound.airTempC,
        humidity: latestRound.humidity,
        lux: latestRound.lux,
        soilPercent: latestRound.soilPercent,
        mqRatio: latestRound.mqRatio,
        mqPPM: latestRound.mqPPM,
        weightG: latestRound.weightG,
        weightError: latestRound.weightError
      }
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true
    }
  ).exec();

  return roundDoc;
}

function getSortDirection(sort) {
  return sort === 'asc' ? 1 : -1;
}

router.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

router.get('/overview', async (req, res, next) => {
  try {
    const latestBatchPromise = BatchReading.findOne({}).sort({ createdAt: -1 }).exec();

    let deviceStatus = null;
    let deviceError = null;
    let deviceStatusObservedAt = null;

    try {
      deviceStatus = await fetchDeviceStatus();
      deviceStatusObservedAt = new Date().toISOString();
    } catch (error) {
      deviceError = error.message;
    }

    const latestBatchDoc = await latestBatchPromise;

    const roundFromDevice = normalizeDeviceRoundPayloadSafe(deviceStatus?.latestRound);
    let currentRoundReading = null;
    let currentRoundReadingSource = null;

    if (roundFromDevice) {
      const upserted = await upsertRoundFromDeviceStatus(deviceStatus, roundFromDevice, deviceStatusObservedAt);
      if (upserted) {
        currentRoundReading = toRoundView(upserted);
        currentRoundReadingSource = 'device';
      }
    }

    if (!currentRoundReading) {
      const sessionId = safeDeviceText(deviceStatus?.monitoringSessionId);
      const roundQuery = sessionId ? { monitoringSessionId: sessionId } : {};

      const roundFromDb = await RoundReading.findOne(roundQuery)
        .sort(sessionId ? { roundNumber: -1, createdAt: -1 } : { createdAt: -1 })
        .exec();

      if (roundFromDb) {
        currentRoundReading = toRoundView(roundFromDb);
        currentRoundReadingSource = roundFromDb.source;
      }
    }

    const completedRounds = Number.isInteger(deviceStatus?.roundsCaptured)
      ? deviceStatus.roundsCaptured
      : null;

    const currentRound = Number.isInteger(deviceStatus?.currentRound)
      ? deviceStatus.currentRound
      : null;

    const monitoringState = typeof deviceStatus?.monitoring === 'boolean'
      ? deviceStatus.monitoring
      : null;

    const waitingForFirstRound = Boolean(monitoringState)
      && (completedRounds === 0 || completedRounds === null)
      && !roundFromDevice;

    res.json({
      monitoringState,
      deviceReachable: Boolean(deviceStatus),
      deviceStatusObservedAt,
      deviceError,
      deviceStatus,
      roundProgress: {
        available: Boolean(deviceStatus),
        currentRound,
        completedRounds,
        waitingForFirstRound
      },
      currentRoundReading,
      currentRoundReadingSource,
      latestBatch: latestBatchDoc ? latestBatchDoc.toJSON() : null,
      columns: {
        round: ROUND_COLUMNS,
        batch: BATCH_COLUMNS
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/readings', async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, 'limit');
    const sort = parseSort(req.query.sort, 'sort');
    const sortDirection = getSortDirection(sort);

    const query = {};
    const deviceId = optionalText(req.query.deviceId) || CONFIGURED_DEVICE_ID;
    const monitoringSessionId = optionalText(req.query.monitoringSessionId);

    if (deviceId) {
      query.deviceId = deviceId;
    }

    if (monitoringSessionId) {
      query.monitoringSessionId = monitoringSessionId;
    }

    const [rows, total] = await Promise.all([
      BatchReading.find(query).sort({ createdAt: sortDirection }).limit(limit).exec(),
      BatchReading.countDocuments(query)
    ]);

    res.json({
      rows: rows.map((row) => row.toJSON()),
      total,
      limit,
      sort,
      columns: BATCH_COLUMNS
    });
  } catch (error) {
    next(error);
  }
});

router.get('/readings/latest', async (req, res, next) => {
  try {
    const latestBatch = await BatchReading.findOne({}).sort({ createdAt: -1 }).exec();
    res.json({
      latestBatch: latestBatch ? latestBatch.toJSON() : null,
      columns: BATCH_COLUMNS
    });
  } catch (error) {
    next(error);
  }
});

router.get('/rounds', async (req, res, next) => {
  try {
    const limit = parseLimit(req.query.limit, 'limit');
    const sort = parseSort(req.query.sort, 'sort');
    const sortDirection = getSortDirection(sort);

    const query = {};
    const deviceId = optionalText(req.query.deviceId) || CONFIGURED_DEVICE_ID;
    const monitoringSessionId = optionalText(req.query.monitoringSessionId);

    if (deviceId) {
      query.deviceId = deviceId;
    }

    if (monitoringSessionId) {
      query.monitoringSessionId = monitoringSessionId;
    }

    const [rows, total] = await Promise.all([
      RoundReading.find(query)
        .sort(monitoringSessionId ? { roundNumber: sortDirection, createdAt: sortDirection } : { createdAt: sortDirection })
        .limit(limit)
        .exec(),
      RoundReading.countDocuments(query)
    ]);

    res.json({
      rows: rows.map((row) => toRoundView(row)),
      total,
      limit,
      sort,
      columns: ROUND_COLUMNS
    });
  } catch (error) {
    next(error);
  }
});

router.post('/readings', async (req, res, next) => {
  try {
    const normalized = normalizeBatchPayload(req.body);
    const batchReading = await BatchReading.create({
      ...normalized.batch,
      latestRoundIncluded: Boolean(normalized.latestRound)
    });

    let roundReading = null;
    if (normalized.latestRound) {
      roundReading = await RoundReading.findOneAndUpdate(
        {
          deviceId: normalized.batch.deviceId,
          monitoringSessionId: normalized.batch.monitoringSessionId,
          roundNumber: normalized.latestRound.roundNumber
        },
        {
          $set: {
            source: 'device',
            observedAt: new Date(),
            rootTempC: normalized.latestRound.rootTempC,
            airTempC: normalized.latestRound.airTempC,
            humidity: normalized.latestRound.humidity,
            lux: normalized.latestRound.lux,
            soilPercent: normalized.latestRound.soilPercent,
            mqRatio: normalized.latestRound.mqRatio,
            mqPPM: normalized.latestRound.mqPPM,
            weightG: normalized.latestRound.weightG,
            weightError: normalized.latestRound.weightError
          }
        },
        {
          upsert: true,
          new: true,
          setDefaultsOnInsert: true
        }
      ).exec();
    }

    res.status(201).json({
      message: 'Finalized full 10-round batch stored successfully.',
      batchReading: batchReading.toJSON(),
      roundReading: roundReading ? toRoundView(roundReading) : null
    });
  } catch (error) {
    next(error);
  }
});

router.get('/device/:target/:state', async (req, res, next) => {
  try {
    const response = await sendDeviceCommand(req.params.target, req.params.state);
    res.json({
      target: req.params.target,
      state: req.params.state,
      response
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
