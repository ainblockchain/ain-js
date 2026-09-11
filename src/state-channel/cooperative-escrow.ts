import * as AinUtil from '@ainblockchain/ain-util';
import { ChannelOpening, PaymentChannel, PaymentReceipt } from './index';

export const ESCROW_UNITS_PER_AIN = 1_000_000;

export interface CooperativeEscrowOptions {
  opening: ChannelOpening;
  accounts: [string, string];
  escrowKey: string;
}

export interface CooperativeClose {
  openingHash: string;
  sequence: number;
  stateHash: string;
  balanceA: number;
  balanceB: number;
}

const literal = (value: unknown) => JSON.stringify(value);
const valueAt = (path: string) => `getValue(${literal(path)})`;
const writeRule = (write: string | boolean) => ({ '.rule': { write } });

function numericUnits(value: string): number {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error('canonical integer escrow units required');
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount > 2 ** 32) throw new Error('escrow units exceed exact arithmetic bounds');
  return amount;
}

export function cooperativeEscrow(options: CooperativeEscrowOptions) {
  const { opening, accounts, escrowKey } = options;
  const channel = new PaymentChannel(opening);
  if (!Array.isArray(accounts) || accounts.length !== 2 || accounts[0] === accounts[1]
    || accounts.some(account => !AinUtil.isValidAddress(account) || AinUtil.toChecksumAddress(account) !== account)) {
    throw new Error('two distinct checksummed AIN accounts required');
  }
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(escrowKey)) throw new Error('invalid escrow key');
  const initial = opening.balances.map(numericUnits);
  const total = initial[0] + initial[1];
  if (initial.some(balance => balance === 0) || total > 2 ** 32) {
    throw new Error('positive deposits with a total <=2^32 micro-AIN required');
  }
  const [source, target] = accounts;
  const accountKey = `${source}:${target}:${escrowKey}`;
  const serviceAccount = `escrow|escrow|${accountKey}`;
  const root = `/escrow/${source}/${target}/${escrowKey}`;
  const balancePath = `/service_accounts/escrow/escrow/${accountKey}/balance`;
  const holdPath = `${root}/hold/deposit`;
  const targetDeposit = `/transfer/${target}/${serviceAccount}/deposit/value`;
  const approvals = [`${root}/close/source`, `${root}/close/target`];
  const releasePath = `${root}/release/settle`;
  const openingHash = `0x${channel.openingHash}`;
  const initialAIN = initial.map(balance => balance / ESCROW_UNITS_PER_AIN);
  const fundedAIN = initialAIN[0] + initialAIN[1];
  const approvedA = valueAt(`${approvals[0]}/balanceA`);
  const approvedB = valueAt(`${approvals[0]}/balanceB`);
  const participant = `(auth.addr === ${literal(source)} || auth.addr === ${literal(target)})`;
  const terms = { version: 1, chainId: opening.chainId, channelId: opening.channelId, escrowKey,
    source, target, publicKeyA: opening.publicKeys[0], publicKeyB: opening.publicKeys[1],
    initialA: initial[0], initialB: initial[1], unitsPerAIN: ESCROW_UNITS_PER_AIN };
  const termsMatch = Object.entries(terms).map(([field, value]) => `${valueAt(`${root}/config/${field}`)} === ${literal(value)}`).join(' && ');
  const fields = ['openingHash', 'sequence', 'stateHash', 'balanceA', 'balanceB'];
  const matchingApprovals = fields.map(field => `${valueAt(`${approvals[0]}/${field}`)} === ${valueAt(`${approvals[1]}/${field}`)}`).join(' && ');
  const approved = `(${valueAt(`${approvals[0]}/openingHash`)} === ${literal(openingHash)} && ${matchingApprovals})`;
  const closeShape = `util.isDict(newData) && util.length(newData) === 5 && newData.openingHash === ${literal(openingHash)}`
    + ` && util.isInteger(newData.sequence) && newData.sequence >= 0 && newData.sequence <= 9007199254740991`
    + ` && util.isValidHash(newData.stateHash) && util.isInteger(newData.balanceA) && util.isInteger(newData.balanceB)`
    + ` && newData.balanceA >= 0 && newData.balanceB >= 0 && newData.balanceA + newData.balanceB === ${total}`
    + ` && (newData.sequence !== 0 || (newData.stateHash === ${literal(openingHash)} && newData.balanceA === ${initial[0]} && newData.balanceB === ${initial[1]}))`;
  const openingLive = `${valueAt(balancePath)} === ${fundedAIN} && ${valueAt(releasePath)} === null`;
  const closeSource = `data === null && auth.addr === ${literal(source)} && ${openingLive} && ${closeShape}`;
  const closeTarget = `data === null && auth.addr === ${literal(target)} && ${openingLive} && ${closeShape}`
    + ` && ${fields.map(field => `newData.${field} === ${valueAt(`${approvals[0]}/${field}`)}`).join(' && ')}`;
  const hold = `data === null && auth.addr === ${literal(source)} && util.isDict(newData) && util.length(newData) === 1`
    + ` && newData.amount === ${initialAIN[0]} && ${valueAt(balancePath)} === null && ${valueAt(approvals[0])} === null && ${termsMatch}`;
  const release = `data === null && ${participant} && ${approved} && ${valueAt(balancePath)} === ${fundedAIN}`
    + ` && util.isDict(newData) && util.length(newData) === 1 && newData.ratio === ${approvedB} / ${total}`;
  const stack = (first: string, length: number) => `util.isArray(auth.fids) && util.length(auth.fids) === ${length} && auth.fids[0] === ${literal(first)}`;
  const incomingSource = `data === null && newData === ${initialAIN[0]} && auth.addr === ${literal(source)}`
    + ` && ${stack('_hold', 2)} && ${valueAt(`${holdPath}/amount`)} === ${initialAIN[0]}`;
  const incomingTarget = `data === ${initialAIN[0]} && newData === ${fundedAIN} && auth.addr === ${literal(target)}`
    + ` && ${stack('_transfer', 1)} && ${valueAt(targetDeposit)} === ${initialAIN[1]} && ${valueAt(approvals[0])} === null`;
  const nativeTransfer = (recipient: string) => `getValue(${literal(`/transfer/${serviceAccount}/${recipient}/`)} + currentTime + '/value')`;
  const nativeTarget = `(${fundedAIN} * (${approvedB} / ${total}))`;
  const nativeSource = `(${fundedAIN} - ${nativeTarget})`;
  const payout = `${participant} && ${stack('_release', 2)} && ${approved}`
    + ` && ${valueAt(`${releasePath}/ratio`)} === ${approvedB} / ${total} && (`
    + `(${approvedB} > 0 && data === ${fundedAIN} && newData === ${nativeSource} && ${nativeTransfer(target)} === ${nativeTarget})`
    + ` || (${approvedA} > 0 && data === ${nativeSource} && newData === 0 && ${nativeTransfer(source)} === ${nativeSource}))`;
  const balanceRule = writeRule(`auth.fid === '_transfer' && ((${incomingSource}) || (${incomingTarget}) || (${payout}))`);
  const fallback = { balance: writeRule("auth.fid === '_transfer'") };
  const owners = { '.owner': { owners: { '*': { branch_owner: false, write_function: false, write_owner: false, write_rule: false } } } };
  return {
    scope: 'experimental cooperative AIN escrow; no unilateral challenge/timeout adjudication',
    unitsPerAIN: ESCROW_UNITS_PER_AIN,
    openingHash,
    totalUnits: total,
    terms,
    depositsAIN: initialAIN,
    serviceAccount,
    paths: { root, config: `${root}/config`, balance: balancePath, hold: holdPath, targetDeposit, sourceApproval: approvals[0], targetApproval: approvals[1], release: releasePath },
    rules: { ...writeRule(false), config: writeRule(false), hold: { deposit: writeRule(hold) },
      close: { source: writeRule(closeSource), target: writeRule(closeTarget) }, release: { settle: writeRule(release) } },
    balanceRule,
    initialEscrowServiceRules: { '$service_name': { '$key': fallback }, escrow: { '$key': fallback, [accountKey]: { balance: balanceRule } } },
    owners,
  };
}

export function replayCooperativeClose(options: CooperativeEscrowOptions, receipts: Iterable<PaymentReceipt>): CooperativeClose {
  const policy = cooperativeEscrow(options);
  const channel = new PaymentChannel(options.opening);
  for (const receipt of receipts) channel.commit(receipt);
  const state = channel.snapshot();
  const balanceA = numericUnits(state.balances[0]);
  const balanceB = numericUnits(state.balances[1]);
  if (balanceA + balanceB !== policy.totalUnits) throw new Error('closing balances do not conserve deposits');
  return { openingHash: policy.openingHash, sequence: state.sequence, stateHash: `0x${state.head}`, balanceA, balanceB };
}
