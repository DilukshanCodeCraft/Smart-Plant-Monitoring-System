const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireStringEnv(name) {
  const value = process.env[name];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${name} must be configured in backend/.env.`);
  }

  return value.trim();
}

function requireNumberEnv(name) {
  const rawValue = requireStringEnv(name);
  const parsed = Number(rawValue);

  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a valid number in backend/.env.`);
  }

  return parsed;
}

function optionalStringEnv(name) {
  const value = process.env[name];

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

module.exports = {
  nodeEnv: typeof process.env.NODE_ENV === 'string' && process.env.NODE_ENV.trim().length > 0
    ? process.env.NODE_ENV.trim()
    : null,
  port: requireNumberEnv('PORT'),
  mongodbUri: requireStringEnv('MONGODB_URI'),
  esp32BaseUrl: requireStringEnv('ESP32_BASE_URL').replace(/\/+$/, ''),
  deviceRequestTimeoutMs: requireNumberEnv('DEVICE_REQUEST_TIMEOUT_MS'),
  deviceCommandRetries: requireNumberEnv('DEVICE_COMMAND_RETRIES'),
  deviceRetryDelayMs: requireNumberEnv('DEVICE_RETRY_DELAY_MS'),
  usbLuxSerialPort: optionalStringEnv('USB_LUX_SERIAL_PORT'),
  usbLuxSerialBaudRate: Number.isFinite(Number(process.env.USB_LUX_SERIAL_BAUD_RATE))
    ? Number(process.env.USB_LUX_SERIAL_BAUD_RATE)
    : 115200,
  telegramBotToken: optionalStringEnv('TELEGRAM_BOT_TOKEN')
};
