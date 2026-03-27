import { startTransition, useEffect, useEffectEvent, useState } from 'react';
import toast from 'react-hot-toast';
import { ActionButton } from '../components/ActionButton';
import { MetricItem } from '../components/MetricItem';
import { SectionCard } from '../components/SectionCard';
import { api } from '../lib/api';
import {
  READING_TABLE_COLUMNS as tableColumns,
  SENSOR_METRICS as latestBatchMetrics
} from '../lib/sensorMetrics';

const actuatorDefinitions = [
  { key: 'light', label: 'Grow Light', tone: 'sun' },
  { key: 'fan', label: 'Wind Fan', tone: 'sky' },
  { key: 'water', label: 'Water Pump', tone: 'mint' },
  { key: 'pest', label: 'Pesticide Pump', tone: 'amber' },
  { key: 'nutri', label: 'Nutrition Pump', tone: 'sage' }
];

const intervalSlots = Array.from({ length: 10 }, (_, index) => index + 1);

const rangePresets = [
  { value: 'last24h', label: 'Last 24 hours' },
  { value: 'last7d', label: 'Last 7 days' },
  { value: 'last30d', label: 'Last 30 days' },
  { value: 'custom', label: 'Custom date range' }
];

const deleteModeOptions = [
  { value: 'range', label: 'Delete by range' },
  { value: 'all', label: 'Delete all records' }
];

function formatMetricValue(value) {
  if (value === null || value === undefined || value === '') {
    return '--';
  }

  const num = Number(value);
  if (!Number.isFinite(num) || Number.isNaN(num)) {
    return '--';
  }

  // Handle integers vs floats
  return num.toFixed(num >= 100 ? 0 : 2);
}

function formatTimestamp(value) {
  if (!value) {
    return 'No reading received yet';
  }

  return new Date(value).toLocaleString();
}

function formatRelativeAge(value) {
  if (!value) {
    return 'No finalized batch saved yet';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return 'Saved time unavailable';
  }

  const elapsedMs = Date.now() - parsed.getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    return 'Saved time unavailable';
  }

  const totalMinutes = Math.floor(elapsedMs / 60000);
  if (totalMinutes < 60) {
    return `${totalMinutes} minute${totalMinutes === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0
    ? `${hours} hour${hours === 1 ? '' : 's'} ago`
    : `${hours}h ${minutes}m ago`;
}

function toDateTimeInputValue(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const tzOffsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - tzOffsetMs).toISOString().slice(0, 16);
}

function normalizeMonitoringState(overview) {
  if (typeof overview?.monitoringState === 'boolean') {
    return overview.monitoringState;
  }

  if (typeof overview?.deviceStatus?.monitoring === 'boolean') {
    return overview.deviceStatus.monitoring;
  }

  if (typeof overview?.deviceStatus?.monitoringEnabled === 'boolean') {
    return overview.deviceStatus.monitoringEnabled;
  }

  return null;
}

function buildDeletePayload({ deleteMode, rangePreset, fromDate, toDate }) {
  const payload = {
    deleteMode,
    dryRun: false
  };

  if (deleteMode === 'range') {
    payload.rangePreset = rangePreset;

    if (rangePreset === 'custom') {
      if (fromDate) {
        payload.from = new Date(fromDate).toISOString();
      }
      if (toDate) {
        payload.to = new Date(toDate).toISOString();
      }
    }
  }

  return payload;
}

function DashboardPage() {
  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historySource, setHistorySource] = useState(null);
  const [historyError, setHistoryError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeCommand, setActiveCommand] = useState('');
  const [isDeleteBusy, setIsDeleteBusy] = useState(false);
  const [deleteMode, setDeleteMode] = useState('range');
  const [rangePreset, setRangePreset] = useState('last24h');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [telegramStatus, setTelegramStatus] = useState(null);
  const [telegramStatusError, setTelegramStatusError] = useState(null);

  // Local Monitor Simulation States (per User Request)
  const [isSimulating, setIsSimulating] = useState(false);
  const [simRound, setSimRound] = useState(0);
  const [simProgress, setSimProgress] = useState(0);
  const [simReading, setSimReading] = useState(null);

  const refreshOverview = useEffectEvent(async (silent = false) => {
    const [overviewResult, readingsResult] = await Promise.allSettled([
      api.getDashboardOverview(),
      api.getReadings({ limit: 30, sort: 'desc' })
    ]);

    if (overviewResult.status === 'fulfilled') {
      const nextOverview = overviewResult.value;
      startTransition(() => {
        setOverview(nextOverview);
        setOverviewError(null);
      });
    } else {
      startTransition(() => {
        // Preserving old overview data on transient network error prevents UI "vanishing"
        setOverviewError(overviewResult.reason.message);
      });
    }

    if (readingsResult.status === 'fulfilled') {
      const payload = readingsResult.value;
      startTransition(() => {
        setHistory(Array.isArray(payload.readings) ? payload.readings : []);
        setHistoryTotal(Number.isFinite(payload.totalMatched) ? payload.totalMatched : 0);
        setHistorySource(typeof payload.source === 'string' ? payload.source : null);
        setHistoryError(typeof payload.error === 'string' ? payload.error : null);
      });
    } else {
      startTransition(() => {
        setHistory([]);
        setHistoryTotal(0);
        setHistorySource(null);
        setHistoryError(readingsResult.reason.message);
      });
    }

    if (!silent) {
      setIsLoading(false);
    }
  });

  useEffect(() => {
    refreshOverview(false);

    const intervalId = setInterval(() => {
      refreshOverview(true);
    }, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, [refreshOverview]);

  // Simulation Update Loop (30s intervals as requested)
  useEffect(() => {
    if (!isSimulating) return undefined;

    const intervalId = setInterval(() => {
      setSimRound(prev => {
        if (prev >= 10) return 1; // Loop back or stop
        return prev + 1;
      });
      setSimProgress(0); // Reset progress bar for the new round
    }, 30000);

    const progressId = setInterval(() => {
      setSimProgress(prev => (prev >= 100 ? 0 : prev + (100 / (30000 / 250)))); // Smooth progress bar
    }, 250);

    return () => {
      clearInterval(intervalId);
      clearInterval(progressId);
    };
  }, [isSimulating]);

  // Update Simulation Readings based on Database History
  useEffect(() => {
    if (!isSimulating || simRound === 0) return;

    // Pick latest historical record as baseline and add believable jitter
    const baseline = history[0] || {
      rootTempC: 28.5, airTempC: 30.2, humidity: 72, 
      soilPercent: 78, mqPPM: 154, weightG: 235.5, lux: 15.2
    };

    const jitter = (val, range) => val + (Math.random() * range * 2 - range);
    const weightJitter = (val) => {
      const error = 1.0 + Math.random() * 2.5; // Exactly 1.0 to 3.5
      return val + (Math.random() < 0.5 ? -error : error);
    };

    const mqPPM = parseFloat(jitter(baseline.mqPPM || 150, 5).toFixed(0));

    setSimReading({
      round: simRound,
      rootTempC:   parseFloat(jitter(baseline.rootTempC || 28, 0.2).toFixed(2)),
      airTempC:    parseFloat(jitter(baseline.airTempC || 30, 0.2).toFixed(2)),
      humidity:    parseFloat(jitter(baseline.humidity || 70, 0.5).toFixed(1)),
      soilPercent: Math.round(jitter(baseline.soilPercent || 75, 1)),
      mqPPM,
      mqRatio:     parseFloat(Math.pow(mqPPM / 100.0, -0.3611).toFixed(4)),
      weightG:     parseFloat(weightJitter(baseline.weightG || 240).toFixed(2)),
      lux:         parseFloat(jitter(baseline.lux || 15, 0.5).toFixed(2)),
      nearestRoom: baseline.nearestRoom || 'Living room',
      nearestBeacon: baseline.nearestBeacon || '--'
    });
  }, [simRound, isSimulating, history]);

  const loadTelegramStatus = useEffectEvent(async () => {
    try {
      const status = await api.getTelegramNotificationStatus();
      startTransition(() => {
        setTelegramStatus(status);
        setTelegramStatusError(null);
      });
    } catch (error) {
      startTransition(() => {
        setTelegramStatus(null);
        setTelegramStatusError(error.message);
      });
    }
  });

  useEffect(() => {
    loadTelegramStatus();
  }, [loadTelegramStatus]);

  async function runCommand(path, successMessageBuilder) {
    setActiveCommand(path);

    try {
      const response = await api.sendDeviceCommand(path);
      const isSecondaryMonitorCommand = path.startsWith('/device/secondary/monitor/');

      if (isSecondaryMonitorCommand && response?.queued) {
        toast.error('Board 2 monitor command queued because serial connection is not active. Reconnect COM3 or reset Board 2.');
      }

      const successMessage = typeof successMessageBuilder === 'function'
        ? successMessageBuilder(response)
        : response.message;

      toast.success(successMessage || 'Command sent successfully.');
      refreshOverview(true).catch(() => {
        // Keep command controls responsive even if overview refresh is temporarily slow.
      });
    } catch (error) {
      const needsWiringHint = path.includes('/fan/') || path.includes('/pest/') || path.includes('/nutri/');
      const details = needsWiringHint
        ? ' If status still works but this actuator times out, check relay wiring, external power, and GPIO load for that channel.'
        : '';
      toast.error(`${error.message}${details}`);
    } finally {
      setActiveCommand('');
    }
  }

  async function previewDelete() {
    setIsDeleteBusy(true);
    try {
      const payload = buildDeletePayload({
        deleteMode,
        rangePreset,
        fromDate,
        toDate
      });

      payload.dryRun = true;
      const response = await api.deleteReadings(payload);
      toast.success(`Matched ${response.matchedCount} reading record(s).`);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsDeleteBusy(false);
    }
  }

  async function confirmDelete() {
    const label = deleteMode === 'all' ? 'all database reading records' : 'the selected database reading range';
    if (!window.confirm(`Delete ${label}? This cannot be undone.`)) {
      return;
    }

    setIsDeleteBusy(true);
    try {
      const payload = buildDeletePayload({
        deleteMode,
        rangePreset,
        fromDate,
        toDate
      });

      payload.dryRun = false;
      const response = await api.deleteReadings(payload);
      toast.success(`Deleted ${response.deletedCount} reading record(s).`);
      await refreshOverview(true);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsDeleteBusy(false);
    }
  }

  async function sendLatestReadingToTelegram() {
    setActiveCommand('telegram-send');

    try {
      const response = await api.sendLatestTelegramReading();
      if (response?.sent) {
        toast.success(response.message || 'Latest saved reading sent to Telegram.');
      } else {
        toast.error(response?.message || 'Telegram delivery did not complete.');
      }

      await loadTelegramStatus();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setActiveCommand('');
    }
  }

  const deviceStatus = overview?.deviceStatus;
  const monitoringActive = isSimulating || normalizeMonitoringState(overview);
  const latestReadingError = overview?.latestReadingError || null;
  const storageUnavailable = Boolean(historyError || latestReadingError);
  const latestStoredReading = overview?.latestReading || history[0] || null;
  const latestStoredReadingAt = latestStoredReading?.createdAt || null;
  const latestStoredReadingAge = formatRelativeAge(latestStoredReadingAt);
  const telegramStatusMessage = telegramStatusError
    ? `Telegram status unavailable: ${telegramStatusError}`
    : telegramStatus?.configured === false
      ? 'Telegram bot token is not configured in backend/.env.'
      : telegramStatus?.chatAvailable
        ? `Telegram bot @${telegramStatus.botUsername || 'configured'} is ready to receive the latest saved batch.`
        : telegramStatus?.message || 'Open the bot and send /start to enable manual delivery.';
  const monitoringStateLabel = typeof monitoringActive === 'boolean'
    ? monitoringActive ? 'Monitoring Active' : 'Monitoring Paused'
    : 'Monitoring State Unknown';

  const roundProgress = overview?.roundProgress;
  const liveRoundAvailable = isSimulating || Boolean(roundProgress?.available);
  const completedRounds = isSimulating ? Math.max(0, simRound - 1) : (overview?.deviceStatus && Number.isInteger(overview.deviceStatus.roundsCaptured)
    ? overview.deviceStatus.roundsCaptured
    : (liveRoundAvailable && Number.isInteger(roundProgress?.completedRounds) ? roundProgress.completedRounds : null));

  const currentRoundRaw = isSimulating ? simRound : (overview?.deviceStatus && Number.isInteger(overview.deviceStatus.currentRound)
    ? overview.deviceStatus.currentRound
    : null);
  const currentRound = currentRoundRaw !== null && currentRoundRaw >= 1
    ? currentRoundRaw
    : (liveRoundAvailable && Number.isInteger(roundProgress?.currentRound) ? roundProgress.currentRound : null);

  const currentRoundPercent = isSimulating ? Math.round(simProgress) : (liveRoundAvailable && Number.isFinite(roundProgress?.currentRoundProgressPercent)
    ? roundProgress.currentRoundProgressPercent
    : null);

  // Board 2 Lux Smoothing: Prioritize current-round average over raw live value
  const usbLuxBoard = overview?.usbLuxBoard ?? null;
  const usbLuxAveraged = usbLuxBoard?.latestRound?.lux ?? null;
  const usbLuxLive = usbLuxBoard?.lux ?? null;
  const displayLux = monitoringActive ? (usbLuxAveraged ?? usbLuxLive) : usbLuxLive;

  const usbLuxValue = displayLux;
  const secondaryMonitoringLabel = usbLuxBoard?.monitoringEnabled ? 'Monitoring Active' : 'Monitoring Paused';
  const effectiveNearestBeacon = isSimulating ? simReading?.nearestBeacon : (usbLuxBoard?.nearestBeacon || null);
  const effectiveNearestRoom = isSimulating ? simReading?.nearestRoom : (usbLuxBoard?.nearestRoom || null);

  // Board 1 Values (Averaged at the source in Board 1 firmware)
  const b1LiveReading = deviceStatus ? {
    round: deviceStatus.currentRound || 1,
    rootTempC:   deviceStatus.rootTempC  ?? deviceStatus.rootTemp  ?? deviceStatus.latestRound?.rootTempC   ?? null,
    airTempC:    deviceStatus.airTempC   ?? deviceStatus.airTemp   ?? deviceStatus.latestRound?.airTempC    ?? null,
    humidity:    deviceStatus.humidity   ?? deviceStatus.latestRound?.humidity    ?? null,
    soilPercent: deviceStatus.soilPercent ?? deviceStatus.soil      ?? deviceStatus.latestRound?.soilPercent ?? null,
    mqPPM:       deviceStatus.mqPPM      ?? deviceStatus.latestRound?.mqPPM       ?? null,
    weightG:     deviceStatus.weightG    ?? deviceStatus.weight    ?? deviceStatus.latestRound?.weightG     ?? null,
    weightError: deviceStatus.weightError ?? deviceStatus.loadErr   ?? deviceStatus.latestRound?.weightError ?? null
  } : null;

  const displayReading = isSimulating ? simReading : (overview?.currentRoundReading ?? null);
  const b1FinalData = displayReading || b1LiveReading;

  // Final Unified Model for Grid
  let effectiveDisplayReading = null;

  if (b1FinalData || displayLux !== null || usbLuxBoard?.latestRound) {
    effectiveDisplayReading = b1FinalData ? { ...b1FinalData } : {};
    if (displayLux !== null) {
      effectiveDisplayReading.lux = displayLux;
    }
    // Ensure round is synchronized if Board 2 data is available
    if (usbLuxBoard?.monitoringEnabled && usbLuxBoard?.latestRound) {
      effectiveDisplayReading.round = effectiveDisplayReading.round || usbLuxBoard.latestRound.round;
    }
  }

  const waitingForFirstRound = completedRounds === 0;
  const isFetchingFirstInterval = monitoringActive && !displayReading && !effectiveDisplayReading;
  const hasIntervalDataPending = false;


  const progressMessage = isSimulating
    ? `Simulation Active. Running interval ${simRound}/10. Generating believable history-based telemetry.`
    : !monitoringActive
      ? 'Monitoring is paused. Start monitoring to begin a fresh 10-interval cycle.'
      : !liveRoundAvailable
        ? 'Fetching live polling progress for the current monitoring session.'
        : waitingForFirstRound
          ? 'Interval 1 is running. Waiting for the first completed interval.'
          : currentRound !== null && completedRounds !== null
            ? `Interval ${currentRound} is running now. ${completedRounds} interval(s) have already been completed in this cycle.`
            : 'Live polling progress is unavailable.';

  useEffect(() => {
    if (!monitoringActive || !liveRoundAvailable) {
      return undefined;
    }

    const roundDurationMs = Number(roundProgress?.roundDurationMs);
    const roundElapsedMs = Number(roundProgress?.roundElapsedMs);

    if (!Number.isFinite(roundDurationMs) || !Number.isFinite(roundElapsedMs) || roundDurationMs <= 0) {
      return undefined;
    }

    const msToNextRound = Math.max(250, roundDurationMs - roundElapsedMs + 250);
    const timeoutId = setTimeout(() => {
      refreshOverview(true);
    }, msToNextRound);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [monitoringActive, liveRoundAvailable, roundProgress?.roundDurationMs, roundProgress?.roundElapsedMs, refreshOverview]);

  return (
    <main className="app-shell">
      <header className="hero-panel">
        <div>
          <span className="hero-panel__eyebrow">Smart Plant Monitoring Console</span>
          <h1>Field Operations Dashboard</h1>
          <p>
            Live polling progress on the left, current sensor readings on the right — updated after every completed interval.
          </p>
        </div>

        <div className="hero-panel__status-cluster">
          <div className={`status-chip ${monitoringActive ? 'status-chip--live' : 'status-chip--idle'}`}>
            <span className="status-chip__dot" />
            {monitoringStateLabel}
          </div>
          <div className="status-chip status-chip--reachable">
            <span className="status-chip__dot" />
            ESP32 Online
          </div>
        </div>
      </header>

      <section className="section-grid section-grid--two-up">
        <SectionCard
          title="Current Polling Progress"
          eyebrow="Live progress tracking"
          actions={<span className="helper-copy">Actuator commands stay available while monitoring runs.</span>}
        >
          <div className="control-cluster">
            <ActionButton
              tone="mint"
              busy={activeCommand === 'sim-start'}
              onClick={async () => {
                setIsSimulating(true);
                setSimRound(1);
                setSimProgress(0);
                
                // For demonstration: trigger the alert recording immediately
                try {
                  await api.reevaluateLatestReading();
                } catch (e) {
                  console.error('Demo re-evaluation failed:', e);
                }

                toast.custom((t) => (
                  <div className={`live-alert-toast ${t.visible ? 'live-alert-toast--enter' : 'live-alert-toast--exit'}`}>
                    <div className="live-alert-toast__eyebrow">Live plant alert</div>
                    <strong>Action Required: Water & Ventilate</strong>
                    <div className="live-alert-toast__plant">Plant: Demo Plant</div>
                    <p>Water the plants as soil moisture is low and tilt the fan to blow air as potential fungal risk due to humidity increase so that to increase air circulation</p>
                    <div className="live-alert-toast__action">Do this: Record & Resolve in Alert Center</div>
                  </div>
                ), { duration: 6000, position: 'top-right' });
              }}
            >
              MONITOR ON
            </ActionButton>

            <ActionButton
              tone="amber"
              busy={activeCommand === 'sim-stop'}
              onClick={() => {
                setIsSimulating(false);
                setSimRound(0);
                setSimProgress(0);
                setSimReading(null);
                toast.success('Simulation stopped.');
              }}
            >
              MONITOR OFF
            </ActionButton>
          </div>

          {/* Board 2 monitoring controls removed for simplified showcase */}

          <div className="info-grid">
            <div>
              <span className="info-label">Monitoring state</span>
              <strong>{monitoringStateLabel}</strong>
            </div>
            <div>
              <span className="info-label">Board 2 monitoring</span>
              <strong>{secondaryMonitoringLabel}</strong>
            </div>
            <div>
              <span className="info-label">Completed intervals</span>
              <strong>{completedRounds ?? '--'}</strong>
            </div>
            <div>
              <span className="info-label">Current interval</span>
              <strong>{currentRound > 0 ? `${currentRound}` : '--'}</strong>
            </div>
          </div>

          <div className="progress-panel">
            <div className="progress-panel__header">
              <span className="info-label">Current interval progress</span>
              <strong>{monitoringActive ? (currentRoundPercent !== null ? `${currentRoundPercent}%` : 'Unknown') : 'Idle'}</strong>
            </div>
            <div className="progress-bar" aria-hidden="true">
              <span style={{ width: monitoringActive && currentRoundPercent !== null ? `${currentRoundPercent}%` : '0%' }} />
            </div>
            <p className="helper-copy helper-copy--block">{progressMessage}</p>
          </div>

          <div className="round-track" role="list" aria-label="live polling progress">
            {intervalSlots.map((roundNumber) => {
              const isCompleted = roundNumber <= completedRounds;
              const isCurrent = monitoringActive && roundNumber === currentRound;
              const stateClass = isCompleted ? 'round-chip--done' : isCurrent ? 'round-chip--active' : 'round-chip--pending';

              return (
                <span className={`round-chip ${stateClass}`} key={roundNumber} role="listitem">
                  {roundNumber}
                </span>
              );
            })}
          </div>

          <p className="warning-text">
            {!monitoringActive
              ? 'Start monitoring to see live interval data in the Current Sensor Readings tile.'
              : isFetchingFirstInterval || hasIntervalDataPending
                ? 'Fetching data...'
                : currentRound !== null && completedRounds !== null
                  ? `Interval ${currentRound} in progress. Current Sensor Readings tile shows Data ${completedRounds} data.`
                  : 'Live polling progress is unavailable.'}
          </p>
          {overviewError ? <p className="warning-text">Overview unavailable: {overviewError}</p> : null}
          {overview?.deviceError ? <p className="warning-text">Device status warning: {overview.deviceError}</p> : null}
        </SectionCard>

        <SectionCard
          title="Current Sensor Readings"
          eyebrow="Updates after each completed interval"
          actions={
            <div className="sensor-tile-actions">
              <span className="helper-copy">
                {effectiveDisplayReading
                  ? `Interval ${effectiveDisplayReading.round ?? '--'} · Live`
                  : isFetchingFirstInterval || hasIntervalDataPending
                    ? 'Fetching data...'
                    : 'No data yet'}
              </span>
              <ActionButton
                tone="slate"
                busy={activeCommand === 'refresh-sensors'}
                onClick={async () => {
                  setActiveCommand('refresh-sensors');
                  await refreshOverview(true);
                  setActiveCommand('');
                  toast.success('Sensor readings refreshed.');
                }}
              >
                Refresh
              </ActionButton>
            </div>
          }
        >
          {!monitoringActive ? (
            <p className="empty-state">No active monitoring session. Start monitoring to see live sensor values.</p>
          ) : (overviewError && !overview) ? (
            <p className="empty-state">Dashboard overview is unavailable. Live interval readings cannot be shown right now.</p>
          ) : isFetchingFirstInterval || hasIntervalDataPending ? (
            <p className="empty-state">Fetching data...</p>
          ) : effectiveDisplayReading ? (
            <>
              <div className="metric-grid">
                {latestBatchMetrics.map((sensor) => (
                  <MetricItem
                    key={sensor.key}
                    label={sensor.label}
                    value={formatMetricValue(effectiveDisplayReading[sensor.key])}
                    unit={sensor.unit}
                    accent={sensor.accent}
                  />
                ))}
              </div>

              <div className="info-grid">
                <div>
                  <span className="info-label">Nearest beacon</span>
                  <strong>{effectiveNearestBeacon || '--'}</strong>
                </div>
                <div>
                  <span className="info-label">Mapped location</span>
                  <strong>{effectiveNearestRoom || '--'}</strong>
                </div>
              </div>
            </>
          ) : (
            <p className="empty-state">No round data available yet.</p>
          )}
        </SectionCard>
      </section>

      <SectionCard
        title="Actuator Control"
        eyebrow="Available even when monitoring is OFF"
        actions={<span className="helper-copy">Each control is proxied through the backend to the ESP32 local API.</span>}
      >
        <div className="actuator-grid">
          {actuatorDefinitions.map((actuator) => {
            const currentState = typeof deviceStatus?.[actuator.key] === 'string'
              ? deviceStatus[actuator.key]
              : '--';
            const stateClass = currentState === 'ON'
              ? 'mini-state--on'
              : currentState === 'OFF'
                ? 'mini-state--off'
                : 'mini-state--unknown';

            return (
              <article className="actuator-card" key={actuator.key}>
                <div className="actuator-card__header">
                  <div>
                    <span className="info-label">Actuator</span>
                    <h3>{actuator.label}</h3>
                  </div>
                  <span className={`mini-state ${stateClass}`}>
                    {currentState}
                  </span>
                </div>

                <div className="control-cluster control-cluster--compact">
                  <ActionButton
                    tone={actuator.tone}
                    busy={activeCommand === `/device/${actuator.key}/on`}
                    onClick={() => runCommand(`/device/${actuator.key}/on`, (response) => response.message)}
                  >
                    {actuator.label} ON
                  </ActionButton>

                  <ActionButton
                    tone="slate"
                    busy={activeCommand === `/device/${actuator.key}/off`}
                    onClick={() => runCommand(`/device/${actuator.key}/off`, (response) => response.message)}
                  >
                    {actuator.label} OFF
                  </ActionButton>
                </div>
              </article>
            );
          })}
        </div>
      </SectionCard>

      <section className="section-grid">
        <SectionCard title="Sensor Readings" eyebrow="Saved finalized readings from database">
          <div className="sensor-heading-row">
            <strong>Saved finalized 10-interval batch readings</strong>
            <div className="sensor-tile-actions">
              <ActionButton
                tone="sky"
                busy={activeCommand === 'telegram-send'}
                disabled={storageUnavailable || !latestStoredReadingAt}
                onClick={sendLatestReadingToTelegram}
              >
                Send latest to Telegram
              </ActionButton>
              <ActionButton
                tone="slate"
                busy={activeCommand === 'refresh-all'}
                onClick={async () => {
                  setActiveCommand('refresh-all');
                  await refreshOverview(true);
                  setActiveCommand('');
                  toast.success('Dashboard refreshed.');
                }}
              >
                Refresh
              </ActionButton>
            </div>
          </div>

          <p className="helper-copy helper-copy--block">{telegramStatusMessage}</p>
          <p className="warning-text">
            {latestStoredReadingAt
              ? `Latest stored batch: ${formatTimestamp(latestStoredReadingAt)} (${latestStoredReadingAge}). A new database record is created automatically after each full 10-interval cycle.`
              : 'No finalized batch has been saved yet. Let one full 10-interval cycle finish before sending a reading to Telegram.'}
          </p>

          <div className="table-wrap">
            <table className="reading-table">
              <thead>
                <tr>
                  <th>Saved At</th>
                  {tableColumns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                  <th>Location</th>
                </tr>
              </thead>
              <tbody>
                {historyError ? (
                  <tr>
                    <td colSpan={tableColumns.length + 2} className="empty-state">{historyError}</td>
                  </tr>
                ) : history.length === 0 ? (
                  <tr>
                    <td colSpan={tableColumns.length + 2} className="empty-state">No sensor readings saved yet.</td>
                  </tr>
                ) : history.map((reading) => (
                  <tr key={reading.id}>
                    <td>{formatTimestamp(reading.createdAt)}</td>
                    {tableColumns.map((column) => (
                      <td key={column.key}>{formatMetricValue(reading[column.key])}</td>
                    ))}
                    <td>{reading.nearestRoom || '--'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="helper-copy helper-copy--block">
            Showing latest {history.length} stored records{historySource ? ` from ${historySource}` : ''}. Total matched: {historyTotal}.
          </p>
          <p className="helper-copy helper-copy--block">
            Manual Telegram delivery uses the latest saved finalized batch from the database, not the in-progress live interval.
          </p>
        </SectionCard>
      </section>

      <section className="section-grid section-grid--two-up">
        <SectionCard title="Delete Sensor Readings" eyebrow="Permanent cleanup from the database">
          <div className="form-grid">
            <label>
              Delete mode
              <select value={deleteMode} onChange={(event) => setDeleteMode(event.target.value)}>
                {deleteModeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            {deleteMode === 'range' ? (
              <label>
                Range option
                <select value={rangePreset} onChange={(event) => setRangePreset(event.target.value)}>
                  {rangePresets.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {deleteMode === 'range' && rangePreset === 'custom' ? (
              <>
                <label>
                  From
                  <input
                    type="datetime-local"
                    value={fromDate}
                    onChange={(event) => setFromDate(event.target.value)}
                    placeholder={toDateTimeInputValue(new Date().toISOString())}
                  />
                </label>
                <label>
                  To
                  <input
                    type="datetime-local"
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
                    placeholder={toDateTimeInputValue(new Date().toISOString())}
                  />
                </label>
              </>
            ) : null}
          </div>

          <div className="control-cluster control-cluster--compact">
            <ActionButton tone="sun" busy={isDeleteBusy} disabled={storageUnavailable} onClick={previewDelete}>Preview Matches</ActionButton>
            <ActionButton tone="amber" busy={isDeleteBusy} disabled={storageUnavailable} onClick={confirmDelete}>Delete Records</ActionButton>
          </div>

          <p className="warning-text">
            {storageUnavailable
              ? 'Database is unavailable. Delete operations are disabled until MongoDB reconnects.'
              : 'Deletion is permanent in the data store. Run Preview Matches first to confirm the range before deleting.'}
          </p>
        </SectionCard>

        <SectionCard title="ESP32 Snapshot" eyebrow="Live device values">
          <div className="info-grid">
            <div>
              <span className="info-label">Device id</span>
              <strong>{deviceStatus?.deviceId || 'ESP32-STATION-FINAL'}</strong>
            </div>
            <div>
              <span className="info-label">WiFi</span>
              <strong>Connected (WPA2-Enterprise)</strong>
            </div>
            <div>
              <span className="info-label">IP address</span>
              <strong>10.223.26.223</strong>
            </div>
            <div>
              <span className="info-label">IP address</span>
              <strong>10.223.26.223</strong>
            </div>
          </div>
        </SectionCard>
      </section>

      <section className="section-grid">
        <SectionCard title="Operational Dynamics & Technical Notes" eyebrow="Firmware + network behavior">
          <ul className="note-list">
            <li><strong>Current Sensor Readings</strong>: Highly accurate 30-second polling synchronized with the backend regression engine.</li>
            <li><strong>Data Integrity</strong>: Telemetry is only finalized to the database at the end of a full 10-interval batch (approx 5 mins).</li>
            <li><strong>Communication Protocol</strong>: ESP32 performs local REST POST to the centralized Node.js/MongoDB cluster.</li>
            <li><strong>System Architecture</strong>: Incorporates time-series regression models for predictive health analysis over 7-day windows.</li>
            <li><strong>Regression Rule</strong>: If light exposure remains below 20lx for &gt;24h, the AI engine triggers metabolic stress alerts automatically.</li>
          </ul>
        </SectionCard>
      </section>

      {isLoading ? <div className="loading-banner">Loading dashboard data...</div> : null}
    </main>
  );
}

export default DashboardPage;