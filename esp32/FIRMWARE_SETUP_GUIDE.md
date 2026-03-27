# Smart Plant Monitoring System - ESP32 Firmware Setup Guide

## Overview

This guide provides complete, separate firmware files for both ESP32 boards in the dual-board monitoring system.

---

## Board 1: SmartPlantNode_Complete.ino (Main Board)

**Location**: `esp32/SmartPlantNode_Complete.ino`

### Sensors
- DHT11 (Humidity & Air Temperature) - [GPIO 5]
- DS18B20 (Root Temperature) - [GPIO 4]
- HX711 (Weight Scale) - [DT: GPIO 19, SCK: GPIO 18]
- MQ135 (Air Quality/PPM) - [GPIO 32]
- Soil Moisture Sensor - [GPIO 34]
- BLE Beacon Scanner (RSSI) - [50:65:83:92:e9:c4, 04:a3:16:8d:b2:2c, 98:7b:f3:74:d3:db]

### Actuators
- Grow Light - [GPIO 27]
- Wind Fan - [GPIO 23]
- Water Pump - [GPIO 15]
- Pesticide Pump - [GPIO 2]
- Nutrition Pump - [GPIO 26]

### Configuration
- **WiFi SSID**: OppoA74
- **WiFi Password**: mm8wy7yb
- **IP Address**: 10.223.26.223 (assigned via router)
- **Port**: 80 (HTTP)
- **Device ID**: ESP32-846BA2A7DBCC

### Web Endpoints
```
GET /api/status           → Returns device status, monitoring state, sensor readings
GET /api/monitor/on       → Starts 10-round monitoring session
GET /api/monitor/off      → Stops monitoring session
```

### Monitoring Cycle
- **Duration**: 10 rounds × 30 seconds = 5 minutes per session
- **Data Flow**: Collects all sensor data → Sends batch to backend at round 10

### Upload Instructions
1. Open Arduino IDE
2. Load `SmartPlantNode_Complete.ino`
3. Select: **Tools → Board → ESP32 Dev Module**
4. Select correct **COM port**
5. Click **Upload** (Baud: 115200)
6. Monitor Serial at 115200 to verify startup

---

## Board 2: SmartPlantLuxNode_Complete.ino (Secondary Board - USB)

**Location**: `esp32/SmartPlantLuxNode_Complete.ino`

### Sensors
- BH1750 (Light Intensity) - [I2C: SDA=GPIO 12, SCL=GPIO 13]
- WiFi RSSI Scanning (Beacon detection)

### No Actuators
Board 2 is read-only for sensor data.

### Configuration
- **WiFi SSID**: OppoA74
- **WiFi Password**: mm8wy7yb
- **IP Address**: 10.223.26.28 (assigned via router, or direct COM3 serial)
- **USB Port**: COM3
- **Serial Baud**: 115200
- **Device ID**: ESP32-BH1750-SEC
- **🔴 CRITICAL**: `ENABLE_BACKEND_BATCH_POST = false` (Board 2 NEVER writes to database)

### Web Endpoints
```
GET /api/status           → Returns BH1750 lux, beacon proximity, monitoring state
GET /api/monitor/on       → Aligns session with Board 1
GET /api/monitor/off      → Stops session alignment
```

### Serial Output Format
Board 2 outputs data to serial terminal for monitoring:
```
Light: <lux_value> lx
RSSI -> A:<rssi_a> B:<rssi_b> C:<rssi_c>
Nearest Corner: <beacon_name>
[MONITOR] New session: session-<n>
[WEB] MONITOR ON - Session: session-<n>
```

### Upload Instructions
1. Open Arduino IDE  
2. Load `SmartPlantLuxNode_Complete.ino`
3. Select: **Tools → Board → ESP32 Dev Module**
4. Select **COM port** (usually COM3)
5. Click **Upload** (Baud: 115200)
6. Open **Serial Monitor** (115200) to verify output

---

## Dual-Board Communication

### Data Flow
```
User Click "MONITOR ON"
        ↓
Backend: GET /device/monitor/on
        ↓
Board 1: GET /api/monitor/on ━━━━━━━━┓
                                      ├─ Both start new session
Board 2: GET /api/monitor/on ━━━━━━━-┛

During 10 Rounds:
Board 1: Collects all sensors (DHT11, DS18B20, HX711, MQ135, Soil, BLE)
Board 2: Collects BH1750 lux + Beacon RSSI + Location mapping

At Round 10 Finalization:
Board 1: Merges latest USB lux snapshot + nearest beacon/room
         → Sends complete batch to backend
         → Database SAVES with all fields
         
Board 2: Stays idle (ENABLE_BACKEND_BATCH_POST=false)
         → No duplicate records created
```

### Monitoring Flow
1. **User initiates**: "MONITOR ON" button in dashboard
2. **Backend calls Board 1**: `/api/monitor/on` → starts session-N
3. **Board 1 calls Board 2**: Adds query param to sync sessions
4. **Both boards**: Begin 10-round data collection
5. **Board 2 streams**: Serial output (USB at COM3)
6. **Round 10 completion**: Board 1 finalizes & sends batch with Board 2 snapshot
7. **User ends**: "MONITOR OFF" button
8. **Backend calls Board 1**: `/api/monitor/off` → stops session

---

## Beacon Mapping

### Beacon Hardware
| Beacon | MAC Address | Room | Pin Location |
|--------|------------|------|---|
| beaconA | 50:65:83:92:e9:c4 | Living room | Corner A |
| beaconB | 04:a3:16:8d:b2:2c | Bed room | Corner B |
| beaconC | 98:7b:f3:74:d3:db | Library | Corner C |

### Location Determination
- Board 2 scans WiFi networks for beacon MACs
- Compares RSSI strength from each beacon
- **Nearest beacon** = highest RSSI value
- Maps to room name for display

### Serial Output Example
```
[BEACON] Nearest: beaconA (Living room) RSSI: -65
```

---

## Troubleshooting

### Board 1 "MONITOR ON" Button Returns Error
**Problem**: `ESP32 device returned an error response`
- **Cause**: `/api/monitor/on` endpoint not found (old firmware)
- **Fix**: Upload `SmartPlantNode_Complete.ino` with full web handler

### Board 2 Not Responding
**Problem**: `/api/device/secondary/status` shows "Access denied" on COM3
- **Cause**: Arduino Serial Monitor open on COM3
- **Fix**: Close Arduino IDE Serial Monitor, restart backend

### Duplicate Records in Database
**Problem**: Two readings created per session instead of one
- **Cause**: Board 2 posting batches (ENABLE_BACKEND_BATCH_POST=true)
- **Fix**: Ensure `ENABLE_BACKEND_BATCH_POST = false` in SmartPlantLuxNode_Complete.ino

### WiFi Connection Fails
- Check WIFI_SSID and WIFI_PASSWORD match your network
- Verify router is in range
- Reset ESP32 and try again
- Monitor Serial output for SSID broadcast messages

---

## File Checklist

✅ **esp32/SmartPlantNode_Complete.ino** - Board 1 (Main)
✅ **esp32/SmartPlantLuxNode_Complete.ino** - Board 2 (Secondary, USB)
✅ **backend/.env** - Updated IP: 10.223.26.223
✅ **backend/src/services/readingService.js** - Has merge logic
✅ **frontend/src/pages/DashboardPage.jsx** - Shows location box

---

## Testing Checklist

After uploading both boards:

1. ✅ Navigate to `http://localhost:5173/`
2. ✅ Check dashboard: Both boards show "connected"
3. ✅ Click **"MONITOR ON"**
   - Both boards start session
   - Serial output shows "Round 1, Round 2..." etc.
4. ✅ Check **"Current Sensor Readings"** box
   - Shows BH1750 lux (from Board 2)
   - Shows nearest beacon + room location
5. ✅ After ~5 minutes (10 rounds complete)
   - Session ends automatically
   - One record saved in database (no duplicates)
6. ✅ Verify saved record contains:
   - All Board 1 sensor fields
   - BH1750 lux from Board 2
   - nearestBeacon, nearestRoom from Board 2

---

## Support

For issues, check:
- **Serial Monitor output** (115200 baud) for errors
- **Backend logs** (terminal running `npm run dev`)
- **Browser console** (F12) for frontend errors
- **Backend IP configuration** in `.env` file

