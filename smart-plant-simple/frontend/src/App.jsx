import { useEffect, useMemo, useState } from 'react';
import { api } from './api';

const SENSOR_METRICS = [
  { key: 'rootTempC', label: 'Root Temp', unit: 'C' },
  { key: 'airTempC', label: 'Air Temp', unit: 'C' },
  { key: 'humidity', label: 'Humidity', unit: '%' },
  { key: 'lux', label: 'Light', unit: 'lx' },
  { key: 'soilPercent', label: 'Soil', unit: '%' },
  { key: 'mqRatio', label: 'Gas Ratio', unit: '' },
  { key: 'mqPPM', label: 'Gas PPM', unit: 'ppm' },
  { key: 'weightG', label: 'Weight', unit: 'g' },
  { key: 'weightError', label: 'Weight Error', unit: 'g' }
];

const BATCH_TABLE_COLUMNS = [
  { key: 'createdAt', label: 'Saved At', format: 'time' },
  { key: 'monitoringSessionId', label: 'Session', format: 'text' },
  { key: 'batchType', label: 'Type', format: 'text' },
  { key: 'roundsUsed', label: 'Rounds', format: 'number' },
  { key: 'rootTempC', label: 'Root C', format: 'metric' },
  { key: 'airTempC', label: 'Air C', format: 'metric' },
  { key: 'humidity', label: 'Humidity %', format: 'metric' },
  { key: 'lux', label: 'Light lx', format: 'metric' },
  { key: 'soilPercent', label: 'Soil %', format: 'metric' },
  { key: 'mqPPM', label: 'Gas ppm', format: 'metric' },
  { key: 'weightG', label: 'Weight g', format: 'metric' }
];

const ROUND_TABLE_COLUMNS = [
  { key: 'roundNumber', label: 'Round', format: 'number' },
  { key: 'source', label: 'Source', format: 'text' },
  { key: 'observedAt', label: 'Observed', format: 'time' },
  { key: 'rootTempC', label: 'Root C', format: 'metric' },
  { key: 'airTempC', label: 'Air C', format: 'metric' },
  { key: 'humidity', label: 'Humidity %', format: 'metric' },
  { key: 'lux', label: 'Light lx', format: 'metric' },
  { key: 'soilPercent', label: 'Soil %', format: 'metric' },
  { key: 'mqPPM', label: 'Gas ppm', format: 'metric' },
  { key: 'weightG', label: 'Weight g', format: 'metric' }
];

const DEVICE_TARGETS = [
  { key: 'light', label: 'Light' },
  { key: 'fan', label: 'Fan' },
  { key: 'water', label: 'Water' },
  { key: 'pest', label: 'Pest' },
  { key: 'nutri', label: 'Nutrition' }
];

function formatMetric(value, unit) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '--';
  }

  if (typeof value !== 'number') {
    return '--';
  }

  const formatted = value >= 100 ? value.toFixed(0) : value.toFixed(2);
  return unit ? `${formatted} ${unit}` : formatted;
}

function formatTime(value) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }

  return date.toLocaleString();
}

function formatCell(row, column) {
  const value = row?.[column.key];

  if (column.format === 'time') {
    return formatTime(value);
  }

  if (column.format === 'number') {
    return Number.isFinite(value) ? String(value) : '--';
  }

  if (column.format === 'metric') {
    return formatMetric(value, '');
  }

  if (value === undefined || value === null || value === '') {
    return '--';
  }

  return String(value);
}

function statusMessage(overview) {
  const monitoring = overview?.monitoringState === true;
  const progress = overview?.roundProgress || {};
  const current = overview?.currentRoundReading;

  if (!monitoring) {
    return 'Monitoring is paused. Start monitoring to begin a new 10-round session.';
  }

  if (progress.waitingForFirstRound) {
    return 'Fetching data. Round 1 is running, waiting for the first completed round.';
  }

  if (!current && typeof progress.completedRounds === 'number' && progress.completedRounds > 0) {
    return 'Rounds are running, but live per-round payload is not present in device status.';
  }

  if (!current) {
    return 'Fetching live round data.';
  }

  return null;
}

function DataTable({ title, caption, columns, rows }) {
  return (
    <article className="card table-card">
      <h2>{title}</h2>
      <p className="hint">{caption}</p>

      {rows.length === 0 ? (
        <p className="hint">No rows available.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id || `${row.monitoringSessionId}-${row.roundNumber || row.createdAt}`}>
                  {columns.map((column) => (
                    <td key={column.key}>{formatCell(row, column)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

function App() {
  const [overview, setOverview] = useState(null);
  const [batchRows, setBatchRows] = useState([]);
  const [roundRows, setRoundRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyCommand, setBusyCommand] = useState('');
  const [lastSyncAt, setLastSyncAt] = useState(null);

  async function refresh(isSilent = false) {
    try {
      const nextOverview = await api.getOverview();
      const activeSessionId = nextOverview?.deviceStatus?.monitoringSessionId || null;

      const [batchList, roundList] = await Promise.all([
        api.getBatchReadings({ limit: 8, sort: 'desc' }),
        api.getRoundReadings(activeSessionId
          ? { monitoringSessionId: activeSessionId, limit: 10, sort: 'asc' }
          : { limit: 10, sort: 'desc' })
      ]);

      setOverview(nextOverview);
      setBatchRows(Array.isArray(batchList?.rows) ? batchList.rows : []);
      setRoundRows(Array.isArray(roundList?.rows) ? roundList.rows : []);
      setError(null);
      setLastSyncAt(new Date().toISOString());
    } catch (requestError) {
      setError(requestError.message);
      if (!isSilent) {
        setOverview(null);
        setBatchRows([]);
        setRoundRows([]);
      }
    } finally {
      if (!isSilent) {
        setLoading(false);
      }
    }
  }

  useEffect(() => {
    refresh(false);

    const id = setInterval(() => {
      refresh(true);
    }, 5000);

    return () => clearInterval(id);
  }, []);

  const currentRoundReading = overview?.currentRoundReading || null;
  const latestBatch = overview?.latestBatch || null;
  const progress = overview?.roundProgress || {};
  const monitoring = overview?.monitoringState === true;
  const helperText = useMemo(() => statusMessage(overview), [overview]);

  async function command(target, state) {
    const key = `${target}:${state}`;
    setBusyCommand(key);

    try {
      await api.sendDeviceCommand(target, state);
      await refresh(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyCommand('');
    }
  }

  if (loading) {
    return (
      <main className="shell">
        <div className="hero">
          <h1>Smart Plant Simple</h1>
          <p>Loading dashboard...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero reveal">
        <div>
          <p className="eyebrow">Refined Simple Setup</p>
          <h1>Smart Plant Simple</h1>
          <p className="subtitle">
            Lean architecture, strict finalized-batch logic, and explicit round/batch data columns.
          </p>
          <p className="subtitle subtitle-small">Last sync: {formatTime(lastSyncAt)}</p>
        </div>
        <button className="refresh" onClick={() => refresh(false)}>Refresh</button>
      </section>

      {error ? <p className="alert reveal">{error}</p> : null}

      <section className="grid reveal delay-1">
        <article className="card">
          <h2>Monitoring Status</h2>
          <p className={`pill ${monitoring ? 'pill-live' : 'pill-off'}`}>
            {monitoring ? 'Active' : 'Paused'}
          </p>
          <ul className="list">
            <li>Session: {overview?.deviceStatus?.monitoringSessionId || '--'}</li>
            <li>Current Round: {progress.currentRound ?? '--'}</li>
            <li>Completed Rounds: {progress.completedRounds ?? '--'}</li>
            <li>Device Reachable: {overview?.deviceReachable ? 'Yes' : 'No'}</li>
            <li>Current Reading Source: {overview?.currentRoundReadingSource || '--'}</li>
          </ul>

          <div className="action-row">
            <button
              className="btn btn-primary"
              onClick={() => command('monitor', 'on')}
              disabled={busyCommand.length > 0}
            >
              Start Monitoring
            </button>
            <button
              className="btn"
              onClick={() => command('monitor', 'off')}
              disabled={busyCommand.length > 0}
            >
              Stop Monitoring
            </button>
          </div>
        </article>

        <article className="card">
          <h2>Current Sensor Readings</h2>
          {helperText ? <p className="hint">{helperText}</p> : null}
          {currentRoundReading ? (
            <div className="metrics">
              {SENSOR_METRICS.map((metric) => (
                <div className="metric" key={metric.key}>
                  <span>{metric.label}</span>
                  <strong>{formatMetric(currentRoundReading[metric.key], metric.unit)}</strong>
                </div>
              ))}
            </div>
          ) : null}
        </article>

        <article className="card">
          <h2>Latest Finalized Batch</h2>
          {latestBatch ? (
            <>
              <p className="hint">Session: {latestBatch.monitoringSessionId} | Rounds: {latestBatch.roundsUsed}</p>
              <div className="metrics">
                {SENSOR_METRICS.map((metric) => (
                  <div className="metric" key={metric.key}>
                    <span>{metric.label}</span>
                    <strong>{formatMetric(latestBatch[metric.key], metric.unit)}</strong>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="hint">No finalized batch data has been stored yet.</p>
          )}
        </article>
      </section>

      <section className="card reveal delay-2">
        <h2>Quick Device Controls</h2>
        <div className="controls">
          {DEVICE_TARGETS.map((target) => (
            <div className="control" key={target.key}>
              <p>{target.label}</p>
              <div className="action-row">
                <button
                  className="btn btn-small btn-primary"
                  onClick={() => command(target.key, 'on')}
                  disabled={busyCommand.length > 0}
                >
                  ON
                </button>
                <button
                  className="btn btn-small"
                  onClick={() => command(target.key, 'off')}
                  disabled={busyCommand.length > 0}
                >
                  OFF
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-tables reveal delay-2">
        <DataTable
          title="Recent Finalized Batches"
          caption="Core columns for persisted finalized 10-round results."
          columns={BATCH_TABLE_COLUMNS}
          rows={batchRows}
        />
        <DataTable
          title="Round Records"
          caption="Per-round records (only when live latestRound payload is available from device)."
          columns={ROUND_TABLE_COLUMNS}
          rows={roundRows}
        />
      </section>
    </main>
  );
}

export default App;
