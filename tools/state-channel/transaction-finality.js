const assert = require('assert/strict');

async function waitFinalized(lookup, hash, options = {}) {
  const now = options.now ?? Date.now;
  const pause = options.pause ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
  const deadline = now() + (options.timeoutMs ?? 120000);
  while (now() < deadline) {
    let transaction;
    try { transaction = await lookup(hash); } catch {}
    if (transaction?.is_finalized === true && ['FINALIZED', 'REVERTED'].includes(transaction.state)) return transaction;
    await pause(1000);
  }
  throw new Error(`transaction remains pending/unknown: ${hash}; inspect this same intent, do not submit a replacement`);
}

function assertOutcome(transaction, rejectExpected, label) {
  assert.equal(transaction?.is_finalized, true, `${label}: an admission response is not finality`);
  assert.equal(transaction.state, rejectExpected ? 'REVERTED' : 'FINALIZED', `${label}: unexpected finalized outcome; stop without further approvals or submissions`);
  assert.ok(Number.isSafeInteger(transaction.number), `${label}: finalized block number required`);
}

module.exports = { waitFinalized, assertOutcome };
