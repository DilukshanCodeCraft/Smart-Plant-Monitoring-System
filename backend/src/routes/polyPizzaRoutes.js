const express = require('express');
const https = require('https');
const http = require('http');
const { AppError } = require('../middleware/errorHandler');

const router = express.Router();

const POLY_API_HOST = 'api.poly.pizza';
const POLY_API_BASE = '/v1.1';

function getApiKey() {
  const k = process.env.POLY_PIZZA_API_KEY;
  return typeof k === 'string' && k.trim().length > 0 ? k.trim() : null;
}

function polyRequest(path, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const key = getApiKey();
    if (!key) {
      return reject(new AppError(503, 'POLY_PIZZA_API_KEY is not configured in backend/.env'));
    }

    const options = {
      hostname: POLY_API_HOST,
      port: 443,
      path: `${POLY_API_BASE}${path}`,
      method: 'GET',
      headers: {
        'X-Api-Key': key,
        'Accept': 'application/json',
        'User-Agent': 'SmartPlantMonitor/1.0'
      },
      timeout: timeoutMs
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(body), headers: res.headers });
          } catch (_) {
            resolve({ status: res.statusCode, json: null, raw: body, headers: res.headers });
          }
        } else {
          reject(new AppError(
            res.statusCode === 401 || res.statusCode === 403 ? 502 : res.statusCode,
            `Poly Pizza API responded ${res.statusCode}: ${body.slice(0, 120)}`
          ));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new AppError(504, 'Poly Pizza API request timed out'));
    });

    req.on('error', (err) => {
      reject(new AppError(502, `Poly Pizza API connection error: ${err.message}`));
    });

    req.end();
  });
}

// ── GET /api/poly-pizza/status ──────────────────────────────────────────────
router.get('/status', async (_req, res) => {
  const key = getApiKey();
  if (!key) {
    return res.json({ success: true, data: { configured: false, working: false, message: 'POLY_PIZZA_API_KEY not set in backend/.env' } });
  }

  try {
    await polyRequest('/search?q=room&limit=1');
    res.json({ success: true, data: { configured: true, working: true, message: 'Poly Pizza API key is active and working.' } });
  } catch (err) {
    res.json({ success: true, data: { configured: true, working: false, message: err.message } });
  }
});

// ── GET /api/poly-pizza/search?q=&limit=&Category= ───────────────────────────
router.get('/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || 'room').trim().slice(0, 128);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 12, 1), 24);
    const offset = parseInt(req.query.offset) || 0;
    const category = req.query.Category ? `&Category=${encodeURIComponent(req.query.Category)}` : '';
    const format = req.query.format ? `&format=${encodeURIComponent(req.query.format)}` : '';

    const apiPath = `/search?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}${category}${format}`;
    const result = await polyRequest(apiPath);
    res.json({ success: true, data: result.json });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/poly-pizza/model/:publicId ─────────────────────────────────────
router.get('/model/:publicId', async (req, res, next) => {
  try {
    const id = req.params.publicId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id) throw new AppError(400, 'Invalid model ID');

    const result = await polyRequest(`/model/${id}`);
    res.json({ success: true, data: result.json });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/poly-pizza/download/:publicId ──────────────────────────────────
// Proxies the GLB binary to the browser so CORS is not an issue and the API
// key never leaks to the client.
router.get('/download/:publicId', async (req, res, next) => {
  try {
    const id = req.params.publicId.replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id) throw new AppError(400, 'Invalid model ID');

    // Fetch model metadata to get the download URL
    const meta = await polyRequest(`/model/${id}`);
    const modelData = meta.json;

    // Try common field names across API versions
    const downloadUrl =
      modelData?.DownloadUrl ||
      modelData?.downloadUrl ||
      modelData?.Download ||
      modelData?.download ||
      modelData?.glbUrl ||
      modelData?.GltfUrl;

    if (!downloadUrl) {
      throw new AppError(404, `No downloadable GLB URL found for model "${id}". Model data: ${JSON.stringify(modelData).slice(0, 200)}`);
    }

    // Stream the binary file through this server
    const parsed = new URL(downloadUrl);
    const client = parsed.protocol === 'https:' ? https : http;

    const fileReq = client.get(downloadUrl, (fileRes) => {
      if (fileRes.statusCode !== 200) {
        return res.status(502).json({ success: false, error: `Remote file server returned ${fileRes.statusCode}` });
      }

      res.setHeader('Content-Type', 'model/gltf-binary');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (fileRes.headers['content-length']) {
        res.setHeader('Content-Length', fileRes.headers['content-length']);
      }

      fileRes.pipe(res);
    });

    fileReq.on('error', (err) => next(new AppError(502, `Model binary download failed: ${err.message}`)));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
