require('dotenv').config();
const mongoose = require('mongoose');
const Reading = require('../src/models/Reading');

const MONGODB_URI = process.env.MONGODB_URI;

const ROOMS = ["Living room", "Bed room", "Library"];
const BEACONS = ["50:65:83:92:e9:c4", "04:a3:16:8d:b2:2c", "98:7b:f3:74:d3:db"];

function getRandom(min, max) {
  return Math.random() * (max - min) + min;
}

async function seed() {
  try {
    console.log('Connecting to Colombo Database...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected.');

    // 1. CLEAR EXISTING DATA
    console.log('Clearing existing readings...');
    await Reading.deleteMany({});

    const deviceId = "ESP32-846BA2A7DBCC";
    const readings = [];

    // Total: 1 week = 7 days * 288 records/day = 2,016 records
    const TOTAL_RECORDS = 2016; 
    const NOW = new Date();

    console.log(`Generating ${TOTAL_RECORDS} high-fidelity records for a full week...`);

    for (let i = 0; i < TOTAL_RECORDS; i++) {
        // Step back by 5 minutes per record
        const timestamp = new Date(NOW.getTime() - (i * 5 * 60 * 1000));
        const hour = timestamp.getHours();
        
        // --- 1. TEMPERATURE (Diurnal: Peak at 2pm, Low at 4am) ---
        // Range: 26 (night) to 33 (day)
        const tempBase = 29.5 + 3.5 * Math.sin((hour - 8) * Math.PI / 12); 
        const airTempC = getRandom(tempBase - 0.5, tempBase + 0.5);
        const rootTempC = airTempC - 1.5;

        // --- 2. HUMIDITY (Inverse of Temp) ---
        // Range: 65% (day) to 85% (night)
        const humBase = 75 - 10 * Math.sin((hour - 8) * Math.PI / 12);
        const humidity = getRandom(humBase - 2, humBase + 2);

        // --- 3. LUX (Daylight Cycle) ---
        let lux = 0;
        if (hour >= 6 && hour <= 18) {
           // Bell curve for sun intensity
           lux = 45000 * Math.sin((hour - 6) * Math.PI / 12) + getRandom(-1000, 1000);
        } else {
           lux = getRandom(2, 15); // moonlight/ambient indoor
        }

        // --- 4. SOIL MOISTURE (Drying cycle over 3 days) ---
        const dayOfSeeding = Math.floor(i / 288);
        const cycleDay = dayOfSeeding % 3; // watered every 3 days
        const dryRate = (i % 864) * 0.05; // ~15% drop over 3 days
        let soilPercent = Math.max(45, 80 - dryRate + getRandom(-1, 1));

        // --- 5. LOCATION (Shifts every 2 days) ---
        const locationIdx = Math.floor(dayOfSeeding / 2) % ROOMS.length;
        const nearestRoom = ROOMS[locationIdx];
        const nearestBeacon = BEACONS[locationIdx];

        // --- 6. WEIGHT (Baseline with evaporation loss) ---
        const weightG = 5200.5 - (cycleDay * 5) + getRandom(-0.5, 0.5);

        const rounds = [];
        for (let r = 1; r <= 10; r++) {
            rounds.push({
                roundNumber: r,
                rootTempC: rootTempC + getRandom(-0.2, 0.2),
                airTempC: airTempC + getRandom(-0.2, 0.2),
                humidity: humidity + getRandom(-1, 1),
                soilPercent: Math.round(soilPercent),
                mqRatio: 0.82,
                mqPPM: 420 + getRandom(-5, 5),
                weightG: weightG + getRandom(-0.2, 0.2),
                weightError: 0.015,
                lux: Math.max(0, lux + getRandom(-200, 200)),
                nearestBeacon,
                nearestRoom
            });
        }

        readings.push({
            deviceId,
            esp32Ip: "10.223.26.223",
            monitoringSessionId: `sim-week-record-${i}`,
            batchType: 'full',
            roundsUsed: 10,
            rootTempC,
            airTempC,
            humidity,
            lux,
            soilPercent: Math.round(soilPercent),
            mqRatio: 0.82,
            mqPPM: 420,
            weightG,
            weightError: 0.015,
            nearestBeacon,
            nearestRoom,
            rounds,
            createdAt: timestamp
        });

        // Insert in chunks of 500 to prevent memory pressure
        if (readings.length >= 500) {
           await Reading.insertMany(readings);
           readings.length = 0;
           console.log(`Inserted ${i + 1} / ${TOTAL_RECORDS} records...`);
        }
    }

    if (readings.length > 0) {
        await Reading.insertMany(readings);
    }

    console.log('✅ Fresh Colombo week simulation (2,016 records) complete.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error seeding:', err);
    process.exit(1);
  }
}

seed();
