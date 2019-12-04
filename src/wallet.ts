import { Accounts, Account, TransactionBody, V3Keystore, V3KeystoreOptions, KdfParams } from './types';
import Ain from './ain';
import { validateMnemonic, mnemonicToSeedSync } from 'bip39';
import { pbkdf2Sync } from 'pbkdf2';
import { createCipheriv, createDecipheriv } from 'browserify-cipher';
import { toChecksumAddress } from '@ainblockchain/ain-util';
import Reference from './ain-db/ref';
const AIN_HD_DERIVATION_PATH = "m/44'/412'/0'/0/"; /* default wallet address for AIN */

export default class Wallet {
  public defaultAccount?: string | null;
  public accounts: Accounts;
  public _length: number;
  public ain: Ain;

  /**
   * @constructor
   */
  constructor(ain: Ain) {
    this.accounts = {};
    this._length = 0;
    this.ain = ain;
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
    const checksummed = Ain.utils.toChecksumAddress(address);
    if (!this.accounts[checksummed]) return ''
    return this.accounts[checksummed].public_key;
  }

  /**
   * Creates {numberOfAccounts} new accounts and add them to the wallet.
   * @param {number} numberOfAccounts
   */
  create(numberOfAccounts: number): Array<string> {
    if (numberOfAccounts <= 0) throw Error("numberOfAccounts should be greater than 0.");
    // TODO (lia): set maximum limit for numberOfAccounts?
    let newAccounts: Array<string> = [];
    for (let i = 0; i < numberOfAccounts; i++) {
      let account = Ain.utils.createAccount();
      this.accounts[account.address] = account;
      newAccounts.push(account.address);
    }
    this._length = this.accounts ? Object.keys(this.accounts).length : 0;
    return newAccounts;
  }

  /**
   * Returns whether the address has already been added to the wallet.
   * @param {string} address
   * @return {boolean}
   */
  isAdded(address: string): boolean {
    return !!(this.accounts[Ain.utils.toChecksumAddress(address)])
  }

  /**
   * Adds a new account from the given private key.
   * @param {string} privateKey
   */
  add(privateKey: string): string {
    let newAccount = Wallet.fromPrivateKey(Buffer.from(privateKey, 'hex'));
    this.accounts[newAccount.address] = newAccount;
    this._length++;
    return newAccount.address;
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
    const address = Ain.utils.toChecksumAddress('0x'+
        Ain.utils.pubToAddress(wallet.publicKey, true).toString('hex'));
    this.accounts[address] = {
        address,
        public_key: wallet.publicKey.toString('hex'),
        private_key: wallet.privateKey.toString('hex')
      };
    this._length++;
    return address;
  }

  /**
   * Adds an account from a V3 Keystore.
   * @param {V3Keystore | string} v3Keystore
   * @param {string} [password]
   * @return {string} - The address of the newly added account.
   */
  addFromV3Keystore(v3Keystore: V3Keystore | string, password: string): string {
    const privateKey = Ain.utils.v3KeystoreToPrivate(v3Keystore, password);
    this.add(privateKey.toString('hex'));
    return Ain.utils.privateToAddress(privateKey);
  }

  /**
   * Removes an account
   * @param {string} address
   */
  remove(address: string) {
    let accountToRemove = Ain.utils.toChecksumAddress(address);
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
    const checksummed = Ain.utils.toChecksumAddress(address);
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
   * Returns the "implied" address. If address is not given,
   * it returns the defaultAccount. It throws an error if
   * an address is not given and defaultAccount is not set, or
   * the specified address is not added to the wallet.
   * @param {string} address
   */
  getImpliedAddress(address?: string) {
    if (!address && !this.defaultAccount) {
      throw Error('You need to specify the address or set defaultAccount.');
    }
    let checksummed = Ain.utils.toChecksumAddress(String(address ? address : this.defaultAccount));
    if (!this.accounts[checksummed]) {
      throw Error('The address you specified is not added in your wallet. Try adding it first.');
    }
    return checksummed;
  }

  /**
   * Returns the AIN balance of the address.
   * @param {string} address 
   */
  getBalance(address?: string): Promise<number> {
    const addr = this.getImpliedAddress(address);
    return this.ain.db.ref(`accounts/${addr}/balance`).getValue();
  }

  /**
   * Sends a transfer transaction to the network.
   * @param input 
   */
  transfer(input: {to: string, value: number, from?: string, nonce?: number}): Promise<any> {
    const address = this.getImpliedAddress(input.from);
    const transferRef = this.ain.db.ref(`/transfer/${address}/${input.to}`).push() as Reference;
    return transferRef.setValue({
        ref: '/value', address, value: input.value, nonce: input.nonce });
  }

  /**
   * Signs a string data with the private key of the given address. It will use
   * the defaultAccount if an address is not provided.
   * @param {string} data
   * @param {string} address
   * @return {string} - signature
   */
  sign(data: string, address?: string): string {
    const addr = this.getImpliedAddress(address);
    return Ain.utils.ecSignMessage(data, Buffer.from(this.accounts[addr].private_key, 'hex'));
  }

  /**
   * Signs a transaction data with the private key of the given address. It will use
   * the defaultAccount if an address is not provided.
   * @param {TransactionBody} data
   * @param {string} address
   * @return {string} - signature
   */
  signTransaction(tx: TransactionBody, address?: string): string {
    const addr = this.getImpliedAddress(address);
    return Ain.utils.ecSignTransaction(tx, Buffer.from(this.accounts[addr].private_key, 'hex'));
  }

  /**
   * Recovers an address of the account that was used to create the signature.
   * @param {string} signature
   * @return {string} - address
   */
  recover(signature: string): string {
    const sigBuffer = Ain.utils.toBuffer(signature);
    const len = sigBuffer.length;
    const lenHash = len - 65;
    const hashedData = sigBuffer.slice(0, lenHash);
    const { r, s, v } = Ain.utils.ecSplitSig(sigBuffer.slice(lenHash, len));
    return Ain.utils.toChecksumAddress(
        Ain.utils.bufferToHex(Ain.utils.pubToAddress(
        Ain.utils.ecRecoverPub(hashedData, r, s, v).slice(1))));
  }

  /**
   * Verifies if the signature is valid and was signed by the address.
   * @param {any} data
   * @param {string} signature
   * @param {string} address
   * @return {boolean}
   */
  verifySignature(data: any, signature: string, address: string): boolean {
    return Ain.utils.ecVerifySig(data, signature, address);
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
  accountToV3Keystore(
      address: string,
      password: string,
      options: V3KeystoreOptions = {}
  ): V3Keystore {
    if (!this.accounts[address]) {
      throw new Error('[ain-js.wallet.accountToV3Keystore] No such address exists in the wallet');
    }
    const privateKey = Buffer.from(this.accounts[address].private_key, 'hex');
    return Ain.utils.privateToV3Keystore(privateKey, password, options);
  }

  /**
   * Imports an account from a private key.
   * @param {Buffer} privateKey
   * @return {Account}
   */
  static fromPrivateKey(privateKey: Buffer): Account {
    let publicKey = Ain.utils.privateToPublic(privateKey);
    return {
      address: Ain.utils.toChecksumAddress(Ain.utils.bufferToHex(Ain.utils.pubToAddress(publicKey))),
      private_key: privateKey.toString('hex'),
      public_key: publicKey.toString('hex')
    };
  }
}
