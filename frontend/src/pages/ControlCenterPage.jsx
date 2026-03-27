import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { SectionCard } from '../components/SectionCard';

const ACTUATORS = [
  { key: 'water', label: 'Water Pump', confirmOn: false },
  { key: 'fan', label: 'Fan', confirmOn: false },
  { key: 'light', label: 'Grow Light', confirmOn: false },
  { key: 'nutri', label: 'Nutrient Spray', confirmOn: true },
  { key: 'pest', label: 'Pesticide Spray', confirmOn: true }
];

export default function ControlCenterPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [commandBusy, setCommandBusy] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getActuatorLogs({ limit: 20 });
      setLogs(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function trigger(actuator, state, confirmOn) {
    if (confirmOn && state === 'on') {
      const ok = window.confirm(`Confirm ${actuator} ${state}? This action can affect your plant immediately.`);
      if (!ok) return;
    }

    setCommandBusy(`${actuator}:${state}`);
    setError(null);
    setMessage(null);
    try {
      await api.triggerActuator(actuator, state);
      setMessage(`${actuator} turned ${state} successfully.`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCommandBusy(null);
    }
  }

  return (
    <main className="app-shell">
      <div className="page-container control-center-layout">
        <div className="page-header">
          <div>
            <h1 className="page-title">Control Center</h1>
            <p className="page-subtitle">Manual override stays available even when automation is active.</p>
          </div>
        </div>

        {error && <div className="alert-banner alert-banner--error">{error}</div>}
        {message && <div className="alert-banner alert-banner--success">{message}</div>}

        <div className="control-grid">
          {ACTUATORS.map((actuator) => (
            <SectionCard key={actuator.key} title={actuator.label} className="control-card">
              <p className="control-card__copy">
                Manual trigger for {actuator.label.toLowerCase()}. Automated rules continue to run in the backend with cooldown and safety gates.
              </p>
              <div className="control-card__actions">
                <button
                  className="btn btn--primary"
                  onClick={() => trigger(actuator.key, 'on', actuator.confirmOn)}
                  disabled={commandBusy !== null}
                >
                  {commandBusy === `${actuator.key}:on` ? 'Sending…' : 'Turn On'}
                </button>
                <button
                  className="btn btn--ghost"
                  onClick={() => trigger(actuator.key, 'off', false)}
                  disabled={commandBusy !== null}
                >
                  {commandBusy === `${actuator.key}:off` ? 'Sending…' : 'Turn Off'}
                </button>
              </div>
            </SectionCard>
          ))}
        </div>

        <SectionCard title="Recent Command Log" className="log-panel">
          {loading ? (
            <div className="loading-banner">Loading command log…</div>
          ) : logs.length === 0 ? (
            <p className="empty-inline">No commands have been sent yet.</p>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Actuator</th>
                    <th>State</th>
                    <th>Trigger</th>
                    <th>Rule</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log._id}>
                      <td>{new Date(log.createdAt).toLocaleString()}</td>
                      <td>{log.actuatorName}</td>
                      <td>{log.state}</td>
                      <td>{log.trigger}</td>
                      <td>{log.ruleId || '—'}</td>
                      <td>
                        <span className={`tag ${log.success ? 'tag--success' : 'tag--warning'}`}>
                          {log.success ? 'ok' : 'failed'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
