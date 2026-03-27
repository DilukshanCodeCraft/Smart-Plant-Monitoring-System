import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ActionButton } from '../components/ActionButton';
import { SectionCard } from '../components/SectionCard';
import VideoRecorderModal from '../components/VideoRecorderModal';
import { api } from '../lib/api';
import { formatBytes } from '../lib/mediaHelpers';

function ArthropodDetectionPage() {
  const fileInputRef = useRef(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [confidence, setConfidence] = useState(0.3);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState(null);
  const [progress, setProgress] = useState(0);
  const [showRecorder, setShowRecorder] = useState(false);
  const [savingCapture, setSavingCapture] = useState(false);

  function replaceSelectedVideo(nextVideo) {
    setSelectedVideo((previousVideo) => {
      if (previousVideo?.objectUrl) {
        URL.revokeObjectURL(previousVideo.previewUrl);
      }

      return nextVideo;
    });
  }

  useEffect(() => () => {
    if (selectedVideo?.objectUrl) {
      URL.revokeObjectURL(selectedVideo.previewUrl);
    }
  }, [selectedVideo]);

  function resetPage() {
    replaceSelectedVideo(null);
    setResults(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  async function handleVideoUpload(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    if (!file.type.startsWith('video/')) {
      toast.error('Please upload a video file.');
      return;
    }

    replaceSelectedVideo({
      file,
      name: file.name,
      size: file.size,
      previewUrl: URL.createObjectURL(file),
      objectUrl: true
    });
  }

  async function handleRecordedVideo(file) {
    setSavingCapture(true);

    try {
      const payload = await api.uploadCameraMedia({
        file,
        category: 'insect_detection',
        source: 'usb_camera',
        context: 'arthropod_detection'
      });

      const savedName = payload?.file?.name || file.name;

      replaceSelectedVideo({
        file,
        name: savedName,
        size: file.size,
        previewUrl: URL.createObjectURL(file),
        objectUrl: true,
        libraryUrl: payload?.file?.url || ''
      });

      setResults(null);
      setProgress(0);
      toast.success('Video recorded and saved to insect-detection app folder.');
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Failed to save recorded video.';
      toast.error(message);
      throw new Error(message);
    } finally {
      setSavingCapture(false);
    }
  }

  async function handleDetect() {
    if (savingCapture) {
      toast.error('Please wait until recording upload is finished.');
      return;
    }

    if (!selectedVideo) {
      toast.error('Please select a video file.');
      return;
    }

    setProcessing(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', selectedVideo.file);
      formData.append('confidence', confidence);

      const response = await api.detectArthropods(formData);

      if (response.success && response.data) {
        setResults(response.data);
        toast.success('Arthropod detection complete!');
      } else {
        throw new Error(response.error || 'Detection failed');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Detection failed. Try again.';
      toast.error(message);
    } finally {
      setProcessing(false);
      setProgress(1);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel hero-panel--analytics">
        <div>
          <span className="hero-panel__eyebrow">Computer Vision</span>
          <h1>Arthropod Detector</h1>
          <p>
            Upload or record a USB camera video of your plants to automatically identify and locate arthropods. Uses
            advanced computer vision to detect insects, spiders, beetles, and other arthropods in your garden footage.
            Adjust confidence threshold to fine-tune detection sensitivity.
          </p>
          <p className="helper-copy helper-copy--block">
            First run is slower because the model is downloaded and cached locally. On CPU this can take 30 to 120 seconds
            for longer videos, so the detector now starts in a more conservative balanced mode.
          </p>
          <div className="control-cluster">
            <ActionButton tone="mint" onClick={() => fileInputRef.current?.click()}>
              Select Video File
            </ActionButton>
            <ActionButton tone="sky" onClick={() => setShowRecorder(true)} disabled={processing || savingCapture}>
              {savingCapture ? 'Saving Recording...' : 'Record USB Video'}
            </ActionButton>
            <ActionButton tone="sun" onClick={handleDetect} busy={processing} disabled={!selectedVideo}>
              {processing ? 'Analyzing...' : 'Run Detection'}
            </ActionButton>
            <ActionButton tone="neutral" onClick={resetPage} disabled={!selectedVideo && !results}>
              Clear
            </ActionButton>
          </div>

          <div className="confidence-control">
            <label>
              Detection Confidence: <strong>{(confidence * 100).toFixed(0)}%</strong>
            </label>
            <input
              type="range"
              min="0.1"
              max="0.95"
              step="0.05"
              value={confidence}
              onChange={(e) => setConfidence(parseFloat(e.target.value))}
              disabled={processing}
              className="confidence-slider"
            />
            <span className="helper-copy">30% is the new default to reduce false positives. 15% came from the Colab notebook's high-sensitivity setting.</span>
          </div>
        </div>

        <div className="hero-panel__status-cluster">
          <span className={`status-chip ${results ? 'status-chip--live' : 'status-chip--idle'}`}>
            <span className="status-chip__dot" />
            {results ? 'Detection complete' : 'Awaiting video'}
          </span>
          <span className={`status-chip ${selectedVideo ? 'status-chip--reachable' : 'status-chip--warn'}`}>
            <span className="status-chip__dot" />
            {selectedVideo ? 'Video selected' : 'No video loaded'}
          </span>
          <span className={`status-chip ${savingCapture ? 'status-chip--live' : 'status-chip--idle'}`}>
            <span className="status-chip__dot" />
            {savingCapture ? 'Saving to app folder' : 'Insect video folder ready'}
          </span>
        </div>
      </section>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="media-input-hidden"
        onChange={handleVideoUpload}
      />

      <div className="section-grid section-grid--two-up">
        <SectionCard eyebrow="Source" title="Selected video">
          {selectedVideo ? (
            <div className="media-source-card">
              <video src={selectedVideo.previewUrl} className="media-source-card__video" controls />
              <div className="media-source-card__meta">
                <strong>{selectedVideo.name}</strong>
                <span>{formatBytes(selectedVideo.size)}</span>
                {selectedVideo.libraryUrl ? <span>Saved to app folder</span> : null}
              </div>
            </div>
          ) : (
            <div className="empty-panel">
              <strong>No video selected</strong>
              <span>Upload a video to detect arthropods using YOLO computer vision.</span>
            </div>
          )}

          {processing && (
            <div className="split-progress">
              <div className="progress-bar">
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p>Processing video for arthropod detection. First run may stay busy while the model cache is prepared.</p>
            </div>
          )}
        </SectionCard>

        <SectionCard eyebrow="Statistics" title="Detection summary">
          {!results ? (
            <div className="empty-panel">
              <strong>No results yet</strong>
              <span>Run detection on a video to see arthropod analysis.</span>
            </div>
          ) : (
            <div className="detection-summary">
              <div className="summary-stats">
                <div className="stat-item">
                  <span className="stat-label">Total Frames</span>
                  <strong>{results.total_frames}</strong>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Frame Rate (FPS)</span>
                  <strong>{results.fps}</strong>
                </div>
                <div className="stat-item">
                  <span className="stat-label">Total Detections</span>
                  <strong>{results.detections.length}</strong>
                </div>
              </div>

              {results.arthropod_counts && Object.keys(results.arthropod_counts).length > 0 && (
                <div className="arthropod-breakdown">
                  <strong>Arthropod Types Found</strong>
                  <div className="arthropod-grid">
                    {Object.entries(results.arthropod_counts).map(([type, count]) => (
                      <div key={type} className="arthropod-card">
                        <span className="arthropod-type">{type}</span>
                        <span className="arthropod-count">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.summary && (
                <p className="detection-summary-text">
                  <strong>Summary:</strong> {results.summary}
                </p>
              )}
            </div>
          )}
        </SectionCard>
      </div>

      {results && (
        <div className="section-grid">
          <SectionCard eyebrow="Detections" title="Frame-by-frame analysis">
            {results.detections.length === 0 ? (
              <p className="empty-state">No arthropods detected in this video.</p>
            ) : (
              <div className="detections-list">
                <div className="detections-header">
                  <div>Frame</div>
                  <div>Type</div>
                  <div>Confidence</div>
                  <div>Location</div>
                </div>
                {results.detections.slice(0, 50).map((detection, idx) => (
                  <div key={idx} className="detection-row">
                    <div className="detection-frame">{detection.frame}</div>
                    <div className="detection-type">{detection.class}</div>
                    <div className="detection-confidence">
                      <span className={`conf-badge conf-${detection.confidence > 0.85 ? 'high' : detection.confidence > 0.7 ? 'med' : 'low'}`}>
                        {(detection.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="detection-location">
                      ({detection.box.x1.toFixed(0)}, {detection.box.y1.toFixed(0)})
                    </div>
                  </div>
                ))}
                {results.detections.length > 50 && (
                  <div className="detections-more">
                    ... and {results.detections.length - 50} more detections
                  </div>
                )}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {showRecorder ? (
        <VideoRecorderModal
          onRecord={handleRecordedVideo}
          onClose={() => setShowRecorder(false)}
        />
      ) : null}
    </main>
  );
}

export default ArthropodDetectionPage;
