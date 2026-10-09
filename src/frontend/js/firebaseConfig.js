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
  apiKey:            "REPLACE_WITH_YOUR_WEB_API_KEY",
  authDomain:        "e-detection-system-e96dc.firebaseapp.com",
  databaseURL:       "https://e-detection-system-e96dc-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "e-detection-system-e96dc",
  storageBucket:     "e-detection-system-e96dc.appspot.com",
  messagingSenderId: "REPLACE_WITH_YOUR_MESSAGING_SENDER_ID",
  appId:             "REPLACE_WITH_YOUR_APP_ID"
};
