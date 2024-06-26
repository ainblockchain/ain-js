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
  /** The endpoint Url of the event handler websocket server. */
  public eventHandlerUrl?: string | null;
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
   * @param {string | null} eventHandlerUrl The endpoint URL of the event handler websocket server.
   * @param {number} chainId The chain ID of the blockchain network.
   * @param {AinOptions} ainOptions The options of the class.
   */
  constructor(providerUrl: string, eventHandlerUrl?: string | null, chainId?: number, ainOptions?: AinOptions) {
    this.axiosConfig = ainOptions?.axiosConfig;
    this.provider = new Provider(this, providerUrl, this.axiosConfig);
    this.eventHandlerUrl = eventHandlerUrl;
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
   * @param {string} providerUrl The endpoint URL of the network provider. e.g. http://localhost:8081, https://testnet-api.ainetwork.ai
   * @param {string | null} eventHandlerUrl The endpoint URL of the event handler websocket server. e.g.  ws://localhost:5100, wss://testnet-event.ainetwork.ai
   * @param {number} chainId The chain ID of the blockchain network. e.g. 0 for local or testnet, and 1 for mainnet
   * @param {AxiosRequestConfig} axiosConfig The axios request config.
   */
  setProvider(providerUrl: string, eventHandlerUrl?: string | null, chainId?: number, axiosConfig?: AxiosRequestConfig | undefined) {
    if (axiosConfig) {
      this.axiosConfig = axiosConfig;
    }
    this.provider = new Provider(this, providerUrl, this.axiosConfig);
    this.eventHandlerUrl = eventHandlerUrl;
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
   * Fetches the last block.
   * @returns {Promise<Block>}
   */
  getLastBlock(): Promise<Block> {
    return this.provider.send('ain_getLastBlock', {});
  }

  /**
   * Fetches the last block number.
   * @returns {Promise<Number>}
   */
  getLastBlockNumber(): Promise<Block> {
    return this.provider.send('ain_getLastBlockNumber', {});
  }

  /**
   * Fetches a block with a block number.
   * @param {number} blockNumber The block number.
   * @param {boolean} returnTransactionObjects If it's true, returns a block with full transaction objects.
   * Otherwise, returns a block with only transaction hashes.
   * @returns {Promise<Block>}
   */
  getBlockByNumber(blockNumber: number, returnTransactionObjects?: boolean): Promise<Block> {
    const data =
        Object.assign({}, { getFullTransactions: !!returnTransactionObjects, number: blockNumber });
    return this.provider.send('ain_getBlockByNumber', data);
  }

  /**
   * Fetches a block with a block hash.
   * @param {string} blockHash The block hash.
   * @param {boolean} returnTransactionObjects If it's true, returns a block with full transaction objects.
   * Otherwise, returns a block with only transaction hashes.
   * @returns {Promise<Block>}
   */
  getBlockByHash(blockHash: string, returnTransactionObjects?: boolean): Promise<Block> {
    const data =
        Object.assign({}, { getFullTransactions: !!returnTransactionObjects, hash: blockHash });
    return this.provider.send('ain_getBlockByHash', data);
  }

  /**
   * Fetches blocks with a block number range.
   * @param {number} from The begining block number (inclusive).
   * @param {number} to The ending block number (exclusive).
   * @returns {Promise<Array<Block>>}
   */
  getBlockList(from: number, to: number): Promise<Array<Block>> {
    return this.provider.send('ain_getBlockList', { from, to });
  }

  /**
   * Fetches block headers with a block number range.
   * @param {number} from The begining block number (inclusive).
   * @param {number} to The ending block number (exclusive).
   * @returns {Promise<Array<Block>>}
   */
  getBlockHeadersList(from: number, to: number): Promise<Array<Block>> {
    return this.provider.send('ain_getBlockHeadersList', { from, to });
  }

  /**
   * Fetches block transaction count with a block number.
   * @param {number} number The block number.
   * @returns {Promise<Number>}
   */
  getBlockTransactionCountByNumber(number: number): Promise<Number> {
    return this.provider.send('ain_getBlockTransactionCountByNumber', { number });
  }

  /**
   * Fetches block transaction count with a block hash.
   * @param {string} hash The block hash.
   * @returns {Promise<Number>}
   */
  getBlockTransactionCountByHash(hash: string): Promise<Number> {
    return this.provider.send('ain_getBlockTransactionCountByHash', { hash });
  }

  /**
   * Fetches the information of the given validator address.
   * @param {string} address The validator address.
   * @returns {Promise<any>}
   */
  getValidatorInfo(address: string): Promise<any> {
    return this.provider.send('ain_getValidatorInfo', { address });
  }

  /**
   * Fetches the validator list of a block with a block number.
   * @param {number} blockNumber The block number.
   * @returns {Promise<any>}
   */
  getValidatorsByNumber(blockNumber: number): Promise<any> {
    return this.provider.send('ain_getValidatorsByNumber', { number: blockNumber });
  }

  /**
   * Fetches the validator list of a block with a block hash.
   * @param {string} blockHash The block hash.
   * @returns {Promise<any>}
   */
  getValidatorsByHash(blockHash: string): Promise<any> {
    return this.provider.send('ain_getValidatorsByHash', { hash: blockHash });
  }

  /**
   * Fetches the block proproser's address of a block with a block number.
   * @param {number} blockNumber The block number.
   * @returns {Promise<string>}
   */
  getProposerByNumber(blockNumber: number): Promise<string> {
    return this.provider.send('ain_getProposerByNumber', { number: blockNumber });
  }

  /**
   * Fetches the block proproser's address of a block with a block hash.
   * @param {string} blockHash The block hash.
   * @returns {Promise<string>}
   */
  getProposerByHash(blockHash: string): Promise<string> {
    return this.provider.send('ain_getProposerByHash', { hash: blockHash });
  }

  /**
   * Fetches pending transactions.
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
  getTransactionByBlockHashAndIndex(blockHash: string, index: number): Promise<TransactionInfo> {
    return this.provider.send('ain_getTransactionByBlockHashAndIndex', { block_hash: blockHash, index });
  }
 
  /**
   * Fetches a transaction's information with a block hash and an index.
   * @param {string} blockNumber The block number.
   * @param {number} index The transaction index in the block
   * @returns {Promise<TransactionInfo>}
   */
  getTransactionByBlockNumberAndIndex(blockNumber: number, index: number): Promise<TransactionInfo> {
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
