/**
 * Smart Plant Lux Node – SECONDARY BOARD (Board 2)
 * ==================================================
 * Sensor  : BH1750 light meter (I2C: SDA=GPIO12, SCL=GPIO13)
 * Location: BLE beacon scanning (3 beacons, trilateration)
 * Transport: USB Serial only — COM3 at 115200 baud
 *           (no WiFi, no HTTP server, no database writes)
 *
 * Serial output contract (parsed by backend usbLuxBoardService):
 *   Light: <lux> lx
 *   RSSI -> A:<int> B:<int> C:<int>
 *   Distance -> A:<float> B:<float> C:<float>
 *   [optional] Estimated Plant Position -> x: <float> m, y: <float> m
 *   Nearest Corner: <corner a|corner b|corner c|-->
 *
 * Commands via Serial COM3:
 *   MONITOR ON   — enable BLE scanning
 *   MONITOR OFF  — disable BLE scanning, reset beacon state
 *   STATUS       — print current state
 *   HELP         — list commands
 */

#include <Arduino.h>
#include <Wire.h>
#include <BH1750.h>
#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>
#include <math.h>

// ============ I2C / BH1750 ============
#define I2C_SDA_PIN  12
#define I2C_SCL_PIN  13
#define BH1750_ADDR  0x23

const char* DEVICE_ID = "ESP32-BH1750-COM3";

// ============ BLE BEACONS ============
// Use the actual MAC addresses of your three BLE beacons.
String beaconA_MAC = "50:65:83:92:e9:c4";
String beaconB_MAC = "04:a3:16:8d:b2:2c";
String beaconC_MAC = "98:7b:f3:74:d3:db";

// Room names mapped to each beacon
const char* ROOM_A = "Living room";
const char* ROOM_B = "Bed room";
const char* ROOM_C = "Library";

// Trilateration coordinates (meters)
struct Point { float x; float y; };
Point A = {0,0};
Point B = {2,0};
Point C = {1,1.73}; // equilateral triangle, ~2 m sides

// TxPower and environment factor
const float TxPower = -59; // HM-10 typical at 1 m
const float n = 2.5;       // indoor environment factor

// ============ TIMING ============
int scanTime = 5; // seconds (matches user code)

// ============ OBJECTS ============
BH1750 lightMeter;

// ============ STATE ============
bool bhReady          = false;
bool monitoringEnabled = true;

int   rssiA = -999;
int   rssiB = -999;
int   rssiC = -999;
float lastDistanceA = NAN;
float lastDistanceB = NAN;
float lastDistanceC = NAN;
float lastPlantX    = NAN;
float lastPlantY    = NAN;
String nearestCorner = "Unknown";
String nearestRoom   = "--";

// ============ BLE CALLBACK ============
class MyAdvertisedDeviceCallbacks : public BLEAdvertisedDeviceCallbacks {
  void onResult(BLEAdvertisedDevice advertisedDevice) override {
    String mac = advertisedDevice.getAddress().toString().c_str();
    int rssi = advertisedDevice.getRSSI();

    if (mac == beaconA_MAC)      rssiA = rssi;
    else if (mac == beaconB_MAC) rssiB = rssi;
    else if (mac == beaconC_MAC) rssiC = rssi;
  }
};

// Convert RSSI to approximate distance
float rssiToDistance(int rssi) {
  return pow(10.0, (TxPower - rssi) / (10.0 * n));
}

// Trilateration calculation
Point trilaterate(float dA, float dB, float dC) {
  // Solve using linearized equations from two circles
  float x = (dA*dA - dB*dB + B.x*B.x) / (2*B.x);
  float y = (dA*dA - dC*dC + C.x*C.x + C.y*C.y - 2*C.x*x) / (2*C.y);
  return {x, y};
}

void resetBeaconState() {
  rssiA = -999; rssiB = -999; rssiC = -999;
  lastDistanceA = NAN; lastDistanceB = NAN; lastDistanceC = NAN;
  lastPlantX = NAN; lastPlantY = NAN;
  nearestCorner = "--";
  nearestRoom   = "--";
}

void computeNearest() {
  nearestCorner = "Unknown";
  nearestRoom   = "--";
  lastPlantX = NAN; lastPlantY = NAN;

  // Always compute distances just like the user's code
  lastDistanceA = rssiToDistance(rssiA);
  lastDistanceB = rssiToDistance(rssiB);
  lastDistanceC = rssiToDistance(rssiC);

  // Only trilaterate if ALL beacons are found
  if (rssiA == -999 || rssiB == -999 || rssiC == -999) {
    return;
  }

  Point plant  = trilaterate(lastDistanceA, lastDistanceB, lastDistanceC);
  lastPlantX   = plant.x;
  lastPlantY   = plant.y;

  // Determine nearest corner
  float distA = sqrt(pow(plant.x-A.x,2)+pow(plant.y-A.y,2));
  float distB = sqrt(pow(plant.x-B.x,2)+pow(plant.y-B.y,2));
  float distC = sqrt(pow(plant.x-C.x,2)+pow(plant.y-C.y,2));

  float minDist = distA;
  nearestCorner = "Corner A";
  nearestRoom   = ROOM_A;

  if (distB < minDist) {
    minDist       = distB;
    nearestCorner = "Corner B";
    nearestRoom   = ROOM_B;
  }
  if (distC < minDist) {
    nearestCorner = "Corner C";
    nearestRoom   = ROOM_C;
  }
}

// ============ BH1750 INIT ============
bool initBH1750() {
  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  delay(200);
  for (int i = 0; i < 3; i++) {
    if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, BH1750_ADDR, &Wire)) {
      Serial.println("✅ BH1750 initialized at 0x23");
      return true;
    }
    delay(300);
  }
  Serial.println("❌ BH1750 init failed");
  return false;
}

// ============ BLE SCAN ============
void initBLEScanner() {
  BLEDevice::init("");
  BLEScan* pBLEScan = BLEDevice::getScan();
  pBLEScan->setAdvertisedDeviceCallbacks(new MyAdvertisedDeviceCallbacks());
  pBLEScan->setActiveScan(true);
  Serial.println("📡 BLE scanner ready");
}

void scanBLE() {
  rssiA = rssiB = rssiC = -999;

  BLEScan* pBLEScan = BLEDevice::getScan();
  BLEScanResults* foundDevices = pBLEScan->start(scanTime, false);
  pBLEScan->clearResults();

  computeNearest();
}

// ============ READ LUX ============
float readLux() {
  float lux = lightMeter.readLightLevel();
  if (lux < 0.0f) {
    delay(100);
    lux = lightMeter.readLightLevel();
  }
  return lux;
}

// ============ SERIAL OUTPUT ============
void publishReading(float lux) {
  // Line 1: lux
  Serial.print("Light: ");
  Serial.print(lux, 2);
  Serial.println(" lx");

  // Line 2: RSSI values
  Serial.print("RSSI -> A:");
  Serial.print(rssiA);
  Serial.print(" B:");
  Serial.print(rssiB);
  Serial.print(" C:");
  Serial.println(rssiC);

  // Line 3: Distances
  Serial.print("Distance -> A:");
  Serial.print(lastDistanceA, 2);
  Serial.print(" B:");
  Serial.print(lastDistanceB, 2);
  Serial.print(" C:");
  Serial.println(lastDistanceC, 2);

  // Line 4 (optional): estimated plant position
  if (!isnan(lastPlantX) && !isnan(lastPlantY)) {
    Serial.print("Estimated Plant Position -> x: ");
    Serial.print(lastPlantX, 2);
    Serial.print(" m, y: ");
    Serial.print(lastPlantY, 2);
    Serial.println(" m");
  }

  // Line 5: nearest corner
  if (rssiA != -999 && rssiB != -999 && rssiC != -999) {
    Serial.print("Nearest Corner: ");
    Serial.println(nearestCorner);
  } else {
    Serial.println("Nearest Corner: Waiting for all beacons...");
  }
}

// ============ STATUS / HELP ============
void printHelp() {
  Serial.println("Commands: MONITOR ON | MONITOR OFF | STATUS | HELP");
}

void printStatus() {
  Serial.println("---- BOARD 2 STATUS ----");
  Serial.print("Device: ");      Serial.println(DEVICE_ID);
  Serial.print("BH1750: ");      Serial.println(bhReady ? "OK" : "FAIL");
  Serial.print("Monitoring: ");  Serial.println(monitoringEnabled ? "ON" : "OFF");
  Serial.printf("RSSI -> A:%d B:%d C:%d\n", rssiA, rssiB, rssiC);
  if (!isnan(lastDistanceA)) {
    Serial.printf("Distance -> A:%.2f B:%.2f C:%.2f\n", lastDistanceA, lastDistanceB, lastDistanceC);
  }
  if (!isnan(lastPlantX)) {
    Serial.printf("Position -> x:%.2f m, y:%.2f m\n", lastPlantX, lastPlantY);
  }
  Serial.print("Nearest Corner: "); Serial.println(nearestCorner);
  Serial.print("Nearest Room: ");   Serial.println(nearestRoom);
}

// ============ SERIAL COMMANDS ============
void handleSerialCommands() {
  if (!Serial.available()) return;
  String cmd = Serial.readStringUntil('\n');
  cmd.trim();
  cmd.toUpperCase();

  if (cmd == "MONITOR ON") {
    monitoringEnabled = true;
    Serial.println("[SERIAL] MONITOR ON");
  } else if (cmd == "MONITOR OFF") {
    monitoringEnabled = false;
    resetBeaconState();
    Serial.println("[SERIAL] MONITOR OFF");
  } else if (cmd == "STATUS") {
    printStatus();
  } else if (cmd == "HELP") {
    printHelp();
  } else if (cmd.length() > 0) {
    Serial.println("Unknown command. Type HELP");
  }
}

// ============ SETUP ============
void setup() {
  Serial.begin(115200);
  delay(1200);

  Serial.println("========================================");
  Serial.println("BOARD 2: USB SERIAL (COM3) — LUX + BLE");
  Serial.println("No WiFi. No HTTP server. No DB writes.");
  Serial.println("========================================");

  bhReady = initBH1750();
  initBLEScanner();

  printHelp();
  Serial.println();
}

// ============ LOOP ============
void loop() {
  handleSerialCommands();

  // Retry BH1750 init if it failed at boot
  if (!bhReady) {
    bhReady = initBH1750();
    if (!bhReady) {
      // Keep streaming fallback so the backend parser stays in sync
      Serial.println("Light: -1.00 lx");
      Serial.println("RSSI -> A:-999 B:-999 C:-999");
      Serial.println("Distance -> A:-1.00 B:-1.00 C:-1.00");
      Serial.println("Nearest Corner: Waiting for all beacons...");
      delay(3000);
      return;
    }
  }

  // If monitoring is OFF, just output Lux and empty beacon info
  if (!monitoringEnabled) {
    float lux = readLux();
    publishReading(lux);
    delay(3000);
    return;
  }

  // Monitoring is ON -> Run the sequential scan block and read
  scanBLE();
  float lux = readLux();
  publishReading(lux);
  
  delay(3000); // 3 sec delay matches user code
}
