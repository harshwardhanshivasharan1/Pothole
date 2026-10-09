# Implementation Plan: DeTECT System Audit, Refactor & Security Overhaul

## Overview

This plan converts the design into a sequenced set of coding tasks that a code-generation agent can execute incrementally. Tasks are ordered so that foundational work (security, structure, helpers) is completed before dependent layers (bridge, server, tests, CI, docs) are built on top. Each step integrates into the repository immediately — no orphaned code.

---

## Tasks

- [x] 1. Security baseline — clean up secrets and harden `.gitignore`
  - [x] 1.1 Remove tracked credential files and hardcoded secrets
    - Delete `e-detection-system-e96dc-firebase-adminsdk-fbsvc-94ea08bc0c.json`, `e-detection-system-firebase-adminsdk-fbsvc-fdc9579bfb.json`, and `contract.txt` from the Git-tracked tree (use `git rm --cached` to untrack without deleting from disk if still needed locally, or delete outright)
    - Remove the duplicate ABI files `Contract ABI` and `contract.txt` from the repository root
    - _Requirements: 1.1, 1.2, 2.4_

  - [x] 1.2 Update `.gitignore` with comprehensive secret patterns
    - Add entries for `.env`, `*.env`, `*firebase-adminsdk*.json`, `*-adminsdk-*.json`, and `contract.txt`
    - Verify that existing `.gitignore` patterns for `node_modules` and OS files are retained
    - _Requirements: 1.6_

  - [x] 1.3 Update `.env.example` with all required variable names
    - Ensure `.env.example` lists: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_DATABASE_URL`, `RPC_URL`, `PRIVATE_KEY`, `PORT`
    - All values must be placeholders (e.g. `YOUR_VALUE_HERE`) — no real secrets
    - _Requirements: 1.5_

- [x] 2. Project structure scaffolding
  - [x] 2.1 Create the `src/` directory hierarchy
    - Create `src/backend/`, `src/frontend/css/`, `src/frontend/js/`, `src/tests/` directories
    - Copy the canonical ABI from `ContractABI.json` into `src/backend/contractABI.json`
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 2.2 Migrate frontend files to `src/frontend/`
    - Move `frontend/index.html` → `src/frontend/index.html`
    - Move `frontend/frontend.html` → `src/frontend/frontend.html`
    - Move `frontend/css/style.css` → `src/frontend/css/style.css`
    - Move `frontend/js/script.js` → `src/frontend/js/script.js`
    - _Requirements: 2.2_

- [x] 3. `package.json` overhaul
  - [x] 3.1 Rewrite `package.json` with pinned dependencies and correct metadata
    - Set `"type": "commonjs"` (or omit `type` field since CommonJS is the default and all backend modules use `require`/`module.exports`)
    - Pin `express`, `firebase-admin`, `ethers`, and `dotenv` to exact versions matching the current `package-lock.json`
    - Pin `vitest` to an exact version in `devDependencies`
    - Add `"name"`, `"version"`, `"description"`, `"author"`, `"license"` fields
    - Set `"scripts": { "start": "node src/backend/server.js", "test": "vitest --run" }`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.6_

- [x] 4. Implement `src/backend/helpers.js`
  - [x] 4.1 Write the helpers module with all four pure utility functions
    - Implement `validateRecord(record)` — validates `latitude` ∈ [−90, 90], `longitude` ∈ [−180, 180], `severity` ∈ integers [1, 10]; returns `{ valid, reason? }`
    - Implement `scaleCoordinate(value)` — returns `Math.round(value * 1e7)`
    - Implement `getSeverityBand(severity)` — returns `'Low'` (1–4), `'Medium'` (5–7), or `'High'` (8–10)
    - Implement `mapSeverityToChain(severity)` — returns `Math.ceil(severity / 2)` mapping 1–10 to 1–5
    - Export all four functions via `module.exports`
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 8.2_

  - [x]* 4.2 Write property test for `validateRecord` — latitude boundary (Property 1)
    - **Property 1: Latitude boundary validation is total**
    - **Validates: Requirements 6.1**
    - Generate finite numbers across the full float range; assert `valid: false` for values outside [−90, 90] and `valid: true` for values inside (holding longitude and severity constant at valid values)

  - [x]* 4.3 Write property test for `validateRecord` — longitude boundary (Property 2)
    - **Property 2: Longitude boundary validation is total**
    - **Validates: Requirements 6.2**
    - Same pattern as 4.2, sweeping longitude values outside and inside [−180, 180]

  - [x]* 4.4 Write property test for `validateRecord` — severity boundary (Property 3)
    - **Property 3: Severity validation is total**
    - **Validates: Requirements 6.3**
    - Enumerate all integers from −5 to 15; assert `valid: false` for values outside [1, 10] and `valid: true` for integers inside [1, 10]

  - [x]* 4.5 Write property test for `scaleCoordinate` (Property 5)
    - **Property 5: Scale-factor conversion is exact round-to-nearest**
    - **Validates: Requirements 6.5, 8.3**
    - For a sample of representative decimal lat/lon values assert `scaleCoordinate(v) === Math.round(v * 1e7)`

  - [x]* 4.6 Write property test for `getSeverityBand` (Property 6)
    - **Property 6: Severity band classification covers the full 1–10 range without gaps**
    - **Validates: Requirements 8.2**
    - Enumerate all integers 1–10; assert correct band for each

  - [x]* 4.7 Write unit tests for `mapSeverityToChain` and boundary examples for helpers
    - Test all 10 severity inputs for `mapSeverityToChain` against expected 1–5 chain values
    - Test boundary values for `getSeverityBand` (1, 4, 5, 7, 8, 10)
    - Test `validateRecord` with non-object input, `null`, missing fields, `Infinity`, `NaN`
    - _Requirements: 8.1, 8.2_

- [x] 5. Implement `src/backend/bridge.js`
  - [x] 5.1 Write the bridge module
    - Export `startBridge(db, contract)` function
    - Attach `child_added` listener to `db.ref('potholes')` (canonical lowercase path)
    - Call `validateRecord`; on failure emit structured JSON warning to `console.warn` and return
    - On valid record: call `scaleCoordinate` for lat/lon, `mapSeverityToChain` for severity
    - Log structured JSON to `console.log` before submission
    - Await `contract.reportPothole(latInt, lonInt, chainSev)`; await `tx.wait()` and log hash and block number
    - Wrap contract call in try/catch; log error to `console.error` and continue — do not rethrow
    - _Requirements: 4.1, 4.2, 5.7, 6.1–6.7_

  - [x]* 5.2 Write property test for bridge — invalid records never reach the contract (Property 4)
    - **Property 4: Invalid records never reach the smart contract**
    - **Validates: Requirements 6.4**
    - Mock `db.ref` and `contract.reportPothole`; exercise `child_added` with records that fail each validation dimension; assert `contract.reportPothole` was never called

  - [x]* 5.3 Write unit tests for bridge success and error paths
    - Test valid record → `contract.reportPothole` called with correct scaled integers and chain severity
    - Test transaction error → error logged, no rethrow, handler completes
    - _Requirements: 8.1, 6.6, 6.7_

- [x] 6. Checkpoint — helpers and bridge tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement `src/backend/server.js`
  - [x] 7.1 Write the server entry point
    - Load `dotenv` at the top of the file
    - Define and iterate a `REQUIRED_ENV_VARS` array; for each missing variable log `Error: Missing required environment variable: <NAME>` and call `process.exit(1)`
    - Initialise Firebase Admin SDK using `credential.cert({ projectId, clientEmail, privateKey })` from env vars (no JSON file)
    - Initialise ethers.js `JsonRpcProvider` and `Wallet` from `RPC_URL` and `PRIVATE_KEY` env vars
    - Create ethers.js `Contract` instance using `contractABI.json` and the wallet
    - Create Express app; register `GET /health` and `GET /api/status` routes
    - Serve `src/frontend/` as static files at root path `/`
    - Call `startBridge(db, contract)`
    - Bind HTTP server on `process.env.PORT || 3000`; log success or call `process.exit(1)` on bind error
    - Emit log lines: `Firebase Admin SDK initialized`, `Ethers provider connected`, `Bridge listening on potholes`, `Server listening on port <PORT>`
    - _Requirements: 1.3, 1.4, 2.5, 5.1–5.7, 11.1, 11.4, 11.5_

  - [x]* 7.2 Write property test for `/health` endpoint (Property 7)
    - **Property 7: /health endpoint always returns status "ok" with a valid timestamp**
    - **Validates: Requirements 5.2**
    - Mock Firebase Admin SDK, ethers, and bridge; call `GET /health`; assert HTTP 200, `body.status === "ok"`, and `new Date(body.timestamp).toISOString()` does not throw

  - [x]* 7.3 Write unit test for `/api/status` endpoint
    - Assert HTTP 200 with `bridge: "running"`, `network: "sepolia"`, and `contractAddress` matching the deployed address
    - _Requirements: 5.3, 8.5_

- [x] 8. Checkpoint — all server tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 9. Frontend integration — Firebase path correction and config extraction
  - [x] 9.1 Create `src/frontend/js/firebaseConfig.js`
    - Declare `firebaseConfig` object with public fields only: `apiKey`, `authDomain`, `databaseURL`, `projectId`
    - Use correct database URL for project `e-detection-system-e96dc`
    - No private keys, service-account credentials, or `process.env` references (browser file)
    - _Requirements: 4.4, 7.1, 7.2_

  - [-] 9.2 Create `src/frontend/js/map.js` for the map dashboard
    - Import Firebase Client SDK (CDN or bundled); initialise using `firebaseConfig`
    - Attach `child_added` listener on canonical path `potholes` (lowercase)
    - On each event: extract `latitude`, `longitude`, `severity`; add MapLibre GL marker at the coordinates
    - Monitor `.info/connected`; when `false` set all live-data DOM fields to `"—"`
    - _Requirements: 4.1, 4.2, 7.3, 7.4, 7.6_

  - [-] 9.3 Update `src/frontend/frontend.html` to use `map.js` and `firebaseConfig.js`
    - Replace any inline Firebase initialisation and map logic with `<script src="js/firebaseConfig.js">` and `<script src="js/map.js">`
    - Ensure Firebase is initialised from `firebaseConfig.js` only (no duplicate `initializeApp` calls)
    - _Requirements: 7.1, 7.3_

  - [-] 9.4 Update `src/frontend/script.js` (landing page) for canonical path and offline handling
    - Replace any reference to a non-canonical Firebase path with `potholes` (lowercase)
    - Attach Firebase Client SDK `value` listener on `potholes` to count records and update the live-count stat element
    - When Firebase SDK is offline, display `"—"` in all live-data fields
    - _Requirements: 4.3, 7.5, 7.6_

  - [ ] 9.5 Update `src/frontend/index.html` to load updated `script.js` and `firebaseConfig.js`
    - Add `<script src="js/firebaseConfig.js">` before `script.js` if not already present
    - _Requirements: 7.1, 7.5_

- [ ] 10. CI pipeline
  - [~] 10.1 Create `.github/workflows/ci.yml`
    - Define two jobs: `test` and `security`
    - `test` job: `ubuntu-latest`, Node.js 20, steps: `actions/checkout@v4`, `actions/setup-node@v4` (with npm cache), `npm ci`, `npm test`
    - `security` job: scan tracked files with `git ls-files | xargs grep -rE` for 64-char hex strings; fail if found outside `package-lock.json` and `node_modules`
    - `security` job: scan `git ls-files` for filenames matching `*firebase-adminsdk*.json` or `*-adminsdk-*.json`; fail if any are found
    - Trigger on `push` and `pull_request` to `main`
    - _Requirements: 1.7, 1.8, 9.1–9.6_

- [ ] 11. Documentation
  - [~] 11.1 Rewrite `README.md`
    - Update repository layout section to reflect the `src/backend/`, `src/frontend/`, `src/tests/` hierarchy
    - Add "Getting Started" section: copy `.env.example` → `.env`, populate each variable with a description
    - Add "Running the Server" section: `npm install && npm run start`, then open `http://localhost:3000`
    - Add "Running Tests" section: `npm test`
    - Retain/expand the security notice: any previously committed secrets (Firebase Admin SDK keys, private keys) must be treated as compromised and rotated immediately
    - Document the Firebase Canonical Path (`potholes`) and the requirement that all components use it
    - Document the dual severity schema: 1–10 display scale (frontend/Firebase) vs 1–5 on-chain scale (Ethereum), and the `Math.ceil(severity / 2)` mapping
    - _Requirements: 10.1–10.7_

- [~] 12. Final checkpoint — full test suite passes and CI is green
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP, but they are required to satisfy the ≥ 80% coverage requirement in Req 8.8.
- Property tests (4.2–4.6, 5.2, 7.2) validate universal correctness properties defined in the design document; each is annotated with its property number.
- All backend modules use CommonJS (`require`/`module.exports`) — do not mix with ES module syntax.
- The Firebase client SDK is loaded from a CDN in the browser; no bundler is assumed.
- The `mapSeverityToChain` mapping uses `Math.ceil(severity / 2)`, which maps 1→1, 2→1, 3→2, 4→2, 5→3, 6→3, 7→4, 8→4, 9→5, 10→5.
- Checkpoints in tasks 6, 8, and 12 are the integration gates; do not proceed past a checkpoint until its preceding tests all pass.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1"] },
    { "id": 2, "tasks": ["2.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "7.1"] },
    { "id": 5, "tasks": ["7.2", "7.3", "9.1"] },
    { "id": 6, "tasks": ["9.2", "9.3", "9.4", "9.5"] },
    { "id": 7, "tasks": ["10.1", "11.1"] }
  ]
}
```
