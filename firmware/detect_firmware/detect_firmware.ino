/**
 * DeTECT Firmware — ESP32
 * ========================
 * Pothole detection via MPU-6050 accelerometer + GPS coordinates,
 * reported to Firebase Realtime Database over Wi-Fi (REST API).
 *
 * ── TEST FLAGS ──────────────────────────────────────────────────────────────
 * Set these to 1 one at a time to verify each subsystem before full integration.
 *
 *   TEST_WIFI_ONLY     — connects to Wi-Fi, prints IP, stops
 *   TEST_GPS_ONLY      — streams raw GPS NMEA sentences + parsed lat/lon
 *   TEST_MPU_ONLY      — streams raw accel/gyro + computed g-force every 200 ms
 *   TEST_FIREBASE_ONLY — sends a hard-coded dummy record to Firebase, no sensors
 *   0                  — full integration: all sensors + live Firebase posting
 * ────────────────────────────────────────────────────────────────────────────
 */
#define TEST_WIFI_ONLY     0
#define TEST_GPS_ONLY      0
#define TEST_MPU_ONLY      0
#define TEST_FIREBASE_ONLY 0

// ── USER CONFIG ──────────────────────────────────────────────────────────────
#define WIFI_SSID        "YOUR_WIFI_SSID"
#define WIFI_PASSWORD    "YOUR_WIFI_PASSWORD"

// Firebase Realtime Database REST endpoint — must end with /potholes.json
// POST to this URL creates a new child with an auto-generated push ID.
#define FIREBASE_URL \
  "https://e-detection-system-e96dc-default-rtdb.asia-southeast1.firebasedatabase.app/potholes.json"

// Legacy Database Secret (Firebase Console → Project Settings →
// Service Accounts → Database Secrets → Show).
// Alternatively, leave blank and open DB rules to allow unauthenticated writes
// for testing (restrict again before going live).
#define FIREBASE_SECRET  "YOUR_DATABASE_SECRET"

// ── PIN DEFINITIONS ──────────────────────────────────────────────────────────
// GPS module connected to ESP32 UART1
#define GPS_RX_PIN  16   // ESP32 GPIO16 → GPS TX
#define GPS_TX_PIN  17   // ESP32 GPIO17 → GPS RX
#define GPS_BAUD    9600

// MPU-6050 uses I²C; default ESP32 I²C pins
// SDA → GPIO21,  SCL → GPIO22  (no defines needed — Wire uses them by default)

// Built-in LED for status blinks (most ESP32 dev boards)
#define LED_PIN     2

// ── TUNING ───────────────────────────────────────────────────────────────────
// Z-axis g-force threshold to classify an event as a pothole.
// Start high (2.5) and lower gradually while driving; avoid false positives
// from speed bumps and railway crossings by tuning the DEBOUNCE_MS window.
#define POTHOLE_G_THRESHOLD  2.5f   // g — tune for your vehicle / mount position

// Minimum milliseconds between two consecutive reports (debounce window).
// Prevents the same pothole from being posted multiple times.
#define DEBOUNCE_MS  4000

// Milliseconds to wait for a GPS fix on startup before giving up
#define GPS_FIX_TIMEOUT_MS  60000

// ── LIBRARIES ────────────────────────────────────────────────────────────────
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>   // ArduinoJson by Benoit Blanchon  (v6 or v7)
#include <TinyGPSPlus.h>   // TinyGPSPlus by Mikal Hart
#include <Wire.h>
#include <MPU6050.h>       // MPU6050 by Electronic Cats  OR  i2cdevlib version

// ── GLOBALS ──────────────────────────────────────────────────────────────────
TinyGPSPlus  gps;
HardwareSerial gpsSerial(1);   // UART1
MPU6050      mpu;

unsigned long lastReportMs = 0;   // timestamp of last Firebase POST
bool          wifiOK       = false;
bool          gpsFix       = false;

// ── HELPERS ──────────────────────────────────────────────────────────────────

/** Blink the LED n times (blocking — only used during setup). */
void blinkLED(int n, int ms = 150) {
  for (int i = 0; i < n; i++) {
    digitalWrite(LED_PIN, HIGH);
    delay(ms);
    digitalWrite(LED_PIN, LOW);
    delay(ms);
  }
}

/**
 * Map peak Z-axis g-force to a 1–10 severity integer.
 * Tweak the thresholds after calibration runs on your roads.
 *
 *  g < 1.5  →  1–3  (minor bump / noise)
 *  g < 2.5  →  4–6  (moderate pothole)
 *  g < 4.0  →  7–8  (significant pothole)
 *  g ≥ 4.0  →  9–10 (severe)
 */
int mapGToSeverity(float peakG) {
  if (peakG < 1.5f) return 2;
  if (peakG < 2.5f) return 5;
  if (peakG < 4.0f) return 7;
  return 9;
}

// ── WI-FI ────────────────────────────────────────────────────────────────────

void connectWiFi() {
  Serial.printf("\n[WiFi] Connecting to %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    wifiOK = true;
    Serial.printf("\n[WiFi] Connected — IP: %s\n", WiFi.localIP().toString().c_str());
    blinkLED(3, 100);
  } else {
    Serial.println("\n[WiFi] FAILED — will retry in loop");
  }
}

// ── FIREBASE POST ────────────────────────────────────────────────────────────

/**
 * POST a pothole record to Firebase RTDB.
 * Returns true on HTTP 200/200-range success.
 *
 * The payload matches the shape expected by validateRecord() in helpers.js:
 *   { latitude: <float>, longitude: <float>, severity: <int 1-10> }
 */
bool postToFirebase(float lat, float lon, int severity) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[Firebase] No Wi-Fi — skipping POST");
    return false;
  }

  HTTPClient http;

  // Append auth secret as query param if configured
  String url = String(FIREBASE_URL);
  if (strlen(FIREBASE_SECRET) > 0) {
    url += "?auth=";
    url += FIREBASE_SECRET;
  }

  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(8000);

  // Build JSON payload
  StaticJsonDocument<128> doc;
  doc["latitude"]  = lat;
  doc["longitude"] = lon;
  doc["severity"]  = severity;

  String body;
  serializeJson(doc, body);

  Serial.printf("[Firebase] POST  lat=%.6f  lon=%.6f  sev=%d\n", lat, lon, severity);
  Serial.printf("[Firebase] Body: %s\n", body.c_str());

  int httpCode = http.POST(body);
  bool ok = (httpCode >= 200 && httpCode < 300);

  if (ok) {
    Serial.printf("[Firebase] ✓ Response %d: %s\n", httpCode, http.getString().c_str());
    blinkLED(2, 80);
  } else {
    Serial.printf("[Firebase] ✗ HTTP error %d\n", httpCode);
  }

  http.end();
  return ok;
}

// ── SETUP ────────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n\n=== DeTECT Firmware v1.0 ===");

  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  // ── TEST: Wi-Fi only ──────────────────────────────────────────────────────
#if TEST_WIFI_ONLY
  Serial.println("[MODE] TEST_WIFI_ONLY");
  connectWiFi();
  Serial.println("[TEST] Done. Halting.");
  while (true) delay(1000);
#endif

  // ── TEST: GPS only ────────────────────────────────────────────────────────
#if TEST_GPS_ONLY
  Serial.println("[MODE] TEST_GPS_ONLY — streaming NMEA + parsed data");
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  // No WiFi or MPU needed — just print in loop()
  return;
#endif

  // ── TEST: MPU only ────────────────────────────────────────────────────────
#if TEST_MPU_ONLY
  Serial.println("[MODE] TEST_MPU_ONLY — streaming accel data");
  Wire.begin();
  mpu.initialize();
  if (!mpu.testConnection()) {
    Serial.println("[MPU] ERROR — not found. Check wiring (SDA=21, SCL=22).");
    while (true) blinkLED(5, 100);
  }
  Serial.println("[MPU] Connected ✓");
  return;
#endif

  // ── TEST: Firebase only ───────────────────────────────────────────────────
#if TEST_FIREBASE_ONLY
  Serial.println("[MODE] TEST_FIREBASE_ONLY — posting dummy record");
  connectWiFi();
  bool ok = postToFirebase(18.520400f, 73.856700f, 5);
  Serial.printf("[TEST] Firebase POST %s. Halting.\n", ok ? "SUCCESS" : "FAILED");
  while (true) delay(1000);
#endif

  // ── FULL INTEGRATION ──────────────────────────────────────────────────────
  Serial.println("[MODE] FULL INTEGRATION");

  // GPS
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  Serial.println("[GPS] Serial started");

  // MPU-6050
  Wire.begin();
  mpu.initialize();
  if (!mpu.testConnection()) {
    Serial.println("[MPU] ERROR — not found. Check SDA=GPIO21, SCL=GPIO22.");
    while (true) blinkLED(5, 100);
  }
  Serial.println("[MPU] Connected ✓");

  // Wi-Fi
  connectWiFi();

  // Wait for first GPS fix (with timeout)
  Serial.printf("[GPS] Waiting for fix (timeout %ds)...\n", GPS_FIX_TIMEOUT_MS / 1000);
  unsigned long gpsStart = millis();
  while (!gps.location.isValid() && (millis() - gpsStart) < GPS_FIX_TIMEOUT_MS) {
    while (gpsSerial.available()) gps.encode(gpsSerial.read());
    delay(100);
  }

  if (gps.location.isValid()) {
    gpsFix = true;
    Serial.printf("[GPS] Fix acquired — lat=%.6f lon=%.6f sats=%d\n",
                  gps.location.lat(), gps.location.lng(), gps.satellites.value());
    blinkLED(5, 80);
  } else {
    Serial.println("[GPS] No fix within timeout — will use fix when available");
  }

  Serial.println("[DeTECT] Setup complete. Monitoring...\n");
}

// ── LOOP ─────────────────────────────────────────────────────────────────────

void loop() {

  // ── TEST: GPS only ────────────────────────────────────────────────────────
#if TEST_GPS_ONLY
  while (gpsSerial.available()) {
    char c = gpsSerial.read();
    Serial.write(c);            // raw NMEA to Serial Monitor
    gps.encode(c);
  }
  if (gps.location.isUpdated()) {
    Serial.printf("[GPS] lat=%.6f  lon=%.6f  sats=%d  age=%lums\n",
                  gps.location.lat(), gps.location.lng(),
                  gps.satellites.value(), gps.location.age());
  }
  return;
#endif

  // ── TEST: MPU only ────────────────────────────────────────────────────────
#if TEST_MPU_ONLY
  static unsigned long lastPrint = 0;
  if (millis() - lastPrint >= 200) {
    lastPrint = millis();

    int16_t ax, ay, az, gx, gy, gz;
    mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);

    // MPU-6050 default ±2 g range → 16384 LSB/g
    float gX = ax / 16384.0f;
    float gY = ay / 16384.0f;
    float gZ = az / 16384.0f;
    float mag = sqrt(gX*gX + gY*gY + gZ*gZ);

    Serial.printf("[MPU] ax=%.3f  ay=%.3f  az=%.3f  |g|=%.3f\n",
                  gX, gY, gZ, mag);

    if (az / 16384.0f > POTHOLE_G_THRESHOLD)
      Serial.println("       ^ POTHOLE threshold exceeded!");
  }
  return;
#endif

  // ── FULL INTEGRATION ──────────────────────────────────────────────────────

  // 1. Feed GPS parser
  while (gpsSerial.available()) gps.encode(gpsSerial.read());

  // 2. Read accelerometer
  int16_t ax, ay, az;
  mpu.getAcceleration(&ax, &ay, &az);
  float gZ = az / 16384.0f;   // vertical axis g-force

  // 3. Check pothole threshold
  bool thresholdExceeded = (gZ > POTHOLE_G_THRESHOLD);
  bool debounceOK        = (millis() - lastReportMs) > DEBOUNCE_MS;
  bool hasFix            = gps.location.isValid();

  if (thresholdExceeded && debounceOK) {
    float lat = hasFix ? gps.location.lat() : 0.0f;
    float lon = hasFix ? gps.location.lng() : 0.0f;
    int   sev = mapGToSeverity(gZ);

    Serial.printf("[DeTECT] Pothole detected! g=%.3f  sev=%d  gps=%s\n",
                  gZ, sev, hasFix ? "valid" : "no fix");

    if (hasFix) {
      bool ok = postToFirebase(lat, lon, sev);
      if (ok) lastReportMs = millis();
    } else {
      Serial.println("[DeTECT] Skipped POST — waiting for GPS fix");
    }
  }

  // 4. Reconnect Wi-Fi if dropped
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Disconnected — reconnecting...");
    connectWiFi();
  }

  delay(20);   // ~50 Hz sensor polling
}
