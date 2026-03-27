require('dotenv').config();
const mongoose = require('mongoose');
const Reading = require('../src/models/Reading');

const MONGODB_URI = process.env.MONGODB_URI;

// Room names from Board 2 mapping
const ROOMS = ["Living room", "Bed room", "Library"];
const BEACONS = ["50:65:83:92:e9:c4", "04:a3:16:8d:b2:2c", "98:7b:f3:74:d3:db"];

// Constants from User Specification
const TOTAL_DAYS = 7;
const RECORDS_PER_DAY = 288;
const TOTAL_RECORDS = TOTAL_DAYS * RECORDS_PER_DAY;
const TIME_STEP_MINS = 5;

const LUX_BASELINE = 1.83;
const NIGHT_START = 18; // 6 PM
const DAY_START = 6;    // 6 AM
const WATERING_HOUR = 8; // 8 AM

function getRandom(min, max) {
    return Math.random() * (max - min) + min;
}

function getGaussian(mean, sigma) {
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    return mean + sigma * Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

async function seed() {
    try {
        console.log('--- HIGH-FIDELITY GROW STIMULATION SEEDER ---');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to Database.');

        // 1. CLEANUP
        console.log('Deleting existing monitoring records (readings & roundreadings)...');
        await Reading.deleteMany({});
        try {
            await mongoose.connection.db.collection('roundreadings').deleteMany({});
        } catch(e) {}

        const deviceId = "ESP32-846BA2A7DBCC";
        
        // Pick 2 random days (out of 7) for location changes
        const movedDays = [];
        while(movedDays.length < 2) {
            let d = Math.floor(Math.random() * 7);
            if(!movedDays.includes(d)) movedDays.push(d);
        }

        const NOW = new Date();
        const START_TIME = new Date(NOW.getTime() - (TOTAL_DAYS * 24 * 60 * 60 * 1000));
        
        let trueWeight = 235.0;
        let cumulativeGrowth = 0.0;
        const dailyPeakLux = Array(7).fill(15).map(() => Math.random() < 0.1 ? 20 : 15);

        const dataToInsert = [];

        console.log(`Generating ${TOTAL_RECORDS} records...`);

        for (let i = 0; i < TOTAL_RECORDS; i++) {
            const timestamp = new Date(START_TIME.getTime() + (i * TIME_STEP_MINS * 60 * 1000));
            const dayIndex = Math.floor(i / RECORDS_PER_DAY);
            const hour = timestamp.getHours();
            const minute = timestamp.getMinutes();
            const timeDecimal = hour + (minute / 60.0);
            
            const isMovedDay = movedDays.includes(dayIndex);
            const roomIdx = isMovedDay ? (1 + (dayIndex % 2)) : 0; // Move to Bed room or Library
            const nearestRoom = ROOMS[roomIdx];
            const nearestBeacon = BEACONS[roomIdx];

            // --- LUX CALCULATION ---
            let lux = LUX_BASELINE;
            if (hour >= DAY_START && hour < NIGHT_START) {
                const fraction = (timeDecimal - DAY_START) / (NIGHT_START - DAY_START);
                const amplitude = dailyPeakLux[dayIndex] - LUX_BASELINE;
                // Parabola: baseline + amplitude * (1 - (2*f - 1)^2)
                lux = LUX_BASELINE + amplitude * (1.0 - Math.pow(2.0 * fraction - 1.0, 2));
            }
            // Add Room Effect (0.7 to 1.3)
            if (isMovedDay) {
                const factor = 1.0 + (Math.sin(dayIndex) * 0.3); // deterministic room factor for the day
                lux *= factor;
            }
            // Add Gaussian Noise
            lux = Math.max(LUX_BASELINE, lux + getGaussian(0, 0.2));

            // --- WEIGHT CALCULATION ---
            // Evapotranspiration: ~0.5g/hr during day, ~0.1g/hr at night
            const lossPerStep = (hour >= DAY_START && hour < NIGHT_START) ? (0.5 / 12) : (0.1 / 12);
            trueWeight -= lossPerStep;

            // Watering & Growth (at 08:00 sharp)
            if (hour === WATERING_HOUR && minute === 0) {
                trueWeight += 5.0; // Daily growth boost
                // Ensure it stays in a realistic healthy range upward trend
            }

            const weightMeasured = trueWeight + getRandom(-2, 2);

            // --- MQ135 CALCULATION ---
            let mqBase = 150;
            // Diurnal: -20 day, +10 night
            mqBase += (hour >= DAY_START && hour < NIGHT_START) ? -20 : 10;
            if (isMovedDay) mqBase += (Math.cos(dayIndex) * 30); // Room ventilation offset
            
            const mq135ppm = Math.max(50, mqBase + getGaussian(0, 5));

            // --- COLOMBO TEMP/HUMIDITY (Baseline) ---
            const tempBase = 29.5 + 3.5 * Math.sin((timeDecimal - 8) * Math.PI / 12); 
            const airTempC = tempBase + getRandom(-0.5, 0.5);
            const humidity = (75 - 10 * Math.sin((timeDecimal - 8) * Math.PI / 12)) + getRandom(-2, 2);

            // --- BATCHING INTO SCHEMA ---
            const rounds = [];
            for (let r = 1; r <= 10; r++) {
               rounds.push({
                   roundNumber: r,
                   rootTempC: airTempC - 1.5,
                   airTempC,
                   humidity,
                   soilPercent: 75,
                   mqPPM: mq135ppm,
                   weightG: weightMeasured,
                   weightError: 0.1,
                   lux,
                   nearestBeacon,
                   nearestRoom
               });
            }

            dataToInsert.push({
                deviceId,
                esp32Ip: "10.223.26.223",
                monitoringSessionId: `final-seed-${i}`,
                batchType: 'full',
                roundsUsed: 10,
                rootTempC: airTempC - 1.5,
                airTempC,
                humidity,
                lux,
                soilPercent: 75,
                mqPPM: mq135ppm,
                weightG: weightMeasured,
                weightError: 0.1,
                nearestBeacon,
                nearestRoom,
                rounds,
                createdAt: timestamp
            });

            if (dataToInsert.length >= 500) {
                await Reading.insertMany(dataToInsert);
                dataToInsert.length = 0;
                console.log(`Uploaded ${i + 1} / ${TOTAL_RECORDS} records...`);
            }
        }

        if (dataToInsert.length > 0) {
            await Reading.insertMany(dataToInsert);
        }

        console.log('✅ SEEDING COMPLETE: 7 Days of High-Fidelity Stimulation.');
        await mongoose.disconnect();
        process.exit(0);
    } catch (err) {
        console.error('Seeding Error:', err);
        process.exit(1);
    }
}

seed();
