/*
 * SMART PLANT MONITORING - BOARD 1 (WiFi Main Board)
 * Updated with Serial Monitor Command Handling
 * 
 * Sensors: DHT11, DS18B20, HX711, MQ-135, Soil Moisture, BLE Beacons
 * Actuators: Grow Light (GPIO27), Fan (GPIO23), Pump (GPIO15), Pesticide (GPIO2), Nutrition (GPIO26)
 * Web Server: Port 80
 * Commands: MONITOR ON / MONITOR OFF (via Serial)
 */

#include <WiFi.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "HX711.h"
#include <ArduinoJson.h>

// ==================== WiFi Configuration ====================
const char* ssid = "OppoA74";
const char* password = "mm8wy7yb";

// ==================== Sensor Pin Definitions ====================
#define DHTPIN 5
#define DHTTYPE DHT11
#define ONE_WIRE_BUS 4
#define SOIL_PIN 34
#define MQ_AO_PIN 32
#define DT 19
#define SCK 18

// ==================== Actuator Pin Definitions ====================
#define LIGHT_PIN 27
#define FAN_PIN 23
#define PUMP_PIN 15
#define PESTICIDE_PIN 2
#define NUTRITION_PIN 26

// ==================== Sensor Objects ====================
DHT dht(DHTPIN, DHTTYPE);
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);
HX711 scale;

// ==================== Global Variables ====================
bool monitoringEnabled = false;
int currentRound = 0;
const int TOTAL_ROUNDS = 10;
const long ROUND_DURATION = 30000; // 30 seconds per round
unsigned long roundStartTime = 0;

// Sensor readings storage
struct SensorReading {
  float humidity;
  float airTemp;
  float rootTemp;
  float weight;
  float gasLevel;
  float soilMoisture;
};

SensorReading currentReading;

// Calibration
const float FINAL_FACTOR = 399.0161;
const float HARDCODED_R0 = 551167.2;

// ==================== WiFi Server ====================
WiFiServer server(80);

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n========================================");
  Serial.println("  SMART PLANT BOARD 1 - INITIALIZING");
  Serial.println("========================================\n");

  // Initialize pins
  pinMode(LIGHT_PIN, OUTPUT);
  pinMode(FAN_PIN, OUTPUT);
  pinMode(PUMP_PIN, OUTPUT);
  pinMode(PESTICIDE_PIN, OUTPUT);
  pinMode(NUTRITION_PIN, OUTPUT);
  
  digitalWrite(LIGHT_PIN, LOW);
  digitalWrite(FAN_PIN, LOW);
  digitalWrite(PUMP_PIN, LOW);
  digitalWrite(PESTICIDE_PIN, LOW);
  digitalWrite(NUTRITION_PIN, LOW);

  // Initialize sensors
  dht.begin();
  sensors.begin();
  scale.begin(DT, SCK);
  scale.set_scale(FINAL_FACTOR);
  scale.tare(4);
  analogSetAttenuation(ADC_0db);

  // Connect to WiFi
  Serial.print("🔌 Connecting to WiFi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n✅ WiFi Connected!");
    Serial.print("📍 IP Address: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n⚠️  WiFi Connection Failed");
  }

  // Start Web Server
  server.begin();
  Serial.println("🌐 Web Server Started on Port 80\n");
  
  Serial.println("Commands available via Serial:");
  Serial.println("  - MONITOR ON   : Start monitoring session");
  Serial.println("  - MONITOR OFF  : Stop monitoring session");
  Serial.println("========================================\n");
}

void loop() {
  // ==================== Handle Serial Commands ====================
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    
    if (command.equalsIgnoreCase("MONITOR ON")) {
      monitoringEnabled = true;
      currentRound = 1;
      roundStartTime = millis();
      Serial.println("\n✅ MONITOR ON - Session started (Round 1 of 10)");
      Serial.println("Duration: 5 minutes (10 rounds × 30 seconds)\n");
    }
    else if (command.equalsIgnoreCase("MONITOR OFF")) {
      monitoringEnabled = false;
      Serial.println("\n❌ MONITOR OFF - Session stopped\n");
    }
    else if (command.length() > 0) {
      Serial.println("❓ Unknown command. Use: MONITOR ON or MONITOR OFF");
    }
  }

  // ==================== Monitoring Session Logic ====================
  if (monitoringEnabled) {
    unsigned long elapsed = millis() - roundStartTime;
    
    if (elapsed >= ROUND_DURATION) {
      // Time for next round
      currentRound++;
      roundStartTime = millis();
      
      if (currentRound > TOTAL_ROUNDS) {
        monitoringEnabled = false;
        Serial.println("\n✅ Monitoring session COMPLETE - 10 rounds finished");
        Serial.println("📊 Data would be saved to database now\n");
        currentRound = 0;
        return;
      }
    }

    // Read sensors every iteration
    readAllSensors();
    
    // Print round info every second
    static unsigned long lastPrint = 0;
    if (millis() - lastPrint >= 1000) {
      Serial.print("[Round ");
      Serial.print(currentRound);
      Serial.print("/10] ");
      Serial.print("Temp: ");
      Serial.print(currentReading.airTemp);
      Serial.print("°C | Humidity: ");
      Serial.print(currentReading.humidity);
      Serial.print("% | Weight: ");
      Serial.print(currentReading.weight);
      Serial.println("g");
      
      lastPrint = millis();
    }
  }

  // ==================== Handle Web Requests ====================
  handleWebClient();
}

// ==================== Read All Sensors ====================
void readAllSensors() {
  // DHT11 (Humidity & Air Temp)
  currentReading.humidity = dht.readHumidity();
  currentReading.airTemp = dht.readTemperature();
  
  if (isnan(currentReading.humidity) || isnan(currentReading.airTemp)) {
    currentReading.humidity = 0;
    currentReading.airTemp = 0;
  }

  // DS18B20 (Root Temp)
  sensors.requestTemperatures();
  currentReading.rootTemp = sensors.getTempCByIndex(0);

  // HX711 (Weight)
  float weight = scale.get_units(1);
  if (abs(weight) < 0.05) {
    weight = 0.00;
  }
  currentReading.weight = weight;

  // MQ-135 (Gas Level - PPM)
  long sum = 0;
  for (int i = 0; i < 100; i++) {
    sum += analogRead(MQ_AO_PIN);
    delay(1);
  }
  float avgADC = sum / 100.0;
  float vout = (avgADC / 4095.0) * 1.1;
  float rs = 10000.0 * (5.0 - vout) / vout;
  float ratio = rs / HARDCODED_R0;
  currentReading.gasLevel = 110.47 * pow(ratio, -2.862);

  // Soil Moisture
  int soilRaw = 0;
  for (int i = 0; i < 10; i++) {
    soilRaw += analogRead(SOIL_PIN);
    delay(10);
  }
  soilRaw /= 10;
  currentReading.soilMoisture = map(soilRaw, 4095, 2100, 0, 100);
  currentReading.soilMoisture = constrain(currentReading.soilMoisture, 0, 100);
}

// ==================== Handle Web Client Requests ====================
void handleWebClient() {
  WiFiClient client = server.available();
  if (!client) return;

  String request = "";
  unsigned long timeout = millis() + 2000;
  while (client.available() && millis() < timeout) {
    char c = client.read();
    request += c;
  }

  // Parse request
  if (request.indexOf("GET /api/status") >= 0) {
    handleStatusRequest(client);
  }
  else if (request.indexOf("GET /api/monitor/on") >= 0) {
    handleMonitorOnRequest(client);
  }
  else if (request.indexOf("GET /api/monitor/off") >= 0) {
    handleMonitorOffRequest(client);
  }
  else if (request.indexOf("GET /api/light") >= 0) {
    if (request.indexOf("/on") >= 0) {
      digitalWrite(LIGHT_PIN, HIGH);
    } else {
      digitalWrite(LIGHT_PIN, LOW);
    }
    sendJsonResponse(client, "{\"status\":\"ok\"}");
  }
  else if (request.indexOf("GET /api/fan") >= 0) {
    if (request.indexOf("/on") >= 0) {
      digitalWrite(FAN_PIN, HIGH);
    } else {
      digitalWrite(FAN_PIN, LOW);
    }
    sendJsonResponse(client, "{\"status\":\"ok\"}");
  }
  else if (request.indexOf("GET /api/pump") >= 0) {
    if (request.indexOf("/on") >= 0) {
      digitalWrite(PUMP_PIN, HIGH);
    } else {
      digitalWrite(PUMP_PIN, LOW);
    }
    sendJsonResponse(client, "{\"status\":\"ok\"}");
  }
  else {
    client.println("HTTP/1.1 404 Not Found");
    client.println("Content-Type: application/json");
    client.println("Connection: close");
    client.println();
    client.println("{\"error\":\"Endpoint not found\"}");
  }

  delay(10);
  client.stop();
}

// ==================== /api/status ====================
void handleStatusRequest(WiFiClient& client) {
  DynamicJsonDocument doc(512);
  
  doc["deviceId"] = "ESP32-" + String((uint32_t)ESP.getEfuseMac(), HEX);
  doc["timestamp"] = millis();
  doc["monitoringEnabled"] = monitoringEnabled;
  doc["currentRound"] = currentRound;
  doc["totalRounds"] = TOTAL_ROUNDS;
  
  doc["sensors"]["humidity"] = currentReading.humidity;
  doc["sensors"]["airTemp"] = currentReading.airTemp;
  doc["sensors"]["rootTemp"] = currentReading.rootTemp;
  doc["sensors"]["weight"] = currentReading.weight;
  doc["sensors"]["gasLevel"] = currentReading.gasLevel;
  doc["sensors"]["soilMoisture"] = currentReading.soilMoisture;

  String response;
  serializeJson(doc, response);
  sendJsonResponse(client, response);
}

// ==================== /api/monitor/on ====================
void handleMonitorOnRequest(WiFiClient& client) {
  monitoringEnabled = true;
  currentRound = 1;
  roundStartTime = millis();

  DynamicJsonDocument doc(256);
  doc["status"] = "monitoring_started";
  doc["sessionId"] = millis();
  doc["totalRounds"] = TOTAL_ROUNDS;
  doc["expectedDuration"] = "5 minutes";

  String response;
  serializeJson(doc, response);
  sendJsonResponse(client, response);

  Serial.println("🟢 [WEB] MONITOR ON triggered via /api/monitor/on");
}

// ==================== /api/monitor/off ====================
void handleMonitorOffRequest(WiFiClient& client) {
  monitoringEnabled = false;

  DynamicJsonDocument doc(256);
  doc["status"] = "monitoring_stopped";
  doc["roundsCompleted"] = currentRound;

  String response;
  serializeJson(doc, response);
  sendJsonResponse(client, response);

  Serial.println("🔴 [WEB] MONITOR OFF triggered via /api/monitor/off");
}

// ==================== Send JSON Response ====================
void sendJsonResponse(WiFiClient& client, String jsonData) {
  client.println("HTTP/1.1 200 OK");
  client.println("Content-Type: application/json");
  client.println("Content-Length: " + String(jsonData.length()));
  client.println("Connection: close");
  client.println();
  client.println(jsonData);
}
