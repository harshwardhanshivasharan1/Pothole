'use strict';

// describe / it / expect are injected as globals by Vitest (no import needed)
const {
  validateRecord,
  scaleCoordinate,
  getSeverityBand,
  mapSeverityToChain,
} = require('../backend/helpers');

// ---------------------------------------------------------------------------
// Property 1: Latitude boundary validation is total
// Validates: Requirements 6.1
// For any value passed as latitude, validateRecord returns { valid: false }
// iff the value is not a finite number in [-90, 90].
// ---------------------------------------------------------------------------
describe('Property 1 — latitude boundary validation is total', () => {
  // Hold longitude and severity at valid values throughout
  const BASE = { longitude: 73.8, severity: 5 };

  const invalidLatitudes = [-91, -90.001, 90.001, 91, NaN, Infinity, -Infinity, '18.5', null, undefined];
  const validLatitudes   = [-90, -45, 0, 45, 90];

  for (const lat of invalidLatitudes) {
    it(`rejects latitude=${String(lat)}`, () => {
      const result = validateRecord({ latitude: lat, ...BASE });
      expect(result.valid).toBe(false);
    });
  }

  for (const lat of validLatitudes) {
    it(`accepts latitude=${lat}`, () => {
      const result = validateRecord({ latitude: lat, ...BASE });
      expect(result.valid).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Property 2: Longitude boundary validation is total
// Validates: Requirements 6.2
// For any value passed as longitude, validateRecord returns { valid: false }
// iff the value is not a finite number in [-180, 180].
// ---------------------------------------------------------------------------
describe('Property 2 — longitude boundary validation is total', () => {
  // Hold latitude and severity at valid values throughout
  const BASE = { latitude: 18.5, severity: 5 };

  const invalidLongitudes = [-181, -180.001, 180.001, 181, NaN, Infinity, -Infinity, '73.5'];
  const validLongitudes   = [-180, -100, 0, 100, 180];

  for (const lon of invalidLongitudes) {
    it(`rejects longitude=${String(lon)}`, () => {
      const result = validateRecord({ longitude: lon, ...BASE });
      expect(result.valid).toBe(false);
    });
  }

  for (const lon of validLongitudes) {
    it(`accepts longitude=${lon}`, () => {
      const result = validateRecord({ longitude: lon, ...BASE });
      expect(result.valid).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Property 3: Severity validation is total
// Validates: Requirements 6.3
// For any value passed as severity, validateRecord returns { valid: false }
// iff the value is not an integer in [1, 10].
// ---------------------------------------------------------------------------
describe('Property 3 — severity validation is total', () => {
  const BASE = { latitude: 18.5, longitude: 73.8 };

  // All integers from -2 to 12; valid range is [1, 10]
  for (let s = -2; s <= 12; s++) {
    const expectedValid = s >= 1 && s <= 10;
    it(`integer severity=${s} → valid=${expectedValid}`, () => {
      const result = validateRecord({ severity: s, ...BASE });
      expect(result.valid).toBe(expectedValid);
    });
  }

  // Additional non-integer and non-numeric values
  const invalidSeverities = [1.5, NaN, '5'];
  for (const s of invalidSeverities) {
    it(`rejects non-integer/non-numeric severity=${String(s)}`, () => {
      const result = validateRecord({ severity: s, ...BASE });
      expect(result.valid).toBe(false);
    });
  }
});

// ---------------------------------------------------------------------------
// Property 5: scaleCoordinate is exact round-to-nearest
// Validates: Requirements 6.5, 8.3
// scaleCoordinate(v) === Math.round(v * 1e7) for any finite decimal degree.
// ---------------------------------------------------------------------------
describe('Property 5 — scaleCoordinate is exact round-to-nearest', () => {
  const values = [18.5196, -18.5196, 73.8553, -73.8553, 0, 90, -90, 180, -180, 18.12345678];

  for (const v of values) {
    it(`scaleCoordinate(${v}) === Math.round(${v} * 1e7)`, () => {
      expect(scaleCoordinate(v)).toBe(Math.round(v * 1e7));
    });
  }
});

// ---------------------------------------------------------------------------
// Property 6: getSeverityBand covers the full 1–10 range without gaps
// Validates: Requirements 8.2
// Every integer 1–10 maps to the correct band; no integer produces an
// undefined or incorrect band.
// ---------------------------------------------------------------------------
describe('Property 6 — getSeverityBand covers full 1–10 range without gaps', () => {
  const expected = {
    1: 'Low', 2: 'Low', 3: 'Low',  4: 'Low',
    5: 'Medium', 6: 'Medium', 7: 'Medium',
    8: 'High',  9: 'High',  10: 'High',
  };

  for (const [severity, band] of Object.entries(expected)) {
    it(`severity=${severity} → '${band}'`, () => {
      expect(getSeverityBand(Number(severity))).toBe(band);
    });
  }

  // Explicit boundary checks
  it('boundary: severity=4 is Low (upper edge of Low)', () => {
    expect(getSeverityBand(4)).toBe('Low');
  });
  it('boundary: severity=5 is Medium (lower edge of Medium)', () => {
    expect(getSeverityBand(5)).toBe('Medium');
  });
  it('boundary: severity=7 is Medium (upper edge of Medium)', () => {
    expect(getSeverityBand(7)).toBe('Medium');
  });
  it('boundary: severity=8 is High (lower edge of High)', () => {
    expect(getSeverityBand(8)).toBe('High');
  });
});

// ---------------------------------------------------------------------------
// Task 4.7 — Unit tests: mapSeverityToChain, validateRecord edge cases,
//             getSeverityBand boundaries
// Validates: Requirements 8.1, 8.2
// ---------------------------------------------------------------------------
describe('mapSeverityToChain — all 10 inputs map to correct chain value', () => {
  const mapping = [
    [1, 1], [2, 1],
    [3, 2], [4, 2],
    [5, 3], [6, 3],
    [7, 4], [8, 4],
    [9, 5], [10, 5],
  ];

  for (const [input, chainValue] of mapping) {
    it(`severity ${input} → chain ${chainValue}`, () => {
      expect(mapSeverityToChain(input)).toBe(chainValue);
    });
  }
});

describe('validateRecord — edge cases (null, non-object, missing fields, Infinity, NaN)', () => {
  it('returns invalid for null input', () => {
    expect(validateRecord(null).valid).toBe(false);
  });

  it('returns invalid for string input', () => {
    expect(validateRecord('string').valid).toBe(false);
  });

  it('returns invalid for empty object (all fields missing)', () => {
    expect(validateRecord({}).valid).toBe(false);
  });

  it('returns invalid when latitude is Infinity', () => {
    expect(validateRecord({ latitude: Infinity, longitude: 73.8, severity: 5 }).valid).toBe(false);
  });

  it('returns invalid when longitude is Infinity', () => {
    expect(validateRecord({ latitude: 18.5, longitude: Infinity, severity: 5 }).valid).toBe(false);
  });

  it('returns invalid when severity is Infinity', () => {
    expect(validateRecord({ latitude: 18.5, longitude: 73.8, severity: Infinity }).valid).toBe(false);
  });

  it('returns invalid when latitude is NaN', () => {
    expect(validateRecord({ latitude: NaN, longitude: 73.8, severity: 5 }).valid).toBe(false);
  });

  it('returns invalid when longitude is NaN', () => {
    expect(validateRecord({ latitude: 18.5, longitude: NaN, severity: 5 }).valid).toBe(false);
  });

  it('returns invalid when severity is NaN', () => {
    expect(validateRecord({ latitude: 18.5, longitude: 73.8, severity: NaN }).valid).toBe(false);
  });

  it('returns valid for a well-formed record', () => {
    expect(validateRecord({ latitude: 18.5196, longitude: 73.8553, severity: 7 }).valid).toBe(true);
  });
});

describe('getSeverityBand — explicit boundary values', () => {
  it('severity=1  → Low',    () => expect(getSeverityBand(1)).toBe('Low'));
  it('severity=4  → Low',    () => expect(getSeverityBand(4)).toBe('Low'));
  it('severity=5  → Medium', () => expect(getSeverityBand(5)).toBe('Medium'));
  it('severity=7  → Medium', () => expect(getSeverityBand(7)).toBe('Medium'));
  it('severity=8  → High',   () => expect(getSeverityBand(8)).toBe('High'));
  it('severity=10 → High',   () => expect(getSeverityBand(10)).toBe('High'));
});
