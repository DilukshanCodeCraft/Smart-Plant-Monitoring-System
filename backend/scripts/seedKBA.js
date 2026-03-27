/**
 * KBA seed script — populates the Knowledge Base with core articles.
 * Run with: node backend/scripts/seedKBA.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const KBAArticle = require('../src/models/KBAArticle');

const ARTICLES = [
  {
    slug: 'overwatering-vs-underwatering',
    title: 'Overwatering vs Underwatering — How to Tell the Difference',
    category: 'plant_care',
    tags: ['watering', 'soil moisture', 'root health'],
    summary: 'Learn how to distinguish overwatering from underwatering and keep your plant soil at the right moisture level.',
    content: `## Overwatering vs Underwatering

Both overwatering and underwatering are common causes of plant death, and the symptoms can look surprisingly similar.

### Signs of Underwatering
- Soil pulls away from the edges of the pot
- Leaves feel dry, papery, or crispy at the tips
- Plant looks wilted even after watering
- Soil moisture reading below 25%
- Plant weight is dropping quickly

### Signs of Overwatering
- Soil stays wet for days
- Leaves are yellowing, especially lower ones
- Root rot smell
- Soft, mushy stems near the soil
- Soil moisture consistently above 80%

### The 35–43% Rule
The Smart Plant system targets keeping soil moisture between 35% and 43% as a healthy operating band. The water pump turns on below 35% and turns off at 43% to prevent overwatering.

### Tips
1. Always check soil moisture at the root zone, not just the surface.
2. Use the weight trend — a rapidly dropping weight during hot days indicates high transpiration.
3. Ensure your pot has drainage holes to allow excess water to escape.`
  },
  {
    slug: 'temperature-stress',
    title: 'Temperature Stress in Plants — Causes and Solutions',
    category: 'plant_care',
    tags: ['temperature', 'heat stress', 'cold stress'],
    summary: 'High and low temperatures both stress plants. Learn the warning signs and how to respond.',
    content: `## Temperature Stress in Plants

Most common houseplants thrive between 18°C and 30°C. Outside this range, plant growth slows and stress responses begin.

### Heat Stress (above 32°C)
- Wilting and drooping even with adequate water
- Leaf curl or scorch
- Premature flower drop
- Increased water consumption

**Response:** Activate the fan to increase airflow and reduce temperature. Temporarily move the plant away from direct sunlight sources.

### Cold Stress (below 12°C)
- Slow growth
- Root function impairment (poor water and nutrient uptake)
- Discolouration, especially in tropical plants
- Wilting despite normal soil moisture

**Response:** Move the plant to a warmer area. Avoid placing pots on cold stone or tile floors.

### The Automation Response
The fan auto-rule (TM-1) activates when air temperature reaches 32°C. This provides active cooling during warm periods. You can always override the fan manually from the Control Center.`
  },
  {
    slug: 'humidity-and-fungal-risk',
    title: 'Managing Humidity — Avoiding Fungal and Mould Problems',
    category: 'plant_care',
    tags: ['humidity', 'fungal', 'ventilation', 'mould'],
    summary: 'Humidity that is too high encourages fungal disease. Learn how to keep it in the right range.',
    content: `## Managing Humidity

Most houseplants prefer 40–70% relative humidity. Above 80%, fungal diseases like powdery mildew and botrytis become a significant risk.

### Symptoms of Humidity Problems
- White powdery coating on leaves (powdery mildew)
- Grey fuzzy growth on leaves or stems (botrytis)
- Leaf spots and yellowing
- Soft or wet stem base at soil level

### What to Do
1. **Activate the fan** — airflow is the most effective way to reduce humidity quickly.
2. Avoid misting plants if humidity is already high.
3. Space plants apart to allow air movement between them.
4. Remove any dead or dying plant material promptly.

### Automation
The TM-1 fan rule activates when humidity exceeds 80% combined with elevated CO₂/gas levels (mqPPM > 400). This covers the most common high-humidity + poor air quality scenario.`
  },
  {
    slug: 'grow-light-guidance',
    title: 'Using a Grow Light — When and How',
    category: 'actuator_guide',
    tags: ['light', 'grow light', 'photosynthesis', 'lux'],
    summary: 'Grow lights compensate for low natural light. Understand light levels and safe automation behaviour.',
    content: `## Using a Grow Light

Plants need light for photosynthesis. When natural light is insufficient (cloudy days, winter, north-facing rooms), a grow light can fill the gap.

### Light Level Guide
| Lux Range | Condition | Suitability |
|-----------|-----------|-------------|
| < 200 | Very low | Insufficient for most plants |
| 200–500 | Low | Suitable for low-light plants only |
| 500–2000 | Medium | Good for most houseplants |
| > 2000 | Bright | Ideal for light-hungry plants |

### The LL-1 Automation Rule
The grow light auto-rule (LL-1) turns on when light drops below 500 lux during daytime hours (6 AM to 8 PM UTC) and turns off when it reaches 800 lux. A 10-minute minimum hold prevents rapid on/off cycling.

### Cautions
- Do **not** leave grow lights on overnight unless your plant requires it — most plants need a dark period.
- Position the light 20–50 cm from the plant for most LED grow lights.
- The automation is limited to the 6–20 UTC window to protect the plant's natural rhythm.`
  },
  {
    slug: 'airflow-and-ventilation',
    title: 'Airflow and Ventilation — Why Your Plant Needs Fresh Air',
    category: 'plant_care',
    tags: ['fan', 'ventilation', 'air quality', 'Co2', 'mqPPM'],
    summary: 'Good airflow reduces disease risk, strengthens stems, and improves gas exchange. Learn when to use the fan.',
    content: `## Airflow and Ventilation

Plants rely on air movement for several reasons:
1. **CO₂ exchange** — fresh air replenishes CO₂ for photosynthesis.
2. **Transpiration control** — moving air helps plants regulate temperature.
3. **Disease prevention** — stagnant, humid air promotes mould and bacteria.

### Air Quality Sensor (MQ135)
The MQ135 sensor measures general air quality as a PPM (parts per million) estimate. A reading above 400–600 PPM in an enclosed space indicates poor ventilation.

### The TM-1 Fan Rule
The fan activates automatically when:
- Air temperature exceeds 32°C, OR
- Humidity is above 80% AND air quality (mqPPM) is above 400

### Manual Fan Use
You can always turn the fan on or off manually from the Control Center regardless of the automatic rule.`
  },
  {
    slug: 'insect-identification-guide',
    title: 'Identifying Plant Insects — Harmful vs Non-Harmful',
    category: 'insect_guide',
    tags: ['insects', 'pests', 'arthropods', 'detection'],
    summary: 'Not all insects are harmful. Learn how to identify common plant insects and when to act.',
    content: `## Identifying Plant Insects

The Smart Plant system uses AI (YOLO11) to detect arthropods via the camera. Results are classified into:

### Harmful Insects
These insects damage plants by feeding on leaves, stems, or roots, or by transmitting disease.
- **Spider mites** — tiny, web-spinning mites that suck cell contents
- **Aphids** — soft-bodied insects that form colonies on new growth
- **Fungus gnats** — larvae damage roots; adults spread disease
- **Thrips** — scratch and suck tissue, leaving silvery streaks

**Response:** If a harmful insect is confirmed at high confidence on two consecutive checks, the system can automatically trigger the pesticide spray. You can also do this manually from the Control Center.

### Beneficial Insects
These insects help the plant or its environment and should be left alone.
- **Ladybirds / ladybugs** — prey on aphids
- **Lacewings** — larvae eat mites and aphids
- **Parasitic wasps** — control caterpillar and aphid populations
- **Springtails** — break down decaying matter in soil

### Uncertain Results
If confidence is below 70%, run another inspection in better lighting. The system will not trigger pesticide spray for uncertain results.`
  },
  {
    slug: 'beneficial-insects-explained',
    title: 'Beneficial Insects — Why Some Bugs Are Good for Your Plant',
    category: 'insect_guide',
    tags: ['beneficial insects', 'biological control', 'ladybird', 'lacewing'],
    summary: 'Some insects actively protect your plant. Learn which ones to welcome and which to treat as allies.',
    content: `## Beneficial Insects Explained

Not every insect detection should trigger concern. Many insects are harmless or actively beneficial.

### Why the System Doesn't Auto-Spray for Every Detection
The Smart Plant arthropod detector is designed to:
1. Classify detections as harmful, beneficial, or uncertain
2. Only recommend pesticide spray for **harmful** insects at **high confidence** with **two consecutive confirmations**
3. Show a positive advisory when a beneficial insect is detected

### Common Beneficial Insects
- **Ladybird beetles** (ladybugs) — eat aphids and scale insects
- **Green lacewings** — larvae are voracious predators of small insects
- **Hoverflies** — feed on aphids in larval stage, pollinate as adults
- **Rove beetles** — hunt fungus gnats and other soil pests

### What to Do When You See a Beneficial
No action is needed. The recommendation center will note the observation and suggest monitoring rather than treatment.

### Key Principle
The biological approach: **fight pests naturally where possible, use chemicals only as a confirmed last resort**. This protects the plant environment and avoids unnecessary chemical exposure.`
  },
  {
    slug: 'plant-weight-and-water-loss',
    title: 'Understanding Plant Weight — Tracking Water Loss and Growth',
    category: 'sensor_guide',
    tags: ['weight', 'load cell', 'water loss', 'growth tracking'],
    summary: 'The load cell tracks plant weight to measure water loss and detect growth trends. Learn how to interpret the readings.',
    content: `## Plant Weight and Water Loss

The load cell sensor continuously weighs the plant (soil, pot, and plant together).

### What Weight Changes Mean

**Rapid weight drop:**
- Natural transpiration (the plant releases water vapour through leaves)
- Accelerated by high temperature or low humidity
- Normal: 5–30g change between readings depending on plant size and conditions

**Very slow change or no change:**
- Possibly signalling growth stagnation
- Could indicate a nutrient deficiency
- The NT-1 rule monitors for flat weight trends and can trigger the nutrient spray

**Weight increase:**
- After watering (immediate jump)
- Indicative of root zone water retention

### The Weight Trend Feature
The system stores historical weight readings and calculates rolling trends. A flat 48-hour trend combined with no watering events triggers the nutrient spray recommendation.

### Weight Sensor Errors
If the load cell reports an error, it means the HX711 ADC was unable to complete the reading (timeout or noise). This is usually temporary. If errors persist, check sensor wiring.`
  },
  {
    slug: 'fertilization-guide',
    title: 'Fertilizing Your Plant — When, How Often, and How Much',
    category: 'plant_care',
    tags: ['nutrition', 'fertilizer', 'nutrient', 'growth'],
    summary: 'Nutrients are essential for plant growth. Learn how the nutrient spray system works and when to fertilize.',
    content: `## Fertilizing Your Plant

Plants need three primary nutrients: Nitrogen (N), Phosphorus (P), and Potassium (K), plus a range of micronutrients.

### When to Fertilize
- During active growing seasons (spring and summer)
- When plant shows slow growth despite adequate light, temperature, and water
- The NT-1 rule auto-triggers after detecting weight stagnation over 2+ readings, with a 24-hour cooldown between applications

### How the Nutrient Spray Works
The nutrient spray pump delivers a diluted liquid fertilizer directly to the root zone. Each activation is a short burst (5 seconds) to avoid over-fertilizing.

### Cautions
- **Never fertilize immediately after repotting** — roots need recovery time
- **Do not fertilize sick or stressed plants** — fix the underlying issue first
- The system enforces a maximum of 1 nutrient spray per 24 hours as a safety gate

### Signs of Overfeeding
- Leaf tip burn
- Salt crust on the top of soil
- Sudden drooping without watering change

If you suspect overfeeding, flush the soil with plain water.`
  },
  {
    slug: 'sensor-reading-guide',
    title: 'Understanding Your Sensor Readings',
    category: 'sensor_guide',
    tags: ['sensors', 'soil moisture', 'temperature', 'humidity', 'lux', 'air quality'],
    summary: 'A practical guide to understanding all sensor readings shown in the dashboard.',
    content: `## Understanding Your Sensor Readings

### Soil Moisture (soilPercent)
Measured by a capacitive sensor near the root zone.
- **< 25%** — Dry, needs water
- **25–35%** — Getting low
- **35–65%** — Optimal range
- **65–80%** — Moist but acceptable
- **> 80%** — Very wet, risk of overwatering

### Air Temperature (airTempC)
From DHT11 sensor.
- Optimal: 18–30°C for most houseplants
- Above 32°C: fan activates automatically

### Root Temperature (rootTempC)
From DS18B20 probe near root zone.
- Below 10°C can impair nutrient uptake
- Optimal: 18–25°C

### Humidity (humidity %)
From DHT11 sensor.
- Optimal range: 40–70%
- Above 80%: fungal risk, fan recommended

### Light (lux)
From BH1750 sensor measuring ambient light.
- Below 500 lux during the day: grow light activates

### Air Quality (mqRatio / mqPPM)
From MQ135 sensor measuring gas/VOC levels.
- Above 400–600 PPM in an enclosed space indicates poor ventilation

### Plant Weight (weightG)
From HX711 + load cell.
- Tracks water loss and growth trends
- Sudden jump: watered; gradual drop: normal transpiration`
  }
];

async function seed() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI not set. Add it to backend/.env before running seed.');
  }

  let openedConnection = false;
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri);
    openedConnection = true;
    console.log('Connected to MongoDB');
  }

  const summary = await seedWithExistingConnection();

  if (openedConnection) {
    await mongoose.disconnect();
  }

  return summary;
}

async function seedWithExistingConnection() {
  let inserted = 0;
  let skipped = 0;

  for (const article of ARTICLES) {
    try {
      const result = await KBAArticle.updateOne(
        { slug: article.slug },
        { $setOnInsert: article },
        { upsert: true }
      );

      if (result.upsertedCount > 0) {
        inserted += 1;
      }
    } catch (err) {
      console.warn(`Skipped ${article.slug}: ${err.message}`);
      skipped += 1;
    }
  }

  return {
    inserted,
    skipped,
    total: ARTICLES.length
  };
}

if (require.main === module) {
  seed()
    .then((summary) => {
      console.log(
        `KBA seed complete. Inserted missing: ${summary.inserted}, Existing kept: ${summary.total - summary.inserted}, Skipped: ${summary.skipped}`
      );
    })
    .catch((err) => {
      console.error('Seed failed:', err.message);
      process.exit(1);
    });
}

module.exports = {
  ARTICLES,
  seed,
  seedWithExistingConnection
};
