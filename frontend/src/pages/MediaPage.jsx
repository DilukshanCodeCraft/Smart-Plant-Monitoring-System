import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';
import { ActionButton } from '../components/ActionButton';
import { SectionCard } from '../components/SectionCard';
import { api } from '../lib/api';
import { analyzeInsectAudio } from '../lib/geminiService';
import { blobToBase64Payload, downloadBlob, formatBytes, formatTimeOfDay } from '../lib/mediaHelpers';

const FFMPEG_CORE_JS_URL = '/ffmpeg/ffmpeg-core.js';
const FFMPEG_CORE_WASM_URL = '/ffmpeg/ffmpeg-core.wasm';
const FFMPEG_LOAD_TIMEOUT_MS = 30000;

function withTimeout(promise, timeoutMs, timeoutMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    })
  ]);
}

function sanitizeStem(filename) {
  const stem = String(filename || 'camera-roll-video').replace(/\.[^./\\]+$/, '');
  const safeStem = stem.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();

  return safeStem || 'camera-roll-video';
}

function MediaPage() {
  const fileInputRef = useRef(null);
  const ffmpegRef = useRef(null);
  const [cameraVideos, setCameraVideos] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);
  const [outputs, setOutputs] = useState(null);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState('');
  const [audioReport, setAudioReport] = useState('');
  const [analyzingAudio, setAnalyzingAudio] = useState(false);

  useEffect(() => {
    loadCameraVideos();

    return () => {
      ffmpegRef.current?.terminate();
    };
  }, []);

  useEffect(() => () => {
    if (selectedSource?.objectUrl) {
      URL.revokeObjectURL(selectedSource.previewUrl);
    }

    if (outputs?.video?.previewUrl) {
      URL.revokeObjectURL(outputs.video.previewUrl);
    }

    if (outputs?.audio?.previewUrl) {
      URL.revokeObjectURL(outputs.audio.previewUrl);
    }
  }, [selectedSource, outputs]);

  async function loadCameraVideos() {
    try {
      const payload = await api.getCameraRoll({
        category: 'insect_detection',
        mediaType: 'video'
      });
      setCameraVideos((payload.files || []).slice(0, 20));
    } catch (_error) {
      setCameraVideos([]);
    }
  }

  async function ensureFFmpeg() {
    if (!ffmpegRef.current) {
      const ffmpeg = new FFmpeg();
      ffmpeg.on('progress', ({ progress: nextProgress }) => {
        setProgress(nextProgress);
      });
      ffmpegRef.current = ffmpeg;
    }

    if (ffmpegRef.current.loaded) {
      return ffmpegRef.current;
    }

    setLoadingLibrary(true);
    setPhase('Loading local ffmpeg core');

    try {
      await withTimeout(
        ffmpegRef.current.load({
          coreURL: FFMPEG_CORE_JS_URL,
          wasmURL: FFMPEG_CORE_WASM_URL
        }),
        FFMPEG_LOAD_TIMEOUT_MS,
        'ffmpeg core load timed out. Reload the page and try again.'
      );

      return ffmpegRef.current;
    } finally {
      setLoadingLibrary(false);
    }
  }

  function replaceSelectedSource(nextSource) {
    setSelectedSource((previousSource) => {
      if (previousSource?.objectUrl) {
        URL.revokeObjectURL(previousSource.previewUrl);
      }

      return nextSource;
    });

    setAudioReport('');
    setOutputs((previousOutputs) => {
      if (previousOutputs?.video?.previewUrl) {
        URL.revokeObjectURL(previousOutputs.video.previewUrl);
      }

      if (previousOutputs?.audio?.previewUrl) {
        URL.revokeObjectURL(previousOutputs.audio.previewUrl);
      }

      return null;
    });
  }

  async function handleSplit() {
    if (!selectedSource) {
      toast.error('Choose a local video or a Camera Roll clip first.');
      return;
    }

    setSplitting(true);
    setAudioReport('');
    setProgress(0);
    setPhase('');

    let inputName = '';
    let videoOutputName = '';
    let audioOutputName = '';

    try {
      const ffmpeg = await ensureFFmpeg();
      const inputExtensionMatch = selectedSource.name.match(/\.[^./\\]+$/);
      inputName = `source${inputExtensionMatch?.[0] || '.mp4'}`;
      const safeStem = sanitizeStem(selectedSource.name);
      videoOutputName = `${safeStem}-video.mp4`;
      audioOutputName = `${safeStem}-audio.m4a`;

      setPhase('Copying source into ffmpeg');
      await ffmpeg.writeFile(
        inputName,
        await fetchFile(selectedSource.kind === 'upload' ? selectedSource.file : selectedSource.url)
      );

      setPhase('Extracting video-only track');
      let exitCode = await ffmpeg.exec([
        '-y',
        '-i',
        inputName,
        '-map',
        '0:v:0',
        '-an',
        '-sn',
        '-dn',
        '-c:v',
        'copy',
        '-movflags',
        '+faststart',
        videoOutputName
      ]);

      if (exitCode !== 0) {
        setPhase('Re-encoding video-only track for compatibility');
        exitCode = await ffmpeg.exec([
          '-y',
          '-i',
          inputName,
          '-map',
          '0:v:0',
          '-an',
          '-sn',
          '-dn',
          '-c:v',
          'mpeg4',
          '-q:v',
          '4',
          '-movflags',
          '+faststart',
          videoOutputName
        ]);

        if (exitCode !== 0) {
          throw new Error('Video-only extraction failed. This file may use an unsupported video codec.');
        }
      }

      setProgress(0);
      setPhase('Extracting audio-only track');
      exitCode = await ffmpeg.exec([
        '-y',
        '-i',
        inputName,
        '-map',
        '0:a:0',
        '-vn',
        '-sn',
        '-dn',
        '-c:a',
        'aac',
        '-b:a',
        '192k',
        audioOutputName
      ]);

      if (exitCode !== 0) {
        throw new Error('Audio-only extraction failed. The video may not contain a readable audio stream.');
      }

      const videoBytes = await ffmpeg.readFile(videoOutputName);
      const audioBytes = await ffmpeg.readFile(audioOutputName);

      if (!videoBytes || videoBytes.length === 0) {
        throw new Error('Video-only output was empty. Please try another file.');
      }

      if (!audioBytes || audioBytes.length === 0) {
        throw new Error('Audio-only output was empty. Please try another file with audio.');
      }

      const videoBlob = new Blob([videoBytes], { type: 'video/mp4' });
      const audioBlob = new Blob([audioBytes], { type: 'audio/mp4' });

      setOutputs((previousOutputs) => {
        if (previousOutputs?.video?.previewUrl) {
          URL.revokeObjectURL(previousOutputs.video.previewUrl);
        }

        if (previousOutputs?.audio?.previewUrl) {
          URL.revokeObjectURL(previousOutputs.audio.previewUrl);
        }

        return {
          video: {
            blob: videoBlob,
            filename: videoOutputName,
            previewUrl: URL.createObjectURL(videoBlob)
          },
          audio: {
            blob: audioBlob,
            filename: audioOutputName,
            previewUrl: URL.createObjectURL(audioBlob)
          }
        };
      });

      setPhase('Split complete');
      setProgress(1);
    } catch (splitError) {
      const message = splitError instanceof Error ? splitError.message : 'Media split failed.';
      toast.error(message);
      setPhase('Split failed');
    } finally {
      const ffmpeg = ffmpegRef.current;
      if (ffmpeg) {
        for (const filename of [inputName, videoOutputName, audioOutputName]) {
          if (!filename) {
            continue;
          }

          try {
            await ffmpeg.deleteFile(filename);
          } catch (_deleteError) {
            // Ignore cleanup errors from missing temp files.
          }
        }
      }

      setSplitting(false);
    }
  }

  async function handleAnalyzeExtractedAudio() {
    if (!outputs?.audio?.blob) {
      return;
    }

    setAnalyzingAudio(true);

    try {
      const { base64, mimeType } = await blobToBase64Payload(outputs.audio.blob);
      const report = await analyzeInsectAudio(base64, mimeType);

      if (typeof report === 'string') {
        setAudioReport(report);
      } else {
        const formattedReport = [
          `Likely insect: ${report?.likely_insect || 'Unknown'}`,
          `Confidence: ${report?.confidence || 'Unknown'}`,
          `Threat level: ${report?.plant_threat_level || 'Unknown'}`,
          `Patterns: ${report?.observed_patterns || 'Not provided'}`,
          '',
          'Recommended actions:',
          ...(Array.isArray(report?.recommended_actions) && report.recommended_actions.length > 0
            ? report.recommended_actions.map((item, index) => `${index + 1}. ${item}`)
            : ['1. Continue monitoring'])
        ].join('\n');

        setAudioReport(formattedReport);
      }
    } catch (analysisError) {
      const message = analysisError instanceof Error ? analysisError.message : 'Audio analysis failed.';
      toast.error(message);
    } finally {
      setAnalyzingAudio(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero-panel hero-panel--analytics">
        <div>
          <span className="hero-panel__eyebrow">Media workflow</span>
          <h1>Video and audio splitter</h1>
          <p>
            Take a recorded plant video, split out a clean video-only track plus an audio-only track, then send the
            extracted audio into the insect analysis flow when needed.
          </p>
          <div className="control-cluster">
            <ActionButton tone="mint" onClick={() => fileInputRef.current?.click()}>
              Upload Video
            </ActionButton>
            <ActionButton tone="sky" onClick={handleSplit} busy={splitting || loadingLibrary} disabled={!selectedSource}>
              Split Media
            </ActionButton>
          </div>
        </div>

        <div className="hero-panel__status-cluster">
          <span className={`status-chip ${loadingLibrary ? 'status-chip--warn' : 'status-chip--reachable'}`}>
            <span className="status-chip__dot" />
            {loadingLibrary ? 'Loading ffmpeg' : 'ffmpeg ready on demand'}
          </span>
          <span className={`status-chip ${outputs ? 'status-chip--live' : 'status-chip--idle'}`}>
            <span className="status-chip__dot" />
            {outputs ? 'Split outputs ready' : 'Awaiting source video'}
          </span>
        </div>
      </section>

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="media-input-hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];

          if (!file) {
            return;
          }

          replaceSelectedSource({
            kind: 'upload',
            name: file.name,
            size: file.size,
            file,
            previewUrl: URL.createObjectURL(file),
            objectUrl: true
          });
        }}
      />

      <div className="section-grid section-grid--two-up">
        <SectionCard eyebrow="Source" title="Selected video">
          {selectedSource ? (
            <div className="media-source-card">
              <video src={selectedSource.previewUrl} className="media-source-card__video" controls />
              <div className="media-source-card__meta">
                <strong>{selectedSource.name}</strong>
                <span>{formatBytes(selectedSource.size)}</span>
              </div>
            </div>
          ) : (
            <div className="empty-panel">
              <strong>No source video selected</strong>
              <span>Upload a local file or choose a recent Camera Roll video.</span>
            </div>
          )}

          {phase ? (
            <div className="split-progress">
              <div className="progress-bar">
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
              <p>{phase}</p>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard eyebrow="Insect Videos" title="Insect-detection app folder videos">
          {cameraVideos.length === 0 ? (
            <p className="empty-state">No insect-detection videos are available in the app folder right now.</p>
          ) : (
            <div className="camera-video-list">
              {cameraVideos.map((video) => (
                <button
                  key={video.name}
                  type="button"
                  className={`camera-video-pill ${selectedSource?.name === video.name && selectedSource?.kind === 'camera' ? 'camera-video-pill--active' : ''}`}
                  onClick={() => replaceSelectedSource({
                    kind: 'camera',
                    name: video.name,
                    size: video.size,
                    url: video.url,
                    previewUrl: video.url,
                    objectUrl: false,
                    mtime: video.mtime
                  })}
                >
                  <strong>{video.name}</strong>
                  <span>
                    {formatTimeOfDay(video.mtime)} • {formatBytes(video.size)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {outputs ? (
        <div className="section-grid section-grid--two-up">
          <SectionCard eyebrow="Output" title="Video-only track">
            <video src={outputs.video.previewUrl} className="media-source-card__video" controls />
            <div className="toolbar-cluster">
              <ActionButton tone="mint" onClick={() => downloadBlob(outputs.video.blob, outputs.video.filename)}>
                Download Video Track
              </ActionButton>
            </div>
          </SectionCard>

          <SectionCard eyebrow="Output" title="Audio-only track">
            <audio controls src={outputs.audio.previewUrl} className="audio-player" />
            <div className="toolbar-cluster">
              <ActionButton tone="sky" onClick={() => downloadBlob(outputs.audio.blob, outputs.audio.filename)}>
                Download Audio Track
              </ActionButton>
              <ActionButton tone="sun" onClick={handleAnalyzeExtractedAudio} busy={analyzingAudio}>
                Analyze Extracted Audio
              </ActionButton>
            </div>
            {audioReport ? <article className="report-card report-card--compact">{audioReport}</article> : null}
          </SectionCard>
        </div>
      ) : null}
    </main>
  );
}

export default MediaPage;