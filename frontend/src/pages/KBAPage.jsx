import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { SectionCard } from '../components/SectionCard';

export default function KBAPage() {
  const navigate = useNavigate();
  const { slug } = useParams();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [articles, setArticles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [fullArticle, setFullArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function load(preferredSlug = slug) {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getKBAArticles({ q: query || undefined, category: category || undefined });
      const nextArticles = res.data || [];
      setArticles(nextArticles);

      if (nextArticles.length === 0) {
        setSelected(null);
        setFullArticle(null);
        return;
      }

      if (preferredSlug && nextArticles.some((article) => article.slug === preferredSlug)) {
        setSelected(preferredSlug);
      } else if (selected && nextArticles.some((article) => article.slug === selected)) {
        setSelected(selected);
      } else {
        setSelected(nextArticles[0].slug);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [slug]);

  async function openArticle(slug) {
    setSelected(slug);
    navigate(`/kba/${slug}`);
  }

  const selectedArticleMeta = articles.find((a) => a.slug === selected) || null;

  useEffect(() => {
    let mounted = true;
    async function fetchSelected() {
      if (!selected) {
        if (mounted) setFullArticle(null);
        return;
      }
      try {
        const res = await api.getKBAArticle(selected);
        if (mounted) setFullArticle(res.data || null);
      } catch (err) {
        if (mounted) setFullArticle(null);
      }
    }
    fetchSelected();
    return () => { mounted = false; };
  }, [selected]);

  return (
    <main className="app-shell">
      <div className="page-container kba-layout">
        <div className="page-header">
          <div>
            <h1 className="page-title">Knowledge Base</h1>
            <p className="page-subtitle">Troubleshooting guides, sensor explanations, and care help.</p>
          </div>
        </div>

        <div className="kba-toolbar">
          <input
            className="kba-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search articles…"
          />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="kba-select">
            <option value="">All categories</option>
            <option value="plant_care">Plant care</option>
            <option value="sensor_guide">Sensor guide</option>
            <option value="troubleshooting">Troubleshooting</option>
            <option value="actuator_guide">Actuator guide</option>
            <option value="insect_guide">Insect guide</option>
            <option value="seasonal_care">Seasonal care</option>
          </select>
          <button className="btn btn--ghost" onClick={load}>Search</button>
        </div>

        {loading && <div className="loading-banner">Loading articles…</div>}
        {error && <div className="alert-banner alert-banner--error">{error}</div>}

        <div className="kba-grid">
          <SectionCard title="Articles" className="kba-list-panel">
            <div className="kba-list">
              {articles.map((article) => (
                <button
                  key={article.slug}
                  className={`kba-list-item ${selected === article.slug ? 'kba-list-item--active' : ''}`}
                  onClick={() => openArticle(article.slug)}
                >
                  <strong>{article.title}</strong>
                  <span>{article.summary}</span>
                </button>
              ))}
              {!loading && articles.length === 0 && <p className="empty-inline">No articles found.</p>}
            </div>
          </SectionCard>

          <SectionCard title={fullArticle?.title || selectedArticleMeta?.title || 'Article'} className="kba-article-panel">
            {fullArticle ? (
              <article className="kba-article">
                <p className="kba-article__summary">{fullArticle.summary}</p>
                <div className="chip-row">
                  <span className="chip">{fullArticle.category.replace('_', ' ')}</span>
                  {fullArticle.tags?.map((tag) => <span key={tag} className="chip">{tag}</span>)}
                </div>
                <pre className="kba-content">{fullArticle.content}</pre>
              </article>
            ) : (
              <p className="empty-inline">Select an article to read.</p>
            )}
          </SectionCard>
        </div>
      </div>
    </main>
  );
}
