const AutomationRule = require('../models/AutomationRule');
const RuleState = require('../models/RuleState');
const ActuatorLog = require('../models/ActuatorLog');
const { requestDeviceCommand } = require('./deviceService');

// Maps actuator + command state to the actual ESP32 command string
const COMMAND_MAPPING = {
  water: { on: 'waterOn', off: 'waterOff' },
  fan: { on: 'fanOn', off: 'fanOff' },
  light: { on: 'lightOn', off: 'lightOff' },
  pest: { on: 'pestOn', off: 'pestOff' },
  nutri: { on: 'nutriOn', off: 'nutriOff' }
};

const OPERATORS = {
  '>': (a, b) => a > b,
  '<': (a, b) => a < b,
  '==': (a, b) => a == b,
  '!=': (a, b) => a != b,
  '>=': (a, b) => a >= b,
  '<=': (a, b) => a <= b
};

/**
 * Loads or creates the persistent state for an automation rule.
 */
async function loadOrCreateRuleState(ruleId) {
  let state = await RuleState.findOne({ ruleId });
  if (!state) {
    state = await RuleState.create({ ruleId });
  }
  return state;
}

/**
 * Checks if a rule is currently in its cooldown period.
 */
function isInCooldown(state) {
  if (!state || !state.cooldownUntil) return false;
  return Date.now() < state.cooldownUntil.getTime();
}

/**
 * Dispatches the command to the physical actuator.
 */
async function dispatchCommand(rule, metrics, plantId) {
  const { actuator, command } = rule.action;
  const commandName = COMMAND_MAPPING[actuator][command];
  
  let espResponse = null;
  let success = true;
  let errorMessage = null;

  try {
    espResponse = await requestDeviceCommand(commandName);
  } catch (err) {
    success = false;
    errorMessage = err.message;
    console.warn(`[RuleEngine] Rule "${rule.name}" dispatch failed: ${err.message}`);
  }

  // Record action in history
  await ActuatorLog.create({
    actuatorName: actuator,
    state: command,
    trigger: 'auto',
    ruleId: rule._id,
    inputMetrics: metrics,
    espResponse,
    success,
    errorMessage,
    plantId
  }).catch(e => console.error('[RuleEngine] Log failed:', e.message));

  return success;
}

/**
 * Updates the rule's anti-flapping state (cooldowns, firing time).
 */
async function updateRuleState(ruleId, rule) {
  const now = new Date();
  const cooldownMs = (rule.cooldownMinutes || 30) * 60 * 1000;
  
  await RuleState.updateOne(
    { ruleId },
    {
      $set: {
        lastFiredAt: now,
        cooldownUntil: new Date(Date.now() + cooldownMs),
        currentState: rule.action.command,
        dailyCommandCount: 1 // Simple daily tracking could be added here
      }
    }
  );
}

/**
 * Main evaluation function for a single rule against a set of metrics.
 */
async function evaluateRule(rule, metrics, plantId) {
  const state = await loadOrCreateRuleState(rule._id);
  
  // Skip if paused or in cooldown
  if (rule.status !== 'active' || isInCooldown(state)) return;

  // Evaluate conditions
  const results = rule.conditions.map(c => {
    const sensorValue = metrics[c.sensor];
    if (sensorValue === undefined || sensorValue === null) return false;
    return OPERATORS[c.operator](sensorValue, c.value);
  });

  const shouldFire = rule.conditionLogic === 'OR' 
    ? results.some(r => r === true)
    : results.every(r => r === true);

  if (shouldFire) {
    // Check if we are already in the desired state (redundant but safe)
    if (state.currentState === rule.action.command) return;

    const result = await dispatchCommand(rule, metrics, plantId);
    if (result) {
      await updateRuleState(rule._id, rule);
    }
  }
}

/**
 * Entry point for rule engine processing.
 */
async function evaluateRules(reading, opts = {}) {
  const { plantId = null } = opts;

  // Gather available active rules from DB
  const activeRules = await AutomationRule.find({ status: 'active' });
  if (activeRules.length === 0) return;

  // Pre-process metrics
  const metrics = {
    soilPercent: reading.soilPercent,
    airTempC: reading.airTempC,
    rootTempC: reading.rootTempC,
    humidity: reading.humidity,
    lux: reading.lux,
    mqPPM: reading.mqPPM,
    weightG: reading.weightG,
    vpd: reading.vpd,
    time: new Date().getUTCHours() // UTC hour for time-based rules
  };

  // Evaluate all rules in parallel
  await Promise.allSettled(
    activeRules.map(rule => evaluateRule(rule, metrics, plantId))
  );
}

module.exports = { evaluateRules };
