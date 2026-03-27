# 🛠️ ESP32 Firmware Technical Overview

This document explains the logic, sensor integration, and communication protocols for the two ESP32 nodes powering the **Smart Plant Monitoring System**.

---

## 1. Board 1: Main Monitoring Node (`SmartPlantNode_FINAL.ino`)
Board 1 is the "Primary Controller." it handles the core environmental sensors, the water/light/fan actuators, and manages the primary WiFi communication.

### 📡 Sensors & Pin Mapping
| Sensor | Metric | Pin | Signal Processing |
| :--- | :--- | :--- | :--- |
| **DHT11** | Air Temp & Humidity | GPIO 5 | **Median-of-3 Filter**: Rejects spikes. |
| **DS18B20** | Root Temperature | GPIO 4 | **Median-of-3 Filter**: OneWire protocol. |
| **Soil Moisture**| Water Content (%) | GPIO 34 | **Median-of-3 Filter**: Analog ADC parsing. |
| **MQ135** | Gas/Air Quality (PPM) | GPIO 32 | **Median-of-3 Filter**: Log-log curve parsing. |
| **HX711** | Plant Weight (g) | GPIO 18/19 | **Hybrid Filter**: Median-of-3 + 15-sample mean. |

### ⚙️ Actuator Control
Board 1 controls five physical outputs via relays/transistors:
- **Grow Light**: GPIO 27
- **Wind Fan**: GPIO 23
- **Water Pump**: GPIO 15 (Auto-off 5s)
- **Pesticide Pump**: GPIO 2 (Auto-off 5s)
- **Nutrition Pump**: GPIO 26 (Auto-off 5s)

### 🔄 Working Logic: The 30s Interval
Board 1 operates on a **Synchronized Timeline**:
1. **Interval Cycle**: Every 30 seconds is one "Interval."
2. **Phase Sampling**: Sensors are sampled in specific windows (0-3s for Root, 4-7s for Air, etc.) to prevent power fluctuations.
3. **Batching**: Every 10 Intervals (5 minutes total), the ESP32 packs all data into a JSON structure and performs an **HTTP POST** to the backend at `10.223.26.165:5001`.

---

## 2. Board 2: Lux & Location Node (`SmartPlantLuxNode_FINAL.ino`)
Board 2 is the "Secondary Node." It focuses on light intensity and tracking the plant's position within the house.

### 📡 Sensors & Pin Mapping
| Sensor | Metric | Pins | Protocol |
| :--- | :--- | :--- | :--- |
| **BH1750** | Light Intensity (Lux) | GPIO 12/13 | I2C (Address 0x23) |
| **BLE Scan** | Location / Room Tracking | Internal | Bluetooth Low Energy |

### 🔄 Working Logic: Serial Integration
- **Transport**: Unlike Board 1, Board 2 **has no WiFi**. It communicates exclusively via **USB Serial (COM3)**.
- **BLE Tracking**: It scans for three specific BLE Beacons (Living Room, Bedroom, Library). By measuring the Signal Strength (RSSI), it performs **trilateration** to estimate the plant's XY position.
- **Backend Parsing**: The Node.js backend reads the raw serial strings from Board 2 and merges the Lux values into the active monitoring session managed by Board 1.

---

## 3. Data Integration (How the App Functions)
The application acts as a "Single Source of Truth" by merging these two streams:

1. **Board 1 (WiFi)** provides the Environment Metrics (Temp/Soil/Weight) and accepts remote commands to turn on pumps/lights.
2. **Board 2 (USB)** provides the Contextual Data (Light Levels and Room Location).
3. **The Backend** aligns both nodes onto a shared **10-Interval Timeline**, ensuring that when you view "Interval 3" on the dashboard, you are seeing the combined sensors from both ESP32s at that exact moment.
