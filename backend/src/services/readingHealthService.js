const Alert = require('../models/Alert');
const Recommendation = require('../models/Recommendation');

const STALE_READING_THRESHOLD_MS = 60 * 60 * 1000;
const STALE_READING_HEALTH_KEY = 'stale-reading';
const STALE_READING_ALERT_TITLE = 'No readings detected in the last hour';
const STALE_READING_RECOMMENDATION_TITLE = 'Check monitoring and device connectivity';

function toValidDate(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toObjectIdString(value) {
  if (!value) {
    return null;
  }

  return typeof value?.toString === 'function' ? value.toString() : String(value);
}

function buildHealthMetrics({ latestReading, lastReadingAt, monitoringState, deviceReachable }) {
  return {
    healthKey: STALE_READING_HEALTH_KEY,
    lastReadingAt: lastReadingAt ? lastReadingAt.toISOString() : null,
    monitoringState: typeof monitoringState === 'boolean' ? monitoringState : null,
    deviceReachable: typeof deviceReachable === 'boolean' ? deviceReachable : null,
    readingId: latestReading?._id ? toObjectIdString(latestReading._id) : null
  };
}

function buildStaleReadingAlertDescription({ hasReading, monitoringState, deviceReachable }) {
  if (!hasReading) {
    if (monitoringState === true) {
      return 'No reading has been stored in the database yet even though monitoring is ON. Let one full 10-interval cycle finish or check ESP32 connectivity and backend ingestion.';
    }

    if (monitoringState === false) {
      return 'No reading has been stored in the database yet and monitoring is currently OFF. Turn monitoring on when you want data collection to resume, or confirm the pause is intentional for maintenance.';
    }

    return 'No reading has been stored in the database yet. Check whether monitoring is ON, whether the ESP32 is reachable, and whether automation or maintenance settings are intentionally pausing collection.';
  }

  if (deviceReachable === false) {
    return 'No readings have been stored in the last hour and the ESP32 is currently unreachable. Check device power, Wi-Fi, and whether monitoring is paused.';
  }

  if (monitoringState === true) {
    return 'No readings have been stored in the last hour even though monitoring is ON. Check the ESP32 connection and confirm automation or maintenance settings are not pausing collection.';
  }

  if (monitoringState === false) {
    return 'No readings have been stored in the last hour. Monitoring is currently OFF. Turn monitoring on when you want the next 10-interval cycle to run, or confirm the pause is intentional for maintenance.';
  }

  return 'No readings have been stored in the last hour. Check whether monitoring is ON, whether the ESP32 is reachable, and whether automation or maintenance settings are intentionally pausing collection.';
}

function buildStaleReadingRecommendation({ latestReading, lastReadingAt, monitoringState, deviceReachable, plantId = null }) {
  const hasReading = Boolean(lastReadingAt);
  const priority = !hasReading || monitoringState === true || deviceReachable === false ? 'urgent' : 'high';

  let explanation = 'No finalized reading has reached the database within the expected one-hour window.';
  let suggestedAction = 'Check ESP32 power, Wi-Fi, and monitoring state, then let one full 10-interval cycle complete.';

  if (!hasReading) {
    if (monitoringState === true) {
      explanation = 'Monitoring is ON but the database still has no finalized reading. That usually means the first full 10-interval cycle has not finished yet or backend ingestion needs attention.';
      suggestedAction = 'Let the current 10-interval cycle finish. If no record appears, verify the backend /api/readings endpoint, MongoDB connection, and ESP32 backend URL.';
    } else if (monitoringState === false) {
      explanation = 'Monitoring is currently OFF and no finalized reading has been stored yet.';
      suggestedAction = 'Turn monitoring on when you want data collection to resume, then wait for one full 10-interval cycle to be stored.';
    }
  } else if (deviceReachable === false) {
    explanation = 'The latest saved reading is older than one hour and the ESP32 could not be reached during the health check.';
    suggestedAction = 'Restore ESP32 power or Wi-Fi connectivity, confirm the device is online, and restart monitoring if it was paused.';
  } else if (monitoringState === true) {
    explanation = 'The latest saved reading is older than one hour even though monitoring is ON.';
    suggestedAction = 'Check the ESP32 connection, confirm the backend is reachable from the device, and verify automation or maintenance settings are not pausing data collection.';
  } else if (monitoringState === false) {
    explanation = 'The latest saved reading is older than one hour and monitoring is currently OFF.';
    suggestedAction = 'Turn monitoring back on when you want new data, or leave the alert acknowledged if the pause is intentional for maintenance.';
  }

  return {
    plantId,
    readingId: latestReading?._id || null,
    type: 'general',
    priority,
    title: STALE_READING_RECOMMENDATION_TITLE,
    explanation,
    suggestedAction,
    linkedMetrics: buildHealthMetrics({
      latestReading,
      lastReadingAt,
      monitoringState,
      deviceReachable
    }),
    linkedKBA: null
  };
}

function buildStaleReadingAlert({ latestReading, lastReadingAt, monitoringState, deviceReachable, plantId = null }) {
  const hasReading = Boolean(lastReadingAt);
  const severity = !hasReading || monitoringState === true || deviceReachable === false ? 'critical' : 'warning';

  return {
    plantId,
    readingId: latestReading?._id || null,
    severity,
    sourceType: 'device',
    title: STALE_READING_ALERT_TITLE,
    description: buildStaleReadingAlertDescription({ hasReading, monitoringState, deviceReachable }),
    linkedKBA: null,
    linkedMetrics: buildHealthMetrics({
      latestReading,
      lastReadingAt,
      monitoringState,
      deviceReachable
    })
  };
}

function buildAlertSignature(alert) {
  return JSON.stringify({
    severity: alert.severity,
    description: alert.description,
    plantId: toObjectIdString(alert.plantId),
    readingId: toObjectIdString(alert.readingId),
    monitoringState: alert.linkedMetrics?.monitoringState ?? null,
    deviceReachable: alert.linkedMetrics?.deviceReachable ?? null,
    lastReadingAt: alert.linkedMetrics?.lastReadingAt ?? null
  });
}

function buildRecommendationSignature(recommendation) {
  return JSON.stringify({
    priority: recommendation.priority,
    explanation: recommendation.explanation,
    suggestedAction: recommendation.suggestedAction,
    plantId: toObjectIdString(recommendation.plantId),
    readingId: toObjectIdString(recommendation.readingId),
    monitoringState: recommendation.linkedMetrics?.monitoringState ?? null,
    deviceReachable: recommendation.linkedMetrics?.deviceReachable ?? null,
    lastReadingAt: recommendation.linkedMetrics?.lastReadingAt ?? null
  });
}

async function upsertStaleReadingAlert(nextAlert) {
  const existingAlert = await Alert.findOne({
    title: STALE_READING_ALERT_TITLE,
    sourceType: 'device',
    'linkedMetrics.healthKey': STALE_READING_HEALTH_KEY,
    status: { $in: ['active', 'acknowledged'] }
  }).sort({ createdAt: -1 });

  if (!existingAlert) {
    return Alert.create(nextAlert);
  }

  if (buildAlertSignature(existingAlert) === buildAlertSignature(nextAlert)) {
    return existingAlert;
  }

  existingAlert.severity = nextAlert.severity;
  existingAlert.description = nextAlert.description;
  existingAlert.plantId = nextAlert.plantId;
  existingAlert.readingId = nextAlert.readingId;
  existingAlert.linkedKBA = nextAlert.linkedKBA;
  existingAlert.linkedMetrics = nextAlert.linkedMetrics;
  existingAlert.resolvedAt = null;

  await existingAlert.save();
  return existingAlert;
}

async function upsertStaleReadingRecommendation(nextRecommendation) {
  const existingRecommendation = await Recommendation.findOne({
    title: STALE_READING_RECOMMENDATION_TITLE,
    type: 'general',
    'linkedMetrics.healthKey': STALE_READING_HEALTH_KEY,
    status: 'active'
  }).sort({ createdAt: -1 });

  if (!existingRecommendation) {
    return Recommendation.create(nextRecommendation);
  }

  if (buildRecommendationSignature(existingRecommendation) === buildRecommendationSignature(nextRecommendation)) {
    return existingRecommendation;
  }

  existingRecommendation.priority = nextRecommendation.priority;
  existingRecommendation.explanation = nextRecommendation.explanation;
  existingRecommendation.suggestedAction = nextRecommendation.suggestedAction;
  existingRecommendation.plantId = nextRecommendation.plantId;
  existingRecommendation.readingId = nextRecommendation.readingId;
  existingRecommendation.linkedKBA = nextRecommendation.linkedKBA;
  existingRecommendation.linkedMetrics = nextRecommendation.linkedMetrics;

  await existingRecommendation.save();
  return existingRecommendation;
}

async function resolveStaleReadingSignals() {
  const now = new Date();

  await Promise.all([
    Alert.updateMany(
      {
        title: STALE_READING_ALERT_TITLE,
        sourceType: 'device',
        'linkedMetrics.healthKey': STALE_READING_HEALTH_KEY,
        status: { $in: ['active', 'acknowledged'] }
      },
      {
        $set: {
          status: 'resolved',
          resolvedAt: now
        }
      }
    ),
    Recommendation.updateMany(
      {
        title: STALE_READING_RECOMMENDATION_TITLE,
        type: 'general',
        'linkedMetrics.healthKey': STALE_READING_HEALTH_KEY,
        status: 'active'
      },
      {
        $set: {
          status: 'acted'
        }
      }
    )
  ]);
}

async function syncReadingFreshnessState({ latestReading = null, deviceStatus = null, deviceReachable = null, plantId = null } = {}) {
  const lastReadingAt = toValidDate(latestReading?.createdAt);
  const stale = !lastReadingAt || (Date.now() - lastReadingAt.getTime()) >= STALE_READING_THRESHOLD_MS;

  if (!stale) {
    await resolveStaleReadingSignals();
    return {
      stale: false,
      alert: null,
      recommendation: null
    };
  }

  const monitoringState = typeof deviceStatus?.monitoring === 'boolean' ? deviceStatus.monitoring : null;
  const resolvedDeviceReachable = typeof deviceReachable === 'boolean'
    ? deviceReachable
    : (deviceStatus ? true : null);

  const nextAlert = buildStaleReadingAlert({
    latestReading,
    lastReadingAt,
    monitoringState,
    deviceReachable: resolvedDeviceReachable,
    plantId
  });

  const nextRecommendation = buildStaleReadingRecommendation({
    latestReading,
    lastReadingAt,
    monitoringState,
    deviceReachable: resolvedDeviceReachable,
    plantId
  });

  const [alert, recommendation] = await Promise.all([
    upsertStaleReadingAlert(nextAlert),
    upsertStaleReadingRecommendation(nextRecommendation)
  ]);

  return {
    stale: true,
    alert,
    recommendation
  };
}

module.exports = {
  STALE_READING_ALERT_TITLE,
  STALE_READING_HEALTH_KEY,
  STALE_READING_RECOMMENDATION_TITLE,
  STALE_READING_THRESHOLD_MS,
  syncReadingFreshnessState
};