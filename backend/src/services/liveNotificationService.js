const Alert = require('../models/Alert');
const Recommendation = require('../models/Recommendation');
const Reading = require('../models/Reading');
const Plant = require('../models/Plant');
const { requestDeviceCommand } = require('./deviceService');
const {
  STALE_READING_HEALTH_KEY,
  syncReadingFreshnessState
} = require('./readingHealthService');

const ALERT_SEVERITY_ORDER = {
  critical: 0,
  warning: 1,
  info: 2
};

const RECOMMENDATION_PRIORITY_ORDER = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3
};

function serializeDocument(doc) {
  if (!doc) {
    return null;
  }

  const plain = typeof doc.toJSON === 'function' ? doc.toJSON() : { ...doc };
  if (plain._id && !plain.id) {
    plain.id = plain._id.toString();
  }

  return plain;
}

function getTopAlert(alerts = []) {
  return [...alerts].sort(
    (left, right) =>
      (ALERT_SEVERITY_ORDER[left.severity] ?? 99) - (ALERT_SEVERITY_ORDER[right.severity] ?? 99)
  )[0] || null;
}

function getTopRecommendation(recommendations = []) {
  return [...recommendations].sort(
    (left, right) =>
      (RECOMMENDATION_PRIORITY_ORDER[left.priority] ?? 99) - (RECOMMENDATION_PRIORITY_ORDER[right.priority] ?? 99)
  )[0] || null;
}

function buildNotificationKey({ latestReading, alerts, recommendations }) {
  const latestAlert = alerts[0] || null;
  const latestRecommendation = recommendations[0] || null;

  return [
    latestReading?.id || 'no-reading',
    latestReading?.updatedAt || latestReading?.createdAt || 'no-reading-ts',
    latestAlert?.id || latestAlert?._id?.toString?.() || 'no-alert',
    latestAlert?.updatedAt || latestAlert?.createdAt || 'no-alert-ts',
    latestRecommendation?.id || latestRecommendation?._id?.toString?.() || 'no-recommendation',
    latestRecommendation?.updatedAt || latestRecommendation?.createdAt || 'no-recommendation-ts'
  ].join(':');
}

async function getLatestReadingNotificationBundle() {
  const latestReadingDoc = await Reading.findOne().sort({ createdAt: -1 }).lean();

  const latestReading = serializeDocument(latestReadingDoc);

  let plantDoc = null;
  if (latestReading?.deviceId) {
    plantDoc = await Plant.findOne({ deviceId: latestReading.deviceId, archived: false })
      .select('name species roomOrArea deviceId')
      .lean();
  }

  if (!plantDoc) {
    plantDoc = await Plant.findOne({ archived: false }).select('name species roomOrArea deviceId').lean();
  }

  const deviceStatus = await requestDeviceCommand('status').catch(() => null);
  await syncReadingFreshnessState({
    latestReading: latestReadingDoc,
    deviceStatus,
    deviceReachable: Boolean(deviceStatus),
    plantId: plantDoc?._id || null
  }).catch(() => null);

  const readingId = latestReadingDoc?._id || null;
  const alertQuery = readingId
    ? {
        status: 'active',
        $or: [
          { readingId },
          { 'linkedMetrics.healthKey': STALE_READING_HEALTH_KEY }
        ]
      }
    : {
        status: 'active',
        'linkedMetrics.healthKey': STALE_READING_HEALTH_KEY
      };
  const recommendationQuery = readingId
    ? {
        status: 'active',
        $or: [
          { readingId },
          { 'linkedMetrics.healthKey': STALE_READING_HEALTH_KEY }
        ]
      }
    : {
        status: 'active',
        'linkedMetrics.healthKey': STALE_READING_HEALTH_KEY
      };

  const [alertDocs, recommendationDocs] = await Promise.all([
    Alert.find(alertQuery).sort({ createdAt: -1 }).lean(),
    Recommendation.find(recommendationQuery).sort({ createdAt: -1 }).lean()
  ]);

  const plant = serializeDocument(plantDoc);
  const alerts = alertDocs.map((doc) => serializeDocument(doc));
  const recommendations = recommendationDocs.map((doc) => serializeDocument(doc));
  const topAlert = getTopAlert(alerts);
  const topRecommendation = getTopRecommendation(recommendations);

  return {
    latestReading,
    plant,
    alerts,
    recommendations,
    topAlert,
    topRecommendation,
    notificationKey: topAlert || topRecommendation
      ? buildNotificationKey({ latestReading, alerts, recommendations })
      : null
  };
}

module.exports = {
  getLatestReadingNotificationBundle
};