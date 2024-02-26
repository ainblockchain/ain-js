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

/**
 * The main class of the ain-js SDK library.
 */
export default class Ain {
  /** The axios request config object.  */
  public axiosConfig: AxiosRequestConfig | undefined;
  /** The chain ID of the blockchain network. */
  public chainId: number;
  /** The network provider object. */
  public provider: Provider;
  /** The raw result mode option. */
  public rawResultMode: boolean;
  /** The database object. */
  public db: Database;
  /** The network object. */
  public net: Network;
  /** The wallet object. */
  public wallet: Wallet;
  /** The homorphic encryption object. */
  public he: HomomorphicEncryption;
  /** The event manager object. */
  public em: EventManager;
  /** The signer object. */
  public signer: Signer;

  /**
   * Creates a new Ain object.
   * @param {string} providerUrl The endpoint URL of the network provider.
   * @param {number} chainId The chain ID of the blockchain network.
   * @param {AinOptions} ainOptions The options of the class.
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
   * Sets a new provider.
   * @param {string} providerUrl The endpoint URL of the network provider.
   * @param {number} chainId The chain ID of the blockchain network.
   * @param {AxiosRequestConfig} axiosConfig The axios request config.
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
   * Sets a new signer.
   * @param {Signer} signer The signer to set.
   */
  setSigner(signer: Signer) {
    this.signer = signer;
  }

  /**
   * Fetches a block with a block hash or block number.
   * @param {string | number} blockHashOrBlockNumber The block hash or block number.
   * @param {boolean} returnTransactionObjects If it's true, returns a block with full transaction objects.
   * Otherwise, returns a block with only transaction hashes.
   * @returns {Promise<Block>}
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
   * Fetches the forger's address of a block with a block hash or block number.
   * @param {string | number} blockHashOrBlockNumber The block hash or block number.
   * @returns {Promise<string>}
   */
  getProposer(blockHashOrBlockNumber: string | number): Promise<string> {
    const byHash = typeof blockHashOrBlockNumber === 'string'
    const rpcMethod = byHash ? 'ain_getProposerByHash' : 'ain_getProposerByNumber';
    return this.provider.send(rpcMethod,
        {[byHash ? 'hash' : 'number']: blockHashOrBlockNumber});
  }

  /**
   * Fetches the validator list of a block with a block hash or block number.
   * @param {string | number} blockHashOrBlockNumber The block hash or block number.
   * @returns {Promise<string[]>}
   */
  getValidators(blockHashOrBlockNumber: string | number): Promise<string[]> {
    const byHash = typeof blockHashOrBlockNumber === 'string'
    const rpcMethod = byHash ? 'ain_getValidatorsByHash' : 'ain_getValidatorsByNumber';
    return this.provider.send(rpcMethod,
        {[byHash ? 'hash' : 'number']: blockHashOrBlockNumber});
  }

  /**
   * Fetches pending transaction.
   * @returns {Promise<any>}
   */
  getPendingTransactions(): Promise<any> {
    return this.provider.send('ain_getPendingTransactions', {});
  }

  /**
   * Fetches transaction pool size utilization.
   * @returns {Promise<any>}
   */
  getTransactionPoolSizeUtilization(): Promise<any> {
    return this.provider.send('ain_getTransactionPoolSizeUtilization', {});
  }

  /**
   * Fetches a transaction's information with a transaction hash.
   * @param {string} transactionHash The transaction hash.
   * @returns {Promise<TransactionInfo>}
   */
  getTransactionByHash(transactionHash: string): Promise<TransactionInfo> {
    return this.provider.send('ain_getTransactionByHash', { hash: transactionHash });
  }

  /**
   * Fetches a transaction's information with a block hash and an index.
   * @param {string} blockHash The block hash.
   * @param {number} index The transaction index in the block
   * @returns {Promise<TransactionInfo>}
   */
  getTransactionByBlockHashAndIndex(blockHash: string, index: Number): Promise<TransactionInfo> {
    return this.provider.send('ain_getTransactionByBlockHashAndIndex', { block_hash: blockHash, index });
  }
 
  /**
   * Fetches a transaction's information with a block hash and an index.
   * @param {string} blockNumber The block number.
   * @param {number} index The transaction index in the block
   * @returns {Promise<TransactionInfo>}
   */
  getTransactionByBlockNumberAndIndex(blockNumber: Number, index: Number): Promise<TransactionInfo> {
    return this.provider.send('ain_getTransactionByBlockNumberAndIndex', { block_number: blockNumber, index });
  }

  /**
   * Fetches a blockchain app's state usage information with an app name.
   * @param {string} appName The blockchain app name.
   * @returns {Promise<StateUsageInfo>}
   */
  getStateUsage(appName: string): Promise<StateUsageInfo> {
    return this.provider.send('ain_getStateUsage', { app_name: appName });
  }

  /**
   * Validates a blockchain app's name.
   * @param {string} appName The blockchain app name.
   * @returns {Promise<AppNameValidationInfo>}
   */
  validateAppName(appName: string): Promise<AppNameValidationInfo> {
    return this.provider.send('ain_validateAppName', { app_name: appName });
  }

  /**
   * Signs and sends a transaction to the network.
   * @param {TransactionInput} transactionObject The transaction input object. 
   * @param {boolean} isDryrun The dryrun option.
   * @returns {Promise<any>}
   */
  async sendTransaction(transactionObject: TransactionInput, isDryrun: boolean = false): Promise<any> {
    return this.signer.sendTransaction(transactionObject, isDryrun);
  }

  /**
   * Sends a signed transaction to the network.
   * @param {string} signature The signature of the transaction.
   * @param {TransactionBody} txBody The transaction body.
   * @param {boolean} isDryrun The dryrun option.
   * @returns {Promise<any>}
   */
  async sendSignedTransaction(signature: string, txBody: TransactionBody, isDryrun: boolean = false): Promise<any> {
    return this.signer.sendSignedTransaction(signature, txBody, isDryrun);
  }

  /**
   * Signs and sends multiple transactions in a batch to the network.
   * @param {TransactionInput[]} transactionObjects The list of the transaction input objects.
   * @returns {Promise<any>}
   */
  async sendTransactionBatch(transactionObjects: TransactionInput[]): Promise<any> {
    return this.signer.sendTransactionBatch(transactionObjects);
  }

  /**
   * Sends a transaction that deposits AIN for consensus staking.
   * @param {ValueOnlyTransactionInput} transactionObject The transaction input object.
   * @returns {Promise<any>}
   */
  depositConsensusStake(transactionObject: ValueOnlyTransactionInput): Promise<any> {
    return this.stakeFunction('/deposit/consensus', transactionObject);
  }

  /**
   * Sends a transaction that withdraws AIN for consensus staking.
   * @param {ValueOnlyTransactionInput} transactionObject The transaction input object.
   * @returns {Promise<any>}
   */
  withdrawConsensusStake(transactionObject: ValueOnlyTransactionInput): Promise<any> {
    return this.stakeFunction('/withdraw/consensus', transactionObject);
  }

  /**
   * Fetches the amount of AIN currently staked for participating in consensus protocol.
   * @param {string} account The account to fetch the value with. If not specified,
   * the default account of the signer is used.
   * @returns {Promise<number>}
   */
  getConsensusStakeAmount(account?: string): Promise<number> {
    const address = account ? Ain.utils.toChecksumAddress(account)
        : this.signer.getAddress(account);
    return this.db.ref(`/deposit_accounts/consensus/${address}`).getValue();
  }

  /**
   * Getter for ain-util library.
   */
  static get utils() {
    return AinUtil;
  }

  /**
   * Checks whether an object is an instance of TransactionBody interface.
   * @param {any} object The object to check.
   * @returns {boolean}
   */
  static instanceofTransactionBody(object: any): object is TransactionBody {
    return object.nonce !== undefined && object.timestamp !== undefined &&
        object.operation !== undefined;
  }

  /**
   * A base function for all staking related database changes. It builds a
   * deposit/withdraw transaction and sends the transaction by calling sendTransaction().
   * @param {string} path The path to set a value with.
   * @param {ValueOnlyTransactionInput} transactionObject The transaction input object.
   * @param {boolean} isDryrun The dryrun option.
   * @returns {Promise<any>}
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
