const Reading = require('../models/Reading');
const { generateRecommendationsFromReading } = require('./recommendationService');

let simulationInterval = null;
let currentTrueWeight = 235.0; // Initial simulated plant weight
let sessionStartTime = null;
let recordCounter = 0;

const ROOMS = ["Living room", "Bed room", "Library"];
const BEACONS = ["50:65:83:92:e9:c4", "04:a3:16:8d:b2:2c", "98:7b:f3:74:d3:db"];

function getRandom(min, max) {
  return Math.random() * (max - min) + min;
}

/**
 * Calculates a simulated reading based on the Colombo high-fidelity logic.
 * Every 30 seconds = 1 virtual 'Round'.
 */
async function generateNextSimulatedReading() {
  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const timeDecimal = hour + minute / 60.0;

  // 1. LIGHT (Diurnal 1.83 - 15/20 lx)
  const isHotDay = now.getDay() % 5 === 0; // Simulate hot day every few days
  const peakLux = isHotDay ? 20.0 : 15.0;
  let lux = 1.83;
  if (hour >= 6 && hour < 18) {
    const fraction = (timeDecimal - 6) / 12;
    lux = 1.83 + (peakLux - 1.83) * (1.0 - Math.pow(2.0 * fraction - 1.0, 2));
  }
  lux = Math.max(1.83, lux + getRandom(-0.5, 0.5));

  // 2. WEIGHT & GROWTH
  // Evaporation (-5g/day total)
  const stepLoss = (hour >= 6 && hour < 18 ? 0.4 : 0.1) / (24 * 2); // 30s steps
  currentTrueWeight -= stepLoss;

  // Growth (+5g/day realized at 8am)
  if (hour === 8 && minute === 0) {
    currentTrueWeight += 5.0;
  }
  
  // Periodic Watering simulation if weight drops too low
  if (currentTrueWeight < 220) {
      currentTrueWeight += 25; // Significant watering
  }

  const weightG = currentTrueWeight + getRandom(-2, 2);

  // 3. MQ135 (150 baseline, 100=Ratio 1.0)
  let mqBase = 150 + (hour >= 6 && hour < 18 ? -20 : 10);
  const mqPPM = mqBase + getRandom(-5, 5);
  const mqRatio = Math.pow(mqPPM / 100.0, -0.3611);

  // 4. COLOMBO TEMP/HUMIDITY
  const tempBase = 29.5 + 3.5 * Math.sin((timeDecimal - 8) * Math.PI / 12);
  const airTempC = tempBase + getRandom(-0.5, 0.5);
  const humidity = 75 - 10 * Math.sin((timeDecimal - 8) * Math.PI / 12) + getRandom(-2, 2);

  // 5. LOCATION
  const roomIdx = Math.floor(now.getDay() / 2) % ROOMS.length;

  const reading = {
    deviceId: "SIMULATED-SHOWCASE-NODE",
    esp32Ip: "127.0.0.1",
    monitoringSessionId: `sim-showcase-${sessionStartTime.getTime()}`,
    batchType: 'full',
    roundsUsed: 1,
    rootTempC: airTempC - 1.5,
    airTempC,
    humidity,
    lux,
    soilPercent: Math.round(75 + getRandom(-5, 5)),
    mqRatio,
    mqPPM,
    weightG,
    weightError: 0.15,
    nearestBeacon: BEACONS[roomIdx],
    nearestRoom: ROOMS[roomIdx],
    rounds: [] // simplified for live showcase
  };

  try {
    const saved = await Reading.create(reading);
    await generateRecommendationsFromReading(saved, saved._id);
    return saved;
  } catch (err) {
    console.error('[SimulationService] Fault:', err.message);
    return null;
  }
}

function startSimulation() {
  if (simulationInterval) return { status: 'already_running' };
  
  sessionStartTime = new Date();
  recordCounter = 0;
  // Initialize with current baseline
  currentTrueWeight = 235.0;

  simulationInterval = setInterval(async () => {
    recordCounter++;
    await generateNextSimulatedReading();
    console.log(`[SIM] Generated record #${recordCounter}`);
  }, 30000); // 30 seconds

  return { status: 'started', startTime: sessionStartTime };
}

function stopSimulation() {
  if (!simulationInterval) return { status: 'not_running' };
  
  clearInterval(simulationInterval);
  simulationInterval = null;
  
  return { status: 'stopped', durationMins: (new Date() - sessionStartTime) / 60000 };
}

function getSimulationStatus() {
  return {
    isRunning: !!simulationInterval,
    startTime: sessionStartTime,
    recordCount: recordCounter
  };
}

module.exports = {
  startSimulation,
  stopSimulation,
  getSimulationStatus
};
