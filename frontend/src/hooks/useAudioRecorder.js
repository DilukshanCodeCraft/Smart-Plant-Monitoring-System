import { useCallback, useEffect, useRef, useState } from 'react';

export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [mimeType, setMimeType] = useState('audio/webm');
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  const stopStreamTracks = useCallback(() => {
    if (mediaRecorderRef.current?.stream) {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
    }
  }, []);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);

    mediaRecorderRef.current = recorder;
    chunksRef.current = [];
    setMimeType(recorder.mimeType || 'audio/webm');

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = () => {
      const nextBlob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });

      setAudioBlob(nextBlob);
      setAudioUrl((previousUrl) => {
        if (previousUrl) {
          URL.revokeObjectURL(previousUrl);
        }

        return URL.createObjectURL(nextBlob);
      });
      stopStreamTracks();
    };

    recorder.start();
    setIsRecording(true);
  }, [stopStreamTracks]);

  const stop = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

  const clear = useCallback(() => {
    setAudioBlob(null);
    setAudioUrl((previousUrl) => {
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }

      return null;
    });
    chunksRef.current = [];
  }, []);

  useEffect(() => () => {
    stopStreamTracks();

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }
  }, [audioUrl, stopStreamTracks]);

  return {
    isRecording,
    audioUrl,
    audioBlob,
    mimeType,
    start,
    stop,
    clear
  };
}