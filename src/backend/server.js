'use strict';

// Load environment variables FIRST, before any other module reads process.env
require('dotenv').config();

const admin = require('firebase-admin');
const { JsonRpcProvider, Wallet, Contract } = require('ethers');
const express = require('express');
const path = require('path');

// ---------------------------------------------------------------------------
// 1. Environment variable validation
// ---------------------------------------------------------------------------
const REQUIRED_ENV_VARS = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'FIREBASE_DATABASE_URL',
  'RPC_URL',
  'PRIVATE_KEY',
];

for (const name of REQUIRED_ENV_VARS) {
  if (!process.env[name]) {
    console.error(`Error: Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// 2. Firebase Admin SDK initialisation (credentials from env vars, not a file)
// ---------------------------------------------------------------------------
admin.initializeApp({
  credential: admin.credential.cert({
    projectId:   process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    // Replace literal \n sequences that env files often encode as the string '\n'
    privateKey:  process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL,
});
console.log('Firebase Admin SDK initialized');

// ---------------------------------------------------------------------------
// 3. Ethers.js provider, wallet, and contract
// ---------------------------------------------------------------------------
const provider = new JsonRpcProvider(process.env.RPC_URL);
const wallet   = new Wallet(process.env.PRIVATE_KEY, provider);
console.log('Ethers provider connected');

const contractABI     = require('./contractABI.json');
const contractAddress = '0xf4887b5c9f6b39ef93132e606aaa3e8710e310c0';
const contract        = new Contract(contractAddress, contractABI, wallet);

// ---------------------------------------------------------------------------
// 4. Express HTTP server
// ---------------------------------------------------------------------------
const app = express();

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/status', (_req, res) => {
  res.status(200).json({
    bridge:          'running',
    network:         'sepolia',
    contractAddress: contractAddress,
  });
});

// Serve the frontend static files at the root path.
// server.js lives at src/backend/; frontend is at src/frontend/ — one level up.
app.use(express.static(path.join(__dirname, '../frontend')));

// ---------------------------------------------------------------------------
// 5. Start the Firebase → Ethereum bridge
// ---------------------------------------------------------------------------
const db = admin.database();
const { startBridge } = require('./bridge');
startBridge(db, contract);
console.log('Bridge listening on potholes');

// ---------------------------------------------------------------------------
// 6. Bind the HTTP server
// ---------------------------------------------------------------------------
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, (err) => {
  if (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
  console.log(`Server listening on port ${PORT}`);
});

// Treat a bind error emitted on the server object (e.g. EADDRINUSE) as fatal
server.on('error', (err) => {
  console.error('Server error:', err.message);
  process.exit(1);
});

module.exports = { app, server }; // exported for testing (task 7.2/7.3)
