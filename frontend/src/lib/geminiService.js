import { GoogleGenAI, Type } from '@google/genai';

const MODEL_NAME = import.meta.env.VITE_GEMINI_MODEL || 'gemini-3-flash-preview';

const LEAF_DIAGNOSIS_DETAILS = {
  'Nutrient Deficiency': {
    tone: 'nutrient',
    description: 'The leaf pattern suggests nutrient stress, usually visible as yellowing, browning, or uneven discoloration across the tissue.',
    recommendations: [
      'Apply a balanced fertilizer with nitrogen, phosphorus, and potassium.',
      'Check the soil condition and add compost to improve nutrient retention.',
      'Monitor new growth over the next few days to confirm the plant is recovering.'
    ]
  },
  'Water Deficiency': {
    tone: 'water',
    description: 'The image shows signs of water stress such as drying, curling, crisp edges, or a wilted leaf structure.',
    recommendations: [
      'Increase watering consistency and avoid letting the root zone fully dry out.',
      'Water deeply rather than applying frequent shallow watering.',
      'Use mulch or improve the potting mix so the soil holds moisture longer.'
    ]
  },
  'Insect Bite': {
    tone: 'insect',
    description: 'The leaf appears to have bite marks, chewed edges, or holes that are consistent with insect feeding damage.',
    recommendations: [
      'Inspect the undersides of leaves for pests and egg clusters.',
      'Use neem oil or insecticidal soap if active pests are present.',
      'Remove heavily damaged leaves and isolate the plant if the issue is spreading.'
    ]
  },
  Diseases: {
    tone: 'disease',
    description: 'The damage pattern resembles disease symptoms such as spots, lesions, fuzzy growth, or irregular discoloration.',
    recommendations: [
      'Remove affected leaves promptly and keep them away from healthy plants.',
      'Improve air circulation and avoid wetting foliage during watering.',
      'Use an appropriate fungicide or treatment if the pattern continues to spread.'
    ]
  },
  'Too Sunlight': {
    tone: 'sunlight',
    description: 'The leaf looks sun-stressed, with burn marks, bleaching, or scorched tissue from excessive direct light exposure.',
    recommendations: [
      'Move the plant to filtered light or provide shade during the hottest hours.',
      'Increase watering slightly while the plant recovers from heat stress.',
      'Rotate the plant gradually if you need it to adapt to brighter conditions.'
    ]
  }
};

function getAI() {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (typeof apiKey !== 'string' || apiKey.trim().length < 10) {
    throw new Error('VITE_GEMINI_API_KEY is missing or invalid.');
  }

  return new GoogleGenAI({ apiKey: apiKey.trim() });
}

function cleanModelText(value) {
  return String(value || '')
    .replace(/["']/g, '')
    .trim();
}

function resolveMimeType(providedMimeType, fallbackMimeType) {
  if (typeof providedMimeType === 'string' && providedMimeType.trim().length > 0) {
    return providedMimeType;
  }

  return fallbackMimeType;
}

function parseJsonResponse(text, fallbackMessage) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw new Error(fallbackMessage);
  }

  return JSON.parse(text);
}

export async function analyzeLeafDamage(imageBase64, mimeType = 'image/jpeg') {
  const ai = getAI();

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: {
      parts: [
        {
          text: `Analyze this plant leaf image and respond with only one exact label: Nutrient Deficiency, Water Deficiency, Insect Bite, Diseases, or Too Sunlight. Pick the single best match for the primary visible issue.`
        },
        {
          inlineData: {
            data: imageBase64,
            mimeType: resolveMimeType(mimeType, 'image/jpeg')
          }
        }
      ]
    },
    config: {
      temperature: 0.2
    }
  });

  const rawDiagnosis = cleanModelText(response.text);
  const condition = Object.keys(LEAF_DIAGNOSIS_DETAILS).find((label) => rawDiagnosis.toLowerCase().includes(label.toLowerCase()));

  if (!condition) {
    throw new Error(`Leaf diagnosis could not be mapped from model output: ${rawDiagnosis || 'empty response'}`);
  }

  return {
    condition,
    ...LEAF_DIAGNOSIS_DETAILS[condition]
  };
}

export async function analyzeInsectAudio(audioBase64, mimeType = 'audio/webm') {
  const ai = getAI();

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: {
      parts: [
        {
          inlineData: {
            data: audioBase64,
            mimeType: resolveMimeType(mimeType, 'audio/webm')
          }
        },
        {
          text: `You are a bioacoustic entomologist. Analyze this audio recording for insect activity. Return JSON with this exact shape:
{
  "insect_detected": true/false,
  "likely_insect": "string (e.g., cricket, grasshopper, bee)",
  "confidence": "string (Low/Medium/High)",
  "sound_traits": ["string"],
  "observed_patterns": "string (brief description of what you heard)",
  "frequency_range": "string (e.g., 2-5 kHz)",
  "rhythm": "string (e.g., steady, pulsing, irregular)",
  "plant_threat_level": "string (None/Low/Medium/High)",
  "threat_reason": "string (explanation of threat)",
  "recommended_actions": ["string"],
  "monitoring_note": "string (useful context for grower)"
}`
        }
      ]
    },
    config: {
      temperature: 0.5,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          insect_detected: { type: Type.BOOLEAN },
          likely_insect: { type: Type.STRING },
          confidence: { type: Type.STRING },
          sound_traits: { type: Type.ARRAY, items: { type: Type.STRING } },
          observed_patterns: { type: Type.STRING },
          frequency_range: { type: Type.STRING },
          rhythm: { type: Type.STRING },
          plant_threat_level: { type: Type.STRING },
          threat_reason: { type: Type.STRING },
          recommended_actions: { type: Type.ARRAY, items: { type: Type.STRING } },
          monitoring_note: { type: Type.STRING }
        },
        required: ['insect_detected', 'likely_insect', 'confidence', 'sound_traits', 'observed_patterns', 'frequency_range', 'rhythm', 'plant_threat_level', 'threat_reason', 'recommended_actions', 'monitoring_note']
      }
    }
  });

  return parseJsonResponse(response.text, 'Insect audio analysis did not return JSON.');
}

export async function analyzePlantLight(imageBase64, mimeType = 'image/jpeg') {
  const ai = getAI();

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: {
      parts: [
        {
          inlineData: {
            data: imageBase64,
            mimeType: resolveMimeType(mimeType, 'image/jpeg')
          }
        },
        {
          text: `Analyze this image like a plant light meter and environmental observer.

Return JSON with this exact shape:
{
  "plant_detected": "string",
  "suitability_label": "Unsuitable/Poor/Good/Optimal",
  "score": 0,
  "summary": "string",
  "source": "Natural/Artificial/Mixed",
  "source_desc": "string",
  "ppfd": "string",
  "dli": "string",
  "spectral": {"Blue (Veg)": 0, "Green": 0, "Red (Yield)": 0, "Far-Red": 0},
  "rb_ratio": "string",
  "rb_focus": "string",
  "rfr_status": "string",
  "hazards": "string",
  "optimization": ["string"],
  "library_matches": {"Monstera": 0, "Succulent": 0, "Snake Plant": 0, "Pothos": 0, "Fiddle Leaf Fig": 0}
}`
        }
      ]
    },
    config: {
      temperature: 0.4,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          plant_detected: { type: Type.STRING },
          suitability_label: { type: Type.STRING },
          score: { type: Type.NUMBER },
          summary: { type: Type.STRING },
          source: { type: Type.STRING },
          source_desc: { type: Type.STRING },
          ppfd: { type: Type.STRING },
          dli: { type: Type.STRING },
          spectral: {
            type: Type.OBJECT,
            properties: {
              'Blue (Veg)': { type: Type.NUMBER },
              Green: { type: Type.NUMBER },
              'Red (Yield)': { type: Type.NUMBER },
              'Far-Red': { type: Type.NUMBER }
            },
            required: ['Blue (Veg)', 'Green', 'Red (Yield)', 'Far-Red']
          },
          rb_ratio: { type: Type.STRING },
          rb_focus: { type: Type.STRING },
          rfr_status: { type: Type.STRING },
          hazards: { type: Type.STRING },
          optimization: { type: Type.ARRAY, items: { type: Type.STRING } },
          library_matches: {
            type: Type.OBJECT,
            properties: {
              Monstera: { type: Type.NUMBER },
              Succulent: { type: Type.NUMBER },
              'Snake Plant': { type: Type.NUMBER },
              Pothos: { type: Type.NUMBER },
              'Fiddle Leaf Fig': { type: Type.NUMBER }
            }
          }
        },
        required: ['plant_detected', 'suitability_label', 'score', 'summary', 'source', 'source_desc', 'ppfd', 'dli', 'spectral', 'rb_ratio', 'rb_focus', 'rfr_status', 'hazards', 'optimization', 'library_matches']
      }
    }
  });

  return parseJsonResponse(response.text, 'Light analysis did not return JSON.');
}

export async function getDoctorResponse(message, imageBase64, mimeType = 'image/jpeg') {
  const ai = getAI();
  const parts = [{ text: message }];

  if (imageBase64) {
    parts.push({
      inlineData: {
        data: imageBase64,
        mimeType: resolveMimeType(mimeType, 'image/jpeg')
      }
    });
  }

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: { parts },
    config: {
      systemInstruction: `You are Doctor Bloom, a warm and expert plant-care assistant. If an image is provided, analyze it and provide structured guidance. Return JSON response with this exact shape:
{
  "greeting": "string (warm opening)",
  "image_analysis": "string or null (only if image provided, describe visible plant condition)",
  "primary_concern": "string (the main issue from text or image)",
  "assessment": "string (your expert assessment)",
  "immediate_actions": ["string"],
  "care_schedule": {
    "watering": "string",
    "lighting": "string",
    "feeding": "string"
  },
  "prevention": ["string"],
  "success_indicators": ["string"],
  "follow_up": "string (when to check back)"
}`,
      temperature: 0.6,
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          greeting: { type: Type.STRING },
          image_analysis: { type: Type.STRING },
          primary_concern: { type: Type.STRING },
          assessment: { type: Type.STRING },
          immediate_actions: { type: Type.ARRAY, items: { type: Type.STRING } },
          care_schedule: {
            type: Type.OBJECT,
            properties: {
              watering: { type: Type.STRING },
              lighting: { type: Type.STRING },
              feeding: { type: Type.STRING }
            },
            required: ['watering', 'lighting', 'feeding']
          },
          prevention: { type: Type.ARRAY, items: { type: Type.STRING } },
          success_indicators: { type: Type.ARRAY, items: { type: Type.STRING } },
          follow_up: { type: Type.STRING }
        },
        required: ['greeting', 'primary_concern', 'assessment', 'immediate_actions', 'care_schedule', 'prevention', 'success_indicators', 'follow_up']
      }
    }
  });

  return parseJsonResponse(response.text, 'Doctor Bloom could not formulate a structured response.');
}