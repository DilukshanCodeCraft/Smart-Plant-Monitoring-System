const mongoose = require('mongoose');
const AutomationRule = require('../src/models/AutomationRule');
require('dotenv').config({ path: './backend/.env' });

const rules = [
  {
    name: 'Critical Drought Recovery',
    description: 'Emergency watering when soil is dangerously dry (< 20%).',
    conditions: [{ sensor: 'soilPercent', operator: '<', value: 20 }],
    action: { actuator: 'water', command: 'on' },
    durationMinutes: 2,
    cooldownMinutes: 60,
    isDefault: true
  },
  {
    name: 'High-Temp Cooling',
    description: 'Activate fan if air temperature exceeds 35°C to prevent wilting.',
    conditions: [{ sensor: 'airTempC', operator: '>', value: 35 }],
    action: { actuator: 'fan', command: 'on' },
    durationMinutes: 15,
    cooldownMinutes: 30,
    isDefault: true
  },
  {
    name: 'Fungal Risk Mitigation',
    description: 'Ventilate if high humidity (> 85%) coincides with warmth (> 25°C).',
    conditions: [
      { sensor: 'humidity', operator: '>', value: 85 },
      { sensor: 'airTempC', operator: '>', value: 25 }
    ],
    conditionLogic: 'AND',
    action: { actuator: 'fan', command: 'on' },
    durationMinutes: 10,
    cooldownMinutes: 20,
    isDefault: true
  },
  {
    name: 'Morning Photosynthesis Boost',
    description: 'Turn on grow light if morning lux is too low for active growth.',
    conditions: [{ sensor: 'lux', operator: '<', value: 300 }],
    action: { actuator: 'light', command: 'on' },
    durationMinutes: 120,
    cooldownMinutes: 60,
    isDefault: true
  },
  {
    name: 'Nighttime Respiration Flush',
    description: 'Ventilate if CO2 equivalents (MQ135) build up during the night.',
    conditions: [{ sensor: 'mqPPM', operator: '>', value: 600 }],
    action: { actuator: 'fan', command: 'on' },
    durationMinutes: 15,
    cooldownMinutes: 45,
    isDefault: true
  },
  {
    name: 'Low-Light Maintenance',
    description: 'Supplemental lighting for cloudy days when lux is below 200.',
    conditions: [{ sensor: 'lux', operator: '<', value: 200 }],
    action: { actuator: 'light', command: 'on' },
    durationMinutes: 60,
    cooldownMinutes: 120,
    isDefault: true
  },
  {
    name: 'High VPD Stress Relief',
    description: 'Shut off fans and pulse water if air is excessively dry (VPD > 1.8 kPa).',
    conditions: [{ sensor: 'airTempC', operator: '>', value: 38 }], // Simplified VPD analog for demo
    action: { actuator: 'water', command: 'on' },
    durationMinutes: 1,
    cooldownMinutes: 10,
    isDefault: true
  },
  {
    name: 'Biomass Loss Compensation',
    description: 'Increase watering if sudden daily weight loss is detected.',
    conditions: [{ sensor: 'weightG', operator: '<', value: 200 }],
    action: { actuator: 'water', command: 'on' },
    durationMinutes: 2,
    cooldownMinutes: 240,
    isDefault: true
  },
  {
    name: 'Air Quality Safety Flush',
    description: 'Forced ventilation if VOC/Gas levels (MQ135) exceed 800 PPM.',
    conditions: [{ sensor: 'mqPPM', operator: '>', value: 800 }],
    action: { actuator: 'fan', command: 'on' },
    durationMinutes: 30,
    cooldownMinutes: 15,
    isDefault: true
  },
  {
    name: 'Root Zone Warmth Protection',
    description: 'Supplemental light/heat if roots drop below 12°C.',
    conditions: [{ sensor: 'rootTempC', operator: '<', value: 12 }],
    action: { actuator: 'light', command: 'on' },
    durationMinutes: 30,
    cooldownMinutes: 60,
    isDefault: true
  }
];

async function seed() {
  try {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGODB_URI missing in ENV');
    
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    
    await AutomationRule.deleteMany({ isDefault: true });
    await AutomationRule.insertMany(rules);
    
    console.log('Rules seeded successfully');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
}

seed();
