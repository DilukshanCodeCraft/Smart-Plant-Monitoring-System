import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { SectionCard } from '../components/SectionCard';

export default function AlertsPage() {
  const [alerts, setAlerts] = useState([]);
  const [status, setStatus] = useState('active');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showPopup, setShowPopup] = useState(false);
  const [popupContent, setPopupContent] = useState(null);

  async function load(nextStatus = status) {
    setLoading(true);
    setError(null);
    try {
      // Re-evaluate latest reading to ensure live state is captured in Alert Center
      if (nextStatus === 'active') {
        await api.reevaluateLatestReading().catch(() => {});
      }

      const res = await api.getAlerts({ status: nextStatus, limit: 100 });
      const currentAlerts = res.data || [];
      setAlerts(currentAlerts);

      // Specific check for the user-requested combined alert
      if (nextStatus === 'active') {
        const specialAlert = currentAlerts.find(a => a.description.includes('Water the plants as soil moisture is low'));
        if (specialAlert) {
          setPopupContent(specialAlert);
          setShowPopup(true);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      load(status);
    }, 12000);

    return () => {
      clearInterval(intervalId);
    };
  }, [status]);

  async function handleAck(id) {
    await api.acknowledgeAlert(id);
    load();
  }

  async function handleResolve(id) {
    await api.resolveAlert(id);
    load();
    if (popupContent && popupContent._id === id) {
      setShowPopup(false);
    }
  }

  function switchStatus(next) {
    setStatus(next);
    load(next);
  }

  return (
    <main className="app-shell">
      {showPopup && popupContent && (
        <div className="alert-popup-overlay">
          <div className="alert-popup-box">
            <div className="alert-popup-icon">⚠️</div>
            <div className="alert-popup-main">
              <h3>{popupContent.title}</h3>
              <p>{popupContent.description.trim()}</p>
              <div className="alert-popup-footer">
                <button className="btn btn--primary" onClick={() => handleResolve(popupContent._id)}>Record & Resolve</button>
                <button className="btn btn--ghost" onClick={() => setShowPopup(false)}>Dismiss</button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Alerts Center</h1>
            <p className="page-subtitle">Current warnings and issues translated into clear language.</p>
          </div>
          <div className="filter-tabs">
            {['active', 'acknowledged', 'resolved'].map((tab) => (
              <button
                key={tab}
                className={`filter-tab ${status === tab ? 'filter-tab--active' : ''}`}
                onClick={() => switchStatus(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {loading && <div className="loading-banner">Loading alerts…</div>}
        {error && <div className="alert-banner alert-banner--error">{error}</div>}

        {!loading && alerts.length === 0 && (
          <div className="empty-state compact-empty">
            <div className="empty-state__icon">🛡️</div>
            <h2>No {status} alerts</h2>
            <p>The system is quiet right now.</p>
          </div>
        )}

        <div className="alerts-list">
          {alerts.map((alert) => (
            <SectionCard key={alert._id} title={alert.title} className={`alert-card alert-card--${alert.severity}`}>
              <div className="alert-card__meta">
                <span className={`tag tag--severity tag--${alert.severity}`}>{alert.severity}</span>
                <span className="tag tag--secondary">{alert.sourceType.replace('_', ' ')}</span>
                <span className="tag">{new Date(alert.createdAt).toLocaleString()}</span>
              </div>
              <p className="alert-card__description">{alert.description.trim()}</p>
              {alert.linkedMetrics && (
                <div className="chip-row">
                  {Object.entries(alert.linkedMetrics).map(([key, value]) => (
                    <span key={key} className="chip">{key}: {String(value)}</span>
                  ))}
                </div>
              )}
              <div className="alert-card__actions">
                {status === 'active' && <button className="btn btn--ghost btn--sm" onClick={() => handleAck(alert._id)}>Acknowledge</button>}
                {status !== 'resolved' && <button className="btn btn--primary btn--sm" onClick={() => handleResolve(alert._id)}>Resolve</button>}
                {alert.linkedKBA && <Link className="btn btn--ghost btn--sm" to={`/kba/${alert.linkedKBA}`}>Read KBA</Link>}
              </div>
            </SectionCard>
          ))}
        </div>
      </div>
    </main>
  );
}
