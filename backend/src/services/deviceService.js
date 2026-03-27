const {
  esp32BaseUrl,
  deviceRequestTimeoutMs,
  deviceCommandRetries,
  deviceRetryDelayMs
} = require('../config/env');
const { AppError } = require('../middleware/errorHandler');

const DEVICE_COMMANDS = {
  status: '/api/status',
  monitorOn: '/api/monitor/on',
  monitorOff: '/api/monitor/off',
  lightOn: '/api/light/on',
  lightOff: '/api/light/off',
  fanOn: '/api/fan/on',
  fanOff: '/api/fan/off',
  waterOn: '/api/water/on',
  waterOff: '/api/water/off',
  pestOn: '/api/pest/on',
  pestOff: '/api/pest/off',
  nutriOn: '/api/nutri/on',
  nutriOff: '/api/nutri/off',
  sleep: '/api/sleep'
};

function getDeviceUrl(commandName) {
  if (!esp32BaseUrl) {
    throw new AppError(500, 'ESP32_BASE_URL is not configured. Add it to backend/.env before using device routes.');
  }

  const path = DEVICE_COMMANDS[commandName];
  if (!path) {
    throw new AppError(400, `Unsupported device command: ${commandName}`);
  }

  return `${esp32BaseUrl}${path}`;
}

async function parseResponsePayload(response) {
  const contentType = response.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return { message: text };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestDeviceCommand(commandName, options = {}) {
  const targetUrl = getDeviceUrl(commandName);
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? Math.max(250, Number(options.timeoutMs))
    : deviceRequestTimeoutMs;
  const retries = Number.isFinite(options.retries)
    ? Math.max(0, Number(options.retries))
    : deviceCommandRetries;
  const retryDelayMs = Number.isFinite(options.retryDelayMs)
    ? Math.max(0, Number(options.retryDelayMs))
    : deviceRetryDelayMs;

  const attempts = Math.max(1, retries + 1);
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(targetUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(timeoutMs)
      });

      const payload = await parseResponsePayload(response);

      if (!response.ok) {
        throw new AppError(502, 'ESP32 device returned an error response.', {
          statusCode: response.status,
          deviceResponse: payload,
          targetUrl,
          attempt,
          attempts
        });
      }

      return payload;
    } catch (error) {
      lastError = error;

      if (attempt < attempts) {
        await delay(retryDelayMs);
      }
    }
  }

  if (lastError instanceof AppError) {
    throw lastError;
  }

  throw new AppError(502, `Unable to reach ESP32 device at ${targetUrl}.`, {
    reason: lastError?.message || 'Unknown network error',
    targetUrl,
    attempts
  });
}

module.exports = {
  requestDeviceCommand
};
