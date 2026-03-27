import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { SectionCard } from '../components/SectionCard';

const ENTRY_TYPES = [
  { value: 'note', label: 'Note only' },
  { value: 'watered', label: 'Watered' },
  { value: 'fertilized', label: 'Fertilized' },
  { value: 'pesticide_applied', label: 'Pesticide applied' },
  { value: 'repotted', label: 'Repotted' },
  { value: 'pruned', label: 'Pruned' },
  { value: 'moved', label: 'Moved location' },
  { value: 'insect_observation', label: 'Insect observation' },
  { value: 'photo', label: 'Photo update' }
];

export default function JournalPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    entryType: 'note',
    note: '',
    imageUrl: ''
  });

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getJournal({ limit: 50 });
      setEntries(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.note.trim() && !form.imageUrl.trim()) {
      setError('Add a note or an image URL.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await api.createJournalEntry({
        entryType: form.entryType,
        note: form.note || null,
        imageUrls: form.imageUrl ? [form.imageUrl] : []
      });
      setForm({ entryType: 'note', note: '', imageUrl: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm('Delete this journal entry?')) return;
    await api.deleteJournalEntry(id);
    load();
  }

  return (
    <main className="app-shell">
      <div className="page-container journal-layout">
        <div className="page-header">
          <div>
            <h1 className="page-title">Plant Journal</h1>
            <p className="page-subtitle">Chronological timeline of care events, notes, and observations.</p>
          </div>
        </div>

        {error && <div className="alert-banner alert-banner--error">{error}</div>}

        <SectionCard title="Add Timeline Entry" className="journal-form-panel">
          <form className="journal-form" onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-field">
                <label>Entry type</label>
                <select value={form.entryType} onChange={(e) => setField('entryType', e.target.value)}>
                  {ENTRY_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Image URL (optional)</label>
                <input type="url" value={form.imageUrl} onChange={(e) => setField('imageUrl', e.target.value)} placeholder="https://…" />
              </div>
            </div>
            <div className="form-field">
              <label>Note</label>
              <textarea rows={4} value={form.note} onChange={(e) => setField('note', e.target.value)} placeholder="What changed today?" />
            </div>
            <div className="journal-form__actions">
              <button className="btn btn--primary" type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Add to timeline'}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard title="Timeline" className="timeline-panel">
          {loading ? (
            <div className="loading-banner">Loading journal…</div>
          ) : entries.length === 0 ? (
            <div className="empty-state compact-empty">
              <div className="empty-state__icon">📓</div>
              <h2>No journal entries yet</h2>
              <p>Record watering, photos, or observations to build a care history.</p>
            </div>
          ) : (
            <div className="timeline-list timeline-list--full">
              {entries.map((entry) => (
                <div className="timeline-item timeline-item--card" key={entry._id}>
                  <div className="timeline-item__dot" />
                  <div className="timeline-item__content">
                    <div className="timeline-item__meta">
                      <strong>{entry.entryType.replaceAll('_', ' ')}</strong>
                      <span>{new Date(entry.createdAt).toLocaleString()}</span>
                    </div>
                    {entry.note && <p>{entry.note}</p>}
                    {entry.imageUrls?.length > 0 && (
                      <div className="journal-image-strip">
                        {entry.imageUrls.map((url) => (
                          <a key={url} href={url} target="_blank" rel="noreferrer" className="journal-image-pill">View image</a>
                        ))}
                      </div>
                    )}
                    <div className="timeline-item__actions">
                      <button className="btn btn--ghost btn--sm" onClick={() => remove(entry._id)}>Delete</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </main>
  );
}
