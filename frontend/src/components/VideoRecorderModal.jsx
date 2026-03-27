import { useEffect, useMemo, useRef, useState } from 'react';

const CAMERA_PROFILES = [
  {
    label: '4k profile',
    video: {
      width: { ideal: 3840 },
      height: { ideal: 2160 },
      frameRate: { ideal: 30 }
    }
  },
  {
    label: '1080p profile',
    video: {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 }
    }
  },
  {
    label: 'default profile',
    video: true
  }
];

const USB_HINT_PATTERN = /(usb|logitech|external|webcam|hd\s*camera|cam\s*link)/i;
const VIRTUAL_HINT_PATTERN = /(virtual|obs|snap\s*camera|manycam|xsplit|droidcam)/i;

const VIDEO_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4'
];

function getCameraErrorMessage(cameraError) {
  switch (cameraError?.name) {
    case 'NotAllowedError':
      return 'Browser access was denied. Check site permissions and Windows camera privacy settings.';
    case 'NotFoundError':
      return 'No camera device was found for this browser session.';
    case 'NotReadableError':
      return 'The camera is already in use by another app or tab. Close other camera apps and try again.';
    case 'OverconstrainedError':
      return 'The browser could not satisfy the requested camera profile. A simpler fallback should work now.';
    default:
      return `Camera startup failed: ${cameraError?.message || 'Unknown browser error.'}`;
  }
}

function choosePreferredDeviceId(videoDevices = []) {
  if (videoDevices.length === 0) {
    return '';
  }

  const usbDevice = videoDevices.find((device) => USB_HINT_PATTERN.test(device.label || ''));
  if (usbDevice) {
    return usbDevice.deviceId;
  }

  const nonVirtualDevice = videoDevices.find((device) => !VIRTUAL_HINT_PATTERN.test(device.label || ''));
  if (nonVirtualDevice) {
    return nonVirtualDevice.deviceId;
  }

  return videoDevices[0].deviceId;
}

function buildConstraints(profile, deviceId) {
  if (profile.video === true) {
    return {
      video: deviceId
        ? { deviceId: { exact: deviceId } }
        : true,
      audio: true
    };
  }

  return {
    video: {
      ...profile.video,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {})
    },
    audio: true
  };
}

async function getVideoInputDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === 'videoinput');
}

async function openCameraStream(deviceId) {
  let lastError = null;

  for (const profile of CAMERA_PROFILES) {
    try {
      return await navigator.mediaDevices.getUserMedia(buildConstraints(profile, deviceId));
    } catch (cameraError) {
      lastError = cameraError;
      console.warn(`Camera profile failed: ${profile.label}`, cameraError);
    }
  }

  if (deviceId) {
    for (const profile of CAMERA_PROFILES) {
      try {
        return await navigator.mediaDevices.getUserMedia(buildConstraints(profile, ''));
      } catch (cameraError) {
        lastError = cameraError;
      }
    }
  }

  throw lastError || new Error('No camera profile succeeded.');
}

function selectRecorderMimeType() {
  if (typeof MediaRecorder === 'undefined') {
    return '';
  }

  for (const mimeType of VIDEO_MIME_CANDIDATES) {
    if (typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported(mimeType)) {
      return mimeType;
    }
  }

  return '';
}

function getVideoExtension(mimeType) {
  const normalized = String(mimeType || '').toLowerCase();
  return normalized.includes('mp4') ? '.mp4' : '.webm';
}

function formatDuration(milliseconds) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = seconds % 60;

  return `${minutesPart}:${String(secondsPart).padStart(2, '0')}`;
}

function VideoRecorderModal({ onRecord, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const recordingStartedAtRef = useRef(0);

  const [error, setError] = useState('');
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [isStarting, setIsStarting] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const selectedDevice = useMemo(
    () => devices.find((device) => device.deviceId === selectedDeviceId) || null,
    [devices, selectedDeviceId]
  );

  function stopActiveStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }

  async function startCamera(nextDeviceId) {
    setIsStarting(true);

    try {
      const stream = await openCameraStream(nextDeviceId);
      stopActiveStream();
      streamRef.current = stream;
      setError('');

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (cameraError) {
      setError(getCameraErrorMessage(cameraError));
    } finally {
      setIsStarting(false);
    }
  }

  useEffect(() => {
    let canceled = false;

    async function initializeCamera() {
      if (!navigator.mediaDevices?.getUserMedia || !navigator.mediaDevices?.enumerateDevices) {
        setError('This browser does not expose camera APIs for this page.');
        setIsStarting(false);
        return;
      }

      try {
        const permissionProbe = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        permissionProbe.getTracks().forEach((track) => track.stop());
      } catch (cameraError) {
        if (!canceled) {
          setError(getCameraErrorMessage(cameraError));
          setIsStarting(false);
        }
        return;
      }

      const availableDevices = await getVideoInputDevices();
      if (canceled) {
        return;
      }

      setDevices(availableDevices);
      const preferredDeviceId = choosePreferredDeviceId(availableDevices);
      setSelectedDeviceId(preferredDeviceId);
      await startCamera(preferredDeviceId);
    }

    async function handleDeviceChange() {
      const availableDevices = await getVideoInputDevices();
      if (canceled) {
        return;
      }

      setDevices(availableDevices);
      setSelectedDeviceId((previousDeviceId) => {
        const nextDeviceId = availableDevices.some((device) => device.deviceId === previousDeviceId)
          ? previousDeviceId
          : choosePreferredDeviceId(availableDevices);

        if (nextDeviceId && nextDeviceId !== previousDeviceId) {
          void startCamera(nextDeviceId);
        }

        return nextDeviceId;
      });
    }

    initializeCamera();
    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);

    return () => {
      canceled = true;
      navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);

      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        recorderRef.current.ondataavailable = null;
        recorderRef.current.onstop = null;
        recorderRef.current.onerror = null;
        try {
          recorderRef.current.stop();
        } catch (_stopError) {
          // Ignore recorder shutdown errors on cleanup.
        }
      }

      stopActiveStream();
    };
  }, []);

  useEffect(() => {
    if (!isRecording) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - recordingStartedAtRef.current);
    }, 250);

    return () => {
      window.clearInterval(timer);
    };
  }, [isRecording]);

  function handleDeviceSelection(event) {
    const nextDeviceId = event.target.value;
    setSelectedDeviceId(nextDeviceId);
    void startCamera(nextDeviceId);
  }

  function handleStartRecording() {
    if (!streamRef.current) {
      setError('Camera stream is not ready yet.');
      return;
    }

    if (typeof MediaRecorder === 'undefined') {
      setError('This browser does not support video recording through MediaRecorder.');
      return;
    }

    const preferredMimeType = selectRecorderMimeType();
    let recorder;

    try {
      recorder = preferredMimeType
        ? new MediaRecorder(streamRef.current, { mimeType: preferredMimeType })
        : new MediaRecorder(streamRef.current);
    } catch (recordingError) {
      setError(`Unable to start recording: ${recordingError.message || 'Unknown recorder error.'}`);
      return;
    }

    chunksRef.current = [];
    recorderRef.current = recorder;

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onerror = (event) => {
      const recorderError = event?.error;
      setError(`Recording failed: ${recorderError?.message || 'Unknown recording error.'}`);
      setIsRecording(false);
    };

    recorder.onstop = async () => {
      const finalMimeType = recorder.mimeType || preferredMimeType || 'video/webm';
      const videoBlob = new Blob(chunksRef.current, { type: finalMimeType });

      if (!videoBlob.size) {
        setError('No video data was captured. Try recording again.');
        return;
      }

      const extension = getVideoExtension(finalMimeType);
      const file = new File([videoBlob], `insect-video-${Date.now()}${extension}`, {
        type: finalMimeType
      });

      setIsSaving(true);

      try {
        if (typeof onRecord === 'function') {
          await onRecord(file, {
            mimeType: finalMimeType,
            durationMs: elapsedMs,
            capturedAt: new Date().toISOString(),
            deviceId: selectedDeviceId,
            deviceLabel: selectedDevice?.label || ''
          });
        }

        onClose();
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : 'Failed to save recording.');
      } finally {
        setIsSaving(false);
      }
    };

    recordingStartedAtRef.current = Date.now();
    setElapsedMs(0);
    setError('');
    recorder.start(250);
    setIsRecording(true);
  }

  function handleStopRecording() {
    if (!recorderRef.current || recorderRef.current.state === 'inactive') {
      return;
    }

    try {
      recorderRef.current.stop();
      setIsRecording(false);
    } catch (stopError) {
      setError(`Failed to stop recording: ${stopError.message || 'Unknown error.'}`);
    }
  }

  function handleCancel() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.ondataavailable = null;
      recorderRef.current.onstop = null;
      recorderRef.current.onerror = null;

      try {
        recorderRef.current.stop();
      } catch (_stopError) {
        // Ignore recorder stop errors when closing dialog.
      }
    }

    onClose();
  }

  return (
    <div className="capture-modal">
      <div className="capture-modal__tips">
        <p>Insect detection recorder</p>
        <span>Use a USB camera and capture 10 to 30 seconds around the plant area.</span>
      </div>

      {devices.length > 1 ? (
        <label className="capture-modal__device-picker">
          <span>Camera source</span>
          <select value={selectedDeviceId} onChange={handleDeviceSelection} disabled={isRecording || isSaving}>
            {devices.map((device, index) => (
              <option key={device.deviceId || `camera-${index}`} value={device.deviceId}>
                {device.label || `Camera ${index + 1}`}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {selectedDevice?.label ? <p className="capture-modal__active-device">Using: {selectedDevice.label}</p> : null}

      <div className="capture-modal__frame">
        {error ? (
          <div className="capture-modal__error">{error}</div>
        ) : (
          <video ref={videoRef} autoPlay playsInline muted className="capture-modal__video" />
        )}

        <div className="capture-modal__actions">
          <button type="button" className="ghost-button" onClick={handleCancel} disabled={isSaving}>
            Cancel
          </button>

          {!isRecording ? (
            <button
              type="button"
              className="capture-button capture-button--record"
              onClick={handleStartRecording}
              disabled={Boolean(error) || isStarting || isSaving}
              aria-label="Start recording"
            >
              <span />
            </button>
          ) : (
            <button
              type="button"
              className="capture-button capture-button--stop"
              onClick={handleStopRecording}
              disabled={Boolean(error) || isSaving}
              aria-label="Stop recording"
            >
              <span />
            </button>
          )}
        </div>
      </div>

      <p className="capture-modal__active-device">
        {isSaving ? 'Saving recording...' : isRecording ? `Recording ${formatDuration(elapsedMs)}` : 'Recorder idle'}
      </p>
    </div>
  );
}

export default VideoRecorderModal;
