import { generateKeyPairSync } from 'crypto';
import * as AinUtil from '@ainblockchain/ain-util';
import Ain from '../src/ain';
import { ChannelOpening, PaymentChannel, PaymentReceipt } from '../src/state-channel';
import { cooperativeEscrow, ESCROW_UNITS_PER_AIN, replayCooperativeClose, microUnitEscrowRelease } from '../src/state-channel/cooperative-escrow';

const signers = [generateKeyPairSync('ed25519'), generateKeyPairSync('ed25519')];
const accounts = [AinUtil.createAccount().address, AinUtil.createAccount().address] as [string, string];
const stranger = AinUtil.createAccount().address;
const opening: ChannelOpening = { chainId: 'local-cert-genesis', channelId: 'funded-channel', openingReference: 'a'.repeat(64),
  publicKeys: signers.map(signer => signer.publicKey.export({ format: 'der', type: 'spki' }).toString('base64')) as [string, string],
  balances: [String(ESCROW_UNITS_PER_AIN / 2), String(ESCROW_UNITS_PER_AIN / 2)] };
const options = { opening, accounts, escrowKey: 'cooperative-test' };
const policy = cooperativeEscrow(options);
const util = {
  isDict: (value: unknown) => value !== null && typeof value === 'object' && !Array.isArray(value),
  isInteger: Number.isInteger, isArray: Array.isArray,
  isValidHash: (value: unknown) => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value),
  length: (value: object | unknown[]) => Array.isArray(value) ? value.length : Object.keys(value).length,
};

test('patched SDK creates AIN accounts and produces verifiable chain signatures offline', async () => {
  const ain = new Ain('http://127.0.0.1:1', null, 0);
  const account = (ain.wallet.create(1) as string[])[0];
  const body = { operation: { type: 'SET_VALUE' as const, ref: '/apps/offline-test/value', value: 1 }, nonce: -1, timestamp: 12345, gas_price: 1 };
  const signature = await ain.wallet.signTransaction(body, account);
  expect(AinUtil.ecVerifySig(body, signature, account, 0)).toBe(true);
});

function evaluate(rule: { '.rule': { write: string | boolean } }, data: unknown, newData: unknown,
  auth: object, values: Map<string, unknown>, currentTime = 12345): boolean {
  const getValue = (path: string): unknown => {
    if (values.has(path)) return values.get(path);
    const labels = path.split('/');
    const field = labels.pop()!;
    const parent = values.get(labels.join('/')) as Record<string, unknown> | undefined;
    return parent?.[field] ?? null;
  };
  return new Function('auth', 'data', 'newData', 'currentTime', 'getValue', 'util', `return (${rule['.rule'].write});`)(auth, data, newData, currentTime, getValue, util) === true;
}

function payments(amount = '3', count = 20) {
  const sender = new PaymentChannel(opening);
  const receiver = new PaymentChannel(opening);
  const receipts: PaymentReceipt[] = [];
  for (let index = 0; index < count; index++) {
    const receipt = receiver.accept(sender.propose(0, amount, signers[0].privateKey), signers[1].privateKey);
    sender.commit(receipt);
    receipts.push(receipt);
  }
  return receipts;
}

test('replayed co-signatures determine integer micro-AIN allocations, never an unsigned checkpoint', () => {
  const receipts = payments();
  const close = replayCooperativeClose(options, receipts);
  expect(close.sequence).toBe(20);
  expect(close.balanceA).toBe(499940);
  expect(close.balanceB).toBe(500060);
  expect((close.balanceA + close.balanceB) / ESCROW_UNITS_PER_AIN).toBe(1);
  expect(1 * (close.balanceB / policy.totalUnits)).toBe(close.balanceB / ESCROW_UNITS_PER_AIN);
  expect(() => replayCooperativeClose(options, [{ ...receipts[0], signatures: ['0'.repeat(128), receipts[0].signatures[1]] }])).toThrow(/signature/);
  expect(() => replayCooperativeClose({ ...options, opening: { ...opening, openingReference: 'b'.repeat(64) } }, receipts)).toThrow(/domain/);
});

test('each closing approval is one-time, account-signed, funded and identically allocated', () => {
  const close = replayCooperativeClose(options, payments());
  const values = new Map<string, unknown>([[policy.paths.balance, 1]]);
  const sourceRule = policy.rules.close.source;
  const targetRule = policy.rules.close.target;
  expect(evaluate(sourceRule, null, close, { addr: accounts[0] }, values)).toBe(true);
  expect(evaluate(sourceRule, null, close, { addr: accounts[1] }, values)).toBe(false);
  expect(evaluate(sourceRule, close, close, { addr: accounts[0] }, values)).toBe(false);
  expect(evaluate(sourceRule, null, { ...close, balanceB: close.balanceB + 1 }, { addr: accounts[0] }, values)).toBe(false);
  expect(evaluate(targetRule, null, close, { addr: accounts[1] }, values)).toBe(false);
  values.set(policy.paths.sourceApproval, close);
  expect(evaluate(targetRule, null, close, { addr: accounts[1] }, values)).toBe(true);
  expect(evaluate(targetRule, null, { ...close, balanceA: close.balanceA - 1, balanceB: close.balanceB + 1 }, { addr: accounts[1] }, values)).toBe(false);
  values.set(policy.paths.balance, 0.5);
  expect(evaluate(sourceRule, null, close, { addr: accounts[0] }, values)).toBe(false);
});

test('release cannot bypass a missing approval, alter the split, repeat or replace immutable config', () => {
  const close = replayCooperativeClose(options, payments());
  const values = new Map<string, unknown>([[policy.paths.balance, 1], [policy.paths.sourceApproval, close]]);
  const release = { ratio: close.balanceB / policy.totalUnits };
  expect(evaluate(policy.rules.release.settle, null, release, { addr: accounts[0] }, values)).toBe(false);
  values.set(policy.paths.targetApproval, close);
  expect(evaluate(policy.rules.release.settle, null, release, { addr: accounts[1] }, values)).toBe(true);
  expect(evaluate(policy.rules.release.settle, null, { ratio: 1 }, { addr: accounts[0] }, values)).toBe(false);
  expect(evaluate(policy.rules.release.settle, null, release, { addr: stranger }, values)).toBe(false);
  expect(evaluate(policy.rules.release.settle, release, release, { addr: accounts[1] }, values)).toBe(false);
  expect(evaluate(policy.rules.config, null, {}, { addr: accounts[0] }, values)).toBe(false);
});

test('balance guard allows only the two bound deposits and rejects unsolicited or negative changes', () => {
  const values = new Map<string, unknown>([[policy.paths.hold, { amount: 0.5 }]]);
  const sourceAuth = { addr: accounts[0], fid: '_transfer', fids: ['_hold', '_transfer'] };
  const targetAuth = { addr: accounts[1], fid: '_transfer', fids: ['_transfer'] };
  expect(evaluate(policy.balanceRule, null, 0.5, sourceAuth, values)).toBe(true);
  expect(evaluate(policy.balanceRule, null, 0.5, { ...sourceAuth, addr: stranger }, values)).toBe(false);
  expect(evaluate(policy.balanceRule, 0.5, 1, targetAuth, values)).toBe(false);
  values.set(policy.paths.targetDeposit, 0.5);
  expect(evaluate(policy.balanceRule, 0.5, 1, targetAuth, values)).toBe(true);
  for (const balance of [-1, 0, 1.5]) expect(evaluate(policy.balanceRule, 1, balance, targetAuth, values)).toBe(false);
  expect(evaluate(policy.balanceRule, 1, 2, { ...targetAuth, addr: stranger }, values)).toBe(false);
});

test('payout balance changes require both approvals and the native recipient-specific transfer record', () => {
  const close = replayCooperativeClose(options, payments());
  const values = new Map<string, unknown>([[policy.paths.sourceApproval, close], [policy.paths.targetApproval, close],
    [policy.paths.release, { ratio: close.balanceB / policy.totalUnits }]]);
  const auth = { addr: accounts[0], fid: '_transfer', fids: ['_release', '_transfer'] };
  const remainder = 1 - close.balanceB / policy.totalUnits;
  expect(Math.round(remainder * ESCROW_UNITS_PER_AIN)).toBe(close.balanceA);
  expect(evaluate(policy.balanceRule, 1, remainder, auth, values)).toBe(false);
  values.set(`/transfer/${policy.serviceAccount}/${accounts[1]}/12345/value`, close.balanceB / ESCROW_UNITS_PER_AIN);
  expect(evaluate(policy.balanceRule, 1, remainder, auth, values)).toBe(true);
  expect(evaluate(policy.balanceRule, remainder, 0, auth, values)).toBe(false);
  values.set(`/transfer/${policy.serviceAccount}/${accounts[0]}/12345/value`, remainder);
  expect(evaluate(policy.balanceRule, remainder, 0, auth, values)).toBe(true);
  expect(evaluate(policy.balanceRule, remainder, 0, { ...auth, fids: ['_transfer'] }, values)).toBe(false);
  expect(evaluate(policy.balanceRule, 0, remainder, auth, values)).toBe(false);
});

test('zero-payment close and zero final balance preserve micro-AIN units and reject malformed domains', () => {
  const unchanged = replayCooperativeClose(options, []);
  expect(unchanged.sequence).toBe(0);
  const emptied = replayCooperativeClose(options, payments(String(ESCROW_UNITS_PER_AIN / 2), 1));
  expect(emptied.balanceA).toBe(0);
  expect(emptied.balanceB).toBe(ESCROW_UNITS_PER_AIN);
  for (const balances of [['-1', '1000'], ['0', String(ESCROW_UNITS_PER_AIN)], [String(2 ** 32), String(2 ** 32)]]) {
    expect(() => cooperativeEscrow({ ...options, opening: { ...opening, balances: balances as [string, string] } })).toThrow();
  }
  expect(() => cooperativeEscrow({ ...options, accounts: [accounts[0], accounts[0]] })).toThrow();
  expect(() => cooperativeEscrow({ ...options, escrowKey: '../other' })).toThrow();
  expect(cooperativeEscrow({ ...options, opening: { ...opening, balances: ['12345', '98655'] } }).totalUnits).toBe(111000);
});

test('version2 is explicit in immutable terms and never changes the default legacy policy', () => {
  expect(policy.terms).not.toHaveProperty('native_release_version');
  const versioned = cooperativeEscrow({ ...options, nativeReleaseVersion: 2 });
  expect(versioned.terms.native_release_version).toBe(2);
  expect(cooperativeEscrow({ ...options, nativeReleaseVersion: 1 })).toEqual(policy);
  expect(() => cooperativeEscrow({ ...options, nativeReleaseVersion: 3 as 2 })).toThrow(/version/);
});

test('version2 release requires identical approved integer amounts and refuses ratio fallback', () => {
  const versioned = cooperativeEscrow({ ...options, nativeReleaseVersion: 2 });
  const close = replayCooperativeClose(options, payments());
  const values = new Map<string, unknown>([[versioned.paths.balance, 1],
    [versioned.paths.sourceApproval, close], [versioned.paths.targetApproval, close]]);
  const release = microUnitEscrowRelease(close);
  expect(release).toEqual({ version: 2, source_units: 499940, target_units: 500060 });
  expect(evaluate(versioned.rules.release.settle, null, release, { addr: accounts[0] }, values)).toBe(true);
  for (const invalid of [{ ratio: 0.50006 }, { ...release, version: 1 }, { ...release, ratio: 0.50006 },
    { ...release, source_units: 499941 }, { ...release, target_units: 500059 }]) {
    expect(evaluate(versioned.rules.release.settle, null, invalid, { addr: accounts[0] }, values)).toBe(false);
  }
  expect(evaluate(versioned.rules.release.settle, null, release, { addr: stranger }, values)).toBe(false);
  values.delete(versioned.paths.targetApproval);
  expect(evaluate(versioned.rules.release.settle, null, release, { addr: accounts[0] }, values)).toBe(false);
});

test('version2 guards require exact native micro-unit balance steps and recipient records', () => {
  const versioned = cooperativeEscrow({ ...options, nativeReleaseVersion: 2 });
  const close = replayCooperativeClose(options, payments());
  const values = new Map<string, unknown>([[versioned.paths.sourceApproval, close],
    [versioned.paths.targetApproval, close], [versioned.paths.release, microUnitEscrowRelease(close)]]);
  const auth = { addr: accounts[0], fid: '_transfer', fids: ['_release', '_transfer'] };
  expect(evaluate(versioned.balanceRule, 1, 0.49994, auth, values)).toBe(false);
  values.set(`/transfer/${versioned.serviceAccount}/${accounts[1]}/12345/value`, 0.50006);
  expect(evaluate(versioned.balanceRule, 1, 0.49994, auth, values)).toBe(true);
  expect(evaluate(versioned.balanceRule, 1, 1 - 0.50006, auth, values)).toBe(false);
  expect(evaluate(versioned.balanceRule, 0.49994, 0, auth, values)).toBe(false);
  values.set(`/transfer/${versioned.serviceAccount}/${accounts[0]}/12345/value`, 0.49994);
  expect(evaluate(versioned.balanceRule, 0.49994, 0, auth, values)).toBe(true);
  expect(evaluate(versioned.balanceRule, 0.49994, 0, { ...auth, fids: ['_transfer'] }, values)).toBe(false);
});

test('version2 fractional deposits use the total unit amount, not floating addition', () => {
  const versioned = cooperativeEscrow({ ...options, nativeReleaseVersion: 2,
    opening: { ...opening, balances: ['100000', '200000'] } });
  const values = new Map<string, unknown>([[versioned.paths.targetDeposit, 0.2]]);
  const auth = { addr: accounts[1], fid: '_transfer', fids: ['_transfer'] };
  expect(evaluate(versioned.balanceRule, 0.1, 0.3, auth, values)).toBe(true);
  expect(evaluate(versioned.balanceRule, 0.1, 0.1 + 0.2, auth, values)).toBe(false);
});
