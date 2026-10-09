'use strict';

const { validateRecord, scaleCoordinate, mapSeverityToChain } = require('./helpers');

/**
 * Start the Firebase → Ethereum bridge.
 * Subscribes to child_added events on the canonical 'potholes' path
 * and submits valid records to the smart contract.
 *
 * @param {object} db - Firebase Admin SDK database instance
 * @param {object} contract - ethers.js Contract instance
 */
function startBridge(db, contract) {
  const ref = db.ref('potholes'); // canonical lowercase path

  ref.on('child_added', async (snapshot) => {
    const key = snapshot.key;
    const record = snapshot.val();

    const validation = validateRecord(record);
    if (!validation.valid) {
      console.warn(JSON.stringify({
        event: 'validation_failed',
        key,
        reason: validation.reason
      }));
      return;
    }

    const latInt  = scaleCoordinate(record.latitude);
    const lonInt  = scaleCoordinate(record.longitude);
    const chainSev = mapSeverityToChain(record.severity);

    console.log(JSON.stringify({
      event: 'submitting',
      key,
      severity: record.severity
    }));

    try {
      const tx = await contract.reportPothole(latInt, lonInt, chainSev);
      const receipt = await tx.wait();
      console.log(JSON.stringify({
        event: 'confirmed',
        key,
        hash: tx.hash,
        block: receipt.blockNumber
      }));
    } catch (err) {
      console.error(JSON.stringify({
        event: 'tx_error',
        key,
        message: err.message
      }));
      // Do not rethrow — bridge must continue processing subsequent records
    }
  });
}

module.exports = { startBridge };
