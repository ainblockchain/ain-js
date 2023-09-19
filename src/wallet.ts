import { Accounts, Account, TransactionBody, V3Keystore, V3KeystoreOptions } from './types';
import Ain from './ain';
import { validateMnemonic, mnemonicToSeedSync } from 'bip39';
import Reference from './ain-db/ref';
const AIN_HD_DERIVATION_PATH = "m/44'/412'/0'/0/"; /* default wallet address for AIN */

/**
 * A class for AI Network wallets.
 */
export default class Wallet {
  /** The default account. */
  public defaultAccount: Account | null;
  /** The list of accounts. */
  public accounts: Accounts;
  /** The number of accounts. */
  public _length: number;
  /** The Ain object. */
  public ain: Ain;
  /** The chain ID of the blockchain. */
  public chainId: number;

  /**
   * Creates a new Wallet object.
   * @param {Ain} ain The Ain object.
   * @param {number} chainId The chain ID.
   */
  constructor(ain: Ain, chainId: number) {
    this.defaultAccount = null;
    this.accounts = {};
    this._length = 0;
    this.ain = ain;
    this.chainId = chainId;
  }

  /**
   * Getter for the number of accounts in the wallet.
   */
  get length() {
    return this._length;
  }

  /**
   * Sets the chain ID.
   * @param {number} chainId
   */
  setChainId(chainId: number) {
    this.chainId = chainId;
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
   * Creates new accounts and adds them to the wallet.
   * @param {number} numberOfAccounts The number of accounts to create.
   * @return {Array<string>} The newly created accounts.
   */
  create(numberOfAccounts: number): Array<string> {
    if (numberOfAccounts <= 0) throw Error("numberOfAccounts should be greater than 0.");
    // TODO(liayoo): set maximum limit for numberOfAccounts?
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
   * @param {string} address The address to check.
   * @return {boolean}
   */
  isAdded(address: string): boolean {
    return !!(this.accounts[Ain.utils.toChecksumAddress(address)])
  }

  /**
   * Adds a new account from the given private key.
   * @param {string} privateKey The private key.
   * @return {string} The address of the newly added account.
   */
  add(privateKey: string): string {
    let newAccount = Wallet.fromPrivateKey(Buffer.from(privateKey, 'hex'));
    this.accounts[newAccount.address] = newAccount;
    this._length++;
    return newAccount.address;
  }

  /**
   * Adds a new account from the given private key and sets the new account as the default account.
   * @param {string} privateKey The private key.
   * @return {string} The address of the newly added account.
   */
  addAndSetDefaultAccount(privateKey: string): string {
    const address = this.add(privateKey);
    this.setDefaultAccount(address);
    return address;
  }

  /**
   * Adds an account from a seed phrase. Only the account at the given
   * index (default = 0) will be added.
   * @param {string} seedPhrase The seed phrase.
   * @param {number} index The index of the account.
   * @return {string} The address of the newly added account.
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
   * Adds an account from a v3 keystore.
   * @param {V3Keystore | string} v3Keystore The v3 keystore.
   * @param {string} [password] The password of the v3 keystore.
   * @return {string} The address of the newly added account.
   */
  addFromV3Keystore(v3Keystore: V3Keystore | string, password: string): string {
    const privateKey = Ain.utils.v3KeystoreToPrivate(v3Keystore, password);
    this.add(privateKey.toString('hex'));
    return Ain.utils.privateToAddress(privateKey);
  }

  /**
   * Removes an account from the wallet.
   * @param {string} address The address of the account to be removed.
   */
  remove(address: string) {
    let addressToRemove = Ain.utils.toChecksumAddress(address);
    const accountToRemove = this.accounts[addressToRemove];
    if (!accountToRemove) {
      throw new Error(`[ain-js.wallet.remove] Can't find account to remove`);
    }
    delete this.accounts[addressToRemove];
    this._length--;
    if (this.defaultAccount === accountToRemove) {
      this.removeDefaultAccount();
    }
  }

  /**
   * Sets the default account as {address}. The account should be already added
   * in the wallet.
   * @param {string} address The address of the account.
   */
  setDefaultAccount(address: string) {
    const checksummed = Ain.utils.toChecksumAddress(address);
    const account = this.accounts[checksummed];
    if (!account) {
      throw new Error('[ain-js.wallet.setDefaultAccount] Add the account first before setting it to defaultAccount.');
    }
    this.defaultAccount = account;
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
   * @param {string} address The address of the account.
   */
  getImpliedAddress(inputAddress?: string) {
    const address = inputAddress || (this.defaultAccount ? this.defaultAccount.address : null);
    if (!address) {
      throw Error('You need to specify the address or set defaultAccount.');
    }
    let checksummed = Ain.utils.toChecksumAddress(String(address));
    if (!this.accounts[checksummed]) {
      throw Error('The address you specified is not added in your wallet. Try adding it first.');
    }
    return checksummed;
  }

  /**
   * Fetches the AIN balance of the address.
   * @param {string} address The address of the account. It defaults to the default account of the wallet.
   * @returns {Promise<number>} The AIN balance of the account.
   */
  getBalance(address?: string): Promise<number> {
    const addr = address ? Ain.utils.toChecksumAddress(address)
        : this.getImpliedAddress(address);
    return this.ain.db.ref(`/accounts/${addr}/balance`).getValue();
  }

  /**
   * Sends a transfer transaction to the network.
   * @param {{to: string, value: number, from?: string, nonce?: number, gas_price?: number}} input The input parameters of the transaction.
   * @param {boolean} isDryrun The dryrun option.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  transfer(input: {to: string, value: number, from?: string, nonce?: number, gas_price?: number}, isDryrun: boolean = false): Promise<any> {
    const address = this.getImpliedAddress(input.from);
    const toAddress = Ain.utils.toChecksumAddress(input.to);
    const transferRef = this.ain.db.ref(`/transfer/${address}/${toAddress}`).push() as Reference;
    return transferRef.setValue({
        ref: '/value', address, value: input.value, nonce: input.nonce, gas_price: input.gas_price }, isDryrun);
  }

  /**
   * Signs a string data with the private key of the given address. It will use
   * the default account if an address is not provided.
   * @param {string} data The data to sign.
   * @param {string} address The address of the account. It defaults to the default account of the wallet.
   * @return {string} The signature.
   */
  sign(data: string, address?: string): string {
    const addr = this.getImpliedAddress(address);
    return Ain.utils.ecSignMessage(data, Buffer.from(this.accounts[addr].private_key, 'hex'), this.chainId);
  }

  /**
   * Signs a transaction body with the private key of the given address. It will use
   * the default account if an address is not provided.
   * @param {TransactionBody} txBody The transaction body.
   * @param {string} address The address of the account. It defaults to the adefault account of the wallet..
   * @return {string} The signature.
   */
  signTransaction(txBody: TransactionBody, address?: string): string {
    const addr = this.getImpliedAddress(address);
    return Ain.utils.ecSignTransaction(txBody, Buffer.from(this.accounts[addr].private_key, 'hex'), this.chainId);
  }

  /**
   * Gets the hash from the signature.
   * @param {string} signature The signature.
   * @returns {string} The hash of the signature.
   */
  getHashStrFromSig(signature: string): string {
    const sigBuffer = Ain.utils.toBuffer(signature);
    const len = sigBuffer.length;
    const lenHash = len - 65;
    const hashedData = sigBuffer.slice(0, lenHash);
    return '0x' + hashedData.toString('hex');
  }

  /**
   * Recovers an address of the account that was used to create the signature.
   * @param {string} signature The signature.
   * @return {string} The address recovered.
   */
  recover(signature: string): string {
    const sigBuffer = Ain.utils.toBuffer(signature);
    const len = sigBuffer.length;
    const lenHash = len - 65;
    const hashedData = sigBuffer.slice(0, lenHash);
    const { r, s, v } = Ain.utils.ecSplitSig(sigBuffer.slice(lenHash, len));
    return Ain.utils.toChecksumAddress(
        Ain.utils.bufferToHex(Ain.utils.pubToAddress(
        Ain.utils.ecRecoverPub(hashedData, r, s, v, this.chainId).slice(1))));
  }

  /**
   * Verifies if the signature is valid and was signed by the address.
   * @param {any} data The data used in the signing.
   * @param {string} signature The signature to verify.
   * @param {string} address The address to verify.
   * @return {boolean}
   */
  verifySignature(data: any, signature: string, address: string): boolean {
    return Ain.utils.ecVerifySig(data, signature, address, this.chainId);
  }

  /**
   * Saves the accounts in the wallet as v3 keystores, locking them with the password.
   * @param {string} password The password.
   * @param {V3KeystoreOptions} options The v3 keystore options.
   * @return {V3Keystore[]} The v3 keystores.
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
   * Converts an account into a v3 keystore and encrypts it with a password.
   * @param {string} address The address of the account.
   * @param {string} password The password.
   * @param {V3KeystoreOptions} options The v3 keystore options.
   * @return {V3Keystore} The v3 keystore.
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
   * @param {Buffer} privateKey The private key.
   * @return {Account} The account.
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
