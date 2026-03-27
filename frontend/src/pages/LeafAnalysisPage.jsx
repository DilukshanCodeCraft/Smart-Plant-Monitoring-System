import { useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ActionButton } from '../components/ActionButton';
import CameraCapture from '../components/CameraCapture';
import { SectionCard } from '../components/SectionCard';
import { api } from '../lib/api';
import { analyzeLeafDamage } from '../lib/geminiService';
import { dataUrlToFile, readBlobAsDataUrl, splitDataUrl } from '../lib/mediaHelpers';

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

function LeafAnalysisPage() {
  const fileInputRef = useRef(null);
  const [previewDataUrl, setPreviewDataUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [result, setResult] = useState(null);
  const [savingCapture, setSavingCapture] = useState(false);

  async function saveLeafCapture(file, source) {
    if (!file) {
      return;
    }

    setSavingCapture(true);

    try {
      await api.uploadCameraMedia({
        file,
        category: 'leaf_damage',
        source,
        context: 'leaf_analysis'
      });
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Failed to save captured leaf image.';
      toast.error(`Leaf image was captured but not saved to app folder: ${message}`);
    } finally {
      setSavingCapture(false);
    }
  }

  async function loadImageFile(file) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file.');
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      toast.error('Image size must be less than 10 MB.');
      return;
    }

    const dataUrl = await readBlobAsDataUrl(file);
    setPreviewDataUrl(dataUrl);
    setResult(null);
    void saveLeafCapture(file, 'file_upload');
  }

  async function handleAnalyze() {
    if (!previewDataUrl) {
      toast.error('Select or capture a leaf image first.');
      return;
    }

    setLoading(true);

    try {
      const { base64, mimeType } = splitDataUrl(previewDataUrl);
      const diagnosis = await analyzeLeafDamage(base64, mimeType);
      setResult(diagnosis);
    } catch (analysisError) {
      const message = analysisError instanceof Error ? analysisError.message : 'Leaf analysis failed.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  function clearSelection() {
    setPreviewDataUrl('');
    setResult(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel hero-panel--analytics">
        <div>
          <span className="hero-panel__eyebrow">AI diagnosis</span>
          <h1>Leaf damage classifier</h1>
          <p>
            Upload or capture a leaf photo and Gemini will classify the primary visible issue into nutrient stress, water
            stress, insect bite, disease, or excess sunlight.
          </p>
          <div className="control-cluster">
            <ActionButton tone="mint" onClick={() => fileInputRef.current?.click()}>
              Upload Leaf Photo
            </ActionButton>
            <ActionButton tone="sun" onClick={() => setShowCamera(true)}>
              Use Camera
            </ActionButton>
            <ActionButton tone="sky" onClick={handleAnalyze} busy={loading} disabled={!previewDataUrl}>
              Analyze Leaf
            </ActionButton>
            <ActionButton tone="neutral" onClick={clearSelection} disabled={!previewDataUrl && !result}>
              Clear
            </ActionButton>
          </div>
        </div>

        <div className="hero-panel__status-cluster">
          <span className="status-chip status-chip--reachable">
            <span className="status-chip__dot" />
            5 damage categories
          </span>
          <span className={`status-chip ${result ? 'status-chip--warn' : 'status-chip--idle'}`}>
            <span className="status-chip__dot" />
            {result ? result.condition : 'Awaiting image'}
          </span>
          <span className={`status-chip ${savingCapture ? 'status-chip--live' : 'status-chip--idle'}`}>
            <span className="status-chip__dot" />
            {savingCapture ? 'Saving to app folder' : 'Leaf folder sync ready'}
          </span>
        </div>
      </section>

      <div className="section-grid section-grid--two-up">
        <SectionCard eyebrow="Capture" title="Leaf image input">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="media-input-hidden"
            onChange={(event) => loadImageFile(event.target.files?.[0])}
          />

          <div
            className={`dropzone ${dragActive ? 'dropzone--active' : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              loadImageFile(event.dataTransfer.files?.[0]);
            }}
          >
            {previewDataUrl ? (
              <img src={previewDataUrl} alt="Selected leaf preview" className="dropzone__preview" />
            ) : (
              <div className="dropzone__placeholder">
                <strong>Drop a leaf photo here</strong>
                <span>or click to browse. Best results come from bright, even lighting.</span>
              </div>
            )}
          </div>

          <p className="helper-copy helper-copy--block">
            Tip: capture one leaf close-up with most of the frame filled by the damaged area.
          </p>
        </SectionCard>

        <SectionCard eyebrow="Diagnosis" title="Result and recommendations">
          {loading ? <p className="loading-banner">Analyzing the leaf image with Gemini...</p> : null}
          {!loading && !result ? (
            <div className="empty-panel">
              <strong>No diagnosis yet</strong>
              <span>Upload or capture an image, then run the analysis.</span>
            </div>
          ) : null}

          {!loading && result ? (
            <div className="leaf-result">
              <span className={`leaf-result__badge leaf-result__badge--${result.tone}`}>{result.condition}</span>
              <p className="leaf-result__description">{result.description}</p>
              <div className="leaf-result__tips">
                <h3>Recommendations</h3>
                <ul className="note-list">
                  {result.recommendations.map((recommendation) => (
                    <li key={recommendation}>{recommendation}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}
        </SectionCard>
      </div>

      <div className="section-grid">
        <SectionCard eyebrow="Reference" title="What the model looks for">
          <div className="diagnosis-grid">
            <div className="diagnosis-chip diagnosis-chip--nutrient">Nutrient deficiency</div>
            <div className="diagnosis-chip diagnosis-chip--water">Water deficiency</div>
            <div className="diagnosis-chip diagnosis-chip--insect">Insect bite</div>
            <div className="diagnosis-chip diagnosis-chip--disease">Diseases</div>
            <div className="diagnosis-chip diagnosis-chip--sunlight">Too sunlight</div>
          </div>
        </SectionCard>
      </div>

      {showCamera ? (
        <CameraCapture
          onCapture={(dataUrl, captureMeta) => {
            setPreviewDataUrl(dataUrl);
            setResult(null);

            const persistCapture = async () => {
              const file = captureMeta?.file || await dataUrlToFile(dataUrl, `leaf-capture-${Date.now()}.jpg`);
              await saveLeafCapture(file, 'usb_camera');
            };

            void persistCapture();
          }}
          onClose={() => setShowCamera(false)}
          captureLabel="Capture leaf image"
          tipTitle="Leaf capture mode"
          tipDescription="USB camera is preferred. Fill the frame with the damaged area for best results."
        />
      ) : null}
    </main>
  );
}

export default LeafAnalysisPage;