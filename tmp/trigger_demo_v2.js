const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: 'c:/Users/Dilukshan/Desktop/Smart Plant Monitoring System_1/backend/.env' });

const Alert = mongoose.model('Alert', new mongoose.Schema({
    severity: String,
    sourceType: String,
    title: String,
    description: String,
    status: { type: String, default: 'active' }
}, { timestamps: true }));

async function run() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        
        // Clear recent demo alerts to trigger a 'NEW' notification
        await Alert.deleteMany({ title: /Demo Alert/ });

        const now = new Date();
        await Alert.create([
            {
                severity: 'critical',
                sourceType: 'threshold',
                title: 'Demo Alert: Low Soil Moisture',
                description: 'Soil moisture critical. Activating smart irrigation.',
                status: 'active',
                createdAt: now
            },
            {
                severity: 'critical',
                sourceType: 'rule_engine',
                title: 'Demo Alert: Fungus Pathogen Risk',
                description: 'High humidity detected. Fan activated to prevent fungal colonization.',
                status: 'active',
                createdAt: now
            }
        ]);

        console.log('Demo alerts injected');
        
        // Trigger Fan
        await fetch('http://localhost:5001/api/device/fan/on').catch(e => console.log('Fan trigger failed', e.message));

        mongoose.disconnect();
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
