const Reading = require('../models/Reading');
const Plant = require('../models/Plant');
const Alert = require('../models/Alert');
const Recommendation = require('../models/Recommendation');
const { telegramBotToken } = require('../config/env');
const { requestDeviceCommand } = require('./deviceService');
const { buildAlertsFromReading } = require('./alertService');
const { buildRecommendationsFromReading } = require('./recommendationService');
const {
  STALE_READING_HEALTH_KEY,
  STALE_READING_THRESHOLD_MS,
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

function isTelegramConfigured() {
  return Boolean(telegramBotToken);
}

function buildApiUrl(method, query = {}) {
  const url = new URL(`https://api.telegram.org/bot${telegramBotToken}/${method}`);

  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  return url;
}

async function telegramGet(method, query = {}) {
  const response = await fetch(buildApiUrl(method, query));
  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.description || `Telegram API ${method} request failed.`);
  }

  return payload.result;
}

async function telegramPost(method, body) {
  const response = await fetch(buildApiUrl(method), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok || !payload?.ok) {
    throw new Error(payload?.description || `Telegram API ${method} request failed.`);
  }

  return payload.result;
}

function extractPrivateChat(update) {
  const candidates = [
    update?.message?.chat,
    update?.edited_message?.chat,
    update?.callback_query?.message?.chat
  ];

  for (const chat of candidates) {
    if (chat?.type === 'private' && chat.id !== undefined && chat.id !== null) {
      return {
        id: String(chat.id),
        username: chat.username || null,
        firstName: chat.first_name || null,
        lastName: chat.last_name || null
      };
    }
  }

  return null;
}

async function getLatestPrivateChat() {
  if (!isTelegramConfigured()) {
    return null;
  }

  const updates = await telegramGet('getUpdates');
  if (!Array.isArray(updates) || updates.length === 0) {
    return null;
  }

  for (let index = updates.length - 1; index >= 0; index -= 1) {
    const chat = extractPrivateChat(updates[index]);
    if (chat) {
      return chat;
    }
  }

  return null;
}

function formatNumber(value, digits = 1) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return 'n/a';
  }

  return Number(value).toFixed(digits);
}

function formatMetric(label, value, unit = '', digits = 1) {
  const suffix = unit ? ` ${unit}` : '';
  return `- ${label}: ${formatNumber(value, digits)}${suffix}`;
}

function formatTimestamp(value) {
  if (!value) {
    return 'unknown';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'unknown';
  }

  return date.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
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

function isReadingOlderThanOneHour(reading) {
  const timestamp = reading?.createdAt ? new Date(reading.createdAt) : null;
  if (!timestamp || Number.isNaN(timestamp.getTime())) {
    return false;
  }

  return (Date.now() - timestamp.getTime()) >= STALE_READING_THRESHOLD_MS;
}

function buildTelegramReadingMessage({ reading, plant = null, alerts = [], recommendations = [] }) {
  const topAlert = getTopAlert(alerts);
  const topRecommendation = getTopRecommendation(recommendations);

  const lines = [
    'Smart Plant Monitoring Update',
    `Recorded: ${formatTimestamp(reading.createdAt)}`,
    `Device: ${reading.deviceId || 'unknown'}`
  ];

  if (plant?.name) {
    lines.push(`Plant: ${plant.name}`);
  }

  if (isReadingOlderThanOneHour(reading)) {
    lines.push('Freshness: Latest saved reading is older than 1 hour.');
  }

  lines.push('');
  lines.push('Latest sensor readings');
  lines.push(formatMetric('Soil moisture', reading.soilPercent, '%', 0));
  lines.push(formatMetric('Air temperature', reading.airTempC, 'C', 1));
  lines.push(formatMetric('Humidity', reading.humidity, '%', 1));
  lines.push(formatMetric('Light', reading.lux, 'lux', 0));
  lines.push(formatMetric('Air quality', reading.mqPPM, 'PPM', 0));
  lines.push(formatMetric('Root temperature', reading.rootTempC, 'C', 1));
  lines.push(formatMetric('Weight', reading.weightG, 'g', 1));

  lines.push('');
  lines.push('What is happening');
  if (topAlert) {
    lines.push(`- ${topAlert.title}: ${topAlert.description}`);
  } else if (topRecommendation) {
    lines.push(`- ${topRecommendation.title}: ${topRecommendation.explanation}`);
  } else {
    lines.push('- The latest finalized batch is within the current alert thresholds.');
  }

  if (alerts.length > 1) {
    alerts
      .filter((alert) => alert !== topAlert)
      .slice(0, 2)
      .forEach((alert) => lines.push(`- Additional concern: ${alert.title}`));
  }

  lines.push('');
  lines.push('What to do');
  if (topRecommendation?.suggestedAction) {
    lines.push(`- ${topRecommendation.suggestedAction}`);
  } else if (topRecommendation?.title) {
    lines.push(`- ${topRecommendation.title}`);
  } else {
    lines.push('- No urgent action is required. Keep monitoring the plant.');
  }

  return lines.join('\n');
}

async function resolvePlant(deviceId) {
  if (!deviceId) {
    return null;
  }

  try {
    return await Plant.findOne({ deviceId, archived: false }).select('_id name species roomOrArea').lean();
  } catch {
    return null;
  }
}

async function sendTelegramTextMessage(text, successMessage = 'Telegram message sent successfully.') {
  if (!isTelegramConfigured()) {
    return {
      sent: false,
      reason: 'not-configured',
      message: 'Telegram bot token is not configured.'
    };
  }

  const chat = await getLatestPrivateChat();
  if (!chat) {
    return {
      sent: false,
      reason: 'no-private-chat',
      message: 'Telegram bot has no private chat yet. Open the bot and send /start, then retry.'
    };
  }

  await telegramPost('sendMessage', {
    chat_id: chat.id,
    text
  });

  return {
    sent: true,
    reason: null,
    chatId: chat.id,
    chatUsername: chat.username,
    message: successMessage
  };
}

async function sendTelegramReadingSummary({ reading, plant = null, plantId = null, alerts = [], recommendations = [] }) {
  const resolvedPlant = plant || (await resolvePlant(reading.deviceId));
  const effectivePlantId = plantId || resolvedPlant?._id || null;
  const effectiveAlerts = alerts.length > 0
    ? alerts
    : buildAlertsFromReading(reading, effectivePlantId, reading.id || reading._id || null);
  const effectiveRecommendations = recommendations.length > 0
    ? recommendations
    : buildRecommendationsFromReading(reading, reading.id || reading._id || null, effectivePlantId);

  const text = buildTelegramReadingMessage({
    reading,
    plant: resolvedPlant,
    alerts: effectiveAlerts,
    recommendations: effectiveRecommendations
  });

  return sendTelegramTextMessage(text, 'Latest reading summary sent to Telegram successfully.');
}

async function sendLatestReadingSummaryFromDatabase() {
  const latestReading = await Reading.findOne().sort({ createdAt: -1 }).lean();

  if (!latestReading) {
    const deviceStatus = await requestDeviceCommand('status').catch(() => null);

    await syncReadingFreshnessState({
      latestReading: null,
      deviceStatus,
      deviceReachable: Boolean(deviceStatus),
      plantId: null
    }).catch(() => null);

    const monitoringState = typeof deviceStatus?.monitoring === 'boolean'
      ? (deviceStatus.monitoring ? 'ON' : 'OFF')
      : 'Unknown';
    const deviceReachability = deviceStatus ? 'Reachable' : 'Unreachable';

    const text = [
      'Smart Plant Monitoring Update',
      'No finalized database reading is available yet.',
      `Monitoring: ${monitoringState}`,
      `ESP32 status: ${deviceReachability}`,
      '',
      'What to do',
      '- Keep monitoring ON until one full 10-interval cycle is completed and stored.',
      '- If no record appears after a full cycle, verify ESP32 backend URL, backend service, and MongoDB connection.',
      '- If monitoring is intentionally paused for maintenance, you can ignore this message for now.'
    ].join('\n');

    const delivery = await sendTelegramTextMessage(
      text,
      'No saved reading yet. A Telegram diagnostic message was sent instead.'
    );

    if (!delivery.sent) {
      return {
        ...delivery,
        reason: delivery.reason || 'no-reading',
        message: delivery.message || 'No reading is available in the database yet.'
      };
    }

    return {
      ...delivery,
      reason: 'no-reading',
      noReading: true
    };
  }

  const plant = await resolvePlant(latestReading.deviceId);
  const deviceStatus = await requestDeviceCommand('status').catch(() => null);

  await syncReadingFreshnessState({
    latestReading,
    deviceStatus,
    deviceReachable: Boolean(deviceStatus),
    plantId: plant?._id || null
  }).catch(() => null);

  const readingId = latestReading._id;
  const [alertDocs, recommendationDocs] = await Promise.all([
    Alert.find({
      status: 'active',
      $or: [
        { readingId },
        { 'linkedMetrics.healthKey': STALE_READING_HEALTH_KEY }
      ]
    }).sort({ createdAt: -1 }).lean(),
    Recommendation.find({
      status: 'active',
      $or: [
        { readingId },
        { 'linkedMetrics.healthKey': STALE_READING_HEALTH_KEY }
      ]
    }).sort({ createdAt: -1 }).lean()
  ]);

  return sendTelegramReadingSummary({
    reading: latestReading,
    plant,
    plantId: plant?._id || null,
    alerts: alertDocs,
    recommendations: recommendationDocs
  });
}

async function getTelegramNotificationStatus() {
  if (!isTelegramConfigured()) {
    return {
      configured: false,
      botUsername: null,
      chatAvailable: false,
      latestChat: null,
      message: 'Telegram bot token is not configured.'
    };
  }

  const [botInfo, latestChat] = await Promise.all([
    telegramGet('getMe').catch(() => null),
    getLatestPrivateChat().catch(() => null)
  ]);

  return {
    configured: true,
    botUsername: botInfo?.username || null,
    chatAvailable: Boolean(latestChat),
    latestChat,
    message: latestChat
      ? 'Telegram bot is ready to deliver notifications.'
      : 'Open the bot and send /start so the backend can discover your private chat.'
  };
}

module.exports = {
  getTelegramNotificationStatus,
  sendLatestReadingSummaryFromDatabase,
  sendTelegramReadingSummary
};