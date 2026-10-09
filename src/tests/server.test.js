'use strict';

// ---------------------------------------------------------------------------
// server.js validates env vars and calls firebase-admin / ethers at the very
// top level (module load time).  We must:
//   1. Set all required env vars before any require() runs.
//   2. Inject fake modules into require.cache before requiring server.js, so
//      that server.js's own require('firebase-admin') / require('ethers') /
//      require('./bridge') all get our stubs instead of the real modules.
//
// vi.mock() hoisting does not intercept require() calls inside other CJS
// modules when the target module exports __esModule:true (firebase-admin does).
// The require.cache injection technique is the reliable CJS alternative.
// ---------------------------------------------------------------------------

const http = require('http');

// ---------------------------------------------------------------------------
// 1. Set all required env vars
// ---------------------------------------------------------------------------
process.env.FIREBASE_PROJECT_ID   = 'test-project';
process.env.FIREBASE_CLIENT_EMAIL = 'test@test-project.iam.gserviceaccount.com';
process.env.FIREBASE_PRIVATE_KEY  = 'FAKE_KEY_FOR_TESTS';
process.env.FIREBASE_DATABASE_URL = 'https://test-project-default-rtdb.firebaseio.com';
process.env.RPC_URL               = 'https://sepolia.example.com';
process.env.PRIVATE_KEY           = 'a'.repeat(64);
process.env.PORT                  = '0'; // OS picks a random free port

// ---------------------------------------------------------------------------
// 2. Build stub modules and inject them into require.cache
// ---------------------------------------------------------------------------
const adminMock = {
  initializeApp: vi.fn(),
  credential: {
    cert: vi.fn(() => ({ type: 'service_account' })),
  },
  database: vi.fn(() => ({
    ref: vi.fn(() => ({ on: vi.fn() })),
  })),
};

const ethersMock = {
  JsonRpcProvider: vi.fn(() => ({})),
  Wallet:          vi.fn(() => ({})),
  Contract:        vi.fn(() => ({ reportPothole: vi.fn() })),
};

const dotenvMock  = { config: vi.fn() };
const bridgeMock  = { startBridge: vi.fn() };

// Resolve canonical paths used by Node's require cache
const adminPath  = require.resolve('firebase-admin');
const ethersPath = require.resolve('ethers');
const dotenvPath = require.resolve('dotenv');
const bridgePath = require.resolve('../backend/bridge');
const serverPath = require.resolve('../backend/server');

// Inject stubs — these must be in place before server.js is first required
require.cache[adminPath]  = { id: adminPath,  filename: adminPath,  loaded: true, exports: adminMock };
require.cache[ethersPath] = { id: ethersPath, filename: ethersPath, loaded: true, exports: ethersMock };
require.cache[dotenvPath] = { id: dotenvPath, filename: dotenvPath, loaded: true, exports: dotenvMock };
require.cache[bridgePath] = { id: bridgePath, filename: bridgePath, loaded: true, exports: bridgeMock };

// Ensure server.js is not already cached (from a previous test run in the same
// process) so it reloads with our stubs above
delete require.cache[serverPath];

// ---------------------------------------------------------------------------
// 3. Load the server
// ---------------------------------------------------------------------------
let app;
let serverInstance;
let baseUrl;

beforeAll(() => {
  ({ app, server: serverInstance } = require('../backend/server'));

  return new Promise((resolve) => {
    // PORT=0 → OS assigns a random free port; retrieve it after binding
    if (serverInstance.listening) {
      const { port } = serverInstance.address();
      baseUrl = `http://localhost:${port}`;
      resolve();
    } else {
      serverInstance.on('listening', () => {
        const { port } = serverInstance.address();
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    }
  });
});

afterAll(() => {
  if (serverInstance && serverInstance.listening) {
    return new Promise((resolve) => serverInstance.close(resolve));
  }
});

// ---------------------------------------------------------------------------
// Lightweight HTTP helper — avoids adding supertest as a dependency
// ---------------------------------------------------------------------------
function httpGet(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        let parsed;
        try { parsed = JSON.parse(body); } catch { parsed = body; }
        resolve({ status: res.statusCode, body: parsed });
      });
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Property 7: /health endpoint always returns status "ok" with a valid
// ISO-8601 timestamp.
// Validates: Requirements 5.2
// ---------------------------------------------------------------------------
describe('Property 7 — /health endpoint', () => {
  it('returns HTTP 200', async () => {
    const res = await httpGet(`${baseUrl}/health`);
    expect(res.status).toBe(200);
  });

  it('returns body.status === "ok"', async () => {
    const res = await httpGet(`${baseUrl}/health`);
    expect(res.body.status).toBe('ok');
  });

  it('returns a valid ISO-8601 timestamp that does not throw', async () => {
    const res = await httpGet(`${baseUrl}/health`);
    // new Date(ts).toISOString() throws for invalid date strings
    expect(() => new Date(res.body.timestamp).toISOString()).not.toThrow();
  });

  it('timestamp is a recent date (within 5 seconds of now)', async () => {
    const before = Date.now();
    const res    = await httpGet(`${baseUrl}/health`);
    const after  = Date.now();
    const ts     = new Date(res.body.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before - 1000); // allow 1 s clock skew
    expect(ts).toBeLessThanOrEqual(after   + 1000);
  });
});

// ---------------------------------------------------------------------------
// Task 7.3: /api/status endpoint
// Validates: Requirements 5.3, 8.5
// ---------------------------------------------------------------------------
describe('/api/status endpoint', () => {
  it('returns HTTP 200', async () => {
    const res = await httpGet(`${baseUrl}/api/status`);
    expect(res.status).toBe(200);
  });

  it('returns bridge: "running"', async () => {
    const res = await httpGet(`${baseUrl}/api/status`);
    expect(res.body.bridge).toBe('running');
  });

  it('returns network: "sepolia"', async () => {
    const res = await httpGet(`${baseUrl}/api/status`);
    expect(res.body.network).toBe('sepolia');
  });

  it('returns the deployed contract address', async () => {
    const res = await httpGet(`${baseUrl}/api/status`);
    expect(res.body.contractAddress).toBe('0xf4887b5c9f6b39ef93132e606aaa3e8710e310c0');
  });
});
