import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { ActionButton } from '../components/ActionButton';
import { SectionCard } from '../components/SectionCard';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { analyzeInsectAudio } from '../lib/geminiService';
import { blobToBase64Payload } from '../lib/mediaHelpers';

function InsectPage() {
  const fileInputRef = useRef(null);
  const [report, setReport] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [uploadedPreviewUrl, setUploadedPreviewUrl] = useState('');
  const { isRecording, audioUrl, audioBlob, mimeType, start, stop, clear } = useAudioRecorder();

  useEffect(() => () => {
    if (uploadedPreviewUrl) {
      URL.revokeObjectURL(uploadedPreviewUrl);
    }
  }, [uploadedPreviewUrl]);

  // Auto-analyze when recording stops
  useEffect(() => {
    if (!audioBlob) {
      return;
    }

    setUploadedFile(null);
    setUploadedPreviewUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }

      return '';
    });

    handleProcess(audioBlob, mimeType);
  }, [audioBlob, mimeType]);

  async function handleProcess(blob, nextMimeType) {
    setLoading(true);

    try {
      const { base64 } = await blobToBase64Payload(blob);
      const nextReport = await analyzeInsectAudio(base64, nextMimeType);
      setReport(nextReport);
    } catch (analysisError) {
      const message = analysisError instanceof Error ? analysisError.message : 'Audio analysis failed.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleStartRecording() {
    try {
      await start();
    } catch (recordingError) {
      const message = recordingError instanceof Error ? recordingError.message : 'Microphone access failed.';
      toast.error(message);
    }
  }

  function resetPage() {
    clear();
    setReport('');
    setUploadedFile(null);
    setUploadedPreviewUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }

      return '';
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel hero-panel--analytics">
        <div>
          <span className="hero-panel__eyebrow">Bioacoustics</span>
          <h1>Insect audio identifier</h1>
          <p>
            Record or upload a sound clip, then let Gemini inspect the buzz, clicks, and tone patterns to summarize likely
            insect activity near the plant bed.
          </p>
          <div className="control-cluster">
            <ActionButton tone={isRecording ? 'amber' : 'mint'} onClick={isRecording ? stop : handleStartRecording}>
              {isRecording ? 'Stop Recording' : 'Start Recording'}
            </ActionButton>
            <ActionButton tone="sky" onClick={() => fileInputRef.current?.click()}>
              Upload Audio
            </ActionButton>
            {uploadedFile && !isRecording && (
              <ActionButton tone="sun" onClick={() => handleProcess(uploadedFile, uploadedFile.type || 'audio/webm')} disabled={loading}>
                {loading ? 'Analyzing...' : 'Analyze Uploaded'}
              </ActionButton>
            )}
            <ActionButton tone="neutral" onClick={resetPage} disabled={!report && !audioUrl && !uploadedPreviewUrl}>
              Clear
            </ActionButton>
          </div>
        </div>

        <div className="hero-panel__status-cluster">
          <span className={`status-chip ${isRecording ? 'status-chip--live' : 'status-chip--idle'}`}>
            <span className="status-chip__dot" />
            {isRecording ? 'Recording microphone' : 'Recorder idle'}
          </span>
          <span className={`status-chip ${report ? 'status-chip--reachable' : 'status-chip--warn'}`}>
            <span className="status-chip__dot" />
            {report ? 'Report ready' : 'Awaiting audio'}
          </span>
        </div>
      </section>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="media-input-hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];

          if (!file) {
            return;
          }

          setUploadedFile(file);
          setUploadedPreviewUrl((previousUrl) => {
            if (previousUrl) {
              URL.revokeObjectURL(previousUrl);
            }

            return URL.createObjectURL(file);
          });
          
          // Don't auto-analyze - let user click the button
          toast.success('Audio file loaded. Click "Analyze Uploaded" to process.');
        }}
      />

      <div className="section-grid section-grid--two-up">
        <SectionCard eyebrow="Capture" title="Audio source">
          <div className="recorder-panel">
            <button type="button" className={`recorder-orb ${isRecording ? 'recorder-orb--live' : ''}`} onClick={isRecording ? stop : handleStartRecording}>
              <span>{isRecording ? 'Stop' : 'Record'}</span>
            </button>
            <p className="helper-copy helper-copy--block">
              Capture a few seconds of the local environment. Avoid wind, conversation, and handling noise where possible.
            </p>
            {audioUrl || uploadedPreviewUrl ? <audio controls src={audioUrl || uploadedPreviewUrl} className="audio-player" /> : null}
          </div>
        </SectionCard>

        <SectionCard eyebrow="Analysis" title="Bioacoustic report">
          {loading ? <p className="loading-banner">Listening for insect signatures...</p> : null}
          {!loading && !report ? (
            <div className="empty-panel">
              <strong>No report yet</strong>
              <span>Record or upload an audio clip to generate a diagnosis.</span>
            </div>
          ) : null}
          {!loading && report ? (
            <div className="insect-report">
              <div className={`insect-threat-badge insect-threat-badge--${report.plant_threat_level?.toLowerCase() || 'none'}`}>
                <strong>Threat Level: {report.plant_threat_level}</strong>
                <span>{report.threat_reason}</span>
              </div>
              
              {report.insect_detected ? (
                <div className="insect-findings">
                  <div className="finding-row">
                    <strong>Likely Insect:</strong>
                    <span>{report.likely_insect}</span>
                  </div>
                  <div className="finding-row">
                    <strong>Confidence:</strong>
                    <span>{report.confidence}</span>
                  </div>
                  <div className="finding-row">
                    <strong>Frequency Range:</strong>
                    <span>{report.frequency_range}</span>
                  </div>
                  <div className="finding-row">
                    <strong>Rhythm Pattern:</strong>
                    <span>{report.rhythm}</span>
                  </div>
                  {report.sound_traits && report.sound_traits.length > 0 && (
                    <div className="finding-group">
                      <strong>Observed Sound Traits:</strong>
                      <ul>
                        {report.sound_traits.map((trait, idx) => <li key={idx}>{trait}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="insect-no-detection">No insect activity detected in this recording.</p>
              )}
              
              <p className="insect-observations"><strong>Observations:</strong> {report.observed_patterns}</p>
              
              {report.recommended_actions && report.recommended_actions.length > 0 && (
                <div className="finding-group">
                  <strong>Recommended Actions:</strong>
                  <ul>
                    {report.recommended_actions.map((action, idx) => <li key={idx}>{action}</li>)}
                  </ul>
                </div>
              )}
              
              {report.monitoring_note && (
                <p className="insect-monitoring-note"><strong>Monitoring Note:</strong> {report.monitoring_note}</p>
              )}
            </div>
          ) : null}
        </SectionCard>
      </div>
    </main>
  );
}

export default InsectPage;