# Smart Plant Monitoring System

This workspace contains a MERN application, an ESP32 device sketch, and the database bootstrap needed for the Smart Plant Monitoring System.

## Structure

- `backend`: Express + MongoDB API for readings storage and ESP32 command proxying.
- `frontend`: React dashboard for monitoring state, latest finalized batch, and actuator controls.
- `esp32`: Uploadable ESP32 sketch with full-batch persistence after each completed 10-interval cycle.

## Setup

1. Copy `backend/.env.example` to `backend/.env`.
2. Set `MONGODB_URI` to your Atlas connection string.
3. Set `ESP32_BASE_URL` to the ESP32 local HTTP address, for example `http://192.168.1.40`.
4. Optional: set `TELEGRAM_BOT_TOKEN` in `backend/.env` if you want Telegram reading alerts.
4. Run `npm install` in the workspace root.
5. Run `npm run init:db` to create the `smartplant` database collection and indexes.
6. Run `npm run dev` to start backend and frontend together.
7. Update `WIFI_SSID`, `WIFI_PASSWORD`, and `BACKEND_URL` in `esp32/SmartPlantNode.ino` before uploading to the board.

## MongoDB Atlas creation behavior

The backend uses the `smartplant` database name from your connection string. On startup or when `npm run init:db` is executed, it:

- connects to Atlas
- creates the `readings` collection if it does not exist
- syncs Mongoose indexes for latest-reading lookups

## Backend routes

### Readings

- `POST /api/readings`: accepts finalized full 10-interval batches from the ESP32.
- `GET /api/readings/latest`: returns the latest saved batch with `batchType`, `roundsUsed`, and `monitoringSessionId`.

### Dashboard

- `GET /api/dashboard/overview`: returns current ESP32 status and the latest finalized reading in a single response.

### Telegram notifications

- Open your bot in Telegram and send `/start` at least once so Telegram creates a private chat for the backend to discover.
- `GET /api/notifications/telegram/status`: reports whether the bot token is configured and whether a private chat is available.
- `POST /api/notifications/telegram/send-latest`: sends the latest saved reading, a short interpretation, and the recommended action to the linked Telegram chat.
- Every newly stored finalized reading now also attempts to push the same summary automatically.

### Device proxy routes

- `GET /api/device/status`
- `GET /api/device/monitor/on`
- `GET /api/device/monitor/off`
- `GET /api/device/light/on`
- `GET /api/device/light/off`
- `GET /api/device/fan/on`
- `GET /api/device/fan/off`
- `GET /api/device/water/on`
- `GET /api/device/water/off`
- `GET /api/device/pest/on`
- `GET /api/device/pest/off`
- `GET /api/device/nutri/on`
- `GET /api/device/nutri/off`
- `GET /api/device/sleep`

## Monitoring stop behavior

When `MONITOR OFF` is triggered on the dashboard, the backend calls the ESP32 `/api/monitor/off` route. The ESP32 then:

1. finalizes the current interval with whatever valid samples have already been captured
2. checks whether all 10 intervals in the current cycle have completed
3. sends the averaged batch to the backend only when a full 10-interval cycle is available
4. discards the unfinished cycle when fewer than 10 intervals were completed
5. resets only the monitoring batch state so WiFi, API routes, and actuator commands remain active

When `MONITOR ON` is triggered, the ESP32 starts a brand-new monitoring session, resets round and batch state, and begins again from round 1 with a new `monitoringSessionId`.

## Time-series regression model pipeline

The backend now includes a complete machine learning training pipeline for time-series regression under `backend/ml`.

Pipeline coverage:

- Data loading from MongoDB (`roundreadings` by default)
- Missing value handling and outlier clipping
- Feature engineering (time, lag, rolling, and interaction features)
- Categorical variable handling with one-hot encoding
- Time-based train/validation/test split (no random leakage)
- Multi-model comparison (Linear, Random Forest, HistGradientBoosting)
- Evaluation with MAE, RMSE, MAPE, and R2
- Artifact export: model file, report JSON, predictions CSV, and EDA plots

Install ML dependencies:

```bash
pip install -r backend/ml/requirements.txt
```

Train model (default target: next-step soil moisture):

```bash
npm run ml:train
```

Target-specific shortcuts:

```bash
npm run ml:train:soil
npm run ml:train:weight
```

Run inference from latest data using the trained model:

```bash
npm run ml:predict
```

Artifacts are generated in `backend/ml/artifacts`.