# Requirements Document

## Introduction

This document covers the full audit, security remediation, structural refactoring, automated testing, and documentation improvements for the DeTECT Smart Road Pothole Detection System. DeTECT is a Node.js + Firebase + MapLibre GL JS + ethers.js application that exposes a map-based interface for viewing pothole locations detected by IoT sensors in Pune, Maharashtra. The backend bridges Firebase Realtime Database events to an Ethereum Sepolia smart contract for immutable on-chain anchoring.

The current codebase has critical security issues (Firebase Admin service-account JSON files committed to the repository; a blockchain private key and authenticated RPC URL hardcoded in source files), a flat directory structure, no automated tests, an unpinned dependency manifest, a Firebase path inconsistency between the backend and the frontend, and no CI pipeline. This overhaul addresses all of these issues across twelve sequenced phases while preserving the split-access architecture (Admin SDK on the backend, Firebase client SDK on the frontend) and adding Express as the HTTP server for the backend.

## Glossary

- **Backend**: The Node.js process (`src/backend/server.js`) that runs the Firebase-to-Ethereum bridge and the Express HTTP server.
- **Bridge**: The sub-module within the Backend that subscribes to Firebase `child_added` events and calls `reportPothole` on the smart contract.
- **Frontend**: The static HTML/CSS/JS pages (`src/frontend/`) served to end-users in a browser.
- **Firebase Admin SDK**: The server-side Firebase SDK used exclusively by the Backend for privileged database access.
- **Firebase Client SDK**: The browser-side Firebase SDK used exclusively by the Frontend for read-only database access.
- **Canonical Path**: The agreed, single-cased Firebase Realtime Database path used by all components — `potholes` (lowercase).
- **Pothole Record**: A Firebase child object containing at minimum the fields `latitude` (number), `longitude` (number), and `severity` (integer 1–10).
- **Smart Contract**: The Solidity contract deployed at `0xf4887b5c9f6b39ef93132e606aaa3e8710e310c0` on Ethereum Sepolia exposing `reportPothole(int256 latitude, int256 longitude, uint8 severity)`.
- **Scale Factor**: The integer multiplier `10^7` applied to latitude/longitude decimal values before passing them to the Smart Contract.
- **Environment File**: The `.env` file at the repository root loaded at runtime by `dotenv`; never committed to version control.
- **Service Account File**: A Firebase Admin SDK JSON credential file; never committed to version control.
- **Severity Band**: The mapping of severity integer to risk level — Low (1–4), Medium (5–7), High (8–10).
- **CI**: The GitHub Actions continuous-integration pipeline defined in `.github/workflows/ci.yml`.
- **Vitest**: The unit-test framework used for all automated tests; mocks replace all live credentials and external services.

---

## Requirements

### Requirement 1: Security — Secret Removal and Credential Rotation

**User Story:** As the repository owner, I want all plaintext secrets removed from every tracked file and commit history so that compromised credentials cannot be exploited by anyone with repository access.

#### Acceptance Criteria

1. THE Backend SHALL NOT load Firebase Admin SDK credentials from any JSON file that is tracked by Git.
2. THE Backend SHALL NOT contain any hardcoded value for the blockchain private key, the RPC URL, or the Firebase database URL in any tracked source file.
3. WHEN the Backend starts, THE Backend SHALL load the Firebase Admin SDK private key and project configuration from environment variables defined in the Environment File.
4. WHEN the Backend starts, THE Backend SHALL load the blockchain private key and RPC URL from environment variables defined in the Environment File.
5. THE Repository SHALL contain a `.env.example` file listing every required environment variable name with placeholder values and no real secrets.
6. THE `.gitignore` file SHALL include patterns that prevent `.env`, Service Account Files (matching `*firebase-adminsdk*.json`), `contract.txt`, and any file matching `*-adminsdk-*.json` from being committed.
7. IF a Service Account File is detected in the working tree, THEN THE CI SHALL fail the build and report the detected filename.
8. IF a `.env` file containing a non-placeholder private key is detected in the working tree during CI, THEN THE CI SHALL fail the build.

---

### Requirement 2: Project Structure Refactoring

**User Story:** As a developer, I want the source files organised into a logical directory hierarchy so that backend and frontend code are separated and each file's purpose is immediately clear.

#### Acceptance Criteria

1. THE Repository SHALL place all backend Node.js source files under `src/backend/`.
2. THE Repository SHALL place all frontend HTML, CSS, and JavaScript files under `src/frontend/`.
3. THE Repository SHALL place all Vitest test files under `src/tests/`.
4. THE Repository SHALL place the smart-contract ABI in a single canonical file at `src/backend/contractABI.json`; duplicate ABI files (`Contract ABI`, `contract.txt`) SHALL be removed from the tracked tree.
5. THE Backend SHALL serve the `src/frontend/` directory as static files via Express so that a single `node src/backend/server.js` command starts both the bridge and the HTTP server.
6. THE `package.json` SHALL define a `start` script that executes `node src/backend/server.js` and a `test` script that executes `vitest --run`.

---

### Requirement 3: Package Management

**User Story:** As a developer, I want all dependencies pinned to exact versions and the manifest fully populated so that builds are reproducible and the project is self-describing.

#### Acceptance Criteria

1. THE `package.json` SHALL specify `"type": "module"` or use CommonJS consistently — one module system throughout the backend.
2. THE `package.json` `dependencies` object SHALL pin `ethers`, `firebase-admin`, `express`, and `dotenv` to exact versions (no `^` or `~` range specifiers).
3. THE `package.json` `devDependencies` object SHALL pin `vitest` to an exact version.
4. THE `package.json` SHALL include `"name"`, `"version"`, `"description"`, `"author"`, `"license"`, `"scripts"`, `"dependencies"`, and `"devDependencies"` fields.
5. WHEN `npm install` is executed against the pinned `package.json`, THE npm toolchain SHALL produce a `package-lock.json` with no version range conflicts.

---

### Requirement 4: Firebase Path Consistency

**User Story:** As a developer, I want the backend and frontend to read and write to the same Firebase Realtime Database path so that data written by the Backend is always visible to the Frontend.

#### Acceptance Criteria

1. THE Backend Bridge SHALL subscribe to the Canonical Path (`potholes`, lowercase).
2. THE Frontend map page SHALL read from the Canonical Path (`potholes`, lowercase).
3. THE Frontend landing page live-count widget SHALL read from the Canonical Path (`potholes`, lowercase).
4. THE `FIREBASE_DATABASE_URL` environment variable SHALL reference the database URL for the project `e-detection-system-e96dc`.
5. IF data is written under any path other than the Canonical Path, THEN THE Backend Bridge SHALL NOT forward that data to the Smart Contract.

---

### Requirement 5: Backend Architecture with Express

**User Story:** As a developer, I want the backend to expose an HTTP server via Express so that health checks, API status, and static file serving are available without a separate process.

#### Acceptance Criteria

1. THE Backend SHALL start an Express HTTP server on the port specified by the `PORT` environment variable, defaulting to `3000` when `PORT` is not set.
2. WHEN a `GET /health` request is received, THE Backend SHALL respond with HTTP 200 and a JSON body `{"status":"ok","timestamp":<ISO-8601 string>}`.
3. WHEN a `GET /api/status` request is received, THE Backend SHALL respond with HTTP 200 and a JSON body containing `{"bridge":"running","network":"sepolia","contractAddress":"<address>"}`.
4. THE Backend SHALL serve static files from `src/frontend/` at the root path `/`.
5. IF the Express server fails to bind to the specified port, THEN THE Backend SHALL log the error and exit with code `1`.
6. THE Backend SHALL initialise the Firebase Admin SDK and the ethers.js provider before starting the Bridge subscription.
7. WHILE the Bridge subscription is active, THE Backend SHALL log each incoming Pothole Record key and its validated severity value.

---

### Requirement 6: Bridge Input Validation

**User Story:** As a developer, I want the Bridge to validate every incoming Pothole Record before submitting it to the Smart Contract so that malformed data does not cause failed or wasted on-chain transactions.

#### Acceptance Criteria

1. WHEN a Pothole Record is received by the Bridge, THE Bridge SHALL verify that `latitude` is a finite number in the range [−90, 90].
2. WHEN a Pothole Record is received by the Bridge, THE Bridge SHALL verify that `longitude` is a finite number in the range [−180, 180].
3. WHEN a Pothole Record is received by the Bridge, THE Bridge SHALL verify that `severity` is an integer in the range [1, 10].
4. IF any field of a Pothole Record fails validation, THEN THE Bridge SHALL log a structured warning including the Firebase record key and the specific validation failure, and SHALL NOT submit a transaction.
5. WHEN a valid Pothole Record is submitted to the Smart Contract, THE Bridge SHALL apply the Scale Factor to latitude and longitude before calling `reportPothole`.
6. WHEN a transaction is submitted, THE Bridge SHALL await confirmation and log the transaction hash and block number upon success.
7. IF a transaction submission throws an exception, THEN THE Bridge SHALL log the error and continue processing subsequent records without terminating.

---

### Requirement 7: Frontend Firebase Integration Correction

**User Story:** As a user, I want the live-map dashboard and landing-page live-count to always reflect the current pothole data so that the displayed counts are accurate.

#### Acceptance Criteria

1. THE Frontend map page SHALL initialise the Firebase Client SDK using configuration values injected at build time via a dedicated `src/frontend/js/firebaseConfig.js` file that reads no secrets.
2. THE `firebaseConfig.js` file SHALL expose only public Firebase project configuration (API key, auth domain, database URL, project ID) and SHALL NOT contain private keys or service-account credentials.
3. WHEN the Frontend map page loads, THE Frontend SHALL attach a `child_added` listener on the Canonical Path and render each Pothole Record as a map marker.
4. WHEN a new Pothole Record is added in Firebase, THE Frontend SHALL add the corresponding marker to the map within the same render cycle triggered by the `child_added` event.
5. THE Frontend landing page SHALL attach a Firebase Client SDK `value` listener on the Canonical Path to count total records and update the live-count stat element.
6. WHERE the Firebase Client SDK is unavailable (network offline), THE Frontend SHALL display a placeholder string `"—"` in all live-data fields rather than a JavaScript error.

---

### Requirement 8: Automated Testing with Vitest

**User Story:** As a developer, I want a comprehensive suite of unit tests that run without live credentials so that I can verify correctness locally and in CI.

#### Acceptance Criteria

1. THE test suite SHALL include tests for the Bridge validation logic covering: valid records passing, latitude out-of-range rejection, longitude out-of-range rejection, severity out-of-range rejection, and non-numeric field rejection.
2. THE test suite SHALL include tests for the severity-band helper function covering all three bands (Low, Medium, High) and their boundary values (1, 4, 5, 7, 8, 10).
3. THE test suite SHALL include tests for the coordinate scale-factor conversion confirming that decimal latitude/longitude values are rounded to the nearest integer after multiplication by `10^7`.
4. THE test suite SHALL include a test confirming that the `/health` endpoint returns HTTP 200 with `status: "ok"`.
5. THE test suite SHALL include a test confirming that the `/api/status` endpoint returns HTTP 200 with `bridge: "running"`.
6. ALL tests SHALL mock the Firebase Admin SDK, the ethers.js `Wallet`, and the ethers.js `Contract` so that no live network call is made during test execution.
7. WHEN `npm test` is executed, THE test runner SHALL produce a pass/fail result for each test case and exit with code `0` if all tests pass, or code `1` if any test fails.
8. THE test suite SHALL achieve a minimum of 80% statement coverage on `src/backend/bridge.js` and `src/backend/helpers.js` as reported by Vitest's built-in coverage reporter.

---

### Requirement 9: CI Pipeline

**User Story:** As a developer, I want every push and pull request to run the test suite and credential-leak checks automatically so that regressions and security incidents are caught before merge.

#### Acceptance Criteria

1. THE CI SHALL define a GitHub Actions workflow triggered on `push` and `pull_request` events targeting the `main` branch.
2. WHEN the CI workflow runs, THE CI SHALL execute `npm ci` to install dependencies from the lockfile.
3. WHEN the CI workflow runs, THE CI SHALL execute `npm test` and fail the workflow if the test suite exits with a non-zero code.
4. WHEN the CI workflow runs, THE CI SHALL scan all tracked files for patterns matching a raw Ethereum private key (64-character hex string) and fail the build if a match is found.
5. WHEN the CI workflow runs, THE CI SHALL scan all tracked files for filenames matching `*firebase-adminsdk*.json` and fail the build if such a file is tracked.
6. THE CI workflow SHALL run on `ubuntu-latest` with Node.js version `20`.

---

### Requirement 10: Documentation

**User Story:** As a contributor or evaluator, I want clear, accurate documentation so that I can set up, run, and understand the system without reading every source file.

#### Acceptance Criteria

1. THE `README.md` SHALL accurately reflect the refactored directory structure in its repository layout section.
2. THE `README.md` SHALL include a "Getting Started" section with step-by-step instructions for copying `.env.example` to `.env` and populating each variable.
3. THE `README.md` SHALL include a section describing how to run the backend server and how to access the frontend.
4. THE `README.md` SHALL include a section describing how to run the test suite.
5. THE `README.md` SHALL retain the security notice advising that any previously committed secrets must be treated as compromised and rotated.
6. THE `README.md` SHALL document the Firebase Canonical Path and explain that all components must use it consistently.
7. THE `README.md` SHALL document the two severity-band schemas: the 1–5 scale used by the Smart Contract and the 1–10 scale used by the Frontend display, and explain the relationship between them.

---

### Requirement 11: End-to-End Verification

**User Story:** As the repository owner, I want assurance that all components integrate correctly after the overhaul so that the system is demonstrably functional.

#### Acceptance Criteria

1. WHEN the Backend starts with valid environment variables, THE Backend SHALL log `Firebase Admin SDK initialized`, `Ethers provider connected`, and `Bridge listening on potholes` within five seconds of process start.
2. WHEN the Frontend is loaded in a browser from the Express static server, THE Frontend SHALL render the MapLibre GL map without console errors related to missing Firebase configuration.
3. WHEN `npm test` is executed in a clean environment (after `npm ci`), THE test suite SHALL complete without network calls and SHALL exit with code `0`.
4. THE `npm run start` command SHALL start the server without throwing an unhandled exception when all required environment variables are present.
5. IF any required environment variable is absent at startup, THEN THE Backend SHALL log a descriptive error naming the missing variable and exit with code `1` before attempting to connect to Firebase or Ethereum.
