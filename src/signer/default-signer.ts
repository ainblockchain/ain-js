import { TransactionBody } from "@ainblockchain/ain-util";
import Provider from "../provider";
import Wallet from "../wallet";
import { Signer } from "./signer";
import { TransactionInput } from "../types";
import Ain from "../ain";

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
    const address = this.getAddress(transactionInput.address);
    let tx = {
      operation: transactionInput.operation,
      parent_tx_hash: transactionInput.parent_tx_hash
    }
    let nonce = transactionInput.nonce;
    if (nonce === undefined) {
      nonce = await this.getNonce({ address, from: "pending" });
    }
    const timestamp = transactionInput.timestamp ? transactionInput.timestamp : Date.now();
    const gasPrice = transactionInput.gas_price || 0;
    const billing = transactionInput.billing;
    return Object.assign(tx, { nonce, timestamp, gas_price: gasPrice, billing });
  }

  /**
   * Fetches an account's nonce value, which is the current transaction count of the account.
   * @param {object} args The ferch options.
   * It may contain a string 'address' value and a string 'from' value.
   * The 'address' is the address of the account to get the nonce of,
   * and the 'from' is the source of the data.
   * It could be either the pending transaction pool ("pending") or
   * the committed blocks ("committed"). The default value is "committed".
   * @returns {Promise<number>} The nonce value.
   */
  getNonce(args: { address?: string, from?: string }): Promise<number> {
    if (!args) { args = {}; }
    const address = args.address ? Ain.utils.toChecksumAddress(args.address)
      : this.getAddress(args.address);
    if (args.from !== undefined && args.from !== 'pending' && args.from !== 'committed') {
      throw Error("'from' should be either 'pending' or 'committed'");
    }
    return this.provider.send('ain_getNonce', { address, from: args.from })
  }
}