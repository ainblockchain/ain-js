import { createHash, createPrivateKey, createPublicKey, KeyObject, sign, verify } from 'crypto';

export interface ChannelOpening {
  chainId: string;
  channelId: string;
  openingReference: string;
  publicKeys: [string, string];
  balances: [string, string];
}

export interface PaymentState {
  version: 1;
  openingHash: string;
  sequence: number;
  previousHash: string;
  from: number;
  amount: string;
  balances: [string, string];
}

export interface PaymentProposal {
  state: PaymentState;
  signature: string;
}

export interface PaymentReceipt {
  state: PaymentState;
  signatures: [string, string];
}

const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const clone = <Value>(value: Value): Value => JSON.parse(JSON.stringify(value));

function units(value: string): bigint {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,77})$/.test(value)) throw new Error('amount must be canonical unsigned integer units');
  return BigInt(value);
}

export function paymentStateBytes(state: PaymentState): Buffer {
  return Buffer.from('AIN_PAYMENT_CHANNEL_V1\n' + JSON.stringify({
    version: state.version, openingHash: state.openingHash, sequence: state.sequence,
    previousHash: state.previousHash, from: state.from, amount: state.amount, balances: state.balances,
  }));
}

export class PaymentChannel {
  readonly openingHash: string;
  private readonly keys: [KeyObject, KeyObject];
  private readonly publicKeys: [string, string];
  private balances: [string, string];
  private readonly total: bigint;
  private sequence = 0;
  private head: string;
  private latest: PaymentReceipt | null = null;

  constructor(opening: ChannelOpening) {
    if (!opening.chainId || !opening.channelId || !/^[a-f0-9]{64}$/.test(opening.openingReference)) throw new Error('chain, channel and opening reference required');
    if (!Array.isArray(opening.publicKeys) || opening.publicKeys.length !== 2 || new Set(opening.publicKeys).size !== 2) throw new Error('two distinct participants required');
    if (!Array.isArray(opening.balances) || opening.balances.length !== 2) throw new Error('two balances required');
    this.publicKeys = [...opening.publicKeys];
    this.keys = opening.publicKeys.map(encoded => {
      const key = createPublicKey({ key: Buffer.from(encoded, 'base64'), format: 'der', type: 'spki' });
      if (key.asymmetricKeyType !== 'ed25519' || key.export({ format: 'der', type: 'spki' }).toString('base64') !== encoded) throw new Error('canonical Ed25519 public key required');
      return key;
    }) as [KeyObject, KeyObject];
    this.balances = [...opening.balances];
    this.total = units(this.balances[0]) + units(this.balances[1]);
    if (this.total === 0n) throw new Error('positive opening balance required');
    this.openingHash = hash(Buffer.from(JSON.stringify({ version: 1, chainId: opening.chainId,
      channelId: opening.channelId, openingReference: opening.openingReference, publicKeys: this.publicKeys, balances: this.balances })));
    this.head = this.openingHash;
  }

  snapshot() {
    return { openingHash: this.openingHash, sequence: this.sequence, head: this.head,
      balances: [...this.balances] as [string, string], total: this.total.toString(), receipt: clone(this.latest) };
  }

  private signer(privateKey: KeyObject | string, participant: number): KeyObject {
    const key = typeof privateKey === 'string' ? createPrivateKey(privateKey) : privateKey;
    if (key.type !== 'private' || key.asymmetricKeyType !== 'ed25519'
      || createPublicKey(key).export({ format: 'der', type: 'spki' }).toString('base64') !== this.publicKeys[participant]) {
      throw new Error('private key does not belong to participant');
    }
    return key;
  }

  private validSignature(state: PaymentState, signature: string, participant: number): boolean {
    if (typeof signature !== 'string' || !/^[a-f0-9]{128}$/.test(signature)) return false;
    const verified: unknown = verify(null, paymentStateBytes(state), this.keys[participant], Buffer.from(signature, 'hex'));
    return verified === true;
  }

  private validateNext(state: PaymentState): void {
    if (!state || state.version !== 1 || state.openingHash !== this.openingHash) throw new Error('wrong channel domain');
    if (!Number.isSafeInteger(state.sequence) || state.sequence !== this.sequence + 1 || state.previousHash !== this.head) throw new Error('stale, skipped or conflicting state');
    if (state.from !== 0 && state.from !== 1) throw new Error('invalid sender');
    const amount = units(state.amount);
    if (amount === 0n) throw new Error('positive transfer required');
    if (!Array.isArray(state.balances) || state.balances.length !== 2) throw new Error('two balances required');
    const balances = state.balances.map(units);
    if (balances[0] + balances[1] !== this.total) throw new Error('balance conservation failed');
    const expected = this.balances.map(units);
    if (expected[state.from] < amount) throw new Error('insufficient balance');
    expected[state.from] -= amount;
    expected[1 - state.from] += amount;
    if (expected.some((balance, index) => balance !== balances[index])) throw new Error('balances do not match transfer');
  }

  propose(from: number, amount: string, privateKey: KeyObject | string): PaymentProposal {
    if (from !== 0 && from !== 1) throw new Error('invalid sender');
    const transferred = units(amount);
    const next = this.balances.map(units);
    if (transferred === 0n || transferred > next[from]) throw new Error('invalid or insufficient transfer');
    next[from] -= transferred;
    next[1 - from] += transferred;
    const state: PaymentState = { version: 1, openingHash: this.openingHash, sequence: this.sequence + 1,
      previousHash: this.head, from, amount, balances: [next[0].toString(), next[1].toString()] };
    this.validateNext(state);
    return { state, signature: sign(null, paymentStateBytes(state), this.signer(privateKey, from)).toString('hex') };
  }

  accept(proposal: PaymentProposal, privateKey: KeyObject | string): PaymentReceipt {
    const state = proposal?.state;
    if (!state || (state.from !== 0 && state.from !== 1)) throw new Error('invalid proposal');
    if (!this.validSignature(state, proposal.signature, state.from)) throw new Error('invalid sender signature');
    const key = this.signer(privateKey, 1 - state.from);
    if (this.latest && state.sequence === this.sequence && hash(paymentStateBytes(state)) === this.head) return clone(this.latest);
    this.validateNext(state);
    const signatures: [string, string] = ['', ''];
    signatures[state.from] = proposal.signature;
    signatures[1 - state.from] = sign(null, paymentStateBytes(state), key).toString('hex');
    const receipt = { state: clone(state), signatures };
    this.commit(receipt);
    return clone(receipt);
  }

  commit(receipt: PaymentReceipt): void {
    if (!receipt || !Array.isArray(receipt.signatures) || receipt.signatures.length !== 2) throw new Error('two signatures required');
    this.validateNext(receipt.state);
    if (!receipt.signatures.every((signature, participant) => this.validSignature(receipt.state, signature, participant))) throw new Error('invalid co-signature');
    this.balances = [...receipt.state.balances];
    this.sequence = receipt.state.sequence;
    this.head = hash(paymentStateBytes(receipt.state));
    this.latest = clone(receipt);
  }
}
