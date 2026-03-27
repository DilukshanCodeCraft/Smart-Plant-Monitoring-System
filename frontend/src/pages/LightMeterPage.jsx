import { useState } from 'react';
import toast from 'react-hot-toast';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ActionButton } from '../components/ActionButton';
import CameraCapture from '../components/CameraCapture';
import { SectionCard } from '../components/SectionCard';
import { analyzePlantLight } from '../lib/geminiService';
import { readBlobAsDataUrl, splitDataUrl } from '../lib/mediaHelpers';

const SPECTRAL_COLORS = ['#437f98', '#5e7f4c', '#d8932f', '#b75f23'];

function getSuitabilityTone(score) {
  if (score >= 80) {
    return 'mint';
  }

  if (score >= 55) {
    return 'sky';
  }

  if (score >= 30) {
    return 'sun';
  }

  return 'amber';
}

function getSourceIcon(source) {
  if (source === 'Natural') {
    return 'Sun';
  }

  if (source === 'Artificial') {
    return 'Lamp';
  }

  if (source === 'Mixed') {
    return 'Blend';
  }

  return 'Unknown';
}

function LightMeterPage() {
  const [loading, setLoading] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [previewDataUrl, setPreviewDataUrl] = useState('');
  const [result, setResult] = useState(null);
  const [selectedPlant, setSelectedPlant] = useState('');

  async function analyzeScene(dataUrl) {
    setPreviewDataUrl(dataUrl);
    setLoading(true);

    try {
      const { base64, mimeType } = splitDataUrl(dataUrl);
      const nextResult = await analyzePlantLight(base64, mimeType);
      const [firstPlant] = Object.keys(nextResult.library_matches || {});

      setResult(nextResult);
      setSelectedPlant(firstPlant || '');
    } catch (analysisError) {
      const message = analysisError instanceof Error ? analysisError.message : 'Light analysis failed.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel hero-panel--analytics">
        <div>
          <span className="hero-panel__eyebrow">AI light lab</span>
          <h1>Plant light meter</h1>
          <p>
            Capture the plant environment and let Gemini estimate source type, spectral balance, suitability score, and a
            practical optimization plan for the current lighting setup.
          </p>
          <div className="control-cluster">
            <ActionButton tone="mint" onClick={() => setShowCamera(true)}>
              Take Photo
            </ActionButton>
            <label className="action-button action-button--sky light-upload-button">
              <span>Upload Scene</span>
              <input
                type="file"
                accept="image/*"
                className="media-input-hidden"
                onChange={async (event) => {
                  const file = event.target.files?.[0];

                  if (!file) {
                    return;
                  }

                  const dataUrl = await readBlobAsDataUrl(file);
                  analyzeScene(dataUrl);
                }}
              />
            </label>
          </div>
        </div>

        <div className="hero-panel__status-cluster">
          <span className={`status-chip status-chip--${result ? getSuitabilityTone(result.score) : 'idle'}`}>
            <span className="status-chip__dot" />
            {result ? `${result.score}% suitability` : 'Awaiting scene'}
          </span>
          <span className="status-chip status-chip--reachable">
            <span className="status-chip__dot" />
            {result ? result.source : 'Source unknown'}
          </span>
        </div>
      </section>

      {showCamera ? <CameraCapture onCapture={analyzeScene} onClose={() => setShowCamera(false)} /> : null}

      <div className="section-grid section-grid--two-up">
        <SectionCard eyebrow="Scene" title="Captured frame">
          {previewDataUrl ? (
            <img src={previewDataUrl} alt="Scene preview" className="analysis-image" />
          ) : (
            <div className="empty-panel">
              <strong>No scene captured</strong>
              <span>Use the camera or upload a photo of the plant under its current light.</span>
            </div>
          )}
        </SectionCard>

        <SectionCard eyebrow="Status" title="Suitability overview">
          {loading ? <p className="loading-banner">Running light analysis...</p> : null}
          {!loading && !result ? (
            <div className="empty-panel">
              <strong>No analysis yet</strong>
              <span>Submit an image to estimate plant-light compatibility.</span>
            </div>
          ) : null}
          {!loading && result ? (
            <div className={`light-summary-card light-summary-card--${getSuitabilityTone(result.score)}`}>
              <span className="light-summary-card__eyebrow">Analyzed environment</span>
              <h3>{result.suitability_label}</h3>
              <strong>{result.score}% suitability score</strong>
              <p>{result.summary}</p>
              <div className="light-source-card">
                <span className="light-source-card__icon">{getSourceIcon(result.source)}</span>
                <div>
                  <strong>{result.source}</strong>
                  <span>{result.source_desc}</span>
                </div>
              </div>
            </div>
          ) : null}
        </SectionCard>
      </div>

      {result ? (
        <div className="section-grid section-grid--two-up">
          <SectionCard eyebrow="Spectrum" title="Relative spectral breakdown">
            <div className="light-chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={Object.entries(result.spectral).map(([name, value]) => ({ name, value }))}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#d8e3d6" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#4f6356' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#4f6356' }} axisLine={false} tickLine={false} width={36} />
                  <Tooltip cursor={{ fill: 'rgba(47, 138, 98, 0.08)' }} />
                  <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                    {Object.keys(result.spectral).map((entry, index) => (
                      <Cell key={entry} fill={SPECTRAL_COLORS[index % SPECTRAL_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="helper-copy helper-copy--block">Estimated relative quantum efficiency across the visible bands.</p>
          </SectionCard>

          <SectionCard eyebrow="Metrics" title="Light metrics and risks">
            <div className="diagnostic-metric-grid">
              <div className="diagnostic-metric">
                <span>PPFD</span>
                <strong>{result.ppfd}</strong>
              </div>
              <div className="diagnostic-metric">
                <span>DLI</span>
                <strong>{result.dli}</strong>
              </div>
              <div className="diagnostic-metric">
                <span>R:B ratio</span>
                <strong>{result.rb_ratio}</strong>
              </div>
              <div className="diagnostic-metric">
                <span>R:Far-Red</span>
                <strong>{result.rfr_status}</strong>
              </div>
            </div>

            <div className="optimization-list">
              <h3>Optimization steps</h3>
              {result.optimization.map((step, index) => (
                <div key={`${step}-${index}`} className="optimization-item">
                  <span>{index + 1}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>

            <p className="helper-copy helper-copy--block">Hazards: {result.hazards || 'None reported'}</p>
          </SectionCard>
        </div>
      ) : null}

      {result ? (
        <div className="section-grid">
          <SectionCard eyebrow="Compatibility" title="Plant match library">
            <div className="compatibility-panel">
              <label className="compatibility-panel__label">
                Pick a reference plant
                <select value={selectedPlant} onChange={(event) => setSelectedPlant(event.target.value)}>
                  {Object.keys(result.library_matches).map((plant) => (
                    <option key={plant} value={plant}>
                      {plant}
                    </option>
                  ))}
                </select>
              </label>

              {selectedPlant ? (
                <div className="compatibility-panel__bar">
                  <div>
                    <strong>{selectedPlant}</strong>
                    <span>{result.library_matches[selectedPlant]}% match</span>
                  </div>
                  <div className="compatibility-panel__track">
                    <span style={{ width: `${result.library_matches[selectedPlant]}%` }} />
                  </div>
                </div>
              ) : null}
            </div>
          </SectionCard>
        </div>
      ) : null}
    </main>
  );
}

export default LightMeterPage;