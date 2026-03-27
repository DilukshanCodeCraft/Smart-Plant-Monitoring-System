#include <Arduino.h>
#include <Wire.h>
#include <BH1750.h>
#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <math.h>

// Board 2 is USB serial only (COM3 at 115200).
// It does not connect to WiFi and does not run an HTTP server.
// It provides light + BLE beacon data via serial for backend serial parser.

#define I2C_SDA_PIN 12
#define I2C_SCL_PIN 13
#define BH1750_ADDR 0x23

const char* DEVICE_ID = "ESP32-BH1750-COM3";

// Beacon MACs from user-provided configuration.
String beaconA = "50:65:83:92:e9:c4";
String beaconB = "04:a3:16:8d:b2:2c";
String beaconC = "98:7b:f3:74:d3:db";

struct Point { float x; float y; };
Point A = {0, 0};
Point B = {2, 0};
Point C = {1, 1.73};

const float TxPower = -59;
const float n = 2.5;

BH1750 lightMeter;
BLEScan* pBLEScan = nullptr;

bool bhReady = false;
bool monitoringEnabled = false;

int rssiA = -999;
int rssiB = -999;
int rssiC = -999;
String nearestCorner = "--";
float lastDistanceA = NAN;
float lastDistanceB = NAN;
float lastDistanceC = NAN;
float lastPlantX = NAN;
float lastPlantY = NAN;

unsigned long lastLuxReadMs = 0;
unsigned long lastBleScanMs = 0;
const unsigned long LUX_SAMPLE_MS = 1000UL;
const unsigned long BLE_SCAN_INTERVAL_MS = 5000UL;
const int BLE_SCAN_SECONDS = 3;

class MyAdvertisedDeviceCallbacks : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice advertisedDevice) {
    String mac = advertisedDevice.getAddress().toString().c_str();
    mac.toLowerCase();
    int rssi = advertisedDevice.getRSSI();

    if (mac == beaconA) {
      rssiA = rssi;
    } else if (mac == beaconB) {
      rssiB = rssi;
    } else if (mac == beaconC) {
      rssiC = rssi;
    }
  }
};

bool initBH1750() {
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  delay(200);

  for (int i = 0; i < 3; i++) {
    if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, BH1750_ADDR, &Wire)) {
      Serial.println("BH1750 initialized at 0x23");
      return true;
    }
    delay(300);
  }

  Serial.println("BH1750 init failed");
  return false;
}

void initBLEScanner() {
  BLEDevice::init("");
  pBLEScan = BLEDevice::getScan();
  if (!pBLEScan) {
    Serial.println("BLE scanner init failed");
    return;
  }

  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks());
  pBLEScan->setActiveScan(true);
  pBLEScan->setInterval(100);
  pBLEScan->setWindow(100);

  Serial.println("BLE scanner ready");
}

float rssiToDistance(int rssi) {
  return pow(10.0, (TxPower - rssi) / (10.0 * n));
}

Point trilaterate(float dA, float dB, float dC) {
  float x = (dA * dA - dB * dB + B.x * B.x) / (2 * B.x);
  float y = (dA * dA - dC * dC + C.x * C.x + C.y * C.y - 2 * C.x * x) / (2 * C.y);
  return {x, y};
}

void refreshNearestCorner() {
  nearestCorner = "--";
  lastDistanceA = NAN;
  lastDistanceB = NAN;
  lastDistanceC = NAN;
  lastPlantX = NAN;
  lastPlantY = NAN;

  if (rssiA == -999 || rssiB == -999 || rssiC == -999) {
    return;
  }

  lastDistanceA = rssiToDistance(rssiA);
  lastDistanceB = rssiToDistance(rssiB);
  lastDistanceC = rssiToDistance(rssiC);

  Point plant = trilaterate(lastDistanceA, lastDistanceB, lastDistanceC);
  lastPlantX = plant.x;
  lastPlantY = plant.y;

  float distA = sqrt(pow(plant.x - A.x, 2) + pow(plant.y - A.y, 2));
  float distB = sqrt(pow(plant.x - B.x, 2) + pow(plant.y - B.y, 2));
  float distC = sqrt(pow(plant.x - C.x, 2) + pow(plant.y - C.y, 2));

  float minDist = distA;
  nearestCorner = "corner a";
  if (distB < minDist) {
    minDist = distB;
    nearestCorner = "corner b";
  }
  if (distC < minDist) {
    nearestCorner = "corner c";
  }
}

void scanBLE() {
  if (!pBLEScan) {
    return;
  }

  rssiA = -999;
  rssiB = -999;
  rssiC = -999;

  BLEScanResults* foundDevices = pBLEScan->start(BLE_SCAN_SECONDS, false);
  (void)foundDevices;
  pBLEScan->clearResults();

  refreshNearestCorner();
}

float readLux() {
  float lux = lightMeter.readLightLevel();
  if (lux < 0.0f) {
    delay(100);
    lux = lightMeter.readLightLevel();
  }
  return lux;
}

void printHelp() {
  Serial.println("Commands:");
  Serial.println("MONITOR ON");
  Serial.println("MONITOR OFF");
  Serial.println("STATUS");
  Serial.println("HELP");
}

void printStatus() {
  Serial.println("---- BOARD 2 STATUS ----");
  Serial.print("Device: ");
  Serial.println(DEVICE_ID);
  Serial.print("Monitoring: ");
  Serial.println(monitoringEnabled ? "ON" : "OFF");
  Serial.print("RSSI -> A:");
  Serial.print(rssiA);
  Serial.print(" B:");
  Serial.print(rssiB);
  Serial.print(" C:");
  Serial.println(rssiC);
  Serial.print("Distance -> A:");
  Serial.print(isnan(lastDistanceA) ? -1.0 : lastDistanceA, 2);
  Serial.print(" B:");
  Serial.print(isnan(lastDistanceB) ? -1.0 : lastDistanceB, 2);
  Serial.print(" C:");
  Serial.println(isnan(lastDistanceC) ? -1.0 : lastDistanceC, 2);
  if (!isnan(lastPlantX) && !isnan(lastPlantY)) {
    Serial.print("Estimated Plant Position -> x: ");
    Serial.print(lastPlantX, 2);
    Serial.print(" m, y: ");
    Serial.print(lastPlantY, 2);
    Serial.println(" m");
  }
  Serial.print("Nearest Corner: ");
  Serial.println(nearestCorner);
}

void handleSerialCommands() {
  if (!Serial.available()) {
    return;
  }

  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "MONITOR ON") {
    monitoringEnabled = true;
    Serial.println("[SERIAL] MONITOR ON");
  } else if (cmd == "MONITOR OFF") {
    monitoringEnabled = false;
    rssiA = -999;
    rssiB = -999;
    rssiC = -999;
    nearestCorner = "--";
    lastDistanceA = NAN;
    lastDistanceB = NAN;
    lastDistanceC = NAN;
    lastPlantX = NAN;
    lastPlantY = NAN;
    Serial.println("[SERIAL] MONITOR OFF");
  } else if (cmd == "STATUS") {
    printStatus();
  } else if (cmd == "HELP") {
    printHelp();
  } else if (cmd.length() > 0) {
    Serial.println("Unknown command. Type HELP");
  }
}

void setup() {
  Serial.begin(115200);
  delay(1200);

  Serial.println("========================================");
  Serial.println("BOARD 2: USB SERIAL (COM3) ONLY");
  Serial.println("No WiFi connection. No HTTP server.");
  Serial.println("========================================");

  bhReady = initBH1750();
  initBLEScanner();

  printHelp();
}

void loop() {
  handleSerialCommands();

  unsigned long now = millis();

  if (!bhReady) {
    static unsigned long lastRetryMs = 0;
    if (now - lastRetryMs >= 5000UL) {
      bhReady = initBH1750();
      lastRetryMs = now;
    }

    // Keep streaming fallback values so backend/parser and test page stay live.
    if (now - lastLuxReadMs >= LUX_SAMPLE_MS) {
      Serial.println("Light: -1.00 lx");
      Serial.println("RSSI -> A:-999 B:-999 C:-999");
      Serial.println("Nearest Corner: --");
      lastLuxReadMs = now;
    }

    delay(20);
    return;
  }

  if (monitoringEnabled && now - lastBleScanMs >= BLE_SCAN_INTERVAL_MS) {
    scanBLE();
    lastBleScanMs = now;
  }

  if (now - lastLuxReadMs >= LUX_SAMPLE_MS) {
    float lux = readLux();

    // Backend parser contract:
    // 1) Light: <number>
    // 2) RSSI -> A:<int> B:<int> C:<int>
    // 3) Nearest Corner: <corner a|corner b|corner c|-->
    Serial.print("Light: ");
    Serial.print(lux, 2);
    Serial.println(" lx");

    Serial.print("RSSI -> A:");
    Serial.print(rssiA);
    Serial.print(" B:");
    Serial.print(rssiB);
    Serial.print(" C:");
    Serial.println(rssiC);

    Serial.print("Distance -> A:");
    Serial.print(isnan(lastDistanceA) ? -1.0 : lastDistanceA, 2);
    Serial.print(" B:");
    Serial.print(isnan(lastDistanceB) ? -1.0 : lastDistanceB, 2);
    Serial.print(" C:");
    Serial.println(isnan(lastDistanceC) ? -1.0 : lastDistanceC, 2);

    if (!isnan(lastPlantX) && !isnan(lastPlantY)) {
      Serial.print("Estimated Plant Position -> x: ");
      Serial.print(lastPlantX, 2);
      Serial.print(" m, y: ");
      Serial.print(lastPlantY, 2);
      Serial.println(" m");
    }

    Serial.print("Nearest Corner: ");
    Serial.println(nearestCorner);

    lastLuxReadMs = now;
  }

  delay(20);
}
