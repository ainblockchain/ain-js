import { Accounts, Account, TransactionBody, V3Keystore, V3KeystoreOptions, KdfParams } from './types';
import * as scrypt from 'scryptsy';
import * as randomBytes from 'randombytes';
import uuid from 'uuid';
import Ain from './ain';
import { validateMnemonic, mnemonicToSeedSync } from 'bip39';
import { pbkdf2Sync } from 'pbkdf2';
import { createCipheriv, createDecipheriv } from 'browserify-cipher';
const AIN_HD_DERIVATION_PATH = "m/44'/412'/0'/0/"; /* default wallet address for AIN */

export default class Wallet {
  public defaultAccount?: string | null;
  private accounts: Accounts;
  private _length: number;

  /**
   * @constructor
   */
  constructor() {
    this.accounts = {};
    this._length = 0;
  }

  /**
   * Getter for the number of accounts in the wallet.
   */
  get length() {
    return this._length;
  }

  /**
   * Returns the full public key of the given address.
   * @param {string} address
   * @return {string}
   */
  getPublicKey(address: string): string {
    const checksummed = Ain.ainUtil.toChecksumAddress(address);
    if (!this.accounts[checksummed]) return ''
    return this.accounts[checksummed].full_public_key;
  }

  /**
   * Creates {numberOfAccounts} new accounts and add them to the wallet.
   * @param {number} numberOfAccounts
   */
  create(numberOfAccounts: number) {
    if (numberOfAccounts <= 0) throw Error("numberOfAccounts should be greater than 0.");
    // TODO (lia): set maximum limit for numberOfAccounts?
    for (let i = 0; i < numberOfAccounts; i++) {
      let account = Wallet.generateAccount();
      this.accounts[account.address] = account;
    }
    this._length = this.accounts ? Object.keys(this.accounts).length : 0;
  }

  /**
   * Returns whether the address has already been added to the wallet.
   * @param {string} address
   * @return {boolean}
   */
  isAdded(address: string): boolean {
    return !!(this.accounts[Ain.ainUtil.toChecksumAddress(address)])
  }

  /**
   * Adds a new account from the given private key.
   * @param {string} privateKey
   */
  add(privateKey: string) {
    let newAccount = Wallet.fromPrivateKey(Buffer.from(privateKey, 'hex'));
    this.accounts[newAccount.address] = newAccount;
    this._length++;
  }

  /**
   * Adds an account from a seed phrase. Only the account at the given
   * index (default = 0) will be added.
   * @param {string} seedPhrase
   * @param {number} index
   * @return {string} - The address of the newly added account.
   */
  addFromHDWallet(seedPhrase: string, index: number = 0): string {
    if (index < 0) {
      throw new Error('[ain-js.wallet.addFromHDWallet] index should be greater than 0');
    }
    if (!validateMnemonic(seedPhrase)) {
      throw new Error('[ain-js.wallet.addFromHDWallet] Invalid seed phrase');
    }
    const seed = mnemonicToSeedSync(seedPhrase);
    const HDkey = require('hdkey');
    const hdkey = HDkey.fromMasterSeed(seed);
    const path = AIN_HD_DERIVATION_PATH + index;
    const wallet = hdkey.derive(path);
    const address = Ain.ainUtil.toChecksumAddress('0x'+
        Ain.ainUtil.pubToAddress(wallet.publicKey, true).toString('hex'));
    this.accounts[address] = {
        address,
        full_public_key: wallet.publicKey.toString('hex'),
        private_key: wallet.privateKey.toString('hex')
      };
    this._length++;
    return address;
  }

  /**
   * Removes an account
   * @param {string} address
   */
  remove(address: string) {
    let accountToRemove = Ain.ainUtil.toChecksumAddress(address);
    delete this.accounts[accountToRemove];
    this._length--;
    if (this.defaultAccount === accountToRemove) this.removeDefaultAccount();
  }

  /**
   * Sets the default account as {address}. The account should be already added
   * in the wallet.
   * @param {string} address
   */
  setDefaultAccount(address: string) {
    const checksummed = Ain.ainUtil.toChecksumAddress(address);
    if (!this.accounts[checksummed]) {
      throw new Error('[ain-js.wallet.setDefaultAccount] Add the account first before setting it to defaultAccount.');
    }
    this.defaultAccount = checksummed;
  }

  /**
   * Removes a default account (sets it to null).
   */
  removeDefaultAccount() {
    this.defaultAccount = null;
  }

  /**
   * Clears the wallet (remove all account information).
   */
  clear() {
    this.accounts = {};
    this._length = 0;
    this.removeDefaultAccount();
  }

  /**
   * Signs a string data with the private key of the given address. It will use
   * the defaultAccount if an address is not provided.
   * @param {string} data
   * @param {string} address
   * @return {string} - signature
   */
  sign(data: string, address?: string): string {
    if (!address && !this.defaultAccount) {
      throw new Error('[ain-js.wallet.sign] You need to specify the address or set defaultAccount.');
    }
    let checksummed = Ain.ainUtil.toChecksumAddress(String(address ? address : this.defaultAccount));
    if (!this.accounts[checksummed]) {
      throw new Error('[ain-js.wallet.sign] The address you specified is not added in your wallet. Try adding it first.');
    }
    return Ain.ainUtil.ecSignMessage(data, Buffer.from(this.accounts[checksummed].private_key, 'hex'));
  }

  /**
   * Signs a transaction data with the private key of the given address. It will use
   * the defaultAccount if an address is not provided.
   * @param {TransactionBody} data
   * @param {string} address
   * @return {string} - signature
   */
  signTransaction(tx: TransactionBody, address?: string): string {
    if (!address && !this.defaultAccount) {
      throw new Error('[ain-js.wallet.signTransaction] You need to specify the address or set defaultAccount.');
    }
    let checksummed = Ain.ainUtil.toChecksumAddress(String(address ? address : this.defaultAccount));
    if (!this.accounts[checksummed]) {
      throw new Error('[ain-js.wallet.signTransaction] The address you specified is not added in your wallet. Try adding it first.');
    }
    return Ain.ainUtil.ecSignTransaction(tx, Buffer.from(this.accounts[checksummed].private_key, 'hex'));
  }

  /**
   * Recovers an address of the account that was used to create the signature.
   * @param {string} signature
   * @return {string} - address
   */
  recover(signature: string): string {
    const sigBuffer = Ain.ainUtil.toBuffer(signature);
    const len = sigBuffer.length;
    const lenHash = len - 65;
    const hashedData = sigBuffer.slice(0, lenHash);
    const { r, s, v } = Ain.ainUtil.ecSplitSig(sigBuffer.slice(lenHash, len));
    return Ain.ainUtil.toChecksumAddress(
        Ain.ainUtil.bufferToHex(Ain.ainUtil.pubToAddress(
        Ain.ainUtil.ecRecoverPub(hashedData, r, s, v).slice(1))));
  }

  /**
   * Verifies if the signature is valid and was signed by the address.
   * @param {any} data
   * @param {string} signature
   * @param {string} address
   * @return {boolean}
   */
  verifySignature(data: any, signature: string, address: string): boolean {
    return Ain.ainUtil.ecVerifySig(data, signature, address);
  }

  /**
   * Save the accounts in the wallet as V3 Keystores, locking them with the password.
   * @param {string} password
   * @param {V3KeystoreOptions} options
   * @return {V3Keystore[]}
   */
  toV3Keystore(password: string, options: V3KeystoreOptions = {}): V3Keystore[] {
    let V3KeystoreArr: V3Keystore[] = [];
    if (!this.accounts) return V3KeystoreArr;
    Object.keys(this.accounts).forEach(address => {
      V3KeystoreArr.push(this.accountToV3Keystore(address, password, options));
    });
    return V3KeystoreArr;
  }

  /**
   * Converts an account into a V3 Keystore and encrypts it with a password
   * @param {TransactionBody} data
   * @param {string} address
   * @param {string} password
   * @param {V3KeystoreOptions} options
   * @return {V3Keystore}
   */
  private accountToV3Keystore(
      address:string,
      password: string,
      options: V3KeystoreOptions = {}
  ): V3Keystore {
    const salt = options.salt || randomBytes(32);
    const iv = options.iv || randomBytes(16);
    let derivedKey: Buffer;
    const kdf = options.kdf || 'scrypt';
    const kdfparams: KdfParams = { dklen: options.dklen || 32, salt: salt.toString('hex') };

    if (kdf === 'pbkdf2') {
      kdfparams.c = options.c || 262144;
      kdfparams.prf = 'hmac-sha256';
      derivedKey = pbkdf2Sync(
          Buffer.from(password),
          Buffer.from(kdfparams.salt, 'hex'),
          kdfparams.c,
          kdfparams.dklen,
          'sha256'
        );
    } else if (kdf === 'scrypt') {
      kdfparams.n = options.n || 8192; // 2048 4096 8192 16384
      kdfparams.r = options.r || 8;
      kdfparams.p = options.p || 1;
      derivedKey = scrypt(
          Buffer.from(password),
          Buffer.from(kdfparams.salt, 'hex'),
          kdfparams.n,
          kdfparams.r,
          kdfparams.p,
          kdfparams.dklen,
        );
    } else {
      throw new Error('[ain-js.wallet.accountToV3Keystore] Unsupported kdf');
    }

    const cipher = createCipheriv(options.cipher || 'aes-128-ctr', derivedKey.slice(0, 16), iv);
    if (!cipher) {
      throw new Error('[ain-js.wallet.accountToV3Keystore] Unsupported cipher');
    }
    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(this.accounts[address].private_key.replace('0x', ''), 'hex')),
      cipher.final()
    ]);
    const mac = Ain.ainUtil.keccak(Buffer.concat([derivedKey.slice(16, 32), ciphertext]))
        .toString('hex').replace('0x', '');

    return {
      version: 3,
      id: uuid.v4({random: options.uuid || randomBytes(16)}),
      address: address.toLowerCase().replace('0x', ''),
      crypto: {
        ciphertext: ciphertext.toString('hex'),
        cipherparams: {
          iv: iv.toString('hex')
        },
        cipher: options.cipher || 'aes-128-ctr',
        kdf,
        kdfparams,
        mac
      }
    };
  }

  /**
   * Adds an account from a V3 Keystore.
   * @param {V3Keystore | string} v3Keystore
   * @param {string} [password]
   */
  fromV3Keystore(v3Keystore: V3Keystore | string, password: string) {
    let json: V3Keystore = (typeof v3Keystore === 'string') ?
        JSON.parse(v3Keystore.toLowerCase()) : v3Keystore;
    if (json.version !== 3) {
        throw new Error('[ain-js.wallet.fromV3Keystore] Not a valid V3 wallet');
    }
    let derivedKey: Buffer;
    let kdfparams: KdfParams;

    if (json.crypto.kdf === 'scrypt') {
      kdfparams = json.crypto.kdfparams;
      derivedKey = scrypt(
          Buffer.from(password),
          Buffer.from(kdfparams.salt, 'hex'),
          kdfparams.n,
          kdfparams.r,
          kdfparams.p,
          kdfparams.dklen
        );
    } else if (json.crypto.kdf === 'pbkdf2') {
      kdfparams = json.crypto.kdfparams;
      if (kdfparams.prf !== 'hmac-sha256') {
        throw new Error('[ain-js.wallet.fromV3Keystore] Unsupported parameters to PBKDF2');
      }
      derivedKey = pbkdf2Sync(
          Buffer.from(password),
          Buffer.from(kdfparams.salt, 'hex'),
          kdfparams.c,
          kdfparams.dklen,
          'sha256'
        );
    } else {
      throw new Error('[ain-js.wallet.fromV3Keystore] Unsupported key derivation scheme');
    }

    const ciphertext = Buffer.from(json.crypto.ciphertext, 'hex');
    const mac = Ain.ainUtil.keccak(Buffer.concat([derivedKey.slice(16, 32), ciphertext]))
        .toString('hex').replace('0x', '');
    if (mac !== json.crypto.mac) {
      throw new Error('[ain-js.wallet.fromV3Keystore] Key derivation failed - possibly wrong password');
    }
    const decipher = createDecipheriv(
        json.crypto.cipher,
        derivedKey.slice(0, 16),
        Buffer.from(json.crypto.cipherparams.iv, 'hex')
      );
    const seed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return Wallet.fromPrivateKey(seed);
  }

  /**
   * Concatenates two buffers.
   * @param {Buffer} a
   * @param {Buffer} b
   * @return {Bugger}
   */
  static concat(a: Buffer, b: Buffer): Buffer {
    return Buffer.concat([a, b.slice(2)]);
  }

  /**
   * Generates an account with a given entropy
   * @param {string} entropy
   * @return {Account} - signature
   */
  static generateAccount(entropy?: string): Account {
    const innerHex = Ain.ainUtil.keccak(this.concat(randomBytes(32), !!entropy ? Buffer.from(entropy) : randomBytes(32)));
    const middleHex = this.concat(this.concat(randomBytes(32), innerHex), randomBytes(32));
    const outerHex = Ain.ainUtil.keccak(middleHex);
    return this.fromPrivateKey(outerHex);
  }

  /**
   * Imports an account from a private key.
   * @param {Buffer} privateKey
   * @return {Account}
   */
  static fromPrivateKey(privateKey: Buffer): Account {
    let fullPublicKey = Ain.ainUtil.privateToPublic(privateKey);
    return {
      address: Ain.ainUtil.toChecksumAddress(Ain.ainUtil.bufferToHex(Ain.ainUtil.pubToAddress(fullPublicKey))),
      private_key: privateKey.toString('hex'),
      full_public_key: fullPublicKey.toString('hex')
    };
  }
}
