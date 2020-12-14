import * as EventEmitter from 'eventemitter3'
import * as AinUtil from "@ainblockchain/ain-util";
import request from './request';
import { Block, TransactionInfo, TransactionBody, TransactionResult, SetOperationType,
    SetOperation, TransactionInput, ValueOnlyTransactionInput } from './types';
import Provider from './provider';
import Database from './ain-db/db';
import Reference from './ain-db/ref';
import Wallet from './wallet';
import Network from './net';

export default class Ain {
  public provider: Provider;
  public db: Database;
  public net: Network;
  public wallet: Wallet;

  /**
   * @param {string} providerUrl
   * @constructor
   */
  constructor(providerUrl: string) {
    this.provider = new Provider(this, providerUrl);
    this.net = new Network(this.provider);
    this.wallet = new Wallet(this);
    this.db = new Database(this, this.provider);
  }

  /**
   * Sets a new provider
   * @param {string} providerUrl
   */
  setProvider(providerUrl: string) {
    this.provider = new Provider(this, providerUrl);
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
   * Returns the transaction with the given transaaction hash.
   * @param {string} transactionHash
   * @return {Promise<TransactionInfo>}
   */
  getTransaction(transactionHash: string): Promise<TransactionInfo> {
    return this.provider.send('ain_getTransactionByHash', { hash: transactionHash });
  }

  /**
   * Returns the result of the transaction with the given transaaction hash.
   * @param {string} transactionHash
   * @return {Promise<Transaction>}
   */
  // TODO (lia): implement this function
  // getTransactionResult(transactionHash: string): Promise<TransactionResult> {}

  /**
   * Signs and sends a transaction to the network
   * @param {TransactionInput} transactionObject
   * @return {Promise<any>}
   */
  async sendTransaction(transactionObject: TransactionInput): Promise<any> {
    const txBody = await this.buildTransactionBody(transactionObject);
    const signature = this.wallet.signTransaction(txBody, transactionObject.address);
    const txHash = this.wallet.getHashStrFromSig(signature);
    let result = await this.provider.send('ain_sendSignedTransaction',
        { signature, tx_body: txBody });
    if (!result || typeof result !== 'object') {
      result = { result };
    }
    return Object.assign(result, { txHash });
  }

  /**
   * Sends a signed transaction to the network
   * @param {string} signature
   * @param {TransactionBody} txBody
   * @return {Promise<any>}
   */
  async sendSignedTransaction(signature: string, txBody: TransactionBody): Promise<any> {
    const txHash = this.wallet.getHashStrFromSig(signature);
    let result = await this.provider.send('ain_sendSignedTransaction',
        { signature, tx_body: txBody });
    if (!result || typeof result !== 'object') {
      result = { result };
    }
    return Object.assign(result, { txHash });
  }

  async sendTransactionBatch(transactionObjects: TransactionInput[]): Promise<any> {
    let promises: Promise<any>[] = [];
    for (let tx of transactionObjects) {
      promises.push(this.buildTransactionBody(tx).then(txBody => {
        if (tx.nonce === undefined) {
          // Batch transactions' nonces should be specified.
          // If they're not, they default to un-nonced (nonce = -1).
          txBody.nonce = -1;
        }
        const signature = this.wallet.signTransaction(txBody, tx.address);
        return { signature, tx_body: txBody };
      }));
    }
    return Promise.all(promises).then(async (tx_list) => {
      const resultList = await this.provider.send('ain_sendSignedTransactionBatch', { tx_list });
      if (!Array.isArray(resultList)) {
        return resultList;
      }
      const len = resultList.length;
      if (len !== tx_list.length) {
        return resultList;
      } else {
        for (let i = 0; i < len; i++) {
          if (!resultList[i] || typeof resultList[i] !== 'object') {
            resultList[i] = { result: resultList[i] };
          }
          resultList[i]['txHash'] = this.wallet.getHashStrFromSig(tx_list[i].signature);
        }
        return resultList;
      }
    })
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
        : this.wallet.getImpliedAddress(account);
    return this.db.ref(`/deposit_accounts/consensus/${address}`).getValue();
  }

  /**
   * Returns the current transaction count of account, which is the nonce of the account.
   * @param {object} args - May contain a string 'address' and a string 'from' values.
   *                        The 'address' indicates the address of the account to get the
   *                        nonce of, and the 'from' indicates where to get the nonce from.
   *                        It could be either the pending transaction pool ("pending") or
   *                        the committed blocks ("committed"). The default value is "committed".
   * @return {Promise<number>}
   */
  getNonce(args: {address?: string, from?: string}): Promise<number> {
    if (!args) { args = {}; }
    const address = args.address ? Ain.utils.toChecksumAddress(args.address)
        : this.wallet.getImpliedAddress(args.address);
    if (args.from !== undefined && args.from !== 'pending' && args.from !== 'committed') {
      throw Error("'from' should be either 'pending' or 'committed'");
    }
    return this.provider.send('ain_getNonce', { address, from: args.from })
  }

  /**
   * Builds a transaction body from transaction input.
   * @param {TransactionInput} transactionInput
   * @return {Promise<TransactionBody>}
   */
  async buildTransactionBody(transactionInput: TransactionInput): Promise<TransactionBody> {
    const address = this.wallet.getImpliedAddress(transactionInput.address);
    let tx = {
      operation: transactionInput.operation,
      parent_tx_hash: transactionInput.parent_tx_hash
    }
    let nonce = transactionInput.nonce;
    if (nonce === undefined) {
      nonce = await this.getNonce({address, from: "pending"}) + 1;
    }
    const timestamp = transactionInput.timestamp ? transactionInput.timestamp : Date.now();
    return Object.assign(tx, { nonce, timestamp });
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
   * @return {Promise<any>}
   */
  private stakeFunction(path: string, transactionObject: ValueOnlyTransactionInput): Promise<any> {
    const type: SetOperationType = "SET_VALUE";
    if (!transactionObject.value) {
      throw new Error('[ain-js.stakeFunction] a value should be specified.');
    }
    if (typeof transactionObject.value !== 'number') {
      throw new Error('[ain-js.stakeFunction] value has to be a number.');
    }
    transactionObject.address = this.wallet.getImpliedAddress(transactionObject.address);
    const ref = this.db.ref(`${path}/${transactionObject.address}`).push()
    if (ref instanceof Reference) {
      const operation: SetOperation = {
        ref: `${path}/${transactionObject.address}/${ref.key}/value`,
        value: transactionObject.value,
        type
      }
      delete transactionObject.value;
      const txInput = Object.assign({ operation }, { transactionObject });
      return this.sendTransaction(txInput);
    } else {
      throw new Error('[ain-js.stakeFunction] Error in Reference push.');
    }
  }
}
