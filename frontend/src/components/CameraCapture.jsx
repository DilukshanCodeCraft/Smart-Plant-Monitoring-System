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

function getCameraErrorMessage(cameraError) {
  if (!window.isSecureContext) {
    return 'Camera access requires a secure browser context. Open this app from localhost or HTTPS.';
  }

  switch (cameraError?.name) {
    case 'NotAllowedError':
      return 'Browser access was denied. Check site permissions and Windows camera privacy settings.';
    case 'NotFoundError':
      return 'No camera device was found for this browser session.';
    case 'NotReadableError':
      return 'The camera is already in use by another app or tab. Close other camera apps and try again.';
    case 'OverconstrainedError':
      return 'The browser could not satisfy the requested camera profile. A simpler fallback should work now.';
    case 'SecurityError':
      return 'The browser blocked camera access for security reasons. Use localhost or HTTPS.';
    default:
      return `Camera startup failed: ${cameraError?.message || 'Unknown browser error.'}`;
  }
}

function buildConstraints(profile, deviceId) {
  if (profile.video === true) {
    return {
      video: deviceId
        ? { deviceId: { exact: deviceId } }
        : true,
      audio: false
    };
  }

  return {
    video: {
      ...profile.video,
      ...(deviceId ? { deviceId: { exact: deviceId } } : {})
    },
    audio: false
  };
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

async function getVideoInputDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((device) => device.kind === 'videoinput');
}

function CameraCapture({
  onCapture,
  onClose,
  tipTitle = 'Scientific capture mode',
  tipDescription = 'Hold steady and keep the target area under bright, even light.',
  captureLabel = 'Capture photo'
}) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [isStarting, setIsStarting] = useState(true);
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');

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

  async function applyAutoFocus(stream) {
    const [track] = stream.getVideoTracks();
    const capabilities = typeof track?.getCapabilities === 'function' ? track.getCapabilities() : {};

    if (Array.isArray(capabilities.focusMode) && capabilities.focusMode.includes('continuous')) {
      try {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      } catch (focusError) {
        console.warn('Camera focus optimization failed. Continuing with active stream.', focusError);
      }
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

      await applyAutoFocus(stream);
    } catch (cameraError) {
      console.error('Camera Error:', cameraError);
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
        const permissionProbe = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
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
      stopActiveStream();
    };
  }, []);

  function handleDeviceSelection(event) {
    const nextDeviceId = event.target.value;
    setSelectedDeviceId(nextDeviceId);
    void startCamera(nextDeviceId);
  }

  function capture() {
    if (!videoRef.current || !canvasRef.current) {
      return;
    }

    if (!videoRef.current.videoWidth || !videoRef.current.videoHeight) {
      setError('Camera stream is not ready yet. Please wait for preview and try again.');
      return;
    }

    const context = canvasRef.current.getContext('2d');
    if (!context) {
      return;
    }

    canvasRef.current.width = videoRef.current.videoWidth;
    canvasRef.current.height = videoRef.current.videoHeight;
    context.drawImage(videoRef.current, 0, 0);

    const mimeType = 'image/jpeg';
    const dataUrl = canvasRef.current.toDataURL(mimeType, 0.96);

    const emitCapture = (blob) => {
      const timestamp = Date.now();
      const captureFile = blob
        ? new File([blob], `capture-${timestamp}.jpg`, { type: mimeType })
        : null;

      onCapture(dataUrl, {
        blob,
        file: captureFile,
        mimeType,
        capturedAt: new Date(timestamp).toISOString(),
        deviceId: selectedDeviceId,
        deviceLabel: selectedDevice?.label || ''
      });

      onClose();
    };

    if (typeof canvasRef.current.toBlob === 'function') {
      canvasRef.current.toBlob((blob) => emitCapture(blob), mimeType, 0.96);
      return;
    }

    emitCapture(null);
  }

  return (
    <div className="capture-modal">
      <div className="capture-modal__tips">
        <p>{tipTitle}</p>
        <span>{tipDescription}</span>
      </div>

      {devices.length > 1 ? (
        <label className="capture-modal__device-picker">
          <span>Camera source</span>
          <select value={selectedDeviceId} onChange={handleDeviceSelection}>
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
          <video ref={videoRef} autoPlay playsInline className="capture-modal__video" />
        )}

        {!error ? (
          <div className="capture-modal__grid" aria-hidden="true">
            {Array.from({ length: 9 }).map((_, index) => (
              <span key={index} />
            ))}
          </div>
        ) : null}

        <div className="capture-modal__actions">
          <button type="button" className="ghost-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="capture-button"
            onClick={capture}
            disabled={Boolean(error) || isStarting}
            aria-label={captureLabel}
          >
            <span />
          </button>
        </div>
      </div>

      <canvas ref={canvasRef} hidden />
    </div>
  );
}

export default CameraCapture;