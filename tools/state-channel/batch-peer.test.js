const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { PaymentChannel } = require('../../lib/state-channel');
const { PaymentBatchClient, createBatchPaymentPeer } = require('../../lib/state-channel/batch-peer');

test('batch preserves individual signatures, durability barriers and duplicate idempotency', async context => {
  const keys = [crypto.generateKeyPairSync('ed25519'), crypto.generateKeyPairSync('ed25519')];
  const openings = Array.from({ length: 8 }, (_, index) => ({ chainId: 'test', channelId: `test-${index}`,
    openingReference: 'a'.repeat(64), balances: ['100', '100'],
    publicKeys: keys.map(key => key.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')) }));
  const senders = openings.map(opening => new PaymentChannel(opening));
  const channels = new Map(openings.map(opening => [opening.channelId, { channel: new PaymentChannel(opening), key: keys[1].privateKey }]));
  let release;
  let entered;
  const durable = new Promise(resolve => { release = resolve; });
  const persisting = new Promise(resolve => { entered = resolve; });
  let persisted = 0;
  const server = createBatchPaymentPeer(channels, async () => { persisted++; if (persisted === 8) entered(); await durable; });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise(resolve => server.close(resolve)));
  const client = new PaymentBatchClient(`http://127.0.0.1:${server.address().port}`);
  const proposals = senders.map(sender => sender.propose(0, '1', keys[0].privateKey));
  let acknowledged = 0;
  const requests = openings.map((opening, index) => client.submit({ channelId: opening.channelId, proposal: proposals[index] })
      .then(receipt => { acknowledged++; senders[index].commit(receipt); return receipt; }));
  await persisting;
  assert.equal(acknowledged, 0);
  release();
  const receipts = await Promise.all(requests);
  for (let index = 0; index < openings.length; index++) {
    assert.deepEqual(senders[index].snapshot(), channels.get(openings[index].channelId).channel.snapshot());
    assert.deepEqual(await client.submit({ channelId: openings[index].channelId, proposal: proposals[index] }), receipts[index]);
  }
  assert.equal(persisted, 8);
  const invalid = senders[0].propose(0, '1', keys[0].privateKey);
  invalid.signature = '0'.repeat(128);
  await assert.rejects(client.submit({ channelId: openings[0].channelId, proposal: invalid }), /signature/);
  assert.equal(channels.get(openings[0].channelId).channel.snapshot().sequence, 1);
});

test('persistence failure blocks state disclosure and all later updates on that channel', async context => {
  const keys = [crypto.generateKeyPairSync('ed25519'), crypto.generateKeyPairSync('ed25519')];
  const opening = { chainId: 'test', channelId: 'faulted', openingReference: 'b'.repeat(64), balances: ['10', '10'],
    publicKeys: keys.map(key => key.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')) };
  const sender = new PaymentChannel(opening);
  let entered;
  let fail;
  const persisting = new Promise(resolve => { entered = resolve; });
  const server = createBatchPaymentPeer(new Map([[opening.channelId, { channel: new PaymentChannel(opening), key: keys[1].privateKey }]]),
    () => new Promise((resolve, reject) => { fail = reject; entered(); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise(resolve => server.close(resolve)));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  const client = new PaymentBatchClient(endpoint, 1);
  const proposal = sender.propose(0, '1', keys[0].privateKey);
  const rejected = assert.rejects(client.submit({ channelId: opening.channelId, proposal }), /disk failed/);
  await persisting;
  let disclosed = false;
  const reading = fetch(`${endpoint}/state?channelId=faulted`).then(response => { disclosed = true; return response; });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(disclosed, false);
  fail(new Error('disk failed'));
  await rejected;
  assert.equal((await reading).status, 400);
  await assert.rejects(client.submit({ channelId: opening.channelId, proposal }), /recovery required/);
  assert.equal(sender.snapshot().sequence, 0);
});
