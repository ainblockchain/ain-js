/**
 * P256 (prime256v1/secp256r1) cryptographic functions for AIN blockchain.
 * Uses the `elliptic` library (transitive dependency) for signing pre-hashed data.
 *
 * Signature format:
 *   secp256k1: {hash(32)}{r(32)}{s(32)}{v(1)} = 97 bytes
 *   P256:      {hash(32)}{compressedPubKey(33)}{r(32)}{s(32)} = 129 bytes
 *
 * Detection: buffer[32] === 0x02 || 0x03 AND buffer.length === 129
 */
import { Account } from './types';

const EC = require('elliptic').ec;
const createKeccakHash = require('keccak');
const stringify = require('fast-json-stable-stringify');
const randomBytes = require('randombytes');

const ec = new EC('p256');

/**
 * Returns true if the given signature buffer is a P256 signature.
 * P256 signatures are 129 bytes: {hash(32)}{compressedPubKey(33)}{r(32)}{s(32)}
 * The compressed pubkey starts with 0x02 or 0x03.
 */
export function isP256Signature(sigBuffer: Buffer): boolean {
  if (sigBuffer.length !== 129) return false;
  const prefixByte = sigBuffer[32];
  return prefixByte === 0x02 || prefixByte === 0x03;
}

/**
 * Generates a P256 keypair and returns an Account.
 * Address is derived the same way as secp256k1: keccak256(uncompressedPubKey[1:])[-20:]
 */
export function createP256Account(): Account {
  const keyPair = ec.genKeyPair({
    entropy: randomBytes(32).toString('hex')
  });

  const privHex = keyPair.getPrivate('hex').padStart(64, '0');
  const pubPoint = keyPair.getPublic();
  const pubUncompressed = Buffer.from(pubPoint.encode('hex', false), 'hex'); // 65 bytes: 04 + x + y

  // Address: keccak256 of the 64-byte uncompressed pubkey (without 04 prefix), take last 20 bytes
  const pubRaw = pubUncompressed.slice(1); // 64 bytes
  const addressBuf = keccak256(pubRaw).slice(-20);
  const address = toChecksumAddress('0x' + addressBuf.toString('hex'));

  return {
    address,
    private_key: privHex,
    public_key: pubUncompressed.slice(1).toString('hex'), // 64-byte raw pubkey (no prefix)
    keyType: 'p256',
  };
}

/**
 * Signs a pre-hashed message with a P256 private key.
 * Returns the compressed public key, r, and s.
 */
export function p256SignHash(
  msgHash: Buffer,
  privateKeyHex: string
): { compressedPubKey: Buffer; r: Buffer; s: Buffer } {
  const keyPair = ec.keyFromPrivate(privateKeyHex, 'hex');
  const sig = keyPair.sign(msgHash);

  const pubPoint = keyPair.getPublic();
  const compressedPubKey = Buffer.from(pubPoint.encode('hex', true), 'hex'); // 33 bytes
  const r = sig.r.toArrayLike(Buffer, 'be', 32);
  const s = sig.s.toArrayLike(Buffer, 'be', 32);

  return { compressedPubKey, r, s };
}

/**
 * Signs a message with a P256 private key.
 * Format: {hash(32)}{compressedPubKey(33)}{r(32)}{s(32)} = 129 bytes
 */
export function p256SignMessage(message: any, privateKeyHex: string): string {
  const hashedMsg = hashMessage(message);
  const { compressedPubKey, r, s } = p256SignHash(hashedMsg, privateKeyHex);

  const sigBuffer = Buffer.concat([hashedMsg, compressedPubKey, r, s]);
  return '0x' + sigBuffer.toString('hex');
}

/**
 * Signs a transaction body with a P256 private key.
 * Format: {hash(32)}{compressedPubKey(33)}{r(32)}{s(32)} = 129 bytes
 */
export function p256SignTransaction(txBody: any, privateKeyHex: string): string {
  const hashedTx = hashTransaction(txBody);
  const { compressedPubKey, r, s } = p256SignHash(hashedTx, privateKeyHex);

  const sigBuffer = Buffer.concat([hashedTx, compressedPubKey, r, s]);
  return '0x' + sigBuffer.toString('hex');
}

/**
 * Verifies a P256 signature against data and address.
 */
export function p256VerifySig(data: any, signature: string, address: string): boolean {
  const sigBuffer = toBuffer(signature);
  if (!isP256Signature(sigBuffer)) return false;

  const hash = sigBuffer.slice(0, 32);
  const compressedPubKey = sigBuffer.slice(32, 65);
  const r = sigBuffer.slice(65, 97);
  const s = sigBuffer.slice(97, 129);

  // Verify the hash matches the data
  if (typeof data === 'object' && isTransactionBody(data)) {
    if (!hash.equals(hashTransaction(data))) return false;
  } else {
    if (!hash.equals(hashMessage(data))) return false;
  }

  // Verify the ECDSA signature
  const pubKey = ec.keyFromPublic(compressedPubKey);
  const valid = pubKey.verify(hash, { r: r, s: s });
  if (!valid) return false;

  // Derive address from public key and compare
  const pubUncompressed = Buffer.from(pubKey.getPublic().encode('hex', false), 'hex');
  const pubRaw = pubUncompressed.slice(1); // 64 bytes
  const derivedAddr = toChecksumAddress('0x' + keccak256(pubRaw).slice(-20).toString('hex'));

  return areSameAddresses(address, derivedAddr);
}

/**
 * Extracts the address from a P256 signature.
 */
export function p256GetAddressFromSignature(sigBuffer: Buffer): string {
  const compressedPubKey = sigBuffer.slice(32, 65);
  const pubKey = ec.keyFromPublic(compressedPubKey);
  const pubUncompressed = Buffer.from(pubKey.getPublic().encode('hex', false), 'hex');
  const pubRaw = pubUncompressed.slice(1);
  return toChecksumAddress('0x' + keccak256(pubRaw).slice(-20).toString('hex'));
}

/**
 * Extracts the hash from a P256 signature.
 */
export function p256GetHashFromSignature(sigBuffer: Buffer): Buffer {
  return sigBuffer.slice(0, 32);
}

/**
 * Converts a P256 public key (64-byte raw or 33-byte compressed) to an address.
 */
export function p256PubKeyToAddress(publicKey: Buffer): string {
  let pubRaw: Buffer;
  if (publicKey.length === 64) {
    pubRaw = publicKey;
  } else if (publicKey.length === 33) {
    const pubKey = ec.keyFromPublic(publicKey);
    const pubUncompressed = Buffer.from(pubKey.getPublic().encode('hex', false), 'hex');
    pubRaw = pubUncompressed.slice(1);
  } else if (publicKey.length === 65) {
    pubRaw = publicKey.slice(1);
  } else {
    throw new Error('[p256] Invalid public key length');
  }
  return toChecksumAddress('0x' + keccak256(pubRaw).slice(-20).toString('hex'));
}

// --- Internal helpers (mirror ain-util functions to avoid circular deps) ---

function keccak256(input: Buffer): Buffer {
  return createKeccakHash('keccak256').update(input).digest();
}

function hashTransaction(transaction: any): Buffer {
  const tx = typeof transaction === 'string' ? transaction : stringify(transaction);
  return keccak256(keccak256(Buffer.from(tx)));
}

function hashMessage(message: any): Buffer {
  const SIGNED_MESSAGE_PREFIX = 'AINetwork Signed Message:\n';
  const prefixBytes = Buffer.from(SIGNED_MESSAGE_PREFIX, 'utf8');
  const varuint = require('varuint-bitcoin');
  const prefixLengthBytes = varuint.encode(SIGNED_MESSAGE_PREFIX.length);
  const msgBytes = toBuffer(message);
  const msgLenBytes = varuint.encode(message.length);
  const dataBytes = Buffer.concat([prefixLengthBytes, prefixBytes, msgLenBytes, msgBytes]);
  return keccak256(keccak256(dataBytes));
}

function isTransactionBody(obj: any): boolean {
  const _obj = typeof obj === 'string' ? JSON.parse(obj) : obj;
  return 'nonce' in _obj && 'timestamp' in _obj && 'operation' in _obj;
}

function toBuffer(v: any): Buffer {
  if (Buffer.isBuffer(v)) return v;
  if (Array.isArray(v)) return Buffer.from(v);
  if (typeof v === 'string') {
    if (v.slice(0, 2) === '0x') {
      const hex = v.slice(2);
      return Buffer.from(hex.length % 2 ? '0' + hex : hex, 'hex');
    }
    return Buffer.from(v);
  }
  if (typeof v === 'number') {
    const hex = v.toString(16);
    return Buffer.from(hex.length % 2 ? '0' + hex : hex, 'hex');
  }
  if (v === null || v === undefined) return Buffer.alloc(0);
  throw new Error('[p256] toBuffer: Invalid type');
}

function toChecksumAddress(address: string): string {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error('[p256] toChecksumAddress: Invalid address');
  }
  const addr = address.slice(2).toLowerCase();
  const hash = keccak256(Buffer.from(addr)).toString('hex');
  let ret = '0x';
  for (let i = 0; i < addr.length; i++) {
    ret += parseInt(hash[i], 16) >= 8 ? addr[i].toUpperCase() : addr[i];
  }
  return ret;
}

function areSameAddresses(addr1: string, addr2: string): boolean {
  return toChecksumAddress(addr1) === toChecksumAddress(addr2);
}
