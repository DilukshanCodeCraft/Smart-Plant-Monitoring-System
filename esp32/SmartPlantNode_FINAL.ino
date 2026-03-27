/**
 * Smart Plant Node – MAIN BOARD (Board 1)
 * =========================================
 * Sensors  : DHT11 (air temp + humidity), DS18B20 (root temp),
 *            HX711 (weight), MQ135 (gas), Soil Moisture
 * Actuators: Grow Light, Fan, Water Pump, Pesticide Pump, Nutrition Pump
 * WiFi     : Static IP 10.223.26.223, Port 80
 * Endpoints: GET /api/status
 *            GET /api/monitor/on  |  GET /api/monitor/off
 *            GET /api/light/on  |  GET /api/light/off
 *            GET /api/fan/on    |  GET /api/fan/off
 *            GET /api/water/on  |  GET /api/water/off
 *            GET /api/pest/on   |  GET /api/pest/off
 *            GET /api/nutri/on  |  GET /api/nutri/off
 *            GET /api/sleep
 *
 * NOTE: Update BACKEND_URL to match your laptop's current WiFi IP before
 * flashing.
 */

#include "HX711.h"
#include <Arduino.h>
#include <DHT.h>
#include <DallasTemperature.h>
#include <HTTPClient.h>
#include <OneWire.h>
#include <WiFi.h>
#include <math.h>

// ============ WIFI & BACKEND ============
const char *WIFI_SSID = "OppoA74";
const char *WIFI_PASSWORD = "mm8wy7yb";
const char *DEVICE_ID = "ESP32-846BA2A7DBCC";
const char *BACKEND_URL =
    "http://10.223.26.165:5001/api/readings"; // Laptop IP on OppoA74 hotspot

// Static IP — Board 1 always reachable at 10.223.26.223 (set in backend/.env
// ESP32_BASE_URL)
IPAddress local_IP(10, 223, 26, 223);
IPAddress gateway(10, 223, 26, 1);
IPAddress subnet(255, 255, 255, 0);
IPAddress primaryDNS(8, 8, 8, 8);
IPAddress secondaryDNS(8, 8, 4, 4);

// ============ PINS ============
#define DS18B20_PIN 4
#define DHT_PIN 5
#define DHT_TYPE DHT11
#define HX711_DT_PIN 19
#define HX711_SCK_PIN 18
#define SOIL_PIN 34
#define MQ135_AO_PIN 32

#define GROW_LIGHT_PIN 27
#define WIND_FAN_PIN 23
#define WATER_PUMP_PIN 15
#define PESTICIDE_PUMP_PIN 2
#define NUTRITION_PUMP_PIN 26

// ============ CALIBRATION ============
#define SOIL_DRY_VALUE 4095
#define SOIL_WET_VALUE 2100

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

const unsigned long DS_START_MS = 0UL;
const unsigned long DS_END_MS = 2000UL;
const unsigned long DHT_START_MS = 3000UL;
const unsigned long DHT_END_MS = 5000UL;
const unsigned long SOIL_START_MS = 12000UL;
const unsigned long SOIL_END_MS = 14000UL;
const unsigned long MQ_START_MS = 15000UL;
const unsigned long MQ_END_MS = 22000UL;
const unsigned long HX_START_MS = 23000UL;
const unsigned long HX_END_MS = 30000UL;

const unsigned long DS_SAMPLE_MS = 1000UL;
const unsigned long DHT_SAMPLE_MS = 1500UL;
const unsigned long MQ_SAMPLE_MS = 1500UL;
const unsigned long HX_SAMPLE_MS = 250UL;
const unsigned long AUTO_OFF_MS = 5000UL;

// ============ OBJECTS ============
DHT dht(DHT_PIN, DHT_TYPE);
OneWire oneWire(DS18B20_PIN);
DallasTemperature ds18b20(&oneWire);
HX711 scale;
WiFiServer server(80);

// ============ HX711 RING BUFFER ============
float hxReadings[HX711_SMOOTHING_SAMPLES];
float hxRawSamples[3];
int hxRawCount = 0;
int hxReadIndex = 0;
float hxTotal = 0.0f;
int hxValidCount = 0;

// ============ SESSION / ACTUATOR STATE ============
bool monitoringEnabled = false;
unsigned long monitoringSessionCounter = 0;
String monitoringSessionId = "session-0";

bool lightOn = false;
bool fanOn = false;

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

  float soilRawSum = 0.0f;
  float soilPctSum = 0.0f;
  int soilCount = 0;
  unsigned long soilLast = 0;

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

  float dsSamples[3], airSamples[3], humSamples[3], soilSamples[3],
      mqSamples[3];
  int dsSampIdx = 0, airSampIdx = 0, soilSampIdx = 0, mqSampIdx = 0;
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
  if (isnan(v))
    return "null";
  return String(v, digits);
}

float getMedian3(float *arr) {
  float a = arr[0], b = arr[1], c = arr[2];
  if ((a <= b && b <= c) || (c <= b && b <= a))
    return b;
  if ((b <= a && a <= c) || (c <= a && a <= b))
    return a;
  return c;
}

float getMedianFloat(float *arr, int n) {
  if (n <= 0)
    return 0.0f;
  // Simple sort for 3-5 elements is fast
  for (int i = 0; i < n - 1; i++) {
    for (int j = i + 1; j < n; j++) {
      if (arr[i] > arr[j]) {
        float temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
      }
    }
  }
  return arr[n / 2];
}

String jsonBool(bool b) { return b ? "true" : "false"; }

String jsonStr(String s) { return "\"" + s + "\""; }

void resetRoundState() { rs = RoundState(); }

void resetBatchData() {
  for (int i = 0; i < NUM_ROUNDS; i++)
    rounds[i] = RoundData();
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
  for (int i = 0; i < HX711_SMOOTHING_SAMPLES; i++)
    hxReadings[i] = 0.0f;
  for (int i = 0; i < 3; i++)
    hxRawSamples[i] = 0.0f;
  hxReadIndex = 0;
  hxTotal = 0.0f;
  hxValidCount = 0;
  hxRawCount = 0;
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
    Serial.println("❌ WiFi connection failed. Continuing without network.");
  }
}

// ============ SENSORS ============
float readDS18B20() {
  ds18b20.requestTemperatures();
  return ds18b20.getTempCByIndex(0);
}

bool readDHT11(float &humidity, float &temperature) {
  humidity = dht.readHumidity();
  temperature = dht.readTemperature();
  return !(isnan(humidity) || isnan(temperature));
}

int readSoilRaw() {
  long sum = 0;
  for (int i = 0; i < 10; i++) {
    sum += analogRead(SOIL_PIN);
    delay(10);
  }
  return (int)(sum / 10);
}

int soilRawToPercent(int rawValue) {
  return constrain(map(rawValue, SOIL_DRY_VALUE, SOIL_WET_VALUE, 0, 100), 0,
                   100);
}

bool readMQ135(float &avgADC, float &vout, float &ratio, float &ppm) {
  long sum = 0;
  for (int i = 0; i < 100; i++) {
    sum += analogRead(MQ135_AO_PIN);
    delay(1);
  }
  avgADC = sum / 100.0f;
  vout = (avgADC / 4095.0f) * ESP32_ADC_REF_VOLTS;

  if (vout <= 0.0f || vout >= MQ135_VC_VOLTS)
    return false;

  float rsOhms = MQ135_RL_OHMS * (MQ135_VC_VOLTS - vout) / vout;
  ratio = rsOhms / MQ135_R0;

  if (ratio <= 0.0f || isnan(ratio) || isinf(ratio))
    return false;

  ppm = 110.47f * pow(ratio, -2.862f);
  return !(isnan(ppm) || isinf(ppm));
}

bool updateHX711(float &meanWeight, float &plusMinus) {
  if (!scale.is_ready())
    return false;

  float rawReading = scale.get_units(1) - HX711_EMPTY_OFFSET_G;
  if (abs(rawReading) < HX711_ZERO_DEADBAND_G)
    rawReading = 0.0f;

  // SPIKE FILTER: Median-of-3
  hxRawSamples[hxRawCount % 3] = rawReading;
  hxRawCount++;
  if (hxRawCount < 3)
    return false; // wait for initial samples

  float samplesCopy[3];
  memcpy(samplesCopy, hxRawSamples, sizeof(float) * 3);
  float corrected = getMedianFloat(samplesCopy, 3);

  if (hxValidCount == HX711_SMOOTHING_SAMPLES) {
    hxTotal -= hxReadings[hxReadIndex];
  } else {
    hxValidCount++;
  }
  hxReadings[hxReadIndex] = corrected;
  hxTotal += corrected;
  hxReadIndex++;
  if (hxReadIndex >= HX711_SMOOTHING_SAMPLES)
    hxReadIndex = 0;

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
void setActuator(int pin, bool on) { digitalWrite(pin, on ? HIGH : LOW); }

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
  Serial.println(
      "          WATER ON/OFF   | PEST ON/OFF  | NUTRI ON/OFF | STATUS | HELP");
}

void printStatus() {
  Serial.println("---- STATUS ----");
  Serial.print("WiFi: ");
  Serial.println(WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected");
  Serial.print("IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("Monitor: ");
  Serial.println(monitoringEnabled ? "ON" : "OFF");
  Serial.print("Session: ");
  Serial.println(monitoringSessionId);
}

void handleSerialCommands() {
  if (!Serial.available())
    return;
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "MONITOR ON") {
    monitoringEnabled = true;
    beginNewMonitoringSession();
    Serial.println("[SERIAL] MONITOR ON. Session: " + monitoringSessionId);
  } else if (cmd == "MONITOR OFF") {
    monitoringEnabled = false;
    Serial.println("[SERIAL] MONITOR OFF");
  } else if (cmd == "LIGHT ON") {
    setActuator(GROW_LIGHT_PIN, true);
    lightOn = true;
  } else if (cmd == "LIGHT OFF") {
    setActuator(GROW_LIGHT_PIN, false);
    lightOn = false;
  } else if (cmd == "FAN ON") {
    setActuator(WIND_FAN_PIN, true);
    fanOn = true;
  } else if (cmd == "FAN OFF") {
    setActuator(WIND_FAN_PIN, false);
    fanOn = false;
  } else if (cmd == "WATER ON")
    turnWaterOn();
  else if (cmd == "WATER OFF") {
    setActuator(WATER_PUMP_PIN, false);
    waterAutoOffActive = false;
  } else if (cmd == "PEST ON")
    turnPestOn();
  else if (cmd == "PEST OFF") {
    setActuator(PESTICIDE_PUMP_PIN, false);
    pestAutoOffActive = false;
  } else if (cmd == "NUTRI ON")
    turnNutriOn();
  else if (cmd == "NUTRI OFF") {
    setActuator(NUTRITION_PUMP_PIN, false);
    nutriAutoOffActive = false;
  } else if (cmd == "STATUS")
    printStatus();
  else if (cmd == "HELP")
    printHelp();
  else
    Serial.println("Unknown command. Type HELP");
}

// ============ ROUND FINALIZATION ============
void finalizeCurrentRound() {
  if (currentRoundIndex < 0 || currentRoundIndex >= NUM_ROUNDS || rs.finalized)
    return;
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
  if (rs.soilCount > 0) {
    r.soilValid = true;
    r.soilRaw = (int)avgOrNaN(rs.soilRawSum, rs.soilCount);
    r.soilPercent = (int)avgOrNaN(rs.soilPctSum, rs.soilCount);
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
  Serial.printf("Round %d finalized.\n", currentRoundIndex + 1);
}

bool allRoundsCollected() {
  for (int i = 0; i < NUM_ROUNDS; i++) {
    if (!(rounds[i].rootValid || rounds[i].dhtValid || rounds[i].soilValid ||
          rounds[i].gasValid || rounds[i].weightValid)) {
      return false;
    }
  }
  return true;
}

// ============ BATCH POST ============
void sendBatchToBackend() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi not connected. Batch not sent.");
    return;
  }

  String payload = "{";
  payload += "\"deviceId\":\"" + String(DEVICE_ID) + "\",";
  payload += "\"esp32Ip\":\"" + WiFi.localIP().toString() + "\",";
  payload += "\"monitoringSessionId\":\"" + monitoringSessionId + "\",";
  payload += "\"batchType\":\"full\",\"roundsUsed\":10,\"rounds\":[";

  for (int i = 0; i < NUM_ROUNDS; i++) {
    if (i > 0)
      payload += ",";
    RoundData &r = rounds[i];
    payload += "{";
    payload += "\"round\":" + String(i + 1) + ",";
    payload += "\"rootTempC\":" + jsonValue(r.rootTempC) + ",";
    payload += "\"airTempC\":" + jsonValue(r.airTempC) + ",";
    payload += "\"humidity\":" + jsonValue(r.humidity) + ",";
    payload += "\"soilPercent\":" +
               (r.soilValid ? String(r.soilPercent) : String("null")) + ",";
    payload += "\"soilRaw\":" + String(r.soilRaw) + ",";
    payload += "\"mqADC\":" + jsonValue(r.mqADC) + ",";
    payload += "\"mqVout\":" + jsonValue(r.mqVout, 3) + ",";
    payload += "\"mqRatio\":" + jsonValue(r.mqRatio, 3) + ",";
    payload += "\"mqPPM\":" + jsonValue(r.mqPPM) + ",";
    payload += "\"weightG\":" + jsonValue(r.weightG) + ",";
    payload += "\"weightError\":" + jsonValue(r.weightError, 3);
    payload += "}";
  }
  payload += "]}";

  HTTPClient http;
  http.begin(BACKEND_URL);
  http.addHeader("Content-Type", "application/json");
  int code = http.POST(payload);
  Serial.printf("POST response: %d\n", code);
  if (code > 0)
    Serial.println(http.getString());
  http.end();
}

// ============ BUILD STATUS JSON ============
String buildStatusJson() {
  // Pull current LIVE averages even if the 30s interval isn't finished yet.
  // This ensures the Dashboard tiles populate instantly upon "Monitor On".
  float liveRoot = avgOrNaN(rs.dsSum, rs.dsCount);
  float liveAir = avgOrNaN(rs.airSum, rs.dhtCount);
  float liveHum = avgOrNaN(rs.humSum, rs.dhtCount);
  int liveSoil =
      rs.soilCount > 0 ? (int)(rs.soilPctSum / (float)rs.soilCount) : -1;
  float livePPM = avgOrNaN(rs.mqPpmSum, rs.mqCount);
  float liveW = avgOrNaN(rs.hxSum, rs.hxCount);

  String body = "{";
  body += "\"deviceId\":\"" + String(DEVICE_ID) + "\"";
  body += ",\"ip\":\"" + WiFi.localIP().toString() + "\"";
  body += ",\"wifiConnected\":" + jsonBool(WiFi.status() == WL_CONNECTED);
  body += ",\"monitoring\":" + jsonBool(monitoringEnabled);
  body += ",\"monitoringSessionId\":\"" + monitoringSessionId + "\"";
  body += ",\"currentRound\":" + String(currentRoundIndex + 1);

  // High-priority fields for the Dashboard UI
  body += ",\"rootTemp\":" + jsonValue(liveRoot);
  body += ",\"airTemp\":" + jsonValue(liveAir);
  body += ",\"humidity\":" + jsonValue(liveHum);
  body += ",\"soil\":" + (liveSoil == -1 ? String("null") : String(liveSoil));
  body += ",\"mqPPM\":" + jsonValue(livePPM);
  body += ",\"weight\":" + jsonValue(liveW);

  body += ",\"light\":\"" + String(lightOn ? "ON" : "OFF") + "\"";
  body += ",\"fan\":\"" + String(fanOn ? "ON" : "OFF") + "\"";
  body += ",\"water\":\"" + String(waterAutoOffActive ? "ON" : "OFF") + "\"";
  body += ",\"pest\":\"" + String(pestAutoOffActive ? "ON" : "OFF") + "\"";
  body += ",\"nutri\":\"" + String(nutriAutoOffActive ? "ON" : "OFF") + "\"";
  body += "}";

  return body;
}

// ============ SEND HTTP RESPONSE ============
void sendResponse(WiFiClient &client, int statusCode, String statusText,
                  String contentType, String body) {
  client.println("HTTP/1.1 " + String(statusCode) + " " + statusText);
  client.println("Content-Type: " + contentType);
  client.println("Access-Control-Allow-Origin: *");
  client.println("Connection: close");
  client.println();
  client.println(body);
}

void sendJson(WiFiClient &client, String body) {
  sendResponse(client, 200, "OK", "application/json", body);
}

// ============ WEB SERVER ============
void handleWebClient() {
  WiFiClient client = server.available();
  if (!client)
    return;

  unsigned long timeout = millis();
  while (client.connected() && !client.available() &&
         millis() - timeout < 1000) {
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
    if (line == "\r" || line.length() <= 1)
      break;
  }

  // ── GET /api/status ──
  if (req.indexOf("GET /api/status") >= 0) {
    sendJson(client, buildStatusJson());
  }

  // ── GET /api/monitor/on ──
  else if (req.indexOf("GET /api/monitor/on") >= 0) {
    monitoringEnabled = true;
    beginNewMonitoringSession(); // Force always reset Timeline
    sendJson(client, "{\"message\":\"Monitoring started.\",\"monitoring\":true,"
                     "\"monitoringSessionId\":\"" +
                         monitoringSessionId + "\"}");
    Serial.println("[WEB] MONITOR ON - Session: " + monitoringSessionId);
  }

  // ── GET /api/monitor/off ──
  else if (req.indexOf("GET /api/monitor/off") >= 0) {
    bool wasActive = monitoringEnabled;
    monitoringEnabled = false;

    // Attempt to finalize & send if batch was in progress
    bool batchSent = false;
    if (wasActive && currentRoundIndex >= 0) {
      if (!rs.finalized)
        finalizeCurrentRound();
      sendBatchToBackend(); // Always try to save even partial session when
                            // stopping manually
      batchSent = true;
    }

    String resp = "{\"message\":\"Monitoring stopped.\",\"monitoring\":false,";
    resp += "\"finalizedBatchSent\":" + jsonBool(batchSent) + ",";
    resp += "\"monitoringSessionId\":\"" + monitoringSessionId + "\"}";
    sendJson(client, resp);
    Serial.println("[WEB] MONITOR OFF");
  }

  // ── GET /api/light/on|off ──
  else if (req.indexOf("GET /api/light/on") >= 0) {
    setActuator(GROW_LIGHT_PIN, true);
    lightOn = true;
    sendJson(client, "{\"message\":\"Grow Light ON.\",\"light\":\"ON\"}");
  } else if (req.indexOf("GET /api/light/off") >= 0) {
    setActuator(GROW_LIGHT_PIN, false);
    lightOn = false;
    sendJson(client, "{\"message\":\"Grow Light OFF.\",\"light\":\"OFF\"}");
  }

  // ── GET /api/fan/on|off ──
  else if (req.indexOf("GET /api/fan/on") >= 0) {
    setActuator(WIND_FAN_PIN, true);
    fanOn = true;
    sendJson(client, "{\"message\":\"Fan ON.\",\"fan\":\"ON\"}");
  } else if (req.indexOf("GET /api/fan/off") >= 0) {
    setActuator(WIND_FAN_PIN, false);
    fanOn = false;
    sendJson(client, "{\"message\":\"Fan OFF.\",\"fan\":\"OFF\"}");
  }

  // ── GET /api/water/on|off ──
  else if (req.indexOf("GET /api/water/on") >= 0) {
    turnWaterOn();
    sendJson(
        client,
        "{\"message\":\"Water pump ON (auto-off in 5s).\",\"water\":\"ON\"}");
  } else if (req.indexOf("GET /api/water/off") >= 0) {
    setActuator(WATER_PUMP_PIN, false);
    waterAutoOffActive = false;
    sendJson(client, "{\"message\":\"Water pump OFF.\",\"water\":\"OFF\"}");
  }

  // ── GET /api/pest/on|off ──
  else if (req.indexOf("GET /api/pest/on") >= 0) {
    turnPestOn();
    sendJson(client, "{\"message\":\"Pesticide pump ON (auto-off in "
                     "5s).\",\"pest\":\"ON\"}");
  } else if (req.indexOf("GET /api/pest/off") >= 0) {
    setActuator(PESTICIDE_PUMP_PIN, false);
    pestAutoOffActive = false;
    sendJson(client, "{\"message\":\"Pesticide pump OFF.\",\"pest\":\"OFF\"}");
  }

  // ── GET /api/nutri/on|off ──
  else if (req.indexOf("GET /api/nutri/on") >= 0) {
    turnNutriOn();
    sendJson(client, "{\"message\":\"Nutrition pump ON (auto-off in "
                     "5s).\",\"nutri\":\"ON\"}");
  } else if (req.indexOf("GET /api/nutri/off") >= 0) {
    setActuator(NUTRITION_PUMP_PIN, false);
    nutriAutoOffActive = false;
    sendJson(client, "{\"message\":\"Nutrition pump OFF.\",\"nutri\":\"OFF\"}");
  }

  // ── GET /api/sleep ──
  else if (req.indexOf("GET /api/sleep") >= 0) {
    sendJson(
        client,
        "{\"message\":\"Going to deep sleep (not implemented — ignored).\"}");
  }

  // ── 404 ──
  else {
    sendResponse(client, 404, "Not Found", "application/json",
                 "{\"error\":\"Endpoint not found\"}");
  }

  delay(1);
  client.stop();
}

// ============ SETUP ============
void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("\n========================================");
  Serial.println("  SMART PLANT NODE (BOARD 1)");
  Serial.println("========================================");

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

  beginNewMonitoringSession();
  monitoringEnabled = false; // wait for /api/monitor/on or serial MONITOR ON

  Serial.println("\n✅ Board 1 ready. Port 80 listening.");
  Serial.println("📡 /api/status  /api/monitor/on  /api/monitor/off");
  Serial.println("   /api/light/on|off  /api/fan/on|off");
  Serial.println("   /api/water/on|off  /api/pest/on|off  /api/nutri/on|off");
  printHelp();
}

// ============ LOOP ============
void loop() {
  handleSerialCommands();
  serviceActuatorAutoOff();
  handleWebClient();

  if (!monitoringEnabled)
    return;

  unsigned long now = millis();
  unsigned long batchElapsed = now - batchStartMs;
  int newRoundIndex = (int)(batchElapsed / ROUND_MS);

  // Batch complete
  // Batch complete
  if (newRoundIndex >= NUM_ROUNDS) {
    if (!rs.finalized)
      finalizeCurrentRound();

    // Liberalizing: always try to send the batch once the cycle is complete.
    // This prevents losing the entire 5-minute session due to one flaky sensor
    // reading.
    Serial.println(
        "✅ Full cycle complete. Sending 10-round batch to backend...");
    sendBatchToBackend();

    beginNewMonitoringSession();
    return;
  }

  // Round transition
  if (newRoundIndex != currentRoundIndex) {
    if (currentRoundIndex >= 0 && !rs.finalized)
      finalizeCurrentRound();
    currentRoundIndex = newRoundIndex;
    resetRoundState();
    Serial.printf("\n--- Round %d started ---\n", currentRoundIndex + 1);
  }

  unsigned long roundOffset = batchElapsed % ROUND_MS;

  // DS18B20 window (0–2 s)
  float v = readDS18B20();
  if (!isnan(v) && v > -100 && v < 150) {
    rs.dsSamples[rs.dsSampIdx % 3] = v;
    rs.dsSampIdx++;
    if (rs.dsSampIdx >= 3) {
      float med = getMedian3(rs.dsSamples);
      rs.dsSum += med;
      rs.dsCount++;
      Serial.printf("[DS18B20] Med=%.2fC\n", med);
    }
  }
  rs.dsLast = now;

  // DHT11 window (3–5 s)
  if (roundOffset >= DHT_START_MS && roundOffset < DHT_END_MS) {
    if (now - rs.dhtLast >= DHT_SAMPLE_MS) {
      float h, t;
      if (readDHT11(h, t)) {
        rs.airSum += t;
        rs.humSum += h;
        rs.dhtCount++;
        Serial.printf("[DHT11] Temp=%.1f Hum=%.1f\n", t, h);
      }
      rs.dhtLast = now;
    }
  }

  // Soil window (12–14 s)
  if (roundOffset >= SOIL_START_MS && roundOffset < SOIL_END_MS) {
    if (now - rs.soilLast >= 500) { // sample every 500ms in window
      int raw = readSoilRaw();
      int pct = soilRawToPercent(raw);
      rs.soilRawSum += raw;
      rs.soilPctSum += pct;
      rs.soilCount++;
      Serial.printf("[SOIL] Raw=%d Moisture=%d%%\n", raw, pct);
      rs.soilLast = now;
    }
  }

  // MQ135 window (15–22 s)
  if (roundOffset >= MQ_START_MS && roundOffset < MQ_END_MS) {
    if (now - rs.mqLast >= MQ_SAMPLE_MS) {
      float adc, vout, ratio, ppm;
      if (readMQ135(adc, vout, ratio, ppm)) {
        rs.mqAdcSum += adc;
        rs.mqVoutSum += vout;
        rs.mqRatioSum += ratio;
        rs.mqPpmSum += ppm;
        rs.mqCount++;
        Serial.printf("[MQ135] ADC=%.0f Vout=%.3f Ratio=%.4f PPM=%.1f\n", adc,
                      vout, ratio, ppm);
      }
      rs.mqLast = now;
    }
  }

  // HX711 window (23–30 s)
  if (roundOffset >= HX_START_MS && roundOffset < HX_END_MS) {
    if (now - rs.hxLast >= HX_SAMPLE_MS) {
      float meanW, errW;
      if (updateHX711(meanW, errW)) {
        rs.hxSum += meanW;
        rs.hxErrSum += errW;
        rs.hxCount++;
        Serial.printf("[HX711] %.2fg [±%.3f]\n", meanW, errW);
      }
      rs.hxLast = now;
    }
  }
}
