const { asyncHandler } = require('../middleware/errorHandler');
const {
  createReading,
  getLatestReading,
  serializeReading,
  listReadings,
  deleteReadings,
  getReadingsStorageSource
} = require('../services/readingService');

const createReadingHandler = asyncHandler(async (req, res) => {
  const reading = await createReading(req.body);

  res.status(201).json({
    message: 'Full 10-round finalized batch stored successfully.',
    reading,
    source: getReadingsStorageSource()
  });
});

const getLatestReadingHandler = asyncHandler(async (req, res) => {
  try {
    const latestReading = await getLatestReading(req.query.deviceId);
    const serializedReading = serializeReading(latestReading);

    res.json({
      source: getReadingsStorageSource(),
      error: null,
      latestReading: serializedReading,
      latestBatchType: serializedReading?.batchType || null,
      latestRoundsUsed: typeof serializedReading?.roundsUsed === 'number' ? serializedReading.roundsUsed : null,
      monitoringSessionId: serializedReading?.monitoringSessionId || null
    });
  } catch (error) {
    if (error.statusCode === 503) {
      res.json({
        source: null,
        error: error.message,
        latestReading: null,
        latestBatchType: null,
        latestRoundsUsed: null,
        monitoringSessionId: null
      });
      return;
    }

    throw error;
  }
});

const listReadingsHandler = asyncHandler(async (req, res) => {
  try {
    const result = await listReadings(req.query);
    res.json({
      ...result,
      error: null
    });
  } catch (error) {
    if (error.statusCode === 503) {
      const requestedLimit = Number(req.query.limit);

      res.json({
        readings: [],
        totalMatched: 0,
        limit: Number.isFinite(requestedLimit) ? requestedLimit : null,
        source: null,
        error: error.message
      });
      return;
    }

    throw error;
  }
});

const deleteReadingsHandler = asyncHandler(async (req, res) => {
  const options = req.body && Object.keys(req.body).length > 0 ? req.body : req.query;
  const result = await deleteReadings(options);

  const message = result.dryRun
    ? `Matched ${result.matchedCount} reading record(s).`
    : `Deleted ${result.deletedCount} reading record(s).`;

  res.json({
    message,
    ...result
  });
});

module.exports = {
  createReadingHandler,
  getLatestReadingHandler,
  listReadingsHandler,
  deleteReadingsHandler
};
