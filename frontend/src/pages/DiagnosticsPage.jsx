import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { SectionCard } from '../components/SectionCard';

export default function DiagnosticsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getDiagnostics();
      setData(res.data || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <main className="app-shell">
      <div className="page-container diagnostics-layout">
        <div className="page-header">
          <div>
            <h1 className="page-title">Local Diagnostics</h1>
            <p className="page-subtitle">Heartbeat, recent commands, latest reading freshness, and connectivity state.</p>
          </div>
          <button className="btn btn--ghost" onClick={load}>Refresh</button>
        </div>

        {loading && <div className="loading-banner">Loading diagnostics…</div>}
        {error && <div className="alert-banner alert-banner--error">{error}</div>}

        {data && (
          <div className="diagnostics-grid">
            <SectionCard title="Device Status" className="diag-card">
              <div className="diag-stats">
                <div className="diag-stat"><label>Reachable</label><strong>{data.deviceStatus ? 'Yes' : 'No'}</strong></div>
                <div className="diag-stat"><label>Database</label><strong>{data.databaseAvailable ? 'Connected' : 'Unavailable'}</strong></div>
                <div className="diag-stat"><label>Last Reading</label><strong>{data.lastSensorReadingAt ? new Date(data.lastSensorReadingAt).toLocaleString() : '—'}</strong></div>
                <div className="diag-stat"><label>Device ID</label><strong>{data.lastSensorDeviceId || '—'}</strong></div>
                <div className="diag-stat"><label>Recent Failures (1h)</label><strong>{data.recentFailCount ?? '—'}</strong></div>
              </div>
              {data.deviceError && <p className="form-error">{data.deviceError}</p>}
              {!data.databaseAvailable && <p className="form-error">MongoDB is not connected, so history and reading diagnostics are temporarily unavailable.</p>}
              {data.deviceStatus && <pre className="json-preview">{JSON.stringify(data.deviceStatus, null, 2)}</pre>}
            </SectionCard>

            <SectionCard title="Recent Command History" className="diag-card">
              {data.recentCommands?.length ? (
                <div className="stack-list">
                  {data.recentCommands.map((log) => (
                    <div key={log._id} className="stack-item stack-item--diagnostic">
                      <div>
                        <strong>{log.actuatorName} → {log.state}</strong>
                        <p>{log.trigger} {log.ruleId ? `(${log.ruleId})` : '(manual)'}</p>
                      </div>
                      <small>{new Date(log.createdAt).toLocaleString()}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="empty-inline">No recent commands.</p>
              )}
            </SectionCard>
          </div>
        )}
      </div>
    </main>
  );
}
