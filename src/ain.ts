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

  constructor(providerUrl: string) {
    this.provider = new Provider(providerUrl);
    this.net = new Network(this.provider);
    this.wallet = new Wallet();
    this.db = new Database(this, this.provider);
    this.utils = Utils;
  }

  setProvider(providerUrl: string) {
    this.provider = new Provider(providerUrl);
    this.db = new Database(this, this.provider);
    this.net = new Network(this.provider);
  }

  getBlock(blockHashOrBlockNumber: string | number, returnTransactionObjects?: boolean): Promise<Block> {
    return new Promise((resolve, reject) => {
      if (returnTransactionObjects) {
        resolve(test_blockWithTx(blockHashOrBlockNumber));
      } else {
        resolve(test_block(blockHashOrBlockNumber));
      }
    });
  }

  getForger(blockHashOrBlockNumber: string | number): Promise<string> {
    return new Promise((resolve, reject) => {
      resolve("0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6");
    });
  }

  getValidators(blockHashOrBlockNumber: string | number): Promise<string[]> {
    return new Promise((resolve, reject) => {
      let validators: string[] = [];
      for (let i = 0; i < 11; i++) {
        validators.push("0x11F26Fc7b19cB04eeAD03F3d32aeDf5A6e726dA6");
      }
      resolve(validators);
    });
  }

  getTransaction(transactionHash: string): Promise<Transaction> {
    return new Promise((resolve, reject) => {
      resolve(test_transaction(transactionHash));
    });
  }

  getTransactionResult(transactionHash: string): Promise<TransactionResult> {
    return new Promise((resolve, reject) => {
      resolve(test_transactionResult(transactionHash));
    });
  }

  sendTransaction(transactionObject: TransactionInput): PromiEvent<any> {
    const method = new AbstractPromiEventMethod('ain_sendSignedTransaction', this, transactionObject);
    return method.execute();
  }

  sendSignedTransaction(signature: string, transaction: TransactionBody): PromiEvent<any> {
    const method = new AbstractPromiEventMethod('ain_sendSignedTransaction', this, transaction, signature);
    return method.execute();
  }

  depositBandwidthStake(transactionObject: ValueOnlyTransactionInput): PromiEvent<any> {
    return this.sendStakeRelatedFunctions('deposit/bandwidth', transactionObject);
  }

  withdrawBandwidthStake(transactionObject: ValueOnlyTransactionInput): PromiEvent<any> {
    return this.sendStakeRelatedFunctions('withdraw/bandwidth', transactionObject);
  }

  depositConsensusStake(transactionObject: ValueOnlyTransactionInput): PromiEvent<any> {
    return this.sendStakeRelatedFunctions('deposit/consensus', transactionObject);
  }

  withdrawConsensusStake(transactionObject: ValueOnlyTransactionInput): PromiEvent<any> {
    return this.sendStakeRelatedFunctions('withdraw/consensus', transactionObject);
  }

  getBandwidthStakeAmount(account?: string): Promise<number> {
    return new Promise((resolve, reject) => {
      request('getBandwidthStakeAmount/').then(res => {
        resolve(Number(res));
      });
    });
  }

  getConsensusStakeAmount(account?: string): Promise<number> {
    return new Promise((resolve, reject) => {
      request('getConsensusStakeAmount/').then(res => {
        resolve(Number(res));
      });
    });
  }

  getTransactionCount(account?: string): Promise<number> {
    return new Promise((resolve, reject) => {
      request('getTransactionCount/').then((res) => {
        resolve(Number(res));
      });
    });
  }

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

  static get ainUtil() {
    return AinUtil;
  }

  static instanceofTransactionBody(object: any): object is TransactionBody {
    return object.nonce !== undefined && object.timestamp !== undefined &&
        object.operation !== undefined;
  }

  private sendStakeRelatedFunctions(path: string, transactionObject: ValueOnlyTransactionInput): PromiEvent<any> {
    const type: SetOperationType = "SET_VALUE";
    if (!transactionObject.value) {
      throw new Error('[ain-js.sendStakeRelatedFunctions] a value should be specified.');
    }
    if (typeof transactionObject.value !== 'number') {
      throw new Error('[ain-js.sendStakeRelatedFunctions] value has to be a number.');
    }
    if (!transactionObject.address) {
      if (!this.wallet.defaultAccount) {
        throw new Error('[ain-js.sendStakeRelatedFunctions] Address not specified and defaultAccount not set.');
      }
      transactionObject.address = String(this.wallet.defaultAccount);
    } else if (!this.wallet.isAdded(transactionObject.address)) {
      throw new Error('[ain-js.sendStakeRelatedFunctions] Account not added.')
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
      throw new Error('[ain-js.sendStakeRelatedFunctions] Error in Reference push.');
    }
  }
}
