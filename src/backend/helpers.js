'use strict';

/**
 * Validate a pothole record received from Firebase.
 *
 * Checks that:
 *   - `record` is a non-null object
 *   - `latitude`  is a finite number in the closed interval [−90, 90]
 *   - `longitude` is a finite number in the closed interval [−180, 180]
 *   - `severity`  is an integer in the closed interval [1, 10]
 *
 * @param {unknown} record - Value received from the Firebase snapshot.
 * @returns {{ valid: boolean, reason?: string }}
 */
function validateRecord(record) {
  if (!record || typeof record !== 'object') {
    return { valid: false, reason: 'record is not an object' };
  }

  const { latitude, longitude, severity } = record;

  if (typeof latitude !== 'number' || !isFinite(latitude) || latitude < -90 || latitude > 90) {
    return { valid: false, reason: `latitude invalid: ${latitude}` };
  }

  if (typeof longitude !== 'number' || !isFinite(longitude) || longitude < -180 || longitude > 180) {
    return { valid: false, reason: `longitude invalid: ${longitude}` };
  }

  if (
    typeof severity !== 'number' ||
    !Number.isInteger(severity) ||
    severity < 1 ||
    severity > 10
  ) {
    return { valid: false, reason: `severity invalid: ${severity}` };
  }

  return { valid: true };
}

/**
 * Apply the 10^7 scale factor to a decimal-degree coordinate value.
 *
 * Converts a floating-point latitude or longitude to the nearest integer
 * representation used by the smart contract.
 *
 * @param {number} value - Decimal degree value (latitude or longitude).
 * @returns {number} `Math.round(value * 1e7)` — the scaled integer.
 */
function scaleCoordinate(value) {
  return Math.round(value * 1e7);
}

/**
 * Classify a 1–10 severity score into a human-readable risk band.
 *
 * Bands:
 *   - 'Low'    → severity in [1, 4]
 *   - 'Medium' → severity in [5, 7]
 *   - 'High'   → severity in [8, 10]
 *
 * @param {number} severity - Integer severity value in [1, 10].
 * @returns {'Low' | 'Medium' | 'High'}
 */
function getSeverityBand(severity) {
  if (severity >= 1 && severity <= 4) return 'Low';
  if (severity >= 5 && severity <= 7) return 'Medium';
  return 'High';
}

/**
 * Map a 1–10 frontend severity score to the 1–5 on-chain integer scale.
 *
 * Uses `Math.ceil(severity / 2)` which produces:
 *   1→1, 2→1, 3→2, 4→2, 5→3, 6→3, 7→4, 8→4, 9→5, 10→5
 *
 * @param {number} severity - Integer severity value in [1, 10].
 * @returns {number} Integer in [1, 5] for the smart contract.
 */
function mapSeverityToChain(severity) {
  return Math.ceil(severity / 2);
}

module.exports = { validateRecord, scaleCoordinate, getSeverityBand, mapSeverityToChain };
