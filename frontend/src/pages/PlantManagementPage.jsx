import { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { SectionCard } from '../components/SectionCard';

const EMPTY_FORM = {
  name: '',
  species: '',
  scientificName: '',
  roomOrArea: '',
  notes: '',
  potMaterial: '',
  potSize: '',
  toxicityFlag: false,
  deviceId: ''
};

export default function PlantManagementPage() {
  const [plants, setPlants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPlants();
      setPlants(res.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function openAdd() {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowForm(true);
  }

  function openEdit(plant) {
    setEditTarget(plant._id);
    setForm({
      name: plant.name || '',
      species: plant.species || '',
      scientificName: plant.scientificName || '',
      roomOrArea: plant.roomOrArea || '',
      notes: plant.notes || '',
      potMaterial: plant.potMaterial || '',
      potSize: plant.potSize || '',
      toxicityFlag: plant.toxicityFlag || false,
      deviceId: plant.deviceId || ''
    });
    setFormError(null);
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditTarget(null);
    setFormError(null);
  }

  function setField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Plant name is required.'); return; }
    if (!form.deviceId.trim()) { setFormError('Device ID is required.'); return; }
    setSaving(true);
    setFormError(null);
    try {
      if (editTarget) {
        await api.updatePlant(editTarget, form);
      } else {
        await api.createPlant(form);
      }
      closeForm();
      load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleArchive(id) {
    if (!confirm('Archive this plant? It will be hidden from the list.')) return;
    try {
      await api.archivePlant(id);
      load();
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <main className="app-shell">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Plant Management</h1>
            <p className="page-subtitle">Add and manage your monitored plants.</p>
          </div>
          <button className="btn btn--primary" onClick={openAdd}>+ Add Plant</button>
        </div>

        {error && <div className="alert-banner alert-banner--error">{error}</div>}

        {loading ? (
          <div className="loading-banner">Loading plants…</div>
        ) : plants.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">🌱</div>
            <h2>No plants yet</h2>
            <p>Add your first plant to start monitoring it.</p>
            <button className="btn btn--primary" onClick={openAdd}>Add Your First Plant</button>
          </div>
        ) : (
          <div className="plants-grid">
            {plants.map((plant) => (
              <SectionCard key={plant._id} title={plant.name} className="plant-card">
                <div className="plant-card__meta">
                  {plant.species && <span className="tag">{plant.species}</span>}
                  {plant.roomOrArea && <span className="tag tag--secondary">{plant.roomOrArea}</span>}
                  {plant.toxicityFlag && <span className="tag tag--warning">Toxic</span>}
                </div>
                <div className="plant-card__fields">
                  <div className="field-row"><label>Device ID</label><span>{plant.deviceId}</span></div>
                  {plant.scientificName && (
                    <div className="field-row"><label>Scientific</label><em>{plant.scientificName}</em></div>
                  )}
                  {plant.potMaterial && (
                    <div className="field-row"><label>Pot</label><span>{plant.potMaterial}{plant.potSize ? ` • ${plant.potSize}` : ''}</span></div>
                  )}
                  {plant.notes && (
                    <div className="field-row field-row--full"><label>Notes</label><span>{plant.notes}</span></div>
                  )}
                </div>
                <div className="plant-card__actions">
                  <button className="btn btn--ghost btn--sm" onClick={() => openEdit(plant)}>Edit</button>
                  <button className="btn btn--danger btn--sm" onClick={() => handleArchive(plant._id)}>Archive</button>
                </div>
              </SectionCard>
            ))}
          </div>
        )}

        {showForm && (
          <div className="modal-overlay" onClick={closeForm}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal__header">
                <h2>{editTarget ? 'Edit Plant' : 'Add Plant'}</h2>
                <button className="modal__close" onClick={closeForm}>✕</button>
              </div>
              <form className="modal__body plant-form" onSubmit={handleSubmit}>
                <div className="form-field form-field--required">
                  <label>Plant name *</label>
                  <input type="text" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="e.g. My Monstera" />
                </div>
                <div className="form-field form-field--required">
                  <label>Device ID *</label>
                  <input type="text" value={form.deviceId} onChange={(e) => setField('deviceId', e.target.value)} placeholder="e.g. esp32-a1b2" />
                </div>
                <div className="form-row">
                  <div className="form-field">
                    <label>Common species</label>
                    <input type="text" value={form.species} onChange={(e) => setField('species', e.target.value)} placeholder="e.g. Monstera deliciosa" />
                  </div>
                  <div className="form-field">
                    <label>Scientific name</label>
                    <input type="text" value={form.scientificName} onChange={(e) => setField('scientificName', e.target.value)} />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-field">
                    <label>Room / Area</label>
                    <input type="text" value={form.roomOrArea} onChange={(e) => setField('roomOrArea', e.target.value)} placeholder="e.g. Living room" />
                  </div>
                  <div className="form-field">
                    <label>Pot material</label>
                    <input type="text" value={form.potMaterial} onChange={(e) => setField('potMaterial', e.target.value)} placeholder="e.g. Terracotta" />
                  </div>
                </div>
                <div className="form-row">
                  <div className="form-field">
                    <label>Pot size</label>
                    <input type="text" value={form.potSize} onChange={(e) => setField('potSize', e.target.value)} placeholder="e.g. 25cm" />
                  </div>
                  <div className="form-field form-field--checkbox">
                    <label>
                      <input type="checkbox" checked={form.toxicityFlag} onChange={(e) => setField('toxicityFlag', e.target.checked)} />
                      <span>Toxic to pets / children</span>
                    </label>
                  </div>
                </div>
                <div className="form-field">
                  <label>Notes</label>
                  <textarea value={form.notes} onChange={(e) => setField('notes', e.target.value)} rows={3} placeholder="Any additional notes…" />
                </div>
                {formError && <p className="form-error">{formError}</p>}
                <div className="modal__footer">
                  <button type="button" className="btn btn--ghost" onClick={closeForm}>Cancel</button>
                  <button type="submit" className="btn btn--primary" disabled={saving}>
                    {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Plant'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
