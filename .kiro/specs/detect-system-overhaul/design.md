# Design Document

## Overview

This document describes the architecture for the DeTECT Smart Road Pothole Detection System overhaul. The goal is to address all critical security issues, restructure the project into a clean directory hierarchy, introduce an Express HTTP server, add comprehensive automated testing with Vitest, and set up a GitHub Actions CI pipeline — while preserving the existing functional behaviour: Firebase Realtime Database → Node.js bridge → Ethereum Sepolia smart contract.

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────────┐
│  Node.js Process  (node src/backend/server.js)                      │
│                                                                     │
│  ┌──────────────┐   initialise   ┌──────────────────────────┐      │
│  │  server.js   │ ─────────────> │  Firebase Admin SDK      │      │
│  │  (entry pt.) │ ─────────────> │  ethers.js provider      │      │
│  │              │   then start   │  Express HTTP server     │      │
│  └──────────────┘                └──────────────────────────┘      │
│         │                                   │                       │
│         ▼                                   ▼                       │
│  ┌──────────────┐             ┌─────────────────────────────┐      │
│  │  bridge.js   │             │  GET /health                │      │
│  │  (Firebase   │             │  GET /api/status            │      │
│  │  → Ethereum) │             │  Static → src/frontend/     │      │
│  └──────────────┘             └─────────────────────────────┘      │
│         │ child_added                                               │
│         │ on 'potholes'                                             │
│         ▼                                                           │
│  ┌──────────────┐  validate   ┌─────────────┐  reportPothole       │
│  │  helpers.js  │ <────────── │  bridge.js  │ ──────────────────>  │
│  │  (validate,  │             │             │   Ethereum Sepolia    │
│  │  scale, band)│             │             │   Smart Contract      │
│  └──────────────┘             └─────────────┘                      │
└─────────────────────────────────────────────────────────────────────┘

Browser
  └── src/frontend/index.html  (landing page + live-count)
  └── src/frontend/frontend.html  (map dashboard)
  └── src/frontend/js/firebaseConfig.js  (public config only)
  └── src/frontend/js/map.js  (child_added → MapLibre markers)
  └── src/frontend/js/script.js  (landing page animations + live-count)
```

### Data Flow

1. An IoT sensor writes a Pothole Record `{ latitude, longitude, severity }` to the Firebase Realtime Database path `potholes/<autokey>`.
2. The backend Bridge receives a `child_added` event.
3. `helpers.validateRecord()` checks all three fields; invalid records are logged and dropped.
4. `helpers.scaleCoordinate()` multiplies lat/lon by `10^7` and rounds to integer.
5. `helpers.mapSeverityToChain()` maps the 1–10 frontend severity to the 1–5 on-chain scale.
6. `contract.reportPothole(latInt, lonInt, chainSeverity)` is called; the tx is awaited and hash/block logged.
7. Simultaneously, the browser's Firebase Client SDK receives the same `child_added` event and renders a map marker.

---

## Directory Structure

```
/
├── .env.example                      # Required env var names, placeholder values
├── .github/
│   └── workflows/
│       └── ci.yml                    # GitHub Actions CI pipeline
├── .gitignore                        # Prevents .env, admin SDK files from being committed
├── package.json                      # Exact-pinned dependencies, start/test scripts
├── package-lock.json
├── README.md
├── src/
│   ├── backend/
│   │   ├── server.js                 # Entry point: env validation, SDK init, Express, Bridge
│   │   ├── bridge.js                 # Firebase child_added → smart contract calls
│   │   ├── helpers.js                # validateRecord, scaleCoordinate, getSeverityBand, mapSeverityToChain
│   │   └── contractABI.json          # Canonical ABI (single copy)
│   ├── frontend/
│   │   ├── index.html                # Landing page
│   │   ├── frontend.html             # Map dashboard
│   │   ├── css/
│   │   │   └── style.css
│   │   └── js/
│   │       ├── firebaseConfig.js     # Public Firebase config only
│   │       ├── map.js                # Map dashboard Firebase + MapLibre logic
│   │       └── script.js             # Landing page animations + live-count
│   └── tests/
│       ├── helpers.test.js           # Unit tests for helpers.js
│       ├── bridge.test.js            # Unit tests for bridge.js (mocked deps)
│       └── server.test.js            # HTTP endpoint tests (mocked deps)
├── docs/
│   └── architecture.md               # Extended architecture notes
└── assets/                           # Static images
```

---

## Components and Interfaces

### `src/backend/server.js` — Entry Point

Responsibilities:
- Load and validate all required environment variables (exit with code 1 if any are missing).
- Initialise Firebase Admin SDK from env vars (not a JSON file).
- Initialise ethers.js `JsonRpcProvider` and `Wallet` from env vars.
- Create the Express app, register routes, and serve `src/frontend/` as static files.
- Call `startBridge(db, contract)` to begin Firebase subscription.
- Bind the HTTP server; log the port on success, exit with code 1 on `EADDRINUSE`.

Required environment variables:

| Variable | Description |
|---|---|
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_CLIENT_EMAIL` | Service account email |
| `FIREBASE_PRIVATE_KEY` | Service account private key (newlines as `\n`) |
| `FIREBASE_DATABASE_URL` | Realtime Database URL |
| `RPC_URL` | Ethereum JSON-RPC endpoint |
| `PRIVATE_KEY` | Ethereum wallet private key (64-char hex) |
| `PORT` | (optional) HTTP port, default `3000` |

Startup log sequence (must appear within 5 s):
```
Firebase Admin SDK initialized
Ethers provider connected
Bridge listening on potholes
Server listening on port <PORT>
```

### `src/backend/bridge.js` — Firebase → Ethereum Bridge

Exports a single function `startBridge(db, contract)`.

```javascript
// CommonJS module
const { validateRecord, scaleCoordinate, mapSeverityToChain } = require('./helpers');

function startBridge(db, contract) {
  const ref = db.ref('potholes');  // Canonical Path — always lowercase
  ref.on('child_added', async (snapshot) => {
    const key = snapshot.key;
    const record = snapshot.val();

    const validation = validateRecord(record);
    if (!validation.valid) {
      console.warn(JSON.stringify({ event: 'validation_failed', key, reason: validation.reason }));
      return;
    }

    const latInt  = scaleCoordinate(record.latitude);
    const lonInt  = scaleCoordinate(record.longitude);
    const chainSev = mapSeverityToChain(record.severity);

    console.log(JSON.stringify({ event: 'submitting', key, severity: record.severity }));

    try {
      const tx = await contract.reportPothole(latInt, lonInt, chainSev);
      const receipt = await tx.wait();
      console.log(JSON.stringify({ event: 'confirmed', key, hash: tx.hash, block: receipt.blockNumber }));
    } catch (err) {
      console.error(JSON.stringify({ event: 'tx_error', key, message: err.message }));
      // Continue processing subsequent records — do not rethrow
    }
  });
}

module.exports = { startBridge };
```

### `src/backend/helpers.js` — Pure Utility Functions

All functions are pure (no side effects) to enable straightforward unit testing and property-based testing.

```javascript
'use strict';

/**
 * Validate a pothole record received from Firebase.
 * @param {unknown} record
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
  if (typeof severity !== 'number' || !Number.isInteger(severity) || severity < 1 || severity > 10) {
    return { valid: false, reason: `severity invalid: ${severity}` };
  }
  return { valid: true };
}

/**
 * Apply the Scale Factor: multiply by 10^7 and round to nearest integer.
 * @param {number} value - Decimal degree value
 * @returns {number} Scaled integer
 */
function scaleCoordinate(value) {
  return Math.round(value * 1e7);
}

/**
 * Classify a 1–10 severity into a risk band label.
 * @param {number} severity
 * @returns {'Low' | 'Medium' | 'High'}
 */
function getSeverityBand(severity) {
  if (severity >= 1 && severity <= 4) return 'Low';
  if (severity >= 5 && severity <= 7) return 'Medium';
  return 'High';
}

/**
 * Map a 1–10 frontend severity to the 1–5 on-chain integer scale.
 * Mapping: 1–2 → 1, 3–4 → 2, 5–6 → 3, 7–8 → 4, 9–10 → 5
 * @param {number} severity - Integer 1–10
 * @returns {number} Integer 1–5
 */
function mapSeverityToChain(severity) {
  return Math.ceil(severity / 2);
}

module.exports = { validateRecord, scaleCoordinate, getSeverityBand, mapSeverityToChain };
```

### `src/backend/contractABI.json` — Canonical ABI

The existing inline ABI from `backend.js` is extracted to this file. All duplicate ABI files (`Contract ABI`, `contract.txt`) are removed from the tracked tree.

### `src/frontend/js/firebaseConfig.js` — Public Config

```javascript
// Public Firebase client configuration — NO private keys or service-account credentials.
// Values are intentionally public (Firebase client SDK keys are safe to expose).
const firebaseConfig = {
  apiKey: "YOUR_PUBLIC_API_KEY",
  authDomain: "e-detection-system-e96dc.firebaseapp.com",
  databaseURL: "https://e-detection-system-e96dc-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "e-detection-system-e96dc"
};
```

All sensitive values are kept in `process.env` on the server only. The Firebase client API key is a public identifier, not a secret.

### `src/frontend/js/map.js` — Map Dashboard Logic

Reads from `firebaseConfig.js`, initialises the Firebase Client SDK, attaches a `child_added` listener on `potholes` (canonical lowercase), and renders MapLibre GL markers. Displays `"—"` placeholder in all live-data fields when the Firebase SDK reports offline status.

### Express HTTP Server Routes

| Method | Path | Response |
|---|---|---|
| `GET` | `/health` | `200 { "status": "ok", "timestamp": "<ISO-8601>" }` |
| `GET` | `/api/status` | `200 { "bridge": "running", "network": "sepolia", "contractAddress": "0xf4887..." }` |
| `GET` | `/*` | Static file from `src/frontend/` |

---

## Data Models

### Pothole Record (Firebase)

```
{
  latitude:  number,   // Decimal degrees, range [-90, 90]
  longitude: number,   // Decimal degrees, range [-180, 180]
  severity:  integer   // Integer, range [1, 10] — frontend/display scale
}
```

### On-Chain Call Arguments

```
reportPothole(
  int256 latitude,    // Math.round(latitude  * 10^7)
  int256 longitude,   // Math.round(longitude * 10^7)
  uint8  severity     // Math.ceil(severity / 2) — mapped to [1, 5]
)
```

### Severity Mapping

| Firebase/Frontend (1–10) | Chain (1–5) | Band |
|---|---|---|
| 1–2 | 1 | Low |
| 3–4 | 2 | Low |
| 5–6 | 3 | Medium |
| 7–8 | 4 | High |
| 9–10 | 5 | High |

---

## Error Handling

### Startup Validation

`server.js` iterates over a list of required env var names before touching any SDK. If any are missing it logs:

```
Error: Missing required environment variable: <NAME>
```

and calls `process.exit(1)`.

### Bridge Validation Failures

`bridge.js` calls `validateRecord()` and, on failure, emits a structured JSON warning to `console.warn`. It returns immediately without calling the contract. Processing continues for subsequent `child_added` events.

### Transaction Errors

All calls to `contract.reportPothole()` are wrapped in try/catch. Errors are logged as structured JSON to `console.error`. The `child_added` handler does not rethrow — the bridge remains running.

### Express Server Bind Error

The `listen` callback checks for an error argument. On any error (including `EADDRINUSE`) it logs the error and calls `process.exit(1)`.

### Frontend Offline State

The Firebase Client SDK's connection state is monitored via `.info/connected`. When the value is `false`, all live-data DOM elements are set to `"—"`.

---

## CI Pipeline (`.github/workflows/ci.yml`)

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm test

  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Scan for raw private keys (64-char hex)
        run: |
          if git ls-files | xargs grep -rE '[0-9a-fA-F]{64}' --include='*.js' --include='*.json' --include='*.ts' --include='*.txt' --include='*.env' 2>/dev/null | grep -v node_modules | grep -v package-lock.json; then
            echo "ERROR: Potential raw private key detected in tracked files"
            exit 1
          fi
      - name: Scan for Firebase Admin SDK credential files
        run: |
          if git ls-files | grep -E '.*firebase-adminsdk.*\.json|.*-adminsdk-.*\.json'; then
            echo "ERROR: Firebase Admin SDK credential file detected in tracked files"
            exit 1
          fi
```

---

## Testing Strategy

### Framework

- **Vitest** (`vitest --run` for single-pass CI execution)
- `vi.mock()` replaces `firebase-admin`, `ethers`, and `dotenv` — no live credentials required
- Coverage via Vitest's built-in V8 reporter: target ≥ 80% statement coverage on `bridge.js` and `helpers.js`

### Test Files

| File | Scope |
|---|---|
| `src/tests/helpers.test.js` | `validateRecord`, `scaleCoordinate`, `getSeverityBand`, `mapSeverityToChain` |
| `src/tests/bridge.test.js` | `startBridge` — mocked `db.ref`, mocked `contract.reportPothole` |
| `src/tests/server.test.js` | `/health` and `/api/status` HTTP routes |

### Mocking Pattern

```javascript
// Example: vi.mock at the top of bridge.test.js
vi.mock('firebase-admin', () => ({
  default: {
    initializeApp: vi.fn(),
    credential: { cert: vi.fn() },
    database: vi.fn(() => ({ ref: vi.fn() }))
  }
}));

vi.mock('ethers', () => ({
  JsonRpcProvider: vi.fn(),
  Wallet: vi.fn(),
  Contract: vi.fn(() => ({
    reportPothole: vi.fn().mockResolvedValue({
      hash: '0xabc',
      wait: vi.fn().mockResolvedValue({ blockNumber: 42 })
    })
  }))
}));
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

**Property Reflection**

Before listing properties, redundancies were identified:

- Properties for latitude validation (6.1), longitude validation (6.2), and severity validation (6.3) could be written separately or as one. They are kept as separate, focused properties because each covers a distinct input dimension with distinct ranges.
- The "no transaction on invalid record" property (6.4) is a direct consequence of the validation properties (6.1–6.3). However, it tests the *integration* between validation and contract invocation — the fact that a failed `validateRecord` result prevents `contract.reportPothole` from being called. It adds unique value and is retained as a separate property.
- Properties for `scaleCoordinate` (8.3) and `mapSeverityToChain` are independent pure-function properties and do not overlap.
- The `/health` endpoint property is distinct from the `/api/status` example test: the health endpoint is universal (always returns `ok` + valid timestamp), while `/api/status` returns a fixed shape, making it an example test.

After reflection: 7 properties remain, each providing unique validation value.

---

### Property 1: Latitude boundary validation is total

*For any* value passed as `latitude` to `validateRecord`, the function SHALL return `{ valid: false }` if and only if the value is not a finite number in the closed interval [−90, 90]; it SHALL return `{ valid: true }` (for the latitude check alone) for every finite number within that interval.

**Validates: Requirements 6.1**

---

### Property 2: Longitude boundary validation is total

*For any* value passed as `longitude` to `validateRecord`, the function SHALL return `{ valid: false }` if and only if the value is not a finite number in the closed interval [−180, 180]; it SHALL return `{ valid: true }` (for the longitude check alone) for every finite number within that interval.

**Validates: Requirements 6.2**

---

### Property 3: Severity validation is total

*For any* value passed as `severity` to `validateRecord`, the function SHALL return `{ valid: false }` if and only if the value is not an integer in the closed interval [1, 10]; it SHALL accept every integer from 1 through 10 inclusive.

**Validates: Requirements 6.3**

---

### Property 4: Invalid records never reach the smart contract

*For any* Pothole Record that fails `validateRecord` (any single field out of range, non-numeric, or missing), the bridge's `child_added` handler SHALL complete without calling `contract.reportPothole` even once.

**Validates: Requirements 6.4**

---

### Property 5: Scale-factor conversion is exact round-to-nearest

*For any* finite decimal number `v` representing a latitude or longitude value, `scaleCoordinate(v)` SHALL return exactly `Math.round(v * 10_000_000)` — i.e., the nearest integer to `v × 10^7`.

**Validates: Requirements 6.5, 8.3**

---

### Property 6: Severity band classification covers the full 1–10 range without gaps

*For any* integer `s` in [1, 10], `getSeverityBand(s)` SHALL return `'Low'` for `s` ∈ {1,2,3,4}, `'Medium'` for `s` ∈ {5,6,7}, and `'High'` for `s` ∈ {8,9,10}. No integer in [1, 10] shall produce an undefined or incorrect band.

**Validates: Requirements 8.2**

---

### Property 7: /health endpoint always returns status "ok" with a valid timestamp

*For any* call to `GET /health`, the response SHALL have HTTP status code 200, `body.status` SHALL equal `"ok"`, and `body.timestamp` SHALL be a string that parses as a valid ISO-8601 date via `new Date(body.timestamp).toISOString()` without throwing.

**Validates: Requirements 5.2**
