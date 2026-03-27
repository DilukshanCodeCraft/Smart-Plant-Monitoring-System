const mongoose = require('mongoose');
const Reading = require('../src/models/Reading');
const RoundReading = require('../src/models/RoundReading');
require('dotenv').config({ path: './backend/.env' });

function calculateBotanicalMetrics(data) {
  const { airTempC, humidity, rootTempC } = data;
  const metrics = { vpd: null, tempDifferential: null };

  if (airTempC != null && humidity != null) {
    const vpSat = 0.61078 * Math.exp((17.27 * airTempC) / (airTempC + 237.3));
    const vpAir = vpSat * (humidity / 100);
    metrics.vpd = Number(Math.max(0, vpSat - vpAir).toFixed(4));
  }

  if (airTempC != null && rootTempC != null) {
    metrics.tempDifferential = Number((airTempC - rootTempC).toFixed(2));
  }

  return metrics;
}

async function migrate() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGODB_URI missing');
    
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // 1. Migrate Reading (Batches)
    const readings = await Reading.find();
    console.log(`Processing ${readings.length} Reading records...`);
    
    for (const doc of readings) {
      const batchMetrics = calculateBotanicalMetrics(doc);
      doc.vpd = batchMetrics.vpd;
      doc.tempDifferential = batchMetrics.tempDifferential;

      if (doc.rounds && doc.rounds.length > 0) {
        doc.rounds = doc.rounds.map(r => {
          const roundMetrics = calculateBotanicalMetrics(r);
          return {
            ...r.toObject(),
            vpd: roundMetrics.vpd,
            tempDifferential: roundMetrics.tempDifferential
          };
        });
      }
      await doc.save();
    }
    console.log('Reading migration complete.');

    // 2. Migrate RoundReading
    const roundReadings = await RoundReading.find();
    console.log(`Processing ${roundReadings.length} RoundReading records...`);
    
    for (const doc of roundReadings) {
      const metrics = calculateBotanicalMetrics(doc);
      doc.vpd = metrics.vpd;
      doc.tempDifferential = metrics.tempDifferential;
      await doc.save();
    }
    console.log('RoundReading migration complete.');

    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
