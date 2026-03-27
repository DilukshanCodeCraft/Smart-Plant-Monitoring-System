/**
 * Smart Plant Lux Node - SECONDARY BOARD (Board 2)
 * 
 * Sensors: BH1750 (Light), WiFi RSSI beacons for location
 * USB Serial: COM3 at 115200 baud
 * Monitor Endpoints: /api/monitor/on and /api/monitor/off
 * Note: ENABLE_BACKEND_BATCH_POST = false (Board 1 is the only DB writer)
 */

#include <Arduino.h>
#include <Wire.h>
#include <BH1750.h>
#include <WiFi.h>
#include <HTTPClient.h>

// ============ WIFI / BACKEND ============
const char* WIFI_SSID = "OppoA74";
const char* WIFI_PASSWORD = "mm8wy7yb";
const char* DEVICE_ID = "ESP32-BH1750-SEC";
const char* BACKEND_URL = "http://10.223.26.223:5001/api/readings";

// *** CRITICAL: Disable Board 2 from writing to database ***
const bool ENABLE_BACKEND_BATCH_POST = false;

// Static IP for this ESP32
IPAddress local_IP(10, 223, 26, 28);
IPAddress gateway(10, 223, 26, 1);
IPAddress subnet(255, 255, 255, 0);
IPAddress primaryDNS(8, 8, 8, 8);
IPAddress secondaryDNS(8, 8, 4, 4);

// ============ I2C / BH1750 ============
#define I2C_SDA_PIN   12
#define I2C_SCL_PIN   13
#define BH1750_ADDR   0x23

// ============ TIMING ============
const unsigned long ROUND_MS = 30000UL;
const unsigned long BATCH_MS = ROUND_MS * 10UL;
const int NUM_ROUNDS = 10;
const unsigned long LUX_SAMPLE_MS = 1000UL;

BH1750 lightMeter;
WiFiServer server(80);

bool bhReady = false;
bool monitoringEnabled = false;
unsigned long monitoringSessionCounter = 0;
String monitoringSessionId = "session-0";

// ============ BEACON MAPPING ============
const char* beaconA_MAC = "50:65:83:92:e9:c4";
const char* beaconB_MAC = "04:a3:16:8d:b2:2c";
const char* beaconC_MAC = "98:7b:f3:74:d3:db";

const char* beaconA_NAME = "beaconA";
const char* beaconB_NAME = "beaconB";
const char* beaconC_NAME = "beaconC";

String currentNearestBeacon = "";
String currentNearestRoom = "";
int rssiA = -999;
int rssiB = -999;
int rssiC = -999;

// ============ ROOM MAPPING ============
const char* getRoomName(String beacon) {
  if (beacon == "beaconA") return "Living room";
  if (beacon == "beaconB") return "Bed room";
  if (beacon == "beaconC") return "Library";
  return "";
}

// ============ ROUND DATA ============
struct RoundData {
  bool luxValid = false;
  float lux = NAN;
};

struct RoundState {
  float luxSum = 0.0f;
  int luxCount = 0;
  unsigned long luxLast = 0;
  bool finalized = false;
};

RoundData rounds[NUM_ROUNDS];
RoundState rs;

unsigned long batchStartMs = 0;
int currentRoundIndex = -1;

// ============ HELPER FUNCTIONS ============
float avgOrNaN(float sum, int count) {
  return (count > 0) ? (sum / count) : NAN;
}

String jsonValue(float v, int digits = 2) {
  if (isnan(v)) return "null";
  return String(v, digits);
}

void resetRoundState() {
  rs = RoundState();
}

void resetBatchData() {
  for (int i = 0; i < NUM_ROUNDS; i++) {
    rounds[i] = RoundData();
  }
  resetRoundState();
  currentRoundIndex = -1;
  batchStartMs = millis();
}

void beginNewMonitoringSession() {
  monitoringSessionCounter++;
  monitoringSessionId = "session-" + String(monitoringSessionCounter);
  resetBatchData();
  Serial.println("[MONITOR] New session: " + monitoringSessionId);
}

// ============ BLE / BEACON SCANNING ============
void scanNearestBeacon() {
  // Scan WiFi networks to find BLE beacon devices by RSSI
  int n = WiFi.scanNetworks();
  
  rssiA = -999;
  rssiB = -999;
  rssiC = -999;

  for (int i = 0; i < n; i++) {
    String bssid = WiFi.BSSIDstr(i);
    bssid.toLowerCase();
    int rssi = WiFi.RSSI(i);

    if (bssid == beaconA_MAC) rssiA = rssi;
    else if (bssid == beaconB_MAC) rssiB = rssi;
    else if (bssid == beaconC_MAC) rssiC = rssi;
  }

  // Determine nearest beacon
  if (rssiA > rssiB && rssiA > rssiC && rssiA != -999) {
    currentNearestBeacon = beaconA_NAME;
    currentNearestRoom = getRoomName("beaconA");
  } else if (rssiB > rssiA && rssiB > rssiC && rssiB != -999) {
    currentNearestBeacon = beaconB_NAME;
    currentNearestRoom = getRoomName("beaconB");
  } else if (rssiC > rssiA && rssiC > rssiB && rssiC != -999) {
    currentNearestBeacon = beaconC_NAME;
    currentNearestRoom = getRoomName("beaconC");
  }

  if (currentNearestBeacon.length() > 0) {
    Serial.printf("[BEACON] Nearest: %s (%s) RSSI: %d\n", 
                  currentNearestBeacon.c_str(), currentNearestRoom.c_str(), 
                  max({rssiA, rssiB, rssiC}));
  }
}

// ============ WEB SERVER ============
void handleWebClient() {
  WiFiClient client = server.available();
  if (!client) return;

  unsigned long timeout = millis();
  while (client.connected() && !client.available() && millis() - timeout < 1000) {
    delay(1);
  }

  if (!client.available()) {
    client.stop();
    return;
  }

  String req = client.readStringUntil('\r');
  client.readStringUntil('\n');

  while (client.available()) {
    String line = client.readStringUntil('\n');
    if (line == "\r" || line.length() <= 1) break;
  }

  // Handle /api/status
  if (req.indexOf("GET /api/status") >= 0) {
    String body = "{\"deviceStatus\":{\"deviceId\":\"" + String(DEVICE_ID) + 
                  "\",\"ip\":\"" + WiFi.localIP().toString() + 
                  "\",\"wifiConnected\":" + (WiFi.status() == WL_CONNECTED ? "true" : "false") +
                  ",\"monitoringEnabled\":" + (monitoringEnabled ? "true" : "false") +
                  ",\"monitoringSessionId\":\"" + monitoringSessionId + 
                  "\",\"currentRound\":" + (currentRoundIndex + 1) + 
                  ",\"bhReady\":" + (bhReady ? "true" : "false") +
                  ",\"nearestBeacon\":\"" + currentNearestBeacon + 
                  "\",\"nearestRoom\":\"" + currentNearestRoom + 
                  "\",\"latestLux\":" + jsonValue(rounds[currentRoundIndex >= 0 ? currentRoundIndex : 0].lux) + 
                  "}}";
    
    client.println("HTTP/1.1 200 OK");
    client.println("Content-Type: application/json");
    client.println("Access-Control-Allow-Origin: *");
    client.println("Connection: close");
    client.println();
    client.println(body);
  }
  // Handle /api/monitor/on
  else if (req.indexOf("GET /api/monitor/on") >= 0) {
    monitoringEnabled = true;
    beginNewMonitoringSession();
    
    String response = "{\"status\":\"monitoring_started\",\"sessionId\":\"" + monitoringSessionId + "\"}";
    client.println("HTTP/1.1 200 OK");
    client.println("Content-Type: application/json");
    client.println("Access-Control-Allow-Origin: *");
    client.println("Connection: close");
    client.println();
    client.println(response);
    
    Serial.println("[WEB] MONITOR ON - Session: " + monitoringSessionId);
  }
  // Handle /api/monitor/off
  else if (req.indexOf("GET /api/monitor/off") >= 0) {
    monitoringEnabled = false;
    
    String response = "{\"status\":\"monitoring_stopped\",\"sessionId\":\"" + monitoringSessionId + "\"}";
    client.println("HTTP/1.1 200 OK");
    client.println("Content-Type: application/json");
    client.println("Access-Control-Allow-Origin: *");
    client.println("Connection: close");
    client.println();
    client.println(response);
    
    Serial.println("[WEB] MONITOR OFF - Session: " + monitoringSessionId);
  }
  // 404
  else {
    client.println("HTTP/1.1 404 Not Found");
    client.println("Content-Type: text/plain");
    client.println("Connection: close");
    client.println();
    client.println("Endpoint not found");
  }

  delay(1);
  client.stop();
}

// ============ SETUP ============
void setup() {
  Serial.begin(115200);
  delay(1000);

  // Initialize I2C
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  delay(200);

  // Initialize BH1750
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, BH1750_ADDR, &Wire)) {
    bhReady = true;
    Serial.println("✅ BH1750 initialized successfully");
  } else {
    Serial.println("❌ BH1750 initialization failed");
  }

  // Connect to WiFi
  Serial.print("Connecting to WiFi");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000UL) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("✅ WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("❌ WiFi connection failed");
  }

  // Start web server
  server.begin();

  Serial.println("\n✅ Smart Plant Lux Node (Board 2) initialized");
  Serial.println("📡 Web server listening on port 80");
  Serial.println("🔴 DATABASE POSTING DISABLED (ENABLE_BACKEND_BATCH_POST=false)");
  Serial.println("Available endpoints:");
  Serial.println("  - GET /api/status");
  Serial.println("  - GET /api/monitor/on");
  Serial.println("  - GET /api/monitor/off");
  Serial.println("📍 Serial output format:");
  Serial.println("  Light: {lux} lx");
  Serial.println("  RSSI -> A:{a} B:{b} C:{c}");
  Serial.println("  Nearest Corner: {beacon_name}");
}

// ============ LOOP ============
void loop() {
  handleWebClient();

  if (!monitoringEnabled || !bhReady) {
    delay(100);
    return;
  }

  unsigned long now = millis();
  unsigned long batchElapsed = now - batchStartMs;

  int newRoundIndex = batchElapsed / ROUND_MS;

  if (newRoundIndex >= NUM_ROUNDS) {
    Serial.println("✅ 10-round batch complete!");
    beginNewMonitoringSession();
    return;
  }

  if (newRoundIndex != currentRoundIndex) {
    if (currentRoundIndex >= 0 && !rs.finalized) {
      rs.finalized = true;
    }

    currentRoundIndex = newRoundIndex;
    resetRoundState();

    Serial.print("\n--- Round ");
    Serial.print(currentRoundIndex + 1);
    Serial.println(" started ---");
  }

  unsigned long roundOffset = batchElapsed % ROUND_MS;

  // LUX sampling window
  if (roundOffset >= 0 && roundOffset < 25000UL) {
    if (now - rs.luxLast >= LUX_SAMPLE_MS) {
      float lux = lightMeter.readLightLevel();
      
      if (lux >= 0) {
        rs.luxSum += lux;
        rs.luxCount++;
        Serial.print("Light: ");
        Serial.print(lux);
        Serial.println(" lx");
      }

      // Scan for nearest beacon every 5 seconds
      if (now % 5000 < 100) {
        scanNearestBeacon();
      }

      rs.luxLast = now;
    }
  }

  delay(100);
}
