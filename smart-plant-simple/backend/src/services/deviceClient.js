const axios = require('axios');

const ALLOWED_TARGETS = new Set(['monitor', 'light', 'fan', 'water', 'pest', 'nutri']);
const ALLOWED_STATES = new Set(['on', 'off']);

function getBaseUrl() {
  const value = process.env.DEVICE_BASE_URL;
  if (!value || !value.trim()) {
    throw new Error('DEVICE_BASE_URL is required. Add it to backend/.env');
  }

  return value.trim().replace(/\/+$/, '');
}

async function fetchDeviceStatus() {
  const baseUrl = getBaseUrl();

  try {
    const response = await axios.get(`${baseUrl}/status`, { timeout: 6000 });
    return response.data;
  } catch (error) {
    const details = error.response?.status
      ? `status ${error.response.status}`
      : error.message;
    throw new Error(`Device status request failed: ${details}`);
  }
}

async function sendDeviceCommand(target, state) {
  if (!ALLOWED_TARGETS.has(target)) {
    throw new Error(`Unsupported target: ${target}`);
  }

  if (!ALLOWED_STATES.has(state)) {
    throw new Error(`Unsupported state: ${state}`);
  }

  const baseUrl = getBaseUrl();

  try {
    const response = await axios.get(`${baseUrl}/${target}/${state}`, { timeout: 6000 });
    const data = response.data;

    if (typeof data === 'object' && data !== null) {
      return data;
    }

    return { message: String(data) };
  } catch (error) {
    const details = error.response?.status
      ? `status ${error.response.status}`
      : error.message;
    throw new Error(`Device command failed: ${details}`);
  }
}

module.exports = {
  fetchDeviceStatus,
  sendDeviceCommand
};
