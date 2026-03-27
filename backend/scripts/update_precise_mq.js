require('dotenv').config();
const mongoose = require('mongoose');
const Reading = require('../src/models/Reading');

const MONGODB_URI = process.env.MONGODB_URI;

// Characteristic curve: Ratio = (PPM / 100) ^ -0.3611
// Where -0.3611 = -1 / 2.769
function calculateRatio(ppm) {
    if (!ppm || ppm <= 0) return 1.0;
    return Math.pow(ppm / 100.0, -0.3611);
}

async function updatePreciseRatios() {
    try {
        console.log('Connecting to Database for Precise MQ Calibration...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected.');

        const cursor = Reading.find({}).cursor();
        let count = 0;

        for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
            // 1. Update batch-level average ratio
            doc.mqRatio = parseFloat(calculateRatio(doc.mqPPM || 150).toFixed(4));

            // 2. Update per-round individual ratios
            if (doc.rounds && doc.rounds.length > 0) {
                doc.rounds = doc.rounds.map(round => {
                    return {
                        ...round.toObject(),
                        mqRatio: parseFloat(calculateRatio(round.mqPPM).toFixed(4))
                    };
                });
            }

            await doc.save();
            count++;
            if (count % 100 === 0) console.log(`Processed ${count} records...`);
        }

        console.log(`✅ Finished high-precision calibration for ${count} monitoring sessions.`);

        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Update Error:', err);
        process.exit(1);
    }
}

updatePreciseRatios();
