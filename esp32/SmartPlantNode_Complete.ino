/**
 * Smart Plant Node – MAIN BOARD (Board 1)
 *
 * Sensors  : DHT11, DS18B20, HX711, MQ135, Soil Moisture
 * Actuators: Grow Light, Fan, Water Pump, Pesticide Pump, Nutrition Pump
 * WiFi     : Static IP 10.223.26.223, Port 80
 * Endpoints: GET /api/status  |  GET /api/monitor/on  |  GET /api/monitor/off
 */

#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include "HX711.h"
#include <math.h>

// ============ WIFI & BACKEND ============
const char* WIFI_SSID     = "OppoA74";
const char* WIFI_PASSWORD = "mm8wy7yb";
const char* DEVICE_ID     = "ESP32-846BA2A7DBCC";
// NOTE: Set this to your backend server (laptop) WiFi IP address
const char* BACKEND_URL   = "http://10.172.123.165:5001/api/readings";

// Static IP for Board 1 (required so backend can always reach it at 10.223.26.223)
IPAddress local_IP(10, 223, 26, 223);
IPAddress gateway(10, 223, 26, 1);
IPAddress subnet(255, 255, 255, 0);
IPAddress primaryDNS(8, 8, 8, 8);
IPAddress secondaryDNS(8, 8, 4, 4);

// ============ PINS ============
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

// ============ CALIBRATION ============
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

// ============ TIMING ============
const unsigned long ROUND_MS = 30000UL;
const int NUM_ROUNDS = 10;

const unsigned long DS_START_MS      = 0UL;
const unsigned long DS_END_MS        = 2000UL;
const unsigned long DHT_START_MS     = 3000UL;
const unsigned long DHT_END_MS       = 5000UL;
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

// ============ OBJECTS ============
DHT dht(DHT_PIN, DHT_TYPE);
OneWire oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);
HX711 scale;
WiFiServer server(80);

// ============ HX711 BUFFER ============
float hxReadings[HX711_SMOOTHING_SAMPLES];
int hxReadIndex = 0;
float hxTotal = 0.0f;
int hxValidCount = 0;

// ============ SESSION CONTROL ============
bool monitoringEnabled = false;
unsigned long monitoringSessionCounter = 0;
String monitoringSessionId = "session-0";

bool waterAutoOffActive = false;
unsigned long waterOnMs = 0;
bool pestAutoOffActive = false;
unsigned long pestOnMs = 0;
bool nutriAutoOffActive = false;
unsigned long nutriOnMs = 0;

// ============ ROUND DATA ============
struct RoundData {
  bool rootValid = false;
  float rootTempC = NAN;

  bool dhtValid = false;
  float airTempC = NAN;
  float humidity = NAN;

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

void initHXBuffer() {
  for (int i = 0; i < HX711_SMOOTHING_SAMPLES; i++) {
    hxReadings[i] = 0.0f;
  }
  hxReadIndex = 0;
  hxTotal = 0.0f;
  hxValidCount = 0;
}

// ============ WIFI ============
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
    Serial.print("✅ WiFi connected. IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("❌ WiFi connection failed.");
  }
}

// ============ SENSORS ============
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
  vout   = (avgADC / 4095.0f) * ESP32_ADC_REF_VOLTS;
  float rs = MQ135_RL_OHMS * (MQ135_VC_VOLTS - vout) / vout;
  ratio = rs / MQ135_R0;
  ppm = 110.47f * pow(ratio, -2.862f);
  return !isnan(ppm);
}

// ============ HX711 ============
bool updateHX711Original(float &meanWeight, float &plusMinus) {
  if (!scale.is_ready()) return false;

  float raw       = scale.get_units(1);
  float corrected = raw - HX711_EMPTY_OFFSET_G;
  if (abs(corrected) < HX711_ZERO_DEADBAND_G) corrected = 0.0f;

  if (hxValidCount == HX711_SMOOTHING_SAMPLES) {
    hxTotal -= hxReadings[hxReadIndex];
  } else {
    hxValidCount++;
  }
  hxReadings[hxReadIndex] = corrected;
  hxTotal                += corrected;
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

// ============ ACTUATORS ============
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

// ============ SERIAL COMMANDS ============
void printHelp() {
  Serial.println("Commands: MONITOR ON/OFF | LIGHT ON/OFF | FAN ON/OFF");
  Serial.println("          WATER ON/OFF | PEST ON/OFF | NUTRI ON/OFF | STATUS | HELP");
}

void printStatus() {
  Serial.println("---- STATUS ----");
  Serial.print("WiFi: "); Serial.println(WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected");
  Serial.print("IP: ");   Serial.println(WiFi.localIP());
  Serial.print("Monitoring: "); Serial.println(monitoringEnabled ? "ON" : "OFF");
  Serial.print("Session: ");    Serial.println(monitoringSessionId);
}

void handleSerialCommands() {
  if (!Serial.available()) return;
  String cmd = Serial.readStringUntil('\n');
  cmd.trim(); cmd.toUpperCase();

  if      (cmd == "MONITOR ON")  { monitoringEnabled = true;  beginNewMonitoringSession(); Serial.println("[SERIAL] MONITOR ON. Session: " + monitoringSessionId); }
  else if (cmd == "MONITOR OFF") { monitoringEnabled = false; Serial.println("[SERIAL] MONITOR OFF"); }
  else if (cmd == "LIGHT ON")    setActuator(GROW_LIGHT_PIN, true);
  else if (cmd == "LIGHT OFF")   setActuator(GROW_LIGHT_PIN, false);
  else if (cmd == "FAN ON")      setActuator(WIND_FAN_PIN, true);
  else if (cmd == "FAN OFF")     setActuator(WIND_FAN_PIN, false);
  else if (cmd == "WATER ON")    turnWaterOn();
  else if (cmd == "WATER OFF")   { setActuator(WATER_PUMP_PIN, false);      waterAutoOffActive = false; }
  else if (cmd == "PEST ON")     turnPestOn();
  else if (cmd == "PEST OFF")    { setActuator(PESTICIDE_PUMP_PIN, false);  pestAutoOffActive = false; }
  else if (cmd == "NUTRI ON")    turnNutriOn();
  else if (cmd == "NUTRI OFF")   { setActuator(NUTRITION_PUMP_PIN, false);  nutriAutoOffActive = false; }
  else if (cmd == "STATUS")      printStatus();
  else if (cmd == "HELP")        printHelp();
  else                           Serial.println("Unknown command. Type HELP");
}

// ============ ROUND FINALIZATION ============
void finalizeCurrentRound() {
  if (currentRoundIndex < 0 || currentRoundIndex >= NUM_ROUNDS || rs.finalized) return;
  RoundData &r = rounds[currentRoundIndex];

  if (rs.dsCount  > 0) { r.rootValid  = true; r.rootTempC = avgOrNaN(rs.dsSum,  rs.dsCount);  }
  if (rs.dhtCount > 0) { r.dhtValid   = true; r.airTempC  = avgOrNaN(rs.airSum, rs.dhtCount); r.humidity = avgOrNaN(rs.humSum, rs.dhtCount); }
  if (rs.soilTaken)    { r.soilValid  = true; r.soilRaw   = rs.soilRaw;  r.soilPercent = rs.soilPct; }
  if (rs.mqCount  > 0) { r.gasValid   = true; r.mqADC     = avgOrNaN(rs.mqAdcSum,   rs.mqCount);
                                               r.mqVout    = avgOrNaN(rs.mqVoutSum,  rs.mqCount);
                                               r.mqRatio   = avgOrNaN(rs.mqRatioSum, rs.mqCount);
                                               r.mqPPM     = avgOrNaN(rs.mqPpmSum,   rs.mqCount); }
  if (rs.hxCount  > 0) { r.weightValid = true; r.weightG  = avgOrNaN(rs.hxSum,    rs.hxCount);
                                                r.weightError = avgOrNaN(rs.hxErrSum, rs.hxCount); }
  rs.finalized = true;
  Serial.print("Round "); Serial.print(currentRoundIndex + 1); Serial.println(" finalized.");
}

bool allRoundsCollected() {
  for (int i = 0; i < NUM_ROUNDS; i++) {
    if (!(rounds[i].rootValid || rounds[i].dhtValid ||
          rounds[i].soilValid || rounds[i].gasValid  || rounds[i].weightValid)) return false;
  }
  return true;
}

// ============ BATCH POST ============
void sendBatchToBackend() {
  if (WiFi.status() != WL_CONNECTED) { Serial.println("WiFi not connected. Batch not sent."); return; }

  String payload = "{";
  payload += "\"deviceId\":\"" + String(DEVICE_ID) + "\",";
  payload += "\"esp32Ip\":\"" + WiFi.localIP().toString() + "\",";
  payload += "\"monitoringSessionId\":\"" + monitoringSessionId + "\",";
  payload += "\"batchType\":\"full\",\"roundsUsed\":10,\"rounds\":[";

  for (int i = 0; i < NUM_ROUNDS; i++) {
    if (i > 0) payload += ",";
    RoundData &r = rounds[i];
    payload += "{";
    payload += "\"round\":"       + String(i + 1)                   + ",";
    payload += "\"rootTempC\":"   + jsonValue(r.rootTempC)          + ",";
    payload += "\"airTempC\":"    + jsonValue(r.airTempC)           + ",";
    payload += "\"humidity\":"    + jsonValue(r.humidity)           + ",";
    payload += "\"soilPercent\":" + String(r.soilValid ? r.soilPercent : -1) + ",";
    payload += "\"soilRaw\":"     + String(r.soilRaw)              + ",";
    payload += "\"mqADC\":"       + jsonValue(r.mqADC)             + ",";
    payload += "\"mqVout\":"      + jsonValue(r.mqVout, 3)         + ",";
    payload += "\"mqRatio\":"     + jsonValue(r.mqRatio, 3)        + ",";
    payload += "\"mqPPM\":"       + jsonValue(r.mqPPM)             + ",";
    payload += "\"weightG\":"     + jsonValue(r.weightG)           + ",";
    payload += "\"weightError\":" + jsonValue(r.weightError, 3);
    payload += "}";
  }
  payload += "]}";

  HTTPClient http;
  http.begin(BACKEND_URL);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(payload);
  Serial.print("POST response: "); Serial.println(code);
  if (code > 0) Serial.println(http.getString());
  http.end();
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

  // ── GET /api/status ──
  if (req.indexOf("GET /api/status") >= 0) {
    // Find the latest finalized round (prefer the most recent with valid data)
    int idx = -1;
    for (int i = NUM_ROUNDS - 1; i >= 0; i--) {
      if (rounds[i].rootValid || rounds[i].dhtValid || rounds[i].soilValid || rounds[i].gasValid || rounds[i].weightValid) {
        idx = i;
        break;
      }
    }
    if (idx < 0) idx = max(currentRoundIndex, 0);
    RoundData &lr = rounds[idx];

    String body = "{";
    body += "\"deviceId\":\"" + String(DEVICE_ID) + "\"";
    body += ",\"ip\":\"" + WiFi.localIP().toString() + "\"";
    body += ",\"wifiConnected\":" + String(WiFi.status() == WL_CONNECTED ? "true" : "false");
    body += ",\"monitoringEnabled\":" + String(monitoringEnabled ? "true" : "false");
    body += ",\"monitoringSessionId\":\"" + monitoringSessionId + "\"";
    body += ",\"currentRound\":" + String(currentRoundIndex + 1);
    body += ",\"latestRound\":{";
    body += "\"round\":"        + String(idx + 1);
    body += ",\"rootTempC\":"   + jsonValue(lr.rootTempC);
    body += ",\"airTempC\":"    + jsonValue(lr.airTempC);
    body += ",\"humidity\":"    + jsonValue(lr.humidity);
    body += ",\"soilPercent\":" + String(lr.soilValid ? lr.soilPercent : -1);
    body += ",\"mqRatio\":"     + jsonValue(lr.mqRatio, 3);
    body += ",\"mqPPM\":"       + jsonValue(lr.mqPPM);
    body += ",\"weightG\":"     + jsonValue(lr.weightG);
    body += ",\"weightError\":" + jsonValue(lr.weightError, 3);
    body += "}}";

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

  pinMode(GROW_LIGHT_PIN,     OUTPUT);
  pinMode(WIND_FAN_PIN,       OUTPUT);
  pinMode(WATER_PUMP_PIN,     OUTPUT);
  pinMode(PESTICIDE_PUMP_PIN, OUTPUT);
  pinMode(NUTRITION_PUMP_PIN, OUTPUT);

  setActuator(GROW_LIGHT_PIN,     false);
  setActuator(WIND_FAN_PIN,       false);
  setActuator(WATER_PUMP_PIN,     false);
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

  beginNewMonitoringSession();
  monitoringEnabled = false; // wait for /api/monitor/on or serial MONITOR ON

  Serial.println("\n✅ Smart Plant Node (Board 1) ready.");
  Serial.println("📡 Port 80 | /api/status  /api/monitor/on  /api/monitor/off");
  printHelp();
}

// ============ LOOP ============
void loop() {
  handleSerialCommands();
  serviceActuatorAutoOff();
  handleWebClient();

  if (!monitoringEnabled) return;

  unsigned long now          = millis();
  unsigned long batchElapsed = now - batchStartMs;
  int           newRoundIndex = batchElapsed / ROUND_MS;

  // Batch complete
  if (newRoundIndex >= NUM_ROUNDS) {
    if (!rs.finalized) finalizeCurrentRound();
    if (allRoundsCollected()) {
      Serial.println("✅ Full 10-round batch complete. Sending to backend...");
      sendBatchToBackend();
    } else {
      Serial.println("⚠️ Batch complete, some rounds missing data.");
    }
    beginNewMonitoringSession();
    return;
  }

  // Round transition
  if (newRoundIndex != currentRoundIndex) {
    if (currentRoundIndex >= 0 && !rs.finalized) finalizeCurrentRound();
    currentRoundIndex = newRoundIndex;
    resetRoundState();
    Serial.print("\n--- Round ");
    Serial.print(currentRoundIndex + 1);
    Serial.println(" started ---");
  }

  unsigned long roundOffset = batchElapsed % ROUND_MS;

  // DS18B20 window (0–2 s)
  if (roundOffset >= DS_START_MS && roundOffset < DS_END_MS) {
    if (now - rs.dsLast >= DS_SAMPLE_MS) {
      float t = readDS18B20Original();
      if (!isnan(t) && t > -100 && t < 150) {
        rs.dsSum += t; rs.dsCount++;
        Serial.print("[DS18B20] "); Serial.println(t);
      }
      rs.dsLast = now;
    }
  }

  // DHT11 window (3–5 s)
  if (roundOffset >= DHT_START_MS && roundOffset < DHT_END_MS) {
    if (now - rs.dhtLast >= DHT_SAMPLE_MS) {
      float h, t;
      if (readDHT11Original(h, t)) {
        rs.airSum += t; rs.humSum += h; rs.dhtCount++;
        Serial.printf("[DHT11] Temp=%.1f Hum=%.1f\n", t, h);
      }
      rs.dhtLast = now;
    }
  }

  // Soil window (12–14 s)
  if (roundOffset >= SOIL_START_MS && roundOffset < SOIL_END_MS && !rs.soilTaken) {
    int raw = readSoilRawAverageOriginal();
    int pct = soilRawToPercentOriginal(raw);
    rs.soilRaw = raw; rs.soilPct = pct; rs.soilTaken = true;
    Serial.printf("[SOIL] Raw=%d Moisture=%d%%\n", raw, pct);
  }

  // MQ135 window (15–22 s)
  if (roundOffset >= MQ_START_MS && roundOffset < MQ_END_MS) {
    if (now - rs.mqLast >= MQ_SAMPLE_MS) {
      float adc, vout, ratio, ppm;
      if (readMQ135Original(adc, vout, ratio, ppm)) {
        rs.mqAdcSum += adc; rs.mqVoutSum += vout;
        rs.mqRatioSum += ratio; rs.mqPpmSum += ppm; rs.mqCount++;
        Serial.printf("[MQ135] ADC=%.0f Vout=%.3f Ratio=%.4f PPM=%.1f\n", adc, vout, ratio, ppm);
      }
      rs.mqLast = now;
    }
  }

  // HX711 window (23–30 s)
  if (roundOffset >= HX_START_MS && roundOffset < HX_END_MS) {
    if (now - rs.hxLast >= HX_SAMPLE_MS) {
      float meanW, errW;
      if (updateHX711Original(meanW, errW)) {
        rs.hxSum += meanW; rs.hxErrSum += errW; rs.hxCount++;
        Serial.printf("[HX711] %.2fg [±%.3f]\n", meanW, errW);
      }
      rs.hxLast = now;
    }
  }
}
