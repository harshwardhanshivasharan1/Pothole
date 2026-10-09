'use strict';

// Mock helpers to spy on validateRecord calls (use real implementation)
// We DON'T mock helpers — we want to test the integration.
// Instead, we create mock db and contract directly.

const { startBridge } = require('../backend/bridge');

// ---------------------------------------------------------------------------
// Helper: creates a mock Firebase db with a child_added listener
// Returns { db, triggerChildAdded }
// ---------------------------------------------------------------------------
function createMockDb() {
  let handler = null;
  const ref = {
    on: vi.fn((event, cb) => {
      if (event === 'child_added') handler = cb;
    }),
  };
  const db = { ref: vi.fn(() => ref) };
  const triggerChildAdded = (key, val) => {
    if (handler) handler({ key, val: () => val });
  };
  return { db, triggerChildAdded };
}

// ---------------------------------------------------------------------------
// Property 4: Invalid records never reach the smart contract
// Validates: Requirements 6.4
// For any Pothole Record that fails validateRecord, contract.reportPothole
// must NEVER be called.
// ---------------------------------------------------------------------------
describe('Property 4 — invalid records never reach the smart contract', () => {
  const invalidRecords = [
    { name: 'null record', record: null },
    { name: 'latitude out of range (91)', record: { latitude: 91, longitude: 73.8, severity: 5 } },
    { name: 'latitude out of range (-91)', record: { latitude: -91, longitude: 73.8, severity: 5 } },
    { name: 'longitude out of range (181)', record: { latitude: 18.5, longitude: 181, severity: 5 } },
    { name: 'longitude out of range (-181)', record: { latitude: 18.5, longitude: -181, severity: 5 } },
    { name: 'severity out of range (0)', record: { latitude: 18.5, longitude: 73.8, severity: 0 } },
    { name: 'severity out of range (11)', record: { latitude: 18.5, longitude: 73.8, severity: 11 } },
    { name: 'severity float (1.5)', record: { latitude: 18.5, longitude: 73.8, severity: 1.5 } },
    { name: 'missing all fields', record: {} },
    { name: 'NaN latitude', record: { latitude: NaN, longitude: 73.8, severity: 5 } },
  ];

  for (const { name, record } of invalidRecords) {
    it(`does not call contract.reportPothole for: ${name}`, async () => {
      const { db, triggerChildAdded } = createMockDb();
      const contract = { reportPothole: vi.fn() };

      startBridge(db, contract);
      triggerChildAdded('test-key', record);

      // Allow any pending microtasks to settle
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(contract.reportPothole).not.toHaveBeenCalled();
    });
  }
});

// ---------------------------------------------------------------------------
// Task 5.3 — Bridge success path
// Validates: Requirements 6.6, 8.1
// Valid record → reportPothole called with correct scaled integers and chain severity
// ---------------------------------------------------------------------------
describe('bridge success path', () => {
  it('calls reportPothole with correctly scaled lat/lon and mapped severity', async () => {
    const { db, triggerChildAdded } = createMockDb();
    const mockTx = { hash: '0xabc123', wait: vi.fn().mockResolvedValue({ blockNumber: 42 }) };
    const contract = { reportPothole: vi.fn().mockResolvedValue(mockTx) };

    startBridge(db, contract);
    triggerChildAdded('key-1', { latitude: 18.5196, longitude: 73.8553, severity: 7 });

    await new Promise(resolve => setTimeout(resolve, 50));

    expect(contract.reportPothole).toHaveBeenCalledOnce();
    expect(contract.reportPothole).toHaveBeenCalledWith(
      Math.round(18.5196 * 1e7),
      Math.round(73.8553 * 1e7),
      4  // mapSeverityToChain(7) = ceil(7/2) = 4
    );
  });

  it('awaits tx.wait() and logs confirmed event', async () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const { db, triggerChildAdded } = createMockDb();
    const mockTx = { hash: '0xdef456', wait: vi.fn().mockResolvedValue({ blockNumber: 100 }) };
    const contract = { reportPothole: vi.fn().mockResolvedValue(mockTx) };

    startBridge(db, contract);
    triggerChildAdded('key-2', { latitude: 18.5, longitude: 73.8, severity: 5 });

    await new Promise(resolve => setTimeout(resolve, 50));

    const logs = consoleSpy.mock.calls.map(c => c[0]);
    const confirmedLog = logs.find(l => l.includes('"event":"confirmed"'));
    expect(confirmedLog).toBeTruthy();
    const parsed = JSON.parse(confirmedLog);
    expect(parsed.hash).toBe('0xdef456');
    expect(parsed.block).toBe(100);

    consoleSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Task 5.3 — Bridge error path
// Validates: Requirements 6.7
// Transaction error → logged to console.error, does not rethrow
// ---------------------------------------------------------------------------
describe('bridge error path', () => {
  it('logs tx_error and does not rethrow when reportPothole throws', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { db, triggerChildAdded } = createMockDb();
    const contract = {
      reportPothole: vi.fn().mockRejectedValue(new Error('RPC timeout')),
    };

    startBridge(db, contract);
    // This should NOT throw or cause unhandled rejection
    triggerChildAdded('key-err', { latitude: 18.5, longitude: 73.8, severity: 3 });

    await new Promise(resolve => setTimeout(resolve, 50));

    const errors = errorSpy.mock.calls.map(c => c[0]);
    const txError = errors.find(e => e.includes('"event":"tx_error"'));
    expect(txError).toBeTruthy();
    const parsed = JSON.parse(txError);
    expect(parsed.message).toBe('RPC timeout');

    errorSpy.mockRestore();
  });
});
