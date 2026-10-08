# DeTECT — Smart Road Pothole Detection System

DeTECT is a prototype for monitoring road potholes, visualizing their locations, and recording reports on a blockchain. The project is presented around Pune, Maharashtra, and combines a web interface with Firebase Realtime Database and an Ethereum Sepolia smart-contract integration.

> **Project status:** The repository contains the web UI and a Firebase-to-blockchain bridge. The current source tree does not include sensor firmware or an on-device pothole-detection/ML pipeline. Configure and test the live integrations before treating the system as production-ready.

## Features

- **Project landing page:** Overview of the system, its intended workflow, and technology stack.
- **Interactive map:** A MapLibre GL map intended to display potholes with location and severity information.
- **Realtime data integration:** Firebase Realtime Database is used as the data source for map updates.
- **Blockchain reporting:** The Node.js bridge watches Firebase records and calls the `reportPothole` function on an Ethereum Sepolia smart contract.
- **Location and severity data:** Reports include latitude, longitude, severity (1–5), timestamp, and reporter information at the contract level.

## Technology stack

- HTML, CSS, and vanilla JavaScript
- [MapLibre GL JS](https://maplibre.org/) for maps
- [Firebase Realtime Database](https://firebase.google.com/docs/database) and Firebase Admin SDK
- [ethers.js v6](https://docs.ethers.org/v6/) for Ethereum interaction
- Ethereum Sepolia test network
- Node.js and npm for the blockchain bridge

## Repository structure

```text
Pothole/
├── index.html          # Main DeTECT landing page and map preview
├── frontend.html       # Full-screen live-map interface
├── style.css           # Landing-page styles
├── script.js           # Landing-page interactions and animations
├── backend.js          # Firebase-to-Ethereum reporting bridge
├── ContractABI.json    # Smart-contract ABI
├── Contract ABI        # Duplicate ABI file
├── contract.txt        # Legacy configuration notes (contains sensitive values; remove)
├── assets/             # Images used by the UI
├── package.json        # Node.js dependencies
└── package-lock.json   # Locked dependency versions
```

## Run the web interface

You need Python 3 or another static-file web server.

1. Clone the repository:
   ```bash
   git clone https://github.com/harshwardhanshivasharan1/Pothole.git
   cd Pothole
   ```
2. Start a local static server from the repository root:
   ```bash
   python3 -m http.server 8000
   ```
3. Open [http://localhost:8000/index.html](http://localhost:8000/index.html) for the landing page, or [http://localhost:8000/frontend.html](http://localhost:8000/frontend.html) for the map.

The static pages can load without running the Node.js bridge, but live data depends on valid Firebase configuration, access rules, and records in the expected database path.

## Blockchain bridge setup

The bridge uses Node.js packages listed in `package.json`:

```bash
npm install
```

**Do not run `backend.js` as currently committed.** It contains hard-coded blockchain signing/RPC credentials and loads a Firebase Admin service-account JSON file from the repository. Treat those credentials as compromised. Rotate them and refactor the bridge to load replacement credentials from environment variables or a secret manager before running it. Never commit private keys, service-account JSON files, or authenticated RPC URLs.

After the credentials have been safely moved out of source control and the code updated to use them, start the bridge with:

```bash
node backend.js
```

The bridge subscribes to Firebase child-added events, validates severity from 1 to 5, converts latitude/longitude to integer values using a scale factor of `10^7`, submits each accepted report to `reportPothole`, and waits for the transaction receipt.

## Expected report data

The bridge expects each Firebase child to contain top-level latitude, longitude, and severity fields. For example:

```json
{
  "latitude": 18.5204,
  "longitude": 73.8567,
  "severity": 3
}
```

Use actual, correctly sourced coordinates for your deployment. The smart contract stores the scaled coordinates as integers.

## Important configuration checks

- **Database path casing:** `backend.js` subscribes to `Potholes`, while the landing-page map reads `potholes`. Firebase paths are case-sensitive. Choose one path and use it consistently in every component.
- **Firebase rules:** Ensure the browser client only has the permissions it needs. Keep Admin SDK credentials server-side.
- **Blockchain network:** Confirm the configured RPC endpoint, contract address, ABI, and deployed network all match. Use Sepolia test funds while testing.
- **Duplicate submissions:** The current bridge reacts to newly added Firebase children. Add an idempotency strategy if records may be replayed or recreated.
- **Production readiness:** Add input validation, error/retry handling, logging, monitoring, and authentication/authorization before deployment.

## Security notice

The current repository contains Firebase Admin service-account credential files, and blockchain signing/RPC credentials are hard-coded in source/configuration files. **Assume exposed credentials are compromised.** Revoke or rotate them immediately; move replacements to a secure secret store; remove credential files and hard-coded secrets from the repository; add appropriate patterns to `.gitignore`; and clean the Git history where necessary. Deleting a secret in a new commit does not remove it from earlier commits. If the exposed wallet holds assets, move them to a new wallet after securing access.

---

This project is a prototype for learning and demonstrating realtime geospatial reporting with blockchain-backed records. Validate the implementation and security model before using it for real-world road-safety decisions.
