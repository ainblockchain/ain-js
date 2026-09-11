import { generateKeyPairSync } from 'crypto';
import { PaymentChannel, ChannelOpening } from '../src/state-channel';

const participants = [generateKeyPairSync('ed25519'), generateKeyPairSync('ed25519')];
const opening: ChannelOpening = { chainId: 'cert-0', channelId: 'channel-1', openingReference: 'a'.repeat(64),
  publicKeys: participants.map(participant => participant.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')) as [string, string],
  balances: ['1000', '1000'] };

test('both parties agree on conserved balances and duplicate delivery is idempotent', () => {
  const sender = new PaymentChannel(opening);
  const receiver = new PaymentChannel(opening);
  const proposal = sender.propose(0, '7', participants[0].privateKey);
  expect(sender.snapshot().sequence).toBe(0);
  const receipt = receiver.accept(proposal, participants[1].privateKey);
  expect(receiver.accept(proposal, participants[1].privateKey)).toEqual(receipt);
  sender.commit(receipt);
  expect(sender.snapshot()).toEqual(receiver.snapshot());
  expect(sender.snapshot().balances).toEqual(['993', '1007']);
  expect(() => sender.commit(receipt)).toThrow(/stale/);
});

test('invalid amount, participant and signature never change state', () => {
  const sender = new PaymentChannel(opening);
  const receiver = new PaymentChannel(opening);
  const before = receiver.snapshot();
  for (const amount of ['0', '-1', '01', '1.5', '1001']) expect(() => sender.propose(0, amount, participants[0].privateKey)).toThrow();
  expect(() => sender.propose(0, '1', participants[1].privateKey)).toThrow(/participant/);
  const proposal = sender.propose(0, '1', participants[0].privateKey);
  expect(() => receiver.accept({ ...proposal, signature: '0'.repeat(128) }, participants[1].privateKey)).toThrow(/signature/);
  expect(receiver.snapshot()).toEqual(before);
});

test('domain replay, balance tampering and conflicting sequence are rejected', () => {
  const sender = new PaymentChannel(opening);
  const receiver = new PaymentChannel(opening);
  const proposal = sender.propose(0, '3', participants[0].privateKey);
  const foreign = new PaymentChannel({ ...opening, channelId: 'another-channel' });
  expect(() => foreign.accept(proposal, participants[1].privateKey)).toThrow(/domain/);
  const competing = sender.propose(0, '5', participants[0].privateKey);
  const receipt = receiver.accept(proposal, participants[1].privateKey);
  expect(() => receiver.accept(competing, participants[1].privateKey)).toThrow(/stale/);
  expect(() => sender.commit({ ...receipt, state: { ...receipt.state, balances: ['1000', '1003'] } })).toThrow(/conservation/);
  expect(() => sender.commit({ ...receipt, signatures: [receipt.signatures[0], '0'.repeat(128)] })).toThrow(/signature/);
  expect(sender.snapshot().sequence).toBe(0);
});
