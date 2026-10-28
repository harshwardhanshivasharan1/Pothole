# DeTECT — Smart Road Pothole Detection System

DeTECT is a prototype for monitoring road potholes, visualising their locations, and recording reports on a blockchain. The project is centred around Pune, Maharashtra, and combines a web interface with Firebase Realtime Database and an Ethereum Sepolia smart-contract integration.

> **Project status:** The repository contains the web UI and a Firebase-to-blockchain bridge. The current source tree does not include sensor firmware or an on-device pothole-detection/ML pipeline. Configure and validate the live integrations before treating the system as production-ready.

---

## Features

- **Landing page** — Overview of the system, intended workflow, and technology stack.
- **Interactive map** — A MapLibre GL map displaying potholes with location and severity information in real time.
- **Realtime data** — Firebase Realtime Database drives live map updates across all connected clients.
- **Blockchain reporting** — The Node.js bridge watches Firebase records and calls `reportPothole` on an Ethereum Sepolia smart contract.
- **Dual severity scale** — Frontend and Firebase records use 1–10; the smart contract uses 1–5. The bridge converts automatically.

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | HTML, CSS, vanilla JavaScript |
| Maps | [MapLibre GL JS](https://maplibre.org/) |
| Realtime database | [Firebase Realtime Database](https://firebase.google.com/docs/database) |
| Backend SDK | Firebase Admin SDK (Node.js) |
| Ethereum | [ethers.js v6](https://docs.ethers.org/v6/) — Sepolia test network |
| HTTP server | Express (Node.js) |
| Tests | [Vitest](https://vitest.dev/) |

---

## Repository Layout

```text
detect/
├── src/
│   ├── backend/
│   │   ├── server.js          # Express entry point — validates env, starts bridge, serves static files
│   │   ├── bridge.js          # Firebase child_added → smart contract relay
│   │   ├── helpers.js         # validateRecord, scaleCoordinate, getSeverityBand, mapSeverityToChain
│   │   └── contractABI.json   # Ethereum contract ABI
│   ├── frontend/
│   │   ├── index.html         # DeTECT landing page
│   │   ├── frontend.html      # Full-screen live-map dashboard
│   │   ├── css/
│   │   │   └── style.css      # Shared stylesheet
│   │   └── js/
│   │       ├── firebaseConfig.js  # Public Firebase client config (no secrets)
│   │       ├── map.js             # MapLibre GL map + Firebase child_added markers
│   │       └── script.js          # Landing-page interactions + Firebase live count
│   └── tests/
│       ├── helpers.test.js    # Unit and property tests for helpers.js
│       ├── bridge.test.js     # Unit and property tests for bridge.js
│       └── server.test.js     # Unit and property tests for server.js
├── assets/                    # UI images
├── .env.example               # Environment variable template — copy to .env and fill in values
├── .gitignore
├── package.json
├── package-lock.json
└── vitest.config.js
```

---

## Getting Started

### 1. Copy the environment template

```bash
cp .env.example .env
```

Open `.env` and populate each variable:

| Variable | Description |
|---|---|
| `FIREBASE_PROJECT_ID` | Firebase project ID (e.g. `e-detection-system-e96dc`) |
| `FIREBASE_CLIENT_EMAIL` | Service-account client email from the Firebase Admin SDK JSON key file |
| `FIREBASE_PRIVATE_KEY` | RSA private key from the Firebase Admin SDK JSON (wrap in double quotes; keep the `-----BEGIN/END-----` headers; use `\n` for newlines) |
| `FIREBASE_DATABASE_URL` | Realtime Database URL, e.g. `https://<project>-default-rtdb.<region>.firebasedatabase.app` |
| `RPC_URL` | Ethereum JSON-RPC endpoint for Sepolia, e.g. `https://sepolia.infura.io/v3/<KEY>` or an Alchemy equivalent |
| `PRIVATE_KEY` | 64-character hex private key of the Ethereum wallet used to submit transactions (no `0x` prefix) |
| `PORT` | TCP port for the Express HTTP server (default: `3000`) |

> **Never commit your real `.env` file.** It is listed in `.gitignore`.

### 2. Install dependencies

```bash
npm install
```

---

## Running the Server

```bash
npm run start
```

Then open [http://localhost:3000](http://localhost:3000) for the landing page, or [http://localhost:3000/frontend.html](http://localhost:3000/frontend.html) for the live map.

On startup the server will:

1. Validate that all required environment variables are set (exits with an error message if any are missing).
2. Initialise the Firebase Admin SDK from the `FIREBASE_*` env vars.
3. Connect to the Ethereum Sepolia network via `RPC_URL`.
4. Start the bridge — listening on the `potholes` Firebase path for new reports.
5. Serve the `src/frontend/` files at the root path `/`.
6. Expose health and status endpoints at `GET /health` and `GET /api/status`.

---

## Running Tests

```bash
npm test
```

Tests live in `src/tests/` and run with [Vitest](https://vitest.dev/). The suite covers unit tests and property-based tests for the helpers, bridge, and server modules.

---

## Firebase Canonical Path

All components — the backend bridge, the frontend map, and the landing-page live-count — **must** use the lowercase path `potholes`.

Firebase Realtime Database paths are case-sensitive. Using `Potholes`, `POTHOLES`, or any other variant will cause components to silently miss each other's data. The canonical path is defined once and used everywhere:

```
db.ref('potholes')          // backend bridge (bridge.js)
database.ref('potholes')    // frontend map   (map.js)
database.ref('potholes')    // landing page   (script.js)
```

---

## Severity Schema

DeTECT uses a dual severity scale to decouple the user-facing score from the on-chain representation:

| Scale | Range | Used by |
|---|---|---|
| Display scale | 1 – 10 | Frontend UI, Firebase records |
| On-chain scale | 1 – 5 | Ethereum smart contract |

The bridge converts from display scale to on-chain scale using:

```js
Math.ceil(severity / 2)
```

Full mapping table:

| Display (Firebase) | On-chain (Ethereum) |
|---|---|
| 1, 2 | 1 |
| 3, 4 | 2 |
| 5, 6 | 3 |
| 7, 8 | 4 |
| 9, 10 | 5 |

The `validateRecord` helper enforces that severity is an integer in **[1, 10]**. Records outside that range are rejected before they reach the contract.

---

## Security Notice

> ⚠️ **Treat any previously committed secrets as compromised.**

An earlier revision of this repository contained Firebase Admin SDK service-account JSON files and hard-coded Ethereum signing/RPC credentials. If those credentials were ever pushed to a remote repository — including private forks — assume they have been exposed.

**Immediate actions required:**

1. **Revoke and rotate** the Firebase service-account key in the [Firebase Console](https://console.firebase.google.com/) → Project settings → Service accounts.
2. **Revoke and rotate** the Ethereum wallet private key — transfer any assets to a new wallet before revoking.
3. **Revoke and regenerate** any Infura/Alchemy RPC API keys.
4. **Purge Git history** — deleting a file in a new commit does not remove it from earlier commits. Use [`git filter-repo`](https://github.com/newren/git-filter-repo) or [BFG Repo Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) to rewrite history, then force-push.
5. **Confirm `.gitignore`** blocks `.env`, `*firebase-adminsdk*.json`, `*-adminsdk-*.json`, and `contract.txt` so the mistake cannot recur.

Going forward, load all secrets from environment variables at runtime. Never hard-code credentials in source files or commit them to version control.

---

This project is a prototype for learning and demonstrating realtime geospatial reporting with blockchain-backed records. Validate the implementation and security model thoroughly before using it for real-world road-safety decisions.
