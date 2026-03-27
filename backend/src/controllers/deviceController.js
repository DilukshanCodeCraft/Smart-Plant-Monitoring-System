const { AppError, asyncHandler } = require('../middleware/errorHandler');
const { requestDeviceCommand } = require('../services/deviceService');
const { markMonitoringOn, markMonitoringOff } = require('../services/monitoringProgressService');
const { getUsbLuxStatusSnapshot, setUsbLuxMonitoringState, resetBoard2Rounds, setManualRoomOverride } = require('../services/usbLuxBoardService');

const MONITOR_COMMAND_TIMEOUT_MS = 1400;

const ACTUATOR_COMMAND_MAP = {
  light: {
    on: 'lightOn',
    off: 'lightOff'
  },
  fan: {
    on: 'fanOn',
    off: 'fanOff'
  },
  water: {
    on: 'waterOn',
    off: 'waterOff'
  },
  pest: {
    on: 'pestOn',
    off: 'pestOff'
  },
  nutri: {
    on: 'nutriOn',
    off: 'nutriOff'
  }
};

function buildCommandResponse(deviceResponse) {
  return {
    message: deviceResponse.message || 'Command completed.',
    monitoring: typeof deviceResponse.monitoring === 'boolean' ? deviceResponse.monitoring : undefined,
    monitoringSessionId: deviceResponse.monitoringSessionId ?? null,
    finalizedBatchSent: Boolean(deviceResponse.finalizedBatchSent),
    batchType: deviceResponse.batchType ?? null,
    roundsUsed: typeof deviceResponse.roundsUsed === 'number' ? deviceResponse.roundsUsed : null,
    deviceResponse
  };
}

const getStatusHandler = asyncHandler(async (req, res) => {
  const deviceStatus = await requestDeviceCommand('status');
  res.json({ deviceStatus });
});

const getSecondaryStatusHandler = asyncHandler(async (req, res) => {
  const status = getUsbLuxStatusSnapshot();
  // Add 'ok' field for frontend compatibility
  const ok = Boolean(status.connected && status.isStale === false);
  res.json({ ok, status });
});

const secondaryMonitorHandler = asyncHandler(async (req, res) => {
  const enabled = req.params.state === 'on' ? true : req.params.state === 'off' ? false : null;

  if (enabled === null) {
    throw new AppError(400, 'Invalid secondary monitoring state. Use /on or /off.');
  }

  const result = setUsbLuxMonitoringState(enabled);
  res.json({
    message: `Board 2 monitor ${enabled ? 'ON' : 'OFF'} command sent.`,
    ...result
  });
});

const secondaryOverrideRoomHandler = asyncHandler(async (req, res) => {
  const { room } = req.body;
  setManualRoomOverride(room);
  res.json({ message: room ? `Room manually overridden to: ${room}` : 'Room override cleared.' });
});

const monitorHandler = asyncHandler(async (req, res) => {
  const commandName = req.params.state === 'on' ? 'monitorOn' : req.params.state === 'off' ? 'monitorOff' : null;
  const requestedState = req.params.state;

  if (!commandName) {
    throw new AppError(400, 'Invalid monitoring state. Use /on or /off.');
  }

  let deviceResponse = null;
  try {
    deviceResponse = await requestDeviceCommand(commandName, {
      timeoutMs: MONITOR_COMMAND_TIMEOUT_MS,
      retries: 0,
      retryDelayMs: 0
    });
  } catch (error) {
    const statusCode = error?.details?.statusCode;
    const deviceError = error?.details?.deviceResponse?.error;

    if (statusCode === 404 && deviceError === 'not_found') {
      const statusPayload = await requestDeviceCommand('status', {
        timeoutMs: MONITOR_COMMAND_TIMEOUT_MS,
        retries: 0,
        retryDelayMs: 0
      });

      const monitoring = typeof statusPayload?.monitoring === 'boolean'
        ? statusPayload.monitoring
        : typeof statusPayload?.monitoringEnabled === 'boolean'
          ? statusPayload.monitoringEnabled
          : null;

      if (requestedState === 'on' && monitoring === true) {
        markMonitoringOn(statusPayload.monitoringSessionId ?? null);
        res.json({
          message: 'Board 1 firmware does not expose /api/monitor/on, but monitoring is already ON.',
          monitoring: true,
          monitoringSessionId: statusPayload.monitoringSessionId ?? null,
          finalizedBatchSent: false,
          batchType: null,
          roundsUsed: null,
          deviceResponse: statusPayload
        });
        return;
      }

      if (requestedState === 'off' && monitoring === false) {
        markMonitoringOff(statusPayload.monitoringSessionId ?? null);
        res.json({
          message: 'Board 1 firmware does not expose /api/monitor/off, but monitoring is already OFF.',
          monitoring: false,
          monitoringSessionId: statusPayload.monitoringSessionId ?? null,
          finalizedBatchSent: false,
          batchType: null,
          roundsUsed: null,
          deviceResponse: statusPayload
        });
        return;
      }

      throw new AppError(
        501,
        'Board 1 firmware does not support monitor on/off endpoints. Flash firmware that exposes /api/monitor/on and /api/monitor/off.',
        {
          requestedState,
          statusPayload
        }
      );
    }

    throw error;
  }

  if (requestedState === 'on') {
    resetBoard2Rounds(); // clear Board 2 lux/beacon buffers for the new session
    markMonitoringOn(deviceResponse.monitoringSessionId ?? null);
  } else {
    markMonitoringOff(deviceResponse.monitoringSessionId ?? null);
  }

  res.json(buildCommandResponse(deviceResponse));
});

const actuatorHandler = asyncHandler(async (req, res) => {
  const actuator = ACTUATOR_COMMAND_MAP[req.params.actuator];
  const commandName = actuator?.[req.params.state];

  if (!commandName) {
    throw new AppError(400, 'Invalid actuator route.');
  }

  const deviceResponse = await requestDeviceCommand(commandName);
  res.json(buildCommandResponse(deviceResponse));
});

const sleepHandler = asyncHandler(async (req, res) => {
  const deviceResponse = await requestDeviceCommand('sleep');
  res.json(buildCommandResponse(deviceResponse));
});

module.exports = {
  getStatusHandler,
  getSecondaryStatusHandler,
  secondaryMonitorHandler,
  secondaryOverrideRoomHandler,
  monitorHandler,
  actuatorHandler,
  sleepHandler
};
