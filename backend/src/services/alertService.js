/**
 * Alert Service — generates and manages alerts from reading evaluations.
 *
 * Alert sources:
 *   - threshold violations from sensor readings
 *   - rule engine outcomes (actuator fired = potential issue)
 *   - device connectivity issues
 *   - insect inspection results
 */

const Alert = require('../models/Alert');

// KBA slug mapping for common alert conditions
const KBA_LINKS = {
  low_soil: 'overwatering-vs-underwatering',
  high_temp: 'temperature-stress',
  high_humidity: 'humidity-and-fungal-risk',
  low_light: 'grow-light-guidance',
  poor_air: 'airflow-and-ventilation',
  insect_harmful: 'insect-identification-guide',
  insect_beneficial: 'beneficial-insects-explained',
  low_weight: 'plant-weight-and-water-loss'
};

function buildAlertsFromReading(reading, plantId = null, readingId = null) {
  const alerts = [];
  const baseAlert = {
    plantId,
    readingId
  };

  const {
    soilPercent,
    airTempC,
    humidity,
    lux,
    mqPPM,
    weightG,
    weightError
  } = reading;

  // Critical: extremely dry soil
  if (soilPercent != null && soilPercent < 20) {
    alerts.push({
      ...baseAlert,
      severity: 'critical',
      sourceType: 'threshold',
      title: 'Critically Low Soil Moisture',
      description: `Soil moisture is at ${soilPercent}%, well below the critical threshold of 20%. Immediate watering is recommended.`,
      linkedKBA: KBA_LINKS.low_soil,
      linkedMetrics: { soilPercent }
    });
  } else if (soilPercent != null && soilPercent < 30) {
    alerts.push({
      ...baseAlert,
      severity: 'warning',
      sourceType: 'threshold',
      title: 'Low Soil Moisture',
      description: `Soil moisture is at ${soilPercent}%. Consider watering your plant soon.`,
      linkedKBA: KBA_LINKS.low_soil,
      linkedMetrics: { soilPercent }
    });
  }

  // Critical: very high temperature
  if (airTempC != null && airTempC > 38) {
    alerts.push({
      ...baseAlert,
      severity: 'critical',
      sourceType: 'threshold',
      title: 'Extreme Air Temperature',
      description: `Air temperature ${airTempC}°C is dangerously high. Move the plant or activate cooling.`,
      linkedKBA: KBA_LINKS.high_temp,
      linkedMetrics: { airTempC }
    });
  } else if (airTempC != null && airTempC > 32) {
    alerts.push({
      ...baseAlert,
      severity: 'warning',
      sourceType: 'threshold',
      title: 'High Air Temperature',
      description: `Air temperature ${airTempC}°C is above the recommended maximum. Fan activation may help.`,
      linkedKBA: KBA_LINKS.high_temp,
      linkedMetrics: { airTempC }
    });
  }

  // Warning: high humidity (fungal risk)
  if (humidity != null && humidity > 85) {
    alerts.push({
      ...baseAlert,
      severity: 'warning',
      sourceType: 'threshold',
      title: 'High Humidity — Fungal Risk',
      description: `Humidity at ${humidity}% is high. Poor air circulation may promote fungal growth. Consider activating the fan.`,
      linkedKBA: KBA_LINKS.high_humidity,
      linkedMetrics: { humidity }
    });
  }

  // Warning: low lux during typical daylight hours
  const hour = new Date().getUTCHours();
  if (lux != null && lux < 200 && hour >= 6 && hour <= 20) {
    alerts.push({
      ...baseAlert,
      severity: 'warning',
      sourceType: 'threshold',
      title: 'Very Low Light Level',
      description: `Ambient light is only ${lux} lux. This may be insufficient for photosynthesis. Consider activating the grow light.`,
      linkedKBA: KBA_LINKS.low_light,
      linkedMetrics: { lux }
    });
  }

  // Warning: poor air quality
  if (mqPPM != null && mqPPM > 600) {
    alerts.push({
      ...baseAlert,
      severity: 'warning',
      sourceType: 'threshold',
      title: 'Poor Air Quality',
      description: `Air quality reading is ${mqPPM} PPM, above the recommended 600 PPM threshold. Increase ventilation.`,
      linkedKBA: KBA_LINKS.poor_air,
      linkedMetrics: { mqPPM }
    });
  }

  // Warning: combined low moisture and high humidity (specific user request)
  if (soilPercent != null && soilPercent < 30 && humidity != null && humidity > 80) {
    alerts.push({
      ...baseAlert,
      severity: 'warning',
      sourceType: 'threshold',
      title: 'Action Required: Water & Ventilate',
      description: 'Water the plants as soil moisture is low and tilt the fan to blow air as potential fungal risk due to humidity increase so that to increase air circulation',
      linkedKBA: KBA_LINKS.high_humidity,
      linkedMetrics: { soilPercent, humidity }
    });
  }

  // Info: weight sensor error
  if (weightError) {
    alerts.push({
      ...baseAlert,
      severity: 'info',
      sourceType: 'maintenance',
      title: 'Weight Sensor Read Error',
      description: 'The load cell reported an error during this reading cycle. Plant weight data may be unavailable.',
      linkedMetrics: { weightError }
    });
  }

  return alerts;
}

async function generateAlertsFromReading(reading, plantId = null) {
  const alerts = buildAlertsFromReading(reading, plantId, reading?.id || reading?._id || null);

  if (alerts.length === 0) return [];

  const results = [];
  for (const alertData of alerts) {
    try {
      // Check for existing active alert with same title and sourceType
      const existing = await Alert.findOne({
        status: 'active',
        title: alertData.title,
        sourceType: alertData.sourceType,
        plantId: alertData.plantId
      });

      if (!existing) {
        const created = await Alert.create(alertData);
        results.push(created);
      } else {
        results.push(existing);
      }
    } catch (err) {
      console.error('[AlertService] Failed to persist/check alert:', err.message);
    }
  }

  return results;
}

/**
 * Create a single manual alert (e.g. from insect inspection).
 */
async function createAlert(data) {
  return Alert.create(data);
}

/**
 * List alerts, optionally filtered by status and/or plantId.
 */
async function listAlerts({ status = 'active', plantId, limit = 50 } = {}) {
  const query = {};
  if (status) query.status = status;
  if (plantId) query.plantId = plantId;

  return Alert.find(query).sort({ createdAt: -1 }).limit(limit).lean();
}

/**
 * Acknowledge an alert by ID. Returns the updated document.
 */
async function acknowledgeAlert(alertId) {
  return Alert.findByIdAndUpdate(
    alertId,
    { $set: { status: 'acknowledged' } },
    { new: true }
  );
}

/**
 * Resolve an alert by ID.
 */
async function resolveAlert(alertId) {
  return Alert.findByIdAndUpdate(
    alertId,
    { $set: { status: 'resolved', resolvedAt: new Date() } },
    { new: true }
  );
}

/**
 * Count active alerts (for dashboard summary).
 */
async function countActiveAlerts() {
  try {
    return await Alert.countDocuments({ status: 'active' });
  } catch {
    return 0;
  }
}

module.exports = {
  buildAlertsFromReading,
  generateAlertsFromReading,
  createAlert,
  listAlerts,
  acknowledgeAlert,
  resolveAlert,
  countActiveAlerts,
  KBA_LINKS
};
