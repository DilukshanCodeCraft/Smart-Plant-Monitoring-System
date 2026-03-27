/*
 * SMART PLANT MONITORING - BOARD 2 (USB Serial BH1750 Light Sensor + BLE Beacon Detection)
 * Serial Port: COM3 at 115200 baud
 * 
 * Connection: USB Serial (COM3) - NOT WiFi or Bluetooth for main connection
 * Sensor: BH1750 Light Sensor (I2C: SDA=GPIO12, SCL=GPIO13)
 * Beacon: BLE (Bluetooth Low Energy) scanning for proximity detection
 * Function: Reads light intensity, scans BLE beacons for location, outputs via serial
 * Database: DISABLED - All values sent to backend application via serial
 * Web Server: DISABLED (USB Serial only)
 * Commands: MONITOR ON / MONITOR OFF (via Serial COM3, synced with Board 1)
 */

#include <Wire.h>
#include <BH1750.h>
#include <BLEDevice.h>
#include <BLEScan.h>
#include <BLEAdvertisedDevice.h>

// ==================== Sensor Pin Definitions ====================
#define SDA_PIN 12
#define SCL_PIN 13
#define BH1750_ADDR 0x23

// ==================== BLE Beacon Configuration ====================
struct BeaconMap {
  const char* name;
  const char* address;  // BLE MAC address
};

BeaconMap beacons[] = {
  {"Living room", "AA:BB:CC:DD:EE:01"},  // beaconA - living room
  {"Bed room", "AA:BB:CC:DD:EE:02"},     // beaconB - bedroom
  {"Library", "AA:BB:CC:DD:EE:03"}       // beaconC - library
};
const int BEACON_COUNT = 3;

// ==================== Sensor Object ====================
BH1750 lightMeter;
BLEScan* pBLEScan = NULL;

// ==================== Global Variables ====================
bool monitoringEnabled = false;
float lastLuxReading = 0;
String nearestBeacon = "";
String mappedRoom = "";
int bestSignalStrength = -100;
unsigned long lastScan = 0;
unsigned long lastOutput = 0;

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n========================================");
  Serial.println("  SMART PLANT BOARD 2 - USB SERIAL");
  Serial.println("========================================");
  Serial.println("Connection: COM3 at 115200 baud");
  Serial.println("Type: BH1750 Light Sensor + BLE Beacon Scanner\n");

  // Initialize I2C for BH1750
  Wire.begin(SDA_PIN, SCL_PIN);
  delay(200);

  // Initialize BH1750
  if (lightMeter.begin(BH1750::CONTINUOUS_HIGH_RES_MODE, BH1750_ADDR, &Wire)) {
    Serial.println("✅ BH1750 initialized successfully at 0x23");
  } else {
    Serial.println("❌ BH1750 initialization failed! Check wiring.");
  }

  // Initialize BLE for Bluetooth beacon scanning
  BLEDevice::init("ESP32-BLE-Scanner");
  pBLEScan = BLEDevice::getScan();
  pBLEScan->setActiveScan(true);  // Active scanning = get RSSI + response
  pBLEScan->setInterval(100);     // Scan interval 100ms
  pBLEScan->setWindow(99);        // Scan window 99ms
  
  Serial.println("📡 BLE beacon scanning ENABLED (not connected)\n");
  
  Serial.println("Commands available via Serial (COM3):");
  Serial.println("  - MONITOR ON   : Start BLE beacon scanning");
  Serial.println("  - MONITOR OFF  : Stop BLE beacon scanning");
  Serial.println("========================================\n");
  
  Serial.println("LIVE DATA OUTPUT:");
  Serial.println("Light: <lux> lx");
  Serial.println("RSSI -> A:<rssi> B:<rssi> C:<rssi>");
  Serial.println("Nearest Corner: <beacon_name>");
  Serial.println("----------------------------------------\n");
}

void loop() {
  // ==================== Handle Serial Commands ====================
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();
    
    if (command.equalsIgnoreCase("MONITOR ON")) {
      monitoringEnabled = true;
      Serial.println("\n✅ MONITOR ON");
      Serial.println("→ Beacon scanning STARTED (synced with Board 1)");
      Serial.println("→ Sending live values to COM3\n");
    }
    else if (command.equalsIgnoreCase("MONITOR OFF")) {
      monitoringEnabled = false;
      Serial.println("\n❌ MONITOR OFF");
      Serial.println("→ Beacon scanning STOPPED\n");
    }
    else if (command.length() > 0) {
      Serial.println("❓ Unknown: " + command);
      Serial.println("   Use: MONITOR ON or MONITOR OFF\n");
    }
  }

  // ==================== Read Light Sensor ====================
  float lux = lightMeter.readLightLevel();
  if (lux < 0) {
    delay(100);
    lux = lightMeter.readLightLevel();
  }
  lastLuxReading = lux;

  // ==================== Scan for BLE Beacons (during monitoring) ====================
  if (monitoringEnabled) {
    unsigned long now = millis();
    if (now - lastScan >= 10000) { // Scan every 10 seconds (BLE scan takes ~5 seconds)
      scanBeacons();
      lastScan = now;
    }
  }

  // ==================== Serial Output Every 1 Second ====================
  // Format: Matches backend parser expectations for COM3 serial input
  unsigned long now = millis();
  if (now - lastOutput >= 1000) {
    // Line 1: Light reading
    Serial.print("Light: ");
    Serial.print(lux, 1);
    Serial.println(" lx");
    
    // Line 2: RSSI values (if scanning)
    if (monitoringEnabled) {
      Serial.print("RSSI -> A:? B:? C:? | Nearest Corner: ");
      if (nearestBeacon.length() > 0) {
        Serial.println(nearestBeacon);
      } else {
        Serial.println("--");
      }
    }
    
    lastOutput = now;
  }

  delay(50); // Prevent overwhelming the loop
}

// ==================== Scan for Nearby BLE Beacons ====================
void scanBeacons() {
  if (!pBLEScan) return;

  // Scan for BLE devices (5 seconds)
  BLEScanResults foundDevices = pBLEScan->start(5, false);

  int bestSignalStrength = -100;
  String detectedBeacon = "";
  int detectedIndex = -1;

  Serial.println("[BLE SCAN] Scanning for beacons...");

  // Check discovered BLE devices against known beacon addresses
  for (int i = 0; i < foundDevices.getCount(); i++) {
    BLEAdvertisedDevice device = foundDevices.getDevice(i);
    String deviceAddress = device.getAddress().toString().c_str();
    int rssi = device.getRSSI();

    Serial.print("  Found: ");
    Serial.print(deviceAddress.c_str());
    Serial.print(" (RSSI: ");
    Serial.print(rssi);
    Serial.println(" dBm)");

    // Match against known beacons
    for (int b = 0; b < BEACON_COUNT; b++) {
      if (deviceAddress.equalsIgnoreCase(beacons[b].address)) {
        if (rssi > bestSignalStrength) {
          bestSignalStrength = rssi;
          detectedBeacon = beacons[b].name;
          detectedIndex = b;

          Serial.print("  ✅ MATCHED: ");
          Serial.print(beacons[b].name);
          Serial.print(" (");
          Serial.print(beacons[b].address);
          Serial.println(")");
        }
      }
    }
  }

  // Update nearest beacon
  if (detectedBeacon.length() > 0 && detectedIndex >= 0) {
    nearestBeacon = detectedBeacon;
    mappedRoom = detectedBeacon;
    bestSignalStrength = bestSignalStrength;

    Serial.print("[BEACON DETECTED] ");
    Serial.print("Nearest: ");
    Serial.print(nearestBeacon);
    Serial.print(" (RSSI: ");
    Serial.print(bestSignalStrength);
    Serial.println(" dBm)\n");
  } else {
    nearestBeacon = "";
    mappedRoom = "";
    bestSignalStrength = -100;
    Serial.println("[BLE SCAN] No known beacons found.\n");
  }

  pBLEScan->clearResults();
}


