import * as AinUtil from "@ainblockchain/ain-util";
import { AxiosRequestConfig } from 'axios';

import {
  AinOptions, Block, TransactionInfo, TransactionBody, TransactionResult, SetOperationType,
  SetOperation, TransactionInput, ValueOnlyTransactionInput, StateUsageInfo, AppNameValidationInfo,
} from './types';
import Provider from './provider';
import Database from './ain-db/db';
import Reference from './ain-db/ref';
import Wallet from './wallet';
import Network from './net';
import EventManager from './event-manager';
import HomomorphicEncryption from './he';
import { Signer } from "./signer/signer";
import { DefaultSigner } from './signer/default-signer';

export default class Ain {
  public axiosConfig: AxiosRequestConfig | undefined;
  public chainId: number;
  public provider: Provider;
  public rawResultMode: boolean;
  public db: Database;
  public net: Network;
  public wallet: Wallet;
  public he: HomomorphicEncryption;
  public em: EventManager;
  public signer: Signer;

  /**
   * @param {string} providerUrl
   * @constructor
   */
  constructor(providerUrl: string, chainId?: number, ainOptions?: AinOptions) {
    this.axiosConfig = ainOptions?.axiosConfig;
    this.provider = new Provider(this, providerUrl, this.axiosConfig);
    this.chainId = chainId || 0;
    this.rawResultMode = ainOptions?.rawResultMode || false;
    this.net = new Network(this.provider);
    this.wallet = new Wallet(this, this.chainId);
    this.db = new Database(this, this.provider);
    this.he = new HomomorphicEncryption();
    this.em = new EventManager(this);
    this.signer = new DefaultSigner(this.wallet, this.provider);
  }

  /**
   * Sets a new provider
   * @param {string} providerUrl
   */
  setProvider(providerUrl: string, chainId?: number, axiosConfig?: AxiosRequestConfig | undefined) {
    if (axiosConfig) {
      this.axiosConfig = axiosConfig;
    }
    this.provider = new Provider(this, providerUrl, this.axiosConfig);
    this.chainId = chainId || 0;
    this.db = new Database(this, this.provider);
    this.net = new Network(this.provider);
    this.wallet.setChainId(this.chainId);
  }

  /**
   * Sets a new signer
   * @param {Signer} signer
   */
  setSigner(signer: Signer) {
    this.signer = signer;
  }

  /**
   * A promise returns a block with the given hash or block number.
   * @param {string | number} blockHashOrBlockNumber
   * @param {boolean} returnTransactionObjects - If true, returns the full transaction objects;
   * otherwise, returns only the transaction hashes
   * @return {Promise<Block>}
   */
  getBlock(blockHashOrBlockNumber: string | number, returnTransactionObjects?: boolean): Promise<Block> {
    const byHash = typeof blockHashOrBlockNumber === 'string'
    const rpcMethod = byHash ? 'ain_getBlockByHash' : 'ain_getBlockByNumber';
    const data = Object.assign({},
        { getFullTransactions: !!returnTransactionObjects,
          [byHash ? 'hash' : 'number']: blockHashOrBlockNumber });
    return this.provider.send(rpcMethod, data);
  }

  /**
   * A promise returns the address of the forger of given block
   * @param {string | number} blockHashOrBlockNumber
   * @return {Promise<string>}
   */
  getProposer(blockHashOrBlockNumber: string | number): Promise<string> {
    const byHash = typeof blockHashOrBlockNumber === 'string'
    const rpcMethod = byHash ? 'ain_getProposerByHash' : 'ain_getProposerByNumber';
    return this.provider.send(rpcMethod,
        {[byHash ? 'hash' : 'number']: blockHashOrBlockNumber});
  }

  /**
   * A promise returns the list of validators for a given block
   * @param {string | number} blockHashOrBlockNumber
   * @return {Promise<string[]>}
   */
  getValidators(blockHashOrBlockNumber: string | number): Promise<string[]> {
    const byHash = typeof blockHashOrBlockNumber === 'string'
    const rpcMethod = byHash ? 'ain_getValidatorsByHash' : 'ain_getValidatorsByNumber';
    return this.provider.send(rpcMethod,
        {[byHash ? 'hash' : 'number']: blockHashOrBlockNumber});
  }

  /**
   * Returns the transaction with the given transaction hash.
   * @param {string} transactionHash
   * @return {Promise<TransactionInfo>}
   */
  getTransaction(transactionHash: string): Promise<TransactionInfo> {
    return this.provider.send('ain_getTransactionByHash', { hash: transactionHash });
  }

  /**
   * Returns the state usage information with the given app name.
   * @param {string} appName
   * @return {Promise<StateUsageInfo>}
   */
  getStateUsage(appName: string): Promise<StateUsageInfo> {
    return this.provider.send('ain_getStateUsage', { app_name: appName });
  }

  /**
   * Returns the result of the transaction with the given transaaction hash.
   * @param {string} transactionHash
   * @return {Promise<Transaction>}
   */
  // TODO(liayoo): implement this function.
  // getTransactionResult(transactionHash: string): Promise<TransactionResult> {}

  /**
   * Validate the given app name.
   * @param {string} appName
   * @return {Promise<AppNameValidationInfo>}
   */
  validateAppName(appName: string): Promise<AppNameValidationInfo> {
    return this.provider.send('ain_validateAppName', { app_name: appName });
  }

  /**
   * Signs and sends a transaction to the network
   * @param {TransactionInput} transactionObject
   * @param {boolean} isDryrun - dryrun option.
   * @return {Promise<any>}
   */
  async sendTransaction(transactionObject: TransactionInput, isDryrun: boolean = false): Promise<any> {
    return this.signer.sendTransaction(transactionObject, isDryrun);
  }

  /**
   * Sends a signed transaction to the network
   * @param {string} signature
   * @param {TransactionBody} txBody
   * @param {boolean} isDryrun - dryrun option.
   * @return {Promise<any>}
   */
  async sendSignedTransaction(signature: string, txBody: TransactionBody, isDryrun: boolean = false): Promise<any> {
    return this.signer.sendSignedTransaction(signature, txBody, isDryrun);
  }

  /**
   * Sends signed transactions to the network.
   * @param {TransactionInput[]} transactionObjects
   */
  async sendTransactionBatch(transactionObjects: TransactionInput[]): Promise<any> {
    return this.signer.sendTransactionBatch(transactionObjects);
  }

  /**
   * Sends a transaction that deposits AIN for consensus staking.
   * @param {ValueOnlyTransactionInput} transactionObject
   * @return {Promise<any>}
   */
  depositConsensusStake(transactionObject: ValueOnlyTransactionInput): Promise<any> {
    return this.stakeFunction('/deposit/consensus', transactionObject);
  }

  /**
   * Sends a transaction that withdraws AIN for consensus staking.
   * @param {ValueOnlyTransactionInput} transactionObject
   * @return {Promise<any>}
   */
  withdrawConsensusStake(transactionObject: ValueOnlyTransactionInput): Promise<any> {
    return this.stakeFunction('/withdraw/consensus', transactionObject);
  }

  /**
   * Gets the amount of AIN currently staked for participating in consensus protocol.
   * @param {string} account - If not specified, will try to use the defaultAccount value.
   * @return {Promise<number>}
   */
  getConsensusStakeAmount(account?: string): Promise<number> {
    const address = account ? Ain.utils.toChecksumAddress(account)
        : this.signer.getAddress(account);
    return this.db.ref(`/deposit_accounts/consensus/${address}`).getValue();
  }

  /**
   * Getter for ain-util library
   */
  static get utils() {
    return AinUtil;
  }

  /**
   * Checks whether a given object is an instance of TransactionBody interface.
   * @param {string} account
   * @return {boolean}
   */
  static instanceofTransactionBody(object: any): object is TransactionBody {
    return object.nonce !== undefined && object.timestamp !== undefined &&
        object.operation !== undefined;
  }

  /**
   * A base function for all staking related database changes. It builds a
   * deposit/withdraw transaction and sends the transaction by calling sendTransaction().
   * @param {string} path
   * @param {ValueOnlyTransactionInput} transactionObject
   * @param {boolean} isDryrun - dryrun option.
   * @return {Promise<any>}
   */
  private stakeFunction(path: string, transactionObject: ValueOnlyTransactionInput, isDryrun: boolean = false): Promise<any> {
    const type: SetOperationType = "SET_VALUE";
    if (!transactionObject.value) {
      throw new Error('[ain-js.stakeFunction] a value should be specified.');
    }
    if (typeof transactionObject.value !== 'number') {
      throw new Error('[ain-js.stakeFunction] value has to be a number.');
    }
    transactionObject.address = this.signer.getAddress(transactionObject.address);
    const ref = this.db.ref(`${path}/${transactionObject.address}`).push()
    if (ref instanceof Reference) {
      const operation: SetOperation = {
        ref: `${path}/${transactionObject.address}/${ref.key}/value`,
        value: transactionObject.value,
        type
      }
      delete transactionObject.value;
      const txInput = Object.assign({ operation }, { transactionObject });
      return this.sendTransaction(txInput, isDryrun);
    } else {
      throw new Error('[ain-js.stakeFunction] Error in Reference push.');
    }
  }
}
