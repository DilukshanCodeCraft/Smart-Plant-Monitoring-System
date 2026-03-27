import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ActionButton } from '../components/ActionButton';
import CameraCapture from '../components/CameraCapture';
import { SectionCard } from '../components/SectionCard';
import { api } from '../lib/api';
import { dataUrlToFile, formatBytes, formatTimeOfDay, groupFilesByDay } from '../lib/mediaHelpers';

function GrowthPage() {
  const [cameraRoll, setCameraRoll] = useState([]);
  const [folder, setFolder] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [savingCapture, setSavingCapture] = useState(false);

  const groupedFiles = useMemo(() => groupFilesByDay(cameraRoll), [cameraRoll]);
  const imageCount = cameraRoll.filter((item) => item.type === 'image').length;
  const videoCount = cameraRoll.filter((item) => item.type === 'video').length;

  async function loadCameraRoll() {
    setLoading(true);
    setError('');

    try {
      const payload = await api.getCameraRoll({
        category: 'daily_tracking'
      });

      setCameraRoll(Array.isArray(payload.files) ? payload.files : []);
      setFolder(payload.folder || '');
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : 'Failed to read daily tracking folder.';
      setCameraRoll([]);
      setFolder('');
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDailyCapture(dataUrl, captureMeta) {
    setSavingCapture(true);

    try {
      const file = captureMeta?.file || await dataUrlToFile(dataUrl, `daily-tracking-${Date.now()}.jpg`);

      await api.uploadCameraMedia({
        file,
        category: 'daily_tracking',
        source: 'usb_camera',
        context: 'growth_tracking'
      });

      await loadCameraRoll();
      toast.success('Daily photo captured and saved to app folder.');
    } catch (captureError) {
      const message = captureError instanceof Error ? captureError.message : 'Failed to save daily tracking photo.';
      toast.error(message);
    } finally {
      setSavingCapture(false);
    }
  }

  useEffect(() => {
    loadCameraRoll();
  }, []);

  return (
    <main className="app-shell">
      <section className="hero-panel hero-panel--analytics">
        <div>
          <span className="hero-panel__eyebrow">Monitoring archive</span>
          <h1>Daily growth diary</h1>
          <p>
            Capture daily plant photos with your USB camera and review all saved files from the app folder grouped by day.
            Use this to compare growth, canopy shape, and visible changes over time.
          </p>
          <div className="control-cluster">
            <ActionButton tone="mint" onClick={() => setShowCamera(true)} disabled={savingCapture}>
              {savingCapture ? 'Saving Photo...' : 'Capture Daily Photo'}
            </ActionButton>
            <ActionButton tone="sky" onClick={loadCameraRoll} busy={loading}>
              Refresh Diary
            </ActionButton>
          </div>
          {folder ? <p className="helper-copy helper-copy--block">App folder: {folder}</p> : null}
        </div>

        <div className="hero-panel__status-cluster">
          <span className="status-chip status-chip--live">
            <span className="status-chip__dot" />
            {cameraRoll.length} files indexed
          </span>
          <span className="status-chip status-chip--reachable">
            <span className="status-chip__dot" />
            {imageCount} photos
          </span>
          <span className="status-chip status-chip--warn">
            <span className="status-chip__dot" />
            {videoCount} videos
          </span>
          <span className={`status-chip ${savingCapture ? 'status-chip--reachable' : 'status-chip--idle'}`}>
            <span className="status-chip__dot" />
            {savingCapture ? 'Saving capture' : 'USB camera ready'}
          </span>
        </div>
      </section>

      <div className="section-grid">
        <SectionCard
          eyebrow="Timeline"
          title="Daily capture stream"
          actions={(
            <span className="meta-pill meta-pill--neutral">
              {groupedFiles.length} day{groupedFiles.length === 1 ? '' : 's'}
            </span>
          )}
        >
          {loading ? <p className="loading-banner">Scanning daily tracking folder...</p> : null}
          {!loading && error ? <p className="warning-text">{error}</p> : null}
          {!loading && !error && cameraRoll.length === 0 ? (
            <p className="empty-state">No photos or videos were found in the daily-tracking app folder.</p>
          ) : null}

          {!loading && !error ? (
            <div className="timeline-stack">
              {groupedFiles.map((group) => (
                <section key={group.key} className="timeline-day">
                  <header className="timeline-day__header">
                    <div>
                      <span className="section-card__eyebrow">Day bucket</span>
                      <h3>{group.label}</h3>
                    </div>
                    <span className="meta-pill meta-pill--mint">{group.items.length} captures</span>
                  </header>

                  <div className="timeline-day__rail">
                    {group.items.map((item) => (
                      <button key={`${group.key}-${item.name}`} type="button" className="media-thumb" onClick={() => setSelectedItem(item)}>
                        <div className="media-thumb__preview">
                          {item.type === 'image' ? (
                            <img src={item.url} alt={item.name} loading="lazy" />
                          ) : (
                            <video src={item.url} muted playsInline preload="metadata" />
                          )}
                          <span className={`media-thumb__type media-thumb__type--${item.type}`}>{item.type}</span>
                        </div>
                        <div className="media-thumb__meta">
                          <strong>{item.name}</strong>
                          <span>
                            {formatTimeOfDay(item.mtime)} • {formatBytes(item.size)}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : null}
        </SectionCard>
      </div>

      {selectedItem ? (
        <div className="media-viewer" role="dialog" aria-modal="true" onClick={() => setSelectedItem(null)}>
          <div className="media-viewer__dialog" onClick={(event) => event.stopPropagation()}>
            <div className="media-viewer__header">
              <div>
                <span className="section-card__eyebrow">Focused capture</span>
                <h3>{selectedItem.name}</h3>
              </div>
              <button type="button" className="ghost-button" onClick={() => setSelectedItem(null)}>
                Close
              </button>
            </div>

            <div className="media-viewer__content">
              {selectedItem.type === 'image' ? (
                <img src={selectedItem.url} alt={selectedItem.name} className="media-viewer__image" />
              ) : (
                <video src={selectedItem.url} className="media-viewer__video" controls autoPlay />
              )}
            </div>

            <div className="media-viewer__details">
              <span>{new Date(selectedItem.mtime).toLocaleString()}</span>
              <span>{formatBytes(selectedItem.size)}</span>
            </div>
          </div>
        </div>
      ) : null}

      {showCamera ? (
        <CameraCapture
          onCapture={(dataUrl, captureMeta) => {
            void handleDailyCapture(dataUrl, captureMeta);
          }}
          onClose={() => setShowCamera(false)}
          captureLabel="Capture daily tracking photo"
          tipTitle="Daily tracking capture"
          tipDescription="Use the same angle every day to compare growth accurately."
        />
      ) : null}
    </main>
  );
}

export default GrowthPage;