import { Accounts, Account, TransactionBody, V3Keystore, V3KeystoreOptions, KdfParams } from './types';
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
    return this.accounts[checksummed].public_key;
  }

  /**
   * Creates {numberOfAccounts} new accounts and add them to the wallet.
   * @param {number} numberOfAccounts
   */
  create(numberOfAccounts: number) {
    if (numberOfAccounts <= 0) throw Error("numberOfAccounts should be greater than 0.");
    // TODO (lia): set maximum limit for numberOfAccounts?
    for (let i = 0; i < numberOfAccounts; i++) {
      let account = Ain.ainUtil.createAccount();
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
    const privateKey = Ain.ainUtil.v3KeystoreToPrivate(v3Keystore, password);
    this.add(privateKey.toString('hex'));
    return Ain.ainUtil.privateToAddress(privateKey);
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
  accountToV3Keystore(
      address: string,
      password: string,
      options: V3KeystoreOptions = {}
  ): V3Keystore {
    if (!this.accounts[address]) {
      throw new Error('[ain-js.wallet.accountToV3Keystore] No such address exists in the wallet');
    }
    const privateKey = Buffer.from(this.accounts[address].private_key, 'hex');
    return Ain.ainUtil.privateToV3Keystore(privateKey, password, options);
  }

  /**
   * Imports an account from a private key.
   * @param {Buffer} privateKey
   * @return {Account}
   */
  static fromPrivateKey(privateKey: Buffer): Account {
    let publicKey = Ain.ainUtil.privateToPublic(privateKey);
    return {
      address: Ain.ainUtil.toChecksumAddress(Ain.ainUtil.bufferToHex(Ain.ainUtil.pubToAddress(publicKey))),
      private_key: privateKey.toString('hex'),
      public_key: publicKey.toString('hex')
    };
  }
}
