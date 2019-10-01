import * as EventEmitter from 'eventemitter3'
import * as AinUtil from "@ainblockchain/ain-util";
import request from './request';
import { Block, Transaction, TransactionBody, TransactionResult, SetOperationType,
    SetOperation, TransactionInput, ValueOnlyTransactionInput } from './types';
import Provider from './provider';
import * as Utils from './utils';
import Database from './ain-db/db';
import Reference from './ain-db/ref';
import Wallet from './wallet';
import Network from './net';
import { PromiEvent } from './promi-event';
import AbstractPromiEventMethod from './methods/abstract-promievent-method';
import { test_block, test_blockWithTx, test_transaction, test_transactionResult } from './dummy-values';

export default class Ain {
  public provider: Provider;
  public db: Database;
  public net: Network;
  public wallet: Wallet;
  public utils: any;

  /**
   * @param {string} providerUrl
   * @constructor
   */
  constructor(providerUrl: string) {
    this.provider = new Provider(providerUrl);
    this.net = new Network(this.provider);
    this.wallet = new Wallet();
    this.db = new Database(this, this.provider);
    this.utils = Utils;
  }

  /**
   * Sets a new provider
   * @param {string} providerUrl
   */
  setProvider(providerUrl: string) {
    this.provider = new Provider(providerUrl);
    this.db = new Database(this, this.provider);
    this.net = new Network(this.provider);
  }

  /**
   * A promise returns a block with the given hash or block number.
   * @param {string | number} blockHashOrBlockNumber
   * @param {boolean} returnTransactionObjects - If true, returns the full transaction objects;
   * otherwise, returns only the transaction hashes
   * @return {Promise<Block>}
   */
  getBlock(blockHashOrBlockNumber: string | number, returnTransactionObjects?: boolean): Promise<Block> {
    return new Promise((resolve, reject) => {
      if (returnTransactionObjects) {
        resolve(test_blockWithTx(blockHashOrBlockNumber));
      } else {
        resolve(test_block(blockHashOrBlockNumber));
      }
    });
  }

  /**
   * A promise returns the address of the forger of given block
   * @param {string | number} blockHashOrBlockNumber
   * @return {Promise<string>}
   */
  getForger(blockHashOrBlockNumber: string | number): Promise<string> {
    return new Promise((resolve, reject) => {
      resolve("0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6");
    });
  }

  /**
   * A promise returns the list of validators for a given block
   * @param {string | number} blockHashOrBlockNumber
   * @return {Promise<string[]>}
   */
  getValidators(blockHashOrBlockNumber: string | number): Promise<string[]> {
    return new Promise((resolve, reject) => {
      let validators: string[] = [];
      for (let i = 0; i < 11; i++) {
        validators.push("0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6");
      }
      resolve(validators);
    });
  }

  /**
   * Returns the transaction with the given transaaction hash.
   * @param {string} transactionHash
   * @return {Promise<Transaction>}
   */
  getTransaction(transactionHash: string): Promise<Transaction> {
    return new Promise((resolve, reject) => {
      resolve(test_transaction(transactionHash));
    });
  }

  /**
   * Returns the result of the transaction with the given transaaction hash.
   * @param {string} transactionHash
   * @return {Promise<Transaction>}
   */
  getTransactionResult(transactionHash: string): Promise<TransactionResult> {
    return new Promise((resolve, reject) => {
      resolve(test_transactionResult(transactionHash));
    });
  }

  /**
   * Signs and sends a transaction to the network
   * @param {TransactionInput} transactionObject
   * @return {PromiEvent<any>}
   */
  sendTransaction(transactionObject: TransactionInput): PromiEvent<any> {
    const method = new AbstractPromiEventMethod('ain_sendSignedTransaction', this, transactionObject);
    return method.execute();
  }

  /**
   * Sends a signed transaction to the network
   * @param {string} signature
   * @param {TransactionBody} transaction
   * @return {PromiEvent<any>}
   */
  sendSignedTransaction(signature: string, transaction: TransactionBody): PromiEvent<any> {
    const method = new AbstractPromiEventMethod('ain_sendSignedTransaction', this, transaction, signature);
    return method.execute();
  }

  /**
   * Sends a transaction that deposits AIN for bandwidth staking.
   * @param {ValueOnlyTransactionInput} transactionObject
   * @return {PromiEvent<any>}
   */
  depositBandwidthStake(transactionObject: ValueOnlyTransactionInput): PromiEvent<any> {
    return this.abstractStakeFunction('deposit/bandwidth', transactionObject);
  }

  /**
   * Sends a transaction that withdraws AIN from bandwidth staking.
   * @param {ValueOnlyTransactionInput} transactionObject
   * @return {PromiEvent<any>}
   */
  withdrawBandwidthStake(transactionObject: ValueOnlyTransactionInput): PromiEvent<any> {
    return this.abstractStakeFunction('withdraw/bandwidth', transactionObject);
  }

  /**
   * Sends a transaction that deposits AIN for consensus staking.
   * @param {ValueOnlyTransactionInput} transactionObject
   * @return {PromiEvent<any>}
   */
  depositConsensusStake(transactionObject: ValueOnlyTransactionInput): PromiEvent<any> {
    return this.abstractStakeFunction('deposit/consensus', transactionObject);
  }

  /**
   * Sends a transaction that withdraws AIN for consensus staking.
   * @param {ValueOnlyTransactionInput} transactionObject
   * @return {PromiEvent<any>}
   */
  withdrawConsensusStake(transactionObject: ValueOnlyTransactionInput): PromiEvent<any> {
    return this.abstractStakeFunction('withdraw/consensus', transactionObject);
  }

  /**
   * Gets the amount of AIN currently staked for bandwidth
   * @param {string} account
   * @return {Promise<number>}
   */
  getBandwidthStakeAmount(account?: string): Promise<number> {
    return new Promise((resolve, reject) => {
      request('getBandwidthStakeAmount/').then(res => {
        resolve(Number(res));
      });
    });
  }

  /**
   * Gets the amount of AIN currently staked for participating in consensus protocol.
   * @param {string} account
   * @return {Promise<number>}
   */
  getConsensusStakeAmount(account?: string): Promise<number> {
    return new Promise((resolve, reject) => {
      request('getConsensusStakeAmount/').then(res => {
        resolve(Number(res));
      });
    });
  }

  /**
   * Gets the current transaction count of account, which is the nonce of the account.
   * @param {string} account
   * @return {Promise<number>}
   */
  getTransactionCount(account?: string): Promise<number> {
    return new Promise((resolve, reject) => {
      request('getTransactionCount/').then((res) => {
        resolve(Number(res));
      });
    });
  }

  /**
   * Builds a transaction body from transaction input.
   * @param {TransactionInput} transactionInput
   * @return {Promise<TransactionBody>}
   */
  buildTransactionBody(transactionInput: TransactionInput): Promise<TransactionBody> {
    return new Promise(async (resolve, reject) => {
      let addr = transactionInput.address
      if (!addr) {
        if (!this.wallet.defaultAccount) {
          throw new Error('[ain-js.formatTransaction] Address not specified and defaultAccount not set.');
        }
        addr = String(this.wallet.defaultAccount);
      } else if (!this.wallet.isAdded(addr)) {
        throw new Error('[ain-js.formatTransaction] Account not added.')
      }
      let tx = {
        operation: transactionInput.operation,
        parent_tx_hash: transactionInput.parent_tx_hash
      }
      let nonce = -1;
      if (transactionInput.isNonced) {
        if (transactionInput.nonce) {
          nonce = transactionInput.nonce;
        } else {
          nonce = await this.getTransactionCount(addr);
        }
      }
      resolve(Object.assign(tx, { nonce, timestamp: Date.now() }));
    });
  }

  /**
   * Getter for ain-util library
   */
  static get ainUtil() {
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
   * An abstract function for all staking related database changes. It builds a
   * deposit/withdraw transaction and sends the transaction by calling sendTransaction().
   * @param {string} path
   * @param {ValueOnlyTransactionInput} transactionObject
   * @return {PromiEvent<any>}
   */
  private abstractStakeFunction(path: string, transactionObject: ValueOnlyTransactionInput): PromiEvent<any> {
    const type: SetOperationType = "SET_VALUE";
    if (!transactionObject.value) {
      throw new Error('[ain-js.abstractStakeFunction] a value should be specified.');
    }
    if (typeof transactionObject.value !== 'number') {
      throw new Error('[ain-js.abstractStakeFunction] value has to be a number.');
    }
    if (!transactionObject.address) {
      if (!this.wallet.defaultAccount) {
        throw new Error('[ain-js.abstractStakeFunction] Address not specified and defaultAccount not set.');
      }
      transactionObject.address = String(this.wallet.defaultAccount);
    } else if (!this.wallet.isAdded(transactionObject.address)) {
      throw new Error('[ain-js.abstractStakeFunction] Account not added.')
    }
    const ref = this.db.ref(`${path}/${transactionObject.address}`).push()
    if (ref instanceof Reference) {
      const operation: SetOperation = {
        ref: `${path}/${transactionObject.address}/${ref.key}`,
        value: transactionObject.value,
        type
      }
      delete transactionObject.value;
      const txInput = Object.assign({ operation }, { transactionObject });
      return this.sendTransaction(txInput);
    } else {
      throw new Error('[ain-js.abstractStakeFunction] Error in Reference push.');
    }
  }
}
