# Deep Dive: Smart Plant Monitoring System Architecture

This document provides a comprehensive, professional-grade analysis of the **Smart Plant Monitoring System**. It covers the entire stack, from physical sensor acquisition to autonomous decision-making and machine learning.

---

## 1. High-Level Architectural Vision
The system is designed as a **Closed-Loop Cyber-Physical System (CPS)**. It does not just monitor; it reacts autonomously to maintain an ideal environment for plant growth.

### The Holistic Stack:
-   **Edge (ESP32 Node)**: Real-time sensor polling, local command execution, and direct-to-database batching.
-   **Backend (Node.js/Express Cluster)**: The "Central Nervous System." Manages data persistence, multi-device logic, and triggers the rule engine.
-   **Persistence (MongoDB)**: Stores high-frequency readings, audit logs (`ActuatorLog`), and system state (`RuleState`).
-   **Intelligence (Python/ML)**: Time-series regression for growth forecasting and image-based arthropod detection.
-   **Interface (React/Vite)**: A real-time monitoring and management dashboard.

---

## 2. Hardware: The Edge Intelligence
The ESP32 is not just a "dumb" sensor transmitter. It implements sophisticated edge patterns:

### Polling & Aggregation Logic
-   **Interval-based Sampling**: To filter sensor jitter (especially on MQ135 and Analog Soil sensors), the ESP32 captures data in **10 discrete intervals** over ~5 minutes.
-   **Local Buffering**: Data is averaged locally. A "Finalized Batch" is only transmitted if all 10 intervals complete without hardware failure.
-   **Concurrency**: Uses non-blocking `millis()` timing to sample different sensors at different frequencies (e.g., DHT11 every 2s, HX711 every 250ms).

### Direct Control API
The ESP32 hosts a **Local Web Server**. This allows the Frontend to toggle actuators (Water Pump, Grow Lights) with sub-100ms latency, bypassing the database for immediate physical feedback.

---

## 3. Backend: Autonomous Core
The backend is characterized by its strict validation and "fire-and-forget" processing pipelines.

### The Rule Engine (`ruleEngine.js`)
This is the most critical component. It implements **Industrial Automation Patterns**:
-   **Anti-Flapping Gates**:
    -   **Hysteresis Bands**: Prevents rapid toggling (e.g., turn Water ON at 35%, but don't turn OFF until 43%).
    -   **Cooldown Windows**: Forces a mandatory wait period between command cycles.
    -   **Daily Caps**: Limits the total number of operations per 24h to prevent equipment burnout or overwatering.
    -   **Consecutive Trigger Gates**: Ensures a condition (e.g., "Harmful Insect") is detected multiple times before taking irreversible action (e.g., Pesticide Spray).
-   **Rule Catalog**:
    -   `WM-1`: Soil-moisture based watering with dehydration context.
    -   `TM-1`: Temperature and humidity-based ventilation.
    -   `LL-1`: Grow light automation within daylight UTC windows.
    -   `NT-1`: Weight-stagnation based nutrient delivery.

---

## 4. Machine Learning & Predictive Analytics
The system transcends simple "Current State" monitoring by looking into the future.

-   **Time-Series Regression**: A Python-based ML layer (Scikit-Learn/PyTorch) analyzes historical `RoundReadings`. It predicts `soilPercent` and `weightG` trends 24 hours in advance.
-   **Arthropod Detection**: Uses image recognition to classify insects as "Beneficial" or "Harmful."
-   **Growth Stagnation Detection**: Combines HX711 weight data and ML to identify when a plant has stopped gaining mass, triggering nutrient recommendations.

---

## 5. User Experience & Knowledge Integration
The Frontend is designed to empower the user through data clarity.

-   **Tiered Recommendations**: Not all alerts are equal. The system generates "Urgent," "High," "Medium," or "Low" priority recommendations based on sensor severity.
-   **KBA Linking**: Every recommendation is linked to a **Knowledge Base Article (KBA)** (e.g., "overwatering-vs-underwatering"), providing the user with the "Why" behind the "What."

---

## 6. Security & Audit Trails
To ensure reliability and safety in automated environments:
-   **Actuator Logs**: Every single automated pump or light toggle is recorded with an "Audit Trail" including the exact sensor metrics that triggered the rule.
-   **Confidence Tiers**: ML-driven actions (like pesticide spray) include a confidence score (e.g., 0.85) in the log for user verification.
-   **Database Integrity**: The use of `Mongoose` schemas ensures that malformed data from a buggy ESP32 cannot corrupt the analytical datasets.

---

## 7. Summary for Developers
-   **Node.js**: Asynchronous event-loop used for high-frequency data ingestion.
-   **Mongoose**: Strict schema enforcement for IoT data.
-   **React**: Modular UI for complex state management (Charts, Logs, Controls).
-   **ESP32/Arduino**: Low-level hardware drivers and edge-averaging.
