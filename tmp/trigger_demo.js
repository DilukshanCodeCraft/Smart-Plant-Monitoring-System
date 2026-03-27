const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load env
dotenv.config({ path: 'c:/Users/Dilukshan/Desktop/Smart Plant Monitoring System_1/backend/.env' });

const MONGODB_URI = process.env.MONGODB_URI;

// Define Models
const Alert = mongoose.model('Alert', new mongoose.Schema({
    severity: String,
    sourceType: String,
    title: String,
    description: String,
    status: { type: String, default: 'active' }
}, { timestamps: true }));

async function run() {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to DB');

    // 1. Trigger Fan
    try {
        const response = await fetch('http://localhost:5001/api/device/fan/on');
        const data = await response.json();
        console.log('Fan Response:', data);
    } catch (e) {
        console.warn('Failed to trigger fan (maybe server is down)', e.message);
    }

    // 2. Add Critical Alerts
    await Alert.create([
        {
            severity: 'critical',
            sourceType: 'threshold',
            title: 'Low Soil Moisture (CRITICAL)',
            description: 'Soil moisture has dropped below 15%. Automated pump activation pending. Immediate watering required to prevent wilt.',
            status: 'active'
        },
        {
            severity: 'critical',
            sourceType: 'rule_engine',
            title: 'Fungus Pathogen Risk',
            description: 'Extreme humidity (85%+) detected. Wind Fan activated to increase circulation and prevent fungal spore colonization.',
            status: 'active'
        }
    ]);

    console.log('Demo alerts injected successfully');
    process.exit(0);
}

run();
