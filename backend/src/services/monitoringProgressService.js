const { syncBoard2RoundIndex } = require('./usbLuxBoardService');

const ROUND_MS = 30000;
const TOTAL_ROUNDS = 10;
const BATCH_MS = ROUND_MS * TOTAL_ROUNDS;

const state = {
  monitoringActive: false,
  sessionId: null,
  startedAt: null,
  source: 'unknown',
  lastValidRoundReading: null
};

function toIso(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

function startTracking({ sessionId = null, observedAt = new Date(), source = 'command' } = {}) {
  state.monitoringActive = true;
  state.sessionId = sessionId ?? null;
  state.startedAt = toIso(observedAt);
  state.source = source;
}

function stopTracking({ sessionId = null, source = 'command' } = {}) {
  state.monitoringActive = false;
  state.sessionId = sessionId ?? null;
  state.startedAt = null;
  state.source = source;
  state.lastValidRoundReading = null;
}

function syncWithDeviceStatus(deviceStatus, observedAt = new Date()) {
  if (!deviceStatus) {
    return;
  }

  const monitoring = typeof deviceStatus.monitoring === 'boolean'
    ? deviceStatus.monitoring
    : typeof deviceStatus.monitoringEnabled === 'boolean'
      ? deviceStatus.monitoringEnabled
      : null;

  if (typeof monitoring !== 'boolean') {
    return;
  }

  const nextSessionId = deviceStatus.monitoringSessionId ?? null;
  const board1CurrentRound = deviceStatus.currentRound || 0;

  if (!monitoring) {
    stopTracking({ sessionId: nextSessionId, source: 'device-status' });
    return;
  }

  // Handle Board 2 round sync to match Board 1's clock
  if (board1CurrentRound > 0) {
    syncBoard2RoundIndex(board1CurrentRound);
  }

  if (!state.monitoringActive) {
    startTracking({ sessionId: nextSessionId, observedAt, source: 'device-status' });
    return;
  }

  if (nextSessionId && state.sessionId && nextSessionId !== state.sessionId) {
    startTracking({ sessionId: nextSessionId, observedAt, source: 'device-status' });
    return;
  }

  state.sessionId = nextSessionId;

  // Persist the latest round data so Dashboard doesn't "flicker" if Board 1 is temporarily slow
  if (deviceStatus.latestRound && Object.keys(deviceStatus.latestRound).length > 0) {
    if (deviceStatus.latestRound.round > 0) {
      state.lastValidRoundReading = { ...deviceStatus.latestRound };
    }
  }
}

function markMonitoringOn(sessionId = null) {
  console.log(`[Progress-Service] Resetting monitoring timeline for new session: ${sessionId}`);
  stopTracking({ sessionId, source: 'monitor-command' });
  startTracking({ sessionId, observedAt: new Date(), source: 'monitor-command' });
}

function markMonitoringOff(sessionId = null) {
  stopTracking({ sessionId, source: 'monitor-command' });
}

function getRoundProgressSnapshot(now = new Date()) {
  if (!state.monitoringActive || !state.startedAt) {
    return {
      available: false,
      monitoringActive: false,
      sessionId: state.sessionId,
      source: state.source,
      roundDurationMs: ROUND_MS,
      totalRounds: TOTAL_ROUNDS,
      batchDurationMs: BATCH_MS
    };
  }

  const startedAtMs = new Date(state.startedAt).getTime();
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const elapsedMs = Math.max(0, nowMs - startedAtMs);
  const cycleElapsedMs = elapsedMs % BATCH_MS;
  const completedRounds = Math.min(Math.floor(cycleElapsedMs / ROUND_MS), TOTAL_ROUNDS);
  const currentRound = completedRounds < TOTAL_ROUNDS ? completedRounds + 1 : TOTAL_ROUNDS;
  const roundElapsedMs = cycleElapsedMs % ROUND_MS;

  return {
    available: true,
    monitoringActive: true,
    sessionId: state.sessionId,
    source: state.source,
    startedAt: state.startedAt,
    roundDurationMs: ROUND_MS,
    totalRounds: TOTAL_ROUNDS,
    batchDurationMs: BATCH_MS,
    elapsedMs,
    cycleElapsedMs,
    completedRounds,
    currentRound,
    roundElapsedMs,
    currentRoundProgressPercent: Math.min(100, Math.round((roundElapsedMs / ROUND_MS) * 100)),
    waitingForFirstRound: completedRounds === 0
  };
}

// ── Background Sync Task ──
// We must poll Board 1 even if no user is watching to keep Board 2 in sync
async function startBackgroundSync(getBoard1StatusSnapshot) {
  const poll = async () => {
    try {
      const status = await getBoard1StatusSnapshot();
      syncWithDeviceStatus(status);
    } catch (err) {
      // Background sync failed silently
    }
  };
  setInterval(poll, 5000);
}

function getMasterCurrentReading() {
  return state.lastValidRoundReading;
}

module.exports = {
  markMonitoringOn,
  markMonitoringOff,
  syncWithDeviceStatus,
  getRoundProgressSnapshot,
  startBackgroundSync,
  getMasterCurrentReading
};