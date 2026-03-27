# 🌿 Smart Plant Monitoring System: Functionality Guide

This document provides a comprehensive overview of how the **Smart Plant Monitoring System** functions as a unified environment.

---

## 🏗️ 1. System Architecture
The application is a **Distributed Monitoring Network** composed of four layers:

1.  **Board 1 (Primary Node)**: Physical sensor sampling + Actuator control (WiFi-enabled).
2.  **Board 2 (Lux Node)**: Optical monitoring + Location triangulation (USB-tethered).
3.  **The Backend (Node.js/MongoDB)**: The "Brain" that synchronizes data, handles alerts, and manages the database.
4.  **The Frontend (React/Vite)**: The "User Dashboard" that displays real-time data and accepts remote commands.

---

## 🔄 2. Core Functional Workflow

### A. Real-Time Ingestion
- **Polling Loop**: Every 30 seconds (1 Interval), both boards report their findings.
- **Filtering**: The backend and firmware apply **Median-of-3 High-Precision filtering** to eliminate noise and electrical spikes from sensors (especially weight and gas).
- **Socket.io Streaming**: As soon as new data arrives, it is streamed immediately to your browser dashboard via WebSockets.

### B. Batch Finalization
- **5-Minute Batches**: A complete "Session" consists of **10 Intervals** (5 minutes total).
- **Persistence**: Once all 10 intervals have been successfully completed, the backend calculates the "Averaged Trend" and writes a permanent record to the **MongoDB database**.
- **Historical Analysis**: These batch records are what you see in the "Plant Detail" and "History" tabs for long-term trend analysis.

### C. Actuator Automation (Remote Control)
- From the Dashboard, you can toggle **Lights, Fans, and Pumps**.
- **Safety Protocol**: Pumps (Water/Pesticide/Nutrition) have a built-in **5-second Auto-Off timer**. If you click "Turn Water ON," the ESP32 will automatically shut the valve after 5 seconds to prevent drawer flooding or over-watering.

---

## 🚨 3. Alert & Recommendation Logic
The system actively watches your plant's data:
- **Alert Generation**: If moisture drops below your threshold (Dry Value: 4095) or the mq135 detects high gas PPM, the backend flags an **Active Alert**.
- **AI Recommendation**: The system analyzes the current readings (e.g., Temperature: 30°C, Humidity: 20%) and generates a **Top Recommendation** (e.g., "Humidity is low. Increase watering frequency or move fan away from the plant.").

---

## 📱 4. Remote Dashboard Features
- **Field Operations**: A high-impact UI with real-time grid tiles for each sensor.
- **Monitoring Timeline**: A visual progress bar on the left shows exactly where the plant is in its current 10-interval monitoring cycle.
- **Plant Positioning**: Uses BLE trilateration to map exactly which room (Living Room, Bedroom, or Library) the plant is currently in based on proximity to wireless beacons.
