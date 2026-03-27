# How This Project Works

## 1) Main Idea

This project has two parts:

- Backend API: talks to ESP32 and MongoDB.
- Frontend UI: shows plant status, round progress, and readings.

The frontend only calls the backend. It does not call ESP32 directly.

## 2) Data Sources

There are two sensor data sources:

- Live device status (`/api/status` from ESP32)
- Stored finalized batches (MongoDB)

If the device sends `latestRound`, the UI shows true per-round live values.
If the device does not send `latestRound`, the UI clearly explains that live per-round payload is unavailable.

Strict storage rule:

- Only finalized full 10-round batches are accepted and stored.
- Partial/interrupted sessions are rejected by backend validation.

## 3) Backend Endpoints

- `GET /api/health`
  - Quick health check.

- `GET /api/overview`
  - Fetches ESP32 status.
  - Upserts live `latestRound` into round records when payload is present.
  - Reads latest finalized batch and session-safe latest round from MongoDB.
  - Returns one compact dashboard payload.

- `POST /api/readings`
  - Stores finalized full 10-round batch payload sent by ESP32.
  - Optionally stores round record if payload includes `latestRound`.

- `GET /api/readings/latest`
  - Returns latest finalized batch from MongoDB.

- `GET /api/readings`
  - Returns finalized batch history rows with limit/sort.

- `GET /api/rounds`
  - Returns round records history rows with limit/sort and optional monitoringSessionId filter.

- `GET /api/device/:target/:state`
  - Proxies control commands to ESP32 (monitor/light/fan/water/pest/nutri + on/off).

## 4) Frontend Polling Logic

Every 5 seconds the UI calls `/api/overview`.

It updates:

- Monitoring state (on/off)
- Round progress (current/completed)
- Current round readings tile
- Latest batch tile
- Finalized batches table (analysis columns)
- Round records table (analysis columns)
- Device actuator states

## 5) Why This Is Simpler

- One main backend route file for core APIs.
- Small service file for device HTTP calls.
- One primary frontend page with straightforward state.
- Clear separation between live device data and stored batch data.

## 6) Important Limitation

True per-round sensor values require ESP32 to include them in `/api/status` as `latestRound`.
Without that payload, backend and frontend cannot reconstruct exact per-round values from final 10-round averages.

## 7) Required Columns

Finalized batch rows include:

- createdAt, deviceId, monitoringSessionId, batchType, roundsUsed
- rootTempC, airTempC, humidity, lux, soilPercent, mqRatio, mqPPM, weightG, weightError

Round rows include:

- createdAt, observedAt, deviceId, monitoringSessionId, roundNumber, source
- rootTempC, airTempC, humidity, lux, soilPercent, mqRatio, mqPPM, weightG, weightError
