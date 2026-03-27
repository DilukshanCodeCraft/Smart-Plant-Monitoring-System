/**
 * Recommendation Service — generates care recommendations from sensor readings.
 *
 * Recommendations are rule-based for MVP.
 * Each recommendation includes a clear explanation, priority tier,
 * and an optional suggested action + KBA link.
 */

const Recommendation = require('../models/Recommendation');

const KBA_LINKS = {
  water: 'overwatering-vs-underwatering',
  temperature: 'temperature-stress',
  humidity: 'humidity-and-fungal-risk',
  light: 'grow-light-guidance',
  air: 'airflow-and-ventilation',
  pest: 'insect-identification-guide',
  nutrition: 'fertilization-guide'
};

function buildRecommendationsFromReading(reading, readingId = null, plantId = null) {
  const recs = [];

  const { soilPercent, airTempC, humidity, lux, mqPPM, weightG, rootTempC } = reading;

  // Watering recommendation
  if (soilPercent != null) {
    if (soilPercent < 30) {
      recs.push({
        plantId,
        readingId,
        type: 'watering',
        priority: soilPercent < 20 ? 'urgent' : 'high',
        title: 'Water your plant',
        explanation: `Soil moisture is at ${soilPercent}%. ${
          soilPercent < 20
            ? 'This is a critical level — the plant may be experiencing drought stress.'
            : 'This is below the recommended 30% minimum for healthy growth.'
        }`,
        suggestedAction: 'Turn on the water pump or add water manually.',
        linkedMetrics: { soilPercent },
        linkedKBA: KBA_LINKS.water
      });
    } else if (soilPercent > 80) {
      recs.push({
        plantId,
        readingId,
        type: 'watering',
        priority: 'medium',
        title: 'Possible overwatering',
        explanation: `Soil moisture is ${soilPercent}%, which is very high. Overwatering can suffocate roots and promote root rot.`,
        suggestedAction: 'Allow the soil to dry before watering again. Ensure adequate drainage.',
        linkedMetrics: { soilPercent },
        linkedKBA: KBA_LINKS.water
      });
    }
  }

  // Temperature recommendation
  if (airTempC != null && airTempC > 32) {
    recs.push({
      plantId,
      readingId,
      type: 'temperature',
      priority: airTempC > 38 ? 'urgent' : 'high',
      title: 'Reduce ambient temperature',
      explanation: `Air temperature is ${airTempC}°C, which is above the optimal range for most plants (18–30°C). High temperatures increase water loss and stress.`,
      suggestedAction: 'Turn on the fan or move the plant to a cooler location.',
      linkedMetrics: { airTempC },
      linkedKBA: KBA_LINKS.temperature
    });
  } else if (airTempC != null && airTempC < 12) {
    recs.push({
      plantId,
      readingId,
      type: 'temperature',
      priority: 'medium',
      title: 'Temperature too low',
      explanation: `Air temperature is ${airTempC}°C. Cold temperatures below 12°C can slow growth and damage tropical plants.`,
      suggestedAction: 'Move the plant to a warmer area or use a heat lamp.',
      linkedMetrics: { airTempC }
    });
  }

  // Humidity recommendation
  if (humidity != null) {
    if (humidity > 85) {
      recs.push({
        plantId,
        readingId,
        type: 'humidity',
        priority: 'medium',
        title: 'Improve air circulation',
        explanation: `Humidity is ${humidity}%, above the recommended maximum of 80%. High humidity can lead to fungal diseases like powdery mildew.`,
        suggestedAction: 'Activate the fan to increase airflow and reduce humidity.',
        linkedMetrics: { humidity },
        linkedKBA: KBA_LINKS.humidity
      });
    } else if (humidity < 30) {
      recs.push({
        plantId,
        readingId,
        type: 'humidity',
        priority: 'medium',
        title: 'Humidity too low',
        explanation: `Humidity is only ${humidity}%, below the recommended 40%. Low humidity can cause tip burn and increased water loss.`,
        suggestedAction: 'Use a humidifier or place a tray of water near the plant.',
        linkedMetrics: { humidity }
      });
    }
  }

  // Light recommendation
  const hour = new Date().getUTCHours();
  if (lux != null && lux < 300 && hour >= 6 && hour <= 20) {
    recs.push({
      plantId,
      readingId,
      type: 'light',
      priority: lux < 100 ? 'high' : 'medium',
      title: 'Increase light exposure',
      explanation: `Current light level is ${lux} lux during daytime hours. Most houseplants need 500–2000+ lux for healthy growth.`,
      suggestedAction: 'Turn on the grow light or move the plant to a brighter window.',
      linkedMetrics: { lux },
      linkedKBA: KBA_LINKS.light
    });
  }

  // Air quality recommendation
  if (mqPPM != null && mqPPM > 500) {
    recs.push({
      plantId,
      readingId,
      type: 'air_quality',
      priority: 'medium',
      title: 'Improve ventilation',
      explanation: `Air quality reading is ${mqPPM} PPM, indicating elevated gases or volatile compounds. This can stress the plant and slow growth.`,
      suggestedAction: 'Activate the fan or open windows to improve air circulation.',
      linkedMetrics: { mqPPM },
      linkedKBA: KBA_LINKS.air
    });
  }

  // Root temperature concern (linked to soil warmth)
  if (rootTempC != null && rootTempC < 10) {
    recs.push({
      plantId,
      readingId,
      type: 'temperature',
      priority: 'medium',
      title: 'Root zone too cold',
      explanation: `Root temperature is ${rootTempC}°C. Cold roots reduce water and nutrient uptake, slowing growth even when air temperature is fine.`,
      suggestedAction: 'Move the pot to a warmer surface — avoid cold floors.',
      linkedMetrics: { rootTempC }
    });
  }

  return recs;
}

/**
 * Derive recommendations from a finalized reading.
 * Returns array of created Recommendation documents.
 */
async function generateRecommendationsFromReading(reading, readingId = null, plantId = null) {
  const recs = buildRecommendationsFromReading(reading, readingId, plantId);

  if (recs.length === 0) return [];

  try {
    const created = await Recommendation.insertMany(recs);
    return created;
  } catch (err) {
    console.error('[RecommendationService] Failed to persist recommendations:', err.message);
    return [];
  }
}

/**
 * Add an insect-related recommendation based on arthropod detection result.
 */
async function generateInsectRecommendation(insectPayload, plantId = null) {
  const { category, confidence, summary } = insectPayload;

  let rec;

  if (category === 'beneficial') {
    rec = {
      plantId,
      type: 'pest',
      priority: 'low',
      title: 'Beneficial insect observed — no action needed',
      explanation:
        'The inspection found an insect that is beneficial or non-harmful to plants. No pesticide action is recommended. Monitor the plant and allow the insect to continue its role.',
      suggestedAction: null,
      linkedMetrics: { category, confidence },
      linkedKBA: 'beneficial-insects-explained'
    };
  } else if (category === 'harmful') {
    rec = {
      plantId,
      type: 'pest',
      priority: confidence >= 0.7 ? 'urgent' : 'high',
      title: 'Possible harmful insect detected',
      explanation: `The arthropod detector observed a likely harmful insect (confidence: ${Math.round(
        (confidence || 0) * 100
      )}%). ${summary || ''} Early treatment may prevent infestation.`,
      suggestedAction: 'Review the latest inspection image. If confirmed, apply targeted pesticide spray.',
      linkedMetrics: { category, confidence },
      linkedKBA: 'insect-identification-guide'
    };
  } else {
    rec = {
      plantId,
      type: 'pest',
      priority: 'low',
      title: 'Insect observation — uncertain result',
      explanation:
        'An insect was observed but could not be confidently classified. No immediate action is recommended. Run another inspection for confirmation.',
      suggestedAction: 'Run another inspection in better lighting for a clearer result.',
      linkedMetrics: { category, confidence },
      linkedKBA: 'insect-identification-guide'
    };
  }

  try {
    return await Recommendation.create(rec);
  } catch (err) {
    console.error('[RecommendationService] Failed to persist insect recommendation:', err.message);
    return null;
  }
}

/**
 * List active recommendations, optionally filtered by plantId.
 */
async function listRecommendations({ plantId, status = 'active', limit = 20 } = {}) {
  const query = {};
  if (status) query.status = status;
  if (plantId) query.plantId = plantId;

  return Recommendation.find(query).sort({ createdAt: -1 }).limit(limit).lean();
}

/**
 * Get the single highest-priority active recommendation for the dashboard.
 */
async function getTopRecommendation(plantId) {
  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  const recs = await Recommendation.find({
    status: 'active',
    ...(plantId ? { plantId } : {})
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return recs.sort((a, b) => (priorityOrder[a.priority] ?? 4) - (priorityOrder[b.priority] ?? 4))[0] || null;
}

/**
 * Dismiss a recommendation.
 */
async function dismissRecommendation(recId) {
  return Recommendation.findByIdAndUpdate(recId, { $set: { status: 'dismissed' } }, { new: true });
}

module.exports = {
  buildRecommendationsFromReading,
  generateRecommendationsFromReading,
  generateInsectRecommendation,
  listRecommendations,
  getTopRecommendation,
  dismissRecommendation
};
