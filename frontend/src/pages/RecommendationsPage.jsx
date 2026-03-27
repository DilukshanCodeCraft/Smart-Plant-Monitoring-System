import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { SectionCard } from '../components/SectionCard';

function PriorityPill({ value }) {
  return <span className={`tag tag--priority tag--${value}`}>{value}</span>;
}

export default function RecommendationsPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getRecommendations({ status: 'active', limit: 100 });
      setItems(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      load();
    }, 12000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  async function dismiss(id) {
    await api.dismissRecommendation(id);
    load();
  }

  return (
    <main className="app-shell">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Recommendation Center</h1>
            <p className="page-subtitle">Rule-based care advice with reasons you can inspect.</p>
          </div>
        </div>

        {loading && <div className="loading-banner">Loading recommendations…</div>}
        {error && <div className="alert-banner alert-banner--error">{error}</div>}

        {!loading && items.length === 0 && (
          <div className="empty-state compact-empty">
            <div className="empty-state__icon">✨</div>
            <h2>No active recommendations</h2>
            <p>Your current readings do not need any action right now.</p>
          </div>
        )}

        <div className="recommendation-grid">
          {items.map((rec) => (
            <SectionCard key={rec._id} title={rec.title} className="recommendation-card">
              <div className="recommendation-card__header">
                <PriorityPill value={rec.priority} />
                <span className="tag tag--secondary">{rec.type.replace('_', ' ')}</span>
              </div>
              <p className="recommendation-card__explanation">{rec.explanation}</p>
              {rec.suggestedAction && (
                <div className="recommendation-action-block">
                  <strong>Suggested action</strong>
                  <p>{rec.suggestedAction}</p>
                </div>
              )}
              {rec.linkedMetrics && (
                <div className="chip-row">
                  {Object.entries(rec.linkedMetrics).map(([key, value]) => (
                    <span key={key} className="chip">{key}: {String(value)}</span>
                  ))}
                </div>
              )}
              <div className="recommendation-card__actions">
                <button className="btn btn--ghost btn--sm" onClick={() => dismiss(rec._id)}>Dismiss</button>
                {rec.linkedKBA && <Link className="btn btn--ghost btn--sm" to={`/kba/${rec.linkedKBA}`}>Related KBA</Link>}
              </div>
            </SectionCard>
          ))}
        </div>
      </div>
    </main>
  );
}
