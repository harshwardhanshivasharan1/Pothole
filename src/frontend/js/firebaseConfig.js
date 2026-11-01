/**
 * Firebase Client SDK configuration for the DeTECT frontend.
 *
 * These are PUBLIC configuration values — Firebase client SDK keys are
 * intentionally designed to be exposed in browser code. They are NOT
 * the same as Firebase Admin SDK service-account credentials.
 *
 * Access to the database is controlled by Firebase Security Rules,
 * NOT by keeping these values secret.
 *
 * To find these values:
 *   1. Go to https://console.firebase.google.com/
 *   2. Select project "e-detection-system-e96dc"
 *   3. Click the gear icon → Project settings → Your apps
 *   4. Copy the firebaseConfig object shown there
 *
 * DO NOT add private keys, service-account JSON, or Admin SDK credentials
 * to this file.
 */
const firebaseConfig = {
  apiKey:            "AIzaSyC40urq89qX-LjCvMi46XTPzm0_7vCs8yg",
  authDomain:        "pothole-edetect.firebaseapp.com",
  databaseURL:       "https://pothole-edetect-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "pothole-edetect",
  storageBucket:     "pothole-edetect.firebasestorage.app",
  messagingSenderId: "465064724361",
  appId:             "1:465064724361:web:aaba77e6a03741afc40358"
};
