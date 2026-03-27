const express = require('express');
const multer = require('multer');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const fsPromises = fs.promises;

const router = express.Router();

const upload = multer({
  dest: path.join(os.tmpdir(), 'arthropod-uploads'),
  limits: {
    fileSize: 500 * 1024 * 1024
  }
});

function getPythonCommand() {
  const configured = String(process.env.ARTHROPOD_PYTHON_BIN || '').trim();
  if (configured) {
    return configured;
  }

  return process.platform === 'win32' ? 'python' : 'python3';
}

function buildDetectionScript() {
  return `import json
import os
import sys
import traceback
from pathlib import Path


def safe_float(value, default=0.0):
    try:
        return float(value)
    except Exception:
        return default


def run_detection(video_path, conf_threshold, output_dir):
    from ultralytics import YOLO
    from huggingface_hub import hf_hub_download
    import torch

    model_repo = os.getenv('ARTHROPOD_MODEL_REPO', 'edgaremy/arthropod-detector')
    model_filename = os.getenv('ARTHROPOD_MODEL_FILENAME', 'yolo11l_ArthroNat+flatbug.pt')
    hf_token = os.getenv('HF_TOKEN') or None
    image_size = int(os.getenv('ARTHROPOD_IMAGE_SIZE', '960'))
    use_augment = os.getenv('ARTHROPOD_AUGMENT', 'false').lower() in {'1', 'true', 'yes', 'on'}
    vid_stride = max(1, int(os.getenv('ARTHROPOD_VID_STRIDE', '2')))

    weights_path = hf_hub_download(
        repo_id=model_repo,
        filename=model_filename,
        token=hf_token
    )

    model = YOLO(weights_path)
    use_half = bool(torch.cuda.is_available())

    prediction_stream = model.predict(
        source=video_path,
        save=True,
        imgsz=image_size,
        conf=conf_threshold,
        half=use_half,
        stream=True,
        augment=use_augment,
        vid_stride=vid_stride,
        project=output_dir,
        name='predict',
        exist_ok=True,
        verbose=False
    )

    detections = []
    arthropod_counts = {}
    frames_with_detections = 0
    total_frames = 0

    for frame_index, result in enumerate(prediction_stream, start=1):
        total_frames = frame_index
        boxes = result.boxes

        if boxes is None or len(boxes) == 0:
            continue

        frames_with_detections += 1

        names = result.names if isinstance(result.names, dict) else {}

        for box in boxes:
            class_index = int(box.cls[0].item()) if hasattr(box.cls, '__len__') else int(box.cls)
            confidence = safe_float(box.conf[0].item()) if hasattr(box.conf, '__len__') else safe_float(box.conf)
            class_name = names.get(class_index, str(class_index))

            xyxy = box.xyxy[0].tolist()

            detections.append({
                'frame': frame_index,
                'class': class_name,
                'confidence': round(confidence, 4),
                'box': {
                    'x1': round(safe_float(xyxy[0]), 1),
                    'y1': round(safe_float(xyxy[1]), 1),
                    'x2': round(safe_float(xyxy[2]), 1),
                    'y2': round(safe_float(xyxy[3]), 1)
                }
            })

            arthropod_counts[class_name] = arthropod_counts.get(class_name, 0) + 1

    predict_dir = Path(output_dir) / 'predict'
    annotated_video = None

    if predict_dir.exists() and predict_dir.is_dir():
        for item in sorted(predict_dir.iterdir()):
            if item.is_file() and item.suffix.lower() in {'.mp4', '.mov', '.avi', '.mkv', '.webm'}:
                annotated_video = str(item)
                break

    if frames_with_detections > 0:
        summary = (
            f'Detected arthropods in {frames_with_detections} frames out of {total_frames}. '
            f'Main types: {", ".join(sorted(arthropod_counts.keys()))}'
        )
    else:
        summary = 'No arthropods detected in this video.'

    return {
        'model': {
            'repo': model_repo,
            'filename': model_filename,
            'weights_path': str(weights_path)
        },
        'config': {
          'imgsz': image_size,
            'conf': conf_threshold,
            'half': use_half,
          'augment': use_augment,
          'stream': True,
          'vid_stride': vid_stride
        },
        'total_frames': total_frames,
        'frames_with_detections': frames_with_detections,
        'detections': detections,
        'arthropod_counts': arthropod_counts,
        'summary': summary,
        'annotated_video': annotated_video
    }


if __name__ == '__main__':
    video_path = sys.argv[1]
    conf_threshold = float(sys.argv[2]) if len(sys.argv) > 2 else 0.15
    output_dir = sys.argv[3] if len(sys.argv) > 3 else '.'

    try:
        payload = run_detection(video_path, conf_threshold, output_dir)
        print('ARTHROPOD_JSON::' + json.dumps(payload, separators=(',', ':')))
    except Exception as exc:
        error_payload = {
            'error': str(exc),
            'trace': traceback.format_exc(limit=3)
        }
        print('ARTHROPOD_JSON::' + json.dumps(error_payload, separators=(',', ':')))
        sys.exit(1)
`;
}

function extractResultJson(stdout, stderr) {
  const marker = 'ARTHROPOD_JSON::';
  const combinedOutput = `${stdout || ''}\n${stderr || ''}`;
  const markerIndex = combinedOutput.lastIndexOf(marker);

  if (markerIndex === -1) {
    return null;
  }

  const jsonText = combinedOutput.slice(markerIndex + marker.length).trim().split(/\r?\n/)[0];
  return jsonText || null;
}

function buildDebugTail(stdout, stderr, maxLength = 2200) {
  const combinedOutput = `${stdout || ''}\n${stderr || ''}`.trim();
  if (combinedOutput.length <= maxLength) {
    return combinedOutput;
  }

  return combinedOutput.slice(combinedOutput.length - maxLength);
}

router.post('/detect', upload.single('file'), async (req, res) => {
  const uploadedFile = req.file;
  const confidence = Number.parseFloat(req.body.confidence || '0.30');

  if (!uploadedFile) {
    return res.status(400).json({ error: 'No video file provided.' });
  }

  if (!Number.isFinite(confidence) || confidence <= 0 || confidence >= 1) {
    return res.status(400).json({ error: 'confidence must be a number between 0 and 1.' });
  }

  const rawExtension = path.extname(uploadedFile.originalname || '').toLowerCase();
  const safeExtension = /^\.[a-z0-9]+$/.test(rawExtension) ? rawExtension : '.mp4';
  const videoPath = `${uploadedFile.path}${safeExtension}`;
  const outputDir = path.join(os.tmpdir(), 'arthropod-results', `${Date.now()}`);
  const pythonScriptPath = path.join(outputDir, 'detect_arthropods.py');

  try {
    await fsPromises.rename(uploadedFile.path, videoPath);
    await fsPromises.mkdir(outputDir, { recursive: true });
    await fsPromises.writeFile(pythonScriptPath, buildDetectionScript(), 'utf8');

    const pythonCommand = getPythonCommand();

    let stdout = '';
    let stderr = '';

    try {
      const executionResult = await execFileAsync(
        pythonCommand,
        [pythonScriptPath, videoPath, String(confidence), outputDir],
        {
          maxBuffer: 128 * 1024 * 1024,
          env: {
            ...process.env,
            PYTHONUNBUFFERED: '1'
          }
        }
      );

      stdout = executionResult.stdout;
      stderr = executionResult.stderr;
    } catch (executionError) {
      stdout = executionError.stdout || '';
      stderr = executionError.stderr || executionError.message || '';
    }

    const serializedPayload = extractResultJson(stdout, stderr);

    if (!serializedPayload) {
      return res.status(500).json({
        error: 'Arthropod detection did not return parseable output.',
        details: buildDebugTail(stdout, stderr),
        hint: 'Install Python packages: ultralytics, huggingface_hub, and torch. Ensure ARTHROPOD_PYTHON_BIN points to that Python.'
      });
    }

    let detectionResult;
    try {
      detectionResult = JSON.parse(serializedPayload);
    } catch (parseError) {
      return res.status(500).json({
        error: 'Failed to parse arthropod detection payload.',
        details: parseError.message,
        raw: serializedPayload.slice(0, 500)
      });
    }

    if (detectionResult?.error) {
      return res.status(500).json({
        error: detectionResult.error,
        details: detectionResult.trace || null,
        hint: 'Verify Python dependencies and internet access for Hugging Face model download.'
      });
    }

    return res.json({
      success: true,
      data: detectionResult,
      outputDir,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return res.status(500).json({
      error: error.message || 'Arthropod detection failed unexpectedly.'
    });
  } finally {
    try {
      await fsPromises.unlink(videoPath);
    } catch (_ignoreUploadCleanupError) {
      // Ignore cleanup failure.
    }
  }
});

module.exports = router;
