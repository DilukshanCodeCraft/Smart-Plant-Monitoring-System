const { usbLuxSerialPort, usbLuxSerialBaudRate } = require('../config/env');

// ── Room / beacon label mappings ──────────────────────────────────────────────
const ROOM_BY_CORNER = {
  'corner a': 'Living room',
  'corner b': 'Bed room',
  'corner c': 'Library'
};

const BEACON_BY_CORNER = {
  'corner a': 'beaconA',
  'corner b': 'beaconB',
  'corner c': 'beaconC'
};

const BEACON_BY_ROOM = {
  'Living room': 'beaconA',
  'Bed room': 'beaconB',
  'Library': 'beaconC'
};

// ── Core live-data state ──────────────────────────────────────────────────────
const state = {
  configured: Boolean(usbLuxSerialPort),
  connected: false,
  monitoringEnabled: false,
  portPath: usbLuxSerialPort || null,
  baudRate: usbLuxSerialBaudRate,
  lastSeenAt: null,
  lastLine: null,
  lastError: null,
  lux: null,
  nearestBeacon: null,
  nearestRoom: null,
  manualRoomOverride: null, // User-defined test override
  rssiA: null,
  rssiB: null,
  rssiC: null,
  // Sample buffers for spike filtering (Median-of-3)
  luxSamples: [],
  rssiASamples: [],
  rssiBSamples: [],
  rssiCSamples: []
};

let serialPort = null;
let parser = null;
let reconnectTimer = null;
let lastResetPulseMs = 0;

const RECONNECT_DELAY_MS = 1500;
const STALE_DATA_MS = 4000;
const RESET_PULSE_COOLDOWN_MS = 15000;
const MONITOR_WRITE_ATTEMPTS = 3;
const MONITOR_WRITE_RETRY_MS = 300;

function setManualRoomOverride(roomName) {
  if (typeof roomName === 'string' && roomName.trim()) {
    const r = roomName.trim();
    state.manualRoomOverride = r;
    state.nearestRoom = r;
    state.nearestBeacon = BEACON_BY_ROOM[r] || state.nearestBeacon;
  } else {
    state.manualRoomOverride = null;
  }
}

// ── Board 2 round buffering & averaging ──────────────────────────────────────
const ROUND_MS = 30000;
const TOTAL_ROUNDS = 10;

let roundBuffer = [];
let roundStartMs = null;
let currentRoundIndex = -1;
let averagedRounds = Array(TOTAL_ROUNDS).fill(null);

function resetBoard2Rounds() {
  roundBuffer = [];
  roundStartMs = Date.now();
  currentRoundIndex = 0;
  averagedRounds = Array(TOTAL_ROUNDS).fill(null);
}

function normalizeFinite(value) {
  return Number.isFinite(value) ? value : null;
}

function normalizeRssi(value) {
  return Number.isFinite(value) && value > -999 ? value : null;
}

function getMedian(samples) {
  if (!samples.length) return null;
  const filtered = samples.filter((v) => v !== null);
  if (!filtered.length) return null;

  // Instant responsiveness: if we only have 1 or 2 samples, return the average
  if (filtered.length < 3) {
    return filtered.reduce((a, b) => a + b, 0) / filtered.length;
  }

  const sorted = [...filtered].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function updateSampleBuffer(buffer, value, maxSize = 3) {
  if (value !== null && Number.isFinite(value)) {
    buffer.push(value);
    if (buffer.length > maxSize) buffer.shift();
  }
}

function averageBoard2Round(buffer, roundNum) {
  if (!buffer.length) return null;
  const avg = (arr, key) => {
    const vals = arr.map((x) => x[key]).filter((v) => {
      if (typeof v !== 'number' || Number.isNaN(v)) return false;
      if (key === 'lux' && v < 0) return false;     // filter out -1.00 fallback lux
      if (key.startsWith('rssi') && v <= -999) return false; // filter out -999 fallback RSSI
      return true;
    });
    if (!vals.length) return null;
    return vals.reduce((a, b) => a + b, 0) / vals.length;
  };
  return {
    round: roundNum,
    lux: avg(buffer, 'lux'),
    rssiA: avg(buffer, 'rssiA'),
    rssiB: avg(buffer, 'rssiB'),
    rssiC: avg(buffer, 'rssiC'),
    nearestBeacon: buffer[buffer.length - 1]?.nearestBeacon || null,
    nearestRoom: buffer[buffer.length - 1]?.nearestRoom || null,
    at: buffer[buffer.length - 1]?.at || null
  };
}

function finalizeBoard2Round(indexToFinalize) {
  if (indexToFinalize < 0 || indexToFinalize >= TOTAL_ROUNDS) return;
  if (roundBuffer.length > 0) {
    averagedRounds[indexToFinalize] = averageBoard2Round(roundBuffer, indexToFinalize + 1);
    console.log(`[Board 2] Finalized interval ${indexToFinalize + 1} with ${roundBuffer.length} samples.`);
  }
}

function syncBoard2RoundIndex(nextIndex) {
  const targetIndex = nextIndex - 1; // Board 1 uses 1-based usually? No, internal currentRound is 0-based in node service
  if (!state.monitoringEnabled || targetIndex < 0 || targetIndex >= TOTAL_ROUNDS) return;

  if (targetIndex > currentRoundIndex) {
    // Board 1 has moved to a new round. Finalize current one.
    finalizeBoard2Round(currentRoundIndex);
    currentRoundIndex = targetIndex;
    roundStartMs = Date.now();
    roundBuffer = [];
  }
}
function bufferBoard2Reading() {
  if (!state.monitoringEnabled) return;
  const now = Date.now();
  if (roundStartMs === null) {
    roundStartMs      = now;
    currentRoundIndex = 0;
    roundBuffer       = [];
  }
  
  // Internal fallback auto-advance (30s) for independent Board 2 operation
  if (now - roundStartMs >= ROUND_MS) {
    finalizeBoard2Round(currentRoundIndex);
    currentRoundIndex++;
    roundStartMs = now;
    roundBuffer  = [];
    if (currentRoundIndex >= TOTAL_ROUNDS) {
      currentRoundIndex = 0;
      averagedRounds    = Array(TOTAL_ROUNDS).fill(null);
    }
  }

  // SPIKE FILTERING: Update sample buffers and pull the median
  updateSampleBuffer(state.luxSamples, normalizeFinite(state.lux));
  updateSampleBuffer(state.rssiASamples, normalizeRssi(state.rssiA));
  updateSampleBuffer(state.rssiBSamples, normalizeRssi(state.rssiB));
  updateSampleBuffer(state.rssiCSamples, normalizeRssi(state.rssiC));

  const filteredLux   = getMedian(state.luxSamples);
  const filteredRssiA = getMedian(state.rssiASamples);
  const filteredRssiB = getMedian(state.rssiBSamples);
  const filteredRssiC = getMedian(state.rssiCSamples);

  roundBuffer.push({
    lux: filteredLux,
    rssiA: filteredRssiA,
    rssiB: filteredRssiB,
    rssiC: filteredRssiC,
    nearestBeacon: state.nearestBeacon,
    nearestRoom: state.manualRoomOverride || state.nearestRoom,
    at: new Date()
  });
}

function getBoard2AveragedRound() {
  const current = currentRoundIdx;
  const data = averagedRounds[current];
  if (data) return data;

  // If not finalized yet, show a preview of current buffer
  return avg(roundBuffer);
}

function finalizeCurrentRound() {
  const result = avg(roundBuffer);
  averagedRounds[currentRoundIdx] = result;
  roundBuffer = [];
}

function resetBoard2Rounds() {
  currentRoundIdx = 0;
  roundBuffer = [];
  averagedRounds = new Array(TOTAL_ROUNDS).fill(null);
  state.luxSamples = [];
  state.rssiSamples = [];
}

function syncBoard2RoundIndex(masterIdx) {
  // Master index from Board 1 is 1-based usually, or 0-based.
  // Board 1 reports currentRound (1-10).
  const targetIdx = Math.max(0, masterIdx - 1);

  if (targetIdx !== currentRoundIdx) {
    console.log(`[Board 2 Sync] Shifting round ${currentRoundIdx + 1} -> ${targetIdx + 1}`);
    finalizeCurrentRound();
    currentRoundIdx = targetIdx;
  }
}

function bufferBoard2Reading() {
  if (!state.monitoringEnabled) return;
  const now = Date.now();
  if (roundStartMs === null) {
    roundStartMs = now;
    currentRoundIndex = 0;
    roundBuffer = [];
  }

  // Internal fallback auto-advance (30s) for independent Board 2 operation
  if (now - roundStartMs >= ROUND_MS) {
    finalizeBoard2Round(currentRoundIndex);
    currentRoundIndex++;
    roundStartMs = now;
    roundBuffer = [];
    if (currentRoundIndex >= TOTAL_ROUNDS) {
      currentRoundIndex = 0;
      averagedRounds = Array(TOTAL_ROUNDS).fill(null);
    }
  }

  // SPIKE FILTERING: Update sample buffers and pull the median
  updateSampleBuffer(state.luxSamples, normalizeFinite(state.lux));
  updateSampleBuffer(state.rssiASamples, normalizeRssi(state.rssiA));
  updateSampleBuffer(state.rssiBSamples, normalizeRssi(state.rssiB));
  updateSampleBuffer(state.rssiCSamples, normalizeRssi(state.rssiC));

  const filteredLux = getMedian(state.luxSamples);
  const filteredRssiA = getMedian(state.rssiASamples);
  const filteredRssiB = getMedian(state.rssiBSamples);
  const filteredRssiC = getMedian(state.rssiCSamples);

  roundBuffer.push({
    lux: filteredLux,
    rssiA: filteredRssiA,
    rssiB: filteredRssiB,
    rssiC: filteredRssiC,
    nearestBeacon: state.nearestBeacon,
    nearestRoom: state.manualRoomOverride || state.nearestRoom,
    at: new Date()
  });
}

function getBoard2AveragedRound() {
  for (let i = TOTAL_ROUNDS - 1; i >= 0; i--) {
    if (averagedRounds[i]) return averagedRounds[i];
  }
  if (roundBuffer.length > 0) {
    return averageBoard2Round(roundBuffer, currentRoundIndex + 1);
  }
  return null;
}

/**
 * Returns an array of { roundNumber, lux, nearestBeacon, nearestRoom }
 * for all finalized Board 2 rounds in the current session.
 * Used by readingService to merge per-round lux into the batch reading.
 */
function getBoard2RoundData() {
  const result = [];
  for (let i = 0; i < TOTAL_ROUNDS; i++) {
    const r = averagedRounds[i];
    if (r && r.round != null) {
      result.push({
        roundNumber: r.round,
        lux: typeof r.lux === 'number' && Number.isFinite(r.lux) ? r.lux : null,
        nearestBeacon: r.nearestBeacon || null,
        nearestRoom: r.nearestRoom || null
      });
    }
  }
  // Also include the current in-progress round buffer if it has data
  if (roundBuffer.length > 0) {
    const partial = averageBoard2Round(roundBuffer, currentRoundIndex + 1);
    if (partial && partial.round != null) {
      const alreadyIncluded = result.some((r) => r.roundNumber === partial.round);
      if (!alreadyIncluded) {
        result.push({
          roundNumber: partial.round,
          lux: typeof partial.lux === 'number' && Number.isFinite(partial.lux) ? partial.lux : null,
          nearestBeacon: partial.nearestBeacon || null,
          nearestRoom: partial.nearestRoom || null
        });
      }
    }
  }
  return result;
}

/**
 * Returns the dominant (most frequent) nearest beacon & room
 * across all finalized Board 2 rounds in the current session.
 * Falls back to the live state if no rounds are finalized yet.
 */
function getBoard2DominantLocation() {
  const roundData = getBoard2RoundData();
  if (roundData.length === 0) {
    // Fall back to live state
    const snap = state.nearestBeacon ? { nearestBeacon: state.nearestBeacon, nearestRoom: state.nearestRoom } : null;
    return snap;
  }

  const counts = {};
  for (const r of roundData) {
    if (r.nearestBeacon) {
      const key = r.nearestBeacon;
      counts[key] = counts[key] || { beacon: r.nearestBeacon, room: r.nearestRoom, count: 0 };
      counts[key].count += 1;
    }
  }

  const sorted = Object.values(counts).sort((a, b) => b.count - a.count);
  if (!sorted.length) return null;
  return { nearestBeacon: sorted[0].beacon, nearestRoom: sorted[0].room };
}

// ── Serial line parsing ───────────────────────────────────────────────────────
function deriveNearestFromRssi() {
  const candidates = [
    { beacon: 'beaconA', room: 'Living room', rssi: normalizeRssi(state.rssiA) },
    { beacon: 'beaconB', room: 'Bed room', rssi: normalizeRssi(state.rssiB) },
    { beacon: 'beaconC', room: 'Library', rssi: normalizeRssi(state.rssiC) }
  ].filter((item) => item.rssi !== null);

  if (candidates.length === 0) {
    return { nearestBeacon: null, nearestRoom: null };
  }

  candidates.sort((a, b) => b.rssi - a.rssi);
  return {
    nearestBeacon: candidates[0].beacon,
    nearestRoom: candidates[0].room
  };
}

function parseAndStoreLine(rawLine) {
  const line = String(rawLine || '').trim();
  if (!line) return;

  // Debug: show exactly what is coming in from the USB port
  console.log(`[Board 2 RAW] ${line}`);

  state.lastSeenAt = new Date().toISOString();
  state.lastLine = line;
  state.lastError = null;

  // Firmware download-mode detection
  if (/waiting for download/i.test(line)) {
    state.connected = true;
    state.lastError = 'ESP32 is in download mode. Press RESET (EN) once.';
    return;
  }

  // MONITOR ON/OFF acknowledgement from Board 2 serial output
  const monitorAckMatch = line.match(/^\[SERIAL\]\s*MONITOR\s+(ON|OFF)\s*$/i);
  if (monitorAckMatch) {
    state.monitoringEnabled = monitorAckMatch[1].toUpperCase() === 'ON';
  }

  // STATUS reply: "Monitoring: ON|OFF"
  const monitorStatusMatch = line.match(/^Monitoring:\s*(ON|OFF)\s*$/i);
  if (monitorStatusMatch) {
    state.monitoringEnabled = monitorStatusMatch[1].toUpperCase() === 'ON';
  }

  // Light reading: "Light: 123.45 lx"
  const luxMatch = line.match(/Light:\s*([-+]?\d+(?:\.\d+)?)/i);
  if (luxMatch) {
    const v = Number(luxMatch[1]);
    state.lux = normalizeFinite(v);
    console.log(`[Board 2] Parsed Lux: ${state.lux} lx`);
  }

  // RSSI: "RSSI -> A:-65 B:-72 C:-80"
  const rssiMatch = line.match(/RSSI\s*->\s*A:\s*(-?\d+)\s*B:\s*(-?\d+)\s*C:\s*(-?\d+)/i);
  if (rssiMatch) {
    state.rssiA = Number(rssiMatch[1]);
    state.rssiB = Number(rssiMatch[2]);
    state.rssiC = Number(rssiMatch[3]);
  }

  // Nearest Corner: "Nearest Corner: corner a"
  const nearestMatch = line.match(/Nearest\s+Corner:\s*(.+)$/i);
  if (nearestMatch) {
    const rawCorner = nearestMatch[1].trim();
    const key = rawCorner.toLowerCase();

    // 1. Initial mapping from corner label
    state.nearestBeacon = BEACON_BY_CORNER[key] || state.nearestBeacon;
    state.nearestRoom = ROOM_BY_CORNER[key] || state.nearestRoom;

    // 2. Override mapping if active
    if (state.manualRoomOverride) {
      state.nearestRoom = state.manualRoomOverride;
    }

    // 3. Final synchronization to ensure beacon name follows room requirements
    if (state.nearestRoom) {
      state.nearestBeacon = BEACON_BY_ROOM[state.nearestRoom] || state.nearestBeacon;
    }
  }

  // Buffer for per-round averaging
  bufferBoard2Reading();
}

// ── Serial port control ───────────────────────────────────────────────────────
function canSendResetPulse() {
  return Date.now() - lastResetPulseMs > RESET_PULSE_COOLDOWN_MS;
}

function sendGentleResetPulse(reason) {
  if (!serialPort?.isOpen || !canSendResetPulse()) return false;

  lastResetPulseMs = Date.now();
  serialPort.set({ dtr: true, rts: false }, () => {
    setTimeout(() => {
      serialPort?.set({ dtr: false, rts: false }, () => {
        state.lastError = `Serial reset pulse sent (${reason}).`;
      });
    }, 120);
  });

  return true;
}

function clearTelemetryData() {
  state.lastSeenAt = null;
  state.lastLine = null;
  state.lux = null;
  state.nearestBeacon = null;
  state.nearestRoom = null;
  state.rssiA = null;
  state.rssiB = null;
  state.rssiC = null;
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function scheduleReconnect() {
  if (reconnectTimer || !usbLuxSerialPort) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    openUsbLuxPort();
  }, RECONNECT_DELAY_MS);
}

function writeSerialCommand(command) {
  if (!serialPort?.isOpen || !state.connected) return false;
  serialPort.write(`${command}\n`, (error) => {
    if (error) {
      state.lastError = `Serial write failed (${command}): ${error.message}`;
    }
  });
  return true;
}

function sendMonitorCommandBurst(enabled) {
  const command = enabled ? 'MONITOR ON' : 'MONITOR OFF';
  for (let attempt = 0; attempt < MONITOR_WRITE_ATTEMPTS; attempt += 1) {
    setTimeout(() => {
      writeSerialCommand(command);
    }, attempt * MONITOR_WRITE_RETRY_MS);
  }
  // Request STATUS to confirm monitoring state
  setTimeout(() => {
    writeSerialCommand('STATUS');
  }, MONITOR_WRITE_ATTEMPTS * MONITOR_WRITE_RETRY_MS + 120);
}

function closeCurrentPort() {
  if (parser) {
    parser.removeAllListeners('data');
    parser = null;
  }
  if (serialPort) {
    serialPort.removeAllListeners('open');
    serialPort.removeAllListeners('close');
    serialPort.removeAllListeners('error');
    if (serialPort.isOpen) {
      serialPort.close(() => { });
    }
    serialPort = null;
  }
}

function openUsbLuxPort() {
  if (!usbLuxSerialPort || serialPort) return;

  try {
    // eslint-disable-next-line global-require
    const { SerialPort } = require('serialport');
    // eslint-disable-next-line global-require
    const { ReadlineParser } = require('@serialport/parser-readline');

    serialPort = new SerialPort({
      path: usbLuxSerialPort,
      baudRate: usbLuxSerialBaudRate,
      autoOpen: false
    });

    parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));
    parser.on('data', parseAndStoreLine);

    serialPort.on('open', () => {
      clearReconnectTimer();
      state.connected = true;
      state.lastError = null;
      clearTelemetryData();

      // Release DTR/RTS so we don't trigger an ESP32 reset on connect
      serialPort.set({ dtr: false, rts: false }, () => { });

      if (state.monitoringEnabled) {
        setTimeout(() => {
          if (serialPort?.isOpen) sendMonitorCommandBurst(true);
        }, 300);

        setTimeout(() => {
          if (!state.lastSeenAt) sendGentleResetPulse('open-no-data');
        }, 1500);
      }
    });

    serialPort.on('close', () => {
      state.connected = false;
      clearTelemetryData();
      closeCurrentPort();
      scheduleReconnect();
    });

    serialPort.on('error', (error) => {
      state.connected = false;
      state.lastError = error?.message || 'Unknown serial port error.';
      clearTelemetryData();
      closeCurrentPort();
      scheduleReconnect();
    });

    serialPort.open((error) => {
      if (error) {
        state.connected = false;
        state.lastError = error?.message || 'Failed to open USB serial port.';
        clearTelemetryData();
        closeCurrentPort();
        scheduleReconnect();
      }
    });
  } catch (error) {
    state.connected = false;
    state.lastError = `USB board service unavailable: ${error?.message || 'serialport package missing.'}`;
    scheduleReconnect();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
function startUsbLuxBoardService() {
  if (!usbLuxSerialPort) {
    state.lastError = 'USB_LUX_SERIAL_PORT is not configured. Set it in backend/.env (example: COM5).';
    return;
  }
  openUsbLuxPort();
}

function getUsbLuxStatusSnapshot() {
  const nowMs = Date.now();
  const lastSeenMs = state.lastSeenAt ? new Date(state.lastSeenAt).getTime() : null;
  const lastSeenAgeMs = Number.isFinite(lastSeenMs) ? Math.max(0, nowMs - lastSeenMs) : null;
  const isStale = !state.connected || lastSeenAgeMs === null || lastSeenAgeMs > STALE_DATA_MS;

  const derivedNearest = deriveNearestFromRssi();

  return {
    configured: state.configured,
    connected: state.connected,
    isStale,
    lastSeenAgeMs,
    monitoringEnabled: state.monitoringEnabled,
    portPath: state.portPath,
    baudRate: state.baudRate,
    lastSeenAt: state.lastSeenAt,
    lastLine: state.lastLine,
    lastError: state.lastError,
    lux: state.lux,
    nearestBeacon: state.nearestBeacon || derivedNearest.nearestBeacon,
    nearestRoom: state.manualRoomOverride || state.nearestRoom || derivedNearest.nearestRoom,
    manualRoomOverride: state.manualRoomOverride,
    rssiA: state.rssiA,
    rssiB: state.rssiB,
    rssiC: state.rssiC
  };
}

function getBoard2StatusSnapshot() {
  const base = getUsbLuxStatusSnapshot();
  return {
    ...base,
    latestRound: getBoard2AveragedRound(),
    currentRound: currentRoundIndex + 1,
    rounds: averagedRounds
  };
}

function setUsbLuxMonitoringState(enabled) {
  const command = enabled ? 'MONITOR ON' : 'MONITOR OFF';
  state.monitoringEnabled = Boolean(enabled);

  if (serialPort?.isOpen && state.connected) {
    sendMonitorCommandBurst(state.monitoringEnabled);

    if (enabled && !state.lastSeenAt) {
      setTimeout(() => {
        if (!state.lastSeenAt) {
          sendGentleResetPulse('monitor-on-no-data');
          setTimeout(() => {
            if (serialPort?.isOpen) sendMonitorCommandBurst(true);
          }, 500);
        }
      }, 1000);
    }
  }

  return {
    ok: true,
    command,
    monitoringEnabled: state.monitoringEnabled,
    queued: !(serialPort?.isOpen && state.connected)
  };
}

module.exports = {
  startUsbLuxBoardService,
  getUsbLuxStatusSnapshot,
  getBoard2StatusSnapshot,
  setUsbLuxMonitoringState,
  resetBoard2Rounds,
  setManualRoomOverride,
  syncBoard2RoundIndex,
  getBoard2AveragedRound,
  finalizeCurrentRound,
};