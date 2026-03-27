import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { SectionCard } from '../components/SectionCard';

function Metric({ label, value, unit, tone }) {
  return (
    <div className={`detail-metric ${tone ? `detail-metric--${tone}` : ''}`}>
      <span className="detail-metric__label">{label}</span>
      <strong className="detail-metric__value">{value ?? '—'}{value != null && unit ? ` ${unit}` : ''}</strong>
    </div>
  );
}

export default function PlantDetailPage() {
  const [plant, setPlant] = useState(null);
  const [overview, setOverview] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [journal, setJournal] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const [plantsRes, overviewRes, alertsRes, recsRes, journalRes] = await Promise.all([
        api.getPlants(),
        api.getDashboardOverview(),
        api.getAlerts({ limit: 5 }),
        api.getRecommendations({ limit: 5 }),
        api.getJournal({ limit: 5 })
      ]);
      const firstPlant = plantsRes.data?.[0] || overviewRes.plant || null;
      setPlant(firstPlant || null);
      setOverview(overviewRes || null);
      setAlerts(alertsRes.data || []);
      setRecommendations(recsRes.data || []);
      setJournal(journalRes.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return <main className="app-shell"><div className="loading-banner">Loading plant detail…</div></main>;
  }

  if (error) {
    return <main className="app-shell"><div className="alert-banner alert-banner--error">{error}</div></main>;
  }

  const metrics = overview?.latestReading || {};

  return (
    <main className="app-shell">
      <div className="page-container plant-detail-layout">
        <header className="plant-hero">
          <div className="plant-hero__copy">
            <p className="eyebrow">Plant Detail</p>
            <h1 className="page-title">{plant?.name || 'Your Plant'}</h1>
            <p className="page-subtitle">
              {plant?.species || 'Species not set'}
              {plant?.roomOrArea ? ` • ${plant.roomOrArea}` : ''}
            </p>
          </div>
          <div className="plant-hero__badges">
            <span className="badge badge--status">Last sync: {overview?.deviceStatusObservedAt ? new Date(overview.deviceStatusObservedAt).toLocaleString() : '—'}</span>
            <span className={`badge ${overview?.deviceReachable ? 'badge--good' : 'badge--bad'}`}>{overview?.deviceReachable ? 'Device online' : 'Device offline'}</span>
          </div>
        </header>

        <div className="plant-detail-grid">
          <SectionCard title="Environmental Metrics" className="detail-panel detail-panel--metrics">
            <div className="detail-metrics-grid">
              <Metric label="Light" value={metrics.lux} unit="lux" tone={metrics.lux < 300 ? 'warning' : 'good'} />
              <Metric label="Humidity" value={metrics.humidity} unit="%" tone={metrics.humidity > 85 ? 'warning' : 'good'} />
              <Metric label="Air Temperature" value={metrics.airTempC} unit="°C" tone={metrics.airTempC > 32 ? 'warning' : 'good'} />
              <Metric label="Root Temperature" value={metrics.rootTempC} unit="°C" tone={metrics.rootTempC < 10 ? 'warning' : 'good'} />
              <Metric label="Air Quality" value={metrics.mqPPM} unit="PPM" tone={metrics.mqPPM > 500 ? 'warning' : 'good'} />
              <Metric label="Plant Weight" value={metrics.weightG} unit="g" />
              <Metric label="Soil Moisture" value={metrics.soilPercent} unit="%" tone={metrics.soilPercent < 30 ? 'warning' : 'good'} />
            </div>
          </SectionCard>

          <SectionCard title="Trend / Care Curve" className="detail-panel detail-panel--trend">
            <div className="trend-placeholder">
              <div className="trend-placeholder__graphic">
                <div className="trend-line trend-line--weight" />
                <div className="trend-line trend-line--temp" />
                <div className="trend-line trend-line--light" />
              </div>
              <p>Historical analytics already exist in the Analytics page. This panel anchors the plant-specific drill-down.</p>
              <Link className="btn btn--ghost" to="/analytics">Open Analytics</Link>
            </div>
          </SectionCard>

          <SectionCard title="Inspection & Insects" className="detail-panel detail-panel--inspection">
            <div className="inspection-summary">
              <p className="inspection-summary__status">Latest result: no insect observation linked yet.</p>
              <p className="inspection-summary__hint">The system distinguishes harmful, beneficial, non-harmful, and uncertain detections before recommending pesticide use.</p>
              <div className="inspection-summary__actions">
                <Link className="btn btn--primary" to="/arthropod">Run Arthropod Detector</Link>
                <Link className="btn btn--ghost" to="/insect">Open Insect Audio</Link>
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Current Alerts" className="detail-panel detail-panel--alerts">
            {alerts.length === 0 ? (
              <p className="empty-inline">No active alerts right now.</p>
            ) : (
              <div className="stack-list">
                {alerts.map((alert) => (
                  <div key={alert._id} className={`stack-item stack-item--${alert.severity}`}>
                    <div>
                      <strong>{alert.title}</strong>
                      <p>{alert.description}</p>
                    </div>
                    <span className="tag tag--severity">{alert.severity}</span>
                  </div>
                ))}
              </div>
            )}
            <Link className="btn btn--ghost" to="/alerts">View all alerts</Link>
          </SectionCard>

          <SectionCard title="Recommendations" className="detail-panel detail-panel--recommendations">
            {recommendations.length === 0 ? (
              <p className="empty-inline">No recommendations at the moment.</p>
            ) : (
              <div className="stack-list">
                {recommendations.map((rec) => (
                  <div key={rec._id} className="stack-item stack-item--recommendation">
                    <div>
                      <strong>{rec.title}</strong>
                      <p>{rec.explanation}</p>
                    </div>
                    <span className={`tag tag--priority tag--${rec.priority}`}>{rec.priority}</span>
                  </div>
                ))}
              </div>
            )}
            <Link className="btn btn--ghost" to="/recommendations">Open recommendation center</Link>
          </SectionCard>

          <SectionCard title="Recent Journal Entries" className="detail-panel detail-panel--journal">
            {journal.length === 0 ? (
              <p className="empty-inline">No timeline entries yet.</p>
            ) : (
              <div className="timeline-list">
                {journal.map((entry) => (
                  <div key={entry._id} className="timeline-item">
                    <div className="timeline-item__dot" />
                    <div>
                      <strong>{entry.entryType.replaceAll('_', ' ')}</strong>
                      <p>{entry.note || 'No note added.'}</p>
                      <small>{new Date(entry.createdAt).toLocaleString()}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Link className="btn btn--ghost" to="/journal">Open journal timeline</Link>
          </SectionCard>
        </div>
      </div>
    </main>
  );
}
