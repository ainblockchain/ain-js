import Provider from "../provider";
import Wallet from "../wallet";
import { Signer } from "./signer";
import { TransactionInput, TransactionBody } from "../types";
import Ain from "../ain";
const randomBytes = require('randombytes');

/**
 * The default class of Signer interface implemented using Wallet class.
 * When Ain class is initialized, DefaultSigner is set as its signer.
 */
export class DefaultSigner implements Signer {
  /** The wallet object. */
  readonly wallet: Wallet;
  /** The network provider object. */
  readonly provider: Provider;

  /**
   * Creates a new DefaultClass object.
   * @param {Wallet} wallet The wallet object.
   * @param {Provider} provider The network provider object.
   */
  constructor(wallet: Wallet, provider: Provider) {
    this.wallet = wallet;
    this.provider = provider;
  }

  /**
   * Gets an account's checksum address.
   * If the address is not given, the default account of the wallet is used.
   * @param {string} address The address of the account.
   * @returns {string} The checksum address.
   */
  getAddress(address?: string): string {
    return this.wallet.getImpliedAddress(address);
  }

  /**
   * Signs a message using an account.
   * If an address is not given, the default account of the wallet is used.
   * @param {string} message The message to sign.
   * @param {string} address The address of the account.
   * @returns {Promise<string> | string} The signature.
   */
  signMessage(message: string, address?: string): Promise<string> | string {
    return this.wallet.sign(message, address);
  }

  /**
   * Signs and sends a transaction to the network.
   * @param {TransactionInput} transactionObject The transaction input object.
   * @param {boolean} isDryrun The dryrun option.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  async sendTransaction(transactionObject: TransactionInput, isDryrun: boolean = false) {
    await this.wallet.ain.ensureDefaultLayer();
    if (this.usesL1Inbox()) {
      const inbox = await this.buildInboxTransaction(transactionObject);
      const result = await this.sendSignedTransaction(inbox.signature, inbox.tx_body, isDryrun);
      return { ...result, execution_layer: 'L2', submission_layer: 'L1',
        inbox_marker: inbox.marker, l2_tx_hash: inbox.innerHash };
    }
    const txBody = await this.buildTransactionBody(transactionObject);
    const signature = await this.wallet.signTransaction(txBody, transactionObject.address);
    return await this.sendSignedTransaction(signature, txBody, isDryrun);
  }

  /**
   * Signs and sends multiple transactions in a batch to the network.
   * @param {TransactionInput[]} transactionObjects The list of the transaction input objects.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  async sendTransactionBatch(transactionObjects: TransactionInput[]): Promise<any> {
    await this.wallet.ain.ensureDefaultLayer();
    if (this.usesL1Inbox()) {
      const wrapped = await Promise.all(transactionObjects.map(tx => this.buildInboxTransaction({ ...tx, nonce: tx.nonce ?? -1 })));
      const results = await this.provider.send('ain_sendSignedTransactionBatch', {
        tx_list: wrapped.map(({ tx_body, signature }) => ({ tx_body, signature }))
      });
      return Array.isArray(results) ? results.map((result, i) => ({ ...result,
        execution_layer: 'L2', submission_layer: 'L1', inbox_marker: wrapped[i].marker, l2_tx_hash: wrapped[i].innerHash })) : results;
    }
    let promises: Promise<any>[] = [];
    for (let tx of transactionObjects) {
      promises.push(this.buildTransactionBody(tx).then(async (txBody) => {
        if (tx.nonce === undefined) {
          // Batch transactions' nonces should be specified.
          // If they're not, they default to un-nonced (nonce = -1).
          txBody.nonce = -1;
        }
        const signature = await this.wallet.signTransaction(txBody, tx.address);
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
        }
        return resultList;
      }
    })
  }

  /**
   * Sends a signed transaction to the network.
   * @param {string} signature The signature.
   * @param {TransactionBody} txBody The transaction body.
   * @param {boolean} isDryrun The dryrun option.
   * @returns {Promise<any>} The return value of the blockchain API.
   */
  async sendSignedTransaction(signature: string, txBody: TransactionBody, isDryrun: boolean = false): Promise<any> {
    const method = isDryrun ? 'ain_sendSignedTransactionDryrun' : 'ain_sendSignedTransaction';
    let result = await this.provider.send(method, { signature, tx_body: txBody });
    if (!result || typeof result !== 'object') {
      result = { result };
    }
    return result;
  }

  /**
   * Builds a transaction body object from a transaction input object.
   * @param {TransactionInput} transactionInput The transaction input object.
   * @returns {Promise<TransactionBody>} The transaction body object.
   */
  async buildTransactionBody(transactionInput: TransactionInput): Promise<TransactionBody> {
    await this.wallet.ain.ensureDefaultLayer();
    const address = this.getAddress(transactionInput.address);
    let tx = {
      operation: transactionInput.operation,
      parent_tx_hash: transactionInput.parent_tx_hash
    }
    let nonce = transactionInput.nonce;
    if (nonce === undefined) {
      nonce = await this.wallet.getNonce({ address, from: "pending" });
    }
    const timestamp = transactionInput.timestamp ? transactionInput.timestamp : Date.now();
    const gasPrice = transactionInput.gas_price || 0;
    const billing = transactionInput.billing;
    return Object.assign(tx, { nonce, timestamp, gas_price: gasPrice, billing });
  }

  private usesL1Inbox(): boolean {
    return this.wallet.ain.executionLayer === 'L1' && this.wallet.ain.layerCapabilities?.inbox?.enabled === true;
  }

  private async buildInboxTransaction(input: TransactionInput) {
    if (input.parent_tx_hash !== undefined) throw Error('L1 inbox reserves parent_tx_hash for its finalized authorization');
    const capabilities = this.wallet.ain.layerCapabilities;
    const child = capabilities?.layers?.L2;
    if (!child || !Number.isSafeInteger(child.chain_id) || child.chain_id < 0 || child.chain_id > 109 ||
        child.chain_id === this.wallet.chainId) throw Error('Invalid L2 signing domain');
    const address = this.getAddress(input.address), account = this.wallet.accounts[address];
    if (!account || account.keyType === 'p256') throw Error('L1 inbox requires a chain-domain-bound local signer');
    const marker = '0x4c31494e' + randomBytes(28).toString('hex');
    const nonce = input.nonce === undefined ? await this.provider.sendLayerRead('ain_getNonce', { address, from: 'pending' }, 'L2') : input.nonce;
    const inner = await this.buildTransactionBody({ ...input, nonce, parent_tx_hash: marker });
    const innerSignature = Ain.utils.ecSignTransaction(inner, Buffer.from(account.private_key, 'hex'), child.chain_id);
    const tx_body: TransactionBody = {
      operation: { type: 'SET_VALUE', ref: '/layer2/inbox/' + marker, value: { tx_body: inner, signature: innerSignature } },
      nonce: -1, timestamp: inner.timestamp, gas_price: 0,
    };
    return { tx_body, signature: this.wallet.signTransaction(tx_body, address), marker,
      innerHash: this.wallet.getHashStrFromSig(innerSignature) };
  }
  };
