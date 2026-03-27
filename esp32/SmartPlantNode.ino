#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "HX711.h"
#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <math.h>

// ---------------- WIFI / BACKEND ----------------
const char* WIFI_SSID = "OppoA74";
const char* WIFI_PASSWORD = "mm8wy7yb";
const char* DEVICE_ID = "ESP32-846BA2A7DBCC";
const char* BACKEND_URL = "http://10.172.123.165:5001/api/readings";

// Board 1 fixed IP requested by user
IPAddress local_IP(10, 223, 26, 223);
IPAddress gateway(10, 223, 26, 1);
IPAddress subnet(255, 255, 255, 0);
IPAddress primaryDNS(8, 8, 8, 8);
IPAddress secondaryDNS(8, 8, 4, 4);

// ---------------- PINS ----------------
#define DS18B20_PIN         4
#define DHT_PIN             5
#define DHT_TYPE            DHT11
#define HX711_DT_PIN        19
#define HX711_SCK_PIN       18
#define SOIL_PIN            34
#define MQ135_AO_PIN        32

#define GROW_LIGHT_PIN      27
#define WIND_FAN_PIN        23
#define WATER_PUMP_PIN      15
#define PESTICIDE_PUMP_PIN  2
#define NUTRITION_PUMP_PIN  26

// ---------------- CALIBRATION ----------------
#define SOIL_DRY_VALUE      4095
#define SOIL_WET_VALUE      2100

const float HX711_CAL_FACTOR = 399.0161f;
const int HX711_SMOOTHING_SAMPLES = 15;
const float HX711_EMPTY_OFFSET_G = -445.07f;
const float HX711_ZERO_DEADBAND_G = 0.50f;

const float MQ135_R0 = 551167.2f;
const float MQ135_VC_VOLTS = 5.0f;
const float MQ135_RL_OHMS = 10000.0f;
const float ESP32_ADC_REF_VOLTS = 3.3f;

// ---------------- BLE BEACONS ----------------
int scanTime = 5; // seconds

String beaconA = "50:65:83:92:e9:c4";
String beaconB = "04:a3:16:8d:b2:2c";
String beaconC = "98:7b:f3:74:d3:db";

int rssiA = -999;
int rssiB = -999;
int rssiC = -999;

struct Point { float x; float y; };
Point A = {0, 0};
Point B = {2, 0};
Point C = {1, 1.73}; // equilateral triangle ~2m sides

const float TxPower = -59;
const float n = 2.5;

BLEScan* pBLEScan = nullptr;

class MyAdvertisedDeviceCallbacks : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice advertisedDevice) override {
    String mac = advertisedDevice.getAddress().toString().c_str();
    mac.toLowerCase();
    int rssi = advertisedDevice.getRSSI();

    if (mac == beaconA) rssiA = rssi;
    else if (mac == beaconB) rssiB = rssi;
    else if (mac == beaconC) rssiC = rssi;
  }
};

// ---------------- TIMING ----------------
const unsigned long ROUND_MS = 30000UL;
const int NUM_ROUNDS = 10;

const unsigned long DS_START_MS      = 0UL;
const unsigned long DS_END_MS        = 2000UL;

const unsigned long DHT_START_MS     = 3000UL;
const unsigned long DHT_END_MS       = 5000UL;

const unsigned long BLE_START_MS     = 6000UL;
const unsigned long BLE_END_MS       = 11000UL;

const unsigned long SOIL_START_MS    = 12000UL;
const unsigned long SOIL_END_MS      = 14000UL;

const unsigned long MQ_START_MS      = 15000UL;
const unsigned long MQ_END_MS        = 22000UL;

const unsigned long HX_START_MS      = 23000UL;
const unsigned long HX_END_MS        = 30000UL;

const unsigned long DS_SAMPLE_MS     = 1000UL;
const unsigned long DHT_SAMPLE_MS    = 1500UL;
const unsigned long MQ_SAMPLE_MS     = 1500UL;
const unsigned long HX_SAMPLE_MS     = 250UL;

const unsigned long AUTO_OFF_MS      = 5000UL;

// ---------------- OBJECTS ----------------
DHT dht(DHT_PIN, DHT_TYPE);
OneWire oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);
HX711 scale;
WiFiServer server(80);

// ---------------- HX711 BUFFER ----------------
float hxReadings[HX711_SMOOTHING_SAMPLES];
int hxReadIndex = 0;
float hxTotal = 0.0f;
int hxValidCount = 0;

// ---------------- SESSION / CONTROL ----------------
bool monitoringEnabled = true;
unsigned long monitoringSessionCounter = 0;
String monitoringSessionId = "session-0";

bool waterAutoOffActive = false;
unsigned long waterOnMs = 0;
bool pestAutoOffActive = false;
unsigned long pestOnMs = 0;
bool nutriAutoOffActive = false;
unsigned long nutriOnMs = 0;

// ---------------- ROUND DATA ----------------
struct RoundData {
  bool rootValid = false;
  float rootTempC = NAN;

  bool dhtValid = false;
  float airTempC = NAN;
  float humidity = NAN;

  bool bleValid = false;
  int bleRssiA = -999;
  int bleRssiB = -999;
  int bleRssiC = -999;
  float bleDistA = NAN;
  float bleDistB = NAN;
  float bleDistC = NAN;
  float bleX = NAN;
  float bleY = NAN;

  bool soilValid = false;
  int soilRaw = 0;
  int soilPercent = 0;

  bool gasValid = false;
  float mqADC = NAN;
  float mqVout = NAN;
  float mqRatio = NAN;
  float mqPPM = NAN;

  bool weightValid = false;
  float weightG = NAN;
  float weightError = NAN;
};

struct RoundState {
  float dsSum = 0.0f;
  int dsCount = 0;
  unsigned long dsLast = 0;

  float airSum = 0.0f;
  float humSum = 0.0f;
  int dhtCount = 0;
  unsigned long dhtLast = 0;

  bool bleTaken = false;
  int bleRssiA = -999;
  int bleRssiB = -999;
  int bleRssiC = -999;
  float bleDistA = NAN;
  float bleDistB = NAN;
  float bleDistC = NAN;
  float bleX = NAN;
  float bleY = NAN;

  bool soilTaken = false;
  int soilRaw = 0;
  int soilPct = 0;

  float mqAdcSum = 0.0f;
  float mqVoutSum = 0.0f;
  float mqRatioSum = 0.0f;
  float mqPpmSum = 0.0f;
  int mqCount = 0;
  unsigned long mqLast = 0;

  float hxSum = 0.0f;
  float hxErrSum = 0.0f;
  int hxCount = 0;
  unsigned long hxLast = 0;

  bool finalized = false;
};

RoundData rounds[NUM_ROUNDS];
RoundState rs;

unsigned long batchStartMs = 0;
int currentRoundIndex = -1;

// ---------------- HELPERS ----------------
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
}

void initHXBuffer() {
  for (int i = 0; i < HX711_SMOOTHING_SAMPLES; i++) {
    hxReadings[i] = 0.0f;
  }
  hxReadIndex = 0;
  hxTotal = 0.0f;
  hxValidCount = 0;
}

// ---------------- WIFI ----------------
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.config(local_IP, gateway, subnet, primaryDNS, secondaryDNS);

  Serial.print("Connecting to WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - start < 20000UL) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("WiFi connection failed.");
  }
}

// ---------------- SENSORS ----------------
float readDS18B20Original() {
  ds18b20.requestTemperatures();
  return ds18b20.getTempCByIndex(0);
}

bool readDHT11Original(float &humidity, float &temperature) {
  humidity = dht.readHumidity();
  temperature = dht.readTemperature();
  return !(isnan(humidity) || isnan(temperature));
}

int readSoilRawAverageOriginal() {
  long sum = 0;
  for (int i = 0; i < 10; i++) {
    sum += analogRead(SOIL_PIN);
    delay(10);
  }
  return sum / 10;
}

int soilRawToPercentOriginal(int rawValue) {
  int moisturePercent = map(rawValue, SOIL_DRY_VALUE, SOIL_WET_VALUE, 0, 100);
  return constrain(moisturePercent, 0, 100);
}

bool readMQ135Original(float &avgADC, float &vout, float &ratio, float &ppm) {
  long sum = 0;
  for (int i = 0; i < 100; i++) {
    sum += analogRead(MQ135_AO_PIN);
    delay(1);
  }

  avgADC = sum / 100.0f;
  vout = (avgADC / 4095.0f) * ESP32_ADC_REF_VOLTS;

  if (vout <= 0.0f || vout >= MQ135_VC_VOLTS) return false;

  float rsOhms = MQ135_RL_OHMS * (MQ135_VC_VOLTS - vout) / vout;
  ratio = rsOhms / MQ135_R0;

  if (ratio <= 0.0f || isnan(ratio) || isinf(ratio)) return false;

  ppm = 110.47f * pow(ratio, -2.862f);

  if (isnan(ppm) || isinf(ppm)) return false;

  return true;
}

bool updateHX711Original(float &meanWeight, float &plusMinus) {
  if (!scale.is_ready()) return false;

  float raw = scale.get_units(1);
  float corrected = raw - HX711_EMPTY_OFFSET_G;

  if (abs(corrected) < HX711_ZERO_DEADBAND_G) {
    corrected = 0.0f;
  }

  if (hxValidCount == HX711_SMOOTHING_SAMPLES) {
    hxTotal -= hxReadings[hxReadIndex];
  } else {
    hxValidCount++;
  }

  hxReadings[hxReadIndex] = corrected;
  hxTotal += corrected;
  hxReadIndex++;

  if (hxReadIndex >= HX711_SMOOTHING_SAMPLES) hxReadIndex = 0;

  meanWeight = hxTotal / hxValidCount;

  float sumSqDiff = 0.0f;
  for (int i = 0; i < hxValidCount; i++) {
    float diff = hxReadings[i] - meanWeight;
    sumSqDiff += diff * diff;
  }

  plusMinus = sqrt(sumSqDiff / hxValidCount);
  return true;
}

// ---------------- BLE ----------------
bool initBLEOriginal() {
  BLEDevice::init("");
  pBLEScan = BLEDevice::getScan();
  if (!pBLEScan) return false;

  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks());
  pBLEScan->setActiveScan(true);

  Serial.println("BLE initialized.");
  return true;
}

float rssiToDistance(int rssi) {
  return pow(10.0, (TxPower - rssi) / (10.0 * n));
}

Point trilaterate(float dA, float dB, float dC) {
  float x = (dA * dA - dB * dB + B.x * B.x) / (2 * B.x);
  float y = (dA * dA - dC * dC + C.x * C.x + C.y * C.y - 2 * C.x * x) / (2 * C.y);
  return {x, y};
}

bool scanBLEOriginal(int &outRssiA, int &outRssiB, int &outRssiC,
                     float &outDistA, float &outDistB, float &outDistC,
                     float &outX, float &outY) {
  if (!pBLEScan) return false;

  rssiA = rssiB = rssiC = -999;

  pBLEScan->start(scanTime, false);
  pBLEScan->clearResults();

  outRssiA = rssiA;
  outRssiB = rssiB;
  outRssiC = rssiC;

  if (rssiA == -999 || rssiB == -999 || rssiC == -999) {
    return false;
  }

  outDistA = rssiToDistance(rssiA);
  outDistB = rssiToDistance(rssiB);
  outDistC = rssiToDistance(rssiC);

  Point plant = trilaterate(outDistA, outDistB, outDistC);
  outX = plant.x;
  outY = plant.y;

  return true;
}

// ---------------- ACTUATORS ----------------
void setActuator(int pin, bool on) {
  digitalWrite(pin, on ? HIGH : LOW);
}

void turnWaterOn() {
  setActuator(WATER_PUMP_PIN, true);
  waterAutoOffActive = true;
  waterOnMs = millis();
}

void turnPestOn() {
  setActuator(PESTICIDE_PUMP_PIN, true);
  pestAutoOffActive = true;
  pestOnMs = millis();
}

void turnNutriOn() {
  setActuator(NUTRITION_PUMP_PIN, true);
  nutriAutoOffActive = true;
  nutriOnMs = millis();
}

void serviceActuatorAutoOff() {
  unsigned long now = millis();

  if (waterAutoOffActive && now - waterOnMs >= AUTO_OFF_MS) {
    setActuator(WATER_PUMP_PIN, false);
    waterAutoOffActive = false;
    Serial.println("WATER auto OFF");
  }

  if (pestAutoOffActive && now - pestOnMs >= AUTO_OFF_MS) {
    setActuator(PESTICIDE_PUMP_PIN, false);
    pestAutoOffActive = false;
    Serial.println("PEST auto OFF");
  }

  if (nutriAutoOffActive && now - nutriOnMs >= AUTO_OFF_MS) {
    setActuator(NUTRITION_PUMP_PIN, false);
    nutriAutoOffActive = false;
    Serial.println("NUTRI auto OFF");
  }
}

// ---------------- SERIAL COMMANDS ----------------
void printHelp() {
  Serial.println("Commands:");
  Serial.println("MONITOR ON / MONITOR OFF");
  Serial.println("LIGHT ON / LIGHT OFF");
  Serial.println("FAN ON / FAN OFF");
  Serial.println("WATER ON / WATER OFF");
  Serial.println("PEST ON / PEST OFF");
  Serial.println("NUTRI ON / NUTRI OFF");
  Serial.println("STATUS");
  Serial.println("HELP");
}

void printStatus() {
  Serial.println("---- STATUS ----");
  Serial.print("WiFi: ");
  Serial.println(WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("Monitoring: ");
  Serial.println(monitoringEnabled ? "ON" : "OFF");
  Serial.print("Session: ");
  Serial.println(monitoringSessionId);
}

void handleSerialCommands() {
  if (!Serial.available()) return;

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "MONITOR ON") {
    monitoringEnabled = true;
    beginNewMonitoringSession();
    Serial.print("[SERIAL] MONITOR ON. Session: ");
    Serial.println(monitoringSessionId);
  }
  else if (cmd == "MONITOR OFF") {
    monitoringEnabled = false;
    Serial.print("[SERIAL] MONITOR OFF. Session: ");
    Serial.println(monitoringSessionId);
  }
  else if (cmd == "LIGHT ON") setActuator(GROW_LIGHT_PIN, true);
  else if (cmd == "LIGHT OFF") setActuator(GROW_LIGHT_PIN, false);
  else if (cmd == "FAN ON") setActuator(WIND_FAN_PIN, true);
  else if (cmd == "FAN OFF") setActuator(WIND_FAN_PIN, false);
  else if (cmd == "WATER ON") turnWaterOn();
  else if (cmd == "WATER OFF") { setActuator(WATER_PUMP_PIN, false); waterAutoOffActive = false; }
  else if (cmd == "PEST ON") turnPestOn();
  else if (cmd == "PEST OFF") { setActuator(PESTICIDE_PUMP_PIN, false); pestAutoOffActive = false; }
  else if (cmd == "NUTRI ON") turnNutriOn();
  else if (cmd == "NUTRI OFF") { setActuator(NUTRITION_PUMP_PIN, false); nutriAutoOffActive = false; }
  else if (cmd == "STATUS") printStatus();
  else if (cmd == "HELP") printHelp();
  else Serial.println("Unknown command. Type HELP");
}

// ---------------- ROUND FINALIZATION ----------------
void finalizeCurrentRound() {
  if (currentRoundIndex < 0 || currentRoundIndex >= NUM_ROUNDS || rs.finalized) return;

  RoundData &r = rounds[currentRoundIndex];

  if (rs.dsCount > 0) {
    r.rootValid = true;
    r.rootTempC = avgOrNaN(rs.dsSum, rs.dsCount);
  }

  if (rs.dhtCount > 0) {
    r.dhtValid = true;
    r.airTempC = avgOrNaN(rs.airSum, rs.dhtCount);
    r.humidity = avgOrNaN(rs.humSum, rs.dhtCount);
  }

  if (rs.bleTaken) {
    r.bleValid = true;
    r.bleRssiA = rs.bleRssiA;
    r.bleRssiB = rs.bleRssiB;
    r.bleRssiC = rs.bleRssiC;
    r.bleDistA = rs.bleDistA;
    r.bleDistB = rs.bleDistB;
    r.bleDistC = rs.bleDistC;
    r.bleX = rs.bleX;
    r.bleY = rs.bleY;
  }

  if (rs.soilTaken) {
    r.soilValid = true;
    r.soilRaw = rs.soilRaw;
    r.soilPercent = rs.soilPct;
  }

  if (rs.mqCount > 0) {
    r.gasValid = true;
    r.mqADC = avgOrNaN(rs.mqAdcSum, rs.mqCount);
    r.mqVout = avgOrNaN(rs.mqVoutSum, rs.mqCount);
    r.mqRatio = avgOrNaN(rs.mqRatioSum, rs.mqCount);
    r.mqPPM = avgOrNaN(rs.mqPpmSum, rs.mqCount);
  }

  if (rs.hxCount > 0) {
    r.weightValid = true;
    r.weightG = avgOrNaN(rs.hxSum, rs.hxCount);
    r.weightError = avgOrNaN(rs.hxErrSum, rs.hxCount);
  }

  rs.finalized = true;

  Serial.print("Round ");
  Serial.print(currentRoundIndex + 1);
  Serial.println(" finalized.");
}

bool allRoundsCollected() {
  for (int i = 0; i < NUM_ROUNDS; i++) {
    bool hasData = rounds[i].rootValid || rounds[i].dhtValid || rounds[i].bleValid ||
                   rounds[i].soilValid || rounds[i].gasValid || rounds[i].weightValid;
    if (!hasData) return false;
  }
  return true;
}

void sendBatchToBackend() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Batch not sent.");
    return;
  }

  String payload = "{";
  payload += "\"deviceId\":\"" + String(DEVICE_ID) + "\",";
  payload += "\"esp32Ip\":\"" + WiFi.localIP().toString() + "\",";
  payload += "\"monitoringSessionId\":\"" + monitoringSessionId + "\",";
  payload += "\"batchType\":\"full\",";
  payload += "\"roundsUsed\":10,";
  payload += "\"rounds\":[";

  for (int i = 0; i < NUM_ROUNDS; i++) {
    if (i > 0) payload += ",";
    RoundData &r = rounds[i];

    payload += "{";
    payload += "\"round\":" + String(i + 1) + ",";
    payload += "\"rootTempC\":" + jsonValue(r.rootTempC) + ",";
    payload += "\"airTempC\":" + jsonValue(r.airTempC) + ",";
    payload += "\"humidity\":" + jsonValue(r.humidity) + ",";
    payload += "\"soilPercent\":" + String(r.soilValid ? r.soilPercent : -1) + ",";
    payload += "\"soilRaw\":" + String(r.soilRaw) + ",";
    payload += "\"mqADC\":" + jsonValue(r.mqADC) + ",";
    payload += "\"mqVout\":" + jsonValue(r.mqVout, 3) + ",";
    payload += "\"mqRatio\":" + jsonValue(r.mqRatio, 3) + ",";
    payload += "\"mqPPM\":" + jsonValue(r.mqPPM) + ",";
    payload += "\"weightG\":" + jsonValue(r.weightG) + ",";
    payload += "\"weightError\":" + jsonValue(r.weightError, 3) + ",";
    payload += "\"ble\":{";
    payload += "\"rssiA\":" + String(r.bleRssiA) + ",";
    payload += "\"rssiB\":" + String(r.bleRssiB) + ",";
    payload += "\"rssiC\":" + String(r.bleRssiC) + ",";
    payload += "\"distA\":" + jsonValue(r.bleDistA, 2) + ",";
    payload += "\"distB\":" + jsonValue(r.bleDistB, 2) + ",";
    payload += "\"distC\":" + jsonValue(r.bleDistC, 2) + ",";
    payload += "\"x\":" + jsonValue(r.bleX, 2) + ",";
    payload += "\"y\":" + jsonValue(r.bleY, 2);
    payload += "}";
    payload += "}";
  }

  payload += "]}";

  HTTPClient http;
  http.begin(BACKEND_URL);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST(payload);
  Serial.print("POST response code: ");
  Serial.println(httpCode);

  if (httpCode > 0) {
    String response = http.getString();
    Serial.println(response);
  }

  http.end();
}

// ---------------- WEB ----------------
String buildStatusJson() {
  String json = "{";
  json += "\"deviceId\":\"" + String(DEVICE_ID) + "\",";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"wifiConnected\":" + String(WiFi.status() == WL_CONNECTED ? "true" : "false") + ",";
  json += "\"monitoringSessionId\":\"" + monitoringSessionId + "\",";
  json += "\"currentRound\":" + String(currentRoundIndex + 1);
  json += "}";
  return json;
}

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

  if (req.indexOf("GET /api/status") >= 0) {
    String body = buildStatusJson();
    client.println("HTTP/1.1 200 OK");
    client.println("Content-Type: application/json");
    client.println("Access-Control-Allow-Origin: *");
    client.println("Connection: close");
    client.println();
    client.println(body);
  } else if (req.indexOf("GET /api/monitor/on") >= 0) {
    // Start monitoring
    monitoringEnabled = true;
    beginNewMonitoringSession();
    
    String response = "{\"status\":\"monitoring_started\",\"sessionId\":\"" + monitoringSessionId + "\"}";
    client.println("HTTP/1.1 200 OK");
    client.println("Content-Type: application/json");
    client.println("Access-Control-Allow-Origin: *");
    client.println("Connection: close");
    client.println();
    client.println(response);
    
    Serial.println("[WEB] Monitor ON - Session: " + monitoringSessionId);
  } else if (req.indexOf("GET /api/monitor/off") >= 0) {
    // Stop monitoring
    monitoringEnabled = false;
    
    String response = "{\"status\":\"monitoring_stopped\",\"sessionId\":\"" + monitoringSessionId + "\"}";
    client.println("HTTP/1.1 200 OK");
    client.println("Content-Type: application/json");
    client.println("Access-Control-Allow-Origin: *");
    client.println("Connection: close");
    client.println();
    client.println(response);
    
    Serial.println("[WEB] Monitor OFF - Session: " + monitoringSessionId);
  } else {
    client.println("HTTP/1.1 404 Not Found");
    client.println("Content-Type: text/plain");
    client.println("Connection: close");
    client.println();
    client.println("Not found");
  }

  delay(1);
  client.stop();
}

// ---------------- SETUP ----------------
void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(GROW_LIGHT_PIN, OUTPUT);
  pinMode(WIND_FAN_PIN, OUTPUT);
  pinMode(WATER_PUMP_PIN, OUTPUT);
  pinMode(PESTICIDE_PUMP_PIN, OUTPUT);
  pinMode(NUTRITION_PUMP_PIN, OUTPUT);

  setActuator(GROW_LIGHT_PIN, false);
  setActuator(WIND_FAN_PIN, false);
  setActuator(WATER_PUMP_PIN, false);
  setActuator(PESTICIDE_PUMP_PIN, false);
  setActuator(NUTRITION_PUMP_PIN, false);

  analogReadResolution(12);

  dht.begin();
  ds18b20.begin();

  scale.begin(HX711_DT_PIN, HX711_SCK_PIN);
  scale.set_scale(HX711_CAL_FACTOR);
  initHXBuffer();

  connectWiFi();
  server.begin();
  initBLEOriginal();

  beginNewMonitoringSession();

  Serial.println("30-second staggered windows started.");
  Serial.println("Final aggregated output every 5 minutes.");
  printHelp();
}

// ---------------- LOOP ----------------
void loop() {
  handleSerialCommands();
  serviceActuatorAutoOff();
  handleWebClient();

  if (!monitoringEnabled) return;

  unsigned long now = millis();
  unsigned long batchElapsed = now - batchStartMs;

  int newRoundIndex = batchElapsed / ROUND_MS;

  if (newRoundIndex >= NUM_ROUNDS) {
    if (!rs.finalized) {
      finalizeCurrentRound();
    }

    if (allRoundsCollected()) {
      Serial.println("Full 10-round batch complete. Sending to backend...");
      sendBatchToBackend();
    } else {
      Serial.println("Batch complete, but some rounds are missing data.");
    }

    beginNewMonitoringSession();
    return;
  }

  if (newRoundIndex != currentRoundIndex) {
    if (currentRoundIndex >= 0 && !rs.finalized) {
      finalizeCurrentRound();
    }

    currentRoundIndex = newRoundIndex;
    resetRoundState();

    Serial.print("\n--- Round ");
    Serial.print(currentRoundIndex + 1);
    Serial.println(" started ---");
  }

  unsigned long roundOffset = batchElapsed % ROUND_MS;

  // DS18B20 window
  if (roundOffset >= DS_START_MS && roundOffset < DS_END_MS) {
    if (now - rs.dsLast >= DS_SAMPLE_MS) {
      float t = readDS18B20Original();
      if (!isnan(t) && t > -100 && t < 150) {
        rs.dsSum += t;
        rs.dsCount++;
        Serial.print("[DS18B20] ");
        Serial.println(t);
      }
      rs.dsLast = now;
    }
  }

  // DHT11 window
  if (roundOffset >= DHT_START_MS && roundOffset < DHT_END_MS) {
    if (now - rs.dhtLast >= DHT_SAMPLE_MS) {
      float h, t;
      if (readDHT11Original(h, t)) {
        rs.airSum += t;
        rs.humSum += h;
        rs.dhtCount++;
        Serial.print("[DHT11] Temp=");
        Serial.print(t);
        Serial.print(" Hum=");
        Serial.println(h);
      }
      rs.dhtLast = now;
    }
  }

  // BLE window
  if (roundOffset >= BLE_START_MS && roundOffset < BLE_END_MS && !rs.bleTaken) {
    int outRssiA, outRssiB, outRssiC;
    float outDistA, outDistB, outDistC, outX, outY;

    bool ok = scanBLEOriginal(outRssiA, outRssiB, outRssiC, outDistA, outDistB, outDistC, outX, outY);
    if (ok) {
      rs.bleTaken = true;
      rs.bleRssiA = outRssiA;
      rs.bleRssiB = outRssiB;
      rs.bleRssiC = outRssiC;
      rs.bleDistA = outDistA;
      rs.bleDistB = outDistB;
      rs.bleDistC = outDistC;
      rs.bleX = outX;
      rs.bleY = outY;

      Serial.printf("[BLE] RSSI -> A:%d B:%d C:%d\n", outRssiA, outRssiB, outRssiC);
      Serial.printf("[BLE] Distance -> A:%.2f B:%.2f C:%.2f\n", outDistA, outDistB, outDistC);
      Serial.printf("[BLE] Position -> X: %.2f, Y: %.2f\n", outX, outY);
    } else {
      Serial.println("[BLE] Waiting for all beacons...");
      rs.bleTaken = true; // only once per round
    }
  }

  // Soil window
  if (roundOffset >= SOIL_START_MS && roundOffset < SOIL_END_MS && !rs.soilTaken) {
    int raw = readSoilRawAverageOriginal();
    int pct = soilRawToPercentOriginal(raw);
    rs.soilRaw = raw;
    rs.soilPct = pct;
    rs.soilTaken = true;

    Serial.print("[SOIL] Raw=");
    Serial.print(raw);
    Serial.print(" Moisture=");
    Serial.println(pct);
  }

  // MQ135 window
  if (roundOffset >= MQ_START_MS && roundOffset < MQ_END_MS) {
    if (now - rs.mqLast >= MQ_SAMPLE_MS) {
      float adc, vout, ratio, ppm;
      if (readMQ135Original(adc, vout, ratio, ppm)) {
        rs.mqAdcSum += adc;
        rs.mqVoutSum += vout;
        rs.mqRatioSum += ratio;
        rs.mqPpmSum += ppm;
        rs.mqCount++;

        Serial.print("[MQ135] ADC=");
        Serial.print(adc);
        Serial.print(" Vout=");
        Serial.print(vout);
        Serial.print(" Ratio=");
        Serial.print(ratio);
        Serial.print(" PPM=");
        Serial.println(ppm);
      }
      rs.mqLast = now;
    }
  }

  // HX711 window
  if (roundOffset >= HX_START_MS && roundOffset < HX_END_MS) {
    if (now - rs.hxLast >= HX_SAMPLE_MS) {
      float meanW, errW;
      if (updateHX711Original(meanW, errW)) {
        rs.hxSum += meanW;
        rs.hxErrSum += errW;
        rs.hxCount++;

        Serial.print("[HX711] ");
        Serial.print(meanW);
        Serial.print(" g  [+/- ");
        Serial.print(errW);
        Serial.println("]");
      }
      rs.hxLast = now;
    }
  }
}
